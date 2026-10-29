import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalRunnerClient,isRunSettled,previewCertified,normalizeSnapshot} from '../src/local-runner-client.js';

const config={url:'https://example.com/list',itemConfig:{title:'h2'}};
const snapshot=(extra={})=>({runId:'run-1',requestId:'req-1',mode:'preview',status:'COMPLETED',pagesVisited:3,recordsCount:6,
  fields:['title'],completeness:{title:{nonEmpty:6,total:6,ratio:1}},errors:[],stopReason:null,workerExited:true,previewPassed:true,configHash:'hash-1',config,...extra});
function host(handler=()=>snapshot()){
  let value=null,revision=0;
  const calls=[];
  const request=async(operation,payload)=>{
    calls.push({operation,payload:structuredClone(payload)});
    if(operation==='storage.get')return {value:structuredClone(value),etag:String(revision)};
    if(operation==='storage.set'){
      assert.equal(payload.key,'local-runner-state');assert.equal(payload.ifMatch,String(revision));
      value=structuredClone(payload.value);revision++;return {saved:true};
    }
    return handler(operation,payload);
  };
  return {request,calls,get value(){return value;},replace(next){value=next;revision++;}};
}
const postCalls=h=>h.calls.filter(x=>x.operation==='localTasks.request'&&x.payload.method==='POST');

test('preview creates only through the host and persists an ETag-protected small pointer before POST',async()=>{
  const h=host((operation,payload)=>{assert.equal(operation,'localTasks.request');assert(h.value.requestId);assert.equal(payload.path,'/v1/runs');return snapshot({status:'QUEUED',workerExited:false});});
  const client=createLocalRunnerClient(h.request);await client.restore();
  await client.start({requestId:'req-1',mode:'preview',config,previewPages:3});
  assert.deepEqual(postCalls(h)[0].payload,{method:'POST',path:'/v1/runs',targetOrigin:'https://example.com',body:{requestId:'req-1',mode:'preview',config,previewPages:3}});
  assert.equal(client.snapshot.status,'queued');assert.equal(h.value.runId,'run-1');
  assert.equal(h.value.requestId,'req-1');assert(!('config' in h.value));
  assert(Buffer.byteLength(JSON.stringify(h.value))<8192);
});

test('lost create receipt is resolved by original requestId and never by repeating POST',async()=>{
  let lost=true;
  const h=host((op,payload)=>{
    if(payload.method==='POST'){throw Object.assign(Error('lost receipt'),{code:'E_TOOL_TIMEOUT'});}
    assert.equal(payload.path,'/v1/runs/by-request/req-lost');
    if(lost)throw Error('temporarily unavailable');return snapshot({requestId:'req-lost'});
  });
  const client=createLocalRunnerClient(h.request);await client.restore();
  await assert.rejects(client.start({requestId:'req-lost',mode:'preview',config,previewPages:2}),/原请求|unknown/i);
  await assert.rejects(client.start({requestId:'req-new',mode:'preview',config,previewPages:2}));
  lost=false;await client.refresh();assert.equal(client.snapshot.runId,'run-1');
  assert.equal(postCalls(h).length,1);
  assert(h.calls.filter(x=>x.operation==='localTasks.request'&&x.payload.method==='GET').every(x=>!Object.hasOwn(x.payload,'targetOrigin')));
});

test('reopening restores the original run with GET only, including INTERRUPTED and UNKNOWN',async()=>{
  const h=host((op,payload)=>{assert.equal(payload.method,'GET');assert.equal(payload.path,'/v1/runs/run-1');return snapshot({status:'INTERRUPTED',workerExited:false});});
  h.replace({schemaVersion:1,requestId:'req-1',runId:'run-1',mode:'preview',configHash:'hash-1'});
  const reopened=createLocalRunnerClient(h.request);await reopened.restore();
  assert.equal(reopened.snapshot.status,'interrupted');assert(!isRunSettled(reopened.snapshot));
  assert.equal(postCalls(h).length,0);assert(!isRunSettled(snapshot({status:'UNKNOWN',workerExited:true})));
});

