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
  const api={store,calls,pins,page:{status:'available',url:'https://www.baidu.com/'},read:async id=>({clientRequestId:id,state:'unknown',semantic:'UNKNOWN'}),
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
      if(name==='currentPage.info')return api.pageRead?api.pageRead():{...api.page};
      if(name==='tasks.read')return args.taskId?
        (api.taskRead?api.taskRead(args.taskId):{task:api.pins.find(p=>p.taskId===args.taskId)}):api.read(args.clientRequestId);
      if(name==='tasks.start')return api.start(args.clientRequestId,args);
      if(name==='tasks.stop')return api.stop(args.clientRequestId);
      if(name==='tasks.configure')return api.configure?.(args)??{opened:true};
      if(name==='tasks.open')return {opened:true};
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
  t.after(close);
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
      await React.act(async()=>node.dispatchEvent(new window.Event('click',{bubbles:true})));},
    async duplicateClick(label){const node=find(label);await React.act(async()=>{
      node.dispatchEvent(new window.Event('click',{bubbles:true}));
      node.dispatchEvent(new window.Event('click',{bubbles:true}));});},
    async tick(){await React.act(async()=>{const work=[...timers.values()];timers.clear();for(const fn of work)fn();});},
    async flush(fn=()=>{}){await React.act(async()=>{fn();});}
  };
  return f;
}


// Current Web Flow list UI; legacy v1 inline-form tests remain accessible in Git history.

const configureCalls=host=>host.calls.filter(c=>c.name==='tasks.configure');
const starts=host=>host.calls.filter(c=>c.name==='tasks.start');
const reads=host=>host.calls.filter(c=>c.name==='tasks.read'&&c.args.clientRequestId);
const stops=host=>host.calls.filter(c=>c.name==='tasks.stop');
const taskCard=f=>[...f.document.querySelectorAll('article')].find(n=>n.textContent.includes('百度搜索'));
const pinned=host=>({clientRequestId:'webflow:original-123',taskId:host.pins[0].taskId,
  version:host.pins[0].version,at:Date.now(),task:{...host.pins[0]},
  params:{query:'saved legacy query',limit:3}});
const complete=(id,retirementState='released')=>({
  clientRequestId:id,runId:'run-original',resultId:'result-original',
  state:'completed',retirementState,
  value:{status:'success',count:1,results:[{title:'trusted SDK result',url:'https://example.com/'}]},
  result:{tag:'controller-result',runId:'run-original',resultId:'result-original',
    state:'completed',outcome:{ok:true}}
});
const changedPage=f=>f.document.getElementById('root').dispatchEvent(
  new f.window.Event('opendesk-page-changed'));

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
  assert.deepEqual(current.headerActions.map(x=>x.id),['help','settings']);
  assert.equal(starts(host).length,0);
  assert.deepEqual(f.errors,[]);
});

test('clicking ▶ opens only the Host TaskRunSheet; no inline editor, save, or start',async t=>{
  const host=sdk(),f=await mount(t,host);
  await f.click('脚本');
  const card=taskCard(f);
  await f.click('运行',card);
  assert.deepEqual(configureCalls(host).map(c=>c.args),[{taskId:'baidu.search.top3'}]);
  assert.equal(starts(host).length,0);
  assert.equal(host.store.has('webflow.pending.v1'),false);
  assert.equal(f.document.getElementById('wf-query'),null);
  assert.equal(f.document.getElementById('wf-show-execution-tab'),null);
  assert.equal(f.document.getElementById('task-parameters-sheet'),null,
    'the real trusted Sheet belongs to the parent React root, not the iframe');
  assert.deepEqual(f.errors,[]);
});

test('the menu and task-name actions use the same UI-only Host request',async t=>{
  const host=sdk(),f=await mount(t,host);await f.click('脚本');
  const card=taskCard(f);
  await f.click('百度搜索 · 前三条自然结果',card);
  await f.click('更多操作：百度搜索 · 前三条自然结果',card);
  await f.click('配置参数',card);
  assert.equal(configureCalls(host).length,2);
  assert.equal(starts(host).length,0);
});

test('rapid double-click sends at most one configure request and zero Runs',async t=>{
  const host=sdk(),pending=deferred();host.configure=()=>pending.promise;
  const f=await mount(t,host);await f.click('脚本');
  const button=f.find('运行',taskCard(f));
  await f.flush(()=>{
    button.dispatchEvent(new f.window.Event('click',{bubbles:true}));
    button.dispatchEvent(new f.window.Event('click',{bubbles:true}));
  });
  assert.equal(configureCalls(host).length,1);
  assert.equal(starts(host).length,0);
  await f.flush(()=>pending.resolve({opened:true}));
});

test('revoked UI opening reports an error without submitting a task',async t=>{
  const host=sdk();host.configure=async()=>{throw problem('E_TOOL_CHANGED');};
  const f=await mount(t,host);await f.click('脚本');await f.click('运行',taskCard(f));
  assert.match(f.text(),/共享运行抽屉未打开/);
  assert.equal(starts(host).length,0);
  assert.equal(host.store.has('webflow.pending.v1'),false);
});

test('an exact installed hash drift disables the UI-only entrypoint',async t=>{
  const host=sdk();host.pins[0].manifestHash='f'.repeat(64);
  const f=await mount(t,host);await f.click('脚本');
  assert.equal(f.find('运行',taskCard(f)).disabled,true);
  assert.match(taskCard(f).textContent,/固定版本不匹配/);
  assert.equal(configureCalls(host).length,0);
});

