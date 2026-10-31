import net from 'node:net';
import {loadInstall} from '../install.mjs';
import {LineDecoder,writeLine,encode,WireError} from '../wire.mjs';
import {MANAGED_SERVICES_PROTOCOL as protocol,SERVICE_READS,serviceCall,serviceDescriptor,serviceExact,serviceID,serviceObject} from '../../src/native-agent/managed-service-protocol.js';

// An explicitly started role on the original private Native socket. This is
// neither a second Native Host nor an HTTP endpoint. No implicit reconnect.
export function createManagedServiceProvider({descriptor,handler,onDisconnect=()=>{},installation=loadInstall,
  connect=options=>net.createConnection(options),timeoutMs=5000}={}){
  if(!serviceDescriptor(descriptor)||typeof handler!=='function')throw new WireError('E_SERVICE_SCHEMA');
  descriptor=structuredClone(descriptor);
  let socket,closed=false,started=false,registered=false,authenticated=false,providerEpoch=null,
    extensionId=null,timer,resolveStart,rejectStart,retired=false;
  let lastSequence=0;
  const active=new Set();
  const state=()=>({connected:registered&&!closed,serviceId:descriptor.serviceId,
    serviceInstanceId:descriptor.serviceInstanceId,...(registered?{providerEpoch}:{})});
  function finish(error){clearTimeout(timer);if(error)rejectStart?.(error);else resolveStart?.(state());resolveStart=null;rejectStart=null;}
  function retire(error=new WireError('E_SERVICE_DISCONNECTED')){
    if(closed)return;closed=true;registered=false;providerEpoch=null;finish(error);socket?.destroy();
    if(!retired){retired=true;try{onDisconnect();}catch{}}
  }
  function reply(request,result,error){
    if(closed||!registered)return;
    const message={v:1,kind:'services.result',protocol,requestId:request.requestId,
      serviceId:descriptor.serviceId,providerEpoch,...(error?{error}:{result})};
    try{writeLine(socket,message);}catch{retire();}
  }
  const reject=(request,code,outcome='NOT_DISPATCHED')=>reply(request,null,{code,message:code,outcome});
  async function invoke(request){
    if(!serviceExact(request,['v','kind','protocol','requestId','serviceId','serviceInstanceId','providerEpoch','owner','action','payload'])||
      request.v!==1||request.protocol!==protocol||!serviceID(request.requestId))return retire(new WireError('E_SERVICE_SCHEMA'));
    const {serviceId,providerEpoch:epoch,owner,action,payload}=request;
    if(!serviceCall({serviceId,providerEpoch:epoch,owner,action,payload}))return reject(request,'E_SERVICE_SCHEMA');
    if(owner.extensionId!==extensionId)return reject(request,'E_SERVICE_OWNER');
    if(serviceId!==descriptor.serviceId||request.serviceInstanceId!==descriptor.serviceInstanceId||epoch!==providerEpoch)
      return reject(request,'E_SERVICE_SESSION');
    // The Native broker allocates req_<monotonic integer> per provider epoch,
    // mapping it back to the original browser request ID. A watermark bounds
    // replay state without exhausting a lifetime set or evicting old write IDs.
    const sequence=/^req_[1-9][0-9]{0,15}$/.test(request.requestId)?Number(request.requestId.slice(4)):NaN;
    if(!Number.isSafeInteger(sequence))return reject(request,'E_SERVICE_SCHEMA');
    // A watermark proves replay, not whether its original action committed.
    // We retain no old payload/result, so even a changed action stays unknown.
    if(sequence<=lastSequence)return reject(request,'E_SERVICE_DUPLICATE','OUTCOME_UNKNOWN');
    lastSequence=sequence;
    if(active.size>=4)return reject(request,'E_SERVICE_LIMIT');
    active.add(request.requestId);
    try{
      const result=await handler({owner:structuredClone(owner),action,payload:structuredClone(payload)});
      if(!serviceObject(result))throw new WireError('E_SERVICE_RESULT');
      encode({v:1,kind:'services.result',protocol,requestId:request.requestId,serviceId,providerEpoch:epoch,result});
      reply(request,result);
    }catch(error){
      const code=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)?error.code:'E_SERVICE_FAILED';
      const outcome=['OUTCOME_UNKNOWN','FAILED_CONFIRMED','NOT_DISPATCHED'].includes(error?.outcome)?error.outcome:
        SERVICE_READS.includes(action)?'FAILED_CONFIRMED':'OUTCOME_UNKNOWN';
      reply(request,null,{code,message:code,outcome});
    }finally{active.delete(request.requestId);}
  }
  function start(){
    if(closed)return Promise.reject(new WireError('E_SERVICE_CLOSED'));
    if(started)return Promise.reject(new WireError('E_SERVICE_STARTED'));
    started=true;
    return new Promise((resolve,rejectStartPromise)=>{
      resolveStart=resolve;rejectStart=rejectStartPromise;
      timer=setTimeout(()=>retire(new WireError('E_SERVICE_TIMEOUT')),timeoutMs);
      try{
        const info=installation();extensionId=info.extensionId;
        if(typeof extensionId!=='string'||!/^[a-p]{32}$/.test(extensionId))throw new WireError('E_SERVICE_OWNER');
        socket=connect({path:info.socketPath});const decoder=new LineDecoder();
        socket.on('connect',()=>{try{writeLine(socket,{v:1,kind:'auth',credential:info.clientCredential});}catch{retire();}});
        socket.on('data',chunk=>{
          try{for(const message of decoder.push(chunk)){
            if(closed)return;
            if(!authenticated){
              if(message.v!==1||message.kind!=='authenticated'||!message.browserReady)throw new WireError('E_NATIVE_NOT_READY');
              if(message.managedServicesVersion!==1)throw new WireError('E_SERVICE_UNSUPPORTED');
              authenticated=true;writeLine(socket,{v:1,kind:'services.register',protocol,descriptor});continue;
            }
            if(!registered){
              if(!serviceExact(message,['v','kind','protocol','serviceId','serviceInstanceId','providerEpoch'])||message.v!==1||
                message.kind!=='services.registered'||message.protocol!==protocol||message.serviceId!==descriptor.serviceId||
                message.serviceInstanceId!==descriptor.serviceInstanceId||!serviceID(message.providerEpoch))throw new WireError('E_SERVICE_SCHEMA');
              providerEpoch=message.providerEpoch;registered=true;finish();continue;
            }
            if(message.kind!=='services.invoke')throw new WireError('E_SERVICE_SCHEMA');
            void invoke(message).catch(()=>retire());
          }}catch(error){retire(new WireError(error.code||'E_SERVICE_SCHEMA'));}
        });
        socket.on('error',()=>retire());socket.on('close',()=>retire());
      }catch(error){retire(new WireError(error.code||'E_SERVICE_DISCONNECTED'));}
    });
  }
  return Object.freeze({state,start,close:()=>retire(new WireError('E_SERVICE_CLOSED'))});
}
