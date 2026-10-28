// Real CDP transport for this lane's owned CFT only. Never connects to an existing profile.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,readdir,lstat,cp} from 'node:fs/promises';
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
export async function treeIdentity(root) {
  const rows=[];
  async function walk(dir){for(const name of (await readdir(dir)).sort()){
    const file=join(dir,name),st=await lstat(file);
    assert(!st.isSymbolicLink(),'Snapshot refuses symlinks: '+file);
    if(st.isDirectory())await walk(file);else if(st.isFile())rows.push([relative(root,file),sha(await readFile(file))]);
  }}
  await walk(root);return {sha256:sha(JSON.stringify(rows)),files:rows};
}
export async function launchOwned({root,out,binary,extension=join(root,'dist/development')}) {
  const outputRoot=resolve(root,'artifacts/scrapyjs');
  assert(resolve(out).startsWith(outputRoot+sep),'Evidence must stay in artifacts/scrapyjs');
  await mkdir(out,{recursive:true});
  const owned=await mkdtemp(join(out,'cft-'));
  const snapshot=join(owned,'extension'),profile=join(owned,'profile');
  await mkdir(profile,{mode:0o700});
  const before=await treeIdentity(extension);
  await cp(extension,snapshot,{recursive:true,errorOnExist:true,force:false});
  const after=await treeIdentity(extension),copy=await treeIdentity(snapshot);
  assert.equal(before.sha256,after.sha256,'Watcher changed input while copying; never run a mixed snapshot');
  assert.equal(copy.sha256,before.sha256);
  await writeFile(join(owned,'input-identity.json'),JSON.stringify({extension,before},null,2));
  const args=['--headless=new','--no-first-run','--no-default-browser-check','--use-mock-keychain',
    '--password-store=basic','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--disable-extensions-except='+snapshot,'--load-extension='+snapshot,'about:blank'];
  const child=spawn(binary,args,{stdio:['ignore','ignore','pipe']});
  const errors=[];child.stderr.on('data',b=>errors.push(String(b)));let launchError;
  child.on('error',e=>{launchError=e;});
  let ws,seq=0;const pending=new Map(),events=[];
  const metadata={pid:child.pid,profile,snapshot,binary,args,inputSha256:copy.sha256,owned};
  async function close(){
    if(ws?.readyState===1){try{await call('Browser.close');}catch{}}
    ws?.close();
    // Only the child created above may be signalled. Never process-name kill.
    if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await until(()=>child.exitCode!==null||child.signalCode!==null,'owned CFT exit',10000);}
    await writeFile(join(owned,'chrome-stderr.log'),errors.join(''));
  }
  function call(method,params={},sessionId){return new Promise((ok,fail)=>{
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
export async function click(session,selector){
  // Expand only existing disclosure ancestors through real input.
  const summary=await session.read(`(()=>{let e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;
    const a=[];for(let p=e.parentElement;p;p=p.parentElement)if(p.matches('details:not([open])'))a.push(p);
    const d=a.at(-1);if(!d)return null;const s=d.querySelector(':scope > summary');
    s.scrollIntoView({block:'center'});const r=s.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if(summary){await pointer(session,summary);return click(session,selector);}
  const box=await until(()=>session.read(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});
    if(!e||e.disabled)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();
    const x=r.x+r.width/2,y=r.y+r.height/2;return r.width&&r.height&&x>0&&y>0&&x<innerWidth&&y<innerHeight&&
    e.contains(document.elementFromPoint(x,y))?{x,y}:null})()`),'clickable '+selector);
  await pointer(session,box);
}
async function pointer(s,{x,y}){for(const type of ['mouseMoved','mousePressed','mouseReleased'])
  await s.call('Input.dispatchMouseEvent',{type,x,y,button:'left',...(type==='mouseMoved'?{}:{clickCount:1})});}
export async function fill(session,selector,text){
  await click(session,selector);
  // Select authored text only; Input.insertText emits the real browser edit event.
  await session.read(`document.querySelector(${JSON.stringify(selector)}).select()`);
  await session.call('Input.insertText',{text});
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
    const box=await tab.read(`(()=>{const e=(${expression});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    assert(box.x>0&&box.y>0);await pointer(tab,box);
  }
  try { await until(()=>tab.read('('+expression+').checked===true'),'Chrome userScripts opt-in committed',5000); } catch(error) { throw Error(error.message+' '+JSON.stringify(await tab.read(`(()=>{const e=(${expression});return {html:e.outerHTML,rect:e.getBoundingClientRect().toJSON(),url:location.href,text:document.body.innerText,detail:document.querySelector('extensions-manager').shadowRoot.querySelector('extensions-detail-view').shadowRoot.innerHTML.slice(-6500)}})()`))); }
  await browser.call('Target.closeTarget',{targetId:tab.targetId});
  return {control:'chrome://extensions actual allow-user-scripts cr-toggle',checked:true};
}
