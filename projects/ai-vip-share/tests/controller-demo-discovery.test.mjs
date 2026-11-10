import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runtime,profile,PREFERENCE,RECOVERY,deferred,released} from './helpers/controller-fixture.mjs';
import {AUTO_PREPARATION_PAUSE_KEY} from '../src/activation-links.js';

const origin='http://127.0.0.1:7903';
const landing={status:'available',url:'http://127.0.0.1:7898/activate?activation_code=DEMO-VIP-01'};
const market={status:'available',url:'https://market.example.com/'};
const unknownCookie={schemaVersion:1,deliveryId:'delivery',attemptId:'attempt',accountId:'account',
  serviceOrigin:'http://127.0.0.1:7898',targetUrl:'http://127.0.0.1:7898/session/',
  state:'unknown',count:2,results:[],seen:[]};
const choice={schemaVersion:2,enabled:true,serviceOrigin:origin};
const record={schemaVersion:2,serviceOrigin:origin,toolId:'ai-vip-share',packageVersion:'1.4.34',
  accountId:'local-fixture-account',idempotencyKey:randomUUID(),createdAt:Date.now()};
const open=options=>runtime({shippedDom:true,pollTimers:true,currentPage:landing,...options});
const tick=async e=>{e.timers.find(row=>row.ms===1200).callback();await e.flush();};
const posts=(e,path)=>e.calls.filter(row=>row.method==='POST'&&row.url.endsWith('/'+path));
function noEffects(e){
  assert.deepEqual(e.cookieCalls,[]);assert.deepEqual(e.proxyCalls,[]);assert.deepEqual(e.tabCalls,[]);
}
function disconnected(e){
  assert.deepEqual(e.calls,[]);
  assert.equal(e.storageCalls.filter(row=>row.operation==='storage.set').length,0);
  noEffects(e);
}

test('control-free initial landing selects only service preference and runs non-consuming review',async()=>{
  const e=await open();
  assert.equal(e.get('local-development'),undefined);assert.equal(e.get('local-connect'),undefined);
  assert.deepEqual(e.store.get(PREFERENCE),choice);
  assert.deepEqual(e.calls.map(row=>[row.method,new URL(row.url).pathname]),[
    ['GET','/api/member'],['POST','/api/preview']]);
  assert.equal(e.get('redeem-preview').hidden,false);assert.equal(posts(e,'redeem').length,0);
  assert.deepEqual(e.storageCalls.filter(row=>row.operation==='storage.set').map(row=>row.key),[PREFERENCE]);
  assert.ok(!JSON.stringify([...e.store]).includes('DEMO-VIP-01'));noEffects(e);
});

for(const developmentProfile of [null,{...profile,endpoint:{...profile.endpoint,port:43132}}])
  test('no trusted or invalid SDK profile never selects Demo: '+JSON.stringify(developmentProfile),async()=>{
    const e=await open({developmentProfile});await tick(e);disconnected(e);
  });

for(const url of [market.url,'http://127.0.0.1:43132/activate?activation_code=DEMO-VIP-01',
  'http://localhost:7898/activate?activation_code=DEMO-VIP-01',
  'http://192.168.30.3:7899/activate?activation_code=DEMO-VIP-01',
  landing.url+'&extra=1',landing.url+'#fragment',landing.url.replace('/activate?','/activate/?')])
  test('automatic discovery rejects noncanonical source '+url,async()=>{
    const e=await open({currentPage:{status:'available',url}});await tick(e);disconnected(e);
  });

test('Host navigation during async preference read prevents selection',async()=>{
  const e=await open({currentPage:(()=>{let reads=0;return ()=>++reads===1?landing:market;})()});
  await tick(e);disconnected(e);
});

test('explicit false never restarts, including later navigation and SDK refresh',async()=>{
  const store=new Map([[PREFERENCE,{...choice,enabled:false}]]),e=await open({store});
  await tick(e);await e.click('proxy-refresh');await tick(e);
  disconnected(e);assert.deepEqual(store.get(PREFERENCE),{...choice,enabled:false});
});

