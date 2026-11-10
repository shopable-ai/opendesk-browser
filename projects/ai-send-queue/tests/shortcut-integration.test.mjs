import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createChatGPTSite} from '../src/page/site.js';
import {createQueueEngine} from '../src/page/engine.js';
import {createQueueCache} from '../src/page/cache.js';
import {memoryStorage} from './helpers/session-storage.mjs';

const entry=await readFile(new URL('../src/page/main.js',import.meta.url),'utf8');
// Real main/Site/Engine, inert DOM and UI. No browser or website sends.
async function fixture({busy=false,storage=memoryStorage(),route='c/12345678',failRecovery=false}={}){
  let now=0,poll,engine,actions,clears=0,recovery=null;
  const timers=new Map(),listeners=new Map(),sent=[],users=[],assistants=[],history=[],toasts=[];
  const state={busy,failRecovery,focus:()=>{},render:()=>{}};
  class Textarea{
    constructor(){this.current='';this.tagName='TEXTAREA';this.isConnected=true;}
    get value(){return this.current;}
    set value(text){this.current=text;}
    closest(selector){return selector==='form'?form:null;}
    contains(){return false;}
    getAttribute(){return null;}
    querySelector(){return null;}
    getClientRects(){return [{}];}
    focus(){state.focus();}
    dispatchEvent(){}
  }
  const editor=new Textarea();
  function button(kind){
    return {isConnected:true,disabled:false,closest:()=>null,getClientRects:()=>[{}],
      getAttribute:n=>n==='data-testid'?kind+'-button':null,matches:()=>false,
      click(){if(kind==='send')sent.push(editor.value);}};
  }
  const send=button('send'),stop=button('stop');
  const form={isConnected:true,hasAttribute:()=>false,
    querySelectorAll:()=>[state.busy?stop:send],querySelector:()=>null};
  const win={location:{origin:'https://chatgpt.com',pathname:'/'+route},
    getComputedStyle:()=>({display:'block',visibility:'visible'}),
    HTMLTextAreaElement:Textarea,InputEvent:class {}};
  win.top=win;
  const doc={querySelector:()=>null,querySelectorAll:selector=>
    selector.startsWith('#prompt-textarea')?[editor]:
    selector.includes('user')&&selector.includes('assistant')?history:
    selector.startsWith('[data-message-author-role="user"]')?users:assistants};
  const owner={host:{style:{setProperty(){}}},active:()=>true,
    on(_target,type,callback){listeners.set(type,callback);},onDispose(){},destroy(){},
    setInterval(callback,ms){timers.set(ms,callback);if(ms===650)poll=callback;}};
  const context=vm.createContext({window:win,document:doc,
    Date:class extends Date{static now(){return now;}},
    createPageUI:()=>owner,
    createQueueCache:()=>createQueueCache({storage:()=>storage}),
    createChatGPTSite:options=>{
      const adapter=createChatGPTSite({...options,doc,win});
      return {...adapter,clearForQueue(s){clears++;return adapter.clearForQueue(s);}};
    },
    createQueueEngine:options=>(engine=createQueueEngine({...options,clock:()=>now})),
    createQueueView:options=>{
      actions=options.actions;
      return {place:()=>true,render(){state.render();},hide(){},hasRecovery:()=>!!recovery,recovery:()=>recovery,offerRecovery(text,reason){if(state.failRecovery)throw Error('recovery UI unavailable');recovery??={text,reason};},toast(message){toasts.push(message);}};
    },
    createSendQueueRemote:()=>({changed(){}})});
  vm.runInContext(entry.replace(/^import .*;\n/gm,'')
    .replace('export default async function main','async function main'),context);
  await context.main();
  return {editor,state,sent,users,assistants,history,storage,win,toasts,poll:()=>poll(),get recovery(){return recovery;},get engine(){return engine;},
    get clears(){return clears;},get actions(){return actions;},
    step(t){now=t;poll();},
    watchdog(t){now=t;assert.equal(typeof timers.get(5000),'function');timers.get(5000)();},
    edit(text,{trusted=true,canceled=false,unchanged=false}={}){
      const event={target:editor,isTrusted:trusted,defaultPrevented:false};
      listeners.get('beforeinput')(event);
      event.defaultPrevented=canceled;
      if(!canceled&&!unchanged)editor.value=text;
      listeners.get('input')({target:editor,isTrusted:trusted,defaultPrevented:false});
    },
    key(patch={}){
      const event={key:'Enter',ctrlKey:true,isTrusted:true,target:editor,
        prevented:false,stopped:false,preventDefault(){this.prevented=true;},
        stopImmediatePropagation(){this.stopped=true;},...patch};
      listeners.get('keydown')(event);return event;
    },
    admit(text){
      const user={isConnected:true,parentElement:null,querySelector:()=>null,innerText:text,
        compareDocumentPosition(other){
          const a=history.indexOf(this),b=history.indexOf(other);
          return a<0||b<0?1:b>a?4:2;
        }};
      const assistant={isConnected:true,parentElement:null,complete:false,
        closest(){return this;},
        getAttribute:n=>n==='data-talvt-turn-state'?(assistant.complete?'complete':'in_progress'):null,
        hasAttribute:n=>n==='data-talvt-turn-state',matches:()=>false,querySelector:()=>null};
      users.push(user);assistants.push(assistant);history.push(user,assistant);
      editor.value='';state.busy=true;
    },
    finishReply(){if(assistants.length)assistants.at(-1).complete=true;state.busy=false;}
  };
}
function queue(h,text){h.edit(text);assert.equal(h.key().prevented,true);h.poll();}
test('refresh restores exact FIFO text and pauses all rows until explicit resume',async()=>{
  const a=await fixture({busy:true});queue(a,'  A\n原文\n');queue(a,'B');
  a.actions.pause('q2');a.engine.move('q2',0);
  const b=await fixture({storage:a.storage});
  assert.deepEqual(b.engine.view().items.map(x=>[x.id,x.text,x.state]),
    [['q2','B','paused'],['q1','  A\n原文\n','paused']]);
  b.step(60000);b.step(120000);assert.deepEqual(b.sent,[]);
  assert.equal(b.actions.resume('q2'),true);b.step(121000);b.step(122200);b.step(123000);
  assert.deepEqual(b.sent,['B']);
});
for(const phase of ['await-native-ready','await-confirm']){
  test('refresh never replays an interrupted '+phase+' item',async()=>{
    const a=await fixture();queue(a,'A');a.step(1400);
    if(phase==='await-confirm')a.step(2100);
    assert.equal(a.engine.view().inFlight.phase,phase);
    const b=await fixture({storage:a.storage});
    assert.equal(b.engine.view().phase,'unknown');assert.equal(b.engine.view().items[0].text,'A');
    assert.equal(b.actions.resume('q1'),false);
    for(const time of [1000,10000,120000])b.step(time);
    assert.deepEqual(b.sent,[]);assert.equal(b.engine.view().items[0].state,'unknown');
  });
}
test('refresh after exact admission keeps only remaining rows paused, without old DOM receipts',async()=>{
  const a=await fixture({busy:true});queue(a,'A');queue(a,'B');a.finishReply();
  a.step(100);a.step(1400);a.step(2100);a.admit('A');a.step(2800);
  assert.ok(a.engine.view().answerGate);
  const b=await fixture({storage:a.storage});
  assert.deepEqual(b.engine.view().items.map(x=>[x.text,x.state]),[['B','paused']]);
  assert.equal(b.engine.view().answerGate,null);b.step(120000);assert.deepEqual(b.sent,[]);
});
test('deleted or fully confirmed messages do not revive on refresh',async()=>{
  const a=await fixture({busy:true});queue(a,'A');assert.equal(a.actions.remove('q1'),true);
  const b=await fixture({storage:a.storage});assert.equal(b.engine.view().items.length,0);
  assert.equal(b.recovery,null);
  const c=await fixture();queue(c,'C');c.step(1400);c.step(2100);c.admit('C');c.step(2800);
  const d=await fixture({storage:c.storage});assert.equal(d.engine.view().items.length,0);assert.equal(d.recovery,null);
});
test('conversation and tab isolation preserve the original cache',async()=>{
  const a=await fixture({busy:true});queue(a,'A');
  const other=await fixture({storage:a.storage,route:'c/87654321'});assert.equal(other.engine.view().items.length,0);
  const tab=await fixture();assert.equal(tab.engine.view().items.length,0);
  const again=await fixture({storage:a.storage});assert.equal(again.engine.view().items[0].text,'A');
});
test('refresh restores an unfinished draft transfer as a manual copy, never a send',async()=>{
  const storage=memoryStorage(),cache=createQueueCache({storage:()=>storage});cache.read('c/12345678');
  cache.write({version:1,route:'c/12345678',items:[],expanded:false,inFlight:null,
    draft:{text:'  未完成交接\n完整原文\n'}});
  const b=await fixture({storage});
  assert.equal(b.recovery.text,'  未完成交接\n完整原文\n');
  assert.equal(b.engine.view().items.length,0);b.step(120000);assert.deepEqual(b.sent,[]);
  b.editor.value='new draft';assert.equal(b.actions.enqueue(),undefined);assert.equal(b.clears,0);
});
test('a corrupt cache cannot clear a native draft or be silently overwritten',async()=>{
  const storage=memoryStorage(),key='opendesk.ai-send-queue.session.v1:c/12345678';
  storage.setItem(key,'{broken');const b=await fixture({storage});b.editor.value='new draft';
  assert.equal(b.actions.enqueue(),false);assert.equal(b.editor.value,'new draft');
  assert.equal(b.clears,0);assert.equal(storage.getItem(key),'{broken');assert.deepEqual(b.sent,[]);
});
test('recovery UI failure preserves the only cached draft and retries safely',async()=>{
  const storage=memoryStorage(),cache=createQueueCache({storage:()=>storage}),route='c/12345678';cache.read(route);
  cache.write({version:1,route,items:[],expanded:false,inFlight:null,draft:{text:'only full original\n'}});
  const b=await fixture({storage,failRecovery:true});
  b.step(1000);b.step(60000);
  assert.equal(cache.read(route).data.draft.text,'only full original\n');assert.deepEqual(b.sent,[]);
  b.state.failRecovery=false;b.poll();assert.equal(b.recovery.text,'only full original\n');
  assert.equal(cache.read(route).data.draft.text,'only full original\n');
});
test('deletion cannot report success while its cache update fails',async()=>{
  const a=await fixture({busy:true});queue(a,'A');queue(a,'B');const set=a.storage.setItem;
  a.storage.setItem=()=>{throw Error('quota');};
  assert.equal(a.actions.remove('q1'),false);assert.equal(a.engine.view().items.length,2);
  const b=await fixture({storage:a.storage});assert.equal(b.engine.view().items.length,2);
  a.storage.setItem=set;assert.equal(a.actions.remove('q1'),true);
  const c=await fixture({storage:a.storage});assert.deepEqual(c.engine.view().items.map(x=>x.text),['B']);
});
test('cache quota failure preserves the native draft and blocks sending until storage recovers',async()=>{
  const a=await fixture({busy:true}),set=a.storage.setItem;
  a.storage.setItem=()=>{throw Error('quota');};a.edit('A');
  assert.equal(a.actions.enqueue(),false);assert.equal(a.editor.value,'A');assert.equal(a.clears,0);
  assert.equal(a.engine.view().items.length,0);
  a.storage.setItem=set;assert.equal(a.actions.enqueue(),true);a.poll();
  a.finishReply();a.storage.setItem=()=>{throw Error('quota');};a.step(100);a.step(1400);a.step(2100);
  assert.deepEqual(a.sent,[]);assert.equal(a.editor.value,'');
  a.storage.setItem=set;a.step(3000);a.step(4200);a.step(4900);assert.deepEqual(a.sent,['A']);
});
function rejectBoth(h){
  const before=JSON.stringify(h.engine.view()),draft=h.editor.value,clears=h.clears;
  assert.equal(h.key().prevented,true);h.actions.enqueue();
  assert.equal(h.clears,clears);assert.equal(h.editor.value,draft);
  assert.equal(JSON.stringify(h.engine.view()),before);
}
function finishAndClickNext(h,t){
  h.finishReply();
  for(const offset of [0,1200,2400,3100])h.step(t+offset);
}

