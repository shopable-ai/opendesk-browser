import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {installReviewedSidebarTool,recoverMarketOperation,reconcileMarketOperation,
  MARKET_OPERATIONS_STORE,MARKET_PROVENANCE_STORE,TOOL_REVOCATION_EPOCHS_STORE}
  from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,sidebarToolStorageKey}
  from '../../src/ui/sidebar-tools/package.js';
import {BROWSER_MENU_GRANTS_STORE} from '../../src/framework/sdk/browser-contract.js';
import {CLIP_SITE_STORE,clipGrantAllowed} from '../../projects/web-markdown-clipper/trusted/policy.js';
import {ADBLOCK_STORE} from '../../projects/adblock/trusted/policy.js';
import {READING_TOC_SITE_STORE,READING_TOC_PAGE_RULES_STORE,tocSiteAllowed,readingTocPageAllowed}
  from '../../projects/reading-toc/trusted/policy.js';

// Independent Installer boundary tests. Chrome storage, locks and the publisher
// verifier are explicitly in-memory adapters: this is not native Chrome evidence.
const source={sourceId:'opendesk-official',kind:'sidebar-tool',channel:'stable',
  origin:'https://market.example.org'};
const tool=version=>({format:'opendesk.sidebar-tool.v1',id:'market-security-fixture',version,
  title:'Market security fixture',description:'Independent update transaction check',
  capabilities:['storage.local'],html:'<main>Fixture</main>',css:'',js:'void 0;'});
const snapshot=value=>structuredClone(value);
const fail=(code)=>Object.assign(new Error(code),{code});
async function fixture({legacy=false,missing=false,cookies=false,id=null,capabilities=null}={}){
  const before=tool('1.0.0'),candidate=tool('1.0.1');
  for(const row of [before,candidate]){
    if(id)row.id=id;
    if(capabilities)row.capabilities=[...capabilities];
  }
  if(cookies)for(const row of [before,candidate])Object.assign(row,{
    format:'opendesk.sidebar-tool.v2',capabilities:['storage.local','browser.cookies.read'],
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}});
  const sha256=await sidebarToolPackageHash(candidate),oldHash=await sidebarToolPackageHash(before);
  const marketId='opendesk/'+candidate.id,operationId=randomUUID();
  const prior={marketId,version:before.version,sha256:oldHash,...(legacy?{}:source)};
  const dataKey=sidebarToolStorageKey(before.id);
  const values={[SIDEBAR_TOOL_STORE]:[snapshot(before)],
    [MARKET_PROVENANCE_STORE]:missing?{}:{[before.id]:prior},
    [TOOL_REVOCATION_EPOCHS_STORE]:{[before.id]:'old-install-epoch'},
    [MARKET_OPERATIONS_STORE]:{},[dataKey]:{sentinel:'user data before update'}};
  const writes=[],checks=[],held=[];
  const h={before,candidate,marketId,oldHash,sha256,operationId,prior,values,writes,checks,held,dataKey};
  h.api={runtime:{id:'a'.repeat(32),sendMessage:async()=>{throw fail('E_UNEXPECTED_NETWORK');}},
    storage:{local:{
      async get(keys){return keys===null?snapshot(values):Object.fromEntries(
        (typeof keys==='string'?[keys]:keys).map(key=>[key,snapshot(values[key])]));},
      async set(next){
        if(h.rejectRegistry&&Object.hasOwn(next,SIDEBAR_TOOL_STORE))throw new Error('injected registry rejection');
        if(h.failProvenanceOnce&&next[MARKET_PROVENANCE_STORE]?.[before.id]?.version===candidate.version){
          h.failProvenanceOnce=false;throw new Error('injected metadata write failure');
        }
        writes.push(snapshot(next));Object.assign(values,snapshot(next));
        h.afterSet?.(snapshot(next));
      },
      async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete values[key];}
    }}};
  h.lockManager={async request(name,options,callback){
    const run=typeof options==='function'?options:callback;
    if(h.beforeLock)await h.beforeLock(name);
    held.push(name);try{return await run();}finally{held.pop();}
  }};
  h.market={marketId,sha256,operationId,...source};
  h.verify=async(received,identity)=>{
    assert.equal(await sidebarToolPackageHash(received),sha256);
    assert.equal(identity.marketId,marketId);assert.equal(identity.sha256,sha256);
    checks.push({locked:held.some(name=>name.endsWith(':catalog')),identity:snapshot(identity)});
    if(h.rejectVerification?.())throw fail('E_UPDATE_WITHDRAWN');
    // This file tests Installer/source lifecycle boundaries. The real signed
    // snapshot fence is exercised by the independent discovery race tests.
    return {assertCurrent:async()=>{}};
  };
  h.install=extra=>installReviewedSidebarTool({api:h.api,lockManager:h.lockManager,
    candidate,baseline:before,baselineInstallEpoch:'old-install-epoch',reviewApproved:true,
    market:h.market,verifyMarketCandidate:h.verify,...extra});
  return h;
}

