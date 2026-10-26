import test from 'node:test';
import assert from 'node:assert/strict';
import {initMarketPageBridge} from '../../src/marketplace/page-bridge.js';

for(const [label,key] of [['window','window'],['document','document'],['runtime','api'],['timers','setTimeout']])
  test('retired page bridge never accesses '+label,()=>{
    let accessed=false;
    const options={};Object.defineProperty(options,key,{get(){accessed=true;throw Error('retired bridge accessed '+label);}});
    const bridge=initMarketPageBridge(options);
    assert.equal(typeof bridge.dispose,'function');bridge.dispose();bridge.dispose();assert.equal(accessed,false);
  });
test('retired page bridge performs no DOM listener message or timer operations',()=>{
  const calls=[],forbidden=new Proxy({}, {get(_target,key){calls.push(String(key));throw Error('unexpected access');}});
  initMarketPageBridge({window:forbidden,document:forbidden,api:forbidden,setTimeout:forbidden,setInterval:forbidden}).dispose();
  assert.deepEqual(calls,[]);
});
test('retired page bridge works without a browser or DOM global',()=>{
  assert.doesNotThrow(()=>initMarketPageBridge().dispose());
});
