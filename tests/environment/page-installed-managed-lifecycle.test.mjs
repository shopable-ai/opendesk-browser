import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createDependencyManager} from '../../src/scripting/user-scripts/dependency-manager.js';
import {createInstalledPagePrograms,PAGE_BOOT_PROTOCOL,PAGE_BOOT_WORLD} from '../../src/scripting/user-scripts/installed-programs.js';
import {createPageScriptPreview} from '../../src/scripting/user-scripts/preview.js';
import {PAGE_WORLD_CSP} from '../../src/scripting/user-scripts/execution-source.js';
import {wrapPageFrameSource} from '../../src/scripting/user-scripts/page-frame-resources.js';
import {createPreviewWorlds,MAX_PREVIEW_WORLDS_PER_DOCUMENT} from '../../src/scripting/user-scripts/preview-worlds.js';
import {createPreviewAdmission} from '../../src/platform/host/preview-admission.js';
import {createManagedUIPreview} from '../../src/native-agent/managed-preview.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
import {digest,digestUtf8} from '../../src/platform/protocol.js';

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
const uiSource=['page-ui-mount','page-program-rules','page-toast','page-ui'].map(name=>readFileSync('src/scripting/user-scripts/'+name+'.js','utf8')
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
  let doc=documentDouble();
  const contexts=new Map(),session={},native=new Map();
  const target={tabId:1,frameId:0,documentId:'document-one',expectedUrl:'https://example.com/demo',expectedWindowId:1};
  const f={doc,target,goneDocuments:new Set(),sessionReadError:false,nativeAccess:true,nativeAccessReads:0,permission:true,gone:false,cached:false,observationError:false,cleanupReplies:reply=>reply,calls:[],worldConfigurations:[],frameQueries:[],storage};
  f.tamper=change=>{const rows=Object.values(session).flat().filter(row=>row.installed);change(rows[0]);};
  f.loseSession=()=>{for(const key of Object.keys(session))delete session[key];};
  f.loseLegacyMetadata=async()=>{
    await storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      for(const row of await tx.all('frameworkKV'))if(row.tag==='page-execution-v1'&&row.managedUI){
        const {lifecycle,...managedUI}=row.managedUI;
        await tx.put('frameworkKV',{...row,managedUI},row.executionKey);
      }
    });
    f.loseSession();
  };
  f.navigate=documentId=>{
    f.goneDocuments.add(target.documentId);target.documentId=documentId;f.gone=false;
    doc=documentDouble();f.doc=doc;contexts.clear();
  };
  const api={runtime:{id:'test'},storage:{session:{get:async key=>{if(f.sessionReadError)throw Error('session ledger unavailable');return {[key]:structuredClone(session[key])};},set:async value=>Object.assign(session,structuredClone(value))}},
    permissions:{contains:async()=>f.permission},tabs:{get:async()=>({id:1,windowId:1,active:true,status:'complete',url:target.expectedUrl}),query:async()=>[{id:1}]},
    webNavigation:{getAllFrames:async()=>[{...target,url:target.expectedUrl}],getFrame:async details=>{
      f.frameQueries.push(details);const {documentId}=details;
      if(f.goneDocuments.has(documentId))return null;
      assert.equal(documentId,target.documentId);
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
  const nativeScripts=api.userScripts;
  f.api=api;
  Object.defineProperty(api,'userScripts',{get:()=>{f.nativeAccessReads++;return f.nativeAccess?nativeScripts:undefined;}});
  const assertHost=async()=>host,dependencies=createDependencyManager({api,storage,assertHost,loadBuiltin:async()=>fakeBuiltinSource});
  f.dependencies=dependencies;
  const make=()=>{
    const admission=createPreviewAdmission({storage,assertHost,currentHost:async()=>{},session:'session'});
    f.executor=createPageScriptPreview({api,storage,assertHost,dependencies,admission,managedFactory:createManagedUIPreview,loadBuiltin:async()=>fakeBuiltinSource});
    const preview={...f.executor,executeInstalled:(...args)=>(f.executeInstalled??f.executor.executeInstalled)(...args),
      preview:async (input,...args)=>f.realVerification?f.executor.preview(input,...args):({state:'preview-evaluated',world:'USER_SCRIPT',sourceHash:f.rows().find(row=>row.sourceUtf8===input.sourceUtf8).manifest.sourceHash,
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
  f.uninstall=()=>{const row=f.installation();return f.service.uninstallPageProgram({programId:'script',manifestHash:row.manifestHash,installationId:row.authorization.installationId,expectedGeneration:row.authorization.generation},{});};
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
  const linkedWorld='opendesk-preview-d1-live-child';
  const staleWorld='opendesk-preview-d1-orphan';
  const parentConfig={worldId:parentWorld,csp:PAGE_WORLD_CSP,messaging:true};
  const configurations=new Map([parentConfig,{worldId:linkedWorld},{worldId:retiredWorld},{worldId:staleWorld}].map(row=>[row.worldId,row]));
  const session={opendeskPagePreviewWorldsD1:[
    {tabId:1,documentId:'parent-document',worldId:parentWorld,installed:{state:'evaluated',frames:[{worldId:linkedWorld,state:'unknown'}]}},
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
  const worlds=createPreviewWorlds({api}),childWorld=await worlds.allocate(native,child,{pendingBinding:'pending-child'});
  assert.deepEqual(resets,[retiredWorld,staleWorld]);
  assert.deepEqual(configurations.get(parentWorld),parentConfig,
    'child allocation must retain the original parent messaging channel for destroy/retirement');
  assert.deepEqual(configurations.get(childWorld),{worldId:childWorld,csp:PAGE_WORLD_CSP,messaging:false});
  assert.equal(probes.length,3,'real default-world persistence and child isolation probes must complete');
  await worlds.allocate(native,child);
  assert.ok(configurations.has(childWorld),'another allocation cannot reset a world awaiting its binding');
  assert.ok(configurations.has(linkedWorld),'a child referenced by the original lifecycle remains protected');
  await worlds.releasePending({worldId:childWorld,nonce:'stale'});
  assert.equal((await worlds.records()).find(row=>row.worldId===childWorld).pendingBinding,'pending-child');
  await worlds.releasePending({worldId:childWorld,nonce:'pending-child'});
  await worlds.allocate(native,child);
  assert.ok(resets.includes(childWorld),'exact known preparation cleanup permits later configuration reconciliation');
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
test('late main cannot mount new UI after disable and never restores old grant success',{timeout:3000},async t=>{
  const f=fixture();t.after(f.dispose);
  const ready=new Promise(resolve=>f.doc.defaultView.addEventListener('test-main-ready',resolve,{once:true}));
  await f.install('await new Promise(r=>{globalThis.finishMain=r;document.defaultView.dispatchEvent(new Event("test-main-ready"));});createPageUI({id:"late"});');
  const running=f.boot();const rejected=assert.rejects(running,error=>['E_PERMISSION','E_PAGE_SCRIPT_EXECUTION'].includes(error.code));
  // Wait for this fixture's actual suspended main, not an arbitrary number of
  // event-loop turns that can expire before crypto/storage work completes.
  await Promise.race([ready,running]);
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
test('legacy missing lifecycle metadata does not erase persisted live executions or manufacture clean retirement',async t=>{
  for(const gone of [false,true]){
    const f=fixture();t.after(f.dispose);await f.install();await f.boot();await f.loseLegacyMetadata();f.restart();f.gone=gone;
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
test('navigation keeps live, cached and unobservable legacy missing-lifecycle cleanup unknown',async t=>{
  for(const kind of ['live','cached','observationError']){
    const f=fixture();t.after(f.dispose);await f.install();await f.boot();await f.loseLegacyMetadata();f.restart();
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
for(const exact of ['gone','live','unobservable'])test('cleanup checks the exact document after its old tab query throws: '+exact,async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const queries=[],calls=f.calls.length;
  f.api.webNavigation.getFrame=async details=>{
    queries.push(details);
    if(Object.hasOwn(details,'tabId'))throw Error('old tab no longer exists');
    if(exact==='unobservable')throw Error('exact document query unavailable');
    return exact==='gone'?null:{documentId:f.target.documentId,parentFrameId:-1,
      frameType:'outermost_frame',documentLifecycle:'cached'};
  };
  const cleanup=await f.executor.retireInstalled(f.installation(),{observeOnly:true});
  assert.ok(queries.some(query=>!Object.hasOwn(query,'tabId')));
  assert.equal(cleanup.state,exact==='gone'?'retired':'unknown');
  assert.equal(cleanup.pendingDocuments.length,exact==='gone'?0:1);
  if(exact!=='gone')assert.equal(cleanup.pendingDocuments[0].state,exact==='live'?'cached':'unobservable');
  assert.equal(f.calls.length,calls,'document observation cannot execute a disposer or source');
});
test('cleanup diagnostics separate historical receipts from pending documents',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  f.navigate('document-two');await f.boot();await f.loseLegacyMetadata();
  const cleanup=await f.executor.retireInstalled(f.installation(),{observeOnly:true});
  assert.equal(cleanup.records,2);
  assert.equal(cleanup.pendingRecords,1);
  assert.deepEqual(cleanup.pendingDocuments,[{tabId:1,documentId:'document-two',state:'active'}]);
});
test('archived cleanup observation cannot erase a concurrently changed cleanup owner',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();await f.loseLegacyMetadata();await f.uninstall();
  const tombstone=f.rows().find(row=>row.tag==='page-uninstalled-v1'),calls=f.calls.length;
  await f.install('return 43;',2);
  f.api.webNavigation.getFrame=async()=>{
    await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      for(const row of await tx.all('frameworkKV')){
        const key='page-cleanup:'+JSON.stringify([row.namespace,row.programId,row.authorization?.installationId,row.authorization?.generation]);
        if(row.tag==='page-cleanup-v1')await tx.put('frameworkKV',{...row,token:'f'.repeat(32),
          authorization:{...row.authorization,generation:tombstone.authorization.generation+1}},key);
      }
    });return null;
  };
  await f.service.observeManagedCleanup({tabId:1,removed:true});
  const current=f.rows().find(row=>row.tag==='page-cleanup-v1');
  assert.equal(current.token,'f'.repeat(32));
  assert.equal(current.authorization.generation,tombstone.authorization.generation+1);
  assert.equal(current.managedCleanup.state,'unknown');assert.equal(f.calls.length,calls);
});
for(const currentRunning of [false,true])test('same-version reimport succeeds independently of cleanup while preserving the active installation: '+currentRunning,async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();f.cleanupReplies=()=>[];
  const upgraded=await f.install('return 43;',2);
  if(currentRunning){f.navigate('current-document');await f.boot();}else f.gone=true;
  const calls=f.calls.length,token=f.installation().token,
    current=structuredClone(f.rows().find(row=>row.tag==='page-execution-v1'&&row.revision===2));
  const candidate=f.rows().find(row=>row.tag==='page-candidate-v1'&&row.manifest.revision===2);
  const payload={format:'opendesk.page-install.v1',programId:'script',version:'2.0.0',title:'Script',revision:2,
    entryFormat:'async-main',sourceUtf8:candidate.sourceUtf8,sourceHash:candidate.manifest.sourceHash,pageRules:candidate.manifest.pageRules};
  const pkg={...payload,packageHash:await digest(payload)};
  const restored=await f.service.importPageInstallPackage({package:pkg,
    expectedInstalledManifestHash:upgraded.manifestHash,expectedGeneration:upgraded.authorization.generation},{});
  assert.equal(restored.managedCleanup.state,'unknown');
  assert.deepEqual(restored.authorization,upgraded.authorization);
  assert.equal(restored.manifestHash,upgraded.manifestHash);
  assert.equal(restored.nativeState,'registered');assert.equal(f.calls.length,calls);
  assert.equal(f.installation().token,token);
  await f.service.observeManagedCleanup({tabId:1,documentId:f.target.documentId});
  assert.equal(f.installation().managedCleanup.state,'retired');
  if(currentRunning)assert.deepEqual(f.rows().find(row=>row.executionKey===current.executionKey),current,
    'current generation stays active in its own document; old cleanup cannot retire it');
});
for(const kind of ['gone','cached','unobservable'])test('Page reimport archives its cleanup tombstone without waiting for old documents: '+kind,async t=>{
  const f=fixture();t.after(f.dispose);const installed=await f.install();await f.boot();
  const candidate=f.rows().find(row=>row.tag==='page-candidate-v1');
  await f.loseLegacyMetadata();await f.uninstall();
  const calls=f.calls.length;
  const pending=(await f.service.listPagePrograms({},{})).cleanupPending;
  assert.equal(pending.length,1);assert.equal(pending[0].programId,'script');
  assert.equal(pending[0].managedCleanup.pendingDocuments.length,1);
  const payload={format:'opendesk.page-install.v1',programId:'script',version:'1.0.0',title:'Script',revision:1,
    entryFormat:'async-main',sourceUtf8:candidate.sourceUtf8,sourceHash:await digestUtf8(candidate.sourceUtf8),
    pageRules:candidate.manifest.pageRules};
  const pkg={...payload,packageHash:await digest(payload)};
  f.gone=kind==='gone';f.cached=kind==='cached';f.observationError=kind==='unobservable';
  const result=await f.service.importPageInstallPackage({package:pkg,expectedInstalledManifestHash:null,expectedGeneration:null},{});
  assert.equal(result.nativeState,'registered');assert.equal(result.ready,true);
  assert.notEqual(result.authorization.installationId,installed.authorization.installationId);
  assert.equal(f.rows().some(row=>row.tag==='page-uninstalled-v1'),false);
  assert.equal(f.rows().some(row=>row.tag==='page-cleanup-v1'),true);
  await f.service.observeManagedCleanup({tabId:1,documentId:f.target.documentId});
  assert.equal((await f.service.listPagePrograms({},{})).cleanupPending.length,kind==='gone'?0:1);
  assert.equal(f.calls.length,calls,'reimport cannot replay unknown cleanup or user source');
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
test('unknown cleanup allows a disabled upgrade and restore but fences its old document',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();f.cleanupReplies=()=>[];
  await f.disable();
  const calls=f.calls.length;
  const upgraded=await f.install('return 43;',2);
  assert.equal(upgraded.enabled,false);assert.equal(upgraded.nativeState,'disabled');
  const enabled=await f.service.setInstalledPageEnabled({programId:'script',manifestHash:upgraded.manifestHash,
    installationId:upgraded.authorization.installationId,enabled:true,expectedGeneration:upgraded.authorization.generation},{});
  assert.equal(enabled.ready,true);
  await assert.rejects(f.boot(),{code:'E_UI_CLEANUP_FAILED'});
  assert.deepEqual(f.calls.slice(calls).map(call=>call.worldId),[PAGE_BOOT_WORLD],
    'only the fixed bootstrap identity probe may run; upgraded source stays fenced');
});
test('two live old documents cannot block reinstall, restart or a new-document boot',async t=>{
  const f=fixture();t.after(f.dispose);const original=await f.install();await f.boot();
  const firstDocument=f.target.documentId;
  f.navigate('document-two');f.goneDocuments.delete(firstDocument);await f.boot();
  const getFrame=f.api.webNavigation.getFrame;
  f.api.webNavigation.getFrame=async details=>details.documentId===firstDocument&&!f.goneDocuments.has(firstDocument)
    ?{documentId:firstDocument,parentFrameId:-1,frameType:'outermost_frame',documentLifecycle:'cached'}:getFrame(details);
  await f.loseLegacyMetadata();const removed=await f.uninstall();
  assert.equal(removed.managedCleanup.pendingDocuments.length,2);
  const calls=f.calls.length;
  const fresh=await f.install('return 43;',2);
  assert.equal(fresh.ready,true);assert.equal(fresh.nativeState,'registered');
  assert.notEqual(fresh.authorization.installationId,original.authorization.installationId);
  assert.equal((await f.service.listPagePrograms({},{})).cleanupPending[0].managedCleanup.pendingDocuments.length,2);
  assert.equal(f.calls.length,calls,'install cannot re-execute source or uncertain cleanup');
  await assert.rejects(f.boot(),{code:'E_UI_CLEANUP_FAILED'});
  assert.equal(f.rows().find(row=>row.tag==='page-execution-v1'&&row.revision===2).state,'failed');
  assert.deepEqual(f.calls.slice(calls).map(call=>call.worldId),[PAGE_BOOT_WORLD],
    'same-document unknown history allows only the fixed bootstrap identity probe');
  f.loseSession();f.restart();await f.service.reconcile();
  assert.equal((await f.service.listPagePrograms({},{})).cleanupPending.length,1);
  const current=structuredClone(f.installation());
  f.navigate('document-three');await f.service.observeManagedCleanup({tabId:1,documentId:f.target.documentId});
  assert.equal((await f.service.listPagePrograms({},{})).cleanupPending[0].managedCleanup.pendingDocuments.length,1);
  await f.boot();
  assert.equal(f.rows().find(row=>row.tag==='page-execution-v1'&&row.documentId==='document-three').state,'completed');
  f.goneDocuments.add(firstDocument);await f.service.observeManagedCleanup({tabId:1,removed:true});
  assert.equal((await f.service.listPagePrograms({},{})).cleanupPending.length,0);
  assert.deepEqual(f.installation().authorization,current.authorization);
  assert.equal(f.installation().token,current.token);
});
test('successive reinstalls retain separate old installation archives',async t=>{
  const f=fixture();t.after(f.dispose);const first=await f.install();await f.boot();
  const firstDocument=f.target.documentId;
  await f.loseLegacyMetadata();await f.uninstall();
  const second=await f.install('return 43;',2);
  f.navigate('document-two');f.goneDocuments.delete(firstDocument);
  const getFrame=f.api.webNavigation.getFrame;
  f.api.webNavigation.getFrame=async details=>details.documentId===firstDocument&&!f.goneDocuments.has(firstDocument)
    ?{documentId:firstDocument,parentFrameId:-1,frameType:'outermost_frame',documentLifecycle:'cached'}:getFrame(details);
  await f.boot();await f.loseLegacyMetadata();await f.uninstall();
  const calls=f.calls.length,third=await f.install('return 44;',3);
  const archives=f.rows().filter(row=>row.tag==='page-cleanup-v1');
  assert.deepEqual(archives.map(row=>row.authorization.installationId),
    [first.authorization.installationId,second.authorization.installationId]);
  assert.equal(new Set([...archives.map(row=>row.authorization.installationId),third.authorization.installationId]).size,3);
  assert.equal((await f.service.listPagePrograms({},{})).cleanupPending.length,2);
  f.loseSession();f.restart();await f.service.reconcile();
  assert.equal(f.calls.length,calls,'archive recovery cannot dispatch native code');
  assert.equal(f.rows().filter(row=>row.tag==='page-cleanup-v1').length,2);
  f.goneDocuments.add(firstDocument);await f.service.observeManagedCleanup({tabId:1});
  const pending=f.rows().filter(row=>row.tag==='page-cleanup-v1');
  assert.equal(pending.length,1);assert.equal(pending[0].authorization.installationId,second.authorization.installationId);
  assert.deepEqual(f.installation().authorization,third.authorization);
});
for(const recovery of ['navigation','reconcile'])test('legacy missing-lifecycle live document uninstall keeps a cleanup tombstone until exact document death: '+recovery,async t=>{
  const f=fixture();t.after(f.dispose);const installed=await f.install();await f.boot();
  const oldBoot={protocol:PAGE_BOOT_PROTOCOL,nativeId:installed.nativeId,token:installed.token};
  const sender={id:'test',documentId:f.target.documentId,frameId:0,url:f.target.expectedUrl,tab:{id:1}};
  await f.loseLegacyMetadata();f.restart();
  const calls=f.calls.length,result=await f.uninstall();
  assert.equal(result.uninstalled,true);assert.equal(result.nativeState,'unregistered');
  assert.equal(result.cleanupPending,true);assert.equal(result.managedCleanup.state,'unknown');
  const tombstone=structuredClone(f.rows().find(row=>row.tag==='page-uninstalled-v1'));
  assert.ok(Number.isFinite(tombstone.uninstalledAt));
  assert.equal(tombstone.authorization.installationId,installed.authorization.installationId);
  assert.equal(tombstone.authorization.status,'disabled');
  assert.equal(tombstone.authorization.generation,installed.authorization.generation+1);
  assert.equal(f.installation(),undefined);
  assert.deepEqual((await f.service.listPagePrograms({},{})).installed,[]);
  assert.equal(f.doc.querySelectorAll().length,1,'lost ledger cannot select a disposer');
  await assert.rejects(f.service.handleBoot(oldBoot,sender),{code:'E_PERMISSION'});
  // Cleanup evidence remains independently recoverable while a fresh grant exists.
  const fresh=await f.install('return 43;',2);
  const archived={...tombstone,tag:'page-cleanup-v1'};
  assert.deepEqual(f.rows().find(row=>row.tag==='page-cleanup-v1'),archived);
  assert.notEqual(fresh.authorization.installationId,installed.authorization.installationId);
  await assert.rejects(f.service.handleBoot(oldBoot,sender),{code:'E_PERMISSION'});
  const observe=()=>recovery==='reconcile'?f.service.reconcile():f.service.observeManagedCleanup({tabId:1,documentId:'replacement-document'});
  for(const kind of ['live','cached','observationError']){
    f.cached=kind==='cached';f.observationError=kind==='observationError';
    await observe();
    const current=f.rows().find(row=>row.tag==='page-cleanup-v1');
    assert.equal(current.managedCleanup.state,'unknown');
    assert.deepEqual(current.authorization,archived.authorization);
    assert.equal(f.calls.length,calls,'live/cached/unobservable documents never replay cleanup or source');
  }
  f.cached=false;f.observationError=false;f.gone=true;
  await observe();
  assert.equal(f.rows().some(row=>row.tag==='page-cleanup-v1'),false);
  assert.equal(f.calls.length,calls,'document death only retires metadata');
  f.navigate('replacement-document');
  const again=await f.install('return 43;',2);
  assert.equal(again.nativeState,'registered');
  assert.notEqual(again.authorization.installationId,installed.authorization.installationId);
  await f.boot();
  assert.equal(f.rows().filter(row=>row.tag==='page-execution-v1').at(-1).state,'completed');
});
test('tombstone reconciliation never dispatches a recovered disposer after the first ledger read failed',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  assert.equal(f.records()[0].installed.state,'evaluated');
  const calls=f.calls.length;
  f.sessionReadError=true;
  const receipt=await f.uninstall();
  assert.equal(receipt.uninstalled,true);assert.equal(receipt.cleanupPending,true);
  assert.equal(receipt.managedCleanup.state,'unknown');
  const tombstone=structuredClone(f.rows().find(row=>row.tag==='page-uninstalled-v1'));
  f.sessionReadError=false;f.restart();
  const nativeReads=f.nativeAccessReads;
  await f.service.reconcile();
  const observed=f.rows().find(row=>row.tag==='page-uninstalled-v1');
  assert.deepEqual(observed.authorization,tombstone.authorization);
  assert.equal(observed.token,tombstone.token);
  assert.equal(observed.managedCleanup.state,'unknown');
  assert.equal(observed.managedCleanup.pendingRecords,1);
  assert.equal(f.records()[0].installed.state,'evaluated','recovered ready ledger is only observed');
  assert.equal(f.doc.querySelectorAll().length,1);
  assert.equal(vm.runInContext('globalThis.disposals||0',f.context()),0);
  assert.equal(f.calls.length,calls,'a recovered ledger cannot authorize background disposer dispatch');
  assert.equal(f.nativeAccessReads,nativeReads,'confirmed native withdrawal needs no native API');
  f.gone=true;
  await f.service.reconcile();
  assert.equal(f.rows().some(row=>row.tag==='page-uninstalled-v1'),false);
  assert.equal(f.calls.length,calls);
  assert.equal(f.nativeAccessReads,nativeReads);
});
test('exact document death clears the tombstone while userScripts is unavailable and allows a later fresh install',async t=>{
  const f=fixture();t.after(f.dispose);const installed=await f.install();await f.boot();
  await f.loseLegacyMetadata();f.restart();
  const receipt=await f.uninstall();
  assert.equal(receipt.cleanupPending,true);
  const tombstone=structuredClone(f.rows().find(row=>row.tag==='page-uninstalled-v1'));
  const calls=f.calls.length,nativeReads=f.nativeAccessReads;
  f.nativeAccess=false;
  await f.service.reconcile();
  assert.deepEqual(f.rows().find(row=>row.tag==='page-uninstalled-v1'),tombstone,'API loss cannot block a confirmed native uninstall');
  f.gone=true;
  await f.service.reconcile();
  assert.equal(f.rows().some(row=>row.tag==='page-uninstalled-v1'),false);
  assert.equal(f.calls.length,calls);
  assert.equal(f.nativeAccessReads,nativeReads,'document retirement is independent of native access');
  f.nativeAccess=true;f.navigate('replacement-document');
  const again=await f.install('return 43;',2);
  assert.equal(again.nativeState,'registered');
  assert.notEqual(again.authorization.installationId,installed.authorization.installationId);
  await f.boot();
  assert.equal(f.rows().filter(row=>row.tag==='page-execution-v1').at(-1).state,'completed');
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

const disposerCalls=f=>f.calls.filter(request=>request.js?.at(-1)?.code.includes('return r.retire(')).length;
for(const operation of ['disable','update'])test('durable lifecycle recovers '+operation+' cleanup once after session reset',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const context=f.context(),before=disposerCalls(f);
  f.loseSession();f.restart();
  const receipt=operation==='disable'?await f.disable():await f.install('return 43;',2);
  assert.equal(receipt.managedCleanup.state,'retired');
  assert.equal(f.doc.querySelectorAll().length,0);
  assert.equal(vm.runInContext('disposals',context),1);
  assert.equal(disposerCalls(f),before+1);
  f.loseSession();f.restart();await f.service.reconcile();
  assert.equal(disposerCalls(f),before+1,'a completed disposal is never redispatched after another reload');
});
for(const failure of ['unknown','failed'])test('durable '+failure+' cleanup remains non-replayable after session reset',async t=>{
  const f=fixture();t.after(f.dispose);
  await f.install(failure==='failed'?'ui.onDispose(()=>Promise.reject(new Error("CLOSE_FAILED")));return 42;':undefined);
  await f.boot();
  if(failure==='unknown')f.cleanupReplies=()=>[];
  assert.equal((await f.disable()).managedCleanup.state,'unknown');
  const calls=f.calls.length;
  f.loseSession();f.restart();
  await f.service.reconcile();const receipt=await f.uninstall();
  assert.equal(receipt.managedCleanup.state,'unknown');assert.equal(receipt.cleanupPending,true);
  assert.equal(f.calls.length,calls,'loss of the session ledger cannot authorize retrying an attempted disposer');
  const rows=await createPreviewWorlds({api:f.api,storage:f.storage}).records();
  assert.ok(rows.some(row=>row.installed?.state===failure),'the terminal uncertainty remains available for lifecycle recovery');
});
for(const observation of ['live','cached','error','gone'])
test('durable world recovery retains budget for '+observation+' original documents',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const original=structuredClone(f.records()[0]);
  f.loseSession();f.restart();f.frameQueries.length=0;
  f.cached=observation==='cached';f.observationError=observation==='error';f.gone=observation==='gone';
  const rows=await createPreviewWorlds({api:f.api,storage:f.storage}).records();
  if(observation==='gone')assert.equal(rows.some(row=>row.worldId===original.worldId),false);
  else assert.ok(rows.some(row=>row.worldId===original.worldId&&row.documentId===original.documentId),
    'live, cached and unobservable documents still consume their original world slot');
  assert.ok(f.frameQueries.some(query=>query.documentId===original.documentId&&!Object.hasOwn(query,'tabId')),
    'recovery checks the original exact document UUID');
});
for(const collision of ['world','execution key'])test('same-read durable recovery rejects conflicting '+collision+' bindings',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const original=f.rows().find(row=>row.tag==='page-execution-v1'),conflicting=structuredClone(original);
  if(collision==='world'){
    conflicting.executionKey+='-conflict';
    conflicting.managedUI.lifecycle.executionKey=conflicting.executionKey;
  }else conflicting.managedUI.worldId+='-conflict';
  await f.storage.transaction(['frameworkKV'],'readwrite',tx=>tx.put('frameworkKV',conflicting,original.executionKey+'-duplicate-row'));
  f.loseSession();const before=structuredClone(f.rows()),calls=f.calls.length;
  await assert.rejects(createPreviewWorlds({api:f.api,storage:f.storage}).records(),{code:'E_WORLD_ISOLATION'});
  assert.deepEqual(f.rows(),before,'conflicts cannot rewrite durable identities');
  assert.equal(f.records().length,0,'a rejected read cannot persist recovered duplicates');
  assert.equal(f.calls.length,calls,'conflicts cannot dispatch source or cleanup');
});
test('same-read matching durable identities merge the later lifecycle into one world',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const original=f.rows().find(row=>row.tag==='page-execution-v1'),later=structuredClone(original);
  later.managedUI.lifecycle.state='unknown';
  await f.storage.transaction(['frameworkKV'],'readwrite',tx=>tx.put('frameworkKV',later,original.executionKey+'-later-row'));
  f.loseSession();const before=structuredClone(f.rows()),calls=f.calls.length;
  const rows=await createPreviewWorlds({api:f.api,storage:f.storage}).records();
  assert.equal(rows.length,1,'matching durable rows consume only one world slot');
  assert.equal(rows[0].installed.state,'unknown','execution order determines the final lifecycle');
  assert.deepEqual(f.rows(),before);assert.equal(f.calls.length,calls);
});
test('world recovery bounds concurrent exact-document observations and retains cached or uncertain worlds',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const original=f.rows().find(row=>row.tag==='page-execution-v1');
  await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
    for(let index=0;index<24;index++)for(let copy=0;copy<2;copy++){
      const execution=structuredClone(original),documentId='history-'+index;
      execution.documentId=documentId;execution.executionKey+='-'+index+'-'+copy;
      execution.managedUI.worldId+='-'+index+'-'+copy;
      const lifecycle=execution.managedUI.lifecycle;
      lifecycle.executionKey=execution.executionKey;lifecycle.target.documentId=documentId;
      await tx.put('frameworkKV',execution,execution.executionKey);
    }
  });
  f.loseSession();let pending=0,peak=0,secondRead=false;const queries=[];
  f.api.webNavigation.getFrame=async({documentId})=>{
    queries.push(documentId);peak=Math.max(peak,++pending);
    try{
      await new Promise(resolve=>setImmediate(resolve));
      if(secondRead)return documentId==='history-2'?{documentId,documentLifecycle:'active'}:null;
      if(documentId==='history-1')throw Error('observation unavailable');
      return documentId==='history-0'?{documentId,documentLifecycle:'cached'}:
        documentId===original.documentId?{documentId,documentLifecycle:'active'}:null;
    }finally{pending--;}
  };
  const before=structuredClone(f.rows());
  const worlds=createPreviewWorlds({api:f.api,storage:f.storage}),rows=await worlds.records();
  assert.ok(peak>1,'independent history checks must not each delay the next document');
  assert.ok(peak<=8,'recovery must bound browser API pressure');
  assert.equal(queries.length,25);assert.equal(new Set(queries).size,25,'observe each document once per recovery');
  assert.deepEqual(rows.map(row=>row.documentId),[original.documentId,'history-0','history-0','history-1','history-1']);
  assert.deepEqual(rows.map(row=>row.worldId),[original.managedUI.worldId,
    ...[0,1].flatMap(index=>[0,1].map(copy=>original.managedUI.worldId+'-'+index+'-'+copy))],
    'distinct worlds in one document retain execution order after concurrent observations');
  secondRead=true;queries.length=0;
  const refreshed=await worlds.records();
  assert.equal(queries.length,25);assert.equal(new Set(queries).size,25,'each read reobserves every unique document');
  assert.deepEqual(refreshed.map(row=>row.worldId),[0,1].map(copy=>original.managedUI.worldId+'-2-'+copy),
    'previous absence is not cached and previous live or uncertain observations are refreshed');
  assert.deepEqual(f.rows(),before,'observation cannot change Authority or replay lifecycle effects');
  assert.equal(pending,0);
});
test('world recovery reuses free query positions while joining every exact document',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const original=f.rows().find(row=>row.tag==='page-execution-v1');
  await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
    for(let index=0;index<24;index++){
      const execution=structuredClone(original),documentId='rolling-history-'+index;
      execution.documentId=documentId;execution.executionKey+='-rolling-'+index;
      execution.managedUI.worldId+='-rolling-'+index;
      execution.managedUI.lifecycle.executionKey=execution.executionKey;
      execution.managedUI.lifecycle.target.documentId=documentId;
      await tx.put('frameworkKV',execution,execution.executionKey);
    }
  });
  f.loseSession();const before=structuredClone(f.rows()),calls=f.calls.length,queries=[];
  let release,enter,pending=0,peak=0,secondRead=false,finished=false;
  const held=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{enter=resolve;});
  f.api.webNavigation.getFrame=async({documentId})=>{
    queries.push(documentId);peak=Math.max(peak,++pending);
    try{
      if(!secondRead&&documentId==='rolling-history-0'){enter();await held;}
      else await new Promise(resolve=>setImmediate(resolve));
      if(secondRead)return documentId==='rolling-history-4'?{documentId,documentLifecycle:'active'}:null;
      if(documentId==='rolling-history-1')throw Error('exact document observation unavailable');
      return documentId==='rolling-history-2'?{documentId,documentLifecycle:'cached'}:
        documentId===original.documentId?{documentId,documentLifecycle:'active'}:null;
    }finally{pending--;}
  };
  const worlds=createPreviewWorlds({api:f.api,storage:f.storage}),reading=worlds.records().then(value=>{finished=true;return value;});
  await entered;
  try{
    for(let turn=0;turn<8;turn++)await new Promise(resolve=>setImmediate(resolve));
    assert.ok(queries.length>8,'a slow first-batch document cannot idle all later query positions');
    assert.ok(peak<=8,'rolling recovery cannot increase browser API pressure');
    assert.equal(finished,false,'all exact queries must finish before recovery returns');
  }finally{release();await reading;}
  const rows=await reading;
  assert.equal(queries.length,25);assert.equal(new Set(queries).size,25);
  assert.deepEqual(rows.map(row=>row.documentId),[original.documentId,'rolling-history-1','rolling-history-2'],
    'completion order cannot change execution-order merge or discard uncertain/cached worlds');
  secondRead=true;queries.length=0;
  const refreshed=await worlds.records();
  assert.equal(queries.length,25);assert.equal(new Set(queries).size,25,'a new ledger observes every UUID again');
  assert.deepEqual(refreshed.map(row=>row.documentId),['rolling-history-4'],'previous absence is never cached');
  assert.equal(pending,0);assert.deepEqual(f.rows(),before);assert.equal(f.calls.length,calls);
});
for(const mode of ['reserved success','reserved failure','unreserved','default reserved child'])test('world proof wait preserves isolation and ledger progress: '+mode,async t=>{
  const f=fixture();t.after(f.dispose);const native=f.api.userScripts,execute=native.execute,resets=[];
  native.getWorldConfigurations=async()=>structuredClone(f.worldConfigurations);
  native.resetWorldConfiguration=async worldId=>{resets.push(worldId);};
  let release,enter,held=false;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{enter=resolve;});
  native.execute=async request=>{const result=await execute(request);
    if(!held){held=true;enter();await gate;if(mode==='reserved failure')throw Error('proof response lost');}
    return result;
  };
  const concurrent=mode.startsWith('reserved'),worlds=createPreviewWorlds({api:f.api,storage:f.storage}),first=worlds.allocate(native,f.target,
    mode==='unreserved'?{}:{pendingBinding:'first-pending',...(concurrent?{concurrentProof:true}:{})}),firstResult=Promise.allSettled([first]);
  await entered;const ledger='opendeskPagePreviewWorldsD1',before=(await f.api.storage.session.get(ledger))[ledger];
  assert.equal(before.length,1);const firstId=before[0].worldId;let secondDone=false;
  const second=worlds.allocate(native,f.target,{pendingBinding:'second-pending',concurrentProof:true}).then(value=>{secondDone=true;return value;}),secondResult=Promise.allSettled([second]);
  try{
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(secondDone,concurrent,'only an opted-in protected reservation can release the ledger queue during proof');
    assert.equal(resets.includes(firstId),false,'another allocation cannot reset the pending proof world');
    if(concurrent)assert.equal(((await f.api.storage.session.get(ledger))[ledger]).length,2,
      'both distinct reserved worlds still consume their original budget');
  }finally{release();await Promise.all([firstResult,secondResult]);}
  const [a]=await firstResult,[b]=await secondResult;
  assert.equal(a.status,mode==='reserved failure'?'rejected':'fulfilled');assert.equal(b.status,'fulfilled');
  const after=(await f.api.storage.session.get(ledger))[ledger];assert.equal(after.length,2,'a failed proof cannot refund a consumed world');
  assert.equal(after.find(row=>row.worldId===firstId).pendingBinding,
    mode==='reserved success'||mode==='default reserved child'?'first-pending':undefined);
  assert.equal(after.find(row=>row.worldId===b.value).pendingBinding,'second-pending','failure cannot release another reservation');
  if(mode==='reserved failure')assert.match(a.reason.message,/proof response lost/);
});
for(const interruption of ['navigate','close','pending replacement','pending release'])test('a concurrent world proof cannot succeed after '+interruption,async t=>{
  const f=fixture();t.after(f.dispose);const native=f.api.userScripts,execute=native.execute;
  let release,enter,held=false;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{enter=resolve;});
  native.execute=async request=>{const result=await execute(request);if(!held){held=true;enter();await gate;}return result;};
  const worlds=createPreviewWorlds({api:f.api,storage:f.storage}),allocation=worlds.allocate(native,f.target,{pendingBinding:'proof-owner',concurrentProof:true}),outcome=Promise.allSettled([allocation]);
  await entered;const ledger='opendeskPagePreviewWorldsD1',before=(await f.api.storage.session.get(ledger))[ledger],worldId=before[0].worldId;
  let interrupted=false;
  const action=(async()=>{
    if(interruption==='navigate')await worlds.cleanup({tabId:1,documentId:'new-document'});
    if(interruption==='close')await worlds.cleanup({tabId:1,removed:true});
    if(interruption==='pending replacement')await f.api.storage.session.set({[ledger]:[{...before[0],pendingBinding:'another-owner'}]});
    if(interruption==='pending release')await worlds.releasePending({worldId,nonce:'proof-owner'});
    interrupted=true;
  })();
  try{await new Promise(resolve=>setImmediate(resolve));assert.equal(interrupted,true,'ledger lifecycle operations must progress while Native remains pending');}
  finally{release();await action;await outcome;}
  const [result]=await outcome;assert.equal(result.status,'rejected');assert.equal(result.reason.code,'E_WORLD_ISOLATION');
  if(interruption==='pending replacement')assert.equal((await f.api.storage.session.get(ledger))[ledger][0].pendingBinding,'another-owner');
});
for(const phase of [2,3])for(const failure of ['reject','wrong document'])test('concurrent proof rejects '+failure+' at probe '+phase,async t=>{
  const f=fixture();t.after(f.dispose);const native=f.api.userScripts,execute=native.execute;
  let probes=0;native.execute=async request=>{
    const receipt=await execute(request);if(++probes!==phase)return receipt;
    if(failure==='reject')throw Error('native proof acknowledgement lost');
    return receipt.map(row=>({...row,documentId:'foreign-document'}));
  };
  const worlds=createPreviewWorlds({api:f.api,storage:f.storage});
  await assert.rejects(worlds.allocate(native,f.target,{pendingBinding:'failed-proof',concurrentProof:true}),
    failure==='reject'?/native proof acknowledgement lost/:{code:'E_WORLD_ISOLATION'});
  assert.equal(probes,phase,'no later probe or user source can follow a failed proof');
  const rows=(await f.api.storage.session.get('opendeskPagePreviewWorldsD1')).opendeskPagePreviewWorldsD1;
  assert.equal(rows.length,1,'failed proof consumes its world budget');assert.equal(rows[0].pendingBinding,undefined);
});
test('failed concurrent proof cleanup retains protection when the session write fails',async t=>{
  const f=fixture();t.after(f.dispose);const native=f.api.userScripts,execute=native.execute,set=f.api.storage.session.set;
  const worlds=createPreviewWorlds({api:f.api,storage:f.storage}),foreign=await worlds.allocate(native,f.target,{pendingBinding:'foreign-owner',concurrentProof:true});
  let probes=0;native.execute=async request=>{const receipt=await execute(request);if(++probes===2){
    f.api.storage.session.set=async()=>{throw Error('pending cleanup write failed');};throw Error('native proof acknowledgement lost');
  }return receipt;};
  try{
    await assert.rejects(worlds.allocate(native,f.target,{pendingBinding:'failed-owner',concurrentProof:true}),/pending cleanup write failed/);
    const rows=(await f.api.storage.session.get('opendeskPagePreviewWorldsD1')).opendeskPagePreviewWorldsD1;
    assert.equal(rows.length,2,'a failed cleanup cannot refund budget or report allocation success');
    assert.equal(rows.find(row=>row.worldId===foreign).pendingBinding,'foreign-owner');
    assert.equal(rows.find(row=>row.worldId!==foreign).pendingBinding,'failed-owner','unknown cleanup retains original protection');
    assert.equal(probes,2);
  }finally{f.api.storage.session.set=set;}
});
const installedWorldScope=row=>({worldId:row.worldId,executionKey:row.installed.executionKey,
  receiptNonce:row.installed.receiptNonce,compiledSha256:row.installed.compiledSha256});
