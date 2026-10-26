// R5.3 source-bound 1:1 Chromium evidence; real current offline preview vs R5.2 commit.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve('.'),src='examples/programs/chatgpt-send-queue/preview/index.html';
const dir=resolve(process.argv[2]||'artifacts/send-queue-crown-r53');
const before=execFileSync('git',['show','596b4e53d8016e52543453f5e4883abb9a1d0161:'+src],{encoding:'utf8',maxBuffer:8e6});
const after=await readFile(join(root,src),'utf8');
assert.match(before,/R5\.2 CROWN-VISUAL-BEGIN/);assert.match(after,/R5\.3 CROWN-FIT-BEGIN/);
const profile=await mkdtemp(join(tmpdir(),'sq-crown-'));
let chrome,ws,seq=0;const calls=new Map(),sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
function cdp(method,params={}){let id=++seq;return new Promise((ok,fail)=>{
  const timer=setTimeout(()=>{calls.delete(id);fail(Error('CDP timeout '+method))},20000);
  calls.set(id,{ok(v){clearTimeout(timer);ok(v)},fail(e){clearTimeout(timer);fail(e)}});
  ws.send(JSON.stringify({id,method,params}));
})}
async function ev(expression){const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
async function connect(){let port=0;for(let i=0;i<100;i++){
  try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break}catch{}
  if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);await sleep(100)}
  assert.ok(port,'Chrome debugging port');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  ws=new WebSocket(tabs.find(x=>x.type==='page').webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',fail,{once:true})});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data),q=calls.get(m.id);if(!q)return;calls.delete(m.id);m.error?q.fail(Error(m.error.message)):q.ok(m.result)});
  await cdp('Page.enable');await cdp('Runtime.enable')}
async function load(html){await ev('document.open();document.write('+JSON.stringify(html)+');document.close();true');
  for(let i=0;i<100;i++){if(await ev('document.readyState==="complete" && !!window.__sendQueuePreview?.().artworkLoaded'))return;await sleep(100)}
  throw Error('Source HTML or embedded WebP failed to render')}
function inspect(){const q=s=>document.querySelector(s),rect=e=>{let r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right}};
  const b=q('#blue'),c=q('#blue .sq-crown'),n=q('#native'),r=rect(b),nr=rect(n),s=getComputedStyle(b),cs=getComputedStyle(c);
  return {button:r,native:nr,crown:rect(c),pointer:cs.pointerEvents,filter:cs.filter,
    w:s.getPropertyValue('--sq-crown-w').trim(),h:s.getPropertyValue('--sq-crown-h').trim(),
    x:s.getPropertyValue('--sq-crown-x').trim(),y:s.getPropertyValue('--sq-crown-y').trim(),angle:s.getPropertyValue('--sq-crown-angle').trim(),
    hit:document.elementFromPoint(r.x+r.w/2,r.y+r.h/2)===b,
    rows:q('#rows').querySelectorAll('.sq-row').length,items:window.__sendQueuePreview().items.length,
    artwork:window.__sendQueuePreview().artworkLoaded,scroll:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}}
