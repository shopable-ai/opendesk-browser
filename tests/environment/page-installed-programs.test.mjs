import {loadFakeBuiltin} from './builtin-support.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createDependencyManager} from '../../src/scripting/user-scripts/dependency-manager.js';
import {createInstalledPagePrograms,PAGE_BOOT_PROTOCOL,PAGE_BOOT_WORLD} from '../../src/scripting/user-scripts/installed-programs.js';
import {createPreviewAdmission} from '../../src/platform/host/preview-admission.js';
import {createPageScriptPreview} from '../../src/scripting/user-scripts/preview.js';
import {canonical,digest} from '../../src/platform/protocol.js';
import {JQUERY_371} from '../../src/scripting/user-scripts/packaged-dependencies.js';
import {pageInstallScope,pageInstallScopeDelta,pageInstallAffectedByRemoval} from '../../src/scripting/user-scripts/page-install-authorization.js';
globalThis.crypto ||= webcrypto;

// Transaction/native component doubles. These are not real Chrome evidence.
function fixture(){
  let db=new Map(['frameworkKV','commandJournal','runs'].map(name=>[name,new Map()])),queue=Promise.resolve();
  const host={tag:'host',namespace:'tool:test',registrationId:'host',hostDocumentId:'tool-document',hostUrl:'chrome-extension://test/ui/tool.html',
    hostInstanceId:'instance',browserSessionIncarnation:'session',active:true,revoked:false};
  db.get('commandJournal').set('host:host',structuredClone(host));
  const storage={transaction(stores,mode,work){
    const next=queue.then(async()=>{
      const copy=structuredClone(db),table=name=>{assert.ok(stores.includes(name));return copy.get(name);};
      const tx={get:async(name,key)=>structuredClone(table(name).get(key)),all:async name=>[...table(name).values()].map(v=>structuredClone(v)),
        put:async(name,value,key)=>{assert.equal(mode,'readwrite');table(name).set(key,structuredClone(value));},
        delete:async(name,key)=>{assert.equal(mode,'readwrite');table(name).delete(key);}};
      const result=await work(tx);if(mode==='readwrite')db=copy;return result;
    });queue=next.catch(()=>{});return next;
  }};
  const f={granted:true,access:true,registerCalls:0,executeCalls:0,previewCalls:0,permissionRequests:[],marker:true,native:new Map(),worlds:[],executionError:null,beforeExecute:null,
    tabReads:0,tabStatus:'complete',framesGone:false,exactDocumentGone:false,documentLifecycle:'active',session:'session'};
  const sessions={},contexts=new Map();
  const assertHost=async()=>{assert.ok(db.get('commandJournal').get('host:host').active);return structuredClone(host);};
  const target={tabId:1,frameId:0,documentId:'web-document',expectedUrl:'https://example.com/demo',expectedWindowId:1};
  const sender={id:'test',documentId:target.documentId,frameId:0,url:target.expectedUrl,tab:{id:1,incognito:false}};
  const api={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path},storage:{session:{get:async()=>structuredClone(sessions),set:async value=>Object.assign(sessions,structuredClone(value))}},
    permissions:{contains:async()=>f.granted,request:async request=>{f.permissionRequests.push(request);return false;}},tabs:{query:async()=>[{id:1}],get:async()=>{
      if(++f.tabReads===3)await f.beforeExecute?.();
      return {id:1,windowId:1,active:true,url:target.expectedUrl,incognito:false,status:f.tabStatus};}},
    webNavigation:{getAllFrames:async()=>f.framesGone?[]:[{frameId:0,documentId:target.documentId,url:target.expectedUrl}],
      getFrame:async input=>{assert.deepEqual(input,{documentId:target.documentId});if(f.frameObservationError)throw Error('observation failed');
        return f.exactDocumentGone?null:{documentId:target.documentId,documentLifecycle:f.documentLifecycle};}},
    userScripts:{
      getScripts:async filter=>{if(!f.access)throw Error('toggle disabled');return [...f.native.values()].filter(row=>!filter||filter.ids.includes(row.id)).map(v=>structuredClone(v));},
      configureWorld:async config=>f.worlds.push(config),
      getWorldConfigurations:async()=>f.worlds,resetWorldConfiguration:async id=>{f.worlds=f.worlds.filter(row=>row.worldId!==id);},
      register:async scripts=>{f.registerCalls++;scripts.forEach(row=>f.native.set(row.id,structuredClone(row)));},
      unregister:async filter=>{if(!f.access)throw Error('toggle disabled');filter.ids.forEach(id=>f.native.delete(id));},
      execute:async input=>{
        if(input.worldId===PAGE_BOOT_WORLD)return [{frameId:0,documentId:target.documentId,result:f.marker?f.token:null}];
        const code=input.js.at(-1).code,probe=code.includes('__opendesk_probe_');
        if(!probe){f.executeCalls++;if(f.executionError)throw f.executionError;await f.completionGate;}
        const id=input.worldId||'default';if(!contexts.has(id))contexts.set(id,vm.createContext({document:{}}));
        // Optional-library receipt wiring is a component test: only vendor DOM
        // initialization is replaced, after production loader/hash validation.
        if(!probe)f.executedCode=code;
        const executable=f.stubVendorInitialization?code.replace(f.stubVendorInitialization,
          'globalThis.jQuery={fn:{jquery:"3.7.1"}};globalThis.$=globalThis.jQuery;'):code;
        const result=await vm.runInContext(executable,contexts.get(id));
        return [{frameId:0,documentId:target.documentId,result:JSON.parse(JSON.stringify(result))}];
      }
    }};
  const manager=createDependencyManager({api,storage,assertHost});
  f.storedCandidateReads=0;
  const dependencies={...manager,readStoredPageCandidate:async(...args)=>{
    f.storedCandidateReads++;return manager.readStoredPageCandidate(...args);
  }};
  const admission=createPreviewAdmission({storage,assertHost,currentHost:async()=>{},session:f.session});
  const executor=createPageScriptPreview({api,storage,assertHost,dependencies,admission,loadBuiltin:loadFakeBuiltin});
  const preview={preview:async input=>{f.previewCalls++;const row=f.rows().find(row=>row.tag==='page-candidate-v1'&&row.sourceUtf8===input.sourceUtf8);
      assert.equal(input.sourceUtf8,row.sourceUtf8);return {state:'preview-evaluated',world:'USER_SCRIPT',sourceHash:row.manifest.sourceHash,tabId:1,documentId:target.documentId,worldId:'preview-world',resultText:'1',
        ...(f.packagedJquerySha256?{packagedJquerySha256:f.packagedJquerySha256}:{})};},
    executeInstalled:executor.executeInstalled};
  const make=()=>createInstalledPagePrograms({api,storage,assertHost,dependencies,preview,admission,session:f.session});
  f.api=api;f.previewExecutor=executor;f.service=make();f.restart=()=>{
    const restoredAdmission=createPreviewAdmission({storage,assertHost,currentHost:async()=>{},session:f.session});
    const restoredPreview={...preview,executeInstalled:createPageScriptPreview({api,storage,assertHost,dependencies,admission:restoredAdmission,loadBuiltin:loadFakeBuiltin}).executeInstalled};
    f.service=createInstalledPagePrograms({api,storage,assertHost,dependencies,preview:restoredPreview,admission:restoredAdmission,session:f.session});
  };f.storage=storage;f.dependencies=dependencies;f.target=target;f.sender=sender;
  f.rows=()=>[...db.get('frameworkKV').values()];
  f.installation=(programId='script')=>f.rows().find(row=>row.tag==='page-installed-v1'&&row.programId===programId);
  f.message=(programId='script')=>{const row=f.installation(programId);f.token=row.token;return {protocol:PAGE_BOOT_PROTOCOL,nativeId:row.nativeId,token:row.token};};
  f.navigate=documentId=>{target.documentId=documentId;sender.documentId=documentId;contexts.clear();f.tabReads=0;};
  f.prepare=async(runAt='document-idle',{programId='script',revision=1,site='https://example.com/*',sourceUtf8}={})=>{
    const candidate=await dependencies.importPageCandidate({programId,revision,entryFormat:'async-main',lockId:null,importSourceUrl:null,
      sourceUtf8:sourceUtf8??'// ==UserScript==\n// @match '+site+'\n// @noframes\n// @run-at '+runAt+'\n// ==/UserScript==\nasync function main(){return '+(41+revision)+';}'},{});
    await f.service.verifyPageCandidate({programId,revision,target},{});
    await f.service.makePageAvailable({programId,revision,manifestHash:candidate.manifestHash},{});
    return candidate;
  };
  f.install=async()=>{const candidate=await f.prepare();return f.service.installPageProgram({programId:'script',revision:1,manifestHash:candidate.manifestHash,expectedInstalledManifestHash:null},{});};
  f.pending=async(state='dispatched')=>{
    const row=f.installation(),executionKey='pending-execution',receipt={tag:'page-execution-v1',namespace:host.namespace,
      executionKey,receiptId:'receipt',programId:row.programId,revision:row.revision,manifestHash:row.manifestHash,sourceHash:row.sourceHash,
      browserSessionIncarnation:f.session,installationToken:row.token,tabId:1,documentId:target.documentId,
      state,createdAt:1,receiptNonce:'pending-nonce'};
    await storage.transaction(['frameworkKV','runs'],'readwrite',async tx=>{
      await tx.put('frameworkKV',receipt,executionKey);
      await tx.put('runs',{tag:'slot',currentRunId:null,preview:{nonce:receipt.receiptNonce,tabId:1,documentId:target.documentId,
        installedProgramId:row.programId,executionKey,browserSessionIncarnation:f.session}},'@slot');
    });return receipt;
  };
  return f;
}
const fails=(work,code)=>assert.rejects(work,error=>error.code===code);