test('Stop acknowledgement cannot complete stopping before the original worker exits',async()=>{
  const h=host((op,payload)=>payload.path.endsWith('/stop')?snapshot({status:'STOPPED',workerExited:false}):snapshot({status:'RUNNING',workerExited:false}));
  const client=createLocalRunnerClient(h.request);await client.restore();
  await client.start({requestId:'req-1',mode:'preview',config,previewPages:1});await client.stop();
  assert.equal(postCalls(h).at(-1).payload.path,'/v1/runs/run-1/stop');assert(!isRunSettled(client.snapshot));
  await assert.rejects(client.start({requestId:'req-2',mode:'preview',config,previewPages:1}));
  assert(isRunSettled(snapshot({status:'STOPPED',workerExited:true})));
});

test('full run requires a fresh passed preview with matching hash; preview never starts full automatically',async()=>{
  let passed=true;
  const h=host((op,payload)=>payload.method==='GET'?snapshot({requestId:'req-preview',previewPassed:passed}):payload.body.mode==='full'?
    snapshot({requestId:'req-full',runId:'run-full',mode:'full',previewRunId:'run-1',status:'RUNNING',workerExited:false}):snapshot({requestId:'req-preview'}));
  const client=createLocalRunnerClient(h.request);await client.restore();
  await client.start({requestId:'req-preview',mode:'preview',config,previewPages:3});assert.equal(postCalls(h).length,1);
  await assert.rejects(client.start({requestId:'req-full',mode:'full',config,previewPages:3,previewRunId:'run-1',configHash:'wrong'}));
  passed=false;await assert.rejects(client.start({requestId:'req-full',mode:'full',config,previewPages:3,previewRunId:'run-1',configHash:'hash-1'}));
  assert.equal(postCalls(h).length,1);passed=true;
  await client.start({requestId:'req-full',mode:'full',config,previewPages:3,previewRunId:'run-1',configHash:'hash-1'});
  assert.equal(postCalls(h).length,2);assert.equal(client.snapshot.mode,'full');
  assert.equal(postCalls(h).at(-1).payload.body.previewRunId,'run-1');
});

test('record paging and export stay on the declared public host operations',async()=>{
  const h=host((op,payload)=>op==='localTasks.export'?{started:true}:payload.path.includes('/records?')?{records:[{title:'<script>text</script>'}],total:9,offset:0}:snapshot());
  const client=createLocalRunnerClient(h.request);await client.restore();
  await client.start({requestId:'req-1',mode:'preview',config,previewPages:3});
  assert.deepEqual(await client.records(),{records:[{title:'<script>text</script>'}],total:9,offset:0});
  assert(h.calls.some(x=>x.payload.path==='/v1/runs/run-1/records?offset=0&limit=50'));
  for(const format of ['jsonl','csv'])await client.export(format);
  assert.deepEqual(h.calls.filter(x=>x.operation==='localTasks.export').map(x=>x.payload),[{runId:'run-1',format:'jsonl'},{runId:'run-1',format:'csv'}]);
  await assert.rejects(client.export('html'));await assert.rejects(client.records(-1));
});

test('storage conflict blocks creation and cannot overwrite another window pointer',async()=>{
  const h=host();const client=createLocalRunnerClient(h.request);await client.restore();
  h.replace({schemaVersion:1,requestId:'other',runId:'other-run',mode:'full'});
  await assert.rejects(client.start({requestId:'req-1',mode:'preview',config,previewPages:3}));
  assert.equal(postCalls(h).length,0);assert.equal(h.value.requestId,'other');
});

test('invalid pages, run identities and unconfirmed previews fail closed',async()=>{
  for(const previewPages of [0,4,1.5,'3']){
    const h=host();const client=createLocalRunnerClient(h.request);await client.restore();
    await assert.rejects(client.start({requestId:'req-1',mode:'preview',config,previewPages}));assert.equal(postCalls(h).length,0);
  }
  assert.throws(()=>normalizeSnapshot(snapshot({runId:'other'}),{runId:'run-1'}));
  assert.throws(()=>normalizeSnapshot(snapshot({configHash:'other'}),{configHash:'hash-1'}));
  for(const patch of [{workerExited:false},{previewPassed:false},{status:'FAILED'},{mode:'full'},{configHash:''},{recordsCount:0},{recordsCount:'6'}])assert(!previewCertified(snapshot(patch)));
});

