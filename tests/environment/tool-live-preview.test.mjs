import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createToolLivePreview,validateToolWatchStatus} from '../../src/native-agent/tool-live-preview.js';
import {previewStorageKey} from '../../src/native-agent/tool-snapshot.js';
import {panelPreviewStorageKey} from '../../src/ui/sidebar-tools/preview-session.js';
import {subscribePreviewSession,previewStatusKey} from '../../src/ui/sidebar-tools/live-preview.js';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';
import {TOOL_DEVELOPMENT_STORAGE_PORT} from '../../src/native-agent/tool-development-storage.js';
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
  }},tabs:{onRemoved:removed,async getCurrent(){return {id:45,windowId:12};},
    async create(row){tabs.push(row);return {id:tabs.length+90};}}};
  function publish(js='void 0;',capabilities=[]){
    const tool={format:'opendesk.sidebar-tool.v1',id:toolId,version:'1.0.0',title:'Live',
      description:'Read only',capabilities,html:'<main>Live</main>',css:'',js};
    const bytes=Buffer.from(JSON.stringify(tool)),sha256=hash(bytes),prefix='opendesk-tool-preview/'+toolId;
    const path=prefix+'/'+sha256,part=path+'/part-000.txt';
    const manifest={format:'opendesk.tool-snapshot.v1',id:toolId,version:tool.version,sha256,
      bytes:bytes.length,sourceFingerprint:hash(js),buildId:null,chunks:[{path:part,sha256,bytes:bytes.length}]};
    const raw=JSON.stringify(manifest);
    const manifestPath=path+'/manifest-'+hash(raw)+'.json';
    disk.set(part,bytes.toString('base64'));disk.set(manifestPath,raw);
    disk.set(prefix+'/latest.json',JSON.stringify({format:'opendesk.tool-preview-latest.v1',id:toolId,
      version:tool.version,sha256,manifestPath,manifestSha256:hash(raw),buildId:null}));
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
  f.status('building',second.sha256);await live.check();
  assert.match(messages.at(-1)[0],/正在编译/);
  assert.equal(f.stored.get(storageKey).sha256,second.sha256);
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

test('live owner revokes the old iframe before awaiting a changed snapshot, independently of UI mounting',async t=>{
  const f=fixture(),entered=gate(),release=gate(),messages=[];
  f.api.runtime.id='test';f.api.runtime.onConnect=event();
  f.publish('void 0;',['storage.local']);let blockNew=false;
  const live=f.live(t,{nativeAuthority:{devLeaseEpoch:1,sessionId:'native',leaseEpoch:'lease'},
    lockManager:{request:(_name,work)=>work()},readText:async path=>{
      if(blockNew&&path.endsWith('/latest.json')){entered.resolve();await release.promise;}
      return f.disk.get(path);
    }});
  t.after(()=>release.resolve());
  const opened=await live.start(),first=f.stored.get(previewStorageKey(opened.previewId));
  const posted=event(),port={name:TOOL_DEVELOPMENT_STORAGE_PORT+opened.previewId,
    sender:{id:'test',url:`chrome-extension://test/sidepanel.html?hostInstanceId=host-1&previewId=${opened.previewId}`,
      tab:{id:opened.tabId,incognito:false},documentId:'document-1',frameId:0,documentLifecycle:'active'},
    onMessage:event(),onDisconnect:event(),postMessage(message){messages.push(message);posted.emit(message);},disconnect(){this.onDisconnect.emit();}};
  f.api.runtime.onConnect.emit(port);
  const send=message=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{posted.removeListener(listener);reject(new Error('owner result timed out'));},1000);
    const listener=row=>{if(row.type==='result'&&row.requestId===message.requestId){
      clearTimeout(timer);posted.removeListener(listener);resolve(row);
    }};
    posted.addListener(listener);port.onMessage.emit(message);
  });
  const instance='22222222-2222-4222-8222-222222222222';
  assert.equal((await send({type:'approve',requestId:1,instance,sha256:first.sha256})).ok,true);
  f.publish('void 1;',['storage.local']);blockNew=true;
  const checking=live.check();await entered.promise;
  assert.equal(messages.at(-1).type,'revoked','revoke precedes the pending Native snapshot read');
  const response=await send({type:'storage',requestId:2,instance,sha256:first.sha256,operation:'storage.set',
    payload:{key:'draft',value:'must not save',ifMatch:hash(Buffer.from('null'))}});
  assert.equal(response.ok,false);assert.equal(response.error.code,'E_PREVIEW_GRANT');
  assert.equal([...f.stored.keys()].some(name=>name.startsWith('opendesk.sidebar-tools.development-data.')),false);
  release.resolve();await checking;
});

