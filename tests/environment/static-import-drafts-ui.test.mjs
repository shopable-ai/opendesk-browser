import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPageDependencyResolver} from '../../src/ui/page-dependencies.js';
import {createPageDependencyReview} from '../../src/ui/page-dependency-review.js';
import {parseStaticESMSource,STATIC_ESM_WORLDS} from '../../src/scripting/user-scripts/static-esm.js';

// Component evidence only; compiler and real Chrome verification have separate owners.
const hash=value=>createHash('sha256').update(value).digest('hex');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{for(let n=0;n<12;n++)await tick();};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const url='https://library.example.org/v1.0.0/value.js',code='export default 7;';
const source='import value from "'+url+'";\nexport default async function main(){return value;}';
class Element {
  children=[];listeners=new Map();value='';checked=false;disabled=false;hidden=false;
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(key,value){this[key]=value;}
  addEventListener(key,fn){this.listeners.set(key,fn);}
  removeEventListener(key){this.listeners.delete(key);}
  remove(){}
  fire(key,event={isTrusted:true}){this.listeners.get(key)?.(event);}
}
function fixture({text=source,inspectGate,compileGate,readCode=code,loadOverride,builtOverride}={}) {
  let live=text,ui,disposed=false;const parent=new Element(),requests=[],compiled=[],approved=new Map();
  const doc={getElementById:()=>parent,createElement:()=>new Element()};
  const identity=input=>{
    const requires=parseStaticESMSource(input.sourceUtf8).requires.map(row=>({...row,sourceKind:'https',
      sha256:hash(code),byteLength:code.length,license:{status:'unknown'},risk:'第三方代码'}));
    const manifestDigest=hash(JSON.stringify([input.sourceFormat,requires.map(row=>row.url)]));
    return {sourceFormat:input.sourceFormat,world:STATIC_ESM_WORLDS[input.sourceFormat],requires,manifestDigest};
  };
  let prepared;
  const client={ready:Promise.resolve(),async request(method,input){
    requests.push({method,input:structuredClone(input)});
    if(method==='inspectPageDependencies'){
      if(inspectGate)await inspectGate.promise;
      const report=identity(input),lock=approved.get(report.manifestDigest);
      return {...report,locks:lock?[lock]:[],selectedLockId:lock?.lockId??null};
    }
    if(method==='preparePageDependencies'){
      const report=identity(input);prepared={...report,reviewId:'review-'+report.manifestDigest,
        entries:report.requires.map(row=>({...row,resolvedUrl:row.url}))};
      return {...prepared,status:'pending-review'};
    }
    if(method==='readPageDependencyReview')return {reviewId:input.reviewId,order:input.order,sha256:hash(code),code:readCode};
    if(method==='approvePageDependencies'){
      assert.deepEqual(input.acceptedHashes,[hash(code)]);
      const lock={lockId:'dep-lock-'+hash(prepared.manifestDigest),manifestDigest:prepared.manifestDigest,
        world:prepared.world,sourceFormat:prepared.sourceFormat};
      approved.set(lock.manifestDigest,lock);return {...lock,approvalStatus:'approved'};
    }
    if(method==='loadPageESMForCompilation'){
      const report=identity(input);
      const value={...report,lockId:input.lockId,entries:report.requires.map(row=>({url:row.url,order:row.order,code,sha256:hash(code)}))};
      if(value.entries.length)assert.equal(input.lockId,approved.get(report.manifestDigest)?.lockId);
      else assert.equal(input.lockId,null);
      return loadOverride?loadOverride(value):value;
    }
    throw Error('Unexpected execution or download: '+method);
  }};
  const preparer={cancel(){},dispose(){disposed=true;},async prepare(input){
    compiled.push(structuredClone(input));if(compileGate)await compileGate.promise;
    const sourceUtf8='async function main(){return 7;}';
    const built={sourceUtf8,entryFormat:'async-main',sourceHash:hash(sourceUtf8),authorSourceHash:hash(input.sourceUtf8),
      sourceFormat:input.sourceFormat,lockId:input.lockId,manifestDigest:input.manifestDigest};
    return builtOverride?builtOverride(built):built;
  }};
  const resolver=createPageDependencyResolver({client,getSource:()=>live,preparer,onState:()=>ui?.update()});
  ui=createPageDependencyReview({client,resolver,getSource:()=>live,document:doc,
    api:{permissions:{contains:async()=>true,request:async()=>true}}});
  const walk=(node,id)=>node.id===id?node:node.children.map(child=>walk(child,id)).find(Boolean);
  const find=id=>walk(parent,id);
  return {requests,compiled,approved,resolver,find,
    async edit(value){live=value;await resolver.refresh();ui.update();await settle();},
    async world(value){find('network-js-world').value=value;find('network-js-world').fire('change');await settle();},
    async click(id,event){find(id).fire('click',event);await settle();},
    async approve(){
      await this.click('network-js-prepare');
      find('network-js-sources').children[0].fire('click');await settle();
      find('network-js-consent').checked=true;find('network-js-consent').fire('change');
      await this.click('network-js-approve');
    },
    dispose(){ui.dispose();resolver.dispose();preparer.dispose();},
    get disposed(){return disposed;}
  };
}
test('static import review uses the existing DOM, requires cached source and explicit approval, then compiles offline',async t=>{
  const f=fixture();t.after(()=>f.dispose());await settle();
  assert.equal(f.find('network-js-world').value,'esm-page');
  assert.throws(()=>f.resolver.capture({sourceFormat:'esm-page'}),e=>e.code==='E_DEPENDENCY_UNLOCKED');
  await f.click('network-js-prepare',{isTrusted:false});
  assert.equal(f.requests.filter(row=>row.method==='preparePageDependencies').length,0);
  await f.click('network-js-prepare');
  assert.match(f.find('network-js-status').textContent,/下载准备完成/);
  f.find('network-js-consent').checked=true;f.find('network-js-consent').fire('change');
  assert.equal(f.find('network-js-approve').disabled,true);
  f.find('network-js-sources').children[0].fire('click');await settle();
  assert.equal(f.find('network-js-sources').children[1].value,code);
  assert.match(f.find('network-js-status').textContent,/已显示固定缓存原文/);
  await f.click('network-js-approve',{isTrusted:false});assert.equal(f.approved.size,0);
  await f.click('network-js-approve');
  assert.match(f.find('network-js-status').textContent,/已明确批准/);
  assert.equal(f.compiled.length,0,'approval must not compile or execute');
  const captured=f.resolver.capture({sourceFormat:'esm-page'});
  const built=await f.resolver.compile(captured);
  assert.equal(built.authorSourceHash,hash(source));assert.equal(built.sourceHash,hash(built.sourceUtf8));
  await f.resolver.compile(f.resolver.capture({sourceFormat:'esm-page'}));
  assert.equal(f.requests.filter(row=>row.method==='preparePageDependencies').length,1,'offline repeats never redownload');
  assert.equal(f.requests.filter(row=>row.method==='loadPageESMForCompilation').length,2);
  assert.deepEqual(f.compiled[0].entries,[{url,order:0,code,sha256:hash(code)}]);
});
test('Page approval cannot authorize Controller; world change clears review and synchronizes manager inspect/prepare',async t=>{
  const f=fixture();t.after(()=>f.dispose());await settle();await f.approve();
  const pageLock=f.resolver.capture({sourceFormat:'esm-page'}).lockId;
  assert.throws(()=>f.resolver.capture({sourceFormat:'esm-controller'}),e=>e.code==='E_DEPENDENCY_WORLD');
  await f.world('esm-controller');
  assert.equal(f.find('network-js-consent').checked,false);
  assert.equal(f.find('network-js-sources').children.length,0);
  assert.throws(()=>f.resolver.capture({sourceFormat:'esm-controller'}),e=>e.code==='E_DEPENDENCY_UNLOCKED');
  assert.equal(f.requests.at(-1).input.sourceFormat,'esm-controller');
  await f.approve();
  const captured=f.resolver.capture({sourceFormat:'esm-controller'});
  assert.notEqual(captured.lockId,pageLock);
  assert.equal(f.requests.findLast(row=>row.method==='preparePageDependencies').input.sourceFormat,'esm-controller');
  assert.equal((await f.resolver.compile(captured)).sourceFormat,'esm-controller');
});
test('export default zero-argument main without imports waits for inspect, then compiles with no lock or empty approval',async t=>{
  const gate=deferred(),f=fixture({text:'export default async function main(){return 7;}',inspectGate:gate});
  t.after(()=>f.dispose());await settle();
  assert.throws(()=>f.resolver.capture({sourceFormat:'esm-page'}),e=>e.code==='E_DEPENDENCY_PENDING');
  gate.resolve();await settle();
  assert.match(f.find('network-js-status').textContent,/无需外部依赖/);
  assert.equal(f.find('network-js-prepare').disabled,true);
  assert.equal(f.find('network-js-approve').disabled,true);
  await f.click('network-js-prepare');assert.equal(f.approved.size,0);
  const captured=f.resolver.capture({sourceFormat:'esm-page'});
  assert.equal(captured.lockId,null);
  assert.throws(()=>f.resolver.accept({lockId:'dep-lock-'+hash('empty'),manifestDigest:captured.manifestDigest},f.resolver.snapshot()),
    e=>e.code==='E_DEPENDENCY_REVIEW');
  await f.resolver.compile(captured);
  assert.deepEqual(f.compiled[0].entries,[]);assert.equal(f.compiled[0].lockId,null);
  assert.throws(()=>f.resolver.capture({sourceFormat:'esm-controller'}),e=>e.code==='E_DEPENDENCY_WORLD');
  await f.world('esm-controller');
  assert.equal(f.resolver.capture({sourceFormat:'esm-controller'}).lockId,null);
  assert.equal(f.requests.filter(row=>/preparePageDependencies|approvePageDependencies/.test(row.method)).length,0);
});
test('corrupt displayed bytes never enable approval',async t=>{
  const f=fixture({readCode:code+'//changed'});t.after(()=>f.dispose());await settle();
  await f.click('network-js-prepare');f.find('network-js-sources').children[0].fire('click');await settle();
  f.find('network-js-consent').checked=true;f.find('network-js-consent').fire('change');
  assert.match(f.find('network-js-status').textContent,/E_DEPENDENCY_HASH/);
  assert.equal(f.find('network-js-approve').disabled,true);assert.equal(f.approved.size,0);
});
test('changed import URL requires independent approval and HTTP imports are rejected before preparation',async t=>{
  const f=fixture();t.after(()=>f.dispose());await settle();await f.approve();
  await f.edit(source.replace('/value.js','/other.js'));
  assert.throws(()=>f.resolver.capture({sourceFormat:'esm-page'}),e=>e.code==='E_DEPENDENCY_UNLOCKED');
  await f.edit(source.replace('https://','http://'));
  assert.equal(f.find('network-js-prepare').disabled,true);
  assert.match(f.find('network-js-status').textContent,/E_DEPENDENCY_URL/);
});
for(const field of ['world','sourceFormat','lockId','manifestDigest'])test('loader '+field+' mismatch is refused before compilation',async t=>{
  const f=fixture({loadOverride:value=>({...value,[field]:'wrong'})});
  t.after(()=>f.dispose());await settle();await f.approve();
  await assert.rejects(f.resolver.compile(f.resolver.capture({sourceFormat:'esm-page'})),e=>e.code==='E_DEPENDENCY_WORLD');
  assert.equal(f.compiled.length,0);
});
for(const change of ['source','world','approval'])test(change+' change during compilation rejects even after restoration',async t=>{
  const gate=deferred(),f=fixture({compileGate:gate});t.after(()=>f.dispose());await settle();await f.approve();
  const captured=f.resolver.capture({sourceFormat:'esm-page'}),running=f.resolver.compile(captured);
  const rejected=assert.rejects(running,e=>e.code==='E_DEPENDENCY_LOCK_STALE');
  await settle();assert.equal(f.compiled.length,1);
  if(change==='source'){await f.edit(source+'\n// changed');await f.edit(source);}
  else if(change==='world'){await f.world('esm-controller');await f.world('esm-page');}
  else f.resolver.accept(f.approved.get(captured.manifestDigest),f.resolver.snapshot());
  gate.resolve();await rejected;
});
test('compiler output cannot substitute another author source or lock identity',async t=>{
  const f=fixture({builtOverride:value=>({...value,authorSourceHash:hash('different author')})});
  t.after(()=>f.dispose());await settle();await f.approve();
  await assert.rejects(f.resolver.compile(f.resolver.capture({sourceFormat:'esm-page'})),e=>e.code==='E_STATIC_ESM_OUTPUT');
});

