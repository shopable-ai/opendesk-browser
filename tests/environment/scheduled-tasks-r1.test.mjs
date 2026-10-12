import test from 'node:test';
import assert from 'node:assert/strict';
import {nextScheduleAt,parseWallScheduleTime,formatWallScheduleTime,recentMissedAt} from '../../src/platform/tasks/schedule-time.js';
import {scheduleFireId,fireKey,validateScheduleInput} from '../../src/platform/tasks/schedule-contract.js';
import {createScheduleRepository} from '../../src/platform/tasks/schedule-repository.js';
import {createScheduleService,scheduledHostDocumentIds} from '../../src/platform/tasks/schedule-service.js';
import {createScheduledTaskHost} from '../../src/ui/scheduled-task-host.js';
import {createTaskPackage,installedKey,taskKey,taskScriptId} from '../../src/platform/tasks/contract.js';
import {digestUtf8} from '../../src/platform/protocol.js';

const millis=value=>Date.parse(value);
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
        delete:async(store,key)=>{buckets.get(store).delete(key);}
      });
      const next=queue.then(work);
      queue=next.catch(()=>{});
      return next;
    }
  };
}
async function fixture(){
  const db=storageFake(),namespace='tool:schedule-test';
  const source='async function main() { return true; }',sourceHash=await digestUtf8(source);
  const manifest={format:'opendesk.task.v1',taskId:'demo.form',version:'1.0.0',
    title:'Demo Form',description:'Test scheduled controller',author:'OpenDesk',
    source:'local-developer',siteOrigins:['https://example.com'],permissions:['page.automation'],
    entryFormat:'async-main',program:{revision:1,sourceHash},
    paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}};
  const pkg=await createTaskPackage(manifest,source);
  const installationId='12345678-1234-4123-8123-123456789abc';
  db.put('frameworkKV',taskKey(namespace,'demo.form','1.0.0'),{
    tag:'task-candidate-v1',namespace,taskId:'demo.form',version:'1.0.0',
    package:pkg,stage:'available',verification:{sourceHash,manifestHash:pkg.manifestHash}
  });
  db.put('frameworkKV',installedKey(namespace,'demo.form'),{
    tag:'task-installed-v1',namespace,taskId:'demo.form',version:'1.0.0',
    scriptId:taskScriptId('demo.form','1.0.0'),enabled:true,manifestHash:pkg.manifestHash,
    authorization:{installationId,generation:1}
  });
  db.put('commandJournal','host:test',{tag:'host',namespace,active:true,revoked:false});
  let time=millis('2026-10-12T10:00:00Z');
  const repo=createScheduleRepository({storage:db,clock:{now:()=>time},namespace});
  const input={title:'Nightly demo',taskId:'demo.form',version:'1.0.0',
    manifestHash:pkg.manifestHash,sourceHash,installationId,taskGeneration:1,
    params:{},targetUrl:'https://example.com/form',openIfMissing:false,
    timezone:'UTC',triggerKind:'once',triggerSpec:{at:time+60000},
    misfirePolicy:'skip',startDeadlineMs:300000,paused:false};
  return {db,repo,input,namespace,setTime:value=>{time=value;},getTime:()=>time};
}