test('scoped installed metadata reads its own execution and preserves every foreign session row',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const original=structuredClone(f.records()[0]),scope=installedWorldScope(original),ledger='opendeskPagePreviewWorldsD1';
  const foreign={...structuredClone(original),worldId:original.worldId+'-foreign',pendingBinding:original.installed.receiptNonce,
    installed:{...original.installed,executionKey:original.installed.executionKey+'-foreign',state:'unknown'}};
  await f.api.storage.session.set({[ledger]:[original,foreign]});
  let scans=0;const storage={transaction:(stores,mode,work)=>f.storage.transaction(stores,mode,tx=>work({...tx,
    all:async(...args)=>{scans++;return tx.all(...args);}}))};
  const worlds=createPreviewWorlds({api:f.api,storage}),calls=f.calls.length;
  await worlds.editRecords(rows=>{rows.find(row=>row.worldId===original.worldId).installed.state='unknown';},scope);
  assert.equal(scans,0,'an exact metadata mutation must not materialize unrelated execution history');
  assert.deepEqual(f.records()[1],foreign,'foreign unknown and pending metadata are untouched');
  assert.equal(f.records()[0].installed.state,'unknown');assert.equal(f.calls.length,calls);
});
for(const state of ['unknown','retiring','retired'])test('scoped completion refreshes durable '+state+' instead of reviving a stale ready mirror',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const row=structuredClone(f.records()[0]),scope=installedWorldScope(row);row.installed.state='ready';
  await f.api.storage.session.set({opendeskPagePreviewWorldsD1:[row]});
  await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{const execution=await tx.get('frameworkKV',scope.executionKey);
    execution.managedUI.lifecycle.state=state;await tx.put('frameworkKV',execution,scope.executionKey);});
  await createPreviewWorlds({api:f.api,storage:f.storage}).editRecords(rows=>{
    const current=rows[0].installed;if(current.state==='ready')current.state='evaluated';
  },scope);
  assert.equal(f.records()[0].installed.state,state);
});
for(const conflict of ['world','execution alias','duplicate','nonce','compiled hash'])test('scoped metadata denies '+conflict+' before its callback',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const row=structuredClone(f.records()[0]),scope=installedWorldScope(row),rows=[row];
  if(conflict==='world')row.worldId+='-wrong';
  if(conflict==='execution alias')row.installed.executionKey+='-wrong';
  if(conflict==='duplicate')rows.push(structuredClone(row));
  if(conflict==='nonce')scope.receiptNonce+='-wrong';
  if(conflict==='compiled hash')scope.compiledSha256='f'.repeat(64);
  await f.api.storage.session.set({opendeskPagePreviewWorldsD1:rows});let called=false;
  await assert.rejects(createPreviewWorlds({api:f.api,storage:f.storage}).editRecords(()=>{called=true;},scope),{code:'E_WORLD_ISOLATION'});
  assert.equal(called,false);assert.deepEqual(f.records(),rows);
});
for(const absent of ['missing','null'])test('scoped completion cannot recreate a '+absent+' durable lifecycle from a ready mirror',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const row=structuredClone(f.records()[0]),scope=installedWorldScope(row);row.installed.state='ready';
  await f.api.storage.session.set({opendeskPagePreviewWorldsD1:[row]});
  await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
    const execution=await tx.get('frameworkKV',scope.executionKey);
    if(absent==='missing')delete execution.managedUI.lifecycle;else execution.managedUI.lifecycle=null;
    await tx.put('frameworkKV',execution,scope.executionKey);
  });
  let called=false;
  await assert.rejects(createPreviewWorlds({api:f.api,storage:f.storage}).editRecords(rows=>{
    called=true;rows[0].installed.state='evaluated';
  },scope),{code:'E_WORLD_ISOLATION'});
  assert.equal(called,false);assert.deepEqual(f.records(),[row]);
});
test('scoped metadata rejects edits to another world without writing either lifecycle',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const row=structuredClone(f.records()[0]),scope=installedWorldScope(row),foreign={tabId:99,documentId:'foreign',worldId:row.worldId+'-foreign',pendingBinding:'foreign'};
  await f.api.storage.session.set({opendeskPagePreviewWorldsD1:[row,foreign]});
  await assert.rejects(createPreviewWorlds({api:f.api,storage:f.storage}).editRecords(rows=>{rows[1].pendingBinding='changed';},scope),{code:'E_WORLD_ISOLATION'});
  assert.deepEqual((await f.api.storage.session.get('opendeskPagePreviewWorldsD1')).opendeskPagePreviewWorldsD1,[row,foreign]);
});
test('scoped metadata falls back to full recovery only when its session world is absent',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const scope=installedWorldScope(f.records()[0]);f.loseSession();f.frameQueries.length=0;
  await createPreviewWorlds({api:f.api,storage:f.storage}).editRecords(rows=>{rows[0].installed.state='unknown';},scope);
  assert.ok(f.frameQueries.some(query=>query.documentId===f.target.documentId));assert.equal(f.records()[0].installed.state,'unknown');
});
for(const change of ['lifecycle','nonce','world','compiled hash'])test('scoped metadata CAS rejects concurrent '+change+' including a no-op completion',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const original=structuredClone(f.records()),scope=installedWorldScope(original[0]);let changed=false;
  const storage={async transaction(stores,mode,work){const result=await f.storage.transaction(stores,mode,work);
    if(mode==='readonly'&&!changed){changed=true;await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      const execution=await tx.get('frameworkKV',scope.executionKey);
      if(change==='lifecycle')execution.managedUI.lifecycle.state='unknown';
      if(change==='nonce')execution.receiptNonce+='-wrong';
      if(change==='world')execution.managedUI.worldId+='-wrong';
      if(change==='compiled hash')execution.managedUI.compiledSha256='f'.repeat(64);
      await tx.put('frameworkKV',execution,scope.executionKey);
    });}return result;}};
  await assert.rejects(createPreviewWorlds({api:f.api,storage}).editRecords(()=>{},scope),{code:'E_WORLD_ISOLATION'});
  assert.deepEqual(f.records(),original,'a failed CAS cannot write the session mirror');
});
for(const failure of ['pending identity','durable write','session write'])test('scoped initial metadata preserves binding and commit order after '+failure,async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const original=structuredClone(f.records()[0]),scope={...installedWorldScope(original),initial:true},ledger='opendeskPagePreviewWorldsD1';
  await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
    const execution=await tx.get('frameworkKV',scope.executionKey),{lifecycle,...managedUI}=execution.managedUI;
    await tx.put('frameworkKV',{...execution,managedUI},scope.executionKey);
  });
  const pending={tabId:original.tabId,documentId:original.documentId,worldId:original.worldId,
    pendingBinding:scope.receiptNonce+(failure==='pending identity'?'-wrong':'')};
  await f.api.storage.session.set({[ledger]:[pending]});const set=f.api.storage.session.set;let sessionWrites=0;
  f.api.storage.session.set=async value=>{sessionWrites++;if(failure==='session write')throw Error('session write failed');return set(value);};
  const storage={transaction:(stores,mode,work)=>f.storage.transaction(stores,mode,tx=>work({...tx,
    put:async(...args)=>{if(failure==='durable write')throw Error('durable write failed');return tx.put(...args);}}))};
  let called=false;
  await assert.rejects(createPreviewWorlds({api:f.api,storage}).editRecords(rows=>{
    called=true;const row=rows.find(row=>row.worldId===scope.worldId);assert.equal(row.installed,undefined);
    row.installed={...original.installed,state:'ready'};
  },scope),failure==='pending identity'?{code:'E_WORLD_ISOLATION'}:new RegExp(failure+' failed'));
  assert.equal(called,failure!=='pending identity');assert.equal(sessionWrites,failure==='session write'?1:0);
  assert.deepEqual((await f.api.storage.session.get(ledger))[ledger],[pending]);
  const execution=f.rows().find(row=>row.executionKey===scope.executionKey);
  assert.equal(execution.managedUI.lifecycle?.state,failure==='session write'?'ready':undefined);
  f.api.storage.session.set=set;
  if(failure==='session write')assert.equal((await createPreviewWorlds({api:f.api,storage:f.storage}).records())[0].installed.state,'ready',
    'lost mirror acknowledgement recovers the durable lifecycle without dispatch');
});
test('session reset cannot refund installed world slots in the same live document',async t=>{
  const f=fixture();t.after(f.dispose);
  for(let revision=1;revision<=MAX_PREVIEW_WORLDS_PER_DOCUMENT;revision++){
    await f.install('return '+revision+';',revision);await f.boot();
  }
  assert.equal(f.records().length,MAX_PREVIEW_WORLDS_PER_DOCUMENT);
  f.loseSession();f.restart();
  const worlds=createPreviewWorlds({api:f.api,storage:f.storage});
  await assert.rejects(worlds.allocate(f.api.userScripts,f.target),{code:'E_PREVIEW_WORLD_LIMIT'});
});
for(const state of ['retiring','unknown','retired'])
test('durable '+state+' state survives a lost session write acknowledgement',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const original=structuredClone(f.records()[0]),set=f.api.storage.session.set;
  const worlds=createPreviewWorlds({api:f.api,storage:f.storage});
  f.api.storage.session.set=async()=>{throw Error('session write acknowledgement lost');};
  await assert.rejects(worlds.editRecords(rows=>{
    rows.find(row=>row.worldId===original.worldId).installed.state=state;
  }),/session write acknowledgement lost/);
  f.api.storage.session.set=set;f.loseSession();f.restart();
  const calls=f.calls.length,recovered=await createPreviewWorlds({api:f.api,storage:f.storage}).records();
  const row=recovered.find(row=>row.worldId===original.worldId);
  assert.ok(row,'Authority metadata must be committed before writing the session mirror');
  assert.deepEqual(row.installed,{...original.installed,state});
  await f.disable();assert.equal(f.calls.length,calls,'retiring, unknown and retired states never replay a disposer');
});

