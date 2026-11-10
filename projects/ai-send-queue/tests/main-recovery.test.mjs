import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createQueueCache} from '../src/page/cache.js';
import {memoryStorage} from './helpers/session-storage.mjs';

// Exercise the real entry's action wiring without sending a website message.
const entry=await readFile(new URL('../src/page/main.js',import.meta.url),'utf8');
function fixture({preflight={ok:true},clear={ok:false,needsRecovery:true,text:'private draft',
  reason:'editor replaced'},restore=false,enqueue=true,reclaim=null,queued=false,reclaimPrepared=false,removeResult=true}={}){
  const storage=memoryStorage();
  const calls={preflight:0,clear:0,enqueued:0,ticks:0,pauses:0,restores:0,toasts:[],
    recovery:null,unloadPrevented:false,uncertain:null,now:0,confirms:0,removed:[],inspects:0,tickOptions:[],resumes:0};
  let actions,unload,change,hasRecovery=false,active=true,legacy=false,now=1000;
  const listeners=new Map(),editor={contains:()=>false};
  const disposers=[],timers=[],events=[];
  function runTimer(ms){
    const selected=timers.filter(timer=>timer.ms===ms);
    assert.ok(selected.length,`missing managed ${ms}ms timer`);
    for(const timer of selected)timer.callback();
  }
  function advance(elapsed){
    const end=now+elapsed;
    for(;;){
      const next=timers.filter(timer=>timer.enabled).sort((a,b)=>a.next-b.next)[0];
      if(!next||next.next>end)break;
      now=next.next;next.next+=next.ms;next.callback();
    }
    now=end;
  }
  function event(target,type,patch={}){
    for(const listener of events.filter(item=>item.target===target&&item.type===type))listener.callback(patch);
  }
  const snap={ok:true,route:'c/12345678',editor,draft:reclaim?'':'private draft',rich:false,users:[],assistants:[],
    busy:true,sendButton:null};
  const state={items:reclaim||queued?[{id:'q1',text:'private draft',state:'queued'}]:[],route:snap.route,phase:'waiting',inFlight:null};
  const site={inspect(){calls.inspects++;calls.onInspect?.();return snap;},clearForQueue(){calls.clear++;calls.onClear?.();if(clear.ok)snap.draft='';return clear;},
    reclaimToComposer(){if(reclaim?.ok)snap.draft='private draft';calls.onWrite?.();return reclaim;},
    restore(){calls.restores++;if(restore)snap.draft='private draft';return restore;}};
  const engine={view:()=>state,
    checkEnqueue(){calls.preflight++;return preflight;},
    enqueue(text){calls.enqueued++;if(enqueue)state.items.push({id:'q'+(calls.enqueued+1),text,state:'queued'});return enqueue;},
    pause(id){calls.pauses++;const item=state.items.find(x=>x.id===id);if(!item)return false;item.state='paused';return true;},
    reclaim(id){calls.reclaimed=(calls.reclaimed||0)+1;const i=state.items.findIndex(x=>x.id===id);if(i<0)return false;state.items.splice(i,1);return true;},
    wait(){},
    resume(){calls.resumes++;return true;},
    reclaimPrepared(){calls.reclaimPrepared=(calls.reclaimPrepared||0)+1;return reclaimPrepared;},
    uncertain(...args){calls.uncertain=args;},
    remove(id){calls.removed.push(id);return removeResult;},
    requestNow(){calls.now++;return {ok:true};},
    tick(options){calls.ticks++;calls.canSubmit=options?.canSubmit;calls.tickOptions.push({...options});calls.onTick?.();}};
  const owner={host:{style:{setProperty(){}},hidden:false},
    on(target,type,callback,options){listeners.set(type,{callback,options});events.push({target,type,callback});if(type==='beforeunload')unload=callback;},
    onDispose(fn){disposers.push(fn);},setInterval(callback,ms){const timer={callback,ms,next:now+ms,enabled:true};timers.push(timer);return timer;},active:()=>active,destroy(){active=false;timers.forEach(timer=>timer.enabled=false);disposers.forEach(fn=>fn());}};
  const view={place(){calls.onPlace?.();return true;},render(){calls.onRender?.();},hide(){calls.onHide?.();},
    toast(message){calls.toasts.push(message);},
    offerRecovery(text,reason){calls.onRecovery?.();if(hasRecovery)return false;hasRecovery=true;
      calls.recovery={text,reason};return true;},
    hasRecovery(){return hasRecovery;},recovery:()=>calls.recovery};
  const win={location:{origin:'https://chatgpt.com'},confirm(){calls.confirms++;return true;}};win.top=win;
  const doc={visibilityState:'visible',querySelector:()=>legacy?{}:null};
  const ctx=vm.createContext({window:win,document:doc,Date:class extends Date {static now(){return now;}},
    createPageUI:()=>owner,createChatGPTSite:()=>site,
    createQueueCache:()=>createQueueCache({storage:()=>storage}),
    createQueueEngine:options=>{change=options.change;return engine;},
    createQueueView:options=>{actions=options.actions;return view;},
     createSendQueueRemote:()=>({changed(){calls.onChanged?.();}})});
  vm.runInContext(entry.replace(/^import .*;\n/gm,'')
    .replace('export default async function main','async function main'),ctx);
  return {calls,snap,state,listeners,storage,timers,advance,runTimer,change:()=>change(),
    stopTimer(ms){timers.filter(timer=>timer.ms===ms).forEach(timer=>timer.enabled=false);},
    event(target,type,patch){event(target==='document'?doc:win,type,patch);},
    visibility(value){doc.visibilityState=value;event(doc,'visibilitychange');},
    setNow(value){now=value;},setLegacy(value){legacy=value;},retire(){active=false;},
    key(patch={}){const event={key:'Enter',isTrusted:true,target:editor,prevented:false,stopped:false,
      preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...patch};
      listeners.get('keydown').callback(event);return event;},
    composition(type){listeners.get(type).callback();},
    run:()=>ctx.main(),enqueue:(event={})=>actions.enqueue(event),edit:()=>actions.edit('q1'),poll:()=>runTimer(650),destroy:()=>owner.destroy(),
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
  assert.equal(h.calls.unloadPrevented,false);
  assert.equal(event.returnValue,undefined);
});

