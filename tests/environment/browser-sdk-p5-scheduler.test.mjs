import test from 'node:test';
import assert from 'node:assert/strict';
import {createScheduleService} from '../../src/platform/tasks/schedule-service.js';
import {createTaskPackage,installedKey,taskKey,taskScriptId} from '../../src/platform/tasks/contract.js';
import {scheduleFireId,validateTrustedScheduleIntent} from '../../src/platform/tasks/schedule-contract.js';
import {scheduleSpecFromExpression} from '../../src/platform/tasks/schedule-time.js';
import {digestUtf8} from '../../src/platform/protocol.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

const at=value=>Date.parse(value);
const SHA='a'.repeat(64);
const toolPackage={format:'opendesk.sidebar-tool.v2',id:'scheduler-tool',version:'1.0.0',
  title:'Scheduler Tool',description:'Scheduler owner fixture',capabilities:['browser.scheduler'],
  html:'<main>Scheduler</main>',css:'',js:'void 0;',requires:{browserSdk:'1.0.0'},
  contributes:{contextMenus:[]}};
const owner={kind:'installed-tool-owned',toolId:'scheduler-tool',toolVersion:'1.0.0',
  packageHash:SHA,epoch:'epoch-1',installEpoch:'epoch-1'};
const foreign={...owner,toolId:'foreign-tool'};
const error=code=>e=>e?.code===code;

function storageFake(){
  const buckets=new Map([['frameworkKV',new Map()],['commandJournal',new Map()],['runs',new Map()]]);
  let queue=Promise.resolve();
  return {
    put(store,key,value){buckets.get(store).set(key,structuredClone(value));},
    transaction(names,mode,callback){
      const work=()=>callback({
        get:async(store,key)=>structuredClone(buckets.get(store).get(key)),
        put:async(store,row,key)=>{buckets.get(store).set(key,structuredClone(row));},
        all:async store=>structuredClone([...buckets.get(store).values()]),
        scan:async(store,{prefix,direction='next',offset=0,limit=50})=>{
          const rows=[...buckets.get(store).entries()].filter(([key])=>String(key).startsWith(prefix))
            .sort(([a],[b])=>a<b?-1:a>b?1:0);
          if(direction==='prev')rows.reverse();
          return structuredClone(rows.slice(offset,offset+limit).map(([,value])=>value));
        },
        scanEntries:async(store,{prefix,afterKey,limit=50})=>structuredClone([...buckets.get(store).entries()]
          .filter(([key])=>String(key).startsWith(prefix)&&(afterKey===undefined||String(key)>afterKey))
          .sort(([a],[b])=>a<b?-1:a>b?1:0).slice(0,limit).map(([key,value])=>({key,value}))),
        countPrefix:async(store,prefix)=>[...buckets.get(store).keys()]
          .filter(key=>String(key).startsWith(prefix)).length,
        delete:async(store,key)=>{buckets.get(store).delete(key);}
      });
      const next=queue.then(work);
      queue=next.catch(()=>{});
      return next;
    }
  };
}

