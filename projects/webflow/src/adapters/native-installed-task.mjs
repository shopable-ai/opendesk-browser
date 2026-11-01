// OD-AI-WORKFLOW-BRIDGE: restricted Native adapter, not a second task runner.
import {randomUUID} from 'node:crypto';
import {requestAgent} from '../../../../native-agent/cli.mjs';
import {agentDigest} from '../../../../src/native-agent/protocol.js';
import {decodeValue} from '../../../../src/platform/page-port/codec.js';

export const BAIDU_PIN = Object.freeze({
  taskId:'baidu.search.top3',version:'1.1.1',
  sourceHash:'28d1d508a5fd8e04eb7dfbffb6ca36c6a545bb66feaa772b74a971a6e0bbb5e8',
  manifestHash:'adf0cc21e1aa498b169846256f92cf65da42f3c9d27011b29205e164f26bea4b',
  origin:'https://www.baidu.com',scriptId:'task:baidu.search.top3:1.1.1',deadlineMs:60000
});
const METHODS=new Set(['bridge.status','task.list','target.current','run.start','request.get','run.get']);
const CODE=/^E_[A-Z0-9_]{1,55}$/;
const text=(s,max)=>typeof s==='string'&&s.length>0&&s.length<=max&&!/[\u0000-\u001f\u007f]/u.test(s);
const object=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const same=(a,b,keys)=>keys.every(k=>a?.[k]===b?.[k]);
const safeUrl=s=>{try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&u.href===s&&s.length<=1200;}catch{return false;}};
export class InstalledTaskError extends Error {
  constructor(code, message='OpenDesk request was not authorized or could not be verified', outcome='NOT_DISPATCHED'){
    super(message);this.code=code;this.phase='webflow-installed-task';this.outcome=outcome;
  }
}
export function rejectTask(code, message, outcome){throw new InstalledTaskError(code,message,outcome);}
export function validateBaiduQuery(query){
  // Audited baidu.search.top3@1.1.1 paramsSchema, manifestHash above.
  if(typeof query!=='string'||query.length<1||query.length>120||!query.trim()||
     /[\u0000-\u001f\u007f]/u.test(query))rejectTask('E_SCHEMA','Invalid Baidu search query');
  return {query,limit:3};
}
export async function operationRequestId({principal,conversation,operationKey}){
  return 'wf-mcp-v1:'+await agentDigest({projection:'webflow-installed-baidu.v1',principal,conversation,operationKey});
}
export function nativeStartParams(record){
  return {registrationId:record.registrationId,
    source:{kind:'installed-task',taskId:BAIDU_PIN.taskId,version:BAIDU_PIN.version,sourceHash:BAIDU_PIN.sourceHash},
    params:validateBaiduQuery(record.query),target:record.target,deadlineMs:BAIDU_PIN.deadlineMs};
}
export function projectBaiduResult(snapshot,record,runId){
  const run=snapshot?.run;
  if(!text(runId,128)||run?.runId!==runId||
    run?.sourceKind!=='saved'||run?.scriptId!==BAIDU_PIN.scriptId||
    run?.contentHash!==BAIDU_PIN.sourceHash||
    run?.revision?.scriptId!==BAIDU_PIN.scriptId||
    run?.revision?.sourceHash!==BAIDU_PIN.sourceHash||
    !Number.isSafeInteger(run?.revision?.revision)||run.revision.revision<1||
    !Array.isArray(snapshot?.results)||snapshot?.resultDeliveryDenied?.includes(runId))
    rejectTask('E_RESULT_IDENTITY','Original durable run or delivery permission does not match','OUTCOME_UNKNOWN');
  const previous=record.revision;
  if(previous&&(!same(run.revision,previous,['scriptId','revision','sourceHash'])))
    rejectTask('E_RESULT_IDENTITY','Durable task revision changed','OUTCOME_UNKNOWN');
  const target=run.target,original=record.executionTarget;
  if(original){
    const keys=['windowId','tabId','frameId','targetSessionId','browserSessionIncarnation','mode','allowedOrigin'];
    if(!same(target,original,keys)||!Number.isSafeInteger(target?.targetVersion)||
      target.targetVersion<original.targetVersion||
      (target.targetVersion===original.targetVersion&&!same(target,original,['documentId','url']))||
      target.allowedOrigin!==BAIDU_PIN.origin)
      rejectTask('E_DOCUMENT_STALE','Durable execution target no longer matches','OUTCOME_UNKNOWN');
  }else if(!same(target,record.target,['windowId','tabId','frameId','documentId','url'])||
    target?.allowedOrigin!==BAIDU_PIN.origin)
    rejectTask('E_DOCUMENT_STALE','Durable execution target is unverified','OUTCOME_UNKNOWN');
  if(!['completed','failed','stopped','interrupted','running','pending'].includes(run.state))
    rejectTask('E_RESULT_IDENTITY','Invalid durable run state','OUTCOME_UNKNOWN');
  const base={runId,state:run.state,retirementState:run.retirementState??null,
    sourceHash:BAIDU_PIN.sourceHash,revision:run.revision.revision,
    resultId:run.resultId??null};
  if(!['completed','failed','stopped','interrupted'].includes(run.state) || run.retirementState!=='released')
    return {...base,completion:'PENDING',businessSuccess:false};
  const matches=snapshot.results.filter(row=>row?.runId===runId);
  if(matches.length!==1||!text(run.resultId,128)||matches[0].resultId!==run.resultId||
    matches[0].tag!=='controller-result'||matches[0].revision?.sourceHash!==BAIDU_PIN.sourceHash||
    !same(matches[0].revision,run.revision,['scriptId','revision','sourceHash'])||
    matches[0].sourceKind!=='saved')
    rejectTask('E_RESULT_IDENTITY','Durable result is missing, ambiguous or mismatched','OUTCOME_UNKNOWN');
  const result=matches[0];
  if(run.state!=='completed'||result.state!=='completed'||result.outcome?.ok!==true)
    return {...base,completion:'FAILED',businessSuccess:false};
  let value;
  try{value=decodeValue(result.outcome.valueWire);}catch{
    rejectTask('E_RESULT_FORMAT','Original Controller value could not be decoded','OUTCOME_UNKNOWN');
  }
  if(!object(value)||value.kind!=='baidu.search.top3.result'||value.version!==2||
    value.query!==record.query||!safeUrl(value.sourceUrl)||new URL(value.sourceUrl).origin!==BAIDU_PIN.origin||
    !['success','no_results','blocked','dom_unavailable','dom_changed','stopped'].includes(value.status)||
    !Number.isInteger(value.count)||value.count<0||value.count>3||
    !Array.isArray(value.results)||value.results.length!==value.count||
    (value.status==='success')!==(value.count>0)||
    !text(value.observedAt,64)||!Number.isFinite(Date.parse(value.observedAt)))
    rejectTask('E_RESULT_FORMAT','Baidu business result did not match its reviewed contract','OUTCOME_UNKNOWN');
  const seen=new Set(),results=[];
  for(const [index,row] of value.results.entries()){
    if(!object(row)||row.position!==index+1||!text(row.title,96)||!text(row.summary,200)||
      !safeUrl(row.url)||seen.has(row.url)||
      (row.directUrl!==undefined&&!safeUrl(row.directUrl)))
      rejectTask('E_RESULT_FORMAT','Natural result data failed validation','OUTCOME_UNKNOWN');
    seen.add(row.url);
    results.push({position:row.position,title:row.title,summary:row.summary,url:row.url,
      ...(row.directUrl?{directUrl:row.directUrl}:{})});
  }
  const businessSuccess=value.status==='success';
  // Intentionally omit raw trace, snapshot, diagnostics, paths and page instructions.
  return {...base,completion:'COMPLETED',businessSuccess,
    data:{query:value.query,status:value.status,count:value.count,results,observedAt:value.observedAt}};
}
export function createNativeInstalledTaskAdapter({request=requestAgent}={}){
  if(typeof request!=='function')rejectTask('E_SCHEMA','Native request transport is required');
  async function call(method,params,requestId=randomUUID(),timeoutMs=8000){
    if(!METHODS.has(method)||!text(requestId,100)||!object(params))
      rejectTask('E_SCHEMA','Unsupported Native method or request');
    let answer;
    try{answer=await request(method,params,requestId,timeoutMs);}
    catch{rejectTask(method==='run.start'?'E_EFFECT_UNKNOWN':'E_NATIVE_UNAVAILABLE',
      method==='run.start'?'Native admission outcome unknown; query original operation':'Native query unavailable',
      method==='run.start'?'OUTCOME_UNKNOWN':'OUTCOME_UNKNOWN');}
    if(answer?.v!==1||answer.kind!=='response'||answer.requestId!==requestId||
      (Object.hasOwn(answer,'result')===Object.hasOwn(answer,'error')))
      rejectTask('E_NATIVE_REPLY','Native response envelope failed validation',
        method==='run.start'?'OUTCOME_UNKNOWN':'OUTCOME_UNKNOWN');
    if(answer.error){
      const code=CODE.test(answer.error.code)?answer.error.code:'E_NATIVE_REFUSED';
      const outcome=['NOT_DISPATCHED','FAILED_CONFIRMED','OUTCOME_UNKNOWN'].includes(answer.error.outcome)?
        answer.error.outcome:'OUTCOME_UNKNOWN';
      // Never pass through diagnostic/native error.message, which may contain local paths.
      rejectTask(code,'OpenDesk Native rejected or could not confirm this request',outcome);
    }
    if(!object(answer.result))rejectTask('E_NATIVE_REPLY','Native result has invalid shape',
      method==='run.start'?'OUTCOME_UNKNOWN':'OUTCOME_UNKNOWN');
    return answer.result;
  }
  async function inspect({registrationId,extensionId,query}){
    validateBaiduQuery(query);
    if(!text(registrationId,128)||! /^[a-p]{32}$/.test(extensionId||''))
      rejectTask('E_GRANT_REQUIRED','A trusted local Host binding is required');
    const status=await call('bridge.status',{});
    if(status.enabled!==true||status.nativeConnected!==true||status.extensionId!==extensionId||
      !Array.isArray(status.hostRegistrations)||!status.hostRegistrations.includes(registrationId))
      rejectTask('E_PERMISSION','The trusted Native Host is not connected');
    const catalog=await call('task.list',{registrationId});
    const items=catalog.tasks;
    if(!Array.isArray(items))rejectTask('E_NATIVE_UPDATE_REQUIRED','Installed Task discovery is not available');
    const task=items.find(t=>t?.taskId===BAIDU_PIN.taskId);
    if(!task||task.enabled!==true||task.version!==BAIDU_PIN.version||
      task.sourceHash!==BAIDU_PIN.sourceHash||task.manifestHash!==BAIDU_PIN.manifestHash||
      task.deadlineMs!==BAIDU_PIN.deadlineMs||
      !Array.isArray(task.siteOrigins)||task.siteOrigins.length!==1||task.siteOrigins[0]!==BAIDU_PIN.origin||
      !Array.isArray(task.permissions)||task.permissions.length!==1||task.permissions[0]!=='page.automation'||
      !Number.isSafeInteger(task.generation)||task.generation<1||
      !/^[a-f0-9-]{36}$/.test(task.installationId||''))
      rejectTask('E_REVISION','Baidu Task installation does not match the reviewed package');
    const current=await call('target.current',{registrationId});
    const target=current.target;
    if(current.registrationId!==registrationId||!object(target)||target.origin!==BAIDU_PIN.origin||
      !Number.isSafeInteger(target.windowId)||!Number.isSafeInteger(target.tabId)||
      target.frameId!==0||!text(target.documentId,200)||!safeUrl(target.url)||
      new URL(target.url).origin!==BAIDU_PIN.origin||
      !(new URL(target.url).pathname==='/'&&!new URL(target.url).search ||
        new URL(target.url).pathname==='/s'&&new URL(target.url).searchParams.get('wd')===query))
      rejectTask('E_DOCUMENT_STALE','Select the authorized Baidu document in the original Sidebar Host');
    return {registrationId,target,installation:{generation:task.generation,installationId:task.installationId}};
  }
  async function start(record){
    const params=nativeStartParams(record);
    const answer=await call('run.start',params,record.requestId,10000);
    if(!text(answer.runId,128)||answer.completion!=='PENDING'||answer.revision?.sourceHash!==BAIDU_PIN.sourceHash||
      !same(answer.target,record.target,['windowId','tabId','frameId','documentId','url','origin'])||
      !object(answer.executionTarget))
      rejectTask('E_EFFECT_UNKNOWN','Native admission identity cannot be confirmed','OUTCOME_UNKNOWN');
    return {runId:answer.runId,state:answer.state,revision:answer.revision,executionTarget:answer.executionTarget};
  }
  async function reconcile(record){
    const params=nativeStartParams(record);
    const requestDigest=await agentDigest({method:'run.start',params,registrationId:record.registrationId});
    const answer=await call('request.get',{registrationId:record.registrationId,
      admissionRequestId:record.requestId,admissionMethod:'run.start',requestDigest});
    if(answer.admissionRequestId!==record.requestId||answer.registrationId!==record.registrationId||
      answer.requestDigest!==requestDigest||answer.admissionMethod!=='run.start')
      rejectTask('E_NATIVE_REPLY','Original admission identity cannot be confirmed','OUTCOME_UNKNOWN');
    if(answer.state!=='ACKNOWLEDGED')return {state:'OUTCOME_UNKNOWN'};
    if(!text(answer.admission?.runId,128)||!object(answer.admission.executionTarget)||
       answer.admission.revision?.sourceHash!==BAIDU_PIN.sourceHash)
      rejectTask('E_NATIVE_REPLY','Original ACK lacks trusted run identity','OUTCOME_UNKNOWN');
    return {state:'ACKNOWLEDGED',runId:answer.admission.runId,revision:answer.admission.revision,
      executionTarget:answer.admission.executionTarget};
  }
  async function result(record,runId){
    const value=await call('run.get',{registrationId:record.registrationId,runId});
    return projectBaiduResult(value,record,runId);
  }
  return {inspect,start,reconcile,result};
}
