import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {attachTaskAcceptancePort} from '../../src/development/task-acceptance-port.js';
import {ACCEPTANCE_INSTALL,ACCEPTANCE_PROTOCOL} from '../../src/development/task-acceptance-session.js';
import {createTaskAcceptanceStorage} from '../../src/development/task-acceptance-storage.js';
import {createRunAuthority} from '../../src/platform/host/authority.js';
import {CONTRACT_VERSION,CONTRACT_HASH} from '../../src/platform/protocol.js';
import {installedKey,taskKey,taskScriptId,scriptStorageKey} from '../../src/platform/tasks/contract.js';
import {fakeBuiltinSource} from './builtin-support.mjs';

const event=()=>{
  const listeners=new Set();
  return {addListener:fn=>listeners.add(fn),get size(){return listeners.size;},
    emit:(...args)=>{for(const fn of listeners)fn(...args);}};
};
async function fixture(t,nativeWindowId=-1,implementation={attachTaskAcceptancePort,createRunAuthority}){
  const storage=createTaskAcceptanceStorage();
  const runtime={id:'extension',getURL:path=>'chrome-extension://extension/'+path,onConnect:event()};
  const hostInstanceId=crypto.randomUUID(),url=runtime.getURL('sidepanel.html?hostInstanceId='+hostInstanceId);
  const sender={id:runtime.id,url,documentId:'native-doc',frameId:0,documentLifecycle:'active'};
  const state={rows:[{contextType:'SIDE_PANEL',contextId:'native-context',documentId:sender.documentId,
    documentUrl:url,windowId:nativeWindowId,frameId:0,incognito:false,documentLifecycle:'active'}],
    window:{id:7,incognito:false},assertions:[],windowReads:[],permissionReads:0,disconnected:false};
  runtime.getContexts=async query=>{
    assert.deepEqual(query,{contextTypes:['SIDE_PANEL'],documentUrls:[sender.url]});
    await state.onContextRead?.();
    return structuredClone(state.rows);
  };
  const api={runtime,windows:{get:async id=>{
    state.windowReads.push(id);assert.ok(state.assertions.length>0,'window proof must follow real Authority');
    state.onWindowRead?.();
    if(state.windowError)throw Error('Window closed');return structuredClone(state.window);
  }},permissions:{contains:async()=>{state.permissionReads++;return true;}}};
  const authority=implementation.createRunAuthority({storage,api,session:'live-session',cloudFactory:null});
  const registration=await authority.registerHost({hostInstanceId,claimedContractVersion:CONTRACT_VERSION,
    claimedContractHash:CONTRACT_HASH},sender);
  const pkg=JSON.parse(await readFile(new URL('../../task-packs/baidu.search/releases/baidu.search.top3.1.1.5.opendesk-task.json',import.meta.url),'utf8'));
  const {taskId,version,installationId,generation,manifestHash,sourceHash}=ACCEPTANCE_INSTALL;
  const namespace='tool:extension',scriptId=taskScriptId(taskId,version);
  const {abi,sha256:bundleSha256,catalogSha256}=fakeBuiltinSource;
  const builtinIdentity={abi,bundleSha256,catalogSha256};
  await storage.transaction(['frameworkKV','scriptHeads','scriptRevisions'],'readwrite',async tx=>{
    await tx.put('frameworkKV',{tag:'task-installed-v1',namespace,taskId,version,scriptId,manifestHash,builtinIdentity,
      enabled:true,authorization:{tag:'task-install-authorization-v1',installationId,generation,
        scope:{capabilities:pkg.manifest.permissions,siteOrigins:pkg.manifest.siteOrigins,networkOrigins:[]}}},installedKey(namespace,taskId));
    await tx.put('frameworkKV',{tag:'task-candidate-v1',namespace,taskId,version,package:pkg,stage:'available',builtinIdentity,
      verification:{manifestHash,sourceHash,builtinIdentity,builtinAbi:abi,origin:pkg.manifest.siteOrigins[0]}},taskKey(namespace,taskId,version));
    await tx.put('scriptHeads',{tag:'script-head',namespace,scriptId,revision:1,contentHash:sourceHash},scriptStorageKey(namespace,scriptId));
    await tx.put('scriptRevisions',{tag:'script-revision',namespace,scriptId,revision:1,contentHash:sourceHash,
      sourceUtf8:pkg.sourceUtf8,builtinIdentity},scriptStorageKey(namespace,scriptId,1));
  });
  const development={held:false,appliedRevision:'a'.repeat(64)};
  implementation.attachTaskAcceptancePort({api,development,foundation:Promise.resolve({storage,authority:{
    async assertHost(actual,id){
      state.assertions.push({actual,id});const host=await authority.assertHost(actual,id);
      state.afterAuthority?.();return host;
    }
  }})});
  const waiters=new Map(),replies=[];
  const port={name:ACCEPTANCE_PROTOCOL,sender,onMessage:event(),onDisconnect:event(),
    postMessage(reply){replies.push(reply);waiters.get(reply.id)?.(reply);waiters.delete(reply.id);},
    disconnect(){state.disconnected=true;port.onDisconnect.emit();}};
  runtime.onConnect.emit(port);
  let id=0;
  function send(type,payload){
    return new Promise(resolve=>{const next=++id;waiters.set(next,resolve);port.onMessage.emit({id:next,type,payload});});
  }
  const payload={hostInstanceId,registrationId:registration.registrationId,revision:development.appliedRevision,
    windowProof:{windowId:7,contextId:'native-context',documentId:sender.documentId}};
  t.after(()=>{port.disconnect();storage.close();});
  return {api,state,port,payload,development,send,replies,open:()=>send('open',payload)};
}
async function assertFenced(f){
  const before=f.state.permissionReads;
  const reply=await f.send('permission',{origins:['https://www.baidu.com/*']});
  assert.equal(reply.ok,false);
  assert.equal(f.state.permissionReads,before,'closed port must not dispatch even permission checks');
  const run=await f.send('request',{method:'startControllerRun',args:{requestId:crypto.randomUUID()}});
  assert.equal(run.ok,false);assert.equal(run.error.code,'E_DEV_RELOADING');
  assert.equal(f.state.disconnected,true);
  assert.ok(!f.auditEvents?.some(event=>['runhost-admission','runhost-dispatched'].includes(event.type)));
}

