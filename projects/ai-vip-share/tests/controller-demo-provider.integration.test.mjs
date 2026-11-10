import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDemoLedger,issueDemoGrant,createDemoProvider,DEMO_ACCOUNT_ID} from '../server/demo-provider.mjs';
import {runtime,EXTENSION_ORIGIN,RECOVERY,PREFERENCE} from './helpers/controller-fixture.mjs';

// Real controller + real ESM dependencies. Only the SDK transport redirects its
// fixed development endpoint to a uniquely allocated loopback HTTP listener.
async function setup(t,{connectLocal=true}={}){
  const root=await mkdtemp(join(tmpdir(),'vip-controller-sqlite-'));
  const filename=join(root,'receipts.sqlite');
  let db=openDemoLedger(filename),server,origin,clock=Date.now(),fault=null;
  const store=new Map(),trace=[],received=[];
  let transformPreview=null;
  let inFlight=0;
  async function start(){
    server=createDemoProvider({db,extensionOrigin:EXTENSION_ORIGIN,port:0,now:()=>clock});
    server.on('request',req=>received.push(`${req.method} ${req.url}`));
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(resolve);});
    origin='http://127.0.0.1:'+server.address().port;
  }
  const stop=()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await start();
  t.after(async()=>{await stop();db.close();}); // Preserve only our unique DB as raw evidence.
  const network=async args=>{
    const url=new URL(args.url);
    assert.ok(['http://127.0.0.1:7898','http://127.0.0.1:7903'].includes(url.origin));
    assert.equal(args.config.headers['X-OpenDesk-Local-Test'],'1');
    const row={method:args.method,path:url.pathname,body:args.data===undefined?null:JSON.parse(JSON.stringify(args.data))};
    trace.push(row);inFlight++;
    try{
      if(fault==='before'&&url.pathname==='/api/redeem')throw Error('test transport disconnected before dispatch');
      // Match observed Chrome behavior: cors GET lacks Origin; POST supplies it.
      const response=await fetch(origin+url.pathname,{method:args.method,headers:{
        ...args.config.headers,...(args.method==='POST'?{Origin:EXTENSION_ORIGIN}:{}),
        'Content-Type':'application/json'},
        ...(args.data===undefined?{}:{body:JSON.stringify(args.data)})});
      row.status=response.status;row.response=await response.json();
      if(fault==='after'&&url.pathname==='/api/redeem')throw Error('test transport lost committed receipt');
      return {status:row.status,data:url.pathname==='/api/preview'&&transformPreview?
        transformPreview(structuredClone(row.response)):row.response};
    }finally{inFlight--;}
  };
  const settle=async(e,predicate=()=>true)=>{
    for(let i=0;i<400;i++){
      await e.flush();
      if(!inFlight&&!e.toolStates.at(-1)?.busy&&predicate())return;
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    assert.fail('SQLite HTTP controller did not settle: '+JSON.stringify(trace));
  };
  const open=async(options={})=>{const e=await runtime({network,store,wireNetwork:true,...options});await settle(e);return e;};
  const e=await open(connectLocal?{}:{shippedDom:true,pollTimers:true,
    currentPage:{status:'available',url:'https://market.example.com/'}});
  if(connectLocal){await e.click('local-connect');await settle(e);}
  const count=()=>db.prepare('SELECT count(*) AS n FROM redemptions').get().n;
  const posts=path=>trace.filter(row=>row.method==='POST'&&row.path==='/api/'+path);
  const issue=()=>issueDemoGrant(db,{intentId:'p3-intent',issueId:'p3-issue',quantity:7,
    now:clock,expiresAt:clock+600000}).activationUrl.split('=').at(-1);
  const preview=async()=>{await e.preview(issue());await settle(e,()=>!e.get('redeem-preview').hidden);};
  const evidence=label=>{
    const rows=db.prepare('SELECT account_id,sku_id,quantity,scope,expires_at FROM grants').all();
    const receipts=db.prepare('SELECT idempotency_key,receipt_json FROM redemptions').all();
    t.diagnostic(JSON.stringify({label,filename,trace,grants:rows,redemptions:receipts}));
  };
  return {e,store,trace,received,open,settle,count,posts,preview,evidence,
    db:()=>db,setFault:value=>{fault=value;},advance:ms=>{clock+=ms;},
    transformPreview:value=>{transformPreview=value;},
    async restart(){await stop();db.close();db=openDemoLedger(filename);await start();}};
}
function noEffects(e){
  assert.equal(e.cookieCalls.length,0);assert.equal(e.proxyCalls.length,0);assert.equal(e.tabCalls.length,0);
}

