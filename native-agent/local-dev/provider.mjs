import net from 'node:net';
import crypto from 'node:crypto';
import {loadInstall} from '../install.mjs';
import {LineDecoder,writeLine,encode} from '../wire.mjs';

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
          try{encode(response);write(response);}catch(error){
            try{write({...response,result:undefined,error:{code:error.code||'E_DEV_LIMIT',message:'Local execution payload exceeds the Native message limit'}});}catch{current.destroy();}
          }
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
        }).then(result=>reply({result}),error=>reply({error:{code:error.code||'E_DEV_SOURCE',message:'Local source is invalid or unavailable; inspect MCP diagnostics ('+(error.code||'E_DEV_SOURCE')+')'}})).finally(()=>{active--;seen.delete(message.requestId);});
      }}catch{current.destroy();}
    });
    current.on('error',()=>current.destroy());
    current.on('close',()=>{if(current!==socket)return;epoch=null;if(!closed){timer=setTimeout(attempt,lastError==='E_DEV_PROVIDER_CONFLICT'?Math.max(retryMs,15000):retryMs);timer.unref?.();}});
  }
  attempt();
  return {changed,state,close(){closed=true;epoch=null;clearTimeout(timer);socket?.destroy();}};
}
