import {randomUUID,createHash} from 'node:crypto';
import {LOCAL_PROJECT_SOURCE,validLocalSourceIdentity,sameLocalSourceIdentity,localSourceIdentity,validLocalProjectRequest} from '../local-project-source-contract.mjs';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const digest=value=>createHash('sha256').update(value).digest('hex');
// References only the Resolver's current frozen artifact. A transfer never
// resolves a path, compiles, downloads, installs or dispatches a browser run.
export function createFrozenProjectSources({resolver,now=Date.now,newId=randomUUID}={}){
  const transfers=new Map();
  const supported=value=>typeof resolver?.validateFrozen==='function'&&validLocalSourceIdentity(value)&&
    typeof value.bindingId==='string'&&typeof value.sourceUtf8==='string';
  function lookup(params,providerEpoch){
    if(!validLocalProjectRequest(params.offset===undefined?'project.source.validate':'project.source.read',params))fail('E_SCHEMA','Invalid frozen source request');
    const row=transfers.get(params.bindingId);
    if(!row||row.transferId!==params.transferId||row.providerEpoch!==providerEpoch||now()>row.expiresAt)fail('E_DEV_SOURCE_EXPIRED','Frozen source transfer expired; resolve explicitly again');
    if(resolver.closed||resolver.get(params.bindingId)!==row.binding)fail('E_DEV_DETACHED','Frozen source binding changed');
    const current=resolver.cache.get(params.bindingId);
    if(!sameLocalSourceIdentity(row.value,params)||!sameLocalSourceIdentity(current,row.value))fail('E_PROJECT_CHANGED','Frozen source identity changed');
    return row;
  }
  return {
    supported,
    capture(value,providerEpoch){
      if(!supported(value))fail('E_DEV_SOURCE','Resolver cannot provide a frozen source transfer');
      const binding=resolver.get(value.bindingId),cached=resolver.cache.get(value.bindingId);
      if(!sameLocalSourceIdentity(cached,value)||cached.sourceUtf8!==value.sourceUtf8)fail('E_PROJECT_CHANGED','Only the current frozen Resolver artifact can be transferred');
      const bytes=Buffer.from(value.sourceUtf8,'utf8');
      if(bytes.length!==value.sourceBytes||digest(bytes)!==value.sourceHash)fail('E_DEV_HASH','Frozen source bytes differ');
      for(const [id,row] of transfers)if(now()>row.expiresAt)transfers.delete(id);
      if(!transfers.has(value.bindingId)&&transfers.size>=LOCAL_PROJECT_SOURCE.maxTransfers)fail('E_LIMIT','Too many frozen source transfers');
      const row={binding,value:cached,bytes,providerEpoch,transferId:newId(),expiresAt:now()+LOCAL_PROJECT_SOURCE.ttlMs};
      transfers.set(value.bindingId,row);
      return Object.freeze({format:LOCAL_PROJECT_SOURCE.format,version:LOCAL_PROJECT_SOURCE.version,
        transferId:row.transferId,chunkBytes:LOCAL_PROJECT_SOURCE.chunkBytes,...localSourceIdentity(value)});
    },
    read(params,providerEpoch){
      const row=lookup(params,providerEpoch),bytes=row.bytes.subarray(params.offset,Math.min(params.sourceBytes,params.offset+LOCAL_PROJECT_SOURCE.chunkBytes));
      return {bindingId:params.bindingId,transferId:row.transferId,...localSourceIdentity(row.value),offset:params.offset,
        byteLength:bytes.length,dataBase64:bytes.toString('base64'),done:params.offset+bytes.length===params.sourceBytes};
    },
    async validate(params,providerEpoch){
      const row=lookup(params,providerEpoch);
      await resolver.validateFrozen(params.bindingId,localSourceIdentity(row.value));
      if(lookup(params,providerEpoch)!==row)fail('E_PROJECT_CHANGED','Frozen source changed during final validation');
      return {bindingId:params.bindingId,transferId:row.transferId,...localSourceIdentity(row.value),validated:true};
    },
    clear(){transfers.clear();},
    snapshot:()=>({transfers:transfers.size,sourceBytes:[...transfers.values()].reduce((n,row)=>n+row.bytes.length,0)})
  };
}
