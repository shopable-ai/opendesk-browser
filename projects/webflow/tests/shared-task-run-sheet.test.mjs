import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import * as React from 'react';

// Real consumer, React and delegated click handlers; only the public transport
// is substituted. This proves ordering, not Chrome activation or Host execution.
const bootstrap=parseHTML('<html><body></body></html>');
Object.assign(globalThis,{window:bootstrap.window,document:bootstrap.document});
bootstrap.document.oninput=null;
const {createRoot}=await import('react-dom/client');
const source=name=>readFileSync(new URL('../src/ui/'+name,import.meta.url),'utf8');
const config=JSON.parse(readFileSync(new URL('../tool.config.json',import.meta.url),'utf8'));
const pin=config.delegatedTasks[0];
const task={...pin,installationId:'existing-install',generation:7};
const manifest={title:'真实任务标题',description:'来自已安装任务的说明',
  siteOrigins:['https://example.test'],paramsSchema:{type:'object',properties:{
    topic:{type:'string'},enabled:{type:'boolean'},max:{type:'integer'},format:{type:'string'}}}};
const pending={clientRequestId:'webflow:historical-never-replay',taskId:pin.taskId,version:pin.version,
  task,params:{query:'historical query',limit:3,showExecutionTab:false},at:100};
const recent={clientRequestId:pending.clientRequestId,taskId:pin.taskId,version:pin.version,
  runId:'original-run',resultId:'original-result',state:'unknown',retirementState:'held',at:100};

async function mount(t,{saved,history,configure,metadata=manifest,readError=false,storageError=false,runtimeCurrent=true,preparations=[]}={}){
  const {window,document}=parseHTML('<html><body><div id="root"><div id="webflow-app"></div></div></body></html>');
  Object.assign(globalThis,{window,document,IS_REACT_ACT_ENVIRONMENT:true});
  const calls=[],store=new Map(),roots=[],errors=[];
  if(saved)store.set('webflow.pending.v1',structuredClone(saved));
  if(history)store.set('webflow.recent.v1',structuredClone(history));
  let inClick=false,revision=0;
  const request=(name,args)=>{
    calls.push({name,args:structuredClone(args),inClick});
    if(name==='storage.get'){
      if(storageError&&args.key==='webflow.pending.v1')return Promise.reject(Error('storage unavailable'));
      return Promise.resolve({value:structuredClone(store.get(args.key)??null),etag:String(revision)});
    }
    if(name==='storage.set'){
      assert.equal(args.ifMatch,String(revision));revision++;
      store.set(args.key,structuredClone(args.value));return Promise.resolve({});
    }
    // UI-only configuration must not require a current website or document.
    if(name==='currentPage.info')return Promise.resolve({status:'unavailable'});
    if(name==='tasks.read'&&args.taskId){
      if(readError)return Promise.reject(Object.assign(Error('removed'),{code:'E_TASK_REMOVED'}));
      return Promise.resolve({task:args.taskId===task.taskId?task:
        {...config.delegatedTasks[1],installationId:'other-install',generation:1},manifest:metadata,runtimeCurrent,
        preparations:args.taskId===task.taskId?preparations:[]});
    }
    if(name==='tasks.configure')return configure?configure(args):Promise.resolve({opened:true});
    if(name==='tasks.read'||name==='tasks.stop')return Promise.resolve({
      clientRequestId:args.clientRequestId,runId:recent.runId,resultId:recent.resultId,
      state:'unknown',semantic:'UNKNOWN',retirementState:'held'});
    throw Error('Unexpected operation '+name);
  };
  const context=vm.createContext({OpenDeskPageReact:{...React,createRoot(node){
    const root=createRoot(node,{onUncaughtError:error=>errors.push(error)});roots.push(root);return root;
  }},OpenDeskTool:{root:document.getElementById('root'),request,setState(){}},
  URL,console,queueMicrotask,addEventListener(){},setTimeout(){return 1;},clearTimeout(){}});
  await React.act(async()=>{vm.runInContext(source('model.js'),context);vm.runInContext(source('main.js'),context);});
  t.after(async()=>{await React.act(async()=>roots.forEach(root=>root.unmount()));assert.deepEqual(errors,[]);});
  const find=(name,scope=document)=>{
    const matches=[...scope.querySelectorAll('button')].filter(node=>(node.getAttribute('aria-label')===name||node.textContent===name));
    assert.equal(matches.length,1,'unique control: '+name);return matches[0];
  };
  const click=async(name,scope)=>{
    const node=typeof name==='string'?find(name,scope):name;
    assert.equal(node.disabled,false);
    await React.act(async()=>{
      inClick=true;try{node.dispatchEvent(new window.Event('click',{bubbles:true}));}finally{inClick=false;}
    });
  };
  await click('脚本');
  return {document,window,calls,store,find,click,context,text:()=>document.body.textContent,
    row:()=>document.querySelector('article')};
}
const taskCalls=f=>f.calls.filter(call=>call.name.startsWith('tasks.'));
const assertNoDispatch=f=>assert.equal(f.calls.some(call=>['tasks.start','tasks.open'].includes(call.name)),false);

