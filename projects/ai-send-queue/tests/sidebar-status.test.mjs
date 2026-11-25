import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {createElement} from 'react';

// Parse JSX in memory only: no build, bundling, receipts or dist writes.
const source=await readFile(new URL('../src/sidebar/App.jsx',import.meta.url),'utf8');
const {code}=await transform(source,{loader:'jsx',format:'esm',jsx:'transform'});
const moduleURL='data:text/javascript;base64,'+Buffer.from(code.replace('from "react"',`from ${JSON.stringify(import.meta.resolve('react'))}`)).toString('base64');
const {default:App,createStatusCheck,INITIAL_STATUS}=await import(moduleURL);
const available={status:'available',url:'https://chatgpt.com/c/example',title:'ChatGPT'};
const ready={status:'ready',version:'0.1.26'};
const deferred=()=>{
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
};
function fixture({info=available,result=ready,error}={}){
  const calls=[],states=[];
  const checker=createStatusCheck(async(operation,payload)=>{
    calls.push({operation,payload});
    if(operation==='currentPage.info')return info;
    if(error)throw error;
    return result;
  },state=>states.push(state));
  return {calls,states,checker};
}

test('initial render shows the check action but keeps it unavailable during connection',()=>{
  assert.equal(INITIAL_STATUS.status,'idle');
  const html=renderToStaticMarkup(createElement(App));
  assert.match(html,/正在连接网页/);
  assert.match(html,/<button[^>]+aria-disabled="true"[^>]*>重新检查<\/button>/);
  assert.doesNotMatch(html,/队列已就绪/);
});

for(const status of ['ready','new-conversation','composer-unavailable','stopped']){
  test(`direct page response: ${status}`,async()=>{
    const f=fixture({result:{status,version:'0.1.26',reason:'真实网页原因'}});
    await f.checker.check();
    assert.deepEqual(f.calls,[{operation:'currentPage.info',payload:{}},
      {operation:'page.request',payload:{operation:'queue.status',payload:{}}}]);
    assert.deepEqual(f.states.map(row=>row.status),['pending',status]);
    assert.equal(f.states.at(-1).version,'0.1.26');
    assert.equal(f.states.at(-1).detail,'真实网页原因');
    if(status==='new-conversation')assert.equal(f.states.at(-1).message,'');
    f.checker.dispose();
  });
}

test('Gemini status is based on the mounted companion and names the actual site in recovery help',async()=>{
  const info={status:'available',url:'https://gemini.google.com/app/0123456789abcdef'};
  const f=fixture({info,result:{...ready,status:'composer-unavailable'}});
  await f.checker.check();
  assert.deepEqual(f.calls.map(call=>call.operation),['currentPage.info','page.request']);
  assert.equal(f.states.at(-1).status,'composer-unavailable');
  assert.match(f.states.at(-1).message,/Gemini/);
  assert.doesNotMatch(f.states.at(-1).message,/ChatGPT/);
  const g=fixture({info,result:ready});
  await g.checker.check();
  assert.equal(g.states.at(-1).status,'ready');
});

for(const url of ['https://example.com/','https://chatgpt.com.evil.test/','http://chatgpt.com/',
  'https://gemini.google.com/library','https://gemini.google.com.evil.test/app']){
  test(`unsupported target never requests the page: ${url}`,async()=>{
    const f=fixture({info:{status:'available',url}});
    await f.checker.check();
    assert.equal(f.calls.length,1);
    assert.equal(f.states.at(-1).status,'unsupported');
    assert.equal(f.states.at(-1).title,'请打开 ChatGPT、Gemini 或 DeepSeek 对话');
  });
}

test('a browser-only page or missing active tab needs a site prompt, with no page request',async()=>{
  for(const reasonCode of ['E_UNSUPPORTED_SCHEME','E_NO_ACTIVE_TAB']){
    const f=fixture({info:{status:'unavailable',reasonCode,message:'内部网页诊断'}});
    await f.checker.check();
    assert.deepEqual(f.calls,[{operation:'currentPage.info',payload:{}}]);
    assert.deepEqual(f.states.at(-1),{status:'unsupported',title:'请打开 ChatGPT、Gemini 或 DeepSeek 对话',message:''});
  }
});

for(const result of [null,{data:ready},{...ready,status:'unknown'},{status:'ready'},
  {...ready,version:25},{...ready,reason:{}},{...ready,status:'toString'}]){
  test(`invalid response fails closed: ${JSON.stringify(result)}`,async()=>{
    const f=fixture({result});
    await f.checker.check();
    assert.equal(f.states.at(-1).status,'error');
    assert.equal(f.states.at(-1).code,'E_QUEUE_STATUS_RESPONSE');
  });
}