test('twenty installed automatic documents reuse one durable program authorization without any permission request',async()=>{
  const f=fixture(),installed=await f.install(),grant=structuredClone(installed.authorization);
  for(let n=1;n<=20;n++){
    f.navigate('automatic-document-'+n);
    assert.equal((await f.service.handleBoot(f.message(),f.sender)).state,'completed');
  }
  const executions=f.rows().filter(row=>row.tag==='page-execution-v1');
  assert.equal(executions.length,20);assert.equal(f.executeCalls,20);assert.equal(f.permissionRequests.length,0);
  assert.equal(new Set(executions.map(row=>row.documentId)).size,20);
  assert.ok(executions.every(row=>row.installationId===grant.installationId&&row.grantGeneration===grant.generation));
  f.restart();await f.service.reconcile();assert.deepEqual(f.installation().authorization,grant);
  f.session='second-browser';f.native.clear();f.restart();await f.service.reconcile();
  assert.deepEqual(f.installation().authorization,grant);assert.equal(f.executeCalls,20);
  f.navigate('new-browser-document');
  assert.equal((await f.service.handleBoot(f.message(),f.sender)).state,'completed');
  assert.equal(f.executeCalls,21);assert.equal(f.permissionRequests.length,0);
});

test('old jQuery receipts cannot approve a changed environment; a new verified version reuses the installation grant',async t=>{
  const jqueryCode=await readFile('src/libs/vendor/jquery/3.7.1/jquery.min.js','utf8');
  t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(url,'chrome-extension://test/'+JQUERY_371.path);
    return {ok:true,text:async()=>jqueryCode};
  });
  const sourceUtf8='// @opendesk-lib jquery\nasync function main(){return typeof jQuery;}';
  for(const mismatch of ['missing','different']){
    const f=fixture();f.packagedJquerySha256=JQUERY_371.sha256;
    const candidate=await f.prepare('document-idle',{sourceUtf8});
    const installed=await f.service.installPageProgram({programId:'script',revision:1,
      manifestHash:candidate.manifestHash,expectedInstalledManifestHash:null},{}),oldBoot=f.message();
    const proofKey='page-verification:'+canonical(['tool:test','script',1]);
    const oldProof=structuredClone(f.rows().find(row=>row.tag==='page-verification-v1'));
    if(mismatch==='missing')delete oldProof.receipt.packagedJquerySha256;
    else oldProof.receipt.packagedJquerySha256='0'.repeat(64);
    // This is a self-consistent historical receipt, not a broken receipt hash.
    oldProof.receiptHash=await digest(oldProof.receipt);
    await f.storage.transaction(['frameworkKV'],'readwrite',tx=>tx.put('frameworkKV',oldProof,proofKey));
    await fails(()=>f.service.verifyPageCandidate({programId:'script',revision:1,target:f.target},{}),'E_PAGE_ENVIRONMENT');
    assert.equal(f.previewCalls,1,'an old fixed receipt is neither overwritten nor silently re-executed');
    await fails(()=>f.service.makePageAvailable({programId:'script',revision:1,manifestHash:candidate.manifestHash},{}),'E_PAGE_ENVIRONMENT');
    await fails(()=>f.service.installPageProgram({programId:'script',revision:1,manifestHash:candidate.manifestHash,
      expectedInstalledManifestHash:installed.manifestHash,expectedGeneration:installed.authorization.generation},{}),'E_PAGE_ENVIRONMENT');
    await fails(()=>f.service.setInstalledPageEnabled({programId:'script',manifestHash:installed.manifestHash,
      expectedGeneration:installed.authorization.generation,enabled:true},{}),'E_PAGE_ENVIRONMENT');
    if(mismatch==='missing'){f.restart();await f.service.reconcile();}
    else await fails(()=>f.service.handleBoot(oldBoot,f.sender),'E_PAGE_ENVIRONMENT');
    const suspended=structuredClone(f.installation());
    assert.equal(suspended.authorization.status,'suspended');assert.notEqual(suspended.token,oldBoot.token);
    assert.equal(suspended.authorization.generation,installed.authorization.generation+1);
    assert.equal(f.native.size,0);assert.equal(f.executeCalls,0);
    assert.equal(f.rows().filter(row=>row.tag==='page-execution-v1').length,0);
    f.restart();await f.service.reconcile();
    assert.deepEqual(f.installation().authorization,suspended.authorization);
    await fails(()=>f.service.handleBoot(oldBoot,f.sender),'E_PERMISSION');
    const next=await f.prepare('document-idle',{revision:2,sourceUtf8});
    assert.equal(f.installation().authorization.status,'suspended','Verify/Available cannot reactivate the old installation');
    const restored=await f.service.installPageProgram({programId:'script',revision:2,manifestHash:next.manifestHash,
      expectedInstalledManifestHash:suspended.manifestHash,expectedGeneration:suspended.authorization.generation},{});
    assert.equal(restored.authorization.installationId,installed.authorization.installationId);
    assert.equal(restored.authorization.approvedAt,installed.authorization.approvedAt);
    assert.equal(restored.authorization.status,'active');
    assert.deepEqual(f.rows().find(row=>row.tag==='page-verification-v1'&&row.revision===1),oldProof);
    await fails(()=>f.service.handleBoot(oldBoot,f.sender),'E_PERMISSION');
    assert.equal(f.executeCalls,0,'installation does not replay a previous document');
    assert.equal(f.permissionRequests.length,0);
  }
});

