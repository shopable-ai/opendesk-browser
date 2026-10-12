// COMPONENT evidence only. Mock sender/storage faults never count as native Chrome acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {resolveMarketChannel,marketExternalConnectable,marketOrigin} from '../../scripts/market-channel.mjs';
import {createMarketHandoff,validateMarketSender} from '../../src/marketplace/external.js';
import {MARKET_INTENT_PROTOCOL as protocol,MARKET_INTENTS_STORE,MARKET_INTENT_TTL,
  validateMarketMessage,readMarketIntentStore,loadReviewIntent,consumeReviewIntent,settleReviewIntent,closeUnjournaledReview} from '../../src/marketplace/intent.js';
import {MARKET_OPERATIONS_STORE,installReviewedSidebarTool} from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_STORE,serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {MARKET_BATCH_STORE} from '../../src/marketplace/batch.js';
import {mergeMarketReleases,loadMarketSnapshots} from '../../scripts/market-release-snapshots.mjs';
import {buildMarketSite} from '../../scripts/build-market-site.mjs';
import {OFFICIAL_COLLECTIONS} from '../../src/marketplace/catalog.js';
import {officialFixtures} from '../helpers/official-tools.mjs';

const source=JSON.parse(await readFile('src/marketplace/channel-config.json','utf8'));
const channel=resolveMarketChannel({mode:'development',env:{},source,unpackedPath:'/tmp/r5-component-extension'});
const app={kind:'app',marketId:'opendesk/markdown-workbench',version:'1.0.1'};
const message=(subject=app,intentId=randomUUID())=>({protocol,action:'OPEN_INSTALL_REVIEW',intentId,subject});
const probe={protocol,action:'PROBE'};
const shuffled=value=>Array.isArray(value)?value.map(shuffled):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().reverse().map(k=>[k,shuffled(value[k])])):value;
function harness(){
  const values={},writes=[],tabs=new Map(),updates=[],locks=new Map();let time=1000000,created=0;
  const sender={url:channel.origin+'/install/',origin:channel.origin,frameId:0,
    documentId:randomUUID(),documentLifecycle:'active',tab:{id:1,incognito:false}};
  tabs.set(1,{id:1,windowId:1,url:sender.url,incognito:false});
  const api={runtime:{id:channel.extensionId,getURL:p=>'chrome-extension://'+channel.extensionId+'/'+p},
    storage:{local:{async get(keys){return Object.fromEntries((typeof keys==='string'?[keys]:keys).map(k=>[k,shuffled(structuredClone(values[k]))]));},
      async set(rows){writes.push(Object.keys(rows));Object.assign(values,structuredClone(rows));}}},
    tabs:{async get(id){return structuredClone(tabs.get(id));},async query(){return [...tabs.values()].map(row=>structuredClone(row));},
      async create(row){const tab={...row,id:100+created++,windowId:1};tabs.set(tab.id,tab);return tab;},
      async update(id,row){updates.push({id,...row});return Object.assign(tabs.get(id),row);}},
    windows:{async update(){}},webNavigation:{async getFrame({documentId}){return {documentId,parentFrameId:-1,documentLifecycle:'active',url:sender.url};}}};
  const lockManager={request(name,options,fn){
    fn??=options;
    if(options?.ifAvailable&&locks.has(name))return Promise.resolve(fn(null));
    const next=(locks.get(name)||Promise.resolve()).then(()=>fn({name}));
    const queued=next.catch(()=>{});locks.set(name,queued);
    void queued.finally(()=>{if(locks.get(name)===queued)locks.delete(name);});return next;
  }};
  const host=()=>createMarketHandoff({api,channel,lockManager,now:()=>time});
  return {api,values,writes,tabs,updates,sender,lockManager,host,time:v=>time=v,now:()=>time};
}
const open=async h=>{const request=message();await h.host().handle(request,h.sender);return {request,row:h.values[MARKET_INTENTS_STORE].intents[0]};};
test('R5 production trust is disabled until all reviewed inputs exist; development cannot leak into it',()=>{
  const prod=resolveMarketChannel({mode:'production',source,env:{OPENDESK_MARKET_DEV_ORIGIN:'http://127.0.0.1:9999',OPENDESK_MARKET_DEV_EXTENSION_ID:'a'.repeat(32)}});
  assert.equal(prod.enabled,false);assert.equal(prod.origin,null);assert.equal(prod.extensionId,null);
  assert.equal(marketExternalConnectable(prod),undefined);
  assert.deepEqual(marketExternalConnectable(channel),{matches:['http://127.0.0.1:43132/*']});
  const production={...source,production:{origin:'https://market.opendesk.io',extensionId:'a'.repeat(32),
    acquireUrl:'https://chromewebstore.google.com/detail/opendesk/'+ 'a'.repeat(32),verifiedAt:'2026-10-12'}};
  // Synthetic policy input, not a claim this is a verified official domain/listing.
  assert.deepEqual(marketExternalConnectable(resolveMarketChannel({source:production,env:{}})),{matches:['https://market.opendesk.io:443/*']});
  for(const origin of ['http://127.0.0.1:43132','https://localhost','https://market.example.com','https://127.0.0.1','https://x.test','https://market.opendesk.io:444','https://market.opendesk.io/path'])
    assert.throws(()=>resolveMarketChannel({source:{...production,production:{...production.production,origin}},env:{}}));
  assert.throws(()=>resolveMarketChannel({source:{...source,production:{...source.production,origin:production.production.origin}},env:{}}));
  assert.throws(()=>resolveMarketChannel({source:{...source,arbitrary:true},env:{}}));
  for(const value of ['http://localhost:43132','http://0.0.0.0:43132','http://127.0.0.1:43132/a','https://127.0.0.1:43132'])assert.throws(()=>marketOrigin(value,'development'));
});
test('R5 finite messages reject code, URLs, approval flags, protocol drift and unbounded fields',()=>{
  assert.deepEqual(validateMarketMessage(probe),probe);
  for(const request of [null,{}, {...probe,protocol:'v2'},{...probe,installed:true},
    {...message(),url:'https://untrusted.invalid/tool.json'},{...message(),permissionApproved:true},
    {...message(),intentId:'x'.repeat(10000)},message({...app,js:'run()'}),message({...app,version:'01.0.1'}),
    message({...app,marketId:'opendesk/'+ 'x'.repeat(10000)}),message({kind:'collection',collectionId:'reading-kit',revision:1.1})])
    assert.throws(()=>validateMarketMessage(request),error=>['E_PROTOCOL','E_INTENT_FIELDS'].includes(error.code));
});
test('R5 validates browser sender, live top document and exact port before any handoff mutation',async()=>{
  const h=harness();await validateMarketSender(h.api,h.sender,channel);
  for(const bad of [{...h.sender,origin:'https://untrusted.invalid'},{...h.sender,url:'http://127.0.0.1:43133/'},
    {...h.sender,frameId:1},{...h.sender,documentId:undefined},{...h.sender,documentLifecycle:'prerender'},
    {...h.sender,id:'a'.repeat(32)},{...h.sender,tab:{id:1,incognito:true}}])
    await assert.rejects(h.host().handle(message(),bad));
  h.tabs.get(1).pendingUrl='https://untrusted.invalid/';
  await assert.rejects(h.host().handle(message(),h.sender),{code:'E_DOCUMENT'});
  delete h.tabs.get(1).pendingUrl;h.api.webNavigation.getFrame=async()=>({...h.sender,parentFrameId:0});
  await assert.rejects(h.host().handle(message(),h.sender),{code:'E_DOCUMENT'});
  assert.deepEqual(h.writes,[]);
});
test('R5 probe exposes no installed information; same intent resumes exact review after worker replacement',async()=>{
  const h=harness(),host=h.host();h.values[SIDEBAR_TOOL_STORE]=[{id:'private-not-for-website'}];
  assert.deepEqual(await host.handle(probe,h.sender),{ok:true,protocol,status:'CONNECTED'});
  const request=message();const result=await host.handle(request,h.sender);
  assert.deepEqual(result,{ok:true,protocol,status:'REVIEW_OPENED',intentId:request.intentId});
  const row=structuredClone(h.values[MARKET_INTENTS_STORE].intents[0]);
  await h.host().handle(request,h.sender);
  assert.equal(h.tabs.size,2);assert.equal(h.values[MARKET_INTENTS_STORE].intents[0].reviewId,row.reviewId);
  assert.equal(h.values[MARKET_INTENTS_STORE].intents[0].operationId,row.operationId);
  assert(!h.updates.some(update=>Object.hasOwn(update,'url')),'resuming a tab must never replace its candidate URL');
  await assert.rejects(host.handle({...request,subject:{...app,version:'1.0.0'}},h.sender),{code:'E_INTENT_CONFLICT'});
  await host.handle(message({kind:'app',marketId:'opendesk/time-review',version:'1.3.0'}),h.sender);
  assert.equal(h.tabs.size,3);assert.equal(h.tabs.get(row.tabId).url,h.api.runtime.getURL('ui/marketplace.html')+'?intent='+row.reviewId);
  assert(h.writes.every(keys=>keys.length===1&&keys[0]===MARKET_INTENTS_STORE));
});
test('R5 prepared/opened persistence and committed-tab acknowledgement faults reconcile without duplicate pages',async()=>{
  for(const point of ['prepare-before','prepare-after','create-after','opened-after']){
    const h=harness(),set=h.api.storage.local.set,create=h.api.tabs.create;let count=0,fired=false;
    h.api.storage.local.set=async rows=>{
      count++;
      if(!fired&&point==='prepare-before'&&count===1){fired=true;throw Error('component write refused');}
      await set(rows);
      if(!fired&&((point==='prepare-after'&&count===1)||(point==='opened-after'&&count===2))){fired=true;throw Error('component acknowledgement lost');}
    };
    h.api.tabs.create=async row=>{const tab=await create(row);if(!fired&&point==='create-after'){fired=true;throw Error('component create acknowledgement lost');}return tab;};
    const request=message();await assert.rejects(h.host().handle(request,h.sender),{code:'E_HANDOFF_UNKNOWN'});
    const previous=h.values[MARKET_INTENTS_STORE]?.intents[0];
    await h.host().handle(request,h.sender);
    assert.equal(h.tabs.size,2,point);assert.equal(h.values[MARKET_INTENTS_STORE].intents.length,1);
    if(previous)assert.equal(h.values[MARKET_INTENTS_STORE].intents[0].operationId,previous.operationId);
  }
});
test('R5 queue, global/origin rate and capacity are bounded across tabs and worker restarts',async()=>{
  const h=harness(),host=h.host();let release;
  h.api.webNavigation.getFrame=()=>new Promise(resolve=>{release=()=>resolve({...h.sender,parentFrameId:-1});});
  const waiting=host.handle(probe,h.sender);await new Promise(resolve=>setImmediate(resolve));
  const queued=Array.from({length:15},()=>host.handle(probe,h.sender));
  await assert.rejects(host.handle(probe,h.sender),{code:'E_RATE_LIMIT'});
  h.api.webNavigation.getFrame=async()=>({...h.sender,parentFrameId:-1});release();await Promise.all([waiting,...queued]);
  for(let i=16;i<60;i++)await h.host().handle(probe,h.sender);
  await assert.rejects(h.host().handle(probe,h.sender),{code:'E_RATE_LIMIT'});
  const g=harness();g.values[MARKET_INTENTS_STORE]={schema:MARKET_INTENTS_STORE,intents:[],requests:Array.from({length:120},(_,i)=>({origin:'https://origin'+i+'.invalid',at:g.now()}))};
  await assert.rejects(g.host().handle(probe,g.sender),{code:'E_RATE_LIMIT'});
  const c=harness();const {row}=await open(c);
  c.values[MARKET_INTENTS_STORE].intents=Array.from({length:64},()=>({...row,intentId:randomUUID(),reviewId:randomUUID(),operationId:randomUUID()}));
  await assert.rejects(c.host().handle(message(),c.sender),{code:'E_INTENT_CAPACITY'});
  const n=harness();for(let i=0;i<6;i++)await n.host().handle(message(),n.sender);
  await assert.rejects(n.host().handle(message(),n.sender),{code:'E_RATE_LIMIT'});
});
test('R5 expiry protects only the original unresolved operation/batch, without deleting installer journals',async()=>{
  const h=harness(),{row}=await open(h);h.time(h.now()+MARKET_INTENT_TTL+1);
  await assert.rejects(loadReviewIntent(h.api,row.reviewId,h.now()),{code:'E_INTENT_EXPIRED'});
  h.values[MARKET_OPERATIONS_STORE]={[row.operationId]:{state:'outcome-unknown'}};
  assert.equal((await loadReviewIntent(h.api,row.reviewId,h.now())).recoveryOnly,true);
  await h.host().handle(probe,h.sender);assert.equal(h.values[MARKET_INTENTS_STORE].intents.length,1);
  delete h.values[MARKET_OPERATIONS_STORE];
  h.values[MARKET_BATCH_STORE]={batchId:randomUUID(),collectionId:'reading-kit',revision:2,updatedAt:h.now(),
    items:[{id:app.marketId,version:app.version,operationId:randomUUID(),status:'outcome-unknown',reason:'component interrupted'}]};
  const original=structuredClone(h.values[MARKET_BATCH_STORE]);
  await h.host().handle(probe,h.sender);assert.equal(h.values[MARKET_INTENTS_STORE].intents.length,0);
  assert.deepEqual(h.values[MARKET_BATCH_STORE],original,'unrelated batch journal is never deleted by intent cleanup');
});
test('R5 consumed handoff cannot replay when terminal installer or batch history is gone',async()=>{
  for(const subject of [app,{kind:'collection',collectionId:'reading-kit',revision:2}]){
    const h=harness(),request=message(subject);await h.host().handle(request,h.sender);
    const row=h.values[MARKET_INTENTS_STORE].intents[0];
    const claim=()=>consumeReviewIntent({api:h.api,lockManager:h.lockManager,reviewId:row.reviewId,operationId:row.operationId,subject,now:h.now()});
    await claim();delete h.values[MARKET_OPERATIONS_STORE];delete h.values[MARKET_BATCH_STORE];
    await assert.rejects(claim(),{code:'E_INTENT_CONSUMED'});
    await h.host().handle(request,h.sender);
    assert.equal((await loadReviewIntent(h.api,row.reviewId,h.now())).consumedAt,h.now());
    assert.equal(h.tabs.size,2);assert.equal(h.values[MARKET_INTENTS_STORE].intents[0].operationId,row.operationId);
  }
});
test('R5 shared consumption and external requests do not overwrite each other; expired approval is refused',async()=>{
  const h=harness(),{request,row}=await open(h);
  await Promise.all([h.host().handle(request,h.sender),consumeReviewIntent({api:h.api,lockManager:h.lockManager,
    reviewId:row.reviewId,operationId:row.operationId,subject:app,now:h.now()})]);
  assert.equal(h.values[MARKET_INTENTS_STORE].intents[0].consumedAt,h.now());
  const x=harness(),opened=await open(x);x.time(x.now()+MARKET_INTENT_TTL);
  await assert.rejects(consumeReviewIntent({api:x.api,lockManager:x.lockManager,reviewId:opened.row.reviewId,
    operationId:opened.row.operationId,subject:app,now:x.now()}),{code:'E_INTENT_EXPIRED'});
  assert.throws(()=>readMarketIntentStore({...h.values[MARKET_INTENTS_STORE],grants:['all']}),{code:'E_INTENT_STORAGE'});
});
test('R5 existing installer checks baseline and hash before consuming a handoff; consumption failure cannot install',async()=>{
  const fixtures=await officialFixtures(),release=fixtures.catalog.apps.find(r=>r.toolId==='markdown-workbench');
  const candidate=JSON.parse(fixtures.resources.get(release.packagePath));
  const h=harness();let consumed=0;
  const opts={api:h.api,lockManager:h.lockManager,candidate,reviewApproved:true,market:{marketId:release.id,sha256:release.sha256,operationId:randomUUID()},commitIntent:async()=>{consumed++;}};
  h.values[SIDEBAR_TOOL_STORE]=[candidate];
  await assert.rejects(installReviewedSidebarTool({...opts,baseline:null}),{code:'E_TOOL_CHANGED'});assert.equal(consumed,0);
  h.values[SIDEBAR_TOOL_STORE]=[];
  await assert.rejects(installReviewedSidebarTool({...opts,market:{...opts.market,sha256:'0'.repeat(64)}}),{code:'E_MARKET_IDENTITY'});assert.equal(consumed,0);
  await assert.rejects(installReviewedSidebarTool({...opts,commitIntent:async()=>{throw Object.assign(Error('already consumed'),{code:'E_INTENT_CONSUMED'});}}),{code:'E_INTENT_CONSUMED'});
  assert.deepEqual(h.values[SIDEBAR_TOOL_STORE],[]);assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);
  await installReviewedSidebarTool(opts);assert.equal(consumed,1);assert.equal(h.values[SIDEBAR_TOOL_STORE][0].id,candidate.id);
  assert.equal(createHash('sha256').update(serializeSidebarToolPackage(candidate)).digest('hex'),release.sha256);
});
test('R5 consumed-without-journal survives TTL, and explicit locked recovery ends only the handoff',async()=>{
  for(const subject of [app,{kind:'collection',collectionId:'reading-kit',revision:2}]){
    const h=harness();await h.host().handle(message(subject),h.sender);const row=h.values[MARKET_INTENTS_STORE].intents[0];
    const opts={api:h.api,lockManager:h.lockManager,reviewId:row.reviewId,operationId:row.operationId,subject};
    await consumeReviewIntent({...opts,now:h.now()});h.time(h.now()+MARKET_INTENT_TTL+1);
    await h.host().handle(probe,h.sender);
    assert.equal((await loadReviewIntent(h.api,row.reviewId,h.now())).recoveryOnly,true);
    await assert.rejects(h.host().handle(message(subject),h.sender),{code:'E_REVIEW_PENDING'});
    await assert.rejects(closeUnjournaledReview(opts),{code:'E_REVIEW_REQUIRED'});
    const closed=await closeUnjournaledReview({...opts,approved:true});
    assert.equal(closed.outcome,'UNKNOWN_WITHOUT_JOURNAL');assert.deepEqual(closed.observed,[]);
    assert.equal(closed.handoff.consumedAt,row.createdAt);assert.equal(closed.handoff.closureReason,'unknown-without-journal');
    assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);assert.equal(h.values[MARKET_BATCH_STORE],undefined);
    await h.host().handle(message(subject),h.sender);
    assert.equal(h.values[MARKET_INTENTS_STORE].intents.length,1,'expired closed handoff can be cleaned; new approval has a new identity');
    assert.notEqual(h.values[MARKET_INTENTS_STORE].intents[0].operationId,row.operationId);
  }
});
test('R5 a lost consumption acknowledgement stops before installer writes, and two consumers never both succeed',async()=>{
  const fixtures=await officialFixtures(),release=fixtures.catalog.apps.find(row=>row.toolId==='markdown-workbench'),candidate=JSON.parse(fixtures.resources.get(release.packagePath));
  const h=harness(),{row}=await open(h),opts={api:h.api,lockManager:h.lockManager,reviewId:row.reviewId,operationId:row.operationId,subject:app,now:h.now()};
  const set=h.api.storage.local.set;let faulted=false;
  h.api.storage.local.set=async value=>{await set(value);if(!faulted&&value[MARKET_INTENTS_STORE]?.intents[0]?.consumedAt!==null){faulted=true;throw Error('component consumption acknowledgement lost');}};
  await assert.rejects(installReviewedSidebarTool({api:h.api,lockManager:h.lockManager,candidate,reviewApproved:true,
    market:{marketId:release.id,sha256:release.sha256,operationId:row.operationId},commitIntent:()=>consumeReviewIntent(opts)}),{code:'E_HANDOFF_UNKNOWN'});
  assert.equal(h.values[SIDEBAR_TOOL_STORE],undefined);assert.equal(h.values[MARKET_OPERATIONS_STORE],undefined);
  await assert.rejects(consumeReviewIntent(opts),{code:'E_INTENT_CONSUMED'});
  const k=harness(),opened=await open(k),claim=()=>consumeReviewIntent({api:k.api,lockManager:k.lockManager,reviewId:opened.row.reviewId,operationId:opened.row.operationId,subject:app,now:k.now()});
  const pair=await Promise.allSettled([claim(),claim()]);assert.equal(pair.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(pair.find(row=>row.status==='rejected').reason.code,'E_INTENT_CONSUMED');
});
test('R5 terminal settlement survives journal trimming and missing recovery respects existing locks',async()=>{
  const h=harness(),{row}=await open(h),opts={api:h.api,lockManager:h.lockManager,reviewId:row.reviewId,operationId:row.operationId,subject:app};
  await consumeReviewIntent({...opts,now:h.now()});h.values[MARKET_OPERATIONS_STORE]={[row.operationId]:{marketId:app.marketId,version:app.version,state:'succeeded'}};
  await assert.rejects(closeUnjournaledReview({...opts,approved:true}),{code:'E_INTENT_HAS_JOURNAL'});
  await settleReviewIntent(opts);delete h.values[MARKET_OPERATIONS_STORE];
  await assert.rejects(consumeReviewIntent({...opts,now:h.now()}),{code:'E_INTENT_CONSUMED'});
  assert.equal(h.values[MARKET_INTENTS_STORE].intents[0].closureReason,'journal-terminal');
  h.time(h.now()+MARKET_INTENT_TTL+1);await h.host().handle(probe,h.sender);assert.equal(h.values[MARKET_INTENTS_STORE].intents.length,0);
  const k=harness(),other=await open(k),candidate={api:k.api,lockManager:k.lockManager,reviewId:other.row.reviewId,operationId:other.row.operationId,subject:app};
  await consumeReviewIntent({...candidate,now:k.now()});let release,finished=false;
  const holding=k.lockManager.request('opendesk.sidebar-tools:tool:markdown-workbench',()=>new Promise(resolve=>{release=resolve;}));
  await new Promise(resolve=>setImmediate(resolve));
  const closing=closeUnjournaledReview({...candidate,approved:true}).then(result=>{finished=true;return result;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);assert.equal(k.values[MARKET_INTENTS_STORE].intents[0].settledAt,null);
  release();await holding;await closing;assert.equal(finished,true);
});
test('R5 immutable archive conflicts reject same-version bytes and same-revision replacement',async()=>{
  const fixtures=await officialFixtures(),snapshots=await loadMarketSnapshots();
  const merged=mergeMarketReleases(snapshots,fixtures.catalog,OFFICIAL_COLLECTIONS);
  assert.equal(merged.releases.length,11);assert.equal(merged.collections.length,2);
  const changed=structuredClone(fixtures.catalog);changed.apps[0].sha256='0'.repeat(64);
  assert.throws(()=>mergeMarketReleases(snapshots,changed,OFFICIAL_COLLECTIONS),/Immutable release conflict/);
  const sets=structuredClone(OFFICIAL_COLLECTIONS);sets.find(r=>r.revision===1).members[0].version='9.0.0';
  assert.throws(()=>mergeMarketReleases(snapshots,fixtures.catalog,sets),/Immutable collection conflict/);
});
test('R5 independent website build is reproducible, self-contained and replaces only generated output',async()=>{
  const tmp=await mkdtemp(join(tmpdir(),'opendesk-r5-site-test-')),dest=join(tmp,'site');
  try{
    const env={OPENDESK_MARKET_SITE_OUTPUT:dest,OPENDESK_MARKET_BUILD_MODE:'development'};
    const first=await buildMarketSite({env});await writeFile(join(dest,'stale-file.txt'),'old');
    const second=await buildMarketSite({env});assert.equal(first.buildId,second.buildId);
    await assert.rejects(access(join(dest,'stale-file.txt')));
    for(const route of ['index.html','apps/opendesk/markdown-workbench/versions/1.0.1/index.html','collections/reading-kit/revisions/1/index.html','how-to-install/index.html','404.html'])
      assert.match(await readFile(join(dest,route),'utf8'),/<title>[^<]+<\/title>/);
    const fixed=await readFile(join(dest,'apps/opendesk/quick-notes/versions/1.1.1/index.html'),'utf8');
    assert.match(fixed,/canonical/);assert.match(fixed,/1\.1\.1/);
    const manifest=JSON.parse(await readFile(join(dest,'site-build.json'),'utf8'));
    assert(!manifest.files.some(row=>row.path.endsWith('.opendesk-tool.json')));
    await assert.rejects(buildMarketSite({env:{...env,OPENDESK_MARKET_SITE_OUTPUT:'src'}}),/may not replace/);
  }finally{await rm(tmp,{recursive:true,force:true});}
});