test('DST gap moves to first real wall minute and fold chooses first copy',()=>{
  assert.equal(parseWallScheduleTime('America/New_York','2026-03-08T02:30'),millis('2026-03-08T07:00:00Z'));
  assert.equal(parseWallScheduleTime('America/New_York','2026-11-01T01:30'),millis('2026-11-01T05:30:00Z'));
  assert.equal(formatWallScheduleTime('Asia/Tokyo',millis('2026-10-13T00:30:00Z')),'2026-10-13T09:30');
});
test('once, daily, weekday and interval calculation preserves strict future rule',()=>{
  assert.equal(nextScheduleAt('once',{at:60000},'UTC',60000),null);
  assert.equal(nextScheduleAt('daily',{hour:9,minute:0},'Asia/Tokyo',millis('2026-10-12T00:00:00Z')),
    millis('2026-10-13T00:00:00Z'));
  assert.equal(nextScheduleAt('weekly',{days:[1],hour:9,minute:0},'Asia/Tokyo',millis('2026-10-12T01:00:00Z')),
    millis('2026-10-19T00:00:00Z'));
  assert.equal(nextScheduleAt('interval',{anchorAt:0,everyMinutes:15},'UTC',900000),1800000);
});
test('bad time zones, duplicate weekdays, unsafe URLs and unreasonable deadlines are denied',async()=>{
  assert.throws(()=>nextScheduleAt('daily',{hour:9,minute:0},'Asia/Invalid',0));
  assert.throws(()=>nextScheduleAt('weekly',{days:[1,1],hour:9,minute:0},'UTC',0));
  const f=await fixture();
  assert.throws(()=>validateScheduleInput({...f.input,targetUrl:'javascript:alert(1)'}));
  assert.throws(()=>validateScheduleInput({...f.input,startDeadlineMs:7200000}));
});
test('schedule binds one durable FireId once, and preserves the original run/results IDs',async()=>{
  const f=await fixture(),schedule=await f.repo.save(f.input);
  assert.equal(schedule.generation,1);
  assert.equal(schedule.nextDueAt,f.input.triggerSpec.at);
  f.setTime(f.input.triggerSpec.at+500);
  const created=await f.repo.reconcile();
  assert.equal(created.length,1);
  const pending=await f.repo.ready();
  assert.equal(pending.length,1);
  const fire=pending[0];
  assert.equal(fire.fireId,scheduleFireId(schedule.scheduleId,1,schedule.nextDueAt));
  assert.equal(fireKey(fire.fireId).startsWith('schedule:fire:v1:'),true);
  const request={source:{kind:'saved',scriptId:taskScriptId('demo.form','1.0.0'),contentHash:f.input.sourceHash},
    paramsDecoded:{},target:{mode:'borrowed',expectedUrl:f.input.targetUrl},requestId:fire.fireId,
    expectedTaskGeneration:1,expectedTaskInstallationId:f.input.installationId};
  await f.db.transaction(['frameworkKV'],'readwrite',async tx=>{
    const approved=await f.repo.admit(tx,fire.fireId,request,'https://example.com',f.getTime());
    await f.repo.bind(tx,approved,{runId:'run-test',resultId:'result-test'});
  });
  await assert.rejects(()=>f.db.transaction(['frameworkKV'],'readwrite',tx=>
    f.repo.admit(tx,fire.fireId,request,'https://example.com',f.getTime())),/consumed|expired/);
  const listed=await f.repo.list();
  assert.equal(listed[0].history[0].runId,'run-test');
  assert.equal(listed[0].history[0].resultId,'result-test');
  assert.equal((await f.repo.ready()).length,0);
});
test('pause, resume, deleted generations and stale writers cannot reuse prior FireId',async()=>{
  const f=await fixture(),row=await f.repo.save({...f.input,triggerKind:'daily',
    triggerSpec:{hour:10,minute:1}});
  const paused=await f.repo.changeState({scheduleId:row.scheduleId,expectedGeneration:row.generation,action:'pause'});
  assert.equal(paused.paused,true);
  assert.equal(paused.nextDueAt,null);
  await assert.rejects(()=>f.repo.changeState({scheduleId:row.scheduleId,expectedGeneration:row.generation,action:'delete'}));
  const resumed=await f.repo.changeState({scheduleId:row.scheduleId,expectedGeneration:paused.generation,action:'resume'});
  assert.equal(resumed.generation,3);
  assert.equal(resumed.paused,false);
  const removed=await f.repo.changeState({scheduleId:row.scheduleId,expectedGeneration:resumed.generation,action:'delete'});
  assert.equal(removed.deleted,true);
  assert.equal((await f.repo.list()).length,0);
});
test('bounded catch-up selects last eligible occurrence without accumulating missed repeats',async()=>{
  const f=await fixture();
  const row=await f.repo.save({...f.input,triggerKind:'interval',
    triggerSpec:{anchorAt:f.getTime()+60000,everyMinutes:1},misfirePolicy:'latest-within-hour'});
  f.setTime(f.getTime()+3600000);
  assert.equal(recentMissedAt(row,f.getTime()),f.getTime());
  await f.repo.reconcile();
  assert.equal((await f.repo.ready()).length,1);
  assert.equal((await f.repo.list())[0].history.length,1);
});


