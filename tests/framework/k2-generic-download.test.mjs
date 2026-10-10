import {loadFakeBuiltin} from '../environment/builtin-support.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDownloadService, createHostBlobRegistry, hashArtifactBytes} from '../../src/platform/downloads/index.js';
import {createRunAuthority} from '../../src/platform/host/authority.js';
import {createStorageMethods} from '../../src/platform/storage/repository.js';
import {encodeValue, decodeValue, bytesToBase64} from '../../src/platform/page-port/codec.js';
import {BUDGETS, CONTRACT_VERSION, CONTRACT_HASH} from '../../src/platform/protocol.js';

// Atomic transaction and Chrome callback oracle, not a native disk proof.
function serialStore() {
  let data = new Map(), tail = Promise.resolve();
  const storage = {writes: [], beforeTransaction: null, afterCommit: null, failPut: null,
    transaction(names, mode, body) {
      const operation = tail.then(async () => {
        if (storage.beforeTransaction) await storage.beforeTransaction(names, mode, data);
        const working = structuredClone(data), changes = [];
        const store = name => { assert.ok(names.includes(name)); if (!working.has(name)) working.set(name,new Map()); return working.get(name); };
        const tx = {get: async (n,k) => structuredClone(store(n).get(k)), all: async n => structuredClone([...store(n).values()]),
          put: async (n,v,k) => { assert.equal(mode,'readwrite'); if (storage.failPut?.(n,v,k)) throw new Error('injected transaction abort');
            store(n).set(k,structuredClone(v)); changes.push({store:n,key:k,value:structuredClone(v)}); },
          delete: async (n,k) => { assert.equal(mode,'readwrite'); store(n).delete(k); }};
        const value = await body(tx);
        if (mode === 'readwrite') { data=working; storage.writes.push(...changes); storage.afterCommit?.(value); }
        return value;
      }); tail=operation.catch(()=>{}); return operation;
    }};
  return storage;
}
const event = () => { const listeners=new Set(); return {addListener:f=>listeners.add(f), removeListener:f=>listeners.delete(f),
  emit:value=>{for(const f of listeners)f(value);}, get size(){return listeners.size;}}; };
const errorCode = code => error => error.code === code;

async function fixture(value) {
  if (arguments.length === 0) value={rows:[false,0,null,undefined]};
  const storage=serialStore(), extensionId='abcdefghijklmnopabcdefghijklmnop', calls=[], searches=[], items=new Map(), revoked=[];
  let time=Date.parse('2026-10-03T12:00:00Z'), urlCount=0, callback;
  const api={runtime:{id:extensionId,getURL:p=>`chrome-extension://${extensionId}/${p}`}, downloads:{onCreated:event(),onChanged:event(),
    download(options, cb){calls.push(structuredClone(options));callback=cb;}, search(query, cb){searches.push(structuredClone(query));
      queueMicrotask(()=>cb(structuredClone([...items.values()].filter(item=>query.id === undefined ? item.url===query.url : item.id===query.id))));}},
    permissions:{contains:async()=>true},tabs:{get:async()=>({id:2,incognito:false,url:'https://controller.example/page'}),
      sendMessage(_id,message,_target,cb){queueMicrotask(()=>cb({type:message.type,cancelled:true}));}},
    webNavigation:{getAllFrames:async()=>[{frameId:0,documentId:'page-doc',documentLifecycle:'active',url:'https://controller.example/page'}]},
    userScripts:{getScripts:async()=>[],execute:async()=>[]}};
  const sender={id:extensionId,url:api.runtime.getURL('ui/tool.html'),documentId:'host-doc',frameId:0,documentLifecycle:'active',tab:{id:1,incognito:false}};
  const clock={now:()=>time};Object.assign(storage,createStorageMethods(storage,{clock}));
  const authority=createRunAuthority({loadBuiltin:loadFakeBuiltin,storage,api,session:'browser-session',clock});
  const registration=await authority.registerHost({hostInstanceId:'host-one',claimedContractVersion:CONTRACT_VERSION,claimedContractHash:CONTRACT_HASH},sender);
  const issued=await authority.assertHost(sender,registration.registrationId);
  assert.ok(issued.namespace && issued.principal,'Public unique authority must issue stable namespace/principal');
  const revision=await authority.commitControllerScript({scriptId:'script-one',expectedRevision:0,sourceUtf8:'return params;'},sender);
  const run=await authority.startControllerRun({requestId:'start',scriptId:revision.scriptId,revision:revision.revision,contentHash:revision.contentHash,
    paramsWire:encodeValue(value),target:{mode:'borrowed',tabId:2,frameId:0,documentId:'page-doc'},deadlineAt:time+30000},sender);
  const finished=await authority.finishControllerRun({runId:run.runId,requestId:'finish',status:'succeeded',valueWire:encodeValue(value),workerRetired:true},sender);
  await authority.retireControllerTarget({runId:run.runId},sender);
  const runId=run.runId,resultId=finished.result.resultId;
  const makeService=()=>createDownloadService({storage,api,clock:()=>time,assertHost:authority.assertHost});
  const service=makeService(), registry=createHostBlobRegistry({clock:()=>time,url:{createObjectURL:()=>`blob:chrome-extension://${extensionId}/fresh-${++urlCount}`,
    revokeObjectURL:url=>revoked.push(url)}});
  const rows=n=>storage.transaction([n],'readonly',tx=>tx.all(n));
  const prepare=(extra={},actual=sender)=>service.prepareArtifact({requestId:'artifact-one',runId,resultId,filename:'result.json',format:'typed-json',...extra},actual);
  const attempt=async(artifact,requestId='attempt-one')=>{
    const read=await service.readArtifact({artifactId:artifact.artifactId},sender), blobUrl=registry.create(read.bytes,read.artifact.mime);
    return service.prepareAttempt({requestId,artifactId:artifact.artifactId,blobUrl},sender);
  };
  const native=(a,id=7,state='in_progress',extra={})=>({id,url:a.blobUrl,byExtensionId:extensionId,startTime:new Date(time).toISOString(),state,...extra});
  return {storage,api,clock,sender,authority,registration,runId,resultId,service,makeService,registry,revoked,calls,searches,items,rows,prepare,attempt,native,
    callback:id=>callback(id), advance:ms=>{time+=ms;}, host:async()=> (await rows('commandJournal')).find(r=>r.tag==='host'),
    mutate:async(n,k,f)=>storage.transaction([n],'readwrite',async tx=>{const v=await tx.get(n,k);f(v);await tx.put(n,v,k);})};
}

