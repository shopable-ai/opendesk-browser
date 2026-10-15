// HTTP protocol adapter only. It has no browser, shell, storage or execution authority.
// Official references: https://developers.openai.com/api/docs/guides/migrate-to-responses
// and https://developers.openai.com/api/reference/resources/responses/methods/create
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=(code,message,extra={})=>Object.assign(new Error(message),{code,...extra});
const bytes=value=>new TextEncoder().encode(value).byteLength;
const checkAbort=signal=>{if(signal?.aborted)throw signal.reason;};

// These are OpenDesk ADAPTER capabilities, not OpenAI fields or a model probe.
export function responsesAdapterCapabilities({jsonSchema=null}={}) {
  return Object.freeze({provider:'responses',streaming:false,structuredOutput:jsonSchema!==null,
    observation:false,toolCalls:false,activeConversation:false,coldResume:false,cancel:false,
    usage:true,background:false,localAbort:true,modelCompatibility:'NOT_PROBED'});
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

async function readJson(response,signal,limit) {
  const length=response.headers?.get?.('content-length');
  if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)>limit))
    throw fail('E_AI_RESPONSE','AI 返回超过允许大小或长度无效');
  const type=response.headers?.get?.('content-type')||'';
  if(!/^application\/json(?:\s*;|$)/i.test(type))
    throw fail('E_AI_PROTOCOL','Responses 必须返回 JSON；本适配器不接受 SSE 或 HTML');
  if(typeof response.body?.getReader!=='function')
    throw fail('E_AI_PROTOCOL','模型响应没有可限额读取的 HTTP body');
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
  let text='',size=0,ended=false;
  try {
    while(true) {
      const row=await waitFor(reader.read(),signal);
      checkAbort(signal);
      if(row.done){ended=true;break;}
      if(!(row.value instanceof Uint8Array))throw fail('E_AI_PROTOCOL','响应数据类型无效');
      size+=row.value.byteLength;
      if(size>limit)throw fail('E_AI_RESPONSE','AI 返回超过允许大小');
      text+=decoder.decode(row.value,{stream:true});
    }
    text+=decoder.decode();
    checkAbort(signal);
    try{return JSON.parse(text);}catch{throw fail('E_AI_RESPONSE','AI 返回的 HTTP JSON 无效');}
  } finally {
    if(!ended)void reader.cancel().catch(()=>{});
    try{reader.releaseLock();}catch{}
  }
}

export function parseWorkflowResponse(data) {
  if(!object(data)||data.object!=='response'||typeof data.id!=='string'||
    !/^[a-zA-Z0-9_-]{1,200}$/.test(data.id))
    throw fail('E_AI_PROTOCOL','Responses 返回缺少有效响应身份');
  if(data.status!=='completed'||data.error!=null||data.incomplete_details!=null)
    throw fail(data.status==='incomplete'?'E_AI_INCOMPLETE':'E_AI_PROVIDER',
      '模型响应没有完整成功终态；未产生可执行提议',
      {responseId:data.id,upstreamStatus:typeof data.status==='string'?data.status:'unknown'});
  if(!Array.isArray(data.output)||data.output.length>64)
    throw fail('E_AI_PROTOCOL','Responses output 条目无效');
  let text='',messages=0;
  for(const item of data.output) {
    if(!object(item))throw fail('E_AI_PROTOCOL','Responses output 条目无效');
    // Reasoning is neither displayed, persisted, nor replayed by this adapter.
    if(item.type==='reasoning')continue;
    if(item.type!=='message')throw fail('E_AI_UNSUPPORTED','本适配器未实现此 Responses 工具或输出类型');
    if(item.role!=='assistant'||item.status!=='completed'||!Array.isArray(item.content)||
      item.content.length>64||![undefined,null,'final_answer'].includes(item.phase))
      throw fail('E_AI_PROTOCOL','只接受完整的 assistant 最终消息');
    messages++;
    for(const part of item.content) {
      if(part?.type==='refusal')throw fail('E_AI_REFUSAL','模型拒绝了本次请求；未产生可执行提议');
      if(part?.type!=='output_text'||typeof part.text!=='string')
        throw fail('E_AI_UNSUPPORTED','本适配器只支持文本 JSON 输出');
      text+=part.text;
      if(bytes(text)>45000)throw fail('E_AI_RESPONSE','工作流提议超过 45KB');
    }
  }
  // Joining separate complete messages could create an unintended JSON object.
  if(messages!==1||!text.trim())throw fail('E_AI_RESPONSE','需要一个完整的工作流 JSON 消息');
  let proposal;
  try{proposal=JSON.parse(text);}catch{throw fail('E_AI_RESPONSE','AI 未返回有效的工作流 JSON');}
  if(!object(proposal))throw fail('E_AI_RESPONSE','工作流提议必须是 JSON 对象');
  const metadata={provider:'responses',responseId:data.id,upstreamStatus:data.status};
  if(data.usage!=null) {
    if(!object(data.usage)||!['input_tokens','output_tokens','total_tokens'].every(key=>
      Number.isSafeInteger(data.usage[key])&&data.usage[key]>=0))
      throw fail('E_AI_PROTOCOL','模型 usage 字段无效；不会伪造用量');
    metadata.usage=structuredClone(data.usage);
  }
  return {proposal,metadata};
}

