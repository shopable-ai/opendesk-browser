import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import * as React from 'react';

// Real React and delegated DOM events, with ONLY the SDK transport substituted.
// These checks do not establish Chrome user activation, IDB or installation.
const bootstrap=parseHTML('<html><body></body></html>');
Object.assign(globalThis,{window:bootstrap.window,document:bootstrap.document});
bootstrap.document.oninput=null;
const {createRoot}=await import('react-dom/client');
const source=name=>readFileSync(new URL('../src/ui/'+name,import.meta.url),'utf8');
const config=JSON.parse(readFileSync(new URL('../tool.config.json',import.meta.url),'utf8'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const problem=code=>Object.assign(Error(code),{code});
function sdk(){
  const store=new Map(),calls=[],pins=config.delegatedTasks.map(p=>({...p,installationId:'install-'+p.taskId,generation:1}));
  const etag=key=>createHash('sha256').update(JSON.stringify(store.get(key)??null)).digest('hex');
  const api={store,calls,pins,read:async id=>({clientRequestId:id,state:'unknown',semantic:'UNKNOWN'}),
    start:async id=>({clientRequestId:id,state:'running'}),stop:async id=>({clientRequestId:id,state:'stopping'}),
    async request(name,args){
      calls.push({name,args:structuredClone(args)});
      if(name==='storage.get'){
        await api.beforeGet?.(args);
        return {value:structuredClone(store.get(args.key)??null),etag:etag(args.key)};
      }
      if(name==='storage.set'){
        await api.beforeSet?.(args);
        if(api.failSave)throw problem('E_QUOTA');
        if(args.ifMatch!==etag(args.key))throw problem('E_CONFLICT');
        store.set(args.key,structuredClone(args.value));await api.afterSet?.(args);return {};
      }
      if(name==='currentPage.info')return {status:'available',url:'https://www.baidu.com/'};
      if(name==='tasks.read')return args.taskId?{task:pins.find(p=>p.taskId===args.taskId)}:api.read(args.clientRequestId);
      if(name==='tasks.start')return api.start(args.clientRequestId,args);
      if(name==='tasks.stop')return api.stop(args.clientRequestId);
      throw Error('Unexpected operation '+name);
    }};
  return api;
}
async function mount(t,host=sdk()){
  const {window,document}=parseHTML('<html><body><div id="root"><div id="webflow-app"></div></div></body></html>');
  // Linkedom lacks the browser's default input.type='text'; React uses it to
  // decide whether input events should produce onChange. Match that DOM default.
  Object.defineProperty(window.HTMLInputElement.prototype,'type',{configurable:true,
    get(){return this.getAttribute('type')||'text';},set(value){this.setAttribute('type',value);}});
  Object.assign(globalThis,{window,document,IS_REACT_ACT_ENVIRONMENT:true});
  const errors=[],roots=[];
  const runtime={...React,createRoot(node){const root=createRoot(node,{onUncaughtError:e=>errors.push(e)});roots.push(root);return root;}};
  const timers=new Map();let timerId=0;
  const context=vm.createContext({OpenDeskPageReact:runtime,OpenDeskTool:{root:document.getElementById('root'),request:host.request.bind(host)},
    crypto:globalThis.crypto,URL,console,queueMicrotask,addEventListener(){},
    setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);}});
  await React.act(async()=>{vm.runInContext(source('model.js'),context);vm.runInContext(source('main.js'),context);});
  let closed=false;
  const close=async()=>{if(closed)return;closed=true;await React.act(async()=>roots.forEach(r=>r.unmount()));timers.clear();};
  t.after(close);
  const find=(label,scope=document)=>{
    const found=[...scope.querySelectorAll('button')].filter(n=>n.textContent===label||n.getAttribute('aria-label')===label);
    assert.equal(found.length,1,'Unique visible control: '+label);return found[0];
  };
  const f={host,document,errors,close,find,text:()=>document.body.textContent,
    async click(label,scope){const node=find(label,scope);assert.equal(node.disabled,false,label+' enabled');
      await React.act(async()=>node.dispatchEvent(new window.Event('click',{bubbles:true})));},
    async duplicateClick(label){const node=find(label);await React.act(async()=>{
      node.dispatchEvent(new window.Event('click',{bubbles:true}));
      node.dispatchEvent(new window.Event('click',{bubbles:true}));});},
    async input(value){await React.act(async()=>{const node=document.getElementById('wf-query');
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node),'value').set.call(node,value);
      node.dispatchEvent(new window.Event('input',{bubbles:true}));});},
    async tick(){await React.act(async()=>{const work=[...timers.values()];timers.clear();for(const fn of work)fn();});},
    async flush(fn=()=>{}){await React.act(async()=>{fn();});}
  };
  return f;
}