test('online update uses original Installer and reads back complete source, digest and retained data',async()=>{
  const h=await fixture();
  const result=await h.install();
  assert.equal(result.state,'installed');
  assert.deepEqual(h.values[SIDEBAR_TOOL_STORE],[h.candidate]);
  assert.deepEqual(h.values[MARKET_PROVENANCE_STORE][h.candidate.id],
    {marketId:h.marketId,version:h.candidate.version,sha256:h.sha256,...source});
  const journal=h.values[MARKET_OPERATIONS_STORE][h.operationId];
  for(const [key,value] of Object.entries(source))assert.equal(journal[key],value);
  assert.equal(journal.state,'succeeded');
  assert.deepEqual(h.values[h.dataKey],{sentinel:'user data before update'});
  assert.ok(h.checks.some(check=>!check.locked),'verification runs before lock wait');
  assert.ok(h.checks.some(check=>check.locked),'verification reruns after installation locks');
});

for(const mode of ['missing','legacy','foreign-origin'])
test('same marketId does not prove online source: '+mode+' requires explicit migration review',async()=>{
  const h=await fixture({missing:mode==='missing',legacy:mode==='legacy'});
  if(mode==='foreign-origin')h.values[MARKET_PROVENANCE_STORE][h.before.id].origin='https://previous.example.org';
  const original=snapshot(h.values);
  await assert.rejects(h.install(),{code:'E_PUBLISHER_CONFLICT'});
  assert.deepEqual(h.values,original);
  let reviews=0;
  const cancelled=await h.install({approveSourceChange:()=>{reviews++;return false;}});
  assert.equal(cancelled.state,'cancelled');assert.equal(reviews,1);
  assert.deepEqual(h.values,original);
  const accepted=await h.install({approveSourceChange:()=>{reviews++;return true;}});
  assert.equal(accepted.state,'installed');assert.equal(reviews,2);
  assert.equal(h.values[MARKET_PROVENANCE_STORE][h.before.id].origin,source.origin);
  assert.deepEqual(h.values[h.dataKey],original[h.dataKey]);
});

for(const mode of ['missing','legacy','foreign-origin','foreign-marketId'])
test('same bytes cannot silently acquire or replace an online source: '+mode,async()=>{
  const h=await fixture({missing:mode==='missing',legacy:mode==='legacy'});
  h.values[SIDEBAR_TOOL_STORE]=[snapshot(h.candidate)];
  if(!mode.startsWith('missing'))Object.assign(h.values[MARKET_PROVENANCE_STORE][h.before.id],
    {version:h.candidate.version,sha256:h.sha256},
    mode==='foreign-origin'?{origin:'https://previous.example.org'}:{});
  if(mode==='foreign-marketId')h.values[MARKET_PROVENANCE_STORE][h.before.id].marketId='opendesk/foreign-fixture';
  const original=snapshot(h.values);
  await assert.rejects(h.install({baseline:h.candidate,approveSourceChange:()=>true}),{code:'E_PUBLISHER_CONFLICT'});
  assert.deepEqual(h.values,original);
});

test('fresh verification after waiting for the original lock rejects a newly withdrawn release without writes',async()=>{
  const h=await fixture();let withdrawn=false;
  h.beforeLock=async name=>{if(name.endsWith(':catalog'))withdrawn=true;};
  h.rejectVerification=()=>withdrawn;
  const original=snapshot(h.values);
  await assert.rejects(h.install(),{code:'E_UPDATE_WITHDRAWN'});
  assert.deepEqual(h.values,original);assert.deepEqual(h.writes,[]);
});