// json_object is an explicitly declared baseline, NOT strict schema adherence.
// A trusted caller may opt into a model-supported strict JSON Schema; failure is
// returned as-is rather than silently falling back to JSON mode or another model.
export async function requestWorkflowResponse({endpoint,apiKey,model,instructions,input,
  signal,fetchImpl=globalThis.fetch,timeoutMs=60000,maxResponseBytes=500000,jsonSchema=null,
  ...unsupported}={}) {
  if(Object.keys(unsupported).length)
    throw fail('E_AI_UNSUPPORTED','存在本适配器未实现的请求字段');
  let url;try{url=new URL(endpoint);}catch{}
  if(!url||typeof endpoint!=='string'||endpoint.length>2048||url.protocol!=='https:'||
    url.pathname!=='/v1/responses'||url.username||url.password||url.hash||url.search||
    typeof apiKey!=='string'||!apiKey||apiKey.length>4096||/\s/.test(apiKey)||
    typeof model!=='string'||!model.trim()||model.length>120||
    typeof instructions!=='string'||!instructions.trim()||typeof input!=='string'||!input.trim()||
    typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>180000||
    !Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1||maxResponseBytes>500000)
    throw fail('E_AI_CONFIG','需配置有效的 HTTPS /v1/responses、模型、密钥及限额');
  let format={type:'json_object'};
  if(jsonSchema!==null) {
    if(!object(jsonSchema)||Object.keys(jsonSchema).some(key=>!['name','schema'].includes(key))||
      typeof jsonSchema.name!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(jsonSchema.name)||
      !object(jsonSchema.schema)||jsonSchema.schema.type!=='object'||
      jsonSchema.schema.additionalProperties!==false)
      throw fail('E_AI_CONFIG','严格输出需由可信调用方提供闭合对象 schema');
    format={type:'json_schema',name:jsonSchema.name,schema:structuredClone(jsonSchema.schema),strict:true};
  }
  const body=JSON.stringify({model,instructions,input:[{role:'user',content:[{type:'input_text',text:input}]}],
    text:{format},stream:false,store:false,background:false});
  if(bytes(body)>65536)throw fail('E_AI_INPUT_LIMIT','Responses 输入超过 64KB');
  const controller=new AbortController();
  const cancelled=()=>controller.abort(fail('E_CANCELLED','本地已取消等待；服务端推理终态未确认',
    {upstreamTermination:'NOT_CONFIRMED'}));
  if(signal?.aborted){cancelled();throw controller.signal.reason;}
  signal?.addEventListener('abort',cancelled,{once:true});
  const timer=setTimeout(()=>controller.abort(fail('E_AI_OUTCOME_UNKNOWN','模型请求超时；不会自动重发',
    {upstreamTermination:'NOT_CONFIRMED'})),timeoutMs);
  let response;
  try {
    checkAbort(controller.signal);
    const pending=Promise.resolve(fetchImpl(url.href,{method:'POST',redirect:'error',cache:'no-store',
      credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal,
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},body}));
    pending.then(late=>{if(controller.signal.aborted)void late?.body?.cancel?.().catch(()=>{});},()=>{});
    response=await waitFor(pending,controller.signal);
    if(response.redirected)throw fail('E_AI_PROTOCOL','禁止模型接口重定向');
    if(!response.ok)throw fail('E_AI_PROVIDER','AI 服务请求失败（HTTP '+response.status+'）',
      {httpStatus:response.status});
    const data=await readJson(response,controller.signal,maxResponseBytes);
    checkAbort(controller.signal);
    const result=parseWorkflowResponse(data);
    const requestId=response.headers?.get?.('x-request-id');
    if(typeof requestId==='string'&&/^[a-zA-Z0-9._:-]{1,200}$/.test(requestId))
      result.metadata.upstreamRequestId=requestId;
    return result;
  } catch(error) {
    if(controller.signal.aborted)throw controller.signal.reason;
    if(typeof error?.code==='string'&&error.code.startsWith('E_AI_'))throw error;
    throw fail('E_AI_OUTCOME_UNKNOWN','模型连接或响应读取失败；不会自动重发',
      {upstreamTermination:'NOT_CONFIRMED'});
  } finally {
    clearTimeout(timer);signal?.removeEventListener('abort',cancelled);
    if(!controller.signal.aborted)controller.abort();
    if(response?.body&&!response.body.locked)void response.body.cancel().catch(()=>{});
  }
}