test('opening Web Flow recognizes the verified Baidu upgrade by its exact package identity',async t=>{
  const pkg=JSON.parse(readFileSync(new URL('../../../examples/tasks/baidu.search.top3.v1.opendesk-task.json',import.meta.url),'utf8'));
  const host=sdk();
  host.pins[0]={taskId:pkg.manifest.taskId,version:pkg.manifest.version,
    manifestHash:pkg.manifestHash,contentHash:pkg.manifest.program.sourceHash,
    installationId:'install-'+pkg.manifest.taskId,generation:2};
  const f=await mount(t,host);
  assert.deepEqual(f.errors,[]);
  await f.click('脚本');
  assert.match(f.text(),/百度搜索/);
  assert.match(taskCard(f).textContent,/可手动运行/);
  assert.ok(taskCard(f).textContent.includes(pkg.manifest.version));
});

const starts=host=>host.calls.filter(c=>c.name==='tasks.start');
const taskCard=f=>[...f.document.querySelectorAll('article')].find(n=>n.textContent.includes('百度搜索'));
async function prepare(f){
  await f.click('脚本');await f.click('运行',taskCard(f));await f.input('OpenDesk Browser');
  await f.click('保存运行步骤',taskCard(f));
}
const complete=(id,retirementState='released')=>({clientRequestId:id,runId:'run-original',resultId:'result-original',
  state:'completed',retirementState,value:{status:'success',results:[{title:'真实 SDK 回包内容',url:'https://example.com/'}],count:1},
  result:{tag:'controller-result',runId:'run-original',resultId:'result-original',state:'completed',outcome:{ok:true}}});

test('overview leads to existing scripts and automatic usage help without creating an execution',async t=>{
  const host=sdk(),f=await mount(t,host);
  await f.click('查看可用脚本');
  assert.equal(f.document.querySelector('[data-page="scripts"]').getAttribute('aria-selected'),'true');
  assert.ok(taskCard(f));
  await f.click('概览');await f.click('使用与排障');
  assert.equal(f.document.querySelector('main h2').textContent,'帮助');
  const keyboardTabs=()=>[...f.document.querySelectorAll('[role="tab"]')].filter(tab=>tab.getAttribute('tabindex')==='0');
  assert.equal(keyboardTabs().length,1,'help retains one keyboard entry into primary navigation');
  assert.equal(keyboardTabs()[0].getAttribute('data-page'),'overview');
  await f.click('设置');
  assert.equal(keyboardTabs().length,1,'settings retains one keyboard entry into primary navigation');
  await f.click('返回');
  assert.equal(f.document.querySelector('[data-page="overview"]').getAttribute('aria-selected'),'true');
  assert.equal(starts(host).length,0);
  assert.equal(host.store.has('webflow.pending.v1'),false);
  assert.deepEqual([...new Set(host.calls.map(c=>c.name))].sort(),['currentPage.info','storage.get','tasks.read']);
});

