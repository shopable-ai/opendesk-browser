import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {readAppServiceInstallation} from '../../src/platform/tasks/app-service-installation.js';
import {validateSidebarToolPackage,SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {executeBrowserToolStorage} from '../../src/ui/sidebar-tools/storage-state.js';
import {createScheduleService} from '../../src/platform/tasks/schedule-service.js';
import {validateTrustedScheduleIntent} from '../../src/platform/tasks/schedule-contract.js';
import {SIDEPANEL_DOCUMENT_PATH} from '../../src/tool-document-url.js';

async function fixture(){
  const js='async function main(){return 1;}';
  const tool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',id:'service-probe',title:'Service probe',description:'Background host validation',version:'1.0.0',
    capabilities:['browser.storage','browser.scheduler'],html:'<main>probe</main>',css:'',js:'void 0;',
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},
    background:{kind:'opendesk.app-service.v1',js,sha256:createHash('sha256').update(js).digest('hex')}});
  const generation='12345678-1234-4123-8123-123456789abc';
  const values=new Map([[SIDEBAR_TOOL_STORE,[tool]],[TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:generation}],
    [sidebarToolStorageKey('foreign-app'),{secret:42}]]);
  let afterRead=()=>{},afterWrite=()=>{};
  const local={async get(keys){const result=Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(values.get(k))]));afterRead(keys);return result;},
    async set(rows){for(const [k,v] of Object.entries(rows))values.set(k,structuredClone(v));afterWrite();}};
  const hostInstanceId='23456789-1234-4123-8123-123456789abc';
  const sender={id:'test-extension',documentLifecycle:'active',
    url:'chrome-extension://test-extension/'+SIDEPANEL_DOCUMENT_PATH+'?hostInstanceId='+hostInstanceId};
  // Native Side Panel senders can omit documentId and frameId; resolve them
  // through the actual runtime context route instead of bypassing checkedSender.
  const contexts=[{contextType:'SIDE_PANEL',documentId:'service-ui-document',documentUrl:sender.url,
    frameId:0,incognito:false}],contextQueries=[],permissionChecks=[],alarms=new Map();
  const api={runtime:{id:'test-extension',getURL:p=>'chrome-extension://test-extension/'+p,
    getContexts:async(query={})=>{contextQueries.push(structuredClone(query));return structuredClone(contexts.filter(row=>
      (!query.contextTypes||query.contextTypes.includes(row.contextType))&&
      (!query.documentUrls||query.documentUrls.includes(row.documentUrl))));}},
    storage:{local,session:local,onChanged:{addListener(){}}},
    permissions:{contains:async query=>{permissionChecks.push(query);return !query.origins;}},tabs:{},webNavigation:{},
    alarms:{getAll:async()=>[...alarms.values()],create:async(name,{when})=>alarms.set(name,{name,scheduledTime:when}),
      clear:async name=>alarms.delete(name)}};
  let buckets=new Map(['frameworkKV','commandJournal','runs'].map(name=>[name,new Map()]));
  const storage={async transaction(names,mode,work){
    const snapshot=structuredClone(buckets);
    const bucket=name=>{assert.ok(names.includes(name),'Transaction must include '+name);return snapshot.get(name);};
    const result=await work({get:async(name,key)=>structuredClone(bucket(name).get(key)),
      put:async(name,value,key)=>bucket(name).set(key,structuredClone(value)),
      delete:async(name,key)=>bucket(name).delete(key),all:async name=>structuredClone([...bucket(name).values()])});
    if(mode==='readwrite')buckets=snapshot;
    return result;
  }};
  const schedules=createScheduleService({storage,api,clock:{now:()=>Date.parse('2026-10-22T00:00:30Z')},
    session:'service-host-session',assertHost:async()=>assert.fail('UI approval must use installed-app ownership'),emitToHost:async()=>{}});
  const schedulerCalls=[];
  const host=createContextMenuHost({api,lockManager:{request:(_key,run)=>run()},logger:{warn(){}},
    scheduleService:async(operation,args,owner,intent)=>{
      schedulerCalls.push(structuredClone({operation,args,owner,intent}));
      assert.equal(operation,'browser.scheduler.create');
      return schedules.create(args,owner,intent);
    }});
  const {binding}=await readAppServiceInstallation(api,tool.id);
  const identity={toolId:tool.id,toolVersion:tool.version,packageHash:binding.packageHash,installEpoch:generation,
    hostInstanceId,toolInstance:'34567890-1234-4123-8123-123456789abc'};
  return {api,values,tool,binding,host,identity,sender,contexts,contextQueries,permissionChecks,alarms,schedulerCalls,
    definitions:()=>storage.transaction(['frameworkKV'],'readonly',async tx=>(await tx.all('frameworkKV'))
      .filter(row=>row.tag==='schedule-definition-v1')),
    confirmSchedule:(args,schedulerIntent)=>host.handleHost({...identity,operation:'browser.intent.confirm',
      targetOperation:'browser.scheduler.create',targetArgs:args,schedulerIntent},sender),
    createSchedule:(args,approvalRef)=>host.handleTool({...identity,operation:'browser.scheduler.create',args,approvalRef},sender),
    afterRead:fn=>{afterRead=fn;},afterWrite:fn=>{afterWrite=fn;},
    call:(operation,args={},extra={})=>host.handleService({operation,args,binding,authorize:async()=>true,...extra})};
}