for(const [key,value] of [[RECOVERY,record],[RECOVERY,{...record,serviceOrigin:'https://other.example.com'}],
  [RECOVERY,{schemaVersion:999}],['aiVipCookieDeliveryR137',{schemaVersion:999}],['aiVipCookieDeliveryR137',unknownCookie],
  [AUTO_PREPARATION_PAUSE_KEY,{schemaVersion:1,scopes:[{serviceOrigin:origin,accountId:record.accountId}]}],
  [AUTO_PREPARATION_PAUSE_KEY,{schemaVersion:999}]])
  test('unknown, incompatible or cancelled state stays intact and blocks new selection '+key+JSON.stringify(value),async()=>{
    const store=new Map([[key,value]]),e=await open({store});await tick(e);
    disconnected(e);assert.deepEqual([...store],[[key,value]]);
  });

test('persisted selected Demo keeps unknown transaction for explicit status query, never replays',async()=>{
  const store=new Map([[PREFERENCE,choice],[RECOVERY,record]]),e=await open({store});
  await tick(e);
  assert.deepEqual(e.calls.map(row=>row.method),['GET']);
  await e.click('recovery-check');await tick(e);
  assert.equal(posts(e,'status').length,1);assert.equal(posts(e,'redeem').length,0);
  assert.deepEqual(store.get(RECOVERY),record);noEffects(e);
});

test('cancelled review is not revived on another control-free surface',async()=>{
  const e=await open();await e.click('redeem-cancel');
  const reopened=await open({store:e.store,fixture:e.fixture});await tick(reopened);
  assert.deepEqual(reopened.calls.map(row=>row.method),['GET']);
  assert.equal(posts(reopened,'redeem').length,0);
  assert.match(reopened.get('redeem-status').textContent,/取消自动继续/);noEffects(reopened);
});

test('lost CAS acknowledgement is read back, while a competing opt-out wins',async()=>{
  const saved=await open({afterStorageSet:payload=>{if(payload.key===PREFERENCE)throw Error('lost ack');}});
  assert.deepEqual(saved.store.get(PREFERENCE),choice);assert.equal(posts(saved,'preview').length,1);noEffects(saved);
  const store=new Map();
  const e=await open({store,afterStorageSet:payload=>{
    if(payload.key===PREFERENCE)store.set(PREFERENCE,{...choice,enabled:false});
  }});
  assert.deepEqual(e.calls,[]);assert.equal(store.get(PREFERENCE).enabled,false);noEffects(e);
});

test('revoked profile during discovery cannot connect',async()=>{
  const gate=deferred();let checks=0;
  const e=await open({currentPage:market,getStatus:async()=>{
    if(++checks===2)await gate.promise;
    return {...released,...(checks<3?{developmentProfile:profile}:{})};
  }});
  e.setPage(landing);const running=e.checkPage();await e.flush();
  // A newer SDK read revokes the profile before the older result can continue.
  await e.click('proxy-refresh');gate.resolve();await running;disconnected(e);
});


test('unmount during a delayed SDK refresh cannot select or preflight',async()=>{
  const gate=deferred();let reads=0;
  const e=await open({currentPage:market,getStatus:async()=>{
    if(++reads===2)await gate.promise;
    return {...released,developmentProfile:profile};
  }});
  e.setPage(landing);const running=e.checkPage();await e.flush();
  e.release(); // VM auto-mount returns its same original lifecycle disposer.
  gate.resolve();await running;
  disconnected(e);
});


for(const [key,value] of [[RECOVERY,record],['aiVipCookieDeliveryR137',unknownCookie]])
  test('another surface writes unknown state during service CAS: '+key,async()=>{
    const store=new Map();
    const e=await open({store,afterStorageSet:payload=>{if(payload.key===PREFERENCE)store.set(key,value);}});
    assert.deepEqual(e.calls,[]);assert.deepEqual(store.get(key),value);noEffects(e);
  });

test('navigation after service CAS does not connect the current surface',async()=>{
  let changed=false;
  const e=await open({currentPage:()=>changed?market:landing,
    afterStorageSet:payload=>{if(payload.key===PREFERENCE)changed=true;}});
  assert.deepEqual(e.calls,[]);noEffects(e);
});