test('generic APIs prepare committed typed values without templates, Blob creation or native dispatch',async()=>{
  const depth12=Array.from({length:12}).reduce(value=>({child:value}),0);
  for(const value of [undefined,null,false,0,-0,{unicode:'汉字',value:undefined},depth12]){
    const f=await fixture(value), prepared=await f.prepare(), read=await f.service.readArtifact({artifactId:prepared.artifactId},f.sender);
    const json=JSON.parse(new TextDecoder().decode(read.bytes)); assert.deepEqual(decodeValue(json.valueWire),value);
    assert.equal(json.runId,f.runId);assert.equal(json.resultId,f.resultId);assert.equal(await hashArtifactBytes(read.bytes),read.artifact.sha256);
    assert.equal(createHash('sha256').update(read.bytes).digest('hex'),read.artifact.sha256);
    assert.equal(Object.hasOwn(read.artifact,'templateHash'),false);assert.equal(Object.hasOwn(prepared.job,'templateHash'),false);
    assert.equal((await f.rows('templates')).length,0);assert.equal((await f.rows('downloadReceipts')).length,0);assert.equal(f.calls.length,0);
    const duplicate=await f.prepare();assert.equal(duplicate.artifactId,prepared.artifactId);assert.equal((await f.rows('artifacts')).filter(r=>r.tag==='artifact').length,1);
  }
});

test('generic host reads artifact, creates Blob, dispatches once and settles via real callback/listeners/search lifecycle',async()=>{
  const f=await fixture(), p=await f.prepare(), a=await f.attempt(p), detach=f.service.attach(); f.service.attach();
  assert.equal(f.api.downloads.onCreated.size,1);assert.equal(f.api.downloads.onChanged.size,1);
  await assert.rejects(f.service.recordResourceRelease({attemptId:a.attemptId},f.sender),errorCode('E_OWNER'));
  await Promise.all([f.service.dispatchDownload({attemptId:a.attemptId},f.sender),f.service.dispatchDownload({attemptId:a.attemptId},f.sender)]);
  assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],{url:a.blobUrl,filename:'result.json',conflictAction:'uniquify',saveAs:false});
  f.items.set(7,f.native(a));f.callback(7);await f.service.drain();
  let receipt=await f.service.reconcileDownload({attemptId:a.attemptId});assert.equal(receipt.job.state,'delivering');assert.equal(receipt.attempt.downloadId,7);
  assert.equal(receipt.receipt.browserDownloadComplete,false);assert.equal(receipt.receipt.diskHashVerified,false);
  f.items.get(7).state='complete';f.api.downloads.onChanged.emit({id:7,state:{current:'complete'}});await f.service.drain();
  receipt=await f.service.reconcileDownload({attemptId:a.attemptId});assert.equal(receipt.job.state,'delivery_complete');assert.equal(receipt.receipt.browserDownloadComplete,true);
  assert.equal(receipt.receipt.diskHashVerified,false);assert.equal(f.registry.release(receipt.attempt),true);
  const released=await f.service.recordResourceRelease({attemptId:a.attemptId},f.sender);assert.ok(released.resourceReleasedAt);assert.equal(f.revoked.length,1);
  const dispatchIndex=f.storage.writes.findIndex(w=>w.value.attempt?.state==='dispatched');
  const completeIndex=f.storage.writes.findIndex(w=>w.value.receipt?.observedState==='complete');assert.ok(dispatchIndex>=0 && completeIndex>dispatchIndex);
  const pin=(await f.rows('commandJournal')).find(r=>r.tag==='reader-pin'&&r.exportJobId===p.exportJobId);assert.equal(pin.released,true);
  detach();assert.equal(f.api.downloads.onChanged.size,0);
});