test('fresh verification also follows asynchronous update approval before the commit boundary',async()=>{
  const h=await fixture();let withdrawn=false;
  h.rejectVerification=()=>withdrawn;
  const original=snapshot(h.values);
  await assert.rejects(h.install({approveUpdate:async()=>{withdrawn=true;return true;}}),
    {code:'E_UPDATE_WITHDRAWN'});
  assert.deepEqual(h.values,original);assert.deepEqual(h.writes,[]);
});

test('a provenance-only change while waiting for locks invalidates the reviewed installation identity',async()=>{
  const h=await fixture(),baselineProvenance=snapshot(h.prior);
  h.beforeLock=async name=>{if(name.endsWith(':catalog'))
    h.values[MARKET_PROVENANCE_STORE][h.before.id].origin='https://changed.example.org';};
  await assert.rejects(h.install({baselineProvenance,approveSourceChange:()=>true}),{code:'E_TOOL_CHANGED'});
  assert.deepEqual(h.values[SIDEBAR_TOOL_STORE],[h.before]);
  assert.equal(h.values[MARKET_PROVENANCE_STORE][h.before.id].origin,'https://changed.example.org');
  assert.deepEqual(h.writes,[]);
});

test('provenance changes during the fresh verifier cannot cross the original commit boundary',async()=>{
  const h=await fixture(),verify=h.verify;
  h.verify=async(...args)=>{
    const receipt=await verify(...args);
    if(h.held.some(name=>name.endsWith(':catalog')))
      h.values[MARKET_PROVENANCE_STORE][h.before.id].origin='https://changed.example.org';
    return receipt;
  };
  await assert.rejects(h.install({baselineProvenance:snapshot(h.prior),approveSourceChange:()=>true}),
    {code:'E_TOOL_CHANGED'});
  assert.deepEqual(h.values[SIDEBAR_TOOL_STORE],[h.before]);assert.deepEqual(h.writes,[]);
});

test('same-byte readback also rejects provenance drift during fresh verification',async()=>{
  const h=await fixture(),verify=h.verify;
  h.values[SIDEBAR_TOOL_STORE]=[snapshot(h.candidate)];
  Object.assign(h.values[MARKET_PROVENANCE_STORE][h.before.id],
    {version:h.candidate.version,sha256:h.sha256});
  const baselineProvenance=snapshot(h.values[MARKET_PROVENANCE_STORE][h.before.id]);
  h.verify=async(...args)=>{
    const receipt=await verify(...args);
    if(h.held.some(name=>name.endsWith(':catalog')))
      h.values[MARKET_PROVENANCE_STORE][h.before.id].origin='https://changed.example.org';
    return receipt;
  };
  await assert.rejects(h.install({baseline:h.candidate,baselineProvenance}),{code:'E_TOOL_CHANGED'});
  assert.equal(h.values[MARKET_PROVENANCE_STORE][h.before.id].origin,'https://changed.example.org');
  assert.deepEqual(h.writes,[]);
});

for(const next of ['online','legacy','local'])
test('an unresolved online transaction blocks a new '+next+' operation for the same tool',async()=>{
  const h=await fixture(),priorId=randomUUID();
  h.values[MARKET_OPERATIONS_STORE][priorId]={...h.market,toolId:h.before.id,
    version:h.candidate.version,state:'outcome-unknown',updatedAt:Date.now()};
  delete h.values[MARKET_OPERATIONS_STORE][priorId].operationId;
  const market=next==='online'?h.market:next==='legacy'?
    {marketId:h.marketId,sha256:h.sha256,operationId:h.operationId}:null;
  const original=snapshot(h.values);
  await assert.rejects(h.install({market,approveSourceChange:()=>true}),error=>{
    assert.equal(error.code,'E_OUTCOME_UNKNOWN');
    assert.equal(error.marketOperation.operationId,priorId);
    assert.notEqual(error.marketOperation.operationId,h.operationId);
    assert.equal(error.marketOperation.version,h.candidate.version);
    for(const [key,value] of Object.entries(source))assert.equal(error.marketOperation[key],value);
    return true;
  });
  assert.deepEqual(h.values,original);assert.deepEqual(h.writes,[]);
});

