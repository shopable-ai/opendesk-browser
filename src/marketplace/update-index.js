// Public distribution contract, shared by the trusted client and offline publisher.
// These bytes establish release authenticity, never installation/permission authority.
import {validateSidebarToolPackageMetadata} from '../ui/sidebar-tools/package.js';
import {sameStorageValue,stableStorageString} from '../ui/sidebar-tools/storage-state.js';

export const UPDATE_INDEX_SCHEMA='opendesk.market.update-index.v1';
export const SIGNED_UPDATE_INDEX_SCHEMA='opendesk.market.signed-index.v1';
export const UPDATE_INDEX_SOURCE='opendesk-official';
export const UPDATE_INDEX_CHANNEL='stable';
export const UPDATE_INDEX_PATH='/api/market/v1/channels/stable/index';
export const MAX_UPDATE_INDEX_BYTES=1024*1024;
export const MAX_UPDATE_PAYLOAD_BYTES=512*1024;
export const MAX_UPDATE_RELEASES=256;
// Independent transport policy, NOT a change to the existing package format.
export const MAX_MARKET_PACKAGE_BYTES=16*1024*1024;
export const updateIndexError=(code,message)=>Object.assign(new Error(message),{code});
const fail=(message,code='E_UPDATE_SCHEMA')=>{throw updateIndexError(code,message);};
const encoder=new TextEncoder();
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const id=/^[a-z][a-z0-9-]{1,39}$/;
const version=/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const sha=/^[a-f0-9]{64}$/;
const time=value=>{
  if(typeof value!=='string'||value.length>40||
     !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)||
     !Number.isFinite(Date.parse(value)))fail('发行时间不是有效的 UTC 时间');
  const stamp=Date.parse(value);
  if(new Date(stamp).toISOString().slice(0,19)!==value.slice(0,19))fail('发行日期无效');
  return stamp;
};
export async function updateIndexDigest(bytes){
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    value=>value.toString(16).padStart(2,'0')).join('');
}
export function updateIndexBase64(bytes){
  let text='';for(const byte of bytes)text+=String.fromCharCode(byte);
  return btoa(text);
}
export function decodeUpdateIndexBase64(value,maxBytes){
  if(typeof value!=='string'||value.length>4*Math.ceil(maxBytes/3)||
     !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    fail('发行 Base64 编码无效');
  let bytes;try{bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
  catch{fail('发行 Base64 编码无法解码');}
  if(bytes.length>maxBytes||updateIndexBase64(bytes)!==value)fail('发行 Base64 不是规范格式');
  return bytes;
}
// JSON.parse alone discards duplicate keys. Scan the bounded original text first,
// rejecting duplicates (including escaped aliases), excessive depth and trailing data.
export function parseUpdateIndexJSON(input,maxBytes=MAX_UPDATE_INDEX_BYTES){
  const bytes=typeof input==='string'?encoder.encode(input):input;
  if(!(bytes instanceof Uint8Array)||bytes.byteLength>maxBytes)fail('发行索引超过读取预算','E_UPDATE_LIMIT');
  let text;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}
  catch{fail('发行索引不是有效 UTF-8');}
  let at=0;
  const ws=()=>{while(/[\x20\t\r\n]/.test(text[at]||'X'))at++;};
  function string(){
    const start=at;if(text[at++]!=='"')fail('发行 JSON 字符串无效');
    while(at<text.length){const c=text[at++];if(c==='\\'){at++;continue;}
      if(c==='"'){try{return JSON.parse(text.slice(start,at));}catch{fail('发行 JSON 字符串无效');}}}
    fail('发行 JSON 字符串未结束');
  }
  function value(depth){
    if(depth>40)fail('发行 JSON 嵌套超过预算','E_UPDATE_LIMIT');
    ws();const c=text[at];
    if(c==='"'){string();return;}
    if(c==='{'||c==='['){
      at++;ws();const end=c==='{'?'}':']',seen=new Set();
      if(text[at]===end){at++;return;}
      for(;;){
        ws();if(c==='{'){const key=string();if(seen.has(key))fail('发行 JSON 包含重复字段');seen.add(key);
          ws();if(text[at++]!==':')fail('发行 JSON 对象无效');}
        value(depth+1);ws();if(text[at]===end){at++;return;}
        if(text[at++]!==',')fail('发行 JSON 分隔符无效');
      }
    }
    const match=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));
    if(!match)fail('发行 JSON 值无效');at+=match[0].length;
  }
  value(0);ws();if(at!==text.length)fail('发行 JSON 包含额外内容');
  try{return JSON.parse(text);}catch{fail('发行 JSON 无效');}
}
export function validateUpdateIndex(payload,{sourceId=UPDATE_INDEX_SOURCE,channel=UPDATE_INDEX_CHANNEL,now=Date.now()}={}){
  if(!exact(payload,['schema','sourceId','channel','sequence','issuedAt','expiresAt','complete','releases'])||
     payload.schema!==UPDATE_INDEX_SCHEMA||sourceId!==UPDATE_INDEX_SOURCE||channel!==UPDATE_INDEX_CHANNEL||
     payload.sourceId!==sourceId||payload.channel!==channel||payload.complete!==true||
     !Number.isSafeInteger(payload.sequence)||payload.sequence<1||
     !Array.isArray(payload.releases)||payload.releases.length>MAX_UPDATE_RELEASES)
    fail('发行索引身份、渠道或完整快照无效');
  const current=typeof now==='function'?now():now,issued=time(payload.issuedAt),expires=time(payload.expiresAt);
  if(!Number.isFinite(current))fail('本机时钟无效','E_UPDATE_CLOCK');
  if(expires<=issued||expires-issued>86400000)fail('发行索引有效期无效');
  if(issued>current+300000)fail('发行索引时间领先本机时钟','E_UPDATE_CLOCK');
  if(expires<=current)fail('发行索引已经过期','E_UPDATE_EXPIRED');
  const seen=new Set();
  for(const row of payload.releases){
    if(!exact(row,['toolId','marketId','kind','version','state','packageTitle','description','capabilities',
      'requirements','delivery','publishedAt','changelog','descriptor'])||
      typeof row.toolId!=='string'||!id.test(row.toolId)||row.marketId!=='opendesk/'+row.toolId||
      row.kind!=='sidebar-tool'||typeof row.version!=='string'||!version.test(row.version)||
      !['published','withdrawn'].includes(row.state)||!['package','browser-host'].includes(row.delivery)||
      typeof row.packageTitle!=='string'||!row.packageTitle.trim()||row.packageTitle.length>80||
      typeof row.description!=='string'||!row.description.trim()||row.description.length>300||
      typeof row.changelog!=='string'||row.changelog.length>12000||
      !Array.isArray(row.capabilities)||row.capabilities.length>128||
      new Set(row.capabilities).size!==row.capabilities.length||row.capabilities.some(cap=>
        typeof cap!=='string'||!cap.length||cap.length>160))fail('发行条目身份或元数据无效');
    const key=row.marketId+'@'+row.version;if(seen.has(key))fail('发行索引包含重复版本');seen.add(key);
    if(time(row.publishedAt)>issued)fail('发行时间晚于索引签发时间');
    const req=row.requirements;
    if(!exact(req,['format','browserSdk','uiRuntime'])||
      !['opendesk.sidebar-tool.v1','opendesk.sidebar-tool.v2'].includes(req.format)||
      req.browserSdk!==(req.format==='opendesk.sidebar-tool.v2'?'1.0.0':null)||
      ![null,'opendesk.react-ui.v1'].includes(req.uiRuntime))fail('发行运行需求无效');
    const descriptor=row.descriptor;
    if(!exact(descriptor,['schema','marketId','version','bytes','sha256','packagePath'])||
      descriptor.schema!=='opendesk.market.release.v1'||descriptor.marketId!==row.marketId||
      descriptor.version!==row.version||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<1||
      typeof descriptor.sha256!=='string'||!sha.test(descriptor.sha256)||
      descriptor.packagePath!=='/releases/'+row.marketId+'/'+row.version+'/package.opendesk-tool.json')
      fail('固定六字段发行描述与索引身份不一致');
  }
  return structuredClone(payload);
}
export function updateIndexSigningBytes(envelope){
  if(!exact(envelope,['schema','algorithm','keyId','payload','signature'])||
     envelope.schema!==SIGNED_UPDATE_INDEX_SCHEMA||envelope.algorithm!=='Ed25519'||
     typeof envelope.keyId!=='string'||!/^[a-z0-9][a-z0-9.-]{0,79}$/.test(envelope.keyId))
    fail('签名 envelope 无效');
  const payload=decodeUpdateIndexBase64(envelope.payload,MAX_UPDATE_PAYLOAD_BYTES);
  const header=encoder.encode(envelope.schema+'\n'+envelope.algorithm+'\n'+envelope.keyId+'\n');
  const bytes=new Uint8Array(header.length+payload.length);bytes.set(header);bytes.set(payload,header.length);return bytes;
}
export async function verifySignedUpdateIndex(input,{publicKeys={},sourceId=UPDATE_INDEX_SOURCE,
  channel=UPDATE_INDEX_CHANNEL,now=Date.now()}={}){
  const envelope=parseUpdateIndexJSON(input),signed=updateIndexSigningBytes(envelope);
  if(!Object.hasOwn(publicKeys,envelope.keyId))fail('发行签名公钥未预置信任','E_UPDATE_UNTRUSTED');
  const key=decodeUpdateIndexBase64(publicKeys[envelope.keyId],32),signature=decodeUpdateIndexBase64(envelope.signature,64);
  if(key.length!==32||signature.length!==64)fail('发行密钥或签名长度无效','E_UPDATE_UNTRUSTED');
  let trusted;
  try{trusted=await crypto.subtle.verify({name:'Ed25519'},
    await crypto.subtle.importKey('raw',key,{name:'Ed25519'},false,['verify']),signature,signed);}
  catch{fail('当前运行环境无法验证发行签名','E_UPDATE_CRYPTO');}
  if(!trusted)fail('发行签名验证失败','E_UPDATE_UNTRUSTED');
  const bytes=decodeUpdateIndexBase64(envelope.payload,MAX_UPDATE_PAYLOAD_BYTES);
  const payload=validateUpdateIndex(parseUpdateIndexJSON(bytes,MAX_UPDATE_PAYLOAD_BYTES),{sourceId,channel,now});
  return {envelope,payload,payloadSha256:await updateIndexDigest(bytes)};
}
// State/notes can change in a later snapshot; the artifact and security metadata cannot.
export function updateReleaseIdentity(row){
  return {toolId:row.toolId,kind:row.kind,marketId:row.marketId,version:row.version,
    descriptor:row.descriptor,capabilities:[...row.capabilities].sort(),
    requirements:row.requirements,delivery:row.delivery};
}
export const sameUpdateRelease=(a,b)=>sameStorageValue(updateReleaseIdentity(a),updateReleaseIdentity(b));
export const updateReleaseIdentityKey=(sourceId,row)=>sourceId+'|'+row.kind+'|'+row.marketId+'|'+row.version;
export const updateReleaseIdentityDigest=row=>updateIndexDigest(encoder.encode(stableStorageString(updateReleaseIdentity(row))));
export function updateReleaseEligibility(row){
  if(row.state==='withdrawn')return 'withdrawn';
  if(row.delivery==='browser-host')return 'browser_update_required';
  if(row.descriptor.bytes>MAX_MARKET_PACKAGE_BYTES)return 'compatibility_unknown';
  try{validateSidebarToolPackageMetadata({format:row.requirements.format,id:row.toolId,
    version:row.version,title:row.packageTitle,description:row.description,capabilities:row.capabilities});}
  catch{return 'compatibility_unknown';}
  return 'package';
}
