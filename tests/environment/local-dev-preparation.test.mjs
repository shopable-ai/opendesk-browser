import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {sha256} from '../../native-agent/local-dev/snapshot.mjs';
import {LocalDevResolver} from '../../native-agent/local-dev/resolver.mjs';
import {LocalDevSession} from '../../native-agent/local-dev/session.mjs';
import {preparationSlot,promotePreparation} from '../../native-agent/local-dev/preparation.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=source=>vm.runInNewContext(source+'\nmain()',{page:{},params:{},axiosx:{},AppStorage:{},AppLocal:{},storage:{}});
async function until(fn,ms=8000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await pause(20);}throw Error('Preparation state timed out');}
function fixture(t,options={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-r23-test-'));
  fs.cpSync(path.resolve('examples/programs/local-controller'),root,{recursive:true});
  const put=(file,bytes)=>fs.writeFileSync(path.join(root,file),bytes);
  put('src/main.js','import {v} from "./value.js"; export default async function(){globalThis.business=(globalThis.business||0)+1;return v;}');
  put('src/value.js','export const v=0;');
  const resolver=new LocalDevResolver({allowedPaths:[root],preparation:{debounceMs:80,pollMs:150,...options}}),id=resolver.attach({path:root}).bindingId;
  t.after(()=>{resolver.close();fs.rmSync(root,{recursive:true,force:true});});
  return {root,put,resolver,id,state:()=>resolver.preparation.status(id)};
}
test('ready artifact: ten explicit reads add zero compilations, immutable identities and no implicit business',async t=>{
  const p=fixture(t);p.resolver.preparation.start(p.id);await until(()=>p.state().state==='ready');
  const original=p.resolver.cache.get(p.id);let builds=0;
  for(let i=0;i<10;i++){const next=await p.resolver.resolve(p.id);assert.equal(next.cacheHit,true);assert.equal(next.artifactId,original.artifactId);builds+=next.timings.buildCount;}
  assert.equal(builds,0);assert.equal(globalThis.business,undefined);assert.ok(Object.isFrozen(original.files[0]));assert.ok(Object.isFrozen(original.siteOrigins));
  p.put('src/value.js','export const v=1;');await until(()=>p.state().state==='ready'&&p.resolver.cache.get(p.id).inputHash!==original.inputHash);
  const context=vm.createContext({page:{},params:{},axiosx:{},AppStorage:{},AppLocal:{},storage:{}});assert.equal(await vm.runInContext(original.sourceUtf8+'\nmain()',context),0);assert.equal(context.business,1);
});
test('30 saves coalesce, atomic save/delete/rename/recovery and latest syntax error never fall back',async t=>{
  const p=fixture(t);p.resolver.preparation.start(p.id);await until(()=>p.state().state==='ready');const builds=p.state().buildCount;
  for(let i=1;i<=30;i++){p.put('src/value.js','export const v='+i+';');await pause(3);}
  await until(()=>p.state().state==='ready'&&p.state().buildCount>builds);assert.ok(p.state().buildCount-builds<=2);
  assert.equal(await evaluate(p.resolver.cache.get(p.id).sourceUtf8),30);
  p.put('src/atomic.js','export const v=31;');fs.renameSync(path.join(p.root,'src/atomic.js'),path.join(p.root,'src/value.js'));
  await until(()=>p.state().state==='ready'&&p.resolver.cache.get(p.id).files.find(x=>x.path==='src/value.js')?.sha256===sha256('export const v=31;'));
  assert.equal(await evaluate(p.resolver.cache.get(p.id).sourceUtf8),31);
  const latency=p.state().notificationToStartMs;await pause(350);
  assert.equal(p.state().notificationToStartMs,latency,'content verification polls do not replace the last watch latency');
  fs.renameSync(path.join(p.root,'src/value.js'),path.join(p.root,'src/removed.js'));
  await until(()=>p.state().state==='source-error');await assert.rejects(p.resolver.resolve(p.id),{code:'E_PROJECT_FILE'});
  fs.renameSync(path.join(p.root,'src/removed.js'),path.join(p.root,'src/value.js'));await until(()=>p.state().state==='ready');
  p.put('src/value.js','export const v=;');await until(()=>p.state().state==='source-error');await assert.rejects(p.resolver.resolve(p.id),{code:'E_PROJECT_SYNTAX'});
  p.put('src/value.js','export const v=32;');await until(()=>p.state().state==='ready');
});
test('explicit request joins preparing version; superseded build cannot publish and detach releases watchers',async t=>{
  const p=fixture(t),original=p.resolver._resolve.bind(p.resolver);let release,entered;
  const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
  let first=true;p.resolver._resolve=(id,options)=>original(id,{...options,beforeVerify:async()=>{if(first){first=false;entered();await gate;}}});
  p.resolver.preparation.start(p.id);await started;
  const run=p.resolver.resolve(p.id);
  p.put('src/value.js','export const v=42;');await pause(30);release();assert.equal(await evaluate((await run).sourceUtf8),42);
  await until(()=>p.state().state==='ready');assert.equal(await evaluate(p.resolver.cache.get(p.id).sourceUtf8),42);
  assert.ok(p.state().superseded>0);p.resolver.detach(p.id);assert.equal(p.resolver.preparation.resources().watchers,0);assert.equal(p.resolver.cache.size,0);
});
test('two projects have independent artifacts, outputs/irrelevant edits stay outside closure',async t=>{
  const a=fixture(t),b=fixture(t);a.resolver.preparation.start(a.id);b.resolver.preparation.start(b.id);await until(()=>a.state().state==='ready'&&b.state().state==='ready');
  const old=b.resolver.cache.get(b.id);a.put('src/value.js','export const v=77;');fs.mkdirSync(path.join(a.root,'dist'));a.put('dist/output.js','export const generated=1;');
  await until(()=>a.state().state==='ready'&&a.state().buildCount===2);assert.equal(b.resolver.cache.get(b.id).artifactId,old.artifactId);
  a.put('src/irrelevant.js','throw Error("not in closure");');assert.equal((await a.resolver.resolve(a.id)).cacheHit,true);
});
test('workspace is not runnable; close during build prevents late cache publication',async t=>{
  const p=fixture(t);p.put('package.json','{}');p.resolver.preparation.start(p.id);assert.equal(p.resolver.preparation.resources().projects,0);
  const q=fixture(t);let release,entered;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
  const pending=q.resolver.resolve(q.id,{beforeVerify:async()=>{entered();await gate;}});await started;new LocalDevSession({resolver:q.resolver}).close();release();await assert.rejects(pending,{code:'E_DEV_SESSION_CLOSED'});assert.equal(q.resolver.cache.size,0);
});

test('explicit runs share the two-slot limit and superseded compilations remain counted',async t=>{
  const a=fixture(t),b=fixture(t),c=fixture(t);let releaseA,releaseB;
  const gateA=new Promise(resolve=>releaseA=resolve),gateB=new Promise(resolve=>releaseB=resolve);
  let enteredA=false,enteredB=false,enteredC=false;
  const first=a.resolver.resolve(a.id,{beforeVerify:async()=>{enteredA=true;await gateA;}});
  const second=b.resolver.resolve(b.id,{beforeVerify:async()=>{enteredB=true;await gateB;}});
  await until(()=>enteredA&&enteredB);
  const third=c.resolver.resolve(c.id,{beforeVerify:()=>{enteredC=true;}});
  await pause(30);assert.equal(enteredC,false);assert.equal(c.resolver.preparation.resources().active,2);
  a.put('src/value.js','export const v=91;');releaseA();
  await assert.rejects(first,{code:'E_PROJECT_CHANGED'});
  assert.equal(a.resolver.buildCounts.get(a.id),1,'superseded compilation is included');
  await third;releaseB();await second;
  assert.equal(c.resolver.buildCounts.get(c.id),1);
});

test('disconnect cancels a queued background preparation before it can compile or publish',async t=>{
  const a=fixture(t),b=fixture(t),c=fixture(t);let release;
  const gate=new Promise(resolve=>release=resolve);let entered=0;
  const pending=[a,b].map(p=>p.resolver.resolve(p.id,{beforeVerify:async()=>{entered++;await gate;}}));
  await until(()=>entered===2);c.resolver.preparation.start(c.id);
  await until(()=>c.resolver.preparation.resources().queued===1);
  c.resolver.preparation.stopAll();
  await until(()=>c.resolver.inflight.size===0);
  assert.equal(c.resolver.preparation.resources().queued,0,'closed preparation leaves queue before occupied slots finish');
  release();await Promise.all(pending);
  assert.equal(c.resolver.cache.size,0);assert.equal(c.resolver.buildCounts.get(c.id),undefined);
  assert.equal(c.resolver.preparation.resources().watchers,0);
});

test('queued explicit projects are cancelled on close and background gets a bounded turn',async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const held=[preparationSlot(()=>gate),preparationSlot(()=>gate)],order=[];
  const background=preparationSlot(()=>order.push('background'));
  const explicit=Array.from({length:8},(_,i)=>preparationSlot(()=>order.push(i),true));
  release();await Promise.all([...held,background,...explicit]);
  assert.deepEqual(order,[0,1,2,3,'background',4,5,6,7]);
  const a=fixture(t),b=fixture(t),c=fixture(t);let unblock,entered=0;
  const blocked=new Promise(resolve=>{unblock=resolve;});
  const active=[a,b].map(p=>p.resolver.resolve(p.id,{beforeVerify:async()=>{entered++;await blocked;}}));
  await until(()=>entered===2);
  const cancelled=assert.rejects(c.resolver.resolve(c.id),{code:'E_DEV_SESSION_CLOSED'});
  c.resolver.close();await cancelled;
  assert.equal(c.resolver.preparation.resources().queued,0);
  assert.equal(c.resolver.buildCounts.size,0);
  unblock();await Promise.all(active);
});

