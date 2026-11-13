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
const manifests=new Map(config.delegatedTasks.map(pin=>[pin.taskId,JSON.parse(readFileSync(
  new URL('../../../examples/tasks/'+pin.taskId+'.v1.opendesk-task.json',import.meta.url),'utf8')).manifest]));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const problem=code=>Object.assign(Error(code),{code});
function sdk(){
  const store=new Map(),calls=[],pins=config.delegatedTasks.map(p=>({...p,installationId:'install-'+p.taskId,generation:1}));
  const etag=key=>createHash('sha256').update(JSON.stringify(store.get(key)??null)).digest('hex');
  const api={store,calls,pins,page:{status:'available',url:'https://www.baidu.com/'},read:async id=>({clientRequestId:id,state:'unknown',semantic:'UNKNOWN'}),
    configure:()=>({opened:true}),stop:async id=>({clientRequestId:id,state:'stopping'}),
    async request(name,args){
      calls.push({name,args:structuredClone(args),inClick:api.inClick===true});
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
      if(name==='currentPage.info')return api.pageRead?api.pageRead():{...api.page};
      if(name==='tasks.read')return args.taskId?
        (api.taskRead?api.taskRead(args.taskId):{task:api.pins.find(p=>p.taskId===args.taskId),manifest:manifests.get(args.taskId),runtimeCurrent:true}):api.read(args.clientRequestId);
      if(name==='tasks.configure')return api.configure(args);
      if(name==='tasks.start')throw Error('Sandbox must never start a Task');
      if(name==='tasks.stop')return api.stop(args.clientRequestId);
      if(name==='tasks.open'||name==='tasks.configure')return {opened:true};
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
  const timers=new Map(),intervals=new Map();let timerId=0;
  const sdkTool={root:document.getElementById('root'),request:host.request.bind(host)};
  if(host.notify)sdkTool.ui={notify:host.notify};
  host.editStates=[];
  sdkTool.setState=value=>{host.editStates.push(structuredClone(value));return true;};
  if(host.withNavigation){
    host.navigation=[];
    sdkTool.navigationFeatures={headerActions:true,settingsPage:host.settingsFeature===true};
    sdkTool.setNavigation=value=>{host.navigation.push(value);return !(host.rejectHeaderActions&&'headerActions' in value);};
  }
  const context=vm.createContext({OpenDeskPageReact:runtime,OpenDeskTool:sdkTool,
    crypto:globalThis.crypto,URL,console,queueMicrotask,addEventListener(){},removeEventListener(){},
    setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},
    setInterval(fn){intervals.set(++timerId,fn);return timerId;},
    clearInterval(id){intervals.delete(id);}});
  await React.act(async()=>{vm.runInContext(source('model.js'),context);vm.runInContext(source('main.js'),context);});
  let closed=false;
  const close=async()=>{if(closed)return;closed=true;await React.act(async()=>roots.forEach(r=>r.unmount()));timers.clear();intervals.clear();};
  t.after(async()=>{await close();assert.deepEqual(errors,[]);assert.equal(starts(host).length,0,'consumer never executes or replays a Task');});
  const find=(label,scope=document)=>{
    // The compact UI uses descriptive accessible names for icon-only actions;
    // preserve legacy test intent without requiring the old visible text button.
    const found=[...scope.querySelectorAll('button')].filter(n=>{
      const name=n.getAttribute('aria-label')||'';
      return n.textContent===label||name===label||
        label==='运行'&&(name.startsWith('准备运行 ')||name.startsWith('无法运行 '))||
        label==='刷新'&&name==='刷新脚本安装状态';
    });
    assert.equal(found.length,1,'Unique visible control: '+label);return found[0];
  };
  const f={host,window,document,errors,close,find,text:()=>document.body.textContent,
    async click(label,scope){const node=find(label,scope);assert.equal(node.disabled,false,label+' enabled');
      await React.act(async()=>{host.inClick=true;
        try{node.dispatchEvent(new window.Event('click',{bubbles:true}));}finally{host.inClick=false;}});},
    async input(value,id='wf-search'){await React.act(async()=>{const node=document.getElementById(id);
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node),'value').set.call(node,value);
      node.dispatchEvent(new window.Event('input',{bubbles:true}));});},
    async tick(){await React.act(async()=>{const work=[...timers.values()];timers.clear();for(const fn of work)fn();});},
    async flush(fn=()=>{}){await React.act(async()=>{fn();});}
  };
  return f;
}

test('R1.5 Host settings gear navigates into Web Flow own webpage display switch',async t=>{
  const host=sdk();host.withNavigation=true;host.settingsFeature=true;
  const f=await mount(t,host);
  assert.equal(host.navigation.at(-1)?.settingsPage,'settings');
  assert.equal(host.navigation.at(-1)?.headerActions?.length,1,'do not duplicate the gear action');
  const event=new f.window.Event('opendesk-tool-navigation');
  event.detail={action:'settings',page:'settings'};
  await f.flush(()=>f.document.getElementById('root').dispatchEvent(event));
  assert.match(f.text(),/网页显示/);
  assert.match(f.text(),/显示网页辅助面板/);
  const slider=f.document.querySelector('.wf-switch-native input[role="switch"]');
  assert.ok(slider,'native accessible fallback when shared UI is unavailable in older runtime');
  assert.equal(slider.disabled,false);
  assert.equal(slider.checked,false);
  assert.equal(host.store.has('webflow.pagePanelVisible.v1'),false,'navigating never writes or dispatches');
  assert.equal(starts(host).length,0);
  assert.deepEqual(f.errors,[]);
});

test('older Host retains one preference header fallback without claiming settingsPage support',async t=>{
  const host=sdk();host.withNavigation=true;host.settingsFeature=false;
  const f=await mount(t,host);
  const current=host.navigation.at(-1);
  assert.equal(Object.hasOwn(current,'settingsPage'),false);
  assert.deepEqual(Array.from(current.headerActions,x=>x.id),['help','settings']);
  assert.equal(starts(host).length,0);
  assert.deepEqual(f.errors,[]);
});

test('script play and more menu request only the shared trusted Task sheet',async t=>{
  const host=sdk(),f=await mount(t,host);
  await f.click('脚本');
  const card=taskCard(f);
  await f.click('运行',card);
  assert.deepEqual(host.calls.filter(x=>x.name==='tasks.configure').map(x=>x.args),
    [{task:host.pins[0]}]);
  assert.equal(starts(host).length,0);
  assert.equal(host.store.has('webflow.pending.v1'),false);
  assert.equal(f.document.getElementById('wf-query'),null);
  assert.equal(f.document.getElementById('wf-show-execution-tab'),null);
  assert.equal(f.document.getElementById('task-parameters-sheet'),null,
    'the real trusted Sheet belongs to the parent React root, not the iframe');
  const title=manifests.get(host.pins[0].taskId).title;
  await f.click(title,card);
  assert.equal(card.querySelector('.wf-task-name').getAttribute('aria-expanded'),'true');
  assert.equal(host.calls.filter(x=>x.name==='tasks.configure').length,1,'details never configure or execute');
  await f.click('更多操作：'+title,card);
  await f.click('配置运行',card);
  assert.equal(host.calls.filter(x=>x.name==='tasks.configure').length,2);
  assert.equal(starts(host).length,0);
  assert.deepEqual(f.errors,[]);
});
// Removed sandbox runner scenarios -> existing shared-owner behavioral coverage:
// task-workbench.test.mjs (WB), task-run-preparation.test.mjs (PREP), and
// shared-task-run-sheet.test.mjs (CONSUMER); no new execution lives in this suite.
// "saved parameters release draft protection ..." / "unconfirmed parameter writes ..."
//   -> WB "shared sheet lost save acknowledgement ..." (query/cancel, no confirm).
// "the step ID is durably read back ... duplicate clicks ..."
//   -> WB "shared sheet opens ... freezes actual Schema params ... confirms once";
//      PREP "atomic preparation admission ... retries and new request IDs".
// "unchecking the execution tab ... false ... across reopen"
//   -> PREP "prepare validates actual params ... inspection restores prepared record"
//      (including boolean false); this file still validates both real task Schemas.
// "save failure ... runnable confirmation"
//   -> WB lost-save-ACK test + PREP "injected business recovery fence ... failures"
//      and "prepare validates actual params ..." (same-ID changed-input rejection).
// "saved confirmation survives tab navigation ... frozen input ... six-field installation"
//   -> WB installed schema/frozen version/params/target and per-task draft tests;
//      PREP "atomic identity rejects changed params ... installation ... binding".
// "reinstalled Task ... previously saved confirmation ..."
//   -> PREP "revocation, replacement version, environment and document changes ...".
// "querying a locally staged step ... local cancellation creates zero Runs"
//   -> PREP "a shared preparation blocks ... until explicit cancellation" + WB lost ACK.
// Local cancellation idempotency -> PREP cancellation tombstone test; the
// applicable failure/retry assertion remains below on legacy same-ID Stop.
// Legacy CAS conflict/mismatched-readback assertions also remain below on restoration.
// "preparation failure ... before a write and after lost save ACK"
//   -> PREP cancellation tombstone + WB lost-save-ACK tests.
// CONSUMER also covers direct configure, unsupported Host and duplicate clicks.
// Legacy AppStorage CAS/readback, read/stop races, UNKNOWN, Results and notices
// remain below; UI-only configure never substitutes for an Authority admission fence.
test('opening Web Flow recognizes the verified Baidu upgrade by its exact package identity',async t=>{
  const pkg=JSON.parse(readFileSync(new URL('../../../task-packs/baidu.search/releases/baidu.search.top3.v1.opendesk-task.json',import.meta.url),'utf8'));
  const host=sdk();
  host.pins[0]={taskId:pkg.manifest.taskId,version:pkg.manifest.version,
    manifestHash:pkg.manifestHash,contentHash:pkg.manifest.program.sourceHash,
    installationId:'install-'+pkg.manifest.taskId,generation:2};
  const f=await mount(t,host);
  assert.deepEqual(f.errors,[]);
  await f.click('脚本');
  assert.match(f.text(),/百度搜索/);
  assert.match(taskCard(f).textContent,/可手动运行/);
  // Details use installed manifest metadata; configuration retains the exact identity.
  await f.click(pkg.manifest.title,taskCard(f));
  assert.match(taskCard(f).textContent,/参数 3 项/);
  assert.ok(taskCard(f).textContent.includes(pkg.manifest.description));
  await f.click('运行',taskCard(f));
  assert.deepEqual(host.calls.find(c=>c.name==='tasks.configure').args,{task:host.pins[0]});
});

