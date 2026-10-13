import net from 'node:net';
import crypto from 'node:crypto';
import {loadInstall} from '../install.mjs';
import {LineDecoder,writeLine,MAX_BYTES} from '../wire.mjs';
import {validLocalProjectRequest,localSourceMethod} from '../local-project-source-contract.mjs';
import {createFrozenProjectSources} from './frozen-source.mjs';

// Keep private absolute paths, source text and source maps inside the trusted
// Node/MCP process. Only actionable codes and safe project-relative locations
// may cross the Native provider into a browser UI.
export function publicLocalProjectError(error){
  const code=/^E_[A-Z0-9_]{1,48}$/.test(error?.code||'')?error.code:'E_DEV_SOURCE';
  const hints={
    E_PROJECT_FILE:'本地导入文件不存在；检查文件名及 import 相对路径。',
    E_PROJECT_SYNTAX:'JavaScript 语法有误；修正指定模块后再次运行。',
    E_PROJECT_IMPORT:'静态 import 路径或 npm 声明不符合项目合同。',
    E_PROJECT_ENTRY:'入口需默认导出可静态确认的函数。',
    E_PROJECT_ENTRY_CYCLE:'入口默认导出的引用链存在循环。',
    E_PROJECT_ENTRY_AMBIGUOUS:'入口重导出有歧义，请使用明确的命名导出。',
    E_PROJECT_NPM_LOCK:'npm 依赖与 lockfile 不一致；在项目目录核对并重新安装固定版本。',
    E_PROJECT_WEBPACK:'模块构建失败；检查导入目标和导出名称，详细信息可查看本地 MCP 诊断。',
    E_REMOTE_UNLOCKED:'HTTPS ESM 尚未锁定；先在可信本地终端审阅并批准锁定，然后再运行。',
    E_REMOTE_LOCK:'HTTPS ESM 锁文件无效；请核对项目中的固定版本。',
    E_REMOTE_CACHE:'本地远端依赖缓存缺失；请从已审核版本恢复对应字节。',
    E_REMOTE_HASH:'远端依赖缓存与 SHA-256 不符；已拒绝运行。',
    E_REMOTE_URL:'HTTPS 模块 URL 不符合受信下载规则。',
    E_REMOTE_URL_SECRET:'HTTPS 模块 URL 含疑似令牌或凭据参数；请使用不含秘密的固定公开 URL，禁止提交到 Git。',
    E_REMOTE_IMPORT:'远端模块包含当前不支持的静态依赖。',
    E_REMOTE_DYNAMIC:'远端模块包含动态代码加载；请使用本地 npm/ESM 项目。',
    E_PROJECT_CHANGED:'本地源码、项目或依赖在读取时发生变化；检查后明确重试。',
    E_DEV_AUTH:'项目授权不足或已撤销；需重新核对来源权限。',
    E_DEV_DETACHED:'本地项目已断开；请重新授权或选择。',
    E_DEV_LIMIT:'项目或 Native 消息超过当前容量；请精简依赖闭包。',
    E_PROJECT_OUTPUT_LIMIT:'构建产物超出当前执行容量；减少运行时依赖。',
    E_DEV_DISCONNECTED:'本地开发连接已断开；恢复后需明确重新发起运行。',
    E_NATIVE_UPDATE_REQUIRED:'当前 Native Host 不支持固定源码分块读取；请更新已安装的 OpenDesk 本地连接后重试。',
    E_DEV_SOURCE_EXPIRED:'固定源码读取已过期；请核对项目后明确重新运行。',
    E_DEV_HASH:'固定源码字节或身份不一致；已拒绝运行。'
  };
  const loc=typeof error?.location==='string'?{file:error.location}:error?.location;
  const file=loc?.file;
  const safe=typeof file==='string'&&file.length<=240&&!file.startsWith('.')&&
    /^[A-Za-z0-9@][A-Za-z0-9@._/-]*$/.test(file)&&
    !file.split('/').some(part=>part==='..'||part==='.'||part==='');
  const line=Number.isSafeInteger(loc?.line)&&loc.line>0&&loc.line<1000000?loc.line:null;
  const column=Number.isSafeInteger(loc?.column)&&loc.column>=0&&loc.column<1000000?loc.column+1:null;
  const where=safe?'（'+file+(line?':'+line+(column!==null?':'+column:''):'')+'）':'';
  return {code,message:(hints[code]||'本地项目暂不可用，请在可信 MCP 诊断中核对详细原因。')+where+' ['+code+']'};
}

