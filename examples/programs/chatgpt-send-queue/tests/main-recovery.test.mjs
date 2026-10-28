import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the real entry's action wiring without sending a website message.
const entry=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
function fixture({preflight={ok:true},clear={ok:false,needsRecovery:true,text:'private draft',
  reason:'editor replaced'},restore=false,enqueue=true,reclaim=null,queued=false}={}){
  const calls={preflight:0,clear:0,enqueued:0,ticks:0,pauses:0,restores:0,toasts:[],
    recovery:null,unloadPrevented:false,uncertain:null,now:0,confirms:0};
  let actions,unload,poll,hasRecovery=false,active=true,legacy=false;
  const listeners=new Map(),editor={contains:()=>false};
  const snap={ok:true,route:'c/12345678',editor,draft:reclaim?'':'private draft',rich:false,users:[],assistants:[],
    busy:true,sendButton:null};
  const state={items:reclaim||queued?[{id:'q1',text:'private draft',state:'queued'}]:[],route:snap.route,phase:'waiting',inFlight:null};
  const site={inspect:()=>snap,clearForQueue(){calls.clear++;return clear;},
    reclaimToComposer:()=>reclaim,
    restore(){calls.restores++;return restore;}};
  const engine={view:()=>state,
    checkEnqueue(){calls.preflight++;return preflight;},
    enqueue(){calls.enqueued++;return enqueue;},
    wait(){},
    uncertain(...args){calls.uncertain=args;},
    requestNow(){calls.now++;return {ok:true};},
    tick(options){calls.ticks++;calls.canSubmit=options?.canSubmit;}};
  const owner={host:{style:{setProperty(){}},hidden:false},
    on(target,type,callback,options){listeners.set(type,{callback,options});if(type==='beforeunload')unload=callback;},
    onDispose(){},setInterval(fn){poll=fn;},active:()=>active,destroy(){active=false;}};
  const view={place(){return true;},render(){},hide(){},
    toast(message){calls.toasts.push(message);},
    offerRecovery(text,reason){if(hasRecovery)return false;hasRecovery=true;
      calls.recovery={text,reason};return true;},
    hasRecovery(){return hasRecovery;}};
  const win={location:{origin:'https://chatgpt.com'},confirm(){calls.confirms++;return true;}};win.top=win;
  const doc={querySelector:()=>legacy?{}:null};
  const ctx=vm.createContext({window:win,document:doc,
    createPageUI:()=>owner,createChatGPTSite:()=>site,
    createQueueEngine:()=>engine,
    createQueueView:options=>{actions=options.actions;return view;},
     createSendQueueRemote:()=>({changed(){}})});
  vm.runInContext(entry.replace(/^import .*;\n/gm,'')
    .replace('export default async function main','async function main'),ctx);
  return {calls,snap,state,listeners,setLegacy(value){legacy=value;},retire(){active=false;},
    key(patch={}){const event={key:'Enter',target:editor,prevented:false,stopped:false,
      preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...patch};
      listeners.get('keydown').callback(event);return event;},
    composition(type){listeners.get(type).callback();},
    run:()=>ctx.main(),enqueue:(event={})=>actions.enqueue(event),edit:()=>actions.edit('q1'),poll:()=>poll(),get actions(){return actions;},unload:()=>{
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
  assert.equal(h.calls.enqueued,1);assert.equal(h.calls.ticks,1);
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
  assert.equal(h.calls.enqueued,1);assert.equal(h.calls.canSubmit,true);
  assert.equal(h.actions.togglePause,undefined);
});

test('uncertain reclaim retains the pre-write snapshot for manual-send confirmation',async()=>{
  const h=fixture({reclaim:{ok:false,mayHaveWritten:true}});
  await h.run();h.edit();
  assert.equal(h.calls.uncertain[0],'q1');
  assert.equal(h.calls.uncertain[2],h.snap);
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
  for(const patch of [{shiftKey:true},{altKey:true},{ctrlKey:true},{metaKey:true},
    {isComposing:true},{keyCode:229},{defaultPrevented:true},{key:'a'},{target:{} }]){
    const h=fixture({queued:true});await h.run();
    assert.equal(h.key(patch).prevented,false,JSON.stringify(patch));assert.equal(h.calls.clear,0);
  }
  const h=fixture({queued:true});await h.run();h.composition('compositionstart');
  assert.equal(h.key().prevented,false);
  h.composition('compositionend');assert.equal(h.key().prevented,false,'IME commit Enter is not a queue shortcut');
  assert.equal(h.calls.clear,0);
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