test('P3 original Controller reviews SQLite HTTP account/quota/scope, cancels, confirms once and reopens',async t=>{
  const h=await setup(t),{e}=h;
  assert.equal(e.get('account-name').textContent,'l***@fixture.test');
  const code=issueDemoGrant(h.db(),{intentId:'p3-intent',issueId:'p3-issue',quantity:7,
    expiresAt:Date.now()+600000}).activationUrl.split('=').at(-1);
  await e.preview(code);await h.settle(e,()=>!e.get('redeem-preview').hidden);
  assert.match(e.get('preview-description').textContent,/7/);
  assert.match(e.get('preview-description').textContent,/确认后生效，额度不设到期/);
  assert.match(e.get('preview-description').textContent,/不含第三方会员、Cookie 或代理/);
  assert.match(e.get('preview-description').textContent,/领取链接截止/);
  assert.deepEqual(h.posts('preview')[0].response.demoGrant,{skuId:'demo-quota',quantity:7,
    unit:'次',starts:'on-confirmation',entitlementExpiresAt:null,
    claimExpiresAt:h.db().prepare('SELECT expires_at FROM grants').get().expires_at,
    scope:'opendesk-fixture-only'});
  assert.equal(h.posts('preview')[0].response.accountId,DEMO_ACCOUNT_ID);
  assert.equal(h.count(),0);assert.equal(h.posts('redeem').length,0);
  await e.click('redeem-cancel');await e.click('redeem-confirm');await h.settle(e);
  assert.equal(h.count(),0);
  await e.preview(code);await h.settle(e,()=>!e.get('redeem-preview').hidden);
  await e.click('redeem-confirm',false);await h.settle(e);assert.equal(h.posts('redeem').length,0);
  await e.click('redeem-confirm');await e.click('redeem-confirm');
  await h.settle(e,()=>e.get('history-list').children.length===1);
  assert.equal(h.posts('redeem').length,1);assert.equal(h.posts('redeem')[0].status,200);
  assert.equal(h.count(),1);assert.equal(e.get('remaining').textContent,'7');assert.equal(h.store.get(RECOVERY),null);
  noEffects(e);await h.restart();
  const before=h.trace.length,reopened=await h.open({shippedDom:true});
  assert.deepEqual(h.trace.slice(before).map(row=>row.path),['/api/member']);
  assert.equal(reopened.get('remaining').textContent,'7');assert.equal(h.count(),1);noEffects(reopened);
  assert.deepEqual(h.received,h.trace.map(row=>`${row.method} ${row.path}`));h.evidence('confirmed-once-persisted');
});

for(const fault of ['after','before'])test(`P3 ${fault} dispatch failure: restart queries only original key, unknown stays locked`,async t=>{
  const h=await setup(t),{e}=h;await h.preview();h.setFault(fault);
  await e.click('redeem-confirm');await h.settle(e,()=>!e.get('recovery-check').disabled);
  const saved=structuredClone(h.store.get(RECOVERY));assert.ok(saved);
  assert.equal(saved.idempotencyKey,h.posts('redeem')[0].body.idempotencyKey);
  assert.equal(h.count(),fault==='after'?1:0);await h.restart();h.setFault(null);
  const before=h.trace.length,reopened=await h.open({shippedDom:true});
  assert.deepEqual(h.trace.slice(before).map(row=>row.path),['/api/member']);
  assert.deepEqual(h.store.get(RECOVERY),saved);
  await reopened.click('recovery-check',false);await h.settle(reopened);assert.equal(h.posts('status').length,0);
  reopened.get('recovery-check').listeners.click({isTrusted:true});
  reopened.get('recovery-check').listeners.click({isTrusted:true});await h.settle(reopened);
  assert.equal(h.posts('status').length,1);
  assert.deepEqual(h.posts('status')[0].body,{accountId:saved.accountId,idempotencyKey:saved.idempotencyKey});
  if(fault==='after'){
    assert.equal(h.store.get(RECOVERY),null);
    assert.deepEqual(h.posts('status')[0].response,h.posts('redeem')[0].response);
  }else{
    assert.equal(h.posts('status')[0].response.status,'unknown');assert.deepEqual(h.store.get(RECOVERY),saved);
    await reopened.preview('NEW-CODE');await reopened.click('redeem-confirm');await h.settle(reopened);
    assert.equal(reopened.get('redeem').disabled,true);
  }
  assert.equal(h.posts('redeem').length,1);assert.equal(h.count(),fault==='after'?1:0);noEffects(reopened);
  h.evidence(fault==='after'?'original-receipt-recovered':'unknown-no-replay');
});