test('new jQuery verification cannot persist a receipt without the trusted compiled environment hash',async()=>{
  for(const value of [undefined,'0'.repeat(64)]){
    const f=fixture();f.packagedJquerySha256=value;
    await fails(()=>f.prepare('document-idle',{
      sourceUtf8:'// @opendesk-lib jquery\nasync function main(){return 1;}'}),'E_PAGE_ENVIRONMENT');
    assert.equal(f.rows().filter(row=>row.tag==='page-verification-v1').length,0);
    assert.equal(f.installation(),undefined);assert.equal(f.permissionRequests.length,0);
  }
});

test('preview environment evidence comes from verified compiler bytes, not UI fields or user return values',async t=>{
  const jqueryCode=await readFile('src/libs/vendor/jquery/3.7.1/jquery.min.js','utf8');
  t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(url,'chrome-extension://test/'+JQUERY_371.path);
    return {ok:true,text:async()=>jqueryCode};
  });
  const f=fixture();f.stubVendorInitialization=jqueryCode;
  const request={sourceUtf8:'// @opendesk-lib jquery\nasync function main(){return {packagedJquerySha256:"forged",version:jQuery.fn.jquery};}',
    entryFormat:'async-main',lockId:null,target:f.target};
  await fails(()=>f.previewExecutor.preview({...request,packagedJquerySha256:JQUERY_371.sha256},{}),'E_SCHEMA');
  assert.equal(f.executeCalls,0);
  const receipt=await f.previewExecutor.preview(request,{});
  assert.equal(receipt.packagedJquerySha256,JQUERY_371.sha256);
  assert.deepEqual(JSON.parse(receipt.resultText),{packagedJquerySha256:'forged',version:'3.7.1'});
  assert.ok(f.executedCode.includes(jqueryCode));assert.equal(f.executeCalls,1);
  assert.equal(f.permissionRequests.length,0);
});