test('trusted UI Host scheduler confirmation reaches the real app-service create and spends its approval once',async()=>{
  const f=await fixture(),request={service:'background',schedule:{kind:'interval',expression:'1m'}};
  const intent={kind:'trusted-app-service-schedule-intent-v1',request:structuredClone(request)};
  await assert.rejects(f.createSchedule(request),{code:'E_USER_GESTURE_REQUIRED'});
  const approval=await f.confirmSchedule(request,intent);
  assert.equal(typeof approval.approvalRef,'string');
  assert.deepEqual(f.schedulerCalls,[]);
  assert.deepEqual(await f.definitions(),[]);

  const result=await f.createSchedule(request,approval.approvalRef);
  assert.equal(result.status,'active');
  const owner={kind:'installed-tool-owned',toolId:f.tool.id,toolVersion:f.tool.version,
    packageHash:f.binding.packageHash,epoch:f.binding.generation,installEpoch:f.binding.generation};
  assert.deepEqual(f.schedulerCalls,[{operation:'browser.scheduler.create',args:request,owner,intent}]);
  const rows=await f.definitions();
  assert.equal(rows.length,1);
  assert.equal(rows[0].scheduleId,result.scheduleRef);
  assert.equal(rows[0].profile,'app-service');
  assert.equal(rows[0].appId,f.tool.id);
  assert.deepEqual(rows[0].appBinding,f.binding);
  assert.deepEqual(rows[0].owner,owner);
  assert.equal(rows[0].targetUrl,null);
  for(const field of ['taskId','installationId','taskGeneration'])assert.equal(Object.hasOwn(rows[0],field),false);
  assert.equal(f.alarms.size,1);
  assert.ok(f.contextQueries.some(query=>query.contextTypes?.includes('SIDE_PANEL')&&query.documentUrls?.includes(f.sender.url)));
  assert.ok(f.permissionChecks.every(query=>!Object.hasOwn(query,'origins')));
  await assert.rejects(f.createSchedule(request,approval.approvalRef),{code:'E_USER_GESTURE_REQUIRED'});
  assert.equal(f.schedulerCalls.length,1);
  assert.equal((await f.definitions()).length,1);
});

test('trusted UI Host refuses an old Task intent or mismatched service request before creating a service schedule',async()=>{
  const f=await fixture(),request={service:'background',schedule:{kind:'interval',expression:'1m'}};
  const taskRequest={taskId:'old-task',revision:'1',schedule:structuredClone(request.schedule)};
  const taskIntent={kind:'trusted-scheduler-create-intent-v1',request:taskRequest,
    task:{taskId:taskRequest.taskId,revision:1,version:'1.0.0',manifestHash:'a'.repeat(64),sourceHash:'b'.repeat(64),
      installationId:'45678901-1234-4123-8123-123456789abc',generation:1,targetUrl:'https://example.com/',params:{}},
    schedule:{title:'Old Task',timezone:'UTC',triggerKind:'interval',triggerSpec:{anchorAt:0,everyMinutes:1},
      misfirePolicy:'skip',startDeadlineMs:300000,openIfMissing:false,paused:false}};
  // The old intent is valid for its own Task; only the service approval is refused.
  assert.equal(validateTrustedScheduleIntent(taskIntent,taskRequest).taskId,taskRequest.taskId);
  for(const intent of [taskIntent,{...taskIntent,request:structuredClone(request)},
    {kind:'trusted-app-service-schedule-intent-v1',request:{service:'background',schedule:{kind:'interval',expression:'2m'}}}]){
    await assert.rejects(f.confirmSchedule(request,intent),{code:'E_USER_GESTURE_REQUIRED'});
    assert.deepEqual(f.schedulerCalls,[]);
    assert.deepEqual(await f.definitions(),[]);
  }
  await assert.rejects(f.createSchedule(request),{code:'E_USER_GESTURE_REQUIRED'});
  assert.equal(f.alarms.size,0);
});

