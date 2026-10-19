import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createPageDependencyResolver} from '../../src/ui/page-dependencies.js';
import {createPageDependencyInstaller} from '../../src/ui/page-dependency-install.js';
import {createPageDependencyReview} from '../../src/ui/page-dependency-review.js';

// Actual controllers/resolver and React fragment, with a broker/Chrome test
// double. This is model/DOM evidence, not native Chrome installation evidence.
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{for(let i=0;i<8;i++)await tick();};
const trusted={isTrusted:true},synthetic={isTrusted:false};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const code='globalThis.fixedLibrary={answer:42};';
const hash=createHash('sha256').update(code).digest('hex'),digest='d'.repeat(64);
const url='https://library.example.org/lib@1.0.0/index.js';
const classicSource='// ==UserScript==\n// @require '+url+'\n// ==/UserScript==\nasync function main(){return fixedLibrary.answer;}';
const esmSource="import value from '"+url+"';\nexport default async function main(){return value;}";

function fixture({network=false,shared=false,twoLocks=false,prepareGate,readCode=code,readGate,replyWorld}={}){
  let source=network?esmSource:classicSource,program='alpha',available=true,blocked=false,granted=false,inGesture=false,controller;
  const view=createDeveloperView(),calls=[],permissionCalls=[],locks=new Map(),added=new Set(),removed=new Set();
  const eventPort=set=>({addListener:fn=>set.add(fn),removeListener:fn=>set.delete(fn)});
  const api={permissions:{contains:async()=>granted,request(input){
    assert.equal(inGesture,true,'permission requests must stay in the original trusted click stack');
    permissionCalls.push(input);granted=true;return Promise.resolve(true);
  },onAdded:eventPort(added),onRemoved:eventPort(removed)}};
  const entry={order:0,url,resolvedUrl:url,name:'fixedLibrary',version:'1.0.0',sourceKind:'https',
    sha256:hash,byteLength:code.length,world:'USER_SCRIPT',license:{name:'MIT'},risk:'Third-party DOM access',
    cacheChoices:[],sharedCacheChoices:shared?[{sha256:hash}]:[],downloadError:null};
  const worldFor=format=>format==='esm-controller'?'CONTROLLER':'USER_SCRIPT';
  const client={ready:Promise.resolve(),async request(method,input){
    calls.push({method,input:structuredClone(input)});
    const format=input.sourceFormat,world=worldFor(format);
    if(method==='inspectPageDependencies')return {manifestDigest:digest,requires:[entry],
      ...(format?{sourceFormat:format,world}:{}),
      locks:twoLocks?['a','b'].map(letter=>({lockId:'dep-lock-'+letter.repeat(64),entries:[entry]})):
        locks.has(input.programId)?[{...locks.get(input.programId),entries:[entry]}]:[]};
    if(method==='preparePageDependencies'){
      if(prepareGate)await prepareGate;
      return {status:'pending-review',reviewId:'review-1',manifestDigest:digest,totalBytes:code.length,
        ...(format?{sourceFormat:format,world:replyWorld||world}:{}),entries:[{...entry,world,acquisition:'download'}]};
    }
    if(method==='readPageDependencyReview'){
      if(readGate)await readGate;
      return {reviewId:'review-1',order:0,sha256:hash,code:readCode};
    }
    if(method==='approvePageDependencies'){
      const lock={lockId:'dep-lock-'+(input.programId==='beta'?'b':'a').repeat(64),
        manifestDigest:digest,approvalStatus:'approved',...(network?{sourceFormat:resolver.sourceFormat,world:worldFor(resolver.sourceFormat)}:{})};
      locks.set(input.programId,lock);return lock;
    }
    throw Error('Unexpected execution/RPC '+method);
  }};
  const resolver=createPageDependencyResolver({client,getSource:()=>source,getProgramId:()=>program,onState:()=>controller?.update()});
  const noDocument=new Proxy({}, {get(){throw Error('React dependency controller touched DOM');}});
  controller=network?createPageDependencyReview({client,api,document:noDocument,view,resolver,getSource:()=>source,isAvailable:()=>available}):
    createPageDependencyInstaller({client,api,document:noDocument,view,resolver,getSource:()=>source,getProgramId:()=>program,
      isVisible:()=>available,isBlocked:()=>blocked});
  const actions=view.actions[network?'pageDependencyReview':'pageDependencies'];
  const gesture=operation=>{inGesture=true;try{return operation(trusted);}finally{inGesture=false;}};
  return {view,controller,resolver,actions,calls,permissionCalls,gesture,
    state:()=>view.getSnapshot().dependencies[network?'network':'classic'],
    edit(value){source=value;resolver.refresh();controller.refresh?.();controller.update();},
    setProgram(value){program=value;resolver.refresh();controller.refresh?.();controller.update();},
    setAvailable(value){available=value;controller.update();},
    setBlocked(value){blocked=value;},
    revoke(){granted=false;for(const fn of removed)fn();},
    dispose(){
      controller.dispose();
      assert.equal(view.getSnapshot().dependencies[network?'network':'classic'],null);
      assert.equal(view.actions[network?'pageDependencyReview':'pageDependencies'],undefined);
      resolver.dispose();view.dispose();assert.equal(added.size+removed.size,0);
    }
  };
}