test('generic preparation rejects forged namespace, wrong result/principal/current host session and actual sender before writing',async()=>{
  const f=await fixture();
  await assert.rejects(f.prepare({namespace:'forged'}),errorCode('E_SCHEMA'));
  await assert.rejects(f.prepare({resultId:'other-result'}),errorCode('E_OWNER'));
  for(const actual of [{...f.sender,documentId:'other'}, {...f.sender,url:'https://page.example'}, {...f.sender,tab:{id:2}}, {...f.sender,frameId:3}])
    await assert.rejects(f.prepare({},actual),errorCode('E_OWNER'));
  for(const [store,keyField,field] of [['results','resultId','namespace'],['results','resultId','principal']]){
    const g=await fixture();await g.mutate(store,g[keyField],row=>{row[field]='foreign';});await assert.rejects(g.prepare(),errorCode('E_OWNER'));
  }
  const g=await fixture();await g.mutate('commandJournal',`host:${g.registration.registrationId}`,row=>{row.browserSessionIncarnation='foreign';});
  await assert.rejects(g.prepare(),errorCode('E_OWNER'));assert.equal((await g.rows('artifacts')).length,0);assert.equal(g.calls.length,0);
  assert.equal((await f.rows('artifacts')).length,0);assert.equal(f.calls.length,0);
});

test('generic prepare transaction rechecks durable host revocation/result replacement/tombstone and rolls back all writes',async()=>{
  for(const mutation of ['host','result','tombstone','quota']){
    const f=await fixture(), host=await f.host(); let armed=true;
    f.storage.beforeTransaction=async(names,mode,data)=>{if(!armed||mode!=='readwrite'||!names.includes('artifacts'))return;armed=false;
      if(mutation==='host')data.get('commandJournal').get(`host:${host.registrationId}`).revoked=true;
      if(mutation==='result')data.get('results').get(f.resultId).outcome.valueWire=encodeValue('replaced');
      if(mutation==='tombstone')data.get('commandJournal').set(`tombstone:${f.runId}`,{tag:'run-tombstone'});
      if(mutation==='quota')data.get('artifacts')?.clear();
    };
    if(mutation==='quota')f.storage.failPut=(n,v)=>n==='artifacts'&&v.tag==='artifact-chunk';
    await assert.rejects(f.prepare(),mutation==='quota'?/transaction abort/:e=>['E_OWNER','E_REQUEST_CONFLICT','E_TOMBSTONE'].includes(e.code));
    assert.equal((await f.rows('artifacts')).length,0);assert.equal((await f.rows('exportJobs')).length,0);
    assert.equal((await f.rows('commandJournal')).filter(r=>['export-request','export-intent','reader-pin'].includes(r.tag)).length,0);
  }
});

test('generic data uses canonical explicit blocks with exact 8MiB/64 limits and independent integrity checks',async()=>{
  const f=await fixture(), block=bytesToBase64(new Uint8Array(131072).fill(23)), data={mime:'application/octet-stream',blocks:Array(64).fill(block)};
  const p=await f.prepare({format:'data',filename:'binary.bin',data});const read=await f.service.readArtifact({artifactId:p.artifactId},f.sender);
  assert.equal(read.bytes.byteLength,BUDGETS.maxArtifactBytes);assert.equal(read.artifact.chunkKeys.length,64);assert.equal(read.bytes.at(-1),23);
  assert.equal(createHash('sha256').update(read.bytes).digest('hex'),read.artifact.sha256);
  for(const bad of [{mime:data.mime,blocks:Array(65).fill('')},{mime:data.mime,blocks:[bytesToBase64(new Uint8Array(131073),{maxBytes:131073})]},
    {mime:data.mime,blocks:['Zh==']},{mime:'text/html',blocks:['']},{mime:data.mime,blocks:[]}])
    await assert.rejects(f.prepare({requestId:crypto.randomUUID(),format:'data',data:bad}),e=>['E_SCHEMA','E_VALUE_SERIALIZATION','E_LIMIT'].includes(e.code));
  await f.mutate('artifacts',read.artifact.chunkKeys[0],row=>{row.bytes[0]^=1;});
  await assert.rejects(f.service.readArtifact({artifactId:p.artifactId},f.sender),errorCode('E_HASH'));
  await assert.rejects(f.attempt(p),errorCode('E_HASH'));assert.equal(f.calls.length,0);
});

