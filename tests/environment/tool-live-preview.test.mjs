import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createToolLivePreview,validateToolWatchStatus} from '../../src/native-agent/tool-live-preview.js';
import {previewStorageKey} from '../../src/native-agent/tool-snapshot.js';
import {subscribePreviewSession,previewStatusKey} from '../../src/ui/sidebar-tools/live-preview.js';
const workspaceId='workspace-00000000-0000-4000-8000-000000000002';
const sourceId='source-'+('b'.repeat(24));
const toolId='live-test',previewId='00000000-0000-4000-8000-000000000001';
const key=previewStorageKey(previewId),statusKey=previewStatusKey(previewId);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function gate(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function event(){
  const listeners=new Set();
  return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
    emit:(...args)=>{for(const fn of listeners)fn(...args);},get size(){return listeners.size;}};
}
function fixture(){
  const stored=new Map(),disk=new Map(),writes=[],tabs=[],removed=event(),changed=event();
  let clock=Date.now();
  const now=()=>clock;
  const api={runtime:{getURL:path=>'chrome-extension://test/'+path},storage:{onChanged:changed,session:{
    async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(stored.get(k))]));},
    async set(values){
      const changes={};
      for(const [k,v] of Object.entries(values)){
        changes[k]={oldValue:stored.get(k),newValue:structuredClone(v)};stored.set(k,structuredClone(v));writes.push(['set',k,v]);
      }
      changed.emit(changes,'session');
    },
    async remove(k){const oldValue=stored.get(k);stored.delete(k);writes.push(['remove',k]);changed.emit({[k]:{oldValue}},'session');}
  }},tabs:{onRemoved:removed,async create(row){tabs.push(row);return {id:tabs.length+90};}}};
  function publish(js='void 0;'){
    const tool={format:'opendesk.sidebar-tool.v1',id:toolId,version:'1.0.0',title:'Live',
      description:'Read only',capabilities:[],html:'<main>Live</main>',css:'',js};
    const bytes=Buffer.from(JSON.stringify(tool)),sha256=hash(bytes),prefix='opendesk-tool-preview/'+toolId;
    const path=prefix+'/'+sha256,part=path+'/part-000.txt';
    const manifest={format:'opendesk.tool-snapshot.v1',id:toolId,version:tool.version,sha256,
      bytes:bytes.length,sourceFingerprint:hash(js),buildId:null,chunks:[{path:part,sha256,bytes:bytes.length}]};
    const raw=JSON.stringify(manifest);
    disk.set(part,bytes.toString('base64'));disk.set(path+'/manifest.json',raw);
    disk.set(prefix+'/latest.json',JSON.stringify({format:'opendesk.tool-preview-latest.v1',id:toolId,
      version:tool.version,sha256,manifestPath:path+'/manifest.json',manifestSha256:hash(raw),buildId:null}));
    status('ready',sha256);
    return {tool,sha256,buildId:null};
  }
  function status(state,sha256,message='',updatedAt=new Date(clock).toISOString()){
    const value={format:'opendesk.tool-preview-status.v1',id:toolId,state,sha256,message,updatedAt};
    disk.set('opendesk-tool-preview/'+toolId+'/status.json',JSON.stringify(value));return value;
  }
  const readText=async path=>{if(!disk.has(path))throw new Error('Native disconnected');return disk.get(path);};
  function session(snapshot){return {format:'opendesk.tool-preview-session.v1',previewId,workspaceId,sourceId,
    createdAt:clock,tool:snapshot.tool,sha256:snapshot.sha256,buildId:null};}
  function live(t,options={}){
    const live=createToolLivePreview({api,workspaceId,sourceId,toolId,readText,now,intervalMs:60000,
      assertCurrent:async()=>{},...options});t.after(()=>live.stop());return live;
  }
  return {api,stored,disk,writes,tabs,removed,changed,now,publish,status,session,live,
    advance:ms=>{clock+=ms;}};
}

test('disk status accepts the writer ISO heartbeat and rejects wrong identity, fields and future time',()=>{
  const f=fixture(),snapshot=f.publish(),value=f.status('ready',snapshot.sha256);
  assert.equal(validateToolWatchStatus(JSON.stringify(value),toolId,f.now()).stale,false);
  f.advance(15001);
  assert.equal(validateToolWatchStatus(JSON.stringify(value),toolId,f.now()).stale,true);
  for(const patch of [{id:'other'},{extra:true},{updatedAt:'invalid'},{updatedAt:f.now()+5001},
    {message:'x'.repeat(501)},{sha256:42},{state:'running'}])
    assert.throws(()=>validateToolWatchStatus(JSON.stringify({...value,...patch}),toolId,f.now()));
});