test('play calls UI-only configure synchronously with the exact six-field installed pin, without preparing or executing',async t=>{
  const f=await mount(t);
  assert.match(f.row().textContent,/真实任务标题/);
  assert.equal(f.row().querySelector('.wf-task-secondary'),null);
  assert.equal(f.row().querySelector('.wf-primary').disabled,false,'unavailable current page does not block opening UI');
  const before=f.calls.length;
  await f.click(f.row().querySelector('.wf-primary'));
  assert.deepEqual(f.calls.slice(before),[{name:'tasks.configure',args:{task},inClick:true}]);
  assertNoDispatch(f);
  assert.equal(f.store.has('webflow.pending.v1'),false);
  assert.equal(f.document.querySelector('#wf-query'),null);
  assert.equal(f.document.querySelector('#wf-show-execution-tab'),null);
  assert.doesNotMatch(f.text(),/保存运行步骤|确认手动运行|最多返回 3 条/);
});

test('more details keep metadata and folded technical identity, preserve ARIA and return focus to more',async t=>{
  const f=await mount(t);
  const title=f.row().querySelector('.wf-task-name');
  const more=f.row().querySelector('[data-wf-more]');
  let focusCount=0;more.focus=()=>focusCount++;
  await f.click(more);await f.click('查看详情',f.row());
  const details=f.row().querySelector('.wf-task-detail');
  assert.ok(details);
  assert.equal(title.getAttribute('aria-haspopup'),'dialog');
  assert.match(details.textContent,/来自已安装任务的说明/);
  assert.match(details.textContent,/https:\/\/example.test/);
  assert.match(details.textContent,/参数 4 项/);
  assert.ok(f.document.getElementById(details.getAttribute('aria-describedby')));
  const technical=details.querySelector('details');
  assert.equal(technical.hasAttribute('open'),false);
  assert.match(technical.textContent,/Task ID/);
  assert.ok(technical.textContent.includes(task.taskId));
  for(const value of [task.manifestHash,task.contentHash,task.installationId])
    assert.equal(details.textContent.includes(value),false);
  await f.click('收起详情',f.row());
  assert.equal(f.row().querySelector('.wf-task-detail'),null);
  assert.equal(focusCount,1);
  await f.click(more);await f.click('查看详情',f.row());
  await React.act(async()=>{
    const event=new f.window.Event('keydown',{bubbles:true});event.key='Escape';
    title.dispatchEvent(event);
  });
  assert.equal(f.row().querySelector('.wf-task-detail'),null);
  assert.equal(focusCount,2,'Escape also restores focus');
  assertNoDispatch(f);
});

test('more menu offers the same direct configure entry; favorites and filtering remain usable',async t=>{
  const f=await mount(t);
  await f.click('更多操作：真实任务标题',f.row());
  await f.click('收藏脚本',f.row());
  assert.equal(f.store.get('webflow.settings.v1').favorites.includes(
    f.context.OpenDeskWebFlowModel.taskKey(pin)),true);
  await f.click('筛选脚本');await f.click('收藏');
  assert.equal(f.document.querySelectorAll('article').length,1);
  await f.click('更多操作：真实任务标题',f.row());
  await f.click('配置运行',f.row());
  assert.equal(f.calls.filter(call=>call.name==='tasks.configure').length,1);
  assert.equal(f.calls.find(call=>call.name==='tasks.configure').inClick,true);
  assertNoDispatch(f);
});

