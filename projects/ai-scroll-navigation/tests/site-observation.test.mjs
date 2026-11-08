import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {globSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {observeScrollSiteStructure,resolveConfiguredConversation,
  installScrollSiteRuntime,installVisualSiteConfiguration} from '../src/site-configuration.js';

// Same JSDOM resolution as the existing project-owned Page inspection tests.
const require=createRequire(import.meta.url);
let JSDOM;
try{({JSDOM}=require('jsdom'));}
catch(error){
  const cached=globSync(join(homedir(),'.npm/_npx/*/node_modules/jsdom/package.json'))[0];
  if(!cached)throw error;
  ({JSDOM}=require(dirname(cached)));
}
const transcript='<main><article>Private first reply</article><article>Private last reply</article></main>';
const noStructure={state:'unavailable',reason:'NO_STRUCTURE'};
function fixture(html=transcript,url='https://example.test/private-thread?token=secret'){
  const {window:win}=new JSDOM('<!doctype html><html><head><title>Private title</title></head><body>'+html+'</body></html>',{url});
  const doc=win.document;
  win.HTMLElement.prototype.getBoundingClientRect=function(){
    return {left:0,top:0,width:800,height:600,right:800,bottom:600};
  };
  const scroll=node=>{
    node.style.overflowY='auto';
    Object.defineProperties(node,{scrollHeight:{configurable:true,value:2400},
      clientHeight:{configurable:true,value:600}});
    return node;
  };
  for(const main of doc.querySelectorAll('main,[role="log"]'))scroll(main);
  const disposals=[];
  const owner={onDispose:fn=>disposals.push(fn),on(){},setTimeout(){},
    dispose(){for(const fn of disposals)fn();}};
  const api={read:async()=>({value:{version:1,sites:[]},etag:'0'}),
    write(){assert.fail('observation must never write');}};
  return {doc,win,scroll,owner,api,observe:()=>observeScrollSiteStructure({doc,win})};
}
function assertCandidates(f,result){
  assert.equal(result.state,'observed');
  assert.ok(result.candidates.length>=1&&result.candidates.length<=8);
  for(const [index,candidate] of result.candidates.entries()){
    assert.equal(candidate.id,'candidate-'+(index+1));
    for(const field of ['mainSelector','scrollSelector','messageSelector','anchorSelector'])
      assert.ok(candidate[field].length<=256);
    const rule={...candidate,origin:f.win.location.origin,pathScope:'/',enabled:true};
    assert.ok(resolveConfiguredConversation(rule,f.doc,f.win));
    assert.equal(candidate.anchorSelector,'');
    assert.equal(candidate.metrics.scrollable,true);
  }
}

test('observes real unique CSS and the nearest enclosing scrollport through the original live validator',()=>{
  for(const graph of ['self','outer','root']){
    const f=fixture();
    try{
      const main=f.doc.querySelector('main');
      let expected=main;
      if(graph!=='self')main.style.overflowY='visible';
      if(graph==='outer'){
        expected=f.scroll(f.doc.createElement('div'));
        main.replaceWith(expected);expected.append(main);
      }
      if(graph==='root'){
        expected=f.scroll(f.doc.documentElement);
        Object.defineProperty(f.doc,'scrollingElement',{value:expected});
      }
      installScrollSiteRuntime(f);
      const result=globalThis.__opendeskAiScrollEditorV1.observe();
      assertCandidates(f,result);
      assert.equal(result.candidates.length,1);
      const candidate=result.candidates[0];
      assert.equal(f.doc.querySelector(candidate.mainSelector),main);
      assert.equal(f.doc.querySelector(candidate.scrollSelector),expected);
      assert.equal(candidate.metrics.messageCount,2);
      assert.deepEqual(globalThis.__opendeskAiScrollEditorV1.validate({
        ...candidate,origin:f.win.location.origin,pathScope:'/',enabled:true}),{ok:true});
    }finally{f.owner.dispose();f.win.close();}
  }
});

test('observation reads no personal content or field values and causes no DOM mutations or pointer events',async()=>{
  const f=fixture(transcript+'<input value="Private input"><textarea>Private draft</textarea><div contenteditable>Private editor</div>');
  const main=f.doc.querySelector('main');
  main.id='private-person@example.test';main.setAttribute('aria-label','Private name');
  main.setAttribute('data-id','Private identifier');
  for(const article of main.children)article.setAttribute('data-message-id','Private message identifier');
  for(const target of [f.doc,...f.doc.querySelectorAll('*')]){
    for(const key of ['textContent','innerText','innerHTML','outerHTML'])
      Object.defineProperty(target,key,{get(){throw Error('forbidden content read '+key);}});
  }
  Object.defineProperty(f.doc,'title',{get(){throw Error('forbidden title read');}});
  for(const node of f.doc.querySelectorAll('input,textarea,[contenteditable]'))
    Object.defineProperty(node,'value',{get(){throw Error('forbidden field read');}});
  const mutations=[];
  const observer=new f.win.MutationObserver(records=>mutations.push(...records));
  observer.observe(f.doc,{subtree:true,childList:true,attributes:true,characterData:true});
  f.win.fetch=()=>assert.fail('network');
  f.doc.addEventListener('pointerdown',()=>assert.fail('synthetic pointer'));
  const before=main.scrollTop,result=f.observe();
  assertCandidates(f,result);
  assert.doesNotMatch(JSON.stringify(result),/Private|private|secret|example\.test|identifier|@/);
  assert.equal(main.scrollTop,before);
  await Promise.resolve();
  assert.deepEqual(mutations,[]);
  observer.disconnect();f.win.close();
});

test('empty homepages and generic lists have no inferred application defaults',()=>{
  for(const url of ['https://example.test/','https://chatgpt.com/']){
    for(const html of ['', '<main></main>', '<main><h1>Welcome</h1><button>Start</button></main>',
      '<main><ul><li>One</li><li>Two</li></ul></main>']){
      const f=fixture(html,url);
      assert.deepEqual(f.observe(),noStructure);f.win.close();
    }
  }
});

test('rejects excluded, hidden, nested/ambiguous, disconnected and non-scrollable structures',()=>{
  const cases=[
    '<aside>'+transcript+'</aside>', '<nav>'+transcript+'</nav>',
    '<form>'+transcript+'</form>', '<div contenteditable>'+transcript+'</div>',
    '<div role="dialog">'+transcript+'</div>', '<div inert>'+transcript+'</div>',
    '<div aria-hidden="true">'+transcript+'</div>', '<div hidden>'+transcript+'</div>',
    '<div style="display:none">'+transcript+'</div>',
    '<main><article>One</article><article hidden>Two</article></main>',
    '<main><article>One<article>Nested</article></article><article>Two</article></main>',
    '<main><article>One</article><div><article>Different depth</article></div></main>',
    '<main data-opendesk-ai-scroll-navigation="settings"><article>One</article><article>Two</article></main>'
  ];
  for(const html of cases){const f=fixture(html);assert.deepEqual(f.observe(),noStructure,html);f.win.close();}
  for(const mode of ['split','empty-boundary','short','overflow','disconnected']){
    const f=fixture(),main=f.doc.querySelector('main');
    if(mode==='split'||mode==='empty-boundary'){
      const inner=f.scroll(f.doc.createElement('div'));
      main.prepend(inner);inner.append(main.querySelector('article'));
      if(mode==='empty-boundary')Object.defineProperty(inner,'scrollHeight',{value:600});
    }
    if(mode==='short')Object.defineProperty(main,'scrollHeight',{value:600});
    if(mode==='overflow')main.style.overflowY='visible';
    if(mode==='disconnected')main.remove();
    assert.deepEqual(f.observe(),noStructure,mode);
    f.win.close();
  }
  for(const url of ['file:///private.html','https://user:password@example.test/']){
    const f=fixture(transcript,url);
    assert.deepEqual(f.observe(),noStructure);f.win.close();
  }
});

test('semantic log messages work without app-specific selectors and output is capped at eight',()=>{
  const f=fixture('<div role="log"><div class="message">One</div><div class="message">Two</div></div>');
  assertCandidates(f,f.observe());f.win.close();
  const many=fixture(transcript.repeat(12)),result=many.observe();
  assertCandidates(many,result);assert.equal(result.candidates.length,8);many.win.close();
});

test('transparent layout ancestors retain visible conversation descendants without admitting hidden layouts',()=>{
  for(const hidden of [false,true]){
    const f=fixture('<div class="layout" style="display:contents'+(hidden?';visibility:hidden':'')+'">'+transcript+'</div>');
    f.doc.querySelector('.layout').getBoundingClientRect=()=>({width:0,height:0});
    if(hidden)assert.deepEqual(f.observe(),noStructure);
    else assertCandidates(f,f.observe());
    f.win.close();
  }
});

test('structural selectors resolve deep scrollports without copying private identifiers',()=>{
  const wrap=content=>'<div>'.repeat(12)+content+'</div>'.repeat(12);
  const f=fixture(wrap(transcript)+wrap('<span>Unrelated layout</span>'));
  const main=f.doc.querySelector('main'),scroller=f.scroll(main.parentElement);
  main.style.overflowY='visible';scroller.id='private-scrollport@example.test';
  const result=f.observe();assertCandidates(f,result);
  assert.equal(f.doc.querySelector(result.candidates[0].scrollSelector),scroller);
  assert.doesNotMatch(JSON.stringify(result),/private|@/);
  f.win.close();
});

test('deep excluded controls do not reject a bounded conversation or evade the total node budget',()=>{
  const deep='<div>'.repeat(70)+'<span>Private control</span>'+'</div>'.repeat(70);
  for(const tag of ['nav','form','pre']){
    const f=fixture(transcript+'<'+tag+'>'+deep+'</'+tag+'>');
    assertCandidates(f,f.observe());f.win.close();
  }
  const oversized=fixture(transcript+'<nav>'+deep+'<div></div>'.repeat(12000)+'</nav>');
  oversized.doc.querySelectorAll=()=>assert.fail('no selector queries after scan budget exceeded');
  assert.deepEqual(oversized.observe(),noStructure);oversized.win.close();
});

test('oversized and deeply nested documents fail closed before selector queries',()=>{
  for(const html of [transcript+'<div></div>'.repeat(12000),
    '<div>'.repeat(66)+transcript+'</div>'.repeat(66)]){
    const f=fixture(html);
    f.doc.querySelectorAll=()=>assert.fail('no selector queries after scan budget exceeded');
    assert.deepEqual(f.observe(),noStructure);f.win.close();
  }
});

test('current and legacy editors refuse observation during picking and after disposal',async()=>{
  for(const install of [installScrollSiteRuntime,installVisualSiteConfiguration]){
    const f=fixture();
    try{
      install(f);await Promise.resolve();await Promise.resolve();await Promise.resolve();
      const editor=globalThis.__opendeskAiScrollEditorV1;
      assertCandidates(f,editor.observe());
      const pending=editor.pick({field:'main',mainSelector:'main'});
      assert.deepEqual(editor.observe(),{state:'busy'});
      f.owner.dispose();
      assert.deepEqual(editor.observe(),{state:'closed'});
      assert.equal((await pending).state,'closed');
      assert.equal(globalThis.__opendeskAiScrollEditorV1,undefined);
    }finally{f.owner.dispose();f.win.close();}
  }
});

 test('large conversations and structural turn-key groups do not require application defaults',()=>{
  const f=fixture('<main><div>'+('<div data-turn-key="private-key"><p>Private message</p></div>'.repeat(20))+'</div></main>'+'<div></div>'.repeat(1500));
  const result=f.observe();assertCandidates(f,result);
  assert.equal(result.candidates[0].messageSelector,'[data-turn-key]');
  assert.equal(result.candidates[0].metrics.messageCount,20);
  assert.ok(!JSON.stringify(result).includes('private-key'));f.win.close();
});
