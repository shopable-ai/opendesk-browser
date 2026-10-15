// Optional HTTP protocol adapter for the SAME Go Native Host Codex Manager.
// Transport only: no browser execution, pairing service, token persistence,
// implicit CORS permission, provider fallback, or session resume.
// NOT WIRED to the Sidebar until trustworthy pairing/Origin contract is ready.
import {parseWorkflowResponse} from './responses.js';

const fail=(code,message,extra={})=>Object.assign(new Error(message),{code,...extra});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const bytes=value=>new TextEncoder().encode(value).byteLength;

export function localHTTPAdapterCapabilities() {
  // These describe this client/Gateway subset, not a live Codex/model probe.
  return Object.freeze({
    provider:'local_http',transport:'native-owned-loopback-responses-subset',
    streaming:false,structuredOutput:true,observation:false,toolCalls:false,
    activeConversation:false,coldResume:false,cancel:false,localAbort:true,
    usage:false,store:false,background:false,modelCompatibility:'NOT_PROBED',
    pairingReady:false
  });
}

function endpointURL(endpoint) {
  let url;
  try {url=new URL(endpoint);}catch {}
  // Never resolve arbitrary hostnames, including "localhost" (DNS rebinding);
  // this optional surface must be bound to the exact IP/port of the Native Host.
  if(!url||typeof endpoint!=='string'||endpoint.length>256||
    url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname)||
    !url.port||url.pathname!=='/v1/responses'||url.search||url.hash||
    url.username||url.password)
    throw fail('E_AI_CONFIG','本机网关仅允许已配对的 loopback IP:port /v1/responses');
  return url;
}

function outputFormat(jsonSchema) {
  if(jsonSchema===null)return {type:'json_object'};
  if(!object(jsonSchema)||Object.keys(jsonSchema).some(key=>!['name','schema'].includes(key))||
    typeof jsonSchema.name!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(jsonSchema.name)||
    !object(jsonSchema.schema)||jsonSchema.schema.type!=='object'||
    jsonSchema.schema.additionalProperties!==false)
    throw fail('E_AI_CONFIG','本机严格输出必须提供受信的闭合 JSON Schema');
  const schema=structuredClone(jsonSchema.schema);
  if(bytes(JSON.stringify(schema))>16000)
    throw fail('E_AI_INPUT_LIMIT','本机输出 Schema 超出限制');
  return {type:'json_schema',name:jsonSchema.name,schema,strict:true};
}

function waitFor(promise,signal) {
  if(signal.aborted)return Promise.reject(signal.reason);
  return new Promise((resolve,reject)=>{
    const aborted=()=>{signal.removeEventListener('abort',aborted);reject(signal.reason);};
    signal.addEventListener('abort',aborted,{once:true});
    Promise.resolve(promise).then(value=>{
      signal.removeEventListener('abort',aborted);
      if(signal.aborted)reject(signal.reason);else resolve(value);
    },error=>{signal.removeEventListener('abort',aborted);reject(error);});
  });
}

async function readJSON(response,signal,maxBytes) {
  const contentType=response.headers?.get?.('content-type')||'';
  if(!/^application\/json(?:\s*;|$)/i.test(contentType)||
    typeof response.body?.getReader!=='function')
    throw fail('E_AI_PROTOCOL','本机网关返回了不支持的内容类型');
  const length=response.headers?.get?.('content-length');
  if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)>maxBytes))
    throw fail('E_AI_RESPONSE','本机网关返回超过安全预算');
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
  let size=0,text='',complete=false;
  try {
    while(true) {
      const next=await waitFor(reader.read(),signal);
      if(next.done){complete=true;break;}
      if(!(next.value instanceof Uint8Array))
        throw fail('E_AI_PROTOCOL','本机网关返回非法数据流');
      size+=next.value.byteLength;
      if(size>maxBytes)throw fail('E_AI_RESPONSE','本机网关返回超过安全预算');
      text+=decoder.decode(next.value,{stream:true});
    }
    text+=decoder.decode();
    try {return JSON.parse(text);}catch {
      throw fail('E_AI_PROTOCOL','本机网关返回的 JSON 无效');
    }
  } finally {
    if(!complete)void reader.cancel().catch(()=>{});
    try{reader.releaseLock();}catch{}
  }
}

/**
 * Only callable with an ephemeral credential minted and delivered by a TRUSTED
 * Native pairing owner (not implemented). Never render or persist bearerToken.
 * No network request is made when required capability/contract is missing.
 */
