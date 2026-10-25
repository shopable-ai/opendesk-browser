import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTSite} from '../src/site.js';

// Adapter contract tests only. These stubs do not prove ChatGPT selectors or
// React input acceptance; those require the live USER_SCRIPT run.
function fixture() {
  const state={users:[],clicks:0,write:text=>text,focus:()=>{}};
  class Textarea {
    constructor(){this.current='';this.tagName='TEXTAREA';this.isConnected=true;}
    get value(){return this.current;}
    set value(text){this.current=state.write(text);}
    closest(selector){return selector==='form'?form:null;}
    getAttribute(){return null;}
    querySelector(){return null;}
    getClientRects(){return [{}];}
    focus(){state.focus();}
    dispatchEvent(){}
  }
  const editor=new Textarea();
  const send={isConnected:true,disabled:false,
    closest:()=>null,getClientRects:()=>[{}],
    getAttribute:name=>name==='data-testid'?'send-button':null,
    matches:()=>false,click:()=>state.clicks++};
  const form={isConnected:true,hasAttribute:()=>!!state.occupied,
    querySelectorAll:()=>[send],querySelector:()=>null};
  const win={location:{origin:'https://chatgpt.com',pathname:'/c/12345678'},
    getComputedStyle:()=>({display:'block',visibility:'visible'}),
    HTMLTextAreaElement:Textarea,InputEvent:class {}};
  win.top=win;
  const doc={querySelectorAll:selector=>selector.startsWith('#prompt-textarea')?[editor]:
    selector.startsWith('[data-message-author-role="user"]')?state.users:[]};
  const site=createChatGPTSite({doc,win,isComposing:()=>!!state.composing});
  return {site,state,editor};
}

test('prepare preserves whitespace-only native drafts without writing or clicking',()=>{
  const {site,editor,state}=fixture();
  editor.current=' \n';
  assert.equal(site.prepare('queued',site.inspect()).ok,false);
  assert.equal(editor.value,' \n');
  assert.equal(state.clicks,0);
});
test('a lossy editor insertion cannot be considered prepared',()=>{
  const {site,state}=fixture();
  state.write=text=>text.trim().replaceAll('\u00a0',' ');
  assert.equal(site.prepare('  queued\u00a0message\n',site.inspect()).ok,false);
  assert.equal(state.clicks,0);
});
test('commit rejects whitespace or nonbreaking-space changes after prepare',()=>{
  for(const changed of ['queued','queued message','queued\u00a0message ']){
    const {site,editor,state}=fixture();
    const prepared=site.prepare('queued\u00a0message',site.inspect());
    assert.equal(prepared.ok,true);
    editor.current=changed;
    assert.equal(site.commit(prepared.token).ok,false);
    assert.equal(state.clicks,0);
  }
});
test('confirmation requires exact new message text, including surrounding whitespace',()=>{
  const {site,state}=fixture();
  const before={route:site.inspect().route,users:[]};
  const message={parentElement:null,querySelector:()=>null,innerText:'queued message'};
  state.users=[message];
  assert.equal(site.confirm(before,' queued message ',site.inspect()),false);
  assert.equal(site.confirm(before,'queued\u00a0message',site.inspect()),false);
  assert.equal(site.confirm(before,'queued message',site.inspect()),true);
});
test('reclaim keeps its queue authorization when the composer read-back is lossy',()=>{
  const {site,state}=fixture();
  state.write=text=>text.trim();
  const result=site.reclaimToComposer(' full text\n',site.inspect());
  assert.equal(result.ok,false);
  assert.equal(result.mayHaveWritten,true);
  assert.equal(state.clicks,0);
});
test('reading a contenteditable draft never silently drops its final newline',()=>{
  const {site,editor}=fixture();
  Object.defineProperty(editor,'value',{value:undefined});
  editor.isContentEditable=true;
  editor.innerText='queued\n';
  assert.equal(site.inspect().draft,'queued\n');
});

