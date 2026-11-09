import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the real entry's action wiring without sending a website message.
const entry=await readFile(new URL('../src/page/main.js',import.meta.url),'utf8');
function fixture({preflight={ok:true},clear={ok:false,needsRecovery:true,text:'private draft',
  reason:'editor replaced'},restore=false,enqueue=true,reclaim=null,queued=false,reclaimPrepared=false,removeResult=true}={}){
  const calls={preflight:0,clear:0,enqueued:0,ticks:0,pauses:0,restores:0,toasts:[],
    recovery:null,unloadPrevented:false,uncertain:null,now:0,confirms:0,removed:[]};
  let actions,unload,poll,hasRecovery=false,active=true,legacy=false,now=1000;
  const listeners=new Map(),editor={contains:()=>false};
  const disposers=[];
  const snap={ok:true,route:'c/12345678',editor,draft:reclaim?'':'private draft',rich:false,users:[],assistants:[],
    busy:true,sendButton:null};
  const state={items:reclaim||queued?[{id:'q1',text:'private draft',state:'queued'}]:[],route:snap.route,phase:'waiting',inFlight:null};
  const site={inspect:()=>snap,clearForQueue(){calls.clear++;if(clear.ok)snap.draft='';return clear;},
    reclaimToComposer(){if(reclaim?.ok)snap.draft='private draft';calls.onWrite?.();return reclaim;},
    restore(){calls.restores++;if(restore)snap.draft='private draft';return restore;}};
  const engine={view:()=>state,
    checkEnqueue(){calls.preflight++;return preflight;},
    enqueue(text){calls.enqueued++;if(enqueue)state.items.push({id:'new'+calls.enqueued,text,state:'queued'});return enqueue;},
    pause(id){calls.pauses++;const item=state.items.find(x=>x.id===id);if(!item)return false;item.state='paused';return true;},
    reclaim(id){calls.reclaimed=(calls.reclaimed||0)+1;const i=state.items.findIndex(x=>x.id===id);if(i<0)return false;state.items.splice(i,1);return true;},
    wait(){},
    reclaimPrepared(){calls.reclaimPrepared=(calls.reclaimPrepared||0)+1;return reclaimPrepared;},
    uncertain(...args){calls.uncertain=args;},
    remove(id){calls.removed.push(id);return removeResult;},
    requestNow(){calls.now++;return {ok:true};},
    tick(options){calls.ticks++;calls.canSubmit=options?.canSubmit;}};
  const owner={host:{style:{setProperty(){}},hidden:false},
    on(target,type,callback,options){listeners.set(type,{callback,options});if(type==='beforeunload')unload=callback;},
    onDispose(fn){disposers.push(fn);},setInterval(fn){poll=fn;},active:()=>active,destroy(){active=false;disposers.forEach(fn=>fn());}};
  const view={place(){return true;},render(){},hide(){},
    toast(message){calls.toasts.push(message);},
    offerRecovery(text,reason){if(hasRecovery)return false;hasRecovery=true;
      calls.recovery={text,reason};return true;},
    hasRecovery(){return hasRecovery;}};
  const win={location:{origin:'https://chatgpt.com'},confirm(){calls.confirms++;return true;}};win.top=win;
  const doc={querySelector:()=>legacy?{}:null};
  const ctx=vm.createContext({window:win,document:doc,Date:class extends Date {static now(){return now;}},
    createPageUI:()=>owner,createChatGPTSite:()=>site,
    createQueueEngine:()=>engine,
    createQueueView:options=>{actions=options.actions;return view;},
     createSendQueueRemote:()=>({changed(){}})});
  vm.runInContext(entry.replace(/^import .*;\n/gm,'')
    .replace('export default async function main','async function main'),ctx);
  return {calls,snap,state,listeners,setNow(value){now=value;},setLegacy(value){legacy=value;},retire(){active=false;},
    key(patch={}){const event={key:'Enter',isTrusted:true,target:editor,prevented:false,stopped:false,
      preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...patch};
      listeners.get('keydown').callback(event);return event;},
    composition(type){listeners.get(type).callback();},
    run:()=>ctx.main(),enqueue:(event={})=>actions.enqueue(event),edit:()=>actions.edit('q1'),poll:()=>poll(),destroy:()=>owner.destroy(),
    beforeinput(patch={}){const event={target:snap.editor,isTrusted:true,defaultPrevented:false,...patch};listeners.get('beforeinput').callback(event);return event;},
    input(patch={}){listeners.get('input')?.callback({target:snap.editor,isTrusted:true,...patch});},get actions(){return actions;},unload:()=>{
    const event={preventDefault(){calls.unloadPrevented=true;}};
    unload(event);return event;
  }};
}