test('the step ID is durably read back before the direct manual start; duplicate clicks start once',async t=>{
  const host=sdk(),ack=deferred();host.start=()=>ack.promise;
  const f=await mount(t,host);await prepare(f);
  assert.equal(starts(host).length,0,'preparation must not dispatch');
  const saved=host.store.get('webflow.pending.v1');assert.ok(saved?.clientRequestId);
  await f.duplicateClick('确认手动运行');
  assert.equal(starts(host).length,1);assert.equal(starts(host)[0].args.clientRequestId,saved.clientRequestId);
  assert.equal(f.find('保存运行步骤').disabled,true);
  assert.equal(f.find('停止原请求').disabled,false,'Stop must remain usable before ACK');
  await f.flush(()=>ack.resolve({clientRequestId:saved.clientRequestId,state:'unknown'}));
  assert.equal(starts(host).length,1);
});

test('close and recreate the React root restores the original record and queries real SDK data only',async t=>{
  const host=sdk(),lost=deferred();host.start=()=>lost.promise;
  let f=await mount(t,host);await prepare(f);await f.click('确认手动运行');
  const id=starts(host)[0].args.clientRequestId;
  await f.close();host.read=async()=>complete(id);
  f=await mount(t,host);await f.click('记录');
  assert.ok(f.text().includes(id));assert.equal(f.document.querySelector('pre'),null,'storage summary cannot disclose a result');
  await f.click('查询原请求');
  assert.equal(starts(host).length,1);assert.match(f.text(),/run-original/);assert.match(f.text(),/result-original/);
  assert.match(f.document.querySelector('pre')?.textContent||'',/真实 SDK 回包内容/);
  assert.equal(host.store.get('webflow.pending.v1'),null);
});

test('timeout, missing record and UNKNOWN keep the original ID fenced across reopen',async t=>{
  const host=sdk();host.start=async()=>{throw problem('E_TIMEOUT');};
  let f=await mount(t,host);await prepare(f);await f.click('确认手动运行');
  const id=starts(host)[0].args.clientRequestId;
  host.read=async()=>{throw problem('E_TIMEOUT');};await f.click('查询原请求');
  assert.ok(f.text().includes(id));await f.close();
  host.read=async()=>({clientRequestId:id,state:'unknown',semantic:'UNKNOWN'});
  f=await mount(t,host);await f.click('记录');await f.click('查询原请求');await f.tick();
  await f.click('脚本');assert.equal(f.find('运行',taskCard(f)).disabled,true);
  assert.equal(starts(host).length,1);assert.equal(host.store.get('webflow.pending.v1').clientRequestId,id);
});

test('save failure never dispatches and does not present a runnable confirmation',async t=>{
  const host=sdk();host.failSave=true;const f=await mount(t,host);await prepare(f);
  assert.equal(starts(host).length,0);assert.match(f.text(),/E_QUOTA/);
  assert.equal(f.document.querySelectorAll('button').length>0,true);
  assert.equal([...f.document.querySelectorAll('button')].some(b=>b.textContent==='确认手动运行'&&!b.disabled),false);
});

test('Stop before start ACK ignores late start/read callbacks and never enables another run',async t=>{
  const host=sdk(),ack=deferred(),read=deferred();host.start=()=>ack.promise;host.read=()=>read.promise;
  const f=await mount(t,host);await prepare(f);await f.click('确认手动运行');
  const id=starts(host)[0].args.clientRequestId;await f.click('查询原请求');await f.click('停止原请求');
  await f.flush(()=>{ack.resolve(complete(id));read.resolve(complete(id));});
  assert.equal(f.document.querySelector('pre'),null);assert.match(f.text(),/stopping|正在停止/);
  assert.equal(host.store.get('webflow.pending.v1').clientRequestId,id);assert.equal(starts(host).length,1);
});

test('completed Result while retirement is held stays visible but cannot start B or a new step',async t=>{
  const host=sdk();host.start=async id=>complete(id,'retiring');
  const f=await mount(t,host);await prepare(f);await f.click('确认手动运行');
  assert.match(f.text(),/retiring/);assert.match(f.document.querySelector('pre')?.textContent||'',/真实 SDK/);
  assert.ok(host.store.get('webflow.pending.v1'));assert.equal(f.find('运行',taskCard(f)).disabled,true);
  assert.equal(starts(host).length,1);await f.tick();assert.equal(starts(host).length,1);
});

