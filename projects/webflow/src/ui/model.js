// Web Flow's pure sandbox presentation model. It never authorizes or runs Tasks.
(function(global){
  'use strict';
  const fields=['taskId','version','manifestHash','contentHash'];
  const bounded=(x,n=120)=>String(x==null?'':x).slice(0,n);
  const taskKey=task=>fields.map(k=>task[k]).join('|');
  const pinsEqual=(a,b)=>fields.every(k=>a&&b&&a[k]===b[k]);
  const terminal=new Set(['completed','failed','stopped','interrupted','cancelled','canceled','unknown']);
  const taskStates={E_TASK_NOT_INSTALLED:'missing',E_TASK_REMOVED:'removed',
    E_TASK_DISABLED:'disabled',E_TASK_INITIALIZATION:'initialization',
    E_BUILTIN_VERSION_UNAVAILABLE:'runtime'};
  const errorState=error=>taskStates[error?.code]|| (error&&error.code==='E_REVISION'?'changed':
    error&&['E_PERMISSION','E_TOOL_DISABLED','E_OWNER'].includes(error.code)?'unavailable':'error');
  // Installation state comes from the Task Authority, never from display seeds.
  function taskReadMessage(error){
    if(!error)return '未读取到有效的任务安装。请到“我的”安装或恢复此任务，再刷新脚本状态。';
    if(error.code==='E_PERMISSION')return error.message==='Task is disabled or not installed'?
      '此任务尚未安装或已停用。请到“我的”安装或恢复此任务，再刷新脚本状态。':
      '任务或网站授权不可用。请到“我的”核对任务与网站授权，再刷新脚本状态。';
    return ({
      E_TASK_NOT_INSTALLED:'此脚本尚未安装。打开安装审阅，确认固定任务后再刷新。',
      E_TASK_REMOVED:'你已卸载此脚本，不会自动装回。需要使用时可打开安装审阅重新安装。',
      E_TASK_DISABLED:'此脚本已停用。打开任务管理可恢复，刷新或升级不会自动启用。',
      E_TASK_INITIALIZATION:'内置脚本初始化失败。请重试初始化；仍失败时展开诊断或打开安装审阅。',
      E_BUILTIN_VERSION_UNAVAILABLE:'浏览器运行时已更新，此脚本的原验证已失效。请打开任务管理，对同一固定任务包重新验证并确认安装，再刷新脚本状态。',
      E_REVISION:'任务安装版本或验证状态已变化。请到“我的”核对固定版本与验证状态，再刷新脚本状态。',
      E_TOOL_DISABLED:'Web Flow 已停用。请到“扩展”恢复应用后重新打开。',
      E_OWNER:'当前应用无权读取此任务。请到“扩展”核对 Web Flow 的任务授权后重新打开。'
    })[error.code]||'任务状态读取失败。请刷新脚本状态；仍失败时展开详情查看诊断信息。';
  }
  // Read-only manifest projection, never a parameter draft or authorization.
  function taskMetadata(manifest){
    if(!manifest||typeof manifest!=='object')return {parameterCount:null};
    const metadata={parameterCount:null};
    if(typeof manifest.title==='string'&&manifest.title.trim())metadata.title=bounded(manifest.title,120);
    if(typeof manifest.description==='string')metadata.description=bounded(manifest.description,1000);
    if(Array.isArray(manifest.siteOrigins)){
      metadata.siteOrigins=manifest.siteOrigins.filter(x=>typeof x==='string');
      if(metadata.siteOrigins.length)metadata.site=metadata.siteOrigins.join(' · ');
    }
    const schema=manifest.paramsSchema;
    if(schema&&schema.type==='object'&&schema.properties&&typeof schema.properties==='object'&&
      !Array.isArray(schema.properties))metadata.parameterCount=Object.keys(schema.properties).length;
    return metadata;
  }
  // Only metadata from tasks.read may supply original Authority locators.
  // Copy no result data and never persist these refs into legacy app storage.
  function taskPreparations(records,task){
    if(!Array.isArray(records))return [];
    const seen=new Set();
    return records.filter(record=>{
      if(!record||typeof record.preparationId!=='string'||!record.preparationId.trim()||
        seen.has(record.preparationId)||!pinsEqual(task,record.task)||
        record.task.installationId!==task.installationId||record.task.generation!==task.generation||
        typeof record.state!=='string'||typeof record.settled!=='boolean')return false;
      seen.add(record.preparationId);return true;
    }).map(record=>({preparationId:record.preparationId,
      task:Object.fromEntries([...fields,'installationId','generation'].map(key=>[key,task[key]])),
      state:bounded(record.state,36),settled:record.settled,
      ...(typeof record.runId==='string'?{runId:record.runId}:{}),
      ...(typeof record.resultId==='string'?{resultId:record.resultId}:{})}));
  }
  function filterTasks(rows,query,filter,starred,sort='favorite'){
    const q=String(query||'').trim().toLocaleLowerCase();
    const saved=new Set(Array.isArray(starred)?starred:[]);
    return rows.filter(row=>{
      if(filter==='available'&&row.state!=='available')return false;
      if(filter==='attention'&&!['changed','unavailable','error',...Object.values(taskStates)].includes(row.state))return false;
      if(filter==='favorite'&&!saved.has(taskKey(row)))return false;
      return !q||[row.title,row.taskId,row.site,row.version].some(s=>
        String(s||'').toLocaleLowerCase().includes(q));
    }).sort((a,b)=>(sort==='name'?0:
      Number(saved.has(taskKey(b)))-Number(saved.has(taskKey(a))))||
      a.title.localeCompare(b.title,'zh-CN'));
  }
  function businessState(snapshot){
    const v=snapshot&&snapshot.value;
    if(!v||typeof v!=='object')return 'unverified';
    if(v.status==='success'&&Array.isArray(v.results)&&v.results.length)return 'reported-success';
    if(['blocked','no_results','dom_changed','dom_unavailable','stopped'].includes(v.status))return v.status;
    return 'unverified';
  }
  function projectRun(s,task,now=Date.now()){
    const result=s&&s.result;
    const persisted=Boolean(s?.runId&&s?.resultId&&result&&result.tag==='controller-result'&&
      result.runId===s.runId&&result.resultId===s.resultId&&terminal.has(result.state)&&result.state!=='unknown');
    const runtimeOk=Boolean(persisted&&result.outcome&&result.outcome.ok===true);
    return {
      clientRequestId:bounded(s&&s.clientRequestId,80),taskId:task.taskId,version:task.version,
      runId:bounded(s&&s.runId,80),resultId:bounded(s&&s.resultId,80),
      state:bounded(s&&s.state||'unknown',36),
      retirementState:bounded(s&&s.retirementState||'unknown',40),
      resultPersisted:persisted,runtimeOk,
      notSubmittedFenced:s?.semantic==='NOT_SUBMITTED_FENCED'&&s.state==='cancelled'&&!s.runId&&!s.resultId,
      business:runtimeOk?businessState(s):'unverified',
      count:runtimeOk&&Number.isSafeInteger(s.value&&s.value.count)?Math.min(9999,Math.max(0,s.value.count)):null,
      at:Number.isFinite(now)?now:Date.now(),
      delivery:'not_observed',aiReply:'not_observed'
    };
  }
  function recentRecords(value){
    if(!Array.isArray(value))return [];
    return value.slice(0,12).filter(x=>x&&typeof x==='object'&&
      typeof x.taskId==='string'&&typeof x.clientRequestId==='string')
      .map(x=>({
        clientRequestId:bounded(x.clientRequestId,80),taskId:bounded(x.taskId,60),
        version:bounded(x.version,30),runId:bounded(x.runId,80),resultId:bounded(x.resultId,80),
        state:bounded(x.state,36),retirementState:bounded(x.retirementState,40),
        resultPersisted:x.resultPersisted===true,runtimeOk:x.runtimeOk===true,
        notSubmittedFenced:x.notSubmittedFenced===true&&x.state==='cancelled'&&!x.runId&&!x.resultId,
        business:bounded(x.business,40),count:Number.isSafeInteger(x.count)?x.count:null,
        at:Number.isFinite(x.at)?x.at:0,delivery:'not_observed',aiReply:'not_observed'
      }));
  }
  function pendingRecord(value){
    if(!value||typeof value!=='object'||
      typeof value.clientRequestId!=='string'||!/^[A-Za-z0-9._:-]{1,80}$/.test(value.clientRequestId)||
      typeof value.taskId!=='string'||typeof value.version!=='string')return null;
    const task=value.task;
    const locator={clientRequestId:value.clientRequestId,taskId:value.taskId,version:value.version,
      at:Number.isFinite(value.at)?value.at:0,state:'unknown'};
    if(task&&task.taskId===value.taskId&&fields.every(k=>typeof task[k]==='string')&&
      typeof task.installationId==='string'&&Number.isSafeInteger(task.generation))
      locator.task=Object.fromEntries([...fields,'installationId','generation'].map(k=>[k,task[k]]));
    if(typeof value.params?.query==='string'&&value.params.query.length<=120&&value.params.limit===3)
      locator.params={query:value.params.query,limit:3};
    return locator;
  }
  function released(s){
    // UNKNOWN and completed alone never establish retirement. A pre-submit
    // cancellation needs the original Authority's affirmative durable fence.
    if(!s||s.state==='unknown')return false;
    if(s.semantic==='NOT_SUBMITTED_FENCED'&&s.state==='cancelled'&&!s.runId&&!s.resultId)return true;
    return ['completed','failed','stopped','interrupted','cancelled','canceled'].includes(s.state)&&
      s.retirementState==='released'&&s.result?.tag==='controller-result'&&
      Boolean(s.runId)&&Boolean(s.resultId)&&terminal.has(s.result.state)&&s.result.state!=='unknown'&&
      s.result.runId===s.runId&&s.result.resultId===s.resultId;
  }

  // Presentation-only projection of an already-read original Task snapshot.
  // A UI notice is never a Run/Result authority or a business-success receipt.
  function taskNotice(s,task){
    if(!s||typeof s.clientRequestId!=='string'||!s.clientRequestId||
      !task||typeof task.taskId!=='string'||s.taskId&&s.taskId!==task.taskId||
      s.semantic==='NOT_SUBMITTED_FENCED')return null;
    const title=bounded(task.title||task.taskId,55);
    const caption='可在「记录」查询原请求（只读）';
    const pack=(phase,message,type,timeout,detail=caption)=>{
      const options={message:type==='success'?message+'（仅脚本执行）':message,
        type,position:'bottom-right',timeout,caption:detail};
      return {phase,options,key:JSON.stringify(options)};
    };
    if(s.semantic==='UNKNOWN'||s.state==='unknown')
      return pack('unknown',title+'：结果未确认，禁止自动重试','warning',0);
    if(s.state==='running'&&s.runId)
      return pack('running',title+'：正在执行','info',0);
    if(['preparing','starting'].includes(s.state)&&s.runId)
      return pack('admitted',title+'：已获执行准入，正在启动','info',0);
    const project=projectRun(s,task);
    if(s.state==='failed'){
      if(!s.runId)return pack('admission-failed',title+'：任务准入或启动失败，请核对','warning',0);
      if(!project.resultPersisted||s.result?.state!=='failed'||project.runtimeOk)
        return pack('failure-unverified',title+'：失败状态待原结果核验','warning',0);
      const code=s.result?.outcome?.error?.code;
      const hint=typeof code==='string'&&/^[A-Z][A-Z0-9_]{1,49}$/.test(code)?
        '失败代码：'+code+'；可在「记录」核对':'可在「记录」核对失败原因';
      return pack('failed',title+'：脚本执行失败','error',0,hint);
    }
    if(['stopped','interrupted','cancelled','canceled'].includes(s.state)){
      if(!s.runId)return null;
      if(!released(s)||!['stopped','interrupted','cancelled','canceled'].includes(s.result?.state))
        return pack('retirement-pending',title+'：收到停止或中断状态，资源尚待核验','warning',0);
      return pack('stopped',title+'：执行已停止或中断','warning',5000);
    }
    if(s.state==='completed'){
      if(!released(s)||!project.resultPersisted||s.result?.state!=='completed')
        return pack('unverified',title+'：已结束，持久结果或资源尚待核验','warning',0);
      if(!project.runtimeOk)
        return pack('failed',title+'：脚本执行未成功','error',0);
      const reported={'blocked':'网站验证阻断','no_results':'未找到结果',
        'dom_changed':'网页结构已变化','dom_unavailable':'网页不可读取','stopped':'任务已停止'};
      if(Object.hasOwn(reported,project.business))
        return pack('reported-issue',title+'：脚本报告'+reported[project.business],'warning',5000);
      return pack('completed',title+'：脚本执行完成','success',5000);
    }
    return null; // Match, due, saved draft and unsent requests stay silent.
  }

  // One local notice handle per active original request. Its identity is never
  // stored or used to admit, retry, stop or clear a Task.
  function createTaskNoticePublisher(notify){
    let disposed=false,record=null;
    const retire=entry=>{
      if(!entry)return;
      entry.live=false;
      try{Promise.resolve(entry.handle.dismiss()).catch(()=>{});}catch{}
    };
    const update=(entry,projection)=>{
      if(disposed||record!==entry||!entry.live||!entry.accepted||
        entry.key===projection.key||entry.updates>=12)return;
      entry.key=projection.key;entry.updates++;
      try{Promise.resolve(entry.handle.update(projection.options)).then(reply=>{
        if(reply?.status!=='accepted')entry.live=false;
      },()=>{entry.live=false;});}catch{entry.live=false;}
    };
    return Object.freeze({
      publish(id,s,task){
        if(disposed||id!==s?.clientRequestId)return;
        let projection;
        try{projection=taskNotice(s,task);}catch{return;} // Notification must not break original Task recovery.
        if(!projection)return;
        if(record&&record.id!==id){retire(record);record=null;}
        if(record){
          if(!record.live||record.key===projection.key)return;
          if(!record.accepted){record.pending=projection;return;}
          update(record,projection);return;
        }
        if(typeof notify?.open!=='function')return;
        let handle;
        try{handle=notify.open(projection.options);}catch{return;}
        if(!handle||typeof handle.update!=='function'||typeof handle.dismiss!=='function')return;
        const entry={id,handle,live:true,accepted:false,key:projection.key,updates:0,pending:null};
        record=entry;
        Promise.resolve(handle.ready).then(reply=>{
          if(disposed||record!==entry||!entry.live)return;
          if(reply?.status!=='accepted'){entry.live=false;return;}
          entry.accepted=true;
          if(entry.pending){const next=entry.pending;entry.pending=null;update(entry,next);}
        },()=>{entry.live=false;});
      },
      dispose(){
        if(disposed)return;
        disposed=true;retire(record);record=null;
      }
    });
  }

  const summary=(tasks,records)=>({
    reviewed:tasks.length,available:tasks.filter(x=>x.state==='available').length,
    attention:tasks.filter(x=>['changed','unavailable','error',...Object.values(taskStates)].includes(x.state)).length,
    latest:Array.isArray(records)?records[0]||null:null
  });
  global.OpenDeskWebFlowModel=Object.freeze({
    taskMetadata,taskPreparations,taskKey,pinsEqual,errorState,taskReadMessage,filterTasks,businessState,projectRun,recentRecords,summary,
    isTerminal:s=>terminal.has(s),pendingRecord,released,bounded,taskNotice,createTaskNoticePublisher
  });
})(globalThis);
