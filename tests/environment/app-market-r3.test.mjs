import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE,sidebarToolStorageKey,MAX_INSTALLED_TOOLS,serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {installReviewedSidebarTool,reconcileMarketOperation,recoverMarketOperation,MARKET_OPERATIONS_STORE,
  MARKET_PROVENANCE_STORE,sameSidebarToolPackage,recordToolUninstall,getPendingToolCleanups,
  cleanupUninstalledToolLocked,retryUninstalledToolCleanup,TOOL_CLEANUP_STORE} from '../../src/ui/sidebar-tools/installation.js';

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
test('market catalog uses pinned immutable member identity and every registered tool version',async()=>{
  const sources=JSON.parse(await readFile('official-tools/catalog.json','utf8'));
  assert.deepEqual(OFFICIAL_APPS.map(row=>row.toolId).sort(),sources.tools.map(row=>row.id).sort());
  const unique=new Set(OFFICIAL_APPS.map(a=>a.id));
  assert.equal(unique.size,sources.tools.length);
  const kit=getOfficialCollection('reading-kit',1);
  assert(OFFICIAL_COLLECTIONS.includes(kit));
  assert.deepEqual(kit.members,[{id:'opendesk/reading-toc',version:'1.0.2'},
    {id:'opendesk/web-markdown-clipper',version:'1.0.0'},{id:'opendesk/quick-notes',version:'1.1.1'}],
    'published collection revisions do not silently track newer tool.config versions');
  const previous=getOfficialCollection('reading-kit',2);
  assert.deepEqual(previous.members,[{id:'opendesk/reading-toc',version:'1.0.3'},
    {id:'opendesk/web-markdown-clipper',version:'1.0.0'},{id:'opendesk/quick-notes',version:'1.1.6'}]);
  const archived=getOfficialCollection('reading-kit',3);
  assert.deepEqual(archived.members,[{id:'opendesk/reading-toc',version:'1.0.3'},
    {id:'opendesk/web-markdown-clipper',version:'1.0.0'},{id:'opendesk/quick-notes',version:'1.1.8'}]);
  const current=getOfficialCollection('reading-kit',4);
  assert.equal(current,OFFICIAL_COLLECTIONS[0]);
  assert.deepEqual(current.members,[{id:'opendesk/reading-toc',version:'1.0.4'},
    {id:'opendesk/web-markdown-clipper',version:'1.0.0'},{id:'opendesk/quick-notes',version:'1.1.8'}]);
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
  assert.equal(operations.some(op=>op.method==='remove'&&op.keys===sidebarToolStorageKey('reading-toc')),false,
    'fresh install may not delete unowned data before the package registry commit');
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
test('a lost registry acknowledgement requires explicit finalization even after exact readback',async()=>{
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
    market:identity()}),{code:'E_OUTCOME_UNKNOWN'});
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
test('an unreadable registry after a lost acknowledgement requires local finalization without another install write',async()=>{
  const {api,locks,values}=browser(),candidate=tool(),set=api.storage.local.set,get=api.storage.local.get;
  let unreadable=false,registryWrites=0;
  api.storage.local.set=async rows=>{
    await set(rows);
    if(Object.hasOwn(rows,SIDEBAR_TOOL_STORE)){registryWrites++;unreadable=true;throw Error('ack lost');}
  };
  api.storage.local.get=key=>key===SIDEBAR_TOOL_STORE&&unreadable?Promise.reject(Error('readback unavailable')):get(key);
  await assert.rejects(installReviewedSidebarTool({api,lockManager:locks,candidate,baseline:null,reviewApproved:true,
    market:identity()}),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(values[MARKET_OPERATIONS_STORE][identity().operationId].state,'outcome-unknown');
  unreadable=false;
  assert.equal((await reconcileMarketOperation(api,identity().operationId)).state,'needs-finalization');
  assert.equal(values[MARKET_PROVENANCE_STORE],undefined,'read-only reconciliation does not invent provenance');
  assert.equal((await recoverMarketOperation({api,lockManager:locks,operationId:identity().operationId})).state,'succeeded');
  assert.equal(registryWrites,1);assert.equal(values[SIDEBAR_TOOL_STORE].length,1);
  assert.equal(values[MARKET_PROVENANCE_STORE][candidate.id].sha256,identity().sha256);
});
test('recovery rejects a changed transaction identity before writing any provenance',async()=>{
  const {api,values,operations}=browser(),original=tool(),replacement=tool('quick-notes','2.0.0');
  const record={...identity(),toolId:original.id,version:original.version,state:'outcome-unknown'};
  values[SIDEBAR_TOOL_STORE]=[original];values[MARKET_OPERATIONS_STORE]={[record.operationId]:record};
  for(const expectedIdentity of [{marketId:'opendesk/quick-notes'},{version:'9.0.0'},{sha256:'0'.repeat(64)}])
    await assert.rejects(recoverMarketOperation({api,lockManager:{request:(_name,fn)=>fn()},
      operationId:record.operationId,expectedIdentity}),{code:'E_MARKET_IDENTITY'});
  assert.deepEqual(operations,[],'a mismatched UI or batch identity cannot finalize another operation');
  let changed=false;
  const locks={request:async(_name,fn)=>{
    if(!changed){
      changed=true;values[SIDEBAR_TOOL_STORE]=[replacement];
      values[MARKET_OPERATIONS_STORE][record.operationId]={...record,toolId:replacement.id,
        marketId:'opendesk/'+replacement.id,version:replacement.version,
        sha256:createHash('sha256').update(serializeSidebarToolPackage(replacement)).digest('hex')};
    }
    return fn();
  }};
  await assert.rejects(recoverMarketOperation({api,lockManager:locks,operationId:record.operationId}),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(values[MARKET_PROVENANCE_STORE],undefined);assert.deepEqual(operations,[]);
  assert.deepEqual(values[SIDEBAR_TOOL_STORE],[replacement]);
});
test('data-only transfer rejects script, site grants, tokens, duplicates and unknown versions',()=>{
  const safe={format:'opendesk.market.transfer.v1',apps:[{marketId:'opendesk/reading-toc',version:OFFICIAL_APPS.find(app=>app.toolId==='reading-toc').version}]};
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

test('fresh or newly capable tools never publish a registry entry while orphan site grants remain',async()=>{
  const {CAPTURE_SITE_STORE}=await import('../../src/knowledge/policy.js');
  for(const [store,capability] of [['opendesk.sidebar-tools.toc-sites.v1','page.toc'],
    ['opendesk.sidebar-tools.clip-sites.v1','page.clip'],[CAPTURE_SITE_STORE,'page.capture']]){
    for(const existing of [null,tool('reading-toc','0.0.1')]){
      const {api,locks,values}=browser(),candidate={...tool(),capabilities:[capability]},published=[];
      if(existing)values[SIDEBAR_TOOL_STORE]=[existing];
      values[store]={[candidate.id]:['https://orphan.example']};
      const set=api.storage.local.set;
      api.storage.local.set=async rows=>{
        await set(rows);
        if(Object.hasOwn(rows,SIDEBAR_TOOL_STORE))published.push(structuredClone(values[store]));
      };
      await installReviewedSidebarTool({api,lockManager:locks,candidate,baseline:existing,reviewApproved:true});
      assert.deepEqual(published,[{}],capability+' orphan permission was removed before installation became observable');
    }
  }
});
test('orphan-grant cleanup failure cannot activate a fresh package; registry failure retains existing valid grants and data',async()=>{
  const store='opendesk.sidebar-tools.toc-sites.v1',origin='https://approved.example';
  {
    const {api,locks,values}=browser(),candidate={...tool(),capabilities:['page.toc']},set=api.storage.local.set;
    values[store]={[candidate.id]:[origin]};
    api.storage.local.set=rows=>Object.hasOwn(rows,store)?Promise.reject(Error('disk full')):set(rows);
    await assert.rejects(installReviewedSidebarTool({api,lockManager:locks,candidate,reviewApproved:true}),{code:'E_HOST_STORAGE_QUOTA'});
    assert.equal(values[SIDEBAR_TOOL_STORE],undefined,'failed cleanup must not publish a newly authorized tool');
  }
  {
    const {api,locks,values}=browser(),old={...tool('reading-toc','0.0.1'),capabilities:['page.toc']},set=api.storage.local.set;
    const originalData={note:'保留原数据'};values[SIDEBAR_TOOL_STORE]=[old];values[store]={[old.id]:[origin]};
    values[sidebarToolStorageKey(old.id)]=originalData;
    api.storage.local.set=rows=>Object.hasOwn(rows,SIDEBAR_TOOL_STORE)?Promise.reject(Error('disk full')):set(rows);
    await assert.rejects(installReviewedSidebarTool({api,lockManager:locks,candidate:tool(),baseline:old,reviewApproved:true}),{code:'E_HOST_STORAGE_QUOTA'});
    assert.deepEqual(values[SIDEBAR_TOOL_STORE],[old]);assert.deepEqual(values[store],{[old.id]:[origin]});
    assert.deepEqual(values[sidebarToolStorageKey(old.id)],originalData);
  }
});
test('uninstall recovery accepts a real package version and never deletes a newly reinstalled tool',async()=>{
  const {api,locks,values}=browser(),candidate=tool('quick-notes','1.1.5'),key=sidebarToolStorageKey(candidate.id);
  values[SIDEBAR_TOOL_STORE]=[candidate];values[key]={note:'retained'};
  await recordToolUninstall(api,candidate);
  assert.equal((await getPendingToolCleanups(api))[candidate.id].version,candidate.version);
  const run=()=>locks.request('opendesk.sidebar-tools:tool:'+candidate.id,()=>
    locks.request('opendesk.sidebar-tools:catalog',()=>cleanupUninstalledToolLocked(api,candidate.id)));
  assert.equal((await run()).state,'still-installed');assert.deepEqual(values[key],{note:'retained'});
  values[SIDEBAR_TOOL_STORE]=[];
  assert.equal((await run()).state,'cleaned');assert.equal(values[key],undefined);
  assert.deepEqual(values[TOOL_CLEANUP_STORE],{});
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

test('an acknowledged official baseline can finalize an upgrade with a lost registry acknowledgement without replay',async()=>{
  for(const conflict of ['none','changed-source','legacy-journal','malformed-snapshot','changed-snapshot-in-lock']){
    const {api,locks,values}=browser(),old={...tool('reading-toc','1.0.1'),capabilities:['page.toc']};
    const candidate={...old,version:'1.0.2',js:'void "official update";'};
    const release=(pkg,operationId)=>({marketId:'opendesk/'+pkg.id,operationId,
      sha256:createHash('sha256').update(serializeSidebarToolPackage(pkg)).digest('hex')});
    const prior=release(old,'11111111-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    const next=release(candidate,'22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    await installReviewedSidebarTool({api,lockManager:locks,candidate:old,reviewApproved:true,market:prior});
    const source=structuredClone(values[MARKET_PROVENANCE_STORE][old.id]);
    const key=sidebarToolStorageKey(old.id),siteStore='opendesk.sidebar-tools.toc-sites.v1';
    values[key]={note:'existing private content'};values[siteStore]={[old.id]:['https://approved.example']};
    const set=api.storage.local.set;let registryWrites=0;
    api.storage.local.set=async rows=>{
      await set(rows);
      if(Object.hasOwn(rows,SIDEBAR_TOOL_STORE)){registryWrites++;throw Error('upgrade registry acknowledgement lost');}
    };
    await assert.rejects(installReviewedSidebarTool({api,lockManager:locks,candidate,baseline:old,
      reviewApproved:true,market:next,approveUpdate:()=>true}),{code:'E_OUTCOME_UNKNOWN'});
    assert.deepEqual(values[MARKET_PROVENANCE_STORE][old.id],source,'upgrade has not finalized the previous publisher record');
    if(conflict==='changed-source')values[MARKET_PROVENANCE_STORE][old.id]={...source,sha256:'0'.repeat(64)};
    if(conflict==='legacy-journal')delete values[MARKET_OPERATIONS_STORE][next.operationId].previousProvenance;
    if(conflict==='malformed-snapshot')values[MARKET_OPERATIONS_STORE][next.operationId].previousProvenance.version='01.0.1';
    const checked=await reconcileMarketOperation(api,next.operationId);
    assert.equal(checked.state,['none','changed-snapshot-in-lock'].includes(conflict)?'needs-finalization':'outcome-unknown',conflict);
    if(conflict==='changed-snapshot-in-lock'){
      const request=locks.request;let changed=false;
      locks.request=(name,fn)=>request(name,()=>{
        if(!changed){changed=true;delete values[MARKET_OPERATIONS_STORE][next.operationId].previousProvenance;}
        return fn();
      });
      await assert.rejects(recoverMarketOperation({api,lockManager:locks,operationId:next.operationId}),{code:'E_OUTCOME_UNKNOWN'});
    }else assert.equal((await recoverMarketOperation({api,lockManager:locks,operationId:next.operationId})).state,
      conflict==='none'?'succeeded':'outcome-unknown',conflict);
    if(conflict==='none'){
      assert.deepEqual(values[MARKET_PROVENANCE_STORE][old.id],
        {marketId:next.marketId,version:candidate.version,sha256:next.sha256});
      assert.equal(values[MARKET_OPERATIONS_STORE][next.operationId].state,'succeeded');
    }else{
      assert.equal(values[MARKET_OPERATIONS_STORE][next.operationId].state,'outcome-unknown');
      assert.equal(values[MARKET_PROVENANCE_STORE][old.id].version,old.version);
    }
    assert.equal(registryWrites,1,'local finalization must never repeat the upgrade registry write');
    assert.deepEqual(values[SIDEBAR_TOOL_STORE],[candidate]);
    assert.deepEqual(values[key],{note:'existing private content'});
    assert.deepEqual(values[siteStore],{[old.id]:['https://approved.example']});
  }
});

test('reviewed market hash must actually match the candidate even if ID and version look valid',async()=>{
  const {api,locks,values}=browser(),candidate=tool();
  await assert.rejects(installReviewedSidebarTool({api,lockManager:locks,candidate,
    baseline:null,reviewApproved:true,
    market:{...identity(),sha256:'e'.repeat(64)}}),{code:'E_MARKET_IDENTITY'});
  assert.equal(values[SIDEBAR_TOOL_STORE],undefined);
});

test('orphaned notes are retained when new same-ID installation cannot safely commit',async()=>{
  const {api,locks,values}=browser(),candidate=tool(),key=sidebarToolStorageKey(candidate.id);
  values[key]={draft:'旧笔记尚未备份'};
  await assert.rejects(installReviewedSidebarTool({api,lockManager:locks,
    candidate,baseline:null,reviewApproved:true}),error=>error.code==='E_TOOL_ORPHAN_DATA'&&
      /未关联卸载确认/.test(error.message)&&!/「我的应用」/.test(error.message));
  assert.deepEqual(values[key],{draft:'旧笔记尚未备份'});
  assert.equal(values[SIDEBAR_TOOL_STORE],undefined);
});

test('installer fails closed on malformed, duplicated or overflowed local registries without erasing any rows',async()=>{
  const good=tool('reading-toc'),privateKey=sidebarToolStorageKey(good.id);
  const invalid=[good,{...good,id:'invalid id'}];
  const duplicate=[good,structuredClone(good)];
  const overflow=Array.from({length:MAX_INSTALLED_TOOLS+1},(_,index)=>tool('entry'+index));
  for(const rows of [invalid,duplicate,overflow,{broken:true}]){
    const {api,locks,values,operations}=browser();
    values[SIDEBAR_TOOL_STORE]=structuredClone(rows);
    values[privateKey]={draft:'永远不能意外丢失'};
    await assert.rejects(installReviewedSidebarTool({api,lockManager:locks,
      candidate:tool('new-tool'),baseline:null,reviewApproved:true}),{code:'E_STORAGE_CORRUPT'});
    assert.deepEqual(values[SIDEBAR_TOOL_STORE],rows);
    assert.deepEqual(values[privateKey],{draft:'永远不能意外丢失'});
    assert.equal(operations.some(row=>row.keys?.includes(SIDEBAR_TOOL_STORE)),false);
  }
});