test('snapshot metrics and each field completeness are validated before certification or display',()=>{
  for(const patch of [{pagesVisited:-1},{pagesVisited:'3'},{recordsCount:NaN},{recordsCount:1.1},
    {fields:['title','title']},{fields:null},{completeness:null},{completeness:{title:{nonEmpty:7,total:6,ratio:1}}},
    {completeness:{title:{nonEmpty:6,total:8,ratio:.75}}},{completeness:{title:{nonEmpty:6,total:6,ratio:2}}},
    {errors:'none'},{workerExited:'true'},{previewPassed:'true'}])assert.throws(()=>normalizeSnapshot(snapshot(patch)),JSON.stringify(patch));
  assert.equal(normalizeSnapshot(snapshot()).recordsCount,6);
  assert.equal(normalizeSnapshot(snapshot({recordsCount:0,completeness:{title:{nonEmpty:0,total:0,ratio:0}}})).recordsCount,0);
});

test('an uncertain pointer write blocks a second create until explicit readback',async()=>{
  const h=host();let failOnce=true;
  const request=async(op,payload)=>{
    const reply=await h.request(op,payload);
    if(op==='storage.set'&&failOnce){failOnce=false;throw Error('lost storage receipt');}
    return reply;
  };
  const client=createLocalRunnerClient(request);await client.restore();
  await assert.rejects(client.start({requestId:'req-lost-storage',mode:'preview',config,previewPages:3}));
  await assert.rejects(client.start({requestId:'req-another',mode:'preview',config,previewPages:3}));
  assert.equal(postCalls(h).length,0);assert.equal(h.value.requestId,'req-lost-storage');
});

test('R17-RA-001 restoring the original pointer reconciles a lost runId write receipt and allows full without replay',async()=>{
  let writes=0;
  const h=host((op,payload)=>payload.body?.mode==='full'?
    snapshot({requestId:'req-full',runId:'run-full',mode:'full',previewRunId:'run-1',status:'RUNNING',workerExited:false}):snapshot());
  const request=async(op,payload)=>{
    const reply=await h.request(op,payload);
    if(op==='storage.set'&&++writes===2)throw Object.assign(Error('runId write receipt lost'),{code:'E_TOOL_TIMEOUT'});
    return reply;
  };
  const client=createLocalRunnerClient(request);await client.restore();
  await client.start({requestId:'req-1',mode:'preview',config,previewPages:3});
  assert(previewCertified(client.snapshot));
  const full={requestId:'req-full',mode:'full',config,previewPages:3,previewRunId:'run-1',configHash:'hash-1'};
  await assert.rejects(client.start(full),{code:'E_RUN_STORAGE'});
  const readsBefore=h.calls.filter(x=>x.operation==='storage.get').length;
  await client.restore();
  assert(h.calls.filter(x=>x.operation==='storage.get').length>readsBefore);
  assert.equal(client.pointer.requestId,'req-1');assert.equal(client.pointer.runId,'run-1');
  assert.equal(postCalls(h).length,1);
  await client.start(full);
  assert.equal(postCalls(h).length,2);assert.equal(client.snapshot.runId,'run-full');
});

test('R17-RA-003 missing or mismatched create and by-request identities stay unknown without adopting a runId',async()=>{
  for(const responseId of [undefined,'unrelated-request']){
    const h=host(()=>snapshot({requestId:responseId,runId:'unrelated-run'}));
    const client=createLocalRunnerClient(h.request);await client.restore();
    await assert.rejects(client.start({requestId:'request-intended',mode:'preview',config,previewPages:3}),{code:'E_RUN_UNKNOWN'});
    assert.equal(client.pointer.requestId,'request-intended');assert.equal(client.pointer.runId,null);
    assert.equal(client.snapshot,null);assert.equal(h.value.runId,null);
    await assert.rejects(client.stop());await assert.rejects(client.records());await assert.rejects(client.export('jsonl'));
    await assert.rejects(client.start({requestId:'another-request',mode:'preview',config,previewPages:3}));
    assert.equal(postCalls(h).length,1);assert.equal(h.calls.filter(x=>x.operation==='localTasks.export').length,0);
    assert(h.calls.filter(x=>x.operation==='localTasks.request'&&x.payload.method==='GET').every(x=>x.payload.path==='/v1/runs/by-request/request-intended'));
  }
});