test('revoked read clears previously displayed authoritative data and leaves recovery fenced',async t=>{
  const host=sdk();host.start=async id=>complete(id,'retiring');
  const f=await mount(t,host);await prepare(f);await f.click('确认手动运行');
  assert.ok(f.document.querySelector('pre'));
  host.read=async()=>{throw problem('E_PERMISSION');};await f.click('查询原请求');
  assert.equal(f.document.querySelector('pre'),null);assert.match(f.text(),/E_PERMISSION/);
  assert.equal(starts(host).length,1);assert.ok(host.store.get('webflow.pending.v1'));
});

test('a malformed or unreadable saved locator prevents any fresh admission',async t=>{
  const host=sdk();host.store.set('webflow.pending.v1',{clientRequestId:'bad/id',taskId:'baidu.search.top3'});
  const f=await mount(t,host);await f.click('脚本');assert.equal(f.find('运行',taskCard(f)).disabled,true);
  assert.equal(starts(host).length,0);assert.match(f.text(),/原步骤|恢复/);
});

test('saved confirmation survives tab navigation and uses the frozen input and six-field installation',async t=>{
  const host=sdk(),f=await mount(t,host);await prepare(f);
  await f.click('记录');await f.click('确认手动运行');
  assert.equal(starts(host).length,1);assert.equal(starts(host)[0].args.params.query,'OpenDesk Browser');
  assert.deepEqual(starts(host)[0].args.task,host.pins[0]);
});

test('legacy UNKNOWN summary restores a query-only locator and never renders stored result bodies',async t=>{
  const host=sdk();host.store.set('webflow.recent.v1',[{clientRequestId:'webflow:legacy',
    taskId:host.pins[0].taskId,version:host.pins[0].version,state:'unknown',retirementState:'unknown',
    resultPersisted:true,value:{secret:'untrusted summary'},result:complete('webflow:legacy').result}]);
  const f=await mount(t,host);await f.click('脚本');assert.equal(f.find('运行',taskCard(f)).disabled,true);
  await f.click('记录');await f.click('查询原请求');
  assert.equal(host.store.get('webflow.pending.v1').clientRequestId,'webflow:legacy');
  assert.equal(starts(host).length,0);assert.equal(f.document.querySelector('pre'),null);
  assert.ok(!f.text().includes('untrusted summary'));
});

test('failed and stopped durable Results are displayed and release only with retirement acknowledgement',async t=>{
  const host=sdk();host.start=async id=>({...complete(id),state:'stopped',value:null,
    result:{...complete(id).result,state:'stopped',outcome:{ok:false,error:{code:'E_CANCELLED'}}}});
  const f=await mount(t,host);await prepare(f);await f.click('确认手动运行');
  assert.match(f.document.querySelector('pre')?.textContent||'',/E_CANCELLED/);
  assert.equal(host.store.get('webflow.pending.v1'),null);assert.equal(starts(host).length,1);
});

test('mismatching original request or Result IDs cannot disclose data or remove the pending fence',async t=>{
  const host=sdk();host.start=async id=>({...complete(id),clientRequestId:'other-request'});
  const f=await mount(t,host);await prepare(f);await f.click('确认手动运行');
  assert.equal(f.document.querySelector('pre'),null);assert.ok(host.store.get('webflow.pending.v1'));
  const id=starts(host)[0].args.clientRequestId;
  host.read=async()=>({...complete(id),result:{...complete(id).result,resultId:'other-result'}});
  await f.click('查询原请求');assert.equal(f.document.querySelector('pre'),null);
  assert.ok(host.store.get('webflow.pending.v1'));assert.equal(starts(host).length,1);
});

