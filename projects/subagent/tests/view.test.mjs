import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {renderMiniChat} from '../src/mini-chat/view.js';
import {verifiedResult,MAX_REPLY_BYTES} from '../src/contract.js';

const A='https://chatgpt.com/c/11111111-2222-4333-8444-555555555555';
const B='https://chatgpt.com/c/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const id='71811b88-050a-4e7a-9dfa-00b10b906fe8';
const result=(requestId=id,replyText='完整回答')=>({requestId,trust:'host-verified',
  outcome:'completed',send:true,status:'reply-complete',runId:'controller-run-01',
  resultId:'controller-result-01',userMessageRef:'native-user-01',
  assistantMessageRef:'native-assistant-01',replyText,conversationUrl:B});

// Node event fixtures exercise the consumer only. They are not native user
// gestures, approval receipts, an installed transport or Chrome evidence.
function fixture(transport,options={}){
  const dom=new JSDOM('<!doctype html><textarea id="official">A 的原始草稿</textarea>',{url:A});
  const doc=dom.window.document,host=doc.createElement('div');doc.body.append(host);
  const content=doc.createElement('div');host.attachShadow({mode:'open'}).append(content);
  const handlers=[],cleanups=[],intervals=[];let destroyed=false;
  const ui={host,content,
    addStyle(css){const style=doc.createElement('style');style.textContent=css;host.shadowRoot.append(style);},
    on(target,type,callback){handlers.push({target,type,callback});
      target.addEventListener(type,callback);cleanups.push(()=>target.removeEventListener(type,callback));},
    onDispose(callback){cleanups.push(callback);},
    setInterval(callback){intervals.push(callback);},
    destroy(){if(destroyed)return;destroyed=true;
      for(const callback of [...cleanups].reverse())callback();host.remove();}
  };
  const session=renderMiniChat(ui,{transport,...options});
  const input=content.querySelector('textarea'),button=content.querySelector('button');
  return {dom,doc,ui,session,input,button,answer:content.querySelector('.answer'),
    link:content.querySelector('a'),status:content.querySelector('[role="status"]'),
    get destroyed(){return destroyed;},tick:()=>intervals[0](),
    fire(target,type,event={}){return handlers.find(h=>h.target===target&&h.type===type)?.callback(event);},
    close(){ui.destroy();dom.window.close();}};
}

test('unconnected Mini Chat stays disabled and leaves the official A draft untouched',()=>{
  const f=fixture();
  try{
    assert.equal(f.button.disabled,true);assert.equal(f.input.disabled,true);
    assert.match(f.status.textContent,/尚未接入/);
    assert.equal(f.fire(f.button,'click',{isTrusted:true}),undefined);
    assert.equal(f.session.snapshot.requestId,null);
    assert.equal(f.doc.querySelector('#official').value,'A 的原始草稿');
  }finally{f.close();}
});

test('click returns its managed promise; full text and B link render without HTML or A writes',async()=>{
  let accepted,starts=0,reads=0;
  const reply='<img src=x onerror="send()">\n'+('正文，保留换行与尾部。\n'.repeat(150))+'末尾标记';
  const f=fixture({async start(request){accepted=request;starts++;return {accepted:true,requestId:request.requestId};},
    async read(){reads++;return result(accepted.requestId,reply);}});
  try{
    f.input.value='请介绍 WebFlow 的三个主要优势。';
    const promise=f.fire(f.button,'click',{isTrusted:true});
    assert.equal(typeof promise?.then,'function');await promise;
    await f.fire(f.button,'click',{isTrusted:true});assert.equal(starts,1);
    await f.tick();assert.equal(reads,1);
    assert.equal(f.answer.textContent,reply);assert.equal(f.answer.hidden,false);
    assert.equal(f.answer.querySelector('img'),null);
    assert.equal(f.link.href,B);assert.equal(f.link.hidden,false);
    assert.equal(f.link.rel,'noopener noreferrer');
    assert.equal(f.doc.querySelector('#official').value,'A 的原始草稿');
    await f.tick();assert.equal(reads,1);
  }finally{f.close();}
});

test('same-site A navigation retires old UI before a late result can paint in the new conversation',async()=>{
  let accepted,finish,reads=0;
  const f=fixture({async start(request){accepted=request;return {accepted:true,requestId:request.requestId};},
    read(){reads++;return new Promise(resolve=>{finish=resolve;});}});
  try{
    f.input.value='测试';await f.fire(f.button,'click',{isTrusted:true});
    const reading=f.tick();await Promise.resolve();
    f.dom.window.history.pushState({},'',B);
    // A result arriving before a navigation event/poll must still be fenced.
    finish(result(accepted.requestId));await reading;
    assert.equal(f.destroyed,true);assert.equal(f.ui.host.isConnected,false);
    assert.equal(f.answer.textContent,'');assert.equal(f.session.isAvailable,false);
    await f.tick();assert.equal(reads,1);
  }finally{f.close();}
});