async function alpha(){return ev('(async()=>{const a=JSON.parse(document.querySelector("#crown-variants").textContent).a;const i=new Image();i.src="data:image/webp;base64,"+a;await i.decode();const c=document.createElement("canvas");c.width=i.width;c.height=i.height;const t=c.getContext("2d");t.drawImage(i,0,0);const p=t.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=-1,y1=-1,n=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){if(p[(y*c.width+x)*4+3]<16)continue;n++;x0=Math.min(x,x0);y0=Math.min(y,y0);x1=Math.max(x,x1);y1=Math.max(y,y1)}return {width:c.width,height:c.height,bounds:[x0,y0,x1,y1],pixels:n}})()')}
async function capture(name,clip){const r=await cdp('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false,...(clip?{clip:{...clip,scale:1}}:{})});
  await writeFile(join(dir,name+'.png'),Buffer.from(r.data,'base64'));
  if(/^(before|after)-(34|42)-light-400-crop$/.test(name))console.log('CROWN_IMAGE_BASE64 '+name+' '+r.data)}
async function smoke(){const r=await ev('(()=>{const q=s=>document.querySelector(s);q("#draft").value="第四条测试";q("#blue").click();const n=window.__sendQueuePreview().items.length,clear=!q("#draft").value,hidden=q("#rows").children.length===3;q("#more").click();const open=q("#rows").children.length;q("#rows [data-id=q4][data-action=remove]")?.click();const removed=window.__sendQueuePreview().items.length;q("#toggle-pause").click();const paused=window.__sendQueuePreview().paused;q("#toggle-pause").click();const resumed=window.__sendQueuePreview().paused;q("#reset").click();return {n,clear,hidden,open,removed,paused,resumed,reset:window.__sendQueuePreview().items.length}})()');
  assert.deepEqual(r,{n:4,clear:true,hidden:true,open:4,removed:3,paused:true,resumed:false,reset:3});console.log('CROWN_QUEUE_INTERACTION_PASS '+JSON.stringify(r))}
try{await mkdir(dir,{recursive:true});
  chrome=spawn(process.env.CHROME_BIN||'chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
  await connect();const version=(await cdp('Browser.getVersion')).product;const samples=[];let oldAlpha;
  for(const [rev,html] of [['before',before],['after',after]]){await load(html);const geometry=await alpha();
    if(rev==='before')oldAlpha=geometry;else assert.deepEqual(geometry,oldAlpha,'unexpected WebP change');
    console.log('CROWN_ALPHA_'+rev.toUpperCase()+' '+JSON.stringify(geometry));
    for(const size of [34,42])for(const theme of ['light','dark'])for(const width of [320,360,400,440]){
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await ev('document.querySelector("#sizes [data-value=\"'+size+'\"]').click();document.querySelector("#themes [data-value=\"'+theme+'\"]').click();document.querySelector("#widths [data-value=\"'+width+'\"]').click();true');
      const m=await ev('('+inspect.toString()+')()');const name=rev+'-'+size+'-'+theme+'-'+width;
      assert.equal(m.button.w,size,name+' button width');assert.equal(m.button.h,size,name+' button height');
      assert.equal(m.native.w,size,name+' native button width');assert.ok(m.native.x-m.button.right>=3,name+' native gap');
      assert.equal(m.rows,3,name+' queue rows');assert.equal(m.items,3,name+' queue items');
      assert.ok(m.hit&&m.artwork&&m.pointer==='none',name+' hit/asset');
      if(rev==='after'){assert.ok(m.scroll<=width+1,name+' overflow');
        assert.ok(Math.abs(Number.parseFloat(m.x)+Number.parseFloat(m.w)/2-size/2)<=1,name+' center');
        assert.equal(m.filter,'none',name+' shadow layer');
        const arrow=(size-(size===34?17:20))/2+(size===34?17:20)*5/24;
        assert.ok(Number.parseFloat(m.y)+Number.parseFloat(m.h)<arrow-1,name+' arrow clearance')}
      samples.push({name,...m});console.log('CROWN_REAL_CHROMIUM_PASS '+name+' '+JSON.stringify({x:m.x,y:m.y,w:m.w,h:m.h,angle:m.angle,gap:m.native.x-m.button.right}));
      if(width===400){let x=Math.max(0,Math.floor(m.button.x-33)),y=Math.max(0,Math.floor(m.button.y-34));
        await capture(name+'-crop',{x,y,width:Math.min(140,width-x),height:118});
        if(rev==='after')await capture(name+'-full')}
    }
    if(rev==='after')await smoke();
  }
  await writeFile(join(dir,'metrics.json'),JSON.stringify({evidence:'SOURCE_BOUND_CHROMIUM',chrome:version,deviceScaleFactor:1,macChromeTested:false,samples},null,2));
  console.log('CROWN_R53_BROWSER_PASS '+samples.length+' genuine HTML scenes '+version);
}finally{try{ws?.close()}catch{}try{chrome?.kill()}catch{}await sleep(250);await rm(profile,{recursive:true,force:true})}
