import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPageInstallHost,MARKET_PAGE_PROTOCOL as protocol,validatePageInstallMessage} from '../../src/marketplace/page-install.js';
import {MARKET_INTENTS_STORE,MARKET_INTENT_TTL} from '../../src/marketplace/intent.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {MARKET_OPERATIONS_STORE,MARKET_PROVENANCE_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {readMarketInstallStatus} from '../../src/marketplace/status.js';
import {installReviewedSidebarTool} from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {consumeReviewIntent,cancelReviewIntent} from '../../src/marketplace/intent.js';
import {MARKET_BATCH_STORE} from '../../src/marketplace/batch.js';
import {getOfficialCollection} from '../../src/marketplace/catalog.js';

// Component evidence: actual shared installer, in-memory Chrome storage. Native
// evidence is recorded separately; a forged test sender never proves a gesture.
const origin='http://127.0.0.1:43132',id='a'.repeat(32);
const tool={format:'opendesk.sidebar-tool.v1',id:'market-page-example',version:'1.0.0',title:'Page example',
  description:'Independent example',capabilities:['storage.local'],html:'<main>Counter</main>',css:'',js:'void 0;'};
test('collection status reads only the matching batch, fixed members and successful installer identities',async()=>{
  const h=harness(),collection=getOfficialCollection('reading-kit',1),operationId=randomUUID();
  const handoff={subject:{kind:'collection',collectionId:collection.id,revision:collection.revision},operationId,consumedAt:Date.now()};
  const tools=collection.members.map(member=>({...tool,id:member.id.split('/')[1],version:member.version}));
  const items=collection.members.map(member=>({...member,operationId:randomUUID(),status:'succeeded',reason:''}));
  h.values[SIDEBAR_TOOL_STORE]=tools;h.values[MARKET_PROVENANCE_STORE]={};h.values[MARKET_OPERATIONS_STORE]={};
  for(let index=0;index<tools.length;index++){
    const sha256=await sidebarToolPackageHash(tools[index]),item=items[index];
    h.values[MARKET_PROVENANCE_STORE][tools[index].id]={marketId:item.id,version:item.version,sha256};
    h.values[MARKET_OPERATIONS_STORE][item.operationId]={toolId:tools[index].id,marketId:item.id,version:item.version,sha256,state:'succeeded'};
  }
  h.values[MARKET_BATCH_STORE]={batchId:operationId,collectionId:collection.id,revision:collection.revision,updatedAt:Date.now(),items};
  const before=structuredClone(h.values);
  assert.equal((await readMarketInstallStatus(h.api,handoff)).installation,'installed');
  for(const mutate of [
    values=>values[MARKET_BATCH_STORE].batchId=randomUUID(),
    values=>values[MARKET_BATCH_STORE].revision++,
    values=>values[MARKET_BATCH_STORE].items[0].version='9.0.0',
    values=>delete values[MARKET_OPERATIONS_STORE][items[0].operationId],
    values=>values[MARKET_OPERATIONS_STORE][items[0].operationId].sha256='0'.repeat(64),
    values=>values[SIDEBAR_TOOL_STORE][0].js='void 2;'
  ]){
    Object.assign(h.values,structuredClone(before));mutate(h.values);
    assert.equal((await readMarketInstallStatus(h.api,handoff)).installation,'unknown');
  }
  Object.assign(h.values,structuredClone(before));h.values[MARKET_BATCH_STORE].items[0].status='outcome-unknown';
  assert.equal((await readMarketInstallStatus(h.api,handoff)).installation,'unknown');
  h.values[MARKET_BATCH_STORE].items[0].status='queued';assert.equal((await readMarketInstallStatus(h.api,handoff)).installation,'installing');
  h.values[MARKET_BATCH_STORE].items[0].status='failed';assert.equal((await readMarketInstallStatus(h.api,handoff)).installation,'failed');
  assert.deepEqual(h.writes,[]);assert.deepEqual(h.opened,[]);
});
function harness(){
  const values={},writes=[],opened=[],locks=new Map();let time=Date.now(),candidate=tool,frame='b'.repeat(32);
  const sender={id,url:origin+'/apps/opendesk/'+tool.id+'/',origin,frameId:0,documentId:frame,
    documentLifecycle:'active',tab:{id:1,incognito:false}};
  const tab={id:1,windowId:1,url:sender.url,incognito:false,active:true};
  const api={runtime:{id,getURL:path=>'chrome-extension://'+id+'/'+path},storage:{local:{
    async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(values[key])]));},
    async set(rows){writes.push(structuredClone(rows));Object.assign(values,structuredClone(rows));},
    async remove(key){delete values[key];}}},
    tabs:{async get(){return tab;},async create(options){opened.push(options);return {id:2,windowId:1};}},
    windows:{async update(){}},
    webNavigation:{async getFrame(){return {documentId:frame,parentFrameId:-1,documentLifecycle:'active',url:tab.url};}}};
  const lockManager={request(name,callback){const next=(locks.get(name)||Promise.resolve()).then(callback);
    const tail=next.catch(()=>{});locks.set(name,tail);void tail.finally(()=>{if(locks.get(name)===tail)locks.delete(name);});return next;}};
  const channel={enabled:true,origin,extensionId:id};
  const host=()=>createPageInstallHost({api,channel,lockManager,now:()=>time,
    loadTool:async()=>({tool:candidate,release:{sha256:await sidebarToolPackageHash(candidate)}})});
  const subject={kind:'app',marketId:'opendesk/'+tool.id,version:tool.version};
  const request={protocol,action:'PREPARE',intentId:randomUUID(),subject};
  const h={api,values,writes,opened,sender,request,subject,host,channel,lockManager,tab,
    time:value=>time=value,now:()=>time,candidate:value=>candidate=value,frame:value=>frame=value};
  h.prepare=()=>h.host().handle(request,sender);
  h.action=(action,token)=>h.host().handle({...request,action,...(token?{token}:{})},sender);
  return h;
}
function seed(h){
  const row={intentId:h.request.intentId,reviewId:randomUUID(),operationId:randomUUID(),subject:h.subject,origin,
    createdAt:h.now(),expiresAt:h.now()+MARKET_INTENT_TTL,phase:'opened',tabId:2,consumedAt:null,settledAt:null,closureReason:null,
    pageReview:{documentId:h.sender.documentId,tabId:1,token:randomUUID(),sha256:null,baselineHash:null,cancelledAt:null}};
  return sidebarToolPackageHash(tool).then(sha256=>{
    row.pageReview.sha256=sha256;
    h.values[MARKET_INTENTS_STORE]={schema:MARKET_INTENTS_STORE,intents:[row],requests:[]};return row;
  });
}
function claim(h,row,sha256){return consumeReviewIntent({api:h.api,lockManager:h.lockManager,reviewId:row.reviewId,
  operationId:row.operationId,subject:row.subject,sha256,now:h.now()});}