test('reinstalled Task cannot use a previously saved confirmation to gain a new admission',async t=>{
  const host=sdk(),f=await mount(t,host);await prepare(f);
  host.pins[0]={...host.pins[0],installationId:'new-installation',generation:2};
  await f.click('刷新');await f.click('确认手动运行');
  assert.equal(starts(host).length,0);assert.ok(host.store.get('webflow.pending.v1'));
  assert.match(f.text(),/安装身份发生变化/);
});

test('late callbacks from a closed UI cannot disclose into its replacement',async t=>{
  const host=sdk(),ack=deferred();host.start=()=>ack.promise;
  let f=await mount(t,host);await prepare(f);await f.click('确认手动运行');
  const id=starts(host)[0].args.clientRequestId;await f.close();
  f=await mount(t,host);await f.flush(()=>ack.resolve(complete(id)));
  assert.equal(f.document.querySelector('pre'),null);assert.ok(f.text().includes(id));assert.equal(starts(host).length,1);
});

test('late Stop ACK cannot overwrite the next explicitly started step after original release is queried',async t=>{
  const host=sdk(),lateStop=deferred();host.stop=()=>lateStop.promise;
  const f=await mount(t,host);await prepare(f);await f.click('确认手动运行');
  const id=starts(host)[0].args.clientRequestId;
  await f.click('停止原请求');host.read=async()=>complete(id);await f.click('查询原请求');
  await prepare(f);await f.click('确认手动运行');
  const next=starts(host)[1].args.clientRequestId;assert.notEqual(next,id);
  await f.flush(()=>lateStop.resolve({clientRequestId:id,state:'stopped'}));
  const activeId=f.document.querySelector('section .wf-mono')?.textContent;
  assert.equal(activeId,next);assert.equal(host.store.get('webflow.pending.v1').clientRequestId,next);
  assert.equal(starts(host).length,2,'only two separately confirmed manual actions');
});

test('pending storage read failure blocks admission and reports the recovery problem',async t=>{
  const host=sdk(),original=host.request;host.request=async function(name,args){
    if(name==='storage.get'&&args.key==='webflow.pending.v1')throw problem('E_STORAGE');
    return original.call(this,name,args);
  };
  const f=await mount(t,host);await f.click('脚本');
  assert.equal(f.find('运行',taskCard(f)).disabled,true);assert.match(f.text(),/E_STORAGE/);assert.equal(starts(host).length,0);
});

test('an old held-summary storage read cannot overwrite a newer released observation',async t=>{
  const host=sdk(),oldGet=deferred(),entered=deferred();let hold=true;
  host.beforeGet=async args=>{if(hold&&args.key==='webflow.recent.v1'&&args.withEtag){hold=false;entered.resolve();await oldGet.promise;}};
  host.start=async id=>complete(id,'retiring');const f=await mount(t,host);await prepare(f);await f.click('确认手动运行');
  await entered.promise;const id=starts(host)[0].args.clientRequestId;
  host.read=async()=>complete(id);await f.click('查询原请求');await f.flush(()=>oldGet.resolve());
  assert.equal(host.store.get('webflow.recent.v1')[0].retirementState,'released');
  await f.close();const replacement=await mount(t,host);await replacement.click('脚本');
  assert.equal(replacement.find('运行',taskCard(replacement)).disabled,false);
});

test('a committed pending clear with a lost ACK is reconciled idempotently',async t=>{
  const host=sdk();let lose=true;
  host.afterSet=async args=>{if(lose&&args.key==='webflow.pending.v1'&&args.value===null){lose=false;throw problem('E_TIMEOUT');}};
  host.start=async id=>complete(id);const f=await mount(t,host);await prepare(f);await f.click('确认手动运行');
  const id=starts(host)[0].args.clientRequestId;assert.equal(host.store.get('webflow.pending.v1'),null);
  host.read=async()=>complete(id);await f.click('查询原请求');
  assert.equal(f.find('运行',taskCard(f)).disabled,false);assert.equal(starts(host).length,1);
});