test('R17-RA-003 a reopened pending request requires its explicit matching requestId before accepting a run',async()=>{
  let valid=false;
  const h=host(()=>snapshot({requestId:valid?'request-original':undefined}));
  h.replace({schemaVersion:1,requestId:'request-original',runId:null,mode:'preview'});
  const client=createLocalRunnerClient(h.request);
  await assert.rejects(client.restore());assert.equal(client.pointer.runId,null);assert.equal(client.snapshot,null);
  valid=true;await client.refresh();assert.equal(client.snapshot.requestId,'request-original');assert.equal(client.pointer.runId,'run-1');
  assert.equal(postCalls(h).length,0);
});

test('trusted not-created 409/422 and prepare cancellation restore the empty pointer and permit only explicit retry',async()=>{
  for(const refusal of [{code:'E_LOCAL_NOT_CREATED',status:409,message:'WORKER_BUSY'},
    {code:'E_LOCAL_NOT_CREATED',status:422,message:'NOT_SUPPORTED'},{code:'E_CANCELLED',message:'pairing cancelled before dispatch'}]){
    let rejected=true;
    const h=host((op,payload)=>{
      assert.equal(payload.method,'POST');assert.equal(payload.path,'/v1/runs');
      if(rejected)throw Object.assign(Error(refusal.message),refusal);
      return snapshot({requestId:payload.body.requestId});
    });
    const client=createLocalRunnerClient(h.request);await client.restore();
    await assert.rejects(client.start({requestId:'first-attempt',mode:'preview',config,previewPages:3}),{code:refusal.code});
    assert.equal(client.pointer,null);assert.equal(client.snapshot,null);assert.equal(h.value,null);
    assert.equal(postCalls(h).length,1);
    const writes=h.calls.filter(x=>x.operation==='storage.set');
    assert.equal(writes.length,2);assert.equal(writes[1].payload.ifMatch,'1');assert.equal(writes[1].payload.value,null);
    rejected=false;
    await client.start({requestId:'explicit-retry',mode:'preview',config,previewPages:3});
    assert.equal(postCalls(h).length,2);assert.equal(client.snapshot.requestId,'explicit-retry');
  }
});

test('a definitely rejected full run restores the original certified preview and its exact stored pointer',async()=>{
  let rejected=true;
  const h=host((op,payload)=>{
    if(payload.method==='GET'||payload.body.mode==='preview')return snapshot();
    if(rejected)throw Object.assign(Error('WORKER_BUSY'),{code:'E_LOCAL_NOT_CREATED',status:409});
    return snapshot({requestId:payload.body.requestId,runId:'run-full',mode:'full',previewRunId:'run-1',status:'RUNNING',workerExited:false});
  });
  const client=createLocalRunnerClient(h.request);await client.restore();
  await client.start({requestId:'req-1',mode:'preview',config,previewPages:3});
  const originalPointer=client.pointer,originalSnapshot=client.snapshot;
  const full={requestId:'full-rejected',mode:'full',config,previewPages:3,previewRunId:'run-1',configHash:'hash-1'};
  await assert.rejects(client.start(full),{code:'E_LOCAL_NOT_CREATED'});
  assert.deepEqual(client.pointer,originalPointer);assert.deepEqual(h.value,originalPointer);assert.deepEqual(client.snapshot,originalSnapshot);
  assert(previewCertified(client.snapshot));assert.equal(postCalls(h).length,2);
  rejected=false;await client.start({...full,requestId:'full-explicit-retry'});
  assert.equal(postCalls(h).length,3);assert.equal(client.snapshot.requestId,'full-explicit-retry');
});

