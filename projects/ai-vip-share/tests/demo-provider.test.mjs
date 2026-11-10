import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openDemoLedger,issueDemoGrant,previewDemoGrant,redeemDemoGrant,
  statusDemoGrant,createDemoProvider,DEMO_ACCOUNT_ID} from '../server/demo-provider.mjs';

const ORIGIN='chrome-extension://'+ 'a'.repeat(32);
const issued=(db,overrides={})=>issueDemoGrant(db,{intentId:'intent-001',issueId:'issue-001',
  expiresAt:Date.now()+600000,...overrides});
async function database(t){
  const root=await mkdtemp(join(tmpdir(),'vip-sqlite-'));
  const filename=join(root,'demo.db');
  t.after(()=>rm(root,{recursive:true,force:true}));
  const db=openDemoLedger(filename);
  t.after(()=>db.close());
  return {db,filename};
}
const voucher=(db,code)=>previewDemoGrant(db,{code});
const redeem=(db,preview,idempotencyKey=randomUUID())=>redeemDemoGrant(db,{
  previewId:preview.previewId,accountId:DEMO_ACCOUNT_ID,idempotencyKey});
test('short link is scoped, preview is side-effect-free, and replay returns same receipt',async t=>{
  const {db}=await database(t),link=issued(db);
  assert.match(link.marketUrl,/^http:\/\/127\.0\.0\.1:43132\/apps\/opendesk\/ai-vip-share\/#vip-ref=/);
  assert.match(link.activationUrl,/^http:\/\/127\.0\.0\.1:7898\/activate\?activation_code=/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM redemptions').get().n,0);
  assert.equal(db.prepare('SELECT token_hash FROM grants').get().token_hash.length,64);
  const preview=voucher(db,link.activationUrl.split('=').at(-1));
  assert.equal(preview.accountId,DEMO_ACCOUNT_ID);
  assert.match(preview.grantSummary,/20/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM redemptions').get().n,0);
  const key=randomUUID(),first=redeem(db,preview,key),again=redeem(db,preview,key);
  assert.deepEqual(again,first);
  assert.equal(first.status,'redeemed');
  assert.equal(statusDemoGrant(db,{accountId:DEMO_ACCOUNT_ID,idempotencyKey:key}).redemptionId,first.redemptionId);
  assert.equal(statusDemoGrant(db,{operation:'grant',accountId:DEMO_ACCOUNT_ID,
    intentId:'intent-001',issueId:'issue-001',skuId:'demo-quota'}).redemptionId,first.redemptionId);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM redemptions').get().n,1);
  assert.throws(()=>voucher(db,link.activationUrl.split('=').at(-1)),{code:'E_ALREADY_REDEEMED'});
  assert.throws(()=>issued(db),{code:'E_ISSUANCE_EXISTS'});
  assert.throws(()=>redeem(db,preview,randomUUID()),{code:'E_ALREADY_REDEEMED'});
  assert.throws(()=>redeem(db,{previewId:randomUUID()},key),{code:'E_IDEMPOTENCY_CONFLICT'});
});
test('two SQLite handles cannot double-redeem one business issuance; result survives restart',async t=>{
  const {db,filename}=await database(t);
  const other=openDemoLedger(filename);t.after(()=>other.close());
  const link=issued(db),code=link.activationUrl.split('=').at(-1);
  const first=voucher(db,code),second=voucher(other,code);
  const outcomes=await Promise.allSettled([
    Promise.resolve().then(()=>redeem(db,first)),
    Promise.resolve().then(()=>redeem(other,second))
  ]);
  assert.equal(outcomes.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(row=>row.status==='rejected'&&row.reason.code==='E_ALREADY_REDEEMED').length,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM redemptions').get().n,1);
  const third=openDemoLedger(filename);t.after(()=>third.close());
  assert.equal(third.prepare('PRAGMA user_version').get().user_version,1);
  assert.equal(third.prepare('SELECT COUNT(*) AS n FROM redemptions').get().n,1);
  assert.equal(third.prepare('PRAGMA index_list(redemptions)').all().filter(row=>row.unique===1).length>=3,true);
  assert.equal(statusDemoGrant(third,{operation:'grant',accountId:DEMO_ACCOUNT_ID,
    intentId:'intent-001',issueId:'issue-001',skuId:'demo-quota'}).status,'redeemed');
});
test('expiry, scope, wrong account, unknown transaction and altered links fail closed',async t=>{
  const {db}=await database(t),now=1000000;
  const link=issued(db,{now,expiresAt:now+60000}),code=link.activationUrl.split('=').at(-1);
  assert.throws(()=>previewDemoGrant(db,{code},DEMO_ACCOUNT_ID,now+60000),{code:'E_LINK_EXPIRED'});
  assert.throws(()=>previewDemoGrant(db,{code:code+'a'},DEMO_ACCOUNT_ID,now+100),{code:'E_LINK_INVALID'});
  assert.throws(()=>previewDemoGrant(db,{code},'wrong-account',now+100),{code:'E_WRONG_ACCOUNT'});
  const p=previewDemoGrant(db,{code},DEMO_ACCOUNT_ID,now+100);
  assert.throws(()=>redeemDemoGrant(db,{previewId:p.previewId,accountId:DEMO_ACCOUNT_ID,
    idempotencyKey:randomUUID()},DEMO_ACCOUNT_ID,now+60000),{code:'E_PREVIEW_EXPIRED'});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM redemptions').get().n,0);
  const missing=statusDemoGrant(db,{accountId:DEMO_ACCOUNT_ID,idempotencyKey:randomUUID()});
  assert.equal(missing.status,'unknown');
  assert.throws(()=>statusDemoGrant(db,{accountId:'victim',idempotencyKey:randomUUID()}),{code:'E_STATUS_IDENTITY'});
  assert.throws(()=>issued(db,{intentId:'intent-002',issueId:'issue-002',quantity:100}),{code:'E_ISSUANCE_SCOPE'});
});
test('real HTTP uses original /api/member /api/preview /api/redeem /api/status only; source cannot redeem',async t=>{
  const {db}=await database(t),link=issued(db),code=link.activationUrl.split('=').at(-1);
  const server=createDemoProvider({db,extensionOrigin:ORIGIN,port:0});
  await new Promise(resolve=>server.listen(resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port;
  const http=(path,method='GET',data,headers={})=>fetch(origin+path,{
    method,headers:{Origin:ORIGIN,'X-OpenDesk-Local-Test':'1',...headers,
      ...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})
  });
  const landing=await http('/activate?activation_code='+code);
  assert.equal(landing.status,200);
  assert.match(await landing.text(),/进入 OpenDesk 市场/);
  assert.equal((await http('/activate?activation_code='+code+'&next=evil')).status,400);
  assert.equal((await http('/api/member','GET',undefined,{Origin:'http://evil.test'})).status,403);
  assert.equal((await http('/api/member','GET',undefined,{'X-OpenDesk-Local-Test':'0'})).status,403);
  const member=await (await http('/api/member')).json();
  assert.equal(member.account.id,DEMO_ACCOUNT_ID);
  assert.equal(member.redemptions.length,0);
  const preview=await (await http('/api/preview','POST',{code})).json();
  assert.equal(preview.accountId,DEMO_ACCOUNT_ID);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM redemptions').get().n,0);
  const key=randomUUID();
  const response=await http('/api/redeem','POST',{previewId:preview.previewId,accountId:DEMO_ACCOUNT_ID,idempotencyKey:key});
  assert.equal(response.status,200);
  const receipt=await response.json();
  assert.equal(receipt.status,'redeemed');
  const replay=await (await http('/api/status','POST',{accountId:DEMO_ACCOUNT_ID,idempotencyKey:key})).json();
  assert.equal(replay.redemptionId,receipt.redemptionId);
  const after=await (await http('/api/member')).json();
  assert.equal(after.entitlements[0].remaining,20);
  assert.equal(after.redemptions.length,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM redemptions').get().n,1);
});

test('additive term snapshot denies old unsnapshotted reviews while preserving receipts',async t=>{
  const {db}=await database(t);
  const first=issued(db),preview=voucher(db,first.activationUrl.split('=').at(-1));
  const key=randomUUID(),receipt=redeem(db,preview,key);
  const second=issued(db,{intentId:'intent-002',issueId:'issue-002'});
  const old=voucher(db,second.activationUrl.split('=').at(-1));
  // Equivalent to a retained preview row created before preview_terms existed.
  db.prepare('DELETE FROM preview_terms WHERE preview_id=?').run(old.previewId);
  assert.throws(()=>redeem(db,old),{code:'E_PREVIEW_CHANGED'});
  assert.equal(db.prepare('SELECT count(*) AS n FROM redemptions').get().n,1);
  assert.deepEqual(statusDemoGrant(db,{accountId:DEMO_ACCOUNT_ID,idempotencyKey:key}),receipt);
  const fresh=voucher(db,second.activationUrl.split('=').at(-1));
  assert.equal(redeem(db,fresh).status,'redeemed');
});