test('generic attempt request dedupes, prevents simultaneous retries and reused/foreign Blob URLs',async()=>{
  const f=await fixture(), p=await f.prepare(), read=await f.service.readArtifact({artifactId:p.artifactId},f.sender), blobUrl=f.registry.create(read.bytes,read.artifact.mime);
  const request={requestId:'attempt-one',artifactId:p.artifactId,blobUrl};
  const [a,b]=await Promise.all([f.service.prepareAttempt(request,f.sender),f.service.prepareAttempt(request,f.sender)]);assert.equal(a.attemptId,b.attemptId);
  await assert.rejects(f.service.prepareAttempt({...request,blobUrl:blobUrl+'changed'},f.sender),errorCode('E_REQUEST_CONFLICT'));
  await assert.rejects(f.service.prepareAttempt({...request,requestId:'two',blobUrl:blobUrl+'fresh'},f.sender),errorCode('E_OWNER'));
  await assert.rejects(f.service.prepareAttempt({...request,requestId:'foreign',blobUrl:'blob:chrome-extension://other/id'},f.sender),errorCode('E_SCHEMA'));
  await f.service.abandonExport({exportJobId:p.exportJobId,explicitUserAction:true},f.sender);
  assert.equal((await f.rows('exportJobs'))[0].state,'abandoned');assert.equal(f.calls.length,0);
});

test('lost prepare response cleanup fences late preparation and never submits a download',async()=>{
  for (const committed of [false,true]) {
    const f=await fixture(), p=await f.prepare(), read=await f.service.readArtifact({artifactId:p.artifactId},f.sender);
    const blobUrl=f.registry.create(read.bytes,read.artifact.mime), request={requestId:'lost-prepare',artifactId:p.artifactId,blobUrl};
    if(committed) await f.service.prepareAttempt(request,f.sender);
    assert.equal(f.registry.releaseUnsubmitted(blobUrl),true);
    const retired=await f.service.retirePreparedArtifact({artifactId:p.artifactId},f.sender);
    assert.equal(retired.attemptIds.length,Number(committed));
    for(const attemptId of retired.attemptIds) await f.service.recordResourceRelease({attemptId},f.sender);
    assert.deepEqual(await f.service.retirePreparedArtifact({artifactId:p.artifactId},f.sender),retired);
    if(!committed) await assert.rejects(f.service.prepareAttempt(request,f.sender),errorCode('E_OWNER'));
    for(const row of await f.rows('downloadReceipts')) if(row.tag==='attempt') assert.equal(row.attempt.state,'abandoned');
    assert.equal(f.calls.length,0);assert.equal(f.registry.resourceSnapshot().blobs,0);
    assert.ok((await f.rows('commandJournal')).filter(r=>r.tag==='reader-pin').every(r=>r.released));
  }
});

test('native host absence retires unsubmitted artifacts; query failure and live hosts preserve them',async()=>{
  for(const observation of ['live','unknown','gone']) {
    const f=await fixture(), p=await f.prepare(), a=await f.attempt(p);
    f.api.runtime.getContexts=async()=>{if(observation==='unknown')throw new Error('native query failed');return observation==='live'?[{documentId:'host-doc'}]:[];};
    await f.service.reconcileHostResources();
    const row=(await f.rows('downloadReceipts')).find(row=>row.tag==='attempt');
    assert.equal(row.attempt.state,observation==='gone'?'abandoned':'prepared');
    assert.equal(!!row.attempt.resourceReleasedAt,observation==='gone');
    assert.equal(f.calls.length,0);
    if(observation==='gone') await assert.rejects(f.service.dispatchDownload({attemptId:a.attemptId},f.sender));
  }
});

test('generic dispatch ACK gap never replays; native mapping unknown and deadline release keep disk hash unverified',async()=>{
  const f=await fixture(),p=await f.prepare(),a=await f.attempt(p);
  f.storage.afterCommit=value=>{if(value?.state==='dispatched')throw new Error('ACK gap after commit');};
  await assert.rejects(f.service.dispatchDownload({attemptId:a.attemptId},f.sender),/ACK gap/);f.storage.afterCommit=null;
  const recovered=f.makeService();await recovered.dispatchDownload({attemptId:a.attemptId},f.sender);assert.equal(f.calls.length,0);
  f.advance(BUDGETS.mappingWindowMs+1);let r=await recovered.reconcileDownload({attemptId:a.attemptId});assert.equal(r.attempt.state,'mapping_unknown');assert.equal(r.receipt,null);
  assert.equal(f.registry.release(r.attempt),false);f.advance(BUDGETS.downloadDeadlineMs);
  r=await recovered.reconcileDownload({attemptId:a.attemptId});assert.equal(r.attempt.state,'deadline_unknown');assert.equal(f.registry.release(r.attempt),true);
  await recovered.recordResourceRelease({attemptId:a.attemptId},f.sender);assert.equal(f.calls.length,0);
});