for(const changed of [false,true])
test('durable stale '+(changed?'changed':'unchanged')+' editRecords row cannot overwrite a newer persisted unknown state', {timeout:5000},async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();f.loseSession();
  let release,entered;
  const gate=new Promise(resolve=>{release=resolve;}),snapshotRead=new Promise(resolve=>{entered=resolve;});
  t.after(()=>release());
  let hold=true;
  const slowStorage={async transaction(stores,mode,work){
    const result=await f.storage.transaction(stores,mode,work);
    if(mode==='readonly'&&hold){hold=false;entered();await gate;}
    return result;
  }};
  const staleWorlds=createPreviewWorlds({api:f.api,storage:slowStorage});
  const staleEdit=staleWorlds.editRecords(rows=>{if(changed)rows[0].installed.state='retiring';});
  // Observe both results before releasing either writer, including the expected
  // CAS rejection when this writer changed a now-stale lifecycle snapshot.
  const settled=Promise.allSettled([staleEdit]);
  await snapshotRead;
  await createPreviewWorlds({api:f.api,storage:f.storage}).editRecords(rows=>{rows[0].installed.state='unknown';});
  release();const [outcome]=await settled;
  assert.equal(outcome.status,changed?'rejected':'fulfilled');
  if(changed)assert.equal(outcome.reason.code,'E_WORLD_ISOLATION');
  const execution=f.rows().find(row=>row.tag==='page-execution-v1');
  assert.equal(execution.managedUI.lifecycle.state,'unknown','a stale writer must not restore a dispatchable state');
  const recovered=await createPreviewWorlds({api:f.api,storage:f.storage}).records();
  assert.equal(recovered[0].installed.state,'unknown');
  const calls=f.calls.length;
  assert.equal((await f.disable()).managedCleanup.state,'unknown');assert.equal(f.calls.length,calls);
});

