import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createChatGPTBridgeSite} from '../../src/native-agent/chatgpt-bridge-site.js';
import {claimChatGPTBridgeComposer} from '../../src/native-agent/chatgpt-fixed-bridge-page.js';

// DOM component evidence only; does not prove live ChatGPT selectors or editing.
const attr='data-opendesk-composer-owner';
const message=text=>({innerText:text,parentElement:null,querySelector:()=>null});
function fixture(){
  const state={users:[message('prior')],clicks:0,writes:0,focus(){},edit:text=>text,
    editors:null,attachment:null,files:[],throwClick:false};
  const attrs=new Map(),listeners=new Map(),navigation=new Map();
  const form={isConnected:true,querySelectorAll:selector=>selector==='button'?[send]:state.files,
    querySelector:()=>state.attachment,hasAttribute:key=>attrs.has(key),getAttribute:key=>attrs.get(key),
    setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key)};
  const editor={value:'',isConnected:true,tagName:'TEXTAREA',closest:selector=>selector==='form'?form:null,
    getAttribute:()=>null,querySelector:()=>null,getClientRects:()=>[{}],
    focus(){doc.activeElement=editor;state.focus();}};
  const send={isConnected:true,disabled:false,closest:()=>null,getClientRects:()=>[{}],
    getAttribute:name=>name==='data-testid'?'send-button':null,
    click(){state.clicks++;if(state.throwClick)throw Error('unknown');}};
  const doc={activeElement:null,querySelectorAll:selector=>selector.startsWith('#prompt-textarea')?
    (state.editors||[editor]):selector.startsWith('[data-message-author-role="user"]')?state.users:[],
    execCommand(command,_unused,text){assert.equal(command,'insertText');state.writes++;
      editor.value=state.edit(text);return true;},
    addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)};
  const win={location:{origin:'https://chatgpt.com',pathname:'/c/12345678',href:'https://chatgpt.com/c/12345678'},
    getComputedStyle:()=>({display:'block',visibility:'visible'}),
    addEventListener:(type,fn)=>navigation.set(type,fn),removeEventListener:type=>navigation.delete(type)};
  win.top=win;editor.ownerDocument=doc;
  const site=createChatGPTBridgeSite({doc,win});
  return {site,state,editor,form,send,doc,win,listeners,navigation};
}

