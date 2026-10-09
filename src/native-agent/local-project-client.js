import {FoundationError,newId} from '../platform/protocol.js';

// Shares the Host's already authenticated foundation Port. Ordinary installed
// tasks create no project requests or timers and need no Native connection.
export function createLocalProjectClient(){
  let port,registrationId,bound=false;
  const pending=new Map(),listeners=new Set();
  function finish(id,data,error){const row=pending.get(id);if(!row)return;pending.delete(id);clearTimeout(row.timer);error?row.reject(new FoundationError(error.code,error.message)):row.resolve(data);}
  function disconnect(){bound=false;port=null;for(const id of pending.keys())finish(id,null,{code:'E_DEV_DISCONNECTED',message:'Host connection closed'});for(const listener of listeners)listener({connected:false,providerEpoch:null});}
  function post(id,row){if(!bound||row.sent)return;row.sent=true;try{port.postMessage({type:'native-agent.dev.request',registrationId,requestId:id,method:row.method,params:row.params});}catch{finish(id,null,{code:'E_DEV_DISCONNECTED'});}}
  function receive(message){
    if(message.type==='host-bound'){bound=true;for(const [id,row] of pending)post(id,row);return true;}
    if(message.type==='native-agent.dev.state'){for(const listener of listeners)listener(message.state);return true;}
    if(message.type!=='native-agent.dev.response')return false;
    finish(message.requestId,message.error?null:{...message.result,...(message.providerEpoch?{providerEpoch:message.providerEpoch}:{})},message.error);return true;
  }
  function request(method,params={}){
    if(!port)return Promise.reject(new FoundationError('E_DEV_DISCONNECTED'));
    const id=newId();return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>finish(id,null,{code:'E_DEV_TIMEOUT',message:'Local connection did not respond; no program was started'}),18000);
      const row={method,params,resolve,reject,timer,sent:false};pending.set(id,row);post(id,row);
    });
  }
  return {receive,request,connect(next,id){if(port||pending.size)disconnect();port=next;registrationId=id;bound=false;},disconnect,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    snapshot:()=>({pending:pending.size,timers:pending.size,subscriptions:listeners.size}),
    dispose(){disconnect();listeners.clear();}};
}