test('preflight denial preserves the native draft and never invokes clearing',async()=>{
  const h=fixture({preflight:{ok:false,reason:'发送队列已满'}});
  await h.run();h.enqueue();
  assert.equal(h.calls.preflight,1);assert.equal(h.calls.clear,0);
  assert.equal(h.calls.enqueued,0);assert.equal(h.calls.pauses,0);
  assert.match(h.calls.toasts.at(-1),/队列已满/);
});

test('uncertain clear is not enqueued or sent and retains a recoverable copy',async()=>{
  const h=fixture();await h.run();h.enqueue();
  assert.equal(h.calls.clear,1);assert.equal(h.calls.enqueued,0);
  assert.equal(h.calls.ticks,0);
  assert.deepEqual(h.calls.recovery,{text:'private draft',reason:'editor replaced'});
  h.enqueue();
  assert.equal(h.calls.clear,1,'another click cannot overwrite the recovery buffer');
  h.poll();assert.equal(h.calls.canSubmit,false,'a recovery copy blocks new sends while confirmation polling continues');
  const event=h.unload();
  assert.equal(h.calls.unloadPrevented,true);
  assert.equal(event.returnValue,'');
});

test('confirmed exact clear enters the queue once',async()=>{
  const h=fixture({clear:{ok:true,text:'private draft'}});
  await h.run();h.enqueue();
  assert.equal(h.calls.enqueued,1);assert.equal(h.calls.ticks,0);
  assert.equal(h.calls.pauses,0);assert.equal(h.calls.recovery,null);
});

test('post-clear enqueue rejection with failed restore keeps a manual copy',async()=>{
  const h=fixture({clear:{ok:true,text:'private draft'},enqueue:false,restore:false});
  await h.run();h.enqueue();
  assert.equal(h.calls.enqueued,1);assert.equal(h.calls.restores,1);
  assert.equal(h.calls.ticks,0);
  assert.equal(h.calls.recovery.text,'private draft');
});

test('Shift click enqueues normally without a pause or resume action',async()=>{
  const h=fixture({clear:{ok:true,text:'private draft'}});
  await h.run();h.enqueue({shiftKey:true});
  assert.equal(h.calls.enqueued,1);h.poll();assert.equal(h.calls.canSubmit,true);
  assert.equal(h.actions.togglePause,undefined);
});

test('uncertain reclaim retains the pre-write snapshot for manual-send confirmation',async()=>{
  const h=fixture({reclaim:{ok:false,mayHaveWritten:true}});
  await h.run();h.edit();
  assert.equal(h.calls.uncertain[0],'q1');
  assert.equal(h.calls.uncertain[2].editor,h.snap.editor);
  assert.equal(h.calls.uncertain[2].route,h.snap.route);
  assert.equal(h.calls.enqueued,0);assert.equal(h.calls.ticks,0);
});

test('plain Enter during native busy reuses the exact button enqueue path once',async()=>{
  const h=fixture({queued:true,clear:{ok:true,text:'private draft'}});await h.run();
  const event=h.key();
  assert.equal(event.prevented,true);assert.equal(event.stopped,true);
  assert.equal(h.listeners.get('keydown').options,true,'capture precedes the website handler');
  assert.equal(h.calls.preflight,1);assert.equal(h.calls.clear,1);assert.equal(h.calls.enqueued,1);
  assert.match(h.calls.toasts.at(-1),/已加入发送队列/);
  h.key({repeat:true});assert.equal(h.calls.clear,1,'holding Enter cannot enqueue again');
});

test('disabled native send permits fallback even after generation ended',async()=>{
  const h=fixture({queued:true,clear:{ok:true,text:'private draft'}});await h.run();
  h.snap.busy=false;h.snap.sendButton={disabled:true,getAttribute:()=>null};
  assert.equal(h.key().prevented,true);assert.equal(h.calls.enqueued,1);
});