test('preparing rejects synchronous Ctrl+Enter and crown reentry',async()=>{
  const h=await fixture();queue(h,'A');let attempts=0;
  h.state.focus=()=>{
    if(h.engine.view().inFlight?.phase==='preparing'){attempts++;rejectBoth(h);}
  };
  h.step(1400);
  assert.ok(attempts>0);assert.equal(h.clears,1);
  assert.equal(h.engine.view().items.length,1);assert.deepEqual(h.sent,[]);
});

test('prepared native text survives Ctrl+Enter, repeat and crown',async()=>{
  const h=await fixture();queue(h,'A');h.step(1400);
  assert.equal(h.engine.view().inFlight.phase,'await-native-ready');
  assert.equal(h.editor.value,'A');rejectBoth(h);
  assert.equal(h.key({repeat:true}).prevented,true);
  assert.equal(h.clears,1);assert.equal(h.engine.view().items.length,1);
});

test('residual clicked text, unknown and late acknowledgement preserve FIFO without replay',async()=>{
  const h=await fixture({busy:true});queue(h,'A');queue(h,'B');
  h.finishReply();h.step(100);h.step(1400);h.step(2100);
  assert.deepEqual(h.sent,['A']);assert.equal(h.editor.value,'A');
  assert.equal(h.engine.view().inFlight.phase,'await-confirm');rejectBoth(h);
  h.step(18000);
  assert.equal(h.engine.view().inFlight.phase,'unknown');rejectBoth(h);
  h.admit('A');h.step(19000);
  assert.equal(h.engine.view().inFlight,null);
  assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),['B']);
  h.step(30000);assert.deepEqual(h.sent,['A']);
  finishAndClickNext(h,31000);assert.deepEqual(h.sent,['A','B']);
  h.admit('B');h.step(34500);finishAndClickNext(h,35000);
  h.step(90000);
  assert.deepEqual(h.sent,['A','B']);
  assert.deepEqual(h.users.map(x=>x.innerText),['A','B']);
  assert.equal(h.engine.view().items.length,0);
  assert.equal(h.engine.view().answerGate,null);
});

