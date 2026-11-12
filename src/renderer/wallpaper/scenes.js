// Built-in animated wallpapers, drawn live with WebGL shaders written for
// Islet (MIT). Rendered at reduced resolution with an FPS cap to stay light.

const HEAD = `precision highp float;
uniform vec2 R; uniform float T;
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*n2(p); p=p*2.02+vec2(1.7,9.2); a*=.5; } return v; }
`;

export const SCENES = {
  silk: {
    name: 'Silk',
    note: 'Soft blue folds, light and calm',
    swatch: 'linear-gradient(135deg,#cfe0f5,#2f6ff0 55%,#0b2f8f)',
    frag: HEAD + `
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*R)/R.y;
  float t=T*.045;
  vec2 p=uv*1.25+vec2(.35,.1);
  for(int i=1;i<7;i++){
    float fi=float(i);
    p+=vec2(.55/fi*sin(fi*p.y*1.1+t*1.6+fi*.7), .45/fi*cos(fi*p.x*.9-t*1.2+fi*1.3));
  }
  float s=sin(p.x*2.1+p.y*1.3);
  float fold=pow(.5+.5*s,1.6);
  float edge=pow(1.-abs(s),6.);
  vec3 bg=mix(vec3(.80,.86,.94),vec3(.90,.93,.98),uv.y+.5);
  vec3 deep=vec3(.01,.12,.48), mid=vec3(.07,.38,.95), hi=vec3(.55,.80,1.);
  float body=smoothstep(.15,.85,fbm(p*.6+t*.3)+.25*s);
  vec3 col=mix(deep,mid,fold); col=mix(col,hi,edge*.8);
  float mask=smoothstep(.0,.35,body)*smoothstep(-.9,.2,uv.x+uv.y*.4);
  col=mix(bg,col,mask);
  col+=.06*edge*mask;
  float v=1.-.25*dot(uv*.8,uv*.8);
  gl_FragColor=vec4(col*v,1.);
}`,
  },
  aurora: {
    name: 'Aurora',
    note: 'Northern lights over a night sky',
    swatch: 'linear-gradient(160deg,#061226,#0d4d4a 50%,#7a3cff)',
    frag: HEAD + `
void main(){
  vec2 uv=gl_FragCoord.xy/R; vec2 p=(gl_FragCoord.xy-.5*R)/R.y;
  float t=T*.06;
  vec3 col=mix(vec3(.01,.02,.06),vec3(.02,.06,.13),uv.y);
  // stars
  vec2 g=gl_FragCoord.xy/R.y*180.; vec2 id=floor(g);
  float st=step(.992,h21(id)); float tw=.6+.4*sin(T*2.+h21(id+3.)*30.);
  col+=st*tw*smoothstep(.2,1.,uv.y)*vec3(.8,.85,1.)*smoothstep(.4,.0,length(fract(g)-.5));
  // curtains
  for(int i=0;i<3;i++){
    float fi=float(i);
    float x=p.x*(1.1+fi*.25)+fi*1.7;
    float y0=.08+fi*.11+.12*sin(x*1.3+t*2.+fi)+.08*fbm(vec2(x*1.5,t+fi));
    float d=p.y-y0;
    float rays=fbm(vec2(x*7.,t*3.+fi*4.));
    float curtain=exp(-max(d,0.)*(5.-fi))*smoothstep(-.04,.02,d)*(.35+.9*rays);
    vec3 c=mix(vec3(.15,1.,.6),vec3(.55,.3,1.),clamp(d*2.2+fi*.25,0.,1.));
    col+=c*curtain*(.55-fi*.12);
  }
  // hills
  float hill=-.33+.05*sin(p.x*2.3)+.03*sin(p.x*7.1+1.);
  col=mix(col,vec3(.005,.01,.02),smoothstep(hill+.004,hill-.004,p.y));
  gl_FragColor=vec4(col,1.);
}`,
  },
  ember: {
    name: 'Ember',
    note: 'Drifting crimson light on dark teal',
    swatch: 'radial-gradient(circle at 30% 70%,#e5203a,#3b0b14 40%,#071a1d 75%)',
    frag: HEAD + `
void main(){
  vec2 uv=gl_FragCoord.xy/R; vec2 p=(gl_FragCoord.xy-.5*R)/R.y;
  float t=T*.12;
  vec3 col=mix(vec3(.01,.05,.06),vec3(.03,.11,.12),fbm(p*1.4+vec2(t*.2,0.)));
  col*=.7+.6*uv.y;
  for(int i=0;i<46;i++){
    float fi=float(i);
    float z=h21(vec2(fi,7.1));             // depth
    vec2 c=vec2(h21(vec2(fi,1.3))*2.4-1.2, mod(h21(vec2(fi,2.9))*1.6+t*(.04+.08*z),1.6)-.8);
    c.x+=.05*sin(t*2.+fi);
    float r=mix(.012,.07,z*z);
    float d=length(p-c);
    float glow=smoothstep(r,r*.15,d)*(.25+.75*(1.-z))+.4*exp(-d*d/(r*r*9.));
    vec3 ec=mix(vec3(.95,.08,.16),vec3(1.,.45,.25),h21(vec2(fi,5.)));
    col+=ec*glow*.55*smoothstep(-.8,-.2,p.y+.4*z);
  }
  // red field at the bottom
  float field=smoothstep(.0,-.45,p.y+.1*fbm(vec2(p.x*3.,t)));
  col+=vec3(.55,.03,.07)*field*(.4+.6*fbm(p*9.+vec2(0.,t)));
  float v=1.-.55*dot(p,p);
  gl_FragColor=vec4(col*v,1.);
}`,
  },
  lagoon: {
    name: 'Lagoon',
    note: 'Sunlight dancing under clear water',
    swatch: 'linear-gradient(160deg,#5fe2d4,#0c7c8f 50%,#053246)',
    frag: HEAD + `
void main(){
  vec2 uv=gl_FragCoord.xy/R; vec2 p=(gl_FragCoord.xy-.5*R)/R.y*3.;
  float t=T*.25+23.;
  vec2 q=mod(p*6.28318,6.28318)-250.;
  vec2 i=q; float c=1.; float inten=.005;
  for(int n=0;n<5;n++){
    float tt=t*(1.-(3.5/float(n+1)));
    i=q+vec2(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));
    c+=1./length(vec2(q.x/(sin(i.x+tt)/inten),q.y/(cos(i.y+tt)/inten)));
  }
  c/=5.; c=1.17-pow(c,1.4);
  float caus=pow(abs(c),8.);
  vec3 deep=vec3(.01,.16,.24), shallow=vec3(.05,.52,.58);
  vec3 col=mix(deep,shallow,uv.y*.8+.1*fbm(p*.5+t*.05));
  col+=clamp(vec3(caus)*vec3(.55,.95,.9),0.,1.)*.6;
  float v=1.-.18*dot(p/3.,p/3.);
  gl_FragColor=vec4(col*v,1.);
}`,
  },
};

