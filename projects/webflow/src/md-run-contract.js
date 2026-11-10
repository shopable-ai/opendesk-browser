// Data-only, fail-closed state contract for the Markdown two-chat bridge.
// The existing trusted Run/Authority owns atomic claims, effect receipts, persistence,
// and browser operations. None of the functions below dispatches a side effect.
export const MD_RUN_FORMAT = 'opendesk.webflow.md-run.v1';
const HEX = /^[0-9a-f]{64}$/u;
const ID = /^[A-Za-z0-9._:-]{8,128}$/u;
// The published 0.2.0 Task creates the permanent /c/ URL ONLY AFTER
// its one native Send. A pre-send CREATED/READY state would be fictitious.
const PHASES = ['WAITING','CLAIMED','CREATE_INTENT','TASK_DISPATCHED','AWAIT_REPLY','REPLIED',
  'ACCEPTED','WRITE_INTENT','WRITE_DISPATCHED','SAVED','COMPLETED','UNKNOWN','FAILED'];
const SPEC = Object.freeze({
  pause: [], resume: [], claim: ['claimRef'],
  'create-intent': ['operationRef','authorizationRef','installationId','generation',
    'manifestHash','contentHash','promptSha256'],
  'task-dispatched': ['operationRef'],
  'task-admitted': ['operationRef','taskRunId'],
  'reply-complete': ['operationRef','taskRunId','conversationId','conversationUrl',
    'documentRef','accountId','userMessageRef','assistantMessageRef','replyRef','text','contentSha256'],
  accept: [], 'write-intent': ['operationRef','artifactRef','workspaceId',
    'sourceId','leaseEpoch','sessionId','path','writeMethod','baseSha256'],
  'write-dispatched': ['operationRef'],
  'artifact-saved': ['operationRef','artifactRef','storageVersion','contentSha256'],
  'artifact-readback': ['artifactRef','storageVersion','contentSha256','text'],
  unknown: ['code'], fail: ['code'],
});
const fail=(code,message)=>{throw Object.assign(new Error(message||code),{code});};
const need=(ok,code='E_MD_RUN_SCHEMA')=>{if(!ok)fail(code);};
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
function closed(x,keys){need(plain(x)&&Object.keys(x).length===keys.length&&
  keys.every(k=>Object.hasOwn(x,k)));}
