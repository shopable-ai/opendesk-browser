// Local admin-registered, immutable manifest descriptors only.
// This registry never stores, fetches or sends executable task source.
import {createHash} from 'node:crypto';
import {canonical} from '../../src/platform/protocol.js';
import {validateTaskManifest,verifyTaskPackage} from '../../src/platform/tasks/contract.js';

const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
export const taskRegistryKey=task=>task.taskId+'@'+task.version;

export function registeredTask(manifest,manifestHash) {
  validateTaskManifest(manifest);
  if(typeof manifestHash!=='string'||hash(manifest)!==manifestHash)fail('E_HASH','Task manifest hash mismatch');
  return {taskId:manifest.taskId,version:manifest.version,
    manifestHash,sourceHash:manifest.program.sourceHash,manifest:structuredClone(manifest)};
}
export async function registeredPackage(pkg) {
  const verified=await verifyTaskPackage(pkg);
  return registeredTask(verified.manifest,verified.manifestHash);
}
export const taskPin=task=>({taskId:task.taskId,version:task.version,
  manifestHash:task.manifestHash,sourceHash:task.sourceHash});
export function validateCloudTarget(target,origins) {
  if(!target||typeof target!=='object'||Array.isArray(target)||
    Object.keys(target).some(k=>!['mode','url'].includes(k))||
    target.mode!=='owned'||typeof target.url!=='string'||target.url.length>8192)
    fail('E_TARGET','Expected an owned target URL');
  let url;
  try{url=new URL(target.url);}catch{fail('E_TARGET','Invalid target URL');}
  if(!['https:','http:'].includes(url.protocol)||!origins.includes(url.origin)||
    url.href!==target.url||url.username||url.password||url.hash)
    fail('E_TARGET','Target is outside the immutable task website scope');
  return {mode:'owned',url:target.url};
}
