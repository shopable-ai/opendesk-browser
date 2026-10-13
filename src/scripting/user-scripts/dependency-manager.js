const DEPENDENCY_STORE="frameworkKV";
import {parseUserScriptDependencies, assessUserScriptExecution, assertUserScriptExecutable} from './dependency-metadata.js';
import {loadPackagedJquery,JQUERY_371} from './packaged-dependencies.js';
import {loadBuiltinPageSource} from '../../libs/loader.js';
import {builtinIdentity,assertBuiltinIdentity} from '../../libs/identity.js';
import {resolvePageProgramRules} from './page-program-rules.js';
import {createPageComponentDependencyMethods} from './page-component-dependencies.js';
import {parseControllerClassicDependencies} from './controller-classic.js';

import {inspectPageSource,validatePageSource,PAGE_BUNDLE_PREFIX} from './page-bundle.js';
import {hasUnbuiltESM} from '../../ui/esm-source-detector.js';
import {parseStaticESMSource,assertStaticESMLeaf,staticESMUrl,STATIC_ESM_WORLDS,STATIC_ESM_LIMITS} from './static-esm.js';
import {classicDependencyProfile} from './dependency-manifest.js';
import {validatePageProgramManifest} from './page-program-contract.js';
import {PAGE_BROWSER_COMPILER,STATIC_ESM_COMPILER_PROFILE} from '../../libs/page-frameworks/contract.js';
import {FoundationError} from '../../platform/protocol.js';