const VERT = 'attribute vec2 a; void main(){ gl_Position=vec4(a,0.,1.); }';

export class SceneRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    this.prog = null;
    this.running = false;
    this.fps = 30;
    this.quality = 0.6;
    this.t0 = performance.now();
    this.timeOffset = 0;
    this._last = 0;
    this._loop = this._loop.bind(this);
    if (this.gl) {
      const gl = this.gl;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    }
  }

  get ok() { return !!this.gl; }

  setScene(id) {
    const gl = this.gl;
    if (!gl) return false;
    const scene = SCENES[id] || SCENES.silk;
    if (this.sceneId === id && this.prog) return true;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, scene.frag));
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    if (this.prog) gl.deleteProgram(this.prog);
    this.prog = p;
    this.sceneId = id;
    gl.useProgram(p);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.uR = gl.getUniformLocation(p, 'R');
    this.uT = gl.getUniformLocation(p, 'T');
    this.draw();
    return true;
  }

  resize() {
    const s = Math.max(0.25, Math.min(1, this.quality)) * (devicePixelRatio || 1);
    const w = Math.round(this.canvas.clientWidth * s), h = Math.round(this.canvas.clientHeight * s);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  draw(now = performance.now()) {
    const gl = this.gl;
    if (!gl || !this.prog) return;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uR, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uT, (now - this.t0) / 1000 + this.timeOffset);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  start() { if (this.running || !this.gl) return; this.running = true; this._last = 0; requestAnimationFrame(this._loop); }
  stop() { this.running = false; }

  _loop(now) {
    if (!this.running) return;
    const frame = 1000 / Math.max(5, Math.min(60, this.fps));
    if (now - this._last >= frame - 1) { this._last = now; this.draw(now); }
    requestAnimationFrame(this._loop);
  }
}