test('normal native Enter, missing ambiguous controls and an empty queue are untouched',async()=>{
  for(const mode of ['enabled','enabled while busy','missing','empty queue']){
    const h=fixture({queued:mode!=='empty queue'});await h.run();
    if(mode!=='empty queue')h.snap.busy=mode==='enabled while busy';
    if(mode.startsWith('enabled'))h.snap.sendButton={disabled:false,getAttribute:()=>null};
    assert.equal(h.key().prevented,false,mode);assert.equal(h.calls.clear,0,mode);
  }
});

test('newlines, modified Enter, composition and unrelated targets keep native behavior',async()=>{
  for(const patch of [{shiftKey:true},{altKey:true},{metaKey:true},
    {ctrlKey:true,shiftKey:true},{ctrlKey:true,altKey:true},{ctrlKey:true,metaKey:true},
    {isComposing:true},{keyCode:229},{defaultPrevented:true},{key:'a'},{target:{} }]){
    const h=fixture({queued:true});await h.run();
    assert.equal(h.key(patch).prevented,false,JSON.stringify(patch));assert.equal(h.calls.clear,0);
  }
  const h=fixture({queued:true});await h.run();h.composition('compositionstart');
  assert.equal(h.key().prevented,false);
  h.composition('compositionend');assert.equal(h.key().prevented,false,'IME commit Enter is not a queue shortcut');
  assert.equal(h.calls.clear,0);
});

test('Ctrl+Enter queues the first draft exactly once even when native Send is available',async()=>{
  const h=fixture({clear:{ok:true,text:'private draft'}});await h.run();
  h.snap.busy=false;
  h.snap.sendButton={disabled:false,getAttribute:()=>null};
  const event=h.key({ctrlKey:true});
  assert.equal(event.prevented,true);assert.equal(event.stopped,true);
  assert.equal(h.listeners.get('keydown').options,true);
  assert.equal(h.calls.preflight,1);assert.equal(h.calls.clear,1);
  assert.equal(h.calls.enqueued,1);assert.equal(h.calls.ticks,0);
  assert.match(h.calls.toasts.at(-1),/加入发送队列/);
  h.key({ctrlKey:true,repeat:true});
  assert.equal(h.calls.clear,1,'key repeat must not enqueue a second time');
});

test('Ctrl+Enter shares the button preflight and uncertain-clear recovery',async()=>{
  const denied=fixture({preflight:{ok:false,reason:'发送队列已满'}});await denied.run();
  const rejected=denied.key({ctrlKey:true});
  assert.equal(rejected.prevented,true);
  assert.equal(denied.calls.preflight,1);assert.equal(denied.calls.clear,0);
  assert.equal(denied.calls.enqueued,0);
  assert.match(denied.calls.toasts.at(-1),/队列已满/);

  const h=fixture();await h.run();
  assert.equal(h.key({ctrlKey:true}).prevented,true);
  assert.equal(h.calls.clear,1);assert.equal(h.calls.enqueued,0);
  assert.equal(h.calls.recovery.text,'private draft');
  h.key({ctrlKey:true});
  assert.equal(h.calls.clear,1,'recovery fence must block a second attempt');
});

test('Ctrl+Enter consumes empty and attachment-only drafts without native submission',async()=>{
  for(const rich of [false,true]){
    const h=fixture({preflight:{ok:false,reason:'原生草稿为空'}});await h.run();
    h.snap.busy=false;h.snap.draft='';h.snap.rich=rich;
    h.snap.sendButton={disabled:false,getAttribute:()=>null};
    const event=h.key({ctrlKey:true});
    assert.equal(event.prevented,true);assert.equal(event.stopped,true);
    assert.equal(h.calls.preflight,1);assert.equal(h.calls.clear,0);
    assert.equal(h.calls.enqueued,0);
    assert.match(h.calls.toasts.at(-1),/草稿为空/);
  }
});

