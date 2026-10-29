// Shared contract for trusted offline releases. Catalog policy controls only new installs. Reading these bytes
// never installs a tool, changes site grants or creates a sandbox instance.
import {validateSidebarToolPackage,SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_FORMAT_V2,serializeSidebarToolPackage} from '../ui/sidebar-tools/package.js';
import {compareToolVersions,sameSidebarToolPackage} from '../ui/sidebar-tools/installation.js';
import {sameStorageValue} from '../ui/sidebar-tools/storage-state.js';

export const OFFICIAL_SOURCE_SCHEMA='opendesk.official-tools.sources.v1';
export const OFFICIAL_RELEASE_SCHEMA='opendesk.official-tools.releases.v1';
export const OFFICIAL_SOURCE_REPOSITORY='https://github.com/shopable-ai/opendesk-browser';
export const OFFICIAL_CATALOG_PATH='official-tools/catalog.json';
// Compiled-in publisher trust root; untrusted JSON cannot override it.
export const OFFICIAL_STAY_FOCUS_RELEASE_URL=
  'https://raw.githubusercontent.com/shopable-ai/opendesk-browser/main/official-tools/stay-focus/latest.json';
/*
 * Browser B0 must pin an independently held Ed25519 publisher verification
 * key BEFORE it is frozen. Never take this key from latest.json or allow a
 * publisher-controlled URL to change it. There is intentionally no fallback
 * to HTTPS+SHA alone; those prove transport/integrity, not publication consent.
 * Production release remains BLOCKED until a real offline-owned key is
 * provisioned and recorded through the existing release review.
 */
export const OFFICIAL_STAY_FOCUS_RELEASE_KEY_ID='stay-focus-publisher-ed25519-v1';
export const OFFICIAL_STAY_FOCUS_RELEASE_PUBLIC_KEY_BASE64=null;
const immutableFocusPackage=commit=>
  'https://raw.githubusercontent.com/shopable-ai/opendesk-browser/'+commit+
  '/examples/sidebar-tools/stay-focus/stay-focus.opendesk-tool.json';
