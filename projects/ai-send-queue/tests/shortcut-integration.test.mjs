import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createChatGPTSite} from '../src/page/site.js';
import {createQueueEngine} from '../src/page/engine.js';

const entry=await readFile(new URL('../src/page/main.js',import.meta.url),'utf8');
// Real main/Site/Engine, inert DOM and UI. No browser or website sends.
async function fixture({busy=false}={}){
  let now=0,poll,engine,actions,clears=0;
  const listeners=new Map(),sent=[],users=[],assistants=[],history=[];
  const state={busy,focus:()=>{}};
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
  const win={location:{origin:'https://chatgpt.com',pathname:'/c/12345678'},
    getComputedStyle:()=>({display:'block',visibility:'visible'}),
    HTMLTextAreaElement:Textarea,InputEvent:class {}};
  win.top=win;
  const doc={querySelector:()=>null,querySelectorAll:selector=>
    selector.startsWith('#prompt-textarea')?[editor]:
    selector.includes('user')&&selector.includes('assistant')?history:
    selector.startsWith('[data-message-author-role="user"]')?users:assistants};
  const owner={host:{style:{setProperty(){}}},active:()=>true,
    on(_target,type,callback){listeners.set(type,callback);},onDispose(){},destroy(){},
    setInterval(callback){poll=callback;}};
  const context=vm.createContext({window:win,document:doc,
    Date:class extends Date{static now(){return now;}},
    createPageUI:()=>owner,
    createChatGPTSite:options=>{
      const adapter=createChatGPTSite({...options,doc,win});
      return {...adapter,clearForQueue(s){clears++;return adapter.clearForQueue(s);}};
    },
    createQueueEngine:options=>(engine=createQueueEngine({...options,clock:()=>now})),
    createQueueView:options=>{
      actions=options.actions;
      return {place:()=>true,render(){},hide(){},hasRecovery:()=>false,toast(){}};
    },
    createSendQueueRemote:()=>({changed(){}})});
  vm.runInContext(entry.replace(/^import .*;\n/gm,'')
    .replace('export default async function main','async function main'),context);
  await context.main();
  return {editor,state,sent,users,history,get engine(){return engine;},
    get clears(){return clears;},get actions(){return actions;},
    step(t){now=t;poll();},
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
function queue(h,text){h.editor.value=text;assert.equal(h.key().prevented,true);}
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