test('Ctrl+Enter leaves other targets, IME and retired owners untouched',async()=>{
  const patches=[{ctrlKey:true,shiftKey:true},{ctrlKey:true,altKey:true},
    {ctrlKey:true,metaKey:true},{ctrlKey:true,isComposing:true},
    {ctrlKey:true,keyCode:229},{ctrlKey:true,defaultPrevented:true},
    {ctrlKey:true,target:{}},{ctrlKey:true,key:'a'}];
  for(const patch of patches){
    const h=fixture();await h.run();
    assert.equal(h.key(patch).prevented,false,JSON.stringify(patch));
    assert.equal(h.calls.clear,0);
  }
  const h=fixture();await h.run();h.composition('compositionstart');
  assert.equal(h.key({ctrlKey:true}).prevented,false);
  h.composition('compositionend');
  assert.equal(h.key({ctrlKey:true}).prevented,false);
  assert.equal(h.calls.clear,0);
  h.retire();assert.equal(h.key({ctrlKey:true}).prevented,false);
  const legacy=fixture();await legacy.run();legacy.setLegacy(true);
  assert.equal(legacy.key({ctrlKey:true}).prevented,false);
  assert.equal(legacy.calls.clear,0);
});

test('untrusted Enter events cannot clear or enqueue a native draft',async()=>{
  for(const ctrlKey of [false,true]){
    const h=fixture({queued:true,clear:{ok:true,text:'private draft'}});await h.run();
    const event=h.key({ctrlKey,isTrusted:false});
    assert.equal(event.prevented,false);assert.equal(event.stopped,false);
    assert.equal(h.calls.clear,0);assert.equal(h.calls.enqueued,0);
  }
});

test('Ctrl+Enter and the crown preserve drafts throughout an unconfirmed flight',async()=>{
  for(const phase of ['preparing','await-native-ready','await-confirm','unknown','await-stop']){
    const h=fixture({queued:true,clear:{ok:true,text:'private draft'}});await h.run();
    h.state.inFlight={id:'q1',phase};
    assert.equal(h.key({ctrlKey:true}).prevented,true,phase);
    h.enqueue();
    assert.equal(h.calls.clear,0,phase);assert.equal(h.calls.enqueued,0,phase);
    assert.equal(h.snap.draft,'private draft',phase);
    assert.match(h.calls.toasts.at(-1),/尚未确认.*草稿已保留/);
  }
});

test('Ctrl+Enter resumes at the IME grace boundary and follows current editor descendants',async()=>{
  const h=fixture({clear:{ok:true,text:'private draft'}});await h.run();
  h.composition('compositionend');h.setNow(1099);
  assert.equal(h.key({ctrlKey:true}).prevented,false);
  h.setNow(1100);
  const old=h.snap.editor,child={};
  h.snap.editor={contains:target=>target===child};
  assert.equal(h.key({ctrlKey:true,target:old}).prevented,false);
  assert.equal(h.key({ctrlKey:true,target:{},composedPath:()=>[child]}).prevented,true);
  assert.equal(h.calls.enqueued,1);
  h.retire();
  assert.equal(h.key({ctrlKey:true,target:h.snap.editor}).prevented,false);
  assert.equal(h.calls.enqueued,1,'retirement is checked after the grace period');
  const legacy=fixture();await legacy.run();legacy.setLegacy(true);
  assert.equal(legacy.key({ctrlKey:true}).prevented,false);
  assert.equal(legacy.calls.clear,0,'late legacy ownership independently blocks Ctrl+Enter');
});

test('Enter follows editor replacement and becomes inert after retirement or late legacy owner',async()=>{
  const h=fixture({queued:true,clear:{ok:true,text:'private draft'}});await h.run();
  const old=h.snap.editor;h.snap.editor={contains:()=>false};
  assert.equal(h.key({target:old}).prevented,false);
  assert.equal(h.key({target:h.snap.editor}).prevented,true);
  h.retire();assert.equal(h.key({target:h.snap.editor}).prevented,false);
  const legacy=fixture({queued:true});await legacy.run();legacy.setLegacy(true);
  assert.equal(legacy.key().prevented,false);assert.equal(legacy.calls.clear,0);
});