test('revocation refuses automatic execution; explicit restore rotates authorization and never revives old boot messages',async()=>{
  const f=fixture(),installed=await f.install(),old=f.message();
  f.granted=false;await f.service.revokePermissions({origins:['https://example.com/*']});
  const revoked=f.installation();assert.equal(revoked.authorization.status,'suspended');
  await fails(()=>f.service.handleBoot(old,f.sender),'E_PERMISSION');assert.equal(f.executeCalls,0);
  f.granted=true;f.restart();await f.service.reconcile();
  assert.equal(f.installation().authorization.status,'suspended');assert.equal(f.native.size,0,'Chrome onAdded alone cannot restore a program');
  const restored=await f.service.setInstalledPageEnabled({programId:'script',manifestHash:installed.manifestHash,
    expectedGeneration:revoked.authorization.generation,enabled:true},{});
  assert.equal(restored.authorization.status,'active');assert.equal(restored.authorization.installationId,installed.authorization.installationId);
  assert.equal(f.executeCalls,0,'restore must not replay a previous document');
  await fails(()=>f.service.handleBoot(old,f.sender),'E_PERMISSION');
  f.navigate('explicitly-restored-document');
  assert.equal((await f.service.handleBoot(f.message(),f.sender)).state,'completed');
  assert.equal(f.permissionRequests.length,0);
});

test('observed Chrome access loss without an onRemoved event suspends old boots until explicit restore',async()=>{
  for(const kind of ['user-scripts','website']){
    const f=fixture();await f.install();const old=f.message();
    if(kind==='user-scripts')f.access=false;else f.granted=false;
    await fails(()=>f.service.handleBoot(old,f.sender),kind==='user-scripts'?'E_USER_SCRIPTS_UNAVAILABLE':'E_PERMISSION');
    assert.equal(f.installation().authorization.status,'suspended');
    f.access=f.granted=true;await fails(()=>f.service.handleBoot(old,f.sender),'E_PERMISSION');
    const row=f.installation();await f.service.setInstalledPageEnabled({programId:row.programId,manifestHash:row.manifestHash,
      expectedGeneration:row.authorization.generation,enabled:true},{});
    assert.equal(f.executeCalls,0);f.navigate('new-restored-document');
    assert.equal((await f.service.handleBoot(f.message(),f.sender)).state,'completed');assert.equal(f.permissionRequests.length,0);
  }
});