const starts=host=>host.calls.filter(c=>c.name==='tasks.start');
const taskCard=f=>[...f.document.querySelectorAll('article')].find(n=>n.textContent.includes('百度搜索'));
// Legacy fixtures represent already-existing requests, never new sandbox admission.
function legacy(host,id='webflow:original'){
  const task=host.pins[0];
  host.store.set('webflow.pending.v1',{clientRequestId:id,taskId:task.taskId,version:task.version,
    task:{...task},params:{query:'Original query',limit:3,showExecutionTab:false},at:100});
  return id;
}
async function recover(t,host=sdk()){
  const id=legacy(host),f=await mount(t,host);
  await f.click('记录');return {host,id,f};
}
const complete=(id,retirementState='released')=>({clientRequestId:id,runId:'run-original',resultId:'result-original',
  state:'completed',retirementState,value:{status:'success',results:[{title:'真实 SDK 回包内容',url:'https://example.com/'}],count:1},
  result:{tag:'controller-result',runId:'run-original',resultId:'result-original',state:'completed',outcome:{ok:true}}});

test('overview shows normal state and verified counts without development actions',async t=>{
  const host=sdk(),f=await mount(t,host);
  assert.match(f.text(),/当前没有待处理异常/);
  assert.match(f.text(),/固定脚本共 2 个/);
  assert.deepEqual([...f.document.querySelectorAll('.wf-metrics>span')].map(n=>n.textContent),
    ['已安装 2','可运行 2','需检查 0']);
  assert.doesNotMatch(f.text(),/Markdown 两任务|自动执行接线|打开 MD 任务队列/);
  assert.equal(host.calls.some(c=>c.name==='storage.set'),false);
});

test('overview clears the review reminder after the original request is released without losing its details',async t=>{
  const host=sdk(),id=legacy(host);host.read=async()=>complete(id);
  const f=await mount(t,host);
  await f.click('查看记录');await f.click('查询原请求');
  assert.equal(host.store.get('webflow.pending.v1'),null);
  await f.click('概览');
  assert.match(f.text(),/当前没有待处理异常/);
  assert.doesNotMatch(f.text(),/有一项运行需要核对|上次运行结果尚未确认|webflow:/);
  await f.click('记录');
  assert.match(f.text(),/run-original/);assert.match(f.text(),/result-original/);
  assert.ok(f.document.querySelector('pre'));
  assert.equal(starts(host).length,0);
});

test('overview does not claim a healthy recovery state when stored requests cannot be read safely',async t=>{
  for(const failure of ['unreadable','malformed']){
    const host=sdk();
    if(failure==='unreadable')host.beforeGet=async args=>{
      if(args.key==='webflow.pending.v1')throw problem('E_STORAGE');
    };
    else host.store.set('webflow.pending.v1',{clientRequestId:'webflow:invalid',taskId:'unapproved'});
    const before=structuredClone([...host.store]),f=await mount(t,host);
    assert.match(f.text(),/运行记录尚未核对/);
    assert.doesNotMatch(f.text(),/当前没有待处理异常/);
    await f.click('查看记录');
    assert.equal(f.document.querySelector('main').getAttribute('aria-label'),'记录');
    assert.deepEqual([...host.store],before);
    assert.equal(host.calls.some(c=>c.name==='storage.set'||c.name==='tasks.configure'||
      c.name==='tasks.read'&&c.args.clientRequestId),false);
    await f.close();
  }
});

test('overview separates missing and installed runtime failures and links to scripts',async t=>{
  const host=sdk();
  host.taskRead=async id=>{
    if(id===host.pins[0].taskId)throw problem('E_TASK_NOT_INSTALLED');
    return {task:host.pins[1],manifest:manifests.get(id),runtimeCurrent:false};
  };
  const f=await mount(t,host);
  assert.match(f.text(),/有 2 个脚本需要检查/);
  assert.deepEqual([...f.document.querySelectorAll('.wf-metrics>span')].map(n=>n.textContent),
    ['已安装 1','可运行 0','需检查 2']);
  await f.click('查看脚本');
  assert.equal(f.document.querySelector('main').getAttribute('aria-label'),'脚本');
  assert.match(f.text(),/尚未安装/);assert.match(f.text(),/待重新验证/);
  assert.equal(host.calls.some(c=>['storage.set','tasks.configure'].includes(c.name)),false);
});

test('unreadable installation is not reported as zero installed or as the fixed script count',async t=>{
  for(const mixed of [false,true]){
    const host=sdk();host.taskRead=async id=>{
      if(mixed&&id===host.pins[1].taskId)return {task:host.pins[1]};
      throw problem('E_PERMISSION');
    };
    const f=await mount(t,host);
    assert.deepEqual([...f.document.querySelectorAll('.wf-metrics>span')].map(n=>n.textContent),
      ['已安装 待核对','可运行 '+(mixed?1:0),'需检查 '+(mixed?1:2)]);
    await f.close();
  }
});

test('overview keeps original request evidence on records only without querying, replaying or writing data',async t=>{
  const host=sdk(),id=legacy(host,'webflow:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  host.taskRead=async taskId=>({task:host.pins.find(p=>p.taskId===taskId),
    manifest:manifests.get(taskId),runtimeCurrent:false});
  host.store.set('webflow.recent.v1',[{clientRequestId:id,taskId:host.pins[0].taskId,
    version:host.pins[0].version,state:'unknown',retirementState:'held',at:100}]);
  const before=structuredClone([...host.store]);
  const f=await mount(t,host);
  assert.match(f.text(),/有一项运行需要核对/);
  assert.match(f.text(),/上次运行结果尚未确认，不会自动重新执行/);
  assert.doesNotMatch(f.text(),/webflow:|clientRequestId|Markdown 两任务|自动执行接线/);
  assert.equal(f.document.querySelector('.wf-record-details'),null,'home activity is summary only');
  await f.click('查看记录');
  assert.equal(f.document.querySelector('main').getAttribute('aria-label'),'记录');
  assert.match(f.text(),new RegExp(id));
  assert.ok(f.find('查询原请求'));assert.ok(f.find('停止原请求'));
  await f.click('概览');
  await f.click('查看记录：百度搜索 · 前三条自然结果');
  assert.equal(f.document.querySelector('main').getAttribute('aria-label'),'记录');
  await f.tick();
  assert.deepEqual([...host.store],before);
  assert.equal(host.calls.some(c=>c.name==='storage.set'||c.name==='tasks.configure'||
    c.name==='tasks.stop'||c.name==='tasks.read'&&c.args.clientRequestId),false);
});

