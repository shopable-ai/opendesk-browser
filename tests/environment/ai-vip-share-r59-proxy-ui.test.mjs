import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const base='examples/sidebar-tools/ai-vip-share/';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const released={state:'disabled',control:'controllable_by_this_extension',permission:true,canStop:false,reason:null};
const owned={...released,state:'enabled',control:'controlled_by_this_extension',canStop:true};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function runtime({status=()=>released,start=async()=>owned,stop=async()=>released,configured=false,expired=false}={}){
  const [html,original]=await Promise.all(['src/index.html','src/main.js'].map(p=>readFile(base+p,'utf8')));
  const nodes=new Map([...html.matchAll(/\bid="([^" ]+)"/g)].map(([,id])=>[id,{id,hidden:false,disabled:false,value:'',textContent:'',listeners:{},children:[],attributes:{},style:{},
    classList:{toggle(){}},setAttribute(name,value){this.attributes[name]=String(value)},removeAttribute(name){delete this.attributes[name]},
    append(...xs){this.children.push(...xs)},replaceChildren(...xs){this.children=xs},addEventListener(type,fn){this.listeners[type]=fn},focus(){}}]));
  const calls=[];
  const proxy={getStatus:async()=>{calls.push('status');return status()},requestEnable:async arg=>{calls.push('start');return start(arg)},requestDisable:async()=>{calls.push('stop');return stop()}};
  let script=original;
  if(configured){
    script=script.replace("const BUSINESS_ENDPOINTS=Object.freeze({member:'',voucherPreview:'',voucherRedeem:'',voucherStatus:''});",
      "const BUSINESS_ENDPOINTS=Object.freeze({member:'https://members.example.org/member',voucherPreview:'https://members.example.org/preview',voucherRedeem:'https://members.example.org/redeem',voucherStatus:'https://members.example.org/status'});");
    assert.notEqual(script,original,'business fixture must match release endpoints');
    script=script.replace('const APPROVED_PROXY_ENDPOINT=null;',"const APPROVED_PROXY_ENDPOINT={scheme:'https',host:'proxy.example.org',port:443};");
  }
  const window={OpenDeskTool:{root:{querySelector:s=>nodes.get(s.slice(1))},request:async()=>({value:null,etag:createHash('sha256').update('null').digest('hex')})},
    OpenDeskSDK:{browser:{proxy:{managed:proxy},network:{request:async()=>({status:200,data:{schemaVersion:1,serverNow:Date.now(),account:{state:'bound',id:'member',displayNameMasked:'m***'},entitlements:[{type:'time',status:'active',title:'fixture only',expiresAt:Date.now()+(expired?-60000:60000)}],redemptions:[]}})}}}};
  vm.runInNewContext(script,{window,document:{createElement:()=>({children:[],append(...xs){this.children.push(...xs)}})},URL,Date,Intl,performance,crypto:{randomUUID:()=>crypto.randomUUID()}});
  await flush();await flush();
  return {get:name=>nodes.get('ai-vip-'+name),calls,click:async(name,trusted=true)=>{nodes.get('ai-vip-'+name).listeners.click({isTrusted:trusted});await flush();await flush();},flush};
}

test('formal core keeps member/redeem/shop/proxy order and one proxy action',async()=>{
  const html=await readFile(base+'src/index.html','utf8');
  assert(html.indexOf('aria-labelledby="ai-vip-redeem-title"')<html.indexOf('aria-labelledby="ai-vip-proxy-title"'));
  assert(html.indexOf('aria-label="更多商品"')<html.indexOf('aria-labelledby="ai-vip-proxy-title"'));
  const e=await runtime();
  assert.equal(e.get('proxy-toggle').attributes['data-action'],'start');
  assert.equal(e.get('proxy-toggle').textContent,'启用代理');
});
test('formal START in flight exposes STOP and late START cannot overwrite release',async()=>{
  const start=deferred();let state=released;
  const e=await runtime({configured:true,status:()=>state,start:()=>start.promise,stop:async()=>{state=released;return released}});
  assert.equal(e.get('proxy-toggle').disabled,false,'verified membership updates the proxy control');
  await e.click('proxy-toggle',false);assert(!e.calls.includes('start'));
  await e.click('proxy-toggle');assert(e.calls.includes('start'));
  assert.equal(e.get('proxy-toggle').disabled,false);
  assert.equal(e.get('proxy-toggle').attributes['data-action'],'stop');
  await e.click('proxy-toggle');assert.equal(e.calls.filter(x=>x==='stop').length,1);
  assert.doesNotMatch(e.get('proxy-state').textContent,/已停止/,'unsettled START is not a confirmed release');
  start.resolve(owned);await flush();await flush();await flush();
  assert.equal(e.get('proxy-state').textContent,'已停止');
  assert.equal(e.get('proxy-toggle').attributes['data-action'],'start');
});
test('formal STOP survives Provider absence and pending status read; duplicates are blocked',async()=>{
  const read=deferred(),stop=deferred();let reads=0;
  const e=await runtime({status:()=>++reads===1?owned:read.promise,stop:()=>stop.promise});
  assert.equal(e.get('proxy-toggle').attributes['data-action'],'stop');assert.equal(e.get('proxy-toggle').disabled,false);
  await e.click('proxy-refresh');assert.equal(e.get('proxy-toggle').disabled,false);
  await e.click('proxy-toggle');await e.click('proxy-toggle');
  assert.equal(e.calls.filter(x=>x==='stop').length,1);
  stop.resolve(released);await flush();await flush();
  read.resolve(owned);await flush();await flush();
  assert.equal(e.get('proxy-state').textContent,'已停止','old read must not revive enabled');
  assert.equal(e.calls.filter(x=>x==='start').length,0);
});
test('formal STOP remains available after verified time entitlement expires',async()=>{
  const e=await runtime({configured:true,expired:true,status:()=>owned});
  assert.equal(e.get('proxy-toggle').attributes['data-action'],'stop');
  assert.equal(e.get('proxy-toggle').disabled,false);
  await e.click('proxy-toggle');
  assert.equal(e.calls.filter(x=>x==='stop').length,1);
  assert.equal(e.get('proxy-state').textContent,'已停止');
  assert.equal(e.get('proxy-toggle').disabled,true);
  assert(!e.calls.includes('start'));
});
test('formal unknown ownership never claims STOP success and keeps recovery actionable',async()=>{
  const unknown={...owned,state:'unavailable',control:'unknown'};
  const e=await runtime({status:()=>unknown,stop:async()=>({...released,control:'unknown'})});
  await e.click('proxy-toggle');
  assert.doesNotMatch(e.get('proxy-state').textContent,/已停止/);
  assert.equal(e.get('proxy-toggle').disabled,false);
  assert.match(e.get('proxy-detail').textContent,/未确认|无法确认|待确认/);
});
test('formal STOP failure remains visible after render and status failure does not forget owned intent',async()=>{
  let failRead=false;
  const e=await runtime({status:()=>{if(failRead)throw Object.assign(Error(),{code:'E_STATUS_OFFLINE'});return owned},stop:async()=>{throw Object.assign(Error(),{code:'E_OUTCOME_UNKNOWN'})}});
  await e.click('proxy-toggle');assert.match(e.get('proxy-detail').textContent,/E_OUTCOME_UNKNOWN/);
  failRead=true;await e.click('proxy-refresh');
  assert.equal(e.get('proxy-toggle').disabled,false);
  assert.doesNotMatch(e.get('proxy-state').textContent,/已停止|已启用/);
  assert.match(e.get('proxy-detail').textContent,/E_STATUS_OFFLINE/);
});