test('missing and disabled tasks stay non-runnable and expose original management action',async t=>{
  const host=sdk();host.taskRead=async id=>{
    if(id==='baidu.search.top3')throw Object.assign(Error('disabled'),{code:'E_TASK_DISABLED'});
    return {task:host.pins[1]};
  };
  const f=await mount(t,host);await f.click('脚本');
  assert.equal(f.find('运行',taskCard(f)).disabled,true);
  await f.click('打开任务管理',taskCard(f));
  assert.deepEqual(host.calls.filter(c=>c.name==='tasks.open').map(x=>x.args),
    [{taskId:'baidu.search.top3'}]);
  assert.equal(starts(host).length,0);
});

test('trusted page-change notification invalidates the old origin before a new read',async t=>{
  const host=sdk(),f=await mount(t,host);await f.click('脚本');
  assert.equal(f.find('运行',taskCard(f)).disabled,false);
  host.page={status:'available',url:'https://www.google.com/'};
  await f.flush(()=>changedPage(f));
  assert.equal(f.find('运行',taskCard(f)).disabled,true);
  host.page={status:'available',url:'https://www.baidu.com/'};
  await f.flush(()=>changedPage(f));
  assert.equal(f.find('运行',taskCard(f)).disabled,false);
  assert.equal(configureCalls(host).length,0);
});

test('legacy pending ID is restored as read-only recovery; UNKNOWN never starts a new Run',async t=>{
  const host=sdk(),saved=pinned(host);host.store.set('webflow.pending.v1',saved);
  const f=await mount(t,host);await f.click('脚本');
  assert.equal(f.find('运行',taskCard(f)).disabled,true);
  await f.click('记录');
  assert.match(f.text(),/原步骤/);
  assert.match(f.text(),/webflow:original-123/);
  await f.click('查询原请求');
  assert.deepEqual(reads(host).map(x=>x.args.clientRequestId),[saved.clientRequestId]);
  assert.equal(host.store.get('webflow.pending.v1').clientRequestId,saved.clientRequestId);
  assert.equal(starts(host).length,0);
});

test('a completed-looking legacy result without confirmed resource release retains its ID',async t=>{
  const host=sdk(),saved=pinned(host);host.store.set('webflow.pending.v1',saved);
  host.read=async()=>complete(saved.clientRequestId,'pending');
  const f=await mount(t,host);await f.click('记录');await f.click('查询原请求');
  assert.equal(host.store.get('webflow.pending.v1').clientRequestId,saved.clientRequestId);
  assert.equal(starts(host).length,0);
  assert.match(f.text(),/资源释放/);
});

test('only matching durable result with retirement released can clear the legacy pending ID',async t=>{
  const host=sdk(),saved=pinned(host);host.store.set('webflow.pending.v1',saved);
  host.read=async()=>complete(saved.clientRequestId);
  const f=await mount(t,host);await f.click('记录');await f.click('查询原请求');
  assert.equal(host.store.get('webflow.pending.v1'),null);
  assert.equal(starts(host).length,0);
  assert.ok(host.store.has('webflow.recent.v1'));
});

test('mismatched request IDs must not clear the original legacy recovery locator',async t=>{
  const host=sdk(),saved=pinned(host);host.store.set('webflow.pending.v1',saved);
  host.read=async()=>complete('webflow:different-id');
  const f=await mount(t,host);await f.click('记录');await f.click('查询原请求');
  assert.equal(host.store.get('webflow.pending.v1').clientRequestId,saved.clientRequestId);
  assert.equal(starts(host).length,0);
  assert.match(f.text(),/原请求未确认/);
});

test('a failed legacy read is UNKNOWN; only the old ID can be retried for observation',async t=>{
  const host=sdk(),saved=pinned(host);host.store.set('webflow.pending.v1',saved);
  host.read=async()=>{throw problem('E_TRANSPORT');};
  const f=await mount(t,host);await f.click('记录');await f.click('查询原请求');
  assert.equal(host.store.get('webflow.pending.v1').clientRequestId,saved.clientRequestId);
  assert.equal(starts(host).length,0);
});

test('Stop requests the original ID only and cannot imply side effects were undone',async t=>{
  const host=sdk(),saved=pinned(host);host.store.set('webflow.pending.v1',saved);
  const f=await mount(t,host);await f.click('记录');await f.click('停止原请求');
  assert.deepEqual(stops(host).map(x=>x.args.clientRequestId),[saved.clientRequestId]);
  assert.equal(starts(host).length,0);
  assert.equal(host.store.get('webflow.pending.v1').clientRequestId,saved.clientRequestId);
});

test('corrupt saved locator refuses fresh admission rather than minting a replacement ID',async t=>{
  const host=sdk();host.store.set('webflow.pending.v1',{foo:'not a locator'});
  const f=await mount(t,host);await f.click('脚本');
  assert.equal(f.find('运行',taskCard(f)).disabled,true);
  assert.equal(configureCalls(host).length,0);
  assert.equal(starts(host).length,0);
  assert.match(f.text(),/恢复记录损坏|不能新建请求/);
});

test('a legacy UNKNOWN history summary without pending key remains query-only',async t=>{
  const host=sdk(),saved=pinned(host);
  host.store.set('webflow.recent.v1',[{...saved,state:'unknown',retirementState:'unknown',delivery:'success'}]);
  const f=await mount(t,host);await f.click('记录');
  assert.match(f.text(),/webflow:original-123/);
  await f.click('查询原请求');
  assert.equal(starts(host).length,0);
});

test('missing installed metadata and permission denial cannot masquerade as a valid Task',async t=>{
  const host=sdk();host.taskRead=async()=>{throw problem('E_PERMISSION');};
  const f=await mount(t,host);await f.click('脚本');
  assert.equal(f.find('运行',taskCard(f)).disabled,true);
  assert.equal(configureCalls(host).length,0);
  assert.equal(starts(host).length,0);
});