test('confirmed exact clear enters the queue once',async()=>{
  const h=fixture({clear:{ok:true,text:'private draft'}});
  await h.run();h.enqueue();
  assert.equal(h.calls.enqueued,1);assert.equal(h.calls.ticks,0);
  assert.equal(h.calls.pauses,0);assert.equal(h.calls.recovery,null);
});
test('the full transfer is cached before native clearing and quota failure retains unload protection',async()=>{
  const h=fixture({clear:{ok:true,text:'private draft'}});await h.run();
  h.calls.onClear=()=>{
    const cached=createQueueCache({storage:()=>h.storage}).read(h.snap.route);
    assert.equal(cached.data.draft.text,'private draft');assert.equal(h.snap.draft,'private draft');
  };
  assert.equal(h.enqueue(),true);
  h.storage.setItem=()=>{throw Error('quota');};h.unload();assert.equal(h.calls.unloadPrevented,true);
});
test('uncertain clearing cannot lose its only original when recovery UI throws',async()=>{
  const h=fixture();await h.run();h.calls.onRecovery=()=>{throw Error('UI unavailable');};h.enqueue();
  h.snap.draft='';h.poll();h.poll();
  assert.equal(createQueueCache({storage:()=>h.storage}).read(h.snap.route).data.draft.text,'private draft');
  assert.equal(h.calls.canSubmit,false);h.calls.onRecovery=null;h.poll();
  assert.equal(h.calls.recovery.text,'private draft');
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
    assert.deepEqual(h.calls.removed,phase==='unknown'?['q1']:[]);assert.equal(h.calls.confirms,0);
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
  assert.equal(h.enqueue(),false);assert.equal(h.actions.sendNow('q2'),false);
  h.poll();assert.equal(h.calls.enqueued,1);assert.equal(h.calls.canSubmit,false);
  assert.equal(h.calls.recovery.text,'private draft');
});

test('reclaim waits for independent poll and retains backup through later clearing',async()=>{
  const h=fixture({reclaim:{ok:true}});await h.run();assert.equal(h.edit(),true);
  assert.equal(h.state.items.length,1);assert.equal(h.state.items[0].state,'paused');
  h.poll();assert.equal(h.state.items.length,0);h.unload();assert.equal(h.calls.unloadPrevented,false);
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
  h.enqueue();h.unload();assert.equal(h.calls.unloadPrevented,false);h.poll();h.poll();
  assert.equal(h.calls.recovery,null);h.snap.draft='';h.poll();
  assert.equal(h.calls.recovery.text,'private draft');
});