function identifier(x){need(typeof x==='string'&&ID.test(x));}
function sha(x){need(typeof x==='string'&&HEX.test(x));}
function clone(x){return JSON.parse(JSON.stringify(x));}
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
function spec(workflow){
  need(plain(workflow)&&typeof workflow.goal==='string'&&workflow.goal.trim().length>0&&
    Array.isArray(workflow.tasks)&&workflow.tasks.length===2);
  const [a,b]=workflow.tasks;
  for(const [index,task] of workflow.tasks.entries()){
    need(plain(task)&&task.id==='T0'+(index+1)&&plain(task.fields)&&
      ['输入','任务','产出','验收'].every(k=>typeof task.fields[k]==='string'&&task.fields[k].trim()));
    need(task.acceptance===task.fields['验收']);
    need(task.fields['产出'].startsWith('artifacts/'+task.id+'.json：'));
  }
  need(a.acceptance==='auto:sum-count-marker:v1'&&b.acceptance==='auto:doubled-marker:v1');
  const n=/^numbers:\s*\[([0-9,\s]+)\]$/u.exec(a.fields['输入']);
  const m=/^artifact:\s*T01\s*\nmultiplier:\s*([1-9]\d*)$/u.exec(b.fields['输入']);
  need(n&&m);
  const parts=n[1].split(',').map(x=>x.trim());
  need(parts.length>0&&parts.length<=20&&parts.every(x=>/^(0|[1-9]\d*)$/u.test(x)));
  const numbers=parts.map(Number),multiplier=Number(m[1]);
  const sum=numbers.reduce((acc,x)=>acc+x,0);
  need(numbers.every(Number.isSafeInteger)&&Number.isSafeInteger(sum)&&
    Number.isSafeInteger(multiplier)&&multiplier<=100&&Number.isSafeInteger(sum*multiplier));
  return {numbers,multiplier,sum};
}
function validateArtifact(run,step,value){
  const s=spec(run.workflow);
  need(plain(value),'E_MD_ACCEPTANCE');
  const keys=step===0?['sum','count','marker','inputVersion']:
    ['doubled','marker','inputVersion'];
  need(Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k)),
    'E_MD_ACCEPTANCE');
  need(value.marker===run.marker&&value.inputVersion===run.sourceSha256,
    'E_MD_ACCEPTANCE');
  if(step===0)need(value.sum===s.sum&&value.count===s.numbers.length&&
    Number.isSafeInteger(value.sum),'E_MD_ACCEPTANCE');
  else {
    const upstream=run.steps[0].readback;
    need(run.steps[0].phase==='COMPLETED'&&upstream&&
      value.doubled===upstream.value.sum*s.multiplier&&Number.isSafeInteger(value.doubled),
      'E_MD_DEPENDENCY');
  }
  return value;
}
async function digestText(text,digest){
  need(typeof text==='string'&&new TextEncoder().encode(text).byteLength<=65536,
    'E_MD_RUN_SIZE');
  const fn=digest||globalThis.crypto?.subtle?.digest?.bind(globalThis.crypto.subtle,'SHA-256');
  need(typeof fn==='function','E_MD_DIGEST');
  const result=await fn(new TextEncoder().encode(text));
  const bytes=result instanceof ArrayBuffer?new Uint8Array(result):
    ArrayBuffer.isView(result)?new Uint8Array(result.buffer,result.byteOffset,result.byteLength):null;
  need(bytes?.length===32,'E_MD_DIGEST');
  return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
}
export function createMdRunRecord(input){
  closed(input,['runId','workflowId','sourceUrl','sourceSha256','workflow','account',
    'authorizationRef','artifactScopeRef','marker','createdAt']);
  identifier(input.runId);identifier(input.workflowId);identifier(input.authorizationRef);
  identifier(input.artifactScopeRef);sha(input.sourceSha256);
  need(typeof input.marker==='string'&&/^[0-9a-f-]{36}$/iu.test(input.marker));
  need(Number.isSafeInteger(input.createdAt)&&input.createdAt>0);
  closed(input.account,['accountId','origin','mode']);identifier(input.account.accountId);
  need(input.account.origin==='https://chatgpt.com'&&input.account.mode==='normal');
  let source;try{source=new URL(input.sourceUrl);}catch{fail('E_MD_RUN_SOURCE');}
  need(source.protocol==='https:'&&!source.username&&!source.password&&!source.search&&
    !source.hash&&['github.com','raw.githubusercontent.com'].includes(source.hostname)&&
    source.pathname.endsWith('.md'),'E_MD_RUN_SOURCE');
  const workflow=clone(input.workflow);spec(workflow);
  return freeze({format:MD_RUN_FORMAT,runId:input.runId,workflowId:input.workflowId,
    sourceUrl:input.sourceUrl,sourceSha256:input.sourceSha256,workflow,
    account:clone(input.account),authorizationRef:input.authorizationRef,
    artifactScopeRef:input.artifactScopeRef,marker:input.marker,
    createdAt:input.createdAt,updatedAt:input.createdAt,revision:0,paused:false,
    steps:['T01','T02'].map(taskId=>({taskId,phase:'WAITING',claimRef:null,
      createOperationRef:null,taskPin:null,taskRunId:null,conversation:null,
      userMessageRef:null,reply:null,accepted:null,
      writeOperationRef:null,writePlan:null,artifactRef:null,storageVersion:null,
      saved:null,readback:null,errorCode:null}))});
}
// A state transition must be committed by the original trusted durable ledger.
// A revision check is NOT a cross-tab atomic lock or an execution permit.
export async function applyMdRunEvent(current,event,{digest}={}){
  need(plain(current)&&current.format===MD_RUN_FORMAT&&
    Number.isSafeInteger(current.revision),'E_MD_RUN_SCHEMA');
  need(plain(event)&&Object.hasOwn(SPEC,event.type),'E_MD_RUN_SCHEMA');
  closed(event,['type','taskId','expectedRevision','at',...SPEC[event.type]]);
  need(event.expectedRevision===current.revision,'E_MD_RUN_STALE');
  need(Number.isSafeInteger(event.at)&&event.at>=current.updatedAt,'E_MD_RUN_TIME');
  const isGlobal=['pause','resume'].includes(event.type);
  need(isGlobal?event.taskId===null:['T01','T02'].includes(event.taskId));
  const run=clone(current),step=isGlobal?null:run.steps[event.taskId==='T01'?0:1];
  const index=step?.taskId==='T01'?0:1;
  const state=(expected)=>need(expected.includes(step.phase),'E_MD_RUN_STATE');
  const additional=()=>need(!run.paused,'E_MD_RUN_PAUSED');
  const value=(x)=>{identifier(x);return x;};
  if(event.type==='pause')run.paused=true;
  else if(event.type==='resume')run.paused=false;
  else {
    need(!['COMPLETED','FAILED','UNKNOWN'].includes(step.phase),'E_MD_RUN_STATE');
    switch(event.type){
      case 'claim':
        additional();state(['WAITING']);value(event.claimRef);
        need(index===0||run.steps[0].phase==='COMPLETED','E_MD_DEPENDENCY');
        step.claimRef=event.claimRef;step.phase='CLAIMED';break;
      case 'create-intent': {
        additional();state(['CLAIMED']);
        value(event.operationRef);value(event.authorizationRef);value(event.installationId);
        need(event.authorizationRef===run.authorizationRef,'E_MD_AUTH');
        need(Number.isSafeInteger(event.generation)&&event.generation>0,'E_MD_RUN_SCHEMA');
        sha(event.manifestHash);sha(event.contentHash);sha(event.promptSha256);
        step.createOperationRef=event.operationRef;
        step.taskPin={installationId:event.installationId,generation:event.generation,
          manifestHash:event.manifestHash,contentHash:event.contentHash,
          promptSha256:event.promptSha256};
        step.phase='CREATE_INTENT';break;
      }
      case 'task-dispatched': {
        additional();state(['CREATE_INTENT']);
        need(event.operationRef===step.createOperationRef,'E_MD_IDENTITY');
        step.phase='TASK_DISPATCHED';break;
      }
      case 'task-admitted': {
        state(['TASK_DISPATCHED']);
        need(event.operationRef===step.createOperationRef,'E_MD_IDENTITY');
        step.taskRunId=value(event.taskRunId);step.phase='AWAIT_REPLY';break;
      }
      case 'reply-complete': {
        // The original Controller may commit a durable result even if its
        // dispatch ACK is lost. Reconcile that same operation, never resubmit.
        state(['TASK_DISPATCHED','AWAIT_REPLY']);
        need(event.operationRef===step.createOperationRef,'E_MD_IDENTITY');
        value(event.taskRunId);
        need(!step.taskRunId||step.taskRunId===event.taskRunId,'E_MD_IDENTITY');
        value(event.conversationId);value(event.documentRef);value(event.accountId);
        value(event.userMessageRef);value(event.assistantMessageRef);value(event.replyRef);
        need(event.userMessageRef!==event.assistantMessageRef,'E_MD_IDENTITY');
        need(event.accountId===run.account.accountId,'E_MD_IDENTITY');
        let url;try{url=new URL(event.conversationUrl);}catch{fail('E_MD_IDENTITY');}
        need(url.origin===run.account.origin&&!url.search&&!url.hash&&!url.username&&!url.password&&
          url.pathname==='/c/'+event.conversationId&&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(event.conversationId),
          'E_MD_IDENTITY');
        need(!run.steps.some(s=>s.conversation?.conversationId===event.conversationId),
          'E_MD_IDENTITY');
        sha(event.contentSha256);
        need(await digestText(event.text,digest)===event.contentSha256,'E_MD_INTEGRITY');
        step.taskRunId=event.taskRunId;
        step.conversation={conversationId:event.conversationId,conversationUrl:url.href,
          documentRef:event.documentRef,accountId:event.accountId};
        step.userMessageRef=event.userMessageRef;
        step.reply={assistantMessageRef:event.assistantMessageRef,replyRef:event.replyRef,
          text:event.text,contentSha256:event.contentSha256};step.phase='REPLIED';break;
      }
      case 'accept':{
        state(['REPLIED']);let data;try{data=JSON.parse(step.reply.text);}catch{fail('E_MD_ACCEPTANCE');}
        validateArtifact(run,index,data);
        const text=JSON.stringify(data);
        step.accepted={value:data,text,contentSha256:await digestText(text,digest),
          replyRef:step.reply.replyRef};step.phase='ACCEPTED';break;
      }
      case 'write-intent':
        state(['ACCEPTED']);step.writeOperationRef=value(event.operationRef);
        step.artifactRef=value(event.artifactRef);
        value(event.workspaceId);value(event.leaseEpoch);value(event.sessionId);
        need(typeof event.sourceId==='string'&&event.sourceId.length<=128&&
          event.path==='artifacts/'+step.taskId+'.json'&&
          ['files.create','files.write'].includes(event.writeMethod)&&
          (event.writeMethod==='files.create'?event.baseSha256===null:
            typeof event.baseSha256==='string'&&HEX.test(event.baseSha256)),
          'E_MD_ARTIFACT_SCOPE');
        step.writePlan={workspaceId:event.workspaceId,sourceId:event.sourceId,
          leaseEpoch:event.leaseEpoch,sessionId:event.sessionId,path:event.path,
          writeMethod:event.writeMethod,baseSha256:event.baseSha256};
        step.phase='WRITE_INTENT';break;
      case 'write-dispatched':
        state(['WRITE_INTENT']);
        need(event.operationRef===step.writeOperationRef,'E_MD_IDENTITY');
        step.phase='WRITE_DISPATCHED';break;
      case 'artifact-saved':
        state(['WRITE_DISPATCHED']);need(event.operationRef===step.writeOperationRef&&
          event.artifactRef===step.artifactRef&&
          event.contentSha256===step.accepted.contentSha256,'E_MD_INTEGRITY');
        value(event.storageVersion);sha(event.contentSha256);
        step.storageVersion=event.storageVersion;
        step.saved={text:step.accepted.text,value:step.accepted.value,
          contentSha256:event.contentSha256,storageVersion:event.storageVersion,
          artifactRef:event.artifactRef};step.phase='SAVED';break;
      case 'artifact-readback':{
        state(['SAVED']);need(event.artifactRef===step.artifactRef&&
          event.storageVersion===step.storageVersion,'E_MD_READBACK');
        need(event.text===step.saved.text&&event.contentSha256===step.saved.contentSha256&&
          await digestText(event.text,digest)===step.saved.contentSha256,'E_MD_READBACK');
        let read;try{read=JSON.parse(event.text);}catch{fail('E_MD_READBACK');}
        validateArtifact(run,index,read);
        step.readback={text:event.text,value:read,contentSha256:event.contentSha256,
          storageVersion:event.storageVersion,artifactRef:event.artifactRef};
        step.phase='COMPLETED';break;
      }
      case 'unknown':
        need(PHASES.includes(step.phase));value(event.code);
        step.errorCode=event.code;step.phase='UNKNOWN';break;
      case 'fail':
        state(['WAITING','CLAIMED','REPLIED','ACCEPTED','WRITE_INTENT','SAVED']);
        value(event.code);step.errorCode=event.code;step.phase='FAILED';break;
      default:fail('E_MD_RUN_SCHEMA');
    }
  }
  run.revision++;run.updatedAt=event.at;return freeze(run);
}
export function nextMdRunAction(run){
  need(run?.format===MD_RUN_FORMAT);
  if(run.steps.some(s=>s.phase==='UNKNOWN'))return {action:'HOLD_UNKNOWN'};
  if(run.steps.some(s=>s.phase==='FAILED'))return {action:'HOLD_FAILED'};
  if(run.steps.every(s=>s.phase==='COMPLETED'))return {action:'COMPLETED'};
  const s=run.steps.find(row=>row.phase!=='COMPLETED');
  // Pausing stops NEW claims / submissions, but an already submitted
  // Task's read-only reconciliation and necessary file settlement continue.
  // CREATE_INTENT has not crossed the send fence and cannot dispatch while paused.
  if(run.paused&&['WAITING','CLAIMED','CREATE_INTENT'].includes(s.phase))
    return {action:'PAUSED'};
  const actions={WAITING:'CLAIM_WITH_TRUSTED_LEDGER',CLAIMED:'RECORD_CREATE_INTENT',
    CREATE_INTENT:'DISPATCH_ORIGINAL_CHATGPT_ONCE',
    TASK_DISPATCHED:'QUERY_ORIGINAL_TASK',AWAIT_REPLY:'QUERY_ORIGINAL_REPLY',
    REPLIED:'VERIFY_REPLY',ACCEPTED:'RECORD_ARTIFACT_WRITE_INTENT',
    WRITE_INTENT:'DISPATCH_ORIGINAL_FILE_WRITE_ONCE',WRITE_DISPATCHED:'QUERY_ORIGINAL_WRITE',
    SAVED:'READBACK_ORIGINAL_ARTIFACT'};
  need(actions[s.phase]);
  return {taskId:s.taskId,action:actions[s.phase]};
}
export function mdTaskInput(run,taskId){
  need(run?.format===MD_RUN_FORMAT&&['T01','T02'].includes(taskId));
  const context={goal:run.workflow.goal,task:run.workflow.tasks[taskId==='T01'?0:1].fields['任务'],
    marker:run.marker,inputVersion:run.sourceSha256};
  if(taskId==='T01')return freeze({...context,numbers:spec(run.workflow).numbers});
  const first=run.steps[0];
  need(first.phase==='COMPLETED'&&first.readback&&
    first.readback.text===first.saved.text,'E_MD_DEPENDENCY');
  return freeze({...context,upstreamArtifactJson:first.readback.text,
    multiplier:spec(run.workflow).multiplier});
}

// The trusted Host hashes this EXACT prompt before recording create-intent.
// No expected sum/doubled answer is ever injected into either model prompt.
export function mdTaskPrompt(run,taskId){
  const data=mdTaskInput(run,taskId);
  const rows=['总目标：'+data.goal,'任务 '+taskId+'：'+data.task];
  if(taskId==='T01')rows.push('输入：'+JSON.stringify(data.numbers));
  else rows.push('已保存且独立读回的 T01 完整 JSON 正文：',data.upstreamArtifactJson,
    'multiplier='+data.multiplier);
  rows.push('marker='+data.marker,'inputVersion='+data.inputVersion,
    taskId==='T01'?'只输出 JSON {sum,count,marker,inputVersion}。':
      '只输出 JSON {doubled,marker,inputVersion}。');
  const prompt=rows.join('\n');
  need(new TextEncoder().encode(prompt).length<=3000,'E_MD_PROMPT_SIZE');
  return prompt;
}