test('React model direct Run automatically locks A/B without manual review, preserving the synchronous permission gesture',async t=>{
  const f=fixture();t.after(()=>f.dispose());await settle();
  assert.equal(f.controller.readyForRun,true);assert.equal(f.permissionCalls.length,0);
  assert.equal(f.state().review,null);assert.equal(f.calls.length,1);
  await assert.rejects(f.controller.confirmRun(synthetic),{code:'E_GESTURE'});
  await f.gesture(event=>f.controller.confirmRun(event));
  assert.deepEqual(f.permissionCalls,[{origins:['https://library.example.org/*']}]);
  const first=await f.resolver.resolveForRun(f.resolver.captureForRun());await settle();
  assert.equal(first.lockId,'dep-lock-'+'a'.repeat(64));
  assert.equal(f.state().review,null,'Run never forces optional per-library manual review');
  f.setProgram('beta');await settle();
  await f.gesture(event=>f.controller.confirmRun(event));
  const second=await f.resolver.resolveForRun(f.resolver.captureForRun());await settle();
  assert.equal(second.lockId,'dep-lock-'+'b'.repeat(64));assert.notEqual(first.lockId,second.lockId);
  const acquisitions=()=>f.calls.filter(row=>row.method==='preparePageDependencies'||row.method==='approvePageDependencies').length;
  const before=acquisitions();await f.resolver.resolveForRun(f.resolver.captureForRun());
  assert.equal(acquisitions(),before,'repeat Run uses its fixed lock without another acquisition or approval');
});

test('React model exposes cache/lock choices and isolates optional manual review from execution',async t=>{
  const f=fixture({shared:true,twoLocks:true});t.after(()=>f.dispose());await settle();
  assert.equal(f.state().entries[0].value,'shared:'+hash);
  assert.equal(f.state().locks.length,2);
  f.actions.chooseLock('dep-lock-'+'b'.repeat(64));
  assert.equal(f.state().selectedLockId,'dep-lock-'+'b'.repeat(64));
  assert.throws(()=>f.actions.chooseLock('other-lock'),{code:'E_DEPENDENCY_LOCK'});
  f.actions.chooseAcquisition(0,'cache:not-listed');
  assert.equal(f.state().entries[0].value,'shared:'+hash,'unlisted cache cannot be selected');
  await f.actions.prepare(synthetic);assert.equal(f.calls.length,1);
  f.setBlocked(true);await f.gesture(f.actions.prepare);
  assert.equal(f.calls.length,1,'live host blocking wins over an older enabled snapshot');
  f.setBlocked(false);
  await f.gesture(f.actions.prepare);
  assert.equal(f.permissionCalls.length,0,'shared cached bytes do not request network permission');
  assert.deepEqual(f.calls.at(-1).input.selections,[{order:0,sharedAssetSha256:hash}]);
  assert.equal(f.state().approveDisabled,true);
  f.actions.checkReview(0,true,'obsolete-review');assert.equal(f.state().approveDisabled,true);
  f.actions.checkReview(0,true,'review-1');assert.equal(f.state().approveDisabled,false);
  f.setBlocked(true);await f.gesture(f.actions.approve);
  assert.equal(f.calls.some(row=>row.method==='approvePageDependencies'),false);
  f.setBlocked(false);
  await f.actions.approve(synthetic);
  assert.equal(f.calls.some(row=>row.method==='approvePageDependencies'),false);
  await f.gesture(f.actions.approve);await settle();
  assert.equal(f.calls.filter(row=>row.method==='approvePageDependencies').length,1);
  assert.equal(f.state().review,null);
  assert.equal(f.calls.some(row=>/run|execute/i.test(row.method)),false);
});