export async function requestLocalHTTPWorkflowResponse({
  endpoint,bearerToken,model,instructions='',input,jsonSchema=null,signal,
  fetchImpl=globalThis.fetch,timeoutMs=120000,maxResponseBytes=90000,
  ...unsupported
}={}) {
  if(Object.keys(unsupported).length)
    throw fail('E_AI_UNSUPPORTED','本机 HTTP 子集不支持这些请求字段');
  const url=endpointURL(endpoint);
  if(typeof bearerToken!=='string'||bearerToken.length<32||bearerToken.length>256||
    /[^\x21-\x7E]/.test(bearerToken)||
    typeof model!=='string'||!/^[a-zA-Z0-9._:-]{1,100}$/.test(model)||
    typeof instructions!=='string'||bytes(instructions)>4096||
    typeof input!=='string'||!input.trim()||bytes(input)>28672||
    typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<1||timeoutMs>120000||!Number.isSafeInteger(maxResponseBytes)||
    maxResponseBytes<1||maxResponseBytes>90000)
    throw fail('E_AI_CONFIG','本机网关需要受信配对令牌、模型、受限输入和有效预算');
  const format=outputFormat(jsonSchema);
  // Deliberately use the same one-user-item shape as the official adapter.
  // This is supported by the audited Go subset; all other input types are not.
  const body=JSON.stringify({model,instructions,input:[{role:'user',
    content:[{type:'input_text',text:input}]}],text:{format},
    stream:false,store:false,background:false});
  if(bytes(body)>60*1024)
    throw fail('E_AI_INPUT_LIMIT','本机网关请求超出 60KiB 帧预算');

  const controller=new AbortController();
  const abort=()=>controller.abort(fail('E_CANCELLED','本地已取消等待，Codex 上游回合终态未确认',
    {upstreamTermination:'NOT_CONFIRMED'}));
  if(signal?.aborted){abort();throw controller.signal.reason;}
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(fail('E_AI_OUTCOME_UNKNOWN',
    '本机网关等待超时，上游任务终态未知；不得自动重试',
    {upstreamTermination:'NOT_CONFIRMED'})),timeoutMs);
  let response;
  try {
    const request=Promise.resolve(fetchImpl(url.href,{method:'POST',redirect:'error',
      cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal,
      headers:{'Accept':'application/json','Content-Type':'application/json',
        'Authorization':'Bearer '+bearerToken},body}));
    request.then(late=>{if(controller.signal.aborted)void late?.body?.cancel?.().catch(()=>{});},()=>{});
    response=await waitFor(request,controller.signal);
    if(response.redirected)throw fail('E_AI_PROTOCOL','本机网关不允许重定向');
    if(!response.ok) {
      const status=Number(response.status);
      if(status===401||status===403)
        throw fail('E_AI_GATEWAY_AUTH','本机网关配对失效或请求来源被拒绝',{httpStatus:status});
      if([400,404,405,415,422].includes(status))
        throw fail('E_AI_UNSUPPORTED','本机网关拒绝请求协议或能力',{httpStatus:status});
      throw fail(status===429?'E_AI_BUSY':'E_AI_PROVIDER','本机网关无法完成任务',
        {httpStatus:status});
    }
    const payload=await readJSON(response,controller.signal,maxResponseBytes);
    if(controller.signal.aborted)throw controller.signal.reason;
    // The Go subset never reports official usage or server session IDs.
    if(payload?.store!==false||payload?.background!==false||
      Object.hasOwn(payload,'usage')||Object.hasOwn(payload,'conversation'))
      throw fail('E_AI_PROTOCOL','本机网关返回了子集不支持的状态字段');
    const parsed=parseWorkflowResponse(payload);
    return {
      proposal:parsed.proposal,
      metadata:{provider:'local_http',responseId:parsed.metadata.responseId,
        usage:null,termination:'completed',transport:'native-owned-loopback-responses-subset'}
    };
  }catch(error) {
    if(controller.signal.aborted)throw controller.signal.reason;
    if(typeof error?.code==='string'&&/^E_AI_|^E_CANCELLED$/.test(error.code))throw error;
    throw fail('E_AI_OUTCOME_UNKNOWN','本机 HTTP 连接或读取失败；不自动重复任务',
      {upstreamTermination:'NOT_CONFIRMED'});
  }finally {
    clearTimeout(timer);signal?.removeEventListener('abort',abort);
    if(!controller.signal.aborted)controller.abort();
    if(response?.body&&!response.body.locked)void response.body.cancel().catch(()=>{});
  }
}
