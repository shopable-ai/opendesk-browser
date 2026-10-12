import {invariant} from '../protocol.js';
import {permissionPattern} from '../../environment.js';
import {createScheduleRepository} from './schedule-repository.js';
import {SCHEDULE_ALARM_PREFIX,scheduleKey} from './schedule-contract.js';

export function createScheduleService({storage,api,clock,session,assertHost,emitToHost}){
  const namespace=`tool:${api.runtime.id}`;
  const repo=createScheduleRepository({storage,clock,namespace,session});
  const checkSender=async sender=>assertHost(sender);
  async function signal(){
    const rows=await storage.transaction(['commandJournal'],'readonly',async tx=>(await tx.all('commandJournal'))
      .filter(row=>row?.tag==='host'&&row.namespace===namespace&&row.active&&!row.revoked&&
        (session===undefined||row.browserSessionIncarnation===session)));
    await Promise.allSettled(rows.map(row=>emitToHost(row.registrationId,{type:'scheduled-fire-ready'})));
  }
  async function syncAlarms(){
    // Test-only broker shims may omit alarms; production MV3 declares the API.
    if(!api.alarms?.getAll||!api.alarms?.create||!api.alarms?.clear)return;
    const definitions=await repo.definitions();
    const expected=new Map(definitions.filter(d=>!d.paused&&d.nextDueAt!==null)
      .map(d=>[SCHEDULE_ALARM_PREFIX+d.scheduleId,d.nextDueAt]));
    const actual=await api.alarms.getAll();
    for(const row of actual){
      if(!row.name.startsWith(SCHEDULE_ALARM_PREFIX))continue;
      const wanted=expected.get(row.name);
      if(wanted===undefined){await api.alarms.clear(row.name);continue;}
      if(Math.abs(row.scheduledTime-wanted)>1500)await api.alarms.create(row.name,{when:wanted});
    }
    for(const [name,when] of expected)
      if(!actual.some(a=>a.name===name))await api.alarms.create(name,{when});
  }
  async function reconcile(){
    const changed=await repo.reconcile();
    await syncAlarms();
    if(changed.length)await signal();
    return changed;
  }
  async function saveSchedule(request,sender){
    await checkSender(sender);
    // Saving an approval never prompts. Permission may be revoked at any time,
    // and the original Controller Authority checks again on real admission.
    const origin=new URL(request.targetUrl).origin;
    invariant(await api.permissions.contains({origins:[permissionPattern(origin)]}),'E_PERMISSION','Grant website access before scheduling');
    if(request.triggerKind==='once')invariant(request.triggerSpec.at>clock.now(),'E_SCHEMA','One-time execution must be in the future');
    const row=await repo.save(request);
    await reconcile();
    return row;
  }
  async function changeSchedule(request,sender){
    await checkSender(sender);
    invariant(request&&Object.keys(request).length===3&&
      ['scheduleId','expectedGeneration','action'].every(k=>Object.hasOwn(request,k)),
      'E_SCHEMA','Invalid schedule change');
    const row=await repo.changeState(request);
    await reconcile();
    return row;
  }
  async function listSchedules(request,sender){
    await checkSender(sender);
    invariant(request&&Object.keys(request).length===0,'E_SCHEMA');
    await reconcile();
    const schedules=await repo.list();
    const origins=[...new Set(schedules.map(row=>new URL(row.targetUrl).origin))];
    const grants=new Map(await Promise.all(origins.map(async origin=>[
      origin,api.permissions?.contains?await api.permissions.contains({origins:[permissionPattern(origin)]}).catch(()=>false):false
    ])));
    return {schedules:schedules.map(row=>({...row,
      needsAttention:row.needsAttention||grants.get(new URL(row.targetUrl).origin)!==true}))};
  }
  async function listDueSchedules(request,sender){
    await checkSender(sender);
    invariant(request&&Object.keys(request).length===0,'E_SCHEMA');
    await reconcile();
    return {fires:await repo.ready()};
  }
  async function setScheduleFireState(request,sender){
    await checkSender(sender);
    invariant(request&&Object.keys(request).length===2&&
      Object.hasOwn(request,'fireId')&&Object.hasOwn(request,'status'),'E_SCHEMA');
    const row=await repo.recordWait(request.fireId,request.status);
    await reconcile();
    return {fireId:row.fireId,status:row.status};
  }
  async function onAlarm(alarm){
    if(typeof alarm?.name!=='string'||!alarm.name.startsWith(SCHEDULE_ALARM_PREFIX))return false;
    await reconcile();return true;
  }
  return {saveSchedule,changeSchedule,listSchedules,listDueSchedules,setScheduleFireState,onAlarm,reconcile,
    admit:repo.admit,bind:repo.bind};
}
