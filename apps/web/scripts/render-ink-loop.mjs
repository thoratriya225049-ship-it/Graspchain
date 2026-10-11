/**
 * Renders the hero's "ink dispersing in clear water" loop to public/media/ink-loop.webm
 * (+ ink-poster.jpg). Generated, not stock: a domain-warped noise field in the brand palette,
 * sampled on a circular time path so the last frame meets the first (seamless loop).
 *
 *   pnpm --filter web exec node scripts/render-ink-loop.mjs
 *
 * Uses the Playwright Chromium already installed for the e2e suite: the shader runs in a
 * canvas, MediaRecorder captures it as VP9 WebM, the poster is the first frame as JPEG.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const W = 1280;
const H = 480;
const SECONDS = 10;
const BITRATE = 650_000;
const out = path.join(import.meta.dirname, "..", "public", "media");
fs.mkdirSync(out, { recursive: true });

const html = `<!doctype html><html><body style="margin:0;background:#0B3A4A">
<canvas id="c" width="${W}" height="${H}"></canvas>
<script>
const c = document.getElementById("c");
const gl = c.getContext("webgl", { preserveDrawingBuffer: true });
const vs = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const fs = \`precision highp float;
uniform vec2 r; uniform float t;
vec2 h(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return -1.+2.*fract(sin(p)*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
 return mix(mix(dot(h(i),f),dot(h(i+vec2(1,0)),f-vec2(1,0)),u.x),mix(dot(h(i+vec2(0,1)),f-vec2(0,1)),dot(h(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<6;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}
void main(){
 vec2 uv=gl_FragCoord.xy/r; vec2 p=uv*vec2(r.x/r.y,1.)*1.6;
 float a=t*6.2831853;
 vec2 o1=vec2(cos(a),sin(a))*.55, o2=vec2(cos(a+2.1),sin(a+2.1))*.45;
 vec2 q=vec2(fbm(p+o1),fbm(p+vec2(5.2,1.3)-o1));
 vec2 w=vec2(fbm(p+3.*q+o2+vec2(1.7,9.2)),fbm(p+3.*q-o2+vec2(8.3,2.8)));
 float f=fbm(p+3.4*w);
 vec3 abyss=vec3(.043,.227,.290), teal=vec3(.071,.439,.541), aqua=vec3(.416,.800,.776), sky=vec3(.682,.875,.969), mint=vec3(.855,.953,.949);
 float k=clamp(f*1.9+.55,0.,1.);
 // Lighter range for type on Abyss: Teal is the floor, so letters never sink into the page.
 vec3 col=mix(teal*1.05,aqua,smoothstep(.15,.6,k));
 col=mix(col,sky,smoothstep(.5,.85,k+length(w)*.2)*.75);
 col=mix(col,mint,smoothstep(.78,1.,k)*.7);
 col=mix(col,abyss*1.6,smoothstep(.12,0.,k)*.55);
 gl_FragColor=vec4(col,1.);
}\`;
function sh(type, src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);gl.useProgram(pr);
const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
const loc=gl.getAttribLocation(pr,"p");gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
gl.uniform2f(gl.getUniformLocation(pr,"r"),${W},${H});
const ut=gl.getUniformLocation(pr,"t");
window.draw=(phase)=>{gl.uniform1f(ut,phase);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);};
window.poster=()=>{draw(0);return c.toDataURL("image/jpeg",0.82);};
window.record=()=>new Promise((res)=>{
  const stream=c.captureStream(30);
  const rec=new MediaRecorder(stream,{mimeType:"video/webm;codecs=vp9",videoBitsPerSecond:${BITRATE}});
  const chunks=[];rec.ondataavailable=(e)=>chunks.push(e.data);
  let frames=0;
  rec.onstop=async()=>{const buf=await new Blob(chunks,{type:"video/webm"}).arrayBuffer();res({frames,bytes:Array.from(new Uint8Array(buf))});};
  const t0=performance.now();rec.start();
  const tick=()=>{const ph=((performance.now()-t0)/1000)/${SECONDS};if(ph>=1){draw(0);setTimeout(()=>rec.stop(),40);return;}draw(ph);frames++;requestAnimationFrame(tick);};
  tick();
});
</script></body></html>`;

const browser = await chromium.launch({ args: (process.env.INK_GL ?? "--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist").split(" ") });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html);
const poster = await page.evaluate(() => window.poster());
fs.writeFileSync(path.join(out, "ink-poster.jpg"), Buffer.from(poster.split(",")[1], "base64"));
const { frames, bytes } = await page.evaluate(() => window.record());
fs.writeFileSync(path.join(out, "ink-loop.webm"), Buffer.from(bytes));
await browser.close();
const kb = (f) => `${Math.round(fs.statSync(path.join(out, f)).size / 1024)} KB`;
console.log(`ink-loop.webm ${kb("ink-loop.webm")} (${(frames / SECONDS).toFixed(1)} fps rendered) · ink-poster.jpg ${kb("ink-poster.jpg")}`);