test('app Host uses the existing owned storage and rejects caller-chosen ownership and forbidden SDK',async()=>{
  const f=await fixture();
  await f.call('browser.storage.local.set',{items:{answer:5050}});
  assert.deepEqual(await f.call('browser.storage.local.get'),{items:{answer:5050}});
  assert.deepEqual(f.values.get(sidebarToolStorageKey('foreign-app')),{secret:42});
  for(const operation of ['browser.tabs.create','browser.storage.local.clear','browser.network.request'])
    await assert.rejects(f.call(operation),{code:'E_CAPABILITY'});
  await assert.rejects(f.call('browser.storage.local.get',{owner:'foreign-app'}),{code:'E_SCHEMA'});
  for(const field of ['appId','packageHash','codeHash','generation'])
    await assert.rejects(f.call('browser.storage.local.set',{items:{bad:true}},{binding:{...f.binding,[field]:'forged'}}));
  assert.equal(f.values.get(sidebarToolStorageKey(f.tool.id)).bad,undefined);
});

test('run stop during asynchronous installation verification blocks the impending write',async()=>{
  const f=await fixture();let stopped=false;
  f.afterRead(keys=>{if(Array.isArray(keys)&&keys.includes(SIDEBAR_TOOL_STORE))stopped=true;});
  await assert.rejects(f.call('browser.storage.local.set',{items:{bad:true}},
    {authorize:async()=>{if(stopped)throw Object.assign(Error('stopped'),{code:'E_CANCELLED'});}}),{code:'E_CANCELLED'});
  assert.equal(f.values.has(sidebarToolStorageKey(f.tool.id)),false);
});

test('confirmed storage effects are recorded before a concurrent stop fences delivery',async()=>{
  const f=await fixture();let stopped=false,receipt,dispatched=false;
  f.afterWrite(()=>{stopped=true;});
  await assert.rejects(f.call('browser.storage.local.set',{items:{answer:5050}},
    {authorize:async()=>{if(stopped)throw Object.assign(Error('stopped'),{code:'E_CANCELLED'});},
      onDispatch:()=>{dispatched=true;},recordEffect:async value=>{receipt=value;}}),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(dispatched,true);assert.deepEqual(receipt,{written:1});
  assert.equal(f.values.get(sidebarToolStorageKey(f.tool.id)).answer,5050);
});

test('lost storage acknowledgement is reconciled; missing readback remains unknown without a fabricated receipt',async()=>{
  const f=await fixture();const set=f.api.storage.local.set;
  f.api.storage.local.set=async rows=>{await set(rows);throw Error('lost acknowledgement');};
  let receipt;
  assert.deepEqual(await f.call('browser.storage.local.set',{items:{answer:5050}},{recordEffect:async value=>{receipt=value;}}),{written:1});
  assert.deepEqual(receipt,{written:1});
  const g=await fixture();let reads=0,dispatched=false;
  await assert.rejects(executeBrowserToolStorage({api:{storage:{local:{
    get:async()=>{if(reads++)throw Error('lost readback');return {};},set:async()=>{}}}},operation:'browser.storage.local.set',
    toolId:g.tool.id,input:{items:{answer:1}},authorize:async()=>true,onDispatch:()=>{dispatched=true;},
    recordEffect:async()=>assert.fail('unconfirmed write cannot be a durable receipt')}),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(dispatched,true);
});
