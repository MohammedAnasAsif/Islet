# Islet background helper (Windows PowerShell 5.1, ships with Windows 11).
# Prints one JSON line per second with:
#   - now playing info from Windows' own media controls (any player that
#     shows in the volume flyout: Spotify, browsers, Media Player, ...)
#   - GPU load and network throughput
# Reads simple commands on stdin: toggle | next | prev | seek <seconds>
# Read-only apart from media commands. No registry access.

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($op, [Type]$type) {
  $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  if ($task.Wait(3000)) { return $task.Result }
  return $null
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$TMgr = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$TProps = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$TStream = [Windows.Storage.Streams.IRandomAccessStreamWithContentType]

$manager = $null
try { $manager = Await ($TMgr::RequestAsync()) $TMgr } catch {}

$lastKey = ''
$art = ''
$props = $null

function Get-Art($p) {
  if ($null -eq $p -or $null -eq $p.Thumbnail) { return '' }
  try {
    $stream = Await ($p.Thumbnail.OpenReadAsync()) $TStream
    if ($null -eq $stream) { return '' }
    $size = [uint32]$stream.Size
    if ($size -le 0 -or $size -gt 4MB) { return '' }
    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    $null = Await ($reader.LoadAsync($size)) ([uint32])
    $bytes = New-Object byte[] $size
    $reader.ReadBytes($bytes)
    $reader.Dispose(); $stream.Dispose()
    $type = if ($stream.ContentType) { $stream.ContentType } else { 'image/png' }
    return "data:$type;base64," + [Convert]::ToBase64String($bytes)
  } catch { return '' }
}

# ---- GPU + network -------------------------------------------------------
$gpuCounters = @()
$gpuRefresh = [DateTime]::MinValue
function Get-Gpu {
  if (([DateTime]::Now - $script:gpuRefresh).TotalSeconds -gt 15) {
    $script:gpuRefresh = [DateTime]::Now
    $script:gpuCounters = @()
    try {
      $cat = New-Object System.Diagnostics.PerformanceCounterCategory('GPU Engine')
      foreach ($name in $cat.GetInstanceNames()) {
        if ($name -like '*engtype_3D*') {
          $c = New-Object System.Diagnostics.PerformanceCounter('GPU Engine', 'Utilization Percentage', $name)
          $null = $c.NextValue()
          $script:gpuCounters += $c
        }
      }
    } catch {}
  }
  $sum = 0.0
  foreach ($c in $script:gpuCounters) { try { $sum += $c.NextValue() } catch {} }
  return [Math]::Min(100, [Math]::Round($sum, 1))
}

$lastRx = -1; $lastTx = -1; $lastNetAt = [DateTime]::Now
function Get-Net {
  $rx = 0; $tx = 0
  foreach ($nic in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($nic.OperationalStatus -ne 'Up' -or $nic.NetworkInterfaceType -eq 'Loopback') { continue }
    $s = $nic.GetIPv4Statistics()
    $rx += $s.BytesReceived; $tx += $s.BytesSent
  }
  $now = [DateTime]::Now
  $dt = ($now - $script:lastNetAt).TotalSeconds
  $down = 0; $up = 0
  if ($script:lastRx -ge 0 -and $dt -gt 0) {
    $down = [Math]::Max(0, ($rx - $script:lastRx) / $dt)
    $up = [Math]::Max(0, ($tx - $script:lastTx) / $dt)
  }
  $script:lastRx = $rx; $script:lastTx = $tx; $script:lastNetAt = $now
  return @{ down = [Math]::Round($down); up = [Math]::Round($up) }
}

# ---- Commands from Islet ---------------------------------------------------
$stdin = [Console]::In
$pending = $stdin.ReadLineAsync()

function Invoke-Command-Line([string]$line) {
  if ($null -eq $script:manager) { return }
  $s = $script:manager.GetCurrentSession()
  if ($null -eq $s) { return }
  $parts = $line.Trim().Split(' ')
  switch ($parts[0]) {
    'toggle' { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
    'next'   { $null = Await ($s.TrySkipNextAsync()) ([bool]) }
    'prev'   { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) }
    'seek'   {
      $ticks = [long]([double]$parts[1] * 10000000)
      $null = Await ($s.TryChangePlaybackPositionAsync($ticks)) ([bool])
    }
  }
}

$tick = 0
while ($true) {
  while ($pending.IsCompleted) {
    $line = $pending.Result
    if ($null -eq $line) { exit 0 }  # Islet closed our stdin
    Invoke-Command-Line $line
    $pending = $stdin.ReadLineAsync()
  }

  $media = @{ active = $false }
  if ($null -ne $manager) {
    $s = $manager.GetCurrentSession()
    if ($null -ne $s) {
      $key = $s.SourceAppUserModelId
      $info = $s.GetPlaybackInfo()
      $tl = $s.GetTimelineProperties()
      if ($null -eq $props -or ($tick % 3) -eq 0) {
        $props = Await ($s.TryGetMediaPropertiesAsync()) $TProps
      }
      if ($null -ne $props) {
        $trackKey = "$key|$($props.Title)|$($props.Artist)"
        if ($trackKey -ne $lastKey) { $art = Get-Art $props; $lastKey = $trackKey }
        $playing = ($info.PlaybackStatus.ToString() -eq 'Playing')
        $pos = $tl.Position.TotalSeconds
        if ($playing) {
          $pos += ([DateTimeOffset]::Now - $tl.LastUpdatedTime).TotalSeconds
        }
        $dur = $tl.EndTime.TotalSeconds
        if ($dur -gt 0) { $pos = [Math]::Min($pos, $dur) }
        $media = @{
          active   = $true
          playing  = $playing
          title    = $props.Title
          artist   = $props.Artist
          album    = $props.AlbumTitle
          app      = $key
          position = [Math]::Round([Math]::Max(0, $pos), 1)
          duration = [Math]::Round($dur, 1)
          art      = $art
        }
      }
    }
  }

  $out = @{ media = $media; gpu = (Get-Gpu); net = (Get-Net) }
  # Only send artwork when it changes, to keep the pipe light.
  if (-not $media.active) { $script:sentArt = '' }
  elseif ($script:sentArt -eq $art) { $out.media.art = $null }
  else { $script:sentArt = $art }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
  $tick++
  Start-Sleep -Milliseconds 1000
}