test('malformed target response fails before requesting the page',async()=>{
  for(const info of [null,{}, {status:'available',url:'broken'}, {url:available.url}]){
    const f=fixture({info});
    await f.checker.check();
    assert.equal(f.calls.length,1);
    assert.equal(f.states.at(-1).code,'E_QUEUE_STATUS_TARGET');
  }
});

for(const code of ['E_APP_PAGE_NOT_READY','E_PAGE_AUTHORIZATION','E_CAPABILITY']){
  test(`request failure retains real code and safe recovery: ${code}`,async()=>{
    const f=fixture({error:Object.assign(Error('真实错误详情'),{code})});
    await f.checker.check();
    const last=f.states.at(-1);
    assert.equal(last.status,'error');
    assert.equal(last.code,code);
    assert.equal(last.detail,'真实错误详情');
    assert.doesNotMatch(last.message,/重装|扩大权限/);
    assert.match(last.message,/允许访问该网站后重试/);
    f.checker.dispose();
  });
}

test('late document, fixed listener and composer recover automatically through status reads only',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const calls=[],states=[];
  let step=0;
  const checker=createStatusCheck(async(operation,payload)=>{
    calls.push({operation,payload});
    if(operation==='currentPage.info')return step===0?{status:'unavailable',reasonCode:'E_DOCUMENT_UNRESOLVED'}:available;
    if(step===1)throw Object.assign(Error('no status reply yet'),{code:'E_QUEUE_STATUS_PENDING'});
    if(step===2)return {...ready,status:'composer-unavailable'};
    return ready;
  },state=>states.push(state));
  await checker.check();
  assert.equal(states.at(-1).status,'waiting-for-page');
  for(const [delay,state] of [[350,'waiting-for-queue'],[800,'composer-unavailable'],[1600,'ready']]){
    step++;t.mock.timers.tick(delay);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(states.at(-1).status,state);
  }
  assert.equal(calls.length,7);
  assert.ok(calls.filter(call=>call.operation!=='currentPage.info').every(call=>
    call.operation==='page.request'&&call.payload.operation==='queue.status'));
  t.mock.timers.tick(10000);
  assert.equal(calls.length,7,'no polling after readiness');
  checker.dispose();
});

test('a page that still needs a refresh stops retrying and keeps manual recovery available',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const calls=[],states=[];
  let result=null;
  const checker=createStatusCheck(async operation=>{
    calls.push(operation);
    if(operation==='currentPage.info')return available;
    if(!result)throw Object.assign(Error('当前网页仍有旧队列'),{code:'E_APP_PAGE_RELOAD_REQUIRED'});
    return result;
  },state=>states.push(state));
  await checker.check();
  for(const delay of [350,800,1600,3200]){
    t.mock.timers.tick(delay);
    await new Promise(resolve=>setImmediate(resolve));
  }
  assert.equal(states.at(-1).code,'E_APP_PAGE_RELOAD_REQUIRED');
  assert.match(states.at(-1).message,/保存草稿.*当前操作完成后刷新网页/);
  assert.equal(calls.length,10);
  t.mock.timers.tick(10000);
  assert.equal(calls.length,10);
  result=ready;
  await checker.check();
  assert.equal(states.at(-1).status,'ready');
  checker.dispose();
});

test('currentPage failure also retains its real error; plain rejections remain visible',async()=>{
  for(const error of [Object.assign(Error('目标被拒绝'),{code:'E_TARGET'}),'桥连接已关闭']){
    const states=[];
    const checker=createStatusCheck(async()=>{throw error;},state=>states.push(state));
    await checker.check();
    assert.equal(states.at(-1).status,'error');
    assert.equal(states.at(-1).detail,error.message||error);
    assert.equal(states.at(-1).code,error.code||'');
  }
});

test('pending suppresses duplicate checks; new failure and pending cannot retain old ready',async()=>{
  const states=[],calls=[],next=deferred();
  let round=0;
  const checker=createStatusCheck(async(operation,payload)=>{
    calls.push({operation,payload});
    if(operation==='currentPage.info')return available;
    if(round++===0)return ready;
    return next.promise;
  },state=>states.push(state));
  await checker.check();
  assert.equal(states.at(-1).status,'ready');
  const pending=checker.check();
  await Promise.resolve();
  assert.deepEqual(states.at(-1),{status:'pending',title:'正在连接网页…',message:''});
  const count=calls.length;
  await checker.check();
  assert.equal(calls.length,count);
  next.reject(Object.assign(Error('网页已失效'),{code:'E_DOCUMENT_STALE'}));
  await pending;
  assert.equal(states.at(-1).status,'error');
  assert.equal(states.at(-1).version,undefined);
  await checker.check();
  assert.equal(calls.length,count+2,'manual retry unlocks after rejection');
  assert.equal(states.at(-1).status,'error');
});

