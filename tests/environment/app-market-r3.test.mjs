import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE,sidebarToolStorageKey,MAX_INSTALLED_TOOLS,serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {installReviewedSidebarTool,reconcileMarketOperation,recoverMarketOperation,
  recordToolUninstall,cleanupUninstalledToolLocked,retryUninstalledToolCleanup,TOOL_CLEANUP_STORE,MARKET_OPERATIONS_STORE,

  MARKET_PROVENANCE_STORE,sameSidebarToolPackage} from '../../src/ui/sidebar-tools/installation.js';
import {strictTransfer} from '../../src/marketplace/page.js';
import {OFFICIAL_COLLECTIONS,getOfficialCollection,officialMarketApps} from '../../src/marketplace/catalog.js';
import {officialFixtures} from '../helpers/official-tools.mjs';
const official=await officialFixtures();
const OFFICIAL_APPS=officialMarketApps(official.catalog);

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
const identity=(id='reading-toc')=>({marketId:'opendesk/'+id,
  sha256:createHash('sha256').update(serializeSidebarToolPackage(tool(id))).digest('hex'),
  operationId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'});
test('market catalog uses pinned immutable member identity and all five tool versions',()=>{
  assert.equal(OFFICIAL_APPS.length,5);
  const unique=new Set(OFFICIAL_APPS.map(a=>a.id));
  assert.equal(unique.size,5);
  const kit=getOfficialCollection('reading-kit',1);
  assert.equal(kit,OFFICIAL_COLLECTIONS[0]);
  assert.deepEqual(kit.members,[{id:'opendesk/reading-toc',version:'1.0.2'},
    {id:'opendesk/web-markdown-clipper',version:'1.0.0'},{id:'opendesk/quick-notes',version:'1.1.1'}],
    'published collection revisions do not silently track newer tool.config versions');
  assert.equal(getOfficialCollection('reading-kit',2),null);
});
test('every official release is the exact packaged tool ID, version and title',async()=>{
  for(const app of OFFICIAL_APPS){
    const bytes=official.resources.get(app.packagePath);
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
  const {api,locks,values,operations}=browser(),candidate=tool();
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
  assert.equal(recovered.state,'needs-finalization');
  assert.equal(values[SIDEBAR_TOOL_STORE].length,1);
  assert.equal(values[MARKET_OPERATIONS_STORE][identity().operationId].state,'outcome-unknown');
  assert.equal(values[MARKET_PROVENANCE_STORE]?.[candidate.id],undefined);
  const registryWrites=operations.filter(row=>row.method==='set'&&row.keys.includes(SIDEBAR_TOOL_STORE)).length;
  const finalized=await recoverMarketOperation({api,lockManager:locks,operationId:identity().operationId});
  assert.equal(finalized.state,'succeeded');
  assert.equal(values[MARKET_OPERATIONS_STORE][identity().operationId].state,'succeeded');
  assert.equal(values[MARKET_PROVENANCE_STORE][candidate.id].sha256,identity().sha256);
  assert.equal(operations.filter(row=>row.method==='set'&&row.keys.includes(SIDEBAR_TOOL_STORE)).length,registryWrites);
  assert.deepEqual(values[SIDEBAR_TOOL_STORE],[candidate]);

});
test('data-only transfer rejects script, site grants, tokens, duplicates and unknown versions',()=>{
  const safe={format:'opendesk.market.transfer.v1',apps:[{marketId:'opendesk/reading-toc',version:'1.0.2'}]};
  assert.deepEqual(strictTransfer(safe,OFFICIAL_APPS),safe);
  for(const altered of [
    {...safe,cookie:'secret'}, {...safe,apps:[{...safe.apps[0],siteGrants:['https://example.com']}]},
    {...safe,apps:[{...safe.apps[0],js:'alert(1)'}]},
    {...safe,apps:[safe.apps[0],safe.apps[0]]},
    {...safe,apps:[{marketId:'opendesk/reading-toc',version:'0.0.0'}]},
    {...safe,apps:[{marketId:'external/arbitrary',version:'1.0.0'}]}
  ])assert.throws(()=>strictTransfer(altered,OFFICIAL_APPS),e=>e.code==='E_TRANSFER');
});

test('R4.5 legacy source adoption requires explicit confirmation and preserves the original private data',async()=>{
  const {api,locks,values}=browser(),old=tool('reading-toc','0.0.1'),candidate=tool();
  const key=sidebarToolStorageKey(old.id),saved={note:'既有用户内容'};
  values[SIDEBAR_TOOL_STORE]=[old];values[key]=structuredClone(saved);
  const args={api,lockManager:locks,candidate,baseline:old,reviewApproved:true,market:identity()};
  await assert.rejects(installReviewedSidebarTool(args),e=>e.code==='E_PUBLISHER_CONFLICT');
  assert.equal((await installReviewedSidebarTool({...args,approveSourceChange:()=>false})).state,'cancelled');
  assert.deepEqual(values[SIDEBAR_TOOL_STORE],[old]);assert.deepEqual(values[key],saved);
  assert.equal((await installReviewedSidebarTool({...args,approveSourceChange:()=>true,approveUpdate:()=>false})).state,'cancelled');
  assert.deepEqual(values[SIDEBAR_TOOL_STORE],[old]);assert.deepEqual(values[key],saved);
  assert.equal((await installReviewedSidebarTool({...args,approveSourceChange:()=>true,approveUpdate:()=>true})).state,'installed');
  assert.deepEqual(values[key],saved);assert.equal(values[MARKET_PROVENANCE_STORE][old.id].marketId,'opendesk/reading-toc');
});

test('R4.5 capability additions cannot activate orphan site grants and retained capabilities preserve existing sites',async()=>{
  const stores=[['opendesk.sidebar-tools.toc-sites.v1','page.toc'],
    ['opendesk.sidebar-tools.clip-sites.v1','page.clip'],['opendesk.sidebar-tools.capture-sites.v1','page.capture']];
  // Read the actual capture constant: the package capabilities are separate
  // from the durable site authorization namespace.
  const {CAPTURE_SITE_STORE}=await import('../../src/knowledge/policy.js');stores[2][0]=CAPTURE_SITE_STORE;
  for(const [store,capability] of stores){
    const {api,locks,values}=browser(),old=tool('reading-toc','0.0.1');
    const candidate={...tool(),capabilities:[capability]};
    values[SIDEBAR_TOOL_STORE]=[old];values[store]={[old.id]:['https://approved.example']};
    await installReviewedSidebarTool({api,lockManager:locks,candidate,baseline:old,reviewApproved:true});
    assert.deepEqual(values[store],{},'new capability still needs separate site authorization');
    values[store]={[old.id]:['https://approved.example']};
    const update={...candidate,version:'1.0.3'};
    await installReviewedSidebarTool({api,lockManager:locks,candidate:update,baseline:candidate,reviewApproved:true});
    assert.deepEqual(values[store],{[old.id]:['https://approved.example']});
    assert.deepEqual(values[SIDEBAR_TOOL_STORE],[update]);
  }
});


test('R4.5 old unknown operations cannot be reconciled using a newer release or different bytes',async()=>{
  const {api,values}=browser(),original=tool(),record={...identity(),toolId:original.id,
    version:original.version,state:'outcome-unknown'};
  values[MARKET_OPERATIONS_STORE]={[record.operationId]:record};
  for(const replacement of [{...original,version:'9.0.0'},{...original,js:'void "different release";'}]){
    values[SIDEBAR_TOOL_STORE]=[replacement];
    assert.equal((await reconcileMarketOperation(api,record.operationId,replacement)).state,'outcome-unknown');
  }
  values[SIDEBAR_TOOL_STORE]=[original];
  assert.equal((await reconcileMarketOperation(api,record.operationId,original)).state,'needs-finalization');
  assert.equal(values[MARKET_OPERATIONS_STORE][record.operationId].state,'outcome-unknown');
  assert.equal(values[MARKET_PROVENANCE_STORE]?.[original.id],undefined);
  assert.equal((await recoverMarketOperation({api,lockManager:{request:async(_name,fn)=>fn()},
    operationId:record.operationId})).state,'succeeded');
});

test('host quota refusal before registry commit retains the previous package and its private data',async()=>{
  const {api,locks,values}=browser(),original=tool(),next=tool('reading-toc','1.0.3'),key=sidebarToolStorageKey(original.id);
  values[SIDEBAR_TOOL_STORE]=[original];values[key]={draft:'must survive'};
  const set=api.storage.local.set;
  api.storage.local.set=async rows=>{
    if(Object.hasOwn(rows,SIDEBAR_TOOL_STORE))throw Error('QUOTA_BYTES quota exceeded');
    return set(rows);
  };
  await assert.rejects(installReviewedSidebarTool({api,lockManager:locks,candidate:next,
    baseline:original,reviewApproved:true}),e=>e.code==='E_HOST_STORAGE_QUOTA');
  assert.deepEqual(values[SIDEBAR_TOOL_STORE],[original]);assert.deepEqual(values[key],{draft:'must survive'});
});
test('offline recovery uses only local package digest and durable operation journal',async()=>{
  const {api,locks,values}=browser(),candidate=tool(),record={...identity(),toolId:candidate.id,
    version:candidate.version,state:'outcome-unknown'};
  values[SIDEBAR_TOOL_STORE]=[candidate];values[MARKET_OPERATIONS_STORE]={[record.operationId]:record};
  assert.equal((await reconcileMarketOperation(api,record.operationId)).state,'needs-finalization');
  assert.equal((await recoverMarketOperation({api,lockManager:locks,operationId:record.operationId})).state,'succeeded');
  assert.deepEqual(values[MARKET_PROVENANCE_STORE][candidate.id],
    {marketId:record.marketId,version:record.version,sha256:record.sha256});
});
test('partially failed uninstall keeps recovery journal and never deletes reinstalled same-ID data',async()=>{
  const {api,locks,values}=browser(),old=tool(),key=sidebarToolStorageKey(old.id);
  values[SIDEBAR_TOOL_STORE]=[old];values[key]={secret:'old'};
  await recordToolUninstall(api,old);
  values[SIDEBAR_TOOL_STORE]=[];
  const remove=api.storage.local.remove;
  api.storage.local.remove=async item=>{if(item===key)throw Error('disk failed');return remove(item);};
  await assert.rejects(cleanupUninstalledToolLocked(api,old.id),e=>e.code==='E_TOOL_UNINSTALL_CLEANUP');
  assert.ok(values[TOOL_CLEANUP_STORE][old.id]);
  api.storage.local.remove=remove;
  const replacement={...old,version:'8.0.0'};
  values[SIDEBAR_TOOL_STORE]=[replacement];values[key]={secret:'new'};
  assert.equal((await retryUninstalledToolCleanup({api,lockManager:locks,id:old.id})).state,'still-installed');
  assert.deepEqual(values[key],{secret:'new'});
  values[SIDEBAR_TOOL_STORE]=[];
  assert.equal((await retryUninstalledToolCleanup({api,lockManager:locks,id:old.id})).state,'cleaned');
  assert.equal(values[key],undefined);
  assert.equal(values[TOOL_CLEANUP_STORE][old.id],undefined);

});
