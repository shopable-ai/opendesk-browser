// Acceptance-only adversarial scheduling with real Web Locks and public SDK.
// No mocked Chrome storage, modified product handler, native ack or seeded data.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const directory=process.env.TOOL_EVIDENCE_DIR,root=process.env.TOOL_SOURCE_ROOT;
const {connect,evaluate}=await import(pathToFileURL(path.join(root,'tests/framework/sidebar-native-session.mjs')));
const session=JSON.parse(await readFile(path.join(directory,'session.json'),'utf8'));
const client=await connect(session.endpoint),mode=process.argv[2];
const lock='opendesk.sidebar-tools:tool:quick-notes',namespace='opendesk.sidebar-tools.data.v1:quick-notes',catalog='opendesk.sidebar-tools.installed.v1';
const save=(n,x)=>writeFile(path.join(directory,n+'.json'),JSON.stringify({at:new Date().toISOString(),session,...x},null,2)+'\n');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const attach=async targetId=>(await client.send('Target.attachToTarget',{targetId,flatten:true})).sessionId;
try{
 const targets=(await client.send('Target.getTargets')).targetInfos;
 const worker=targets.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js'));assert(worker);
 const workerId=await attach(worker.targetId);const storage=()=>evaluate(client,'chrome.storage.local.get(null)',workerId);
 if(mode==='arm'){
  const panels=[];
  for(const host of targets.filter(t=>t.type==='page'&&t.url.includes('/ui/tool.html?hostInstanceId='))){
   const id=await attach(host.targetId),window=await evaluate(client,'chrome.windows.getCurrent()',id);
   const children=targets.filter(t=>t.type==='iframe'&&t.parentId===host.targetId&&t.url.includes('/sidebar-tools/sandbox.html'));
   assert.equal(children.length,1);panels.push({host:host.targetId,window,tool:children[0].targetId,id,toolId:await attach(children[0].targetId)});
  }
  assert.equal(new Set(panels.map(p=>p.window.id)).size,2);
  const owner=panels.find(p=>!p.window.focused),caller=panels.find(p=>p.window.focused);assert(owner&&caller);
  const before=await storage();
  const spoof=await evaluate(client,'OpenDeskTool.request("storage.set",{key:"namespace-proof",value:"bound-to-caller",toolId:"other-notes",namespace:"opendesk.sidebar-tools.data.v1:other-notes"})',caller.toolId);
  const afterSpoof=await storage();
  assert.equal(afterSpoof[namespace]['namespace-proof'],'bound-to-caller');
  assert.deepEqual(afterSpoof['opendesk.sidebar-tools.data.v1:other-notes'],before['opendesk.sidebar-tools.data.v1:other-notes']);
  const unownedKeys=new Set([...Object.keys(before),...Object.keys(afterSpoof)].filter(k=>k!==namespace));
  for(const key of unownedKeys)assert.deepEqual(afterSpoof[key],before[key]);
  await save('namespace-write-isolation',{status:'NATIVE_PASS',before,after:afterSpoof,spoof,scope:'Payload toolId/namespace cannot redirect storage.set away from caller namespace; other namespace absent in this profile. Earlier installed-other-tool read case retained separately.'});
  await evaluate(client,'(()=>{globalThis.__queuedRequests=[];globalThis.__queuedNativeClicks=[];addEventListener("message",e=>{if(e.data?.kind==="request"&&e.data?.payload?.key==="queued-uninstall")__queuedRequests.push({data:e.data,fromActualFrame:e.source===document.querySelector("#sidebar-tool-frame iframe")?.contentWindow});});document.addEventListener("click",e=>{if(e.target.id==="sidebar-tool-remove")__queuedNativeClicks.push({id:e.target.id,isTrusted:e.isTrusted});},true);})()',caller.id);
  await evaluate(client,'(()=>{globalThis.__acceptanceLockHeld=false;navigator.locks.request('+JSON.stringify(lock)+',()=>{__acceptanceLockHeld=true;return new Promise(resolve=>{globalThis.__acceptanceReleaseLock=resolve;});});return {requested:true};})()',owner.id);
  for(let i=0;i<30&&!await evaluate(client,'__acceptanceLockHeld',owner.id);i++)await pause(50);
  assert.equal(await evaluate(client,'__acceptanceLockHeld',owner.id),true);
  await evaluate(client,'(()=>{globalThis.__queuedWrite=OpenDeskTool.request("storage.set",{key:"queued-uninstall",value:"must-not-resurrect"});__queuedWrite.then(x=>globalThis.__queuedWriteOutcome={resolved:x},e=>globalThis.__queuedWriteOutcome={rejected:e.message});return {requested:true};})()',caller.toolId);
  let requests;
  for(let i=0;i<40;i++){requests=await evaluate(client,'__queuedRequests',caller.id);if(requests.length)break;await pause(50);}
  assert.equal(requests.length,1);assert.equal(requests[0].fromActualFrame,true);
  const locks=await evaluate(client,'navigator.locks.query()',owner.id);
  assert(locks.held.some(l=>l.name===lock)&&locks.pending.some(l=>l.name===lock));
  assert.equal((await storage())[namespace]['queued-uninstall'],undefined);
  const receipt={status:'ARMED_REAL_PENDING_REQUEST',owner:{host:owner.host,window:owner.window},caller:{host:caller.host,window:caller.window,tool:caller.tool},before:afterSpoof,requests,locks,method:'Real browser lock contention forces public SDK request to queue before native uninstall; does not simulate an already-committing chrome.storage.set.'};
  await save('queued-uninstall-arm',receipt);console.log(JSON.stringify({status:receipt.status,ownerWindow:owner.window.id,callerWindow:caller.window.id}));
 }else if(mode==='release'){
  const arm=JSON.parse(await readFile(path.join(directory,'queued-uninstall-arm.json'),'utf8'));
  const ownerId=await attach(arm.owner.host),callerId=await attach(arm.caller.host);
  const clicked=await evaluate(client,'({clicks:__queuedNativeClicks,frameCount:document.querySelectorAll("#sidebar-tool-frame iframe").length,locks:null})',callerId);
  assert.equal(clicked.clicks.length,1);assert.equal(clicked.clicks[0].isTrusted,true);assert.equal(clicked.frameCount,0,'Native-confirmed uninstall must close its frame before waiting');
  const pending=await evaluate(client,'navigator.locks.query()',ownerId);
  assert(pending.pending.filter(l=>l.name===lock).length>=2,'Both actual write and uninstall waiting on real lock');
  await evaluate(client,'__acceptanceReleaseLock();({released:true})',ownerId);
  let after;
  for(let i=0;i<80;i++){after=await storage();if(!after[catalog]?.some(t=>t.id==='quick-notes')&&!Object.hasOwn(after,namespace))break;await pause(50);}
  assert(!after[catalog]?.some(t=>t.id==='quick-notes'));assert(!Object.hasOwn(after,namespace));
  const nonOwnedKeys=new Set([...Object.keys(arm.before),...Object.keys(after)].filter(k=>k!==namespace&&k!==catalog));
  for(const key of nonOwnedKeys)assert.deepEqual(after[key],arm.before[key]);
  const finalFrames=[];
  for(const host of [arm.owner.host,arm.caller.host])finalFrames.push({host,count:await evaluate(client,'document.querySelectorAll("#sidebar-tool-frame iframe").length',await attach(host))});
  assert(finalFrames.every(p=>p.count===0));
  await save('queued-uninstall-verdict',{status:'NATIVE_PASS',clicked,pending,after,finalFrames,scope:'Real two-panel queued SDK write / native-confirmed uninstall: namespace remains deleted and both frames retire. In-flight already-committing Chrome I/O race not claimed.'});
  console.log(JSON.stringify({status:'NATIVE_PASS',namespaceDeleted:true,frames:finalFrames}));
 }else throw Error('Use arm | release');
}catch(error){await save('queued-uninstall-failed-'+Date.now(),{status:'FAILED',mode,error:String(error)});throw error;}
finally{client.close();}