async function failInitialLifecycleSessionWrite(f){
  const original=structuredClone(f.records()[0]),ledger='opendeskPagePreviewWorldsD1';
  await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
    const execution=await tx.get('frameworkKV',original.installed.executionKey);
    const {lifecycle,...managedUI}=execution.managedUI;
    await tx.put('frameworkKV',{...execution,managedUI},execution.executionKey);
  });
  f.loseSession();
  await f.api.storage.session.set({[ledger]:[{tabId:original.tabId,documentId:original.documentId,worldId:original.worldId}]});
  const set=f.api.storage.session.set,installed={...original.installed,state:'ready'};
  f.api.storage.session.set=async()=>{throw Error('initial lifecycle session write failed');};
  try{
    await assert.rejects(createPreviewWorlds({api:f.api,storage:f.storage}).editRecords(rows=>{
      rows.find(row=>row.worldId===original.worldId).installed=installed;
    }),/initial lifecycle session write failed/);
  }finally{f.api.storage.session.set=set;}
  assert.deepEqual(f.rows().find(row=>row.executionKey===installed.executionKey).managedUI.lifecycle,installed);
  assert.equal(Object.hasOwn((await f.api.storage.session.get(ledger))[ledger][0],'installed'),false,
    'failed mirror write leaves the exact original reservation, not an empty session ledger');
  return {original,installed,ledger};
}
test('durable reservation-only mirror recovers DB lifecycle after the first session write fails',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const {original,installed}=await failInitialLifecycleSessionWrite(f);
  const recovered=await createPreviewWorlds({api:f.api,storage:f.storage}).records();
  assert.equal(recovered.length,1,'recovery does not allocate or duplicate a world slot');
  assert.deepEqual(recovered[0],{tabId:original.tabId,documentId:original.documentId,worldId:original.worldId,installed});
  const calls=disposerCalls(f);
  assert.equal((await f.disable()).managedCleanup.state,'retired');
  assert.equal(disposerCalls(f),calls+1);assert.equal(f.doc.querySelectorAll().length,0);
});
for(const conflict of ['tab','document','nonce','compiled hash','preview'])
test('durable reservation recovery denies conflicting '+conflict+' metadata',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const {installed,ledger}=await failInitialLifecycleSessionWrite(f);
  const snapshot=await f.api.storage.session.get(ledger),row=snapshot[ledger][0];
  if(conflict==='tab')row.tabId=2;
  if(conflict==='document')row.documentId='other-document';
  if(conflict==='nonce')row.installed={...installed,receiptNonce:'forged-nonce'};
  if(conflict==='compiled hash')row.installed={...installed,compiledSha256:'0'.repeat(64)};
  if(conflict==='preview')row.managed={previewId:'other-preview',state:'evaluated'};
  await f.api.storage.session.set(snapshot);
  const calls=f.calls.length;
  await assert.rejects(createPreviewWorlds({api:f.api,storage:f.storage}).records(),{code:'E_WORLD_ISOLATION'});
  assert.equal(f.calls.length,calls,'conflicting mirrors cannot select a cleanup target');
  assert.deepEqual(f.rows().find(value=>value.executionKey===installed.executionKey).managedUI.lifecycle,installed);
});

