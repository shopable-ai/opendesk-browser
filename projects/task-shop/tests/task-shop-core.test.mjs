import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createSidebarToolPackage} from '../../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage} from '../../../src/ui/sidebar-tools/package.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const script=readFileSync(resolve(root,'src/core.js'),'utf8');
const config=JSON.parse(readFileSync(resolve(root,'tool.config.json'),'utf8'));
const context={URL};vm.runInNewContext(script,context,{filename:'core.js',timeout:2000});
const M=context.OpenDeskTaskShopCore;
const installedPin={...M.PIN,installationId:'installed-fixture',generation:1};
const apply=(state,type,now,fields={})=>M.reduce(state,{type,now,...fields});
const published=()=>apply(null,'PUBLISH',1000);
const claimed=()=>apply(published(),'CLAIM',1001,{claimId:'c1',leaseId:'l1',claimRequestKey:'claim-0000001'});
const prepared=()=>apply(claimed(),'PREPARE',1002,{leaseId:'l1',
  installedPin,currentUrl:'https://www.baidu.com/s?wd=demo',
  clientRequestId:'taskshop:aaaaaaaaaaaa'});
const receipt={clientRequestId:'taskshop:aaaaaaaaaaaa',runId:'run1',resultId:'result1',
  state:'completed',retirementState:'released',
  result:{tag:'controller-result',runId:'run1',resultId:'result1',
    revision:{scriptId:'task:baidu.search.top3:1.1.1',revision:1,sourceHash:M.PIN.contentHash},
    state:'completed',outcome:{ok:true}},
  value:{kind:'baidu.search.top3.result',version:2,query:'自行车头盔 产品参数 说明书',
    status:'success',count:1,results:[{title:'商品资料 A',summary:'公开参数摘要',url:'https://example.com/product'}]}};
const observed=(input=receipt)=>apply(prepared(),'OBSERVE',1004,{
  leaseId:'l1',clientRequestId:'taskshop:aaaaaaaaaaaa',snapshot:input});
