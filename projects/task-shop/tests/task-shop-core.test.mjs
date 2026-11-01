import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const script=readFileSync(resolve(root,'src/core.js'),'utf8');
const config=JSON.parse(readFileSync(resolve(root,'tool.config.json'),'utf8'));
const context={URL};vm.runInNewContext(script,context,{filename:'core.js',timeout:2000});
const M=context.OpenDeskTaskShopCore;
const apply=(state,type,now,fields={})=>M.reduce(state,{type,now,...fields});
const published=()=>apply(null,'PUBLISH',1000);
const claimed=()=>apply(published(),'CLAIM',1001,{claimId:'c1',leaseId:'l1',claimRequestKey:'claim-0000001'});
const prepared=()=>apply(claimed(),'PREPARE',1002,{leaseId:'l1',
  installedPin:M.PIN,currentUrl:'https://www.baidu.com/s?wd=demo',
  clientRequestId:'taskshop:aaaaaaaaaaaa'});
const receipt={clientRequestId:'taskshop:aaaaaaaaaaaa',runId:'run1',resultId:'result1',
  state:'completed',retirementState:'released',
  result:{tag:'controller-result',runId:'run1',resultId:'result1',
    state:'completed',outcome:{ok:true}},
  value:{status:'success',results:[{title:'商品资料 A'}]}};
const observed=(input=receipt)=>apply(prepared(),'OBSERVE',1004,{
  leaseId:'l1',clientRequestId:'taskshop:aaaaaaaaaaaa',snapshot:input});
const throwsCode=(fn,code)=>assert.throws(fn,e=>e.code===code);
test('source package binds a real reviewed Controller pin, never claims a Native or payments API',()=>{
  assert.equal(config.id,'task-shop');assert.equal(config.format,'opendesk.sidebar-tool.v2');
  assert.deepEqual(config.capabilities,['storage.local','currentPage.read','tasks.open','tasks.run']);
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
  throwsCode(()=>apply(claimed(),'PREPARE',1002,{leaseId:'l1',installedPin:M.PIN,
    currentUrl:'https://evil.example/path',clientRequestId:'taskshop:aaaaaaaaaaaa'}),'E_SITE_SCOPE');
  throwsCode(()=>apply(claimed(),'PREPARE',1002,{leaseId:'wrong',installedPin:M.PIN,
    currentUrl:'https://www.baidu.com/',clientRequestId:'taskshop:aaaaaaaaaaaa'}),'E_LEASE_FENCE');
  throwsCode(()=>apply(claimed(),'PREPARE',1001+M.LEASE_MS,{leaseId:'l1',
    installedPin:M.PIN,currentUrl:'https://www.baidu.com/',
    clientRequestId:'taskshop:aaaaaaaaaaaa'}),'E_LEASE_EXPIRED');
});
test('running, completed without persisted result, wrong run ID and mismatched output cannot pass review',()=>{
  const running=observed({state:'running',runId:'run1',resultId:null,result:null});
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