test('Side Panel can admit its first iframe during publication and each changed snapshot',async t=>{
  const f=fixture(),responses=[];f.api.runtime.id='test';f.api.runtime.onConnect=event();
  const documentUrl='chrome-extension://test/sidepanel.html?hostInstanceId=host-1';
  f.api.runtime.getContexts=async()=>[{contextType:'SIDE_PANEL',documentUrl,frameId:0,incognito:false,
    documentId:'document-1',contextId:'context-1',tabId:-1,windowId:-1}];
  f.publish('void 0;',['storage.local']);
  const live=f.live(t,{surface:'sidepanel',windowId:12,
    nativeAuthority:{devLeaseEpoch:1,sessionId:'native',leaseEpoch:''}});
  f.changed.addListener(changes=>{
    const row=Object.entries(changes).find(([,change])=>change.newValue?.format==='opendesk.tool-preview-session.v1');
    if(!row?.[1].newValue)return;
    const value=row[1].newValue;
    const port={name:TOOL_DEVELOPMENT_STORAGE_PORT+value.previewId,
      sender:{id:'test',url:documentUrl,documentId:'document-1',frameId:0,documentLifecycle:'active'},
      onMessage:event(),onDisconnect:event(),postMessage(message){
        if(message.type==='result')port.result(message);},disconnect(){this.onDisconnect.emit();}};
    f.api.runtime.onConnect.emit(port);
    assert.equal(port.onMessage.size,1,'owner must listen before the publishing set resolves');
    responses.push(new Promise(resolve=>{port.result=resolve;port.onMessage.emit({type:'approve',requestId:1,
      sha256:value.sha256,instance:'22222222-2222-4222-8222-222222222222',surface:'sidepanel',windowId:12,
      hostInstanceId:'host-1',documentId:'document-1',contextId:'context-1'});}));
  });
  await live.start();assert.equal((await responses[0]).ok,true);
  f.publish('void 1;',['storage.local']);await live.check();
  assert.equal(responses.length,2);assert.equal((await responses[1]).ok,true);
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

test('subscriber invalidates before dirty deferral and restores only the explicit approval entry after same-SHA recovery',async t=>{
  const f=fixture(),first=f.publish(),order=[],snapshots=[];let dirty=false;
  await f.api.storage.session.set({[key]:f.session(first)});
  const subscription=subscribePreviewSession({api:f.api,previewId,now:f.now,
    mount:()=>{order.push('mount');},isDirty:()=>{order.push('dirty');return dirty;},
    onInvalidate:()=>order.push('invalidate'),onSnapshot:value=>snapshots.push(value)});
  t.after(()=>subscription.dispose());await subscription.ready;
  assert.equal(snapshots.length,1);
  await f.api.storage.session.set({[statusKey]:{text:'compile error',error:true,available:false}});await flush();
  // Unchanged snapshots are deduplicated by the owner for up to 60 seconds.
  // Its ready heartbeat alone must restore the explicit approval control.
  await f.api.storage.session.set({[statusKey]:{text:'recovered',error:false,available:true}});await flush();
  assert.equal(snapshots.length,2,'same successful SHA can be explicitly approved again');
  assert.equal(order.filter(value=>value==='mount').length,1,'recovery never reruns code');
  await f.api.storage.session.set({[key]:f.session(first)});await flush();
  assert.equal(snapshots.length,2,'ordinary heartbeat does not reset approval UI');
  order.length=0;dirty=true;
  await f.api.storage.session.set({[key]:f.session(f.publish('void 1;'))});await flush();
  assert.deepEqual(order,['invalidate','dirty']);
  assert.equal(snapshots.length,2,'deferred snapshot cannot be approved before mount');
});

test('live owner ready heartbeat restores approval after an error even when the same snapshot write is deduplicated',async t=>{
  const f=fixture(),first=f.publish('void 0;',['storage.local']),live=f.live(t),opened=await live.start();
  const storageKey=previewStorageKey(opened.previewId),snapshots=[];let mounts=0;
  const subscription=subscribePreviewSession({api:f.api,previewId:opened.previewId,now:f.now,
    mount:()=>{mounts++;},onSnapshot:value=>snapshots.push(value)});
  t.after(()=>subscription.dispose());await subscription.ready;
  const publications=()=>f.writes.filter(row=>row[0]==='set'&&row[1]===storageKey).length;
  const before=publications();assert.equal(snapshots.length,1);
  f.status('error',first.sha256,'temporary error');await live.check();await flush();
  assert.equal(f.stored.get(previewStatusKey(opened.previewId)).available,false);
  f.status('ready',first.sha256);await live.check();await flush();
  assert.equal(publications(),before,'recovery relies on the owner ready heartbeat');
  assert.equal(f.stored.get(previewStatusKey(opened.previewId)).available,true);
  assert.equal(snapshots.length,2);assert.equal(mounts,1);
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

test('real view facade forwards subscriber mounts and dirty/saving guards across snapshots',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(),view=createSidebarToolsView(),mounts=[],messages=[];
  let toolDirty=false,toolSaving=false;
  const facade=view.connect(()=>({ready:Promise.resolve(),dispose(){},
    openReadOnlyPreview:tool=>{mounts.push(tool.js);},
    isPreviewActive:()=>mounts.length>0,isPreviewEditing:()=>toolDirty||toolSaving}));
  const detach=view.attachRuntime({frameRoot:{nodeType:1,ownerDocument:{}},
    settingsControl:{nodeType:1,ownerDocument:{}}});
  await facade.ready;
  await f.api.storage.session.set({[key]:f.session(f.publish())});
  const subscription=subscribePreviewSession({api:f.api,previewId,now:f.now,
    mount:tool=>facade.openReadOnlyPreview(tool),isActive:()=>facade.isPreviewActive(),
    isDirty:()=>facade.isPreviewEditing(),onStatus:(...args)=>messages.push(args)});
  t.after(()=>{subscription.dispose();detach();view.dispose();});
  await subscription.ready;
  await f.api.storage.session.set({[key]:f.session(f.publish('void 1;'))});await flush();
  assert.deepEqual(mounts,['void 0;','void 1;'],'second snapshot crosses the actual view facade');
  for(const state of ['dirty','saving']){
    toolDirty=state==='dirty';toolSaving=state==='saving';
    const next=f.publish('void '+(state==='dirty'?2:3)+';');
    const count=mounts.length;
    await f.api.storage.session.set({[key]:f.session(next)});await flush();
    await f.api.storage.session.set({[statusKey]:{text:'heartbeat',error:false}});await flush();
    assert.equal(mounts.length,count,state+' must defer mounting');
    assert.match(messages.at(-1)[0],/未保存/);
    toolDirty=false;toolSaving=false;t.mock.timers.tick(1000);await flush();
    assert.equal(mounts.length,count+1);
    assert.equal(mounts.at(-1),next.tool.js);
    assert.equal(messages.at(-1)[1],false);
  }
});

for(const failure of ['false','throw']){
  test('mount '+failure+' keeps the previous snapshot and its error survives heartbeat until successful retry',async t=>{
    const f=fixture(),mounts=[],messages=[];let fail=false,attempts=0;
    await f.api.storage.session.set({[key]:f.session(f.publish())});
    const subscription=subscribePreviewSession({api:f.api,previewId,now:f.now,
      mount:tool=>{
        attempts++;
        if(fail){if(failure==='false')return false;throw new Error('mount rejected');}
        mounts.push(tool.js);
      },onStatus:(...args)=>messages.push(args)});
    t.after(()=>subscription.dispose());await subscription.ready;
    fail=true;
    const second=f.publish('void 1;');
    await f.api.storage.session.set({[key]:f.session(second)});await flush();
    assert.deepEqual(mounts,['void 0;']);assert.equal(attempts,2);
    const failed=messages.at(-1);
    assert.match(failed[0],/更新失败/);assert.equal(failed[1],true);
    assert.match(failed[0],failure==='false'?/不能安全刷新/:/mount rejected/);
    for(let i=0;i<2;i++){
      await f.api.storage.session.set({[statusKey]:{text:'实时开发预览 · '+second.sha256.slice(0,12),error:false}});await flush();
      assert.deepEqual(messages.at(-1),failed,'heartbeat cannot claim the failed mount succeeded');
    }
    fail=false;
    await f.api.storage.session.set({[key]:f.session(second)});await flush();
    assert.equal(attempts,3,'failed snapshot was not marked current and can be retried');
    assert.deepEqual(mounts,['void 0;','void 1;']);assert.equal(messages.at(-1)[1],false);
    await f.api.storage.session.set({[statusKey]:{text:'recovered heartbeat',error:false}});await flush();
    assert.deepEqual(messages.at(-1),['recovered heartbeat',false],'successful mount clears the prior error');
  });
}

test('same-window Side Panel receives two immutable Native snapshots without opening a preview tab',async t=>{
  const f=fixture(),first=f.publish(),live=f.live(t,{surface:'sidepanel',windowId:12});
  const opened=await live.start(),storageKey=previewStorageKey(opened.previewId);
  const pointerKey=panelPreviewStorageKey(12),pointer=f.stored.get(pointerKey);
  assert.equal(opened.surface,'sidepanel');assert.equal(opened.tabId,null);
  assert.equal(f.tabs.length,0);
  assert.equal(pointer.previewId,opened.previewId);
  assert.equal(f.stored.get(storageKey).sha256,first.sha256);
  const second=f.publish('void 1;');await live.check();
  assert.equal(f.stored.get(storageKey).sha256,second.sha256);
  const third=f.publish('void 2;');await live.check();
  assert.equal(f.stored.get(storageKey).sha256,third.sha256);
  f.status('error',third.sha256,'JSX build failed');await live.check();
  assert.equal(f.stored.get(storageKey).sha256,third.sha256,'compile error must retain last complete snapshot');
  f.status('ready',third.sha256);await live.check();
  await live.stop();
  assert.equal(f.stored.has(storageKey),false);
  assert.equal(f.stored.has(pointerKey),false);
  assert.equal(f.removed.size,0);
});

test('moving a Native Workspace away stops its Side Panel session permanently',async t=>{
  const f=fixture(),first=f.publish(),messages=[],live=f.live(t,{
    surface:'sidepanel',windowId:12,onStatus:text=>messages.push(text)
  });
  const opened=await live.start(),key=previewStorageKey(opened.previewId),pointerKey=panelPreviewStorageKey(12);
  f.publish('void 1;');
  f.api.tabs.getCurrent=async()=>({id:45,windowId:99});
  await live.check();await live.stop();
  assert.ok(messages.some(text=>text.includes('Workspace 已离开原窗口')));
  assert.equal(live.preview,null);assert.equal(f.stored.has(key),false);assert.equal(f.stored.has(pointerKey),false);
  f.api.tabs.getCurrent=async()=>({id:45,windowId:12});
  await live.check();
  assert.equal(f.stored.has(key),false,'returning to the old window must not resurrect the session');
  assert.equal(first.sha256!==f.publish('void 1;').sha256,true);
});

test('a newer Side Panel session retires the old owner without deleting the new pointer',async t=>{
  const f=fixture(),first=f.publish(),messages=[],live=f.live(t,{
    surface:'sidepanel',windowId:12,onStatus:text=>messages.push(text)
  });
  const opened=await live.start(),key=previewStorageKey(opened.previewId),pointerKey=panelPreviewStorageKey(12);
  const replacement={...f.stored.get(pointerKey),previewId:'00000000-0000-4000-8000-000000000099'};
  await f.api.storage.session.set({[pointerKey]:replacement});
  f.publish('void 1;');
  await live.check();await live.stop();
  assert.ok(messages.some(text=>text.includes('已切换到另一开发会话')));
  assert.equal(live.preview,null);assert.equal(f.stored.has(key),false);
  assert.deepEqual(f.stored.get(pointerKey),replacement,'the old owner cannot erase the new owner');
  assert.notEqual(first.sha256,f.publish('void 1;').sha256);
});

test('async snapshot commit cannot publish after Side Panel owner takeover',async t=>{
  const f=fixture(),first=f.publish(),pointerKey=panelPreviewStorageKey(12);
  let hijack=false;
  const live=f.live(t,{surface:'sidepanel',windowId:12,readText:async path=>{
    const value=f.disk.get(path);
    if(hijack&&path.endsWith('/latest.json')){
      hijack=false;
      const prior=f.stored.get(pointerKey);
      await f.api.storage.session.set({[pointerKey]:{...prior,previewId:'00000000-0000-4000-8000-000000000099'}});
    }
    return value;
  }});
  const opened=await live.start(),key=previewStorageKey(opened.previewId);
  f.publish('void 1;');hijack=true;
  await live.check();
  assert.equal(f.stored.get(key).sha256,first.sha256,
    'changed Native bytes must not be published after their owner is replaced');
  await live.stop();
});
