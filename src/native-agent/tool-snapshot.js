// Reads a staged *immutable* UI package through the existing 32 KiB Native
// files.read contract. This is transport and verification, NOT authority.
import {validateSidebarToolPackage} from '../ui/sidebar-tools/package.js';
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[a-z][a-z0-9-]{1,39}$/;
const VERSION=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const B64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
export const NATIVE_TOOL_PREVIEW_ROOT='opendesk-tool-preview';
export const TOOL_PREVIEW_FORMAT='opendesk.tool-preview-session.v1';
const fail=reason=>{const e=new Error('E_TOOL_SNAPSHOT: '+reason);e.code='E_TOOL_SNAPSHOT';throw e;};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(o,fields)=>plain(o)&&Object.keys(o).sort().join(',')===[...fields].sort().join(',');
const parse=text=>{try{return JSON.parse(text);}catch{fail('invalid staged JSON');}};
const utf8=new TextEncoder();
async function hash(bytes){
  if(!globalThis.crypto?.subtle)throw new Error('SHA-256 is unavailable');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function previewStorageKey(token){
  if(typeof token!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(token))
    throw new TypeError('invalid preview session identity');
  return 'opendesk.tool-preview.session.v1:'+token;
}
export async function readToolSnapshot({toolId,readText}){
  if(typeof toolId!=='string'||!ID.test(toolId)||typeof readText!=='function')
    fail('invalid tool identity or Native reader');
  const prefix=NATIVE_TOOL_PREVIEW_ROOT+'/'+toolId;
  const latestPath=prefix+'/latest.json';
  const before=await readText(latestPath);
  if(typeof before!=='string'||utf8.encode(before).length>32768)fail('invalid latest pointer');
  const pointer=parse(before);
  if(!exact(pointer,['format','id','version','sha256','manifestPath','manifestSha256','buildId'])||
    pointer.format!=='opendesk.tool-preview-latest.v1'||pointer.id!==toolId||
    !VERSION.test(pointer.version)||!SHA.test(pointer.sha256)||!SHA.test(pointer.manifestSha256)||
    pointer.manifestPath!==prefix+'/'+pointer.sha256+'/manifest.json')fail('invalid latest pointer fields');
  const rawManifest=await readText(pointer.manifestPath);
  if(typeof rawManifest!=='string'||utf8.encode(rawManifest).length>32768||
    await hash(utf8.encode(rawManifest))!==pointer.manifestSha256)fail('manifest content hash mismatch');
  const manifest=parse(rawManifest);
  if(!exact(manifest,['format','id','version','sha256','bytes','sourceFingerprint','buildId','chunks'])||
    manifest.format!=='opendesk.tool-snapshot.v1'||manifest.id!==toolId||
    manifest.version!==pointer.version||manifest.sha256!==pointer.sha256||
    manifest.buildId!==pointer.buildId||!SHA.test(manifest.sourceFingerprint)||
    !Number.isSafeInteger(manifest.bytes)||manifest.bytes<=0||manifest.bytes>322000||
    !Array.isArray(manifest.chunks)||manifest.chunks.length<1||manifest.chunks.length>21)
    fail('invalid snapshot manifest');
  const buffers=[];let combined=0;
  for(let i=0;i<manifest.chunks.length;i++){
    const part=manifest.chunks[i],expected=prefix+'/'+pointer.sha256+'/part-'+String(i).padStart(3,'0')+'.txt';
    if(!exact(part,['path','sha256','bytes'])||part.path!==expected||
      !SHA.test(part.sha256)||!Number.isSafeInteger(part.bytes)||
      part.bytes<1||part.bytes>16000)fail('invalid chunk manifest');
    const b64=await readText(expected);
    if(typeof b64!=='string'||b64.length>24000||!B64.test(b64))fail('invalid chunk encoding');
    const ascii=atob(b64);
    const bytes=Uint8Array.from(ascii,x=>x.charCodeAt(0));
    if(bytes.length!==part.bytes||await hash(bytes)!==part.sha256)fail('chunk changed during Native transfer');
    buffers.push(bytes);combined+=bytes.length;
    if(combined>manifest.bytes)fail('chunk aggregate exceeded snapshot budget');
  }
  if(combined!==manifest.bytes)fail('snapshot length mismatch');
  const merged=new Uint8Array(combined);
  let pos=0;for(const buf of buffers){merged.set(buf,pos);pos+=buf.length;}
  if(await hash(merged)!==pointer.sha256)fail('package content hash mismatch');
  const content=new TextDecoder('utf-8',{fatal:true}).decode(merged);
  const tool=validateSidebarToolPackage(parse(content));
  if(tool.id!==toolId||tool.version!==pointer.version)fail('tool package identity mismatch');
  const after=await readText(latestPath);
  if(after!==before)fail('latest pointer changed during transfer; retry a complete snapshot');
  return Object.freeze({tool,sha256:pointer.sha256,sourceFingerprint:manifest.sourceFingerprint,
    buildId:pointer.buildId,chunks:manifest.chunks.length,bytes:merged.length});
}
