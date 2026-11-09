import {fakeBuiltinSource} from './builtin-support.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {createDependencyManager} from '../../src/scripting/user-scripts/dependency-manager.js';
import {createInstalledPagePrograms,PAGE_BOOT_PROTOCOL,PAGE_BOOT_WORLD} from '../../src/scripting/user-scripts/installed-programs.js';
import {createPreviewAdmission} from '../../src/platform/host/preview-admission.js';
import {createPageScriptPreview} from '../../src/scripting/user-scripts/preview.js';
import {digest,digestUtf8} from '../../src/platform/protocol.js';
globalThis.crypto ||= webcrypto;

// Transaction/native component doubles. These are not real Chrome evidence.
function fixture(){
  let db=new Map(['frameworkKV','commandJournal','runs'].map(name=>[name,new Map()])),queue=Promise.resolve();
  const writes=[];
  const host={tag:'host',namespace:'tool:test',registrationId:'host',hostDocumentId:'tool-document',hostUrl:'chrome-extension://test/sidepanel.html',
    hostInstanceId:'instance',browserSessionIncarnation:'session',active:true,revoked:false};
  db.get('commandJournal').set('host:host',structuredClone(host));
  const storage={transaction(stores,mode,work){
    if(mode==='readwrite')writes.push([...stores]);
    const next=queue.then(async()=>{
      const copy=structuredClone(db),table=name=>{assert.ok(stores.includes(name));return copy.get(name);};
      const tx={get:async(name,key)=>structuredClone(table(name).get(key)),all:async name=>[...table(name).values()].map(v=>structuredClone(v)),
        put:async(name,value,key)=>{assert.equal(mode,'readwrite');table(name).set(key,structuredClone(value));},
        delete:async(name,key)=>{assert.equal(mode,'readwrite');table(name).delete(key);}};
      const result=await work(tx);if(mode==='readwrite')db=copy;return result;
    });queue=next.catch(()=>{});return next;
  }};
  const f={builtinSource:fakeBuiltinSource,granted:true,access:true,registerCalls:0,executeCalls:0,previewCalls:0,permissionRequests:[],marker:true,native:new Map(),worlds:[],executionError:null,beforeExecute:null,
    tabReads:0,tabStatus:'complete',framesGone:false,exactDocumentGone:false,documentLifecycle:'active',session:'session',nativeReads:0,unregisterCalls:0,
    sourceCalls:0,retirementError:null};
  const sessions={},contexts=new Map();
  const local={};f.local=local;f.contexts=contexts;
  const assertHost=async()=>{assert.ok(db.get('commandJournal').get('host:host').active);return structuredClone(host);};
  const target={tabId:1,frameId:0,documentId:'web-document',expectedUrl:'https://example.com/demo',expectedWindowId:1};
  const sender={id:'test',documentId:target.documentId,frameId:0,url:target.expectedUrl,tab:{id:1,incognito:false}};
  const api={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path},storage:{local:{get:async keys=>Object.fromEntries((typeof keys==='string'?[keys]:keys).map(key=>[key,structuredClone(local[key])])),set:async value=>Object.assign(local,structuredClone(value))},session:{get:async()=>structuredClone(sessions),set:async value=>Object.assign(sessions,structuredClone(value))}},
    permissions:{contains:async()=>f.granted,request:async request=>{f.permissionRequests.push(request);return false;}},tabs:{query:async()=>[{id:1}],get:async()=>{
      if(++f.tabReads===3)await f.beforeExecute?.();
      return {id:1,windowId:1,active:true,url:f.currentUrl??target.expectedUrl,incognito:false,status:f.tabStatus};}},
    webNavigation:{getAllFrames:async()=>f.framesGone?[]:[{frameId:0,documentId:target.documentId,url:f.currentUrl??target.expectedUrl,documentLifecycle:f.documentLifecycle}],
      getFrame:async input=>{
        assert.equal(input.documentId,target.documentId);
        if(Object.hasOwn(input,'tabId'))assert.deepEqual(input,{tabId:1,frameId:0,documentId:target.documentId});
        if(f.frameObservationError)throw Error('observation failed');
        return f.exactDocumentGone?null:{documentId:target.documentId,parentFrameId:-1,
          frameType:'outermost_frame',documentLifecycle:f.documentLifecycle};}},
    userScripts:{
      getScripts:async filter=>{f.nativeReads++;if(!f.access)throw Error('toggle disabled');return [...f.native.values()].filter(row=>!filter||filter.ids.includes(row.id)).map(v=>structuredClone(v));},
      configureWorld:async config=>f.worlds.push(config),
      getWorldConfigurations:async()=>f.worlds,resetWorldConfiguration:async id=>{f.worlds=f.worlds.filter(row=>row.worldId!==id);},
      register:async scripts=>{f.registerCalls++;scripts.forEach(row=>f.native.set(row.id,structuredClone(row)));},
      unregister:async filter=>{f.unregisterCalls++;if(!f.access)throw Error('toggle disabled');filter.ids.forEach(id=>f.native.delete(id));},
      execute:async input=>{
        if(input.worldId===PAGE_BOOT_WORLD)return [{frameId:0,documentId:target.documentId,result:f.marker?f.token:null}];
        const code=input.js.at(-1).code,probe=code.includes('__opendesk_probe_');
        if(!probe){
          f.executeCalls++;
          if(code.includes('const __opendeskManagedUIRegistryV1='))f.sourceCalls++;
          if(code.includes('r.retire(')&&f.retirementError)throw f.retirementError;
          if(f.executionError)throw f.executionError;
          await f.completionGate;
        }
        const id=input.worldId||'default';if(!contexts.has(id))contexts.set(id,vm.createContext({document:{},setTimeout,clearTimeout,chrome:{runtime:{sendMessage:async message=>{try{return {ok:true,data:await f.service.handleBoot(message,f.sender)};}catch(error){return {ok:false,error:{code:error.code,message:error.message}};}}}}}));
        // Optional-library receipt wiring is a component test: only vendor DOM
        // initialization is replaced, after production loader/hash validation.
        if(!probe)f.executedCode=code;
        const executable=f.stubVendorInitialization?code.replace(f.stubVendorInitialization,
          'globalThis.jQuery={fn:{jquery:"3.7.1"}};globalThis.$=globalThis.jQuery;'):code;
        const result=await vm.runInContext(executable,contexts.get(id));
        return [{frameId:0,documentId:target.documentId,result:JSON.parse(JSON.stringify(result))}];
      }
    }};
  const manager=createDependencyManager({loadBuiltin:async()=>f.builtinSource,api,storage,assertHost});
  f.storedCandidateReads=0;
  const dependencies={...manager,readStoredPageCandidate:async(...args)=>{
    f.storedCandidateReads++;return manager.readStoredPageCandidate(...args);
  }};
  const admission=createPreviewAdmission({storage,assertHost,currentHost:async()=>{},session:f.session});
  const executor=createPageScriptPreview({api,storage,assertHost,dependencies,admission,loadBuiltin:async()=>f.builtinSource});
  const preview={preview:async input=>{f.previewCalls++;const row=f.rows().find(row=>row.tag==='page-candidate-v1'&&row.sourceUtf8===input.sourceUtf8);
      assert.equal(input.sourceUtf8,row.sourceUtf8);return {builtinAbi:f.builtinSource.abi,builtinCatalogSha256:f.builtinSource.catalogSha256,builtinBundleSha256:f.builtinSource.sha256,state:'preview-evaluated',world:'USER_SCRIPT',sourceHash:row.manifest.sourceHash,tabId:1,documentId:target.documentId,worldId:'preview-world',resultText:'1',
        ...(f.packagedJquerySha256?{packagedJquerySha256:f.packagedJquerySha256}:{})};},
    executeInstalled:executor.executeInstalled,
    get retireInstalled(){return f.retireHook||undefined;},
    executeFrame:async(_input,authorize)=>{await authorize();return {state:'frame-authorized'};}};
  const make=()=>createInstalledPagePrograms({loadBuiltin:async()=>f.builtinSource,api,storage,assertHost,dependencies,preview,admission,session:f.session});
  const nativeScripts=api.userScripts;
  Object.defineProperty(api,'userScripts',{get:()=>f.access?nativeScripts:undefined});
  f.api=api;f.previewExecutor=executor;f.service=make();f.restart=()=>{
    const restoredAdmission=createPreviewAdmission({storage,assertHost,currentHost:async()=>{},session:f.session});
    const restoredPreview={...preview,executeInstalled:createPageScriptPreview({api,storage,assertHost,dependencies,admission:restoredAdmission,loadBuiltin:async()=>f.builtinSource}).executeInstalled};
    f.service=createInstalledPagePrograms({loadBuiltin:async()=>f.builtinSource,api,storage,assertHost,dependencies,preview:restoredPreview,admission:restoredAdmission,session:f.session});
  };f.storage=storage;f.dependencies=dependencies;f.target=target;f.sender=sender;
  f.rows=()=>[...db.get('frameworkKV').values()];
  f.snapshot=()=>structuredClone(db);f.writes=writes;
  f.installation=(programId='script')=>f.rows().find(row=>row.tag==='page-installed-v1'&&row.programId===programId);
  f.message=(programId='script')=>{const row=f.installation(programId);f.token=row.token;return {protocol:PAGE_BOOT_PROTOCOL,nativeId:row.nativeId,token:row.token};};
  f.navigate=documentId=>{target.documentId=documentId;sender.documentId=documentId;contexts.clear();f.tabReads=0;};
  return f;
}
const fails=(work,code)=>assert.rejects(work,error=>error.code===code);