test('navigation while awaiting ACK retires once and never reads or restarts the request',async()=>{
  let finish,starts=0,reads=0;
  const f=fixture({start(request){starts++;return new Promise(resolve=>{finish=()=>resolve({accepted:true,requestId:request.requestId});});},
    async read(){reads++;return result();}});
  try{
    f.input.value='测试';const creating=f.fire(f.button,'click',{isTrusted:true});
    f.dom.window.history.pushState({},'',B);await f.tick();
    finish();await creating;
    assert.equal(f.destroyed,true);assert.equal(reads,0);
    f.dom.window.history.pushState({},'',A);
    await f.fire(f.button,'click',{isTrusted:true});assert.equal(starts,1);
  }finally{f.close();}
});

test('plain Enter and IME do not submit; the consumed Ctrl+Enter stays inside Mini Chat',async()=>{
  let starts=0,prevented=0,stopped=0;
  const f=fixture({async start(request){starts++;return {accepted:true,requestId:request.requestId};},async read(){return null;}});
  const key=extra=>({key:'Enter',ctrlKey:true,isTrusted:true,preventDefault(){prevented++;},
    stopPropagation(){stopped++;},...extra});
  try{
    f.input.value='中文任务';
    await f.fire(f.input,'keydown',key({ctrlKey:false}));
    await f.fire(f.input,'keydown',key({isComposing:true}));
    await f.fire(f.input,'keydown',key({keyCode:229}));
    f.fire(f.input,'compositionstart');await f.fire(f.input,'keydown',key({}));
    f.fire(f.input,'compositionend');await f.fire(f.input,'keydown',key({isTrusted:false}));
    assert.equal(starts,0);assert.equal(prevented,0);assert.equal(stopped,0);
    await f.fire(f.input,'keydown',key({}));assert.equal(starts,1);assert.equal(prevented,1);
    assert.equal(stopped,1);
    assert.equal(f.doc.querySelector('#official').value,'A 的原始草稿');
  }finally{f.close();}
});

test('restoration keeps creation disabled and displays only a fresh read of the original request',async()=>{
  let finish,starts=0,reads=0;
  const f=fixture({start(){starts++;},async read(query){reads++;assert.equal(query.requestId,id);return result();}},
    {initialRequest:new Promise(resolve=>{finish=resolve;})});
  try{
    assert.equal(f.button.disabled,true);assert.equal(f.input.disabled,true);
    assert.equal(f.session.snapshot.status,'restoring');
    await f.fire(f.button,'click',{isTrusted:true});assert.equal(starts,0);
    finish({requestId:id});await f.session.ready;
    assert.equal(f.button.disabled,true);assert.equal(f.answer.hidden,true);
    await f.tick();assert.equal(reads,1);assert.equal(starts,0);
    assert.equal(f.answer.textContent,'完整回答');assert.equal(f.link.href,B);
    assert.equal(f.doc.querySelector('#official').value,'A 的原始草稿');
  }finally{f.close();}
});
test('a failed restoration cannot enable creation, while explicit trusted absence can',async()=>{
  for(const initialRequest of [undefined,null]){
    let starts=0;
    const f=fixture({async start(request){starts++;return {accepted:true,requestId:request.requestId};},
      async read(){return null;}},{initialRequest});
    try{
      await f.session.ready;f.input.value='测试';
      assert.equal(f.button.disabled,initialRequest!==null);
      await f.fire(f.button,'click',{isTrusted:true});assert.equal(starts,initialRequest===null?1:0);
    }finally{f.close();}
  }
});
test('navigation during restoration disposes the old UI and never replays a request',async()=>{
  let finish,calls=0;
  const f=fixture({start(){calls++;},read(){calls++;}},
    {initialRequest:new Promise(resolve=>{finish=resolve;})});
  try{
    f.dom.window.history.pushState({},'',B);
    finish({requestId:id});await f.session.ready;
    assert.equal(f.destroyed,true);assert.equal(f.answer.textContent,'');assert.equal(calls,0);
    assert.equal(f.doc.querySelector('#official').value,'A 的原始草稿');
  }finally{f.close();}
});

test('UI result shape preserves original message budget and rejects over-budget UTF-8 or malformed identities',()=>{
  const exact='中'.repeat(Math.floor(MAX_REPLY_BYTES/3))+'a';
  assert.equal(new TextEncoder().encode(exact).byteLength,MAX_REPLY_BYTES);
  assert.equal(verifiedResult({...result(id,exact),assistantMessageRef:'a'.repeat(160)},id).answer,exact);
  for(const delta of [{replyText:exact+'b'},{assistantMessageRef:'a'.repeat(161)},
    {assistantMessageRef:'native-user-01'},
    {conversationUrl:'https://chatgpt.com/c/'+'-'.repeat(36)},
    {runId:{toString:()=> 'controller-run-01'}}]){
    assert.throws(()=>verifiedResult({...result(),...delta},id),{code:'E_SUBAGENT_RESULT'});
  }
});
