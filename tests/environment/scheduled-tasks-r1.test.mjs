import test from 'node:test';
import assert from 'node:assert/strict';
import {nextScheduleAt,parseWallScheduleTime,formatWallScheduleTime,recentMissedAt} from '../../src/platform/tasks/schedule-time.js';
import {scheduleFireId,fireKey,validateScheduleInput} from '../../src/platform/tasks/schedule-contract.js';
import {createScheduleRepository} from '../../src/platform/tasks/schedule-repository.js';
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
