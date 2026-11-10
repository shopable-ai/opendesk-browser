import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
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

test('initial render is unchecked and retains the instructions and manual action',()=>{
  assert.equal(INITIAL_STATUS.status,'idle');
  const html=renderToStaticMarkup(createElement(App));
  assert.match(html,/尚未检查网页状态/);
  assert.match(html,/检查网页状态/);
  assert.match(html,/Ctrl \+ Enter/);
  assert.match(html,/首条消息请由 ChatGPT 原生发送/);
  assert.doesNotMatch(html,/网页队列已就绪/);
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
    if(status==='new-conversation')assert.match(f.states.at(-1).message,/原生发送首条消息/);
    f.checker.dispose();
  });
}

for(const url of ['https://example.com/','https://chatgpt.com.evil.test/','http://chatgpt.com/']){
  test(`unsupported target never requests the page: ${url}`,async()=>{
    const f=fixture({info:{status:'available',url}});
    await f.checker.check();
    assert.equal(f.calls.length,1);
    assert.equal(f.states.at(-1).status,'unsupported');
    assert.match(f.states.at(-1).message,/仅支持 https:\/\/chatgpt.com/);
  });
}

test('unavailable current target retains its actual explanation without assuming page readiness',async()=>{
  const f=fixture({info:{status:'unavailable',message:'没有当前目标'}});
  await f.checker.check();
  assert.equal(f.calls.length,1);
  assert.equal(f.states.at(-1).status,'unavailable');
  assert.equal(f.states.at(-1).message,'没有当前目标');
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

for(const code of ['E_APP_PAGE_RELOAD_REQUIRED','E_APP_PAGE_NOT_READY','E_PAGE_AUTHORIZATION','E_CAPABILITY']){
  test(`request failure retains real code and safe recovery: ${code}`,async()=>{
    const f=fixture({error:Object.assign(Error('真实错误详情'),{code})});
    await f.checker.check();
    const last=f.states.at(-1);
    assert.equal(last.status,'error');
    assert.equal(last.code,code);
    assert.equal(last.detail,'真实错误详情');
    assert.doesNotMatch(last.message,/重装|扩大权限/);
    if(code.includes('RELOAD_REQUIRED'))assert.match(last.message,/保存草稿.*当前操作完成后.*正常刷新网页/);
    else assert.match(last.message,/尚未确认网页模块运行或访问权限/);
  });
}

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
  assert.deepEqual(states.at(-1),{status:'pending',title:'正在检查网页状态…',message:'正在核对当前目标和网页模块回执。'});
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