async function install(h,row,candidate=tool,baseline=null){
  const sha256=await sidebarToolPackageHash(candidate);
  return installReviewedSidebarTool({api:h.api,lockManager:h.lockManager,candidate,baseline,reviewApproved:true,
    market:{marketId:row.subject.marketId,sha256,operationId:row.operationId},commitIntent:()=>claim(h,row,sha256)});
}
for(const action of ['PREPARE','COMMIT','CANCEL','RECOVER','CLOSE','OPEN'])
  test('retired page '+action+' cannot approve or mutate an installation',async()=>{
    const h=harness();await seed(h);const before=structuredClone(h.values);
    await assert.rejects(h.action(action,randomUUID()),{code:'E_REVIEW_REQUIRED'});
    assert.deepEqual(h.values,before);assert.deepEqual(h.writes,[]);assert.deepEqual(h.opened,[]);
  });
test('historical STATUS reload is read only and does not infer transaction success from an existing package',async()=>{
  const h=harness(),row=await seed(h);await claim(h,row,row.pageReview.sha256);
  h.values[SIDEBAR_TOOL_STORE]=[tool];h.values[MARKET_PROVENANCE_STORE]={[tool.id]:{marketId:row.subject.marketId,version:tool.version,sha256:row.pageReview.sha256}};
  const before=structuredClone(h.values),writes=h.writes.length;
  for(let i=0;i<2;i++){
    const result=await h.action('STATUS');assert.equal(result.installation,'unknown');assert.equal(result.currentInstallation,'installed');
  }
  assert.deepEqual(h.values,before);assert.equal(h.writes.length,writes);assert.deepEqual(h.opened,[]);
});
test('historical STATUS rejects forged senders and stale top documents before mutation',async()=>{
  const h=harness();await seed(h);const request={...h.request,action:'STATUS'};
  for(const sender of [{...h.sender,id:undefined},{...h.sender,id:'c'.repeat(32)},{...h.sender,frameId:1},
    {...h.sender,origin:'http://127.0.0.1:43133'},{...h.sender,documentLifecycle:'cached'},
    {...h.sender,documentId:randomUUID()},{...h.sender,url:'https://untrusted.invalid/'}])
    await assert.rejects(h.host().handle(request,sender));
  h.frame('c'.repeat(32));await assert.rejects(h.host().handle(request,h.sender),{code:'E_DOCUMENT'});
  assert.deepEqual(h.writes,[]);
});
for(const extra of [{approved:true},{token:randomUUID()},{url:'https://untrusted.invalid/package'}])
  test('historical STATUS rejects extra '+Object.keys(extra)[0],()=>{
    const h=harness();assert.throws(()=>validatePageInstallMessage({...h.request,action:'STATUS',...extra}),{code:'E_REVIEW_REQUIRED'});
  });
