import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createDependencyManager} from '../../src/scripting/user-scripts/dependency-manager.js';
import {createInstalledPagePrograms,PAGE_BOOT_PROTOCOL,PAGE_BOOT_WORLD} from '../../src/scripting/user-scripts/installed-programs.js';
import {createPageScriptPreview} from '../../src/scripting/user-scripts/preview.js';
import {PAGE_WORLD_CSP} from '../../src/scripting/user-scripts/execution-source.js';
import {wrapPageFrameSource} from '../../src/scripting/user-scripts/page-frame-resources.js';
import {createPreviewWorlds} from '../../src/scripting/user-scripts/preview-worlds.js';
import {createPreviewAdmission} from '../../src/platform/host/preview-admission.js';
import {createManagedUIPreview} from '../../src/native-agent/managed-preview.js';
import {fakeBuiltinSource} from './builtin-support.mjs';

// Node protocol/DOM doubles, never Chrome or approved child-frame evidence.
class Element extends EventTarget {
  constructor(doc){super();this.ownerDocument=doc;this.parentNode=null;this.children=[];this.style={};this.attrs={};}
  get isConnected(){return this===this.ownerDocument.documentElement||!!this.parentNode?.isConnected;}
  append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);}}
  appendChild(node){this.append(node);return node;}
  insertBefore(node,ref){node.remove();node.parentNode=this;const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,node);}
  remove(){if(this.parentNode){const nodes=this.parentNode.children;nodes.splice(nodes.indexOf(this),1);this.parentNode=null;}}
  setAttribute(key,value){this.attrs[key]=value;}
  getAttribute(key){return this.attrs[key]??null;}
  attachShadow(){const root=new Element(this.ownerDocument);root.parentNode=this;return root;}
}
function documentDouble(){
  const doc={defaultView:new EventTarget()};
  Object.assign(doc.defaultView,{setTimeout,clearTimeout,setInterval,clearInterval});
  doc.createElement=()=>new Element(doc);
  doc.documentElement=new Element(doc);doc.body=new Element(doc);doc.documentElement.append(doc.body);
  doc.querySelectorAll=()=>{const nodes=[];const visit=node=>{if(node.attrs['data-opendesk-ui-owner'])nodes.push(node);node.children.forEach(visit);};visit(doc.documentElement);return nodes;};
  return doc;
}
const uiSource=['page-ui-mount','page-program-rules','page-ui'].map(name=>readFileSync('src/scripting/user-scripts/'+name+'.js','utf8')
  .replace(/^import .*\n/gm,'').replaceAll('export ','')).join('\n');
const source=(body='return 42;')=>'// ==UserScript==\n// @match https://example.com/*\n// @noframes\n// @run-at document-idle\n// ==/UserScript==\n'+uiSource+
  '\nasync function main(){var ui=createPageUI({id:"installed"});var child=document.createElement("iframe");ui.content.append(child);ui.onDispose(()=>{globalThis.disposals=(globalThis.disposals||0)+1;child.remove();});globalThis.ui=ui;'+body+'}';