const allocationLedger='opendeskPagePreviewWorldsD1';
const allocationTurn=()=>new Promise(resolve=>setImmediate(resolve));
function allocationGate(){let release;const wait=new Promise(resolve=>{release=resolve;});return {wait,release};}
const allocationRow=(id,extra={})=>({tabId:1,documentId:'document-one',worldId:'opendesk-preview-d1-'+id,...extra});

test('overlapped world reads start while queued and keep their original FIFO position',async t=>{
  const f=fixture();t.after(f.dispose);const native=f.api.userScripts,execute=native.execute,get=f.api.storage.session.get;
  const proof=allocationGate(),read=allocationGate(),entered=allocationGate();let held=false,holdRead=false,readStarted=false;
  native.execute=async request=>{const result=await execute(request);if(!held){held=true;entered.release();await proof.wait;}return result;};
  f.api.storage.session.get=async key=>{if(holdRead){holdRead=false;readStarted=true;await read.wait;}return get(key);};
  const worlds=createPreviewWorlds({api:f.api,storage:f.storage}),timings=[];
  const first=worlds.allocate(native,f.target,{pendingBinding:'first'});await entered.wait;
  holdRead=true;
  const second=worlds.allocate(native,f.target,{pendingBinding:'second',onTiming:(key,value)=>timings.push([key,value])});
  const third=worlds.allocate(native,f.target,{pendingBinding:'third'}),outcomes=Promise.allSettled([first,second,third]);
  try{
    await allocationTurn();assert.equal(readStarted,true,'FULL first read must start before waiting for the world lock');
    proof.release();await allocationTurn();
    assert.equal(f.worldConfigurations.length,1,'later ready reads cannot overtake the immediately enqueued reservation');
  }finally{proof.release();read.release();await outcomes;}
  assert.ok((await outcomes).every(row=>row.status==='fulfilled'));
  assert.deepEqual((await get(allocationLedger))[allocationLedger].map(row=>row.pendingBinding),['first','second','third']);
  assert.ok(timings.length>0&&timings.every(([key,value])=>/^world[A-Za-z]+Ms$/.test(key)&&Number.isFinite(value)&&value>=0));
});