test('configure rejection or missing Host support keeps the consumer open and never falls back to navigation or execution',async t=>{
  for(const configure of [()=>{throw Error('unsupported');},()=>Promise.reject(Error('denied'))]){
    const f=await mount(t,{configure});
    await f.click(f.row().querySelector('.wf-primary'));
    assert.match(f.text(),/运行配置未打开/);
    assert.equal(f.document.querySelectorAll('article').length,2);
    assertNoDispatch(f);
    assert.equal(f.store.has('webflow.pending.v1'),false);
  }
});

test('busy configuration keeps the complete safe reason readable and opens only the affected script information without replay',async t=>{
  const message='原准备仍占用：请只核对原请求；关闭配置提示不能取消准备。<原始原因>&正文结尾';
  const f=await mount(t,{saved:pending,history:[recent],configure:()=>Promise.reject(
    Object.assign(Error(message),{code:'E_TASK_BUSY'}))});
  const affected=f.document.querySelectorAll('article')[1];
  await f.click(affected.querySelector('.wf-primary'));
  const feedback=f.document.querySelector('.wf-configure-feedback');
  assert.ok(feedback,'configuration error is a compact disclosure');
  assert.equal(feedback.hasAttribute('open'),false);
  assert.equal(feedback.querySelector('summary [role="alert"]').textContent,'运行配置未打开');
  const main=f.document.querySelector('main');
  const order=[...main.querySelectorAll('*')];
  assert.ok(order.indexOf(main.querySelector('#wf-search'))<order.indexOf(feedback),'feedback follows search');
  assert.match(feedback.previousElementSibling.textContent,/个固定脚本/);
  assert.ok(order.indexOf(feedback)<order.indexOf(f.row()),'feedback precedes rows');
  // linkedom does not implement native summary activation; expose the body
  // while exercising its real React action handlers below.
  feedback.setAttribute('open','');
  assert.ok(feedback.textContent.includes('E_TASK_BUSY：'+message),'full safeError survives as text');
  assert.equal(feedback.querySelector('原始原因'),null,'error text cannot become markup');
  await f.click('查看脚本信息',feedback);
  assert.ok(affected.querySelector('.wf-task-detail'));
  assert.equal(f.row().querySelector('.wf-task-detail'),null,'taskId routes inspection to the affected script');
  assert.equal(f.calls.filter(call=>call.name==='tasks.configure').length,1,'inspection never retries configuration');
  await f.click('关闭配置错误');
  assert.equal(feedback.isConnected,false);
  assert.equal(affected.querySelector('.wf-task-detail')!==null,true,'dismissing error preserves inspection');
  assert.deepEqual(f.store.get('webflow.pending.v1'),pending);
  assert.equal(f.calls.some(call=>['tasks.prepare','tasks.stop','storage.set'].includes(call.name)),false);
  assertNoDispatch(f);
});

test('rapid duplicate clicks cannot open overlapping configure requests',async t=>{
  let resolve;
  const held=new Promise(done=>{resolve=done;});
  const f=await mount(t,{configure:()=>held});
  await f.click(f.row().querySelector('.wf-primary'));
  await f.click(f.row().querySelector('.wf-primary'));
  assert.equal(f.calls.filter(call=>call.name==='tasks.configure').length,1);
  await React.act(async()=>resolve({opened:true}));
  assertNoDispatch(f);
});

test('original-run configuration failure stays visible on records and can inspect its script without replay',async t=>{
  const preparation={preparationId:'original-unknown-preparation',task,state:'unknown',settled:false};
  const f=await mount(t,{preparations:[preparation],configure:()=>Promise.reject(
    Object.assign(Error('原准备仍占用，请核对原入口'),{code:'E_TASK_BUSY'}))});
  await f.click('记录');await f.click('查看原运行');
  const feedback=f.document.querySelector('.wf-configure-feedback');
  assert.ok(feedback,'records keep their own configuration error visible');
  assert.ok(feedback.textContent.includes('E_TASK_BUSY：原准备仍占用，请核对原入口'));
  assert.equal(f.document.querySelector('main').getAttribute('aria-label'),'记录');
  await f.click('查看脚本信息',feedback);
  assert.equal(f.document.querySelector('main').getAttribute('aria-label'),'脚本');
  assert.ok(f.row().querySelector('.wf-task-detail'));
  assert.equal(f.calls.filter(call=>call.name==='tasks.configure').length,1);
  assert.deepEqual(f.calls.find(call=>call.name==='tasks.configure').args,{task,preparationId:preparation.preparationId});
  assertNoDispatch(f);
});