test('not-created rollback uses CAS and cannot overwrite a concurrent window pointer',async()=>{
  const other={schemaVersion:1,requestId:'other-request',runId:'other-run',mode:'preview',configHash:'hash-1'};
  const h=host((op,payload)=>{
    h.replace(other);throw Object.assign(Error('WORKER_BUSY'),{code:'E_LOCAL_NOT_CREATED',status:409});
  });
  const client=createLocalRunnerClient(h.request);await client.restore();
  await assert.rejects(client.start({requestId:'rejected-request',mode:'preview',config,previewPages:3}));
  assert.deepEqual(h.value,other);assert.equal(postCalls(h).length,1);
  await assert.rejects(client.start({requestId:'unsafe-retry',mode:'preview',config,previewPages:3}),{code:'E_RUN_STORAGE'});
  assert.equal(postCalls(h).length,1);
});

test('R17-RA-001 a lost rollback receipt requires original pointer and ETag readback before explicit full retry',async()=>{
  let rejected=true,writeCount=0,loseRollback=true;
  const h=host((op,payload)=>{
    if(payload.method==='GET'||payload.body.mode==='preview')return snapshot();
    if(rejected)throw Object.assign(Error('NOT_SUPPORTED'),{code:'E_LOCAL_NOT_CREATED',status:422});
    return snapshot({requestId:payload.body.requestId,runId:'run-full',mode:'full',previewRunId:'run-1',status:'RUNNING',workerExited:false});
  });
  const request=async(op,payload)=>{
    const reply=await h.request(op,payload);
    if(op==='storage.set'&&++writeCount===4&&loseRollback){loseRollback=false;throw Object.assign(Error('lost rollback receipt'),{code:'E_TOOL_TIMEOUT'});}
    return reply;
  };
  const client=createLocalRunnerClient(request);await client.restore();
  await client.start({requestId:'req-1',mode:'preview',config,previewPages:3});
  const originalPointer=client.pointer;
  const full={requestId:'full-rejected',mode:'full',config,previewPages:3,previewRunId:'run-1',configHash:'hash-1'};
  await assert.rejects(client.start(full));assert.deepEqual(h.value,originalPointer);
  rejected=false;
  await assert.rejects(client.start({...full,requestId:'premature-retry'}),{code:'E_RUN_STORAGE'});
  assert.equal(postCalls(h).length,2);
  await client.restore();assert.deepEqual(client.pointer,originalPointer);assert(previewCertified(client.snapshot));
  await client.start({...full,requestId:'full-after-reconcile'});
  assert.equal(postCalls(h).length,3);assert.equal(client.snapshot.requestId,'full-after-reconcile');
});

test('raw HTTP errors and unknown outcomes never imply not-created or replay a create',async()=>{
  for(const error of [{code:'E_TOOL_TIMEOUT'},{code:'E_LOCAL_UNKNOWN'},{code:'WORKER_BUSY',status:409},{code:'NOT_SUPPORTED',status:422}]){
    const h=host((op,payload)=>{throw Object.assign(Error('unconfirmed outcome'),error);});
    const client=createLocalRunnerClient(h.request);await client.restore();
    await assert.rejects(client.start({requestId:'unknown-request',mode:'preview',config,previewPages:3}),{code:'E_RUN_UNKNOWN'});
    assert.equal(client.pointer.requestId,'unknown-request');assert.equal(client.pointer.runId,null);assert.equal(h.value.requestId,'unknown-request');
    await assert.rejects(client.start({requestId:'must-not-replay',mode:'preview',config,previewPages:3}));
    await assert.rejects(client.refresh());assert.equal(postCalls(h).length,1);
    assert(h.calls.filter(x=>x.operation==='localTasks.request'&&x.payload.method==='GET').every(x=>x.payload.path==='/v1/runs/by-request/unknown-request'));
  }
});

