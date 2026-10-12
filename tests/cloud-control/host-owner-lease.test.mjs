import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCloudHostOwnerLease,CLOUD_HOST_OWNER_KEY} from '../../src/cloud-control/host-owner-lease.js';

const host=(registrationId,hostDocumentId)=>({
  namespace:'tool:trusted-extension',registrationId,hostDocumentId
});
const sender=(h,kind)=>({
  trusted:true,kind,registrationId:h.registrationId,documentId:h.hostDocumentId
});
function fixture(){
  let persistent=new Map(),tail=Promise.resolve(),time=100_000;
  const storage={
    transaction(names,mode,callback){
      const next=tail.then(async()=>{
        const copy=new Map([...persistent.entries()].map(([key,value])=>[key,structuredClone(value)]));
        const tx={
          get:async(store,key)=>{assert(names.includes(store));return structuredClone(copy.get(store+':'+key));},
          put:async(store,value,key)=>{assert(names.includes(store));copy.set(store+':'+key,structuredClone(value));}
        };
        const value=await callback(tx);
        if(mode==='readwrite')persistent=copy;
        return value;
      });
      tail=next.catch(()=>{});return next;
    },
    snapshot:()=>structuredClone(persistent.get('frameworkKV:'+CLOUD_HOST_OWNER_KEY)),
  };
  const currentHost=async(_tx,h,s)=>{
    assert.equal(h.registrationId,s.registrationId);
    assert.equal(h.hostDocumentId,s.documentId);
  };
  const assertOwner=async(kind,s)=>{
    assert(s?.trusted===true,'untrusted sender');
    assert.equal(kind,s.kind);
  };
  const lease=createCloudHostOwnerLease({storage,currentHost,assertOwner,clock:{now:()=>time}});
  const A=host('reg-a','doc-a'),B=host('reg-b','doc-b');
  const input=(h,kind)=>({ownerKind:kind,host:h,sender:sender(h,kind)});
  const dispatch=(data,token)=>storage.transaction(['frameworkKV','commandJournal'],'readonly',
    tx=>lease.assertDispatch(tx,{...data,token}));
  return {storage,lease,A,B,input,dispatch,setTime:value=>{time=value;}};
}

test('Cloud Host Owner Lease serializes two competing real-Host claimants in original KV transaction',async()=>{
  const f=fixture();
  const a=f.input(f.A,'side-panel'),b=f.input(f.B,'visible-runner');
  const result=await Promise.allSettled([f.lease.claim(a),f.lease.claim(b)]);
  assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(result.filter(x=>x.status==='rejected').length,1);
  assert.equal(result[1].reason.code,'E_OWNER');
  const saved=f.storage.snapshot();
  assert.equal(saved.ownerKind,'side-panel');
  assert.equal(saved.registrationId,f.A.registrationId);
  assert.equal(saved.generation,1);assert.equal(saved.fencingEpoch,1);
  assert.equal(await f.dispatch(a,result[0].value.token),true);
  await assert.rejects(f.dispatch(b,{...result[0].value.token,registrationId:f.B.registrationId}),{code:'E_OWNER'});
});

test('same visible Host renews without changing generation; expired old epoch cannot act',async()=>{
  const f=fixture(),a=f.input(f.A,'side-panel'),b=f.input(f.B,'visible-runner');
  const original=await f.lease.claim(a);
  f.setTime(110_000);
  const renewal=await f.lease.renew({...a,token:original.token});
  assert.deepEqual(renewal.token,original.token);
  assert.equal(renewal.leaseUntil,140_000);
  const same=await f.lease.claim(a);
  assert.deepEqual(same.token,original.token);
  f.setTime(141_000);
  await assert.rejects(f.dispatch(a,original.token),{code:'E_OWNER'});
  await assert.rejects(f.lease.renew({...a,token:original.token}),{code:'E_OWNER'});
  const newOwner=await f.lease.claim(b);
  assert.equal(newOwner.token.generation,2);
  assert.equal(newOwner.token.fencingEpoch,2);
  assert.equal(await f.dispatch(b,newOwner.token),true);
  await assert.rejects(f.dispatch(a,original.token),{code:'E_OWNER'});
  await assert.rejects(f.lease.release({...a,token:original.token}),{code:'E_OWNER'});
});

test('release tombstones owner epoch, and stale copy cannot reclaim or release successor',async()=>{
  const f=fixture(),a=f.input(f.A,'side-panel'),b=f.input(f.B,'visible-runner');
  const previous=await f.lease.claim(a);
  const released=await f.lease.release({...a,token:previous.token});
  assert.equal(released.released,true);assert.equal(released.fencingEpoch,2);
  assert.equal(f.storage.snapshot().leaseUntil,100_000);
  await assert.rejects(f.dispatch(a,previous.token),{code:'E_OWNER'});
  await assert.rejects(f.lease.release({...a,token:previous.token}),{code:'E_OWNER'});
  const successor=await f.lease.claim(b);
  assert.equal(successor.token.generation,2);assert.equal(successor.token.fencingEpoch,3);
  await assert.rejects(f.lease.claim(a),{code:'E_OWNER'});
  await assert.rejects(f.lease.release({...a,token:previous.token}),{code:'E_OWNER'});
  assert.equal(await f.dispatch(b,successor.token),true);
});

test('failed IDB claim rolls back generation, expiry and fencing epoch atomically',async()=>{
  const f=fixture(),a=f.input(f.A,'side-panel'),b=f.input(f.B,'visible-runner');
  const first=await f.lease.claim(a);
  await f.lease.release({...a,token:first.token});
  const stable=f.storage.snapshot(),transaction=f.storage.transaction.bind(f.storage);
  let fail=true;
  f.storage.transaction=(names,mode,fn)=>transaction(names,mode,async tx=>{
    const result=await fn(tx);
    if(fail&&mode==='readwrite'){
      fail=false;throw Object.assign(new Error('Quota exceeded'),{name:'QuotaExceededError'});
    }
    return result;
  });
  await assert.rejects(f.lease.claim(b),{name:'QuotaExceededError'});
  assert.deepEqual(f.storage.snapshot(),stable);
  const restored=await f.lease.claim(b);
  assert.equal(restored.token.generation,stable.generation+1);
  assert.equal(restored.token.fencingEpoch,stable.fencingEpoch+1);
});

test('lease module is dormant: no new privileged RPC, hidden runner or duplicate RunHost',async()=>{
  const [broker,service,source]=await Promise.all([
    readFile('src/platform/host/broker.js','utf8'),
    readFile('src/cloud-control/service.js','utf8'),
    readFile('src/cloud-control/host-owner-lease.js','utf8')
  ]);
  assert.doesNotMatch(broker,/ownerLeaseClaim|cloudAcquireOwner|registerCloudRunner/);
  assert.doesNotMatch(service,/createCloudHostOwnerLease|cloudAcquireOwner/);
  assert.doesNotMatch(source,/chrome\.offscreen|createHostClient|createRunHost|host\.start\(/);
  const f=fixture();
  await assert.rejects(f.lease.claim({...f.input(f.A,'side-panel'),sender:{trusted:false,kind:'side-panel',documentId:'doc-a'}}));
  assert.equal(f.storage.snapshot(),undefined);
  await assert.rejects(f.lease.claim({...f.input(f.A,'arbitrary-tab'),ownerKind:'arbitrary-tab'}),{code:'E_OWNER'});
});
