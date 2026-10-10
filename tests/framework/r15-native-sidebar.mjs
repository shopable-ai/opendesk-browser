// Real, owned macOS Chrome + unchanged WXT package. UI mutations use native
// Chrome input/action commands. Runtime.evaluate observes extension state;
// fixture-main writes only the owned test webpage's preexisting globals.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {createInterface} from 'node:readline';
import {execFileSync} from 'node:child_process';
import {launchLocalDevChrome} from './local-dev-cft-launcher.mjs';
import {verifyPackage} from '../../scripts/verify-package.mjs';

const out=path.resolve(process.env.OPENDESK_R15_NATIVE_EVIDENCE||'docs/framework/evidence/r15-native');
const file=path.join(out,'session.json'),pause=ms=>new Promise(r=>setTimeout(r,ms));
const save=(name,value)=>fs.writeFile(path.join(out,name+'.json'),JSON.stringify(value,null,2)+'\n');
async function until(work,label){for(let i=0;i<150;i++){const value=await work();if(value)return value;await pause(100);}throw Error(label+' not observed');}
async function connect(endpoint){
  const socket=new WebSocket(endpoint),pending=new Map(),listeners=new Set();let serial=0;
  await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  socket.onmessage=({data})=>{const m=JSON.parse(data);if(!m.id){for(const listener of listeners)listener(m);return;}const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);};
  return {listen(fn){listeners.add(fn);return()=>listeners.delete(fn);},call(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});},close(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('closed'));}socket.close();}};
}
async function loadedAsset(c,id,s,relative){
  const scripts=[],off=c.listen(e=>{if(e.sessionId===id&&e.method==='Debugger.scriptParsed')scripts.push(e.params);});
  try{
    await c.call('Debugger.enable',{},id);
    const parsed=await until(()=>scripts.find(p=>p.url===`chrome-extension://${s.extensionId}/${relative}`),'loaded '+relative);
    const {scriptSource}=await c.call('Debugger.getScriptSource',{scriptId:parsed.scriptId},id);
    const sha256=createHash('sha256').update(scriptSource).digest('hex'),disk=await fs.readFile(path.join(s.extension,relative));
    return {url:parsed.url,scriptId:parsed.scriptId,sha256,bytes:Buffer.byteLength(scriptSource),diskSha256:createHash('sha256').update(disk).digest('hex'),matchesDisk:sha256===createHash('sha256').update(disk).digest('hex')};
  }finally{off();await c.call('Debugger.disable',{},id);}
}
async function read(c,sessionId,expression,object=false){const r=await c.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:!object},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return object?r.result:r.result.value;}
async function attach(c,targetId){return (await c.call('Target.attachToTarget',{targetId,flatten:true})).sessionId;}
async function worker(c,extensionId){return await until(async()=>{
  const t=(await c.call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url===`chrome-extension://${extensionId}/sw.js`);if(!t)return null;
  const id=await attach(c,t.targetId);if(await read(c,id,'typeof chrome!=="undefined"&&typeof chrome.runtime?.getContexts==="function"'))return id;
  await c.call('Target.detachFromTarget',{sessionId:id});return null;
},'extension worker');}
async function panel(c,s){
  const sw=await worker(c,s.extensionId),contexts=await until(async()=>{
    const contexts=await read(c,sw,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})');return contexts.length?contexts:null;
  },'actual Sidebar context');
  assert.equal(contexts.length,1,'must operate the actual Sidebar');const context=contexts[0];assert.equal(context.contextType,'SIDE_PANEL');assert.equal(context.tabId,-1);
  const target=await until(async()=>{const t=(await c.call('Target.getTargets')).targetInfos.find(t=>t.url===context.documentUrl);return t||null;},'Sidebar debugger target');
  return {id:await attach(c,target.targetId),target,context};
}
async function click(c,id,expression){
  await until(()=>read(c,id,`(()=>{const n=${expression};return Boolean(n&&!n.disabled&&n.getClientRects().length);})()`),'available native control');
  const object=await read(c,id,expression,true);assert(object.objectId,'native control missing');
  await c.call('DOM.enable',{},id);await c.call('DOM.scrollIntoViewIfNeeded',{objectId:object.objectId},id);
  const rect=await read(c,id,`(()=>{const n=${expression};if(!n||n.disabled)throw Error('control unavailable');const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()`);
  assert(rect.w>0&&rect.h>0);for(const type of ['mousePressed','mouseReleased'])await c.call('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',clickCount:1},id);
  await c.call('Runtime.releaseObject',{objectId:object.objectId},id);return rect;
}
async function observe(c,s,label){
  const sw=await worker(c,s.extensionId),p=await panel(c,s),page=await attach(c,s.page);
  const state={at:new Date().toISOString(),session:s,sidebar:p.context,
    loadedWorker:await loadedAsset(c,sw,s,'sw.js'),loadedSidebar:await loadedAsset(c,p.id,s,'ui/tool-shell.js'),
    targets:(await c.call('Target.getTargets')).targetInfos,
    runtime:await read(c,sw,'(async()=>{const inspect=async name=>{try{return typeof chrome.userScripts?.[name]==="function"?await chrome.userScripts[name]():null;}catch(error){return{apiError:error.message};}};return{contexts:await chrome.runtime.getContexts({}),local:await chrome.storage.local.get(null),session:await chrome.storage.session.get(null),userScripts:typeof chrome.userScripts?.getScripts,worlds:await inspect("getWorldConfigurations"),scripts:await inspect("getScripts")};})()'),
    ui:await read(c,p.id,'(()=>{return {text:document.body.innerText,controls:[...document.querySelectorAll("button,input,textarea,pre,summary,[data-state]")].filter(n=>n.getClientRects().length).map(n=>({id:n.id,text:n.textContent?.slice(0,2000),value:n.value,disabled:n.disabled,state:n.dataset.state})),resources:performance.getEntriesByType("resource").map(n=>n.name)}})()'),
    main:await read(c,page,'(()=>({title:document.title,h1:document.querySelector("h1")?.textContent,jqueryAttribute:document.querySelector("h1")?.getAttribute("data-r15-jquery"),url:location.href,globals:Object.fromEntries(["_","dayjs","$","jQuery"].map(k=>[k,{type:typeof globalThis[k],sentinel:globalThis[k]?.sentinel}]))}))()')};
  state.ui.nativeReceipt=await read(c,p.id,'(()=>{const text=document.querySelector("#page-preview-technical")?.textContent;return text?JSON.parse(text):null;})()');
  // Read the real IndexedDB stores directly; no manufactured sender/RPC.
  state.persisted=await read(c,p.id,'(async()=>{const names=await indexedDB.databases();const result={};for(const meta of names){result[meta.name]=await new Promise((resolve,reject)=>{const request=indexedDB.open(meta.name);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,stores=[...db.objectStoreNames],rows={};if(!stores.length){db.close();resolve(rows);return;}const tx=db.transaction(stores,"readonly");for(const name of stores){const get=tx.objectStore(name).getAll();get.onsuccess=()=>rows[name]=get.result;}tx.oncomplete=()=>{db.close();resolve(rows)};tx.onerror=()=>reject(tx.error);};});}return result;})()');
  await save(label,state);
  try{if(process.env.OPENDESK_R15_NATIVE_NO_SCREENSHOT!=='1'){const shot=await c.call('Page.captureScreenshot',{format:'png',fromSurface:false},p.id);await fs.writeFile(path.join(out,label+'.png'),Buffer.from(shot.data,'base64'));}}
  catch(error){await save(label+'-screenshot-error',{message:error.message});}
  console.log(JSON.stringify({label,main:state.main,controls:state.ui.controls.filter(n=>/status|result|task-id|technical/.test(n.id)),stores:Object.keys(state.persisted)}));
}
const cmd=process.argv[2];
if(cmd==='start'){
  await fs.mkdir(out,{recursive:true});await assert.rejects(fs.stat(file),e=>e.code==='ENOENT');
  const extension=path.resolve(process.argv[3]||'dist/production');let packageReceipt,servingRecord;
  if(process.argv[4]==='serve'){
    servingRecord=JSON.parse(await fs.readFile(path.join(extension,'development-update.json'),'utf8'));
    assert.equal(servingRecord.protocol,'opendesk.development.v1');
    for(const [name,hash] of Object.entries(servingRecord.files)){
      assert(!name.startsWith('/')&&!name.split('/').includes('..'));
      assert.equal(createHash('sha256').update(await fs.readFile(path.join(extension,name))).digest('hex'),hash,name);
    }
    const check=await fs.mkdtemp(path.join(tmpdir(),'r15-verify-serve-'));
    try{await fs.cp(extension,check,{recursive:true});await fs.unlink(path.join(check,'development-update.json'));packageReceipt=await verifyPackage(check);}
    finally{await fs.rm(check,{recursive:true,force:true});}
    await save('serve-publication',servingRecord);
  }else packageReceipt=await verifyPackage(extension);
  const binary=process.env.CHROME_FOR_TESTING_BIN;assert(binary,'explicit CFT required');
  const launched=await launchLocalDevChrome({root:process.cwd(),out,binary,profile:'unused-owned-by-launcher',argv:['--use-mock-keychain','--password-store=basic','--no-first-run','--no-default-browser-check','--enable-unsafe-extension-debugging','--remote-debugging-port=0','--disable-extensions-except='+extension,'--load-extension='+extension,'about:blank']});
  const endpoint=`ws://127.0.0.1:${launched.lines[0]}${launched.lines[1]}`,c=await connect(endpoint);
  const session={endpoint,extension,packageHash:packageReceipt.packageHash,...(servingRecord?{serveRevision:servingRecord.revision}:{}),pid:launched.chrome.pid,launch:launched.launch,version:await c.call('Browser.getVersion')};
  try{
    session.page=(await c.call('Target.createTarget',{url:'http://127.0.0.1:43111/demo-form.html'})).targetId;
    const pageSession=await attach(c,session.page);
    await until(async()=>{try{return await read(c,pageSession,'document.readyState==="complete"&&location.pathname==="/demo-form.html"');}catch(error){if(/navigated/.test(error.message))return false;throw error;}},'loaded demo document');
    const sw=await until(async()=>(await c.call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js')),'loaded WXT SW');session.extensionId=new URL(sw.url).host;
    const tabs=(await c.call('Target.getTargets',{filter:[{type:'tab',exclude:false},{exclude:true}]})).targetInfos;
    const tab=tabs.find(t=>t.url==='http://127.0.0.1:43111/demo-form.html');assert(tab);await c.call('Target.activateTarget',{targetId:tab.targetId});
    const swSession=await attach(c,sw.targetId);
    await until(async()=>{try{return await read(c,swSession,'typeof chrome!=="undefined"&&chrome.sidePanel?.getPanelBehavior().then(v=>v.openPanelOnActionClick)');}catch(error){if(/navigated/.test(error.message))return false;throw error;}}, 'configured native action');
    session.action=await c.call('Extensions.triggerAction',{id:session.extensionId,targetId:tab.targetId});await save('session',session);
    await until(async()=>{const sw=await worker(c,session.extensionId);return (await read(c,sw,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})')).length===1;},'opened Sidebar');
    await observe(c,session,'initial');c.close();
    const stop=async()=>{try{const q=await connect(endpoint);await q.call('Browser.close').catch(()=>{});q.close();}catch{}finally{await launched.chrome.cleanup();process.exit();}};process.on('SIGTERM',stop);process.on('SIGINT',stop);createInterface({input:process.stdin}).on('line',line=>{if(line.trim()==='stop')void stop();});
  }catch(error){await save('startup-error',{message:error.message,stack:error.stack,targets:await c.call('Target.getTargets').catch(()=>null)});c.close();launched.chrome.kill('SIGTERM');await launched.chrome.cleanup();throw error;}
}else{
  const s=JSON.parse(await fs.readFile(file,'utf8')),c=await connect(s.endpoint);
  try{
    if(cmd==='inspect-targets'){
      const targets=(await c.call('Target.getTargets')).targetInfos;
      const sw=targets.find(t=>t.type==='service_worker'&&t.url===`chrome-extension://${s.extensionId}/sw.js`);
      const contexts=sw?await read(c,await attach(c,sw.targetId),'chrome.runtime.getContexts({})'):[];
      await save('target-diagnostic',{targets,contexts});console.log(JSON.stringify({targets,contexts}));
    }else if(cmd==='observe')await observe(c,s,process.argv[3]||'observation');
    else if(cmd==='wait-idle'){
      const p=await panel(c,s);await until(()=>read(c,p.id,'document.querySelector("#script-stop")?.disabled===true&&document.querySelector("#script-run")?.disabled===false'),'retired Controller UI');
    }else if(cmd==='input'||cmd==='click'){
      const p=await panel(c,s),selector=process.argv[3];const rect=await click(c,p.id,`document.querySelector(${JSON.stringify(selector)})`);
      if(cmd==='input'){
        const text=await fs.readFile(process.argv[4],'utf8');for(const type of ['keyDown','keyUp'])await c.call('Input.dispatchKeyEvent',{type,key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},p.id);await c.call('Input.insertText',{text},p.id);
        assert.equal(await read(c,p.id,`document.querySelector(${JSON.stringify(selector)}).value`),text);
      }
      await save('input-'+Date.now(),{kind:'native-CDP-input',selector,rect,sidebar:p.context});
    }else if(cmd==='toggle'||cmd==='user-scripts-off'){
      const target=(await c.call('Target.createTarget',{url:'chrome://extensions/?id='+s.extensionId})).targetId,id=await attach(c,target);
      const detail='document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")';const expression='('+detail+')?.shadowRoot?.querySelector("#allow-user-scripts")?.shadowRoot?.querySelector("cr-toggle#crToggle")';
      await until(()=>read(c,id,'Boolean(('+detail+')?.data?.id==='+JSON.stringify(s.extensionId)+'&&'+expression+')'),'Chrome Allow user scripts control');
      const checked=cmd==='toggle';
      if((await read(c,id,expression+'.checked'))!==checked)await click(c,id,expression);
      await until(()=>read(c,id,expression+'.checked === '+checked),'trusted toggle change');await save('user-scripts-consent-'+Date.now(),{pid:s.pid,extensionId:s.extensionId,kind:'native-Chrome-WebUI-pointer',checked});await c.call('Target.closeTarget',{targetId:target});await c.call('Target.activateTarget',{targetId:s.page});
    }else if(cmd==='navigate'){
      const page=await attach(c,s.page);await c.call('Page.navigate',{url:process.argv[3]||'http://127.0.0.1:43111/demo-form.html?r15=navigation'},page);
    }else if(cmd==='stop-sw'){
      const page=await attach(c,s.page),versions=[];
      const off=c.listen(e=>{if(e.sessionId===page&&e.method==='ServiceWorker.workerVersionUpdated')versions.push(...e.params.versions);});
      await c.call('ServiceWorker.enable',{},page);
      const version=await until(()=>versions.find(v=>v.scriptURL===`chrome-extension://${s.extensionId}/sw.js`&&v.runningStatus==='running'),'native SW version');
      await c.call('ServiceWorker.stopWorker',{versionId:version.versionId},page);
      await until(async()=>!(await c.call('Target.getTargets')).targetInfos.some(t=>t.type==='service_worker'&&t.url===version.scriptURL),'stopped native SW');
      await save('sw-stopped',{version,targets:(await c.call('Target.getTargets')).targetInfos});off();
    }else if(cmd==='offline-run'){
      const page=await attach(c,s.page),p=await panel(c,s);
      await c.call('Network.enable',{},page);
      try{
        await c.call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1},page);
        await save('offline-condition',{kind:'native-CDP-Network.emulateNetworkConditions',offline:true,target:s.page});
        await click(c,p.id,'document.querySelector("#page-preview-run")');
        await until(()=>read(c,p.id,'document.querySelector("#page-preview-status")?.dataset.state!=="running"'),'offline Page completion');
        await observe(c,s,'offline-page');
      }finally{await c.call('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1},page);}
    }else if(cmd==='close-test-window'){
      const {windowId}=await c.call('Browser.getWindowForTarget',{targetId:s.page});
      const before=(await c.call('Target.getTargets')).targetInfos;
      for(const target of before.filter(t=>t.type==='page')){
        const owner=await c.call('Browser.getWindowForTarget',{targetId:target.targetId}).catch(()=>null);
        if(owner?.windowId===windowId)await c.call('Target.closeTarget',{targetId:target.targetId});
      }
      await until(async()=>!(await c.call('Target.getTargets')).targetInfos.some(t=>t.type==='worker'&&t.url.includes(s.extensionId)),'released window Worker');
      await save('window-closed',{windowId,before,after:(await c.call('Target.getTargets')).targetInfos});
      s.page=(await c.call('Target.createTarget',{url:'http://127.0.0.1:43111/demo-form.html'})).targetId;
      await fs.writeFile(file,JSON.stringify(s,null,2)+'\n');
    }else if(cmd==='offline'){
      const page=await attach(c,s.page);await c.call('Network.enable',{},page);await c.call('Network.emulateNetworkConditions',{offline:process.argv[3]!=='false',latency:0,downloadThroughput:-1,uploadThroughput:-1},page);
    }else if(cmd==='fixture-main'){
      const page=await attach(c,s.page),source='for(const k of ["_","dayjs","$","jQuery"])globalThis[k]=Object.freeze({sentinel:"website-main-"+k});';
      await read(c,page,source);
      assert.equal(await read(c,page,'globalThis._?.sentinel'),'website-main-_');
      await save('main-fixture',{source,document:await read(c,page,'location.href'),kind:'real-CDP-MAIN-page-fixture'});
    }else if(cmd==='reload'){
      const target=(await c.call('Target.createTarget',{url:'chrome://extensions/?id='+s.extensionId})).targetId,id=await attach(c,target);
      const button='document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")?.shadowRoot?.querySelector("#dev-reload-button")';
      await until(()=>read(c,id,'Boolean('+button+')'),'reload button');await click(c,id,button);
      await c.call('Target.closeTarget',{targetId:target});
      const tab=(await c.call('Target.getTargets',{filter:[{type:'tab',exclude:false},{exclude:true}]})).targetInfos.find(t=>t.url.startsWith('http://127.0.0.1:43111/demo-form.html'));
      assert(tab);await c.call('Extensions.triggerAction',{id:s.extensionId,targetId:tab.targetId});
      await until(async()=>{const sw=await worker(c,s.extensionId);return (await read(c,sw,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})')).length===1;},'reloaded side panel');
      const sw=await worker(c,s.extensionId),loaded=await loadedAsset(c,sw,s,'sw.js');assert(loaded.matchesDisk,'reload must load current SW bytes');
      s.packageHash=(await verifyPackage(s.extension)).packageHash;await save('session',s);
      await save('reload-'+Date.now(),{extension:s.extension,kind:'native-Chrome-WebUI-reload',packageHash:s.packageHash,loaded});
    }else if(cmd==='reopen'){
      await c.call('Target.activateTarget',{targetId:s.page});
      const tab=(await c.call('Target.getTargets',{filter:[{type:'tab',exclude:false},{exclude:true}]})).targetInfos.find(t=>t.url.startsWith('http://127.0.0.1:43111/demo-form.html'));
      assert(tab);
      const existing=(await c.call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url===`chrome-extension://${s.extensionId}/sw.js`);
      const contexts=existing?await read(c,await attach(c,existing.targetId),'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})'):[];
      if(!contexts.length)await c.call('Extensions.triggerAction',{id:s.extensionId,targetId:tab.targetId});
      await panel(c,s);
    }else if(cmd==='developer-mode'){
      const target=(await c.call('Target.createTarget',{url:'chrome://extensions/'})).targetId,id=await attach(c,target);
      const toolbar='document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-toolbar")?.shadowRoot';
      await until(()=>read(c,id,'Boolean('+toolbar+')'),'extensions toolbar');
      const control='('+toolbar+')?.querySelector("#devMode")';
      await save('developer-mode-controls',{html:await read(c,id,toolbar+'.innerHTML')});
      if(!await read(c,id,control+'.checked'))await click(c,id,control);
      await until(()=>read(c,id,control+'.checked'),'native developer mode');
      await save('developer-mode-consent',{kind:'native-Chrome-WebUI-pointer',enabled:true,pid:s.pid});
      await c.call('Target.closeTarget',{targetId:target});await c.call('Target.activateTarget',{targetId:s.page});
    }else if(cmd==='host-revoke'||cmd==='host-restore'){
      const target=(await c.call('Target.createTarget',{url:'chrome://extensions/?id='+s.extensionId})).targetId,id=await attach(c,target);
      const host='document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")?.shadowRoot?.querySelector("extensions-runtime-host-permissions")';
      const select='('+host+')?.shadowRoot?.querySelector("#newHostAccess")';
      await until(()=>read(c,id,'Boolean('+select+')'),'Chrome host access select');
      const value=cmd==='host-revoke'?'ON_CLICK':'ON_ALL_SITES';
      if(await read(c,id,select+'.value')!==value){
        const options=await read(c,id,select+'.options.length'),current=await read(c,id,select+'.selectedIndex'),index=cmd==='host-revoke'?0:options-1;
        const label=await read(c,id,select+'.options['+index+'].textContent.trim()');
        execFileSync('/usr/bin/osascript',['-e','tell application "System Events"\ntell first application process whose unix id is '+s.pid+'\nset frontmost to true\nkey code 53\nend tell\nend tell'],{timeout:10000});
        await click(c,id,select);
        const apple='on run argv\nset ownedPid to item 1 of argv as integer\nset wantedLabel to item 2 of argv\nset steps to item 3 of argv as integer\ntell application "System Events"\nset candidates to application processes whose unix id is ownedPid\nif (count of candidates) is not 1 then error "Owned Chrome missing"\ntell item 1 of candidates\nif not frontmost then error "Owned Chrome lost focus"\nset matches to {}\nrepeat with uiElement in entire contents\ntry\nif role of uiElement is "AXMenuItem" and name of uiElement is wantedLabel and enabled of uiElement then set end of matches to uiElement\nend try\nend repeat\nif (count matches) is 1 then\nperform action "AXPress" of item 1 of matches\nelse if (count matches) is 0 then\nrepeat steps times\nif item 4 of argv is "down" then\nkey code 125\nelse\nkey code 126\nend if\nend repeat\nkey code 36\nelse\nerror "Ambiguous native menu"\nend if\nend tell\nend tell\nreturn "OWNED_NATIVE_MENU_INPUT"\nend run';
        const receipt=execFileSync('/usr/bin/osascript',['-e',apple,String(s.pid),label,String(Math.abs(current-index)),current<index?'down':'up'],{timeout:10000,encoding:'utf8'}).trim();
        await save(cmd+'-native-menu',{pid:s.pid,label,receipt,index,current});
      }
      await until(()=>read(c,id,select+'.value === '+JSON.stringify(value)),'native site access '+value);
      await save(cmd,{kind:'native-Chrome-WebUI-pointer-and-key',value,extensionId:s.extensionId});
      await c.call('Target.closeTarget',{targetId:target});await c.call('Target.activateTarget',{targetId:s.page});
    }else if(cmd==='site-access-inspect'){
      const target=(await c.call('Target.createTarget',{url:'chrome://extensions/?id='+s.extensionId})).targetId,id=await attach(c,target);
      const host='document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")?.shadowRoot?.querySelector("extensions-runtime-host-permissions")';
      await until(()=>read(c,id,'Boolean('+host+'?.shadowRoot)'),'Chrome host permissions control');
      const html=await read(c,id,host+'.shadowRoot.innerHTML');await save('site-access-controls',{html});console.log(html);
      await c.call('Target.closeTarget',{targetId:target});
    }else if(cmd==='settings-inspect'||cmd==='settings-data'){
      const target=(await c.call('Target.createTarget',{url:'chrome://extensions/?id='+s.extensionId})).targetId,id=await attach(c,target);
      await until(()=>read(c,id,'Boolean(document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")?.data?.id)'), 'settings detail');
      console.log(await read(c,id,cmd==='settings-data'?'document.querySelector("extensions-manager").shadowRoot.querySelector("extensions-detail-view").data':'document.querySelector("extensions-manager").shadowRoot.querySelector("extensions-detail-view").shadowRoot.innerHTML'));
      await c.call('Target.closeTarget',{targetId:target});
    }else throw Error('Use start EXTENSION | observe LABEL | input SELECTOR TEXT_FILE | click SELECTOR | toggle | user-scripts-off | navigate URL | offline true/false | fixture-main');
  }finally{c.close();}
}
