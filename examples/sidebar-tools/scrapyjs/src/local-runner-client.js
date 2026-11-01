// The sandbox only speaks to its trusted Host. Session credentials and scope live there.
export const RUNNER_STATE_KEY='local-runner-state';
const terminal=new Set(['completed','stopped','failed','interrupted']);
const statuses=new Set(['queued','running','stopping',...terminal,'unknown']);
const fail=(code,message)=>Object.assign(Error(message),{code});
const clone=value=>structuredClone(value);
function identity(value){
  if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(value))throw fail('E_RUN_IDENTITY','运行身份无效。');
  return value;
}
export const configKey=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
export const isRunSettled=run=>Boolean(run?.workerExited===true&&terminal.has(String(run.status).toLowerCase()));
export const previewCertified=run=>{
  try{const value=normalizeSnapshot(run);return value.mode==='preview'&&value.status==='completed'&&value.workerExited&&value.previewPassed===true&&value.recordsCount>0;}
  catch{return false;}
};
export function normalizeSnapshot(value,expected={}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw fail('E_RUN_RESPONSE','运行回执无效。');
  identity(value.runId);
  identity(value.requestId);
  const status=String(value.status).toLowerCase();
  if(!statuses.has(status)||!['preview','full'].includes(value.mode))throw fail('E_RUN_RESPONSE','运行回执状态无效。');
  const object=item=>item&&typeof item==='object'&&!Array.isArray(item);
  const count=item=>Number.isSafeInteger(item)&&item>=0;
  if(!count(value.pagesVisited)||!count(value.recordsCount)||typeof value.workerExited!=='boolean'||typeof value.previewPassed!=='boolean'||
      typeof value.configHash!=='string'||!value.configHash||value.configHash.length>512||
      !Array.isArray(value.fields)||value.fields.length>256||value.fields.some(field=>typeof field!=='string'||!field||field.length>512)||new Set(value.fields).size!==value.fields.length||
      !object(value.completeness)||!Array.isArray(value.errors)||value.errors.some(error=>typeof error!=='string'&&(!object(error)||typeof error.code!=='string'||typeof error.message!=='string'))||
      (value.stopReason!==undefined&&value.stopReason!==null&&typeof value.stopReason!=='string'))throw fail('E_RUN_RESPONSE','运行指标、字段或错误回执无效。');
  if(Object.keys(value.completeness).length!==value.fields.length)throw fail('E_RUN_RESPONSE','字段完整度与字段列表不符。');
  for(const field of value.fields){
    const metric=value.completeness[field];
    if(!Object.hasOwn(value.completeness,field)||!object(metric)||!count(metric.total)||!count(metric.nonEmpty)||metric.total!==value.recordsCount||metric.nonEmpty>metric.total||
        typeof metric.ratio!=='number'||!Number.isFinite(metric.ratio)||metric.ratio<0||metric.ratio>1||Math.abs(metric.ratio-(metric.total?metric.nonEmpty/metric.total:0))>0.000001)
      throw fail('E_RUN_RESPONSE','字段「'+field+'」完整度回执无效。');
  }
  for(const key of ['runId','requestId','mode','previewRunId','configHash']){
    if(expected[key]!==undefined&&expected[key]!==null&&value[key]!==expected[key])
      throw fail('E_RUN_IDENTITY','运行回执身份或配置摘要不符，未采用。');
  }
  return {...clone(value),status,workerExited:value.workerExited===true};
}
function readPointer(value){
  if(value===null||value===undefined)return null;
  if(value.schemaVersion!==1||!['preview','full'].includes(value.mode))throw fail('E_RUN_STORAGE','保存的运行指针无效，未覆盖。');
  const pointer={schemaVersion:1,requestId:identity(value.requestId),runId:value.runId?identity(value.runId):null,mode:value.mode};
  if(value.previewRunId)pointer.previewRunId=identity(value.previewRunId);
  if(value.configHash){if(typeof value.configHash!=='string'||value.configHash.length>512)throw fail('E_RUN_STORAGE','配置摘要无效。');pointer.configHash=value.configHash;}
  return pointer;
}