const gitSha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const idPattern=/^[a-z][a-z0-9-]{1,39}$/;
const error=(message,code='E_OFFICIAL_CATALOG')=>Object.assign(new Error(message),{code});
// An exact source-location allowlist; migration never authorizes arbitrary repository paths.
const migratedOfficialToolIds=new Set(['markdown-workbench','quick-notes','bookmark-manager','knowledge-inbox','web-markdown-clipper','reading-toc','time-review','prompt-shortcuts']);
export function officialSourceProjectPath(id){
  if(typeof id!=='string'||!idPattern.test(id))throw error('官方工具资源身份无效');
  return (migratedOfficialToolIds.has(id)?'projects/':'examples/sidebar-tools/')+id;
}
const fields=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join(',')===[...keys].sort().join(',');
function list(value){
  if(!Array.isArray(value)||!value.length||value.length>64)throw error('官方工具目录数量无效');
  return value;
}
export function officialPackagePath(value){
  const id=typeof value==='string'?value:value?.toolId;
  if(typeof id!=='string'||!idPattern.test(id))throw error('官方工具资源身份无效');
  return 'official-tools/'+id+'/'+id+'.opendesk-tool.json';
}
export function validateOfficialSourceCatalog(value){
  if(!fields(value,['schema','sourceRepository','tools'])||value.schema!==OFFICIAL_SOURCE_SCHEMA||
      value.sourceRepository!==OFFICIAL_SOURCE_REPOSITORY)throw error('官方工具源码目录不受信任');
  const seen=new Set();
  for(const tool of list(value.tools)){
    if(!fields(tool,['id','project','kind','installationPolicy',
          ...(tool?.packageFile===undefined?[]:['packageFile'])])||
        (tool.packageFile!==undefined&&
          (typeof tool.packageFile!=='string'||!idPattern.test(tool.id)||
           !/^[a-z][a-z0-9._-]{0,110}.opendesk-tool.json$/.test(tool.packageFile)))||
        !idPattern.test(tool.id)||
        typeof tool.id!=='string'||tool.project!==officialSourceProjectPath(tool.id)||
        tool.kind!=='sidebar-tool'||!['optional','preinstalled'].includes(tool.installationPolicy)||seen.has(tool.id))
      throw error('官方工具身份、源码路径或安装策略无效');
    seen.add(tool.id);
  }
  return structuredClone(value);
}
export function validateOfficialReleaseCatalog(value){
  if(!fields(value,['schema','sourceRepository','apps'])||value.schema!==OFFICIAL_RELEASE_SCHEMA||
      value.sourceRepository!==OFFICIAL_SOURCE_REPOSITORY)throw error('官方发行目录格式或来源无效');
  const seen=new Set();
  for(const row of list(value.apps)){
    if(!fields(row,['id','toolId','kind','installationPolicy','version','packageTitle','description',
      'capabilities','packagePath','bytes','sha256',
       ...(row?.remoteCommit===undefined?[]:['remoteCommit'])])||
      (row.remoteCommit!==undefined&&
       (row.toolId!=='stay-focus'||!gitSha(row.remoteCommit)))||
      typeof row.toolId!=='string'||!idPattern.test(row.toolId)||row.id!=='opendesk/'+row.toolId||
      row.kind!=='sidebar-tool'||!['optional','preinstalled'].includes(row.installationPolicy)||seen.has(row.id)||
      row.packagePath!==officialPackagePath(row)||!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>320000||
      typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256))throw error('官方发行身份、策略、路径或摘要无效');
    // Reuse the existing package metadata/capability validator. These inert
    // placeholders only validate the descriptor; executable bytes load later.
    const hasMenus=Array.isArray(row.capabilities)&&row.capabilities.includes('browser.contextMenu');
    const hasBudget=Array.isArray(row.capabilities)&&row.capabilities.includes('browser.siteBudget');
    // V2 may expose approved Browser SDK services beyond Cookies/Bookmarks.
    // Reuse the one package validator; do not invent special product exceptions.
    const hasSdk=hasMenus||Array.isArray(row.capabilities)&&row.capabilities.some(cap=>
      cap.startsWith('browser.')||cap==='network'||cap==='page.prompts');
    validateSidebarToolPackage({format:hasSdk?SIDEBAR_TOOL_FORMAT_V2:SIDEBAR_TOOL_FORMAT,
      id:row.toolId,version:row.version,
      title:row.packageTitle,description:row.description,capabilities:row.capabilities,
      html:'<main></main>',css:'',js:'void 0;',
      ...(hasBudget?{backgroundPolicy:{kind:'site-budget.v3',suggestions:[]}}:{}),
      ...(hasSdk?{requires:{browserSdk:'1.0.0'},
        contributes:{contextMenus:hasMenus?[{actionId:'sample-action',title:'Validation placeholder',
          contexts:['page'],documentUrlPatterns:['https://example.com/*'],handler:'open-self'}]:[]}}:{})});
    seen.add(row.id);
  }
  return structuredClone(value);
}
export function officialToolStatus(release,installed){
  const current=installed.find(row=>row.id===release.toolId);
  if(!current)return 'available';
  const order=compareToolVersions(release.version,current.version);
  return order>0?'update':order<0?'newer':'installed';
}
export async function matchesOfficialRelease(release,tool){
  if(tool?.id!==release.toolId||tool.version!==release.version)return false;
  const bytes=new TextEncoder().encode(serializeSidebarToolPackage(tool));
  return bytes.length===release.bytes&&await digest(bytes)===release.sha256;
}
async function digest(bytes){
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function resourceBytes(api,fetcher,path,limit,{external=false}={}){
  const url=external?path:api.runtime.getURL(path);
  if(external){
    if(url!==OFFICIAL_STAY_FOCUS_RELEASE_URL&&
       !/^https:\/\/raw\.githubusercontent\.com\/shopable-ai\/opendesk-browser\/[a-f0-9]{40}\/examples\/sidebar-tools\/stay-focus\/stay-focus\.opendesk-tool\.json$/.test(url))
      throw error('远程资源不属于 Browser 固定可信仓库','E_PACKAGE_SOURCE');
  }else if(new URL(url).protocol!=='chrome-extension:')
    throw error('内置官方资源必须来自本扩展','E_PACKAGE_SOURCE');
  const response=await fetcher(url,{cache:'no-store',redirect:'error',credentials:'omit'});
  if(!response.ok)throw error('无法读取官方发行资源：'+path,'E_PACKAGE_MISSING');
  if(response.redirected||response.url&&response.url!==url)
    throw error('官方资源不得重定向','E_PACKAGE_SOURCE');
  if(Number(response.headers?.get?.('content-length'))>limit)throw error('官方发行资源超过大小限制','E_TOOL_LIMIT');
  if(!response.body?.getReader){
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length>limit)throw error('官方发行资源超过大小限制','E_TOOL_LIMIT');
    return bytes;
  }
  const reader=response.body.getReader(),parts=[];let length=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      length+=value.byteLength;
      if(length>limit){await reader.cancel();throw error('官方发行资源超过大小限制','E_TOOL_LIMIT');}
      parts.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;
  for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return bytes;
}
// Reuse the official extension-origin, no-redirect, bounded byte reader for Page bundles.
// This does not grant the Page installation or website permissions.
export async function loadBundledOfficialResource(path,limit,{api=globalThis.chrome,fetcher=globalThis.fetch}={}){
  if(typeof path!=='string'||!/^official-pages\/(?:catalog\.json|[a-z0-9.-]+\/[a-z0-9.-]+\.opendesk-page\.json)$/.test(path)||
    !Number.isSafeInteger(limit)||limit<1||limit>64*1024*1024)
    throw error('非法的内置 Page 资源路径或大小限制','E_PACKAGE_SOURCE');
  return resourceBytes(api,fetcher,path,limit);
}
function json(bytes){
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw error('官方发行资源 JSON 或编码无效','E_PACKAGE_SCHEMA');}
}
export function validateOfficialStayFocusRemoteDescriptor(value){
  if(!fields(value,['schema','repository','commit','release'])||
     value.schema!=='opendesk.official-tool.remote-release.v1'||
     value.repository!=='shopable-ai/opendesk-browser'||!gitSha(value.commit))
    throw error('远程发行描述没有固定仓库身份与不可变提交','E_PACKAGE_SOURCE');
  const release=validateOfficialReleaseCatalog({schema:OFFICIAL_RELEASE_SCHEMA,
    sourceRepository:OFFICIAL_SOURCE_REPOSITORY,apps:[value.release]}).apps[0];
  if(release.toolId!=='stay-focus')
    throw error('远程发行不属于授权的 Stay Focus 身份','E_PACKAGE_IDENTITY');
  return {...release,remoteCommit:value.commit};
}
// Canonical, finite bytes signed by the offline release publisher. No JSON
// object insertion order, whitespace or remote-provided keys influence trust.
export function officialStayFocusSignedPayload(unsigned){
  const release=validateOfficialStayFocusRemoteDescriptor(unsigned);
  const plain={schema:unsigned.schema,repository:unsigned.repository,
    commit:unsigned.commit,release:{...release}};
  delete plain.release.remoteCommit;
  const canonical=value=>Array.isArray(value)?value.map(canonical):
    value&&typeof value==='object'?
      Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  return new TextEncoder().encode(JSON.stringify(canonical(plain)));
}
const base64Bytes=(encoded,size,label)=>{
  if(typeof encoded!=='string'||encoded.length>200||
     !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw error('官方发行'+label+'格式错误','E_RELEASE_SIGNATURE');
  let bytes;
  try{bytes=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));}
  catch{throw error('官方发行'+label+'无法解码','E_RELEASE_SIGNATURE');}
  if(bytes.length!==size)throw error('官方发行'+label+'长度无效','E_RELEASE_SIGNATURE');
  return bytes;
};
export async function verifyOfficialStayFocusRemoteDescriptor(value,{
  publicKeyBase64=OFFICIAL_STAY_FOCUS_RELEASE_PUBLIC_KEY_BASE64
}={}){
  if(!fields(value,['schema','repository','commit','release','signature'])||
     !fields(value.signature,['algorithm','keyId','value'])||
     value.signature.algorithm!=='Ed25519'||
     value.signature.keyId!==OFFICIAL_STAY_FOCUS_RELEASE_KEY_ID)
    throw error('官方 Stay Focus 发行缺少固定签名合同','E_RELEASE_SIGNATURE');
  const verifiedRelease=validateOfficialStayFocusRemoteDescriptor({
    schema:value.schema,repository:value.repository,
    commit:value.commit,release:value.release
  });
  if(publicKeyBase64===null)
    throw error('Browser 尚未预置信任的 Stay Focus 发行验证公钥；拒绝远程升级',
      'E_RELEASE_TRUST_UNCONFIGURED');
  const key=base64Bytes(publicKeyBase64,32,'公钥');
  const signature=base64Bytes(value.signature.value,64,'签名');
  let trusted=false;
  try{
    const imported=await crypto.subtle.importKey('raw',key,{name:'Ed25519'},false,['verify']);
    trusted=await crypto.subtle.verify({name:'Ed25519'},imported,signature,
      officialStayFocusSignedPayload({
        schema:value.schema,repository:value.repository,
        commit:value.commit,release:value.release
      }));
  }catch{throw error('当前 Browser 不支持官方发行签名核验','E_RELEASE_CRYPTO');}
  if(!trusted)throw error('Stay Focus 官方发行签名不可信','E_RELEASE_SIGNATURE');
  return verifiedRelease;
}
export async function loadOfficialCatalog({api=globalThis.chrome,fetcher=globalThis.fetch}={}){
  const base=validateOfficialReleaseCatalog(json(
    await resourceBytes(api,fetcher,OFFICIAL_CATALOG_PATH,128000)));
  let remoteBytes;
  try{
    remoteBytes=await resourceBytes(api,fetcher,OFFICIAL_STAY_FOCUS_RELEASE_URL,8192,
      {external:true});
  }catch(cause){
    // Unpublished/offline releases preserve the B0 catalog and existing apps.
    // Invalid published descriptors are hard errors, not trusted updates.
    if(cause?.code==='E_PACKAGE_MISSING'||cause instanceof TypeError)return base;
    throw cause;
  }
  const release=await verifyOfficialStayFocusRemoteDescriptor(json(remoteBytes));
  const previous=base.apps.find(item=>item.toolId==='stay-focus');
  if(!previous)throw error('B0 中缺少可信初始 Stay Focus 身份','E_PACKAGE_IDENTITY');
  const order=compareToolVersions(release.version,previous.version);
  if(order<0)return base;
  if(order===0){
    if(previous.sha256!==release.sha256||previous.bytes!==release.bytes)
      throw error('官方同版本应用与原始签收摘要冲突','E_PACKAGE_INTEGRITY');
    return base;
  }
  return validateOfficialReleaseCatalog({...base,
    apps:base.apps.map(row=>row.toolId==='stay-focus'?release:row)});
}
export async function loadOfficialTool(release,{api=globalThis.chrome,fetcher=globalThis.fetch}={}){
  const row=validateOfficialReleaseCatalog({schema:OFFICIAL_RELEASE_SCHEMA,
    sourceRepository:OFFICIAL_SOURCE_REPOSITORY,apps:[release]}).apps[0];
  if(row.remoteCommit){
    // Catalog and actual installation can be separated by user review.
    // Recheck publisher signature and the exact immutable release identity
    // before loading executable bytes; do not trust a forged descriptor arg.
    const descriptor=json(await resourceBytes(api,fetcher,
      OFFICIAL_STAY_FOCUS_RELEASE_URL,8192,{external:true}));
    const current=await verifyOfficialStayFocusRemoteDescriptor(descriptor);
    if(!sameStorageValue(current,row))
      throw error('官方发行在用户审阅后已变化，拒绝更换版本','E_PACKAGE_IDENTITY');
  }
  const bytes=await resourceBytes(api,fetcher,
    row.remoteCommit?immutableFocusPackage(row.remoteCommit):officialPackagePath(row),
    320000,{external:Boolean(row.remoteCommit)});
  const hash=await digest(bytes);
  if(bytes.length!==row.bytes||hash!==row.sha256)throw error('官方工具包大小或摘要不匹配','E_PACKAGE_INTEGRITY');
  const tool=validateSidebarToolPackage(json(bytes));
  if(tool.id!==row.toolId||tool.version!==row.version||tool.title!==row.packageTitle||
      tool.description!==row.description||JSON.stringify(tool.capabilities)!==JSON.stringify(row.capabilities))
    throw error('官方工具身份、版本或能力与目录不一致','E_PACKAGE_IDENTITY');
  return {tool,release:row};
}
export async function verifyReviewedOfficialTool(release,candidate,options={}){
  const verified=await loadOfficialTool(release,options);
  if(!sameSidebarToolPackage(verified.tool,candidate))
    throw error('官方发行内容与已审阅的工具不一致，请重新审阅','E_PACKAGE_IDENTITY');
  return verified;
}
