import crypto from 'node:crypto';
import {requestAgent} from '../cli.mjs';
import {requestShape} from '../wire.mjs';
import {validateTaskParams} from '../../src/platform/tasks/contract.js';
import {decodeValue} from '../../src/platform/page-port/codec.js';
import {canonical} from '../../src/platform/protocol.js';
import {LocalDevResolver} from './resolver.mjs';
import {devError} from './snapshot.mjs';

const publicSource=value=>{const {sourceUtf8,sourceMapUtf8,...metadata}=value;return metadata;};
export class LocalDevSession{
  constructor({allowedPaths=[],resolver,request=requestAgent}={}){
    this.resolver=resolver||new LocalDevResolver({allowedPaths});this.request=request;
    this.runs=new Map();this.requests=new Set();this.errors=new Map();this.busy=false;
  }
  async call(method,params={},requestId=crypto.randomUUID()){
    let response;
    try{response=await this.request(method,params,requestId);}
    catch(error){
      if(error.code==='E_EFFECT_UNKNOWN')throw Object.assign(error,{outcome:'OUTCOME_UNKNOWN',requestId});
      if(error.code==='E_NATIVE_NOT_READY')Object.assign(error,{outcome:'NOT_DISPATCHED',requestId});
      throw error;
    }
    if(response?.v!==1||response.kind!=='response'||response.requestId!==requestId||Object.hasOwn(response,'result')===Object.hasOwn(response,'error'))throw Object.assign(devError('E_EFFECT_UNKNOWN','Native response identity is missing or mismatched'),{outcome:'OUTCOME_UNKNOWN',requestId});
    if(response.error)throw Object.assign(devError(response.error.code,response.error.message),response.error,{requestId});
    return response.result;
  }
  attach(params){return this.resolver.attach(params);}
  detach({bindingId}){return this.resolver.detach(bindingId);}
  async status({bindingId,registrationId}={}){
    const projects=this.resolver.list();if(bindingId)this.resolver.get(bindingId);
    try{
      const bridge=await this.call('bridge.status');
      let target=null,targetError=null;
      try{if(bridge.hostRegistrations?.length)target=await this.call('target.current',registrationId?{registrationId}:{});}
      catch(error){targetError={code:error.code,message:error.message};}
      return {connected:true,bridge,target,targetError,projects};
    }catch(error){return {connected:false,projects,error:{code:error.code||'E_NATIVE_NOT_READY',message:error.message}};}
  }
  async run({bindingId,requestId,params={},registrationId,deadlineMs=30000}={}){
    if(!/^[A-Za-z0-9._:-]{1,100}$/.test(requestId||''))throw devError('E_SCHEMA','Use one stable requestId per intentional run');
    if(this.requests.has(requestId))throw Object.assign(devError('E_EFFECT_UNKNOWN','This request was already dispatched; query its original result, never automatically repeat'),{requestId,outcome:'OUTCOME_UNKNOWN'});
    if(this.busy)throw devError('E_OWNER','Another local development admission is in progress');
    this.busy=true;
    let dispatched=false;
    try{
      // Capture before resolution so navigation during file reads/compilation is rejected by the existing Host.
      const selected=await this.call('target.current',registrationId?{registrationId}:{});
      const resolved=await this.resolver.resolve(bindingId);
      if(resolved.runtimeKind!=='controller')throw devError('E_DEV_RUNTIME','Page USER_SCRIPT local preview is not enabled in this P0 adapter');
      if(!resolved.siteOrigins.includes(selected.target.origin))throw devError('E_DEV_ORIGIN','Current target does not match the project siteOrigins');
      if(resolved.paramsSchema)validateTaskParams(resolved.paramsSchema,params);
      const payload={registrationId:selected.registrationId,source:{kind:'draft',sourceUtf8:resolved.sourceUtf8},
        sourceHash:resolved.sourceHash,sourceBytes:resolved.sourceBytes,target:selected.target,params,deadlineMs};
      requestShape({v:1,kind:'request',method:'run.start',requestId,params:payload});
      this.requests.add(requestId);
      dispatched=true;
      const started=await this.call('run.start',payload,requestId);
      if(typeof started.runId!=='string')throw Object.assign(devError('E_EFFECT_UNKNOWN','Native admission did not return a run identity'),{requestId,outcome:'OUTCOME_UNKNOWN'});
      this.runs.set(started.runId,{resolved,registrationId:selected.registrationId,requestId,revision:started.revision,target:selected.target});
      if(started.revision?.sourceHash!==resolved.sourceHash)throw Object.assign(devError('E_DEV_HASH','Actual Controller revision differs from the resolved source'),{runId:started.runId,requestId,outcome:'OUTCOME_UNKNOWN'});
      this.errors.delete(bindingId);
      return {kind:'controller',requestId,...started,source:publicSource(resolved)};
    }catch(error){
      error.outcome ||= dispatched?'OUTCOME_UNKNOWN':'NOT_DISPATCHED';
      error.requestId ||= requestId;
      this.errors.set(bindingId,{code:error.code||'E_DEV',message:error.message,location:error.location,requestId,outcome:error.outcome||'NOT_DISPATCHED'});
      throw error;
    }finally{this.busy=false;}
  }
  async result({runId}){
    const owned=this.runs.get(runId);if(!owned)throw devError('E_DEV_RUN','Run does not belong to this development session');
    const response=await this.call('run.get',{registrationId:owned.registrationId,runId});
    if(response.resultDeliveryDenied?.includes(runId))throw devError('E_PERMISSION','Website permission no longer allows this result to be delivered');
    if(response.run?.runId!==runId||response.run?.revision?.sourceHash!==owned.resolved.sourceHash||canonical(response.run.revision)!==canonical(owned.revision))throw devError('E_DEV_HASH','Stored run identity does not match the executed source');
    if(['windowId','tabId','frameId','documentId','url'].some(key=>response.run.target?.[key]!==owned.target[key])||response.run.target?.allowedOrigin!==owned.target.origin)throw devError('E_DOCUMENT_STALE','Stored run target differs from its admitted document');
    const results=(response.results||[]).filter(row=>row.runId===runId);
    if(results.some(row=>row.revision?.sourceHash!==owned.resolved.sourceHash||canonical(row.revision)!==canonical(owned.revision)||row.resultId!==response.run.resultId))throw devError('E_DEV_HASH','Durable result identity differs');
    const result=results.find(row=>row.tag==='controller-result');
    if(['completed','stopped','failed','interrupted'].includes(response.run.state)&&response.run.retirementState==='released'&&!result)throw devError('E_RESULT_UNAVAILABLE','Terminal run has no readable durable result');
    return {kind:'controller',runId,requestId:owned.requestId,sourceHash:owned.resolved.sourceHash,run:response.run,results,slotAvailable:response.slotAvailable,
      ...(result?.outcome?.ok?{value:JSON.parse(JSON.stringify(decodeValue(result.outcome.valueWire),(_key,value)=>typeof value==='bigint'?{type:'bigint',value:String(value)}:value)??'null')}:{}),
      ...(result&&!result.outcome?.ok?{error:result.outcome?.error||result.outcome}: {})};
  }
  async stop({runId,requestId=crypto.randomUUID()}){
    const owned=this.runs.get(runId);if(!owned)throw devError('E_DEV_RUN','Run does not belong to this development session');
    return this.call('run.stop',{registrationId:owned.registrationId,runId},requestId);
  }
  async diagnostics({bindingId,runId}={}){
    if(runId)return this.result({runId});
    if(bindingId){this.resolver.get(bindingId);return {bindingId,lastError:this.errors.get(bindingId)||null};}
    return {projects:this.resolver.list(),errors:[...this.errors].map(([bindingId,error])=>({bindingId,...error}))};
  }
}
