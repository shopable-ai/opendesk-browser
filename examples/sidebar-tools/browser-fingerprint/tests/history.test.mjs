import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeReading,snapshotFromReading,HISTORY_KEY} from '../src/model.js';
import {readHistory,saveSnapshot,deleteSnapshot} from '../src/history.js';
const tag=value=>createHash('sha256').update(JSON.stringify(value,
  (_,o)=>o&&typeof o==='object'&&!Array.isArray(o)?
    Object.fromEntries(Object.keys(o).sort().map(k=>[k,o[k]])):o)).digest('hex');
function host(){
  let value=null,loseAck=false,loseRead=false;
  return {
    setLoseAck:()=>{loseAck=true;},setLoseRead:()=>{loseRead=true;},
    inspect:()=>value,
    request:async(op,p)=>{
      assert.equal(p.key,HISTORY_KEY);
      if(op==='storage.get'){
        if(loseRead)throw Error('storage unavailable');
        return {value:structuredClone(value),etag:tag(value)};
      }
      if(op==='storage.set'){
        if(p.ifMatch!==tag(value))throw Object.assign(Error('conflict'),{code:'E_STORAGE_CONFLICT'});
        value=structuredClone(p.value);
        if(loseAck)throw Error('response lost');
        return {saved:true};
      }
      throw Error('unexpected operation');
    }
  };
}
const item=id=>snapshotFromReading(makeReading({status:'available',
  url:'https://qa.example.test/',title:'QA',tabRef:'t',documentRef:'d'},
  {id,at:'2026-10-27T14:00:00Z'}));
test('ETag/confirmed readback, listing and deletion',async()=>{
  const h=host();
  assert.equal((await readHistory(h.request)).history.items.length,0);
  await saveSnapshot(h.request,item('one'));
  await saveSnapshot(h.request,item('two'));
  assert.deepEqual((await readHistory(h.request)).history.items.map(x=>x.id),['two','one']);
  await deleteSnapshot(h.request,'one');
  assert.deepEqual((await readHistory(h.request)).history.items.map(x=>x.id),['two']);
});
test('response-loss is not a false success or automatic replay',async()=>{
  const h=host();h.setLoseAck();
  await assert.rejects(()=>saveSnapshot(h.request,item('one')),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(h.inspect().items.length,1);
});
test('unconfirmed readback is unknown',async()=>{
  const h=host(),request=h.request;
  const wrapped=async(op,p)=>{
    const r=await request(op,p);
    if(op==='storage.set')h.setLoseRead();
    return r;
  };
  await assert.rejects(()=>saveSnapshot(wrapped,item('one')),{code:'E_OUTCOME_UNKNOWN'});
});
test('bounded history rejects new writes without silent deletion',async()=>{
  const h=host();
  for(let i=0;i<5;i++)await saveSnapshot(h.request,item('s'+i));
  await assert.rejects(()=>saveSnapshot(h.request,item('six')),{code:'E_HISTORY_LIMIT'});
  assert.equal(h.inspect().items.length,5);
});

test('stale ETag conflicts without overwriting a newer history',async()=>{
  const h=host(),staleEtag=(await readHistory(h.request)).etag;
  await saveSnapshot(h.request,item('first'));
  const staleRequest=async(op,p)=>op==='storage.get'
    ?{...(await h.request(op,p)),etag:staleEtag}:h.request(op,p);
  await assert.rejects(()=>saveSnapshot(staleRequest,item('second')),
    {code:'E_STORAGE_CONFLICT'});
  assert.deepEqual(h.inspect().items.map(x=>x.id),['first']);
});
test('single 8 KiB item cap is checked without dropping snapshots',async()=>{
  const h=host();
  const large=id=>snapshotFromReading(makeReading({status:'available',
    url:'https://qa.example.test/',title:'A'.repeat(160),tabRef:'t',documentRef:'d'},
    {id:'z'.repeat(87)+id,at:'2026-10-27T14:00:00Z'}));
  for(let i=0;i<4;i++)await saveSnapshot(h.request,large(String(i)));
  await assert.rejects(()=>saveSnapshot(h.request,large('4')),{code:'E_HISTORY_LIMIT'});
  assert.equal(h.inspect().items.length,4);
});
test('read history returns immutable snapshots and does not import forged fields',async()=>{
  const h=host();await saveSnapshot(h.request,item('valid'));
  const r=await readHistory(h.request);
  assert.ok(Object.isFrozen(r.history.items[0]));
  assert.ok(Object.isFrozen(r.history.items[0].fields[0]));
  const invalid=structuredClone(h.inspect());
  invalid.items[0].fields[3].value='browser spoof';
  const seed=host();const {etag}=await readHistory(seed.request);
  await seed.request('storage.set',{key:HISTORY_KEY,value:invalid,ifMatch:etag});
  await assert.rejects(()=>readHistory(seed.request),{code:'E_HISTORY_SCHEMA'});
});
