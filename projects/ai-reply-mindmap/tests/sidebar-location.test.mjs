import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import * as chatgpt from '../src/chatgpt-adapter.js';
import * as gemini from '../src/gemini-adapter.js';
import {createCustomSelectorAdapter,inspectSelectors} from '../src/custom-selector-adapter.js';
import {createPageSettings} from '../src/page-settings.js';

const readSource=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const settleUi=()=>new Promise(resolve=>setImmediate(resolve));

test('side panel tests selectors by button click in a sandbox without form submission',async()=>{
  const dom=new JSDOM(readSource('sidebar/index.html'),{runScripts:'outside-only'});
  try{
    const {window}=dom,{document}=window;
    const calls=[];
    window.OpenDeskTool={root:document.body,async request(operation,input){
      if(operation==='currentPage.info')return {status:'available',url};
      calls.push(input.operation);
      if(input.operation==='mindmap.status')return {origin,found:1,ready:1,saved:null,reloadNeeded:false};
      assert.equal(input.operation,'mindmap.test');
      return {status:'ready',found:1,ready:1,ticket:'test-ticket'};
    }};
    window.eval(readSource('selector-model.js'));
    window.eval(readSource('sidebar/main.js'));
    await settleUi();
    for(const [key,value] of Object.entries(rule))document.querySelector('#reply-'+key).value=value;
    // A CSP-sandboxed document receives the click but no submit event.
    document.querySelector('#rules').addEventListener('submit',event=>{
      event.preventDefault();event.stopImmediatePropagation();
    },true);
    document.querySelector('#test').click();
    await settleUi();
    assert.deepEqual(calls,['mindmap.status','mindmap.test']);
    assert.equal(document.querySelector('#save').disabled,false);
  }finally{dom.window.close();}
});

const origin='https://chatgpt.com',url=origin+'/c/example';
const rule={root:'[data-content-search-unit-key$=":assistant"]',body:'.new-body',actions:'.turn-action-controls'};
function conversation(){
  return new JSDOM(
    '<article data-talvt-turn-state="complete"><div><div class="user-tools"><button>Edit</button></div></div>'+
    '<div data-content-search-unit-key="turn:assistant"><div data-conversation-role="assistant"></div>'+
    '<div class="new-body">Assistant answer</div></div><div class="turn-action-controls"><button>Copy</button></div></article>',{url});
}

test('sidebar rejects invalid and ambiguous rules, discards stale tests, and stores Gemini rules separately',async()=>{
  const ui=new JSDOM(readSource('sidebar/index.html'),{runScripts:'outside-only'});
  const chat=conversation();
  const gem=new JSDOM('<chat-window><model-response><message-content><p class="markdown">Reply</p></message-content>'+
    '<message-actions><div class="custom-actions"><button class="copy-button">Copy</button></div></message-actions>'+
    '</model-response></chat-window>',{url:'https://gemini.google.com/app/example'});
  try{
    const {window}=ui,{document}=window;
    const records=new Map(),writes=[];
    const bridge={storage:{
      async get({key}){return records.get(key)??{value:null,etag:'0'};},
      async set({key,value,ifMatch}){
        const {etag}=await this.get({key});
        assert.equal(ifMatch,etag);
        records.set(key,{value,etag:String(Number(etag)+1)});
        writes.push(key);return {saved:true};
      }
    }};
    const start=(dom,builtin)=>createPageSettings({bridge,document:dom.window.document,builtin,
      origin:dom.window.location.origin});
    const chatPage=await start(chat,chatgpt),gemPage=await start(gem,gemini);
    let current={url:gem.window.location.href,page:gemPage};
    let delayTest;
    window.OpenDeskTool={root:document.body,async request(operation,input){
      const {url,page}=current;
      if(operation==='currentPage.info')return {status:'available',url};
      assert.equal(operation,'page.request');
      const result=await page.onRequest(input);
      if(input.operation==='mindmap.test'&&delayTest)await delayTest;
      return result;
    }};
    window.eval(readSource('selector-model.js'));
    window.eval(readSource('sidebar/main.js'));
    await settleUi();
    const valid={root:'model-response',body:'message-content .markdown',actions:'.custom-actions'};
    const get=id=>document.getElementById(id);
    const fill=row=>{
      for(const [key,value] of Object.entries(row)){
        const field=get('reply-'+key);
        field.value=value;field.dispatchEvent(new window.Event('input',{bubbles:true}));
      }
    };
    const click=async id=>{get(id).click();await settleUi();};
    const switchTo=async (dom,page)=>{
      current={url:dom.window.location.href,page};
      document.body.dispatchEvent(new window.Event('opendesk-page-changed'));
      await settleUi();
    };
    assert.match(get('connection').textContent,/^Gemini.*1 条/);
    fill({...valid,actions:'.'});
    await click('test');
    assert.match(get('feedback').textContent,/语法有误/);
    assert.equal(get('save').disabled,true);
    fill({...valid,actions:'div'});
    const extra=gem.window.document.createElement('div');
    gem.window.document.querySelector('message-actions').append(extra);
    await click('test');
    assert.match(get('feedback').textContent,/不能唯一定位/);
    assert.equal(get('save').disabled,true);
    fill(valid);
    await click('test');
    assert.equal(get('save').disabled,false);
    fill({...valid,actions:'message-actions'});
    assert.equal(get('save').disabled,true);
    await click('test');
    assert.equal(get('save').disabled,false);
    await switchTo(chat,chatPage);
    assert.equal(get('save').disabled,true);
    assert.match(get('connection').textContent,/^ChatGPT/);
    await switchTo(gem,gemPage);
    fill(valid);
    let release;
    delayTest=new Promise(resolve=>{release=resolve;});
    await click('test');
    await switchTo(chat,chatPage);
    release();delayTest=null;
    await settleUi();
    assert.equal(get('save').disabled,true,'late Gemini test must not enable save on ChatGPT');
    await click('save');
    assert.deepEqual(writes,[]);
    await switchTo(gem,gemPage);
    fill(valid);
    await click('test');
    await click('save');
    assert.match(get('feedback').textContent,/规则已保存/);
    await switchTo(chat,chatPage);
    assert.equal(get('reply-actions').value,'');
    assert.equal(get('reset').disabled,true);
    const refreshed=await start(gem,gemini);
    await switchTo(gem,refreshed);
    assert.equal(get('reply-actions').value,valid.actions);
    const [reply]=refreshed.activeAdapter.discoverAnswers(gem.window.document);
    assert.equal(refreshed.activeAdapter.inspectAnswer(reply).bar.className,'custom-actions');
    await click('reset');
    assert.match(get('feedback').textContent,/已恢复默认规则/);
    assert.deepEqual(writes,['selectors.gemini','selectors.gemini']);
    assert.equal((await start(gem,gemini)).activeAdapter,gemini);
  }finally{
    ui.window.close();chat.window.close();gem.window.close();
  }
});

