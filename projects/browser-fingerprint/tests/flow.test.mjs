// Simulated Host flow: no claim that a real Chrome document was inspected.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeReading,sameRuntimeTarget,snapshotFromReading,compareSnapshots,reportJson} from '../src/model.js';
import {saveSnapshot,readHistory} from '../src/history.js';
const etag=value=>createHash('sha256').update(JSON.stringify(value,
  (_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?
    Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)).digest('hex');
const createHost=()=>{
  let stored=null;
  return async(method,args)=>{
    if(method==='storage.get')return {etag:etag(stored),value:structuredClone(stored)};
    if(method==='storage.set'){
      if(args.ifMatch!==etag(stored))throw Object.assign(Error('conflict'),{code:'E_STORAGE_CONFLICT'});
      stored=structuredClone(args.value);
      return {saved:true};
    }
    throw Error('unsupported operation');
  };
};
test('simulated A → B capture, save, compare, restart-read, JSON report',async()=>{
  const request=createHost(),now='2026-10-28T00:00:00.000Z';
  const ctxA={status:'available',url:'https://shop.example.test/cart?session=SENSITIVE',
    title:'购物车',tabRef:'tab1',documentRef:'doc1'};
  const ctxB={...ctxA,title:'结账',url:'https://shop.example.test/checkout?key=HIDDEN',
    documentRef:'doc2'};
  const a=makeReading(ctxA,{id:'a',at:now});
  assert.equal(sameRuntimeTarget(a,ctxA),true);
  assert.equal(sameRuntimeTarget(a,ctxB),false);
  await saveSnapshot(request,snapshotFromReading(a));
  const b=makeReading(ctxB,{id:'b',at:'2026-10-28T00:01:00.000Z'});
  assert.equal(sameRuntimeTarget(b,ctxB),true);
  await saveSnapshot(request,snapshotFromReading(b));
  // New client/session, same durable Host adapter.
  const restarted=await readHistory(request);
  assert.deepEqual(restarted.history.items.map(s=>s.id),['b','a']);
  const [bb,aa]=restarted.history.items;
  const diff=compareSnapshots(aa,bb);
  assert.equal(diff.find(x=>x.key==='title').state,'changed');
  assert.equal(diff.find(x=>x.key==='host').state,'same');
  assert.equal(diff.find(x=>x.key==='userAgent').state,'unverifiable');
  const exported=reportJson(aa,bb,'2026-10-28T00:02:00.000Z');
  assert.equal(JSON.parse(exported).snapshots.length,2);
  assert.ok(!exported.includes('SENSITIVE')&&!exported.includes('HIDDEN'));
});