test('prepared unknown reconciles a manual late admission without clicking send',async()=>{
  const h=await fixture();queue(h,'A');h.step(1400);h.step(7401);
  assert.equal(h.engine.view().inFlight.phase,'unknown');rejectBoth(h);
  h.admit('A');h.step(8000);finishAndClickNext(h,9000);h.step(20000);
  assert.deepEqual(h.sent,[]);assert.equal(h.engine.view().items.length,0);
  assert.equal(h.engine.view().answerGate,null);
});

for(const text of ['B','A']){
  test('confirmed but busy accepts intentional new draft '+text,async()=>{
    const h=await fixture();queue(h,'A');h.step(1400);h.step(2100);
    h.admit('A');h.step(2200);
    assert.equal(h.engine.view().inFlight,null);assert.ok(h.engine.view().answerGate);
    queue(h,text);
    assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),[text]);
    h.step(10000);assert.deepEqual(h.sent,['A']);
    finishAndClickNext(h,11000);assert.deepEqual(h.sent,['A',text]);
    h.admit(text);h.step(14500);finishAndClickNext(h,15000);h.step(30000);
    assert.deepEqual(h.sent,['A',text]);
    assert.deepEqual(h.users.map(x=>x.innerText),['A',text]);
    assert.equal(h.engine.view().items.length,0);
  });
}

