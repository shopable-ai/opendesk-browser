import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {createExtensionCenterDOM} from '../../../tests/helpers/extension-center-react-dom.mjs';
import {App} from './react-fixture.mjs';
import {createCoreFlow,fixtureBase} from './core-flow-fixture.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,0));};

test('page recheck clears outdated denial, keeps the inline draft and late run receipt, and restores only a valid target',async t=>{
  const url=fixtureBase+'core-records.html';
  const flow=await createCoreFlow({initialConfig:{url,itemConfig:{_listContainer:'.catalog',_listItem:'.book',title:'a::text'},waitForSelector:'.book'}});
  const calls=[],lateRun=deferred();
  let readPage=()=>flow.request('currentPage.info',{});
  const tool={request(operation,payload){
    calls.push(operation);
    if(operation==='currentPage.info')return readPage();
    if(operation==='controllers.read'&&payload.clientRequestId)return lateRun.promise.then(()=>flow.request(operation,payload));
    return flow.request(operation,payload);
  }};
  const keys=['OpenDeskTool','ScrapyAppModel','ScrapyAppSdk','requestAnimationFrame'];
  const previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  t.after(()=>Object.assign(globalThis,previous));
  Object.assign(globalThis,{OpenDeskTool:tool,ScrapyAppModel:flow.appModel,ScrapyAppSdk:flow.appSdk,
    requestAnimationFrame:callback=>setTimeout(callback,0)});
  const {doc}=createExtensionCenterDOM(t,{component:()=>{
    tool.root=document.getElementById('opendesk-react-app');return React.createElement(App);
  }});
  const get=id=>{const node=doc.getElementById(id);assert.ok(node,id);return node;};
  const checkPage=()=>tool.root.dispatch('opendesk-page-changed');
  const available=(title,pageUrl=url)=>({status:'available',title,url:pageUrl});
  await settle();
  get('start').dispatch('click');await settle();
  assert.equal(calls.filter(op=>op==='controllers.start').length,1);
  assert.match(get('run-summary').textContent,/正在(?:准备)?采集/);

  const denied=()=>Object.assign(Error('旧网页授权被拒绝'),{code:'E_PERMISSION_DENIED'});
  readPage=async()=>{throw denied();};
  checkPage();await settle();
  assert.match(get('page-target-problem').textContent,/权限拒绝/);
  const pending=deferred();readPage=()=>pending.promise;
  checkPage();await settle();
  assert.match(get('page-title').textContent,/正在确认/);
  assert.equal(get('page-target-problem').hidden,true);
  assert.equal(get('start').disabled,true);
  const reads=calls.filter(op=>op==='currentPage.info').length;
  get('refresh-target').dispatch('click');await settle();
  assert.equal(calls.filter(op=>op==='currentPage.info').length,reads);

  lateRun.resolve();await settle();
  assert.match(get('run-summary').textContent,/采集完成/);
  assert.equal(get('host-status').textContent,'completed');
  const receipt=JSON.parse(get('result').textContent);
  const draft=get('target-url');
  draft.type='text';draft.value=url+'?draft=1';draft.dispatch('input');draft.focus();
  await settle();
  const next=deferred();readPage=()=>next.promise;
  checkPage();pending.reject(denied());await settle();
  assert.equal(doc.activeElement,draft);
  assert.equal(get('page-target-problem').hidden,true);
  next.resolve(available('另一网站','https://books.toscrape.com/'));await settle();
  assert.equal(get('page-title').textContent,'另一网站');
  assert.equal(get('start').disabled,true);
  assert.equal(draft.value,url+'?draft=1');
  assert.deepEqual(JSON.parse(get('result').textContent),receipt);
  assert.equal(get('host-status').textContent,'completed');

  readPage=async()=>({status:'unavailable',message:'没有可读取的网页'});
  checkPage();await settle();
  assert.match(get('page-target-problem').textContent,/没有可读取的网页/);
  const retry=get('refresh-target');retry.focus();
  readPage=async()=>available('已恢复');retry.dispatch('click');await settle();
  assert.equal(get('page-title').textContent,'已恢复');
  assert.equal(doc.activeElement,retry);
  assert.equal(get('start').disabled,false);
  assert.equal(draft.value,url+'?draft=1');
  assert.equal(calls.filter(op=>op==='controllers.start').length,1);
  assert.equal(calls.filter(op=>op==='storage.set').length,0);
});