test('P3 preview expiry is checked against fresh HTTP provider time before redeem dispatch',async t=>{
  const h=await setup(t);await h.preview();h.advance(120001);
  await h.e.click('redeem-confirm');await h.settle(h.e);
  assert.equal(h.posts('redeem').length,0);assert.equal(h.count(),0);assert.equal(h.store.get(RECOVERY)??null,null);
  noEffects(h.e);h.evidence('expired-before-post');
});

for(const [field,value] of [['account_id','other-account'],['sku_id','other-sku'],['quantity',8],
  ['scope','expanded scope'],['expires_at',Date.now()+900000]]){
  test(`P3 HTTP rejects changed ${field} after Controller review without granting`,async t=>{
    const h=await setup(t);await h.preview();
    // Model an operator/catalog change between review and commit, not a client
    // payload extension or mocked response. The real HTTP handler sees the DB.
    h.db().prepare(`UPDATE grants SET ${field}=?`).run(value);
    await h.e.click('redeem-confirm');await h.settle(h.e);
    assert.equal(h.posts('redeem').length,1);assert.equal(h.posts('redeem')[0].status,409);
    assert.equal(h.posts('redeem')[0].response.error,'E_PREVIEW_CHANGED');
    assert.equal(h.count(),0);assert.ok(h.store.get(RECOVERY));noEffects(h.e);
    h.evidence('changed-'+field+'-blocked');
  });
}

test('P3 approved landing automatically preflights through original Controller and cancellation survives reload',async t=>{
  const h=await setup(t);
  const link=issueDemoGrant(h.db(),{intentId:'auto-intent',issueId:'auto-issue',quantity:3,
    expiresAt:Date.now()+600000});
  const currentPage={status:'available',url:link.activationUrl};
  const linked=await h.open({currentPage,shippedDom:true});await linked.checkPage();await h.settle(linked);
  assert.equal(h.posts('preview').length,1);assert.equal(h.posts('redeem').length,0);
  assert.ok(h.posts('member').length>0);
  for(const row of h.posts('member'))assert.deepEqual(row.body,{});
  assert.equal(linked.get('redeem-preview').hidden,false);assert.equal(h.count(),0);
  assert(linked.calls.every(row=>new URL(row.url).origin==='http://127.0.0.1:7903'));
  await linked.click('redeem-cancel');await h.settle(linked);
  const reopened=await h.open({currentPage,shippedDom:true});await reopened.checkPage();await h.settle(reopened);
  assert.equal(h.posts('preview').length,1);assert.equal(h.posts('redeem').length,0);
  assert.ok(h.posts('member').length>0);
  for(const row of h.posts('member'))assert.deepEqual(row.body,{});assert.equal(h.count(),0);
  assert.match(reopened.get('redeem-status').textContent,/取消自动继续/);noEffects(reopened);
  h.evidence('automatic-preflight-cancel-not-revived');
});

