import test from 'node:test';
import assert from 'node:assert/strict';
import {sdkMethods} from '../../src/platform/host/sdk-methods.js';

function fixture() {
  let rows=new Map();
  const reads=[],writes=[];
  let scanFailureAt=Infinity;
  const storage={async transaction(names,mode,work){
    assert.deepEqual(names,['commandJournal']);assert.equal(mode,'readwrite');
    const copy=structuredClone(rows),changes=[];
    const value=await work({
      all:async()=>{throw Error('Navigation must not materialize unrelated Controller history');},
      scanEntries:async(store,{prefix,afterKey,limit})=>{
        assert.equal(store,'commandJournal');assert.equal(prefix,'sdk-grant:');
        reads.push({prefix,afterKey,limit});
        if(reads.length===scanFailureAt)throw Error('native scan failed');
        return [...copy].filter(([key])=>key.startsWith(prefix)&&(!afterKey||key>afterKey))
          .sort(([a],[b])=>a<b?-1:a>b?1:0).slice(0,limit).map(([key,value])=>({key,value:structuredClone(value)}));
      },
      put:async(store,value,key)=>{assert.equal(store,'commandJournal');copy.set(key,structuredClone(value));changes.push(key);}
    });
    rows=copy;writes.push(...changes);return value;
  }};
  const authority=sdkMethods({storage,api:{},session:'session',clock:{now:()=>1000}});
  const add=(n,{tabId=2,frameId=0,frameEpoch=0,incarnation='grant-'+n}={})=>{
    const documentId='document-'+String(n).padStart(4,'0'),key='sdk-grant:'+JSON.stringify([tabId,frameId,documentId]);
    const row={tag:'sdk-grant',key,active:true,tabId,frameId,documentId,origin:'https://fixture.example',
      grantIncarnation:incarnation,tabEpoch:0,frameEpoch,permissionEpoch:0,notificationEpoch:0,capabilities:['network']};
    rows.set(key,row);return key;
  };
  return {authority,reads,writes,add,get:key=>structuredClone(rows.get(key)),
    put:(key,value)=>rows.set(key,value),failScan:(at=1)=>{scanFailureAt=at;}};
}

test('navigation revokes every matching grant across cursor pages without reading Controller history',async()=>{
  const f=fixture(),old=Array.from({length:520},(_,n)=>f.add(n)),other=f.add(900,{tabId:3});
  const unrelated={tag:'controller-operation',source:'x'.repeat(100000)};
  f.put('controller-operation:retained',unrelated);
  await f.authority.revokeSdkGrants({tabId:2,frameId:0,reason:'navigation'});
  for(const key of old){assert.equal(f.get(key).active,false);assert.equal(f.get(key).closeReason,'navigation');}
  assert.equal(f.get(other).active,true);assert.deepEqual(f.get('controller-operation:retained'),unrelated);
  assert.equal(f.writes.length,520);assert.equal(f.reads.length,3);
  assert.equal(f.reads[0].afterKey,undefined);
  assert.ok(f.reads[1].afterKey&&f.reads[2].afterKey>f.reads[1].afterKey);
});

test('a grant created after the observed navigation fence survives the delayed persistence scan',async()=>{
  const f=fixture(),old=f.add(1),fresh=f.add(2,{frameEpoch:1});
  await f.authority.revokeSdkGrants({tabId:2,frameId:0,reason:'navigation'});
  assert.equal(f.get(old).active,false);assert.equal(f.get(fresh).active,true);
  assert.deepEqual(f.writes,[old]);
});

test('exact installation rollback closes only its original grant incarnation',async()=>{
  const f=fixture(),old=f.add(1),other=f.add(2);
  await f.authority.revokeSdkGrants({tabId:2,frameId:0,documentId:f.get(old).documentId,
    grantIncarnation:f.get(old).grantIncarnation,reason:'user-revoked'});
  assert.equal(f.get(old).active,false);assert.equal(f.get(other).active,true);
  assert.deepEqual(f.writes,[old]);
});

test('scan failure rejects revocation persistence without writing a false completion',async()=>{
  const f=fixture(),old=Array.from({length:300},(_,n)=>f.add(n));f.failScan(2);
  await assert.rejects(f.authority.revokeSdkGrants({tabId:2,frameId:0,reason:'navigation'}),/native scan failed/);
  for(const key of old)assert.equal(f.get(key).active,true);
  assert.deepEqual(f.writes,[]);
});
