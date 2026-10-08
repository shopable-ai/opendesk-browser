import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunAuthority} from '../../src/platform/host/authority.js';
import {createSdkBroker} from '../../src/platform/host/sdk-broker.js';
import {createStorageMethods} from '../../src/platform/storage/repository.js';
import {CONTRACT_VERSION, CONTRACT_HASH} from '../../src/platform/protocol.js';
import {encodeValue, decodeValue} from '../../src/platform/page-port/codec.js';
import {createHttp} from '../../src/framework/sdk/http.js';
import {startSdkTargets} from './fixtures/sdk-target-origins/server.mjs';

// Actual authority, SDK delegate, axiosx facade and HTTP driver with real loopback
// observations. Chrome sender/permissions and serial persistence are component
// oracles. This is NOT native tool clicking, extension injection or IDB evidence.
const deferred = () => { let resolve; const promise = new Promise(yes => {resolve = yes;}); return {promise,resolve}; };
async function fixture(t, observe = () => {}) {
  const http = await startSdkTargets({ports:[0,0,0],log:observe}); t.after(() => http.close());
  let rows = new Map(), tail = Promise.resolve();
  const storage = {transaction(names,mode,body) {
    const next = tail.then(async () => {
      const copy = structuredClone(rows);
      const store = name => { assert.ok(names.includes(name)); if (!copy.has(name)) copy.set(name,new Map()); return copy.get(name); };
      const tx = {get:async(n,k)=>structuredClone(store(n).get(k)),all:async n=>[...store(n).values()].map(v=>structuredClone(v)),
        put:async(n,v,k)=>{assert.equal(mode,'readwrite');store(n).set(k,structuredClone(v));},
        delete:async(n,k)=>{assert.equal(mode,'readwrite');store(n).delete(k);}};
      const result = await body(tx); if(mode==='readwrite')rows=copy; return result;
    }); tail=next.catch(()=>{}); return next;
  }};
  const A = 'https://a.example';
  // B/C use distinct exact ports. Native Chrome host patterns cannot distinguish
  // these ports; application scope MUST still reject C. Source A is independent.
  const native = new Set([`${A}/*`,'http://127.0.0.1/*']);
  const api = {runtime:{id:'extension',getURL:p=>`chrome-extension://extension/${p}`},
    permissions:{contains:async({origins=[],permissions=[]})=>permissions.length===0&&origins.every(p=>native.has(p))},
    webNavigation:{getAllFrames:async()=>[{frameId:0,documentId:'doc-A',documentLifecycle:'active',url:`${A}/page`}]}};
  const clock = {now:()=>Date.now()}; Object.assign(storage,createStorageMethods(storage,{clock}));
  const authority = createRunAuthority({storage,api,clock,session:'session'});
  const sender = {id:'extension',url:`${A}/page`,frameId:0,documentId:'doc-A',documentLifecycle:'active',tab:{id:2,incognito:false}};
  const host = {...sender,url:api.runtime.getURL('ui/tool.html'),documentId:'tool-doc',tab:{id:1,incognito:false}};
  await authority.registerHost({hostInstanceId:'tool-host',claimedContractVersion:CONTRACT_VERSION,claimedContractHash:CONTRACT_HASH},host);
  const broker = createSdkBroker({authority,storage,api,clock}); t.after(()=>broker.dispose());
  const grant = (targetOrigins=[http.origins.B])=>authority.grantSdk({tabId:2,frameId:0,documentId:'doc-A',capabilities:['network'],targetOrigins},host);
  const payload = (id,role='B',path='probe',deadlineAt=Date.now()+10000)=>({requestId:id,method:'AXIOS_GET',
    argsWire:encodeValue({url:`${http.origins[role]}${http.prefix}/${path}?case=${id}`,config:{responseType:'json'}}),deadlineAt});
  const call = p=>broker.request(p,sender).then(reply=>decodeValue(reply.valueWire));
  return {http,storage,api,authority,broker,sender,native,grant,payload,call,
    operations:()=>storage.transaction(['commandJournal'],'readonly',async tx=>(await tx.all('commandJournal')).filter(r=>r.tag==='sdk-operation'))};
}

