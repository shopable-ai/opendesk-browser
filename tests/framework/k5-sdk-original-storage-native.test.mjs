import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {discoverNativeBrokerPending} from './k5-sdk-original-storage-native.mjs';
import {discoverNativeFrameworkKvWrite} from './k5-sdk-original-storage.mjs';

test('both actual packages expose the broker Map and actual native IDB put',async()=>{
  for(const mode of ['production','development']){
    const source=await readFile(`dist/${mode}/sw.js`,'utf8');
    const broker=discoverNativeBrokerPending(source),put=discoverNativeFrameworkKvWrite(source).nativePut;
    assert.equal(source.slice(put.range[0],put.range[1]),put.text);
    assert.match(broker.text,/\.set\(\w+\.opKey,/);
    assert(broker.location.columnNumber>put.location.columnNumber);
    assert.equal(put.kind,'native-idb-put');
  }
});

test('ambiguous pending Maps cannot qualify an observation',()=>{
  const source='const a=new Map,b=new Map;async function f(n){await x.admitSdk(n);a.set(c.opKey,t);a.get(c.opKey);a.delete(c.opKey);b.set(c.opKey,t);}';
  assert.throws(()=>discoverNativeBrokerPending(source),/Unique real SDK broker/);
});