// Assets contain bytes only. Source identity and approval belong to namespace
// scoped reviews/locks; sharing a hash never shares an authorization.
export const DEPENDENCY_LIMITS = Object.freeze({assetBytes:1024*1024, totalBytes:4*1024*1024, timeoutMs:20000,prepareTimeoutMs:25000});
export const DEPENDENCY_LOCK_VERSION = 1;
export const DEPENDENCY_STORAGE_KEYS = Object.freeze({
  asset:hash=>`userscript-asset:v1:sha256:${hash}`,
  review:(ns,id)=>`userscript-review:v1:${JSON.stringify([ns,id])}`,
  lock:(ns,id)=>`userscript-lock:v1:${JSON.stringify([ns,id])}`,
  source:(ns,url,sourceFormat)=>sourceFormat===undefined ? `userscript-source:v1:${JSON.stringify([ns,url])}` : `userscript-esm-source:v1:${JSON.stringify([ns,sourceFormat,url])}`,
  // A provenance pointer only; assets remain in the existing SHA store. This
  // does NOT confer namespace approval or permission to execute/download.
  sharedSource:url=>`userscript-shared-source:v1:${JSON.stringify(url)}`,
  manifest:(ns,hash)=>`userscript-manifest:v1:${JSON.stringify([ns,hash])}`,
  reference:(ns,kind,id)=>`userscript-reference:v1:${JSON.stringify([ns,kind,id])}`
});
const key = DEPENDENCY_STORAGE_KEYS, encoder = new TextEncoder(), HEX64 = /^[a-f0-9]{64}$/;
const strong = new Map([['sha256','SHA-256'],['sha384','SHA-384'],['sha512','SHA-512']]);
const mimeTypes = new Set(['application/javascript','text/javascript','application/x-javascript','application/ecmascript','text/ecmascript','text/plain']);
const risk = '第三方 JavaScript 可以读取或修改已授权网页的 DOM，也可能通过网页允许的网络渠道对外发送网页数据。USER_SCRIPT 隔离不是网络沙箱，也不提供 GM 或扩展宿主权限。';
const unknownLicense = () => ({status:'unknown',name:null,source:null});
const fail = (code,message) => { throw new FoundationError(code,message || code); };
const ensure = (yes,code,message) => { if (!yes) fail(code,message); };
const clone = value => structuredClone(value);
const canonical = value => JSON.stringify(value,(_k,v)=>v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
const same = (a,b) => canonical(a)===canonical(b);
const admissionFor = (parsed,manifest,locked) => {
  const admission=assessUserScriptExecution(parsed,{entryFormat:manifest.entryFormat,phase:'preview',dependenciesLocked:locked});
  return manifest.sourceFormat===undefined ? admission : {...admission,nativeOptions:{...admission.nativeOptions,world:manifest.world}};
};
const fields = (value,allowed) => ensure(value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(k=>allowed.includes(k)), 'E_SCHEMA','依赖请求含未知字段');
async function hashBytes(bytes,algorithm='SHA-256') {
  ensure(globalThis.crypto?.subtle,'E_HASH_UNAVAILABLE');
  return [...new Uint8Array(await crypto.subtle.digest(algorithm,bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const hashObject = value => hashBytes(encoder.encode(canonical(value)));
function dependencyUrl(value) {
  let url; try { url=new URL(value); } catch { fail('E_DEPENDENCY_URL','依赖需要有效 HTTPS URL'); }
  const hostname=url.hostname.toLowerCase();
  // Literal IPs and local hostnames are outside this public-library downloader.
  // This is not DNS pinning; a permitted hostname's actual DNS remains browser-managed.
  ensure(url.protocol==='https:' && !url.username && !url.password && !url.hash && url.href.length<=4096 &&
    !/^\[|^\d+(?:\.\d+){0,3}$/.test(hostname) && hostname.includes('.') &&
    !/^(?:localhost|localhost\.)$|\.(?:localhost|local|internal)\.?$|(?:^|\.)home\.arpa\.?$/.test(hostname),
  'E_DEPENDENCY_URL','依赖下载仅支持无账户信息的公共 HTTPS 主机名，不接受 IP 或本地主机');
  return url;
}
const permissionFor = url => `https://${url.hostname}/*`;
function packagedDescriptor(value) {
  const url=dependencyUrl(value);
  if (url.search || url.port) return null;
  const known = [
    {origin:'https://cdn.jsdelivr.net',path:'/npm/jquery@3.7.1/dist/jquery.min.js'},
    {origin:'https://unpkg.com',path:'/jquery@3.7.1/dist/jquery.min.js'},
    {origin:'https://code.jquery.com',path:'/jquery-3.7.1.min.js'}
  ];
  return known.some(row=>url.origin===row.origin && url.pathname===row.path) ? JQUERY_371 : null;
}
function sourceSummary(url) {
  const path=new URL(url).pathname;
  const npm=/\/(?:npm\/)?((?:@[^/]+\/)?[^/@]+)@([^/]+)\//.exec(path);
  return {name:npm?.[1] || path.split('/').at(-1) || new URL(url).hostname,version:npm?.[2] || null};
}
function manifestFor(request) {
  ensure(typeof request.sourceUtf8==='string' &&
    (request.sourceUtf8.startsWith(PAGE_BUNDLE_PREFIX)?(inspectPageSource(request.sourceUtf8),true):
      encoder.encode(request.sourceUtf8).byteLength<=128*1024),'E_SOURCE','普通页面脚本最大 128 KiB；大型资源须有固定版本与哈希');
  const entryFormat=request.entryFormat===undefined ? 'async-main' : request.entryFormat;
  ensure(['classic-userscript','async-main'].includes(entryFormat),'E_ENTRY_FORMAT','页面入口必须明确为 classic-userscript 或 async-main');
  ensure(request.sourceFormat===undefined || Object.hasOwn(STATIC_ESM_WORLDS,request.sourceFormat),'E_SOURCE_FORMAT','源码格式不受支持');
  if(request.sourceFormat!==undefined) {
    ensure(encoder.encode(request.sourceUtf8).byteLength<=128*1024,'E_SOURCE','静态 ESM 草稿最大 128 KiB');
    ensure(entryFormat==='async-main','E_ENTRY_FORMAT','静态 ESM 仅支持 async-main 入口');
    const esm=parseStaticESMSource(request.sourceUtf8),metadata=parseUserScriptDependencies(request.sourceUtf8,{importSourceUrl:request.importSourceUrl});
    const parsed={...metadata,requires:esm.requires};
    const manifest={lockVersion:1,entryFormat,sourceFormat:request.sourceFormat,importSourceUrl:metadata.importSourceUrl || null,
      world:STATIC_ESM_WORLDS[request.sourceFormat],requires:esm.requires};
    return {parsed,manifest,entryFormat};
  }
  if(!request.sourceUtf8.startsWith(PAGE_BUNDLE_PREFIX))return classicDependencyProfile(request);
  const parsed=parseUserScriptDependencies(request.sourceUtf8,{importSourceUrl:request.importSourceUrl});
  const manifest={lockVersion:1,entryFormat,importSourceUrl:parsed.importSourceUrl || null,world:'USER_SCRIPT',
    requires:parsed.requires.map(row=>({order:row.order,raw:row.raw || row.originalUrl || row.url,
      originalUrl:row.originalUrl || row.url,url:row.url,integrity:row.integrity || []}))};
  return {parsed,manifest,entryFormat};
}
// Page Program contracts reuse the exact declaration identity instead of
// implementing a second URL/integrity normalizer. No host/storage/network use.
export async function describeDependencyManifest(request) {
  const profile=manifestFor(request);
  await validateFixedResource(request.sourceUtf8);
  return {...profile,manifestDigest:await hashObject(profile.manifest)};
}
async function validateFixedResource(sourceUtf8){
  if(typeof sourceUtf8==='string'&&sourceUtf8.startsWith(PAGE_BUNDLE_PREFIX))await validatePageSource(sourceUtf8);
}
function decodeCode(bytes) {
  try { return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes); }
  catch { fail('E_DEPENDENCY_ENCODING','依赖必须是有效 UTF-8 原始字节'); }
}
async function verifyIntegrity(bytes,row) {
  const declarations=row.integrity || [], checked=declarations.filter(d=>strong.has(d.algorithm));
  ensure(!declarations.length || checked.length,'E_DEPENDENCY_INTEGRITY_UNSUPPORTED','弱哈希不能独立批准依赖；请提供 SHA-256/384/512 或重新审核无哈希来源');
  for (const d of checked) ensure(await hashBytes(bytes,strong.get(d.algorithm))===d.digestHex,'E_DEPENDENCY_INTEGRITY','下载资源与声明的 '+d.algorithm+' 不符');
  return {verified:checked.map(d=>d.algorithm),ignoredWeak:declarations.filter(d=>!strong.has(d.algorithm)).map(d=>d.algorithm)};
}
async function verifiedAsset(asset,expectedHash,byteLength) {
  ensure(asset?.tag==='userscript-asset-v1' && asset.sha256===expectedHash && HEX64.test(expectedHash) &&
    asset.bytes instanceof ArrayBuffer && asset.byteLength===asset.bytes.byteLength && asset.byteLength>0 &&
    asset.byteLength<=DEPENDENCY_LIMITS.assetBytes && (byteLength===undefined || asset.byteLength===byteLength),
  'E_DEPENDENCY_ASSET','已缓存依赖的字节或大小不合法');
  ensure(await hashBytes(asset.bytes)===expectedHash,'E_DEPENDENCY_HASH','已缓存依赖内容被修改');
  return {asset,code:decodeCode(asset.bytes)};
}
function lockCore(row) {
  return {lockVersion:row.lockVersion,namespace:row.namespace,manifestDigest:row.manifestDigest,manifest:row.manifest,
    world:row.world,reviewId:row.reviewId,approvedAt:row.approvedAt,entries:row.entries};
}
function reviewCore(row) {
  return {reviewId:row.reviewId,namespace:row.namespace,manifest:row.manifest,manifestDigest:row.manifestDigest,
    entries:row.entries,totalBytes:row.totalBytes,createdAt:row.createdAt};
}
async function verifiedLock(row,namespace,id) {
  const world=row?.manifest?.sourceFormat===undefined ? 'USER_SCRIPT' : STATIC_ESM_WORLDS[row.manifest.sourceFormat];
  ensure(row?.tag==='userscript-lock-v1' && row.status==='locked' && row.approvalStatus==='approved' &&
    world && row.namespace===namespace && row.lockId===id && row.lockVersion===1 && row.world===world && row.manifest?.world===world &&
    Array.isArray(row.entries) && row.entries.every((e,i)=>e.order===i && e.world===world && HEX64.test(e.sha256)),
  'E_DEPENDENCY_LOCK','依赖锁不存在、未批准或不属于当前身份');
  ensure(row.manifestDigest===await hashObject(row.manifest) && id===`dep-lock-${await hashObject(lockCore(row))}`,
    'E_DEPENDENCY_LOCK','不可变依赖锁校验失败');
  return row;
}
// Program IDs are a second, scoped approval dimension beneath the existing
// authenticated host. The SHA asset store remains global. Legacy unscoped
// locks/candidates continue to resolve without granting them to new programs.
const programNamespace=(namespace,programId)=>{
  if(programId===undefined)return namespace;
  ensure(typeof programId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(programId),
    'E_DEPENDENCY_PROGRAM','第三方依赖必须绑定有效的页面程序 ID');
  return namespace+'|page-program:'+JSON.stringify(programId);
};
const publicLock = row => clone({lockId:row.lockId,lockVersion:row.lockVersion,manifestDigest:row.manifestDigest,
  status:row.status,approvalStatus:row.approvalStatus,world:row.world,approvedAt:row.approvedAt,entries:row.entries,
  ...(row.manifest.sourceFormat===undefined?{}:{sourceFormat:row.manifest.sourceFormat})});

export function createDependencyManager({api,storage,assertHost,fetchImpl=globalThis.fetch,clock={now:()=>Date.now()},loadBuiltin=loadBuiltinPageSource}) {
  let permissionRemovalEpoch=0;
  api.permissions?.onRemoved?.addListener(()=>{permissionRemovalEpoch++;});
  const monotonic=()=>clock.monotonic?.()??performance.now();
  ensure(api && typeof storage?.transaction==='function' && typeof assertHost==='function','E_SCHEMA','可信依赖管理器缺少宿主服务');
  const timestamp=()=>{const n=clock.now();ensure(Number.isSafeInteger(n)&&n>=0,'E_SCHEMA');return n;};
  async function hostFor(sender,previous) {
    const host=await assertHost(sender);
    ensure(typeof host?.namespace==='string' && host.namespace && typeof host.registrationId==='string','E_OWNER','依赖操作必须来自已注册工具宿主');
    if (previous) ensure(['namespace','registrationId','hostDocumentId','hostInstanceId','browserSessionIncarnation','hostUrl'].every(k=>host[k]===previous[k]),'E_OWNER','审核过程中宿主身份已改变');
    return host;
  }
  async function inTransaction(host,mode,work) {
    return storage.transaction([DEPENDENCY_STORE,'commandJournal'],mode,async tx=>{
      const current=await tx.get('commandJournal',`host:${host.registrationId}`);
      ensure(current?.tag==='host' && current.active && !current.revoked &&
        ['registrationId','hostDocumentId','hostInstanceId','browserSessionIncarnation','hostUrl'].every(k=>current[k]===host[k]),
      'E_OWNER','工具宿主已关闭、被撤销或发生变化');
      return work(tx);
    });
  }
  async function cachedChoices(tx,namespace,row,sourceFormat) {
    if (!row.url) return [];
    const index=await tx.get(DEPENDENCY_STORE,key.source(namespace,row.url,sourceFormat)), choices=[];
    for (const ref of index?.choices || []) {
      const lock=await verifiedLock(await tx.get(DEPENDENCY_STORE,key.lock(namespace,ref.lockId)),namespace,ref.lockId);
      if(lock.manifest.sourceFormat!==sourceFormat) continue;
      const entry=lock.entries[ref.order];
      ensure(entry?.url===row.url,'E_DEPENDENCY_LOCK');
      if (!choices.some(c=>c.sha256===entry.sha256)) choices.push({...clone(entry),lockId:lock.lockId,status:'approved-cache'});
    }
    return choices;
  }
  // Only approved, actually downloaded HTTPS bytes can enter this cross-program
  // provenance index. Rehash the shared asset on every read: the index is never
  // itself an approval or a replacement for a namespace-specific dependency lock.
  async function sharedChoices(tx,url) {
    dependencyUrl(url);
    const index=await tx.get(DEPENDENCY_STORE,key.sharedSource(url));
    if(index===undefined)return [];
    ensure(index?.tag==='userscript-shared-source-index-v1'&&index.url===url&&
      Array.isArray(index.choices)&&index.choices.length>0&&index.choices.length<=16,
      'E_DEPENDENCY_SHARED_SOURCE','共享来源索引损坏');
    const choices=[],seen=new Set();
    for(const choice of index.choices) {
      ensure(HEX64.test(choice?.sha256)&&Number.isSafeInteger(choice.byteLength)&&
        choice.byteLength>0&&choice.byteLength<=DEPENDENCY_LIMITS.assetBytes&&
        choice.sourceKind==='https'&&choice.resolvedUrl===url&&
        typeof choice.mime==='string'&&mimeTypes.has(choice.mime)&&
        choice.license?.status==='unknown'&&
        Number.isSafeInteger(choice.approvedAt)&&choice.approvedAt>=0&&
        !seen.has(choice.sha256),
      'E_DEPENDENCY_SHARED_SOURCE','共享来源身份或元数据损坏');
      await verifiedAsset(await tx.get(DEPENDENCY_STORE,key.asset(choice.sha256)),choice.sha256,choice.byteLength);
      seen.add(choice.sha256);choices.push(clone(choice));
    }
    return choices;
  }
  async function inspect(request,sender) {
    fields(request,['sourceUtf8','entryFormat','importSourceUrl','sourceFormat','programId']);
    request=clone(request);
    await validateFixedResource(request.sourceUtf8);
    const host=await hostFor(sender),namespace=programNamespace(host.namespace,request.programId),
      {parsed,manifest,entryFormat}=manifestFor(request),manifestDigest=await hashObject(manifest);
    const result=await inTransaction(host,'readonly',async tx=>{
      const requires=[];
      for (const row of parsed.requires) {
        let descriptor=null,downloadError=null;
        try { if(row.url && manifest.sourceFormat===undefined) descriptor=packagedDescriptor(row.url); } catch(error) { downloadError={code:error.code,message:error.message}; }
        const cacheChoices=await cachedChoices(tx,namespace,row,manifest.sourceFormat);
        const sharedCacheChoices=manifest.sourceFormat===undefined&&!downloadError&&row.url&&!descriptor?await sharedChoices(tx,row.url):[];
        requires.push({...clone(row),...(row.url ? sourceSummary(row.url) : {}),sourceKind:descriptor?'packaged':'https',
          status:downloadError?'unsupported':cacheChoices.length?'approved-cache':'needs-review',
          cacheChoices,sharedCacheChoices,downloadError,risk,
          license:descriptor?{status:'known',name:descriptor.license,source:'extension-package'}:unknownLicense()});
      }
      const index=await tx.get(DEPENDENCY_STORE,key.manifest(namespace,manifestDigest)),locks=[];
      for (const id of (index?.lockIds || []).slice(0,20)) locks.push(publicLock(await verifiedLock(await tx.get(DEPENDENCY_STORE,key.lock(namespace,id)),namespace,id)));
      return {manifestDigest,requires,locks,...(manifest.sourceFormat===undefined?{}:{sourceFormat:manifest.sourceFormat,world:manifest.world}),
        selectedLockId:locks.some(row=>row.lockId===index?.selectedLockId)?index.selectedLockId:null,
        admission:admissionFor(parsed,manifest,locks.length>0)};
    });
    result.permissionOrigins=[];
    for (const row of result.requires.filter(r=>r.url && r.sourceKind==='https' && !r.downloadError)) {
      const pattern=permissionFor(dependencyUrl(row.url));
      if (!result.permissionOrigins.includes(pattern) && !await api.permissions?.contains?.({origins:[pattern]})) result.permissionOrigins.push(pattern);
    }
    await hostFor(sender,host);
    return result;
  }
  async function httpsAsset(row,remaining,deadline=monotonic()+DEPENDENCY_LIMITS.timeoutMs) {
    const url=dependencyUrl(row.url),origin=permissionFor(url);
    ensure(await api.permissions?.contains?.({origins:[origin]}),'E_DEPENDENCY_PERMISSION','请先明确授权下载来源：'+url.origin);
    ensure(typeof fetchImpl==='function','E_RESOURCE_UNAVAILABLE');
    const timeout=Math.min(DEPENDENCY_LIMITS.timeoutMs,deadline-monotonic());
    ensure(timeout>0,'E_DEPENDENCY_TIMEOUT','整组准备超过 25 秒，未批准或执行');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    let reader;
    try {
      const response=await fetchImpl(url.href,{method:'GET',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',redirect:'error',signal:controller.signal});
      ensure(response?.ok && response.status>=200 && response.status<300,'E_DEPENDENCY_FETCH','依赖下载响应失败');
      ensure(!response.redirected && !['opaque','opaqueredirect'].includes(response.type) && response.url===url.href,
        'E_DEPENDENCY_REDIRECT','本阶段拒绝所有依赖重定向；请声明最终 HTTPS URL');
      const contentType=response.headers?.get('content-type') || '',mime=contentType.split(';')[0].trim().toLowerCase();
      ensure(mimeTypes.has(mime),'E_DEPENDENCY_CONTENT_TYPE','依赖响应必须是 JavaScript 或 text/plain，不能是 HTML/JSON');
      const charset=/;\s*charset\s*=\s*"?([^;"\s]+)/i.exec(contentType)?.[1].toLowerCase();
      ensure(!charset || ['utf-8','utf8','us-ascii'].includes(charset),'E_DEPENDENCY_ENCODING','依赖响应编码必须为 UTF-8');
      const limit=Math.min(remaining,DEPENDENCY_LIMITS.assetBytes),length=response.headers?.get('content-length');
      if (length!==null && length!==undefined) ensure(/^\d+$/.test(length) && Number(length)<=limit,'E_DEPENDENCY_LIMIT','依赖超过下载大小上限');
      ensure(response.body?.getReader,'E_DEPENDENCY_FETCH','依赖下载需要可限长的响应流');
      reader=response.body.getReader();
      const chunks=[];let size=0;
      for (;;) {
        const next=await reader.read();if(next.done)break;
        ensure(next.value instanceof Uint8Array,'E_DEPENDENCY_FETCH');
        size+=next.value.byteLength;ensure(size<=limit,'E_DEPENDENCY_LIMIT','单个依赖最多 1 MiB，整组最多 4 MiB');chunks.push(next.value);
      }
      ensure(size>0,'E_DEPENDENCY_FETCH','依赖响应为空');
      const bytes=new Uint8Array(size);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      const code=decodeCode(bytes);
      ensure(!/^(?:\uFEFF)?\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(code),'E_DEPENDENCY_CONTENT_TYPE','依赖来源返回了 HTML 错误页面');
      ensure(charset!=='us-ascii' || bytes.every(b=>b<128),'E_DEPENDENCY_ENCODING');
      ensure(await api.permissions?.contains?.({origins:[origin]}),'E_DEPENDENCY_PERMISSION','依赖下载期间来源权限已撤销');
      return {bytes:bytes.buffer,sourceKind:'https',resolvedUrl:response.url,acquisition:'download',mime,
        license:unknownLicense(),integrityRepresentation:'fetch-response-bytes'};
    } catch (error) {
      if (error.code) throw error;
      fail(controller.signal.aborted?'E_DEPENDENCY_TIMEOUT':'E_DEPENDENCY_FETCH',controller.signal.aborted?'单项下载或整组准备超过时限；未批准或执行':'依赖下载失败；重定向、网络错误或浏览器阻止均不会被绕过');
    } finally { clearTimeout(timer); controller.abort(); if(reader) { try { await reader.cancel(); } catch { /* Already consumed/aborted. */ } } }
  }
  async function localAsset(file) {
    fields(file,['name','bytesBase64','license']);
    ensure(typeof file.name==='string' && file.name.length>0 && file.name.length<=128 && !/[\x00-\x1f/\\]/.test(file.name),'E_DEPENDENCY_LOCAL','本地依赖需要不含路径的文件名');
    ensure(typeof file.bytesBase64==='string' && file.bytesBase64.length<=Math.ceil(DEPENDENCY_LIMITS.assetBytes/3)*4 &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.bytesBase64),'E_DEPENDENCY_LOCAL','本地依赖字节必须为有界 Base64');
    const binary=atob(file.bytesBase64);ensure(btoa(binary)===file.bytesBase64 && binary.length>0,'E_DEPENDENCY_LOCAL');
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));decodeCode(bytes);
    ensure(file.license===undefined || typeof file.license==='string' && file.license.length>0 && file.license.length<=128,'E_DEPENDENCY_LOCAL');
    return {bytes:bytes.buffer,sourceKind:'local-file',resolvedUrl:`local:${file.name}`,acquisition:'local-import',mime:null,
      license:file.license?{status:'declared',name:file.license,source:'user-provided-file'}:unknownLicense(),integrityRepresentation:'original-file-bytes'};
  }
  async function prepare(request,sender) {
    // Bound network acquisition below the host client's 35-second deadline.
    const deadline=monotonic()+DEPENDENCY_LIMITS.prepareTimeoutMs;
    fields(request,['sourceUtf8','entryFormat','importSourceUrl','sourceFormat','programId','explicitUserAction','selections']);
    request=clone(request);
    await validateFixedResource(request.sourceUtf8);
    ensure(request.explicitUserAction===true,'E_DEPENDENCY_REVIEW','下载依赖需要用户明确操作');
    const host=await hostFor(sender),namespace=programNamespace(host.namespace,request.programId),
      {parsed,manifest,entryFormat}=manifestFor(request);
    assertUserScriptExecutable(parsed,{entryFormat,phase:'preview',dependenciesLocked:true});
    ensure(parsed.requires.length>0,'E_DEPENDENCY_EMPTY',manifest.sourceFormat===undefined?'源码没有 @require':'源码没有静态 import，无需下载或批准');
    const selections=request.selections || [];ensure(Array.isArray(selections)&&selections.length<=parsed.requires.length,'E_SCHEMA');
    const selected=new Map();
    for(const choice of selections){
      fields(choice,['order','assetSha256','sharedAssetSha256','localFile']);
      ensure(Number.isSafeInteger(choice.order)&&choice.order>=0&&choice.order<parsed.requires.length&&!selected.has(choice.order) &&
        [choice.assetSha256,choice.sharedAssetSha256,choice.localFile].filter(value=>value!==undefined).length<=1 &&
        (choice.assetSha256===undefined || HEX64.test(choice.assetSha256)) &&
        (choice.sharedAssetSha256===undefined || HEX64.test(choice.sharedAssetSha256)),'E_SCHEMA');
      selected.set(choice.order,choice);
    }
    const assets=new Map(),entries=[],retrieved=new Map();let totalBytes=0;
    for(const row of parsed.requires){
      ensure(monotonic()<deadline,'E_DEPENDENCY_TIMEOUT','整组准备超过 25 秒，未批准或执行');
      dependencyUrl(row.url);
      const choice=selected.get(row.order);let obtained;
      if(choice?.assetSha256){
        obtained=await inTransaction(host,'readonly',async tx=>{
          const match=(await cachedChoices(tx,namespace,row,manifest.sourceFormat)).find(e=>e.sha256===choice.assetSha256);
          ensure(match,'E_DEPENDENCY_REVIEW','当前身份尚未批准该声明来源的所选缓存');
          const {asset}=await verifiedAsset(await tx.get(DEPENDENCY_STORE,key.asset(match.sha256)),match.sha256,match.byteLength);
          return {...match,bytes:asset.bytes,acquisition:'approved-cache',reusedFrom:{lockId:match.lockId}};
        });
      } else if(choice?.sharedAssetSha256){
        // Explicit reuse of a verified byte identity is NOT an approved cache
        // hit for this owner. It still creates a fresh review and owner lock.
        obtained=await inTransaction(host,'readonly',async tx=>{
          const match=(await sharedChoices(tx,row.url)).find(entry=>entry.sha256===choice.sharedAssetSha256);
          ensure(match,'E_DEPENDENCY_REVIEW','所选共享资产缺少同 URL 的已批准下载来源；请重新获取或选择正确 SHA');
          const {asset}=await verifiedAsset(await tx.get(DEPENDENCY_STORE,key.asset(match.sha256)),match.sha256,match.byteLength);
          return {bytes:asset.bytes,sourceKind:'https',resolvedUrl:row.url,
            acquisition:'shared-content-cache',mime:match.mime,license:clone(match.license),
            integrityRepresentation:'original-https-bytes'};
        });
      } else if(choice?.localFile) obtained=await localAsset(choice.localFile);
      else if(retrieved.has(row.url)) obtained=retrieved.get(row.url);
      else {
        const descriptor=manifest.sourceFormat===undefined?packagedDescriptor(row.url):null;
        if(descriptor){
          const loaded=await loadPackagedJquery({runtime:api.runtime,fetchImpl});
          obtained={bytes:encoder.encode(loaded.code).buffer,sourceKind:'packaged',resolvedUrl:api.runtime.getURL(descriptor.path),
            acquisition:'extension-package',mime:'text/javascript',license:{status:'known',name:descriptor.license,source:'extension-package'},
            integrityRepresentation:'packaged-utf8-bytes',name:descriptor.id,version:descriptor.version};
        } else obtained=await httpsAsset(row,Math.min(DEPENDENCY_LIMITS.totalBytes-totalBytes,
          manifest.sourceFormat===undefined?DEPENDENCY_LIMITS.assetBytes:STATIC_ESM_LIMITS.moduleBytes),deadline);
        retrieved.set(row.url,obtained);
      }
      ensure(obtained.bytes.byteLength>0&&obtained.bytes.byteLength<=DEPENDENCY_LIMITS.assetBytes,'E_DEPENDENCY_LIMIT');
      if(manifest.sourceFormat!==undefined) ensure(obtained.bytes.byteLength<=STATIC_ESM_LIMITS.moduleBytes,'E_DEPENDENCY_LIMIT','ESM 模块最多 128 KiB');
      totalBytes+=obtained.bytes.byteLength;ensure(totalBytes<=DEPENDENCY_LIMITS.totalBytes,'E_DEPENDENCY_LIMIT','整组依赖最多 4 MiB，重复声明也计入执行预算');
      const integrityResult=await verifyIntegrity(obtained.bytes,row),sha256=await hashBytes(obtained.bytes);
      if(manifest.sourceFormat!==undefined) ensure(!entries.some(entry=>entry.url===row.url && entry.sha256!==sha256),
        'E_DEPENDENCY_LOCK','同一 ESM URL 不能选择不同模块字节');
      if(manifest.sourceFormat!==undefined) assertStaticESMLeaf(decodeCode(obtained.bytes));
      else ensure(!hasUnbuiltESM(decodeCode(obtained.bytes)), 'E_DEPENDENCY_MODULE',
        '@require 只接收经典全局/UMD JavaScript；此资源含 import/export 或动态 import。请在本地项目声明静态 HTTPS import，单独审核锁定后构建');
      assets.set(sha256,{tag:'userscript-asset-v1',sha256,bytes:obtained.bytes,byteLength:obtained.bytes.byteLength,integrityStatus:'verified',createdAt:timestamp()});
      entries.push({order:row.order,raw:row.raw || row.originalUrl || row.url,originalUrl:row.originalUrl || row.url,url:row.url,
        ...sourceSummary(row.url),...(obtained.name?{name:obtained.name,version:obtained.version}:{}),sourceKind:obtained.sourceKind,
        resolvedUrl:obtained.resolvedUrl,acquisition:obtained.acquisition,reusedFrom:obtained.reusedFrom || null,
        sha256,byteLength:obtained.bytes.byteLength,world:manifest.world,integrity:clone(row.integrity || []),integrityResult,
        integrityRepresentation:obtained.integrityRepresentation,license:obtained.license,mime:obtained.mime,risk});
    }
    const reviewId=`dep-review-${crypto.randomUUID()}`,manifestDigest=await hashObject(manifest);
    const review={tag:'userscript-review-v1',reviewId,namespace:namespace,status:'pending-review',approvalStatus:'pending',
      manifest,manifestDigest,entries,totalBytes,createdAt:timestamp()};
    review.reviewDigest=await hashObject(reviewCore(review));
    await hostFor(sender,host);
    ensure(monotonic()<deadline,'E_DEPENDENCY_TIMEOUT','整组准备超过 25 秒，未保存审核或批准');
    await inTransaction(host,'readwrite',async tx=>{
      for(const [sha256,asset] of assets){
        const existing=await tx.get(DEPENDENCY_STORE,key.asset(sha256));
        if(existing) await verifiedAsset(existing,sha256,asset.byteLength);
        else await tx.put(DEPENDENCY_STORE,asset,key.asset(sha256));
      }
      await tx.put(DEPENDENCY_STORE,review,key.review(namespace,reviewId));
      await tx.put(DEPENDENCY_STORE,{tag:'userscript-reference-v1',namespace:namespace,ownerType:'review',ownerId:reviewId,
        assetHashes:[...assets.keys()]},key.reference(namespace,'review',reviewId));
    });
      return clone({reviewId,manifestDigest,status:review.status,approvalStatus:review.approvalStatus,entries,totalBytes,
        ...(manifest.sourceFormat===undefined?{}:{sourceFormat:manifest.sourceFormat,world:manifest.world})});
  }
  // Authenticated, namespace-scoped inspection of the exact cached bytes.
  // Reading a pending review never downloads, approves or executes its code.
  async function readReview(request,sender) {
    fields(request,['reviewId','programId','order']);
    ensure(/^dep-review-[a-f0-9-]{36}$/.test(request.reviewId) &&
      Number.isSafeInteger(request.order) && request.order>=0,'E_DEPENDENCY_REVIEW');
    const host=await hostFor(sender),namespace=programNamespace(host.namespace,request.programId);
    const result=await inTransaction(host,'readonly',async tx=>{
      const review=await tx.get(DEPENDENCY_STORE,key.review(namespace,request.reviewId));
      ensure(review?.tag==='userscript-review-v1' && review.namespace===namespace &&
        review.reviewId===request.reviewId && Array.isArray(review.entries) &&
        review.manifestDigest===await hashObject(review.manifest) &&
        review.reviewDigest===await hashObject(reviewCore(review)), 'E_DEPENDENCY_REVIEW');
      const entry=review.entries[request.order];
      ensure(entry?.order===request.order,'E_DEPENDENCY_REVIEW');
      const {asset,code}=await verifiedAsset(await tx.get(DEPENDENCY_STORE,key.asset(entry.sha256)),entry.sha256,entry.byteLength);
      await verifyIntegrity(asset.bytes,entry);
      return {reviewId:review.reviewId,order:entry.order,sha256:entry.sha256,code};
    });
    await hostFor(sender,host);
    return result;
  }
  async function approve(request,sender) {
    fields(request,['reviewId','programId','explicitUserAction','acceptedHashes']);
    ensure(request.explicitUserAction===true && /^dep-review-[a-f0-9-]{36}$/.test(request.reviewId),'E_DEPENDENCY_REVIEW','请明确审核下载后的来源、内容哈希和风险');
    ensure(Array.isArray(request.acceptedHashes)&&request.acceptedHashes.every(h=>HEX64.test(h)),'E_DEPENDENCY_REVIEW');
    const host=await hostFor(sender),namespace=programNamespace(host.namespace,request.programId);
    const reviewed=await inTransaction(host,'readonly',async tx=>{
      const review=await tx.get(DEPENDENCY_STORE,key.review(namespace,request.reviewId));
      ensure(review?.tag==='userscript-review-v1' && review.namespace===namespace && review.reviewId===request.reviewId && Array.isArray(review.entries) &&
        same(request.acceptedHashes,review.entries.map(e=>e.sha256)) && review.manifestDigest===await hashObject(review.manifest) &&
        review.reviewDigest===await hashObject(reviewCore(review)),
      'E_DEPENDENCY_REVIEW','审核记录或明确接受的哈希不匹配');
      for(const entry of review.entries){
        const {asset}=await verifiedAsset(await tx.get(DEPENDENCY_STORE,key.asset(entry.sha256)),entry.sha256,entry.byteLength);
        await verifyIntegrity(asset.bytes,entry);
      }
      return review;
    });
    const core={lockVersion:1,namespace:namespace,manifestDigest:reviewed.manifestDigest,manifest:reviewed.manifest,
      world:reviewed.manifest.world,reviewId:reviewed.reviewId,approvedAt:timestamp(),entries:reviewed.entries};
    const lock={tag:'userscript-lock-v1',...core,lockId:`dep-lock-${await hashObject(core)}`,status:'locked',approvalStatus:'approved'};
    await hostFor(sender,host);
    return inTransaction(host,'readwrite',async tx=>{
      const current=await tx.get(DEPENDENCY_STORE,key.review(namespace,request.reviewId));
      if(current?.lockId) {
        const existing=await verifiedLock(await tx.get(DEPENDENCY_STORE,key.lock(namespace,current.lockId)),namespace,current.lockId);
        ensure(same(reviewCore(current),reviewCore(reviewed)) && existing.reviewId===reviewed.reviewId &&
          existing.manifestDigest===reviewed.manifestDigest && same(existing.manifest,reviewed.manifest) &&
          same(existing.entries,reviewed.entries) && same(existing.entries.map(e=>e.sha256),request.acceptedHashes),
        'E_DEPENDENCY_REVIEW','已有批准锁不属于当前审核或明确接受的资源');
        const indexKey=key.manifest(namespace,existing.manifestDigest),index=await tx.get(DEPENDENCY_STORE,indexKey);
        ensure(index?.lockIds?.includes(existing.lockId),'E_DEPENDENCY_LOCK');
        await tx.put(DEPENDENCY_STORE,{...index,selectedLockId:existing.lockId,
          lockIds:[existing.lockId,...index.lockIds.filter(id=>id!==existing.lockId)]},indexKey);
        return publicLock(existing);
      }
      ensure(same(current,reviewed),'E_DEPENDENCY_REVIEW','审核内容在批准前发生变化');
      // Recheck within the same atomic commit: a concurrently corrupted/deleted
      // asset must never receive an approved lock based on an earlier snapshot.
      for(const entry of lock.entries) await verifiedAsset(await tx.get(DEPENDENCY_STORE,key.asset(entry.sha256)),entry.sha256,entry.byteLength);
      await tx.put(DEPENDENCY_STORE,lock,key.lock(namespace,lock.lockId));
      await tx.put(DEPENDENCY_STORE,{...current,status:'reviewed',approvalStatus:'approved',lockId:lock.lockId},key.review(namespace,request.reviewId));
      const manifestKey=key.manifest(namespace,lock.manifestDigest),index=await tx.get(DEPENDENCY_STORE,manifestKey);
      await tx.put(DEPENDENCY_STORE,{tag:'userscript-manifest-index-v1',namespace:namespace,manifestDigest:lock.manifestDigest,
        lockIds:[lock.lockId,...(index?.lockIds || [])],selectedLockId:lock.lockId},manifestKey);
      for(const url of new Set(lock.entries.map(e=>e.url))){
        const sourceKey=key.source(namespace,url,lock.manifest.sourceFormat),source=await tx.get(DEPENDENCY_STORE,sourceKey),choices=[];
        for(const entry of lock.entries.filter(e=>e.url===url)) if(!choices.some(c=>c.sha256===entry.sha256))
          choices.push({lockId:lock.lockId,order:entry.order,sha256:entry.sha256});
        // A source's picker needs one proof per immutable hash, while old full
        // lock/reference records remain untouched for installed/history users.
        const previous=(source?.choices || []).filter(c=>!choices.some(next=>next.sha256===c.sha256));
        await tx.put(DEPENDENCY_STORE,{tag:'userscript-source-index-v1',namespace:namespace,url,choices:[...choices,...previous]},sourceKey);
      }
      await tx.put(DEPENDENCY_STORE,{tag:'userscript-reference-v1',namespace:namespace,ownerType:'lock',ownerId:lock.lockId,
        assetHashes:[...new Set(lock.entries.map(e=>e.sha256))]},key.reference(namespace,'lock',lock.lockId));
      // Publish provenance only AFTER an explicit owner's approval, in the same
      // transaction as its immutable lock. Local uploads, packaged aliases and
      // cache-only selections must not claim a fresh HTTPS acquisition.
      for(const entry of lock.entries) {
        if(entry.sourceKind!=='https'||entry.acquisition!=='download'||entry.resolvedUrl!==entry.url)continue;
        const sourceKey=key.sharedSource(entry.url),old=await tx.get(DEPENDENCY_STORE,sourceKey);
        if(old)await sharedChoices(tx,entry.url);
        const choice={sha256:entry.sha256,byteLength:entry.byteLength,
          sourceKind:'https',resolvedUrl:entry.url,mime:entry.mime,
          license:clone(entry.license),approvedAt:lock.approvedAt};
        const remaining=(old?.choices||[]).filter(item=>item.sha256!==entry.sha256);
        await tx.put(DEPENDENCY_STORE,{tag:'userscript-shared-source-index-v1',url:entry.url,
          choices:[choice,...remaining].slice(0,16)},sourceKey);
      }
      return publicLock(lock);
    });
  }
  async function loadForExecution(request,sender) {
    fields(request,['sourceUtf8','entryFormat','importSourceUrl','sourceFormat','programId','lockId']);
    request=clone(request);
    ensure(request.sourceFormat===undefined,'E_SOURCE_FORMAT','ESM 依赖只能离线读取用于编译');
    const host=await hostFor(sender),namespace=programNamespace(host.namespace,request.programId);
    const result=await loadInNamespace(request,namespace,work=>inTransaction(host,'readonly',work));
    await hostFor(sender,host);
    return result;
  }
  async function loadForCompilation(request,sender) {
    fields(request,['sourceUtf8','entryFormat','importSourceUrl','sourceFormat','lockId']);
    request=clone(request);
    ensure(Object.hasOwn(STATIC_ESM_WORLDS,request.sourceFormat),'E_SOURCE_FORMAT','编译读取需要明确 ESM sourceFormat');
    const host=await hostFor(sender);
    const {parsed}=manifestFor(request);
    const origins=[...new Set(parsed.requires.map(row=>permissionFor(new URL(row.url))))];
    const checkPermissions=async()=>{
      for(const origin of origins) ensure(await api.permissions?.contains?.({origins:[origin]}),
        'E_DEPENDENCY_PERMISSION','ESM 来源权限已撤销，请明确重新授权后再读取');
    };
    await checkPermissions();
    const result=await loadInNamespace(request,host.namespace,work=>inTransaction(host,'readonly',work),true);
    await checkPermissions();
    await hostFor(sender,host);
    // Locks retain every original declaration. A module executes once in ESM;
    // the offline linker receives one verified entry per canonical URL.
    const entries=[];
    for(const entry of result.entries) {
      const previous=entries.find(row=>row.url===entry.url);
      if(previous) ensure(previous.sha256===entry.sha256,'E_DEPENDENCY_LOCK','同一 ESM URL 不能选择不同模块字节');
      else entries.push({...entry,order:entries.length});
    }
    return {...result,entries};
  }
  async function loadInNamespace(request,namespace,read,compilation=false) {
    await validateFixedResource(request.sourceUtf8);
    const {parsed,manifest,entryFormat}=manifestFor(request),manifestDigest=await hashObject(manifest);
    ensure(compilation || manifest.sourceFormat===undefined,'E_SOURCE_FORMAT','ESM 不能走 classic 执行入口');
    assertUserScriptExecutable(parsed,{entryFormat,phase:'preview',dependenciesLocked:true});
    if(!parsed.requires.length){
      ensure(compilation ? request.lockId===undefined || request.lockId===null : !request.lockId,
        'E_DEPENDENCY_LOCK','无依赖源码不能冒用其他依赖锁');
      return {lockId:null,manifestDigest,entries:[],world:manifest.world,...(compilation?{sourceFormat:manifest.sourceFormat}:{})};
    }
    ensure(typeof request.lockId==='string' && /^dep-lock-[a-f0-9]{64}$/.test(request.lockId),'E_DEPENDENCY_UNLOCKED','请先下载、审核并锁定依赖');
    const result=await read(async tx=>{
      const lock=await verifiedLock(await tx.get(DEPENDENCY_STORE,key.lock(namespace,request.lockId)),namespace,request.lockId);
      ensure(compilation || lock.manifest.sourceFormat===undefined,'E_SOURCE_FORMAT','ESM 锁不能作为 classic 依赖执行');
      ensure(lock.manifestDigest===manifestDigest && same(lock.manifest,manifest) && lock.entries.length===parsed.requires.length,
        'E_DEPENDENCY_LOCK_STALE','依赖声明、来源身份或入口模式已改变，请建立新的依赖锁');
      const entries=[];let total=0;
      for(const [order,entry] of lock.entries.entries()){
        ensure(entry.order===order && entry.url===parsed.requires[order].url,'E_DEPENDENCY_LOCK');
        const {asset,code}=await verifiedAsset(await tx.get(DEPENDENCY_STORE,key.asset(entry.sha256)),entry.sha256,entry.byteLength);
        total+=asset.byteLength;ensure(total<=DEPENDENCY_LIMITS.totalBytes,'E_DEPENDENCY_LIMIT');
        await verifyIntegrity(asset.bytes,parsed.requires[order]);entries.push({...clone(entry),code});
        if(compilation) {
          ensure(asset.byteLength<=STATIC_ESM_LIMITS.moduleBytes,'E_DEPENDENCY_LIMIT','ESM 模块最多 128 KiB');
          staticESMUrl(entry.url); assertStaticESMLeaf(code);
        }
      }
      return {lockId:lock.lockId,manifestDigest,entries,world:manifest.world,...(compilation?{sourceFormat:manifest.sourceFormat}:{})};
    });
    return result; // Deliberately no network, evaluation or Chrome injection here.
  }
  // Page Candidate is a frozen record, never a verified/installed grant.
  // Native settings and legacy metadata converge here, behind the same Host gate.
  const pageKey=(ns,id,revision)=>'page-candidate:'+canonical([ns,id,revision]);
  const pageView=row=>({candidateId:row.candidateId,manifestHash:row.manifestHash,stage:'Candidate'});
  async function pageRow(row,ns) {
    ensure(row?.tag==='page-candidate-v1' && row.namespace===ns && row.stage==='Candidate' &&
      row.verification===null && typeof row.sourceUtf8==='string','E_PAGE_CANDIDATE');
    ensure(row.manifestHash===await hashObject(row.manifest) &&
      row.manifest.sourceHash===await hashBytes(encoder.encode(row.sourceUtf8)),'E_HASH');
    await validateFixedResource(row.sourceUtf8);
    validatePageProgramManifest(row.manifest);
    if(row.manifest.compilation){
      ensure(typeof row.authorSourceUtf8==='string'&&row.manifest.compilation.authorSourceHash===
        await hashBytes(encoder.encode(row.authorSourceUtf8)),'E_SOURCE_HASH','作者 import 源码偏离冻结版本');
    }else ensure(!Object.hasOwn(row,'authorSourceUtf8'),'E_STATIC_ESM_IDENTITY');
    return row;
  }
  async function importPageCandidate(request,sender) {
    fields(request,['programId','revision','sourceUtf8','entryFormat','importSourceUrl','lockId','pageRules',
      'authorSourceUtf8','authorLockId','compilerVersion','dependencyScope']);
    // Freeze both bytes and settings before the first asynchronous operation.
    // Neither mutating a request later nor a native pageRules field grants a service.
    request=clone(request);
    const dependencyEpoch=permissionRemovalEpoch;
    ensure(typeof request.programId==='string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(request.programId) &&
      Number.isSafeInteger(request.revision) && request.revision>0,'E_REVISION');
    ensure(request.dependencyScope===undefined||request.dependencyScope==='program',
      'E_DEPENDENCY_PROGRAM','页面程序依赖身份不合法');
    ensure(typeof request.sourceUtf8==='string' && request.sourceUtf8.trim().length>0,'E_SOURCE','页面程序源码不能为空');
    const {parsed,entryFormat}=manifestFor(request);
    const admission=assertUserScriptExecutable(parsed,{entryFormat,phase:'preview',dependenciesLocked:true});
    let pageRules=resolvePageProgramRules(parsed,admission,request.pageRules),authorRequest;
    const lock=await loadForExecution({sourceUtf8:request.sourceUtf8,entryFormat,
      importSourceUrl:request.importSourceUrl,lockId:request.lockId,
      ...(request.dependencyScope==='program'?{programId:request.programId}:{})},sender);
    let compilation;
    const checkPermissionEpoch=()=>ensure(!compilation||permissionRemovalEpoch===dependencyEpoch,
      'E_DEPENDENCY_PERMISSION','依赖来源权限在保存期间已变化');
    if(Object.hasOwn(request,'authorSourceUtf8')){
      ensure(entryFormat==='async-main'&&lock.lockId===null&&request.compilerVersion===PAGE_BROWSER_COMPILER.version,
        'E_STATIC_ESM_IDENTITY','需要固定离线编译器和已闭合的 Page 执行产物');
      authorRequest={sourceUtf8:request.authorSourceUtf8,entryFormat:'async-main',
        sourceFormat:'esm-page',importSourceUrl:request.importSourceUrl,lockId:request.authorLockId};
      const authorLock=await loadForCompilation(authorRequest,sender);
      const {parsed:authorParsed}=manifestFor(authorRequest);
      pageRules=resolvePageProgramRules(authorParsed,
        assertUserScriptExecutable(authorParsed,{entryFormat:'async-main',phase:'preview',dependenciesLocked:true}),request.pageRules);
      compilation={sourceFormat:'esm-page',authorSourceHash:await hashBytes(encoder.encode(request.authorSourceUtf8)),
        dependencyLockId:authorLock.lockId,dependencyManifestDigest:authorLock.manifestDigest,
        compilerVersion:PAGE_BROWSER_COMPILER.version,compilerSha256:PAGE_BROWSER_COMPILER.sha256,
        compilerProfile:clone(STATIC_ESM_COMPILER_PROFILE)};
    }else ensure(!Object.hasOwn(request,'authorLockId')&&!Object.hasOwn(request,'compilerVersion'),'E_STATIC_ESM_IDENTITY');
    const manifest={format:'opendesk.page-program.v1',runtimeKind:'page-userscript',
      programId:request.programId,revision:request.revision,
      ...(request.dependencyScope==='program'?{dependencyScope:'program'}:{}),
      sourceHash:await hashBytes(encoder.encode(request.sourceUtf8)),entryFormat,
      sourceProfile:{metadataProfile:parsed.profile,importSourceUrl:parsed.importSourceUrl},
      dependencyLockId:lock.lockId,dependencyManifestDigest:lock.manifestDigest,pageRules,
      ...(compilation?{compilation}:{})};
    validatePageProgramManifest(manifest);
    const environment=builtinIdentity(await loadBuiltin({runtime:api.runtime,fetchImpl}));
    const manifestHash=await hashObject(manifest),host=await hostFor(sender);
    const saved=await inTransaction(host,'readwrite',async tx=>{
      // Save against the same transaction snapshot that owns the immutable
      // candidate; a cache/approval change after preparation cannot be saved.
      if(authorRequest){
        const fixed=await loadInNamespace(authorRequest,host.namespace,work=>work(tx),true);
        ensure(fixed.lockId===compilation.dependencyLockId&&fixed.manifestDigest===compilation.dependencyManifestDigest,
          'E_DEPENDENCY_LOCK_STALE');
        const {parsed:authorParsed}=manifestFor(authorRequest);
        for(const origin of new Set(authorParsed.requires.map(r=>permissionFor(new URL(r.url)))))
          ensure(await api.permissions?.contains?.({origins:[origin]}),'E_DEPENDENCY_PERMISSION','依赖来源权限在保存期间已撤销');
      }
      const key=pageKey(host.namespace,manifest.programId,manifest.revision),old=await tx.get(DEPENDENCY_STORE,key);
      if(old) {
        await pageRow(old,host.namespace);
        ensure(old.manifestHash===manifestHash && old.sourceUtf8===request.sourceUtf8,'E_REQUEST_CONFLICT');
        assertBuiltinIdentity(old.builtinIdentity,environment);
        checkPermissionEpoch();
        return pageView(old);
      }
      const row={tag:'page-candidate-v1',namespace:host.namespace,
        candidateId:'page-'+await hashObject([host.namespace,manifestHash,environment]),builtinIdentity:environment,
        manifestHash,manifest,sourceUtf8:request.sourceUtf8,
        ...(compilation?{authorSourceUtf8:request.authorSourceUtf8}:{}),
        stage:'Candidate',verification:null,createdAt:timestamp()};
      checkPermissionEpoch();
      await tx.put(DEPENDENCY_STORE,row,key);
      checkPermissionEpoch();
      return pageView(row);
    });
    checkPermissionEpoch();
    return saved;
  }
  async function getPageCandidate(request,sender) {
    fields(request,['programId','revision']);
    const host=await hostFor(sender);
    const {candidate:row}=await readStoredPageCandidate(host.namespace,request.programId,request.revision);
    await hostFor(sender,host);
    return {...pageView(row),manifest:clone(row.manifest),sourceUtf8:row.sourceUtf8,builtinIdentity:row.builtinIdentity,
      ...(row.manifest.compilation?{authorSourceUtf8:row.authorSourceUtf8}:{})};
  }
  // Internal broker-only reader for a persisted installation. It provides
  // immutable bytes, never a grant; the installation authority is separate.
  // No foundation/UI route exposes arbitrary namespace access.
  async function readStoredPageCandidate(namespace,programId,revision,transaction) {
    ensure(typeof namespace==='string'&&namespace.length>0,'E_OWNER');
    const read=transaction?work=>work(transaction):work=>storage.transaction([DEPENDENCY_STORE],'readonly',work);
    const row=await read(async tx=>clone(await pageRow(await tx.get(DEPENDENCY_STORE,pageKey(namespace,programId,revision)),namespace)));
    if(row.manifest.compilation){
      const c=row.manifest.compilation,request={sourceUtf8:row.authorSourceUtf8,entryFormat:'async-main',
        sourceFormat:c.sourceFormat,importSourceUrl:row.manifest.sourceProfile.importSourceUrl,lockId:c.dependencyLockId};
      const {parsed}=manifestFor(request);
      const check=async()=>{for(const origin of new Set(parsed.requires.map(r=>permissionFor(new URL(r.url)))))
        ensure(await api.permissions?.contains?.({origins:[origin]}),'E_DEPENDENCY_PERMISSION','ESM 来源权限已撤销，请明确重新授权后再读取');};
      await check();
      const authorResolution=await loadInNamespace(request,namespace,read,true);
      ensure(authorResolution.manifestDigest===c.dependencyManifestDigest&&authorResolution.lockId===c.dependencyLockId,
        'E_DEPENDENCY_LOCK_STALE','作者源码与批准的固定依赖身份不一致');
      await check();
    }
    const resolution=await loadInNamespace({sourceUtf8:row.sourceUtf8,entryFormat:row.manifest.entryFormat,
      importSourceUrl:row.manifest.sourceProfile.importSourceUrl,lockId:row.manifest.dependencyLockId},
      row.manifest.dependencyScope==='program'?programNamespace(namespace,programId):namespace,read);
    return {candidate:row,resolution};
  }
  // R7.3: Classic bytes use the ONE existing manager, SHA asset store and
  // authenticated Host. Only the already-audited opaque Controller Worker runs
  // the assembled source. Never eval/importScripts here or in the service worker.
  const controllerClassicKey=(ns,programId,sourceHash)=>
    'controller-classic-lock:v1:'+canonical([ns,programId,sourceHash]);
  function assembleControllerClassic(author,lock,codes,downloadCount){
    const prefix='/* opendesk.controller-classic-runtime.v1 lock='+lock.lockId+
      ' author='+lock.authorSourceHash+' */\n';
    const raw=codes.map(code=>';(function(){\n'+code+'\n}).call(globalThis);\n').join('\n');
    const sourceUtf8=prefix+raw+'\n'+author;
    ensure(encoder.encode(sourceUtf8).byteLength<=48000,'E_CONTROLLER_CLASSIC_LIMIT',
      'Controller Classic executable source exceeds 48 KB; use a smaller UMD build or local project');
    return {world:'CONTROLLER',programId:lock.programId,authorSourceHash:lock.authorSourceHash,
      lockId:lock.lockId,sourceUtf8,entries:clone(lock.entries),downloadCount};
  }
  async function prepareControllerClassic(request,sender){
    fields(request,['programId','sourceUtf8','explicitUserAction','allowDownload']);
    ensure(request.explicitUserAction===true,'E_GESTURE','Only an explicit Run or Save may prepare Controller Classic');
    ensure(typeof request.programId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(request.programId),
      'E_DEPENDENCY_PROGRAM','Controller Classic requires a program ID');
    const requires=parseControllerClassicDependencies(request.sourceUtf8);
    ensure(requires.length>0,'E_DEPENDENCY_EMPTY','Controller source has no standard @require declaration');
    ensure(!/^\s*(?:import\s+(?!\()|export\s+)/m.test(request.sourceUtf8),
      'E_CONTROLLER_CLASSIC_FORMAT','Use the ESM compiler for import/export sources');
    const host=await hostFor(sender),ns=host.namespace+'|controller-program:'+JSON.stringify(request.programId),
      sourceHash=await hashBytes(encoder.encode(request.sourceUtf8)),
      storageKey=controllerClassicKey(ns,request.programId,sourceHash);
    const readExisting=async tx=>{
      const lock=await tx.get(DEPENDENCY_STORE,storageKey);
      if(!lock)return null;
      ensure(lock.tag==='controller-classic-lock-v1'&&lock.world==='CONTROLLER'&&
        lock.namespace===ns&&lock.programId===request.programId&&
        lock.authorSourceHash===sourceHash&&lock.entries?.length===requires.length,
        'E_CONTROLLER_CLASSIC_LOCK','Controller program identity or lock corrupted');
      const core={namespace:ns,programId:request.programId,world:'CONTROLLER',
        authorSourceHash:sourceHash,entries:lock.entries};
      ensure(lock.lockId==='controller-classic-'+await hashObject(core),'E_CONTROLLER_CLASSIC_LOCK');
      let total=0;const codes=[];
      for(const [i,entry] of lock.entries.entries()){
        ensure(entry.order===i&&entry.url===requires[i].url&&
          (!requires[i].sha256||requires[i].sha256===entry.sha256),
          'E_CONTROLLER_CLASSIC_LOCK','Controller frozen dependency graph mismatch');
        const {asset,code}=await verifiedAsset(await tx.get(DEPENDENCY_STORE,key.asset(entry.sha256)),
          entry.sha256,entry.byteLength);
        total+=asset.byteLength;ensure(total<=45000,'E_CONTROLLER_CLASSIC_LIMIT');
        codes.push(code);
      }
      return assembleControllerClassic(request.sourceUtf8,lock,codes,0);
    };
    const existing=await inTransaction(host,'readonly',readExisting);
    if(existing){await hostFor(sender,host);return existing;}
    ensure(request.allowDownload===true,'E_CONTROLLER_CLASSIC_RUN_REQUIRED',
      'Run the Controller once to pin and verify its Classic dependencies before saving');
    let total=0,downloadCount=0;
    const entries=[],codes=[],newAssets=new Map();
    for(const row of requires){
      let choice=await inTransaction(host,'readonly',tx=>sharedChoices(tx,row.url));
      if(row.sha256)choice=choice.filter(v=>v.sha256===row.sha256);
      ensure(choice.length<=1,'E_DEPENDENCY_LOCK_AMBIGUOUS',
        'Multiple cached SHAs for this URL; declare an explicit sha256 pin');
      let obtained;
      if(choice.length){
        obtained=await inTransaction(host,'readonly',async tx=>{
          const {asset,code}=await verifiedAsset(await tx.get(DEPENDENCY_STORE,key.asset(choice[0].sha256)),
            choice[0].sha256,choice[0].byteLength);
          return {bytes:asset.bytes,code,sha256:choice[0].sha256,mime:choice[0].mime,
            acquisition:'shared-content-cache'};
        });
      }else{
        obtained=await httpsAsset({url:row.url,integrity:row.sha256?
          [{algorithm:'sha256',digestHex:row.sha256}]:[]},45000-total);
        obtained.code=decodeCode(obtained.bytes);
        obtained.sha256=await hashBytes(obtained.bytes);
        obtained.acquisition='download';downloadCount++;
      }
      total+=obtained.bytes.byteLength;
      ensure(total<=45000,'E_CONTROLLER_CLASSIC_LIMIT','Classic Worker byte budget exceeded');
      ensure(!row.sha256||row.sha256===obtained.sha256,'E_DEPENDENCY_INTEGRITY');
      const meta=sourceSummary(row.url);
      entries.push({order:row.order,url:row.url,originalUrl:row.url,sourceKind:'https',
        resolvedUrl:row.url,acquisition:obtained.acquisition,sha256:obtained.sha256,
        byteLength:obtained.bytes.byteLength,world:'CONTROLLER',mime:obtained.mime,
        license:unknownLicense(),name:meta.name,version:meta.version});
      codes.push(obtained.code);
      newAssets.set(obtained.sha256,{tag:'userscript-asset-v1',sha256:obtained.sha256,
        bytes:obtained.bytes,byteLength:obtained.bytes.byteLength,integrityStatus:'verified',
        createdAt:timestamp()});
    }
    const core={namespace:ns,programId:request.programId,world:'CONTROLLER',
      authorSourceHash:sourceHash,entries};
    const lock={tag:'controller-classic-lock-v1',...core,
      lockId:'controller-classic-'+await hashObject(core),createdAt:timestamp()};
    const result=assembleControllerClassic(request.sourceUtf8,lock,codes,downloadCount);
    await hostFor(sender,host);
    const committed=await inTransaction(host,'readwrite',async tx=>{
      const prior=await readExisting(tx);
      if(prior)return prior; // A concurrent Run already fixed this exact Program.
      for(const [sha,asset] of newAssets){
        const old=await tx.get(DEPENDENCY_STORE,key.asset(sha));
        if(old)await verifiedAsset(old,sha,asset.byteLength);
        else await tx.put(DEPENDENCY_STORE,asset,key.asset(sha));
      }
      await tx.put(DEPENDENCY_STORE,lock,storageKey);
      await tx.put(DEPENDENCY_STORE,{tag:'userscript-reference-v1',namespace:ns,
        ownerType:'controller-classic-lock',ownerId:lock.lockId,
        assetHashes:[...new Set(entries.map(e=>e.sha256))]},
        key.reference(ns,'controller-classic-lock',lock.lockId));
      for(const entry of entries.filter(e=>e.acquisition==='download')){
        const sharedKey=key.sharedSource(entry.url),old=await tx.get(DEPENDENCY_STORE,sharedKey);
        if(old)await sharedChoices(tx,entry.url);
        const choice={sha256:entry.sha256,byteLength:entry.byteLength,sourceKind:'https',
          resolvedUrl:entry.url,mime:entry.mime,license:unknownLicense(),approvedAt:lock.createdAt};
        await tx.put(DEPENDENCY_STORE,{tag:'userscript-shared-source-index-v1',url:entry.url,
          choices:[choice,...(old?.choices||[]).filter(e=>e.sha256!==entry.sha256)].slice(0,16)},sharedKey);
      }
      return result;
    });
    await hostFor(sender,host);
    return committed;
  }
  // References are durable and no automatic GC runs. A future collector must
  // trace revisions, installations and historical runs in addition to these
  // review/lock references; deleting an editor draft cannot delete asset bytes.
  const components=createPageComponentDependencyMethods({hostFor,inTransaction,httpsAsset,verifiedAsset,
    timestamp,hashObject,hashBytes,ensure,fields,clone,assetKey:key.asset,referenceKey:key.reference,risk});
return Object.freeze({inspect,prepare,readReview,approve,loadForExecution,loadForCompilation,prepareControllerClassic,importPageCandidate,getPageCandidate,readStoredPageCandidate,...components});
}
