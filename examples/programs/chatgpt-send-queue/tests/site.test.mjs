import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTSite} from '../src/site.js';

// Adapter contract tests only. These stubs do not prove ChatGPT selectors or
// React input acceptance; those require the live USER_SCRIPT run.
function fixture() {
  const state={users:[],clicks:0,write:text=>text};
  class Textarea {
    constructor(){this.current='';this.tagName='TEXTAREA';this.isConnected=true;}
    get value(){return this.current;}
    set value(text){this.current=state.write(text);}
    closest(selector){return selector==='form'?form:null;}
    getAttribute(){return null;}
    querySelector(){return null;}
    getClientRects(){return [{}];}
    focus(){}
    dispatchEvent(){}
  }
  const editor=new Textarea();
  const send={isConnected:true,disabled:false,
    closest:()=>null,getClientRects:()=>[{}],
    getAttribute:name=>name==='data-testid'?'send-button':null,
    matches:()=>false,click:()=>state.clicks++};
  const form={isConnected:true,querySelectorAll:()=>[send],querySelector:()=>null};
  const win={location:{origin:'https://chatgpt.com',pathname:'/c/12345678'},
    getComputedStyle:()=>({display:'block',visibility:'visible'}),
    HTMLTextAreaElement:Textarea,InputEvent:class {}};
  win.top=win;
  const doc={querySelectorAll:selector=>selector.startsWith('#prompt-textarea')?[editor]:
    selector.startsWith('[data-message-author-role="user"]')?state.users:[]};
  const site=createChatGPTSite({doc,win});
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
