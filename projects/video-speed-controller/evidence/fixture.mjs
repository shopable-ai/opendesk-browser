// R1.1 native Chrome fixture. No OpenDesk internals; reports actual video DOM.
// Generate clock.webm with the command documented in mac-chrome-r1.1.md.
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
const media=resolve(process.argv[2]||'artifacts/video-speed-r11-20261030/clock.webm');
const port=Number(process.argv[3]||43233);
const video=id=>`<video id="${id}" width="480" height="270" controls muted loop preload="auto" src="/clock.webm"></video><button onclick="document.getElementById('${id}').play()">播放 ${id}</button><button onclick="document.getElementById('${id}').pause()">暂停 ${id}</button><button onclick="document.getElementById('${id}').currentTime=20">跳到 20 秒 ${id}</button>`;
const server=http.createServer(async(req,res)=>{
 if(req.url==='/clock.webm'){
  const size=(await stat(media)).size,match=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');
  const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),size-1):size-1;
  const data=await readFile(media);
  res.writeHead(match?206:200,{'content-type':'video/webm','accept-ranges':'bytes','content-length':end-start+1,...(match?{'content-range':`bytes ${start}-${end}/${size}`}:{})});res.end(data.subarray(start,end+1));return;
 }
 const route=new URL(req.url,'http://127.0.0.1').pathname;
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
 res.end(`<!doctype html><meta charset="utf-8"><title>视频倍速 R1.1 · ${route}</title><style>body{font:16px system-ui;padding:16px}video{display:block;max-width:100%}pre{white-space:pre-wrap}button{padding:8px;margin:4px}</style><h1>视频倍速 R1.1 ${route}</h1><nav><a href="/single">单视频</a> · <a href="/dual">双视频</a> · <a href="/iframe">跨源 iframe</a> · <a href="/reset">覆盖倍速播放器</a></nav>${route==='/iframe'?`<iframe title="跨源视频" width="560" height="650" src="http://localhost:${port}/child"></iframe>`:video('primary')+(route==='/dual'?video('secondary'):'')}<h2>独立网页读回</h2><pre id="actual"></pre><button id="measure">测量真实播放 2 秒</button><pre id="samples"></pre><script>
const samples=[];const videos=[...document.querySelectorAll('video')];
const snapshot=()=>videos.map(v=>({id:v.id,playbackRate:v.playbackRate,currentTime:+v.currentTime.toFixed(3),paused:v.paused,readyState:v.readyState,frames:v.getVideoPlaybackQuality().totalVideoFrames}));
setInterval(()=>{document.querySelector('#actual').textContent=JSON.stringify({document:location.pathname,count:videos.length,videos:snapshot()},null,2)},200);
document.querySelector('#measure').onclick=async()=>{const t=performance.now(),before=snapshot();await new Promise(r=>setTimeout(r,2000));const wall=(performance.now()-t)/1000,after=snapshot();samples.push({wallSeconds:+wall.toFixed(3),before,after,mediaSecondsPerWallSecond:after.map((v,i)=>+((v.currentTime-before[i].currentTime)/wall).toFixed(3))});document.querySelector('#samples').textContent=JSON.stringify(samples.at(-1),null,2)};
${route==='/reset'?`videos[0].addEventListener('ratechange',()=>{if(videos[0].playbackRate!==1)videos[0].playbackRate=1});`:''}
</script>`);
});
server.listen(port,'127.0.0.1',()=>console.log(`R11 fixture http://127.0.0.1:${port}/single; media=${media}`));