test('adapter exposes only inspect/prepare/commit/confirm and has no independent program imports',async()=>{
  assert.deepEqual(Object.keys(fixture().site),['inspect','prepare','commit','confirm']);
  const source=await readFile(new URL('../../src/native-agent/chatgpt-fixed-bridge-page.js',import.meta.url),'utf8');
  assert.match(source,/from '\.\/chatgpt-bridge-site.js'/);
  assert.doesNotMatch(source,/examples\/programs/);
});
test('focus restoring any draft, attachment, file or second editor cannot overwrite native content',()=>{
  for(const restore of [
    f=>{f.editor.value='restored draft';},f=>{f.editor.value=' \n';},
    f=>{f.state.attachment={};},f=>{f.state.files=[{files:[{}]}];},
    f=>{f.state.editors=[f.editor,{...f.editor}];},
    f=>{f.state.editors=[{...f.editor}];}
  ]){
    const f=fixture(),initial=f.site.inspect();f.state.focus=()=>restore(f);
    assert.equal(f.site.prepare('result',initial).ok,false);
    assert.equal(f.state.writes,0);assert.equal(f.state.clicks,0);
  }
});
test('prepare uses one focus and exact browser edit readback; lossy writes never permit send',()=>{
  const f=fixture();let focuses=0;f.state.focus=()=>focuses++;
  assert.equal(f.site.prepare('result',f.site.inspect()).ok,true);
  assert.equal(focuses,1);assert.equal(f.state.writes,1);
  const g=fixture();g.state.edit=()=> 'partial';
  assert.equal(g.site.prepare('result',g.site.inspect()).ok,false);
  assert.equal(g.state.clicks,0);
});
test('an empty official ProseMirror paragraph is empty while whitespace and multiline drafts remain exact',()=>{
  const f=fixture();
  f.editor.value=undefined;f.editor.tagName='DIV';f.editor.isContentEditable=true;
  const paragraph={nodeType:1,tagName:'P',getAttribute:key=>key==='data-empty-paragraph'?'true':null,
    hasAttribute:key=>key==='data-placeholder',childNodes:[{nodeType:1,tagName:'BR'}]};
  f.editor.childNodes=[paragraph];
  f.editor.innerText='\n';f.editor.textContent='';
  assert.equal(f.site.inspect().draft,'');
  f.editor.textContent=' ';f.editor.innerText=' \n';
  assert.equal(f.site.inspect().draft,' \n');
  f.editor.textContent='firstsecond';f.editor.innerText='first\nsecond';
  assert.equal(f.site.inspect().draft,'first\nsecond');
  f.editor.textContent='';f.state.attachment={};
  assert.equal(f.site.inspect().rich,true);
});
test('pure line-break drafts never become empty or permit a browser write',()=>{
  for(const children of [[],[{nodeType:1,tagName:'BR'}],
    [{nodeType:1,tagName:'P'},{nodeType:1,tagName:'P'}],
    [{nodeType:1,tagName:'P',getAttribute:()=>null}],
    [{nodeType:1,tagName:'P',getAttribute:()=> 'true',hasAttribute:()=>true,
      childNodes:[{nodeType:1,tagName:'BR'},{nodeType:1,tagName:'BR'}]}]]){
    const f=fixture();Object.assign(f.editor,{value:undefined,tagName:'DIV',isContentEditable:true,
      innerText:'\n\n',textContent:'',childNodes:children});
    assert.equal(f.site.inspect().draft,'\n\n');
    assert.equal(f.site.prepare('request',f.site.inspect()).ok,false);
    assert.equal(f.state.writes,0);assert.equal(f.state.clicks,0);
  }
});
test('official markdown paragraphs preserve source newlines and exact spaces without CSS spacing',()=>{
  const f=fixture();Object.assign(f.editor,{value:undefined,isContentEditable:true,
    hasAttribute:key=>key==='data-composer-markdown',textContent:'first  second',innerText:'first\n\n  second',
    childNodes:['first','','  second'].map(textContent=>({nodeType:1,tagName:'P',textContent,querySelector:()=>null}))});
  assert.equal(f.site.inspect().draft,'first\n\n  second');
  f.editor.childNodes[0].querySelector=()=>({}); // unexpected semantic BR
  f.editor.innerText='unrecognized\nline';
  assert.equal(f.site.inspect().draft,'unrecognized\nline');
});
test('native markdown insertion requires exact paragraph readback before admitting a send token',()=>{
  for(const lossy of [false,true]){
    const f=fixture(),line=textContent=>({nodeType:1,tagName:'P',textContent,querySelector:()=>null});
    Object.assign(f.editor,{value:undefined,isContentEditable:true,textContent:'',innerText:'\n',
      hasAttribute:key=>key==='data-composer-markdown',childNodes:[{...line(''),
        getAttribute:()=> 'true',hasAttribute:()=>true,childNodes:[]}]});
    f.win.getSelection=()=>({rangeCount:1,anchorNode:f.editor,focusNode:f.editor});
    f.state.edit=text=>{const value=lossy?text.replace('  ',' '):text;
      f.editor.childNodes=value.split('\n').map(line);f.editor.textContent=value.replaceAll('\n','');
      f.editor.innerText='CSS-derived text';};
    const prepared=f.site.prepare('first\n\n  second',f.site.inspect());
    assert.equal(prepared.ok,!lossy);assert.equal(f.state.writes,1);
    if(lossy)assert.equal(f.state.clicks,0);
    else assert.equal(f.site.commit(prepared.token).ok,true);
  }
});
test('commit permits waiting only before click; success and throwing clicks consume the token once',()=>{
  for(const throwClick of [false,true]){
    const f=fixture(),prepared=f.site.prepare('result',f.site.inspect());
    assert.equal(prepared.ok,true);f.send.disabled=true;
    assert.equal(f.site.commit(prepared.token).retry,true);assert.equal(f.state.clicks,0);
    f.send.disabled=false;f.state.throwClick=throwClick;
    assert.equal(f.site.commit(prepared.token).ok,!throwClick);
    assert.equal(f.site.commit(prepared.token).ok,false);
    assert.equal(f.site.commit({...prepared.token}).ok,false);
    assert.equal(f.state.clicks,1);
  }
});
test('changed native draft, attachments, history node or history text deny commit',()=>{
  for(const change of [f=>{f.editor.value='user draft';},f=>{f.state.attachment={};},
    f=>{f.state.users=[message('prior')];},f=>{f.state.users[0].innerText='edited prior';}]){
    const f=fixture(),prepared=f.site.prepare('result',f.site.inspect());change(f);
    assert.equal(f.site.commit(prepared.token).ok,false);assert.equal(f.state.clicks,0);
  }
});
test('confirm requires exact historical user node and text prefix plus exactly one new result',()=>{
  const f=fixture(),prepared=f.site.prepare('result',f.site.inspect()),prior=f.state.users[0];
  f.state.users.push(message('result'));
  assert.equal(f.site.confirm(prepared.token.before,'result',f.site.inspect()),true);
  f.state.users[0]=message('prior');
  assert.equal(f.site.confirm(prepared.token.before,'result',f.site.inspect()),false);
  f.state.users[0]=prior;prior.innerText='changed';
  assert.equal(f.site.confirm(prepared.token.before,'result',f.site.inspect()),false);
  prior.innerText='prior';f.state.users.push(message('extra'));
  assert.equal(f.site.confirm(prepared.token.before,'result',f.site.inspect()),false);
});
test('confirm permits eviction only of an old history prefix while retaining the exact current turn',()=>{
  const f=fixture();f.state.users.push(message('older'),message('current request'));
  const prepared=f.site.prepare('result',f.site.inspect());
  assert.equal(f.site.commit(prepared.token).ok,true);
  const prior=prepared.token.before.users,result=message('result');
  f.state.users=[prior[1],prior[2],result];
  assert.equal(f.site.confirm(prepared.token.before,'result',f.site.inspect()),true);
  f.state.users=[prior[2],result];
  assert.equal(f.site.confirm(prepared.token.before,'result',f.site.inspect()),true);
  for(const users of [[result],[message('current request'),result],
    [prior[0],prior[2],result],[prior[2],result,message('result')],
    [prior[2],message('extra'),result],[prior[2],message('wrong result')]]){
    f.state.users=users;
    assert.equal(f.site.confirm(prepared.token.before,'result',f.site.inspect()),false);
  }
  f.state.users=[prior[2],result];prior[2].innerText='edited current request';
  assert.equal(f.site.confirm(prepared.token.before,'result',f.site.inspect()),false);
  prior[2].innerText='current request';f.win.location.pathname='/c/other-session';
  assert.equal(f.site.confirm(prepared.token.before,'result',f.site.inspect()),false);
  assert.equal(f.state.clicks,1,'confirmation never retries sending');
});
test('deny-only claim survives unknown outcomes, empty scripted changes and synthetic input',async()=>{
  const f=fixture();
  const claim=claimChatGPTBridgeComposer({...f,snapshot:f.site.inspect(),text:'result'});
  assert.equal(f.form.getAttribute(attr),'chatgpt-fixed-bridge');
  assert.equal(f.site.inspect().ok,true); // native form is NOT a UI-owner exclusion
  assert.equal(f.form.getAttribute('data-opendesk-ui-owner'),undefined);
  assert.throws(()=>claimChatGPTBridgeComposer({...f,snapshot:f.site.inspect(),text:'result'}),/占用/);
  const prepared=f.site.prepare('result',f.site.inspect());assert.equal(prepared.ok,true);
  claim.written();
  await Promise.resolve();assert.equal(f.form.getAttribute(attr),'chatgpt-fixed-bridge');
  claim.confirmed();assert.equal(f.form.getAttribute(attr),'chatgpt-fixed-bridge');
  f.editor.value=''; // automatic/scripted clearing is not release evidence
  f.listeners.get('input')({isTrusted:false,target:f.editor});
  assert.equal(f.form.getAttribute(attr),'chatgpt-fixed-bridge');
  f.listeners.get('input')({isTrusted:true,target:{}});
  assert.equal(f.form.getAttribute(attr),'chatgpt-fixed-bridge');
  f.editor.value='result';f.listeners.get('input')({isTrusted:true,target:f.editor});
  assert.equal(f.form.getAttribute(attr),'chatgpt-fixed-bridge');
  f.editor.value='user edit';f.listeners.get('input')({isTrusted:true,target:f.editor});
  assert.equal(f.form.hasAttribute(attr),true,'trusted input alone can come from execCommand');
  f.listeners.get('keydown')({isTrusted:true,target:f.editor,key:'Backspace'});
  f.editor.value='user edi';f.listeners.get('input')({isTrusted:true,target:f.editor,inputType:'deleteContentBackward'});
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.form.hasAttribute(attr),false);
});