test('home activity navigates to complete record details while preserving settled history',async t=>{
  const host=sdk(),id='webflow:settled-history';
  host.store.set('webflow.recent.v1',[{clientRequestId:id,taskId:host.pins[0].taskId,
    version:host.pins[0].version,state:'completed',retirementState:'released',
    runId:'historical-run',resultId:'historical-result',at:100}]);
  const before=structuredClone([...host.store]);
  const f=await mount(t,host);
  assert.match(f.text(),/当前没有待处理异常/);assert.doesNotMatch(f.text(),/webflow:|historical-run|historical-result/);
  await f.click('查看记录：百度搜索 · 前三条自然结果');
  assert.equal(f.document.querySelectorAll('.wf-record-details').length,1);
  assert.match(f.document.querySelector('.wf-record-expanded').textContent,/historical-run/);
  assert.match(f.document.querySelector('.wf-record-expanded').textContent,/historical-result/);
  assert.match(f.text(),new RegExp(id));
  assert.ok(f.find('查询原请求（只读）'));
  assert.deepEqual([...host.store],before);
  assert.equal(host.calls.some(c=>c.name==='storage.set'||c.name==='tasks.read'&&c.args.clientRequestId),false);
});

test('trusted page-change notifications recheck eligibility without executing a task',async t=>{
  const host=sdk(),f=await mount(t,host);
  await f.click('脚本');
  assert.equal(f.find('运行',taskCard(f)).disabled,false);
  host.page={status:'available',url:'https://www.google.com/'};
  await f.flush(()=>f.document.getElementById('root').dispatchEvent(
    new f.window.Event('opendesk-page-changed')));
  assert.equal(f.find('运行',taskCard(f)).disabled,false);
  host.page={status:'available',url:'https://www.baidu.com/'};
  await f.flush(()=>f.document.getElementById('root').dispatchEvent(
    new f.window.Event('opendesk-page-changed')));
  assert.equal(f.find('运行',taskCard(f)).disabled,false);
  assert.equal(starts(host).length,0);
  assert.ok(host.calls.filter(call=>call.name==='currentPage.info').length>=3);
});
test('missing fixed task is unavailable rather than a changed hash',async t=>{
  const host=sdk();host.pins=host.pins.filter(pin=>pin.taskId!=='baidu.search.top3');
  const f=await mount(t,host);await f.click('脚本');
  assert.match(taskCard(f).textContent,/任务不可用/);
  assert.match(taskCard(f).textContent,/未读取到有效的任务安装/);
  assert.equal(f.find('运行',taskCard(f)).disabled,true);
  assert.equal(starts(host).length,0);
});
test('uninstalled or disabled task has a readable recovery path, manifest details and a read-only refresh',async t=>{
  const host=sdk();
  host.taskRead=async id=>{
    if(id==='baidu.search.top3')throw Object.assign(Error('Task is disabled or not installed'),{code:'E_PERMISSION'});
    return {task:host.pins[1]};
  };
  const f=await mount(t,host);await f.click('脚本');
  assert.match(taskCard(f).textContent,/此任务尚未安装或已停用/);
  assert.match(taskCard(f).textContent,/“我的”.*安装或恢复.*刷新/);
  assert.ok(!taskCard(f).textContent.includes('Task is disabled or not installed'));
  assert.equal(f.find('运行',taskCard(f)).disabled,true);
  await f.click('更多操作：百度搜索 · 前三条自然结果',taskCard(f));
  assert.ok(!taskCard(f).textContent.includes('宿主管理'),'SDK cannot open an unavailable task');
  await f.click('查看详情',taskCard(f));
  assert.doesNotMatch(taskCard(f).textContent,/Task is disabled or not installed/);
  assert.match(taskCard(f).textContent,/任务说明待核对/);
  const pending=deferred();host.taskRead=id=>id==='baidu.search.top3'?pending.promise:{task:host.pins[1]};
  await f.click('刷新');
  assert.ok(!taskCard(f).textContent.includes('此任务尚未安装或已停用'),'refresh clears the previous failure');
  assert.equal(f.find('运行',taskCard(f)).disabled,true);
  await f.flush(()=>pending.resolve({task:host.pins[0]}));
  assert.match(taskCard(f).textContent,/可手动运行/);
  assert.equal(f.find('运行',taskCard(f)).disabled,false);
  assert.ok(!taskCard(f).textContent.includes('E_PERMISSION'));
  assert.equal(starts(host).length,0,'metadata recovery never dispatches or replays a task');
  assert.ok(host.calls.every(call=>['storage.get','currentPage.info','tasks.read'].includes(call.name)));
});
test('permission denial and unreadable metadata are not misreported as a missing task',async t=>{
  for(const code of ['E_PERMISSION','E_OWNER','E_TOOL_DISABLED','E_NETWORK']){
    const host=sdk();host.taskRead=async()=>{throw Object.assign(Error('internal transport failure'),{code});};
    const f=await mount(t,host);await f.click('脚本');
    assert.equal(f.find('运行',taskCard(f)).disabled,true);
    assert.ok(!taskCard(f).textContent.includes('尚未安装或已停用'));
    assert.ok(!taskCard(f).textContent.includes('internal transport failure'));
    await f.click('百度搜索 · 前三条自然结果',taskCard(f));
    assert.doesNotMatch(taskCard(f).textContent,/internal transport failure/);
    assert.match(taskCard(f).textContent,/任务说明待核对/);
    assert.equal(starts(host).length,0);await f.close();
  }
});
test('Authority installation states expose recovery without pretending to run or re-enable',async t=>{
  for(const [code,label,action] of [
    ['E_TASK_REMOVED','已卸载','打开安装审阅'],
    ['E_TASK_NOT_INSTALLED','尚未安装','打开安装审阅'],
    ['E_TASK_DISABLED','已停用','打开任务管理'],
    ['E_TASK_INITIALIZATION','初始化失败','打开安装审阅'],
    ['E_BUILTIN_VERSION_UNAVAILABLE','待重新验证','打开任务管理']
  ]){
    const host=sdk();host.taskRead=async id=>{
      if(id==='baidu.search.top3')throw Object.assign(Error('exact storage diagnostic'),{code});
      return {task:host.pins[1]};
    };
    const f=await mount(t,host);await f.click('脚本');
    const card=taskCard(f);
    assert.match(card.textContent,new RegExp(label));
    assert.equal(f.find('运行',card).disabled,true);
    assert.ok(!card.textContent.includes('exact storage diagnostic'));
    await f.click(action,card);
    assert.deepEqual(host.calls.filter(c=>c.name==='tasks.open').map(c=>c.args),[{taskId:'baidu.search.top3'}]);
    assert.equal(starts(host).length,0);
    await f.click('概览');assert.match(f.text(),/有 1 个脚本需要检查/);
    await f.close();
  }
});
test('runtime mismatch explains recovery, stays in attention and only becomes runnable after an authoritative refresh',async t=>{
  const host=sdk();let stale=true;
  host.taskRead=async id=>{
    if(id==='baidu.search.top3'&&stale)throw Object.assign(Error('stale runtime identity'),{code:'E_BUILTIN_VERSION_UNAVAILABLE'});
    return {task:host.pins.find(pin=>pin.taskId===id)};
  };
  const f=await mount(t,host);await f.click('脚本');
  assert.match(taskCard(f).textContent,/运行时已更新.*同一固定任务包重新验证并确认安装/);
  assert.doesNotMatch(taskCard(f).textContent,/读取失败|任务状态读取失败/);
  assert.equal(f.find('运行',taskCard(f)).disabled,true);
  await f.click('筛选脚本');await f.click('需处理');
  assert.equal(f.document.querySelectorAll('article').length,1);
  await f.click('打开任务管理',taskCard(f));
  assert.deepEqual(host.calls.filter(c=>c.name==='tasks.open').map(c=>c.args),[{taskId:'baidu.search.top3'}]);
  await f.click('刷新');assert.match(taskCard(f).textContent,/待重新验证/);
  stale=false;await f.click('刷新');
  assert.match(f.text(),/没有匹配的固定任务/);
  await f.click('清除筛选');
  assert.match(taskCard(f).textContent,/可手动运行/);
  assert.equal(f.find('运行',taskCard(f)).disabled,false);
  assert.equal(starts(host).length,0,'opening recovery and refreshing never submits or replays a task');
});
test('retrying failed initialization re-reads Authority and never submits a task',async t=>{
  const host=sdk();let unavailable=true;
  host.taskRead=async id=>{
    if(unavailable)throw Object.assign(Error('initial storage failure'),{code:'E_TASK_INITIALIZATION'});
    return {task:host.pins.find(p=>p.taskId===id)};
  };
  const f=await mount(t,host);await f.click('脚本');
  assert.equal(f.find('运行',taskCard(f)).disabled,true);
  unavailable=false;await f.click('重试初始化',taskCard(f));
  assert.match(taskCard(f).textContent,/可手动运行/);
  assert.equal(f.find('运行',taskCard(f)).disabled,false);
  assert.equal(starts(host).length,0);
  assert.equal(host.calls.filter(c=>c.name==='tasks.open').length,0);
});
const pageChanged=f=>f.document.getElementById('root').dispatchEvent(new f.window.Event('opendesk-page-changed'));
test('page rechecks never gate UI-only configuration or authorize execution',async t=>{
  const host=sdk(),f=await mount(t,host);await f.click('脚本');
  const pending=deferred();host.pageRead=()=>pending.promise;
  await f.flush(()=>pageChanged(f));
  await f.click('运行',taskCard(f));
  assert.deepEqual(host.calls.find(c=>c.name==='tasks.configure').args,{task:host.pins[0]});
  await f.flush(()=>pending.resolve({status:'unavailable'}));
  host.pageRead=async()=>{throw problem('E_PERMISSION');};
  await f.flush(()=>pageChanged(f));
  await f.click('运行',taskCard(f));
  assert.equal(host.calls.filter(c=>c.name==='tasks.configure').length,2);
  assert.equal(host.calls.some(c=>c.name==='storage.set'),false);
});