test('revoked installation is visibly marked needs attention while keeping plan identity',async()=>{
  const f=await fixture(),plan=await f.repo.save(f.input);
  await f.db.transaction(['frameworkKV'],'readwrite',async tx=>{
    const key=installedKey(f.namespace,'demo.form');
    const row=await tx.get('frameworkKV',key);
    await tx.put('frameworkKV',{...row,enabled:false},key);
  });
  const current=(await f.repo.list())[0];
  assert.equal(current.scheduleId,plan.scheduleId);
  assert.equal(current.needsAttention,true);
});
test('no active Host records WAITING_HOST and eventually MISSED without replay',async()=>{
  const f=await fixture(),plan=await f.repo.save(f.input);
  await f.db.transaction(['commandJournal'],'readwrite',tx=>tx.delete('commandJournal','host:test'));
  f.setTime(plan.nextDueAt+1000);
  await f.repo.reconcile();
  assert.equal((await f.repo.ready())[0].status,'WAITING_HOST');
  f.setTime(plan.nextDueAt+plan.startDeadlineMs+1000);
  await f.repo.reconcile();
  assert.equal((await f.repo.ready()).length,0);
  assert.equal((await f.repo.list())[0].history[0].status,'MISSED');
});
test('completed Controller Run is not displayed SUCCESS before resource release',async()=>{
  const f=await fixture(),plan=await f.repo.save(f.input);
  f.setTime(plan.nextDueAt+100);
  await f.repo.reconcile();
  const fire=(await f.repo.ready())[0];
  await f.db.transaction(['frameworkKV'],'readwrite',async tx=>{
    const admitted=await f.repo.admit(tx,fire.fireId,{
      source:{kind:'saved',scriptId:taskScriptId('demo.form','1.0.0'),contentHash:f.input.sourceHash},
      paramsDecoded:{},target:{mode:'borrowed',expectedUrl:f.input.targetUrl},requestId:fire.fireId,
      expectedTaskGeneration:1,expectedTaskInstallationId:f.input.installationId
    },'https://example.com',f.getTime());
    await f.repo.bind(tx,admitted,{runId:'scheduled-test-run',resultId:'scheduled-test-result'});
  });
  f.db.put('runs','scheduled-test-run',{tag:'controller-run',state:'completed',retirementState:'fenced',
    runId:'scheduled-test-run',resultId:'scheduled-test-result'});
  assert.equal((await f.repo.list())[0].history[0].status,'SETTLING');
  f.db.put('runs','scheduled-test-run',{tag:'controller-run',state:'completed',retirementState:'released',
    runId:'scheduled-test-run',resultId:'scheduled-test-result'});
  assert.equal((await f.repo.list())[0].history[0].status,'SUCCESS');
});

test('only actual Side Panel and explicit visible scheduled-runner TAB are scheduler hosts',async()=>{
  const ext='chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const base=ext+'/ui/tool.html',host='12345678-1234-4123-8123-123456789abc';
  const contexts=[
    {contextType:'TAB',documentId:'catalog',documentUrl:base+'?hostInstanceId='+host},
    {contextType:'TAB',documentId:'ordinary-tool',documentUrl:base+'?hostInstanceId='+host+'&toolId=quick-notes'},
    {contextType:'OFFSCREEN_DOCUMENT',documentId:'hidden',documentUrl:base+'?hostInstanceId='+host+'&scheduledRunner=1'},
    {contextType:'TAB',documentId:'spoofed',documentUrl:base+'?hostInstanceId='+host+'&scheduledRunner=1&toolId=quick-notes'},
    {contextType:'TAB',documentId:'frozen',documentLifecycle:'cached',documentUrl:base+'?hostInstanceId='+host+'&scheduledRunner=1'},
    {contextType:'SIDE_PANEL',documentId:'side',documentUrl:base+'?hostInstanceId='+host},
    {contextType:'TAB',documentId:'runner',documentUrl:base+'?hostInstanceId='+host+'&scheduledRunner=1'}
  ];
  const api={runtime:{id:'schedule-test',getURL:()=>base,getContexts:async()=>contexts}};
  assert.deepEqual([...await scheduledHostDocumentIds(api)].sort(),['runner','side']);
  assert.equal((await scheduledHostDocumentIds({runtime:{getURL:()=>base}})),null,'test-only missing Chrome API is explicit');
});
test('registered catalog alone cannot claim Host presence; live runner restores READY without replay',async()=>{
  const f=await fixture(),plan=await f.repo.save(f.input);
  const base='chrome-extension://abcdefghijklmnopabcdefghijklmnop/ui/tool.html';
  const host='12345678-1234-4123-8123-123456789abc';
  await f.db.transaction(['commandJournal'],'readwrite',async tx=>{
    const row=await tx.get('commandJournal','host:test');
    await tx.put('commandJournal',{...row,hostDocumentId:'doc-catalog',hostUrl:base+'?hostInstanceId='+host},'host:test');
  });
  const contexts=[{contextType:'TAB',documentId:'doc-catalog',documentUrl:base+'?hostInstanceId='+host}];
  const api={runtime:{id:'schedule-test',getURL:()=>base,getContexts:async()=>contexts},
    alarms:{getAll:async()=>[],create:async()=>{},clear:async()=>{}},
    permissions:{contains:async()=>true}};
  const service=createScheduleService({storage:f.db,api,clock:{now:f.getTime},assertHost:async()=>({}),
    emitToHost:async()=>{}});
  f.setTime(plan.nextDueAt+1000);
  const waiting=await service.listDueSchedules({},{});
  assert.equal(waiting.fires.length,1);
  assert.equal(waiting.fires[0].status,'WAITING_HOST');
  contexts.push({contextType:'TAB',documentId:'doc-runner',documentUrl:base+'?hostInstanceId='+host+'&scheduledRunner=1'});
  await f.db.transaction(['commandJournal'],'readwrite',tx=>tx.put('commandJournal',{
    tag:'host',namespace:f.namespace,active:true,revoked:false,hostDocumentId:'doc-runner',
    hostUrl:base+'?hostInstanceId='+host+'&scheduledRunner=1'
  },'host:runner'));
  const resumed=await service.listDueSchedules({},{});
  assert.equal(resumed.fires.length,1);
  assert.equal(resumed.fires[0].status,'READY');
  assert.equal(resumed.fires[0].fireId,waiting.fires[0].fireId,'recovery cannot mint a second occurrence');
  assert.equal((await f.repo.list())[0].history.length,1);
});

