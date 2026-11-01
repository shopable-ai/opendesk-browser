import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLocalTaskBridge,validateLocalTaskRequest,revokeLocalTasks} from '../../src/platform/host/local-tasks.js';

const origin='chrome-extension://abcdefghijklmnopabcdefghijklmnop';
function fixture(){
  const values={},calls=[];let approvals=0,valid=true,loseStart=false;
  const api={runtime:{id:'abcdefghijklmnopabcdefghijklmnop'},storage:{local:{
    async get(key){return {[key]:structuredClone(values[key])};},
    async set(rows){Object.assign(values,structuredClone(rows));},async remove(key){delete values[key];}
  }},downloads:{async download(){return 12;}}};
  const fetcher=async(url,options)=>{
    calls.push({url,options});
    if(loseStart&&url.endsWith('/v1/runs'))throw Error('receipt lost');
    const body=url.endsWith('/session')?{token:'session-secret',expiresAt:Date.now()+900000}:
      url.endsWith('/revoke')?{revoked:true,workerExited:true}:
      {runId:'run-1',requestId:'req-1',status:'running',recordsCount:0};
    return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
  };
  const bridge=createLocalTaskBridge({api,toolId:'test-tool',owner:'test-install',fetcher,
    assertAuthorized:async()=>{if(!valid)throw Error('revoked');},
    confirm:async({choose})=>{approvals++;return choose();},
    pickCredential:async()=>({format:'opendesk.local-task-credential.v1',secret:'x'.repeat(48),endpoint:'http://127.0.0.1:43231'}),
  });
  const start={method:'POST',path:'/v1/runs',targetOrigin:'https://example.com',body:{requestId:'req-1',mode:'preview',config:{url:'https://example.com/'},previewPages:3}};
  return {bridge,api,values,calls,start,get approvals(){return approvals;},revoke(){valid=false;},loseReceipt(){loseStart=true;}};
}
test('reject arbitrary localhost URLs, traversal, unsupported endpoints and large inputs',()=>{
  for(const path of ['http://127.0.0.1:9000/admin','/v1/runs/../session','/v1/session','/v1/runs/a?x=1','/v1/runs/a/records?limit=10000','/v1/runs/%2e%2e'])
    assert.throws(()=>validateLocalTaskRequest({method:'GET',path}));
  assert.throws(()=>validateLocalTaskRequest({method:'POST',path:'/v1/runs',targetOrigin:'https://example.com',body:{x:'x'.repeat(40000)}}));
});
test('one reviewed scope, private tokens, owned status and stop survive reopening',async()=>{
  const f=fixture();const result=await f.bridge.request(f.start);
  assert.equal(result.runId,'run-1');assert.equal(f.approvals,1);
  await f.bridge.request({method:'GET',path:'/v1/runs/run-1'});
  await f.bridge.request({method:'POST',path:'/v1/runs/run-1/stop',body:{}});
  assert.equal(f.approvals,1);
  assert.ok(f.calls.every(c=>c.url.startsWith('http://127.0.0.1:43231/')));
  assert.doesNotMatch(JSON.stringify(result),/secret/);
  await assert.rejects(f.bridge.request({method:'GET',path:'/v1/runs/other'}));
});
test('unknown POST saves request identity before dispatch and never retries',async()=>{
  const f=fixture();await f.bridge.request(f.start);
  const count=f.calls.length;
  await assert.rejects(f.bridge.request(f.start),/重放|replay/);
  assert.equal(f.calls.length,count);
});
test('revoked identity cannot poll; durable cleanup revokes server owner',async()=>{
  const f=fixture();await f.bridge.request(f.start);f.revoke();
  await assert.rejects(f.bridge.request({method:'GET',path:'/v1/runs/run-1'}),/revoked/);
  await revokeLocalTasks(f.api,'test-tool',{fetcher:async(url)=>{
    assert.ok(url.endsWith('/v1/revoke'));return Response.json({revoked:true,workerExited:true});}});
});

test('prototype request and run IDs cannot use inherited ownership or bypass replay checks',async()=>{
  const f=fixture();
  for(const requestId of ['__proto__','constructor','prototype'])
    await assert.rejects(f.bridge.request({...f.start,body:{...f.start.body,requestId}}));
  await f.bridge.request(f.start);
  for(const ref of ['__proto__','constructor','toString'])
    await assert.rejects(f.bridge.request({method:'GET',path:'/v1/runs/'+ref}));
  assert.equal(f.calls.filter(call=>call.url.endsWith('/v1/runs')).length,1);
});

test('lost creation receipt durably fences new IDs until original by-request lookup',async()=>{
  const f=fixture();f.loseReceipt();
  await assert.rejects(f.bridge.request(f.start),/未知/);
  await assert.rejects(f.bridge.request({...f.start,body:{...f.start.body,requestId:'req-2'}}),/未知/);
  assert.equal(f.calls.filter(call=>call.url.endsWith('/v1/runs')).length,1);
  await f.bridge.request({method:'GET',path:'/v1/runs/by-request/req-1'});
  const row=Object.values(f.values)[0];assert.equal(row.unresolved,undefined);
  assert.equal(row.runs['run-1'],'https://example.com');
});

test('revocation waits behind pending identity writes and never resurrects credentials or starts work',async()=>{
  const f=fixture();let enter,release;
  const entered=new Promise(resolve=>{enter=resolve;}),barrier=new Promise(resolve=>{release=resolve;});
  const write=f.api.storage.local.set;
  f.api.storage.local.set=async rows=>{
    if(Object.values(rows).some(row=>row.unresolved==='req-1')){enter();await barrier;}
    return write(rows);
  };
  const pending=f.bridge.request(f.start);await entered;f.revoke();
  const revoked=revokeLocalTasks(f.api,'test-tool',{fetcher:async()=>Response.json({revoked:true,workerExited:true})});
  release();await assert.rejects(pending,/revoked/);await revoked;
  assert.equal(f.calls.filter(call=>call.url.endsWith('/v1/runs')).length,0);
  assert.equal(Object.keys(f.values).length,0);
});
