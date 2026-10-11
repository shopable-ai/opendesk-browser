import net from 'node:net';
import crypto from 'node:crypto';
import {loadInstall} from '../install.mjs';
import {LineDecoder,writeLine,MAX_BYTES} from '../wire.mjs';

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
    E_DEV_DISCONNECTED:'本地开发连接已断开；恢复后需明确重新发起运行。'
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
export function createLocalProjectProvider({session,installation=loadInstall,connect=options=>net.createConnection(options),retryMs=1500,leaseId=null}={}) {
  const providerId=crypto.randomUUID();
  const modern=typeof leaseId==='string'&&leaseId.length>0;
  const catalog=()=>session.resolver.list().map(row=>({bindingId:row.bindingId,name:row.name,runtimeKind:session.resolver.get(row.bindingId).runtimeKind}));
  let socket,epoch,closed=false,timer,authenticated=false,lastError=null;
  const state=()=>({connected:!!epoch,providerId,lastError});
  function write(value){writeLine(socket,value);}
  function changed(){if(epoch)try{write({v:1,kind:'provider.changed',providerEpoch:epoch,...(modern?{projects:catalog()}:{})});}catch{socket.destroy();}}
  function attempt(){
    if(closed)return;
    let info;
    try{info=installation();socket=connect({path:info.socketPath});}
    catch{timer=setTimeout(attempt,retryMs);timer.unref?.();return;}
    const current=socket,decoder=new LineDecoder(),seen=new Set();let active=0;
    authenticated=false;epoch=null;
    const live=()=>!closed&&current===socket&&!current.destroyed;
    current.on('connect',()=>{try{write({v:1,kind:'auth',credential:info.clientCredential});}catch{current.destroy();}});
    current.on('data',chunk=>{
      try{for(const message of decoder.push(chunk)){
        if(!authenticated){
          if(message?.v!==1||message.kind!=='authenticated'||!message.browserReady)throw Error('E_NATIVE_NOT_READY');
          if(message.localDevVersion!==1||modern&&message.localDevMultiVersion!==1){lastError='E_NATIVE_UPDATE_REQUIRED';throw Error(lastError);}
          authenticated=true;write({v:1,kind:'provider.register',providerId,
            ...(modern?{catalogVersion:2,leaseId,projects:catalog()}:{})});continue;
        }
        if(!epoch){
          if(message?.v===1&&message.kind==='provider.rejected'){lastError=message.error?.code||'E_DEV_PROVIDER';throw Error(lastError);}
          if(message?.v!==1||message.kind!=='provider.registered'||message.providerId!==providerId||typeof message.providerEpoch!=='string')throw Error('E_PROVIDER');
          epoch=message.providerEpoch;lastError=null;continue;
        }
        if(message?.v!==1||message.kind!=='dev.request'||message.providerEpoch!==epoch||
          typeof message.requestId!=='string'||!['projects.list','project.resolve'].includes(message.method)||
          !message.params||typeof message.params!=='object'||Array.isArray(message.params)||
          Object.keys(message.params).some(key=>key!=='bindingId')||
          message.method==='project.resolve'&&typeof message.params.bindingId!=='string'||
          seen.has(message.requestId))throw Error('E_SCHEMA');
        seen.add(message.requestId);
        const capturedEpoch=epoch;
        const reply=data=>{
          if(!live()||epoch!==capturedEpoch)return;
          const response={v:1,kind:'dev.response',providerEpoch:capturedEpoch,requestId:message.requestId,...data};
          // A valid compiled JS byte length does NOT imply a valid JSON frame.
          // This Provider is read-only: overflow happens before any browser run.
          const jsonBytes=Buffer.byteLength(JSON.stringify(response),'utf8');
          if(jsonBytes>MAX_BYTES){
            const sourceBytes=Number.isSafeInteger(data.result?.sourceBytes)
              ?data.result.sourceBytes:typeof data.result?.sourceUtf8==='string'
                ?Buffer.byteLength(data.result.sourceUtf8,'utf8'):0;
            try{write({v:1,kind:'dev.response',providerEpoch:capturedEpoch,
              requestId:message.requestId,error:{code:'E_LIMIT',
                message:'Native dev.response exceeds limit: sourceBytes='+sourceBytes+
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
          if(message.method==='projects.list')return {projects:session.resolver.list()};
          const value=await session.resolve(message.params.bindingId);
          // Only execution inputs cross into the extension. Paths, file graph,
          // source maps and the rest of the workspace remain in the Node process.
          const {bindingId,projectId,runtimeKind,managedUI,entryFormat,sourceUtf8,sourceHash,sourceBytes,inputHash,cacheHit,capturedAt,siteOrigins,pageRules,paramsSchema}=value;
          return {bindingId,projectId,runtimeKind,managedUI,entryFormat,sourceUtf8,sourceHash,sourceBytes,inputHash,cacheHit,capturedAt,siteOrigins,...(pageRules?{pageRules}:{}),...(paramsSchema?{paramsSchema}:{})};
        }).then(result=>reply({result}),error=>reply({error:publicLocalProjectError(error)})).finally(()=>{active--;seen.delete(message.requestId);});
      }}catch{current.destroy();}
    });
    current.on('error',()=>current.destroy());
    current.on('close',()=>{if(current!==socket)return;epoch=null;if(!closed){timer=setTimeout(attempt,lastError==='E_DEV_PROVIDER_CONFLICT'?Math.max(retryMs,15000):retryMs);timer.unref?.();}});
  }
  attempt();
  return {changed,state,close(){closed=true;epoch=null;clearTimeout(timer);socket?.destroy();}};
}