test('overlapped world first-read rejection is handled immediately while the queue is held',async t=>{
  const f=fixture();t.after(f.dispose);const native=f.api.userScripts,execute=native.execute,get=f.api.storage.session.get;
  const held=allocationGate(),entered=allocationGate();let blocked=false,fail=false,rejectedRead=false;
  native.execute=async request=>{const result=await execute(request);if(!blocked){blocked=true;entered.release();await held.wait;}return result;};
  f.api.storage.session.get=async key=>{if(fail){fail=false;rejectedRead=true;throw Error('queued FULL ledger unavailable');}return get(key);};
  const worlds=createPreviewWorlds({api:f.api,storage:f.storage}),first=worlds.allocate(native,f.target);await entered.wait;
  fail=true;const second=worlds.allocate(native,f.target),outcomes=Promise.allSettled([first,second]);
  try{
    await allocationTurn();await allocationTurn();
    assert.equal(rejectedRead,true,'a rejected prefetch must already be observed while its ordered work is still queued');
  }finally{held.release();await outcomes;}
  const [a,b]=await outcomes;assert.equal(a.status,'fulfilled');assert.equal(b.status,'rejected');
  assert.match(b.reason.message,/queued FULL ledger unavailable/);assert.equal(f.worldConfigurations.length,1);assert.equal(f.calls.length,3);
});

test('overlapped world second fresh FULL rejection fences cleanup and preserves independent FIFO progress',async t=>{
  const f=fixture();t.after(f.dispose);const native=f.api.userScripts,transaction=f.storage.transaction,set=f.api.storage.session.set;
  const fresh=allocationGate(),freshEntered=allocationGate(),next=allocationGate(),nextEntered=allocationGate();
  const failure=Error('second fresh FULL ledger unavailable'),stale='opendesk-preview-d1-cleanable',resets=[];
  let fullReads=0,configurationReads=0,writes=0,firstComplete=false;
  f.storage.transaction=(stores,mode,work)=>transaction(stores,mode,tx=>work({...tx,all:async name=>{
    assert.equal(mode,'readonly');assert.deepEqual(stores,['frameworkKV']);assert.equal(name,'frameworkKV');
    const rows=await tx.all(name);
    if(++fullReads===2){assert.equal(firstComplete,true);freshEntered.release();await fresh.wait;throw failure;}
    return rows;
  }}));
  f.api.storage.session.set=async value=>{writes++;return set(value);};
  native.getWorldConfigurations=async()=>{
    if(++configurationReads===2){nextEntered.release();await next.wait;}
    return [{worldId:stale}];
  };
  native.resetWorldConfiguration=async id=>{resets.push(id);};
  const worlds=createPreviewWorlds({api:f.api,storage:f.storage});
  const failed=worlds.allocate(native,f.target,{pendingBinding:'failed-owner',onTiming:key=>{if(key==='worldAllocateLedgerMs')firstComplete=true;}}),
    failedOutcome=Promise.allSettled([failed]);
  await freshEntered.wait;
  const second=worlds.allocate(native,f.target,{pendingBinding:'second-owner'}),
    third=worlds.allocate(native,f.target,{pendingBinding:'third-owner'}),later=Promise.allSettled([second,third]);
  fresh.release();
  try{
    const [result]=await failedOutcome;await nextEntered.wait;
    assert.equal(result.status,'rejected');assert.equal(result.reason,failure);
    assert.deepEqual(resets,[],'a rejected fresh ledger cannot clean even a preexisting stale configuration');
    assert.equal(writes,0);assert.equal(f.worldConfigurations.length,0);assert.equal(f.calls.length,0);
  }finally{next.release();await later;}
  const results=await later;assert.ok(results.every(row=>row.status==='fulfilled'));
  const rows=(await f.api.storage.session.get(allocationLedger))[allocationLedger];
  assert.deepEqual(rows.map(row=>row.pendingBinding),['second-owner','third-owner'],'independent allocations retain their original queue positions');
  assert.deepEqual(rows.map(row=>row.worldId),results.map(row=>row.value));
  assert.deepEqual(f.worldConfigurations.map(row=>row.worldId),rows.map(row=>row.worldId));
  assert.deepEqual(resets,[stale,stale]);assert.equal(writes,2);assert.equal(f.calls.length,6);
  assert.equal(fullReads,6,'the rejected allocation is not retried; each independent allocation still reads two FULL ledgers');
});

for(const protection of ['pending','installed','installed child','preview child'])
test('overlapped world cleanup protects fresh '+protection+' arriving after the first FULL read',async t=>{
  const f=fixture();t.after(f.dispose);const native=f.api.userScripts,resets=[],child='opendesk-preview-d1-live-child';
  const live=allocationRow('live',protection==='pending'?{pendingBinding:'other-owner'}:
    protection==='preview child'?{managed:{state:'evaluated'},previewFrames:{frames:[{worldId:child,state:'unknown'}]}}:
      {installed:{state:'unknown',frames:protection==='installed child'?[{worldId:child,state:'ready'}]:[]}});
  let reads=0;const get=f.api.storage.session.get;
  f.api.storage.session.get=async key=>++reads===1?{[key]:[]}:{[key]:[structuredClone(live)]};
  native.getWorldConfigurations=async()=>[{worldId:live.worldId},{worldId:child},{worldId:'foreign-world'},{worldId:'opendesk-preview-d1-stale'}];
  native.resetWorldConfiguration=async worldId=>{resets.push(worldId);};
  await createPreviewWorlds({api:f.api,storage:f.storage}).allocate(native,f.target,{pendingBinding:'new-owner'});
  assert.equal(resets.includes(live.worldId),false,'cleanup must await the second FULL ledger before touching a newly protected parent');
  assert.equal(resets.includes(child),!protection.endsWith('child'));
  assert.ok(resets.includes('opendesk-preview-d1-stale'));assert.equal(resets.includes('foreign-world'),false);
  assert.deepEqual((await get(allocationLedger))[allocationLedger][0],live,'persist only the latest FULL rows');
  assert.equal(reads,2);
});

test('overlapped world stale protection union neither authorizes nor merges old rows into the fresh budget',async t=>{
  const f=fixture();t.after(f.dispose);const native=f.api.userScripts,child='opendesk-preview-d1-old-child',resets=[];
  const first=[allocationRow('retiring',{installed:{state:'ready',frames:[{worldId:child,state:'ready'}]}}),
    ...Array.from({length:6},(_,i)=>allocationRow('stale-'+i,{pendingBinding:'stale-owner'}))];
  const fresh=[allocationRow('retiring',{installed:{state:'retired',frames:[{worldId:child,state:'retired'}]}})];
  let reads=0;const get=f.api.storage.session.get;
  f.api.storage.session.get=async key=>({[key]:structuredClone(++reads===1?first:fresh)});
  native.getWorldConfigurations=async()=>[...first.map(row=>({worldId:row.worldId})),{worldId:child},{worldId:'opendesk-preview-d1-unused'}];
  native.resetWorldConfiguration=async id=>{resets.push(id);};
  const id=await createPreviewWorlds({api:f.api,storage:f.storage}).allocate(native,f.target,{pendingBinding:'new-owner'});
  assert.deepEqual(resets,['opendesk-preview-d1-unused'],'both full protection sets include original child worlds');
  const rows=(await get(allocationLedger))[allocationLedger];assert.deepEqual(rows.slice(0,-1),fresh);
  assert.equal(rows.length,2,'first-read slots are not merged or charged against fresh quotas');
  assert.equal(rows[0].installed.state,'retired');assert.equal(rows[0].pendingBinding,undefined);
  assert.equal(rows[1].worldId,id);assert.equal(rows[1].installed,undefined,'protection does not create installed authority');
});

for(const budget of ['six','global'])test('overlapped world latest FULL '+budget+' quota still rejects before new reservation',async t=>{
  const f=fixture();t.after(f.dispose);const native=f.api.userScripts,rows=Array.from({length:budget==='six'?6:4096},(_,i)=>
    allocationRow('full-'+i,{documentId:budget==='six'?f.target.documentId:'other-'+i}));
  let reads=0,writes=0;f.api.storage.session.get=async key=>({[key]:++reads===1?[]:structuredClone(rows)});
  f.api.storage.session.set=async()=>{writes++;};
  await assert.rejects(createPreviewWorlds({api:f.api,storage:f.storage}).allocate(native,f.target,{pendingBinding:'denied'}),{code:'E_PREVIEW_WORLD_LIMIT'});
  assert.equal(reads,2);assert.equal(writes,0);assert.equal(f.worldConfigurations.length,0);assert.equal(f.calls.length,0);
});

for(const failure of ['rejected','unknown'])test('overlapped world '+failure+' native cleanup cannot reserve, configure, probe or replay',async t=>{
  const f=fixture();t.after(f.dispose);const native=f.api.userScripts,entered=allocationGate(),settle=allocationGate();let resets=0,writes=0,done=false;
  native.getWorldConfigurations=async()=>[{worldId:'opendesk-preview-d1-unused'}];
  native.resetWorldConfiguration=async()=>{resets++;entered.release();if(failure==='unknown')await settle.wait;throw Error('cleanup acknowledgement unavailable');};
  f.api.storage.session.set=async()=>{writes++;};
  const allocation=createPreviewWorlds({api:f.api,storage:f.storage}).allocate(native,f.target),outcome=Promise.allSettled([allocation]).then(rows=>{done=true;return rows;});
  await entered.wait;
  try{
    await allocationTurn();assert.equal(done,failure==='rejected');
    assert.equal(resets,1);assert.equal(writes,0);assert.equal(f.worldConfigurations.length,0);assert.equal(f.calls.length,0);
  }finally{settle.release();await outcome;}
  assert.equal((await outcome)[0].status,'rejected');assert.equal(resets,1);assert.equal(writes,0);
});

test('overlapped world allocations and record reads globally share eight fresh document query permits',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const original=f.rows().find(row=>row.tag==='page-execution-v1');
  await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
    for(let i=0;i<24;i++){
      const row=structuredClone(original);row.documentId='overlap-history-'+i;row.executionKey+='-history-'+i;
      row.managedUI.worldId+='-history-'+i;row.managedUI.lifecycle.executionKey=row.executionKey;row.managedUI.lifecycle.target.documentId=row.documentId;
      await tx.put('frameworkKV',row,row.executionKey);
    }
  });
  f.loseSession();let active=0,peak=0,late=false;const queries=[];
  f.api.webNavigation.getFrame=async({documentId})=>{
    queries.push(documentId);peak=Math.max(peak,++active);
    try{
      await allocationTurn();if(documentId==='overlap-history-1')throw Error('observation unknown');
      return late&&documentId==='overlap-history-2'?{documentId,documentLifecycle:'active'}:null;
    }finally{active--;}
  };
  const worlds=createPreviewWorlds({api:f.api,storage:f.storage}),other=createPreviewWorlds({api:f.api,storage:f.storage});
  await Promise.all([worlds.allocate(f.api.userScripts,f.target,{pendingBinding:'allocation'}),worlds.records(),other.records()]);
  assert.ok(peak>1);assert.ok(peak<=8,'all concurrent FULL ledgers, including allocation prefetches and other instances, share the same eight slots');
  assert.equal(active,0,'each successful or rejected native query releases its permit');
  assert.equal(queries.filter(id=>id==='overlap-history-2').length,4,'each allocation ledger and each record read reobserves absent UUIDs');
  late=true;const before=queries.length,rows=await other.records();
  assert.ok(queries.slice(before).includes('overlap-history-2'));assert.ok(rows.some(row=>row.documentId==='overlap-history-2'),'absence is not cached');
  assert.ok(rows.some(row=>row.documentId==='overlap-history-1'),'unknown observations retain their world budget');assert.equal(active,0);
});