test('historical STATUS binds the original subject and origin',async()=>{
  const h=harness();await seed(h);
  await assert.rejects(h.host().handle({...h.request,action:'STATUS',subject:{...h.subject,version:'2.0.0'}},h.sender),{code:'E_INTENT_CONFLICT'});
  h.values[MARKET_INTENTS_STORE].intents[0].origin='https://untrusted.invalid';
  await assert.rejects(h.action('STATUS'),{code:'E_INTENT_CONFLICT'});assert.deepEqual(h.writes,[]);
});
test('real installer installs the fixed package with a successful original journal',async()=>{
  const h=harness(),row=await seed(h);await install(h,row);
  assert.equal((await h.action('STATUS')).installation,'installed');assert.equal(h.values[SIDEBAR_TOOL_STORE][0].version,tool.version);
  assert.equal(h.values[MARKET_OPERATIONS_STORE][row.operationId].state,'succeeded');assert.deepEqual(h.opened,[]);
});
test('real installer upgrade preserves data and a disabled application remains disabled',async()=>{
  const h=harness(),row=await seed(h);await install(h,row);
  const data=sidebarToolStorageKey(tool.id);h.values[data]={counter:2};h.values[SIDEBAR_TOOL_ENABLE_STORE]={[tool.id]:false};
  const candidate={...tool,version:'1.1.0',js:'void 1;'},next={...row,intentId:randomUUID(),reviewId:randomUUID(),operationId:randomUUID(),
    subject:{...row.subject,version:candidate.version},consumedAt:null,pageReview:undefined};
  delete next.pageReview;h.values[MARKET_INTENTS_STORE].intents.push(next);
  await install(h,next,candidate,tool);
  assert.deepEqual(h.values[data],{counter:2});assert.equal(h.values[SIDEBAR_TOOL_STORE][0].version,'1.1.0');
  const result=await readMarketInstallStatus(h.api,next);assert.equal(result.installation,'installed');assert.equal(result.enabled,false);
});
test('exact installed package review consumes before journal and succeeds without registry epoch or data writes',async()=>{
  const h=harness(),row=await seed(h);await install(h,row);
  const next={...row,intentId:randomUUID(),reviewId:randomUUID(),operationId:randomUUID()};
  h.values[MARKET_INTENTS_STORE].intents.push(next);
  const data=sidebarToolStorageKey(tool.id);h.values[data]={counter:9};h.values[SIDEBAR_TOOL_ENABLE_STORE]={[tool.id]:false};
  const protectedKeys=[SIDEBAR_TOOL_STORE,TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_ENABLE_STORE,data];
  const before=protectedKeys.map(key=>structuredClone(h.values[key])),start=h.writes.length;
  assert.equal((await install(h,next,tool,tool)).state,'already-installed');
  const writes=h.writes.slice(start),states=writes.filter(rows=>rows[MARKET_OPERATIONS_STORE]).map(rows=>rows[MARKET_OPERATIONS_STORE][next.operationId].state);
  assert.deepEqual(states,['reviewed','succeeded']);assert.ok(writes[0][MARKET_INTENTS_STORE].intents[1].consumedAt);
  assert.deepEqual(protectedKeys.map(key=>h.values[key]),before);assert.ok(writes.every(rows=>protectedKeys.every(key=>!Object.hasOwn(rows,key))));
  assert.equal((await readMarketInstallStatus(h.api,h.values[MARKET_INTENTS_STORE].intents[1])).installation,'installed');
});
test('exact installed package original operation refuses replay before consuming or writing',async()=>{
  const h=harness(),row=await seed(h);await install(h,row);const before=structuredClone(h.values),count=h.writes.length;
  await assert.rejects(install(h,row,tool,tool),{code:'E_OUTCOME_UNKNOWN'});
  assert.deepEqual(h.values,before);assert.equal(h.writes.length,count);
});
test('persisted cancellation survives reload and prevents consumption',async()=>{
  const h=harness(),row=await seed(h);await cancelReviewIntent({api:h.api,lockManager:h.lockManager,reviewId:row.reviewId,now:h.now()});
  assert.equal((await h.action('STATUS')).installation,'cancelled');
  await assert.rejects(claim(h,row,row.pageReview.sha256),{code:'E_INTENT_CANCELLED'});assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);
});
test('consumption refuses SHA drift from the historical fixed review',async()=>{
  const h=harness(),row=await seed(h);await assert.rejects(claim(h,row,'0'.repeat(64)),{code:'E_PACKAGE_IDENTITY'});
  assert.equal(h.values[MARKET_INTENTS_STORE].intents[0].consumedAt,null);assert.deepEqual(h.writes,[]);
});
for(const mutation of ['missing','state','sha','toolId','epoch','provenance','bytes'])
  test('transaction status fails closed for '+mutation+' mismatch',async()=>{
    const h=harness(),row=await seed(h);await install(h,row);const op=h.values[MARKET_OPERATIONS_STORE][row.operationId];
    if(mutation==='missing')delete h.values[MARKET_OPERATIONS_STORE][row.operationId];
    if(mutation==='state')op.state='committing';
    if(mutation==='sha')op.sha256='0'.repeat(64);
    if(mutation==='toolId')op.toolId='another-tool';
    if(mutation==='epoch')h.values[TOOL_REVOCATION_EPOCHS_STORE][tool.id]=randomUUID();
    if(mutation==='provenance')h.values[MARKET_PROVENANCE_STORE][tool.id].sha256='0'.repeat(64);
    if(mutation==='bytes')h.values[SIDEBAR_TOOL_STORE][0].js='void 99;';
    const status=await h.action('STATUS');
    assert.equal(status.installation,'unknown');assert.equal(status.handoffClosed,false);
  });