async function fixture(){
  const storage=storageFake(),namespace='tool:scheduler-ext';
  const source='async function main() { return "scheduled"; }',sourceHash=await digestUtf8(source);
  const manifest={format:'opendesk.task.v1',taskId:'demo.form',version:'1.0.0',
    title:'Demo Form',description:'Browser SDK scheduler task',author:'OpenDesk',
    source:'local-developer',siteOrigins:['https://example.com'],permissions:['page.automation'],
    entryFormat:'async-main',program:{revision:3,sourceHash},
    paramsSchema:{type:'object',properties:{value:{type:'integer',title:'Value',minimum:0,maximum:99}},
      required:['value'],additionalProperties:false}};
  const pkg=await createTaskPackage(manifest,source),installationId='12345678-1234-4123-8123-123456789abc';
  storage.put('frameworkKV',taskKey(namespace,manifest.taskId,manifest.version),{
    tag:'task-candidate-v1',namespace,taskId:manifest.taskId,version:manifest.version,
    package:pkg,stage:'available',verification:{sourceHash,manifestHash:pkg.manifestHash}
  });
  storage.put('frameworkKV',installedKey(namespace,manifest.taskId),{
    tag:'task-installed-v1',namespace,taskId:manifest.taskId,version:manifest.version,
    scriptId:taskScriptId(manifest.taskId,manifest.version),enabled:true,manifestHash:pkg.manifestHash,
    authorization:{installationId,generation:5}
  });
  storage.put('commandJournal','host:test',{tag:'host',namespace,active:true,revoked:false});
  let now=at('2026-10-14T00:00:30Z'),siteGranted=true,ownerAllowed=true;
  const alarms=new Map(),ownerChecks=[];
  const localStorage=new Map();
  localStorage.set(SIDEBAR_TOOL_STORE,[toolPackage]);
  localStorage.set(SIDEBAR_TOOL_ENABLE_STORE,{});
  localStorage.set(TOOL_REVOCATION_EPOCHS_STORE,{[toolPackage.id]:owner.epoch});
  const localGet=async keys=>{
    const names=Array.isArray(keys)?keys:typeof keys==='string'?[keys]:Object.keys(keys||{});
    return Object.fromEntries(names.map(key=>[key,structuredClone(localStorage.get(key))]));
  };
  const localSet=async values=>{for(const [key,value] of Object.entries(values))localStorage.set(key,structuredClone(value));};
  const api={runtime:{id:'scheduler-ext',getURL:()=> 'chrome-extension://scheduler-ext/ui/tool.html',
    getContexts:async()=>null},
    storage:{local:{get:localGet,set:localSet}},
    permissions:{contains:async request=>{
      if(request.origins)return siteGranted;
      if(request.permissions)return true;
      return false;
    }},
    alarms:{getAll:async()=>[...alarms.values()],
      create:async(name,{when})=>{alarms.set(name,{name,scheduledTime:when});},
      clear:async name=>{alarms.delete(name);}}
  };
  const service=createScheduleService({storage,api,clock:{now:()=>now},assertHost:async()=>({}),
    emitToHost:async()=>{},assertToolOwner:async(context,operation,origin)=>{
      ownerChecks.push({context,operation,origin});
      if(!ownerAllowed||context.toolVersion!==owner.toolVersion||
        context.packageHash!==owner.packageHash||context.epoch!==owner.epoch)
        throw Object.assign(new Error('owner changed'),{code:'E_TOOL_CHANGED'});
    }});
  const taskRevisionRef={taskId:manifest.taskId,version:manifest.version,
    manifestHash:pkg.manifestHash,sourceHash,installationId,generation:5,revision:3,
    targetUrl:'https://example.com/form',params:{value:7}};
  const request={taskId:manifest.taskId,revision:'3',
    schedule:{kind:'interval',expression:'1m'}};
  const scheduleIntent={title:'Every minute',timezone:'UTC',triggerKind:'interval',
    triggerSpec:{anchorAt:0,everyMinutes:1},misfirePolicy:'skip',
    startDeadlineMs:300000,openIfMissing:true,paused:false};
  const intent={kind:'trusted-scheduler-create-intent-v1',request,task:taskRevisionRef,
    schedule:scheduleIntent};
  return {storage,service,api,alarms,ownerChecks,taskRevisionRef,request,scheduleIntent,intent,namespace,
    setNow:value=>{now=value;},now:()=>now,revokeSite:()=>{siteGranted=false;},
    revokeOwner:()=>{ownerAllowed=false;},
    setToolLocal:(key,value)=>localStorage.set(key,structuredClone(value)),
    defaultOwner:async()=>({...owner,packageHash:await sidebarToolPackageHash(toolPackage)}),
    disableInstall:async()=>{
      await storage.transaction(['frameworkKV'],'readwrite',async tx=>{
        const key=installedKey(namespace,manifest.taskId),row=await tx.get('frameworkKV',key);
        await tx.put('frameworkKV',{...row,enabled:false},key);
      });
    }};
}