test('short outage latest-within-hour selects LAST occurrence, skip preserves first due',async()=>{
  for(const policy of ['latest-within-hour','skip']){
    const f=await fixture(),start=f.getTime(),spec={anchorAt:start+60000,everyMinutes:1};
    const plan=await f.repo.save({...f.input,triggerKind:'interval',triggerSpec:spec,
      misfirePolicy:policy,startDeadlineMs:300000});
    assert.equal(plan.nextDueAt,start+60000);
    // Chrome was asleep for 4 minutes, but the old first deadline (5 min)
    // has not expired. A catch-up plan must nevertheless choose minute 4.
    f.setTime(start+4*60000+1000);
    const changed=await f.repo.reconcile();
    assert.equal(changed.length,1);
    const [fire]=await f.repo.ready();
    assert.equal(fire.scheduledAt,policy==='latest-within-hour'?start+4*60000:start+60000);
    assert.equal(fire.fireId,scheduleFireId(plan.scheduleId,plan.generation,fire.scheduledAt));
    assert.equal((await f.repo.reconcile()).length,0,'same wall time must never mint a second FireId');
    assert.equal((await f.repo.list())[0].history.length,1);
  }
});

test('R2 schedule history pages 135 persisted fires without losing original identities',async()=>{
  const f=await fixture(),plan=await f.repo.save(f.input);
  for(let i=0;i<135;i++){
    const at=millis('2026-10-13T10:00:00Z')+i*60000;
    const fireId=scheduleFireId(plan.scheduleId,plan.generation,at);
    f.db.put('frameworkKV',fireKey(fireId),{
      tag:'schedule-fire-v1',namespace:f.namespace,fireId,
      scheduleId:plan.scheduleId,generation:plan.generation,scheduledAt:at,
      deadlineAt:at+300000,status:'MISSED',runId:null,resultId:null,createdAt:at
    });
  }
  const rows=await f.repo.list();
  assert.equal(rows.length,1);
  assert.equal(rows[0].history.length,20,'initial view is bounded');
  assert.equal(rows[0].history[0].scheduledAt,millis('2026-10-13T10:00:00Z')+134*60000);
  const second=await f.repo.history({scheduleId:plan.scheduleId,offset:20,limit:20});
  assert.equal(second.history.length,20);
  assert.equal(second.hasMore,true);
  assert.equal(second.history[0].scheduledAt,millis('2026-10-13T10:00:00Z')+114*60000);
  const last=await f.repo.history({scheduleId:plan.scheduleId,offset:120,limit:20});
  assert.equal(last.history.length,15);
  assert.equal(last.hasMore,false);
  assert.notEqual(last.history[0].fireId,rows[0].history[0].fireId);
  await assert.rejects(f.repo.history({scheduleId:plan.scheduleId,offset:-1,limit:20}));
});