import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {appPageStorage,appPageEtag} from '../../src/scripting/user-scripts/app-page-contract.js';
import {installAppPageRuntime} from '../../src/scripting/user-scripts/app-page-runtime.js';
import {installManagedUILifecycle} from '../../src/scripting/user-scripts/managed-ui-lifecycle.js';
import {createToolLocalization} from '../../src/ui/sidebar-tools/localization.js';

async function appFixture(pageRules={}){
  const f=fixture(),sourceUtf8='async function main(){ OpenDeskAppPage.onRequest(({operation,payload})=>({operation,payload})); return 42; }';
  const page={format:'opendesk.page-install.v1',programId:'app.page-fixture',version:'1.0.0',title:'Fixture',revision:1,
    entryFormat:'async-main',sourceUtf8,sourceHash:await digestUtf8(sourceUtf8),
    pageRules:{matches:['https://example.com/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT',...pageRules}};
  const tool={format:'opendesk.sidebar-tool.v2',id:'page-fixture',version:'1.0.0',title:'Fixture',description:'Companion',
    html:'<p>Fixture</p>',css:'',js:'void 0;',capabilities:['page.module','storage.local'],requires:{browserSdk:'1.0.0'},
    contributes:{contextMenus:[]},pageModule:{...page,packageHash:await digest(page)}};
  tool.localization=await createToolLocalization({sourceLocale:'en',messages:{en:{hello:'Hello'},ja:{hello:'こんにちは'}}});
  f.local[SIDEBAR_TOOL_STORE]=[tool];f.local[TOOL_REVOCATION_EPOCHS_STORE]={[tool.id]:'epoch-1'};
  f.tool=tool;f.owner={toolId:tool.id,packageHash:await sidebarToolPackageHash(tool),installEpoch:'epoch-1'};
  f.appRow=()=>f.installation(page.programId);
  f.installApp=()=>f.service.importAppPage(f.owner,{});
  f.bootApp=()=>f.service.handleBoot(f.message(page.programId),f.sender);
  f.bridge=(operation,payload={},change={})=>{
    const row=f.appRow(),execution=f.rows().find(value=>value.tag==='page-execution-v1'&&value.programId===row.programId);
    return f.service.handleBoot({protocol:PAGE_BOOT_PROTOCOL,action:'app-page',programId:row.programId,
      executionKey:execution.executionKey,receiptNonce:execution.receiptNonce,worldId:execution.managedUI.worldId,
      operation,payload,...change},f.sender);
  };
  return f;
}
test('app preflight and verify are read-only; import uses Page proof and native authority',async()=>{
  const f=await appFixture(),before=f.snapshot();
  assert.equal((await f.service.prepareAppPage({tool:f.tool},{})).status,'prepared');
  assert.deepEqual(f.snapshot(),before);assert.equal(f.native.size,0);
  const receipt=await f.installApp();assert.equal(receipt.status,'installed');assert.equal(receipt.ready,true);
  assert.deepEqual(f.appRow().appOwner,f.owner);assert.equal(f.previewCalls,0);assert.equal(f.sourceCalls,0);
  const after=f.snapshot(),calls=f.registerCalls;
  assert.equal((await f.service.verifyAppPage(f.owner,{})).status,'verified');
  assert.deepEqual(f.snapshot(),after);assert.equal(f.registerCalls,calls);
  f.native.clear();await fails(()=>f.service.verifyAppPage(f.owner,{}),'E_PAGE_INSTALLATION');
  assert.equal(f.native.size,0,'verification does not repair missing native state');
});
for(const kind of ['missing','hash','epoch','disabled'])test('parent '+kind+' fences boot/bridge/requests and synchronizes without reinstall',async()=>{
  const f=await appFixture();await f.installApp();await f.bootApp();
  assert.equal((await f.bridge('authorize')).ready,true);
  if(kind==='missing')f.local[SIDEBAR_TOOL_STORE]=[];
  if(kind==='hash')f.local[SIDEBAR_TOOL_STORE][0].title='Changed';
  if(kind==='epoch')f.local[TOOL_REVOCATION_EPOCHS_STORE][f.tool.id]='epoch-2';
  if(kind==='disabled')f.local[SIDEBAR_TOOL_ENABLE_STORE]={[f.tool.id]:false};
  await fails(()=>f.bootApp(),'E_APP_PAGE_OWNER');
  await fails(()=>f.bridge('authorize'),'E_APP_PAGE_OWNER');
  await fails(()=>f.service.requestAppPage({...f.owner,target:f.target,operation:'read',payload:{}},{}),'E_APP_PAGE_OWNER');
  const calls=f.registerCalls,result=await f.service.synchronizeAppPages();
  assert.deepEqual(result.retired,['app.page-fixture']);assert.equal(f.native.size,0);assert.equal(f.registerCalls,calls);
});
test('standalone Page entry cannot claim app identity or independently manage companion',async()=>{
  const f=await appFixture();
  await fails(()=>f.service.importPageInstallPackage({package:f.tool.pageModule,expectedInstalledManifestHash:null,expectedGeneration:null},{}),'E_APP_PAGE_OWNER');
  await fails(()=>f.service.installPageProgram({programId:'app.page-fixture'},{}),'E_APP_PAGE_OWNER');
  await f.installApp();const row=f.appRow(),request={programId:row.programId,manifestHash:row.manifestHash,
    installationId:row.authorization.installationId,expectedGeneration:row.authorization.generation};
  await fails(()=>f.service.setInstalledPageEnabled({...request,enabled:true},{}),'E_APP_PAGE_OWNER');
  await fails(()=>f.service.uninstallPageProgram(request,{}),'E_APP_PAGE_OWNER');
});
test('exact document, nonce, world and session fence bridge and fixed Sidebar dispatch',async()=>{
  const f=await appFixture();await f.installApp();await f.bootApp();
  assert.deepEqual(await f.service.requestAppPage({...f.owner,target:f.target,operation:'read',payload:{x:1}},{}),{operation:'read',payload:{x:1}});
  for(const change of [{receiptNonce:'forged'},{worldId:'MAIN'},{executionKey:'missing'}])
    await fails(()=>f.bridge('authorize',{},change),'E_PAGE_AUTHORIZATION');
  await fails(()=>f.service.requestAppPage({...f.owner,target:{...f.target,documentId:'other'},operation:'read',payload:{}},{}),'E_PAGE_AUTHORIZATION');
  f.sender.url='https://evil.example/';await fails(()=>f.bridge('authorize'),'E_DOCUMENT_STALE');f.sender.url=f.target.expectedUrl;
  f.navigate('new-doc');await fails(()=>f.bridge('authorize'),'E_PAGE_AUTHORIZATION');
});
for(const url of ['https://example.com/demo#heading','https://example.com/history?view=2'])
  test('same-document bridge accepts current approved URL '+url+' while Sidebar target stays exact',async()=>{
    const f=await appFixture();await f.installApp();await f.bootApp();
    const injectionUrl=f.sender.url;f.currentUrl=url;
    assert.equal((await f.bridge('authorize')).ready,true);
    assert.equal((await f.bridge('readContext')).locale,'en');
    assert.equal(f.sender.url,injectionUrl,'Chrome sender retains injection-time URL');
    const request={...f.owner,target:{...f.target},operation:'read',payload:{}};
    const calls=f.executeCalls;
    await fails(()=>f.service.requestAppPage(request,{}),'E_DOCUMENT_STALE');
    assert.equal(f.executeCalls,calls,'stale Sidebar URL must not dispatch');
    assert.deepEqual(await f.service.requestAppPage({...request,target:{...f.target,expectedUrl:url}},{}),
      {operation:'read',payload:{}});
    f.sender.url='https://evil.example/demo';
    await fails(()=>f.bridge('authorize'),'E_DOCUMENT_STALE');
  });
for(const url of ['https://example.com/outside','https://example.com/demo/excluded'])
  test('same-document bridge rejects no longer approved URL '+url,async()=>{
    const f=await appFixture({matches:['https://example.com/demo*'],excludeMatches:['https://example.com/demo/excluded*']});
    await f.installApp();await f.bootApp();f.currentUrl=url;
    await fails(()=>f.bridge('authorize'),'E_DOCUMENT_STALE');
    await fails(()=>f.bridge('readContext'),'E_DOCUMENT_STALE');
  });
test('bridge rejects real document replacement even with the original sender and URL',async()=>{
  const f=await appFixture();await f.installApp();await f.bootApp();
  const originalSender={...f.sender};f.navigate('replacement-document');Object.assign(f.sender,originalSender);
  await fails(()=>f.bridge('authorize'),'E_DOCUMENT_STALE');
});
for(const url of ['https://example.com/history#heading','https://example.com/outside','https://example.com/demo/excluded'])
  test('bridge reauthorizes current URL during storage read '+url,async()=>{
    const f=await appFixture({matches:['https://example.com/demo*','https://example.com/history*'],
      excludeMatches:['https://example.com/demo/excluded*']});
    await f.installApp();await f.bootApp();
    const get=f.api.storage.local.get;
    f.api.storage.local.get=async keys=>{
      const value=await get(keys);
      if(keys===sidebarToolStorageKey(f.tool.id))f.currentUrl=url;
      return value;
    };
    if(url.includes('/history'))assert.deepEqual(await f.bridge('storage.get',{key:'settings'}),
      {value:null,etag:await appPageEtag(null)});
    else await fails(()=>f.bridge('storage.get',{key:'settings'}),'E_DOCUMENT_STALE');
  });
test('Sidebar dispatch rejects a same-document URL change after execution',async()=>{
  const f=await appFixture();await f.installApp();await f.bootApp();
  const execute=f.api.userScripts.execute,calls=f.executeCalls;
  f.api.userScripts.execute=async input=>{
    const result=await execute(input);f.currentUrl='https://example.com/demo#changed';return result;
  };
  await fails(()=>f.service.requestAppPage({...f.owner,target:{...f.target},operation:'read',payload:{}},{}),'E_DOCUMENT_STALE');
  assert.equal(f.executeCalls,calls+1,'request dispatched once before the post-execution URL fence');
});
test('private storage shares canonical Sidebar etags, limits and tool lock; context uses real localization',async()=>{
  const f=await appFixture();await f.installApp();await f.bootApp();
  f.local['opendesk.ui.locale.v1']='ja';
  const context=await f.bridge('readContext');assert.equal(context.locale,'ja');assert.equal(context.catalog.sourceLocale,'en');
  assert.equal(context.catalog.messages.en.hello,'Hello');assert.equal(context.catalog.messages.ja.hello,'こんにちは');
  const locks=[],lockManager={request:async(name,work)=>{locks.push(name);return work();}};
  const run=(operation,payload)=>appPageStorage({api:f.api,owner:f.owner,operation,payload,authorize:()=>f.bridge('authorize'),lockManager});
  const first=await run('storage.get',{key:'settings',withEtag:true});
  const saved=await run('storage.set',{key:'settings',value:{z:2,a:1},ifMatch:first.etag});
  assert.equal(saved.confirmed,true);assert.equal(saved.etag,await appPageEtag({a:1,z:2}));
  assert.deepEqual(locks,['opendesk.sidebar-tools:tool:page-fixture']);
  await fails(()=>run('storage.set',{key:'settings',value:1,ifMatch:first.etag}),'E_STORAGE_CONFLICT');
  await fails(()=>run('storage.set',{key:'other',value:'x'.repeat(8192),ifMatch:first.etag}),'E_TOOL_DATA_LIMIT');
  await fails(()=>run('storage.get',{key:'__proto__'}),'E_SCHEMA');
  assert.deepEqual(Object.keys(f.local[sidebarToolStorageKey(f.tool.id)]),['settings']);
});
test('managed retirement disposes global, removes handler and rejects late delivery',async()=>{
  const context=vm.createContext({setTimeout,clearTimeout});
  const result=await vm.runInContext('(async()=>{const managed=('+installManagedUILifecycle.toString()+')("nonce");'+
    'const runtime=('+installAppPageRuntime.toString()+')({receiptNonce:"nonce"},managed,async()=>({ok:true,data:{ready:true}}));'+
    'OpenDeskAppPage.onRequest(()=>42);const before=await runtime.dispatch("nonce","read",{});await managed.retire("retire");'+
    'let code;try{await OpenDeskAppPage.readContext();}catch(e){code=e.code;}'+
    'let dispatch;try{await runtime.dispatch("nonce","read",{});}catch(e){dispatch=e.code;}return {before,code,dispatch};})()',context);
  assert.equal(result.before,42);assert.equal(result.code,'E_DISPOSED');assert.equal(result.dispatch,'E_DISPOSED');
});

test('disabled parent installs a bound disabled companion and verifies without enabling',async()=>{
  const f=await appFixture();f.local[SIDEBAR_TOOL_ENABLE_STORE]={[f.tool.id]:false};
  const receipt=await f.installApp();assert.equal(receipt.nativeState,'disabled');assert.equal(receipt.ready,true);
  assert.equal(f.appRow().enabled,false);assert.equal(f.appRow().authorization.status,'disabled');assert.equal(f.native.size,0);
  assert.equal((await f.service.verifyAppPage(f.owner,{})).nativeState,'disabled');
  await fails(()=>f.bootApp(),'E_PERMISSION');
  await fails(()=>f.service.requestAppPage({...f.owner,target:f.target,operation:'read',payload:{}},{}),'E_APP_PAGE_OWNER');
});
test('storage capability is required; readContext cannot disclose undeclared private storage',async()=>{
  const f=await appFixture();f.tool.capabilities=['page.module'];f.local[SIDEBAR_TOOL_STORE]=[f.tool];
  f.owner.packageHash=await sidebarToolPackageHash(f.tool);
  f.local[sidebarToolStorageKey(f.tool.id)]={private:'hidden'};
  await f.installApp();await f.bootApp();
  assert.deepEqual((await f.bridge('readContext')).data,{});
  for(const operation of ['storage.get','storage.set'])await fails(()=>f.bridge(operation,{key:'private'}),'E_CAPABILITY');
});
test('named world frozen global dispatch survives separate native executions and carries long TOC responses',async()=>{
  const f=await appFixture();await f.installApp();await f.bootApp();
  const execution=f.rows().find(row=>row.tag==='page-execution-v1'),context=f.contexts.get(execution.managedUI.worldId);
  const property=vm.runInContext('Object.getOwnPropertyDescriptor(globalThis,"__opendeskAppPageRuntimeV1")',context);
  assert.equal(property.writable,false);assert.equal(property.configurable,false);assert.equal(Object.isFrozen(property.value),true);
  // This is a second native-world evaluation after the real compiled bootstrap.
  vm.runInContext('OpenDeskAppPage.onRequest(()=>({toc:"x".repeat(85000)}))',context);
  const value=await f.service.requestAppPage({...f.owner,target:f.target,operation:'toc.read',payload:{}},{});
  assert.equal(value.toc.length,85000);
  vm.runInContext('OpenDeskAppPage.onRequest(()=>({toc:"x".repeat(131072)}))',context);
  await fails(()=>f.service.requestAppPage({...f.owner,target:f.target,operation:'toc.read',payload:{}},{}),'E_LIMIT');
});
test('synchronize completes before explicit replacement import without tool Web Lock recursion',async()=>{
  const f=await appFixture();await f.installApp();
  f.local[TOOL_REVOCATION_EPOCHS_STORE][f.tool.id]='epoch-2';
  assert.deepEqual((await f.service.synchronizeAppPages({toolId:f.tool.id})).retired,['app.page-fixture']);
  f.owner.installEpoch='epoch-2';assert.equal((await f.installApp()).nativeState,'registered');
  assert.deepEqual(f.appRow().appOwner,f.owner);
});
test('stale browser session cannot use old companion bridge',async()=>{
  const f=await appFixture();await f.installApp();await f.bootApp();
  const execution=f.rows().find(row=>row.tag==='page-execution-v1');
  await f.storage.transaction(['frameworkKV'],'readwrite',tx=>tx.put('frameworkKV',
    {...execution,browserSessionIncarnation:'old-session'},execution.executionKey));
  await fails(()=>f.bridge('authorize'),'E_PAGE_AUTHORIZATION');
});
test('synchronization retires the actual managed bridge and retains uncertain cleanup',async()=>{
  const f=await appFixture();f.retireHook=f.previewExecutor.retireInstalled;
  await f.installApp();await f.bootApp();
  const execution=f.rows().find(row=>row.tag==='page-execution-v1'),context=f.contexts.get(execution.managedUI.worldId);
  f.local[SIDEBAR_TOOL_ENABLE_STORE]={[f.tool.id]:false};
  assert.deepEqual((await f.service.synchronizeAppPages()).retired,['app.page-fixture']);
  await assert.rejects(vm.runInContext('OpenDeskAppPage.readContext()',context),{code:'E_DISPOSED'});
  const uncertain=await appFixture();uncertain.retireHook=async()=>({state:'unknown',scope:'managed-ui-only'});
  await uncertain.installApp();await uncertain.bootApp();uncertain.local[SIDEBAR_TOOL_STORE]=[];
  const receipt=await uncertain.service.synchronizeAppPages();assert.deepEqual(receipt.cleanupPending,['app.page-fixture']);
  assert.equal(uncertain.appRow().enabled,false);assert.equal(uncertain.native.size,0);
});
test('request native failure is unknown and never automatically redispatched',async()=>{
  const f=await appFixture();await f.installApp();await f.bootApp();
  const execution=f.rows().find(row=>row.tag==='page-execution-v1'),context=f.contexts.get(execution.managedUI.worldId);
  vm.runInContext('globalThis.effects=0;OpenDeskAppPage.onRequest(()=>{effects++;throw new Error("lost receipt");})',context);
  await fails(()=>f.service.requestAppPage({...f.owner,target:f.target,operation:'mutate',payload:{}},{}),'E_EFFECT_UNKNOWN');
  assert.equal(vm.runInContext('effects',context),1);
});
test('managed retirement waits for an already running request before confirming cleanup',async()=>{
  const context=vm.createContext({setTimeout,clearTimeout});
  const result=await vm.runInContext('(async()=>{const managed=('+installManagedUILifecycle.toString()+')("nonce");'+
    'const runtime=('+installAppPageRuntime.toString()+')({receiptNonce:"nonce"},managed,async()=>({ok:true,data:{ready:true}}));'+
    'let release;OpenDeskAppPage.onRequest(()=>new Promise(done=>{release=done;}));'+
    'const running=runtime.dispatch("nonce","read",{}).catch(e=>e.code);await new Promise(done=>setTimeout(done,0));'+
    'let finished=false;const retirement=managed.retire("retire").then(receipt=>{finished=true;return receipt;});'+
    'await new Promise(done=>setTimeout(done,0));const early=finished;release(42);'+
    'return {early,code:await running,clean:(await retirement).ok};})()',context);
  assert.equal(result.early,false);assert.equal(result.code,'E_DISPOSED');assert.equal(result.clean,true);
});

test('queued synchronization preserves an exact-bound disabled import through verification',async()=>{
  const f=await appFixture();f.retireHook=f.previewExecutor.retireInstalled;
  f.local[SIDEBAR_TOOL_ENABLE_STORE]={[f.tool.id]:false};
  const installed=await f.installApp(),before=structuredClone(f.appRow());
  for(let i=0;i<2;i++){
    assert.deepEqual(await f.service.synchronizeAppPages({toolId:f.tool.id}),
      {status:'synchronized',retired:[],cleanupPending:[]});
    assert.deepEqual(f.appRow(),before,'sync must retain installation identity and disabled authorization');
    assert.deepEqual(await f.service.verifyAppPage(f.owner,{}),{...installed,status:'verified'});
  }
  assert.equal(f.native.size,0);assert.equal(f.registerCalls,0);assert.equal(f.sourceCalls,0);
});

test('disabled companion preservation cannot retain a stale native registration',async()=>{
  const f=await appFixture();f.local[SIDEBAR_TOOL_ENABLE_STORE]={[f.tool.id]:false};
  await f.installApp();const nativeId=f.appRow().nativeId;
  f.native.set(nativeId,{id:nativeId,world:'USER_SCRIPT',js:[{code:'stale bootstrap'}]});
  const result=await f.service.synchronizeAppPages({toolId:f.tool.id});
  assert.deepEqual(result.retired,['app.page-fixture']);assert.equal(f.native.size,0);
  assert.equal(f.registerCalls,0);assert.equal(f.sourceCalls,0);
});

test('disabled companion preservation still rejects mismatched parent epoch',async()=>{
  const f=await appFixture();f.local[SIDEBAR_TOOL_ENABLE_STORE]={[f.tool.id]:false};
  await f.installApp();f.local[TOOL_REVOCATION_EPOCHS_STORE][f.tool.id]='replacement-epoch';
  assert.deepEqual((await f.service.synchronizeAppPages()).retired,['app.page-fixture']);
  assert.equal(f.appRow(),undefined);assert.equal(f.native.size,0);
});

test('unknown managed resource cleanup is not mistaken for an inert companion',async()=>{
  const f=await appFixture();f.retireHook=async()=>({state:'unknown',scope:'managed-ui-only'});
  f.local[SIDEBAR_TOOL_ENABLE_STORE]={[f.tool.id]:false};await f.installApp();
  const result=await f.service.synchronizeAppPages();
  assert.deepEqual(result,{status:'synchronized',retired:[],cleanupPending:['app.page-fixture']});
  assert.equal(f.appRow().enabled,false);assert.equal(f.registerCalls,0);assert.equal(f.sourceCalls,0);
});
