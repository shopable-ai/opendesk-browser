import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createOrdinarySiteFixture} from '../dev/local-test/ordinary-site-fixture.mjs';
import {runtime,deferred,profile,released,EXTENSION_ORIGIN} from './helpers/controller-fixture.mjs';

const KEY='aiVipCookieDeliveryR137';
const origins=['http://localhost:7901','http://127.0.0.1:7902'];
function request(args){
  return new Promise((resolve,reject)=>{
    const body=args.data===undefined?null:JSON.stringify(args.data);
    const req=http.request(args.url,{method:args.method,headers:{...args.config.headers,
      Origin:EXTENSION_ORIGIN,...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{})}},res=>{
      let data='';res.setEncoding('utf8');res.on('data',chunk=>data+=chunk);
      res.on('end',()=>{try{resolve({status:res.statusCode,data:JSON.parse(data)});}catch(error){reject(error);}});
    });
    req.on('error',reject);req.end(body);
  });
}
async function setup(t,options={}){
  const fixtures=[],grants=[];
  for(const [index,host] of ['localhost','127.0.0.1'].entries()){
    const fixture=createOrdinarySiteFixture({host,port:7901+index,extensionOrigin:EXTENSION_ORIGIN,
      ...(options.sameDelivery?{fixedDeliveryId:'same-delivery-id-across-origins'}:{})});
    fixtures.push(fixture);t.after(()=>fixture.close());
    await fixture.listen();grants.push(fixture.authorize({subjectId:'controlled-subject'}));
  }
  const trace=[];
  const ordinaryNetwork=async args=>{
    assert.match(args.config.headers['X-Ordinary-Session-Credential'],/^Bearer [A-Za-z0-9_-]+$/);
    assert(!Object.keys(args.config.headers).some(key=>key.toLowerCase()==='authorization'));
    trace.push(args.method+' '+args.url);
    const response=await request(args);
    return options.response?options.response(args,response):response;
  };
  const e=await runtime({...options,ordinaryNetwork});
  const select=async index=>{
    e.get('site-select').value='ordinary-'+index;
    e.get('site-select').listeners.change({isTrusted:true});await e.flush();
  };
  const acquire=async index=>{
    await select(index);e.get('source-credential').value=grants[index].credential;
    await e.click('site-receive');
  };
  const wait=async predicate=>{
    for(let i=0;i<200&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert(predicate(),'controller operation must settle: '+e.get('site-status').textContent+' / '+e.get('cookie-status').textContent);await e.flush();
  };
  return {e,fixtures,grants,trace,select,acquire,wait};
}
function attempts(e){
  const journal=e.store.get(KEY);
  assert.equal(journal.schemaVersion,2);
  assert.deepEqual(journal.legacy,{record:null,attribution:null});
  return journal.attempts;
}

test('ordinary credentials -> authorization GET -> session POST -> original-key CAS -> one SDK batch',async t=>{
  const h=await setup(t),{e,trace}=h;
  await h.select(0);await e.click('site-receive',false);assert.deepEqual(trace,[]);
  e.get('source-credential').value='not-a-bearer';await e.click('site-receive');assert.deepEqual(trace,[]);
  await h.acquire(0);await h.wait(()=>!e.get('cookie-install').hidden);
  assert.deepEqual(trace,['GET '+origins[0]+'/api/authorization','POST '+origins[0]+'/api/session']);
  assert.equal(e.get('source-credential').value,'');assert.equal(e.cookieCalls.length,0);
  await e.click('cookie-install');await h.wait(()=>e.cookieCalls.length===1&&!e.get('site-select').disabled);
  assert.equal(trace.at(-1),'GET '+origins[0]+'/api/authorization');
  assert.equal(e.cookieCalls[0].url,origins[0]+'/session/');
  const rows=attempts(e);assert.equal(rows.length,1);assert.equal(rows[0].state,'success');
  assert.equal(rows[0].results.length,2);assert(rows[0].results.every(row=>row.saved&&row.verified));
  const writes=e.storageCalls.filter(row=>row.operation==='storage.set'&&row.key===KEY);
  assert.deepEqual(writes.map(row=>row.value.attempts.length),[0,1,1]);
  assert.equal(writes[1].value.attempts[0].resolution,'pending');
  for(const write of writes)assert.match(write.ifMatch,/^[a-f0-9]{64}$/);
  const saved=JSON.stringify([...e.store.values()]);
  for(const cookie of e.cookieCalls[0].cookies)assert(!saved.includes(cookie.value));
  assert(!saved.includes(h.grants[0].credential));assert.equal(e.fixture.ledger.size,0);
  assert.equal(e.calls.filter(row=>new URL(row.url).port==='7898').length,0);
  await e.click('cookie-install');assert.equal(e.cookieCalls.length,1);
  assert.deepEqual(e.tabCalls,[{url:origins[0]+'/session/'}]);
});

test('A-B-A selection invalidates the first A late session response',async t=>{
  const entered=deferred(),release=deferred();let hold=true;
  const h=await setup(t,{response:async(args,response)=>{
    if(hold&&args.method==='POST'){hold=false;entered.resolve();await release.promise;}
    return response;
  }}),{e}=h;
  t.after(()=>release.resolve());
  await h.acquire(0);await entered.promise;await h.select(1);await h.select(0);
  release.resolve();await h.wait(()=>e.get('site-receive').disabled===false);
  assert.equal(e.get('cookie-install').hidden,true);assert.equal(e.cookieCalls.length,0);
  assert.equal(e.store.has(KEY),false);
  await h.acquire(0);await h.wait(()=>!e.get('cookie-install').hidden);
  await e.click('cookie-install');await h.wait(()=>e.cookieCalls.length===1&&!e.get('site-select').disabled);
  assert.equal(attempts(e).length,1);
});

test('revoked ordinary authorization at confirmation prevents CAS and SDK writes',async t=>{
  const h=await setup(t),{e}=h;await h.acquire(0);await h.wait(()=>!e.get('cookie-install').hidden);
  h.fixtures[0].revoke('controlled-subject');await e.click('cookie-install');
  await h.wait(()=>e.get('cookie-install').hidden);
  assert.equal(e.cookieCalls.length,0);assert.equal(e.store.has(KEY),false);
  assert.equal(e.storageCalls.filter(row=>row.operation==='storage.set'&&row.key===KEY).length,0);
});

test('both ordinary Hosts use the same handler without conflating identical delivery IDs',async t=>{
  const h=await setup(t,{sameDelivery:true}),{e}=h;
  for(const index of [0,1]){
    await h.acquire(index);await h.wait(()=>!e.get('cookie-install').hidden);
    assert.equal(e.get('cookie-install').disabled,false);
    await e.click('cookie-install');
    await h.wait(()=>e.cookieCalls.length===index+1&&!e.get('site-select').disabled);
  }
  const rows=attempts(e);assert.equal(rows.length,2);
  assert.equal(rows[0].deliveryId,rows[1].deliveryId);assert.notEqual(rows[0].scopeKey,rows[1].scopeKey);
  assert.deepEqual(rows.map(row=>row.state),['success','success']);
  assert.deepEqual(e.cookieCalls.map(row=>row.url),origins.map(origin=>origin+'/session/'));
});

test('profile revocation after marker saves notInvoked and permits fresh acquisition after restoration',async t=>{
  let revoke=true,e;
  const h=await setup(t,{afterStorageSet:async payload=>{
    if(!revoke||payload.key!==KEY||payload.value.attempts?.at(-1)?.resolution!=='pending')return;
    revoke=false;e.setStatus({...released,developmentProfile:null});await e.click('proxy-refresh');
  }});e=h.e;
  await h.acquire(0);await h.wait(()=>!e.get('cookie-install').hidden);
  await e.click('cookie-install');await h.wait(()=>!e.get('site-select').disabled);
  assert.equal(e.cookieCalls.length,0);assert.equal(attempts(e)[0].resolution,'not-submitted');
  assert.equal(attempts(e)[0].state,'failed');
  assert.doesNotMatch(e.get('site-status').textContent,/已设置/);
  e.setStatus({...released,developmentProfile:profile});await e.click('proxy-refresh');
  await h.acquire(0);await h.wait(()=>!e.get('cookie-install').hidden);
  await e.click('cookie-install');await h.wait(()=>e.cookieCalls.length===1&&!e.get('site-select').disabled);
  assert.deepEqual(attempts(e).map(row=>row.state),['failed','success']);
});

test('ambiguous SDK result locks both ordinary Hosts and survives controller reopen',async t=>{
  const h=await setup(t,{cookieSetMany:async()=>{throw Object.assign(Error('dispatched then closed'),{code:'E_CANCELLED'});}}),{e}=h;
  await h.acquire(0);await h.wait(()=>!e.get('cookie-install').hidden);
  await e.click('cookie-install');await h.wait(()=>e.cookieCalls.length===1&&!e.get('site-select').disabled);
  assert.equal(attempts(e)[0].state,'unknown');assert.equal(attempts(e)[0].resolution,'pending');
  assert.doesNotMatch(e.get('site-status').textContent,/已设置/);
  const before=h.trace.length;await h.acquire(1);assert.equal(h.trace.length,before);
  assert.equal(e.get('site-receive').disabled,true);assert.equal(e.cookieCalls.length,1);
  const reopened=await runtime({store:e.store});
  reopened.get('site-select').value='ordinary-1';reopened.get('site-select').listeners.change({isTrusted:true});
  assert.equal(reopened.get('site-receive').disabled,true);assert.equal(reopened.cookieCalls.length,0);
  assert.equal(attempts(reopened)[0].state,'unknown');
});

test('trusted pre-dispatch cancellation requires a fresh manual confirmation, never an automatic retry',async t=>{
  let cancel=true;
  const h=await setup(t,{cookieSetMany:async args=>{
    if(cancel)throw Object.assign(Error('review cancelled before dispatch'),{code:'E_COOKIE_NOT_SUBMITTED'});
    return {saved:args.cookies.length,verified:args.cookies.length,
      results:args.cookies.map((_,index)=>({index,saved:true,verified:true}))};
  }}),{e}=h;
  await h.acquire(0);await h.wait(()=>!e.get('cookie-install').hidden);
  await e.click('cookie-install');await h.wait(()=>e.cookieCalls.length===1&&!e.get('site-select').disabled);
  assert.equal(attempts(e)[0].state,'failed');assert.equal(attempts(e)[0].resolution,'not-submitted');
  await e.flush();assert.equal(e.cookieCalls.length,1);assert.equal(e.get('cookie-install').disabled,false);
  cancel=false;await e.click('cookie-install',false);assert.equal(e.cookieCalls.length,1);
  await e.click('cookie-install');await h.wait(()=>e.cookieCalls.length===2&&!e.get('site-select').disabled);
  assert.deepEqual(attempts(e).map(row=>row.state),['failed','success']);
});
