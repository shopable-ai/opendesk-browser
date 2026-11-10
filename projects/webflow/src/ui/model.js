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
  const summary=(tasks,records)=>({
    reviewed:tasks.length,available:tasks.filter(x=>x.state==='available').length,
    attention:tasks.filter(x=>['changed','unavailable','error',...Object.values(taskStates)].includes(x.state)).length,
    latest:Array.isArray(records)?records[0]||null:null
  });
  global.OpenDeskWebFlowModel=Object.freeze({
    taskKey,pinsEqual,errorState,taskReadMessage,filterTasks,businessState,projectRun,recentRecords,summary,
    isTerminal:s=>terminal.has(s),pendingRecord,released,bounded
  });
})(globalThis);