test('configuration-error inspection reveals the affected script after filtering it out',async t=>{
  const f=await mount(t,{configure:()=>Promise.reject(Error('busy'))});
  await f.click(f.row().querySelector('.wf-primary'));
  await f.click('筛选脚本');await f.click('收藏');
  assert.equal(f.document.querySelectorAll('article').length,0);
  await f.click('查看脚本信息');
  assert.ok(f.row(),'inspection makes the affected task visible');
  assert.ok(f.row().querySelector('.wf-task-detail'));
  assert.equal(f.calls.filter(call=>call.name==='tasks.configure').length,1);
  assertNoDispatch(f);
});

test('legacy UNKNOWN preserves its historical ID and permits UI-only configure and original read/stop without dispatch',async t=>{
  const f=await mount(t,{saved:pending,history:[recent]});
  assert.deepEqual(f.store.get('webflow.pending.v1'),pending);
  assert.equal(f.row().querySelector('.wf-primary').disabled,false);
  await f.click(f.row().querySelector('.wf-primary'));
  assert.equal(taskCalls(f).filter(call=>call.name==='tasks.configure').length,1);
  assert.equal(f.text().includes(pending.clientRequestId),false,'scripts show compact recovery rather than diagnostics');
  assert.equal([...f.document.querySelectorAll('button')].some(node=>node.textContent==='查询原请求'),false);
  const indicator=f.document.querySelector('[data-page="history"]');
  assert.match(indicator?.getAttribute('aria-label')||'',/原请求.*待核对/);
  await f.click('记录');
  await f.click('查询原请求');
  assert.deepEqual(f.store.get('webflow.pending.v1'),pending,'UNKNOWN does not clear or rewrite pending');
  assert.ok(f.text().includes(pending.clientRequestId));
  assert.ok(f.text().includes(recent.runId));
  assert.ok(f.text().includes(recent.resultId));
  await f.click('停止原请求');
  assert.deepEqual(f.calls.find(call=>call.name==='tasks.stop').args,{clientRequestId:pending.clientRequestId});
  await f.click('查询原请求');
  assert.ok(f.calls.filter(call=>call.name==='tasks.read'&&call.args.clientRequestId).every(
    call=>call.args.clientRequestId===pending.clientRequestId));
  assert.deepEqual(f.store.get('webflow.pending.v1'),pending);
  assertNoDispatch(f);
});

test('older history-only UNKNOWN recovers the same locator without replay',async t=>{
  const f=await mount(t,{history:[recent]});
  assert.equal(f.row().querySelector('.wf-primary').disabled,false);
  await f.click('记录');await f.click('查询原请求');
  assert.equal(f.store.get('webflow.pending.v1').clientRequestId,recent.clientRequestId);
  assert.equal(f.store.get('webflow.recent.v1')[0].runId,recent.runId);
  assertNoDispatch(f);
  assert.equal(taskCalls(f).some(call=>call.name==='tasks.configure'),false);
});

test('recovery failure does not block UI-only configure; removed installation still fails closed',async t=>{
  for(const options of [{storageError:true},{readError:true},{saved:{...pending,clientRequestId:'invalid id'}}]){
    const f=await mount(t,options);
    assert.equal(f.row().querySelector('.wf-primary').disabled,Boolean(options.readError));
    if(!options.readError)await f.click(f.row().querySelector('.wf-primary'));
    assert.equal(taskCalls(f).some(call=>call.name==='tasks.configure'),!options.readError);
    assertNoDispatch(f);
  }
});

test('missing schema is unknown, and metadata counts arbitrary schema fields rather than search-specific parameters',async t=>{
  const f=await mount(t,{metadata:{title:'没有参数资料'}});
  await f.click(f.row().querySelector('[data-wf-more]'));await f.click('查看详情',f.row());
  assert.match(f.row().textContent,/参数待核对/);
  const model=f.context.OpenDeskWebFlowModel;
  assert.equal(model.taskMetadata({paramsSchema:{type:'object',properties:{}}}).parameterCount,0);
  assert.equal(model.taskMetadata({paramsSchema:{type:'object',properties:{a:{},b:{}}}}).parameterCount,2);
  assert.equal(model.filterTasks([{...pin,title:'Metadata title',site:'https://example.test',state:'available'}],
    'example','all',[]).length,1);
});


