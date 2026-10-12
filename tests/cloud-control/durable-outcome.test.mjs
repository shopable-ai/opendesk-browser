import test from 'node:test';
import assert from 'node:assert/strict';
import {isDurableCloudResult} from '../../src/cloud-control/durable-outcome.js';
import {createCloudService} from '../../src/cloud-control/service.js';

const namespace='tool:trusted',requestId='cloud:assignment-one';
const ref={runId:'run-one',resultId:'result-one',requestId,sourceHash:'original-source',
  manifestHash:'approved-manifest',grantId:'grant-one'};
const baseRun={tag:'controller-run',cloudRequestId:requestId,namespace,runId:ref.runId,
  resultId:ref.resultId,state:'completed',retirementState:'released',
  registrationId:'host-one',cancelSeq:1,ownerEpoch:2,runRevision:3,eventSeq:4};
const baseResult={tag:'controller-result',namespace,runId:ref.runId,resultId:ref.resultId,
  revision:{sourceHash:ref.sourceHash},state:'completed'};
const baseRequest={tag:'cloud-request-v1',namespace,requestId,runId:ref.runId,runRef:ref,
  grantId:'grant-one',createdAt:101,state:'permitted',
  assignment:{assignmentId:'assignment-one',leaseUntil:200},
  task:{resultAllowed:false,manifest:{siteOrigins:[]}}};
const baseConfig={namespace,enabled:true,grantId:'grant-one',providerId:'provider-one',
  url:'https://provider.example',credential:'private-credential',tasks:[]};

function fixture({request=baseRequest,run=baseRun,result=baseResult}={}){
  let db=new Map();const messages=[],posts=[];
  const store=(name,key,value)=>{if(value!==null)db.set(name+':'+key,structuredClone(value));};
  store('frameworkKV','cloud:config',baseConfig);
  store('frameworkKV','cloud:request:'+requestId,request);
  store('runs',ref.runId,run);
  store('results',ref.resultId,result);
  const storage={
    async transaction(stores,mode,fn){
      const next=new Map([...db.entries()].map(([key,value])=>[key,structuredClone(value)]));
      const tx={
        async get(name,key){assert(stores.includes(name));return structuredClone(next.get(name+':'+key));},
        async put(name,value,key){assert.equal(mode,'readwrite');assert(stores.includes(name));next.set(name+':'+key,structuredClone(value));},
        async delete(name,key){assert.equal(mode,'readwrite');next.delete(name+':'+key);},
        async all(name){assert(stores.includes(name));return [...next.entries()]
          .filter(([key])=>key.startsWith(name+':')).map(([,value])=>structuredClone(value));}
      };
      const value=await fn(tx);
      if(mode==='readwrite')db=next;
      return value;
    }
  };
  const read=(name,key)=>structuredClone(db.get(name+':'+key));
  const service=createCloudService({
    storage,api:{runtime:{id:'trusted'}},clock:{now:()=>1000},
    assertHost:async()=>({namespace,registrationId:'host-one'}),
    currentHost:async()=>true,resolveTask:async()=>{throw Error('Must not resolve a Task');},
    emitToHost:async(...args)=>{messages.push(args);},
    fetcher:async(url,options)=>{
      posts.push({url,body:JSON.parse(options.body)});
      if(url.endsWith('/v1/reconcile'))return new Response(JSON.stringify({
        providerId:'provider-one',assignments:[{assignmentId:'assignment-one',
          runRef:ref,cancelled:true,leaseUntil:200}]
      }),{status:200,headers:{'Content-Type':'application/json'}});
      throw Error('Unexpected Provider call '+url);
    }
  });
  return {service,read,messages,posts};
}

test('only matching original terminal released Run + Result can prove a cloud outcome',()=>{
  assert.equal(isDurableCloudResult(baseRequest,baseRun,baseResult),true);
  for(const bad of [null,{...baseResult,resultId:'different'},
    {...baseResult,revision:{sourceHash:'wrong'}},{...baseResult,state:'stopped'}])
    assert.equal(isDurableCloudResult(baseRequest,baseRun,bad),false);
  for(const bad of [{...baseRun,state:'running'},{...baseRun,state:'paused_unknown'},
    {...baseRun,retirementState:'fenced'},{...baseRun,cloudRequestId:'cloud:other'}])
    assert.equal(isDurableCloudResult(baseRequest,bad,baseResult),false);
});

test('hosting Stop preserves original released Result before receipt acknowledgement',async()=>{
  const f=fixture();
  const beforeRun=f.read('runs',ref.runId),beforeResult=f.read('results',ref.resultId);
  await f.service.cloudStop({},{});
  const row=f.read('frameworkKV','cloud:request:'+requestId);
  assert.equal(row.state,'finished');assert.equal(row.reason,undefined);
  assert.deepEqual(f.read('runs',ref.runId),beforeRun);
  assert.deepEqual(f.read('results',ref.resultId),beforeResult);
  assert.equal(f.read('frameworkKV','cloud:config').enabled,false);
  assert.deepEqual(f.messages,[]);
});

