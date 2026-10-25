#!/usr/bin/env node
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import {LocalDevSession} from './session.mjs';
import {serveMcp} from './mcp.mjs';
import {canonical} from '../../src/platform/protocol.js';
import {sha256} from './snapshot.mjs';

// No MCP authentication service or Provider. Native/Host permissions still apply.
// Local owner pins --registration-id/--extension-id/--tab-id/--document-id and
// optionally --url/--selector/--allow-write-field; none are remote tool arguments.
// Controller source is static. Policy and each intentional run's complete params
// are captured before awaits, then checked again at the Native handoff.
// matched:false means the page transformed the value; this API never submits,
// but input/change handlers may cause page-defined effects. It is not a transaction.
export const TEST_URL='http://127.0.0.1:43111/demo-form.html';
export const POLICY_VERSION='opendesk.feasibility.policy.v1';
const CONTROLLER=fileURLToPath(new URL('./feasibility-controller.mjs',import.meta.url));
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const id={type:'string',minLength:1,maxLength:100,pattern:'^[A-Za-z0-9._:-]+$'};
export function feasibilityTools(allowWriteField=false){
  return [
    ['probe','Submit one locally configured page title read; use result with the original taskId.',{intentId:id},['intentId'],true],
    ['result','Read an original task in this session; never execute or replay.',{taskId:id},['taskId'],true],
    ...(allowWriteField?[['write_field','Write the one locally configured editable text field, then read its value. Never submit; page input/change handlers may have effects.',{intentId:id,text:{type:'string',maxLength:100}},['intentId','text'],false]]:[])
  ].map(([name,description,properties,required,readOnlyHint])=>({name:'opendesk.feasibility.'+name,description,
    inputSchema:{type:'object',properties,required,additionalProperties:false},
    annotations:{readOnlyHint,destructiveHint:!readOnlyHint,idempotentHint:readOnlyHint,openWorldHint:false}}));
}
function validate(tool,args){
  const s=tool.inputSchema;
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(s.properties,k))||s.required.some(k=>!Object.hasOwn(args,k)))fail('E_SCHEMA','Unexpected or missing arguments');
  for(const [k,v] of Object.entries(args)){
    const r=s.properties[k];
    if(typeof v!=='string'||Array.from(v).length<(r.minLength||0)||Array.from(v).length>r.maxLength||r.pattern&&!new RegExp(r.pattern).test(v))fail('E_SCHEMA','Invalid argument: '+k);
  }
}
export async function createFeasibility({registrationId,extensionId,tabId,documentId,url=TEST_URL,selector='#name',allowWriteField=false,request}={}){
  if(typeof registrationId!=='string'||!registrationId||! /^[a-p]{32}$/.test(extensionId||'')||!Number.isSafeInteger(tabId)||tabId<0||typeof documentId!=='string'||!documentId||typeof allowWriteField!=='boolean')fail('E_SCHEMA','Explicit registrationId, extensionId, tabId and documentId required');
  let parsedUrl;
  try{parsedUrl=new URL(url);}catch{}
  if(typeof url!=='string'||url.length>2048||!parsedUrl||!['http:','https:'].includes(parsedUrl.protocol)||parsedUrl.username||parsedUrl.password||url!==parsedUrl.href)fail('E_SCHEMA','Use an exact canonical HTTP(S) URL without credentials');
  if(typeof selector!=='string'||!selector.trim()||selector!==selector.trim()||selector.length>512||/[\x00-\x1f\x7f]/.test(selector))fail('E_SCHEMA','Use one bounded CSS field selector');
  const policy=Object.freeze({version:POLICY_VERSION,url,selector,allowWriteField,registrationId,extensionId,tabId,documentId});
  const policyDigest=sha256(canonical(policy));
  const tools=feasibilityTools(allowWriteField),intents=new Map();
  const session=new LocalDevSession({allowedPaths:[CONTROLLER],request});
  const binding=session.attach({path:CONTROLLER,runtimeKind:'controller',siteOrigin:parsedUrl.origin});
  let frozen,closed=false;
  try{frozen=await session.resolve(binding.bindingId);}catch(error){session.close();throw error;}
  const native=session.request;
  const open=()=>{if(closed)fail('E_DEV_SESSION_CLOSED','Feasibility session is closed');};
  const checkTarget=selected=>{
    const t=selected?.target;
    if(selected?.registrationId!==registrationId||t?.tabId!==tabId||t?.documentId!==documentId||t?.url!==policy.url||t?.origin!==parsedUrl.origin||t?.frameId!==0||!Number.isSafeInteger(t?.windowId))fail('E_DOCUMENT_STALE','Frozen test document differs');
  };
  async function status(){
    open();const s=await session.status({registrationId});open();
    if(!s.connected)fail(s.error?.code||'E_NATIVE_NOT_READY','Native connection unavailable');
    if(s.bridge?.nativeConnected!==true)fail('E_NATIVE_NOT_READY','Native connection unavailable');
    if(s.bridge.enabled!==true||s.bridge.extensionId!==extensionId||!s.bridge.hostRegistrations?.includes(registrationId))fail('E_PERMISSION','Registration or extension is no longer authorized');
    if(s.targetError)fail(s.targetError.code||'E_DOCUMENT_STALE','Test target unavailable');
    checkTarget(s.target);return s.target;
  }
  session.request=async(method,params,requestId)=>{
    open();
    if(method==='target.current'&&params.registrationId!==registrationId)fail('E_PERMISSION','Explicit Host required');
    if(method==='run.start'){
      const intent=intents.get(requestId);
      if(!intent||canonical(params.params)!==intent.paramsCanonical||params.deadlineMs!==5000)fail('E_POLICY','Final Controller params differ from frozen intent policy');
      const current=await status();
      await session.resolver.validateFrozen(binding.bindingId,frozen);open();
      if(canonical(params.params)!==intent.paramsCanonical)fail('E_POLICY','Controller params changed during final validation');
      if(params.registrationId!==registrationId||canonical(params.target)!==canonical(current.target))fail('E_DOCUMENT_STALE','Final payload target differs');
      if(params.sourceHash!==frozen.sourceHash||params.sourceBytes!==frozen.sourceBytes||params.source?.sourceUtf8!==frozen.sourceUtf8||sha256(params.source.sourceUtf8)!==frozen.sourceHash)fail('E_DEV_HASH','Final payload source differs');
    }
    open();let response;
    try{
      // Development reload admission can be briefly held while hosts save.
      // Only re-read after an explicit NOT_DISPATCHED refusal; never resend
      // run.start or recover a transport/unknown outcome by replaying it.
      const readOnly=['bridge.status','target.current','run.get','request.get'].includes(method);
      for(let attempt=0;;attempt++){
        response=await native(method,params,requestId);
        if(!readOnly||response?.error?.code!=='E_DEV_RELOADING'||response.error.outcome!=='NOT_DISPATCHED'||attempt>=40)break;
        await new Promise(resolve=>setTimeout(resolve,75));open();
      }
    }
    catch(error){
      // Once handed to Native, a transport throw cannot prove no browser effect.
      if(method==='run.start')throw Object.assign(new Error('Native admission outcome unknown'),{code:'E_EFFECT_UNKNOWN',outcome:'OUTCOME_UNKNOWN'});
      throw error;
    }
    open();
    if(method==='target.current'&&response?.result)checkTarget(response.result);
    return response;
  };
  function view(taskId,value={}){
    const record=session.requests.get(taskId),intent=intents.get(taskId),runId=record?.selector?.runId;
    // Explicit projection: no paths, file inventories, diagnostics or arbitrary Native fields.
    const result={taskId,requestId:taskId,registrationId,sourceHash:frozen.sourceHash,policyVersion:POLICY_VERSION,policyDigest,
      ...(runId?{runId}:{}),state:record?.state||intent.state,
      ...(value.run?{run:{runId:value.run.runId,resultId:value.run.resultId,state:value.run.state,retirementState:value.run.retirementState}}:{})};
    if(value.valueIsJson){
      const v=value.value;
      if(intents.get(taskId)?.operation==='probe'&&typeof v?.title==='string')result.value={title:v.title};
      if(intents.get(taskId)?.operation==='write_field'&&typeof v?.value==='string'&&typeof v.matched==='boolean')result.value={value:v.value,matched:v.matched};
    }
    if(!record&&intent.error)result.error=intent.error;
    if(value.error)result.error={code:value.error.code||'E_RUN',message:'Controller failed'};
    return result;
  }
  return {tools,
    close(){closed=true;session.close();},
    async dispatch(name,args){
      open();const tool=tools.find(t=>t.name===name);if(!tool)fail('E_SCHEMA','Unknown tool');validate(tool,args);
      const operation=name.split('.').pop();
      if(operation==='result'){
        if(!intents.has(args.taskId))fail('E_DEV_RUN','Task does not belong to this session');
        // Before Session admission, this intent is pending or conclusively refused.
        // Querying it must not attempt recovery or depend on a fresh Native read.
        if(!session.requests.has(args.taskId))return view(args.taskId);
        try{
          await status();
          return view(args.taskId,await session.result({admissionRequestId:args.taskId}));
        }catch(error){
          throw Object.assign(new Error('Original task result unavailable'),{code:error.code||'E_DEV',requestId:args.taskId,outcome:error.outcome||'OUTCOME_UNKNOWN'});
        }
      }
      const taskId=args.intentId,digest=canonical({operation,...args});
      if(intents.has(taskId)){
        if(intents.get(taskId).digest!==digest)fail('E_REQUEST_REUSED','Intent already used with different arguments');
        return view(taskId);
      }
      if(intents.size>=256)fail('E_LIMIT','Session intent limit reached');
      // Reserve before any await, including failures and concurrent duplicate calls.
      const params=Object.freeze({operation,policy,policyDigest,...(operation==='write_field'?{text:args.text}:{})});
      const intent={digest,operation,paramsCanonical:canonical(params),state:'ADMISSION_PENDING'};
      intents.set(taskId,intent);
      try{
        await status();
        const admission=await session.run({bindingId:binding.bindingId,requestId:taskId,registrationId,params,deadlineMs:5000});
        return view(taskId,admission);
      }catch(error){
        // No Session request record means run.start was never handed off. Preserve
        // a queryable refusal; once a record exists its UNKNOWN state takes priority.
        if(!session.requests.has(taskId)){
          intent.state='NOT_DISPATCHED';
          intent.error={code:error.code||'E_DEV',message:'Feasibility admission refused',outcome:'NOT_DISPATCHED'};
        }
        // Safe messages only; Native errors may contain paths or source diagnostics.
        throw Object.assign(new Error('Feasibility admission refused; inspect original taskId'),{code:error.code||'E_DEV',requestId:taskId,outcome:intent.error?.outcome||error.outcome||'NOT_DISPATCHED'});
      }
    }
  };
}
export function parseFeasibilityArgs(args){
  const options={},keys={'--registration-id':'registrationId','--extension-id':'extensionId','--tab-id':'tabId','--document-id':'documentId','--url':'url','--selector':'selector'};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--allow-write-field'){
      if(options.allowWriteField)fail('E_SCHEMA','Duplicate flag');options.allowWriteField=true;continue;
    }
    const key=keys[args[i]],value=args[++i];
    if(!key||Object.hasOwn(options,key)||!value||value.startsWith('--'))fail('E_SCHEMA','Invalid startup arguments');
    if(key==='tabId'&&!/^(0|[1-9][0-9]*)$/.test(value))fail('E_SCHEMA','Invalid tabId');
    options[key]=key==='tabId'?Number(value):value;
  }
  return options;
}
export function serveFeasibility(endpoint,io={}){
  return serveMcp({...io,session:endpoint,tools:endpoint.tools,serverInfo:{name:'opendesk-feasibility',version:'1.0.0'},
    instructions:'Locally pinned URL and single text field only. Submit once per intentId, then result(original taskId). Unknown outcomes must not be replayed. No general dev tools.',
    dispatch:(name,args)=>endpoint.dispatch(name,args)});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{serveFeasibility(await createFeasibility(parseFeasibilityArgs(process.argv.slice(2))));}
  catch{process.stderr.write('E_FEASIBILITY_CONFIG: Unable to prepare fixed test session\n');process.exitCode=1;}
}