async function installedHistoryInput(f){
  const material=await f.dependencies.readStoredPageCandidate('tool:test','script',1);
  return {...material,preparation:await f.executor.prepareInstalled(material),target:structuredClone(f.target),
    installation:{...f.installation(),executionKey:'page-execution:overlap-'+crypto.randomUUID()}};
}
function holdInstalledHistory(f,{error,synchronous=false}={}){
  const transaction=f.storage.transaction,held=allocationGate(),entered=allocationGate();
  let armed=false,reads=0,value;
  f.storage.transaction=(stores,mode,work)=>{
    const eligible=mode==='readonly'&&stores.length===1&&stores[0]==='frameworkKV';
    if(armed&&eligible&&synchronous){armed=false;reads++;throw error;}
    let selected=false;
    const result=transaction(stores,mode,tx=>work({...tx,all:async name=>{
      if(armed&&eligible&&name==='frameworkKV'){armed=false;selected=true;reads++;}
      return tx.all(name);
    }}));
    // Hold the completed readonly acknowledgement, not the fixture transaction
    // queue: the independent authorize/target reads must be able to progress.
    return result.then(async rows=>{
      if(selected){value=rows;entered.release();await held.wait;if(error)throw error;}
      return rows;
    });
  };
  return {arm(){armed=true;},release:held.release,entered:entered.wait,get reads(){return reads;},get value(){return value;}};
}
function installedHistoryEffects(f){
  const native=f.api.userScripts,reset=native.resetWorldConfiguration,set=f.api.storage.session.set;let resets=0,writes=0;
  native.resetWorldConfiguration=async(...args)=>{resets++;return reset(...args);};
  f.api.storage.session.set=async(...args)=>{writes++;return set(...args);};
  return ()=>({calls:f.calls.length,configurations:f.worldConfigurations.length,resets,writes});
}
async function installedHistoryTurns(){for(let i=0;i<4;i++)await allocationTurn();}

test('installed history overlap validates owner preparation and dispatch before either branch',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();const history=holdInstalledHistory(f),effects=installedHistoryEffects(f),before=effects();
  let authorizations=0;
  for(const invalid of ['handle','source','dispatch']){
    const input=await installedHistoryInput(f);
    if(invalid==='handle')input.preparation={};
    if(invalid==='source')input.candidate={...input.candidate,sourceUtf8:input.candidate.sourceUtf8+'\n// changed'};
    history.arm();
    await assert.rejects(f.executor.executeInstalled(input,()=>{authorizations++;},invalid==='dispatch'?undefined:()=>{}),
      {code:invalid==='dispatch'?'E_OWNER':'E_SOURCE_HASH'});
    assert.equal(history.reads,0);assert.equal(authorizations,0);assert.deepEqual(effects(),before);
  }
  history.release();
});

test('installed history overlap joins a synchronous auth rejection with held rejected history',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();const input=await installedHistoryInput(f);
  const authError=Error('authorization rejected synchronously'),historyError=Error('history acknowledgement rejected');
  const history=holdInstalledHistory(f,{error:historyError}),effects=installedHistoryEffects(f),before=effects();
  let done=false,checks=0,targetReads=0;const get=f.api.tabs.get;
  f.api.tabs.get=async(...args)=>{targetReads++;return get(...args);};
  history.arm();const running=f.executor.executeInstalled(input,()=>{checks++;throw authError;},()=>{}),
    outcome=Promise.allSettled([running]).then(rows=>{done=true;return rows;});
  try{
    await installedHistoryTurns();assert.equal(history.reads,1,'history must start even when authorize throws synchronously');
    assert.equal(done,false,'owner cannot release before the held sibling settles');assert.deepEqual(effects(),before);
    await assert.rejects(f.executor.executeInstalled(input,()=>{checks++;},()=>{}),{code:'E_OWNER'});
  }finally{history.release();await outcome;}
  const [result]=await outcome;assert.equal(result.status,'rejected');assert.equal(result.reason,authError,'original auth error has priority');
  assert.equal(checks,1);assert.equal(targetReads,0,'verifyTarget cannot run after failed authorization');assert.deepEqual(effects(),before);
  await assert.rejects(f.executor.executeInstalled(input,()=>{},()=>{}),{code:'E_SOURCE_HASH'},'owner releases only after the join; preparation remains one-shot');
});

test('installed history overlap joins synchronous history rejection with held successful auth',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();const input=await installedHistoryInput(f),held=allocationGate();
  const historyError=Error('FULL history transaction rejected synchronously');
  const history=holdInstalledHistory(f,{error:historyError,synchronous:true}),effects=installedHistoryEffects(f),before=effects();
  let done=false,authorized=false,targetReads=0;const get=f.api.tabs.get;
  f.api.tabs.get=async(...args)=>{assert.equal(authorized,true,'target observation follows successful authorization');targetReads++;return get(...args);};
  history.arm();const running=f.executor.executeInstalled(input,async()=>{await held.wait;authorized=true;},()=>{}),
    outcome=Promise.allSettled([running]).then(rows=>{done=true;return rows;});
  try{
    await installedHistoryTurns();assert.equal(history.reads,1,'history starts without waiting for authorization');
    assert.equal(done,false);assert.deepEqual(effects(),before);
    await assert.rejects(f.executor.executeInstalled(input,()=>{},()=>{}),{code:'E_OWNER'});
  }finally{held.release();await outcome;}
  const [result]=await outcome;assert.equal(result.status,'rejected');assert.equal(result.reason,historyError);
  assert.equal(targetReads,1);assert.deepEqual(effects(),before);
});

for(const change of ['revoke','navigation'])test('installed history overlap original broker authorization and target reject '+change+' while siblings are held',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();
  const history=holdInstalledHistory(f,{error:change==='navigation'?Error('history also rejected'):undefined}),effects=installedHistoryEffects(f),auth=allocationGate(),entered=allocationGate();
  let before;
  f.executeInstalled=(input,authorize,dispatch)=>{
    before=effects();history.arm();
    return f.executor.executeInstalled(input,async()=>{entered.release();await auth.wait;return authorize();},dispatch);
  };
  const outcome=Promise.allSettled([f.boot()]);await entered.wait;
  try{
    await installedHistoryTurns();assert.equal(history.reads,1);assert.deepEqual(effects(),before);
    if(change==='revoke')await f.disable();else f.navigate('new-document');
  }finally{history.release();auth.release();await outcome;}
  const [result]=await outcome;assert.equal(result.status,'rejected');assert.equal(result.reason.code,change==='revoke'?'E_PERMISSION':'E_DOCUMENT_STALE');
  assert.deepEqual(effects(),before,'failed original authorization/target cannot allocate worlds or dispatch source');
  const execution=f.rows().find(row=>row.tag==='page-execution-v1');assert.equal(execution.state,'failed');assert.equal(execution.managedUI,undefined);
});

for(const cleanup of ['retired','unknown'])test('installed history overlap full history fences retirement until both siblings succeed: '+cleanup,async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const original=f.rows().find(row=>row.tag==='page-execution-v1'),oldContext=f.context(),history=holdInstalledHistory(f),effects=installedHistoryEffects(f),
    auth=allocationGate(),entered=allocationGate(),get=f.api.tabs.get;
  f.api.tabs.get=async(...args)=>({...await get(...args),incognito:false});
  if(cleanup==='unknown')f.cleanupReplies=()=>[];
  let before;
  f.executeInstalled=(input,authorize,dispatch)=>{
    before=effects();history.arm();
    return f.executor.executeInstalled(input,async()=>{entered.release();await auth.wait;return authorize();},dispatch);
  };
  const installed=f.installation(),outcome=Promise.allSettled([f.service.runInstalledPageProgram({programId:installed.programId,manifestHash:installed.manifestHash,
    installationId:installed.authorization.installationId,expectedGeneration:installed.authorization.generation,target:structuredClone(f.target)},{documentId:'host-doc'})]);
  await entered.wait;
  try{
    await installedHistoryTurns();assert.equal(history.reads,1);
    assert.deepEqual(history.value.map(row=>row.executionKey),[original.executionKey],'complete history includes the old same-document world and excludes the new unbound execution');
    assert.deepEqual(effects(),before);assert.equal(f.doc.querySelectorAll().length,1);
    auth.release();await installedHistoryTurns();assert.deepEqual(effects(),before,'successful authorize/target cannot retire while history is held');
  }finally{auth.release();history.release();await outcome;}
  const [result]=await outcome;assert.equal(result.status,'fulfilled');
  assert.equal(result.value.state,cleanup==='retired'?'completed':'failed');
  assert.equal(vm.runInContext('disposals',oldContext),1,'the exact old disposer runs once after the join');
  assert.equal(f.records().find(row=>row.worldId===original.managedUI.worldId).installed.state,cleanup);
  const current=f.rows().filter(row=>row.tag==='page-execution-v1').at(-1);
  if(cleanup==='unknown'){
    assert.equal(result.value.error.code,'E_UI_CLEANUP_FAILED');assert.equal(current.managedUI,undefined);
    assert.equal(f.calls.length-before.calls,1,'unknown retirement cannot enter allocation/proofs/source');
    assert.equal(f.worldConfigurations.length,before.configurations);
  }else{
    assert.equal(current.state,'completed');assert.equal(f.calls.length-before.calls,5);
    for(const key of ['authorizeTargetMs','historyReadMs','authorizeHistoryJoinMs','historyWorldsMs','totalMs'])
      assert.ok(Number.isFinite(current.result.startupTimings[key])&&current.result.startupTimings[key]>=0,key);
    assert.ok(current.result.startupTimings.authorizeHistoryJoinMs>=current.result.startupTimings.authorizeTargetMs);
    assert.ok(current.result.startupTimings.authorizeHistoryJoinMs>=current.result.startupTimings.historyReadMs);
  }
});


// 148 opaque observations: no rows, reservations or queue entry at begin.
test('early FULL handle is private one-shot, exact-bound and allocator-local',async t=>{
  const f=fixture();t.after(f.dispose);const worlds=createPreviewWorlds({api:f.api,storage:f.storage}),other=createPreviewWorlds({api:f.api,storage:f.storage}),native=f.api.userScripts;
  const handle=worlds.beginAllocation(f.target,{pendingBinding:'nonce'});
  assert.deepEqual(Object.keys(handle),[]);assert.ok(Object.isFrozen(handle));
  await assert.rejects(other.allocate(native,f.target,{pendingBinding:'nonce',firstLedger:handle}),{code:'E_WORLD_ISOLATION'});
  await assert.rejects(worlds.allocate(native,{...f.target,documentId:'foreign'},{pendingBinding:'nonce',firstLedger:handle}),{code:'E_WORLD_ISOLATION'});
  await assert.rejects(worlds.allocate(native,f.target,{pendingBinding:'other',firstLedger:handle}),{code:'E_WORLD_ISOLATION'});
  const id=await worlds.allocate(native,f.target,{pendingBinding:'nonce',firstLedger:handle});assert.equal(typeof id,'string');
  const calls=f.calls.length;
  await assert.rejects(worlds.allocate(native,f.target,{pendingBinding:'nonce',firstLedger:handle}),{code:'E_WORLD_ISOLATION'});
  assert.equal(f.calls.length,calls);await worlds.discardAllocation(handle);
  const discarded=worlds.beginAllocation(f.target,{pendingBinding:'discard'});await worlds.discardAllocation(discarded);
  await assert.rejects(worlds.allocate(native,f.target,{pendingBinding:'discard',firstLedger:discarded}),{code:'E_WORLD_ISOLATION'});
});