test('full queues, unknown flights and route or bridge conflicts never clear a draft via Enter',async()=>{
  for(const mode of ['full','unknown','flight','route','bridge']){
    const h=fixture({queued:true,preflight:{ok:false,reason:'发送队列已满'}});await h.run();
    if(mode==='unknown')h.state.phase='unknown';
    if(mode==='flight')h.state.inFlight={phase:'await-confirm'};
    if(mode==='route')h.snap.route='c/87654321';
    if(mode==='bridge')h.snap.ok=false;
    h.key();assert.equal(h.calls.clear,0,mode);assert.equal(h.calls.enqueued,0,mode);
    assert.equal(h.snap.draft,'private draft',mode);
  }
});

test('Enter recovery uses the same retained copy and never reports a successful enqueue',async()=>{
  const h=fixture({queued:true});await h.run();
  assert.equal(h.key().prevented,true);assert.equal(h.calls.enqueued,0);
  assert.equal(h.calls.recovery.text,'private draft');
  h.key();assert.equal(h.calls.clear,1);assert.equal(h.calls.enqueued,0);
  assert.ok(h.calls.toasts.every(message=>!message.includes('已加入发送队列')));
});

test('force-send click calls the engine once without a second confirmation',async()=>{
  const h=fixture({queued:true});await h.run();h.actions.sendNow('q1');
  assert.equal(h.calls.now,1);assert.equal(h.calls.confirms,0);
  h.enqueue();h.actions.sendNow('q1');
  assert.equal(h.calls.now,1,'a retained recovery copy vetoes stopping too');
});

test('unknown message deletion uses a nonblocking toast without resending or changing the draft',async()=>{
  const h=fixture({queued:true});await h.run();
  h.state.items[0].state='unknown';h.state.phase='unknown';
  h.state.inFlight={id:'q1',phase:'unknown'};
  const draft=h.snap.draft;
  assert.equal(h.actions.remove('q1'),true);
  assert.deepEqual(h.calls.removed,['q1']);assert.equal(h.calls.confirms,0);
  assert.match(h.calls.toasts.at(-1),/已从队列删除.*发送结果可能已生效.*检查原对话/);
  assert.equal(h.snap.draft,draft);
  assert.equal(h.calls.clear,0);assert.equal(h.calls.restores,0);
  assert.equal(h.calls.enqueued,0);assert.equal(h.calls.ticks,0);assert.equal(h.calls.now,0);
});

test('rejected deletions do not show a success toast or request confirmation',async()=>{
  for(const phase of ['unknown','await-confirm']){
    const h=fixture({queued:true,removeResult:false});await h.run();
    h.state.items[0].state=phase==='unknown'?'unknown':'sending';
    h.state.inFlight={id:'q1',phase};
    assert.equal(h.actions.remove('q1'),false);
    assert.deepEqual(h.calls.removed,['q1']);assert.equal(h.calls.confirms,0);
    assert.deepEqual(h.calls.toasts,[]);
  }
});

test('deleting an unsent message does not warn about another unknown message',async()=>{
  const h=fixture({queued:true});await h.run();
  h.state.items.push({id:'q2',text:'another message',state:'unknown'});
  h.state.phase='unknown';h.state.inFlight={id:'q2',phase:'unknown'};
  assert.equal(h.actions.remove('q1'),true);
  assert.deepEqual(h.calls.removed,['q1']);assert.equal(h.calls.confirms,0);
  assert.deepEqual(h.calls.toasts,[]);
});

for(const allowed of [false,true]){
  test(`unknown draft edit delegates to read-only no-send proof (${allowed})`,async()=>{
    const h=fixture({queued:true,reclaimPrepared:allowed});await h.run();
    h.state.items[0].state='unknown';h.state.phase='unknown';
    h.state.inFlight={id:'q1',phase:'unknown'};
    const draft=h.snap.draft;
    assert.equal(h.edit(),true,'accepted for independent verification, not yet reclaimed');
    assert.equal(h.calls.reclaimPrepared,undefined);
    h.poll();assert.equal(h.calls.reclaimPrepared,1);
    assert.equal(h.calls.clear,0);assert.equal(h.calls.restores,0);
    assert.equal(h.snap.draft,draft);assert.equal(h.calls.now,0);
    if(allowed)assert.match(h.calls.toasts.at(-1),/已取回/);
    else assert.equal(h.calls.recovery.text,draft);
  });
}