test('same-scope upgrade reuses Chrome grant and installation identity; stale update and disable receipts cannot revive it',async()=>{
  const f=fixture(),installed=await f.install(),old=f.message(),candidate=await f.prepare('document-idle',{revision:2});
  const request={programId:'script',revision:2,manifestHash:candidate.manifestHash,
    expectedInstalledManifestHash:installed.manifestHash,expectedGeneration:installed.authorization.generation};
  const upgraded=await f.service.installPageProgram(request,{});
  assert.equal(upgraded.authorization.installationId,installed.authorization.installationId);
  assert.equal(upgraded.authorization.approvedAt,installed.authorization.approvedAt);
  assert.equal(upgraded.authorization.generation,installed.authorization.generation+1);
  assert.equal(f.permissionRequests.length,0);await fails(()=>f.service.installPageProgram(request,{}),'E_REVISION');
  await fails(()=>f.service.handleBoot(old,f.sender),'E_PERMISSION');
  const current=f.message();
  const disabled=await f.service.setInstalledPageEnabled({programId:'script',manifestHash:upgraded.manifestHash,
    expectedGeneration:upgraded.authorization.generation,enabled:false},{});
  await fails(()=>f.service.setInstalledPageEnabled({programId:'script',manifestHash:upgraded.manifestHash,
    expectedGeneration:upgraded.authorization.generation,enabled:true},{}),'E_REVISION');
  await f.service.setInstalledPageEnabled({programId:'script',manifestHash:upgraded.manifestHash,
    expectedGeneration:disabled.authorization.generation,enabled:true},{});
  await fails(()=>f.service.handleBoot(current,f.sender),'E_PERMISSION');assert.equal(f.executeCalls,0);
});

test('two installed programs keep independent authorization and cannot combine native id with another program token',async()=>{
  const f=fixture(),a=await f.install(),candidate=await f.prepare('document-idle',{programId:'second'});
  const b=await f.service.installPageProgram({programId:'second',revision:1,manifestHash:candidate.manifestHash,expectedInstalledManifestHash:null},{});
  assert.notEqual(a.authorization.installationId,b.authorization.installationId);
  const ma=f.message(),mb=f.message('second');
  await fails(()=>f.service.handleBoot({...ma,token:mb.token},f.sender),'E_PERMISSION');
  await f.service.setInstalledPageEnabled({programId:'second',manifestHash:b.manifestHash,expectedGeneration:b.authorization.generation,enabled:false},{});
  assert.equal((await f.service.handleBoot(f.message(),f.sender)).state,'completed');
  await fails(()=>f.service.handleBoot(mb,f.sender),'E_PERMISSION');
  assert.deepEqual(f.rows().filter(row=>row.tag==='page-execution-v1').map(row=>row.programId),['script']);
  assert.equal(f.permissionRequests.length,0);
});

test('legacy Page migration requires the original fixed source and verified installation, without new rights',async()=>{
  for(const invalid of [false,true]){
    const f=fixture();await f.install();const row=structuredClone(f.installation()),token=row.token;delete row.authorization;
    if(invalid)row.sourceHash='0'.repeat(64);
    await f.storage.transaction(['frameworkKV'],'readwrite',tx=>tx.put('frameworkKV',row,'page-installed:'+canonical([row.namespace,row.programId])));
    f.restart();await f.service.reconcile();
    const current=f.installation();assert.equal(f.executeCalls,0);assert.equal(f.permissionRequests.length,0);
    if(invalid){assert.equal(current.authorization,undefined);assert.equal(current.nativeState,'blocked');assert.equal(f.native.size,0);}
    else{assert.equal(current.authorization.status,'active');assert.deepEqual(current.authorization.scope.capabilities,['page.dom']);
      assert.deepEqual(current.authorization.scope.networkOrigins,[]);assert.equal(current.token,token);
      assert.equal((await f.service.handleBoot(f.message(),f.sender)).state,'completed');}
  }
});

test('revocation during late installed authorization retains the observed effect but denies successful delivery',{timeout:3000},async()=>{
  const f=fixture(),installed=await f.install();let entered,release,afterExecution=0;
  const reached=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve),contains=f.api.permissions.contains;
  f.api.permissions.contains=async request=>{const answer=await contains(request);
    if(f.executeCalls&&++afterExecution===2){entered();await gate;}return answer;};
  const running=f.service.handleBoot(f.message(),f.sender);await reached;
  await f.service.setInstalledPageEnabled({programId:'script',manifestHash:installed.manifestHash,
    expectedGeneration:f.installation().authorization.generation,enabled:false},{});
  release();await fails(()=>running,'E_PERMISSION');
  const execution=f.rows().find(row=>row.tag==='page-execution-v1');
  assert.equal(f.executeCalls,1);assert.equal(execution.state,'failed');assert.equal(execution.result,null);
  assert.equal(execution.effectConfirmed,true);assert.equal(execution.error.effectConfirmed,true);
});