test('Provider cancellation after real retirement does not relabel completed task',async()=>{
  const f=fixture();
  await f.service.reconcile();
  const row=f.read('frameworkKV','cloud:request:'+requestId);
  assert.equal(row.state,'finished');assert.equal(row.reason,undefined);
  assert.equal(f.read('runs',ref.runId).state,'completed');
  assert.equal(f.read('results',ref.resultId).state,'completed');
  assert.equal(f.posts.length,1);
  assert.deepEqual(f.messages,[]);
});

test('historical confirmed receipt with late E_CLOUD_CANCELLED is repaired',async()=>{
  const f=fixture({request:{...baseRequest,state:'finished',reason:'E_CLOUD_CANCELLED',
    receipt:{receiptId:'receipt-one'},delivery:{state:'confirmed'}}});
  await f.service.reconcile();
  const row=f.read('frameworkKV','cloud:request:'+requestId);
  assert.equal(row.state,'finished');assert.equal(row.reason,undefined);
  assert.equal(row.receipt.receiptId,'receipt-one');
});

test('missing Result still fences original running Worker instead of fabricating success',async()=>{
  const f=fixture({result:null,run:{...baseRun,state:'running',retirementState:'not-started',
    cancelSeq:0,ownerEpoch:1,runRevision:1,eventSeq:0}});
  await f.service.cloudStop({},{});
  const row=f.read('frameworkKV','cloud:request:'+requestId),run=f.read('runs',ref.runId);
  assert.equal(row.state,'cancellation-pending');assert.equal(row.reason,'E_CLOUD_REVOKED');
  assert.equal(run.state,'stopping');assert.equal(run.cancelSeq,1);assert.equal(run.ownerEpoch,2);
  assert.equal(f.read('results',ref.resultId),undefined);
  assert.equal(f.messages.length,1);
});


test('orphaned cloud request retains OUTCOME_UNKNOWN if original Run row is missing',async()=>{
  const f=fixture({run:null,result:null});
  await f.service.cloudStop({},{});
  const row=f.read('frameworkKV','cloud:request:'+requestId);
  assert.equal(row.runId,ref.runId);
  assert.equal(row.state,'OUTCOME_UNKNOWN');
  assert.equal(row.reason,'E_EFFECT_UNKNOWN');
  assert.equal(f.read('frameworkKV','cloud:config').enabled,false);
  assert.deepEqual(f.messages,[]);
  await f.service.cloudStop({},{});
  assert.equal(f.read('frameworkKV','cloud:request:'+requestId).state,'OUTCOME_UNKNOWN');
});

test('released original Run without a durable Result cannot be projected as finished',async()=>{
  const f=fixture({result:null});
  await f.service.reconcile();
  const row=f.read('frameworkKV','cloud:request:'+requestId);
  assert.equal(row.state,'OUTCOME_UNKNOWN');
  assert.equal(row.reason,'E_EFFECT_UNKNOWN');
  assert.equal(f.read('runs',ref.runId).retirementState,'released');
  assert.equal(f.read('results',ref.resultId),undefined);
  assert.equal(f.posts.length,1);
  assert.deepEqual(f.messages,[]);
});

test('wrong immutable Result source identity also remains unknown after Stop',async()=>{
  const f=fixture({result:{...baseResult,revision:{sourceHash:'different-source'}}});
  await f.service.cloudStop({},{});
  const row=f.read('frameworkKV','cloud:request:'+requestId);
  assert.equal(row.state,'OUTCOME_UNKNOWN');
  assert.equal(row.reason,'E_EFFECT_UNKNOWN');
  assert.equal(f.read('results',ref.resultId).revision.sourceHash,'different-source');
  assert.deepEqual(f.messages,[]);
});

test('post-crash paused_unknown Run cannot become cancelled on hosting Stop',async()=>{
  const f=fixture({run:{...baseRun,state:'paused_unknown',retirementState:'not-started'},
    result:null,request:{...baseRequest,state:'OUTCOME_UNKNOWN',reason:'worker-restart'}});
  await f.service.cloudStop({},{});
  const row=f.read('frameworkKV','cloud:request:'+requestId);
  assert.equal(row.state,'OUTCOME_UNKNOWN');
  assert.equal(row.reason,'E_EFFECT_UNKNOWN');
  assert.equal(f.read('runs',ref.runId).state,'paused_unknown');
  assert.deepEqual(f.messages,[]);
});

test('unadmitted waiting claim with no Run association may still be cancelled',async()=>{
  const f=fixture({run:null,result:null,
    request:{...baseRequest,runId:undefined,runRef:undefined,state:'waiting'}});
  await f.service.cloudStop({},{});
  const row=f.read('frameworkKV','cloud:request:'+requestId);
  assert.equal(row.state,'cancelled');
  assert.equal(row.reason,'E_CLOUD_REVOKED');
  assert.deepEqual(f.messages,[]);
});