test('await-stop preserves a newly typed draft through both entrances',async()=>{
  const h=await fixture({busy:true});queue(h,'A');
  assert.equal(h.actions.sendNow('q1'),true);
  assert.equal(h.engine.view().inFlight.phase,'await-stop');
  h.editor.value='B';rejectBoth(h);assert.deepEqual(h.sent,[]);
});

test('busy without a flight queues three drafts and sends each once in FIFO order',async()=>{
  const h=await fixture({busy:true});
  for(const text of ['A','B','C'])queue(h,text);
  assert.equal(h.engine.view().inFlight,null);
  assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),['A','B','C']);
  h.finishReply();h.step(100);h.step(1400);h.step(2100);
  assert.deepEqual(h.sent,['A']);
  h.admit('A');h.step(2200);h.step(3000);assert.deepEqual(h.sent,['A']);
  finishAndClickNext(h,4000);assert.deepEqual(h.sent,['A','B']);
  h.admit('B');h.step(7200);h.step(8000);assert.deepEqual(h.sent,['A','B']);
  finishAndClickNext(h,9000);assert.deepEqual(h.sent,['A','B','C']);
  h.admit('C');h.step(12200);finishAndClickNext(h,13000);h.step(30000);
  assert.deepEqual(h.sent,['A','B','C']);
  assert.deepEqual(h.users.map(x=>x.innerText),['A','B','C']);
  assert.equal(h.engine.view().items.length,0);assert.equal(h.engine.view().answerGate,null);
});

test('untrusted keys leave the real native draft and queue untouched',async()=>{
  const h=await fixture();h.editor.value='private';
  assert.equal(h.key({isTrusted:false}).prevented,false);
  assert.equal(h.editor.value,'private');assert.equal(h.clears,0);
  assert.equal(h.engine.view().items.length,0);assert.deepEqual(h.sent,[]);
});

