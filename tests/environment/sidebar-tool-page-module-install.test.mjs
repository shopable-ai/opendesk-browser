import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,digestUtf8} from '../../src/platform/protocol.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {installReviewedSidebarTool,reconcileMarketOperation,recoverMarketOperation,
  MARKET_OPERATIONS_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/installation.js';

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
test('lost or foreign Page receipts cannot turn a committed parent into reported success',async()=>{
  for(const options of [{failImport:true},{badReceipt:true}]){
    const env=environment(),candidate=await tool();
    await assert.rejects(installReviewedSidebarTool({...env,candidate,reviewApproved:true,
      pageClient:pageClient(env,candidate,options)}),{code:'E_OUTCOME_UNKNOWN'});
    assert.deepEqual(env.values[SIDEBAR_TOOL_STORE],[candidate],'ambiguous commit is retained, not replayed or rolled back');
    assert.equal(env.events.filter(([type])=>type==='importAppPage').length,1);
  }
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
