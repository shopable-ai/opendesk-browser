import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE,sidebarToolStorageKey,MAX_INSTALLED_TOOLS} from '../../src/ui/sidebar-tools/package.js';
import {installReviewedSidebarTool,reconcileMarketOperation,MARKET_OPERATIONS_STORE,
  MARKET_PROVENANCE_STORE,sameSidebarToolPackage} from '../../src/ui/sidebar-tools/installation.js';
import {strictTransfer} from '../../src/marketplace/page.js';
import {OFFICIAL_APPS,OFFICIAL_COLLECTIONS,getOfficialCollection,officialPackagePath} from '../../src/marketplace/catalog.js';

const tool=(id='reading-toc',version='1.0.2')=>({format:SIDEBAR_TOOL_FORMAT,id,version,title:'Example '+id,
  description:'A tool for exercising official market v1 installs',capabilities:[],html:'<main>Ready</main>',
  css:'',js:'globalThis.OpenDeskTool && 1;'});
function browser(){
  const values={},operations=[];
  const local={
    async get(keys){
      if(keys===null)return structuredClone(values);
      const wanted=typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys||{});
      return Object.fromEntries(wanted.map(k=>[k,structuredClone(values[k])]));
    },
    async set(rows){
      operations.push({method:'set',keys:Object.keys(rows)});
      Object.assign(values,structuredClone(rows));
    },
    async remove(keys){
      operations.push({method:'remove',keys});
      for(const k of Array.isArray(keys)?keys:[keys])delete values[k];
    }
  };
  const locks={request:async (_name,fn)=>fn()};
  return {api:{storage:{local}},locks,values,operations};
}
const identity=(id='reading-toc')=>({marketId:'opendesk/'+id,sha256:'a'.repeat(64),operationId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'});
test('market catalog uses pinned immutable member identity and all five tool versions',()=>{
  assert.equal(OFFICIAL_APPS.length,5);
  const unique=new Set(OFFICIAL_APPS.map(a=>a.id));
  assert.equal(unique.size,5);
  const kit=getOfficialCollection('reading-kit',1);
  assert.equal(kit,OFFICIAL_COLLECTIONS[0]);
  for(const member of kit.members){
    const app=OFFICIAL_APPS.find(a=>a.id===member.id);
    assert.ok(app);assert.equal(app.version,member.version);
  }
  assert.equal(getOfficialCollection('reading-kit',2),null);
});
test('every official release is the exact packaged tool ID, version and title',async()=>{
  for(const app of OFFICIAL_APPS){
    const bytes=await readFile('src/'+officialPackagePath(app));
    const pkg=JSON.parse(bytes.toString('utf8'));
    assert.equal(pkg.id,app.toolId);assert.equal(pkg.version,app.version);
    assert.equal(pkg.title,app.title);
    assert.ok(Array.isArray(pkg.capabilities));
  }
});
test('manual tool replacement clears stale official publisher identity',async()=>{
  const {api,locks,values}=browser(),candidate=tool();
  await installReviewedSidebarTool({api,lockManager:locks,candidate,baseline:null,reviewApproved:true,market:identity()});
  const edited=tool('reading-toc','1.0.3');
  const changed=await installReviewedSidebarTool({api,lockManager:locks,candidate:edited,baseline:candidate,reviewApproved:true});
  assert.equal(changed.state,'installed');
  assert.equal(values[MARKET_PROVENANCE_STORE]['reading-toc'],undefined);
  await assert.rejects(installReviewedSidebarTool({api,lockManager:locks,candidate:tool('reading-toc','1.0.4'),
    baseline:edited,reviewApproved:true,
    market:{...identity(),operationId:'dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee'}}),
    e=>e.code==='E_PUBLISHER_CONFLICT');
});
test('never installs without explicit review or runs tool code',async()=>{
  const {api,locks,values,operations}=browser();
  const candidate=tool();
  await assert.rejects(installReviewedSidebarTool({api,lockManager:locks,candidate,baseline:null}),
    e=>e.code==='E_REVIEW_REQUIRED');
  assert.equal(Object.keys(values).length,0);
  const result=await installReviewedSidebarTool({api,lockManager:locks,candidate,baseline:null,
    reviewApproved:true,market:identity()});
  assert.equal(result.state,'installed');
  assert.equal(values[SIDEBAR_TOOL_STORE].length,1);
  assert.equal(values[MARKET_OPERATIONS_STORE][identity().operationId].state,'succeeded');
  assert.equal(values[MARKET_PROVENANCE_STORE]['reading-toc'].marketId,'opendesk/reading-toc');
  assert.ok(operations.some(op=>op.method==='remove'&&op.keys===sidebarToolStorageKey('reading-toc')));
});
test('same release is idempotent; stale baseline and author conflicts fail closed',async()=>{
  const {api,locks,values}=browser(),candidate=tool();
  await installReviewedSidebarTool({api,lockManager:locks,candidate,baseline:null,reviewApproved:true,market:identity()});
  const copy=structuredClone(candidate);
  assert.equal((await installReviewedSidebarTool({api,lockManager:locks,candidate,baseline:copy,reviewApproved:true,
    market:{...identity(),operationId:'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee'}})).state,'already-installed');
  assert.equal(values[SIDEBAR_TOOL_STORE].length,1);
  await assert.rejects(installReviewedSidebarTool({api,lockManager:locks,candidate:tool('reading-toc','1.0.3'),
    baseline:null,reviewApproved:true}),e=>e.code==='E_TOOL_CHANGED');
  values[MARKET_PROVENANCE_STORE]={};
  await assert.rejects(installReviewedSidebarTool({api,lockManager:locks,candidate:tool('reading-toc','1.0.3'),
    baseline:candidate,reviewApproved:true,market:{...identity(),operationId:'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee'}}),
    e=>e.code==='E_PUBLISHER_CONFLICT');
});
test('12-tool capacity rejects excess without deleting existing installations',async()=>{
  const {api,locks,values}=browser();
  values[SIDEBAR_TOOL_STORE]=Array.from({length:MAX_INSTALLED_TOOLS},(_,i)=>tool('note'+i));
  await assert.rejects(installReviewedSidebarTool({api,lockManager:locks,candidate:tool('extra'),baseline:null,
    reviewApproved:true}),e=>e.code==='E_TOOL_CAPACITY');
  assert.equal(values[SIDEBAR_TOOL_STORE].length,MAX_INSTALLED_TOOLS);
});
test('lost successful write acknowledgement becomes unknown; reconciliation never retries',async()=>{
  const {api,locks,values}=browser(),candidate=tool();
  const original=api.storage.local.set;
  let interrupted=false;
  api.storage.local.set=async rows=>{
    await original(rows);
    if(!interrupted&&Object.hasOwn(rows,SIDEBAR_TOOL_STORE)){
      interrupted=true;throw new Error('simulated ack lost after persistent write');
    }
  };
  await assert.rejects(installReviewedSidebarTool({api,lockManager:locks,candidate,baseline:null,reviewApproved:true,
    market:identity()}),e=>e.code==='E_OUTCOME_UNKNOWN');
  assert.equal(values[MARKET_OPERATIONS_STORE][identity().operationId].state,'outcome-unknown');
  assert.ok(sameSidebarToolPackage(values[SIDEBAR_TOOL_STORE][0],candidate));
  const recovered=await reconcileMarketOperation(api,identity().operationId,candidate);
  assert.equal(recovered.state,'succeeded');
  assert.equal(values[SIDEBAR_TOOL_STORE].length,1);
  assert.equal(values[MARKET_OPERATIONS_STORE][identity().operationId].state,'outcome-unknown');
});
test('data-only transfer rejects script, site grants, tokens, duplicates and unknown versions',()=>{
  const safe={format:'opendesk.market.transfer.v1',apps:[{marketId:'opendesk/reading-toc',version:'1.0.2'}]};
  assert.deepEqual(strictTransfer(safe),safe);
  for(const altered of [
    {...safe,cookie:'secret'}, {...safe,apps:[{...safe.apps[0],siteGrants:['https://example.com']}]},
    {...safe,apps:[{...safe.apps[0],js:'alert(1)'}]},
    {...safe,apps:[safe.apps[0],safe.apps[0]]},
    {...safe,apps:[{marketId:'opendesk/reading-toc',version:'0.0.0'}]},
    {...safe,apps:[{marketId:'external/arbitrary',version:'1.0.0'}]}
  ])assert.throws(()=>strictTransfer(altered),e=>e.code==='E_TRANSFER');
});