test('generic current-document registration is rechecked inside attempt, read and dispatch transactions',async()=>{
  for(const action of ['attempt','read','dispatch']){
    const f=await fixture(),p=await f.prepare(),read=await f.service.readArtifact({artifactId:p.artifactId},f.sender);
    const a=action==='dispatch'?await f.attempt(p):null,host=await f.host();let armed=true;
    f.storage.beforeTransaction=async(names,mode,data)=>{if(!armed||!names.includes('artifacts')||(action!=='read'&&mode!=='readwrite'))return;
      // For read, the first lookup is deliberately harmless; revoke when the
      // registered-host transaction acquires its snapshot after authentication.
      if(action==='read'&&!names.includes('results'))return;armed=false;data.get('commandJournal').get(`host:${host.registrationId}`).active=false;};
    const operation=action==='dispatch'?()=>f.service.dispatchDownload({attemptId:a.attemptId},f.sender):action==='read'?()=>f.service.readArtifact({artifactId:p.artifactId},f.sender):
      ()=>f.service.prepareAttempt({requestId:'attempt-new',artifactId:p.artifactId,blobUrl:f.registry.create(read.bytes,read.artifact.mime)},f.sender);
    await assert.rejects(operation(),errorCode('E_OWNER'));assert.equal(f.calls.length,0);
  }
});

test('generic tombstone/abandon uses existing lifecycle and reader pin gates existing repository deletion',async()=>{
  const f=await fixture(),p=await f.prepare();const repository=createStorageMethods(f.storage,{clock:{now:()=>Date.parse('2026-10-03T12:00:00Z')}});
  await f.mutate('runs',f.runId,run=>{run.retirementState='released';});await f.mutate('runs','@slot',slot=>{slot.currentRunId=null;});
  await assert.rejects(repository.deleteRun({runId:f.runId,explicitUserAction:true}),errorCode('E_OWNER'));
  await f.service.abandonExport({exportJobId:p.exportJobId,explicitUserAction:true},f.sender);
  assert.equal((await repository.deleteRun({runId:f.runId,explicitUserAction:true})).deleted,true);
  await assert.rejects(f.service.readArtifact({artifactId:p.artifactId},f.sender),e=>['E_SCHEMA','E_TOMBSTONE'].includes(e.code));
  assert.equal((await f.rows('artifacts')).length,0);
});

test('generic missing issued namespace/principal fails closed and never derives authority from payload',async()=>{
  const f=await fixture(),host=await f.host();await f.mutate('commandJournal',`host:${host.registrationId}`,row=>{delete row.namespace;delete row.principal;});
  await assert.rejects(f.prepare(),errorCode('E_OWNER'));assert.equal((await f.rows('artifacts')).length,0);
});

test('generic unsuccessful/missing wire results and legacy template entry points cannot manufacture artifacts',async()=>{
  for(const mutate of [r=>{r.state='failed';r.outcome={ok:false,error:{code:'E_CONTROL_EXECUTION'}};},r=>{delete r.outcome.valueWire;},r=>{r.outcome.valueWire={type:'boolean',value:0};}]){
    const f=await fixture();await f.mutate('results',f.resultId,mutate);
    await assert.rejects(f.prepare(),e=>['E_OWNER','E_VALUE_SERIALIZATION'].includes(e.code));assert.equal((await f.rows('artifacts')).length,0);
  }
  const f=await fixture();await assert.rejects(f.service.prepareExport({requestId:'legacy',runId:f.runId,format:'json',csvMode:'spreadsheet-safe',partialConfirmed:false},f.sender),errorCode('E_SCHEMA'));
  const p=await f.prepare();await assert.rejects(f.service.prepareAttempts({exportJobId:p.exportJobId,volumes:[]},f.sender),errorCode('E_SCHEMA'));
});

test('generic immutable result and artifact chunks are rechecked before attempt transaction commits',async()=>{
  const f=await fixture(),p=await f.prepare();await f.mutate('results',f.resultId,r=>{r.outcome.valueWire=encodeValue(0);});
  await assert.rejects(f.service.readArtifact({artifactId:p.artifactId},f.sender),errorCode('E_HASH'));
  const g=await fixture(),q=await g.prepare(),read=await g.service.readArtifact({artifactId:q.artifactId},g.sender);let armed=true;
  g.storage.beforeTransaction=async(names,mode,data)=>{if(!armed||mode!=='readwrite'||!names.includes('artifacts'))return;armed=false;
    data.get('artifacts').get(read.artifact.chunkKeys[0]).bytes[0]^=1;};
  await assert.rejects(g.service.prepareAttempt({requestId:'attempt-race',artifactId:q.artifactId,blobUrl:g.registry.create(read.bytes,read.artifact.mime)},g.sender),errorCode('E_HASH'));
  assert.equal((await g.rows('downloadReceipts')).length,0);assert.equal((await g.rows('exportJobs'))[0].state,'preparing');assert.equal(g.calls.length,0);
  const h=await fixture(),s=await h.prepare();h.storage.failPut=(n,v)=>n==='downloadReceipts'&&v.tag==='attempt';
  await assert.rejects(h.attempt(s),/transaction abort/);assert.equal((await h.rows('downloadReceipts')).length,0);
  assert.equal((await h.rows('exportJobs'))[0].activeAttemptIds.length,0);
});