test('a storage cancellation after a create receipt cannot roll back an already created run',async()=>{
  let writes=0;
  const h=host();
  const request=async(op,payload)=>{
    const reply=await h.request(op,payload);
    if(op==='storage.set'&&++writes===2)throw Object.assign(Error('post-receipt storage cancellation'),{code:'E_CANCELLED'});
    return reply;
  };
  const client=createLocalRunnerClient(request);await client.restore();
  await client.start({requestId:'req-1',mode:'preview',config,previewPages:3});
  assert.equal(client.pointer.runId,'run-1');assert.equal(h.value.runId,'run-1');assert.equal(client.snapshot.runId,'run-1');
  assert.equal(writes,2);assert.equal(postCalls(h).length,1);
  await assert.rejects(client.start({requestId:'must-reconcile-storage',mode:'preview',config,previewPages:3}),{code:'E_RUN_STORAGE'});
});

test('trusted by-request tombstones clear only unresolved pointers by CAS, keep ready and never start automatically',async()=>{
  const pending={schemaVersion:1,requestId:'closed-before-dispatch',runId:null,mode:'preview'};
  for(const entry of ['restore','refresh']){
    let tombstone=entry==='restore';
    const h=host((op,payload)=>{
      assert.equal(payload.method,'GET');assert.equal(payload.path,'/v1/runs/by-request/closed-before-dispatch');
      throw Object.assign(Error('original request was not dispatched'),{code:tombstone?'E_LOCAL_NOT_CREATED':'E_LOCAL_UNKNOWN'});
    });
    h.replace(pending);const client=createLocalRunnerClient(h.request);
    if(entry==='refresh'){await assert.rejects(client.restore());tombstone=true;}
    assert.equal(await client[entry](),null);assert.equal(client.ready,true);
    assert.equal(client.pointer,null);assert.equal(h.value,null);assert.equal(client.snapshot,null);
    const writes=h.calls.filter(x=>x.operation==='storage.set');
    assert.equal(writes.length,1);assert.equal(writes[0].payload.ifMatch,'1');assert.equal(writes[0].payload.value,null);
    assert.equal(postCalls(h).length,0);
  }
  let rejectKnown=false;
  const knownHost=host(()=>{
    if(rejectKnown)throw Object.assign(Error('not-created on known run is not a deletion receipt'),{code:'E_LOCAL_NOT_CREATED'});
    return snapshot();
  });
  const known={schemaVersion:1,requestId:'req-1',runId:'run-1',mode:'preview',configHash:'hash-1'};
  knownHost.replace(known);const knownClient=createLocalRunnerClient(knownHost.request);await knownClient.restore();
  const validPreview=knownClient.snapshot;rejectKnown=true;
  await assert.rejects(knownClient.refresh(),{code:'E_LOCAL_NOT_CREATED'});
  assert.deepEqual(knownClient.pointer,known);assert.deepEqual(knownHost.value,known);assert.deepEqual(knownClient.snapshot,validPreview);
  assert.equal(knownHost.calls.filter(x=>x.operation==='storage.set').length,0);
  const other={...known,requestId:'other-request',runId:'other-run'};
  const conflictHost=host(()=>{conflictHost.replace(other);throw Object.assign(Error('not dispatched'),{code:'E_LOCAL_NOT_CREATED'});});
  conflictHost.replace(pending);const conflictClient=createLocalRunnerClient(conflictHost.request);
  await assert.rejects(conflictClient.restore());assert.deepEqual(conflictHost.value,other);assert.equal(postCalls(conflictHost).length,0);
  const uncertainHost=host((op,payload)=>{throw Object.assign(Error('not dispatched'),{code:payload.method==='POST'?'E_TOOL_TIMEOUT':'E_LOCAL_NOT_CREATED'});});
  const uncertainClient=createLocalRunnerClient(uncertainHost.request);await uncertainClient.restore();
  await assert.rejects(uncertainClient.start({requestId:'closed-before-dispatch',mode:'preview',config,previewPages:3}),{code:'E_LOCAL_NOT_CREATED'});
  assert.equal(uncertainClient.pointer,null);assert.equal(uncertainClient.ready,true);assert.equal(postCalls(uncertainHost).length,1);
});