// Deterministic UTF-16 payload: surrogate pairs, blank lines and edge spaces.
function longBody(length=8192){
  const unit='中文正文🧪🙂\n\n保留每个字符与空格。\n';
  const middleLength=length-4;
  const middle=unit.repeat(Math.floor(middleLength/unit.length))+'文'.repeat(middleLength%unit.length);
  return '  '+middle+'  ';
}


for(const length of [1000,8191,8192,8193,21000,50000]){
  test(`Node shortcut and crown preserve the ${length} UTF-16 admission boundary`,async()=>{
    const h=await fixture({busy:true}),text=longBody(length);
    assert.equal(text.length,length);
    queue(h,'已有排队正文🙂');
    h.edit(text);
    if(length>8192)rejectBoth(h);
    else{
      assert.equal(h.key().prevented,true);
      assert.equal(h.editor.value,'');h.poll();
      assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),['已有排队正文🙂',text]);
      h.edit(text);
      assert.equal(h.actions.enqueue(),true);
      assert.equal(h.editor.value,'');h.poll();
      assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),['已有排队正文🙂',text,text]);
    }
    assert.deepEqual(h.sent,[]);
  });
}

test('Node full queue rejects shortcut and crown without clearing a long native draft',async()=>{
  const h=await fixture({busy:true});
  const bodies=Array.from({length:20},(_,i)=>longBody(8170)+`第${i}项`);
  for(const text of bodies)queue(h,text);
  assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),bodies);
  h.edit(longBody());
  rejectBoth(h);
  assert.deepEqual(h.sent,[]);
});

test('Node take-back restores the exact long body and cancels only its queue authorization',async()=>{
  const h=await fixture({busy:true}),text=longBody();
  queue(h,text);queue(h,'保留下一项🙂');
  assert.equal(h.actions.edit('q1'),true);
  assert.equal(h.engine.view().items[0].state,'paused');h.poll();
  assert.equal(h.editor.value,text);
  assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),['保留下一项🙂']);
  assert.deepEqual(h.sent,[]);
});

test('Node long-body FIFO sends and admits exact queued bodies once each',async()=>{
  const h=await fixture({busy:true});
  const bodies=[longBody(8191),longBody(8192),'  第三条🙂\n\n'+longBody(8000)+'  '];
  for(const text of bodies)queue(h,text);
  assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),bodies);
  assert.equal(h.editor.value,'');
  h.finishReply();h.step(100);h.step(1400);h.step(2100);
  assert.deepEqual(h.sent,bodies.slice(0,1));
  for(let i=0;i<bodies.length;i++){
    const t=2200+i*5000;
    assert.equal(h.editor.value,bodies[i]);
    h.admit(h.sent.at(-1));h.step(t);
    assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),bodies.slice(i+1));
    h.step(t+500);
    assert.deepEqual(h.sent,bodies.slice(0,i+1),'busy reply must retain FIFO gate');
    finishAndClickNext(h,t+1000);
    assert.deepEqual(h.sent,bodies.slice(0,i+2));
  }
  h.step(90000);
  assert.deepEqual(h.sent,bodies);
  assert.deepEqual(h.users.map(x=>x.innerText),bodies);
  assert.equal(h.engine.view().items.length,0);
  assert.equal(h.engine.view().answerGate,null);
});


test('real adapters block microtask clear rollback and preserve FIFO without a second clear',async()=>{
  const h=await fixture({busy:true});h.editor.value='A';assert.equal(h.actions.enqueue(),true);
  await Promise.resolve().then(()=>{h.editor.value='A';});
  rejectBoth(h);h.poll();
  assert.equal(h.recovery.text,'A');assert.equal(h.clears,1);
  assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),['A']);
  assert.equal(h.engine.view().items[0].state,'unknown');assert.deepEqual(h.sent,[]);
});

test('real adapters keep takeback queued until independent readback and recover later rollback',async()=>{
  const h=await fixture({busy:true});queue(h,'A');queue(h,'B');
  assert.equal(h.actions.edit('q1'),true);
  assert.equal(h.engine.view().items.length,2);h.poll();
  assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),['B']);
  await Promise.resolve().then(()=>{h.editor.value='';});h.poll();
  assert.equal(h.recovery.text,'A');h.finishReply();h.step(10000);h.step(20000);
  assert.deepEqual(h.sent,[]);
});