test('unknown click followed by browser-generated input keeps the result claim',()=>{
  const f=fixture(),claim=claimChatGPTBridgeComposer({...f,snapshot:f.site.inspect(),text:'result'});
  const prepared=f.site.prepare('result',f.site.inspect());claim.written();
  f.state.throwClick=true;assert.equal(f.site.commit(prepared.token).ok,false);
  f.editor.value='result ';
  f.listeners.get('input')({isTrusted:true,target:f.editor,inputType:'insertText',data:' '});
  assert.equal(f.form.getAttribute(attr),'chatgpt-fixed-bridge');
  assert.equal(f.site.commit(prepared.token).ok,false);assert.equal(f.state.clicks,1);
  f.navigation.get('pagehide')();
});

test('native keyboard edit requires matching type and data before releasing a claim',async()=>{
  for(const [key,inputType,data,release] of [
    ['a','insertText','a',true],['a','insertText','injected',false],
    ['Backspace','insertText','injected',false],['Backspace','deleteContentBackward',null,true]
  ]){
    const f=fixture(),claim=claimChatGPTBridgeComposer({...f,snapshot:f.site.inspect(),text:'result'});
    f.site.prepare('result',f.site.inspect());claim.written();
    f.listeners.get('keydown')({isTrusted:true,target:f.editor,key});
    f.editor.value='changed';
    f.listeners.get('input')({isTrusted:true,target:f.editor,inputType,data});
    await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(!f.form.hasAttribute(attr),release);
    if(!release)f.navigation.get('pagehide')();
  }
  const f=fixture(),claim=claimChatGPTBridgeComposer({...f,snapshot:f.site.inspect(),text:'result'});
  f.site.prepare('result',f.site.inspect());claim.written();
  f.listeners.get('keydown')({isTrusted:true,target:f.editor,key:'a'});
  await new Promise(resolve=>setTimeout(resolve,5));
  f.editor.value='changed';f.listeners.get('input')({isTrusted:true,target:f.editor,inputType:'insertText',data:'a'});
  assert.equal(f.form.hasAttribute(attr),true,'expired key intent cannot admit later automatic edits');
  f.navigation.get('pagehide')();
});

