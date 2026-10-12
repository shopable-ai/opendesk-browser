// Shared, pure read-only transport contract. No Node imports or execution APIs.
// The Native frame limit remains 60 KiB; only this versioned source transfer can
// represent a linked Page capsule (512 KiB linked code + 4 KiB capsule header).
export const LOCAL_PROJECT_SOURCE = Object.freeze({
  version:1,format:'opendesk.local-source.v1',maxBytes:516*1024,
  chunkBytes:24*1024,maxBase64Bytes:32*1024,maxTransfers:8,ttlMs:120000
});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9._:-]{1,240}$/.test(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const keys=(value,expected)=>object(value)&&Object.keys(value).length===expected.length&&expected.every(key=>Object.hasOwn(value,key));
export const LOCAL_SOURCE_IDENTITY_KEYS=Object.freeze(['artifactId','inputHash','sourceHash','sourceBytes']);
export function validLocalSourceIdentity(value){
  return object(value)&&['artifactId','inputHash','sourceHash'].every(key=>hash(value[key]))&&
    Number.isSafeInteger(value.sourceBytes)&&value.sourceBytes>0&&value.sourceBytes<=LOCAL_PROJECT_SOURCE.maxBytes;
}
export function sameLocalSourceIdentity(a,b){return LOCAL_SOURCE_IDENTITY_KEYS.every(key=>a?.[key]===b?.[key]);}
export function localSourceIdentity(value){return Object.fromEntries(LOCAL_SOURCE_IDENTITY_KEYS.map(key=>[key,value[key]]));}
export function validLocalSourceRef(value){
  return keys(value,['format','version','transferId','chunkBytes',...LOCAL_SOURCE_IDENTITY_KEYS])&&
    value.format===LOCAL_PROJECT_SOURCE.format&&value.version===LOCAL_PROJECT_SOURCE.version&&id(value.transferId)&&
    value.chunkBytes===LOCAL_PROJECT_SOURCE.chunkBytes&&validLocalSourceIdentity(value);
}
export const localSourceMethod=method=>['project.source.read','project.source.validate'].includes(method);
export function validLocalProjectRequest(method,params,{status=false}={}){
  if(!object(params))return false;
  if(method==='projects.list'||status&&method==='status')return Object.keys(params).every(key=>key==='bindingId')&&(!Object.hasOwn(params,'bindingId')||id(params.bindingId));
  if(method==='project.resolve')return keys(params,['bindingId'])&&id(params.bindingId);
  if(!localSourceMethod(method)||!keys(params,['bindingId','transferId',...LOCAL_SOURCE_IDENTITY_KEYS,...(method==='project.source.read'?['offset']:[])]))return false;
  if(!id(params.bindingId)||!id(params.transferId)||!validLocalSourceIdentity(params))return false;
  return method!=='project.source.read'||Number.isSafeInteger(params.offset)&&params.offset>=0&&params.offset<params.sourceBytes&&params.offset%LOCAL_PROJECT_SOURCE.chunkBytes===0;
}
