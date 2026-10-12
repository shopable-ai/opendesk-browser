import {invariant,canonical} from '../protocol.js';
import {installedKey,taskKey,taskScriptId,validateTaskParams,verifyTaskPackage} from './contract.js';
import {scheduleKey,fireKey,scheduleFireId,SCHEDULE_DEFINITION_PREFIX,SCHEDULE_FIRE_PREFIX,validateScheduleInput} from './schedule-contract.js';
import {nextScheduleAt,recentMissedAt} from './schedule-time.js';

export function createScheduleRepository({storage,clock,namespace,session}){
  const now=()=>clock.now();
  const definitions=async tx=>(await tx.all('frameworkKV'))
    .filter(row=>row?.tag==='schedule-definition-v1'&&row.namespace===namespace&&!row.deleted);
  const fires=async tx=>(await tx.all('frameworkKV'))
    .filter(row=>row?.tag==='schedule-fire-v1'&&row.namespace===namespace);
  async function checkInstalled(tx,input){
    const install=await tx.get('frameworkKV',installedKey(namespace,input.taskId));
    invariant(install?.tag==='task-installed-v1'&&install.enabled&&
      install.version===input.version&&install.manifestHash===input.manifestHash&&
      install.authorization?.installationId===input.installationId&&
      install.authorization?.generation===input.taskGeneration,'E_PERMISSION','Installed task authorization changed');
    const candidate=await tx.get('frameworkKV',taskKey(namespace,input.taskId,input.version));
    invariant(candidate?.tag==='task-candidate-v1'&&candidate.stage==='available'&&
      candidate.verification?.manifestHash===input.manifestHash&&
      candidate.verification?.sourceHash===input.sourceHash,'E_VERIFICATION','Task is not a verified immutable installation');
    await verifyTaskPackage(candidate.package);
    const manifest=candidate.package.manifest;
    invariant(candidate.package.manifestHash===input.manifestHash&&
      manifest.program.sourceHash===input.sourceHash&&
      manifest.siteOrigins.includes(new URL(input.targetUrl).origin),'E_PERMISSION','Target outside approved website');
    return validateTaskParams(manifest.paramsSchema,input.params);
  }
  async function save(input){
    const checked=validateScheduleInput(input),time=now();
    return storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      const id=checked.scheduleId??crypto.randomUUID(),key=scheduleKey(id);
      const old=await tx.get('frameworkKV',key);
      if(!old)invariant((await definitions(tx)).length<128,'E_LIMIT','No more than 128 active schedules');
      invariant(old?old.namespace===namespace&&!old.deleted&&checked.expectedGeneration===old.generation:
        checked.expectedGeneration===undefined||checked.expectedGeneration===null,
        'E_REVISION','Schedule was modified by another host');
      const params=await checkInstalled(tx,checked);
      const generation=(old?.generation??0)+1;
      const nextDueAt=checked.paused?null:nextScheduleAt(checked.triggerKind,checked.triggerSpec,checked.timezone,time-1);
      const definition={tag:'schedule-definition-v1',namespace,scheduleId:id,generation,
        title:checked.title,taskId:checked.taskId,version:checked.version,
        manifestHash:checked.manifestHash,sourceHash:checked.sourceHash,
        installationId:checked.installationId,taskGeneration:checked.taskGeneration,params,
        targetUrl:checked.targetUrl,openIfMissing:checked.openIfMissing,timezone:checked.timezone,
        triggerKind:checked.triggerKind,triggerSpec:checked.triggerSpec,misfirePolicy:checked.misfirePolicy,
        startDeadlineMs:checked.startDeadlineMs,paused:checked.paused,nextDueAt,
        createdAt:old?.createdAt??time,updatedAt:time,deleted:false};
      await tx.put('frameworkKV',definition,key);
      return structuredClone(definition);
    });
  }
  async function changeState({scheduleId,expectedGeneration,action}){
    const time=now();
    invariant(['pause','resume','delete'].includes(action),'E_SCHEMA');
    return storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      const key=scheduleKey(scheduleId),old=await tx.get('frameworkKV',key);
      invariant(old?.tag==='schedule-definition-v1'&&old.namespace===namespace&&!old.deleted&&
        old.generation===expectedGeneration,'E_REVISION','Schedule version changed');
      const paused=action!=='resume',deleted=action==='delete';
      const row={...old,generation:old.generation+1,paused,deleted,updatedAt:time,
        nextDueAt:paused?null:nextScheduleAt(old.triggerKind,old.triggerSpec,old.timezone,time)};
      await tx.put('frameworkKV',row,key);
      return structuredClone(row);
    });
  }
  async function reconcile(){
    const time=now();
    return storage.transaction(['frameworkKV','commandJournal'],'readwrite',async tx=>{
      const activeHost=(await tx.all('commandJournal')).some(row=>row?.tag==='host'&&
        row.namespace===namespace&&row.active&&!row.revoked&&
        (session===undefined||row.browserSessionIncarnation===session));
      const changed=[];
      for(const def of await definitions(tx)){
        if(def.paused||def.nextDueAt===null||def.nextDueAt>time)continue;
        let due=def.nextDueAt;
        if(due<time-def.startDeadlineMs&&def.misfirePolicy==='latest-within-hour'){
          const recent=recentMissedAt(def,time);
          if(recent!==null)due=recent;
        }
        const fireId=scheduleFireId(def.scheduleId,def.generation,due);
        const key=fireKey(fireId),existing=await tx.get('frameworkKV',key);
        const deadlineAt=due+(def.misfirePolicy==='latest-within-hour'?3600000:def.startDeadlineMs);
        const status=time<=deadlineAt?'READY':'MISSED';
        if(!existing){
          await tx.put('frameworkKV',{tag:'schedule-fire-v1',namespace,fireId,scheduleId:def.scheduleId,
            generation:def.generation,scheduledAt:due,deadlineAt,status,createdAt:time,
            runId:null,resultId:null},key);
          changed.push(fireId);
        }
        def.nextDueAt=nextScheduleAt(def.triggerKind,def.triggerSpec,def.timezone,time);
        def.updatedAt=time;
        await tx.put('frameworkKV',def,scheduleKey(def.scheduleId));
      }
      for(const fire of await fires(tx)){
        if(fire.status!=='READY'&&fire.status!=='WAITING_HOST'&&fire.status!=='WAITING_SLOT'&&fire.status!=='WAITING_TARGET')continue;
        const def=await tx.get('frameworkKV',scheduleKey(fire.scheduleId));
        const state=def?.generation!==fire.generation||def.paused||def.deleted?'CANCELLED':
          fire.deadlineAt<time?'MISSED':!activeHost?'WAITING_HOST':fire.status;
        if(state!==fire.status)await tx.put('frameworkKV',{...fire,status:state},fireKey(fire.fireId));
      }
      return changed;
    });
  }
  async function list(){
    return storage.transaction(['frameworkKV','runs'],'readonly',async tx=>{
      const all=await definitions(tx),allFires=await fires(tx);
      const installs=new Map();
      for(const def of all)if(!installs.has(def.taskId))
        installs.set(def.taskId,await tx.get('frameworkKV',installedKey(namespace,def.taskId)));
      const scheduleRows=all.map(def=>{
        const history=allFires.filter(f=>f.scheduleId===def.scheduleId)
          .sort((a,b)=>b.scheduledAt-a.scheduledAt).slice(0,20);
        const installed=installs.get(def.taskId);
        const needsAttention=!installed||!installed.enabled||installed.version!==def.version||
          installed.manifestHash!==def.manifestHash||
          installed.authorization?.installationId!==def.installationId||
          installed.authorization?.generation!==def.taskGeneration;
        return {...def,needsAttention,history};
      });
      const runIds=new Set(scheduleRows.flatMap(d=>d.history.map(f=>f.runId).filter(Boolean)));
      const runs=new Map();
      for(const id of runIds)runs.set(id,await tx.get('runs',id));
      return scheduleRows.map(d=>({...d,history:d.history.map(f=>{
        const run=runs.get(f.runId);
        return {...f,status:run?(run.state==='paused_unknown'?'UNKNOWN':run.retirementState==='released'?
          (run.state==='completed'?'SUCCESS':run.state==='stopped'?'STOPPED':'FAILED'):
          ['completed','failed','stopped','interrupted'].includes(run.state)?'SETTLING':'RUNNING'):f.status,
          resultId:run?.resultId??f.resultId??null,retirementState:run?.retirementState??null};
      })}));
    });
  }
  async function ready(){
    return storage.transaction(['frameworkKV'],'readonly',async tx=>{
      const all=await definitions(tx),map=new Map(all.map(row=>[row.scheduleId,row]));
      return (await fires(tx)).filter(f=>['READY','WAITING_HOST','WAITING_SLOT','WAITING_TARGET'].includes(f.status)&&
        f.deadlineAt>=now()&&map.get(f.scheduleId)?.generation===f.generation&&
        !map.get(f.scheduleId)?.paused).sort((a,b)=>a.scheduledAt-b.scheduledAt).slice(0,12)
        .map(f=>({...f,definition:structuredClone(map.get(f.scheduleId))}));
    });
  }
  async function recordWait(fireId,status){
    invariant(['WAITING_HOST','WAITING_TARGET','WAITING_SLOT','UNKNOWN','NEEDS_ATTENTION'].includes(status),'E_SCHEMA');
    return storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      const key=fireKey(fireId),fire=await tx.get('frameworkKV',key);
      invariant(fire?.tag==='schedule-fire-v1'&&fire.namespace===namespace,'E_SCHEMA','Unknown occurrence');
      if(fire.status==='ADMITTED'||fire.status==='UNKNOWN'||fire.status==='MISSED'||fire.status==='CANCELLED')return fire;
      const next={...fire,status,updatedAt:now()};
      await tx.put('frameworkKV',next,key);
      return next;
    });
  }
  async function admit(tx,fireId,request,origin,time){
    const key=fireKey(fireId),fire=await tx.get('frameworkKV',key);
    invariant(fire?.tag==='schedule-fire-v1'&&fire.namespace===namespace&&
      ['READY','WAITING_HOST','WAITING_SLOT','WAITING_TARGET'].includes(fire.status)&&fire.deadlineAt>=time,
      'E_PERMISSION','Scheduled occurrence was consumed or expired');
    const definition=await tx.get('frameworkKV',scheduleKey(fire.scheduleId));
    invariant(definition?.tag==='schedule-definition-v1'&&!definition.deleted&&!definition.paused&&
      definition.namespace===namespace&&definition.generation===fire.generation&&
      definition.installationId===request.expectedTaskInstallationId&&
      definition.taskGeneration===request.expectedTaskGeneration&&
      definition.sourceHash===(request.source?.contentHash??request.contentHash)&&
      (request.source?.scriptId??request.scriptId)===taskScriptId(definition.taskId,definition.version)&&
      origin===new URL(definition.targetUrl).origin&&
      canonical(definition.params)===canonical(request.paramsDecoded),
      'E_PERMISSION','Scheduled run no longer matches immutable approval');
    invariant(request.requestId===fireId,'E_PERMISSION','Scheduled occurrence requestId must be stable');
    invariant((request.target.mode==='borrowed'&&request.target.expectedUrl===definition.targetUrl)||
      (request.target.mode==='owned'&&definition.openIfMissing&&request.target.url===definition.targetUrl),
      'E_TARGET','Scheduled target differs from approval');
    return fire;
  }
  async function bind(tx,fire,run){
    await tx.put('frameworkKV',{...fire,status:'ADMITTED',runId:run.runId,
      resultId:run.resultId,admittedAt:now()},fireKey(fire.fireId));
  }
  return {save,changeState,reconcile,list,ready,recordWait,admit,bind,
    definitions:()=>storage.transaction(['frameworkKV'],'readonly',definitions)};
}
