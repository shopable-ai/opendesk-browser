import test from 'node:test';
import assert from 'node:assert/strict';
import {createCookieServiceConnections,COOKIE_SERVICE_CONNECTIONS_KEY}
  from '../trusted/service-connections.js';

const origin='https://shop.example.com';
const identity={packageHash:'a'.repeat(64),installEpoch:'install-1'};
const account={alias:'acct_first',origin,displayName:'工作账号',version:1,cookieCount:2};
function fixture(){
  const records=new Map();let queue=Promise.resolve(),failReadback=false;
  const storage=async()=>({transaction:(_tables,mode,work)=>{
    const run=queue.then(async()=>{
      if(mode==='readonly'&&failReadback)throw Error('disk lost');
      const copy=structuredClone(records);
      const result=await work({get:(_table,key)=>structuredClone(copy.get(key)),
        put:(_table,value,key)=>copy.set(key,structuredClone(value)),
        delete:(_table,key)=>copy.delete(key)});
      if(mode==='readwrite'){records.clear();for(const [key,value] of copy)records.set(key,value);}
      return result;
    });queue=run.catch(()=>{});return run;
  }});
  return {records,storage,breakReadback:()=>{failReadback=true;},
    run:(operation,payload={},overrides={})=>createCookieServiceConnections({storage}).dispatch({
      operation,payload:{origin,...payload},identity,accounts:[account],...overrides})};
}
const save=(revision=0)=>({revision,label:'本机额度',mode:'local',serviceOrigin:''});

test('saved local configuration survives reopen without claiming authorization or networking',async()=>{
  const f=fixture();
  assert.equal((await f.run('serviceStatus')).revision,0);
  const result=await f.run('serviceSave',save());
  assert.equal(result.connections[0].status,'UNCONNECTED');
  assert.equal(result.connections[0].reasonCode,'E_SERVICE_BRIDGE_UNAVAILABLE');
  assert.equal(result.capabilities.openManagement,false);
  assert.equal(result.capabilities.policyAcceptance,false);
  assert.deepEqual(await f.run('serviceStatus'),result);
  assert.equal(f.records.has(COOKIE_SERVICE_CONNECTIONS_KEY),true);
  assert.doesNotMatch(JSON.stringify(result),/cookies|token|pairingCode|secret/i);
});

test('manual association is site scoped, unverified and stable across local account rename',async()=>{
  const f=fixture(),configured=await f.run('serviceSave',save());
  const connectionId=configured.connections[0].id;
  const result=await f.run('serviceAssociate',{revision:1,connectionId,alias:account.alias,
    accountVersion:1,remoteAccountId:'remote_001',organization:'组织 A',providerKey:'codex'});
  assert.equal(result.associations[0].verification,'UNVERIFIED');
  assert.equal(result.associations[0].status,'PENDING_CONNECTION');
  const changed=await f.run('serviceStatus',{}, {accounts:[{...account,displayName:'新名称',version:2}]});
  assert.equal(changed.associations[0].id,result.associations[0].id);
  assert.equal(changed.associations[0].localAlias,account.alias);
  assert.equal(changed.associations[0].status,'STALE');
  assert.deepEqual((await f.run('serviceStatus',{origin:'https://other.example.com'})).associations,[]);
  await assert.rejects(f.run('serviceAssociate',{revision:2,connectionId,alias:account.alias,
    accountVersion:1,remoteAccountId:'remote_002',organization:'组织 B',providerKey:'codex'},
    {accounts:[{...account,origin:'https://other.example.com'}]}),{code:'E_ACCOUNT_NOT_FOUND'});
  assert.equal((await f.run('serviceStatus')).revision,2);
});

test('disconnect advances local epoch, stops associations and preserves other connections/accounts',async()=>{
  const f=fixture(),first=await f.run('serviceSave',save());
  const a=first.connections[0].id;
  const second=await f.run('serviceSave',{revision:1,label:'公司 B',mode:'company',serviceOrigin:'https://company.example.com'});
  const b=second.connections[1].id;
  await f.run('serviceAssociate',{revision:2,connectionId:a,alias:account.alias,
    accountVersion:1,remoteAccountId:'resource_1',organization:'公司 A',providerKey:'codex'});
  const stopped=await f.run('serviceDisconnect',{revision:3,connectionId:a});
  assert.equal(stopped.connections.find(x=>x.id===a).epoch,2);
  assert.equal(stopped.connections.find(x=>x.id===a).status,'DISCONNECTED');
  assert.equal(stopped.connections.find(x=>x.id===b).status,'UNCONNECTED');
  assert.equal(stopped.associations[0].status,'DISCONNECTED');
  assert.equal(stopped.associations[0].remoteRevocation,'NOT_REQUIRED');
  assert.equal((await f.run('serviceStatus',{}, {identity:{...identity,installEpoch:'install-2'}}))
    .connections.find(x=>x.id===b).status,'INVALIDATED');
});

test('renaming a service preserves its ID, epoch and associated resource',async()=>{
  const f=fixture(),saved=await f.run('serviceSave',save()),id=saved.connections[0].id;
  const result=await f.run('serviceRename',{revision:1,connectionId:id,label:'本机管理'});
  assert.equal(result.connections[0].id,id);
  assert.equal(result.connections[0].epoch,1);
  assert.equal(result.connections[0].label,'本机管理');
});

test('rejects conflicts, secrets, malformed service origins and unsupported actions before writes',async()=>{
  const f=fixture();
  for(const serviceOrigin of ['http://company.example.com','https://company.example.com/path',
    'https://user:password@company.example.com','https://company.example.com/?pair=secret',
    'https://localhost','https://127.0.0.1','https://169.254.169.254']){
    await assert.rejects(f.run('serviceSave',{...save(),mode:'company',serviceOrigin}),{code:'E_SERVICE_INPUT'});
  }
  await assert.rejects(f.run('serviceSave',{...save(),pairingCode:'private'}),{code:'E_SERVICE_INPUT'});
  await f.run('serviceSave',save());
  await assert.rejects(f.run('serviceSave',save()),{code:'E_SERVICE_CONFLICT'});
  await assert.rejects(f.run('serviceOpenManagement',{}),{code:'E_SERVICE_BRIDGE_UNAVAILABLE'});
  assert.equal((await f.run('serviceStatus')).revision,1);
});

test('uncertain local write is never retried and can be inspected through status after recovery',async()=>{
  const f=fixture();f.breakReadback();
  await assert.rejects(f.run('serviceSave',save()),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.records.get(COOKIE_SERVICE_CONNECTIONS_KEY).revision,1);
});

test('persisted null is corrupt storage, never a fresh connection configuration',async()=>{
  const f=fixture();f.records.set(COOKIE_SERVICE_CONNECTIONS_KEY,null);
  await assert.rejects(f.run('serviceStatus'),{code:'E_SERVICE_STORE'});
  await assert.rejects(f.run('serviceSave',save()),{code:'E_SERVICE_STORE'});
  assert.equal(f.records.get(COOKIE_SERVICE_CONNECTIONS_KEY),null);
});