test('page event payload cannot grant permission and a late closed-page read cannot alter its replacement',async t=>{
  const host=sdk(),late=deferred();let f=await mount(t,host);await f.click('脚本');
  host.pageRead=()=>late.promise;
  await f.flush(()=>{
    const event=new f.window.Event('opendesk-page-changed');
    event.detail={status:'available',url:'https://www.baidu.com/'};
    f.document.getElementById('root').dispatchEvent(event);
  });
  assert.equal(f.find('运行',taskCard(f)).disabled,false);
  await f.close();host.pageRead=null;host.page={status:'unavailable'};
  f=await mount(t,host);await f.click('脚本');
  const before=host.calls.length;
  await f.flush(()=>late.resolve({status:'available',url:'https://www.baidu.com/'}));
  assert.equal(f.find('运行',taskCard(f)).disabled,false);
  assert.equal(host.calls.length,before);
  assert.deepEqual(f.errors,[]);
});
test('configuration requires a complete fixed installation and refresh invalidates stale pins',async t=>{
  const host=sdk(),f=await mount(t,host);await f.click('脚本');
  const pending=deferred();host.taskRead=id=>id===host.pins[0].taskId?pending.promise:{task:host.pins[1]};
  await f.click('刷新');assert.equal(f.find('运行',taskCard(f)).disabled,true);
  await f.flush(()=>pending.resolve({task:{...host.pins[0],installationId:''}}));
  assert.equal(f.find('运行',taskCard(f)).disabled,true);
  assert.match(taskCard(f).textContent,/任务不可用/);
  host.taskRead=null;host.pins[0]={...host.pins[0],version:'99.0.0'};
  await f.click('刷新');assert.match(taskCard(f).textContent,/固定版本不匹配/);
  assert.equal(host.calls.some(c=>c.name==='tasks.configure'),false);
});

test('compact filter preserves the preview sort affordance',async t=>{
  const f=await mount(t);await f.click('脚本');await f.click('筛选脚本');
  assert.equal(f.document.querySelector('select[aria-label="脚本排序方式"]')?.value,'favorite');
});
test('view-only search and drawer opening keep the sandbox clean and retain search',async t=>{
  const host=sdk(),f=await mount(t,host);await f.click('脚本');
  const before=host.editStates.length;await f.input('百度','wf-search');
  assert.ok(host.editStates.length>before);
  assert.deepEqual(host.editStates.at(-1),{dirty:false,busy:false});
  await f.click('运行',taskCard(f));
  assert.deepEqual(host.editStates.at(-1),{dirty:false,busy:false});
  await f.click('概览');await f.click('脚本');
  assert.equal(f.document.getElementById('wf-search').value,'百度');
  assert.equal(f.document.getElementById('wf-query'),null);
  assert.equal(host.store.has('webflow.pending.v1'),false);
});

test('preference writes stay protected until confirmed, and failures cannot be cleared by search',async t=>{
  for(const failure of [false,'write','readback']){
    const host=sdk(),f=await mount(t,host),readback=deferred();await f.click('脚本');
    host.beforeGet=args=>args.key==='webflow.settings.v1'&&!args.withEtag?readback.promise:undefined;
    host.failSave=failure==='write';
    if(failure==='readback')host.afterSet=({key})=>host.store.set(key,{theme:'dark',favorites:[]});
    await f.click('收藏 '+manifests.get(host.pins[0].taskId).title,taskCard(f));
    if(failure!=='write')assert.deepEqual(host.editStates.at(-1),{dirty:true,busy:true});
    await f.flush(()=>readback.resolve());
    assert.deepEqual(host.editStates.at(-1),{dirty:Boolean(failure),busy:false});
    await f.input('百度','wf-search');
    assert.deepEqual(host.editStates.at(-1),{dirty:Boolean(failure),busy:false});
    if(failure)assert.match(f.text(),/偏好未确认保存/);
    else assert.match(f.text(),/偏好已保存并读回/);
    if(failure){
      host.failSave=false;host.afterSet=null;host.beforeGet=null;
      await f.click('收藏 '+manifests.get(host.pins[0].taskId).title,taskCard(f));
      assert.deepEqual(host.editStates.at(-1),{dirty:false,busy:false},'a confirmed retry releases the failed preference edit');
    }
    assert.equal(starts(host).length,0);await f.close();
  }
});
test('storage readback may reorder object fields without losing saved favorites or the original step',async t=>{
  const host=sdk(),id=legacy(host);
  const reordered=value=>Array.isArray(value)?value.map(reordered):value&&typeof value==='object'?
    Object.fromEntries(Object.keys(value).sort().map(key=>[key,reordered(value[key])])):value;
  host.afterSet=({key,value})=>host.store.set(key,reordered(value));
  const f=await mount(t,host);await f.click('脚本');
  await f.click('收藏 '+manifests.get(host.pins[0].taskId).title,taskCard(f));
  assert.equal(f.find('取消收藏 '+manifests.get(host.pins[0].taskId).title,taskCard(f)).getAttribute('aria-pressed'),'true');
  assert.match(f.text(),/偏好已保存并读回/);
  assert.ok(!f.text().includes('保存后读回不一致'));
  host.read=async()=>complete(id);await f.click('记录');await f.click('查询原请求');
  assert.equal(host.store.get('webflow.pending.v1'),null);
  assert.ok(f.document.querySelector('pre'));
  assert.equal(starts(host).length,0,'saving preferences or a step never dispatches');
});
test('changed values, fields, types and array order still fail preference readback',async t=>{
  for(const mutate of [value=>({...value,favorites:[]}),value=>({...value,extra:true}),
    value=>({favorites:value.favorites}),value=>({...value,theme:1}),
    value=>({...value,favorites:[...value.favorites].reverse()})]){
    const host=sdk();host.store.set('webflow.settings.v1',{theme:'system',favorites:[
      ['taskId','version','manifestHash','contentHash'].map(key=>config.delegatedTasks[1][key]).join('|')]});
    host.afterSet=({key,value})=>{if(key==='webflow.settings.v1')host.store.set(key,mutate(value));};
    const f=await mount(t,host);await f.click('脚本');
    await f.click('收藏 '+manifests.get(host.pins[0].taskId).title,taskCard(f));
    assert.match(f.text(),/偏好未确认保存：保存后读回不一致/);
    assert.equal(f.find('收藏 '+manifests.get(host.pins[0].taskId).title,taskCard(f)).getAttribute('aria-pressed'),'false');
    assert.equal(starts(host).length,0);await f.close();
  }
});
test('compact overview retains three tabs, on-demand help and no duplicate navigation',async t=>{
  const host=sdk(),f=await mount(t,host);
  assert.equal(f.document.querySelectorAll('.wf-head').length,1,'one sandbox tab strip, no duplicate product header');
  assert.equal(f.document.querySelectorAll('.wf-history').length,0,'no synthetic history');
  assert.ok(!f.text().includes('快速开始')&&!f.text().includes('查看可用脚本'));
  await f.click('脚本');
  assert.equal(f.document.querySelector('[data-page="scripts"]').getAttribute('aria-selected'),'true');
  assert.ok(taskCard(f));
  assert.equal(f.document.querySelectorAll('.wf-task-row').length,2);
  await f.click('概览');await f.click('帮助');
  assert.equal(f.document.querySelector('main h2').textContent,'使用与排障');
  const keyboardTabs=()=>[...f.document.querySelectorAll('[role="tab"]')].filter(tab=>tab.getAttribute('tabindex')==='0');
  assert.equal(keyboardTabs().length,1,'help retains one keyboard entry into primary navigation');
  assert.equal(keyboardTabs()[0].getAttribute('data-page'),'overview');
  await f.click('应用偏好');
  assert.equal(keyboardTabs().length,1,'settings retains one keyboard entry into primary navigation');
  await f.click('返回');
  assert.equal(f.document.querySelector('[data-page="overview"]').getAttribute('aria-selected'),'true');
  assert.equal(starts(host).length,0);
  assert.equal(host.store.has('webflow.pending.v1'),false);
  assert.deepEqual([...new Set(host.calls.map(c=>c.name))].sort(),['currentPage.info','storage.get','tasks.read']);
});

