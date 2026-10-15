import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const sourcePath='examples/sidebar-tools/ai-vip-share/src/main.js';
const htmlPath='examples/sidebar-tools/ai-vip-share/src/index.html';
const BOUND='https://members.example.org'; // VM-only fixture; never a production endpoint.
const originalConfig="const BUSINESS_ENDPOINTS=Object.freeze({member:'',voucherPreview:'',voucherRedeem:'',voucherStatus:''});";
const testConfig="const BUSINESS_ENDPOINTS=Object.freeze({member:'"+BOUND+
  "/member',voucherPreview:'"+BOUND+"/preview',voucherRedeem:'"+BOUND+
  "/redeem',voucherStatus:'"+BOUND+"/status'});";
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function element(id=''){
  return {id,hidden:false,disabled:false,value:'',textContent:'',children:[],listeners:{},
    append(...xs){this.children.push(...xs);},
    replaceChildren(...xs){this.children=[...xs];},
    addEventListener(name,fn){this.listeners[name]=fn;},
    focus(){this.focused=true;}
  };
}
async function runtime({configured=false,provider,store={value:null},clockShiftMs=0,
  storageGet,afterStorageSet,monotonicClock=performance,catalogUrl,tabsCreate}={}){
  const [html,script]=await Promise.all([readFile(htmlPath,'utf8'),readFile(sourcePath,'utf8')]);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(row=>row[1]);
  const nodes=new Map(ids.map(id=>[id,element(id)]));
  const calls=[],storageCalls=[],tabCalls=[],reply=provider||(()=>{throw Error('No provider');});
  const request=async args=>{calls.push(args);return reply(args)};
  const etag=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const storage=async (operation,payload)=>{
    storageCalls.push(operation);
    if(operation==='storage.get')return {value:storageGet?await storageGet(store.value):store.value,etag:etag(store.value)};
    if(operation!=='storage.set')throw Error('Unexpected storage operation');
    if(store.failSet)throw Error('Storage quota or permission denied');
    if(payload.ifMatch!==etag(store.value))throw Error('E_STORAGE_CONFLICT');
    store.value=structuredClone(payload.value);
    await afterStorageSet?.(store.value);
    if(store.dropAck)throw Error('ack lost after durable save');
    return {saved:true};
  };
  const sdk={browser:{network:{request},tabs:{create:async args=>{
    tabCalls.push(args);
    return tabsCreate?tabsCreate(args):{tabRef:'foo'};
  }}}};
  const window={OpenDeskTool:{root:{querySelector:selector=>nodes.get(selector.slice(1))},
    request:storage},OpenDeskSDK:sdk};
  const document={createElement:tag=>element(tag)};
  let scriptText=configured?script.replace(originalConfig,testConfig):script;
  if(configured)assert.notEqual(scriptText,script,'fixture must override ONLY the release-disabled endpoints');
  if(catalogUrl!==undefined){
    const catalogConfig="const PRODUCT_CATALOG_URL='';";
    assert(scriptText.includes(catalogConfig),'catalog injection must remain VM-only');
    scriptText=scriptText.replace(catalogConfig,`const PRODUCT_CATALOG_URL=${JSON.stringify(catalogUrl)};`);
  }
  vm.runInNewContext(scriptText,{window,document,URL,
    Date:class extends Date {static now(){return Date.now()+clockShiftMs;}},
    performance:monotonicClock,Intl,Math,Set,Number,Array,
    Promise,crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}}, {timeout:2000});
  await flush();await flush();
  return {nodes,calls,storageCalls,tabCalls,store,flush};
}
const member=({entitlements=[],redemptions=[],account}={})=>({
  schemaVersion:1,serverNow:Date.now(),
  account:account??{state:'bound',id:'customer-123',displayNameMasked:'m***@example.org'},
  entitlements,redemptions
});
const time=(expiresAt=Date.now()+3*86400000)=>({type:'time',status:'active',
  title:'3 天体验权益',expiresAt});