test('focusing cannot overwrite a restored website draft or clear a changed draft',()=>{
  for(const operation of ['prepare','reclaim','clear','restore']){
    const {site,state,editor}=fixture();
    if(operation==='clear')editor.current='queue this';
    state.focus=()=>{editor.current='website restored draft';};
    const snapshot=site.inspect();
    const result=operation==='prepare'?site.prepare('queued',snapshot):
      operation==='reclaim'?site.reclaimToComposer('queued',snapshot):
      operation==='clear'?site.clearForQueue(snapshot):site.restore('queued','');
    assert.equal(typeof result==='boolean'?result:result.ok,false,operation);
    assert.equal(editor.value,'website restored draft',operation);
    assert.equal(state.clicks,0);
  }
});

test('focusing cannot write into a replaced composer',()=>{
  const {site,state,editor}=fixture();
  const snapshot=site.inspect();
  // Removing the editor at focus simulates the SPA swapping the composer.
  state.focus=()=>{editor.isConnected=false;};
  assert.equal(site.prepare('queued',snapshot).ok,false);
  assert.equal(editor.value,'');
});

test('confirmation rejects replaced historical user nodes',()=>{
  const {site,state}=fixture();
  const old={parentElement:null},replacement={parentElement:null};
  const before={route:site.inspect().route,users:[old]};
  state.users=[replacement,{parentElement:null,querySelector:()=>null,innerText:'queued'}];
  assert.equal(site.confirm(before,'queued',site.inspect()),false);
});

test('reply completion is tied to the confirmed user and one subsequent assistant',()=>{
  const {site}=fixture();
  const oldUser={},oldAssistant={},assistant={};
  const user={compareDocumentPosition:node=>node===assistant?4:1};
  const before={route:'c/12345678',users:[oldUser],assistants:[oldAssistant]};
  const snapshot={ok:true,route:before.route,users:[oldUser,user],
    assistants:[oldAssistant,assistant],busy:false,idle:true,answerComplete:true};
  assert.equal(site.replyComplete(before,user,snapshot),true);
  for(const patch of [
    {users:[{},user]}, {users:[oldUser,user,{}]}, {assistants:[{},assistant]},
    {assistants:[oldAssistant,{},assistant]}, {answerComplete:false}, {busy:true},
    {route:'c/87654321'}, {assistants:[oldAssistant,{}]}
  ])assert.equal(site.replyComplete(before,user,{...snapshot,...patch}),false);
  user.compareDocumentPosition=()=>5;
  assert.equal(site.replyComplete(before,user,snapshot),false,'disconnected nodes are not ordered evidence');
});

test('a bridge composer claim vetoes enqueuing, restoring and committing its draft',()=>{
  const {site,state,editor}=fixture();
  const prepared=site.prepare('bridge result',site.inspect());
  state.occupied=true;
  assert.equal(site.clearForQueue(site.inspect()).ok,false);
  assert.equal(site.restore('replacement','bridge result'),false);
  assert.equal(site.commit(prepared.token).ok,false);
  assert.equal(editor.value,'bridge result');
  assert.equal(state.clicks,0);
});

test('active composition cannot be cleared, overwritten or submitted',()=>{
  const {site,state,editor}=fixture();
  state.composing=true;
  assert.equal(site.prepare('queued',site.inspect()).ok,false);
  editor.current='未完成';
  assert.equal(site.clearForQueue(site.inspect()).ok,false);
  assert.equal(editor.value,'未完成');
  state.composing=false;editor.current='';
  const prepared=site.prepare('queued',site.inspect());
  state.composing=true;
  assert.equal(site.commit(prepared.token).ok,false);
  assert.equal(state.clicks,0);
});


test('canonical empty contenteditable paragraphs are empty without trimming real whitespace',()=>{
  const {site,editor}=fixture();
  Object.defineProperty(editor,'value',{value:undefined});
  editor.isContentEditable=true;editor.textContent='';editor.innerText='\n';
  const br={nodeType:1,nodeName:'BR',childNodes:[]};
  const p={nodeType:1,nodeName:'P',childNodes:[br]};
  editor.childNodes=[p];
  assert.equal(site.inspect().draft,'');
  editor.childNodes=[p,p];
  assert.equal(site.inspect().draft,'\n','multiple blank paragraphs remain a native draft');
  editor.childNodes=[p];editor.textContent=' ';editor.innerText=' ';
  assert.equal(site.inspect().draft,' ');
  editor.textContent='text';editor.innerText='text\n';
  assert.equal(site.inspect().draft,'text\n');
});