const throwsCode=(fn,code)=>assert.throws(fn,e=>e.code===code);
test('source package binds a real reviewed Controller pin, never claims a Native or payments API',()=>{
  assert.equal(config.id,'task-shop');assert.equal(config.format,'opendesk.sidebar-tool.v2');
  assert.deepEqual(config.capabilities,['storage.local','currentPage.read','tasks.run']);
  assert.equal(config.delegatedTasks.length,1);
  for(const key of ['taskId','version','manifestHash','contentHash'])
    assert.equal(config.delegatedTasks[0][key],M.PIN[key]);
  assert.doesNotThrow(()=>new vm.Script(readFileSync(resolve(root,'src/main.js'),'utf8')));
  const ui=readFileSync(resolve(root,'src/main.js'),'utf8');
  assert.match(ui,/tasks\.start/);assert.match(ui,/storage\.set/);
  assert.doesNotMatch(ui,/chrome\.(runtime|storage|tabs)|nativeMessaging|eval\(/);
});
test('publish and same claim key are idempotent, different claim cannot double-lease',()=>{
  const a=published();assert.equal(apply(a,'PUBLISH',5000),a);
  const b=claimed();assert.equal(apply(b,'CLAIM',1002,{claimId:'c2',leaseId:'l2',
    claimRequestKey:'claim-0000001'}),b);
  throwsCode(()=>apply(b,'CLAIM',1003,{claimId:'c2',leaseId:'l2',
    claimRequestKey:'claim-0000002'}),'E_ALREADY_CLAIMED');
  assert.equal(b.claim.expiresAt,1001+M.LEASE_MS);
});
test('wrong script hash, wrong origin, expiry and stale lease are rejected',()=>{
  throwsCode(()=>apply(claimed(),'PREPARE',1002,{leaseId:'l1',installedPin:{...M.PIN,
    contentHash:'0'.repeat(64)},currentUrl:'https://www.baidu.com',
    clientRequestId:'taskshop:aaaaaaaaaaaa'}),'E_REVISION');
  throwsCode(()=>apply(claimed(),'PREPARE',1002,{leaseId:'l1',installedPin,
    currentUrl:'https://evil.example/path',clientRequestId:'taskshop:aaaaaaaaaaaa'}),'E_SITE_SCOPE');
  throwsCode(()=>apply(claimed(),'PREPARE',1002,{leaseId:'wrong',installedPin:M.PIN,
    currentUrl:'https://www.baidu.com/',clientRequestId:'taskshop:aaaaaaaaaaaa'}),'E_LEASE_FENCE');
  throwsCode(()=>apply(claimed(),'PREPARE',1001+M.LEASE_MS,{leaseId:'l1',
    installedPin:M.PIN,currentUrl:'https://www.baidu.com/',
    clientRequestId:'taskshop:aaaaaaaaaaaa'}),'E_LEASE_EXPIRED');
});
test('running, completed without persisted result, wrong run ID and mismatched output cannot pass review',()=>{
  const running=observed({...receipt,state:'running',runId:'run1',resultId:null,result:null,value:null});
  assert.equal(running.claim.state,'RUNNING');
  const noResult=observed({...receipt,result:null});
  assert.equal(noResult.claim.state,'NEEDS_ATTENTION');
  const wrongId=observed({...receipt,result:{...receipt.result,runId:'other'}});
  assert.equal(wrongId.claim.receipt.persisted,false);
  const badOutput=observed({...receipt,value:{status:'blocked',results:[]}});
  assert.equal(badOutput.claim.state,'NEEDS_ATTENTION');
  throwsCode(()=>apply(noResult,'ACCEPT',1005,{leaseId:'l1',acceptanceId:'r1'}),'E_NOT_REVIEWABLE');
});
test('real durable result is only review pending; manual demo acceptance then demo settlement',()=>{
  const result=observed();assert.equal(result.claim.state,'REVIEW_PENDING');
  assert.equal(result.claim.receipt.persisted,true);
  assert.equal(result.claim.receipt.businessMatch,true);
  assert.equal(result.claim.review,null);assert.equal(result.claim.settlement,null);
  throwsCode(()=>apply(result,'DEMO_SETTLE',1005,{leaseId:'l1',settlementId:'x'}),'E_NOT_ACCEPTED');
  const accepted=apply(result,'ACCEPT',1005,{leaseId:'l1',acceptanceId:'r1'});
  assert.equal(accepted.claim.review.kind,'LOCAL_DEMO_RULE_REVIEW');
  const settled=apply(accepted,'DEMO_SETTLE',1006,{leaseId:'l1',settlementId:'s1'});
  assert.equal(settled.claim.settlement.kind,'SIMULATED_ONLY');
  assert.equal(settled.claim.settlement.netPoints,18);
});
test('UNKNOWN, stop and cancel prevent a second dispatch, expiry cannot recover automatically',()=>{
  const unknown=apply(prepared(),'MARK_UNKNOWN',1003,{leaseId:'l1'});
  throwsCode(()=>apply(unknown,'PREPARE',1004,{leaseId:'l1',installedPin:M.PIN,
    currentUrl:'https://www.baidu.com',clientRequestId:'taskshop:bbbbbbbbbbbb'}),'E_DISPATCH_LOCKED');
  throwsCode(()=>apply(unknown,'CLAIM',1005,{claimId:'c2',leaseId:'l2',
    claimRequestKey:'claim-0000002'}),'E_ALREADY_CLAIMED');
  const stopped=apply(prepared(),'STOP_REQUEST',1003,{leaseId:'l1'});
  assert.equal(stopped.claim.state,'STOP_REQUESTED');
  const cancelled=apply(claimed(),'CANCEL',1002,{leaseId:'l1'});
  assert.equal(cancelled.claim.state,'CANCELLED');
  throwsCode(()=>apply(prepared(),'CANCEL',1003,{leaseId:'l1'}),'E_CANCEL_TOO_LATE');
  const expired=apply(prepared(),'OBSERVE',1001+M.LEASE_MS+1,{
    leaseId:'l1',clientRequestId:'taskshop:aaaaaaaaaaaa',snapshot:receipt});
  assert.equal(expired.claim.state,'NEEDS_ATTENTION');
});
test('bad stored job identity is refused instead of silently overwritten',()=>{
  throwsCode(()=>M.validate({...published(),marketJobId:'other'}),'E_MARKET_STATE');
});

test('a returned snapshot for any other client request is never accepted',()=>{
  throwsCode(()=>apply(prepared(),'OBSERVE',1004,{
    leaseId:'l1',clientRequestId:'taskshop:aaaaaaaaaaaa',
    snapshot:{...receipt,clientRequestId:'taskshop:other123456789'}}),'E_REQUEST_CONFLICT');
});
test('original builder and validator accept only the pinned v2 app source',async()=>{
  const pkg=validateSidebarToolPackage(await createSidebarToolPackage(root));
  assert.equal(pkg.id,'task-shop');assert.equal(pkg.version,config.version);
  assert.equal(pkg.delegatedTasks.length,1);
  assert.equal(pkg.delegatedTasks[0].contentHash,M.PIN.contentHash);
  assert.equal(pkg.scripts.length,1);
  assert.match(pkg.js,/tasks\.start/);
  assert.equal(pkg.html,readFileSync(resolve(root,'src/index.html'),'utf8'));
  assert.equal(pkg.css,readFileSync(resolve(root,'src/style.css'),'utf8'));
});

test('prepare requires the complete installation identity returned by the trusted SDK',()=>{
  for(const pin of [M.PIN,{...installedPin,installationId:''},
    {...installedPin,generation:0},{...installedPin,generation:1.5}]){
    throwsCode(()=>apply(claimed(),'PREPARE',1002,{leaseId:'l1',installedPin:pin,
      currentUrl:'https://www.baidu.com/',clientRequestId:'taskshop:aaaaaaaaaaaa'}),'E_INSTALLATION');
  }
  assert.equal(prepared().claim.preparedPin.installationId,'installed-fixture');
});

test('only the original source revision and exact business query can pass review',()=>{
  for(const result of [{...receipt.result,revision:null},{...receipt.result,
    revision:{...receipt.result.revision,sourceHash:'0'.repeat(64)}},{...receipt.result,
    revision:{...receipt.result.revision,revision:2}}]){
    assert.equal(observed({...receipt,result}).claim.state,'NEEDS_ATTENTION');
  }
  for(const value of [{...receipt.value,query:'different query'},
    {...receipt.value,kind:'other-result'},{...receipt.value,count:2},
    {...receipt.value,results:[{title:'Not a complete search result'}]},
    {...receipt.value,results:[{...receipt.value.results[0],url:'javascript:alert(1)'}]}]){
    assert.equal(observed({...receipt,value}).claim.state,'NEEDS_ATTENTION');
  }
});

test('a verified result keeps a bounded display projection and never exposes failed output',()=>{
  const projection=M.projectSnapshot(receipt);
  assert.ok(Array.isArray(projection.results),'verified rows must remain available to the UI');
  assert.deepEqual(JSON.parse(JSON.stringify(projection.results)),receipt.value.results);
  assert.equal(projection.sourceHash,M.PIN.contentHash);
  assert.equal(projection.revision,1);
  assert.deepEqual(JSON.parse(JSON.stringify(M.projectSnapshot({...receipt,
    retirementState:'retiring'}).results)),[]);
  assert.deepEqual(JSON.parse(JSON.stringify(M.projectSnapshot({...receipt,
    result:{...receipt.result,outcome:{ok:false}}}).results)),[]);
});

test('legacy receipts without source identity cannot be accepted after an update',()=>{
  const state=observed();
  delete state.claim.receipt.sourceHash;
  throwsCode(()=>apply(state,'ACCEPT',1005,{leaseId:'l1',acceptanceId:'r1'}),'E_EVIDENCE_INSUFFICIENT');
});

test('up to three rows are bounded and malformed or failed Controller output stays unreviewable',()=>{
  const results=Array.from({length:3},(_,i)=>({title:'头'.repeat(120),summary:'参'.repeat(240),
    url:'https://example.com/'+i}));
  const good={...receipt,value:{...receipt.value,count:3,results}};
  const projected=M.projectSnapshot(good);
  assert.equal(projected.outputCount,3);assert.equal(projected.results[0].title.length,96);
  assert.equal(projected.results[0].summary.length,200);
  for(const bad of [
    {...good,value:{...good.value,count:4,results:[...results,results[0]]}},
    {...receipt,result:{...receipt.result,resultId:'different-result'}},
    {...receipt,result:{...receipt.result,outcome:{ok:false}}},
    {...receipt,value:{...receipt.value,results:[{...receipt.value.results[0],url:'https://user:secret@example.com/'}]}}
  ])assert.equal(observed(bad).claim.state,'NEEDS_ATTENTION');
});
