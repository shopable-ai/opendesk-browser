// Isolated real Chrome IndexedDB load fixture. Terminal MISSED rows are
// synthetic; NEVER run this against an installed OpenDesk extension origin.
import {createStorage} from '/src/platform/storage/index.js';
import {createScheduleRepository} from '/src/platform/tasks/schedule-repository.js';
import {scheduleKey,fireKey,scheduleFireId} from '/src/platform/tasks/schedule-contract.js';

const namespace='tool:r23-scale-fixture',now=Date.now(),plans=5;
const db=await createStorage({name:'opendesk-r23-idb-isolated',version:2,clock:{now:()=>now}});
const repo=createScheduleRepository({storage:db,namespace,clock:{now:()=>now}});
const base=now-100000*60000;
let inserted=0;
const indexKey='schedule:pending-index:v1:'+namespace;
const existing=await db.transaction(['frameworkKV'],'readonly',tx=>
  tx.get('frameworkKV',scheduleKey('scale-0')));
if(!existing)await db.transaction(['frameworkKV'],'readwrite',async tx=>{
  for(let i=0;i<plans;i++){
    const scheduleId='scale-'+i,fireId=scheduleFireId(scheduleId,10,now-10000-i);
    const plan={tag:'schedule-definition-v1',namespace,scheduleId,generation:10,
      title:'Synthetic schedule '+i,taskId:'fixture.task',version:'1.0.0',
      manifestHash:'0'.repeat(64),sourceHash:'0'.repeat(64),
      installationId:'00000000-0000-4000-8000-000000000000',
      taskGeneration:1,params:{},targetUrl:location.origin+'/bench',
      openIfMissing:false,timezone:'UTC',triggerKind:'once',
      triggerSpec:{at:now+86400000},misfirePolicy:'skip',
      startDeadlineMs:300000,paused:false,deleted:false,nextDueAt:now+86400000,
      createdAt:now,updatedAt:now};
    await tx.put('frameworkKV',plan,scheduleKey(scheduleId));
    await tx.put('frameworkKV',{tag:'schedule-fire-v1',namespace,fireId,
      scheduleId,generation:10,scheduledAt:now-10000-i,deadlineAt:now+3600000,
      status:'WAITING_HOST',runId:null,resultId:null,createdAt:now},fireKey(fireId));
  }
});
const quantile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)];
async function measure(label,fn){
  const samples=[];
  for(let i=0;i<9;i++){
    const start=performance.now();
    await fn();
    samples.push(performance.now()-start);
  }
  return {label,p50Ms:quantile(samples,.5),p95Ms:quantile(samples,.95),samples};
}
async function benchmark(count){
  if(![1000,10000,100000].includes(count)||count<=inserted)
    throw Error('Invalid or out-of-order count '+count);
  const started=performance.now(),previous=inserted;
  for(let cursor=inserted;cursor<count;cursor+=400){
    const batch=[];
    for(let i=cursor;i<Math.min(cursor+400,count);i++){
      const scheduleId='scale-'+i%plans,generation=i<50000?9:10;
      const scheduledAt=base+Math.floor(i/plans)*60000;
      const fireId=scheduleFireId(scheduleId,generation,scheduledAt);
      batch.push({key:fireKey(fireId),row:{tag:'schedule-fire-v1',
        namespace,fireId,scheduleId,generation,scheduledAt,deadlineAt:scheduledAt+300000,
        status:'MISSED',runId:null,resultId:null,createdAt:scheduledAt}});
    }
    await db.transaction(['frameworkKV'],'readwrite',async tx=>
      Promise.all(batch.map(({key,row})=>tx.put('frameworkKV',row,key))));
    globalThis.scale.status.inserted=Math.min(cursor+400,count);
  }
  inserted=count;
  const seedMs=performance.now()-started;
  // Simulate the real first migration of legacy history using the original
  // Framework Storage marker, without forging any result or web effect.
  await db.transaction(['frameworkKV'],'readwrite',tx=>tx.delete('frameworkKV',indexKey));
  const migrationStart=performance.now();
  await repo.reconcile({activeDocumentIds:new Set()});
  const migrationMs=performance.now()-migrationStart;
  const pending=await repo.ready();
  if(pending.length!==5||new Set(pending.map(row=>row.fireId)).size!==5)
    throw Error('Pending Fire index has missing/duplicate identities');
  const first=await repo.history({scheduleId:'scale-0',offset:0,limit:20});
  if(first.history.length!==20||!first.hasMore)
    throw Error('Expected bounded first historical page');
  const deepOffset=Math.max(0,Math.floor(count/plans)-35);
  const deepStart=performance.now();
  const deep=await repo.history({scheduleId:'scale-0',offset:deepOffset,limit:20});
  const deepPageMs=performance.now()-deepStart;
  if(deep.history.length!==20||new Set(deep.history.map(row=>row.fireId)).size!==20)
    throw Error('Deep historical page has missing/duplicate FireIds');
  const metrics=[
    await measure('listSchedules',()=>repo.list()),
    await measure('listScheduleHistory',()=>repo.history({scheduleId:'scale-0',offset:20,limit:20})),
    await measure('reconcile',()=>repo.reconcile({activeDocumentIds:new Set()})),
    await measure('ready',()=>repo.ready())
  ];
  const estimate=await navigator.storage.estimate().catch(()=>({usage:null,quota:null}));
  return {count,planCount:plans,terminalRowsSeeded:count,seedAdded:count-previous,seedMs,
    migrationMs,pendingCount:pending.length,
    firstFireId:first.history[0].fireId,deepPageOffset:deepOffset,
    deepFirstFireId:deep.history[0].fireId,deepPageMs,
    originUsageBytes:estimate.usage??null,originQuotaBytes:estimate.quota??null,
    metrics,stageTotalMs:performance.now()-started};
}
globalThis.scale={ready:true,status:{phase:'idle'},begin(count){
  if(this.status.phase==='running')throw Error('Benchmark already running');
  this.status={phase:'running',count,inserted};
  void benchmark(count).then(result=>{this.status={phase:'done',count,result};},
    error=>{this.status={phase:'error',count,error:String(error?.stack||error)};});
},async probe(){
  const ready=await repo.ready();
  const historical=await repo.history({scheduleId:'scale-0',offset:0,limit:20});
  return {pendingIds:ready.map(row=>row.fireId),historyCount:historical.history.length};
}};
