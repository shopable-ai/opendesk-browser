import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudService} from '../../src/cloud-control/service.js';

const ref={runId:'run-private',resultId:'result-private',requestId:'cloud:request-private',
  sourceHash:'fixed-source',manifestHash:'fixed-manifest',grantId:'fixed-grant'};
const run={tag:'controller-run',namespace:'tool:trusted',cloudRequestId:ref.requestId,
  runId:ref.runId,resultId:ref.resultId,state:'completed',retirementState:'released'};
const result={tag:'controller-result',runId:ref.runId,resultId:ref.resultId,
  revision:{sourceHash:ref.sourceHash},state:'completed',
  outcome:{valueWire:{secret:'PRIVATE-WEB-PAGE-TEXT'},
    error:{message:'PRIVATE-ERROR-DETAIL'},url:'https://private.invalid'}};
const request={tag:'cloud-request-v1',namespace:'tool:trusted',
  requestId:ref.requestId,grantId:ref.grantId,runId:ref.runId,runRef:ref,
  state:'permitted',createdAt:1,
  assignment:{assignmentId:'assignment-private',leaseUntil:200000},
  task:{resultAllowed:false,manifest:{siteOrigins:[]}}};
const config={namespace:'tool:trusted',providerId:'provider-private',enabled:true,
  url:'https://provider.invalid',credential:'token',grantId:ref.grantId,tasks:[]};

test('Browser reconciles status-only Result while withholding secret payload and raw errors',async()=>{
  let db=new Map([
    ['frameworkKV:cloud:config',structuredClone(config)],
    ['frameworkKV:cloud:request:'+ref.requestId,structuredClone(request)],
    ['runs:'+ref.runId,structuredClone(run)],
    ['results:'+ref.resultId,structuredClone(result)]
  ]);
  const posts=[];
  const storage={transaction:async(names,mode,fn)=>{
    const snap=new Map([...db.entries()].map(([k,v])=>[k,structuredClone(v)]));
    const tx={
      get:async(name,key)=>structuredClone(snap.get(name+':'+key)),
      all:async(name)=>[...snap.entries()].filter(([key])=>key.startsWith(name+':')).map(([,v])=>structuredClone(v)),
      put:async(name,value,key)=>{assert.equal(mode,'readwrite');snap.set(name+':'+key,structuredClone(value));},
      delete:async(name,key)=>{snap.delete(name+':'+key);}
    };
    const response=await fn(tx);
    if(mode==='readwrite')db=snap;
    return response;
  }};
  const service=createCloudService({storage,api:{runtime:{id:'trusted'}},
    clock:{now:()=>1000},assertHost:async()=>({namespace:'tool:trusted'}),
    currentHost:async()=>true,resolveTask:async()=>{throw Error('No resolver expected');},
    emitToHost:async()=>{},fetcher:async(url,options)=>{
      const body=JSON.parse(options.body);posts.push({url,body});
      if(url.endsWith('/v1/reconcile'))return new Response(JSON.stringify({
        providerId:config.providerId,
        assignments:[{assignmentId:request.assignment.assignmentId,
          runRef:ref,cancelled:false,leaseUntil:200000}]
      }),{status:200});
      if(url.endsWith('/v1/receipt'))return new Response(JSON.stringify({
        receiptId:'receipt-confirmed',digest:'private-digest'
      }),{status:200});
      throw Error('Unexpected '+url);
    }});
  await service.reconcile();
  const receipts=posts.filter(p=>p.url.endsWith('/v1/receipt'));
  assert.equal(receipts.length,1,'Completion status must be reconciled');
  const data=receipts[0].body;
  assert.deepEqual(data.result,{visibility:'status-only',
    state:'completed',retirementState:'released'});
  const serialized=JSON.stringify(data);
  for(const forbidden of ['PRIVATE-WEB-PAGE-TEXT','PRIVATE-ERROR-DETAIL','https://private.invalid',
    'valueWire','error','revision','sourceHash\":\"fixed-source\"'])
    if(forbidden!=='sourceHash\":\"fixed-source\"')assert.equal(serialized.includes(forbidden),false,forbidden);
  assert.equal(db.get('frameworkKV:cloud:request:'+ref.requestId).receipt.receiptId,'receipt-confirmed');
  assert.equal(db.get('frameworkKV:cloud:request:'+ref.requestId).state,'finished');
  await service.reconcile();
  assert.equal(posts.filter(p=>p.url.endsWith('/v1/receipt')).length,1,
    'Confirmed Result receipt cannot upload twice');
  assert.deepEqual(db.get('results:'+ref.resultId),result,'Original durable Result remains intact');
});