test('pending copy protects unload even after direct remote deletion and owner disposal is inert',async()=>{
  const h=fixture({reclaim:{ok:true}});await h.run();h.edit();h.state.items=[];
  h.unload();assert.equal(h.calls.unloadPrevented,false);h.destroy();h.poll();
  assert.equal(h.calls.recovery,null);assert.equal(h.calls.ticks,0);
  assert.equal(h.edit(),undefined);assert.equal(h.calls.reclaimed,undefined);
});


test('pending enqueue vetoes independent engine submission and protects removed text',async()=>{
  const h=fixture({clear:{ok:true,text:'private draft'}});await h.run();h.enqueue();
  assert.equal(h.calls.ticks,0);assert.equal(h.edit(),false);assert.equal(h.actions.sendNow('q2'),false);
  h.state.items=[];h.unload();assert.equal(h.calls.unloadPrevented,false);h.poll();
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
    assert.equal(h.calls.uncertain[0],'q2');assert.equal(h.calls.canSubmit,false);
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

// These checks enter through registered owner timers/events, never engine.tick.
test('stall watchdog rechecks by 35s when the 650ms poll stops',async()=>{
  const h=fixture({queued:true});await h.run();h.stopTimer(650);
  assert.equal(h.timers.filter(timer=>timer.ms===650).length,1);
  assert.equal(h.timers.filter(timer=>timer.ms===5000).length,1);
  h.advance(29999);assert.equal(h.calls.ticks,0,'no premature watchdog scan');
  h.advance(5001);assert.ok(h.calls.ticks>=1,'a registered watchdog must recover scheduling');
  assert.equal(h.calls.clear,0);assert.equal(h.calls.now,0);
});

test('stall watchdog diagnoses unchanged work despite successful normal polls',async()=>{
  const h=fixture({queued:true});await h.run();
  h.advance(29999);
  const before=h.calls.ticks;
  assert.ok(before>0,'normal 650ms polling remains active');
  // Only watchdog callbacks run from here: repeated successful reads must not
  // erase the separate business-progress deadline.
  h.stopTimer(650);h.advance(5001);
  assert.ok(h.calls.ticks>before,'unchanged waiting work needs a watchdog recheck');
});

for(const method of ['Place','Render','Hide']){
  for(const persistent of [false,true]){
    test(`stall ${method.toLowerCase()} ${persistent?'persistent':'one-shot'} error preserves read-only checks`,async()=>{
      const h=fixture({queued:true});await h.run();
      if(method==='Hide')h.snap.ok=false;
      let failures=0;
      h.calls['on'+method]=()=>{if(persistent||failures++===0)throw new Error('injected UI failure');};
      assert.doesNotThrow(()=>h.advance(650));
      assert.equal(h.calls.ticks,1,'UI failure cannot skip admission/deadline reconciliation');
      assert.equal(h.calls.canSubmit,false,'failed UI round cannot authorize a new submission');
      assert.doesNotThrow(()=>h.advance(650));
      assert.equal(h.calls.ticks,2);
      assert.equal(h.calls.canSubmit,!persistent&&method!=='Hide');
      assert.equal(h.calls.clear,0);assert.equal(h.calls.restores,0);
    });
  }
}

for(const callback of ['Changed','Render']){
  test(`stall engine change ${callback.toLowerCase()} errors cannot escape or authorize the failed round`,async()=>{
    const h=fixture({queued:true});await h.run();
    h.calls['on'+callback]=()=>{throw new Error('injected change observer failure');};
    h.calls.onPlace=()=>h.change();
    assert.doesNotThrow(()=>h.advance(650));
    assert.equal(h.calls.ticks,1);assert.equal(h.calls.canSubmit,false);
    h.calls.onPlace=null;h.calls['on'+callback]=null;
    h.advance(650);assert.equal(h.calls.ticks,2);assert.equal(h.calls.canSubmit,true);
    // A change emitted inside tick must not interrupt the state machine either.
    h.calls['on'+callback]=()=>{throw new Error('observer during engine transition');};
    let completed=false;
    h.calls.onTick=()=>{h.change();completed=true;};
    assert.doesNotThrow(()=>h.advance(650));assert.equal(completed,true);
  });
}

for(const source of ['poll','events']){
  test(`stall synchronous ${source} reentry shares one checking gate`,async()=>{
    const h=fixture({queued:true});await h.run();
    let injected=false;
    h.calls.onPlace=()=>{
      if(injected)return;injected=true;
      if(source==='poll')h.poll();
      else {h.visibility('visible');h.event('window','pageshow');}
    };
    h.advance(650);
    assert.equal(injected,true);assert.equal(h.calls.ticks,1,'nested check cannot tick twice');
    h.calls.onPlace=null;h.advance(650);
    assert.equal(h.calls.ticks,2,'the guard must release for later checks');
    if(source==='events'){
      h.event('window','pageshow');
      assert.equal(h.calls.ticks,3,'recovery event is registered and usable after reentry');
    }
  });
}

test('stall visible and pageshow recheck on their original event targets',async()=>{
  const h=fixture({queued:true});await h.run();h.stopTimer(650);
  h.visibility('hidden');assert.equal(h.calls.ticks,0);
  h.event('document','pageshow');h.event('window','visibilitychange');
  assert.equal(h.calls.ticks,0,'unrelated targets do not trigger recovery');
  h.visibility('visible');assert.equal(h.calls.ticks,1);
  h.event('window','pageshow');assert.equal(h.calls.ticks,2);
});

for(const retirement of ['destroy','legacy']){
  test(`stall ${retirement} owner stays inert under stale timers and recovery events`,async()=>{
    const h=fixture({queued:true});await h.run();
    assert.equal(h.timers.filter(timer=>timer.ms===5000).length,1);
    if(retirement==='destroy')h.destroy();else {h.setLegacy(true);h.poll();h.setLegacy(false);}
    const ticks=h.calls.ticks,inspects=h.calls.inspects;
    h.setNow(100000);h.runTimer(650);h.runTimer(5000);
    h.visibility('visible');h.event('window','pageshow');
    assert.equal(h.calls.ticks,ticks);assert.equal(h.calls.inspects,inspects);
    assert.equal(h.calls.clear,0);assert.equal(h.calls.now,0);
    assert.ok(h.timers.every(timer=>!timer.enabled),'owner disposal clears both schedules');
  });
}

test('stall idle watchdog does not scan but an empty queue answerGate still needs checking',async()=>{
  const idle=fixture();await idle.run();idle.stopTimer(650);
  const before=idle.calls.inspects;
  idle.advance(60000);
  assert.equal(idle.calls.inspects,before);assert.equal(idle.calls.ticks,0);
  const gated=fixture();gated.state.answerGate={id:'confirmed-q1'};
  await gated.run();gated.stopTimer(650);gated.advance(35000);
  assert.ok(gated.calls.ticks>=1,'reply gate remains work after items are removed');
  assert.deepEqual(gated.state.answerGate,{id:'confirmed-q1'});
});

for(const protection of ['unknown','paused']){
  test(`stall watchdog preserves ${protection} state and never requests forced recovery`,async()=>{
    const h=fixture({queued:true});h.state.items[0].state=protection;
    h.state.phase=protection;
    if(protection==='unknown')h.state.inFlight={id:'q1',phase:'unknown'};
    const original=JSON.stringify(h.state),draft=h.snap.draft;
    await h.run();h.stopTimer(650);h.advance(35000);
    assert.ok(h.calls.ticks>=1,'protected work is still checked');
    assert.equal(JSON.stringify(h.state),original);assert.equal(h.snap.draft,draft);
    assert.equal(h.calls.resumes,0);assert.equal(h.calls.now,0);
    assert.equal(h.calls.clear,0);assert.equal(h.calls.restores,0);
    assert.ok(h.calls.tickOptions.every(options=>typeof options.canSubmit==='boolean'),
      'watchdog retains the ordinary submission safety input');
  });
}

test('stall failed inspection is read-only and the next successful check recovers',async()=>{
  const h=fixture({queued:true}),result=await h.run();
  h.calls.onInspect=()=>{throw Error('private draft must not enter diagnostics');};
  assert.doesNotThrow(()=>h.advance(650));
  assert.equal(h.calls.ticks,1);assert.equal(h.calls.canSubmit,false);
  assert.equal(result.diagnostics.lastCheckCompletedAt,null);
  assert.equal(result.diagnostics.lastError.stage,'reconcile');
  assert.ok(!JSON.stringify(result.diagnostics).includes('private draft'));
  h.calls.onInspect=null;h.advance(650);
  assert.equal(h.calls.canSubmit,true);
  assert.equal(result.diagnostics.lastCheckCompletedAt,2300);
});

test('stall startup render error leaves managed schedules available for recovery',async()=>{
  const h=fixture({queued:true});h.calls.onRender=()=>{throw Error('startup UI failure');};
  const result=await h.run();
  assert.equal(result.status,'active');
  assert.equal(result.diagnostics.lastError.stage,'initial-layout');
  h.calls.onRender=null;h.advance(650);
  assert.equal(h.calls.ticks,1);assert.equal(h.calls.canSubmit,true);
});