test('Stop during pending clear does not permanently desynchronize the original locator',async t=>{
  const host=sdk(),clear=deferred(),entered=deferred();let hold=true;
  host.beforeSet=async args=>{if(hold&&args.key==='webflow.pending.v1'&&args.value===null){hold=false;entered.resolve();await clear.promise;}};
  host.start=async id=>complete(id);const f=await mount(t,host);await prepare(f);await f.click('确认手动运行');
  await entered.promise;const id=starts(host)[0].args.clientRequestId;
  await f.click('停止原请求');await f.flush(()=>clear.resolve());
  host.read=async()=>complete(id);await f.click('查询原请求');
  assert.equal(f.find('运行',taskCard(f)).disabled,false);assert.equal(starts(host).length,1);
});

test('querying a locally staged step preserves confirmation and local cancellation creates zero Runs',async t=>{
  const host=sdk(),f=await mount(t,host);await prepare(f);await f.click('记录');await f.click('查询原请求');
  assert.equal(f.find('确认手动运行').disabled,false);
  assert.match(f.text(),/百度搜索/);assert.ok(f.text().includes(config.delegatedTasks[0].version));assert.match(f.text(),/https:\/\/www.baidu.com/);
  await f.click('取消未运行步骤');assert.equal(host.store.get('webflow.pending.v1'),null);assert.equal(starts(host).length,0);
  assert.equal(host.calls.filter(c=>c.name==='tasks.stop').length,0,'no platform request was dispatched');
});

test('an affirmative pre-submit cancellation fence stays settled after reopen without pretending retirement',async t=>{
  const host=sdk();host.start=async()=>{throw problem('E_TIMEOUT');};
  let f=await mount(t,host);await prepare(f);await f.click('确认手动运行');
  const id=starts(host)[0].args.clientRequestId;
  host.read=async()=>({clientRequestId:id,state:'cancelled',semantic:'NOT_SUBMITTED_FENCED',runId:null,resultId:null});
  await f.click('查询原请求');assert.equal(host.store.get('webflow.pending.v1'),null);await f.close();
  f=await mount(t,host);await f.click('脚本');assert.equal(f.find('运行',taskCard(f)).disabled,false);
  assert.notEqual(host.store.get('webflow.recent.v1')[0].retirementState,'released');
});

test('a revoked re-query replaces the old released-success notice with the current failure',async t=>{
  const host=sdk();host.start=async id=>complete(id);const f=await mount(t,host);
  await prepare(f);await f.click('确认手动运行');assert.match(f.text(),/原请求已查询，资源已释放/);
  host.read=async()=>{throw problem('E_PERMISSION');};await f.click('查询原请求');
  assert.match(f.text(),/E_PERMISSION/);assert.ok(!f.text().includes('原请求已查询，资源已释放'));
  assert.equal(f.document.querySelector('pre'),null);assert.equal(starts(host).length,1);
});

test('release of A cannot clear a different concurrently saved pending locator B',async t=>{
  const host=sdk();host.start=async id=>complete(id,'retiring');const f=await mount(t,host);
  await prepare(f);await f.click('确认手动运行');const id=starts(host)[0].args.clientRequestId;
  const other={clientRequestId:'webflow:other-step',taskId:host.pins[0].taskId,version:host.pins[0].version};
  host.store.set('webflow.pending.v1',other);host.read=async()=>complete(id);
  await f.click('查询原请求');assert.deepEqual(host.store.get('webflow.pending.v1'),other);
  assert.match(f.text(),/E_CONFLICT/);assert.equal(starts(host).length,1);
});

