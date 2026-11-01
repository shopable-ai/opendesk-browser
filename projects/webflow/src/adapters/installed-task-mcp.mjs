#!/usr/bin/env node
// OD-AI-WORKFLOW-BRIDGE: fixed, fail-closed MCP projection for the audited Baidu Task.
// This process does NOT authenticate ChatGPT users. Current serveMcp lacks trusted
// per-tools/call caller/conversation context; no production admission store exists.
// Supply both only through audited server-side ports; never via model arguments.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {serveMcp} from '../../../../native-agent/local-dev/mcp.mjs';
import {agentDigest,agentCanonical} from '../../../../src/native-agent/protocol.js';
import {BAIDU_PIN,validateBaiduQuery,operationRequestId,
  createNativeInstalledTaskAdapter,InstalledTaskError,rejectTask} from './native-installed-task.mjs';

const KEY=/^[A-Za-z0-9][A-Za-z0-9._:-]{15,79}$/;
const string=(v,max=256)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/u.test(v);
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const own=Object.hasOwn;
const sameTarget=(a,b)=>['windowId','tabId','frameId','documentId','url','origin'].every(k=>a?.[k]===b?.[k]);
const safeError=(code,message,outcome)=>new InstalledTaskError(code,message,outcome);
const operationKeySchema={type:'string',minLength:16,maxLength:80,pattern:KEY.source};
const querySchema={type:'string',minLength:1,maxLength:120};
export const INSTALLED_TASK_MCP_TOOLS=Object.freeze([
  {name:'opendesk.webflow.start',
    description:'Attempt one explicitly authorized, installed Baidu top-3 search. Mutates a real page. Never replay an unknown admission. Requires server-verified caller, conversation and atomic local grant.',
    inputSchema:{type:'object',properties:{operationKey:operationKeySchema,query:querySchema},
      required:['operationKey','query'],additionalProperties:false},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
  {name:'opendesk.webflow.result',
    description:'Read only this caller/conversation original operationKey and its verified durable result; does not execute a task.',
    inputSchema:{type:'object',properties:{operationKey:operationKeySchema},
      required:['operationKey'],additionalProperties:false},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
]);
export function validateInstalledTaskMcpArgs(name,args){
  const tool=INSTALLED_TASK_MCP_TOOLS.find(x=>x.name===name);
  if(!tool||!obj(args)||Object.getPrototypeOf(args)!==Object.prototype||
    Object.keys(args).length!==tool.inputSchema.required.length||
    tool.inputSchema.required.some(k=>!own(args,k))||
    Object.keys(args).some(k=>!own(tool.inputSchema.properties,k))||
    typeof args.operationKey!=='string'||!KEY.test(args.operationKey))
    rejectTask('E_SCHEMA','Unexpected or invalid MCP tool arguments');
  if(name==='opendesk.webflow.start')validateBaiduQuery(args.query);
  return args;
}
// A real provider MUST be derived from authenticated transport + verified host
// metadata. _meta, clientInfo, JSON-RPC id and model-provided conversation IDs
// are not credentials. serveMcp currently cannot provide this port.
async function contextOf(getTrustedContext,mode){
  let c;
  try{c=await getTrustedContext?.();}catch{ /* do not expose provider details */ }
  if(!obj(c)||c.verifiedByTransport!==true||c.source!=='verified-host-context'||
    !string(c.principal,200)||!string(c.conversation,200)||
    (mode==='start'&&c.startAllowed!==true)||(mode==='result'&&c.readAllowed!==true))
    rejectTask('E_CALLER_CONTEXT_UNAVAILABLE','Trusted MCP caller/conversation binding is unavailable');
  return c;
}
function storeOf(store){
  if(!store||typeof store.read!=='function'||typeof store.reserveAndConsume!=='function'||
    typeof store.attachAck!=='function'||store.durableAtomic!==true)
    rejectTask('E_ATOMIC_STORE_UNAVAILABLE','Approved durable atomic admission/grant store is unavailable');
  return store;
}
function confirmRecord(record,c,operationKey,requestId){
  if(!obj(record)||record.principal!==c.principal||record.conversation!==c.conversation||
    record.operationKey!==operationKey||record.requestId!==requestId||
    !string(record.query,120)||!string(record.registrationId,128)||!obj(record.target)||
    !obj(record.installation)||record.installation.generation<1||
    !string(record.installation.installationId,64)||record.target.origin!==BAIDU_PIN.origin)
    rejectTask('E_CORRELATION','Stored operation binding failed verification','OUTCOME_UNKNOWN');
  return record;
}
function view(record){
  return {operationKey:record.operationKey,requestId:record.requestId,
    state:record.runId?'ADMITTED':'OUTCOME_UNKNOWN',
    completion:'PENDING',...(record.runId?{runId:record.runId}:{})};
}
function assertGrant(c,query,now){
  const g=c.grant;
  if(!obj(g)||c.startAllowed!==true||!string(g.id,128)||g.query!==query||
    g.taskId!==BAIDU_PIN.taskId||g.version!==BAIDU_PIN.version||
    g.sourceHash!==BAIDU_PIN.sourceHash||g.manifestHash!==BAIDU_PIN.manifestHash||
    !string(g.registrationId,128)||! /^[a-p]{32}$/.test(g.extensionId||'')||
    !Number.isSafeInteger(g.generation)||g.generation<1||
    !/^[a-f0-9-]{36}$/.test(g.installationId||'')||
    !obj(g.target)||g.target.origin!==BAIDU_PIN.origin||
    !Number.isSafeInteger(g.expiresAt)||g.expiresAt<=now()||
    g.expiresAt>now()+300000||g.maxAdmissions!==1)
    rejectTask('E_GRANT_REQUIRED','A current single-use local approval for this exact search is required');
  return g;
}
function verifyInspection(approved,actual){
  if(actual.registrationId!==approved.registrationId||
    !sameTarget(actual.target,approved.target)||
    actual.installation?.generation!==approved.generation||
    actual.installation?.installationId!==approved.installationId)
    rejectTask('E_REVISION','Installed Task or authorized document changed before admission');
}
function replyAck(ack){
  if(!obj(ack)||!string(ack.runId,128)||!obj(ack.revision)||!obj(ack.executionTarget))
    rejectTask('E_EFFECT_UNKNOWN','Native ACK did not contain a verifiable run','OUTCOME_UNKNOWN');
  return {runId:ack.runId,revision:ack.revision,executionTarget:ack.executionTarget};
}
export function createInstalledTaskMcp({
  // No default caller identity or alternate private store is created.
  getTrustedContext,admissionStore,
  native=createNativeInstalledTaskAdapter(),now=()=>Date.now()
}={}){
  async function identity(mode,operationKey){
    const c=await contextOf(getTrustedContext,mode),store=storeOf(admissionStore);
    const requestId=await operationRequestId({principal:c.principal,conversation:c.conversation,operationKey});
    const scope={principal:c.principal,conversation:c.conversation,operationKey,requestId};
    return {c,store,scope,requestId};
  }
  async function existing(store,scope,c,operationKey,requestId){
    let record;
    try{record=await store.read(scope);}catch{
      rejectTask('E_ATOMIC_STORE_UNAVAILABLE','Durable operation lookup failed','OUTCOME_UNKNOWN');
    }
    return record?confirmRecord(record,c,operationKey,requestId):null;
  }
  async function dispatch(name,untrustedArgs){
    const args=validateInstalledTaskMcpArgs(name,untrustedArgs);
    const {c,store,scope,requestId}=await identity(name.endsWith('.start')?'start':'result',args.operationKey);
    let record=await existing(store,scope,c,args.operationKey,requestId);
    if(name.endsWith('.start')){
      if(record){
        if(record.query!==args.query)rejectTask('E_REQUEST_CONFLICT','Operation key already belongs to different parameters');
        // A replay reads the original reservation, never calls run.start.
        return view(record);
      }
      const grant=assertGrant(c,args.query,now);
      // The current Native installed-task wire cannot atomically compare the
      // previously approved generation/installationId at final admission.
      // An owner-reviewed common API must prove that guarantee before dispatch.
      if(native.atomicInstalledTaskPin!==true)
        rejectTask('E_NATIVE_ATOMIC_PIN_REQUIRED','Final atomic installation-identity check is not available');
      let inspected;
      try{inspected=await native.inspect({registrationId:grant.registrationId,
        extensionId:grant.extensionId,query:args.query});}catch(error){
        if(error instanceof InstalledTaskError)throw error;
        rejectTask('E_NATIVE_UNAVAILABLE','Native installation inspection failed','OUTCOME_UNKNOWN');
      }
      verifyInspection(grant,inspected);
      const fingerprint=await agentDigest({projection:'webflow-installed-baidu.v1',
        principal:c.principal,conversation:c.conversation,operationKey:args.operationKey,
        query:args.query,registrationId:grant.registrationId,target:inspected.target,
        installation:inspected.installation,grantId:grant.id});
      const proposed={principal:c.principal,conversation:c.conversation,operationKey:args.operationKey,
        requestId,query:args.query,registrationId:grant.registrationId,target:inspected.target,
        installation:inspected.installation,grantId:grant.id,fingerprint};
      let reservation;
      try{
        // Contract: one DURABLE transaction both inserts the full frozen envelope
        // and consumes the grant's maxAdmissions=1 slot. If key already exists,
        // return original without consuming again. No Map or process cache allowed.
        reservation=await store.reserveAndConsume({scope,fingerprint,proposed,grant});
      }catch{rejectTask('E_ATOMIC_STORE_UNAVAILABLE','Atomic grant reservation was not confirmed','OUTCOME_UNKNOWN');}
      if(!obj(reservation)||!['NEW','EXISTING'].includes(reservation.kind))
        rejectTask('E_ATOMIC_STORE_UNAVAILABLE','Atomic reservation did not return a valid receipt','OUTCOME_UNKNOWN');
      record=confirmRecord(reservation.record,c,args.operationKey,requestId);
      if(record.query!==args.query||record.fingerprint!==fingerprint)
        rejectTask('E_REQUEST_CONFLICT','Operation identity conflicts with the durable reservation');
      if(reservation.kind==='EXISTING')return view(record);
      // A NEW reservation is consumed BEFORE attempting the side effect.
      let ack;
      try{ack=replyAck(await native.start(record));}
      catch(error){
        if(error instanceof InstalledTaskError)throw error;
        rejectTask('E_EFFECT_UNKNOWN','Native admission may have occurred; query this operation','OUTCOME_UNKNOWN');
      }
      try{await store.attachAck({scope,runId:ack.runId,revision:ack.revision,
        executionTarget:ack.executionTarget});}
      catch{rejectTask('E_EFFECT_UNKNOWN','Native ACK could not be durably linked; do not replay','OUTCOME_UNKNOWN');}
      const saved=await existing(store,scope,c,args.operationKey,requestId);
      if(!saved||saved.runId!==ack.runId)
        rejectTask('E_EFFECT_UNKNOWN','Durable ACK binding is not observable; do not replay','OUTCOME_UNKNOWN');
      return view(saved);
    }
    if(!record)rejectTask('E_OPERATION_NOT_FOUND','No owned durable operation exists');
    if(!record.runId){
      // Read-only recovery: original frozen envelope and requestId only.
      let recovered;
      try{recovered=await native.reconcile(record);}
      catch(error){
        if(error instanceof InstalledTaskError)throw error;
        rejectTask('E_EFFECT_UNKNOWN','Original admission query was inconclusive','OUTCOME_UNKNOWN');
      }
      if(recovered?.state!=='ACKNOWLEDGED')return view(record);
      const ack=replyAck(recovered);
      try{await store.attachAck({scope,...ack});}
      catch{rejectTask('E_EFFECT_UNKNOWN','Recovered ACK cannot be safely persisted','OUTCOME_UNKNOWN');}
      record=await existing(store,scope,c,args.operationKey,requestId);
      if(record?.runId!==ack.runId)rejectTask('E_EFFECT_UNKNOWN','Recovered run identity is not durable','OUTCOME_UNKNOWN');
    }
    let value;
    try{value=await native.result(record,record.runId);}
    catch(error){
      if(error instanceof InstalledTaskError)throw error;
      rejectTask('E_RESULT_UNAVAILABLE','Original Controller result could not be verified','OUTCOME_UNKNOWN');
    }
    // Native adapter already applies allowlist/Codec and checks durable identity.
    if(!obj(value)||value.runId!==record.runId)
      rejectTask('E_RESULT_IDENTITY','Original run result does not match operation','OUTCOME_UNKNOWN');
    return {operationKey:args.operationKey,requestId,...value};
  }
  return {tools:INSTALLED_TASK_MCP_TOOLS,dispatch};
}
export function serveInstalledTaskMcp(options={}){
  const endpoint=createInstalledTaskMcp(options);
  return serveMcp({input:options.input,output:options.output,
    session:{close(){}},tools:endpoint.tools,
    serverInfo:{name:'opendesk-webflow-installed-task',version:'0.1.0'},
    instructions:'Fixed audited installed Baidu task only. The server fails closed without trusted transport caller/conversation, atomic grant store, and native installation CAS. An UNKNOWN is never a retry instruction.',
    // Existing serveMcp does not pass authenticated metadata; endpoint MUST reject.
    dispatch:(name,args)=>endpoint.dispatch(name,args)});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  // Discovery-only fail-closed launch. DO NOT make this a callable public tool
  // until MCP owner supplies the verified context and approved durable ports.
  serveInstalledTaskMcp();
}
