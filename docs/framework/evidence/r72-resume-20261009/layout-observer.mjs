import {readFile,writeFile} from 'node:fs/promises';
const dir=new URL('./',import.meta.url), launch=JSON.parse(await readFile(new URL('chrome-launch.json',dir),'utf8'));
const port=(await readFile(launch.profile+'/DevToolsActivePort','utf8')).split('\n')[0];
const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target=targets.find(t=>t.type==='page'&&t.url.startsWith('http://127.0.0.1:43111/demo-form.html'));
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const expression=`({url:location.href,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,active:{id:document.activeElement.id,focusVisible:document.activeElement.matches(':focus-visible'),outline:getComputedStyle(document.activeElement).outline},controls:Array.from(document.querySelectorAll('input[id^="api-"],select[id^="api-"],button[id^="api-"],textarea[id^="api-"]')).filter(e=>e.getClientRects().length).map(e=>({id:e.id,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})),responseChildren:document.querySelector('#api-response').childElementCount,externalRequests:performance.getEntriesByType('resource').filter(e=>!e.name.startsWith(location.origin)).map(e=>e.name)})`;
try {
  const focus=await send('Runtime.evaluate',{expression,returnByValue:true});
  await writeFile(new URL('keyboard-focus.json',dir),JSON.stringify({at:new Date().toISOString(),targetId:target.id,result:focus.result.value},null,2));
  for(const width of [1280,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    const state=await send('Runtime.evaluate',{expression,returnByValue:true});
    const metrics=await send('Page.getLayoutMetrics');
    const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});
    await writeFile(new URL(`viewport-${width}.png`,dir),Buffer.from(screenshot.data,'base64'));
    await writeFile(new URL(`viewport-${width}.json`,dir),JSON.stringify({at:new Date().toISOString(),mode:'real CFT viewport emulation; no DOM/input mutation',targetId:target.id,result:state.result.value},null,2));
    console.log(JSON.stringify(state.result.value));
  }
} finally {await send('Emulation.clearDeviceMetricsOverride');ws.close();}
