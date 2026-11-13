import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,digestUtf8} from '../../src/platform/protocol.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {installReviewedSidebarTool,reconcileMarketOperation,recoverMarketOperation,
  MARKET_OPERATIONS_STORE,MARKET_PROVENANCE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/installation.js';

async function tool(){
  const sourceUtf8='document.documentElement.dataset.appPage="ready";';
  const page={format:'opendesk.page-install.v1',programId:'app.composite-fixture',version:'1.0.0',
    title:'Composite',revision:1,entryFormat:'classic-userscript',sourceUtf8,
    sourceHash:await digestUtf8(sourceUtf8),pageRules:{matches:['https://example.com/*'],
      excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'}};
  return {format:'opendesk.sidebar-tool.v2',id:'composite-fixture',version:'1.0.0',title:'Composite',
    description:'Composite install fixture',capabilities:['page.module'],html:'<main>App</main>',css:'',js:'void 0;',
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},pageModule:{...page,packageHash:await digest(page)}};
}
function environment(){
  const values={},events=[],api={storage:{local:{
    async get(keys){return keys===null?structuredClone(values):Object.fromEntries(
      (typeof keys==='string'?[keys]:keys).map(key=>[key,structuredClone(values[key])]))},
    async set(rows){events.push(['write',Object.keys(rows)]);Object.assign(values,structuredClone(rows));},
    async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete values[key];}
  }}};
  return {api,values,events,lockManager:{request:async(_name,work)=>work()}};
}
function pageClient(env,candidate,{failImport=false,badReceipt=false,verify=false}={}){
  return {async request(type,payload){
    env.events.push([type]);
    if(type==='prepareAppPage'){
      assert.equal(env.values[SIDEBAR_TOOL_STORE],undefined,'preflight precedes registry writes');
      return {status:'prepared',toolId:candidate.id,packageHash:await sidebarToolPackageHash(candidate),
        programId:candidate.pageModule.programId,sourceHash:candidate.pageModule.sourceHash};
    }
    if(type==='synchronizeAppPages')return {status:'synchronized',retired:[],cleanupPending:[]};
    if(type==='verifyAppPage'&&!verify)throw Object.assign(new Error('not observed'),{code:'E_PAGE_INSTALL_PENDING'});
    assert.ok(['importAppPage','verifyAppPage'].includes(type));
    assert.deepEqual(env.values[SIDEBAR_TOOL_STORE],[candidate],'Page sees the exact durable parent');
    assert.equal(env.values[TOOL_REVOCATION_EPOCHS_STORE][candidate.id],payload.installEpoch);
    if(failImport)throw Object.assign(new Error('receipt lost'),{code:'E_EFFECT_UNKNOWN'});
    return {status:type==='importAppPage'?'installed':'verified',
      appOwner:{toolId:payload.toolId,packageHash:payload.packageHash,
        installEpoch:badReceipt?'old-epoch':payload.installEpoch},
      programId:candidate.pageModule.programId,sourceHash:candidate.pageModule.sourceHash,
      manifestHash:'a'.repeat(64),nativeState:'registered',ready:true};
  }};
}
test('combined install requires a live Page preflight before any durable write',async()=>{
  const env=environment(),candidate=await tool();
  await assert.rejects(installReviewedSidebarTool({...env,candidate,reviewApproved:true}),{code:'E_HOST_UNAVAILABLE'});
  assert.deepEqual(env.values,{});
  const client=pageClient(env,candidate),prepared=client.request;
  client.request=async(type,payload)=>type==='prepareAppPage'
    ?{...await prepared(type,payload),sourceHash:'0'.repeat(64)}:prepared(type,payload);
  await assert.rejects(installReviewedSidebarTool({...env,candidate,reviewApproved:true,pageClient:client}),{code:'E_PAGE_INSTALL_PENDING'});
  assert.deepEqual(env.values,{});
});
test('successful combined install binds the Page submission to the committed parent hash and epoch',async()=>{
  const env=environment(),candidate=await tool();
  const result=await installReviewedSidebarTool({...env,candidate,reviewApproved:true,pageClient:pageClient(env,candidate)});
  assert.equal(result.state,'installed');
  assert.equal(env.events[0][0],'prepareAppPage');
  assert.equal(env.events.filter(([type])=>type==='importAppPage').length,1);
});
for(const cleanupPending of [false,true])
test('lost or foreign Page receipts cannot turn a committed parent into reported success; old-page notice='+cleanupPending,async()=>{
  for(const options of [{failImport:true},{badReceipt:true}]){
    const env=environment(),candidate=await tool();
    const client=pageClient(env,candidate,options),request=client.request;
    if(cleanupPending)client.request=async(type,payload)=>type==='synchronizeAppPages'
      ?{status:'synchronized',retired:[],cleanupPending:[candidate.pageModule.programId],revocationPending:[]}:request(type,payload);
    await assert.rejects(installReviewedSidebarTool({...env,candidate,reviewApproved:true,
      pageClient:client}),{code:'E_OUTCOME_UNKNOWN'});
    assert.deepEqual(env.values[SIDEBAR_TOOL_STORE],[candidate],'ambiguous commit is retained, not replayed or rolled back');
    assert.equal(env.events.filter(([type])=>type==='importAppPage').length,1);
  }
});
for(const marketReview of [false,true])
test('pending old Page cleanup names the recovery action without replaying installation; market='+marketReview,async()=>{
  const env=environment(),candidate=await tool(),client=pageClient(env,candidate),request=client.request;
  client.request=async(type,payload)=>type==='synchronizeAppPages'
    ?{status:'synchronized',retired:[],cleanupPending:[candidate.pageModule.programId]}:request(type,payload);
  const operationId=crypto.randomUUID(),market=marketReview?{marketId:'opendesk/'+candidate.id,
    sha256:await sidebarToolPackageHash(candidate),operationId}:null;
  await assert.rejects(installReviewedSidebarTool({...env,candidate,reviewApproved:true,pageClient:client,market}),error=>{
    assert.equal(error.code,'E_PAGE_CLEANUP_PENDING');
    assert.match(error.message,/安装包已保存.*网页功能尚未就绪/);
    assert.match(error.message,/旧版网页功能.*退出/);
    assert.match(error.message,/保存.*刷新/);
    return true;
  });
  assert.deepEqual(env.values[SIDEBAR_TOOL_STORE],[candidate],'the committed parent is retained');
  assert.equal(env.events.filter(([type])=>type==='importAppPage').length,0,'cleanup must finish before import');
  if(marketReview)assert.equal(env.values[MARKET_OPERATIONS_STORE][operationId].state,'outcome-unknown');
});