test('trusted actual edits after clear acknowledgement allow intentional identical drafts',async()=>{
  const h=await fixture({busy:true});queue(h,'A');queue(h,'A');queue(h,'B');
  assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),['A','A','B']);
  assert.equal(h.recovery,null);
});

test('prepared takeback keeps the complete copy when focus schedules microtask clearing',async()=>{
  const h=await fixture();queue(h,'A');h.step(1400);h.step(7401);
  assert.equal(h.engine.view().inFlight.phase,'unknown');
  h.state.focus=()=>{Promise.resolve().then(()=>{h.editor.value='';});};
  assert.equal(h.actions.edit('q1'),true);await Promise.resolve();h.poll();
  assert.equal(h.recovery.text,'A');assert.equal(h.engine.view().items.length,1);
  assert.deepEqual(h.sent,[]);
});


test('exact native admission releases reclaimed backup rather than offering a false recovery',async()=>{
  const h=await fixture({busy:true});queue(h,'A');assert.equal(h.actions.edit('q1'),true);h.poll();
  h.admit('A');h.poll();assert.equal(h.recovery,null);assert.deepEqual(h.sent,[]);
});

test('prepared takeback also retains backup after a successful independent poll',async()=>{
  const h=await fixture();queue(h,'A');h.step(1400);h.step(7401);
  assert.equal(h.actions.edit('q1'),true);h.poll();assert.equal(h.engine.view().items.length,0);
  await Promise.resolve().then(()=>{h.editor.value='';});h.poll();
  assert.equal(h.recovery.text,'A');assert.deepEqual(h.sent,[]);
});


for(const entrance of ['crown','shortcut']){
  test(`post-ack long-text restoration blocks duplicate ${entrance} enqueue and FIFO`,async()=>{
    const h=await fixture({busy:true}),text=longBody();queue(h,text);
    h.editor.value=text;
    if(entrance==='crown')h.actions.enqueue();else h.key();
    h.finishReply();h.step(10000);h.step(20000);h.step(30000);
    assert.equal(h.editor.value,text);assert.equal(h.clears,1);
    assert.equal(h.recovery.text,text);
    assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),[text]);
    assert.equal(h.engine.view().items[0].state,'unknown');assert.deepEqual(h.sent,[]);
  });
}

for(const acknowledged of [false,true]){
  test(`native admission before next poll reconciles ${acknowledged?'post-ack':'pending'} enqueue`,async()=>{
    const h=await fixture({busy:true}),text=longBody();
    h.edit(text);assert.equal(h.actions.enqueue(),true);
    if(acknowledged)h.poll();
    h.editor.value=text;h.admit(text);h.poll();
    assert.equal(h.engine.view().items.length,0);
    assert.ok(h.engine.view().answerGate);assert.equal(h.recovery,null);
    queue(h,'next');h.step(10000);assert.deepEqual(h.sent,[]);
    finishAndClickNext(h,11000);assert.deepEqual(h.sent,['next']);
  });
  test(`ambiguous history during ${acknowledged?'post-ack':'pending'} enqueue retains the unique long copy`,async()=>{
    const h=await fixture({busy:true}),text=longBody();
    h.edit(text);h.actions.enqueue();if(acknowledged)h.poll();
    h.admit(text+' different');h.poll();h.finishReply();h.step(10000);h.step(20000);
    assert.equal(h.recovery.text,text);assert.equal(h.editor.value,'');
    assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),[text]);
    assert.equal(h.engine.view().items[0].state,'unknown');assert.deepEqual(h.sent,[]);
  });
}

for(const edit of [{trusted:false},{canceled:true},{unchanged:true}]){
  test(`non-authorizing edit cannot excuse restoration: ${JSON.stringify(edit)}`,async()=>{
    const h=await fixture({busy:true}),text=longBody();queue(h,text);
    h.edit(text,edit);h.editor.value=text;h.actions.enqueue();h.poll();
    assert.equal(h.clears,1);assert.equal(h.recovery.text,text);
    assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),[text]);
    assert.deepEqual(h.sent,[]);
  });
}

test('trusted identical long messages each send once through normal FIFO',async()=>{
  const h=await fixture({busy:true}),text=longBody();queue(h,text);queue(h,text);
  assert.equal(h.recovery,null);assert.equal(h.engine.view().items.length,2);
  h.finishReply();h.step(100);h.step(1400);h.step(2100);
  assert.deepEqual(h.sent,[text]);h.admit(text);h.step(2200);
  finishAndClickNext(h,4000);assert.deepEqual(h.sent,[text,text]);
  h.admit(text);h.step(7200);finishAndClickNext(h,8000);h.step(20000);
  assert.equal(h.engine.view().items.length,0);assert.deepEqual(h.sent,[text,text]);
});


