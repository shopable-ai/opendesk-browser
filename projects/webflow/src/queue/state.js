import {parseWorkflowHandoff} from '../handoff-contract.js';

// Application metadata only: replaying these events never dispatches work.
const FORMAT='opendesk.webflow.queue.v1';
const TOKEN=/^[A-Za-z0-9._:-]{8,128}$/u;
const WAITING=['QUEUED','READY','WAITING_HOST','WAITING_AUTH','NEEDS_ATTENTION'];
const ACTIVE=['LEASED','DISPATCH_INTENT','RUNNING'];
const TERMINAL=['COMPLETED','FAILED','CANCELLED'];
const FIELDS={
  enqueue:['handoffJson','dependsOn'],ready:['jobId'],wait:['jobId','status','code'],
  claim:['jobId','claimId'],'record-dispatch-intent':['jobId','claimId'],
  'record-started':['jobId','claimId','executionRef'],
  'record-result':['jobId','resultRef','outcome'],'confirm-result':['jobId','resultId'],
  fail:['jobId','code'],'mark-unknown':['jobId','code'],cancel:['jobId'],recover:[],
};
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const requireValue=(ok,code='E_QUEUE_SCHEMA')=>{if(!ok)fail(code,'Invalid queue data or transition');};
const plain=v=>v!==null&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype;
function closed(v,fields){
  requireValue(plain(v)&&Reflect.ownKeys(v).length===fields.length&&fields.every(k=>
    Object.hasOwn(v,k)&&Object.getOwnPropertyDescriptor(v,k)?.enumerable&&
    Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')));
}
function text(v,max=256){requireValue(typeof v==='string'&&v.length>0&&v.length<=max&&
  v.trim()===v&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v));}
const time=v=>requireValue(Number.isSafeInteger(v)&&v>0);
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const canonical=v=>JSON.stringify(v&&typeof v==='object'?
  Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
function handoff(raw,scope,at){
  return parseWorkflowHandoff(raw,{now:at,expectedSource:scope.expectedSource,expectedTarget:scope.expectedTarget});
}
function historicalHandoff(raw,scope){
  requireValue(typeof raw==='string'&&raw.length<=32768);
  let value;try{value=JSON.parse(raw);}catch{fail('E_QUEUE_SCHEMA','Invalid stored handoff');}
  return handoff(raw,scope,value?.createdAt);
}
function execution(ref){
  closed(ref,['kind','id']);requireValue(ref.kind==='codex-task');text(ref.id);
}
function result(ref){
  closed(ref,['executionId','resultId','sha256']);text(ref.executionId);text(ref.resultId);
  requireValue(typeof ref.sha256==='string'&&/^[a-f0-9]{64}$/u.test(ref.sha256));
}
function applyEvent(jobs,event,scope){
  requireValue(plain(event)&&Object.hasOwn(FIELDS,event.type));
  closed(event,['type','at',...FIELDS[event.type]]);time(event.at);
  if(event.type==='enqueue'){
    const value=historicalHandoff(event.handoffJson,scope);
    requireValue(value.workflowId===scope.workflowId,'E_QUEUE_SCOPE');
    requireValue(Array.isArray(event.dependsOn)&&event.dependsOn.length<=2&&
      event.dependsOn.every(id=>typeof id==='string'&&TOKEN.test(id))&&
      new Set(event.dependsOn).size===event.dependsOn.length);
    const existing=jobs.find(row=>row.handoff.stepId===value.stepId||row.handoff.idempotencyKey===value.idempotencyKey);
    if(existing){
      requireValue(canonical(existing.handoff)===canonical(value)&&canonical(existing.dependsOn)===canonical(event.dependsOn),'E_QUEUE_IDEMPOTENCY');
      return false;
    }
    handoff(event.handoffJson,scope,event.at);
    requireValue(jobs.length<2,'E_QUEUE_LIMIT');
    requireValue(event.dependsOn.every(id=>jobs.some(row=>row.handoff.stepId===id)),'E_QUEUE_DEPENDENCY');
    jobs.push({handoff:value,dependsOn:[...event.dependsOn],status:'QUEUED',claimId:null,
      executionRef:null,resultRef:null,outcome:null,errorCode:null,cancelRequested:false,updatedAt:event.at});
    return true;
  }
  if(event.type==='recover'){
    let changed=false;
    for(const row of jobs)if(ACTIVE.includes(row.status)){
      row.status='UNKNOWN';row.errorCode='E_QUEUE_INTERRUPTED';row.updatedAt=event.at;changed=true;
    }
    return changed;
  }
  text(event.jobId);const row=jobs.find(item=>item.handoff.stepId===event.jobId);
  requireValue(row,'E_QUEUE_STATE');
  const state=allowed=>requireValue(allowed.includes(row.status),'E_QUEUE_STATE');
  switch(event.type){
    case 'ready':
      state(WAITING);
      requireValue(row.dependsOn.every(id=>jobs.find(item=>item.handoff.stepId===id)?.status==='COMPLETED'),'E_QUEUE_DEPENDENCY');
      if(row.status==='READY')return false;
      row.status='READY';row.errorCode=null;break;
    case 'wait':
      state(WAITING);requireValue(['WAITING_HOST','WAITING_AUTH','NEEDS_ATTENTION'].includes(event.status));text(event.code,128);
      if(row.status===event.status&&row.errorCode===event.code)return false;
      row.status=event.status;row.errorCode=event.code;break;
    case 'claim':
      state(['READY']);requireValue(typeof event.claimId==='string'&&TOKEN.test(event.claimId));
      requireValue(!jobs.some(item=>item.claimId===event.claimId),'E_QUEUE_IDEMPOTENCY');
      try{handoff(JSON.stringify(row.handoff),scope,event.at);}catch(error){
        if(error.code==='E_HANDOFF_EXPIRED')fail('E_QUEUE_EXPIRED','Handoff admission expired');throw error;
      }
      row.claimId=event.claimId;row.status='LEASED';break;
    case 'record-dispatch-intent':
      state(['LEASED']);requireValue(event.claimId===row.claimId,'E_QUEUE_SCOPE');
      row.status='DISPATCH_INTENT';break;
    case 'record-started':
      state(['DISPATCH_INTENT']);requireValue(event.claimId===row.claimId,'E_QUEUE_SCOPE');execution(event.executionRef);
      requireValue(!jobs.some(other=>other!==row&&other.executionRef?.id===event.executionRef.id),'E_QUEUE_IDEMPOTENCY');
      row.executionRef={...event.executionRef};row.status='RUNNING';break;
    case 'record-result':
      result(event.resultRef);requireValue(['COMPLETED','FAILED'].includes(event.outcome));
      requireValue(row.executionRef&&row.executionRef.id===event.resultRef.executionId,'E_QUEUE_RESULT_CONFLICT');
      requireValue(!jobs.some(other=>other!==row&&other.resultRef?.resultId===event.resultRef.resultId),'E_QUEUE_RESULT_CONFLICT');
      if(row.resultRef){
        requireValue(canonical(row.resultRef)===canonical(event.resultRef)&&row.outcome===event.outcome,'E_QUEUE_RESULT_CONFLICT');
        return false;
      }
      state(['RUNNING','UNKNOWN']);row.resultRef={...event.resultRef};row.outcome=event.outcome;
      row.status='RESULT_PERSISTED';row.errorCode=null;break;
    case 'confirm-result':
      text(event.resultId);requireValue(row.resultRef?.resultId===event.resultId,'E_QUEUE_RESULT_CONFLICT');
      if(['COMPLETED','FAILED'].includes(row.status))return false;
      state(['RESULT_PERSISTED']);row.status=row.outcome;break;
    case 'fail':
      state([...WAITING,'LEASED']);text(event.code,128);
      row.status='FAILED';row.outcome='FAILED';row.errorCode=event.code;break;
    case 'mark-unknown':
      state([...ACTIVE,'UNKNOWN']);text(event.code,128);
      if(row.status==='UNKNOWN'&&row.errorCode===event.code)return false;
      row.status='UNKNOWN';row.errorCode=event.code;break;
    case 'cancel':
      if(TERMINAL.includes(row.status)||row.cancelRequested)return false;
      row.cancelRequested=true;
      if([...WAITING,'LEASED'].includes(row.status))row.status='CANCELLED';
      break;
    default:fail('E_QUEUE_SCHEMA','Unsupported queue event');
  }
  row.updatedAt=event.at;return true;
}

export function createQueueJournal({workflowId,ownerId,now}){
  requireValue(typeof workflowId==='string'&&TOKEN.test(workflowId)&&typeof ownerId==='string'&&TOKEN.test(ownerId));time(now);
  return freeze({format:FORMAT,workflowId,ownerId,createdAt:now,events:[]});
}

export function replayQueueJournal(journal,scope){
  closed(journal,['format','workflowId','ownerId','createdAt','events']);
  requireValue(journal.format===FORMAT&&typeof journal.workflowId==='string'&&TOKEN.test(journal.workflowId)&&
    typeof journal.ownerId==='string'&&TOKEN.test(journal.ownerId));
  requireValue(plain(scope)&&scope.ownerId===journal.ownerId&&scope.workflowId===journal.workflowId,'E_QUEUE_SCOPE');
  time(scope.now);time(journal.createdAt);requireValue(journal.createdAt<=scope.now);
  requireValue(Array.isArray(journal.events)&&journal.events.length<=64,'E_QUEUE_LIMIT');
  const jobs=[];let at=journal.createdAt;
  for(const event of journal.events){
    requireValue(plain(event));time(event.at);requireValue(event.at>=at&&event.at<=scope.now);
    applyEvent(jobs,event,scope);at=event.at;
  }
  return freeze({format:FORMAT,workflowId:journal.workflowId,ownerId:journal.ownerId,
    revision:journal.events.length,updatedAt:at,jobs});
}

export function appendQueueEvent(journal,event,scope){
  const state=replayQueueJournal(journal,scope);
  requireValue(plain(event)&&event.at===scope.now&&event.at>=state.updatedAt);
  const jobs=state.jobs.map(row=>({...row}));
  if(!applyEvent(jobs,event,scope))return journal;
  requireValue(journal.events.length<64,'E_QUEUE_LIMIT');
  return freeze({...journal,events:[...journal.events,JSON.parse(JSON.stringify(event))]});
}