test('page changes invalidate old readiness and coalesce checks for the latest target',async()=>{
  const root=new EventTarget(),states=[],calls=[],previous=deferred();
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  let info=available,holdPageStatus=false;
  const checker=createStatusCheck(async operation=>{
    calls.push(operation);
    return operation==='currentPage.info'?info:holdPageStatus?previous.promise:ready;
  },state=>states.push(state),root);
  await checker.check();
  assert.equal(states.at(-1).status,'ready');

  holdPageStatus=true;
  root.dispatchEvent(new Event('opendesk-page-changed'));
  assert.equal(states.at(-1).status,'pending');
  await flush();
  assert.equal(calls.at(-1),'page.request');

  info={status:'unavailable',reasonCode:'E_DOCUMENT_UNRESOLVED',message:'当前网页正在导航'};
  const before=calls.length,statesBefore=states.length;
  root.dispatchEvent(new Event('opendesk-page-changed'));
  root.dispatchEvent(new Event('opendesk-page-changed'));
  assert.equal(calls.length,before);
  previous.resolve(ready);
  await flush();
  assert.deepEqual(calls.slice(before),['currentPage.info']);
  assert.ok(states.slice(statesBefore).every(row=>row.status!=='ready'));
  assert.equal(states.at(-1).status,'waiting-for-page');
  assert.match(states.at(-1).message,/网页就绪后会自动检查/);

  checker.dispose();
  root.dispatchEvent(new Event('opendesk-page-changed'));
  await flush();
  assert.equal(calls.length,before+1);
});

test('focused retry remains the same control across a reload and automatic recovery',async()=>{
  const {window}=new JSDOM('<main id="root"></main>');
  const container=window.document.querySelector('#root');
  const page=new window.EventTarget();
  const route=(info)=>{
    target=info;
    page.dispatchEvent(new window.Event('opendesk-page-changed'));
  };
  const held=deferred(),calls=[];
  let target=available;
  const before={window:globalThis.window,OpenDeskTool:globalThis.OpenDeskTool,
    IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
  globalThis.window=window;
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.OpenDeskTool={root:page,request:async operation=>{
    calls.push(operation);
    return operation==='currentPage.info'?target:ready;
  }};
  const root=createRoot(container);
  const {act}=await import('react');
  try{
    await act(async()=>root.render(createElement(App)));
    const button=container.querySelector('button');
    button.focus();
    await act(async()=>route(held.promise));
    assert.equal(window.document.activeElement,button);
    assert.equal(button.getAttribute('aria-disabled'),'true');
    const count=calls.length;
    await act(async()=>button.click());
    assert.equal(calls.length,count);

    await act(async()=>held.resolve({status:'unavailable',reasonCode:'E_DOCUMENT_UNRESOLVED'}));
    assert.equal(container.querySelector('[role="status"]').textContent,'正在等待网页加载');
    assert.equal(button.getAttribute('aria-disabled'),'false');
    await act(async()=>route(available));
    assert.equal(container.querySelector('[role="status"]').textContent,'队列已就绪');
    assert.equal(window.document.activeElement,button);
    assert.equal(container.querySelector('button'),button);
  }finally{
    await act(async()=>root.unmount());
    window.close();
    for(const [key,value] of Object.entries(before)){
      if(value===undefined)delete globalThis[key];
      else globalThis[key]=value;
    }
  }
});

for(const phase of ['currentPage.info','page.request']){
  for(const rejection of [false,true]){
    test(`unmount ignores late ${rejection?'error':'reply'} during ${phase} and leaves new instance untouched`,async()=>{
      const wait=deferred(),states=[],calls=[];
      const old=createStatusCheck(async operation=>{
        calls.push(operation);
        return operation===phase?wait.promise:available;
      },state=>states.push(state));
      const pending=old.check();
      await Promise.resolve();
      old.dispose();
      const fresh=createStatusCheck(async operation=>operation==='currentPage.info'?available:ready,
        state=>states.push(state));
      await fresh.check();
      const count=states.length;
      if(rejection)wait.reject(Object.assign(Error('旧错误'),{code:'E_OLD'}));
      else wait.resolve(phase==='currentPage.info'?available:ready);
      await pending;
      await old.check();
      assert.equal(states.length,count);
      assert.equal(states.at(-1).status,'ready');
      assert.deepEqual(calls,phase==='currentPage.info'?['currentPage.info']:['currentPage.info','page.request']);
      fresh.dispose();
    });
  }
}