async function admitReadyFire(f,plan,index,{service=f.service,expectedOwner=owner,prepare=false}={}){
  const fire=(await service.listDueSchedules({},{})).fires[0];
  assert.equal(fire.fireId,scheduleFireId(plan.scheduleRef,1,fire.scheduledAt));
  const admittedOwner=prepare?await service.prepareAdmission(fire.fireId,expectedOwner):expectedOwner;
  const request={source:{kind:'saved',scriptId:taskScriptId(f.taskRevisionRef.taskId,f.taskRevisionRef.version),
    contentHash:f.taskRevisionRef.sourceHash},paramsDecoded:f.taskRevisionRef.params,
    target:{mode:'owned',url:f.taskRevisionRef.targetUrl},requestId:fire.fireId,
    expectedScheduleOwner:admittedOwner,expectedTaskGeneration:f.taskRevisionRef.generation,
    expectedTaskInstallationId:f.taskRevisionRef.installationId};
  await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
    const admitted=await service.admit(tx,fire.fireId,request,'https://example.com',f.now());
    await service.bind(tx,admitted,{runId:'run-'+index,resultId:'result-'+index});
  });
  return fire;
}

test('P5 revoked tool Alarm is retired while another installed owner keeps its Alarm',async()=>{
  for(const change of ['upgrade','epoch','disable','uninstall']){
    const f=await fixture(),currentOwner=await f.defaultOwner();
    const peerTool={...toolPackage,id:'scheduler-peer',title:'Scheduler Peer'};
    const peerOwner={...currentOwner,toolId:peerTool.id,packageHash:await sidebarToolPackageHash(peerTool),epoch:'peer-epoch',installEpoch:'peer-epoch'};
    f.setToolLocal(SIDEBAR_TOOL_STORE,[toolPackage,peerTool]);
    f.setToolLocal(TOOL_REVOCATION_EPOCHS_STORE,{[toolPackage.id]:currentOwner.epoch,[peerTool.id]:peerOwner.epoch});
    const service=createScheduleService({storage:f.storage,api:f.api,clock:{now:f.now},assertHost:async()=>({}),emitToHost:async()=>{}});
    const own=await service.create(f.request,currentOwner,f.intent);
    const peer=await service.create(f.request,peerOwner,f.intent);
    const ownAlarm='opendesk.schedule.v1:'+own.scheduleRef,peerAlarm='opendesk.schedule.v1:'+peer.scheduleRef;
    assert(f.alarms.has(ownAlarm));assert(f.alarms.has(peerAlarm));
    if(change==='upgrade')f.setToolLocal(SIDEBAR_TOOL_STORE,[{...toolPackage,version:'1.0.1'},peerTool]);
    if(change==='epoch')f.setToolLocal(TOOL_REVOCATION_EPOCHS_STORE,{[toolPackage.id]:'retired-epoch',[peerTool.id]:peerOwner.epoch});
    if(change==='disable')f.setToolLocal(SIDEBAR_TOOL_ENABLE_STORE,{[toolPackage.id]:false});
    if(change==='uninstall')f.setToolLocal(SIDEBAR_TOOL_STORE,[peerTool]);
    await service.reconcile();
    assert.equal(f.alarms.has(ownAlarm),false,change+' must retire the old native Alarm');
    assert.equal(f.alarms.has(peerAlarm),true,change+' must preserve the other owner Alarm');
    await assert.rejects(service.listOwn({},currentOwner));
    assert.equal((await service.listOwn({},peerOwner)).schedules[0].scheduleRef,peer.scheduleRef);
  }
});

test('P5 scheduler create/list/cancel owns schedules by installed tool identity',async()=>{
  const f=await fixture(),created=await f.service.create(f.request,owner,f.intent);
  assert.match(created.scheduleRef,/^[A-Za-z0-9_-]{16,160}$/);
  assert.equal(created.status,'active');
  assert.equal(f.ownerChecks[0].operation,'browser.scheduler.create');
  assert.equal(f.ownerChecks[0].origin,'https://example.com');
  assert.deepEqual((await f.service.listOwn({},owner)).schedules.map(row=>row.scheduleRef),[created.scheduleRef]);
  assert.deepEqual((await f.service.listOwn({},foreign)).schedules,[]);
  await assert.rejects(f.service.cancelOwn({scheduleRef:created.scheduleRef},foreign),error('E_OWNER'));
  assert.deepEqual(await f.service.cancelOwn({scheduleRef:created.scheduleRef},owner),{cancelled:true});
  assert.deepEqual(await f.service.cancelOwn({scheduleRef:created.scheduleRef},owner),{cancelled:false});
  assert.deepEqual((await f.service.listOwn({},owner)).schedules,[]);
});