for(const marketReview of [false,true])
test('confirmed native revocation permits complete compound installation with an old-page refresh notice; market='+marketReview,async()=>{
  const env=environment(),candidate=await tool(),client=pageClient(env,candidate),request=client.request;
  client.request=async(type,payload)=>type==='synchronizeAppPages'
    ?{status:'synchronized',retired:[],cleanupPending:[candidate.pageModule.programId],revocationPending:[]}:request(type,payload);
  const market=marketReview?{marketId:'opendesk/'+candidate.id,sha256:await sidebarToolPackageHash(candidate),
    operationId:crypto.randomUUID()}:null;
  const result=await installReviewedSidebarTool({...env,candidate,reviewApproved:true,pageClient:client,market});
  assert.equal(result.state,'installed');assert.equal(result.pageCleanupPending,true);
  assert.equal(env.events.filter(([type])=>type==='importAppPage').length,1);
  if(marketReview)assert.equal(env.values[MARKET_OPERATIONS_STORE][market.operationId].state,'succeeded');
});
test('unconfirmed native revocation never imports a new companion',async()=>{
  const env=environment(),candidate=await tool(),client=pageClient(env,candidate),request=client.request;
  client.request=async(type,payload)=>type==='synchronizeAppPages'
    ?{status:'synchronized',retired:[],cleanupPending:[],revocationPending:[candidate.pageModule.programId]}:request(type,payload);
  await assert.rejects(installReviewedSidebarTool({...env,candidate,reviewApproved:true,pageClient:client}),{code:'E_PAGE_CLEANUP_PENDING'});
  assert.equal(env.events.filter(([type])=>type==='importAppPage').length,0);
});