test('generic onCreated is not completion; wrong native identity and callback/search conflicts cannot certify delivery',async()=>{
  for(const scenario of ['wrong-extension','wrong-url','wrong-time','ambiguous']){
    const f=await fixture(),p=await f.prepare(),a=await f.attempt(p);f.service.attach();await f.service.dispatchDownload({attemptId:a.attemptId},f.sender);
    const extra=scenario==='wrong-extension'?{byExtensionId:'foreign'}:scenario==='wrong-url'?{url:a.blobUrl+'suffix'}:
      scenario==='wrong-time'?{startTime:'2026-10-03T11:00:00Z'}:{};
    const item=f.native(a,7,'complete',extra);f.api.downloads.onCreated.emit(item);f.callback(undefined);await f.service.drain();
    let r=await f.service.reconcileDownload({attemptId:a.attemptId},{force:true});assert.equal(r.receipt,null);
    f.items.set(7,item);if(scenario==='ambiguous')f.items.set(8,f.native(a,8,'complete'));
    r=await f.service.reconcileDownload({attemptId:a.attemptId},{force:true});
    assert.equal(r.receipt,null);assert.equal(r.attempt.state,scenario==='ambiguous'?'conflict':'dispatched');assert.equal(f.calls.length,1);
    assert.notEqual(r.job.state,'delivery_complete');
  }
});

test('generic native interruption/runtime.lastError use shared failure/unknown states and never resubmit',async()=>{
  const f=await fixture(),p=await f.prepare(),a=await f.attempt(p);f.service.attach();await f.service.dispatchDownload({attemptId:a.attemptId},f.sender);
  f.items.set(7,f.native(a));f.callback(7);await f.service.drain();f.items.get(7).state='interrupted';f.items.get(7).error='NETWORK_FAILED';
  f.api.downloads.onChanged.emit({id:7,state:{current:'interrupted'}});await f.service.drain();const r=await f.service.reconcileDownload({attemptId:a.attemptId});
  assert.equal(r.attempt.state,'interrupted');assert.equal(r.job.state,'delivery_failed');assert.equal(r.receipt.interruptReason,'NETWORK_FAILED');
  assert.equal(r.receipt.diskHashVerified,false);assert.equal(f.registry.release(r.attempt),true);
  const g=await fixture(),q=await g.prepare(),b=await g.attempt(q);await g.service.dispatchDownload({attemptId:b.attemptId},g.sender);
  g.api.runtime.lastError={message:'lost callback'};g.callback(undefined);delete g.api.runtime.lastError;await g.service.drain();
  g.advance(BUDGETS.mappingWindowMs+1);const unknown=await g.service.reconcileDownload({attemptId:b.attemptId});assert.equal(unknown.attempt.state,'mapping_unknown');
  await g.makeService().dispatchDownload({attemptId:b.attemptId},g.sender);assert.equal(g.calls.length,1);
});

test('generic explicit fresh retry shares job/artifact; late evidence cannot release the new active reader pin',async()=>{
  const f=await fixture(),p=await f.prepare(),old=await f.attempt(p);await f.service.dispatchDownload({attemptId:old.attemptId},f.sender);
  f.callback(undefined);await f.service.drain();f.advance(BUDGETS.downloadDeadlineMs+1);
  const expired=await f.service.reconcileDownload({attemptId:old.attemptId});assert.equal(f.registry.release(expired.attempt),true);
  await f.service.recordResourceRelease({attemptId:old.attemptId},f.sender);
  const next=await f.attempt(p,'explicit-retry');assert.notEqual(next.attemptId,old.attemptId);assert.notEqual(next.blobUrl,old.blobUrl);
  assert.equal(next.exportJobId,old.exportJobId);assert.equal(next.artifactId,old.artifactId);
  await assert.rejects(f.service.prepareAttempt({requestId:'reuse-url',artifactId:p.artifactId,blobUrl:old.blobUrl},f.sender),errorCode('E_SCHEMA'));
  const native=f.native(old,7,'complete',{startTime:old.preparedAt});f.items.set(7,native);
  const late=await f.service.reconcileDownload({attemptId:old.attemptId},{force:true});assert.equal(late.receipt.late,true);assert.equal(late.job.state,'ready');
  const pin=(await f.rows('commandJournal')).find(r=>r.tag==='reader-pin'&&r.exportJobId===p.exportJobId);assert.equal(pin.released,false);
  assert.equal(f.registry.release(next),false);assert.equal(f.calls.length,1);
});

