import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPageDependencyResolver} from '../../src/ui/page-dependencies.js';
import {createPageDependencyReview} from '../../src/ui/page-dependency-review.js';
import {createDeveloperView} from '../../src/ui/develop-view.js';

// Component doubles only. Real Chrome click/download/USER_SCRIPT evidence is separate.
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{for(let i=0;i<8;i++)await tick();};
const waitFor=async check=>{const end=Date.now()+3000;
  while(Date.now()<end){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.fail('cache verification did not finish within the bounded wait');
};
const code='globalThis.reviewLibrary={sum:(a,b)=>a+b};';
const sha256=createHash('sha256').update(code).digest('hex');
const url='https://library.example.org/library.min.js';
const source='// ==UserScript==\n// @require '+url+'\n// ==/UserScript==\nasync function main(){return reviewLibrary.sum(1,2)}';
function fixture({permission=true,prepareGate,readGate,readCode=code,esm=false}={}) {
  let text=esm?"import value from 'https://library.example.org/v1.0.0/value.js';\nexport default async function main(){return value;}":source,
    available=true,granted=permission,reviewUI;
  const view=createDeveloperView(),requests=[],permissions=[];
  const dependencyURL=esm?'https://library.example.org/v1.0.0/value.js':url;
  const entry={order:0,url:dependencyURL,resolvedUrl:dependencyURL,sourceKind:'https',sha256,byteLength:code.length,license:{status:'unknown'},risk:'第三方代码可访问授权 DOM'};
  const report={manifestDigest:'manifest-1',requires:[entry],locks:[],
    ...(esm?{sourceFormat:'esm-page',world:'USER_SCRIPT'}:{})};
  const client={ready:Promise.resolve(),async request(method,input){
    requests.push({method,input:structuredClone(input)});
    if(method==='inspectPageDependencies')return report;
    if(method==='preparePageDependencies'){if(prepareGate)await prepareGate;return {reviewId:'review-1',manifestDigest:'manifest-1',entries:[entry]};}
    if(method==='readPageDependencyReview'){if(readGate)await readGate;return {reviewId:'review-1',order:0,sha256,code:readCode};}
    if(method==='approvePageDependencies')return {lockId:'dep-lock-'+sha256,manifestDigest:'manifest-1'};
    throw Error('unexpected execution '+method);
  }};
  const api={permissions:{contains:async()=>granted,request:input=>{permissions.push(input);granted=true;return Promise.resolve(true);}}};
  const resolver=createPageDependencyResolver({client,getSource:()=>text,onState:()=>reviewUI?.update()});
  reviewUI=createPageDependencyReview({client,resolver,getSource:()=>text,view,api,isAvailable:()=>available});
  const state=()=>view.getSnapshot().dependencies.network,actions=view.actions.pageDependencyReview;
  return {requests,permissions,resolver,ui:reviewUI,state,actions,
    edit(value){text=value;resolver.refresh();reviewUI.update();},unavailable(){available=false;reviewUI.update();},available(){available=true;reviewUI.update();},
    async invoke(name,event={isTrusted:true}){await actions[name](event);await settle();},
    async read(){
      void actions.readSource({isTrusted:true},0,state().review.reviewId);
      await waitFor(()=>!state().busy&&(state().review?.entries[0]?.code!==undefined||/E_[A-Z_]+/.test(state().status)));
    },
    check(){actions.accept(true,state().review.reviewId);},
    dispose(){reviewUI.dispose();resolver.dispose();view.dispose();}};
}
test('trusted preparation, exact cached source inspection and hash approval are separate; none execute the page',async t=>{
  const f=fixture({permission:false});t.after(()=>f.dispose());await settle();
  assert.equal(f.requests.length,1);assert.equal(f.permissions.length,0);
  await f.invoke('prepare',{isTrusted:false});assert.equal(f.requests.length,1);
  await f.invoke('prepare');assert.equal(f.permissions.length,1);
  assert.deepEqual(f.permissions[0],{origins:['https://library.example.org/*']});
  assert.throws(()=>f.resolver.capture(),error=>error.code==='E_DEPENDENCY_UNLOCKED');
  f.check();assert.equal(f.state().approveDisabled,true,'all sources must be displayed first');
  await f.read();assert.equal(f.state().review.entries[0].code,code);
  assert.equal(f.state().approveDisabled,false);
  await f.invoke('approve',{isTrusted:false});assert.equal(f.requests.some(r=>r.method==='approvePageDependencies'),false);
  await f.invoke('approve');assert.equal(f.resolver.capture().lockId,'dep-lock-'+sha256);
  assert.equal(f.state().approveDisabled,true);
  assert.match(f.state().status,/网页尚未运行/);
  assert.deepEqual(f.requests.at(-1).input,{reviewId:'review-1',explicitUserAction:true,acceptedHashes:[sha256]});
});
test('cached source hash mismatch stays visible and cannot enable approval',async t=>{
  let release;const readGate=new Promise(resolve=>{release=resolve;});
  const f=fixture({readCode:code+'tampered',readGate});t.after(()=>f.dispose());await settle();
  await f.invoke('prepare');f.check();const read=f.read();await settle();
  assert.equal(f.state().approveDisabled,true,'pending cache verification cannot enable approval');
  release();await read;
  assert.match(f.state().status,/E_DEPENDENCY_HASH/);
  assert.equal(f.state().approveDisabled,true);
});
test('editing while downloading preserves an unapproved historical review without attaching it to new source',async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const f=fixture({prepareGate:gate});t.after(()=>f.dispose());await settle();
  void f.actions.prepare({isTrusted:true});await settle();f.edit(source+'\n// edited');release();await settle();
  assert.match(f.state().status,/E_DEPENDENCY_LOCK_STALE/);
  assert.equal(f.state().review===null,true);
  assert.equal(f.requests.some(r=>r.method==='approvePageDependencies'),false);
});
test('body edits invalidate a displayed review and a changed mode cannot approve hidden review controls',async t=>{
  const f=fixture();t.after(()=>f.dispose());await settle();await f.invoke('prepare');await f.read();f.check();
  f.edit(source+'\n// edited');assert.equal(f.state().review===null,true);
  await f.invoke('approve');assert.equal(f.requests.some(r=>r.method==='approvePageDependencies'),false);
  f.unavailable();assert.equal(!f.state().visible,true);
});