test('one Page ESM Run pins a real fixed input and compiles without a manual library approval click; repeat is offline',async t=>{
  const f=fixture();t.after(()=>f.dispose());await settle();
  const first=f.resolver.captureForRun();
  assert.equal(first.lockId,null);assert.equal(first.sourceFormat,'esm-page');
  const fixed=await f.resolver.resolveForRun(first);
  assert.match(fixed.lockId,/^dep-lock-[a-f0-9]{64}$/);
  assert.equal(fixed.world,'USER_SCRIPT');
  const built=await f.resolver.compile(fixed);
  assert.equal(built.authorSourceHash,hash(source));
  assert.equal(f.requests.filter(r=>r.method==='preparePageDependencies').length,1);
  assert.equal(f.requests.filter(r=>r.method==='approvePageDependencies').length,1);
  const repeat=await f.resolver.resolveForRun(f.resolver.captureForRun());
  assert.equal(repeat.lockId,fixed.lockId);
  await f.resolver.compile(repeat);
  assert.equal(f.requests.filter(r=>r.method==='preparePageDependencies').length,1,
    'repeat Page ESM Run cannot download the same pinned SHA');
});
test('a changed Page ESM draft fails before auto-approval of a stale Run snapshot',async t=>{
  const f=fixture();t.after(()=>f.dispose());await settle();
  const first=f.resolver.captureForRun();
  await f.edit(source+'\n// new editor revision');
  await assert.rejects(f.resolver.resolveForRun(first),{code:'E_DEPENDENCY_STALE'});
  assert.equal(f.requests.filter(r=>r.method==='approvePageDependencies').length,0);
});