test('early FULL begin has no queue/native effects; consumption reserves original FIFO before held read',async t=>{
  const f=fixture();t.after(f.dispose);const worlds=createPreviewWorlds({api:f.api,storage:f.storage}),native=f.api.userScripts,get=f.api.storage.session.get;
  const held=allocationGate();let reads=0,full=0;
  const tx=f.storage.transaction;f.storage.transaction=(stores,mode,work)=>tx(stores,mode,t=>work({...t,all:async name=>{full++;return t.all(name);}}));
  f.api.storage.session.get=async key=>{const rows=await get(key);if(++reads===1)await held.wait;return rows;};
  const handle=worlds.beginAllocation(f.target,{pendingBinding:'early'});await allocationTurn();
  assert.equal(reads,1);assert.equal(f.calls.length,0);assert.equal(f.worldConfigurations.length,0);
  // Begin alone must not hold the world FIFO.
  await worlds.allocate(native,f.target,{pendingBinding:'before'});
  let observed=0;const second=worlds.allocate(native,f.target,{pendingBinding:'early',firstLedger:handle,onTiming:()=>{observed++;return Promise.reject(Error('non-authoritative observer'));}});
  const third=worlds.allocate(native,f.target,{pendingBinding:'after'}),outcomes=Promise.allSettled([second,third]);
  try{await allocationTurn();assert.equal(f.worldConfigurations.length,1);}finally{held.release();await outcomes;}
  assert.ok((await outcomes).every(x=>x.status==='fulfilled'));
  assert.deepEqual((await get(allocationLedger))[allocationLedger].map(x=>x.pendingBinding),['before','early','after']);
  assert.equal(full,6,'exactly two full reads per allocation; no replacement first read');assert.ok(observed>0);
});

for(const change of ['fresh rejection','six','global','child union'])test('early FULL preserves second fresh FULL '+change,async t=>{
  const f=fixture();t.after(f.dispose);const native=f.api.userScripts,get=f.api.storage.session.get,worlds=createPreviewWorlds({api:f.api,storage:f.storage});
  const child='opendesk-preview-d1-child',parent=allocationRow('parent',{installed:{state:'ready',frames:[{worldId:child,state:'ready'}]}}),resets=[];
  let reads=0;f.api.storage.session.get=async key=>{
    reads++;
    if(reads===1)return {[key]:change==='child union'?[parent]:[]};
    if(change==='fresh rejection')throw Error('148 fresh FULL rejected');
    return {[key]:change==='child union'?[{...parent,installed:{state:'retired',frames:[{worldId:child,state:'retired'}]}}]:
      Array.from({length:change==='six'?6:4096},(_,i)=>allocationRow('charged'+i,{documentId:change==='six'?f.target.documentId:'other'+i}))};
  };
  native.getWorldConfigurations=async()=>[{worldId:parent.worldId},{worldId:child}];native.resetWorldConfiguration=async id=>{resets.push(id);};
  const firstLedger=worlds.beginAllocation(f.target,{pendingBinding:'early'});
  const result=worlds.allocate(native,f.target,{pendingBinding:'early',firstLedger});
  if(change==='child union'){
    await result;assert.deepEqual(resets,[]);const rows=(await get(allocationLedger))[allocationLedger];
    assert.equal(rows.length,2);assert.equal(rows[0].installed.state,'retired');assert.equal(rows[1].installed,undefined);
  }else{
    await assert.rejects(result,change==='fresh rejection'?/148 fresh FULL rejected/:{code:'E_PREVIEW_WORLD_LIMIT'});
    assert.equal(f.worldConfigurations.length,0);assert.equal(f.calls.length,0);
    assert.equal((await get(allocationLedger))[allocationLedger],undefined);
    if(change==='fresh rejection')assert.deepEqual(resets,[]);
  }
  assert.equal(reads,2);await worlds.discardAllocation(firstLedger);
});

test('early FULL preview handle binds preparation source installation nonce and exact target',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();
  for(const field of ['preparation','installation','target','source']){
    const input=await installedHistoryInput(f),firstLedger=f.executor.beginInstalledAllocation({...input,source:'page_auto'});
    assert.throws(()=>f.executor.beginInstalledAllocation({...input,source:'page_auto'}),{code:'E_SOURCE_HASH'});
    const changed=field==='preparation'?{preparation:await f.executor.prepareInstalled(input)}:
      field==='installation'?{installation:{...input.installation,token:'foreign'}}:
      field==='target'?{target:{...input.target,expectedWindowId:2}}:
      {candidate:{...input.candidate,sourceUtf8:input.candidate.sourceUtf8+' '}};
    await assert.rejects(f.executor.executeInstalled({...input,...changed,firstLedger,runAtReached:true},async()=>{},()=>{}),{code:'E_SOURCE_HASH'});
    await f.executor.discardInstalledAllocation(firstLedger);
  }
  assert.equal(f.calls.length,0);
});


test('early FULL and default allocations plus records share eight fresh exact UUID permits',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();await f.boot();
  const original=f.rows().find(row=>row.tag==='page-execution-v1');
  await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
    for(let i=0;i<16;i++){
      const row=structuredClone(original);row.documentId='early-history-'+i;row.executionKey+='-early-'+i;
      row.managedUI.worldId+='-early-'+i;row.managedUI.lifecycle.executionKey=row.executionKey;row.managedUI.lifecycle.target.documentId=row.documentId;
      await tx.put('frameworkKV',row,row.executionKey);
    }
  });
  f.loseSession();let active=0,peak=0,late=false;const queries=[];
  f.api.webNavigation.getFrame=async({documentId})=>{
    queries.push(documentId);peak=Math.max(peak,++active);
    try{await allocationTurn();if(documentId==='early-history-1')throw Error('unknown exact observation');
      return late&&documentId==='early-history-2'?{documentId,documentLifecycle:'active'}:null;
    }finally{active--;}
  };
  const worlds=createPreviewWorlds({api:f.api,storage:f.storage}),other=createPreviewWorlds({api:f.api,storage:f.storage});
  const firstLedger=worlds.beginAllocation(f.target,{pendingBinding:'early'});
  await Promise.all([worlds.allocate(f.api.userScripts,f.target,{pendingBinding:'early',firstLedger}),
    worlds.allocate(f.api.userScripts,f.target,{pendingBinding:'default'}),other.records()]);
  assert.ok(peak>1&&peak<=8);assert.equal(active,0);
  assert.equal(queries.filter(id=>id==='early-history-2').length,5,'each of five FULL ledgers independently observes absent UUIDs');
  late=true;const before=queries.length,rows=await other.records();
  assert.ok(queries.slice(before).includes('early-history-2'));assert.ok(rows.some(row=>row.documentId==='early-history-2'));
  assert.ok(rows.some(row=>row.documentId==='early-history-1'));assert.equal(active,0);
});


// 148 review: independently held original reads prove ownership, not handle shape.
function holdReviewLedger148(f){
  const get=f.api.storage.session.get,gates=[];let reads=0;
  f.api.storage.session.get=async key=>{reads++;const gate=gates.shift(),rows=await get(key);if(gate)await gate.wait;return rows;};
  return {next(){const gate=allocationGate();gates.push(gate);return gate;},get reads(){return reads;}};
}
for(const own of [true,false])test('early FULL review foreign B cannot replace '+(own?'held original A':'preparation without observation'),async t=>{
  const f=fixture();t.after(f.dispose);await f.install();const a=await installedHistoryInput(f),held=holdReviewLedger148(f);
  let aRead,aHandle;if(own){aRead=held.next();aHandle=f.executor.beginInstalledAllocation({...a,source:'page_auto'});}
  const bRead=held.next(),enterB=allocationGate();let bInput,aSettled=false;
  f.executeInstalled=async(input,...args)=>{bInput=input;await enterB.wait;return f.executor.executeInstalled(input,...args);};
  const b=f.boot(),bOutcome=Promise.allSettled([b]);await allocationTurn();
  // Wait only for normal boot bookkeeping, never release either observation.
  for(let i=0;i<50&&!bInput;i++)await allocationTurn();assert.ok(bInput,'real B boot must reach its execution entry');
  const before=f.calls.length,configurations=f.worldConfigurations.length;
  const rejected=f.executor.executeInstalled({...a,runAtReached:true,firstLedger:bInput.firstLedger},async()=>{},()=>{}).finally(()=>{aSettled=true;});
  const aOutcome=Promise.allSettled([rejected]);
  try{
    await installedHistoryTurns();
    if(own){
      assert.equal(aSettled,false,'A must drain only its original held observation');
      await assert.rejects(f.executor.executeInstalled(await installedHistoryInput(f),async()=>{},()=>{}),{code:'E_OWNER'});
      aRead.release();await installedHistoryTurns();
    }
    assert.equal(aSettled,true,'A rejection must not wait for the independently held B read');
    assert.equal((await aOutcome)[0].reason.code,'E_SOURCE_HASH');
    assert.equal(f.calls.length,before);assert.equal(f.worldConfigurations.length,configurations);
    // The real B pipeline must still consume B and finish all three Native proofs.
    enterB.release();await installedHistoryTurns();assert.equal(f.worldConfigurations.length,configurations);
    bRead.release();await b;
    assert.equal(f.records().length,1);assert.equal(f.rows().find(row=>row.tag==='page-execution-v1').state,'completed');
  }finally{aRead?.release();bRead.release();enterB.release();await aOutcome;await bOutcome;if(aHandle)await f.executor.discardInstalledAllocation(aHandle);}
});

test('early FULL review omitted registered handle rejects and drains original without a replacement read',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();const held=holdReviewLedger148(f),read=held.next();
  const configurations=f.worldConfigurations.length;let entered=false,innerSettled=false;
  f.executeInstalled=(input,...args)=>{entered=true;const {firstLedger,...omitted}=input;
    return f.executor.executeInstalled(omitted,...args).finally(()=>{innerSettled=true;});};
  const run=f.boot(),outcome=Promise.allSettled([run]);
  try{
    for(let i=0;i<50&&!entered;i++)await allocationTurn();assert.equal(entered,true);
    await installedHistoryTurns();assert.equal(held.reads,1,'omission cannot silently start a default first ledger');
    assert.equal(innerSettled,false,'execute owner cannot release before its registered original settles');
    assert.equal(f.calls.length,1,'only the previously validated bootstrap marker ran');assert.equal(f.worldConfigurations.length,configurations);
    await assert.rejects(f.executor.executeInstalled(await installedHistoryInput(f),async()=>{},()=>{}),{code:'E_OWNER'});
  }finally{read.release();await outcome;}
  const [result]=await outcome;assert.equal(result.status,'rejected');assert.equal(result.reason.code,'E_SOURCE_HASH');
  assert.equal(held.reads,1);assert.equal(f.calls.length,1);assert.equal(f.worldConfigurations.length,configurations);
});

for(const field of ['source','target'])test('early FULL review original '+field+' rejection retains owner until its own observation settles',async t=>{
  const f=fixture();t.after(f.dispose);await f.install();const input=await installedHistoryInput(f),held=holdReviewLedger148(f),read=held.next();
  const firstLedger=f.executor.beginInstalledAllocation({...input,source:'page_auto'});
  const changed=field==='source'?{candidate:{...input.candidate,sourceUtf8:input.candidate.sourceUtf8+' '}}:
    {target:{...input.target,expectedWindowId:2}};let settled=false;
  const run=f.executor.executeInstalled({...input,...changed,runAtReached:true,firstLedger},async()=>{},()=>{}).finally(()=>{settled=true;});
  const outcome=Promise.allSettled([run]);
  try{
    await installedHistoryTurns();assert.equal(settled,false);
    await assert.rejects(f.executor.executeInstalled(await installedHistoryInput(f),async()=>{},()=>{}),{code:'E_OWNER'});
    assert.equal(f.calls.length,0);assert.equal(held.reads,1);
  }finally{read.release();await outcome;await f.executor.discardInstalledAllocation(firstLedger);}
  assert.equal((await outcome)[0].reason.code,'E_SOURCE_HASH');
});
