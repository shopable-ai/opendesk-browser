import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPageDependencyResolver} from '../../src/ui/page-dependencies.js';
import {createPageDependencyReview} from '../../src/ui/page-dependency-review.js';

// Component doubles only. Real Chrome click/download/USER_SCRIPT evidence is separate.
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{for(let i=0;i<8;i++)await tick();};
const code='globalThis.reviewLibrary={sum:(a,b)=>a+b};';
const sha256=createHash('sha256').update(code).digest('hex');
const url='https://library.example.org/library.min.js';
const source='// ==UserScript==\n// @require '+url+'\n// ==/UserScript==\nasync function main(){return reviewLibrary.sum(1,2)}';
class Element {
  children=[];listeners=new Map();hidden=false;disabled=false;checked=false;value='';
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(key,value){this[key]=value;}
  addEventListener(key,fn){this.listeners.set(key,fn);}
  removeEventListener(key){this.listeners.delete(key);}
  remove(){}
  fire(key,event={isTrusted:true}){this.listeners.get(key)?.(event);}
}
function fixture({permission=true,prepareGate,readCode=code}={}) {
  let text=source,available=true,granted=permission,reviewUI;
  const parent=new Element(),requests=[],permissions=[];
  const doc={getElementById:()=>parent,createElement:()=>new Element()};
  const entry={order:0,url,resolvedUrl:url,sourceKind:'https',sha256,byteLength:code.length,license:{status:'unknown'},risk:'第三方代码可访问授权 DOM'};
  const report={manifestDigest:'manifest-1',requires:[entry],locks:[]};
  const client={ready:Promise.resolve(),async request(method,input){
    requests.push({method,input:structuredClone(input)});
    if(method==='inspectPageDependencies')return report;
    if(method==='preparePageDependencies'){if(prepareGate)await prepareGate;return {reviewId:'review-1',manifestDigest:'manifest-1',entries:[entry]};}
    if(method==='readPageDependencyReview')return {reviewId:'review-1',order:0,sha256,code:readCode};
    if(method==='approvePageDependencies')return {lockId:'dep-lock-'+sha256,manifestDigest:'manifest-1'};
    throw Error('unexpected execution '+method);
  }};
  const api={permissions:{contains:async()=>granted,request:input=>{permissions.push(input);granted=true;return Promise.resolve(true);}}};
  const resolver=createPageDependencyResolver({client,getSource:()=>text,onState:()=>reviewUI?.update()});
  reviewUI=createPageDependencyReview({client,resolver,getSource:()=>text,document:doc,api,isAvailable:()=>available});
  const find=id=>{const walk=node=>node.id===id?node:node.children.map(walk).find(Boolean);return walk(parent);};
  return {requests,permissions,resolver,ui:reviewUI,find,
    edit(value){text=value;resolver.refresh();reviewUI.update();},unavailable(){available=false;reviewUI.update();},available(){available=true;reviewUI.update();},
    async click(id,event){find(id).fire('click',event);await settle();},
    async read(){find('network-js-sources').children[0].fire('click');await settle();},
    check(){find('network-js-consent').checked=true;find('network-js-consent').fire('change');},
    dispose(){reviewUI.dispose();resolver.dispose();}};
}
test('trusted preparation, exact cached source inspection and hash approval are separate; none execute the page',async t=>{
  const f=fixture({permission:false});t.after(()=>f.dispose());await settle();
  assert.equal(f.requests.length,1);assert.equal(f.permissions.length,0);
  await f.click('network-js-prepare',{isTrusted:false});assert.equal(f.requests.length,1);
  await f.click('network-js-prepare');assert.equal(f.permissions.length,1);
  assert.deepEqual(f.permissions[0],{origins:['https://library.example.org/*']});
  assert.throws(()=>f.resolver.capture(),error=>error.code==='E_DEPENDENCY_UNLOCKED');
  f.check();assert.equal(f.find('network-js-approve').disabled,true,'all sources must be displayed first');
  await f.read();assert.equal(f.find('network-js-sources').children[1].value,code);
  assert.equal(f.find('network-js-approve').disabled,false);
  await f.click('network-js-approve',{isTrusted:false});assert.equal(f.requests.some(r=>r.method==='approvePageDependencies'),false);
  await f.click('network-js-approve');assert.equal(f.resolver.capture().lockId,'dep-lock-'+sha256);
  assert.equal(f.find('network-js-approve').disabled,true);
  assert.match(f.find('network-js-status').textContent,/网页尚未运行/);
  assert.deepEqual(f.requests.at(-1).input,{reviewId:'review-1',explicitUserAction:true,acceptedHashes:[sha256]});
});
test('cached source hash mismatch stays visible and cannot enable approval',async t=>{
  const f=fixture({readCode:code+'tampered'});t.after(()=>f.dispose());await settle();
  await f.click('network-js-prepare');f.check();await f.read();
  assert.match(f.find('network-js-status').textContent,/E_DEPENDENCY_HASH/);
  assert.equal(f.find('network-js-approve').disabled,true);
});
test('editing while downloading preserves an unapproved historical review without attaching it to new source',async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const f=fixture({prepareGate:gate});t.after(()=>f.dispose());await settle();
  f.find('network-js-prepare').fire('click');await settle();f.edit(source+'\n// edited');release();await settle();
  assert.match(f.find('network-js-status').textContent,/E_DEPENDENCY_LOCK_STALE/);
  assert.equal(f.find('network-js-metadata').hidden,true);
  assert.equal(f.requests.some(r=>r.method==='approvePageDependencies'),false);
});
test('body edits invalidate a displayed review and a changed mode cannot approve hidden review controls',async t=>{
  const f=fixture();t.after(()=>f.dispose());await settle();await f.click('network-js-prepare');await f.read();f.check();
  f.edit(source+'\n// edited');assert.equal(f.find('network-js-approve').hidden,true);
  await f.click('network-js-approve');assert.equal(f.requests.some(r=>r.method==='approvePageDependencies'),false);
  f.unavailable();assert.equal(f.find('network-js-review').hidden,true);
});

for(const transition of ['source-return','mode-return'])test('a delayed download cannot revive review after '+transition,async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const f=fixture({prepareGate:gate});t.after(()=>f.dispose());await settle();
  f.find('network-js-prepare').fire('click');await settle();
  if(transition==='source-return'){f.edit(source+'\n// transient');f.edit(source);}
  else {f.unavailable();f.available();}
  release();await settle();
  assert.match(f.find('network-js-status').textContent,/E_DEPENDENCY_LOCK_STALE/);
  assert.equal(f.find('network-js-metadata').hidden,true);
  assert.equal(f.requests.some(row=>row.method==='approvePageDependencies'),false);
});