test('clear microtask rollback cannot enqueue the same transfer twice',async()=>{
  const h=fixture({clear:{ok:true,text:'private draft'}});await h.run();
  assert.equal(h.enqueue(),true);
  await Promise.resolve().then(()=>{h.snap.draft='private draft';});
  assert.equal(h.enqueue(),false);assert.equal(h.actions.sendNow('new1'),false);
  h.poll();assert.equal(h.calls.enqueued,1);assert.equal(h.calls.canSubmit,false);
  assert.equal(h.calls.recovery.text,'private draft');
});

test('reclaim waits for independent poll and retains backup through later clearing',async()=>{
  const h=fixture({reclaim:{ok:true}});await h.run();assert.equal(h.edit(),true);
  assert.equal(h.state.items.length,1);assert.equal(h.state.items[0].state,'paused');
  h.poll();assert.equal(h.state.items.length,0);h.unload();assert.equal(h.calls.unloadPrevented,true);
  await Promise.resolve().then(()=>{h.snap.draft='';});h.poll();
  assert.equal(h.calls.recovery.text,'private draft');assert.equal(h.calls.canSubmit,false);
});

for(const change of ['microtask','editor','form','route','new input']){
  test(`pending reclaim preserves original on ${change}`,async()=>{
    const h=fixture({reclaim:{ok:true}});await h.run();h.edit();
    await Promise.resolve().then(()=>{
      if(change==='editor')h.snap.editor={};
      else if(change==='form')h.snap.form={};
      else if(change==='route')h.snap.route='c/another';
      else h.snap.draft=change==='new input'?'new user draft':'';
    });
    h.poll();assert.equal(h.state.items.length,1);assert.equal(h.calls.reclaimed,undefined);
    assert.equal(h.calls.recovery.text,'private draft');assert.equal(h.calls.canSubmit,false);
    if(change==='new input')assert.equal(h.snap.draft,'new user draft');
  });
}

test('remote removal during pending reclaim cannot erase the retained original',async()=>{
  const h=fixture({reclaim:{ok:true}});await h.run();h.edit();h.state.items=[];h.poll();
  assert.equal(h.calls.reclaimed,undefined);assert.equal(h.calls.recovery.text,'private draft');
  assert.ok(h.calls.toasts.every(x=>!x.includes('已取回到输入框，取消排队')));
});


for(const change of ['clear','editor','form','route']){
  test(`successful reclaim keeps backup across multiple polls before later ${change}`,async()=>{
    const h=fixture({reclaim:{ok:true}});await h.run();h.edit();h.poll();h.poll();h.poll();
    assert.equal(h.calls.recovery,null);
    if(change==='clear')h.snap.draft='';else h.snap[change]=change==='route'?'c/elsewhere':{};
    h.poll();assert.equal(h.calls.recovery.text,'private draft');assert.equal(h.calls.canSubmit,false);
  });
}

test('only explicit user beforeinput releases a successful draft backup',async()=>{
  const h=fixture({reclaim:{ok:true}});await h.run();h.edit();h.poll();
  h.beforeinput();h.snap.draft='new intended draft';h.input();h.poll();
  assert.equal(h.calls.recovery,null);h.unload();assert.equal(h.calls.unloadPrevented,false);
});

for(const outcome of ['canceled','unchanged']){
  test(`${outcome} beforeinput does not discard the only successful takeback backup`,async()=>{
    const h=fixture({reclaim:{ok:true}});await h.run();h.edit();h.poll();
    const event=h.beforeinput();if(outcome==='canceled')event.defaultPrevented=true;
    h.input();h.snap.draft='';h.poll();
    assert.equal(h.calls.recovery.text,'private draft');
    assert.equal(h.calls.canSubmit,false);
  });
}

test('foreign beforeinput cannot release backup or authorize a pending handoff',async()=>{
  const h=fixture({reclaim:{ok:true}});await h.run();h.edit();
  h.beforeinput({isTrusted:false});h.poll();
  assert.equal(h.state.items.length,1);assert.equal(h.calls.recovery.text,'private draft');
  const b=fixture({reclaim:{ok:true}});await b.run();b.edit();b.poll();
  b.beforeinput({isTrusted:false});b.snap.draft='';b.poll();
  assert.equal(b.calls.recovery.text,'private draft');
});