test('compact filter and icon actions preserve real task scope and favorites',async t=>{
  const host=sdk(),f=await mount(t,host);
  await f.click('脚本');
  const rows=()=>[...f.document.querySelectorAll('.wf-task-row')];
  assert.equal(rows().length,2);
  const baidu=taskCard(f);
  const favorite=[...baidu.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('收藏 '));
  assert.ok(favorite,'favorite has a meaningful accessible name');
  await React.act(async()=>favorite.dispatchEvent(new f.document.defaultView.Event('click',{bubbles:true})));
  assert.equal(f.document.querySelectorAll('.wf-task-row').length,2,'favoriting does not navigate');
  await f.click('筛选脚本');
  assert.ok(f.document.getElementById('wf-filter-options'));
  await f.click('收藏',f.document.getElementById('wf-filter-options'));
  assert.equal(rows().length,1,'favorites come from saved preferences');
  assert.ok(rows()[0].textContent.includes('百度搜索'));
  await f.click('筛选脚本');await f.click('全部',f.document.getElementById('wf-filter-options'));
  assert.equal(rows().length,2);
  const google=rows().find(row=>row.textContent.toLowerCase().includes('google'));
  const googleRun=[...google.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('准备运行 '));
  assert.equal(googleRun?.disabled,false,'configuration does not require the current website');
  await f.click('运行',google);
  assert.deepEqual(host.calls.find(c=>c.name==='tasks.configure').args,{task:host.pins[1]});
  assert.equal(starts(host).length,0,'UI controls cannot dispatch a Task');
});

test('help and settings use Host header icons and return to the original tab',async t=>{
  const host=sdk();host.withNavigation=true;
  const f=await mount(t,host);
  assert.ok(host.navigation.length>0);
  assert.equal(host.navigation.at(-1).page,'home');
  assert.deepEqual(Array.from(host.navigation.at(-1).headerActions,a=>[a.id,a.label,a.icon]),
    [['help','帮助','diagnostics'],['settings','应用偏好','settings']]);
  assert.equal(f.document.querySelector('.wf-head-actions'),null,'no duplicate content controls');
  const dispatch=async detail=>React.act(async()=>{
    const event=new f.document.defaultView.Event('opendesk-tool-navigation',{bubbles:true});
    event.detail=detail;
    f.document.getElementById('root').dispatchEvent(event);
  });
  await f.click('脚本');
  await dispatch({action:'header',actionId:'help',page:'settings'});
  assert.equal(f.document.querySelector('[data-page="scripts"]').getAttribute('aria-selected'),'true',
    'stale page actions cannot navigate');
  await dispatch({action:'header',actionId:'help',page:'home'});
  assert.equal(f.document.querySelector('main h2').textContent,'使用与排障');
  assert.equal(host.navigation.at(-1).page,'help');
  assert.equal(f.document.querySelectorAll('main .wf-panel').length,4,'all original help topics are expanded');
  assert.equal([...f.document.querySelectorAll('button')].some(b=>b.textContent==='返回'),false,
    'Host retains the only back control');
  await dispatch({action:'header',actionId:'settings',page:'help'});
  assert.equal(f.document.querySelector('main h2'),null,'Host owns the settings title');
  assert.equal(f.document.querySelector('main h3').textContent,'网页显示');
  assert.equal(host.navigation.at(-1).page,'settings');
  assert.equal(host.navigation.at(-1).title,'Web Flow 设置');
  assert.equal(f.document.querySelector('main select').querySelectorAll('option').length,3,'theme choices retained');
  assert.equal(f.document.querySelector('main details'),null,'settings sections need no second expansion');
  assert.match(f.text(),/开发与安装/);
  assert.match(f.text(),/未来的多步骤流程/);
  await dispatch({action:'back'});
  assert.equal(f.document.querySelector('[data-page="scripts"]').getAttribute('aria-selected'),'true');
  assert.equal(host.navigation.at(-1).page,'home');
  assert.ok(host.navigation.every(state=>state.headerActions?.length===2));
  assert.equal(starts(host).length,0);
});

test('rejected Host header projection retains content controls and base navigation',async t=>{
  const host=sdk();host.withNavigation=true;host.rejectHeaderActions=true;
  const f=await mount(t,host);
  assert.ok('headerActions' in host.navigation.at(-2));
  assert.equal('headerActions' in host.navigation.at(-1),false);
  assert.equal(f.document.querySelectorAll('.wf-head-actions button').length,2);
  await f.click('帮助');
  assert.equal(f.document.querySelector('main h2').textContent,'使用与排障');
  const event=new f.window.Event('opendesk-tool-navigation',{bubbles:true});
  event.detail={action:'header',actionId:'settings',page:'help'};
  await f.flush(()=>f.document.getElementById('root').dispatchEvent(event));
  assert.equal(f.document.querySelector('main h2').textContent,'使用与排障','rejected actions ignored');
  assert.equal(starts(host).length,0);
});

test('close and recreate the React root restores the original record and queries real SDK data only',async t=>{
  const host=sdk(),id=legacy(host);
  let f=await mount(t,host);
  await f.close();host.read=async()=>complete(id);
  f=await mount(t,host);await f.click('记录');
  assert.ok(f.text().includes(id));assert.equal(f.document.querySelector('pre'),null,'storage summary cannot disclose a result');
  await f.click('查询原请求');
  assert.equal(starts(host).length,0);assert.match(f.text(),/run-original/);assert.match(f.text(),/result-original/);
  assert.match(f.document.querySelector('pre')?.textContent||'',/真实 SDK 回包内容/);
  assert.equal(host.store.get('webflow.pending.v1'),null);
});

test('timeout, missing record and UNKNOWN retain the original ID across reopen and UI-only configuration',async t=>{
  for(const reply of ['timeout','missing','unknown']){
    const host=sdk(),id=legacy(host);
    host.read=async()=>{if(reply==='timeout')throw problem('E_TIMEOUT');
      return reply==='missing'?null:{clientRequestId:id,state:'unknown',semantic:'UNKNOWN'};};
    let f=await mount(t,host);await f.click('记录');await f.click('查询原请求');
    assert.ok(f.text().includes(id));assert.equal(f.document.querySelector('pre'),null);await f.close();
    f=await mount(t,host);await f.click('记录');await f.click('查询原请求');await f.tick();
    const pending=structuredClone(host.store.get('webflow.pending.v1'));
    await f.click('脚本');await f.click('运行',taskCard(f));
    assert.deepEqual(host.store.get('webflow.pending.v1'),pending);
    assert.equal(pending.clientRequestId,id);
    assert.ok(host.calls.filter(c=>c.name==='tasks.read'&&c.args.clientRequestId).every(c=>c.args.clientRequestId===id));
    assert.equal(starts(host).length,0);await f.close();
  }
});