// A read-only role on the EXISTING private Native socket. This process owns the
// same Resolver as MCP; it never dispatches browser code or accepts disk paths.
export function publicLocalProjectPreparation(value){
  const states=['unprepared','merging','updating','ready','source-error'];
  const out={state:states.includes(value?.state)?value.state:'unprepared'};
  for(const key of ['sourceRevision','sourceHash','artifactId'])
    if(/^[a-f0-9]{64}$/.test(value?.[key]||''))out[key]=value[key];
  for(const key of ['buildCount','cacheHits','preparations','superseded','watchErrors'])
    if(Number.isSafeInteger(value?.[key])&&value[key]>=0&&value[key]<=1000000000)out[key]=value[key];
  for(const key of ['debounceMs','notificationToStartMs'])
    if(Number.isFinite(value?.[key])&&value[key]>=0&&value[key]<=604800000)out[key]=value[key];
  if(value?.timings){
    const timings={};
    for(const key of ['validationMs','dependencyMs','webpackMs','checkMs','totalMs'])
      if(Number.isFinite(value.timings[key])&&value.timings[key]>=0&&value.timings[key]<=604800000)timings[key]=value.timings[key];
    for(const key of ['buildCount','moduleCount'])
      if(Number.isSafeInteger(value.timings[key])&&value.timings[key]>=0&&value.timings[key]<=1000000000)timings[key]=value.timings[key];
    out.timings=timings;
  }
  if(value?.error)out.error=publicLocalProjectError(value.error);
  return out;
}