test('R2 UNKNOWN side effect retains same FireId and never requeues',async()=>{
  const f=await fixture(),plan=await f.repo.save(f.input);
  f.setTime(plan.nextDueAt+1000);
  await f.repo.reconcile();
  const due=(await f.repo.ready())[0];
  await f.repo.recordWait(due.fireId,'UNKNOWN');
  await f.repo.reconcile();
  assert.equal((await f.repo.ready()).length,0);
  assert.equal((await f.repo.list())[0].history[0].fireId,due.fireId);
  assert.equal((await f.repo.recordWait(due.fireId,'WAITING_TARGET')).status,'UNKNOWN');
  await f.repo.changeState({scheduleId:plan.scheduleId,expectedGeneration:plan.generation,action:'pause'});
  assert.equal((await f.repo.list())[0].history[0].status,'UNKNOWN');
});
test('R2 task disable/update/uninstall/authorization rotation never silently rebind a schedule',async()=>{
  const edits=[
    row=>({...row,enabled:false}),
    row=>({...row,version:'1.0.1'}),
    row=>({...row,manifestHash:'f'.repeat(64)}),
    row=>({...row,authorization:{...row.authorization,generation:2}}),
    row=>({...row,authorization:{...row.authorization,
      installationId:'ffffffff-ffff-4fff-8fff-ffffffffffff'}}),
    ()=>null
  ];
  for(const edit of edits){
    const f=await fixture(),plan=await f.repo.save(f.input);
    const key=installedKey(f.namespace,plan.taskId);
    await f.db.transaction(['frameworkKV'],'readwrite',async tx=>{
      const row=edit(await tx.get('frameworkKV',key));
      if(row)await tx.put('frameworkKV',row,key);
      else await tx.delete('frameworkKV',key);
    });
    const current=(await f.repo.list())[0];
    assert.equal(current.needsAttention,true);
    assert.equal(current.version,plan.version);
    assert.equal(current.taskGeneration,plan.taskGeneration);
    assert.equal(current.manifestHash,plan.manifestHash);
    await assert.rejects(f.repo.save({...f.input,scheduleId:plan.scheduleId,
      expectedGeneration:plan.generation}),/Installed task authorization changed/);
  }
});
test('R2 website grant revocation is visible without re-requesting permission',async()=>{
  const f=await fixture(),plan=await f.repo.save(f.input);
  let granted=true,permissionRequests=0;
  const api={runtime:{id:'schedule-test',getURL:()=>
    'chrome-extension://abcdefghijklmnopabcdefghijklmnop/ui/tool.html',
    getContexts:async()=>[]},alarms:{getAll:async()=>[],create:async()=>{},clear:async()=>{}},
    permissions:{contains:async()=>granted,request:async()=>{permissionRequests++;return true;}}};
  const service=createScheduleService({storage:f.db,api,clock:{now:f.getTime},
    assertHost:async()=>({}),emitToHost:async()=>{}});
  assert.equal((await service.listSchedules({},{})).schedules[0].needsAttention,false);
  granted=false;
  const revoked=await service.listSchedules({},{});
  assert.equal(revoked.schedules[0].scheduleId,plan.scheduleId);
  assert.equal(revoked.schedules[0].needsAttention,true);
  assert.equal(permissionRequests,0);
  await assert.rejects(service.saveSchedule(f.input,{}),/Grant website access/);
  granted=true;
  assert.equal((await service.listSchedules({},{})).schedules[0].needsAttention,false);
  assert.equal(permissionRequests,0);
});
test('R2 rebuilt service restores only schedule-prefixed Chrome Alarms without duplication',async()=>{
  const f=await fixture(),plan=await f.repo.save(f.input);
  const alarms=new Map([['unrelated.cloud',{name:'unrelated.cloud',scheduledTime:42}]]);
  const api={runtime:{id:'schedule-test',getURL:()=> 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/ui/tool.html',
    getContexts:async()=>[]},
    alarms:{getAll:async()=>[...alarms.values()],
      create:async(name,{when})=>{alarms.set(name,{name,scheduledTime:when});},
      clear:async name=>{alarms.delete(name);}},
    permissions:{contains:async()=>true}};
  const service=()=>createScheduleService({storage:f.db,api,clock:{now:f.getTime},
    assertHost:async()=>({}),emitToHost:async()=>{}});
  await service().reconcile();
  const alarm='opendesk.schedule.v1:'+plan.scheduleId;
  assert.equal(alarms.get(alarm)?.scheduledTime,plan.nextDueAt);
  alarms.delete(alarm);
  await service().reconcile();
  assert.equal(alarms.get(alarm)?.scheduledTime,plan.nextDueAt);
  assert.equal(alarms.get('unrelated.cloud')?.scheduledTime,42);
  f.setTime(plan.nextDueAt+1000);
  await service().reconcile();
  const one=(await f.repo.ready())[0];
  await service().reconcile();
  assert.equal((await f.repo.ready())[0].fireId,one.fireId);
});