// Defense-in-depth for a receipt obtained by the existing trusted observer.
// This does NOT authenticate arbitrary caller-supplied JSON; UI/RunHost retain
// responsibility for trusted provenance, current permission and exact target.
export function responsePlanningObservation(receipt,target) {
  const keys=['windowId','tabId','frameId','documentId','url','origin'];
  let url;try{url=new URL(target?.url);}catch{}
  if(!object(target)||!keys.every(key=>Object.hasOwn(target,key))||
    !Number.isSafeInteger(target.windowId)||target.windowId<0||!Number.isSafeInteger(target.tabId)||target.tabId<0||target.frameId!==0||
    typeof target.documentId!=='string'||!target.documentId||!url||
    !['http:','https:'].includes(url.protocol)||url.origin!==target.origin||url.username||url.password)
    throw fail('E_DOCUMENT_STALE','Responses 规划需要本轮精确网页身份');
  if(!object(receipt)||receipt.format!=='opendesk.workflow-observation.v1'||
    !['runId','resultId'].every(key=>typeof receipt[key]==='string'&&receipt[key].length>0&&receipt[key].length<=200)||
    !/^[a-f0-9]{64}$/i.test(receipt.sourceHash||'')||
    receipt.summary?.kind!=='semantic-dom-summary'||receipt.summary.origin!==target.origin||
    receipt.summary.documentId!==target.documentId||!Array.isArray(receipt.summary.nodes)||
    !receipt.summary.nodes.length||receipt.summary.nodes.length>24||bytes(JSON.stringify(receipt))>12288)
    throw fail('E_AI_OBSERVATION_REQUIRED','Responses 需要本轮原 RunHost 的有效观察回执');
  // Do not send unrelated receipt fields, URL/query/history or durable IDs.
  return structuredClone({kind:receipt.summary.kind,origin:receipt.summary.origin,
    documentId:receipt.summary.documentId,nodes:receipt.summary.nodes,truncated:receipt.summary.truncated===true});
}

export function assertResponseLocators(workflow,summary) {
  if(!Array.isArray(workflow?.steps)||!Array.isArray(summary?.nodes))
    throw fail('E_AI_RESPONSE','缺少工作流步骤或已授权观察');
  for(const step of workflow.steps) {
    if(!['fill','click','wait','extract','assert'].includes(step.op))continue;
    if(!summary.nodes.some(node=>node?.locator&&!node.locator.parent&&node.locator.index===undefined&&
      (!['fill','click'].includes(step.op)||node.state?.visible===true)&&
      node.locator.kind===step.locatorKind&&node.locator.value===step.selector&&
      (step.locatorKind!=='role'||node.locator.name===step.roleName)))
      throw fail('E_AI_LOCATOR_UNOBSERVED','Responses 提议的目标不在本轮已授权观察中');
  }
  return workflow;
}