const quota={type:'quota',status:'active',title:'请求配额',remaining:17,total:100,unit:'次'};
function node(env,name){return env.nodes.get('ai-vip-'+name)}

test('R5.2 official package grants scoped recovery storage but no network permission',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/ai-vip-share');
  assert.equal(pkg.version,'1.3.1');
  assert.equal(pkg.format,'opendesk.sidebar-tool.v2');
  assert.deepEqual(pkg.capabilities,['storage.local','network','browser.tabs','browser.proxy.managed']);
  assert.match(pkg.css,/opendesk\.shared-design\.v1/);
  assert(pkg.html.includes('id="ai-vip-benefits"'));
  assert(pkg.html.includes('id="ai-vip-history-list"'));
  assert(pkg.html.includes('aria-live="polite"'));
  assert(!/fetch\(|window\.open\(|chrome\.proxy|aiAccess\.activate/.test(pkg.js));
  assert(pkg.js.includes(originalConfig));
});
test('R5.1 without approved Provider disables all sensitive business controls',async()=>{
  const e=await runtime();
  assert.equal(node(e,'member-state').textContent,'服务未配置');
  assert.equal(node(e,'refresh').disabled,true);
  assert.equal(node(e,'redeem-code').disabled,true);
  assert.equal(node(e,'redeem').disabled,true);
  assert.equal(node(e,'shop-open').disabled,true);
  assert.deepEqual(e.calls,[]);
});
test('R5.1 verified time and quota show distinct values, server expiry and ledger',async()=>{
  const e=await runtime({configured:true,provider:async()=>({status:200,
    data:member({entitlements:[time(),quota],redemptions:[{
      redemptionId:'r-001',skuTitle:'体验包',status:'redeemed',
      redeemedAt:Date.UTC(2026,9,15),voucherPreviewMasked:'***-99'
    }]})})});
  assert.equal(node(e,'member-state').textContent,'权益有效');
  assert.equal(node(e,'remaining').textContent,'3');
  assert.equal(node(e,'remaining-unit').textContent,'天');
  assert.match(node(e,'expiry').textContent,/2026/);
  assert.equal(node(e,'benefits').children.length,2);
  assert.match(node(e,'benefits').children[1].children[1].textContent,/17 \/ 100 次/);
  assert.equal(node(e,'history-count').textContent,'1 条（本次核验）');
  assert.equal(node(e,'redeem-code').disabled,false);
  assert(e.calls.every(call=>call.url.startsWith(BOUND)));
});
test('R5.1 feature/quota does not invent monthly duration, and guest cannot redeem',async()=>{
  const e=await runtime({configured:true,provider:async()=>({status:200,data:member({
    account:{state:'guest'},entitlements:[],redemptions:[]})})});
  assert.equal(node(e,'member-state').textContent,'未登录');
  assert.equal(node(e,'redeem-code').disabled,true);
  assert.equal(node(e,'redeem').disabled,true);
});
test('R5.1 two-step voucher flow confirms account and passes exactly one idempotency key',async()=>{
  const calls=[];
  const e=await runtime({configured:true,provider:async args=>{
    calls.push(args);
    if(args.url.endsWith('/member')){
      return {status:200,data:member({entitlements:[quota],redemptions:[]})};
    }
    if(args.url.endsWith('/preview'))return {status:200,data:{
      previewId:'pre-012345',accountId:'customer-123',skuTitle:'请求配额包',
      grantSummary:'增加 20 次请求',voucherPreviewMasked:'***-99',
      expiresAt:Date.now()+120000}};
    if(args.url.endsWith('/redeem'))return {status:200,data:{
      status:'redeemed',idempotencyKey:args.data.idempotencyKey,accountId:'customer-123',
      redemptionId:'r-002',redeemedAt:Date.now(),
      grantedEntitlements:[quota]}};
    throw Error('unexpected endpoint');
  }});
  node(e,'redeem-code').value='SAMPLE-99';
  node(e,'redeem-code').listeners.input();
  assert.equal(node(e,'redeem').disabled,false);
  node(e,'redeem').listeners.click({isTrusted:true});
  await flush();await flush();
  assert.equal(node(e,'redeem').textContent,'确认兑换');
  assert.equal(node(e,'redeem-code').value,'');
  assert.equal(node(e,'redeem-preview').hidden,false);
  node(e,'redeem').listeners.click({isTrusted:true});
  await flush();await flush();await flush();await flush();
  assert.equal(calls.filter(c=>c.url.endsWith('/redeem')).length,1);
  assert.deepEqual(Object.keys(calls.find(c=>c.url.endsWith('/redeem')).data).sort(),
    ['accountId','idempotencyKey','previewId']);
  assert.equal(node(e,'redeem-preview').hidden,true);
  assert.match(node(e,'redeem-status').textContent,/已确认兑换成功/);
});
test('R5.1 ambiguous redemption never auto-retries an unknown side effect',async()=>{
  let posts=0;
  const e=await runtime({configured:true,provider:async args=>{
    if(args.url.endsWith('/member'))return {status:200,data:member()};
    if(args.url.endsWith('/preview'))return {status:200,data:{
      previewId:'pre-unknown',accountId:'customer-123',skuTitle:'权益',
      grantSummary:'服务端预览',voucherPreviewMasked:'****',expiresAt:Date.now()+120000}};
    if(args.url.endsWith('/redeem')){posts++;throw Error('timeout unknown');}
    throw Error('unhandled');
  }});
  node(e,'redeem-code').value='REDEEM123';
  node(e,'redeem-code').listeners.input();
  node(e,'redeem').listeners.click({isTrusted:true});await flush();await flush();
  node(e,'redeem').listeners.click({isTrusted:true});await flush();await flush();
  assert.equal(posts,1);
  assert.equal(node(e,'redeem').disabled,true);
  assert.match(node(e,'redeem-status').textContent,/结果未确认/);
  node(e,'redeem').listeners.click({isTrusted:true});await flush();
  assert.equal(posts,1);
});
test('R5.1 invalid Provider identity data fails closed',async()=>{
  const e=await runtime({configured:true,provider:async()=>({status:200,data:{
    schemaVersion:1,serverNow:Date.now(),account:{state:'bound',
      id:'c',displayNameMasked:'c***'},entitlements:[{type:'time',
      status:'active',title:'Bad',expiresAt:'tomorrow'}],redemptions:[]}})});
  assert.equal(node(e,'member-state').textContent,'无法核验');
  assert.equal(node(e,'redeem').disabled,true);
  assert.equal(node(e,'remaining').textContent,'—');
});

test('R5.2 write-ahead survives restart, never repeats consumption and reconciles final receipt',async()=>{
  const store={value:null},requests=[];
  const provider=async args=>{
    requests.push(args);
    if(args.url.endsWith('/member'))return {status:200,data:member()};
    if(args.url.endsWith('/preview'))return {status:200,data:{
      previewId:'pre-durable',accountId:'customer-123',skuTitle:'体验权益',
      grantSummary:'增加额度',voucherPreviewMasked:'****99',expiresAt:Date.now()+120000}};
    if(args.url.endsWith('/redeem')){
      assert.equal(store.value?.idempotencyKey,args.data.idempotencyKey,'journal precedes POST');
      throw Error('response disappeared after possible consumption');
    }
    if(args.url.endsWith('/status'))return {status:200,data:{
      status:'redeemed',accountId:'customer-123',idempotencyKey:store.value.idempotencyKey,
      redemptionId:'receipt-recovered',redeemedAt:Date.now(),grantedEntitlements:[quota]}};
    throw Error('Unknown provider URL');
  };
  const first=await runtime({configured:true,provider,store});
  node(first,'redeem-code').value='VOUCHER-123';
  node(first,'redeem-code').listeners.input();
  node(first,'redeem').listeners.click({isTrusted:true});
  await flush();await flush();
  node(first,'redeem').listeners.click({isTrusted:true});
  await flush();await flush();await flush();
  assert(store.value?.idempotencyKey);
  assert.equal(node(first,'redeem').disabled,true);
  assert.equal(requests.filter(row=>row.url.endsWith('/redeem')).length,1);
  const second=await runtime({configured:true,provider,store});
  assert.equal(node(second,'redeem').disabled,true);
  assert.equal(node(second,'recovery').hidden,false);
  node(second,'redeem-code').value='VOUCHER-123';
  node(second,'redeem').listeners.click({isTrusted:true});
  await flush();
  assert.equal(requests.filter(row=>row.url.endsWith('/redeem')).length,1);
  node(second,'recovery-check').listeners.click({isTrusted:true});
  await flush();await flush();await flush();
  assert.equal(store.value,null);
  assert.equal(requests.filter(row=>row.url.endsWith('/redeem')).length,1);
  assert.equal(requests.filter(row=>row.url.endsWith('/status')).length,1);
  assert.match(node(second,'redeem-status').textContent,/服务端已确认上次兑换成功/);
});
test('R5.2 pending status keeps lock; server-final rejection clears it',async()=>{
  const store={value:{schemaVersion:1,toolId:'ai-vip-share',packageVersion:'1.2.0',
    accountId:'customer-123',idempotencyKey:'22222222-2222-4222-8222-222222222222',
    createdAt:Date.now()}};
  let status='pending';
  const e=await runtime({configured:true,store,provider:async args=>{
    if(args.url.endsWith('/member'))return {status:200,data:member()};
    if(args.url.endsWith('/status'))return {status:200,data:{
      status,accountId:'customer-123',idempotencyKey:store.value.idempotencyKey,
      ...(status==='rejected'?{final:true}:{})}};
    throw Error('Consumption forbidden');
  }});
  assert.equal(node(e,'redeem').disabled,true);
  node(e,'recovery-check').listeners.click({isTrusted:true});
  await flush();await flush();
  assert(store.value);
  assert.match(node(e,'redeem-status').textContent,/仍未给出最终结论/);
  status='rejected';
  node(e,'recovery-check').listeners.click({isTrusted:true});
  await flush();await flush();
  assert.equal(store.value,null);
  assert.equal(node(e,'redeem-code').disabled,false);
});
test('R5.2 account switch cannot inherit a different account journal',async()=>{
  const store={value:{schemaVersion:1,toolId:'ai-vip-share',packageVersion:'1.2.0',
    accountId:'another-account',idempotencyKey:'33333333-3333-4333-8333-333333333333',
    createdAt:Date.now()}};
  const e=await runtime({configured:true,store,provider:async args=>{
    if(args.url.endsWith('/member'))return {status:200,data:member()};
    throw Error('No recovery or consumption under changed identity');
  }});
  assert.equal(node(e,'redeem').disabled,true);
  assert.equal(node(e,'recovery-check').disabled,true);
  assert.match(node(e,'recovery-status').textContent,/账号不一致/);
  assert(store.value);
  assert.equal(e.calls.filter(row=>row.url.endsWith('/status')||row.url.endsWith('/redeem')).length,0);
});
test('R5.2 storage failure blocks voucher POST before side effect',async()=>{
  const store={value:null,failSet:true};
  let posts=0;
  const e=await runtime({configured:true,store,provider:async args=>{
    if(args.url.endsWith('/member'))return {status:200,data:member()};
    if(args.url.endsWith('/preview'))return {status:200,data:{
      previewId:'pre-storage',accountId:'customer-123',skuTitle:'权益',
      grantSummary:'服务端核验',voucherPreviewMasked:'****',expiresAt:Date.now()+120000}};
    if(args.url.endsWith('/redeem'))posts++;
    throw Error('expected');
  }});
  node(e,'redeem-code').value='VOUCHER-123';
  node(e,'redeem-code').listeners.input();
  node(e,'redeem').listeners.click({isTrusted:true});
  await flush();await flush();
  node(e,'redeem').listeners.click({isTrusted:true});
  await flush();await flush();
  assert.equal(posts,0);
  assert.equal(node(e,'redeem').disabled,true);
  assert.match(node(e,'redeem-status').textContent,/无法确认本地兑换状态/);
});
test('R5.2 lost storage acknowledgement confirmed by readback sends once',async()=>{
  const store={value:null,dropAck:true};
  let posts=0;
  const e=await runtime({configured:true,store,provider:async args=>{
    if(args.url.endsWith('/member'))return {status:200,data:member()};
    if(args.url.endsWith('/preview'))return {status:200,data:{
      previewId:'pre-ack',accountId:'customer-123',skuTitle:'权益',
      grantSummary:'服务端核验',voucherPreviewMasked:'****',expiresAt:Date.now()+120000}};
    if(args.url.endsWith('/redeem')){posts++;throw Error('unknown');}
    throw Error('unhandled');
  }});
  node(e,'redeem-code').value='VOUCHER-123';
  node(e,'redeem-code').listeners.input();
  node(e,'redeem').listeners.click({isTrusted:true});
  await flush();await flush();
  node(e,'redeem').listeners.click({isTrusted:true});
  await flush();await flush();
  assert.equal(posts,1);
  assert.equal(store.value?.accountId,'customer-123');
  assert.equal(node(e,'redeem').disabled,true);
});

test('R5.2 device clock skew cannot extend preview or strand a persisted unknown POST',async()=>{
  for(const clientShift of [86400000,-86400000]){
    const store={value:null};
    let posts=0;
    const provider=async args=>{
      if(args.url.endsWith('/member'))return {status:200,data:member()};
      if(args.url.endsWith('/preview'))return {status:200,data:{
        previewId:'skew-preview',accountId:'customer-123',skuTitle:'权益',
        grantSummary:'服务端预检',voucherPreviewMasked:'****',expiresAt:Date.now()+90000}};
      if(args.url.endsWith('/redeem')){posts++;throw Error('unknown after possible use');}
      if(args.url.endsWith('/status'))return {status:200,data:{
        status:'rejected',final:true,accountId:'customer-123',
        idempotencyKey:store.value.idempotencyKey}};
      throw Error('Unexpected endpoint');
    };
    const first=await runtime({configured:true,store,provider,clockShiftMs:clientShift});
    node(first,'redeem-code').value='CLOCK-SKEW';
    node(first,'redeem-code').listeners.input();
    node(first,'redeem').listeners.click({isTrusted:true});
    await flush();await flush();
    assert.equal(node(first,'redeem').textContent,'确认兑换');
    node(first,'redeem').listeners.click({isTrusted:true});
    for(let i=0;i<6;i++)await flush();
    assert.equal(posts,1);
    assert(store.value,'a journal survives an unknown POST despite local clock drift');
    const second=await runtime({configured:true,store,provider,clockShiftMs:-clientShift});
    assert.equal(node(second,'recovery-check').disabled,false);
    node(second,'recovery-check').listeners.click({isTrusted:true});
    for(let i=0;i<6;i++)await flush();
    assert.equal(store.value,null,'authoritative final rejection unlocks despite a shifted local date');
    assert.equal(posts,1,'recovery never repeats voucher consumption');
  }
});

test('R5.2 rechecks live account before creating any consumption journal',async()=>{
  const store={value:null};
  let currentAccount='customer-123',posts=0;
  const provider=async args=>{
    if(args.url.endsWith('/member'))return {status:200,data:member({
      account:{state:'bound',id:currentAccount,displayNameMasked:'masked user'}})};
    if(args.url.endsWith('/preview'))return {status:200,data:{
      previewId:'before-account-change',accountId:'customer-123',skuTitle:'权益',
      grantSummary:'服务端预检',voucherPreviewMasked:'****',expiresAt:Date.now()+90000}};
    if(args.url.endsWith('/redeem'))posts++;
    throw Error('Unexpected endpoint');
  };
  const e=await runtime({configured:true,store,provider});
  node(e,'redeem-code').value='ACCOUNT-CHANGE';
  node(e,'redeem-code').listeners.input();
  node(e,'redeem').listeners.click({isTrusted:true});
  await flush();await flush();
  assert.equal(node(e,'redeem-preview').hidden,false);
  currentAccount='other-customer';
  node(e,'redeem').listeners.click({isTrusted:true});
  for(let i=0;i<5;i++)await flush();
  assert.equal(posts,0);
  assert.equal(store.value,null,'changed account must not write an unknown transaction');
  assert.equal(node(e,'redeem-preview').hidden,true);
  assert.equal(node(e,'recovery').hidden,true);
  assert.match(node(e,'redeem-status').textContent,/未提交兑换/);
});

test('R5.2 pre-submit member failure remains safely retryable without phantom journal',async()=>{
  const store={value:null};
  let memberCalls=0,posts=0;
  const e=await runtime({configured:true,store,provider:async args=>{
    if(args.url.endsWith('/member')){
      memberCalls++;
      if(memberCalls===1)return {status:200,data:member()};
      throw Error('identity offline before write-ahead');
    }
    if(args.url.endsWith('/preview'))return {status:200,data:{
      previewId:'retry-after-auth',accountId:'customer-123',skuTitle:'权益',
      grantSummary:'预检通过',voucherPreviewMasked:'****',expiresAt:Date.now()+90000}};
    if(args.url.endsWith('/redeem'))posts++;
    throw Error('unexpected');
  }});
  node(e,'redeem-code').value='CHECK-AGAIN';
  node(e,'redeem-code').listeners.input();
  node(e,'redeem').listeners.click({isTrusted:true});
  await flush();await flush();
  node(e,'redeem').listeners.click({isTrusted:true});
  for(let i=0;i<5;i++)await flush();
  assert.equal(posts,0);
  assert.equal(store.value,null);
  assert.equal(node(e,'recovery').hidden,true,'no phantom unknown-effect record');
  assert.equal(node(e,'redeem-code').disabled,false,'can re-preview when connection recovers');
  assert.match(node(e,'redeem-status').textContent,/未提交兑换/);
});

test('R5.2 explicit status lookup rechecks account after the UI was opened',async()=>{
  const store={value:{schemaVersion:1,toolId:'ai-vip-share',packageVersion:'1.2.0',
    accountId:'customer-123',idempotencyKey:'33333333-3333-4333-8333-333333333333',
    createdAt:Date.now()}};
  let currentAccount='customer-123',statusRequests=0;
  const e=await runtime({configured:true,store,provider:async args=>{
    if(args.url.endsWith('/member'))return {status:200,data:member({
      account:{state:'bound',id:currentAccount,displayNameMasked:'masked user'}})};
    if(args.url.endsWith('/status')){statusRequests++;throw Error('should not read old account');}
    throw Error('No voucher consumption allowed');
  }});
  assert.equal(node(e,'recovery-check').disabled,false);
  currentAccount='other-customer';
  node(e,'recovery-check').listeners.click({isTrusted:true});
  for(let i=0;i<5;i++)await flush();
  assert.equal(statusRequests,0);
  assert(store.value,'unknown effect retained for its rightful account');
  assert.equal(node(e,'recovery-check').disabled,true);
  assert.match(node(e,'recovery-status').textContent,/账号不一致/);
});

test('R5.2 rejects overlong previews even with a valid server member timestamp',async()=>{
  const e=await runtime({configured:true,provider:async args=>{
    if(args.url.endsWith('/member'))return {status:200,data:member()};
    if(args.url.endsWith('/preview'))return {status:200,data:{
      previewId:'too-long',accountId:'customer-123',skuTitle:'权益',
      grantSummary:'不可无限期确认',voucherPreviewMasked:'****',
      expiresAt:Date.now()+900000}};
    throw Error('no redemption should be sent');
  }});
  node(e,'redeem-code').value='TOO-LONG-PREVIEW';
  node(e,'redeem-code').listeners.input();
  node(e,'redeem').listeners.click({isTrusted:true});
  for(let i=0;i<4;i++)await flush();
  assert.equal(node(e,'redeem-preview').hidden,true);
  assert.match(node(e,'redeem-status').textContent,/无法核验兑换码/);
  assert(!e.calls.some(args=>args.url.endsWith('/redeem')));
});

test('R5.2 reordered six-field storage readback sends once and clears the journal',async()=>{
  const store={value:null},readbacks=[];
  const e=await runtime({configured:true,store,storageGet:value=>{
    if(value===null)return null;
    const reordered=Object.fromEntries(Object.entries(value).reverse());
    assert.equal(Object.keys(reordered).length,6);
    assert.notDeepEqual(Object.keys(reordered),Object.keys(value));
    readbacks.push(reordered);
    return reordered;
  },provider:async args=>{
    if(args.url.endsWith('/member'))return {status:200,data:member()};
    if(args.url.endsWith('/preview'))return {status:200,data:{
      previewId:'pre-reordered',accountId:'customer-123',skuTitle:'权益',
      grantSummary:'服务端核验',voucherPreviewMasked:'****',expiresAt:Date.now()+120000}};
    if(args.url.endsWith('/redeem')){
      assert.equal(store.value?.idempotencyKey,args.data.idempotencyKey);
      return {status:200,data:{status:'redeemed',accountId:'customer-123',
        idempotencyKey:args.data.idempotencyKey,redemptionId:'receipt-reordered',
        redeemedAt:Date.now(),grantedEntitlements:[quota]}};
    }
    throw Error('Unexpected Provider request');
  }});
  node(e,'redeem-code').value='REORDER-123';
  node(e,'redeem-code').listeners.input();
  node(e,'redeem').listeners.click({isTrusted:true});
  await flush();await flush();
  node(e,'redeem').listeners.click({isTrusted:true});
  for(let i=0;i<5;i++)await flush();
  assert(readbacks.length>0,'readback must exercise reordered journal keys');
  assert.equal(e.calls.filter(args=>args.url.endsWith('/redeem')).length,1);
  assert.equal(store.value,null);
  assert.equal(e.storageCalls.filter(operation=>operation==='storage.set').length,2);
  assert.equal(node(e,'recovery').hidden,true);
  assert.match(node(e,'redeem-status').textContent,/已确认兑换成功/);
});

test('R5.2 preview expiry during journal persistence forbids consumption and retains recovery',async()=>{
  const store={value:null};let elapsed=0;
  const e=await runtime({configured:true,store,monotonicClock:{now:()=>elapsed},
    afterStorageSet:value=>{if(value!==null)elapsed+=180000;},provider:async args=>{
      if(args.url.endsWith('/member'))return {status:200,data:member()};
      if(args.url.endsWith('/preview'))return {status:200,data:{
        previewId:'pre-write-expiry',accountId:'customer-123',skuTitle:'权益',
        grantSummary:'服务端核验',voucherPreviewMasked:'****',expiresAt:Date.now()+120000}};
      throw Error('No consumption request is allowed');
    }});
  node(e,'redeem-code').value='EXPIRE-123';
  node(e,'redeem-code').listeners.input();
  node(e,'redeem').listeners.click({isTrusted:true});
  await flush();await flush();
  assert.equal(node(e,'redeem').textContent,'确认兑换');
  node(e,'redeem').listeners.click({isTrusted:true});
  for(let i=0;i<5;i++)await flush();
  assert.equal(elapsed,180000,'clock advances only after durable journal write');
  assert.equal(e.calls.filter(args=>args.method==='POST'&&args.url.endsWith('/redeem')).length,0);
  assert.equal(store.value?.accountId,'customer-123');
  assert.equal(store.value?.packageVersion,'1.3.1');
  assert.equal(e.storageCalls.filter(operation=>operation==='storage.set').length,1);
  assert.equal(node(e,'recovery').hidden,false);
  assert.equal(node(e,'redeem').disabled,true);
  node(e,'redeem').listeners.click({isTrusted:true});
  await flush();await flush();
  assert.equal(e.calls.filter(args=>args.url.endsWith('/redeem')).length,0);
  assert(store.value,'journal remains pending explicit reconciliation');
});

test('R5.2 recovery-check retries a transient storage read independently of Provider',async()=>{
  const record={schemaVersion:1,toolId:'ai-vip-share',packageVersion:'1.3.1',
    accountId:'customer-123',idempotencyKey:'33333333-3333-4333-8333-333333333333',createdAt:Date.now()};
  const store={value:record};let reads=0;
  const e=await runtime({store,storageGet:value=>{
    if(++reads===1)throw Error('Temporary storage outage');
    return structuredClone(value);
  }});
  assert.equal(reads,1);
  assert.equal(node(e,'recovery-check').textContent,'重试读取恢复记录');
  assert.equal(node(e,'recovery-check').disabled,false);
  node(e,'recovery-check').listeners.click({isTrusted:false});
  await flush();
  assert.equal(reads,1);
  node(e,'recovery-check').listeners.click({isTrusted:true});
  for(let i=0;i<4;i++)await flush();
  assert.equal(reads,2);
  assert.notEqual(node(e,'recovery-check').textContent,'重试读取恢复记录');
  assert.equal(node(e,'recovery').hidden,false);
  assert.equal(node(e,'redeem').disabled,true);
  assert.deepEqual(store.value,record);
  assert.deepEqual(e.calls,[],'storage recovery must not require a Provider or issue a POST');
  assert.equal(e.storageCalls.filter(operation=>operation==='storage.set').length,0);
});

test('R5.2 storage retry clears an obsolete fault when no transaction is pending',async()=>{
  let reads=0;
  const e=await runtime({storageGet:value=>{
    if(++reads===1)throw Error('Temporary storage outage');
    return value;
  }});
  assert.equal(node(e,'recovery-check').disabled,false);
  node(e,'recovery-check').listeners.click({isTrusted:true});
  for(let i=0;i<4;i++)await flush();
  assert.equal(node(e,'recovery').hidden,true);
  assert.equal(node(e,'redeem-error').hidden,true);
  assert.match(node(e,'redeem-status').textContent,/恢复记录已核对.*仍未配置/);
  assert.equal(node(e,'redeem').disabled,true);
  assert.deepEqual(e.calls,[]);
});

test('R5.2 fixed HTTPS catalog requires trust, coalesces in-flight clicks and recovers after SDK rejection',async()=>{
  const catalogUrl='https://catalog.example.org/products';
  let rejectOpen;
  const e=await runtime({catalogUrl,tabsCreate:()=>new Promise((resolve,reject)=>{rejectOpen=reject;})});
  assert.equal(node(e,'shop-open').disabled,false);
  node(e,'shop-open').listeners.click({isTrusted:false});
  node(e,'shop-open').listeners.click({});
  await flush();
  assert.equal(e.tabCalls.length,0);
  node(e,'shop-open').listeners.click({isTrusted:true});
  node(e,'shop-open').listeners.click({isTrusted:true});
  await flush();
  assert.equal(e.tabCalls.length,1);
  assert.deepEqual(Object.keys(e.tabCalls[0]),['url']);
  assert.equal(e.tabCalls[0].url,catalogUrl);
  assert.equal(node(e,'shop-open').disabled,true);
  node(e,'shop-open').listeners.click({isTrusted:true});
  await flush();
  assert.equal(e.tabCalls.length,1,'pending SDK request must stay single-flight');
  rejectOpen(Error('Browser SDK permission denied'));
  await flush();await flush();
  assert.equal(node(e,'shop-open').disabled,false);
  assert.match(node(e,'shop-status').textContent,/未能打开商品目录/);
  assert.deepEqual(e.calls,[]);
  node(e,'shop-open').listeners.click({isTrusted:true});
  await flush();
  assert.equal(e.tabCalls.length,2,'button is usable again after rejection');
  rejectOpen(Error('Denied again'));
  await flush();await flush();
  assert.equal(node(e,'shop-open').disabled,false);
});