test('P3 two independent Controller clients review the same issuance but HTTP commits only once',async t=>{
  const h=await setup(t),other=await h.open({store:new Map()});
  await other.click('local-connect');await h.settle(other);
  const link=issueDemoGrant(h.db(),{intentId:'race-intent',issueId:'race-issue',quantity:4,
    expiresAt:Date.now()+600000});
  const code=link.activationUrl.split('=').at(-1);
  await Promise.all([h.e.preview(code),other.preview(code)]);
  await h.settle(h.e);await h.settle(other);
  assert.equal(h.count(),0);assert.equal(h.posts('preview').length,2);
  await Promise.all([h.e.click('redeem-confirm'),other.click('redeem-confirm')]);
  await h.settle(h.e);await h.settle(other);
  assert.equal(h.posts('redeem').length,2);assert.equal(h.count(),1);
  assert.deepEqual(h.posts('redeem').map(row=>row.status).sort(),[200,409]);
  assert.equal(h.posts('redeem').find(row=>row.status===409).response.error,'E_ALREADY_REDEEMED');
  assert.notEqual(...h.posts('redeem').map(row=>row.body.idempotencyKey));
  noEffects(h.e);noEffects(other);h.evidence('two-clients-one-issuance');
});

for(const [field,value] of [['quantity',21],['scope','third-party-membership'],['claimExpiresAt',null],
  ['claimExpiresAt','2099-01-01T00:00:00Z']]){
  test(`P3 Controller rejects invalid structured demo ${field} before any redeem`,async t=>{
    const h=await setup(t);
    h.transformPreview(row=>({...row,demoGrant:{...row.demoGrant,[field]:value}}));
    const link=issueDemoGrant(h.db(),{intentId:'bad-terms',issueId:'bad-terms-issue',quantity:2,
      expiresAt:Date.now()+600000});
    await h.e.preview(link.activationUrl.split('=').at(-1));await h.settle(h.e);
    assert.equal(h.e.get('redeem-preview').hidden,true);
    await h.e.click('redeem-confirm');await h.settle(h.e);
    assert.equal(h.posts('redeem').length,0);assert.equal(h.count(),0);noEffects(h.e);
  });
}


test('control-free installed Controller discovers 7898 after Market navigation, preflights and reopens by read-only wire POST',async t=>{
  const h=await setup(t,{connectLocal:false}),{e}=h;
  assert.equal(e.get('local-development'),undefined);
  assert.equal(e.get('local-connect'),undefined);
  assert.equal(h.trace.length,0);
  const link=issueDemoGrant(h.db(),{intentId:'shipped-intent',issueId:'shipped-issue',quantity:5,
    expiresAt:Date.now()+600000});
  e.setPage({status:'available',url:link.activationUrl});
  e.timers.find(row=>row.ms===1200).callback();
  await h.settle(e,()=>!e.get('redeem-preview').hidden);
  assert.equal(h.posts('preview').length,1);assert.equal(h.posts('redeem').length,0);
  assert.ok(h.posts('member').length>0);
  for(const row of h.posts('member'))assert.deepEqual(row.body,{});
  assert.equal(h.count(),0);noEffects(e);
  assert.deepEqual(h.store.get(PREFERENCE),{schemaVersion:2,enabled:true,serviceOrigin:'http://127.0.0.1:7903'});
  assert.deepEqual(e.storageCalls.filter(row=>row.operation==='storage.set').map(row=>row.key),[PREFERENCE]);
  assert.ok(!JSON.stringify([...h.store]).includes(link.activationUrl));
  assert.ok(!JSON.stringify([...h.store]).includes(link.activationUrl.split('=').at(-1)));
  await e.click('redeem-confirm');await h.settle(e,()=>h.count()===1&&!e.toolStates.at(-1)?.busy);
  assert.equal(h.posts('redeem').length,1);assert.equal(e.get('remaining').textContent,'5');noEffects(e);
  const before=h.trace.length;
  const reopened=await h.open({shippedDom:true,currentPage:{status:'unavailable'}});
  assert.deepEqual(h.trace.slice(before).map(row=>[row.method,row.path]),[['POST','/api/member']]);
  assert.deepEqual(h.trace.slice(before).map(row=>row.body),[{}]);
  assert.equal(reopened.get('remaining').textContent,'5');assert.equal(h.count(),1);noEffects(reopened);
  h.evidence('control-free-navigation-confirm-once-reopen-read-post');
});
