import crypto from 'node:crypto';
import {requestAgent} from '../cli.mjs';
import {requestShape} from '../wire.mjs';
import {validateTaskParams} from '../../src/platform/tasks/contract.js';
import {decodeValue,encodeValue,VALUE_PROTOCOL} from '../../src/platform/page-port/codec.js';
import {canonical} from '../../src/platform/protocol.js';
import {LocalDevResolver} from './resolver.mjs';
import {devError} from './snapshot.mjs';

const publicSource=value=>{const {sourceUtf8,sourceMapUtf8,...metadata}=value;return metadata;};
function resultValue(wire){
  const value=decodeValue(wire),encoded={valueProtocol:VALUE_PROTOCOL,valueWire:wire,valueIsJson:false};
  try{const json=JSON.stringify(value);if(json!==undefined){const plain=JSON.parse(json);if(canonical(encodeValue(plain))===canonical(wire))return {...encoded,valueIsJson:true,value:plain};}}catch{}
  return encoded;
}
export class LocalDevSession{
  constructor({allowedPaths=[],resolver,request=requestAgent}={}){
    this.resolver=resolver||new LocalDevResolver({allowedPaths});this.request=request;
    this.runs=new Map();this.previews=new Map();this.requests=new Set();this.errors=new Map();this.busy=false;this.closed=false;
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
  attach(params){const value=this.resolver.attach(params);this.provider?.changed();return value;}
  detach({bindingId}){const value=this.resolver.detach(bindingId);this.provider?.changed();return value;}
  close(){this.closed=true;this.provider?.close();}
  async resolve(bindingId){
    this.assertOpen();
    try{const value=await this.resolver.resolve(bindingId);this.assertOpen();this.errors.delete(bindingId);return value;}
    catch(error){this.errors.set(bindingId,{code:error.code||'E_DEV_SOURCE',message:error.message,location:error.location,outcome:'NOT_DISPATCHED'});throw error;}
  }
  assertOpen(){if(this.closed)throw devError('E_DEV_SESSION_CLOSED','The local development connection closed before admission');}
  async status({bindingId,registrationId}={}){
    const projects=this.resolver.list();if(bindingId)this.resolver.get(bindingId);
    try{
      const bridge=await this.call('bridge.status');
      let target=null,targetError=null;
      try{if(bridge.hostRegistrations?.length)target=await this.call('target.current',registrationId?{registrationId}:{});}
      catch(error){targetError={code:error.code,message:error.message};}
      return {connected:true,bridge,target,targetError,projects,...(this.provider?{localProjectProvider:this.provider.state()}: {})};
    }catch(error){return {connected:false,projects,error:{code:error.code||'E_NATIVE_NOT_READY',message:error.message}};}
  }
  async run({bindingId,requestId,params={},registrationId,deadlineMs=30000}={}){
    this.assertOpen();
    if(!/^[A-Za-z0-9._:-]{1,100}$/.test(requestId||''))throw devError('E_SCHEMA','Use one stable requestId per intentional run');
    if(this.requests.has(requestId))throw Object.assign(devError('E_EFFECT_UNKNOWN','This request was already dispatched; query its original result, never automatically repeat'),{requestId,outcome:'OUTCOME_UNKNOWN'});
    if(this.busy)throw devError('E_OWNER','Another local development admission is in progress');
    this.busy=true;
    let dispatched=false;
    try{
      // Capture before resolution so navigation during file reads/compilation is rejected by the existing Host.
      const selected=await this.call('target.current',registrationId?{registrationId}:{});
      const resolved=await this.resolve(bindingId);
      this.assertOpen();
      const page=resolved.runtimeKind==='page-userscript';
      if((!page||resolved.siteOrigins.length)&&!resolved.siteOrigins.includes(selected.target.origin))throw devError('E_DEV_ORIGIN','Current target does not match the project siteOrigins');
      if(page&&(Object.keys(params).length||deadlineMs!==30000))throw devError('E_SCHEMA','Page preview has no Controller params or cancellation deadline');
      if(resolved.paramsSchema)validateTaskParams(resolved.paramsSchema,params);
      const method=page?'page.preview':'run.start';
      const payload={registrationId:selected.registrationId,sourceHash:resolved.sourceHash,sourceBytes:resolved.sourceBytes,target:selected.target,
        ...(page?{sourceUtf8:resolved.sourceUtf8,entryFormat:resolved.entryFormat,...(resolved.pageRules?{pageRules:resolved.pageRules}:{})}:
          {source:{kind:'draft',sourceUtf8:resolved.sourceUtf8},params,deadlineMs})};
      requestShape({v:1,kind:'request',method,requestId,params:payload});
      this.requests.add(requestId);
      dispatched=true;
      const started=await this.call(method,payload,requestId);
      if(page){
        if(typeof started.previewId!=='string'||started.sourceHash!==resolved.sourceHash)throw Object.assign(devError('E_EFFECT_UNKNOWN','Page admission identity differs'),{requestId,outcome:'OUTCOME_UNKNOWN'});
        this.previews.set(started.previewId,{resolved,registrationId:selected.registrationId,requestId,target:selected.target});
        this.errors.delete(bindingId);return {kind:'page-userscript',requestId,...started,source:publicSource(resolved)};
      }
      if(typeof started.runId!=='string')throw Object.assign(devError('E_EFFECT_UNKNOWN','Native admission did not return a run identity'),{requestId,outcome:'OUTCOME_UNKNOWN'});
      this.runs.set(started.runId,{resolved,registrationId:selected.registrationId,requestId,revision:started.revision,target:selected.target,executionTarget:started.executionTarget});
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
  async result({runId,previewId}){
    if(previewId){
      if(runId)throw devError('E_SCHEMA','Select one runId or previewId');
      const owned=this.previews.get(previewId);if(!owned)throw devError('E_DEV_PREVIEW','Preview does not belong to this session');
      const result=await this.call('page.get',{registrationId:owned.registrationId,previewId});
      if(result.previewId!==previewId||result.sourceHash!==owned.resolved.sourceHash||canonical(result.target)!==canonical(owned.target))throw devError('E_DEV_HASH','Page preview result identity differs');
      return {...result,requestId:owned.requestId};
    }
    const owned=this.runs.get(runId);if(!owned)throw devError('E_DEV_RUN','Run does not belong to this development session');
    const response=await this.call('run.get',{registrationId:owned.registrationId,runId});
    if(response.resultDeliveryDenied?.includes(runId))throw devError('E_PERMISSION','Website permission no longer allows this result to be delivered');
    if(response.run?.runId!==runId||response.run?.revision?.sourceHash!==owned.resolved.sourceHash||canonical(response.run.revision)!==canonical(owned.revision))throw devError('E_DEV_HASH','Stored run identity does not match the executed source');
    const actual=response.run.target,initial=owned.executionTarget;
    if(initial){
      if(['windowId','tabId','frameId','targetSessionId','browserSessionIncarnation','mode','allowedOrigin'].some(key=>actual?.[key]!==initial[key])||
        !Number.isSafeInteger(actual?.targetVersion)||actual.targetVersion<initial.targetVersion||
        actual.targetVersion===initial.targetVersion&&['documentId','url'].some(key=>actual[key]!==initial[key])||
        canonical(response.run.identity?.target)!==canonical(actual))throw devError('E_DOCUMENT_STALE','Authority target session or controlled navigation identity differs');
    }else if(['windowId','tabId','frameId','documentId','url'].some(key=>actual?.[key]!==owned.target[key])||actual?.allowedOrigin!==owned.target.origin)throw devError('E_DOCUMENT_STALE','Stored run target differs from its admitted document');
    const results=(response.results||[]).filter(row=>row.runId===runId);
    if(results.some(row=>row.revision?.sourceHash!==owned.resolved.sourceHash||canonical(row.revision)!==canonical(owned.revision)||row.resultId!==response.run.resultId))throw devError('E_DEV_HASH','Durable result identity differs');
    const result=results.find(row=>row.tag==='controller-result');
    if(['completed','stopped','failed','interrupted'].includes(response.run.state)&&response.run.retirementState==='released'&&!result)throw devError('E_RESULT_UNAVAILABLE','Terminal run has no readable durable result');
    return {kind:'controller',runId,requestId:owned.requestId,sourceHash:owned.resolved.sourceHash,run:response.run,results,slotAvailable:response.slotAvailable,
      ...(result?.outcome?.ok?resultValue(result.outcome.valueWire):{}),
      ...(result&&!result.outcome?.ok?{error:result.outcome?.error||result.outcome}: {})};
  }
  async stop({runId,previewId,requestId=crypto.randomUUID()}){
    if(previewId)throw devError('E_PAGE_PREVIEW_STOP_UNSUPPORTED','This USER_SCRIPT preview cannot be terminated as a Controller; managed UI retirement is a separate lifecycle operation');
    const owned=this.runs.get(runId);if(!owned)throw devError('E_DEV_RUN','Run does not belong to this development session');
    return this.call('run.stop',{registrationId:owned.registrationId,runId},requestId);
  }
  async diagnostics({bindingId,runId,previewId}={}){
    if(runId||previewId)return this.result({runId,previewId});
    if(bindingId){this.resolver.get(bindingId);return {bindingId,lastError:this.errors.get(bindingId)||null};}
    return {projects:this.resolver.list(),errors:[...this.errors].map(([bindingId,error])=>({bindingId,...error}))};
  }
}