for(const [name,receipt] of [['missing',undefined],['null',null],['empty',{}],
  ['wrong status',{status:'pending',cleanupPending:[]}],
  ['missing cleanup list',{status:'synchronized'}],
  ['null revocation list',{status:'synchronized',cleanupPending:['app.composite-fixture'],revocationPending:null}],
  ['non-array revocation list',{status:'synchronized',cleanupPending:['app.composite-fixture'],revocationPending:{}}],
  ['non-array cleanup list',{status:'synchronized',cleanupPending:{}}]])
test('combined install keeps '+name+' synchronization receipt unknown without importing',async()=>{
  const env=environment(),candidate=await tool(),client=pageClient(env,candidate),request=client.request;
  client.request=async(type,payload)=>type==='synchronizeAppPages'?receipt:request(type,payload);
  await assert.rejects(installReviewedSidebarTool({...env,candidate,reviewApproved:true,pageClient:client}),
    {code:'E_OUTCOME_UNKNOWN'});
  assert.deepEqual(env.values[SIDEBAR_TOOL_STORE],[candidate]);
  assert.equal(env.events.filter(([type])=>type==='importAppPage').length,0);
});
test('market recovery reads the companion identity and never repeats an unknown native install',async()=>{
  const env=environment(),candidate=await tool(),operationId=crypto.randomUUID();
  const market={marketId:'opendesk/'+candidate.id,sha256:await sidebarToolPackageHash(candidate),operationId};
  await assert.rejects(installReviewedSidebarTool({...env,candidate,reviewApproved:true,market,
    pageClient:pageClient(env,candidate,{failImport:true})}),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(env.values[MARKET_OPERATIONS_STORE][operationId].state,'outcome-unknown');
  assert.equal((await reconcileMarketOperation(env.api,operationId)).state,'outcome-unknown');
  const unknown=await recoverMarketOperation({...env,operationId,pageClient:pageClient(env,candidate)});
  assert.equal(unknown.state,'outcome-unknown');
  const before=env.events.filter(([type])=>type==='importAppPage').length;
  const recovered=await recoverMarketOperation({...env,operationId,pageClient:pageClient(env,candidate,{verify:true})});
  assert.equal(recovered.state,'succeeded');
  assert.equal(env.events.filter(([type])=>type==='importAppPage').length,before);
});

async function identicalCompound({installed=[],queryResult,queryError,cleanupPending=[],verifyError,importError,badReceipt=false}={}){
  const env=environment(),candidate=await tool(),epoch='original-install-epoch';
  env.values[SIDEBAR_TOOL_STORE]=[candidate];
  env.values[TOOL_REVOCATION_EPOCHS_STORE]={[candidate.id]:epoch};
  env.values[sidebarToolStorageKey(candidate.id)]={draft:'保留网页设置和草稿'};
  const before=structuredClone(env.values),owner={toolId:candidate.id,
    packageHash:await sidebarToolPackageHash(candidate),installEpoch:epoch};
  const client={async request(type,payload){
    env.events.push([type,structuredClone(payload)]);
    if(type==='prepareAppPage')return {status:'prepared',toolId:candidate.id,
      packageHash:owner.packageHash,programId:candidate.pageModule.programId,sourceHash:candidate.pageModule.sourceHash};
    if(type==='synchronizeAppPages')return {status:'synchronized',retired:[],cleanupPending};
    if(type==='listPagePrograms'){
      if(queryError)throw queryError;
      return queryResult===undefined?{catalog:[],installed}:queryResult;
    }
    assert.ok(['verifyAppPage','importAppPage'].includes(type));
    assert.deepEqual(payload,owner,'repair must use the original parent hash and epoch');
    if(type==='verifyAppPage'&&verifyError)throw verifyError;
    if(type==='importAppPage'&&importError)throw importError;
    return {status:type==='importAppPage'?'installed':'verified',appOwner:badReceipt?{...owner,installEpoch:'foreign'}:owner,
      programId:candidate.pageModule.programId,sourceHash:candidate.pageModule.sourceHash,
      manifestHash:'a'.repeat(64),nativeState:'registered',ready:true};
  }};
  return {...env,candidate,owner,
    install:extra=>installReviewedSidebarTool({...env,candidate,baseline:candidate,reviewApproved:true,pageClient:client,...extra}),
    operations:()=>env.events.filter(([type])=>type!=='write').map(([type])=>type),
    assertParentUnchanged(){assert.deepEqual(env.values,before);assert.equal(env.events.filter(([type])=>type==='write').length,0);}};
}
test('explicit identical compound review restores only a missing companion with the original parent identity',async()=>{
  const f=await identicalCompound();
  assert.equal((await f.install({repairMissingPageModule:true})).state,'already-installed');
  assert.deepEqual(f.operations(),['prepareAppPage','synchronizeAppPages','listPagePrograms','importAppPage']);
  f.assertParentUnchanged();
});
for(const scenario of ['approved','cancelled','reused','lost receipt'])
test('official identical companion repair respects the new operation and consent: '+scenario,async()=>{
  const f=await identicalCompound(scenario==='lost receipt'
    ?{importError:Object.assign(Error('lost receipt'),{code:'E_EFFECT_UNKNOWN'})}:{});
  const market={marketId:'opendesk/'+f.candidate.id,sha256:await sidebarToolPackageHash(f.candidate),
    operationId:crypto.randomUUID()};
  let approvals=0;
  const commitIntent=async()=>{approvals++;if(scenario==='cancelled')throw Object.assign(Error('cancelled'),{code:'E_CANCELLED'});};
  if(scenario==='reused')await f.install({market});
  const install=()=>f.install({market,commitIntent,repairMissingPageModule:true});
  if(scenario==='approved'){
    assert.equal((await install()).state,'already-installed');
    assert.equal(approvals,1);
    assert.equal(f.values[MARKET_OPERATIONS_STORE][market.operationId].state,'succeeded');
    assert.equal(f.events.filter(([type])=>type==='importAppPage').length,1);
  }else if(scenario==='lost receipt'){
    await assert.rejects(install(),{code:'E_OUTCOME_UNKNOWN'});
    assert.equal(approvals,1);
    assert.equal(f.values[MARKET_OPERATIONS_STORE][market.operationId].state,'outcome-unknown');
    assert.equal(f.events.filter(([type])=>type==='importAppPage').length,1);
  }else{
    await assert.rejects(install(),{code:scenario==='cancelled'?'E_CANCELLED':'E_OUTCOME_UNKNOWN'});
    assert.equal(f.events.filter(([type])=>type==='importAppPage').length,0);
  }
  assert.deepEqual(f.values[SIDEBAR_TOOL_STORE],[f.candidate]);
  assert.equal(f.values[TOOL_REVOCATION_EPOCHS_STORE][f.candidate.id],f.owner.installEpoch);
  assert.deepEqual(f.values[sidebarToolStorageKey(f.candidate.id)],{draft:'保留网页设置和草稿'});
});
for(const lost of ['reviewed','committing','provenance','succeeded'])
test('official identical companion repair consumes approval after lost '+lost+' storage acknowledgement',async()=>{
  const f=await identicalCompound(),set=f.api.storage.local.set;
  const market={marketId:'opendesk/'+f.candidate.id,sha256:await sidebarToolPackageHash(f.candidate),
    operationId:crypto.randomUUID()};
  let lostOnce=false;
  f.api.storage.local.set=async rows=>{
    await set(rows);
    if(!lostOnce&&(lost==='provenance'?rows[MARKET_PROVENANCE_STORE]:
      rows[MARKET_OPERATIONS_STORE]?.[market.operationId]?.state===lost)){
      lostOnce=true;throw Error('acknowledgement lost after durable write');
    }
  };
  const install=()=>f.install({market,repairMissingPageModule:true});
  await assert.rejects(install(),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(lostOnce,true);
  assert.equal(f.values[MARKET_OPERATIONS_STORE][market.operationId].state,'outcome-unknown');
  const imported=['provenance','succeeded'].includes(lost)?1:0;
  assert.equal(f.events.filter(([type])=>type==='importAppPage').length,imported);
  await assert.rejects(install(),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.events.filter(([type])=>type==='importAppPage').length,imported,'consumed operation never imports again');
});
test('identical compound repair ignores unrelated Page programs when locating its missing companion',async()=>{
  const f=await identicalCompound({installed:[{programId:'unrelated-page'}]});
  await f.install({repairMissingPageModule:true});
  assert.equal(f.operations().filter(type=>type==='importAppPage').length,1);
  f.assertParentUnchanged();
});
for(const repairMissingPageModule of [undefined,false])
test('default identical compound review only verifies without resubmitting (option='+repairMissingPageModule+')',async()=>{
  const f=await identicalCompound();
  await f.install(repairMissingPageModule===undefined?{}:{repairMissingPageModule});
  assert.deepEqual(f.operations(),['prepareAppPage','synchronizeAppPages','verifyAppPage']);
  f.assertParentUnchanged();
});
test('default identical compound verification failure never falls through to repair',async()=>{
  const f=await identicalCompound({verifyError:Object.assign(Error('missing companion'),{code:'E_PAGE_INSTALL_PENDING'})});
  await assert.rejects(f.install({}),{code:'E_PAGE_INSTALL_PENDING'});
  assert.deepEqual(f.operations(),['prepareAppPage','synchronizeAppPages','verifyAppPage']);
  f.assertParentUnchanged();
});
for(const state of ['ready','foreign','pending','unknown'])
test('identical compound repair verifies an existing '+state+' companion without importing',async()=>{
  const verifyError=state==='ready'?undefined:Object.assign(Error(state),
    {code:state==='foreign'?'E_APP_PAGE_OWNER':state==='unknown'?'E_EFFECT_UNKNOWN':'E_PAGE_INSTALL_PENDING'});
  const f=await identicalCompound({installed:[{programId:'app.composite-fixture',state,
    appOwner:{toolId:'composite-fixture',installEpoch:state==='foreign'?'foreign':'original-install-epoch'}}],verifyError});
  if(verifyError)await assert.rejects(f.install({repairMissingPageModule:true}),{code:verifyError.code});
  else await f.install({repairMissingPageModule:true});
  assert.deepEqual(f.operations(),['prepareAppPage','synchronizeAppPages','listPagePrograms','verifyAppPage']);
  f.assertParentUnchanged();
});
test('identical compound repair waits for old managed cleanup before querying or importing',async()=>{
  const f=await identicalCompound({cleanupPending:['app.composite-fixture']});
  await assert.rejects(f.install({repairMissingPageModule:true}),error=>{
    assert.equal(error.code,'E_PAGE_CLEANUP_PENDING');assert.match(error.message,/保存.*刷新/);return true;
  });
  assert.deepEqual(f.operations(),['prepareAppPage','synchronizeAppPages']);
  f.assertParentUnchanged();
});
test('pending compound cleanup requires a fresh same-package review before repairing the missing companion',async()=>{
  const cleanupPending=['app.composite-fixture'],f=await identicalCompound({cleanupPending});
  await assert.rejects(f.install({repairMissingPageModule:true}),{code:'E_PAGE_CLEANUP_PENDING'});
  assert.deepEqual(f.operations(),['prepareAppPage','synchronizeAppPages']);
  f.assertParentUnchanged();
  cleanupPending.length=0; // A later synchronization now confirms old-document cleanup.
  await assert.rejects(f.install({repairMissingPageModule:true,reviewApproved:false}),{code:'E_REVIEW_REQUIRED'});
  assert.deepEqual(f.operations(),['prepareAppPage','synchronizeAppPages']);
  assert.equal((await f.install({repairMissingPageModule:true})).state,'already-installed');
  assert.deepEqual(f.operations(),['prepareAppPage','synchronizeAppPages',
    'prepareAppPage','synchronizeAppPages','listPagePrograms','importAppPage']);
  f.assertParentUnchanged();
});
for(const [name,queryResult] of [['null response',null],['missing installed',{}],['non-array installed',{installed:{}}],
  ['null row',{installed:[null]}],['missing programId',{installed:[{}]}],['non-string programId',{installed:[{programId:42}]}]])
test('identical compound repair rejects '+name+' without importing',async()=>{
  const f=await identicalCompound({queryResult});
  await assert.rejects(f.install({repairMissingPageModule:true}),{code:'E_OUTCOME_UNKNOWN'});
  assert.deepEqual(f.operations(),['prepareAppPage','synchronizeAppPages','listPagePrograms']);
  f.assertParentUnchanged();
});
test('identical compound repair does not treat an unavailable Page query as absence',async()=>{
  const f=await identicalCompound({queryError:Object.assign(Error('query unavailable'),{code:'E_EFFECT_UNKNOWN'})});
  await assert.rejects(f.install({repairMissingPageModule:true}),{code:'E_EFFECT_UNKNOWN'});
  assert.deepEqual(f.operations(),['prepareAppPage','synchronizeAppPages','listPagePrograms']);
  f.assertParentUnchanged();
});
for(const failure of ['lost receipt','foreign receipt'])
test('identical compound repair never retries after '+failure,async()=>{
  const f=await identicalCompound(failure==='lost receipt'
    ?{importError:Object.assign(Error('receipt lost'),{code:'E_EFFECT_UNKNOWN'})}:{badReceipt:true});
  await assert.rejects(f.install({repairMissingPageModule:true}));
  assert.deepEqual(f.operations(),['prepareAppPage','synchronizeAppPages','listPagePrograms','importAppPage']);
  f.assertParentUnchanged();
});
test('identical compound repair requires a fresh explicit installation review',async()=>{
  const f=await identicalCompound();
  await assert.rejects(f.install({repairMissingPageModule:true,reviewApproved:false}),{code:'E_REVIEW_REQUIRED'});
  assert.deepEqual(f.operations(),[]);f.assertParentUnchanged();
});
test('identical bytes cannot reuse a review from a retired parent installation epoch',async()=>{
  const f=await identicalCompound();
  await assert.rejects(f.install({repairMissingPageModule:true,baselineInstallEpoch:'retired-installation'}),{code:'E_TOOL_CHANGED'});
  assert.deepEqual(f.operations(),['prepareAppPage']);f.assertParentUnchanged();
});
test('a lost same-package repair receipt is classified unknown and never resubmitted',async()=>{
  const f=await identicalCompound({importError:Object.assign(Error('receipt lost'),{code:'E_EFFECT_UNKNOWN'})});
  await assert.rejects(f.install({repairMissingPageModule:true}),{code:'E_OUTCOME_UNKNOWN'});
  assert.deepEqual(f.operations(),['prepareAppPage','synchronizeAppPages','listPagePrograms','importAppPage']);
  f.assertParentUnchanged();
});
