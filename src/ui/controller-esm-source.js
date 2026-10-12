// Save immutable Controller ESM execution bytes without losing the user's
// editable single-file source. The persisted record stays one old-style classic
// Controller Revision; only the audited opaque Worker evaluates its JS tail.
import {digestUtf8} from '../platform/protocol.js';

export const CONTROLLER_ESM_MARKER='/* opendesk.controller-esm-authoring.v1 ';
const END=' */\n',HEX=/^[a-f0-9]{64}$/;
const encoded=s=>new TextEncoder().encode(s);
const fail=(code,message)=>Object.assign(new Error(message),{code});
const MAX_COMMIT_BYTES=52000;
const fields=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join('|')===keys.sort().join('|');
function base64(text){
  const bytes=encoded(text);let binary='';
  for(let i=0;i<bytes.length;i+=4096)binary+=String.fromCharCode(...bytes.subarray(i,i+4096));
  return btoa(binary);
}
function unbase64(text){
  if(typeof text!=='string'||text.length>180000||!(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/).test(text))
    throw fail('E_CONTROLLER_ESM_METADATA','Invalid controller source metadata encoding');
  const decoded=atob(text);
  return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(decoded,ch=>ch.charCodeAt(0)));
}
export async function createControllerESMSavedSource({authorSourceUtf8,programId,built,lockId=null}){
  if(typeof authorSourceUtf8!=='string'||!authorSourceUtf8.trim()||
    typeof programId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(programId)||
    typeof built?.sourceUtf8!=='string'||!built.sourceUtf8.includes('async function main()')||
    built.framework!=='controller'||built.compilerVersion!=='7.29.9'||
    !HEX.test(built.authoringSourceHash)||built.authoringSourceHash!==await digestUtf8(authorSourceUtf8)||
    !HEX.test(built.sourceHash)||built.sourceHash!==await digestUtf8(built.sourceUtf8)||
    (lockId!==null&&(typeof lockId!=='string'||!lockId.startsWith('component-lock-'))))
    throw fail('E_CONTROLLER_ESM_SOURCE','Controller compiler/source/lock identity mismatch');
  const metadata={format:'opendesk.controller-esm-authoring.v1',programId,authorSourceUtf8,
    authoringSourceHash:built.authoringSourceHash,compiledSourceHash:built.sourceHash,
    dependencyLockId:lockId,compilerVersion:built.compilerVersion};
  const output=CONTROLLER_ESM_MARKER+base64(JSON.stringify(metadata))+END+built.sourceUtf8;
  if(encoded(output).length>MAX_COMMIT_BYTES)
    throw fail('E_CONTROLLER_ESM_LIMIT','Controller compiled source plus editable snapshot exceeds 52 KB; use the local multi-file builder');
  return output;
}
export function readControllerESMAuthorSource(sourceUtf8){
  if(typeof sourceUtf8!=='string'||!sourceUtf8.startsWith(CONTROLLER_ESM_MARKER))return null;
  const end=sourceUtf8.indexOf(END,CONTROLLER_ESM_MARKER.length);
  if(end<0)throw fail('E_CONTROLLER_ESM_METADATA','Incomplete Controller source header');
  let record;
  try{record=JSON.parse(unbase64(sourceUtf8.slice(CONTROLLER_ESM_MARKER.length,end)));}
  catch{throw fail('E_CONTROLLER_ESM_METADATA','Unable to read original Controller source');}
  if(!fields(record,['format','programId','authorSourceUtf8','authoringSourceHash','compiledSourceHash','dependencyLockId','compilerVersion'])||
    record.format!=='opendesk.controller-esm-authoring.v1'||
    typeof record.authorSourceUtf8!=='string'||!record.authorSourceUtf8.trim()||
    !HEX.test(record.authoringSourceHash)||!HEX.test(record.compiledSourceHash)||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(record.programId)||
    (record.dependencyLockId!==null&&typeof record.dependencyLockId!=='string'))
    throw fail('E_CONTROLLER_ESM_METADATA','Invalid Controller source identity');
  return Object.freeze({...record,compiledSourceUtf8:sourceUtf8.slice(end+END.length)});
}
export async function verifiedControllerESMAuthorSource(sourceUtf8){
  const record=readControllerESMAuthorSource(sourceUtf8);
  if(!record)return null;
  if(await digestUtf8(record.authorSourceUtf8)!==record.authoringSourceHash||
    await digestUtf8(record.compiledSourceUtf8)!==record.compiledSourceHash)
    throw fail('E_CONTROLLER_ESM_HASH','Stored author source or frozen execution source was changed');
  return record;
}
