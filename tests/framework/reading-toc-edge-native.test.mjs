// Real Chromium acceptance of source-derived OFFLINE HTML including index.html.
// These scenarios cannot certify the installed extension or a user's Mac profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
const binary=[process.env.CHROME_BIN,'google-chrome-stable','google-chrome','chromium']
 .filter(Boolean).find(name=>spawnSync(name,['--version'],{stdio:'ignore'}).status===0);
async function connect(url){
 const socket=new WebSocket(url),waiting=new Map();let counter=0,listener=()=>{};
 await new Promise((ok,no)=>{socket.onopen=ok;socket.onerror=no;});
 socket.onmessage=event=>{
  const msg=JSON.parse(event.data);
  if(!msg.id){listener(msg);return;}
  const row=waiting.get(msg.id);if(!row)return;
  waiting.delete(msg.id);clearTimeout(row.timer);
  msg.error?row.reject(Error(msg.error.message)):row.resolve(msg.result);
 };
 return {onEvent(fn){listener=fn;},
  send(method,params={},timeout=12000,sessionId=null){return new Promise((resolve,reject)=>{
   const id=++counter,timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP_TIMEOUT '+method));},timeout);
   waiting.set(id,{resolve,reject,timer});
   socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });},
  close(){socket.close();for(const row of waiting.values()){clearTimeout(row.timer);row.reject(Error('CLOSED'));}waiting.clear();}
 };
}
async function evaluate(target,expression){
 const row=await target.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,
  ...(target.contextId?{contextId:target.contextId}:{})});
 if(row.exceptionDetails)throw Error('BROWSER_EVAL '+JSON.stringify(row.exceptionDetails).slice(0,700));
 return row.result.value;
}
async function until(probe,label,count=65){
 let error;
 for(let i=0;i<count;i++){try{const result=await probe();if(result)return result;}catch(e){error=e;}await pause(120);}
 throw Error(label+(error?' / '+error.message:''));
}
async function select(page,id,value){
 const expression="(()=>{const n=document.getElementById("+JSON.stringify(id)+");"+
 "if(!n)throw Error('Missing preview control');n.value="+JSON.stringify(value)+";"+
 "n.dispatchEvent(new Event('change',{bubbles:true}));return true;})()";
 return evaluate(page,expression);
}
async function child(browser,page){
 // A sandboxed srcdoc is typically an OOPIF. Fallback handles same-process
 // execution contexts without relaxing sandbox="allow-scripts".
 for(let i=0;i<8;i++){
  const targets=(await browser.send('Target.getTargets')).targetInfos;
  const found=targets.find(row=>row.type==='iframe'&&row.url?.startsWith('about:srcdoc'));
  if(found){
   const session=(await browser.send('Target.attachToTarget',{targetId:found.targetId,flatten:true})).sessionId;
   const client={send:(name,args={},timeout=12000)=>browser.send(name,args,timeout,session)};
   await client.send('Runtime.enable');
   if(await evaluate(client,'Boolean(document.querySelector("#tool-root,[data-opendesk-toc-root]"))').catch(()=>false))return client;
  }
  await pause(130);
 }
 const contexts=[];
 page.onEvent(event=>{if(event.method==='Runtime.executionContextCreated')contexts.push(event.params.context);});
 await page.send('Runtime.disable');await page.send('Runtime.enable');
 const root=(await page.send('Page.getFrameTree')).frameTree.frame.id;
 const context=await until(()=>contexts.find(x=>x.auxData?.frameId!==root&&x.auxData?.isDefault), 'No real sandboxed iframe JS context',20);
 const inFrame={send:page.send,contextId:context.id};
 assert(await evaluate(inFrame,'Boolean(document.querySelector("#tool-root,[data-opendesk-toc-root]"))'));
 return inFrame;
}
// A closed Shadow Root cannot be inspected with document.querySelector.
// Use Chromium's native DOM domain, then dispatch a physical mouse click in
// the outer page (rather than JS .click() or a synthetic DOM event).
async function tocClosedShadow(target){
 await target.send('DOM.enable');
 const doc=(await target.send('DOM.getDocument',{depth:1,pierce:true})).root;
 const host=(await target.send('DOM.querySelector',{nodeId:doc.nodeId,selector:'[data-opendesk-toc-root]'})).nodeId;
 assert(host,'trusted TOC host is absent from the iframe DOM');
 const node=(await target.send('DOM.describeNode',{nodeId:host,pierce:true})).node;
 assert.equal(node.shadowRoots?.[0]?.shadowRootType,'closed','must inspect the production closed shadow root');
 return node.shadowRoots[0].nodeId;
}
async function tocNode(target,shadow,selector){
 const {nodeId}=await target.send('DOM.querySelector',{nodeId:shadow,selector});
 assert(nodeId,'missing production shadow control: '+selector);
 return nodeId;
}
async function tocMouseClick(page,target,shadow,selector,iframeRect){
 const id=await tocNode(target,shadow,selector);
 // The 8-row full outline can be scrollable: bring the *real* link into
 // the visible scrollport before dispatching Chromium input.
 await target.send('DOM.scrollIntoViewIfNeeded',{nodeId:id});
 const box=(await target.send('DOM.getBoxModel',{nodeId:id})).model.content;
 const localX=(box[0]+box[4])/2,localY=(box[1]+box[5])/2;
 const x=iframeRect.left+localX,y=iframeRect.top+localY;
 const shadowHit=await evaluate(target,
  'document.elementFromPoint('+localX+','+localY+')?.hasAttribute("data-opendesk-toc-root")');
 assert(shadowHit,'target shadow control is clipped or covered inside frame: '+selector);
 const hit=await evaluate(page,'(()=>{const frame=document.getElementById("opendesk-preview-frame");return document.elementFromPoint('+x+','+y+')===frame})()');
 assert(hit,'shadow button is obscured in outer screenshot viewport: '+selector);
 await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
 await page.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x,y});
 await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x,y});
}
test('trusted TOC edge toggle: real Chromium mouse collapse, hover and expand',{timeout:120000},async t=>{
 assert(binary,'Chrome for Testing is required: no mock PREVIEW_PASS');
 const profile=await mkdtemp(join(tmpdir(),'toc-r14-chrome-'));
 // Xvfb provides a genuine desktop hover device; headless reports hover:none.
 const chrome=spawn(binary,['--window-size=1280,1500','--no-sandbox','--disable-gpu',
  '--disable-dev-shm-usage','--no-proxy-server','--no-first-run',
  '--disable-background-networking','--site-per-process','--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
 let browser,log='';const pages=[];
 chrome.stderr.on('data',chunk=>{log=(log+chunk).slice(-2700);});
 t.after(async()=>{
  for(const page of pages)page.close();browser?.close();
  if(chrome.exitCode===null&&chrome.signalCode===null){
   const done=new Promise(resolve=>{const alarm=setTimeout(()=>chrome.kill('SIGKILL'),2700);
    chrome.once('close',()=>{clearTimeout(alarm);resolve();});});
   chrome.kill('SIGTERM');await done;
  }
  await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:100});
 });
 const port=await until(async()=>{try{return +(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{return 0;}},
  'Chrome binary could not start: '+log,110);
 const base='http://127.0.0.1:'+port,version=await(await fetch(base+'/json/version')).json();
 browser=await connect(version.webSocketDebuggerUrl);
 async function open(name){
  const input=resolve('projects/reading-toc/preview',name);
  const contents=await readFile(input,'utf8');assert(contents.includes('opendesk-preview-manifest'));
  const targetId=(await browser.send('Target.createTarget',{url:pathToFileURL(input).href})).targetId;
  // A target may accept a direct WebSocket while Runtime.enable stalls on hosted macOS.
  // Attach using the already-ready browser connection, with one bounded recovery.
  await until(async()=>{
   const {targetInfo}=await browser.send('Target.getTargetInfo',{targetId});
   return targetInfo?.type==='page'&&targetInfo.url.startsWith('file:');
  },'Real file tab did not reach the expected target URL: '+name);
  await browser.send('Target.activateTarget',{targetId});
  let page,lastError;
  for(let attempt=0;attempt<2;attempt++){
   const {sessionId}=await browser.send('Target.attachToTarget',{targetId,flatten:true});
   const attached={
    send:(method,params={},timeout=12000)=>browser.send(method,params,timeout,sessionId),
    onEvent(listener){browser.onEvent(event=>{
     if(event.sessionId===sessionId)listener(event);
    });},
    close(){void browser.send('Target.detachFromTarget',{sessionId},3000).catch(()=>{});}
   };
   try{
    await attached.send('Page.enable',{},8000);
    await attached.send('Runtime.enable',{},8000);
    page=attached;break;
   }catch(error){
    lastError=error;
    attached.close();
    if(attempt===0)await pause(250);
   }
  }
  if(!page)throw Error('R1.8.6 CDP target did not become ready: '+name+
   '; browser='+version.Browser+'; error='+String(lastError?.message||lastError));
  pages.push(page);
  await until(()=>evaluate(page,'document.readyState!=="loading"'),
   'Attached Chrome target had no execution context: '+name);
  await until(()=>evaluate(page,'Boolean(document.querySelector("#od-toc-language"))'), 'Preview shell did not render '+name);
  assert.equal(await evaluate(page,'location.protocol'),'file:');
  await until(()=>evaluate(page,'Boolean(document.querySelector("#opendesk-preview-frame")?.srcdoc)'),'Preview iframe missing');
  return {page,targetId};
 }
 async function screenshot(page,file){
  await mkdir(resolve('artifacts/reading-toc-r41'),{recursive:true});
  // Capture the whole outer page: cropped CDP coordinates can be relative
  // to the visual viewport rather than the scrolled iframe surface.
  const result=await page.send('Page.captureScreenshot',{
   format:'png',captureBeyondViewport:true});
  const bytes=Buffer.from(result.data,'base64');
  await writeFile(resolve('artifacts/reading-toc-r41',file),bytes);
  return createHash('sha256').update(bytes).digest('hex');
 }

 const overlay=await open('index.html'),trusted=await child(browser,overlay.page);
 await until(()=>evaluate(trusted,'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),
   'trusted overlay failed to mount');
 const dom=(await trusted.send('DOM.getDocument',{depth:1,pierce:true})).root.nodeId;
 const host=await tocNode(trusted,dom,'[data-opendesk-toc-root]');
 const described=(await trusted.send('DOM.describeNode',{nodeId:host,pierce:true})).node;
 assert.equal(described.shadowRoots?.[0]?.shadowRootType,'closed');
 const shadow=described.shadowRoots[0].nodeId;
 const toggle=await tocNode(trusted,shadow,'button.edge-toggle');
 const skin=await tocNode(trusted,shadow,'.edge-skin');
 const arrow=await tocNode(trusted,shadow,'.edge-toggle path');
 const arrowSvg=await tocNode(trusted,shadow,'.edge-toggle svg');
 const attributes=async nodeId=>{
   const pairs=(await trusted.send('DOM.getAttributes',{nodeId})).attributes,result={};
   for(let i=0;i<pairs.length;i+=2)result[pairs[i]]=pairs[i+1];
   return result;
 };
 const rect=async nodeId=>{
   const model=(await trusted.send('DOM.getBoxModel',{nodeId})).model;
   return {left:model.border[0],right:model.border[4],top:model.border[1],
     bottom:model.border[5],width:model.width,height:model.height};
 };
 await trusted.send('CSS.enable');
 const skinWidth=async()=>{
   const {computedStyle}=await trusted.send('CSS.getComputedStyleForNode',{nodeId:skin});
   const value=computedStyle.find(item=>item.name==='width')?.value;
   return Number.parseFloat(value);
 };
 const arrowOpacity=async()=>{
   const {computedStyle}=await trusted.send('CSS.getComputedStyleForNode',{nodeId:arrowSvg});
   return Number.parseFloat(computedStyle.find(item=>item.name==='opacity')?.value);
 };
 const horizontalCenterDelta=async()=>{
   const [background,glyph]=await Promise.all([rect(skin),rect(arrowSvg)]);
   return Math.abs((background.left+background.right-glyph.left-glyph.right)/2);
 };
 assert.equal((await trusted.send('DOM.querySelectorAll',{nodeId:shadow,selector:'button.edge-toggle'})).nodeIds.length,1,
   'one toggle component only');
 assert.equal(await evaluate(trusted,'!!document.getElementById("od-toc-edge-preview-toggle")'),false,
   'no body-level simulation button');
 assert.equal((await attributes(toggle))['aria-label'],'收起目录');
 assert.equal((await attributes(arrow)).d,'M9 5l7 7-7 7');
 const frameRect=await evaluate(overlay.page,'(()=>{const r=document.getElementById("opendesk-preview-frame").getBoundingClientRect();return {left:r.left,top:r.top};})()');
 await overlay.page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:frameRect.left+20,y:frameRect.top+20});
 const hoverless=await evaluate(trusted,'matchMedia("(hover:none)").matches');
 assert.equal(hoverless,false,'headed Xvfb Chromium must validate the desktop 12px edge');
 const idleWidth=12;
 const firstWidth=await skinWidth();
 console.log('EDGE_INPUT_MEDIA',JSON.stringify({hoverless,skinWidth:firstWidth}));
 await until(async()=>Math.abs((await skinWidth())-idleWidth)<1,
   'expanded idle edge width must be 12px on desktop');
 await until(async()=>(await arrowOpacity())<0.01,
   'expanded idle chevron remains hidden until hover or keyboard focus');
 const initial=await rect(host);
 await tocMouseClick(overlay.page,trusted,shadow,'button.edge-toggle',frameRect);
 await until(async()=>(await attributes(toggle))['aria-expanded']==='false',
   'real mouse click did not collapse');
 await until(async()=>Math.abs((await skinWidth())-38)<1,
   'real mouse hover must expand the same edge tab to 38px');
 await until(async()=>(await horizontalCenterDelta())<=1,
   'hovered arrow must be horizontally centered inside the 38px visible background');
 const folded=await rect(host);
 assert.equal(Math.round(folded.width),38,'collapsed host must have no 254px transparent hitbox');
 assert.equal(Math.round(folded.height),46);
 assert.equal((await attributes(toggle))['aria-label'],'展开目录');
 assert.equal((await attributes(arrow)).d,'M15 5l-7 7 7 7');
 const panel=await tocNode(trusted,shadow,'.panel');
 assert(Object.hasOwn(await attributes(panel),'hidden'),
   'collapsed outline must be hidden from pointer and focus interaction');
 await overlay.page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:frameRect.left+20,y:frameRect.top+20});
 await until(async()=>Math.abs((await skinWidth())-20)<1,
   'collapsed idle background must shrink to a narrow 20px tab without hover');
 await until(async()=>(await arrowOpacity())>0.99,
   'collapsed idle recovery arrow must stay visible without hover');
 await until(async()=>(await horizontalCenterDelta())<=1,
   'idle arrow must be centered inside the 20px visible background');
 await tocMouseClick(overlay.page,trusted,shadow,'button.edge-toggle',frameRect);
 await until(async()=>(await attributes(toggle))['aria-expanded']==='true',
   'second real mouse click did not expand');
 await overlay.page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:frameRect.left+20,y:frameRect.top+20});
 await until(async()=>Math.abs((await skinWidth())-idleWidth)<1,
   'expanded idle must restore the 12px edge');
 await until(async()=>(await arrowOpacity())<0.01,
   'expanded idle must hide the collapse chevron again');
 const restored=await rect(host);
 assert(restored.width>200,'original directory width must be restored');
 assert(Math.abs(restored.left-initial.left)<2,'directory X position should remain');
 assert.equal((await trusted.send('DOM.querySelectorAll',{nodeId:shadow,selector:'button.mode'})).nodeIds.length,4,
   'all four original directory modes remain');
 // The preview site selector is outside the tool: A and B must not share collapse.
 await tocMouseClick(overlay.page,trusted,shadow,'button.edge-toggle',frameRect);
 await until(()=>evaluate(trusted,'document.querySelector("[data-opendesk-toc-root]")?.hasAttribute("data-toc-collapsed")'),
   'site A user collapse must be reflected in the real view');
 await pause(180); // Let the preview-only parent receive A's state before changing sites.
 await select(overlay.page,'od-toc-site','b');
 await until(()=>evaluate(trusted,'document.querySelector("[data-opendesk-toc-root]")?.hasAttribute("data-toc-collapsed")===false'),
   'unvisited site B must default expanded');
 await select(overlay.page,'od-toc-site','a');
 await until(()=>evaluate(trusted,'document.querySelector("[data-opendesk-toc-root]")?.hasAttribute("data-toc-collapsed")===true'),
   'return to site A must restore its collapsed state');
 console.log('READING_TOC_EDGE_NATIVE_PASS: collapsed idle 20px, hover 38px, centered visible arrow, fixed hitbox, recovery');
});