test('locate a changed ChatGPT body, excluding a user toolbar and ambiguous or hidden parts',()=>{
  const {document}=conversation().window;
  const adapter=createCustomSelectorAdapter(origin,rule,chatgpt);
  const [root]=adapter.discoverAnswers(document);
  assert.deepEqual(inspectSelectors(document,adapter,rule),{status:'ready',found:1,ready:1});
  assert.equal(adapter.inspectAnswer(root).content.className,'new-body');
  const wrong={...rule,actions:'.user-tools'};
  assert.equal(inspectSelectors(document,createCustomSelectorAdapter(origin,wrong,chatgpt),wrong).ready,0);
  assert.throws(()=>createCustomSelectorAdapter(origin,{...rule,root:'div:has(button)'},chatgpt),/选择器/);
  const body=root.querySelector('.new-body');
  body.hidden=true;
  assert.equal(adapter.inspectAnswer(root).ok,false);
  adapter.setConcealed(body,true);
  assert.equal(adapter.inspectAnswer(root).content,body);
  root.append(Object.assign(document.createElement('p'),{className:'new-body'}));
  assert.equal(adapter.inspectAnswer(root).ok,false);
});

test('Gemini custom location requires the same answer’s unique, enabled native copy action',()=>{
  const site='https://gemini.google.com';
  const {document}=new JSDOM('<chat-window><model-response><div class="new-body">Reply</div>'+
    '<div class="new-actions"><button class="copy-button">Copy</button></div></model-response></chat-window>',{url:site+'/app/example'}).window;
  const config={root:'model-response',body:'.new-body',actions:'.new-actions'};
  const adapter=createCustomSelectorAdapter(site,config,gemini);
  const ready=()=>inspectSelectors(document,adapter,config).ready;
  assert.equal(ready(),1);
  document.querySelector('.copy-button').disabled=true;
  assert.equal(ready(),0);
  document.querySelector('.copy-button').disabled=false;
  document.querySelector('chat-window').insertAdjacentHTML('beforeend','<button aria-label="Stop response"></button>');
  assert.equal(ready(),0);
});

test('save requires the same tested draft and conversation; reload and reset select the expected adapter',async()=>{
  const {document,history}=conversation().window;
  let value=null,version=0;
  const racingWrites=[];
  const bridge={storage:{
    async get(){return {value,etag:String(version)};},
    async set(request){
      assert.equal(request.key,'selectors.chatgpt');
      if(request.ifMatch!==String(version))throw Error('storage conflict');
      racingWrites.push(request.value);value=request.value;version++;
      return {saved:true};
    }
  }};
  const settings=()=>createPageSettings({bridge,document,builtin:chatgpt,origin});
  const initial=await settings();
  const call=(instance,operation,extra)=>instance.onRequest({operation:'mindmap.'+operation,payload:{url,...extra}});
  const analyze=()=>call(initial,'test',{rule});
  assert.equal(initial.activeAdapter,chatgpt);
  const {ready,ticket}=await analyze();
  assert.equal(ready,1);
  await assert.rejects(call(initial,'save',{ticket,rule:{...rule,body:'p'}}),/重新测试/);
  history.pushState({},'', '/c/different');
  await assert.rejects(call(initial,'save',{ticket,rule}),/网页已切换/);
  history.replaceState({},'', '/c/example');
  version++;
  await assert.rejects(call(initial,'save',{ticket,rule}),/storage conflict/);
  assert.equal(racingWrites.length,0);
  const next=await analyze();
  assert.deepEqual(await call(initial,'save',{ticket:next.ticket,rule}),{saved:rule,reloadNeeded:true});
  await assert.rejects(call(initial,'save',{ticket:next.ticket,rule}),/重新测试/);
  const refreshed=await settings();
  assert.equal((await call(refreshed,'status')).ready,1);
  assert.deepEqual(await call(refreshed,'reset',{saved:rule}),{saved:null,reloadNeeded:true});
  assert.equal((await settings()).activeAdapter,chatgpt);
});