test('Classic model discards a late review after source/program/mode changes, including source return',async t=>{
  for(const transition of ['source-return','program','mode-return']){
    const gate=deferred(),f=fixture({prepareGate:gate.promise});
    try{
      await settle();const preparation=f.gesture(f.actions.prepare);await settle();
      if(transition==='source-return'){f.edit(classicSource+'\n// transient');f.edit(classicSource);}
      if(transition==='program')f.setProgram('beta');
      if(transition==='mode-return'){f.setAvailable(false);f.setAvailable(true);}
      gate.resolve();await preparation;await settle();
      assert.equal(f.state().review,null,transition);assert.equal(f.state().approveDisabled,true);
      assert.equal(f.calls.some(row=>row.method==='approvePageDependencies'),false);
    }finally{gate.resolve();f.dispose();}
  }
});

test('Network model binds verified source bytes to the current review and does not approve a bad hash',async t=>{
  for(const tampered of [false,true]){
    const f=fixture({network:true,readCode:tampered?code+'tampered':code});t.after(()=>f.dispose());await settle();
    assert.equal(f.state().world,'esm-page');assert.equal(f.controller.readyForRun,true);
    await f.actions.prepare(synthetic);assert.equal(f.permissionCalls.length,0);
    await f.gesture(f.actions.prepare);f.actions.accept(true,'review-1');
    assert.equal(f.state().approveDisabled,true,'cache source must finish hash verification');
    await f.gesture(event=>f.actions.readSource(event,0,'review-1'));
    if(tampered){
      assert.match(f.state().status,/E_DEPENDENCY_HASH/);
      assert.equal(f.state().review.entries[0].code,undefined);assert.equal(f.state().approveDisabled,true);
    }else{
      assert.equal(f.state().review.entries[0].code,code);assert.equal(f.state().approveDisabled,false);
      await f.gesture(f.actions.approve);
      assert.equal(f.resolver.capture({sourceFormat:'esm-page'}).lockId,'dep-lock-'+'a'.repeat(64));
    }
  }
});

test('Network model rejects wrong execution world and stale bytes; permission revocation invalidates the Run observation',async t=>{
  const wrong=fixture({network:true,replyWorld:'CONTROLLER'});t.after(()=>wrong.dispose());await settle();
  await wrong.gesture(wrong.actions.prepare);
  assert.match(wrong.state().status,/E_DEPENDENCY_WORLD/);assert.equal(wrong.state().review,null);
  const gate=deferred(),f=fixture({network:true,readGate:gate.promise});t.after(()=>f.dispose());await settle();
  await f.gesture(f.actions.prepare);
  const reading=f.gesture(event=>f.actions.readSource(event,0,'review-1'));await settle();
  f.edit(esmSource+'\n// changed');gate.resolve();await reading;
  assert.equal(f.state().review,null);assert.match(f.state().status,/E_DEPENDENCY_LOCK_STALE/);
  await settle();f.revoke();
  assert.equal(f.controller.readyForRun,false);
  await assert.rejects(f.controller.confirmRun(trusted),{code:'E_PERMISSION_PENDING'});
  await settle();await f.gesture(event=>f.controller.confirmRun(event));
  assert.equal(f.permissionCalls.length,2,'revoked origin needs another real gesture');
});