export function createLocalProjectProvider({session,installation=loadInstall,connect=options=>net.createConnection(options),retryMs=1500,leaseId=null}={}) {
  const providerId=crypto.randomUUID();
  const modern=typeof leaseId==='string'&&leaseId.length>0;
  const publicProjects=()=>session.resolver.list().map(row=>({...row,preparation:publicLocalProjectPreparation(row.preparation)}));
  const catalog=()=>publicProjects().map(row=>({bindingId:row.bindingId,name:row.name,
    runtimeKind:session.resolver.get(row.bindingId).runtimeKind,preparation:row.preparation}));
  const frozenSources=createFrozenProjectSources({resolver:session.resolver});
  let socket,epoch,closed=false,timer,authenticated=false,lastError=null,preparationUpdates=false,sourceTransfers=false,unsubscribePreparation;
  const state=()=>({connected:!!epoch,providerId,lastError,...(epoch?{providerEpoch:epoch}:{})});
  function write(value){writeLine(socket,value);}
  function changed(){if(epoch)try{write({v:1,kind:'provider.changed',providerEpoch:epoch,...(modern?{projects:catalog()}:{})});}catch{socket.destroy();}}
  function attempt(){
    if(closed)return;
    let info;
    try{info=installation();socket=connect({path:info.socketPath});}
    catch{timer=setTimeout(attempt,retryMs);timer.unref?.();return;}
    const current=socket,decoder=new LineDecoder(),seen=new Set();let active=0;
    authenticated=false;epoch=null;sourceTransfers=false;frozenSources.clear();
    const live=()=>!closed&&current===socket&&!current.destroyed;
    current.on('connect',()=>{try{write({v:1,kind:'auth',credential:info.clientCredential});}catch{current.destroy();}});
    current.on('data',chunk=>{
      try{for(const message of decoder.push(chunk)){
        if(!authenticated){
          if(message?.v!==1||message.kind!=='authenticated'||!message.browserReady)throw Error('E_NATIVE_NOT_READY');
          if(message.localDevVersion!==1||modern&&message.localDevMultiVersion!==1){lastError='E_NATIVE_UPDATE_REQUIRED';throw Error(lastError);}
            preparationUpdates=modern&&message.localDevPreparationVersion===1;
            sourceTransfers=message.localDevSourceVersion===1;
            authenticated=true;write({v:1,kind:'provider.register',providerId,...(sourceTransfers?{localDevSourceVersion:1}:{}),
            ...(modern?{catalogVersion:2,leaseId,projects:catalog()}:{})});continue;
        }
        if(!epoch){
          if(message?.v===1&&message.kind==='provider.rejected'){lastError=message.error?.code||'E_DEV_PROVIDER';throw Error(lastError);}
          if(message?.v!==1||message.kind!=='provider.registered'||message.providerId!==providerId||typeof message.providerEpoch!=='string')throw Error('E_PROVIDER');
            epoch=message.providerEpoch;lastError=null;
            if(preparationUpdates)unsubscribePreparation=session.resolver?.preparation?.subscribe(changed);
          if(session.resolver?.preparation)for(const row of session.resolver.list())session.resolver.preparation.start(row.bindingId);
          continue;
        }
        if(message?.v!==1||message.kind!=='dev.request'||message.providerEpoch!==epoch||
          typeof message.requestId!=='string'||!validLocalProjectRequest(message.method,message.params)||
          localSourceMethod(message.method)&&!sourceTransfers||
          seen.has(message.requestId))throw Error('E_SCHEMA');
        seen.add(message.requestId);
        const capturedEpoch=epoch;
        const reply=data=>{
          if(!live()||epoch!==capturedEpoch)return;
          let response={v:1,kind:'dev.response',providerEpoch:capturedEpoch,requestId:message.requestId,...data};
          // Leave headroom for an aggregating Host's scoped binding and JSON
          // escaping. Large code crosses only the negotiated frozen protocol.
          if(message.method==='project.resolve'&&data.result&&sourceTransfers&&
            Buffer.byteLength(JSON.stringify(response),'utf8')>MAX_BYTES-4096){
            try{
              const {sourceUtf8,...metadata}=data.result;
              response={...response,result:{...metadata,sourceRef:frozenSources.capture(data.result,capturedEpoch)}};
            }catch(error){response={v:1,kind:'dev.response',providerEpoch:capturedEpoch,requestId:message.requestId,error:publicLocalProjectError(error)};}
          }
          // A valid compiled JS byte length does NOT imply a valid JSON frame.
          // This Provider is read-only: overflow happens before any browser run.
          const jsonBytes=Buffer.byteLength(JSON.stringify(response),'utf8');
          if(jsonBytes>MAX_BYTES){
            const sourceBytes=Number.isSafeInteger(data.result?.sourceBytes)
              ?data.result.sourceBytes:typeof data.result?.sourceUtf8==='string'
                ?Buffer.byteLength(data.result.sourceUtf8,'utf8'):0;
            try{write({v:1,kind:'dev.response',providerEpoch:capturedEpoch,
              requestId:message.requestId,error:{code:!sourceTransfers&&frozenSources.supported(data.result)?'E_NATIVE_UPDATE_REQUIRED':'E_LIMIT',
                message:(!sourceTransfers&&frozenSources.supported(data.result)?'当前 Native Host 不支持固定源码分块读取，请更新本地 OpenDesk 连接。 ':'')+'Native dev.response exceeds limit: sourceBytes='+sourceBytes+
                  ', jsonBytes='+jsonBytes+', limitBytes='+MAX_BYTES+
                  ', dispatch=NOT_DISPATCHED'}});}
            catch{current.destroy();}
            return;
          }
          // Socket errors/unknown delivery must not trigger an implicit retry.
          try{write(response);}catch{current.destroy();}
        };
        if(active>=4){seen.delete(message.requestId);reply({error:{code:'E_LIMIT',message:'Too many local source requests'}});continue;}
        active++;
        Promise.resolve().then(async()=>{
          if(message.method==='projects.list')return {projects:publicProjects()};
          if(message.method==='project.source.read')return frozenSources.read(message.params,capturedEpoch);
          if(message.method==='project.source.validate')return frozenSources.validate(message.params,capturedEpoch);
          const value=await session.resolve(message.params.bindingId);
          // Only execution inputs cross into the extension. Paths, file graph,
          // source maps and the rest of the workspace remain in the Node process.
          const {bindingId,projectId,runtimeKind,managedUI,entryFormat,sourceUtf8,sourceHash,sourceBytes,inputHash,cacheHit,capturedAt,siteOrigins,pageRules,paramsSchema,sourceRevision,artifactId,timings}=value;
          return {bindingId,projectId,runtimeKind,managedUI,entryFormat,sourceUtf8,sourceHash,sourceBytes,inputHash,cacheHit,capturedAt,siteOrigins,sourceRevision,artifactId,timings,...(pageRules?{pageRules}:{}),...(paramsSchema?{paramsSchema}:{})};
        }).then(result=>reply({result}),error=>reply({error:publicLocalProjectError(error)})).finally(()=>{active--;seen.delete(message.requestId);});
      }}catch{current.destroy();}
    });
    current.on('error',()=>current.destroy());
    current.on('close',()=>{if(current!==socket)return;epoch=null;preparationUpdates=false;sourceTransfers=false;frozenSources.clear();unsubscribePreparation?.();unsubscribePreparation=null;session.resolver?.preparation?.stopAll();if(!closed){timer=setTimeout(attempt,lastError==='E_DEV_PROVIDER_CONFLICT'?Math.max(retryMs,15000):retryMs);timer.unref?.();}});
  }
  attempt();
  return {changed,state,close(){closed=true;epoch=null;preparationUpdates=false;sourceTransfers=false;frozenSources.clear();unsubscribePreparation?.();unsubscribePreparation=null;clearTimeout(timer);session.resolver?.preparation?.stopAll();socket?.destroy();}};
}
