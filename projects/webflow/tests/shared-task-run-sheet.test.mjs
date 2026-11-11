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
    const matches=[...scope.querySelectorAll('button')].filter(node=>(node.getAttribute('aria-label')||node.textContent)===name);
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
  assert.match(f.row().textContent,/参数 4 项/);
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

test('details show manifest metadata without hashes or installation IDs and preserve ARIA and close focus handling',async t=>{
  const f=await mount(t);
  const title=f.row().querySelector('.wf-task-name');
  let focusCount=0;title.focus=()=>focusCount++;
  await f.click(title);
  const details=f.document.getElementById(title.getAttribute('aria-controls'));
  assert.ok(details);
  assert.equal(title.getAttribute('aria-expanded'),'true');
  assert.match(details.textContent,/来自已安装任务的说明/);
  assert.match(details.textContent,/https:\/\/example.test/);
  assert.match(details.textContent,/参数 4 项/);
  assert.ok(f.document.getElementById(details.getAttribute('aria-describedby')));
  for(const value of [task.taskId,task.manifestHash,task.contentHash,task.installationId])
    assert.equal(details.textContent.includes(value),false);
  await f.click('收起详情',f.row());
  assert.equal(title.getAttribute('aria-expanded'),'false');
  assert.equal(focusCount,1);
  await f.click(title);
  await React.act(async()=>{
    const event=new f.window.Event('keydown',{bubbles:true});event.key='Escape';
    title.dispatchEvent(event);
  });
  assert.equal(title.getAttribute('aria-expanded'),'false');
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

test('legacy UNKNOWN preserves its historical ID and permits UI-only configure and original read/stop without dispatch',async t=>{
  const f=await mount(t,{saved:pending,history:[recent]});
  assert.deepEqual(f.store.get('webflow.pending.v1'),pending);
  assert.equal(f.row().querySelector('.wf-primary').disabled,false);
  await f.click(f.row().querySelector('.wf-primary'));
  assert.equal(taskCalls(f).filter(call=>call.name==='tasks.configure').length,1);
  assert.equal(f.text().includes(pending.clientRequestId),false,'scripts show compact recovery rather than diagnostics');
  await f.click('查询原请求');
  assert.deepEqual(f.store.get('webflow.pending.v1'),pending,'UNKNOWN does not clear or rewrite pending');
  await f.click('查看记录');
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
  await f.click('查询原请求');
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
    const close=[...f.document.querySelectorAll('button')].find(node=>node.textContent==='关闭配置提示');
    if(close){await f.click(close);assert.equal(f.document.querySelector('[role="alert"]').textContent,original);}
    assertNoDispatch(f);
  }
});

test('runtimeCurrent false preserves real schema metadata and opens configuration without claiming availability',async t=>{
  const f=await mount(t,{runtimeCurrent:false});
  assert.match(f.row().textContent,/待重新验证/);
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