test('only a native composition transaction changing the same editor releases its claim',()=>{
  const f=fixture(),claim=claimChatGPTBridgeComposer({...f,snapshot:f.site.inspect(),text:'result'});
  f.site.prepare('result',f.site.inspect());claim.written();
  f.listeners.get('compositionstart')({isTrusted:false,target:f.editor});f.editor.value='scripted';
  f.listeners.get('compositionend')({isTrusted:true,target:f.editor});
  assert.equal(f.form.hasAttribute(attr),true);
  f.listeners.get('compositionstart')({isTrusted:true,target:f.editor});f.editor.value='真实修改';
  f.listeners.get('input')({isTrusted:true,target:f.editor,inputType:'insertCompositionText',isComposing:true,data:'真实修改'});
  f.listeners.get('compositionend')({isTrusted:true,target:f.editor,data:'真实修改'});
  assert.equal(f.form.hasAttribute(attr),false);
});
test('blurred keyboard intent cannot release the claim before its task timer expires',async()=>{
  for(const notify of [false,true]){
    const f=fixture(),claim=claimChatGPTBridgeComposer({...f,snapshot:f.site.inspect(),text:'result'});
    f.site.prepare('result',f.site.inspect());claim.written();
    f.listeners.get('keydown')({isTrusted:true,target:f.editor,key:'a'});
    f.doc.activeElement={};
    if(notify){
      f.listeners.get('blur')({target:f.editor});
      f.editor.focus(); // refocusing must not restore the old key intent
    }
    f.editor.value='resulta';
    f.listeners.get('input')({isTrusted:true,target:f.editor,inputType:'insertText',data:'a'});
    await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(f.form.hasAttribute(attr),true);
    f.navigation.get('pagehide')();
  }
});
test('cancelled keydown cannot lend its intent to a browser editing command',async()=>{
  for(const cancellation of ['before-key','after-key','after-input']){
    const f=fixture(),claim=claimChatGPTBridgeComposer({...f,snapshot:f.site.inspect(),text:'result'});
    f.site.prepare('result',f.site.inspect());claim.written();
    const key={isTrusted:true,target:f.editor,key:'a',defaultPrevented:cancellation==='before-key'};
    f.listeners.get('keydown')(key);
    if(cancellation==='after-key')key.defaultPrevented=true;
    f.editor.value='resulta';
    f.listeners.get('input')({isTrusted:true,target:f.editor,inputType:'insertText',data:'a'});
    key.defaultPrevented=true;
    await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(claim.isHeld(),true,cancellation);
    f.navigation.get('pagehide')();
  }
});
test('IME cancellation, lost focus or unrelated draft changes cannot release the result claim',()=>{
  for(const scenario of ['cancel','no-input','changed-after-input','blur','inactive']){
    const f=fixture(),claim=claimChatGPTBridgeComposer({...f,snapshot:f.site.inspect(),text:'result'});
    f.site.prepare('result',f.site.inspect());claim.written();
    f.listeners.get('compositionstart')({isTrusted:true,target:f.editor});
    if(scenario!=='no-input'){
      f.editor.value='result字';
      f.listeners.get('input')({isTrusted:true,target:f.editor,inputType:'insertCompositionText',isComposing:true,data:'字'});
    }
    if(scenario==='blur'||scenario==='cancel'||scenario==='inactive'){
      f.doc.activeElement={};
      if(scenario!=='inactive')f.listeners.get('blur')({target:f.editor});
      if(scenario==='blur')f.editor.focus();
    }
    if(scenario==='cancel'||scenario==='no-input'||scenario==='changed-after-input')f.editor.value='program changed result';
    f.listeners.get('compositionend')({isTrusted:true,target:f.editor,data:scenario==='cancel'?'':'字'});
    assert.equal(f.form.hasAttribute(attr),true,scenario);
    f.navigation.get('pagehide')();
  }
});
test('confirmed success releases only an empty same native composer; navigation releases stale claim',()=>{
  const f=fixture(),claim=claimChatGPTBridgeComposer({...f,snapshot:f.site.inspect(),text:'result'});
  f.editor.value='result';claim.confirmed();assert.equal(f.form.hasAttribute(attr),true);
  f.editor.value='';f.state.attachment={};claim.confirmed();assert.equal(f.form.hasAttribute(attr),true);
  f.state.attachment=null;claim.confirmed();assert.equal(f.form.hasAttribute(attr),false);
  const g=fixture(),other=claimChatGPTBridgeComposer({...g,snapshot:g.site.inspect(),text:'result'});
  g.editor.value='result';g.win.location.href+='-other';other.navigation();
  assert.equal(g.form.hasAttribute(attr),false);
  const h=fixture();claimChatGPTBridgeComposer({...h,snapshot:h.site.inspect(),text:'result'});
  h.navigation.get('pagehide')();assert.equal(h.form.hasAttribute(attr),false);
});

test('synchronous browser editing input cannot release the claim on partial insertion',()=>{
  const f=fixture(),claim=claimChatGPTBridgeComposer({...f,snapshot:f.site.inspect(),text:'result'});
  f.state.edit=text=>{
    f.editor.value='partial';
    f.listeners.get('input')({isTrusted:true,target:f.editor,inputType:'insertText'});
    assert.equal(f.form.getAttribute(attr),'chatgpt-fixed-bridge');
    return text;
  };
  f.site.prepare('result',f.site.inspect());claim.written();
  assert.equal(f.form.getAttribute(attr),'chatgpt-fixed-bridge');
});