test('online install fails closed on a malformed operation ledger instead of treating it as empty',async()=>{
  const h=await fixture();h.values[MARKET_OPERATIONS_STORE]=[];
  const original=snapshot(h.values);
  await assert.rejects(h.install(),error=>['E_STORAGE_CORRUPT','E_OUTCOME_UNKNOWN'].includes(error.code));
  assert.deepEqual(h.values,original);assert.deepEqual(h.writes,[]);
});

test('an online attempt reports the original legacy pending identity without inventing its source',async()=>{
  const h=await fixture(),priorId=randomUUID();
  h.values[MARKET_OPERATIONS_STORE][priorId]={toolId:h.before.id,marketId:h.marketId,
    version:h.before.version,sha256:h.oldHash,state:'outcome-unknown'};
  await assert.rejects(h.install(),error=>{
    assert.equal(error.code,'E_OUTCOME_UNKNOWN');
    assert.equal(error.marketOperation.operationId,priorId);
    assert.equal(error.marketOperation.version,h.before.version);
    assert.equal(error.marketOperation.sha256,h.oldHash);
    for(const key of Object.keys(source)){
      assert.equal(Object.hasOwn(error.marketOperation,key),true,'legacy absence is part of recovery identity');
      assert.equal(error.marketOperation[key],undefined);
    }
    return true;
  });
  assert.deepEqual(h.writes,[]);
});

test('unknown metadata commit recovers the original complete source offline without package replay',async()=>{
  const h=await fixture();h.failProvenanceOnce=true;
  await assert.rejects(h.install(),{code:'E_OUTCOME_UNKNOWN'});
  assert.deepEqual(h.values[SIDEBAR_TOOL_STORE],[h.candidate]);
  assert.equal(h.values[MARKET_OPERATIONS_STORE][h.operationId].state,'outcome-unknown');
  assert.equal((await reconcileMarketOperation(h.api,h.operationId)).state,'needs-finalization');
  const writesBefore=h.writes.length,checksBefore=h.checks.length;
  const recovered=await recoverMarketOperation({api:h.api,lockManager:h.lockManager,
    operationId:h.operationId,expectedIdentity:{toolId:h.before.id,...h.market,version:h.candidate.version}});
  assert.equal(recovered.state,'succeeded');
  assert.deepEqual(h.values[MARKET_PROVENANCE_STORE][h.before.id],
    {marketId:h.marketId,version:h.candidate.version,sha256:h.sha256,...source});
  assert.equal(h.checks.length,checksBefore,'recovery does not query release discovery');
  assert.ok(h.writes.slice(writesBefore).every(row=>!Object.hasOwn(row,SIDEBAR_TOOL_STORE)),
    'recovery never rewrites the installed package');
  assert.deepEqual(h.values[h.dataKey],{sentinel:'user data before update'});
});

test('recovery rejects a complete source changed while waiting for the original locks',async()=>{
  const h=await fixture();h.failProvenanceOnce=true;
  await assert.rejects(h.install(),{code:'E_OUTCOME_UNKNOWN'});
  h.beforeLock=async name=>{if(name.endsWith(':catalog'))
    h.values[MARKET_OPERATIONS_STORE][h.operationId].origin='https://foreign.example.org';};
  const beforeWrites=h.writes.length;
  await assert.rejects(recoverMarketOperation({api:h.api,lockManager:h.lockManager,operationId:h.operationId}),
    {code:'E_OUTCOME_UNKNOWN'});
  assert.equal(h.writes.length,beforeWrites);
});

test('source migration does not rebind the old Cookie grant to the new installation',async()=>{
  const h=await fixture({cookies:true,legacy:true});
  h.values[BROWSER_MENU_GRANTS_STORE]={[h.before.id]:{version:h.before.version,
    installEpoch:'old-install-epoch',packageHash:h.oldHash,cookieSites:['https://example.org'],cookieAllSites:false}};
  const oldGrant=snapshot(h.values[BROWSER_MENU_GRANTS_STORE][h.before.id]);
  await h.install({approveSourceChange:()=>true});
  const grant=h.values[BROWSER_MENU_GRANTS_STORE]?.[h.before.id];
  assert.ok(!grant||grant.installEpoch!==h.values[TOOL_REVOCATION_EPOCHS_STORE][h.before.id]);
  assert.ok(!grant||grant.version===oldGrant.version);
});