test('missing package alone cannot close an uncertain or conflicting installation transaction',async()=>{
  for(const mutation of ['missing-journal','committing','outcome-unknown','sha','marketId','version','toolId','source-remains']){
    const h=harness(),row=await seed(h);await install(h,row);
    const op=h.values[MARKET_OPERATIONS_STORE][row.operationId];
    h.values[SIDEBAR_TOOL_STORE]=[];
    if(mutation!=='source-remains')h.values[MARKET_PROVENANCE_STORE]={};
    if(mutation==='missing-journal')delete h.values[MARKET_OPERATIONS_STORE][row.operationId];
    if(['committing','outcome-unknown'].includes(mutation))op.state=mutation;
    if(mutation==='sha')op.sha256='0'.repeat(64);
    if(mutation==='marketId')op.marketId='opendesk/another-tool';
    if(mutation==='version')op.version='2.0.0';
    if(mutation==='toolId')op.toolId='another-tool';
    const status=await h.action('STATUS');
    assert.equal(status.installation,'unknown',mutation);assert.equal(status.handoffClosed,false,mutation);
  }
});

test('exact package acknowledgement loss stops before creating its successful journal',async()=>{
  const h=harness(),row=await seed(h);await install(h,row);
  const next={...row,intentId:randomUUID(),reviewId:randomUUID(),operationId:randomUUID()};h.values[MARKET_INTENTS_STORE].intents.push(next);
  const set=h.api.storage.local.set;let fault=true;
  h.api.storage.local.set=async rows=>{await set(rows);if(fault&&rows[MARKET_INTENTS_STORE]?.intents[1]?.consumedAt!=null){fault=false;throw Error('acknowledgement lost');}};
  const count=h.writes.length;await assert.rejects(install(h,next,tool,tool),{code:'E_HANDOFF_UNKNOWN'});
  assert.ok(h.values[MARKET_INTENTS_STORE].intents[1].consumedAt);assert.equal(h.values[MARKET_OPERATIONS_STORE][next.operationId],undefined);
  assert.equal((await readMarketInstallStatus(h.api,h.values[MARKET_INTENTS_STORE].intents[1])).installation,'unknown');
  assert.ok(h.writes.slice(count).every(rows=>!rows[SIDEBAR_TOOL_STORE]&&!rows[MARKET_OPERATIONS_STORE]));
});
test('consumption binds a fresh trusted review SHA durably before any installer transaction',async()=>{
  const h=harness(),row=await seed(h);delete row.pageReview;
  const sha256=await sidebarToolPackageHash(tool);await claim(h,row,sha256);
  assert.equal(h.values[MARKET_INTENTS_STORE].intents[0].sha256,sha256);
  assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);
  await assert.rejects(claim(h,row,sha256),{code:'E_INTENT_CONSUMED'});
});
test('consumption rejects a replacement SHA for an already fixed intent identity',async()=>{
  const h=harness(),row=await seed(h);row.sha256=row.pageReview.sha256;delete row.pageReview;
  await assert.rejects(claim(h,row,'0'.repeat(64)),{code:'E_PACKAGE_IDENTITY'});
  assert.equal(h.values[MARKET_INTENTS_STORE].intents[0].consumedAt,null);assert.deepEqual(h.writes,[]);
});