test('scope expansion includes removed exclusions and frame timing; revocation uses Chrome host rather than port boundaries',()=>{
  const rules={matches:['https://example.com/*'],excludeMatches:['https://example.com/private/*'],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
  const before=pageInstallScope(rules);
  assert.equal(pageInstallScopeDelta(before,pageInstallScope({...rules,excludeMatches:[...rules.excludeMatches,'https://example.com/admin/*']})).requiresConfirmation,false);
  const expanded=pageInstallScopeDelta(before,pageInstallScope({...rules,matches:[...rules.matches,'https://other.example/*'],excludeMatches:[],allFrames:true}));
  assert.equal(expanded.requiresConfirmation,true);assert.deepEqual(expanded.addedSites,['https://other.example/*']);
  assert.deepEqual(expanded.removedExclusions,rules.excludeMatches);assert.equal(expanded.changedExecution,true);
  for(const [installed,removed] of [['http://localhost:43111/*','http://localhost/*'],['https://example.com:8443/*','https://example.com/*'],
    ['http://[::1]:43111/*','http://[::1]/*'],['https://*.example.com:8443/*','https://a.example.com/*']])
    assert.equal(pageInstallAffectedByRemoval({...rules,matches:[installed]},{origins:[removed]}),true);
  assert.equal(pageInstallAffectedByRemoval(rules,{origins:['https://unrelated.example/*']}),false);
  assert.equal(pageInstallAffectedByRemoval(rules,{permissions:['userScripts']}),true);
});

test('Candidate remains immutable; verification and native registration are distinct, source is absent from bootstrap',async()=>{
  const f=fixture(),installed=await f.install();
  assert.equal(installed.nativeState,'registered');assert.equal(f.previewCalls,1);assert.equal(f.executeCalls,0);
  const candidate=f.rows().find(r=>r.tag==='page-candidate-v1');assert.equal(candidate.stage,'Candidate');assert.equal(candidate.verification,null);
  const actual=[...f.native.values()][0];assert.equal(actual.world,'USER_SCRIPT');assert.equal(actual.worldId,PAGE_BOOT_WORLD);
  assert.ok(!actual.js[0].code.includes('async function main'));assert.deepEqual(actual.matches,['https://example.com/*']);
  const result=await f.service.handleBoot(f.message(),f.sender);assert.equal(result.state,'completed');assert.equal(f.executeCalls,1);
  assert.equal(f.rows().find(r=>r.tag==='page-execution-v1').sourceHash,candidate.manifest.sourceHash);
});
test('forged verification fields, stale CAS, denied permission and disabled Chrome toggle cannot be reported installed',async()=>{
  const f=fixture(),candidate=await f.prepare();
  await fails(()=>f.service.verifyPageCandidate({programId:'script',revision:1,target:f.target,receipt:{}},{}),'E_SCHEMA');
  await fails(()=>f.service.installPageProgram({programId:'script',revision:1,manifestHash:candidate.manifestHash,expectedInstalledManifestHash:'wrong'},{}),'E_REVISION');
  f.granted=false;
  await fails(()=>f.service.installPageProgram({programId:'script',revision:1,manifestHash:candidate.manifestHash,expectedInstalledManifestHash:null},{}),'E_PERMISSION');
  assert.equal(f.native.size,0);f.granted=true;f.access=false;
  const installed=await f.service.installPageProgram({programId:'script',revision:1,manifestHash:candidate.manifestHash,expectedInstalledManifestHash:null},{});
  assert.equal(installed.nativeState,'blocked');assert.equal(installed.error.code,'E_USER_SCRIPTS_UNAVAILABLE');
});
test('untrusted messages need authentic sender, current grant and exact native document bootstrap marker',async()=>{
  const f=fixture();await f.install();const message=f.message();
  await fails(()=>f.service.handleBoot({...message,sourceUtf8:'evil'},f.sender),'E_SCHEMA');
  await fails(()=>f.service.handleBoot(message,{...f.sender,id:'other'}),'E_OWNER');
  await fails(()=>f.service.handleBoot(message,{...f.sender,documentId:'wrong'}),'E_DOCUMENT_STALE');
  f.marker=false;await fails(()=>f.service.handleBoot(message,f.sender),'E_PERMISSION');assert.equal(f.executeCalls,0);
});
test('each manifest/document is admitted once; unknown effect is retained across service restart without replay',async()=>{
  const f=fixture();await f.install();const message=f.message();f.executionError={code:'E_EFFECT_UNKNOWN',message:'lost native reply'};
  await fails(()=>f.service.handleBoot(message,f.sender),'E_EFFECT_UNKNOWN');
  assert.equal(f.rows().find(r=>r.tag==='page-execution-v1').state,'outcome-unknown');
  f.restart();await f.service.reconcile();await fails(()=>f.service.handleBoot(message,f.sender),'E_REQUEST_CONFLICT');
  assert.equal(f.executeCalls,1);assert.equal(f.registerCalls,1);
});
test('disable revokes durable admission before native reconciliation and survives unavailable API plus restart',async()=>{
  const f=fixture(),installed=await f.install(),message=f.message();f.access=false;
  const disabled=await f.service.setInstalledPageEnabled({programId:'script',manifestHash:installed.manifestHash,expectedGeneration:f.installation().authorization.generation,enabled:false},{});
  assert.equal(disabled.enabled,false);assert.equal(disabled.nativeState,'blocked');
  await fails(()=>f.service.handleBoot(message,f.sender),'E_PERMISSION');assert.equal(f.executeCalls,0);
  f.access=true;f.restart();await f.service.reconcile();assert.equal(f.native.size,0);assert.equal(f.installation().nativeState,'disabled');
});
test('delayed native unregister cannot execute a disabled program or complete disable before registry convergence',{timeout:3000},async()=>{
  const f=fixture();await f.install();
  const candidate=await f.prepare('document-idle',{programId:'B'});
  const installed=await f.service.installPageProgram({programId:'B',revision:1,manifestHash:candidate.manifestHash,
    expectedInstalledManifestHash:null},{});
  const oldBoot=f.message('B');let entered,release,settled=false;
  const arrived=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  const unregister=f.api.userScripts.unregister;
  f.api.userScripts.unregister=async filter=>{
    if(filter.ids.includes(installed.nativeId)){entered();await gate;}
    return unregister(filter);
  };
  const disabling=f.service.setInstalledPageEnabled({programId:'B',manifestHash:installed.manifestHash,
    expectedGeneration:installed.authorization.generation,enabled:false},{});
  disabling.then(()=>{settled=true;},()=>{settled=true;});
  try{
    await arrived;
    const during=f.installation('B'),sourceReads=f.storedCandidateReads;
    assert.equal(during.enabled,false);assert.equal(during.authorization.status,'disabled');
    assert.equal(during.nativeState,'pending');assert.equal(during.authorization.generation,installed.authorization.generation+1);
    assert.notEqual(during.token,oldBoot.token);assert.equal(f.native.has(installed.nativeId),true);
    // Chrome can still inject its old source-free bootstrap during unregister.
    // Neither an old token nor a current token can enter a disabled program.
    await fails(()=>f.service.handleBoot(oldBoot,f.sender),'E_PERMISSION');
    await fails(()=>f.service.handleBoot(f.message('B'),f.sender),'E_PERMISSION');
    assert.equal(f.storedCandidateReads,sourceReads,'Denied bootstrap never retrieves frozen user source');
    assert.equal(f.executeCalls,0);assert.equal(f.rows().filter(row=>row.tag==='page-execution-v1').length,0);
    assert.equal(settled,false,'Disable remains pending while the real native registration remains');
  }finally{release();}
  const disabled=await disabling;
  assert.equal(disabled.nativeState,'disabled');assert.equal(disabled.error,null);
  assert.equal(f.native.has(installed.nativeId),false);assert.equal(settled,true);
  f.navigate('A-after-B-native-removal');
  assert.equal((await f.service.handleBoot(f.message('script'),f.sender)).state,'completed');
  assert.equal(f.rows().filter(row=>row.tag==='page-execution-v1'&&row.programId==='B').length,0);
  assert.equal(f.permissionRequests.length,0);
});
test('startup rebuilds only saved enabled bootstraps and never actively runs an old document',async()=>{
  const f=fixture();await f.install();f.native.clear();f.restart();await f.service.reconcile();
  assert.equal(f.native.size,1);assert.equal(f.executeCalls,0);assert.equal(f.previewCalls,1);
  f.granted=false;await f.service.reconcile();assert.equal(f.native.size,0);assert.equal(f.installation().nativeState,'blocked');
});
test('a queued invocation rechecks disabled grant before user source dispatch',async()=>{
  const f=fixture(),installed=await f.install();let entered,release;
  const arrived=new Promise(r=>entered=r),gate=new Promise(r=>release=r);f.beforeExecute=async()=>{entered();await gate;};
  const run=f.service.handleBoot(f.message(),f.sender);await arrived;
  await f.service.setInstalledPageEnabled({programId:'script',manifestHash:installed.manifestHash,expectedGeneration:f.installation().authorization.generation,enabled:false},{});
  release();await fails(()=>run,'E_PERMISSION');assert.equal(f.executeCalls,0);
});
test('installed executions use the same persisted Authority slot and cannot bypass disable or Controller ownership',async()=>{
  const f=fixture();await f.install();await f.pending('prepared');const row={...f.installation(),executionKey:'pending-execution'};
  const admission=createPreviewAdmission({storage:f.storage,assertHost:async()=>{},currentHost:async()=>{},session:f.session});
  const claim={nonce:'nonce',tabId:1,documentId:'web-document',sourceHash:row.sourceHash};
  await f.storage.transaction(['runs'],'readwrite',tx=>tx.put('runs',{tag:'slot',currentRunId:'controller'},'@slot'));
  await fails(()=>admission.reserveInstalled(claim,row),'E_OWNER');
  await f.storage.transaction(['runs'],'readwrite',tx=>tx.put('runs',{tag:'slot',currentRunId:null},'@slot'));
  await admission.reserveInstalled(claim,row);
  await fails(()=>admission.reserveInstalled({...claim,nonce:'second'},row),'E_OWNER');
  await admission.release({nonce:'nonce'});
  await f.service.setInstalledPageEnabled({programId:'script',manifestHash:row.manifestHash,expectedGeneration:f.installation().authorization.generation,enabled:false},{});
  await fails(()=>admission.reserveInstalled(claim,row),'E_PERMISSION');
});

test('idle auto execution accepts an exact loading document while explicit developer preview remains conservative',async()=>{
  const f=fixture();await f.install();f.tabStatus='loading';
  assert.equal((await f.service.handleBoot(f.message(),f.sender)).state,'completed');
  assert.equal(f.executeCalls,1);assert.equal(f.installation().lastExecution.result.resultText,'42');
});

test('early run-at installs are rejected before saving a persistent grant or registering a bootstrap',async()=>{
  for(const timing of ['document-start','document-end']){
    const f=fixture(),candidate=await f.prepare(timing);
    await fails(()=>f.service.installPageProgram({programId:'script',revision:1,manifestHash:candidate.manifestHash,expectedInstalledManifestHash:null},{}),'E_PAGE_RUN_AT');
    assert.equal(f.installation(),undefined);assert.equal(f.native.size,0);
  }
});

test('disable remains responsive after dispatch while async user completion is pending',async()=>{
  const f=fixture(),installed=await f.install();let finish;
  f.completionGate=new Promise(resolve=>finish=resolve);
  const running=f.service.handleBoot(f.message(),f.sender);
  for(let n=0;n<100&&!f.executeCalls;n++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(f.executeCalls,1);
  const disabled=await f.service.setInstalledPageEnabled({programId:'script',manifestHash:installed.manifestHash,expectedGeneration:f.installation().authorization.generation,enabled:false},{});
  assert.equal(disabled.enabled,false);assert.equal(f.native.size,0);
  finish();await fails(()=>running,'E_PERMISSION');
  assert.equal(f.rows().find(row=>row.tag==='page-execution-v1').state,'failed');
});

test('worker interruption becomes visible unknown state and preserves the live exact slot without replay',async()=>{
  const f=fixture();await f.install();await f.pending();f.restart();await f.service.recoverExecutions();
  assert.equal(f.installation().lastExecution.state,'outcome-unknown');
  assert.equal(f.installation().lastExecution.error.code,'E_EFFECT_UNKNOWN');
  const slot=await f.storage.transaction(['runs'],'readonly',tx=>tx.get('runs','@slot'));
  assert.equal(slot.preview.nonce,'pending-nonce');assert.equal(f.executeCalls,0);
});

test('full browser restart releases only the old Page reservation while retaining unknown outcome',async()=>{
  const f=fixture();await f.install();await f.pending();f.session='new-browser-session';f.exactDocumentGone=true;f.restart();
  await f.service.recoverExecutions();await f.service.reconcile();
  const slot=await f.storage.transaction(['runs'],'readonly',tx=>tx.get('runs','@slot'));
  assert.equal(slot.preview,undefined);assert.equal(f.installation().lastExecution.contextGone,true);
  assert.equal(f.executeCalls,0);assert.equal(f.installation().nativeState,'registered');
});

test('trusted document retirement frees its Page fence; a different Controller reservation is untouched',async()=>{
  const f=fixture();await f.install();await f.pending();f.framesGone=true;f.exactDocumentGone=true;f.restart();await f.service.recoverExecutions();
  assert.equal((await f.storage.transaction(['runs'],'readonly',tx=>tx.get('runs','@slot'))).preview,undefined);
  await f.storage.transaction(['runs'],'readwrite',tx=>tx.put('runs',{tag:'slot',currentRunId:'controller-new'},'@slot'));
  await f.service.recoverExecutions();
  assert.equal((await f.storage.transaction(['runs'],'readonly',tx=>tx.get('runs','@slot'))).currentRunId,'controller-new');
});

test('catalog exposes the installed frozen permission scope when a different candidate revision is selected',async()=>{
  const f=fixture(),installed=await f.install();
  await f.dependencies.importPageCandidate({programId:'script',revision:2,entryFormat:'async-main',lockId:null,importSourceUrl:null,
    sourceUtf8:'// ==UserScript==\n// @match https://other.example/*\n// @noframes\n// ==/UserScript==\nasync function main(){return 2;}'},{});
  const catalog=await f.service.listPagePrograms({},{}),second=catalog.catalog.find(row=>row.revision===2);
  assert.deepEqual(second.pageRules.matches,['https://other.example/*']);
  assert.deepEqual(second.installed.pageRules.matches,['https://example.com/*']);
  assert.equal(second.installed.manifestHash,installed.manifestHash);
});

test('extension session reset and BFCache omission cannot release a surviving exact document',async()=>{
  const f=fixture();await f.install();await f.pending();f.session='reset-by-extension-reload';
  f.framesGone=true;f.documentLifecycle='cached';f.restart();await f.service.recoverExecutions();
  assert.equal((await f.storage.transaction(['runs'],'readonly',tx=>tx.get('runs','@slot'))).preview.nonce,'pending-nonce');
  assert.equal(f.installation().lastExecution.state,'outcome-unknown');
  f.frameObservationError=true;await f.service.recoverExecutions();
  assert.equal((await f.storage.transaction(['runs'],'readonly',tx=>tx.get('runs','@slot'))).preview.nonce,'pending-nonce');
});