test('configuration success, synchronous failure and rejection preserve the unresolved recovery error',async t=>{
  for(const configure of [()=>({opened:true}),()=>{throw Error('unsupported');},()=>Promise.reject(Error('denied'))]){
    const f=await mount(t,{storageError:true,configure});
    const original=f.document.querySelector('[role="alert"]').textContent;
    await f.click(f.row().querySelector('.wf-primary'));
    assert.equal(f.document.querySelector('[role="alert"]').textContent,original);
    const close=f.document.querySelector('[aria-label="关闭配置错误"]');
    if(close){await f.click(close);assert.equal(f.document.querySelector('[role="alert"]').textContent,original);}
    assertNoDispatch(f);
  }
});

test('runtimeCurrent false preserves real schema metadata and opens configuration without claiming availability',async t=>{
  const f=await mount(t,{runtimeCurrent:false});
  assert.match(f.row().textContent,/待重新验证/);
  await f.click(f.row().querySelector('[data-wf-more]'));await f.click('查看详情',f.row());
  assert.match(f.row().textContent,/参数 4 项/);
  assert.doesNotMatch(f.row().textContent,/可手动运行/);
  await f.click(f.row().querySelector('.wf-primary'));
  assert.deepEqual(f.calls.find(call=>call.name==='tasks.configure').args,{task});
  assertNoDispatch(f);
});

test('metadata discovers original Authority refs in memory; viewing one configures the exact pin and preparation only',async t=>{
  const original={preparationId:'original-preparation',task,state:'unknown',runId:'shared-run',
    resultId:'shared-result',settled:false,result:{secret:'must not project'},value:'must not project'};
  const f=await mount(t,{preparations:[original],history:[recent]});
  await f.click('记录');
  for(const value of [original.preparationId,original.runId,original.resultId])assert.ok(f.text().includes(value));
  assert.doesNotMatch(f.text(),/must not project/);
  const before=f.calls.length;
  await f.click('查看原运行');
  assert.deepEqual(f.calls.slice(before),[{name:'tasks.configure',args:{task,preparationId:original.preparationId},inClick:true}]);
  assert.deepEqual(f.store.get('webflow.recent.v1'),[recent]);
  assert.equal(f.store.has('webflow.pending.v1'),false);
  assert.equal(f.calls.some(call=>call.name==='storage.set'),false);
  assertNoDispatch(f);
});

test('discovery ignores stale or foreign pins and storage lookalikes; projection strips results and deduplicates refs',async t=>{
  const original={preparationId:'authority-ref',task,state:'completed',settled:true,runId:'run',resultId:'result'};
  const foreign=[
    {...original,preparationId:'wrong-install',task:{...task,installationId:'foreign'}},
    {...original,preparationId:'wrong-generation',task:{...task,generation:8}},
    {...original,preparationId:'wrong-hash',task:{...task,contentHash:'different'}},
    {...original,preparationId:'wrong-task',task:{...task,taskId:'foreign'}},
    {...original,preparationId:''},{...original,preparationId:'missing-settled',settled:undefined}
  ];
  const f=await mount(t,{preparations:foreign,history:[{...recent,preparationId:'storage-ref'}]});
  await f.click('记录');
  assert.equal([...f.document.querySelectorAll('button')].some(node=>node.textContent==='查看原运行'),false);
  for(const entry of foreign)if(entry.preparationId)assert.equal(f.text().includes(entry.preparationId),false);
  const projected=f.context.OpenDeskWebFlowModel.taskPreparations([
    {...original,result:{secret:true},value:'private'},original,...foreign],task);
  assert.deepEqual(JSON.parse(JSON.stringify(projected)),[original]);
  assertNoDispatch(f);
});

test('refresh drops original refs when Authority no longer returns them',async t=>{
  const preparations=[{preparationId:'no-longer-authorized',task,state:'unknown',settled:false}];
  const f=await mount(t,{preparations});
  await f.click('记录');
  assert.ok(f.find('查看原运行'));
  preparations.length=0;
  await f.click('脚本');await f.click('刷新脚本安装状态');await f.click('记录');
  assert.doesNotMatch(f.text(),/no-longer-authorized|查看原运行/);
  assert.equal(f.calls.some(call=>call.name==='tasks.configure'),false);
  assertNoDispatch(f);
});