test('two snapshots update the same tab; error, stale and disconnect keep its last successful payload',async t=>{
  const f=fixture(),first=f.publish(),messages=[],live=f.live(t,{onStatus:(...args)=>messages.push(args)});
  const opened=await live.start(),storageKey=previewStorageKey(opened.previewId);
  assert.equal(f.stored.get(storageKey).sha256,first.sha256);
  const second=f.publish('void 1;');await live.check();
  assert.equal(f.tabs.length,1);assert.equal(live.preview.tabId,opened.tabId);
  assert.equal(f.stored.get(storageKey).sha256,second.sha256);
  const third=f.publish('void 2;');
  f.status('error',second.sha256,'syntax error');await live.check();
  assert.match(messages.at(-1)[0],/编译失败/);
  f.status('ready',third.sha256,'',new Date(f.now()-15001).toISOString());await live.check();
  assert.match(messages.at(-1)[0],/连接已停止/);
  f.status('stopped',second.sha256);await live.check();
  assert.match(messages.at(-1)[0],/连接已停止/);
  f.disk.clear();await live.check();assert.match(messages.at(-1)[0],/连接或快照不可用/);
  assert.equal(f.stored.get(storageKey).sha256,second.sha256);
  f.removed.emit(opened.tabId);
  assert.equal(live.preview,null,'workspace can explicitly open a new session after tab closure');
  await live.stop();assert.equal(f.stored.has(storageKey),false);assert.equal(f.removed.size,0);
  f.publish('void 3;');const reopened=f.live(t);await reopened.start();assert.equal(f.tabs.length,2);
});

test('Native authority failures before start and after reading a changed snapshot never publish it',async t=>{
  const f=fixture();f.publish();
  const denied=f.live(t,{assertCurrent:async()=>{throw new Error('revoked');}});
  await assert.rejects(denied.start(),/revoked/);assert.equal(f.tabs.length,0);assert.equal(f.stored.size,0);
  let checks=0,failAt=Infinity;
  const live=f.live(t,{assertCurrent:async()=>{if(++checks===failAt)throw new Error('revoked after read');}});
  const opened=await live.start(),storageKey=previewStorageKey(opened.previewId),old=f.stored.get(storageKey).sha256;
  f.publish('void 1;');failAt=checks+2;
  await live.check();assert.equal(f.stored.get(storageKey).sha256,old);
  assert.match(f.stored.get(previewStatusKey(opened.previewId)).text,/revoked after read/);
});

test('stop during asynchronous start drains the handoff before removing its record',async t=>{
  const f=fixture();f.publish();const entered=gate(),release=gate();
  const create=f.api.tabs.create;
  f.api.tabs.create=async row=>{entered.resolve();await release.promise;return create(row);};
  const live=f.live(t),start=live.start();
  assert.equal(live.start(),start,'duplicate start shares the same handoff');
  await entered.promise;const stop=live.stop();assert.equal(live.preview,null);
  release.resolve();await Promise.all([start,stop]);
  assert.equal([...f.stored.keys()].some(k=>!k.endsWith(':status')),false);
  assert.equal(f.writes.at(-1)[0],'remove');
  await live.check();assert.equal(f.writes.at(-1)[0],'remove');assert.equal(f.removed.size,0);
});

test('stop during update set waits for the write and removes last, without resurrection',async t=>{
  const f=fixture();f.publish();const live=f.live(t),opened=await live.start(),storageKey=previewStorageKey(opened.previewId);
  const second=f.publish('void 1;'),entered=gate(),release=gate(),set=f.api.storage.session.set;
  f.api.storage.session.set=async values=>{
    if(values[storageKey]?.sha256===second.sha256){entered.resolve();await release.promise;}
    return set(values);
  };
  const check=live.check();await entered.promise;
  const stop=live.stop();assert.equal(live.preview,null);release.resolve();
  await Promise.all([check,stop]);
  assert.equal(f.stored.has(storageKey),false);assert.equal(f.writes.at(-1)[0],'remove');
});

test('tab removed before tabs.create resolves is inactive and cleaned up',async t=>{
  const f=fixture();f.publish();
  f.api.tabs.create=async()=>{f.removed.emit(91);return {id:91};};
  const live=f.live(t);await live.start();await live.stop();
  assert.equal(live.preview,null);assert.equal(f.removed.size,0);
  assert.equal([...f.stored.keys()].some(k=>!k.endsWith(':status')),false);
});

