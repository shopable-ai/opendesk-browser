import test from 'node:test';
import assert from 'node:assert/strict';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE,sidebarToolStorageKey}
  from '../../src/ui/sidebar-tools/package.js';
import {admittedSidebarToolPackages,getInstalledSidebarTools,installReviewedSidebarTool}
  from '../../src/ui/sidebar-tools/installation.js';

const tool=(index,version='1.0.0')=>({format:SIDEBAR_TOOL_FORMAT,
  id:'count-fixture-'+index,version,title:'Count fixture '+index,
  description:'Installation count regression',capabilities:[],
  html:'<main>Ready</main>',css:'',js:'void 0;'});
function fixture(count){
  const values={[SIDEBAR_TOOL_STORE]:Array.from({length:count},(_,i)=>tool(i))};
  let writes=0;
  const api={storage:{local:{
    async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys])
      .map(key=>[key,structuredClone(values[key])]));},
    async set(rows){writes++;Object.assign(values,structuredClone(rows));},
    async remove(keys){writes++;for(const key of Array.isArray(keys)?keys:[keys])delete values[key];}
  }}};
  return {api,values,lockManager:{request:async(_name,work)=>work()},writes:()=>writes};
}
test('installed registry reads every valid tool beyond the former count limit',async()=>{
  const f=fixture(32),before=structuredClone(f.values[SIDEBAR_TOOL_STORE]);
  assert.deepEqual(admittedSidebarToolPackages(before),before);
  assert.deepEqual(await getInstalledSidebarTools(f.api),before);
  assert.equal(f.writes(),0);
});
test('reviewed imports continue past thirteen and preserve existing tools and data',async()=>{
  const f=fixture(13),before=structuredClone(f.values[SIDEBAR_TOOL_STORE]);
  const key=sidebarToolStorageKey(before[0].id);
  f.values[key]={note:'保留既有数据'};
  for(let i=13;i<32;i++){
    const result=await installReviewedSidebarTool({...f,candidate:tool(i),reviewApproved:true});
    assert.equal(result.state,'installed');
  }
  const installed=await getInstalledSidebarTools(f.api);
  assert.equal(installed.length,32);
  assert.deepEqual(installed.slice(0,13),before);
  assert.deepEqual(f.values[key],{note:'保留既有数据'});
});
test('replacing a package after the former cutoff preserves peers and its data',async()=>{
  const f=fixture(32),before=structuredClone(f.values[SIDEBAR_TOOL_STORE]);
  const baseline=before.at(-1),key=sidebarToolStorageKey(baseline.id);
  f.values[key]={note:'升级仍保留'};
  const result=await installReviewedSidebarTool({...f,baseline,
    candidate:tool(31,'1.0.1'),reviewApproved:true});
  assert.equal(result.state,'installed');
  const installed=await getInstalledSidebarTools(f.api);
  assert.equal(installed.length,32);
  assert.deepEqual(installed.slice(0,-1),before.slice(0,-1));
  assert.equal(installed.at(-1).version,'1.0.1');
  assert.deepEqual(f.values[key],{note:'升级仍保留'});
});
for(const kind of ['duplicate','malformed'])test(kind+' registry tail still blocks destructive writes',async()=>{
  const f=fixture(32);
  f.values[SIDEBAR_TOOL_STORE].push(kind==='duplicate'?tool(31):{id:'broken-tail'});
  const before=structuredClone(f.values);
  await assert.rejects(getInstalledSidebarTools(f.api),{code:'E_STORAGE_CORRUPT'});
  await assert.rejects(installReviewedSidebarTool({...f,candidate:tool(33),reviewApproved:true}),
    {code:'E_STORAGE_CORRUPT'});
  assert.equal(f.writes(),0);
  assert.deepEqual(f.values,before);
});