test('Stop supersedes a pending legacy read and ignores its late callback',async t=>{
  const host=sdk(),read=deferred();host.read=()=>read.promise;
  const {f,id}=await recover(t,host);await f.click('查询原请求');await f.click('停止原请求');
  await f.flush(()=>{read.resolve(complete(id));});
  assert.equal(f.document.querySelector('pre'),null);assert.match(f.text(),/stopping|正在停止/);
  assert.equal(host.store.get('webflow.pending.v1').clientRequestId,id);assert.equal(starts(host).length,0);
});

test('completed Result while retirement is held stays visible but cannot start B or a new step',async t=>{
  const host=sdk();host.read=async id=>complete(id,'retiring');
  const {f,id}=await recover(t,host);await f.click('查询原请求');
  assert.match(f.text(),/retiring/);assert.match(f.document.querySelector('pre')?.textContent||'',/真实 SDK/);
  assert.equal(host.store.get('webflow.pending.v1').clientRequestId,id);
  await f.click('脚本');await f.click('运行',taskCard(f));
  assert.equal(host.calls.filter(c=>c.name==='tasks.configure').length,1);
  assert.equal(starts(host).length,0);await f.tick();assert.equal(starts(host).length,0);
});

test('revoked read clears previously displayed authoritative data and leaves recovery fenced',async t=>{
  const host=sdk();host.read=async id=>complete(id,'retiring');
  const {f,id}=await recover(t,host);await f.click('查询原请求');
  assert.ok(f.document.querySelector('pre'));
  host.read=async()=>{throw problem('E_PERMISSION');};await f.click('查询原请求');
  assert.equal(f.document.querySelector('pre'),null);assert.match(f.text(),/E_PERMISSION/);
  assert.equal(starts(host).length,0);assert.ok(host.store.get('webflow.pending.v1'));
});

test('malformed legacy locator is reported and retained across UI-only configuration',async t=>{
  const host=sdk();host.store.set('webflow.pending.v1',{clientRequestId:'bad/id',taskId:'baidu.search.top3'});
  const f=await mount(t,host);await f.click('脚本');assert.equal(f.find('运行',taskCard(f)).disabled,false);
  assert.match(f.text(),/原步骤恢复记录损坏/);
  const pending=structuredClone(host.store.get('webflow.pending.v1'));
  await f.click('运行',taskCard(f));
  assert.deepEqual(host.store.get('webflow.pending.v1'),pending);
  assert.equal(host.calls.filter(c=>c.name==='tasks.configure').length,1);
  assert.equal(starts(host).length,0);
});

test('legacy UNKNOWN summary restores a query-only locator and never renders stored result bodies',async t=>{
  const host=sdk();host.store.set('webflow.recent.v1',[{clientRequestId:'webflow:legacy',
    taskId:host.pins[0].taskId,version:host.pins[0].version,state:'unknown',retirementState:'unknown',
    resultPersisted:true,value:{secret:'untrusted summary'},result:complete('webflow:legacy').result}]);
  const f=await mount(t,host);await f.click('脚本');assert.equal(f.find('运行',taskCard(f)).disabled,false);
  await f.click('记录');await f.click('查询原请求');
  assert.equal(host.store.get('webflow.pending.v1').clientRequestId,'webflow:legacy');
  assert.equal(starts(host).length,0);assert.equal(f.document.querySelector('pre'),null);
  assert.ok(!f.text().includes('untrusted summary'));
});

test('failed and stopped durable Results are displayed and release only with retirement acknowledgement',async t=>{
  for(const state of ['failed','stopped']){
    const host=sdk();let retirementState='retiring';
    host.read=async id=>({...complete(id,retirementState),state,value:null,
      result:{...complete(id).result,state,outcome:{ok:false,error:{code:'E_CANCELLED'}}}});
    const {f,id}=await recover(t,host);await f.click('查询原请求');
    assert.match(f.document.querySelector('pre')?.textContent||'',/E_CANCELLED/);
    assert.equal(host.store.get('webflow.pending.v1').clientRequestId,id);
    retirementState='released';await f.click('查询原请求');
    assert.equal(host.store.get('webflow.pending.v1'),null);assert.equal(starts(host).length,0);await f.close();
  }
});

test('mismatching original request or Result IDs cannot disclose data or remove the pending fence',async t=>{
  const host=sdk();host.read=async id=>({...complete(id),clientRequestId:'other-request'});
  const {f,id}=await recover(t,host);await f.click('查询原请求');
  assert.equal(f.document.querySelector('pre'),null);assert.ok(host.store.get('webflow.pending.v1'));
  host.read=async()=>({...complete(id),result:{...complete(id).result,resultId:'other-result'}});
  await f.click('查询原请求');assert.equal(f.document.querySelector('pre'),null);
  assert.ok(host.store.get('webflow.pending.v1'));assert.equal(starts(host).length,0);
});

test('late callbacks from a closed UI cannot disclose into its replacement',async t=>{
  const host=sdk(),ack=deferred(),id=legacy(host);host.read=()=>ack.promise;
  let f=await mount(t,host);await f.click('记录');await f.click('查询原请求');await f.close();
  f=await mount(t,host);await f.click('记录');await f.flush(()=>ack.resolve(complete(id)));
  assert.equal(f.document.querySelector('pre'),null);assert.ok(f.text().includes(id));assert.equal(starts(host).length,0);
});

test('late Stop ACK cannot overwrite a newer observation of the original released request',async t=>{
  const host=sdk(),lateStop=deferred();host.stop=()=>lateStop.promise;
  const {f,id}=await recover(t,host);
  await f.click('停止原请求');host.read=async()=>complete(id);await f.click('查询原请求');
  await f.flush(()=>lateStop.resolve({clientRequestId:id,state:'stopped'}));
  assert.match(f.document.querySelector('pre')?.textContent||'',/真实 SDK/);
  assert.match(f.text(),/阶段：执行完成/);
  assert.equal(host.store.get('webflow.pending.v1'),null);
  assert.deepEqual(host.calls.find(c=>c.name==='tasks.stop').args,{clientRequestId:id});
});

test('pending storage read failure reports recovery trouble without blocking UI-only configuration',async t=>{
  const host=sdk(),original=host.request;host.request=async function(name,args){
    if(name==='storage.get'&&args.key==='webflow.pending.v1')throw problem('E_STORAGE');
    return original.call(this,name,args);
  };
  const f=await mount(t,host);await f.click('脚本');
  assert.equal(f.find('运行',taskCard(f)).disabled,false);assert.match(f.text(),/E_STORAGE/);await f.click('运行',taskCard(f));
  assert.equal(host.calls.filter(c=>c.name==='tasks.configure').length,1);
  assert.equal(starts(host).length,0);
});

test('an old held-summary storage read cannot overwrite a newer released observation',async t=>{
  const host=sdk(),oldGet=deferred(),entered=deferred();let hold=true;
  host.beforeGet=async args=>{if(hold&&args.key==='webflow.recent.v1'&&args.withEtag){hold=false;entered.resolve();await oldGet.promise;}};
  host.read=async id=>complete(id,'retiring');const {f,id}=await recover(t,host);await f.click('查询原请求');
  await entered.promise;
  host.read=async()=>complete(id);await f.click('查询原请求');await f.flush(()=>oldGet.resolve());
  assert.equal(host.store.get('webflow.recent.v1')[0].retirementState,'released');
  await f.close();const replacement=await mount(t,host);await replacement.click('脚本');
  assert.equal(replacement.find('运行',taskCard(replacement)).disabled,false);
});

test('a committed pending clear with a lost ACK is reconciled idempotently',async t=>{
  const host=sdk();let lose=true;
  host.afterSet=async args=>{if(lose&&args.key==='webflow.pending.v1'&&args.value===null){lose=false;throw problem('E_TIMEOUT');}};
  host.read=async id=>complete(id);const {f}=await recover(t,host);await f.click('查询原请求');
  assert.equal(host.store.get('webflow.pending.v1'),null);
  await f.click('查询原请求');
  assert.equal(host.store.get('webflow.pending.v1'),null);assert.equal(starts(host).length,0);
});

