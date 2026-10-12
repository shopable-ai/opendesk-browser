import {FoundationError,newId,digestUtf8} from '../platform/protocol.js';
import {LOCAL_PROJECT_SOURCE,validLocalSourceRef,sameLocalSourceIdentity,localSourceIdentity} from '../../native-agent/local-project-source-contract.mjs';

// Shares the Host's already authenticated foundation Port. Ordinary installed
// tasks create no project requests or timers and need no Native connection.
export function createLocalProjectClient(){
  let port,registrationId,bound=false,generation=0;
  const pending=new Map(),listeners=new Set();
  function finish(id,data,error){const row=pending.get(id);if(!row)return;pending.delete(id);clearTimeout(row.timer);error?row.reject(new FoundationError(error.code,error.message)):row.resolve(data);}
  function disconnect(){generation++;bound=false;port=null;for(const id of pending.keys())finish(id,null,{code:'E_DEV_DISCONNECTED',message:'Host connection closed'});for(const listener of listeners)listener({connected:false,providerEpoch:null});}
  function post(id,row){if(!bound||row.sent)return;row.sent=true;try{port.postMessage({type:'native-agent.dev.request',registrationId,requestId:id,method:row.method,params:row.params});}catch{finish(id,null,{code:'E_DEV_DISCONNECTED'});}}
  function receive(message){
    if(message.type==='host-bound'){bound=true;for(const [id,row] of pending)post(id,row);return true;}
    if(message.type==='native-agent.dev.state'){for(const listener of listeners)listener(message.state);return true;}
    if(message.type!=='native-agent.dev.response')return false;
    finish(message.requestId,message.error?null:{...message.result,...(message.providerEpoch?{providerEpoch:message.providerEpoch}:{})},message.error);return true;
  }
  function readRequest(method,params={}){
    if(!port)return Promise.reject(new FoundationError('E_DEV_DISCONNECTED'));
    const id=newId();return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>finish(id,null,{code:'E_DEV_TIMEOUT',message:'Local connection did not respond; no program was started'}),18000);
      const row={method,params,resolve,reject,timer,sent:false};pending.set(id,row);post(id,row);
    });
  }
  async function hydrateSource(value,bindingId,capturedGeneration){
    const ref=value.sourceRef;
    const fail=message=>{throw new FoundationError('E_DEV_HASH',message);};
    const live=()=>{if(capturedGeneration!==generation||!port||!bound)throw new FoundationError('E_DEV_DISCONNECTED','Source connection changed during transfer');};
    live();
    if(!validLocalSourceRef(ref)||!sameLocalSourceIdentity(ref,value)||value.bindingId!==bindingId||
      typeof value.providerEpoch!=='string'||!value.providerEpoch||Object.hasOwn(value,'sourceUtf8'))fail('Invalid frozen source descriptor');
    const identity={bindingId,transferId:ref.transferId,...localSourceIdentity(ref)},bytes=new Uint8Array(ref.sourceBytes);
    const matches=row=>row&&row.bindingId===bindingId&&row.transferId===ref.transferId&&
      row.providerEpoch===value.providerEpoch&&sameLocalSourceIdentity(row,ref);
    for(let offset=0;offset<bytes.length;offset+=LOCAL_PROJECT_SOURCE.chunkBytes){
      live();const row=await readRequest('project.source.read',{...identity,offset});live();
      const wanted=Math.min(LOCAL_PROJECT_SOURCE.chunkBytes,bytes.length-offset);
      if(!matches(row)||row.offset!==offset||row.byteLength!==wanted||row.done!==(offset+wanted===bytes.length)||
        typeof row.dataBase64!=='string'||row.dataBase64.length>LOCAL_PROJECT_SOURCE.maxBase64Bytes||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.dataBase64))fail('Frozen source part identity or length differs');
      let binary;try{binary=atob(row.dataBase64);}catch{fail('Invalid frozen source base64');}
      if(binary.length!==wanted||btoa(binary)!==row.dataBase64)fail('Non-canonical frozen source part');
      for(let i=0;i<binary.length;i++)bytes[offset+i]=binary.charCodeAt(i);
    }
    let sourceUtf8;try{sourceUtf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{fail('Frozen source is not valid UTF-8');}
    if(new TextEncoder().encode(sourceUtf8).length!==ref.sourceBytes||await digestUtf8(sourceUtf8)!==ref.sourceHash)fail('Frozen source SHA-256 differs');
    live();const final=await readRequest('project.source.validate',identity);live();
    if(!matches(final)||final.validated!==true)fail('Frozen source final validation differs');
    const {sourceRef,...metadata}=value;
    // The caller's existing captured selection/Run token is checked after this
    // read completes. Hydration never starts or installs a program.
    return {...metadata,sourceUtf8};
  }
  async function request(method,params={}){
    const capturedGeneration=generation,value=await readRequest(method,params);
    return method==='project.resolve'&&Object.hasOwn(value,'sourceRef')?hydrateSource(value,params.bindingId,capturedGeneration):value;
  }
  return {receive,request,connect(next,id){if(port||pending.size)disconnect();port=next;registrationId=id;bound=false;},disconnect,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    snapshot:()=>({pending:pending.size,timers:pending.size,subscriptions:listeners.size}),
    dispose(){disconnect();listeners.clear();}};
}