test('R2 native-prefix paging sorts generation 10 after 9 without mutating persisted FireId',async()=>{
  const f=await fixture();let def=await f.repo.save(f.input);
  for(let i=0;i<9;i++)
    def=await f.repo.changeState({scheduleId:def.scheduleId,expectedGeneration:def.generation,
      action:i%2===0?'pause':'resume'});
  assert.equal(def.generation,10);
  const base=millis('2026-10-13T10:00:00Z');
  for(let i=0;i<25;i++){
    const generation=i===24?10:9,at=base+i*60000;
    const fireId=scheduleFireId(def.scheduleId,generation,at);
    f.db.put('frameworkKV',fireKey(fireId),{
      tag:'schedule-fire-v1',namespace:f.namespace,fireId,
      scheduleId:def.scheduleId,generation,scheduledAt:at,deadlineAt:at+300000,
      status:'MISSED',runId:null,resultId:null,createdAt:at
    });
  }
  const first=(await f.repo.list())[0].history;
  assert.equal(first.length,20);
  assert.equal(first[0].generation,10,'generation 10 is newer than 9 regardless of key lexical order');
  const older=await f.repo.history({scheduleId:def.scheduleId,offset:20,limit:20});
  assert.equal(older.history.length,5);
  assert.equal(older.hasMore,false);
  assert.equal(older.history[0].scheduledAt,base+4*60000);
});

test('R2 lost completion after admitted Run never becomes WAITING_TARGET or mints a second Run',async()=>{
  const definition={taskId:'demo.form',version:'1.0.0',manifestHash:'a'.repeat(64),
    sourceHash:'b'.repeat(64),installationId:'install-approved',taskGeneration:7,
    targetUrl:'https://example.com/form',openIfMissing:true,params:{name:'R2'}};
  const fire={fireId:'sched:stable:7:1791819235665',
    deadlineAt:1791819535665,definition};
  const calls=[],owners=[],statuses=[];
  let due=true,starts=0;
  const client={
    ready:new Promise(()=>{}),
    request:async(name,body)=>{
      calls.push({name,body});
      if(name==='listDueSchedules'){const fires=due?[fire]:[];due=false;return {fires};}
      if(name==='resolveInstalledTask')return {taskId:definition.taskId,version:definition.version,
        manifestHash:definition.manifestHash,contentHash:definition.sourceHash,
        installationId:definition.installationId,generation:definition.taskGeneration,
        revision:1,scriptId:'task:demo.form:1.0.0'};
      if(name==='setScheduleFireState')throw Error('Never mutate already ADMITTED Fire');
      throw Error('Unexpected operation '+name);
    }
  };
  const host={executionPending:false,start:async(input)=>{
    starts++;assert.equal(input.scheduledFireId,fire.fireId);
    return {runId:'run-accepted-once'};
  },get completion(){return Promise.reject(Error('Lost native completion acknowledgement'));}};
  const scheduled=createScheduledTaskHost({client,host,
    api:{tabs:{query:async()=>[]}},clock:()=>1791819300000,pollMs:600000,
    onRun:id=>owners.push(id),onStatus:value=>statuses.push(value)});
  try{
    await scheduled.poll();
    await scheduled.poll();
    assert.equal(starts,1,'post-admission errors cannot start a replacement Run');
    assert.deepEqual(owners,['run-accepted-once',null],
      'stop control must be cleared even if original completion promise rejects');
    assert.equal(calls.some(c=>c.name==='setScheduleFireState'),false,
      'already ADMITTED Fire state must remain owned by original Authority/Result');
    assert.match(scheduled.status,/回执丢失|禁止自动重试/);
    assert.equal(statuses.some(s=>s.startsWith('等待目标或运行环境')),false);
  }finally{scheduled.dispose();}
});