for(const acknowledged of [false,true]){
  test(`existing busy reply may append its assistant during ${acknowledged?'post-ack':'pending'} handoff`,async()=>{
    const h=await fixture();h.admit('prior native message');
    const reply=h.assistants.pop();h.history.pop();
    h.edit('A');assert.equal(h.actions.enqueue(),true);
    if(acknowledged)h.poll();
    h.assistants.push(reply);h.history.push(reply);h.poll();
    assert.equal(h.recovery,null);assert.equal(h.engine.view().items[0].state,'queued');
    h.step(10000);assert.deepEqual(h.sent,[],'in-progress native reply still blocks send');
    h.finishReply();h.step(11000);h.step(12400);h.step(13100);
    assert.equal(h.recovery,null);assert.deepEqual(h.sent,['A']);
    assert.equal(h.editor.value,'A','engine preparation is not website rollback');
    h.admit('A');h.step(13200);finishAndClickNext(h,14000);
    assert.equal(h.engine.view().items.length,0);assert.deepEqual(h.sent,['A']);
  });
}


test('a newly observed native assistant cannot later be silently replaced',async()=>{
  const h=await fixture();h.admit('prior native message');
  const reply=h.assistants.pop();h.history.pop();queue(h,'A');
  h.assistants.push(reply);h.history.push(reply);h.poll();
  assert.equal(h.recovery,null);
  const replacement={...reply};h.assistants[0]=replacement;h.history[1]=replacement;
  h.poll();h.finishReply();h.step(10000);h.step(20000);
  assert.equal(h.recovery.text,'A');assert.deepEqual(h.sent,[]);
  assert.equal(h.engine.view().items[0].state,'unknown');
});

test('another item dispatch cannot release the latest queued draft provenance',async()=>{
  const h=await fixture({busy:true});queue(h,'A');queue(h,'B');
  h.finishReply();h.step(100);h.step(1400);h.step(2100);
  h.admit('A');h.step(2200);
  h.editor.value='B';h.actions.enqueue();h.poll();
  assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),['B']);
  assert.equal(h.engine.view().items[0].state,'unknown');
  assert.equal(h.editor.value,'B');assert.equal(h.recovery.text,'B');
  finishAndClickNext(h,4000);h.step(20000);
  assert.deepEqual(h.sent,['A']);
});

for(const text of ['A','new native draft']){
  test(`trusted native draft ${text} preserves the original queued authorization`,async()=>{
    const h=await fixture();queue(h,'A');h.edit(text);h.admit(text);h.poll();
    assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),['A']);
    assert.ok(h.engine.view().answerGate);assert.equal(h.recovery,null);
    h.step(10000);assert.deepEqual(h.sent,[]);
    finishAndClickNext(h,11000);assert.deepEqual(h.sent,['A']);
    h.admit('A');h.step(14200);finishAndClickNext(h,15000);
    assert.equal(h.engine.view().items.length,0);assert.deepEqual(h.sent,['A']);
  });
}

test('watchdog recovers missed polls without DOM events and preserves exact FIFO admission',async()=>{
  const h=await fixture({busy:true});queue(h,'A');queue(h,'B');h.finishReply();
  h.watchdog(29999);assert.deepEqual(h.sent,[]);
  h.watchdog(30000);h.watchdog(35000);h.watchdog(40000);
  assert.deepEqual(h.sent,['A']);
  h.admit('A');h.watchdog(45000);
  h.watchdog(75000);h.watchdog(80000);
  assert.deepEqual(h.sent,['A'],'a long reply cannot be timed out into sending B');
  h.finishReply();
  for(const t of [85000,90000,95000,100000,105000])h.watchdog(t);
  assert.deepEqual(h.sent,['A','B']);
  h.admit('B');h.step(105100);finishAndClickNext(h,106000);
  assert.equal(h.engine.view().items.length,0);
});

