import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {discoverMarketCutPoints,marketCallLocation} from '../helpers/app-market-r5-cutpoints.mjs';

test('market observation binds current non-nested source calls and declines changed call shapes',async()=>{
  const host=await readFile('src/marketplace/external.js','utf8');
  const installer=await readFile('src/ui/sidebar-tools/installation.js','utf8');
  const storage=await readFile('src/ui/sidebar-tools/storage-state.js','utf8');
  for(const [source,required] of [[host,['A1','A2']],[installer,['B']],[storage,['C']]]){
    const points=discoverMarketCutPoints(source,{required,registryStoreKey:'opendesk.sidebar-tools.installed.v1'});
    for(const point of Object.values(points)){
      assert.equal(point.nestedInvocations,0);assert.equal(point.breakpointType,'call');
      assert.equal(source.slice(...point.range),point.text);
    }
  }
  for(const source of [host.replace('api.tabs.query({})','api.tabs.query({filter:other()})'),
    host.replace('Missing created tab identity','different identity marker')]){
    assert.throws(()=>discoverMarketCutPoints(source,{required:['A1']}),{code:'E_NATIVE_NOT_OBSERVED'});
  }
});

test('browser call position must be unique inside the exact invocation, never a neighbouring statement',()=>{
  const point={location:{lineNumber:0,columnNumber:20},endLocation:{lineNumber:0,columnNumber:40},nestedInvocations:0,breakpointType:'call'};
  const actual={scriptId:'loaded-script',lineNumber:0,columnNumber:27,type:'call'};
  const statement={scriptId:'loaded-script',lineNumber:0,columnNumber:22};
  assert.deepEqual(marketCallLocation(point,[statement,actual],'loaded-script'),{scriptId:'loaded-script',lineNumber:0,columnNumber:27});
  for(const locations of [[],[statement],[{...actual,scriptId:'other-script'}],
    [{...actual,columnNumber:19}],[{...actual,columnNumber:40}],[{...actual,type:'return'}],
    [actual,{...actual,columnNumber:35}],[actual,{...statement,columnNumber:45}],[actual,{...statement,columnNumber:NaN}]]){
    assert.throws(()=>marketCallLocation(point,locations,'loaded-script'),{code:'E_NATIVE_NOT_OBSERVED'});
  }
  assert.throws(()=>marketCallLocation({...point,nestedInvocations:1},[actual],'loaded-script'),{code:'E_NATIVE_NOT_OBSERVED'});
});