test('an obsolete syntax failure cannot overwrite a newer merge or publish an error',async t=>{
  const p=fixture(t);p.resolver.preparation.start(p.id);await until(()=>p.state().state==='ready');
  let release,entered,first=true;
  const gate=new Promise(resolve=>{release=resolve;}),began=new Promise(resolve=>{entered=resolve;});
  const original=p.resolver._resolve.bind(p.resolver);
  p.resolver._resolve=async(id,options)=>{
    if(first){first=false;entered();await gate;throw Object.assign(Error('obsolete syntax error'),{code:'E_PROJECT_SYNTAX'});}
    return original(id,options);
  };
  const pending=p.resolver.preparation.prepare(p.id);await began;
  p.put('src/value.js','export const v=99;');p.resolver.preparation.changed(p.id);release();await pending;
  assert.equal(p.state().state,'merging');assert.equal(p.state().error,undefined);
  await until(()=>p.state().state==='ready'&&p.resolver.cache.get(p.id).files.find(x=>x.path==='src/value.js')?.sha256===sha256('export const v=99;'));
  assert.equal(await evaluate(p.resolver.cache.get(p.id).sourceUtf8),99);
});

test('explicit requests are FIFO and promote the existing queued preparation',async t=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;}),order=[];
  const held=[preparationSlot(()=>gate),preparationSlot(()=>gate)];
  const background=preparationSlot(()=>order.push('background'));
  const promoted=preparationSlot(()=>order.push('promoted'));
  const first=preparationSlot(()=>order.push('explicit-first'),true);
  const second=preparationSlot(()=>order.push('explicit-second'),true);
  promotePreparation(promoted);promotePreparation(promoted);
  release();await Promise.all([...held,background,promoted,first,second]);
  assert.deepEqual(order,['explicit-first','explicit-second','promoted','background']);

  const a=fixture(t),b=fixture(t),c=fixture(t),d=fixture(t);let unblock,entered=0;
  const blocked=new Promise(resolve=>{unblock=resolve;});
  const active=[a,b].map(p=>p.resolver.resolve(p.id,{beforeVerify:async()=>{entered++;await blocked;}}));
  await until(()=>entered===2);
  const ahead=d.resolver.resolve(d.id,{background:true,beforeVerify:()=>order.push('other-background')});
  const pending=c.resolver.resolve(c.id,{background:true,beforeVerify:()=>order.push('joined-background')});
  const explicit=c.resolver.resolve(c.id);
  unblock();await Promise.all([...active,ahead,pending,explicit]);
  assert.ok(order.indexOf('joined-background')<order.indexOf('other-background'));
  assert.equal(c.resolver.buildCounts.get(c.id),1,'joining a queued version never compiles twice');
});
