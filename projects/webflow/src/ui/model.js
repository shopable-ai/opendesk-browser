// Web Flow's pure sandbox presentation model. It never authorizes or runs Tasks.
(function(global){
  'use strict';
  const fields=['taskId','version','manifestHash','contentHash'];
  const bounded=(x,n=120)=>String(x==null?'':x).slice(0,n);
  const taskKey=task=>fields.map(k=>task[k]).join('|');
  const pinsEqual=(a,b)=>fields.every(k=>a&&b&&a[k]===b[k]);
  const terminal=new Set(['completed','failed','cancelled','canceled','unknown']);
  const errorState=error=>error&&error.code==='E_REVISION'?'changed':
    error&&['E_PERMISSION','E_TOOL_DISABLED','E_OWNER'].includes(error.code)?'unavailable':'error';
  function filterTasks(rows,query,filter,starred){
    const q=String(query||'').trim().toLocaleLowerCase();
    const saved=new Set(Array.isArray(starred)?starred:[]);
    return rows.filter(row=>{
      if(filter==='available'&&row.state!=='available')return false;
      if(filter==='attention'&&!['changed','unavailable','error'].includes(row.state))return false;
      if(filter==='favorite'&&!saved.has(taskKey(row)))return false;
      return !q||[row.title,row.taskId,row.site,row.version].some(s=>
        String(s||'').toLocaleLowerCase().includes(q));
    }).sort((a,b)=>Number(saved.has(taskKey(b)))-Number(saved.has(taskKey(a)))||
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
    const persisted=Boolean(s&&result&&result.tag==='controller-result'&&
      result.runId===s.runId&&result.resultId===s.resultId&&result.state==='completed');
    const runtimeOk=Boolean(persisted&&result.outcome&&result.outcome.ok===true);
    return {
      clientRequestId:bounded(s&&s.clientRequestId,80),taskId:task.taskId,version:task.version,
      runId:bounded(s&&s.runId,80),resultId:bounded(s&&s.resultId,80),
      state:bounded(s&&s.state||'unknown',36),
      retirementState:bounded(s&&s.retirementState||'unknown',40),
      resultPersisted:persisted,runtimeOk,
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
        business:bounded(x.business,40),count:Number.isSafeInteger(x.count)?x.count:null,
        at:Number.isFinite(x.at)?x.at:0,delivery:'not_observed',aiReply:'not_observed'
      }));
  }
  const summary=(tasks,records)=>({
    reviewed:tasks.length,available:tasks.filter(x=>x.state==='available').length,
    attention:tasks.filter(x=>['changed','unavailable','error'].includes(x.state)).length,
    latest:Array.isArray(records)?records[0]||null:null
  });
  global.OpenDeskWebFlowModel=Object.freeze({
    taskKey,pinsEqual,errorState,filterTasks,businessState,projectRun,recentRecords,summary,
    isTerminal:s=>terminal.has(s),bounded
  });
})(globalThis);