test('own synchronous beforeinput does not veto write or discard backup',async()=>{
  const h=fixture({reclaim:{ok:true}});await h.run();
  h.calls.onWrite=()=>h.beforeinput({isTrusted:false});h.edit();h.poll();
  assert.equal(h.state.items.length,0);assert.equal(h.calls.recovery,null);
  h.snap.draft='';h.poll();assert.equal(h.calls.recovery.text,'private draft');
});

test('new draft before a second transfer is never overwritten or substituted for old backup',async()=>{
  const h=fixture({reclaim:{ok:true},clear:{ok:true,text:'private draft'}});await h.run();
  h.edit();h.poll();h.snap.draft='new text';h.enqueue();
  assert.equal(h.calls.clear,0);assert.equal(h.snap.draft,'new text');
  assert.equal(h.calls.recovery.text,'private draft');
});

test('successful restore also keeps backup for a later website rollback',async()=>{
  const h=fixture({clear:{ok:true,text:'private draft'},enqueue:false,restore:true});await h.run();
  h.enqueue();h.unload();assert.equal(h.calls.unloadPrevented,true);h.poll();h.poll();
  assert.equal(h.calls.recovery,null);h.snap.draft='';h.poll();
  assert.equal(h.calls.recovery.text,'private draft');
});

test('pending copy protects unload even after direct remote deletion and owner disposal is inert',async()=>{
  const h=fixture({reclaim:{ok:true}});await h.run();h.edit();h.state.items=[];
  h.unload();assert.equal(h.calls.unloadPrevented,true);h.destroy();h.poll();
  assert.equal(h.calls.recovery,null);assert.equal(h.calls.ticks,0);
  assert.equal(h.edit(),undefined);assert.equal(h.calls.reclaimed,undefined);
});


test('pending enqueue vetoes independent engine submission and protects removed text',async()=>{
  const h=fixture({clear:{ok:true,text:'private draft'}});await h.run();h.enqueue();
  assert.equal(h.calls.ticks,0);assert.equal(h.edit(),false);assert.equal(h.actions.sendNow('new1'),false);
  h.state.items=[];h.unload();assert.equal(h.calls.unloadPrevented,true);h.poll();
  assert.equal(h.calls.recovery.text,'private draft');assert.equal(h.calls.canSubmit,false);
});


for(const change of ['restored text','different text','history']){
  test(`post-enqueue provenance survives empty acknowledgements before ${change}`,async()=>{
    const h=fixture({clear:{ok:true,text:'private draft'}});await h.run();
    h.enqueue();h.poll();h.poll();h.poll();
    if(change==='history')h.snap.users=[{innerText:'unverified native admission'}];
    else h.snap.draft=change==='restored text'?'private draft':'other website text';
    const draft=h.snap.draft;
    h.enqueue();h.poll();
    assert.equal(h.calls.enqueued,1);assert.equal(h.calls.clear,1);
    assert.equal(h.snap.draft,draft);assert.equal(h.calls.recovery.text,'private draft');
    assert.equal(h.calls.uncertain[0],'new1');assert.equal(h.calls.canSubmit,false);
    assert.equal(h.state.items[0].text,'private draft');
  });
}

for(const outcome of ['trusted edit','canceled','unchanged','untrusted input']){
  test(`post-enqueue identical-message intent requires an actual uncanceled trusted edit: ${outcome}`,async()=>{
    const h=fixture({clear:{ok:true,text:'private draft'}});await h.run();h.enqueue();h.poll();
    const event=h.beforeinput();
    if(outcome==='canceled')event.defaultPrevented=true;
    if(outcome!=='unchanged')h.snap.draft='private draft';
    h.input({isTrusted:outcome!=='untrusted input'});
    if(outcome==='unchanged')h.snap.draft='private draft';
    h.enqueue();h.poll();
    assert.equal(h.calls.enqueued,outcome==='trusted edit'?2:1);
    assert.equal(h.calls.clear,outcome==='trusted edit'?2:1);
    assert.equal(h.calls.recovery?.text,outcome==='trusted edit'?undefined:'private draft');
  });
}
