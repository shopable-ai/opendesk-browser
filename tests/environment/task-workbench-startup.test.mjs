import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createTaskWorkbench} from '../../src/ui/task-workbench.js';
import {createMyWorkbenchView} from '../../src/ui/my-workbench-view.js';

test('React shell can start, refresh and navigate without retired task catalog DOM',async()=>{
  const {document}=parseHTML('<html><body></body></html>');
  const view=createMyWorkbenchView(),subscribers=new Set(),selected=[];
  let navigate;
  const host={currentRun:null,subscribe(fn){subscribers.add(fn);return ()=>subscribers.delete(fn);}};
  const client={ready:Promise.resolve(),async request(action){
    assert.equal(action,'listTaskCatalog');return {catalog:[],installed:[]};
  }};
  const api={runtime:{getURL:path=>'chrome-extension://test/'+path},
    permissions:{onAdded:{addListener(){},removeListener(){}},onRemoved:{addListener(){},removeListener(){}}}};
  const workbench=createTaskWorkbench({client,host,document,api,myView:view,
    reactNavigation:{ownsPages:true,connect(fn){navigate=fn;},select(tab){selected.push(tab);}}});
  try{
    await workbench.refresh();
    assert.equal(navigate('tools'),true);
    assert.equal(selected.at(-1),'tools');
    assert.equal(view.field('task-run').disabled,true);
    assert.equal(typeof view.actions.taskRunClick,'function');
    assert.equal(typeof view.actions.taskStopClick,'function');
    assert.equal(view.data.runDock.hidden,true);
    host.currentRun='draft-run';
    for(const fn of subscribers)fn({runId:'draft-run',state:'running'});
    assert.equal(view.data.runDock.developHidden,false);
    assert.equal(view.data.runDock.stopOnly,true);
    assert.equal(view.data.runDock.hidden,false);
    assert.equal(document.body.children.length,0,'controller must not create replacement DOM');
  }finally{workbench.dispose();}
  assert.equal(subscribers.size,0);
  assert.equal(view.actions.taskRunClick,undefined);
  assert.equal(view.actions.taskStopClick,undefined);
});

test('My file import presents the pending task without retired catalog nodes; source review stays bound to selection',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile('examples/tasks/modern-search.v1.opendesk-task.json','utf8');
  const pkg=JSON.parse(source),view=createMyWorkbenchView();
  const {document}=parseHTML('<html><body></body></html>');
  let rows=[],releaseSource;
  const key=pkg.manifest.taskId+'@'+pkg.manifest.version;
  const host={currentRun:null,subscribe(){return ()=>{};}};
  const client={ready:Promise.resolve(),async request(action,args){
    if(action==='listTaskCatalog')return {catalog:rows,installed:[]};
    if(action==='importTaskPackage'){
      rows=[{...pkg.manifest,manifest:pkg.manifest,manifestHash:pkg.manifestHash,stage:'candidate'}];
      return rows[0];
    }
    if(action==='getTaskCandidate')return new Promise(resolve=>{releaseSource=resolve;});
    throw new Error(action);
  }};
  const api={runtime:{getURL:path=>'chrome-extension://test/'+path},permissions:{contains:async()=>true,
    onAdded:{addListener(){},removeListener(){}},onRemoved:{addListener(){},removeListener(){}}}};
  const workbench=createTaskWorkbench({client,host,document,api,myView:view,
    reactNavigation:{ownsPages:true,connect(){},select(){}}});
  try{
    await workbench.refresh();
    view.field('task-add-file').files=[{name:'modern-search.opendesk-task.json',size:source.length,text:async()=>source}];
    await view.actions.taskAddFileChange({isTrusted:true});
    assert.match(view.field('task-add-status').text,/已导入待验证任务/);
    assert.doesNotMatch(view.field('task-add-status').text,/E_TASK|Cannot/);
    assert.equal(view.data.catalogRows.selectedKey,key);
    assert.equal(view.field('task-install').disabled,true,'import must not grant installability');
    const pending=view.actions.taskCatalogSourceOpen(key);
    view.actions.taskCatalogSelect('');
    releaseSource({manifestHash:pkg.manifestHash,package:pkg});
    await pending;
    assert.equal(view.data.catalogDetail,null,'late source response must not replace another selection');
    assert.equal(document.body.children.length,0);
  }finally{workbench.dispose();}
});

test('schedule timezone change retains its picker hint and refreshes the next-time preview',async()=>{
  const {createScheduledTaskWorkbench}=await import('../../src/ui/scheduled-task-workbench.js');
  const {document}=parseHTML('<html><body></body></html>');
  const view=createMyWorkbenchView();
  const schedule=createScheduledTaskWorkbench({document,myView:view,client:{},host:{},
    taskWorkbench:{myView:view},api:{}});
  try{
    view.field('schedule-timezone').value='Asia/Shanghai';
    view.field('schedule-kind').value='daily';
    view.field('schedule-clock').value='09:00';
    view.actions.scheduleTimezoneChange({});
    assert.equal(view.field('schedule-timezone').title,'IANA：Asia/Shanghai');
    assert.ok(view.field('schedule-next-time').text);
  }finally{schedule.dispose();}
});