test('generic later registered document exports stable namespace history without acquiring the old run owner',async()=>{
  const f=await fixture(0), next={...f.sender,documentId:'next-doc',tab:{id:9,incognito:false}}, old=await f.host();
  const reg=await f.authority.registerHost({hostInstanceId:'host-two',claimedContractVersion:CONTRACT_VERSION,claimedContractHash:CONTRACT_HASH},next);
  const issued=await f.authority.assertHost(next,reg.registrationId);assert.equal(issued.namespace,old.namespace);assert.equal(issued.principal,old.principal);
  const p=await f.prepare({requestId:'reopened'},next),read=await f.service.readArtifact({artifactId:p.artifactId},next);
  assert.equal(decodeValue(JSON.parse(new TextDecoder().decode(read.bytes)).valueWire),0);
  await assert.rejects(f.authority.stopControllerRun({runId:f.runId,requestId:'take-owner'},next),errorCode('E_OWNER'));
  await assert.rejects(f.service.readArtifact({artifactId:p.artifactId},f.sender),errorCode('E_OWNER'));
  assert.equal((await f.rows('runs')).find(r=>r.runId===f.runId).registrationId,old.registrationId);
});

test('generic abandonRun fences timed-out retry history so shared repository deletion does not strand old attempts',async()=>{
  const f=await fixture(),p=await f.prepare(),a=await f.attempt(p);await f.service.dispatchDownload({attemptId:a.attemptId},f.sender);
  f.callback(undefined);await f.service.drain();f.advance(BUDGETS.downloadDeadlineMs+1);await f.service.reconcileDownload({attemptId:a.attemptId});
  await f.attempt(p,'explicit-retry');await f.mutate('runs',f.runId,run=>{run.retirementState='released';});
  await f.mutate('runs','@slot',slot=>{slot.currentRunId=null;});
  await f.service.abandonRun({runId:f.runId});
  assert.ok((await f.rows('downloadReceipts')).filter(r=>r.tag==='attempt').every(r=>r.attempt.state==='abandoned'));
  const repository=createStorageMethods(f.storage,{clock:{now:()=>Date.parse('2026-10-03T13:00:00Z')}});
  assert.equal((await repository.deleteRun({runId:f.runId,explicitUserAction:true})).deleted,true);
  assert.equal((await f.rows('artifacts')).length,0);assert.equal(f.calls.length,1);
});

test('generic public reconcile uses actual sender; internal Chrome callback reconciliation survives owning host revocation',async()=>{
  const f=await fixture(),p=await f.prepare(),a=await f.attempt(p),next={...f.sender,documentId:'foreign-host-doc'};
  await f.authority.registerHost({hostInstanceId:'foreign-host',claimedContractVersion:CONTRACT_VERSION,claimedContractHash:CONTRACT_HASH},next);
  await assert.rejects(f.service.reconcileDownload({attemptId:a.attemptId},next),errorCode('E_OWNER'));
  assert.equal((await f.service.reconcileDownload({attemptId:a.attemptId},f.sender)).attempt.state,'prepared');
  await f.service.dispatchDownload({attemptId:a.attemptId},f.sender);const host=await f.host();
  await f.mutate('commandJournal',`host:${host.registrationId}`,row=>{row.active=false;row.revoked=true;});
  f.items.set(7,f.native(a,7,'complete'));f.callback(7);await f.service.drain();
  const r=await f.service.reconcileDownload({attemptId:a.attemptId});assert.equal(r.attempt.state,'complete');assert.equal(r.receipt.diskHashVerified,false);
  await assert.rejects(f.service.reconcileDownload({attemptId:a.attemptId},f.sender),errorCode('E_OWNER'));assert.equal(f.calls.length,1);
});

async function reopenBrowser(f) {
  const sender={...f.sender,documentId:'new-browser-doc',tab:{id:9,incognito:false}};
  const authority=createRunAuthority({loadBuiltin:loadFakeBuiltin,storage:f.storage,api:f.api,session:'new-browser-session',clock:f.clock});
  const registration=await authority.registerHost({hostInstanceId:'new-browser-host',claimedContractVersion:CONTRACT_VERSION,claimedContractHash:CONTRACT_HASH},sender);
  const service=createDownloadService({storage:f.storage,api:f.api,clock:f.clock.now,assertHost:authority.assertHost});
  const prepare=()=>service.prepareArtifact({requestId:'history-after-reopen',runId:f.runId,resultId:f.resultId,filename:'history.json',format:'typed-json'},sender);
  return {sender,authority,registration,service,prepare};
}