test('Stop during pending clear does not permanently desynchronize the original locator',async t=>{
  const host=sdk(),clear=deferred(),entered=deferred();let hold=true;
  host.beforeSet=async args=>{if(hold&&args.key==='webflow.pending.v1'&&args.value===null){hold=false;entered.resolve();await clear.promise;}};
  host.read=async id=>complete(id);const {f,id}=await recover(t,host);await f.click('查询原请求');
  await entered.promise;
  await f.click('停止原请求');await f.flush(()=>clear.resolve());
  await f.click('查询原请求');
  assert.equal(host.store.get('webflow.pending.v1'),null);assert.equal(starts(host).length,0);
});

test('an affirmative pre-submit cancellation fence stays settled after reopen without pretending retirement',async t=>{
  const host=sdk(),id=legacy(host);
  let f=await mount(t,host);await f.click('记录');
  host.read=async()=>({clientRequestId:id,state:'cancelled',semantic:'NOT_SUBMITTED_FENCED',runId:null,resultId:null});
  await f.click('查询原请求');assert.equal(host.store.get('webflow.pending.v1'),null);await f.close();
  f=await mount(t,host);await f.click('脚本');assert.equal(f.find('运行',taskCard(f)).disabled,false);
  assert.notEqual(host.store.get('webflow.recent.v1')[0].retirementState,'released');
});

test('a revoked re-query replaces the old released-success notice with the current failure',async t=>{
  const host=sdk();host.read=async id=>complete(id);
  const {f,id}=await recover(t,host);await f.click('查询原请求');assert.match(f.text(),/原请求已查询，资源已释放/);
  host.read=async()=>{throw problem('E_PERMISSION');};await f.click('查询原请求');
  assert.match(f.text(),/E_PERMISSION/);assert.ok(!f.text().includes('原请求已查询，资源已释放'));
  assert.equal(f.document.querySelector('pre'),null);assert.equal(starts(host).length,0);
});

