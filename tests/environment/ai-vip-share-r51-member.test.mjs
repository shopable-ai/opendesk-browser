import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const sourcePath='examples/sidebar-tools/ai-vip-share/src/main.js';
const htmlPath='examples/sidebar-tools/ai-vip-share/src/index.html';
const BOUND='https://members.example.org'; // VM-only fixture; never a production endpoint.
const originalConfig="const BUSINESS_ENDPOINTS=Object.freeze({member:'',voucherPreview:'',voucherRedeem:''});";
const testConfig="const BUSINESS_ENDPOINTS=Object.freeze({member:'"+BOUND+
  "/member',voucherPreview:'"+BOUND+"/preview',voucherRedeem:'"+BOUND+"/redeem'});";
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function element(id=''){
  return {id,hidden:false,disabled:false,value:'',textContent:'',children:[],listeners:{},
    append(...xs){this.children.push(...xs);},
    replaceChildren(...xs){this.children=[...xs];},
    addEventListener(name,fn){this.listeners[name]=fn;},
    focus(){this.focused=true;}
  };
}
async function runtime({configured=false,provider}={}){
  const [html,script]=await Promise.all([readFile(htmlPath,'utf8'),readFile(sourcePath,'utf8')]);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(row=>row[1]);
  const nodes=new Map(ids.map(id=>[id,element(id)]));
  const calls=[],reply=provider||(()=>{throw Error('No provider');});
  const request=async args=>{calls.push(args);return reply(args)};
  const sdk={browser:{network:{request},tabs:{create:async()=>({tabRef:'foo'})}}};
  const window={OpenDeskTool:{root:{querySelector:selector=>nodes.get(selector.slice(1))}},
    OpenDeskSDK:sdk};
  const document={createElement:tag=>element(tag)};
  const scriptText=configured?script.replace(originalConfig,testConfig):script;
  if(configured)assert.notEqual(scriptText,script,'fixture must override ONLY the release-disabled endpoints');
  vm.runInNewContext(scriptText,{window,document,URL,Date,Intl,Math,Set,Number,Array,
    Promise,crypto:{randomUUID:()=> 'txn-test-01234567'}}, {timeout:2000});
  await flush();await flush();
  return {nodes,calls,flush};
}
const member=({entitlements=[],redemptions=[],account}={})=>({
  schemaVersion:1,serverNow:Date.UTC(2026,9,15),
  account:account??{state:'bound',id:'customer-123',displayNameMasked:'m***@example.org'},
  entitlements,redemptions
});
const time=(expiresAt=Date.UTC(2026,9,18))=>({type:'time',status:'active',
  title:'3 天体验权益',expiresAt});
const quota={type:'quota',status:'active',title:'请求配额',remaining:17,total:100,unit:'次'};
function node(env,name){return env.nodes.get('ai-vip-'+name)}

test('R5.1 actual installed package keeps fail-closed v1 capability, canonical CSS and 1.1.1 upgrade',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/ai-vip-share');
  assert.equal(pkg.version,'1.1.1');
  assert.deepEqual(pkg.capabilities,['ai.access']);
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
      expiresAt:Date.now()+300000}};
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
      grantSummary:'服务端预览',voucherPreviewMasked:'****',expiresAt:Date.now()+300000}};
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
