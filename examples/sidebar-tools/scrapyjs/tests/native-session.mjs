// Real CDP transport for this lane's owned CFT only. Never connects to an existing profile.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,readdir,lstat,cp,realpath,readlink} from 'node:fs/promises';
import {resolve,join,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {WebSocket} from 'ws';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const pause = ms => new Promise(ok => setTimeout(ok,ms));
export async function until(fn,label,ms=20000) {
  const end=Date.now()+ms; let last;
  while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(e){last=e;}await pause(100);}
  throw Error(label+' timed out'+(last?' :: '+last.message:''));
}
export async function treeIdentity(root,excluded=new Set()) {
  const rows=[];
  async function walk(dir){for(const name of (await readdir(dir)).sort()){
    const file=join(dir,name);if(excluded.has(relative(root,file)))continue;const st=await lstat(file);
    assert(!st.isSymbolicLink(),'Snapshot refuses symlinks: '+file);
    if(st.isDirectory())await walk(file);else if(st.isFile())rows.push([relative(root,file),sha(await readFile(file))]);
  }}
  await walk(root);return {sha256:sha(JSON.stringify(rows)),files:rows};
}
export async function launchOwned({root,out,binary,extension=join(root,'dist/development'),seedProfile,headless=true}) {
  const outputRoot=resolve(root,'artifacts/scrapyjs');
  assert(resolve(out).startsWith(outputRoot+sep),'Evidence must stay in artifacts/scrapyjs');
  await mkdir(out,{recursive:true});
  assert((await realpath(out)).startsWith((await realpath(outputRoot))+sep),'Evidence cannot escape artifacts/scrapyjs via a symlink');
  const owned=await mkdtemp(join(out,'cft-'));
  const snapshot=join(owned,'extension'),profile=join(owned,'profile');
  let seedIdentity;
  if(seedProfile){
    const allowed=await realpath(outputRoot),source=await realpath(resolve(seedProfile));
    assert(source.startsWith(allowed+sep),'Seed Profile must stay strictly inside artifacts/scrapyjs');
    assert(!resolve(out).startsWith(source+sep),'Output must not be inside the seed Profile');
    // Only closed, task-owned profiles may be cloned. Never follow Chrome singleton links.
    const skip=new Set(['SingletonLock','SingletonSocket','SingletonCookie','DevToolsActivePort','RunningChromeVersion']);
    try{
      const lock=await readlink(join(source,'SingletonLock')),pid=Number(lock.match(/-(\d+)$/)?.[1]);
      assert(Number.isSafeInteger(pid)&&pid>0,'Cannot establish seed lock owner');
      try{process.kill(pid,0);assert.fail('Seed Profile owner is still alive: '+pid);}catch(error){if(error.code!=='ESRCH')throw error;}
    }catch(error){if(error.code!=='ENOENT')throw error;}
    seedIdentity=await treeIdentity(source,skip);
    await cp(source,profile,{recursive:true,errorOnExist:true,force:false,filter:file=>!skip.has(relative(source,file))});
    assert.equal((await treeIdentity(source,skip)).sha256,seedIdentity.sha256,'Seed Profile changed while copying');
    assert.equal((await treeIdentity(profile)).sha256,seedIdentity.sha256,'Copied seed bytes must match');
    seedIdentity={path:source,...seedIdentity};
  }else await mkdir(profile,{mode:0o700});
  // A stable partial directory during a watcher publication is not a runnable extension.
  await until(async()=>{
    const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
    return manifest.background?.service_worker&&
      (await readFile(join(extension,manifest.background.service_worker))).length>0;
  },'complete extension publication (manifest + service worker)',45000);
  const before=await treeIdentity(extension);
  await cp(extension,snapshot,{recursive:true,errorOnExist:true,force:false});
  const after=await treeIdentity(extension),copy=await treeIdentity(snapshot);
  assert.equal(before.sha256,after.sha256,'Watcher changed input while copying; never run a mixed snapshot');
  assert.equal(copy.sha256,before.sha256);
  await writeFile(join(owned,'input-identity.json'),JSON.stringify({extension,before},null,2));
  // Path-derived unpacked IDs must survive seeded runs. The source is an immutable
  // task-owned artifacts snapshot; retain a byte-identical evidence copy in this run.
  const loadedExtension=seedProfile?await realpath(extension):snapshot;
  if(seedProfile)assert(loadedExtension.startsWith((await realpath(outputRoot))+sep),'Seeded extension must be an artifacts/scrapyjs snapshot');
  const args=[...(headless?['--headless=new']:[]),'--no-first-run','--no-default-browser-check','--use-mock-keychain',
    '--password-store=basic','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--disable-extensions-except='+loadedExtension,'--load-extension='+loadedExtension,'about:blank'];
  const child=spawn(binary,args,{stdio:['ignore','ignore','pipe']});
  const errors=[];child.stderr.on('data',b=>errors.push(String(b)));let launchError;
  child.on('error',e=>{launchError=e;});
  let ws,seq=0;const pending=new Map(),events=[];
  const metadata={pid:child.pid,profile,snapshot,loadedExtension,binary,args,inputSha256:copy.sha256,owned,...(seedIdentity?{seedProfile:seedIdentity}:{})};
  async function close(){
    if(ws?.readyState===1){try{await call('Browser.close');}catch{}}
    ws?.close();
    // Only the child created above may be signalled. Never process-name kill.
    if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await until(()=>child.exitCode!==null||child.signalCode!==null,'owned CFT exit',10000);}
    await writeFile(join(owned,'chrome-stderr.log'),errors.join(''));
  }
  function call(method,params={},sessionId){return new Promise((ok,fail)=>{
    if(ws?.readyState!==WebSocket.OPEN){fail(Error('Owned CDP is closed'));return;}
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method));},25000);
    pending.set(id,{ok,fail,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });}
  try{
    const endpoint=await until(async()=>{
      if(launchError)throw launchError;
      if(child.exitCode!==null)throw Error('Owned CFT exited '+child.exitCode);
      const [port,path]=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
      return port&&path?'ws://127.0.0.1:'+port+path:null;
    },'owned CFT endpoint');
    ws=new WebSocket(endpoint);
    await new Promise((ok,fail)=>{ws.once('open',ok);ws.once('error',fail);});
    ws.on('message',bytes=>{const m=JSON.parse(String(bytes));if(m.id){const p=pending.get(m.id);if(!p)return;
      clearTimeout(p.timer);pending.delete(m.id);m.error?p.fail(Error(m.error.message)):p.ok(m.result);
    }else{events.push(m);}});
    ws.on('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.fail(Error('CDP closed'));}pending.clear();});
    async function attach(targetId){const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
      const session={targetId,sessionId,call:(m,p)=>call(m,p,sessionId),read:async expression=>{
        const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
        if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
        return r.result?.value;
      }};await session.call('Runtime.enable');return session;}
    return {call,attach,close,metadata,events};
  }catch(error){await close();throw error;}
}
export async function click(session,selector,depth=0){
  assert(depth<12,'Disclosure could not be opened: '+selector);
  // Enter the App's visible rules tab before locating one of its editors.
  if(await session.read(`Boolean(document.querySelector(${JSON.stringify(selector)})?.closest('#rules-editor[hidden]'))`))
    await click(session,'#tab-rules',depth+1);
  // Prepare disclosure visibility before real target input. This is DOM driver
  // setup, not evidence of physically toggling an offscreen macOS disclosure.
  await session.read(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});
    for(let p=e?.parentElement;p;p=p.parentElement)
      if(p.matches('details')&&!p.querySelector(':scope > summary')?.contains(e))p.open=true;
  })()`);
  const box=await until(()=>session.read(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});
    if(!e||e.disabled)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();
    const x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&r.height&&x>0&&y>0&&x<innerWidth&&y<innerHeight&&
    e.contains(document.elementFromPoint(x,y))?{x,y}:null})()`),'clickable '+selector);
  await pointer(session,box);
}
async function pointer(s,{x,y}){
  if(s.inputHost){
    const point=await s.inputHost.read(`(async()=>{const f=document.querySelector(${JSON.stringify(s.inputOwnerSelector)});if(!f)throw Error('Actual iframe owner missing');
      for(let p=f.parentElement;p;p=p.parentElement){const r=f.getBoundingClientRect(),py=r.top+${y};
        if(p.scrollHeight>p.clientHeight&&/(auto|scroll)/.test(getComputedStyle(p).overflowY))p.scrollTop+=py-innerHeight/2;}
      // Scroll offsets update before the compositor's cross-process iframe hit test.
      await new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));
      const r=f.getBoundingClientRect(),x=r.left+f.clientLeft+${x},y=r.top+f.clientTop+${y};
      return {x,y,hit:document.elementFromPoint(x,y)===f};})()`);
    assert(point.hit,'Mapped pointer must hit the original iframe: '+JSON.stringify(point));
    ({x,y}=point);s=s.inputHost;
  }
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])
    await s.call('Input.dispatchMouseEvent',{type,x,y,button:'left',...(type==='mouseMoved'?{}:{clickCount:1})});
}
export async function fill(session,selector,text){
  await click(session,selector);
  // Select authored text only; Input.insertText emits the real browser edit event.
  await session.read(`document.querySelector(${JSON.stringify(selector)}).select()`);
  await (session.inputHost||session).call('Input.insertText',{text});
  assert.equal(await session.read(`document.querySelector(${JSON.stringify(selector)}).value`),text);
}
export async function fileInput(session,selector,file){
  await session.call('DOM.enable');const {root}=await session.call('DOM.getDocument',{depth:1});
  const {nodeId}=await session.call('DOM.querySelector',{nodeId:root.nodeId,selector});assert(nodeId);
  await session.call('DOM.setFileInputFiles',{nodeId,files:[resolve(file)]});
}
export async function openNativePanel(browser,demoUrl){
  const worker=await until(async()=> (await browser.call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.startsWith('chrome-extension://')&&new URL(t.url).pathname==='/sw.js'),'MV3 service worker');
  const extensionId=new URL(worker.url).host;
  const bootstrap=await browser.attach((await browser.call('Target.createTarget',{url:'chrome-extension://'+extensionId+'/sidepanel.html'})).targetId);
  try { await until(()=>bootstrap.read('typeof chrome?.windows?.getCurrent==="function"'),'bootstrap extension API ready'); } catch(error) { throw Error(error.message+' '+JSON.stringify({worker,bootstrap:await bootstrap.read('({url:location.href,title:document.title,text:document.body?.innerText?.slice(0,1200),chrome:typeof chrome,runtime:typeof chrome?.runtime})')})); }
  const windowId=await bootstrap.read('chrome.windows.getCurrent().then(w=>w.id)');
  const target=await browser.attach((await browser.call('Target.createTarget',{url:demoUrl})).targetId);
  await until(()=>target.read('document.readyState==="complete"'),'demo ready');
  await browser.call('Target.activateTarget',{targetId:target.targetId});
  const r=await bootstrap.call('Runtime.evaluate',{expression:`chrome.sidePanel.open({windowId:${windowId}})`,userGesture:true,awaitPromise:true,returnByValue:true});
  assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));
  const context=await until(()=>bootstrap.read('chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]}).then(xs=>xs.find(x=>new URL(x.documentUrl).searchParams.has("hostInstanceId")))'),'actual SIDE_PANEL context');
  assert.equal(context.tabId,-1);assert.equal(context.contextType,'SIDE_PANEL');
  const info=await until(async()=> (await browser.call('Target.getTargets')).targetInfos.find(t=>t.url===context.documentUrl),'SIDE_PANEL debugger target');
  return {panel:await browser.attach(info.targetId),target,context,extensionId,bootstrap};
}
export async function enableUserScripts(browser,extensionId){
  const tab=await browser.attach((await browser.call('Target.createTarget',{url:'chrome://extensions/?id='+extensionId})).targetId);
  const expression='document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")?.shadowRoot?.querySelector("#allow-user-scripts")?.shadowRoot?.querySelector("cr-toggle#crToggle")';
  await until(()=>tab.read('!!('+expression+')'),'Chrome actual userScripts toggle');
  await browser.call('Target.activateTarget',{targetId:tab.targetId});
  if(!await tab.read('('+expression+').checked')){
    await tab.read('('+expression+').focus()');
    for(const type of ['keyDown','keyUp'])await tab.call('Input.dispatchKeyEvent',{type,key:' ',code:'Space',windowsVirtualKeyCode:32});
  }
  try { await until(()=>tab.read('('+expression+').checked===true'),'Chrome userScripts opt-in committed',5000); } catch(error) { throw Error(error.message+' '+JSON.stringify(await tab.read(`(()=>{const e=(${expression});return {html:e.outerHTML,rect:e.getBoundingClientRect().toJSON(),url:location.href,text:document.body.innerText,detail:document.querySelector('extensions-manager').shadowRoot.querySelector('extensions-detail-view').shadowRoot.innerHTML.slice(-6500)}})()`))); }
  await browser.call('Target.closeTarget',{targetId:tab.targetId});
  return {control:'chrome://extensions actual allow-user-scripts cr-toggle',checked:true};
}

// Standard DOM select interaction (as in Playwright selectOption), not a physical
// macOS menu click. Keep old button-based App snapshots readable for seed lanes.
export async function selectProfile(session,id){
  if(!await session.read('!!document.querySelector("#profile-list")?.options'))
    return click(session,'#profile-list button[data-profile-id='+JSON.stringify(id)+']');
  await session.read(`(()=>{const select=document.querySelector('#profile-list');
    if(select.disabled||![...select.options].some(o=>o.value===${JSON.stringify(id)}&&!o.disabled))throw Error('Profile is unavailable');
    select.value=${JSON.stringify(id)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