test('release of A cannot clear a different concurrently saved pending locator B',async t=>{
  const host=sdk();host.read=async id=>complete(id,'retiring');
  const {f,id}=await recover(t,host);await f.click('查询原请求');
  const other={clientRequestId:'webflow:other-step',taskId:host.pins[0].taskId,version:host.pins[0].version};
  host.store.set('webflow.pending.v1',other);host.read=async()=>complete(id);
  await f.click('查询原请求');assert.deepEqual(host.store.get('webflow.pending.v1'),other);
  assert.match(f.text(),/E_CONFLICT/);assert.equal(starts(host).length,0);
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

test('unread legacy history reports failure and cannot turn configuration into execution',async t=>{
  const host=sdk(),original=host.request;
  host.store.set('webflow.recent.v1',[{clientRequestId:'webflow:unread-unknown',taskId:host.pins[0].taskId,
    version:host.pins[0].version,state:'unknown',retirementState:'unknown'}]);
  host.request=async function(name,args){if(name==='storage.get'&&args.key==='webflow.recent.v1')throw problem('E_STORAGE');
    return original.call(this,name,args);};
  const f=await mount(t,host);await f.click('脚本');assert.equal(f.find('运行',taskCard(f)).disabled,false);
  assert.match(f.text(),/E_STORAGE/);
  const pending=structuredClone(host.store.get('webflow.pending.v1'));
  await f.click('运行',taskCard(f));
  assert.deepEqual(host.store.get('webflow.pending.v1'),pending);
  assert.equal(host.calls.filter(c=>c.name==='tasks.configure').length,1);
  assert.equal(starts(host).length,0);
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


test('P0 legacy Run observation updates the same R1.2 notification only after original Result readback',async t=>{
  const host=sdk(),events=[],handles=[];
  host.notify={open(options){
    events.push({action:'open',options});
    const handle={ready:Promise.resolve({status:'accepted'}),
      update(next){events.push({action:'update',options:next});return Promise.resolve({status:'accepted'});},
      dismiss(){events.push({action:'dismiss'});return Promise.resolve({status:'accepted'});}};
    handles.push(handle);return handle;
  }};
  host.read=async id=>({clientRequestId:id,taskId:host.pins[0].taskId,
    runId:'run-original',state:'running',retirementState:'running'});
  const {f}=await recover(t,host);
  assert.equal(events.length,0,'preparation/installation metadata must not notify a Run');
  await f.click('查询原请求');
  assert.equal(starts(host).length,0);
  assert.equal(events.filter(e=>e.action==='open').length,1);
  assert.match(events[0].options.message,/正在执行/);
  host.read=async id=>complete(id);
  await f.tick();
  await f.flush();
  assert.equal(events.filter(e=>e.action==='open').length,1,'same original request reuses one handle');
  assert.equal(events.filter(e=>e.action==='update').length,1);
  assert.match(events.find(e=>e.action==='update').options.message,/仅脚本执行/);
  assert.equal(host.calls.filter(c=>c.name==='tasks.start').length,0);
  await f.click('记录');
  assert.match(f.text(),/run-original/);
  assert.match(f.text(),/result-original/);
  await f.close();
  assert.equal(events.filter(e=>e.action==='dismiss').length,1,'unmount does not leave an old handle alive');
});

test('P0 R1.2 unavailable degrades to original durable history, not another Task execution',async t=>{
  const host=sdk();let notifications=0;
  host.notify={open(){notifications++;throw Error('Host unavailable');}};
  host.read=async id=>complete(id);
  const {f,id}=await recover(t,host);await f.click('查询原请求');
  assert.equal(notifications,1,'no retry on failed notification Host');
  assert.equal(starts(host).length,0);
  assert.match(f.text(),/run-original/);
  await f.click('记录');
  assert.match(f.text(),/查询原请求/);
  await f.close();
});

test('P0 trusted read permission failure downgrades one prior success Toast and never replays Run',async t=>{
  const host=sdk(),changes=[];
  host.notify={open(options){changes.push({op:'open',options});
    return {ready:Promise.resolve({status:'accepted'}),
      update(next){changes.push({op:'update',options:next});return Promise.resolve({status:'accepted'});},
      dismiss(){changes.push({op:'dismiss'});return Promise.resolve({status:'accepted'});}};}};
  host.read=async id=>complete(id);
  const {f,id}=await recover(t,host);await f.click('查询原请求');
  assert.equal(changes.filter(x=>x.op==='open').length,1);
  assert.match(changes[0].options.message,/脚本执行完成/);
  host.read=async()=>{throw problem('E_PERMISSION');};
  await f.click('查询原请求');
  assert.equal(changes.filter(x=>x.op==='open').length,1);
  const warning=changes.filter(x=>x.op==='update').at(-1);
  assert.equal(warning.options.type,'warning');
  assert.match(warning.options.message,/结果未确认/);
  assert.match(f.text(),/E_PERMISSION/);
  assert.equal(starts(host).length,0,'permission failure never resubmits Task');
  await f.close();
});

test('script rows expose installed metadata and send each exact installation to the shared drawer',async t=>{
  const host=sdk(),f=await mount(t,host);await f.click('脚本');
  for(const task of host.pins){
    const card=[...f.document.querySelectorAll('article')].find(row=>row.textContent.includes(manifests.get(task.taskId).title));
    assert.match(card.querySelector('.wf-task-secondary').textContent,/参数 3 项.*手动 · 双阶段确认/);
    await f.click(manifests.get(task.taskId).title,card);
    assert.equal(card.querySelectorAll('input').length,0);
    assert.ok(card.textContent.includes(manifests.get(task.taskId).description));
    await f.click('运行',card);
  }
  const configured=host.calls.filter(c=>c.name==='tasks.configure');
  assert.deepEqual(configured.map(c=>c.args),host.pins.map(task=>({task})));
  assert.ok(configured.every(c=>c.inClick),'configure stays in the original click turn');
  for(const {args} of configured)assert.deepEqual(Object.keys(args.task).sort(),
    ['taskId','version','manifestHash','contentHash','installationId','generation'].sort());
  assert.equal(host.calls.some(c=>c.name==='tasks.prepare'),false);
  assert.equal(host.calls.some(c=>c.name==='storage.set'),false);
});

test('confirmed preference readback uses R1.2 Toast and does not leave a legacy 知道了 banner',async t=>{
  const host=sdk(),open=[],dismisses=[];
  host.notify={open(options){
    open.push(options);
    return {ready:Promise.resolve({status:'accepted'}),
      update(){return Promise.resolve({status:'accepted'});},
      dismiss(){dismisses.push(true);return Promise.resolve({status:'accepted'});}};
  }};
  const f=await mount(t,host);
  await f.click('脚本');
  await f.click('收藏 '+manifests.get(host.pins[0].taskId).title,taskCard(f));
  assert.equal(open.length,1,'one verified save uses exactly one Host Toast');
  assert.equal(open[0].message,'偏好已保存并读回。');
  assert.equal(open[0].type,'success');
  assert.equal(open[0].position,'bottom-right');
  assert.doesNotMatch(f.text(),/知道了|偏好已保存并读回。/,'no redundant in-content success banner');
  assert.equal(starts(host).length,0,'feedback cannot run a Task');
  await f.close();
  assert.equal(dismisses.length,1,'closed tool retires its own Toast handle');
});

test('old or rejected R1.2 Host shows a short non-blocking fallback, never a fake save or retry',async t=>{
  for(const mode of ['missing','rejected','throw']){
    const host=sdk(),calls=[];
    if(mode==='rejected')host.notify={open(options){
      calls.push(options);
      return {ready:Promise.resolve({status:'rejected',reason:'unavailable'}),
        dismiss(){return Promise.resolve({status:'rejected'});}};
    }};
    if(mode==='throw')host.notify={open(){throw Error('host unavailable');}};
    const f=await mount(t,host);
    await f.click('脚本');
    await f.click('收藏 '+manifests.get(host.pins[0].taskId).title,taskCard(f));
    await f.flush();
    assert.match(f.text(),/偏好已保存并读回。/);
    assert.equal(f.document.querySelector('[data-wf-feedback="fallback"]')?.textContent,
      '偏好已保存并读回。');
    assert.doesNotMatch(f.text(),/知道了/,'legacy fallback should not demand acknowledgement');
    assert.equal(starts(host).length,0);
    await f.tick();
    assert.equal(f.document.querySelector('[data-wf-feedback="fallback"]'),null,
      'fallback disappears without a confirmation button');
    if(mode==='rejected')assert.equal(calls.length,1);
    await f.close();
  }
});

test('failed preference readback never sends a success Toast',async t=>{
  const host=sdk(),events=[];
  host.notify={open(options){events.push(options);
    return {ready:Promise.resolve({status:'accepted'}),
      dismiss(){return Promise.resolve({status:'accepted'});}};
  }};
  host.failSave=true;
  const f=await mount(t,host);
  await f.click('脚本');
  await f.click('收藏 '+manifests.get(host.pins[0].taskId).title,taskCard(f));
  assert.equal(events.length,0);
  assert.match(f.text(),/偏好未确认保存/);
  assert.equal(starts(host).length,0);
});


test('legacy locator restoration rejects CAS conflict or mismatched readback before any Task read or execution',async t=>{
  for(const failure of ['cas','readback']){
    const host=sdk(),id='webflow:legacy-cas';
    host.store.set('webflow.recent.v1',[{clientRequestId:id,taskId:host.pins[0].taskId,
      version:host.pins[0].version,state:'unknown',retirementState:'unknown'}]);
    const other={clientRequestId:'webflow:other-original',taskId:host.pins[0].taskId,version:host.pins[0].version};
    if(failure==='cas')host.beforeSet=args=>{if(args.key==='webflow.pending.v1')host.store.set(args.key,other);};
    else host.afterSet=args=>{if(args.key==='webflow.pending.v1')host.store.set(args.key,other);};
    const f=await mount(t,host);await f.click('记录');await f.click('查询原请求');
    assert.match(f.text(),failure==='cas'?/E_CONFLICT/:/保存后读回不一致/);
    assert.deepEqual(host.store.get('webflow.pending.v1'),other);
    assert.equal(host.calls.some(c=>c.name==='tasks.read'&&c.args.clientRequestId),false);
    assert.equal(f.document.querySelector('pre'),null);assert.equal(starts(host).length,0);await f.close();
  }
});

test('failed legacy Stop retains the original locator and permits only an explicit same-ID retry',async t=>{
  const host=sdk();host.stop=async()=>{throw problem('E_TIMEOUT');};
  const {f,id}=await recover(t,host),pending=structuredClone(host.store.get('webflow.pending.v1'));
  await f.click('停止原请求');
  assert.match(f.text(),/停止结果未知.*E_TIMEOUT/);
  assert.deepEqual(host.store.get('webflow.pending.v1'),pending);
  host.stop=async clientRequestId=>({clientRequestId,state:'stopping'});
  await f.click('停止原请求');
  assert.deepEqual(host.calls.filter(c=>c.name==='tasks.stop').map(c=>c.args),[
    {clientRequestId:id},{clientRequestId:id}]);
  assert.deepEqual(host.store.get('webflow.pending.v1'),pending);
  assert.equal(starts(host).length,0);
});

test('stale runtime metadata permits UI-only configuration with the original installed pin',async t=>{
  const host=sdk();host.taskRead=async taskId=>({task:host.pins.find(task=>task.taskId===taskId),
    manifest:manifests.get(taskId),runtimeCurrent:false});
  const f=await mount(t,host);await f.click('脚本');
  assert.match(taskCard(f).textContent,/待重新验证/);
  await f.click('运行',taskCard(f));
  assert.deepEqual(host.calls.find(c=>c.name==='tasks.configure').args,{task:host.pins[0]});
  assert.equal(host.calls.some(c=>['storage.set','tasks.start','tasks.open'].includes(c.name)),false);
});

test('opening or failing configuration cannot erase an unresolved original read or Stop error',async t=>{
  for(const action of ['查询原请求','停止原请求']){
    const host=sdk();
    host.read=host.stop=async()=>{throw problem('E_TIMEOUT');};
    const {f,id}=await recover(t,host);
    await f.click(action);
    const original=f.document.querySelector('[role="alert"]').textContent;
    assert.match(original,/E_TIMEOUT/);
    await f.click('脚本');
    await f.click('运行',taskCard(f));
    assert.equal(f.document.querySelector('[role="alert"]').textContent,original);
    host.configure=()=>{throw problem('E_UNSUPPORTED');};
    await f.click('运行',taskCard(f));
    assert.equal(f.document.querySelector('[role="alert"]').textContent,original);
    assert.match(f.text(),/运行配置未打开.*E_UNSUPPORTED/);
    await f.click('关闭配置提示');
    assert.equal(f.document.querySelector('[role="alert"]').textContent,original);
    assert.equal(host.store.get('webflow.pending.v1').clientRequestId,id);
    assert.equal(starts(host).length,0);
    await f.close();
  }
});


test('rapid double-click sends at most one configure request and zero Runs',async t=>{
  const host=sdk(),pending=deferred();host.configure=()=>pending.promise;
  const f=await mount(t,host);await f.click('脚本');
  const button=f.find('运行',taskCard(f));
  await f.flush(()=>{
    button.dispatchEvent(new f.window.Event('click',{bubbles:true}));
    button.dispatchEvent(new f.window.Event('click',{bubbles:true}));
  });
  assert.equal(host.calls.filter(c=>c.name==='tasks.configure').length,1);
  assert.equal(starts(host).length,0);
  await f.flush(()=>pending.resolve({opened:true}));
});


test('revoked UI opening reports an error without submitting a task',async t=>{
  const host=sdk();host.configure=async()=>{throw problem('E_TOOL_CHANGED');};
  const f=await mount(t,host);await f.click('脚本');await f.click('运行',taskCard(f));
  assert.match(f.text(),/运行配置未打开/);
  assert.equal(starts(host).length,0);
  assert.equal(host.store.has('webflow.pending.v1'),false);
});


test('an exact installed hash drift disables the UI-only entrypoint',async t=>{
  const host=sdk();host.pins[0].manifestHash='f'.repeat(64);
  const f=await mount(t,host);await f.click('脚本');
  assert.equal(f.find('运行',taskCard(f)).disabled,true);
  assert.match(taskCard(f).textContent,/固定版本不匹配/);
  assert.equal(host.calls.filter(c=>c.name==='tasks.configure').length,0);
});