test('source migration preserves explicit site opt-outs under the current install-once contract',async()=>{
  const h=await fixture({legacy:true,capabilities:['storage.local','page.clip']});
  const settings={[h.before.id]:{mode:'all-except',blockedOrigins:['https://example.org']},
    'unrelated-tool':['https://untouched.example.org']};
  h.values[CLIP_SITE_STORE]=snapshot(settings);
  const commits=[];
  h.afterSet=next=>{
    if(!Object.hasOwn(next,SIDEBAR_TOOL_STORE))return;
    commits.push({allowed:clipGrantAllowed(h.values[SIDEBAR_TOOL_STORE],h.values[CLIP_SITE_STORE],
      h.before.id,'https://example.org/article',{}),settings:snapshot(h.values[CLIP_SITE_STORE])});
  };
  await h.install({approveSourceChange:()=>true});
  assert.equal(commits.length,1);assert.equal(commits[0].allowed,false);
  assert.deepEqual(commits[0].settings,settings);
  assert.deepEqual(h.values[CLIP_SITE_STORE],settings);
});

test('a rejected source migration preserves the old registry, data and site grants',async()=>{
  const h=await fixture({legacy:true,capabilities:['storage.local','page.clip']});
  const settings={[h.before.id]:{mode:'all-except',blockedOrigins:['https://example.org']}};
  h.values[CLIP_SITE_STORE]=snapshot(settings);h.rejectRegistry=true;
  await assert.rejects(h.install({approveSourceChange:()=>true}),{code:'E_HOST_STORAGE_WRITE'});
  assert.deepEqual(h.values[SIDEBAR_TOOL_STORE],[h.before]);
  assert.deepEqual(h.values[CLIP_SITE_STORE],settings);
  assert.deepEqual(h.values[h.dataKey],{sentinel:'user data before update'});
});

test('a source migration cannot reuse the AdBlock reviewed-policy transfer',async()=>{
  const h=await fixture({legacy:true,id:'adblock',capabilities:['adblock.control']});
  h.values[ADBLOCK_STORE]={version:1,enabled:true,exceptions:[],approvedHash:h.oldHash,
    approvedEpoch:'old-install-epoch'};
  h.api.permissions={contains:async()=>{throw fail('E_OLD_POLICY_MUST_NOT_TRANSFER');}};
  await h.install({approveSourceChange:()=>true});
  assert.equal(h.values[ADBLOCK_STORE].approvedEpoch,'old-install-epoch');
  assert.notEqual(h.values[ADBLOCK_STORE].approvedEpoch,h.values[TOOL_REVOCATION_EPOCHS_STORE].adblock);
});

test('source migration clears imported TOC positive scope atomically while preserving page denials',async()=>{
  const h=await fixture({legacy:true,capabilities:['storage.local','page.toc']});
  h.values[READING_TOC_SITE_STORE]={[h.before.id]:['https://example.org'],
    'unrelated-tool':['https://untouched.example.org']};
  const denied='https://example.org/private';
  h.values[READING_TOC_PAGE_RULES_STORE]={[h.before.id]:[denied]};
  const observations=[];
  h.afterSet=next=>{if(Object.hasOwn(next,SIDEBAR_TOOL_STORE))observations.push({
    site:tocSiteAllowed(h.values[READING_TOC_SITE_STORE],h.before.id,'https://example.org/article'),
    page:readingTocPageAllowed(h.values[READING_TOC_PAGE_RULES_STORE],h.before.id,denied)
  });};
  await h.install({approveSourceChange:()=>true});
  assert.deepEqual(observations,[{site:false,page:false}]);
  assert.deepEqual(h.values[READING_TOC_SITE_STORE],{'unrelated-tool':['https://untouched.example.org']});
  assert.deepEqual(h.values[READING_TOC_PAGE_RULES_STORE],{[h.before.id]:[denied]});
});
