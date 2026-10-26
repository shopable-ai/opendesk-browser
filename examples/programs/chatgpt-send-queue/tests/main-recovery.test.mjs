import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the real entry's action wiring without sending a website message.
const entry=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
function fixture({preflight={ok:true},clear={ok:false,needsRecovery:true,text:'private draft',
  reason:'editor replaced'},restore=false,enqueue=true}={}){
  const calls={preflight:0,clear:0,enqueued:0,ticks:0,pauses:0,restores:0,toasts:[],
    recovery:null,unloadPrevented:false};
  let actions,unload,hasRecovery=false;
  const snap={ok:true,route:'c/12345678',draft:'private draft',rich:false};
  const site={inspect:()=>snap,clearForQueue(){calls.clear++;return clear;},
    restore(){calls.restores++;return restore;}};
  const engine={view:()=>({items:[],route:null,paused:false}),
    checkEnqueue(){calls.preflight++;return preflight;},
    enqueue(){calls.enqueued++;return enqueue;},
    pause(){calls.pauses++;},
    tick(){calls.ticks++;}};
  const owner={host:{style:{setProperty(){}},hidden:false},
    on(target,type,callback){if(type==='beforeunload')unload=callback;},
    onDispose(){},setInterval(){},active:()=>true,destroy(){}};
  const view={place(){},render(){},hide(){},
    toast(message){calls.toasts.push(message);},
    offerRecovery(text,reason){if(hasRecovery)return false;hasRecovery=true;
      calls.recovery={text,reason};return true;},
    hasRecovery(){return hasRecovery;}};
  const win={location:{origin:'https://chatgpt.com'}};win.top=win;
  const doc={querySelector:()=>null};
  const ctx=vm.createContext({window:win,document:doc,
    createPageUI:()=>owner,createChatGPTSite:()=>site,
    createQueueEngine:()=>engine,
    createQueueView:options=>{actions=options.actions;return view;}});
  vm.runInContext(entry.replace(/^import .*;\n/gm,'')
    .replace('export default async function main','async function main'),ctx);
  return {calls,run:()=>ctx.main(),enqueue:()=>actions.enqueue({}),unload:()=>{
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
  assert.equal(h.calls.ticks,0);assert.equal(h.calls.pauses,1);
  assert.deepEqual(h.calls.recovery,{text:'private draft',reason:'editor replaced'});
  h.enqueue();
  assert.equal(h.calls.clear,1,'another click cannot overwrite the recovery buffer');
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
  assert.equal(h.calls.ticks,0);assert.equal(h.calls.pauses,1);
  assert.equal(h.calls.recovery.text,'private draft');
});