test('render failures cannot stop late admission reconciliation or replay its click',async()=>{
  const h=await fixture();queue(h,'A');queue(h,'B');h.step(1400);h.step(2100);
  assert.deepEqual(h.sent,['A']);
  h.state.render=()=>{throw Error('UI unavailable');};
  assert.doesNotThrow(()=>h.step(18000));
  assert.equal(h.engine.view().phase,'unknown');
  h.admit('A');assert.doesNotThrow(()=>h.step(19000));
  assert.equal(h.engine.view().lastConfirmed,'q1');
  assert.deepEqual(Array.from(h.engine.view().items,x=>x.text),['B']);
  h.finishReply();h.step(20000);h.step(22000);h.step(24000);
  assert.deepEqual(h.sent,['A'],'UI failure prohibits new writes while permitting read-only acknowledgement');
  h.state.render=()=>{};finishAndClickNext(h,25000);
  assert.deepEqual(h.sent,['A','B']);
});

test('a change render failure cannot strand a prepared flight or discard its complete text',async()=>{
  const h=await fixture(),text='  完整🙂\n\n原文\u00a0 ';
  h.edit(text);h.state.render=()=>{throw Error('render during enqueue');};
  assert.doesNotThrow(()=>assert.equal(h.actions.enqueue(),true));
  assert.equal(h.engine.view().items[0].text,text);
  assert.doesNotThrow(()=>h.poll());assert.deepEqual(h.sent,[]);
  h.state.render=()=>{};
  h.state.focus=()=>{h.poll();};
  h.step(100);h.step(1400);h.step(2100);
  assert.deepEqual(h.sent,[text]);
  assert.equal(h.engine.view().inFlight.phase,'await-confirm');
});


for(const route of ['', 'g/g-p-12345678-my-project-slug/project']){
  for(const entrance of ['shortcut','crown']){
    test(`new conversation /${route} asks for native first send through ${entrance} without taking the draft`,async()=>{
      const h=await fixture({route}),text='  首条原生草稿🙂\n保留末行\n';
      h.edit(text);
      if(entrance==='shortcut'){
        const event=h.key();assert.equal(event.prevented,true);assert.equal(event.stopped,true);
      }else h.actions.enqueue();
      assert.match(h.toasts.at(-1),/请先在 ChatGPT 发送首条消息/);
      for(const t of [1000,10000,30000])h.step(t);
      assert.equal(h.editor.value,text);
      assert.equal(h.clears,0);
      assert.equal(h.engine.view().items.length,0);
      assert.equal(h.engine.view().route,null);
      assert.equal(h.engine.view().inFlight,null);
      assert.equal(h.storage.entries.size,0);
      assert.deepEqual(h.sent,[]);
    });
  }

  test(`native first send from /${route} enables queueing in the same main instance`,async()=>{
    const h=await fixture({route}),engine=h.engine;
    h.edit('first native message');h.key();
    assert.equal(h.storage.entries.size,0);
    // Model the website's native send receipt and SPA URL update, not an engine send.
    h.admit('first native message');
    h.win.location.pathname=route?'/g/g-p-12345678-my-project-slug/c/87654321':'/c/87654321';
    h.poll();queue(h,'next queued message');
    assert.equal(h.engine,engine);
    assert.equal(h.engine.view().route,'c/87654321');
    assert.deepEqual(h.engine.view().items.map(item=>item.text),['next queued message']);
    assert.equal(h.editor.value,'');assert.equal(h.clears,1);
    const cached=JSON.parse(h.storage.getItem('opendesk.ai-send-queue.session.v1:c/87654321'));
    assert.deepEqual(cached.items.map(item=>item.text),['next queued message']);
    assert.deepEqual(h.sent,[]);
  });

  test(`navigation to /${route} never dispatches the previous conversation queue`,async()=>{
    const h=await fixture({busy:true});queue(h,'belongs to old conversation');
    const key='opendesk.ai-send-queue.session.v1:c/12345678';
    h.win.location.pathname='/'+route;
    h.finishReply();
    for(const t of [1000,10000,30000])h.step(t);
    assert.deepEqual(h.sent,[]);
    assert.equal(h.editor.value,'');
    assert.equal(h.clears,1);
    assert.equal(h.engine.view().route,'c/12345678');
    assert.deepEqual(h.engine.view().items.map(item=>item.text),['belongs to old conversation']);
    assert.notEqual(h.engine.view().phase,'sending');
    const cached=JSON.parse(h.storage.getItem(key));
    assert.equal(cached.route,'c/12345678');
    assert.deepEqual(cached.items.map(item=>item.text),['belongs to old conversation']);
    assert.deepEqual([...h.storage.entries.keys()],[key]);
  });
}