test('generic completed immutable history exports after real new-session registration without replaying or adopting old download intents',async()=>{
  const f=await fixture(undefined),old=await f.prepare(),oldAttempt=await f.attempt(old),oldHost=await f.host();
  const before=await f.storage.transaction(['runs','results'],'readonly',async tx=>({run:await tx.get('runs',f.runId),result:await tx.get('results',f.resultId)}));
  const next=await reopenBrowser(f),host=await next.authority.assertHost(next.sender,next.registration.registrationId);
  assert.equal(host.namespace,oldHost.namespace);assert.equal(host.principal,oldHost.principal);assert.notEqual(host.browserSessionIncarnation,before.run.browserSessionIncarnation);
  const snapshot=await next.authority.snapshotControllerRun({runId:f.runId},next.sender);assert.equal(decodeValue(snapshot.results[0].outcome.valueWire),undefined);
  const p=await next.prepare(),read=await next.service.readArtifact({artifactId:p.artifactId},next.sender);
  assert.equal(decodeValue(JSON.parse(new TextDecoder().decode(read.bytes)).valueWire),undefined);assert.equal(createHash('sha256').update(read.bytes).digest('hex'),read.artifact.sha256);
  assert.equal(f.calls.length,0);assert.notEqual(p.exportJobId,old.exportJobId);
  await assert.rejects(next.service.readArtifact({artifactId:old.artifactId},next.sender),errorCode('E_OWNER'));
  await assert.rejects(next.service.dispatchDownload({attemptId:oldAttempt.attemptId},next.sender),errorCode('E_OWNER'));
  await assert.rejects(next.authority.stopControllerRun({runId:f.runId,requestId:'never-adopt-old-run'},next.sender),errorCode('E_OWNER'));
  const registry=createHostBlobRegistry({clock:f.clock.now,url:{createObjectURL:()=>`blob:chrome-extension://${f.api.runtime.id}/current-session-url`,revokeObjectURL(){}}});
  const a=await next.service.prepareAttempt({requestId:'current-attempt',artifactId:p.artifactId,blobUrl:registry.create(read.bytes,read.artifact.mime)},next.sender);
  const intent=(await f.rows('commandJournal')).find(r=>r.tag==='export-intent'&&r.exportJobId===p.exportJobId);
  assert.equal(intent.browserSessionIncarnation,host.browserSessionIncarnation);assert.equal(intent.registrationId,next.registration.registrationId);
  await next.service.dispatchDownload({attemptId:a.attemptId},next.sender);f.items.set(7,f.native(a,7,'complete'));f.callback(7);await next.service.drain();
  const receipt=await next.service.reconcileDownload({attemptId:a.attemptId},next.sender);assert.equal(receipt.attempt.state,'complete');assert.equal(receipt.receipt.diskHashVerified,false);
  assert.equal(registry.release(receipt.attempt),true);await next.service.recordResourceRelease({attemptId:a.attemptId},next.sender);
  const after=await f.storage.transaction(['runs','results'],'readonly',async tx=>({run:await tx.get('runs',f.runId),result:await tx.get('results',f.resultId)}));
  assert.deepEqual(after,before);assert.equal(f.calls.length,1);
  const latestAuthority=createRunAuthority({loadBuiltin:loadFakeBuiltin,storage:f.storage,api:f.api,session:'third-browser-session',clock:f.clock}),latestSender={...next.sender,documentId:'third-doc'};
  await latestAuthority.registerHost({hostInstanceId:'third-host',claimedContractVersion:CONTRACT_VERSION,claimedContractHash:CONTRACT_HASH},latestSender);
  const latest=createDownloadService({storage:f.storage,api:f.api,clock:f.clock.now,assertHost:latestAuthority.assertHost});
  await assert.rejects(latest.dispatchDownload({attemptId:a.attemptId},latestSender),errorCode('E_OWNER'));assert.equal(f.calls.length,1);
});

test('generic cross-session history rejects foreign namespaces, tampered principals, nonterminal runs and current-host session loss',async()=>{
  for(const mutation of ['run-namespace','result-namespace','run-principal','result-principal','host-namespace','host-principal','active-run','current-host-session']){
    const f=await fixture(0),next=await reopenBrowser(f);
    if(mutation.startsWith('run-'))await f.mutate('runs',f.runId,row=>{row[mutation.slice(4)]='foreign';});
    else if(mutation.startsWith('result-'))await f.mutate('results',f.resultId,row=>{row[mutation.slice(7)]='foreign';});
    else if(mutation.startsWith('host-'))await f.mutate('commandJournal',`host:${next.registration.registrationId}`,row=>{row[mutation.slice(5)]='foreign';});
    else if(mutation==='active-run')await f.mutate('runs',f.runId,row=>{row.state='running';});
    else await f.mutate('commandJournal',`host:${next.registration.registrationId}`,row=>{row.browserSessionIncarnation='foreign';});
    await assert.rejects(next.prepare(),errorCode('E_OWNER'));assert.equal((await f.rows('artifacts')).length,0);assert.equal(f.calls.length,0);
  }
});