test('a failed local-only cancellation keeps an explicit same-step cancellation retry and never starts or stops a Task',async t=>{
  const host=sdk(),f=await mount(t,host);await prepare(f);host.failSave=true;
  await f.click('取消未运行步骤');assert.match(f.text(),/E_QUOTA/);
  assert.equal(f.find('重试取消未运行步骤').disabled,false);
  host.failSave=false;await f.click('重试取消未运行步骤');
  assert.equal(host.store.get('webflow.pending.v1'),null);assert.equal(starts(host).length,0);
  assert.equal(host.calls.filter(c=>c.name==='tasks.stop').length,0);
});

test('Stop interrupting locator restoration still permits same-ID query after its storage write commits',async t=>{
  const host=sdk(),write=deferred(),entered=deferred();let hold=true;
  const id='webflow:legacy-stopping';host.store.set('webflow.recent.v1',[{clientRequestId:id,
    taskId:host.pins[0].taskId,version:host.pins[0].version,state:'unknown',retirementState:'unknown'}]);
  host.beforeSet=async args=>{if(hold&&args.key==='webflow.pending.v1'&&args.value?.clientRequestId===id){hold=false;entered.resolve();await write.promise;}};
  const f=await mount(t,host);await f.click('记录');await f.click('查询原请求');await entered.promise;
  await f.click('停止原请求');await f.flush(()=>write.resolve());
  host.read=async()=>complete(id);await f.click('查询原请求');
  assert.ok(f.document.querySelector('pre'));assert.equal(host.store.get('webflow.pending.v1'),null);
  assert.equal(starts(host).length,0);
});

test('preparation failure keeps a never-submitted cancellation path before a write and after lost save ACK',async t=>{
  for(const afterCommit of [false,true]){
    const host=sdk();
    if(afterCommit){let fail=true;host.afterSet=async args=>{
      if(fail&&args.key==='webflow.pending.v1'&&args.value){fail=false;throw problem('E_TIMEOUT');}
    };}else host.failSave=true;
    const f=await mount(t,host);await prepare(f);assert.equal(starts(host).length,0);
    assert.equal(f.find('重试取消未运行步骤').disabled,false);
    host.failSave=false;await f.click('重试取消未运行步骤');
    assert.equal(host.store.get('webflow.pending.v1')??null,null);assert.equal(starts(host).length,0);
    assert.equal(host.calls.filter(c=>c.name==='tasks.stop').length,0);await f.close();
  }
});

test('an unread legacy history with empty pending cannot authorize a new step',async t=>{
  const host=sdk(),original=host.request;
  host.store.set('webflow.recent.v1',[{clientRequestId:'webflow:unread-unknown',taskId:host.pins[0].taskId,
    version:host.pins[0].version,state:'unknown',retirementState:'unknown'}]);
  host.request=async function(name,args){if(name==='storage.get'&&args.key==='webflow.recent.v1')throw problem('E_STORAGE');
    return original.call(this,name,args);};
  const f=await mount(t,host);await f.click('脚本');assert.equal(f.find('运行',taskCard(f)).disabled,true);
  assert.equal(starts(host).length,0);assert.match(f.text(),/E_STORAGE/);
});

test('a recovered query merges against current stored history after a temporary initial read failure',async t=>{
  const host=sdk(),id='webflow:restore-with-history',original=host.request;let fail=true;
  const older={clientRequestId:'webflow:older-record',taskId:host.pins[0].taskId,
    version:host.pins[0].version,state:'completed',retirementState:'released'};
  host.store.set('webflow.pending.v1',{clientRequestId:id,taskId:host.pins[0].taskId,version:host.pins[0].version});
  host.store.set('webflow.recent.v1',[older]);
  host.request=async function(name,args){if(fail&&name==='storage.get'&&args.key==='webflow.recent.v1'){
    fail=false;throw problem('E_STORAGE');}return original.call(this,name,args);};
  host.read=async()=>complete(id);const f=await mount(t,host);await f.click('记录');await f.click('查询原请求');
  assert.ok(host.store.get('webflow.recent.v1').some(row=>row.clientRequestId===older.clientRequestId));
  assert.equal(starts(host).length,0);assert.ok(f.document.querySelector('pre'));
});