test('P5 scheduler still executes through existing scheduled RunHost admission twice',async()=>{
  const f=await fixture(),created=await f.service.create(f.request,owner,f.intent);
  f.setNow(at('2026-10-14T00:01:00Z')+100);
  const first=await admitReadyFire(f,created,1);
  assert.equal(first.scheduledAt,at('2026-10-14T00:01:00Z'));
  f.setNow(at('2026-10-14T00:02:00Z')+100);
  const second=await admitReadyFire(f,created,2);
  assert.equal(second.scheduledAt,at('2026-10-14T00:02:00Z'));
  const rows=(await f.service.listSchedules({},{})).schedules[0].history;
  assert.deepEqual(rows.map(row=>row.runId),['run-2','run-1']);
});

test('P5 scheduler converter supports fixed weekly weekday expression and rejects ambiguous forms',()=>{
  assert.deepEqual(scheduleSpecFromExpression({kind:'weekly',expression:'1,3 09:00'},'UTC'),
    {triggerKind:'weekly',triggerSpec:{days:[1,3],hour:9,minute:0}});
  assert.throws(()=>scheduleSpecFromExpression({kind:'weekly',expression:'1,1 09:00'},'UTC'),error('E_SCHEMA'));
  assert.throws(()=>scheduleSpecFromExpression({kind:'weekly',expression:'Mon,Wed 09:00'},'UTC'),error('E_SCHEMA'));
  assert.throws(()=>scheduleSpecFromExpression({kind:'weekly',expression:'1,3 at 09:00'},'UTC'),error('E_SCHEMA'));
  assert.throws(()=>scheduleSpecFromExpression({kind:'weekly',expression:'1,3 9:00'},'UTC'),error('E_SCHEMA'));
});

test('P5 scheduler rejects expression mismatches in trusted create intent',async()=>{
  const f=await fixture();
  const mismatched={...f.intent,schedule:{...f.scheduleIntent,triggerSpec:{anchorAt:0,everyMinutes:2}}};
  await assert.rejects(f.service.create(f.request,owner,mismatched),error('E_USER_GESTURE_REQUIRED'));
  assert.doesNotThrow(()=>validateTrustedScheduleIntent(f.intent,f.request));
});

test('P5 scheduler revalidates installed task and website grants before persistence or trigger replay',async()=>{
  const f=await fixture();
  await assert.rejects(f.service.create({...f.request,revision:'4'},owner,f.intent),
    error('E_USER_GESTURE_REQUIRED'));
  const created=await f.service.create(f.request,owner,f.intent);
  f.revokeSite();
  assert.equal((await f.service.listSchedules({},{})).schedules[0].needsAttention,true);
  await f.disableInstall();
  f.setNow(at('2026-10-14T00:01:00Z')+100);
  await f.service.reconcile();
  assert.equal((await f.service.listDueSchedules({},{})).fires.length,0);
  assert.equal((await f.service.listOwn({},owner)).schedules[0].status,'needs_attention');
  assert.equal((await f.service.cancelOwn({scheduleRef:created.scheduleRef},owner)).cancelled,true);
});