export function createLocalRunnerClient(request){
  let pointer=null,snapshot=null,etag,ready=false,mutating=false,restoring=null,storageUncertain=false;
  const call=(method,path,body,targetOrigin)=>request('localTasks.request',{method,path,...(body===undefined?{}:{body}),...(targetOrigin?{targetOrigin}:{})});
  async function readStorage(){
    const row=await request('storage.get',{key:RUNNER_STATE_KEY,withEtag:true});
    if(!row||!(row.etag===null||typeof row.etag==='string'))throw fail('E_RUN_STORAGE','存储未返回 ETag，禁止创建新任务。');
    return row;
  }
  async function persist(next){
    if(new TextEncoder().encode(JSON.stringify(next)).byteLength>8192)throw fail('E_RUN_STORAGE','运行指针超过存储上限。');
    try{
      const reply=await request('storage.set',{key:RUNNER_STATE_KEY,value:next,ifMatch:etag});
      if(reply?.saved!==true)throw fail('E_RUN_STORAGE','运行指针保存结果未知；请读取原请求。');
      const saved=await readStorage();
      if(configKey(saved.value)!==configKey(next))throw fail('E_STORAGE_CONFLICT','运行指针已变化，未覆盖其他窗口。');
      etag=saved.etag;pointer=next;
    }catch(error){storageUncertain=true;throw error;}
  }
  async function adopt(value){
    const next=normalizeSnapshot(value,pointer||{});
    snapshot=next;
    const saved={...pointer,runId:next.runId,...(next.configHash?{configHash:next.configHash}:{})};
    // Retain an in-memory original run even if its pointer write acknowledgement is lost.
    const changed=configKey(saved)!==configKey(pointer);pointer=saved;
    if(changed)await persist(saved);
    return next;
  }
  async function refresh(){
    if(!pointer)return null;
    const original=pointer;
    const path=original.runId?'/v1/runs/'+encodeURIComponent(original.runId):'/v1/runs/by-request/'+encodeURIComponent(original.requestId);
    let reply;
    try{reply=await call('GET',path);}
    catch(error){
      // A trusted tombstone only retires this unresolved request, never a known run
      // or a pointer replaced while its query was in flight. CAS protects other windows.
      if(error?.code!=='E_LOCAL_NOT_CREATED'||original.runId||pointer!==original)throw error;
      await persist(null);storageUncertain=false;return null;
    }
    return adopt(reply);
  }
  async function restore(){
    if(restoring)return restoring;
    restoring=(async()=>{
      const saved=await readStorage();pointer=readPointer(saved.value);etag=saved.etag;ready=true;storageUncertain=false;snapshot=null;
      return pointer?refresh():null;
    })();
    try{return await restoring;}finally{restoring=null;}
  }
  async function start({requestId,mode,config,previewPages=3,previewRunId,configHash}){
    if(mutating)throw fail('E_RUN_BUSY','原操作尚未结束。');
    identity(requestId);
    if(!['preview','full'].includes(mode)||!Number.isInteger(previewPages)||previewPages<1||previewPages>3)throw fail('E_RUN_INPUT','试采页数必须是 1、2 或 3。');
    const target=new URL(config?.url);
    if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw fail('E_RUN_INPUT','目标网址必须是无内嵌凭证的 HTTP 或 HTTPS。');
    const body={requestId,mode,config:clone(config),previewPages};
    mutating=true;
    try{
      if(storageUncertain)throw fail('E_RUN_STORAGE','运行指针保存结果未知或冲突；请先重新读取原 run，禁止重新创建。');
      if(!ready)await restore();
      if(pointer&&!isRunSettled(snapshot))throw fail('E_RUN_BUSY','原请求尚未确认退出，请先查询 / 停止原请求。');
      if(pointer?.requestId===requestId)throw fail('E_RUN_IDENTITY','原 requestId 只能查询，不能重复创建。');
      if(mode==='full'){
        identity(previewRunId);
        const preview=normalizeSnapshot(await call('GET','/v1/runs/'+encodeURIComponent(previewRunId)),{runId:previewRunId,mode:'preview',configHash});
        if(!configHash||!previewCertified(preview)||(preview.config&&configKey(preview.config)!==configKey(config)))throw fail('E_PREVIEW_REQUIRED','试采认证已失效，请重新试采后确认。');
        body.previewRunId=previewRunId;body.configHash=configHash;
      }
      const previous={pointer,snapshot};
      const next={schemaVersion:1,requestId,runId:null,mode,...(mode==='full'?{previewRunId,configHash}:{})};
      await persist(next);snapshot=null;
      let received=false;
      try{const reply=await call('POST','/v1/runs',body,target.origin);received=true;return await adopt(reply);}
      catch(error){
        // Only the trusted Host can prove that preparation or a whitelisted rejection
        // prevented creation. A later storage/adoption failure cannot prove that.
        if(!received&&['E_LOCAL_NOT_CREATED','E_CANCELLED'].includes(error?.code)){
          await persist(previous.pointer);snapshot=previous.snapshot;
          throw error;
        }
        // A create may have taken effect. Resolve by request identity; never replay POST.
        let recovered;
        try{recovered=await refresh();}
        catch(cause){throw fail('E_RUN_UNKNOWN','原请求 '+requestId+' 的创建结果未知，请查询原请求；不会重新创建。'+(cause?.message?' '+cause.message:''));}
        if(!recovered)throw fail('E_LOCAL_NOT_CREATED','原请求 '+requestId+' 已确认未创建，请明确重试。');
        return recovered;
      }
    }finally{mutating=false;}
  }
  async function stop(){
    if(mutating)throw fail('E_RUN_BUSY','原操作尚未结束。');
    if(!pointer?.runId)await refresh();
    if(!pointer?.runId)throw fail('E_RUN_UNKNOWN','原运行身份尚未确认，请按原请求查询。');
    mutating=true;
    try{return await adopt(await call('POST','/v1/runs/'+encodeURIComponent(pointer.runId)+'/stop'));}
    finally{mutating=false;}
  }
  async function records(offset=0,limit=50){
    if(!pointer?.runId)throw fail('E_RUN_IDENTITY','请先查询原运行身份。');
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw fail('E_RUN_INPUT','记录分页参数无效。');
    const reply=await call('GET','/v1/runs/'+encodeURIComponent(pointer.runId)+'/records?offset='+offset+'&limit='+limit);
    if(!reply||!Array.isArray(reply.records)||!Number.isSafeInteger(reply.total)||reply.total<0||reply.offset!==offset||reply.records.length>limit)throw fail('E_RUN_RESPONSE','记录分页回执无效。');
    return reply;
  }
  async function exportRun(format){
    if(!pointer?.runId||!['jsonl','csv'].includes(format))throw fail('E_RUN_INPUT','导出格式或运行身份无效。');
    return request('localTasks.export',{runId:pointer.runId,format});
  }
  return {get pointer(){return pointer&&clone(pointer);},get snapshot(){return snapshot&&clone(snapshot);},get ready(){return ready;},restore,refresh,start,stop,records,export:exportRun};
}