test('development-defined port constructs, opens and inspects without network or Native APIs',async t=>{
  const {build}=await import('esbuild');
  const directory=await mkdtemp(join(tmpdir(),'opendesk-acceptance-port-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const compiled=await build({stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),contents:`
    export {attachTaskAcceptancePort} from './src/development/task-acceptance-port.js';
    export {createRunAuthority} from './src/platform/host/authority.js';
    export {createIsolatedHttpTransport} from './src/platform/chrome/network-transport.js';
  `},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent',
    define:{'import.meta.env.MODE':'"development"'}});
  const entry=join(directory,'port.mjs');
  await writeFile(entry,compiled.outputFiles[0].text);
  const implementation=await import(pathToFileURL(entry).href);
  // Positive control: the development-only transport is enabled in this same
  // bundle. Its construction requires onConnect, which the offline target lacks.
  assert.throws(()=>implementation.createIsolatedHttpTransport({api:{runtime:{getURL:path=>'chrome-extension://extension/'+path}}}),TypeError);
  const f=await fixture(t,-1,implementation);
  assert.deepEqual(Object.keys(f.api).sort(),['permissions','runtime','windows']);
  assert.equal(f.api.tabs,undefined);assert.equal(f.api.declarativeNetRequest,undefined);
  assert.equal(f.api.runtime.connectNative,undefined);
  assert.equal(f.api.runtime.onConnect.size,1,'only the acceptance port may register a listener');
  const opened=await f.open();assert.equal(opened.ok,true,JSON.stringify(opened));
  assert.deepEqual(f.state.assertions,[{actual:f.port.sender,id:f.payload.registrationId}]);
  assert.equal(opened.data.identity.windowSource,'trusted-host-window');
  assert.equal(opened.data.identity.nativeContextWindowId,-1);
  const inspected=await f.send('inspect');assert.equal(inspected.ok,true,JSON.stringify(inspected));
  assert.deepEqual(inspected.data.identity,opened.data.identity);
  assert.deepEqual(inspected.data.installation,{
    installationId:ACCEPTANCE_INSTALL.installationId,generation:ACCEPTANCE_INSTALL.generation,
    version:ACCEPTANCE_INSTALL.version,manifestHash:ACCEPTANCE_INSTALL.manifestHash});
  assert.equal(inspected.data.activeRunId,null);
  assert.deepEqual(inspected.data.runs,[]);assert.deepEqual(inspected.data.results,[]);
  assert.equal(f.api.runtime.onConnect.size,1);assert.equal(f.state.disconnected,false);
});

for(const [nativeWindowId,windowId] of [[-1,7],[7,7],[-1,0],[0,0]])test('real port and Authority bind native window '+nativeWindowId+' to '+windowId,async t=>{
  const f=await fixture(t,nativeWindowId);
  f.payload.windowProof.windowId=windowId;f.state.window.id=windowId;
  const reply=await f.open();
  assert.equal(reply.ok,true,JSON.stringify(reply));
  assert.deepEqual(f.state.assertions,[{actual:f.port.sender,id:f.payload.registrationId}]);
  assert.deepEqual({...f.payload.windowProof},Object.fromEntries(Object.keys(f.payload.windowProof).map(key=>[key,reply.data.identity[key]])));
  assert.equal(reply.data.identity.nativeContextWindowId,nativeWindowId);
  assert.equal(reply.data.identity.windowSource,nativeWindowId===-1?'trusted-host-window':'native-context');
  assert.equal(reply.data.page.windowId,windowId);
  assert.ok(reply.data.registration.registrationId);
  assert.equal((await f.send('request',{method:'listPagePrograms'})).ok,true);
  const inspection=await f.send('inspect');
  assert.equal(inspection.ok,true);assert.equal(inspection.data.activeRunId,null);
  assert.deepEqual(inspection.data.runs,[]);assert.deepEqual(inspection.data.results,[]);
  assert.deepEqual(f.state.windowReads,[windowId,windowId,windowId,windowId]);
});

const rejectedOpen=[
  ['missing proof',f=>{delete f.payload.windowProof;}],
  ['invalid negative context',f=>{f.state.rows[0].windowId=-2;},false],
  ['native positive conflict',f=>{f.state.rows[0].windowId=8;}],
  ['negative window proof',f=>{f.payload.windowProof.windowId=-1;}],
  ['unsafe window proof',f=>{f.payload.windowProof.windowId=Number.MAX_SAFE_INTEGER+1;}],
  ['wrong proof context',f=>{f.payload.windowProof.contextId='other';}],
  ['wrong proof document',f=>{f.payload.windowProof.documentId='other';}],
  ['window closed',f=>{f.state.windowError=true;}],
  ['window incognito',f=>{f.state.window.incognito=true;}],
  ['window wrong returned id',f=>{f.state.window.id=8;}],
  ['window privacy unknown',f=>{delete f.state.window.incognito;}],
  ['wrong sender',f=>{f.port.sender.id='other';},false],
  ['wrong sender document',f=>{f.port.sender.documentId='other';},false],
  ['sender child frame',f=>{f.port.sender.frameId=1;},false],
  ['sender inactive',f=>{f.port.sender.documentLifecycle='cached';},false],
  ['sender tab',f=>{f.port.sender.tab={id:1};},false],
  ['locator route',f=>{f.port.sender.url+='&toolId=demo-tool';},false],
  ['duplicate context',f=>{f.state.rows.push({...f.state.rows[0],contextId:'duplicate'});},false],
  ['missing context id',f=>{delete f.state.rows[0].contextId;},false],
  ['context inactive',f=>{f.state.rows[0].documentLifecycle='cached';},false],
  ['context private',f=>{f.state.rows[0].incognito=true;},false],
  ['context child frame',f=>{f.state.rows[0].frameId=1;},false],
  ['context wrong route',f=>{f.state.rows[0].documentUrl+='&toolId=demo-tool';},false],
  ['context wrong document',f=>{f.state.rows[0].documentId='other';},false],
  ['registration failure',f=>{f.payload.registrationId='not-registered';}],
  ['revision mismatch',f=>{f.payload.revision='b'.repeat(64);},false],
];
for(const [name,mutate,reachesAuthority=true] of rejectedOpen)test('open rejects '+name,async t=>{
  const f=await fixture(t);mutate(f);
  const reply=await f.open();assert.equal(reply.ok,false,JSON.stringify(reply));
  assert.equal(f.state.assertions.length,reachesAuthority?1:0);
  assert.equal(f.state.permissionReads,0);
  if(name==='registration failure')assert.deepEqual(f.state.windowReads,[]);
  await assertFenced(f);
});

for(const [name,mutate] of [
  ['context id',f=>{f.state.rows[0].contextId='new-context';}],
  ['document id',f=>{f.state.rows[0].documentId='new-doc';}],
  ['native window',f=>{f.state.rows[0].windowId=8;}],
  ['native metadata source',f=>{f.state.rows[0].windowId=7;}],
  ['missing context',f=>{f.state.rows=[];}],
  ['duplicate context',f=>{f.state.rows.push({...f.state.rows[0]});}],
  ['window closed',f=>{f.state.windowError=true;}],
  ['window incognito',f=>{f.state.window.incognito=true;}],
  ['window returned id',f=>{f.state.window.id=8;}],
  ['revision',f=>{f.development.appliedRevision='b'.repeat(64);}],
  ['revision missing',f=>{f.development.appliedRevision='';}],
  ['reload held',f=>{f.development.held=true;}],
  ['revision during window lookup',f=>{f.state.onWindowRead=()=>{f.development.appliedRevision='b'.repeat(64);};}],
])test('every later request fences '+name+' drift before dispatch',async t=>{
  const f=await fixture(t);assert.equal((await f.open()).ok,true);
  f.auditEvents=(await f.send('inspect')).data.events;
  mutate(f);
  const reply=await f.send('request',{method:'startControllerRun',args:{requestId:crypto.randomUUID()}});
  assert.equal(reply.ok,false);await assertFenced(f);
});

test('open rechecks the native document after asynchronous Authority and setup',async t=>{
  const f=await fixture(t);
  f.state.afterAuthority=()=>{f.state.rows[0].contextId='replacement-context';};
  const reply=await f.open();assert.equal(reply.ok,false);
  assert.equal(f.state.assertions.length,1);await assertFenced(f);
});

test('missing sender document is resolved only from the unique native context',async t=>{
  const f=await fixture(t);delete f.port.sender.documentId;
  const reply=await f.open();assert.equal(reply.ok,true,JSON.stringify(reply));
  assert.equal(f.state.assertions[0].actual.documentId,'native-doc');
  assert.equal(reply.data.identity.documentId,'native-doc');
});

test('held during a pending native context read closes the live scope permanently',async t=>{
  const f=await fixture(t);assert.equal((await f.open()).ok,true);
  f.auditEvents=(await f.send('inspect')).data.events;
  let entered,release;
  const reading=new Promise(resolve=>{entered=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  f.state.onContextRead=async()=>{entered();await gate;};
  t.after(()=>release());
  const reads=f.state.windowReads.length;
  const request=f.send('request',{method:'startControllerRun',args:{requestId:crypto.randomUUID()}});
  await reading;
  f.development.held=true;release();
  const reply=await request;
  assert.equal(reply.ok,false);assert.equal(reply.error.code,'E_HOST_CLOSED');
  assert.equal(f.state.disconnected,true,'observe failure must close and disconnect immediately');
  assert.equal(f.state.windowReads.length,reads,'held must fence before any window lookup or dispatch');
  f.development.held=false;
  await assertFenced(f);
});