test('P5 scheduler default owner verifier admits two fires and blocks revocation without injected owner hook',async()=>{
  const f=await fixture(),currentOwner=await f.defaultOwner();
  const service=createScheduleService({storage:f.storage,api:f.api,clock:{now:f.now},assertHost:async()=>({}),
    emitToHost:async()=>{}});
  const created=await service.create(f.request,currentOwner,f.intent);
  assert.deepEqual((await service.listOwn({},currentOwner)).schedules,
    [{scheduleRef:created.scheduleRef,taskId:f.request.taskId,status:'active'}]);
  f.setNow(at('2026-10-14T00:01:00Z')+100);
  const pending=(await service.listDueSchedules({},{})).fires[0];
  await assert.rejects(service.prepareAdmission(pending.fireId,{...currentOwner,toolId:'foreign-tool'}),error('E_OWNER'));
  const first=await admitReadyFire(f,created,1,{service,expectedOwner:currentOwner,prepare:true});
  assert.equal(first.scheduledAt,at('2026-10-14T00:01:00Z'));
  f.setNow(at('2026-10-14T00:02:00Z')+100);
  const second=await admitReadyFire(f,created,2,{service,expectedOwner:currentOwner,prepare:true});
  assert.equal(second.scheduledAt,at('2026-10-14T00:02:00Z'));
  f.setToolLocal(TOOL_REVOCATION_EPOCHS_STORE,{[currentOwner.toolId]:'epoch-2'});
  await assert.rejects(service.listOwn({},currentOwner),error('E_OWNER'));
  f.setNow(at('2026-10-14T00:03:00Z')+100);
  await service.reconcile();
  assert.equal((await service.listDueSchedules({},{})).fires.length,0);
});

test('P5 scheduler default owner verifier marks schedule attention when target origin grant is revoked',async()=>{
  const f=await fixture(),currentOwner=await f.defaultOwner();
  const service=createScheduleService({storage:f.storage,api:f.api,clock:{now:f.now},assertHost:async()=>({}),
    emitToHost:async()=>{}});
  const created=await service.create(f.request,currentOwner,f.intent);
  f.revokeSite();
  f.setNow(at('2026-10-14T00:01:00Z')+100);
  await service.reconcile();
  assert.equal((await service.listDueSchedules({},{})).fires.length,0);
  await assert.rejects(service.prepareAdmission(scheduleFireId(created.scheduleRef,1,at('2026-10-14T00:01:00Z')),currentOwner),error('E_PERMISSION'));
  assert.deepEqual((await service.listOwn({},currentOwner)).schedules,
    [{scheduleRef:created.scheduleRef,taskId:f.request.taskId,status:'needs_attention'}]);
});

test('P5 scheduler prepareAdmission preserves existing manual schedules and rejects forged owner',async()=>{
  const f=await fixture();
  const input=validateTrustedScheduleIntent(f.intent,f.request);
  const manual=await f.service.saveSchedule(input,{});
  f.setNow(at('2026-10-14T00:01:00Z')+100);
  const fire=(await f.service.listDueSchedules({},{})).fires[0];
  assert.equal(fire.fireId,scheduleFireId(manual.scheduleId,1,fire.scheduledAt));
  assert.equal(await f.service.prepareAdmission(fire.fireId,undefined),undefined);
  await assert.rejects(f.service.prepareAdmission(fire.fireId,owner),error('E_OWNER'));
  const request={source:{kind:'saved',scriptId:taskScriptId(f.taskRevisionRef.taskId,f.taskRevisionRef.version),
    contentHash:f.taskRevisionRef.sourceHash},paramsDecoded:f.taskRevisionRef.params,
    target:{mode:'owned',url:f.taskRevisionRef.targetUrl},requestId:fire.fireId,
    expectedTaskGeneration:f.taskRevisionRef.generation,
    expectedTaskInstallationId:f.taskRevisionRef.installationId};
  await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
    const admitted=await f.service.admit(tx,fire.fireId,request,'https://example.com',f.now());
    await f.service.bind(tx,admitted,{runId:'manual-run',resultId:'manual-result'});
  });
  assert.equal((await f.service.listDueSchedules({},{})).fires.length,0);
});

test('P5 scheduler fails closed when current installed tool authority changes',async()=>{
  const f=await fixture();
  const created=await f.service.create(f.request,owner,f.intent);
  f.revokeOwner();
  await assert.rejects(f.service.listOwn({},owner),error('E_TOOL_CHANGED'));
  await assert.rejects(f.service.cancelOwn({scheduleRef:created.scheduleRef},owner),error('E_TOOL_CHANGED'));
  await assert.rejects(f.service.create(f.request,owner,f.intent),error('E_TOOL_CHANGED'));
});