test('real B HTTP is reached through existing axiosx/broker; native permission alone and unapproved C produce zero requests',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.call(f.payload('native-only')),{code:'E_GRANT_REVOKED'});
  assert.equal(f.http.snapshot().counts.B,0);
  await f.grant();
  const axiosx=createHttp(async(method,args)=>{
    const result=await f.call({requestId:'facade',method,argsWire:encodeValue(args),deadlineAt:Date.now()+10000});
    assert.equal(result.PageBrigeCode,0);return result.data;
  });
  const response=await axiosx.get(`${f.http.origins.B}${f.http.prefix}/probe?case=facade`,{responseType:'json',withCredentials:false});
  assert.equal(response.status,200);assert.equal(response.data.role,'B');
  await assert.rejects(f.call(f.payload('unapproved','C')),{code:'E_PERMISSION'});
  assert.deepEqual(f.http.snapshot().counts,{A:0,B:1,C:0});
  assert.equal(f.http.snapshot().records.every(row=>!row.cookiePresent&&!row.authorizationPresent),true);
});

test('100 same-ID concurrent actual HTTP requests produce exactly one B observation and no replay after receipt',async t=>{
  const observed=deferred(),f=await fixture(t,observed.resolve);await f.grant();
  const p=f.payload('same','B','hold');
  const pending=Promise.all(Array.from({length:100},()=>f.call(structuredClone(p))));
  await observed.promise;assert.equal(f.http.snapshot().counts.B,1);assert.equal(f.http.snapshot().held,1);
  f.http.release();const values=await pending;
  assert.ok(values.every(value=>value.data.data.sequence===1));
  await f.call(p);assert.equal(f.http.snapshot().counts.B,1);
  const operations=await f.operations();assert.equal(operations.length,1);assert.equal(operations[0].submissionCount,1);
});

test('changed args/deadline conflict without new B HTTP; different request IDs are not merged',async t=>{
  const f=await fixture(t);await f.grant();const p=f.payload('identity');await f.call(p);
  await assert.rejects(f.call({...p,deadlineAt:p.deadlineAt+1}),{code:'E_REQUEST_CONFLICT'});
  const different=f.payload('identity');different.argsWire=encodeValue({url:`${f.http.origins.B}${f.http.prefix}/probe?case=changed`,config:{responseType:'json'}});
  await assert.rejects(f.call(different),{code:'E_REQUEST_CONFLICT'});
  assert.equal(f.http.snapshot().counts.B,1);
  await Promise.all(['different-1','different-2'].map(id=>f.call(f.payload(id))));
  assert.equal(f.http.snapshot().counts.B,3);
});

test('observed revocation and immediate regrant cannot deliver or replay an already observed B request',async t=>{
  const observed=deferred(),f=await fixture(t,observed.resolve);const old=await f.grant();
  const p=f.payload('revoked','B','hold');
  const pending=f.call(p);const rejected=assert.rejects(pending,error=>['E_CANCELLED','E_GRANT_REVOKED'].includes(error.code));
  await observed.promise;
  await f.authority.revokeSdkGrants({origins:['http://127.0.0.1/*'],reason:'observed-native-removal'});
  const fresh=await f.grant();assert.notEqual(old.grantIncarnation,fresh.grantIncarnation);
  f.http.release();await rejected;
  await assert.rejects(f.call(p),{code:'E_GRANT_REVOKED'});
  assert.equal(f.http.snapshot().counts.B,1);
  await f.call(f.payload('fresh'));assert.equal(f.http.snapshot().counts.B,2);
});

test('removing target native permission alone blocks B while source A remains authorized',async t=>{
  const f=await fixture(t);await f.grant();f.native.delete('http://127.0.0.1/*');
  assert.equal(await f.api.permissions.contains({origins:['https://a.example/*']}),true);
  await assert.rejects(f.call(f.payload('lost-target')),{code:'E_PERMISSION'});
  assert.deepEqual(f.http.snapshot().counts,{A:0,B:0,C:0});
});
