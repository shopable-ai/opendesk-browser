import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {createDependencyManager} from '../../src/scripting/user-scripts/dependency-manager.js';
import {createInstalledPagePrograms,PAGE_BOOT_PROTOCOL,PAGE_BOOT_WORLD} from '../../src/scripting/user-scripts/installed-programs.js';
import {createPreviewAdmission} from '../../src/platform/host/preview-admission.js';
import {createPageScriptPreview} from '../../src/scripting/user-scripts/preview.js';
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
  const f={granted:true,access:true,registerCalls:0,executeCalls:0,previewCalls:0,marker:true,native:new Map(),worlds:[],executionError:null,beforeExecute:null,
    tabReads:0,tabStatus:'complete',framesGone:false,exactDocumentGone:false,documentLifecycle:'active',session:'session'};
  const sessions={},contexts=new Map();
  const assertHost=async()=>{assert.ok(db.get('commandJournal').get('host:host').active);return structuredClone(host);};
  const target={tabId:1,frameId:0,documentId:'web-document',expectedUrl:'https://example.com/demo',expectedWindowId:1};
  const sender={id:'test',documentId:target.documentId,frameId:0,url:target.expectedUrl,tab:{id:1,incognito:false}};
  const api={runtime:{id:'test'},storage:{session:{get:async()=>structuredClone(sessions),set:async value=>Object.assign(sessions,structuredClone(value))}},
    permissions:{contains:async()=>f.granted},tabs:{query:async()=>[{id:1}],get:async()=>{
      if(++f.tabReads===3)await f.beforeExecute?.();
      return {id:1,windowId:1,url:target.expectedUrl,incognito:false,status:f.tabStatus};}},
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
        const result=await vm.runInContext(code,contexts.get(id));
        return [{frameId:0,documentId:target.documentId,result:JSON.parse(JSON.stringify(result))}];
      }
    }};
  const dependencies=createDependencyManager({api,storage,assertHost});
  const admission=createPreviewAdmission({storage,assertHost,currentHost:async()=>{},session:f.session});
  const executor=createPageScriptPreview({api,storage,assertHost,dependencies,admission});
  const preview={preview:async input=>{f.previewCalls++;const row=(await dependencies.readStoredPageCandidate(host.namespace,'script',1)).candidate;
      assert.equal(input.sourceUtf8,row.sourceUtf8);return {state:'preview-evaluated',world:'USER_SCRIPT',sourceHash:row.manifest.sourceHash,tabId:1,documentId:target.documentId,worldId:'preview-world',resultText:'1'};},
    executeInstalled:executor.executeInstalled};
  const make=()=>createInstalledPagePrograms({api,storage,assertHost,dependencies,preview,admission,session:f.session});
  f.service=make();f.restart=()=>{f.service=make();};f.storage=storage;f.dependencies=dependencies;f.target=target;f.sender=sender;
  f.rows=()=>[...db.get('frameworkKV').values()];
  f.installation=()=>f.rows().find(row=>row.tag==='page-installed-v1');
  f.message=()=>{const row=f.installation();f.token=row.token;return {protocol:PAGE_BOOT_PROTOCOL,nativeId:row.nativeId,token:row.token};};
  f.prepare=async(runAt='document-idle')=>{
    const candidate=await dependencies.importPageCandidate({programId:'script',revision:1,entryFormat:'async-main',lockId:null,importSourceUrl:null,
      sourceUtf8:'// ==UserScript==\n// @match https://example.com/*\n// @noframes\n// @run-at '+runAt+'\n// ==/UserScript==\nasync function main(){return 42;}'},{});
    await f.service.verifyPageCandidate({programId:'script',revision:1,target},{});
    await f.service.makePageAvailable({programId:'script',revision:1,manifestHash:candidate.manifestHash},{});
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
  const disabled=await f.service.setInstalledPageEnabled({programId:'script',manifestHash:installed.manifestHash,enabled:false},{});
  assert.equal(disabled.enabled,false);assert.equal(disabled.nativeState,'blocked');
  await fails(()=>f.service.handleBoot(message,f.sender),'E_PERMISSION');assert.equal(f.executeCalls,0);
  f.access=true;f.restart();await f.service.reconcile();assert.equal(f.native.size,0);assert.equal(f.installation().nativeState,'disabled');
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
  await f.service.setInstalledPageEnabled({programId:'script',manifestHash:installed.manifestHash,enabled:false},{});
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
  await f.service.setInstalledPageEnabled({programId:'script',manifestHash:row.manifestHash,enabled:false},{});
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
  const disabled=await f.service.setInstalledPageEnabled({programId:'script',manifestHash:installed.manifestHash,enabled:false},{});
  assert.equal(disabled.enabled,false);assert.equal(f.native.size,0);
  finish();assert.equal((await running).state,'completed');
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