for(const transition of ['source-return','mode-return'])test('a delayed download cannot revive review after '+transition,async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const f=fixture({prepareGate:gate});t.after(()=>f.dispose());await settle();
  void f.actions.prepare({isTrusted:true});await settle();
  if(transition==='source-return'){f.edit(source+'\n// transient');f.edit(source);}
  else {f.unavailable();f.available();}
  release();await settle();
  assert.match(f.state().status,/E_DEPENDENCY_LOCK_STALE/);
  assert.equal(f.state().review===null,true);
  assert.equal(f.requests.some(row=>row.method==='approvePageDependencies'),false);
});

test('Page ESM Run requests the pre-observed original HTTPS origin synchronously and never runs during permission grant',async t=>{
  const f=fixture({permission:false,esm:true});t.after(()=>f.dispose());await settle();
  assert.equal(f.ui.readyForRun,true,'the ESM source origin was inspected before the click');
  assert.equal(f.permissions.length,0,'typing/inspection cannot request permission');
  await assert.rejects(f.ui.confirmRun({isTrusted:false}),{code:'E_GESTURE'});
  await f.ui.confirmRun({isTrusted:true});
  assert.deepEqual(f.permissions,[{origins:['https://library.example.org/*']}]);
  assert.equal(f.requests.filter(r=>/preparePageDependencies|approvePageDependencies/.test(r.method)).length,0,
    'a trusted Page Run gesture authorizes Chrome origin but does not approve or execute dependencies');
});