function fixture(){
  let db=new Map(['frameworkKV','runs','commandJournal'].map(name=>[name,new Map()])),queue=Promise.resolve();
  const host={tag:'host',namespace:'tool:test',registrationId:'host',active:true,revoked:false,hostDocumentId:'host-doc',hostInstanceId:'instance',browserSessionIncarnation:'session',hostUrl:'chrome-extension://test/sidepanel.html'};
  db.get('commandJournal').set('host:host',host);
  const storage={transaction(stores,mode,work){const next=queue.then(async()=>{
    const copy=structuredClone(db),table=name=>{assert.ok(stores.includes(name));return copy.get(name);};
    const result=await work({get:async(name,key)=>structuredClone(table(name).get(key)),all:async name=>structuredClone([...table(name).values()]),
      put:async(name,value,key)=>{assert.equal(mode,'readwrite');table(name).set(key,structuredClone(value));},
      delete:async(name,key)=>{assert.equal(mode,'readwrite');table(name).delete(key);}});
    if(mode==='readwrite')db=copy;return result;
  });queue=next.catch(()=>{});return next;}};
  const doc=documentDouble(),contexts=new Map(),session={},native=new Map();
  const target={tabId:1,frameId:0,documentId:'document-one',expectedUrl:'https://example.com/demo',expectedWindowId:1};
  const f={doc,target,permission:true,gone:false,cached:false,observationError:false,cleanupReplies:reply=>reply,calls:[],worldConfigurations:[],frameQueries:[],storage};
  f.tamper=change=>{const rows=Object.values(session).flat().filter(row=>row.installed);change(rows[0]);};
  f.loseSession=()=>{for(const key of Object.keys(session))delete session[key];};
  const api={runtime:{id:'test'},storage:{session:{get:async key=>({[key]:structuredClone(session[key])}),set:async value=>Object.assign(session,structuredClone(value))}},
    permissions:{contains:async()=>f.permission},tabs:{get:async()=>({id:1,windowId:1,active:true,status:'complete',url:target.expectedUrl}),query:async()=>[{id:1}]},
    webNavigation:{getAllFrames:async()=>[{...target,url:target.expectedUrl}],getFrame:async details=>{
      f.frameQueries.push(details);const {documentId}=details;assert.equal(documentId,target.documentId);
      assert.deepEqual(details,Object.hasOwn(details,'tabId')?{tabId:1,frameId:0,documentId}:{documentId});
      if(f.observationError)throw Error('cannot observe');
      if(f.gone||f.frameMismatch&&Object.hasOwn(details,'tabId'))return null;
      // Chromium getFrame result has neither tabId nor frameId.
      return {documentId,url:target.expectedUrl,errorOccurred:false,parentFrameId:-1,frameType:'outermost_frame',documentLifecycle:f.cached?'cached':'active'};}},
    userScripts:{getScripts:async filter=>structuredClone([...native.values()].filter(row=>!filter||filter.ids.includes(row.id))),
      register:async rows=>rows.forEach(row=>native.set(row.id,structuredClone(row))),unregister:async({ids})=>ids.forEach(id=>native.delete(id)),
      configureWorld:async config=>{f.worldConfigurations.push(config);},getWorldConfigurations:async()=>[],resetWorldConfiguration:async()=>{},execute:async request=>{
        f.calls.push(request);
        if(request.worldId===PAGE_BOOT_WORLD)return [{frameId:0,documentId:target.documentId,result:f.installation().token}];
        const id=request.worldId||'default';if(!contexts.has(id))contexts.set(id,vm.createContext({document:doc,window:doc.defaultView,Event,setTimeout,clearTimeout,console:{error(){}}}));
        const code=request.js.at(-1).code,result=await vm.runInContext(code,contexts.get(id));
        const replies=[{frameId:0,documentId:target.documentId,result:JSON.parse(JSON.stringify(result))}];
        return code.includes('return r.retire(')?f.cleanupReplies(replies):replies;
      }}};
  const assertHost=async()=>host,dependencies=createDependencyManager({api,storage,assertHost,loadBuiltin:async()=>fakeBuiltinSource});
  const make=()=>{
    const admission=createPreviewAdmission({storage,assertHost,currentHost:async()=>{},session:'session'});
    f.executor=createPageScriptPreview({api,storage,assertHost,dependencies,admission,managedFactory:createManagedUIPreview,loadBuiltin:async()=>fakeBuiltinSource});
    const preview={...f.executor,preview:async (input,...args)=>f.realVerification?f.executor.preview(input,...args):({state:'preview-evaluated',world:'USER_SCRIPT',sourceHash:f.rows().find(row=>row.sourceUtf8===input.sourceUtf8).manifest.sourceHash,
      documentId:target.documentId,builtinAbi:fakeBuiltinSource.abi,builtinCatalogSha256:fakeBuiltinSource.catalogSha256,builtinBundleSha256:fakeBuiltinSource.sha256})};
    f.service=createInstalledPagePrograms({api,storage,assertHost,dependencies,preview,admission,session:'session',loadBuiltin:async()=>fakeBuiltinSource});
  };
  f.rows=()=>[...db.get('frameworkKV').values()];f.installation=()=>f.rows().find(row=>row.tag==='page-installed-v1');
  f.records=()=>Object.values(session).flat().filter(row=>row.installed);
  f.previewRecords=()=>Object.values(session).flat().filter(row=>row.managed);
  f.context=()=>contexts.get(f.records()[0]?.worldId)||[...contexts.values()].at(-1);
  f.restart=make;make();
  f.install=async(body,revision=1,sourceUtf8=source(body))=>{
    const candidate=await dependencies.importPageCandidate({programId:'script',revision,entryFormat:'async-main',lockId:null,importSourceUrl:null,sourceUtf8},{});
    await f.service.verifyPageCandidate({programId:'script',revision,target},{});
    await f.service.makePageAvailable({programId:'script',revision,manifestHash:candidate.manifestHash},{});
    const previous=f.installation();
    return f.service.installPageProgram({programId:'script',revision,manifestHash:candidate.manifestHash,
      expectedInstalledManifestHash:previous?.manifestHash??null,...(previous?{expectedGeneration:previous.authorization.generation}:{})},{});
  };
  f.boot=()=>{const row=f.installation();return f.service.handleBoot({protocol:PAGE_BOOT_PROTOCOL,nativeId:row.nativeId,token:row.token},
    {id:'test',documentId:target.documentId,frameId:0,url:target.expectedUrl,tab:{id:1}});};
  f.disable=()=>{const row=f.installation();return f.service.setInstalledPageEnabled({programId:'script',manifestHash:row.manifestHash,installationId:row.authorization.installationId,enabled:false,expectedGeneration:row.authorization.generation},{});};
  f.uninstall=()=>{const row=f.installation();return f.service.uninstallPageProgram({programId:'script',manifestHash:row.manifestHash,expectedGeneration:row.authorization.generation},{});};
  f.dispose=()=>{for(const context of contexts.values())vm.runInContext('globalThis.ui?.destroy()',context);};
  return f;
}
test('frozen frame verification uses the real managed lifecycle and retires it before installation',async t=>{
  const f=fixture();t.after(f.dispose);f.realVerification=true;
  const sourceUtf8=await wrapPageFrameSource(source(),[{resourceId:'fixed.renderer',code:'globalThis.resourceReady=true;'}]);
  await f.executor.preview({sourceUtf8,entryFormat:'async-main',lockId:null,target:f.target,
    managedUI:{previewId:crypto.randomUUID(),bindingId:'browser-v1-'+'a'.repeat(24),enabled:true}},{});
  await f.install(undefined,1,sourceUtf8);
  assert.equal(f.installation().nativeState,'registered');
  const worlds=f.previewRecords();
  assert.equal(worlds.length,2);
  assert.ok(worlds.every(row=>row.managed.state==='retired'),'old preview and verification must both retire');
  assert.equal(f.doc.querySelectorAll().length,0,'verification must leave no managed UI');
  await f.boot();
  assert.equal(f.rows().find(row=>row.tag==='page-execution-v1').state,'completed');
});
test('installed frozen frame resources enable parent messaging and bind the bootstrap to the fixed execution',async t=>{
  const f=fixture();t.after(f.dispose);
  const resourceId='mindmap.renderer';
  const sourceUtf8=await wrapPageFrameSource(source(),[{resourceId,code:'globalThis.frameResourceRan=true;'}]);
  await f.install(undefined,1,sourceUtf8);
  await f.boot();
  const execution=f.rows().find(row=>row.tag==='page-execution-v1');
  assert.equal(execution.state,'completed','installed prepare and native execution must complete');
  const {worldId}=execution.managedUI;
  assert.deepEqual(f.worldConfigurations.filter(config=>config.worldId===worldId&&config.messaging===true),
    [{worldId,csp:PAGE_WORLD_CSP,messaging:true}]);
  const request=f.calls.filter(call=>call.worldId===worldId).at(-1);
  assert.ok(request,'the prepared parent world must reach native execution');
  const binding=request.js[0].code.match(/\)\((\{"executionKey":[^\n]*?"resourceIds":\[[^\n]*?\]\})\);/);
  assert.ok(binding,'installed bootstrap must contain the frozen frame binding');
  assert.deepEqual(JSON.parse(binding[1]),{executionKey:execution.executionKey,
    receiptNonce:execution.receiptNonce,resourceIds:[resourceId]},
  'bootstrap must bind the installed execution, receipt nonce and exact frozen resource IDs');
  assert.equal(vm.runInContext('typeof __opendeskPageFramesV1.create',f.context()),'function');
  assert.equal(vm.runInContext('typeof frameResourceRan',f.context()),'undefined',
    'frozen child code must not execute in the parent world');
});
test('allocating a child preserves live installed parent messaging while resetting stale world configurations',async()=>{
  const parentWorld='opendesk-preview-d1-live-parent',retiredWorld='opendesk-preview-d1-retired';
  const staleWorld='opendesk-preview-d1-orphan';
  const parentConfig={worldId:parentWorld,csp:PAGE_WORLD_CSP,messaging:true};
  const configurations=new Map([parentConfig,{worldId:retiredWorld},{worldId:staleWorld}].map(row=>[row.worldId,row]));
  const session={opendeskPagePreviewWorldsD1:[
    {tabId:1,documentId:'parent-document',worldId:parentWorld,installed:{state:'evaluated'}},
    {tabId:1,documentId:'old-document',worldId:retiredWorld,installed:{state:'retired'}}
  ]};
  const resets=[],probes=[],contexts=new Map();
  const child={tabId:1,frameId:7,documentId:'child-document'};
  const native={
    getWorldConfigurations:async()=>structuredClone([...configurations.values()]),
    configureWorld:async config=>{configurations.set(config.worldId,structuredClone(config));},
    resetWorldConfiguration:async worldId=>{resets.push(worldId);configurations.delete(worldId);},
    execute:async request=>{
      assert.deepEqual(request.target,{tabId:child.tabId,documentIds:[child.documentId]});
      assert.equal(request.injectImmediately,true,'child isolation probes must bypass document_idle');
      probes.push(request);
      const world=request.worldId??'default';
      if(!contexts.has(world))contexts.set(world,vm.createContext({}));
      return [{frameId:child.frameId,documentId:child.documentId,
        result:vm.runInContext(request.js[0].code,contexts.get(world))}];
    }
  };
  const api={userScripts:native,storage:{session:{
    get:async key=>({[key]:structuredClone(session[key])}),
    set:async value=>Object.assign(session,structuredClone(value))
  }}};
  const childWorld=await createPreviewWorlds({api}).allocate(native,child);
  assert.deepEqual(resets,[retiredWorld,staleWorld]);
  assert.deepEqual(configurations.get(parentWorld),parentConfig,
    'child allocation must retain the original parent messaging channel for destroy/retirement');
  assert.deepEqual(configurations.get(childWorld),{worldId:childWorld,csp:PAGE_WORLD_CSP,messaging:false});
  assert.equal(probes.length,3,'real default-world persistence and child isolation probes must complete');
});
test('installed disable invokes actual managed disposers and binds original execution and resource hashes',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();assert.equal(f.doc.querySelectorAll().length,1);
  const before=f.installation(),result=await f.disable();
  assert.equal(f.doc.querySelectorAll().length,0,'disable must retire the live UI, not only unregister future boots');
  assert.equal(vm.runInContext('disposals',f.context()),1);
  assert.equal(result.managedCleanup.state,'retired');
  const record=f.records()[0].installed,execution=f.rows().find(row=>row.tag==='page-execution-v1');
  for(const key of ['programId','revision','sourceHash','manifestHash','installationId','grantGeneration','executionKey','receiptNonce'])
    assert.equal(record[key],execution[key]);
  assert.equal(record.installationId,before.authorization.installationId);assert.match(record.compiledSha256,/^[a-f0-9]{64}$/);
  assert.equal(record.receipt.scope,'managed-ui-only');
  assert.ok(f.frameQueries.some(query=>query.tabId===1&&query.frameId===0&&query.documentId===f.target.documentId));
});
test('permission revocation and worker recreation retire existing UI without re-running source',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();f.restart();
  await f.service.revokePermissions({origins:['https://example.com/*']});
  assert.equal(f.doc.querySelectorAll().length,0);assert.equal(vm.runInContext('disposals',f.context()),1);
  assert.equal(f.installation().managedCleanup.state,'retired');
});
test('missing cleanup receipt stays unknown and is never replayed by uninstall or reconciliation',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();f.cleanupReplies=()=>[];
  const result=await f.disable();assert.equal(result.managedCleanup.state,'unknown');
  const count=f.calls.length;await f.service.reconcile();await f.uninstall();
  assert.equal(f.calls.length,count);assert.equal(vm.runInContext('disposals',f.context()),1);
});
test('uncertain cleanup observes exact document death without dispatching again',async t=>{
  for(const cause of ['missing-receipt','cached','failed']){
    const f=fixture();t.after(f.dispose);
    await f.install(cause==='failed'?'ui.onDispose(()=>Promise.reject(new Error("CLOSE_FAILED")));return 42;':undefined);
    await f.boot();
    if(cause==='missing-receipt')f.cleanupReplies=()=>[];
    if(cause==='cached')f.cached=true;
    assert.equal((await f.disable()).managedCleanup.state,'unknown');
    const dispatches=f.calls.length,queries=f.frameQueries.length;
    await f.service.reconcile();
    assert.equal(f.calls.length,dispatches);
    assert.ok(f.frameQueries.length>queries,'uncertain records must still observe the original document');
    assert.notEqual(f.records()[0].installed.state,'retired');
    f.gone=true;
    await f.service.reconcile();
    assert.equal(f.records()[0].installed.state,'retired');
    assert.equal(f.records()[0].installed.contextGone,true);
    assert.equal(f.calls.length,dispatches,'document death must not replay cleanup');
  }
});
test('uninstall reports managed cleanup without claiming rollback of arbitrary script effects',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();const result=await f.uninstall();
  assert.equal(result.uninstalled,true);assert.equal(result.managedCleanup.state,'retired');
  assert.equal(result.livePagesNeedRefresh,true);assert.equal(f.doc.querySelectorAll().length,0);
});
test('only trusted exact document absence closes a record; cached or unobservable documents stay unknown',async t=>{
  for(const kind of ['gone','cached','observationError']){
    const f=fixture();t.after(f.dispose);await f.install();await f.boot();f[kind]=true;
    const count=f.calls.length,result=await f.disable();
    assert.equal(result.managedCleanup.state,kind==='gone'?'retired':'unknown');assert.equal(f.calls.length,count);
  }
});
test('late main cannot mount new UI after disable and never restores old grant success',async t=>{
  const f=fixture();t.after(f.dispose);await f.install('await new Promise(r=>globalThis.finishMain=r);createPageUI({id:"late"});');
  const running=f.boot();const rejected=assert.rejects(running,error=>['E_PERMISSION','E_PAGE_SCRIPT_EXECUTION'].includes(error.code));
  for(let n=0;n<100&&!f.doc.querySelectorAll().length;n++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.doc.querySelectorAll().length,1);await f.disable();
  assert.equal(f.doc.querySelectorAll().length,0);vm.runInContext('finishMain()',f.context());await rejected;
  assert.equal(f.doc.querySelectorAll().length,0);
});
test('forged world, code or execution identity cannot select a cleanup target',async t=>{
  for(const change of [r=>r.worldId+='-forged',r=>r.installed.compiledSha256='0'.repeat(64),
    r=>r.installed.sourceHash='0'.repeat(64),r=>r.installed.executionKey+='-forged',
    r=>r.installed.revision++,r=>r.installed.target.documentId='other-document',
    r=>r.installed.installationId='other-install',r=>r.installed.grantGeneration+=100]){
    const f=fixture();t.after(f.dispose);await f.install();await f.boot();f.tamper(change);
    const count=f.calls.length,result=await f.disable();
    assert.equal(result.managedCleanup.state,'unknown');assert.equal(f.calls.length,count);
    assert.equal(f.doc.querySelectorAll().length,1,'identity mismatch cannot dispose a different world');
  }
});
test('wrong document and lifecycle receipt identities retain a tombstone without a retry',async t=>{
  for(const change of [r=>r[0].documentId='other-document',r=>r[0].frameId=2,
    r=>r[0].result.nonce='other-nonce',r=>r[0].result.requestNonce='other-request',r=>r[0].result.instances=-1]){
    const f=fixture();t.after(f.dispose);await f.install();await f.boot();
    f.cleanupReplies=rows=>{change(rows);return rows;};const result=await f.disable();
    assert.equal(result.managedCleanup.state,'unknown');const count=f.calls.length;
    await f.service.reconcile();assert.equal(f.calls.length,count);
  }
});
test('an asynchronous cleanup failure is retained even though the UI was removed',async t=>{
  const f=fixture();t.after(f.dispose);await f.install('ui.onDispose(()=>Promise.reject(new Error("CLOSE_FAILED")));return 42;');await f.boot();
  const result=await f.disable();assert.equal(result.managedCleanup.state,'unknown');assert.equal(f.doc.querySelectorAll().length,0);
  assert.equal(f.records()[0].installed.state,'failed');assert.match(f.records()[0].installed.receipt.message,/CLOSE_FAILED/);
  const count=f.calls.length;await f.uninstall();assert.equal(f.calls.length,count);
});
test('lost session metadata does not erase persisted live executions or manufacture clean retirement',async t=>{
  for(const gone of [false,true]){
    const f=fixture();t.after(f.dispose);await f.install();await f.boot();f.loseSession();f.restart();f.gone=gone;
    const count=f.calls.length,result=await f.disable();
    assert.equal(result.managedCleanup.state,gone?'retired':'unknown');assert.equal(f.calls.length,count);
  }
});
test('navigation observes pending cleanup after document death without replaying or changing the grant',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();f.cleanupReplies=()=>[];
  await f.disable();
  const before=structuredClone(f.installation()),calls=f.calls.length;
  f.gone=true;
  const navigation={tabId:1,documentId:'replacement-document'};
  await f.executor.cleanupWorlds(navigation);
  await f.service.observeManagedCleanup(navigation);
  assert.equal(f.installation().managedCleanup.state,'retired');
  assert.deepEqual(f.installation().authorization,before.authorization);
  assert.equal(f.installation().enabled,false);
  assert.equal(f.installation().nativeState,'disabled');
  assert.equal(f.installation().token,before.token);
  assert.equal(f.calls.length,calls,'observation cannot execute source or cleanup');
});
test('navigation keeps live, cached and unobservable lost-ledger cleanup unknown',async t=>{
  for(const kind of ['live','cached','observationError']){
    const f=fixture();t.after(f.dispose);await f.install();await f.boot();f.loseSession();f.restart();
    await f.disable();
    if(kind!=='live')f[kind]=true;
    const before=structuredClone(f.installation()),calls=f.calls.length,queries=f.frameQueries.length;
    await f.service.observeManagedCleanup({tabId:2,documentId:'unrelated-document'});
    assert.equal(f.frameQueries.length,queries,'unrelated tabs must not trigger an observation');
    await f.service.observeManagedCleanup({tabId:1,documentId:'replacement-document'});
    assert.equal(f.installation().managedCleanup.state,'unknown');
    assert.deepEqual(f.installation().authorization,before.authorization);
    assert.equal(f.calls.length,calls);
    f.cached=false;f.observationError=false;f.gone=true;
    await f.service.observeManagedCleanup({tabId:1,removed:true});
    assert.equal(f.installation().managedCleanup.state,'retired');
    assert.equal(f.calls.length,calls);
  }
});
test('cleanup observation of a live ready world cannot dispatch a disposer',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const calls=f.calls.length;
  const result=await f.executor.retireInstalled(f.installation(),{observeOnly:true});
  assert.equal(result.state,'unknown');
  assert.equal(f.records()[0].installed.state,'evaluated');
  assert.equal(f.doc.querySelectorAll().length,1);
  assert.equal(f.calls.length,calls);
});
test('navigation clears an active upgrade cleanup warning without reinstalling or rerunning it',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();f.cleanupReplies=()=>[];
  const upgraded=await f.install('return 43;',2),calls=f.calls.length;
  assert.equal(upgraded.managedCleanup.state,'unknown');
  assert.equal(upgraded.authorization.status,'active');
  f.loseSession();f.restart();f.gone=true;
  await f.service.observeManagedCleanup({tabId:1,documentId:'replacement-document'});
  const recovered=f.installation();
  assert.equal(recovered.managedCleanup.state,'retired');
  assert.deepEqual(recovered.authorization,upgraded.authorization);
  assert.equal(recovered.manifestHash,upgraded.manifestHash);
  assert.equal(recovered.nativeState,'registered');
  assert.equal(recovered.enabled,true);
  assert.equal(f.calls.length,calls);
});
test('unknown cleanup fences upgraded source in the same document, including after uninstall and reinstall',async t=>{
  for(const uninstall of [false,true]){
    const f=fixture();t.after(f.dispose);await f.install();await f.boot();f.cleanupReplies=()=>[];
    await f.disable();if(uninstall)await f.uninstall();
    let row=await f.install('return 43;',2);
    if(!row.enabled)row=await f.service.setInstalledPageEnabled({programId:'script',manifestHash:row.manifestHash,installationId:row.authorization.installationId,enabled:true,expectedGeneration:row.authorization.generation},{});
    const count=f.calls.filter(r=>r.js.at(-1).code.includes('return 43;')).length;
    await assert.rejects(f.boot(),{code:'E_UI_CLEANUP_FAILED'});
    assert.equal(f.calls.filter(r=>r.js.at(-1).code.includes('return 43;')).length,count,'new source must not dispatch past unknown cleanup');
  }
});
test('disable waits for the registered async disposer before confirming retirement',async t=>{
  const f=fixture();t.after(f.dispose);await f.install('ui.onDispose(()=>new Promise(r=>globalThis.finishDispose=r));return 42;');await f.boot();
  let finished=false;const disabling=f.disable().then(value=>{finished=true;return value;});
  for(let n=0;n<100&&!vm.runInContext('typeof finishDispose!=="undefined"',f.context());n++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(finished,false);assert.equal(f.doc.querySelectorAll().length,0);
  vm.runInContext('finishDispose()',f.context());assert.equal((await disabling).managedCleanup.state,'retired');
});
test('a combined-query mismatch cannot be confused with exact UUID absence',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();f.frameMismatch=true;
  const count=f.calls.length,result=await f.disable();assert.equal(result.managedCleanup.state,'unknown');
  assert.equal(f.calls.length,count);assert.equal(f.doc.querySelectorAll().length,1);
  assert.deepEqual(f.frameQueries.at(-1),{documentId:f.target.documentId});
});