test('subscriber enforces owner, defers dirty updates, preserves their hint on heartbeat, and disposes',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(),first=f.publish(),mounts=[],messages=[];let dirty=false,active=true;
  await f.api.storage.session.set({[key]:f.session(first)});
  const subscription=subscribePreviewSession({api:f.api,previewId,mount:tool=>mounts.push(tool),
    isDirty:()=>dirty,isActive:()=>active,onStatus:(...args)=>messages.push(args),now:f.now});
  t.after(()=>subscription.dispose());await subscription.ready;
  assert.equal(mounts.length,1);
  const second=f.publish('void 1;');dirty=true;
  await f.api.storage.session.set({[key]:f.session(second),[statusKey]:{text:'heartbeat',error:false}});await flush();
  assert.equal(mounts.length,1);assert.match(messages.at(-1)[0],/未保存/);
  for(const patch of [{sourceId:'source-'+('a'.repeat(24))},
    {workspaceId:'workspace-00000000-0000-4000-8000-000000000003'},
    {tool:{...second.tool,id:'other-tool'}}]){
    await f.api.storage.session.set({[key]:{...f.session(second),...patch}});await flush();
    assert.match(messages.at(-1)[0],/来源已变化/);assert.equal(mounts.length,1);
  }
  await f.api.storage.session.set({[key]:f.session(second)});await flush();
  dirty=false;t.mock.timers.tick(1000);await flush();
  assert.equal(mounts.length,2);assert.equal(mounts[1].js,'void 1;');
  active=false;await f.api.storage.session.set({[key]:f.session(f.publish('void 2;'))});await flush();
  assert.equal(mounts.length,2);
  subscription.dispose();assert.equal(f.changed.size,0);
  const count=messages.length;
  await f.api.storage.session.set({[statusKey]:{text:'ignored'}});t.mock.timers.tick(20000);await flush();
  assert.equal(messages.length,count);assert.equal(mounts.length,2);
});

test('subscriber reports lost heartbeat, retains dirty hint and never applies pending update after session removal',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(),mounts=[],messages=[];let dirty=false;
  await f.api.storage.session.set({[key]:f.session(f.publish())});
  const subscription=subscribePreviewSession({api:f.api,previewId,mount:tool=>mounts.push(tool),
    isDirty:()=>dirty,onStatus:text=>messages.push(text),now:f.now});
  t.after(()=>subscription.dispose());await subscription.ready;dirty=true;
  await f.api.storage.session.set({[key]:f.session(f.publish('void 1;'))});await flush();
  f.advance(16000);t.mock.timers.tick(1000);
  assert.match(messages.at(-1),/未保存.*连接中断/);
  await f.api.storage.session.remove(key);await flush();assert.match(messages.at(-1),/连接已停止/);
  dirty=false;t.mock.timers.tick(1000);await flush();assert.equal(mounts.length,1);
});

test('disposing during the initial async storage read prevents a late mount and removes the listener',async()=>{
  const f=fixture();await f.api.storage.session.set({[key]:f.session(f.publish())});
  const entered=gate(),release=gate(),get=f.api.storage.session.get;let mounted=0;
  f.api.storage.session.get=async keys=>{entered.resolve();await release.promise;return get(keys);};
  const subscription=subscribePreviewSession({api:f.api,previewId,mount:()=>{mounted++;},now:f.now});
  await entered.promise;subscription.dispose();release.resolve();await subscription.ready;
  assert.equal(mounted,0);assert.equal(f.changed.size,0);
});

test('Native revocation during the existing update session read prevents its commit',async t=>{
  const f=fixture();f.publish();let authorized=true;
  const live=f.live(t,{assertCurrent:async()=>{if(!authorized)throw new Error('revoked during storage read');}});
  const opened=await live.start(),storageKey=previewStorageKey(opened.previewId);
  const first=f.stored.get(storageKey).sha256;
  f.publish('void 1;');const get=f.api.storage.session.get;
  f.api.storage.session.get=async keys=>{const value=await get(keys);authorized=false;return value;};
  await live.check();
  assert.equal(f.stored.get(storageKey).sha256,first);
  assert.match(f.stored.get(previewStatusKey(opened.previewId)).text,/revoked during storage read/);
});

test('stop during the initial Native read never reaches the tab handoff',async t=>{
  const f=fixture();f.publish();const entered=gate(),release=gate();
  const live=f.live(t,{readText:async path=>{
    if(path.endsWith('/latest.json')){entered.resolve();await release.promise;}
    return f.disk.get(path);
  }});
  const start=live.start();await entered.promise;const stop=live.stop();release.resolve();
  await Promise.all([start,stop]);assert.equal(live.preview,null);
  assert.equal(f.tabs.length,0);assert.equal(f.stored.size,0);assert.equal(f.removed.size,0);
});
