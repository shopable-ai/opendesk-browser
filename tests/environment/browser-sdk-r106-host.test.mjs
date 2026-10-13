import test from 'node:test';
import assert from 'node:assert/strict';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {BROWSER_MENU_GRANTS_STORE} from '../../src/framework/sdk/browser-contract.js';
import {validateSidebarToolPackage,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

const EXT='r106-host-ext';
const HOST='01234567-89ab-4def-8123-456789abcdef';
const TOOL_INSTANCE='fedcba98-7654-4abc-8def-123456789abc';
const EPOCH='epoch-1';
const ORIGIN='https://example.com';
const TARGET_URL=ORIGIN+'/form';
const DOC={tabId:21,windowId:7,documentId:'target-doc',url:TARGET_URL,origin:ORIGIN};
const sender={id:EXT,frameId:0,documentId:'side-panel-doc',documentLifecycle:'active',
  url:`chrome-extension://${EXT}/ui/tool.html?hostInstanceId=${HOST}`};
const reject=code=>error=>error?.code===code;

const schedulerTool=validateSidebarToolPackage({
  format:'opendesk.sidebar-tool.v2',
  id:'scheduler-tool',
  version:'1.0.0',
  title:'Scheduler Tool',
  description:'Browser SDK Scheduler Host fixture',
  capabilities:['browser.scheduler'],
  html:'<main>Scheduler</main>',
  css:'',
  js:'void 0;',
  requires:{browserSdk:'1.0.0'},
  contributes:{contextMenus:[]}
});

function store(map){
  return {
    get:async keys=>{
      const list=Array.isArray(keys)?keys:[keys];
      return Object.fromEntries(list.map(key=>[key,structuredClone(map.get(key))]));
    },
    set:async values=>{
      for(const [key,value] of Object.entries(values))map.set(key,structuredClone(value));
    }
  };
}

async function fixture({historyPermission=true,originPermission=true,document=DOC}={}){
  const local=new Map(),session=new Map(),calls=[];
  const packageHash=await sidebarToolPackageHash(schedulerTool);
  local.set('opendesk.sidebar-tools.installed.v1',[schedulerTool]);
  local.set(TOOL_REVOCATION_EPOCHS_STORE,{[schedulerTool.id]:EPOCH});
  local.set(BROWSER_MENU_GRANTS_STORE,{});
  const api={
    runtime:{id:EXT,lastError:null,getURL:path=>`chrome-extension://${EXT}/${path}`,
      getContexts:async query=>{
        calls.push(['getContexts',structuredClone(query)]);
        return [{contextType:'SIDE_PANEL',documentUrl:sender.url,documentId:sender.documentId,
          frameId:0,incognito:false}];
      }},
    storage:{local:store(local),session:store(session),onChanged:{addListener(){}}},
    permissions:{contains:async request=>{
      calls.push(['contains',structuredClone(request)]);
      if(request.permissions?.includes('history'))return historyPermission;
      if(request.permissions?.includes('alarms'))return true;
      if(request.origins)return originPermission&&request.origins.length===1&&
        request.origins[0]===ORIGIN+'/*';
      return false;
    }},
    tabs:{query:async query=>{
      calls.push(['tabs.query',structuredClone(query)]);
      return document?[{id:document.tabId,windowId:document.windowId,url:document.url,
        active:true,incognito:false,status:'complete'}]:[];
    }},
    webNavigation:{getFrame:async query=>{
      calls.push(['getFrame',structuredClone(query)]);
      return document?{url:document.url,documentId:document.documentId,documentLifecycle:'active'}:null;
    }},
    history:{search:async query=>{
      calls.push(['history.search',structuredClone(query)]);
      return [{url:'https://example.com/form',title:'Form',lastVisitTime:200},
        {url:'chrome://history',title:'Chrome',lastVisitTime:250}];
    }}
  };
  const scheduleCalls=[];
  const host=createContextMenuHost({api,logger:{warn(){}},lockManager:{request:(_key,work)=>work()},
    scheduleService:async (...args)=>{
      scheduleCalls.push(structuredClone(args));
      const [operation,input]=args;
      if(operation==='browser.scheduler.create')return {scheduleRef:'sched_ref_12345678',status:'active',input};
      if(operation==='browser.scheduler.listOwn')return {schedules:[{scheduleRef:'sched_ref_12345678',taskId:'demo.form',status:'active'}]};
      if(operation==='browser.scheduler.cancelOwn')return {cancelled:input.scheduleRef==='sched_ref_12345678'};
      throw Object.assign(new Error('unexpected scheduler call'),{code:'E_TEST'});
    }});
  const identity={toolId:schedulerTool.id,toolVersion:schedulerTool.version,
    toolInstance:TOOL_INSTANCE,hostInstanceId:HOST,installEpoch:EPOCH,packageHash};
  const request={taskId:'demo.form',revision:'3',schedule:{kind:'interval',expression:'1m'}};
  const schedulerIntent={kind:'trusted-scheduler-create-intent-v1',request,
    task:{taskId:'demo.form',version:'1.0.0',manifestHash:'a'.repeat(64),
      sourceHash:'b'.repeat(64),installationId:'12345678-1234-4123-8123-123456789abc',
      generation:5,revision:3,targetUrl:TARGET_URL,params:{value:7}},
    schedule:{title:'Every minute',timezone:'UTC',triggerKind:'interval',
      triggerSpec:{anchorAt:0,everyMinutes:1},misfirePolicy:'skip',
      startDeadlineMs:300000,openIfMissing:true,paused:false}};
  const confirm=extra=>host.handleHost({operation:'browser.intent.confirm',
    ...identity,targetOperation:'browser.scheduler.create',targetArgs:request,
    schedulerIntent,document:DOC,...extra},sender);
  const call=extra=>host.handleTool({...identity,operation:'browser.scheduler.create',
    args:request,...extra},sender);
  return {api,host,identity,request,schedulerIntent,confirm,call,calls,scheduleCalls};
}

test('R10.6 Scheduler Host refuses create without one-use trusted intent',async()=>{
  const f=await fixture();
  await assert.rejects(f.call(),reject('E_USER_GESTURE_REQUIRED'));
  assert.equal(f.scheduleCalls.length,0);
});

test('R10.6 Scheduler Host creates only after current document, capability, owner and origin checks',async()=>{
  const f=await fixture();
  const approval=await f.confirm();
  assert.match(approval.approvalRef,/^[0-9a-f-]{36}$/i);
  const result=await f.call({approvalRef:approval.approvalRef});
  assert.equal(result.scheduleRef,'sched_ref_12345678');
  assert.equal(f.scheduleCalls.length,1);
  assert.deepEqual(f.scheduleCalls[0],[`browser.scheduler.create`,f.request,{
    kind:'installed-tool-owned',toolId:'scheduler-tool',toolVersion:'1.0.0',
    packageHash:f.identity.packageHash,epoch:EPOCH,installEpoch:EPOCH
  },f.schedulerIntent]);
  await assert.rejects(f.call({approvalRef:approval.approvalRef}),reject('E_USER_GESTURE_REQUIRED'));
  assert.equal(f.scheduleCalls.length,1,'Scheduler intent is consumed exactly once');
});

test('R10.6 Scheduler Host blocks stale document approval before callback',async()=>{
  const f=await fixture({document:{...DOC,documentId:'other-doc'}});
  await assert.rejects(f.confirm(),reject('E_DOCUMENT_CHANGED'));
  assert.equal(f.scheduleCalls.length,0);
});

test('R10.6 Scheduler Host list and cancel use current installed owner without UI intent',async()=>{
  const f=await fixture();
  const listed=await f.host.handleTool({...f.identity,operation:'browser.scheduler.listOwn',args:{}},sender);
  assert.equal(listed.schedules[0].scheduleRef,'sched_ref_12345678');
  const cancelled=await f.host.handleTool({...f.identity,operation:'browser.scheduler.cancelOwn',
    args:{scheduleRef:'sched_ref_12345678'}},sender);
  assert.equal(cancelled.cancelled,true);
  assert.deepEqual(f.scheduleCalls.map(row=>row[0]),['browser.scheduler.listOwn','browser.scheduler.cancelOwn']);
  assert.deepEqual(f.scheduleCalls.map(row=>row[2]),[
    {kind:'installed-tool-owned',toolId:'scheduler-tool',toolVersion:'1.0.0',
      packageHash:f.identity.packageHash,epoch:EPOCH,installEpoch:EPOCH},
    {kind:'installed-tool-owned',toolId:'scheduler-tool',toolVersion:'1.0.0',
      packageHash:f.identity.packageHash,epoch:EPOCH,installEpoch:EPOCH}
  ]);
});

test('R10.6 trusted History Host route is host-only and not exposed to tools',async()=>{
  const f=await fixture();
  const result=await f.host.handleHost({operation:'browser.history.searchTrusted',
    hostInstanceId:HOST,args:{text:'example',startTime:100,endTime:300,limit:5}},sender);
  assert.deepEqual(result,{visits:[{url:'https://example.com/form',title:'Form',lastVisitTime:200}]});
  assert.deepEqual(f.calls.filter(([name])=>name==='history.search'),[
    ['history.search',{text:'example',startTime:100,endTime:300,maxResults:5}]
  ]);
  await assert.rejects(f.host.handleTool({...f.identity,operation:'browser.history.searchTrusted',
    args:{text:'example',startTime:100,endTime:300,limit:5}},sender),reject('E_SERVICE_UNSUPPORTED'));
});