test('React fragment renders changing models and sends selection/checkbox values to actions, then releases its subscription',async()=>{
  // In-memory JSX transform only; no extension dev/build writer or shared output.
  const source=await readFile(new URL('../../src/ui/react/tabs/develop-dependencies.tsx',import.meta.url),'utf8');
  const compiled=await transform(source,{loader:'tsx',format:'esm',jsx:'transform'});
  const moduleText=compiled.code.replace('"react"',JSON.stringify(import.meta.resolve('react')));
  const {DevelopDependencies}=await import('data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64'));
  const {document:doc,window}=parseHTML('<html><body><div id="mount"></div></body></html>');
  // linkedom does not reflect textarea.defaultValue into its initial value.
  const textareaPrototype=window.HTMLTextAreaElement.prototype;
  const textareaDefault=Object.getOwnPropertyDescriptor(textareaPrototype,'defaultValue');
  Object.defineProperty(textareaPrototype,'defaultValue',{configurable:true,
    get(){return this.textContent;},set(value){this.textContent=value;}});
  const prior={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
  globalThis.window=window;globalThis.document=doc;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const {createRoot}=await import('react-dom/client'),view=createDeveloperView();
  const selections=[],checks=[];
  view.actions.pageDependencies={chooseAcquisition:(...args)=>selections.push(args),checkReview:(...args)=>checks.push(args)};
  const root=createRoot(doc.getElementById('mount'));
  const model={visible:true,busy:false,status:'固定缓存可复用',statusState:'idle',entries:[{order:0,url,name:'fixedLibrary',
    value:'download',options:[{value:'download',label:'下载'},{value:'shared:'+hash,label:'复用字节'}]}],locks:[],
    selectedLockId:'',prepareDisabled:true,prepareLabel:'高级获取',approveDisabled:true,
    review:{reviewId:'review-ui',entries:[{order:0,url,sha256:hash,checked:false,world:'USER_SCRIPT'}]}};
  try{
    await React.act(async()=>{view.patchDependencies('classic',model);root.render(React.createElement(DevelopDependencies,{view}));});
    assert.equal(view.resourceSnapshot().subscriptions,1);
    assert.match(doc.getElementById('page-dependency-list').textContent,/fixedLibrary/);
    const select=doc.querySelector('[data-dependency-order="0"]');
    // Model the browser's writable select value at the linkedom boundary.
    Object.defineProperty(select,'value',{configurable:true,writable:true,value:'shared:'+hash});
    await React.act(async()=>select.dispatchEvent(new window.Event('change',{bubbles:true})));
    assert.deepEqual(selections,[[0,'shared:'+hash]]);
    const check=doc.querySelector('#page-dependency-review-list input');
    check.checked=true;
    await React.act(async()=>check.dispatchEvent(new window.Event('click',{bubbles:true})));
    assert.deepEqual(checks,[[0,true,'review-ui']]);
    view.actions.pageDependencyReview={};
    await React.act(async()=>view.patchDependencies('network',{visible:true,isESM:true,world:'esm-controller',busy:false,
      prepareDisabled:true,approveDisabled:true,status:'已验证固定字节',prepareLabel:'准备 Controller',
      review:{reviewId:'network-review',accepted:false,entries:[{order:0,url,sha256:hash,code}]}}));
    assert.equal(doc.querySelector('#network-js-sources textarea').value,code);
    assert.match(doc.getElementById('network-js-status').textContent,/已验证固定字节/);
    await React.act(async()=>view.patchDependencies('classic',{...model,visible:false}));
    assert.equal(doc.getElementById('page-dependency-panel').hidden,true);
  }finally{
    await React.act(async()=>root.unmount());assert.equal(view.resourceSnapshot().subscriptions,0);view.dispose();
    if(textareaDefault)Object.defineProperty(textareaPrototype,'defaultValue',textareaDefault);
    else delete textareaPrototype.defaultValue;
    globalThis.window=prior.window;globalThis.document=prior.document;globalThis.IS_REACT_ACT_ENVIRONMENT=prior.act;
  }
});
