const DEPENDENCY_STORE="frameworkKV";
import {parseUserScriptDependencies, assessUserScriptExecution, assertUserScriptExecutable} from './dependency-metadata.js';
import {loadPackagedJquery,JQUERY_371} from './packaged-dependencies.js';
import {loadBuiltinPageSource} from '../../runtime/builtin-libraries/loader.js';
import {builtinIdentity,assertBuiltinIdentity} from '../../runtime/builtin-libraries/identity.js';
import {resolvePageProgramRules} from './page-program-rules.js';

// Assets contain bytes only. Source identity and approval belong to namespace
// scoped reviews/locks; sharing a hash never shares an authorization.
export const DEPENDENCY_LIMITS = Object.freeze({assetBytes:1024*1024, totalBytes:4*1024*1024, timeoutMs:20000});
export const DEPENDENCY_LOCK_VERSION = 1;
export const DEPENDENCY_STORAGE_KEYS = Object.freeze({
  asset:hash=>`userscript-asset:v1:sha256:${hash}`,
  review:(ns,id)=>`userscript-review:v1:${JSON.stringify([ns,id])}`,
  lock:(ns,id)=>`userscript-lock:v1:${JSON.stringify([ns,id])}`,
  source:(ns,url)=>`userscript-source:v1:${JSON.stringify([ns,url])}`,
  manifest:(ns,hash)=>`userscript-manifest:v1:${JSON.stringify([ns,hash])}`,
  reference:(ns,kind,id)=>`userscript-reference:v1:${JSON.stringify([ns,kind,id])}`
});
const key = DEPENDENCY_STORAGE_KEYS, encoder = new TextEncoder(), HEX64 = /^[a-f0-9]{64}$/;
const strong = new Map([['sha256','SHA-256'],['sha384','SHA-384'],['sha512','SHA-512']]);
const mimeTypes = new Set(['application/javascript','text/javascript','application/x-javascript','application/ecmascript','text/ecmascript','text/plain']);
const risk = '第三方 JavaScript 可以读取或修改已授权网页的 DOM，也可能通过网页允许的网络渠道对外发送网页数据。USER_SCRIPT 隔离不是网络沙箱，也不提供 GM 或扩展宿主权限。';
const unknownLicense = () => ({status:'unknown',name:null,source:null});
const fail = (code,message) => { throw Object.assign(new Error(message || code),{code}); };
const ensure = (yes,code,message) => { if (!yes) fail(code,message); };
const clone = value => structuredClone(value);
const canonical = value => JSON.stringify(value,(_k,v)=>v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
const same = (a,b) => canonical(a)===canonical(b);
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
  ensure(typeof request.sourceUtf8==='string' && encoder.encode(request.sourceUtf8).byteLength<=128*1024,'E_SOURCE','页面脚本最大 128 KiB');
  const entryFormat=request.entryFormat===undefined ? 'async-main' : request.entryFormat;
  ensure(['classic-userscript','async-main'].includes(entryFormat),'E_ENTRY_FORMAT','页面入口必须明确为 classic-userscript 或 async-main');
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
  return {...profile,manifestDigest:await hashObject(profile.manifest)};
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
  ensure(row?.tag==='userscript-lock-v1' && row.status==='locked' && row.approvalStatus==='approved' &&
    row.namespace===namespace && row.lockId===id && row.lockVersion===1 && row.world==='USER_SCRIPT' &&
    Array.isArray(row.entries) && row.entries.every((e,i)=>e.order===i && e.world==='USER_SCRIPT' && HEX64.test(e.sha256)),
  'E_DEPENDENCY_LOCK','依赖锁不存在、未批准或不属于当前身份');
  ensure(row.manifestDigest===await hashObject(row.manifest) && id===`dep-lock-${await hashObject(lockCore(row))}`,
    'E_DEPENDENCY_LOCK','不可变依赖锁校验失败');
  return row;
}
const publicLock = row => clone({lockId:row.lockId,lockVersion:row.lockVersion,manifestDigest:row.manifestDigest,
  status:row.status,approvalStatus:row.approvalStatus,world:row.world,approvedAt:row.approvedAt,entries:row.entries});

export function createDependencyManager({api,storage,assertHost,fetchImpl=globalThis.fetch,clock={now:()=>Date.now()},loadBuiltin=loadBuiltinPageSource}) {
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
  async function cachedChoices(tx,namespace,row) {
    if (!row.url) return [];
    const index=await tx.get(DEPENDENCY_STORE,key.source(namespace,row.url)), choices=[];
    for (const ref of index?.choices || []) {
      const lock=await verifiedLock(await tx.get(DEPENDENCY_STORE,key.lock(namespace,ref.lockId)),namespace,ref.lockId);
      const entry=lock.entries[ref.order];
      ensure(entry?.url===row.url,'E_DEPENDENCY_LOCK');
      if (!choices.some(c=>c.sha256===entry.sha256)) choices.push({...clone(entry),lockId:lock.lockId,status:'approved-cache'});
    }
    return choices;
  }
  async function inspect(request,sender) {
    fields(request,['sourceUtf8','entryFormat','importSourceUrl']);
    const host=await hostFor(sender),{parsed,manifest,entryFormat}=manifestFor(request),manifestDigest=await hashObject(manifest);
    const result=await inTransaction(host,'readonly',async tx=>{
      const requires=[];
      for (const row of parsed.requires) {
        let descriptor=null,downloadError=null;
        try { if(row.url) descriptor=packagedDescriptor(row.url); } catch(error) { downloadError={code:error.code,message:error.message}; }
        const cacheChoices=await cachedChoices(tx,host.namespace,row);
        requires.push({...clone(row),...(row.url ? sourceSummary(row.url) : {}),sourceKind:descriptor?'packaged':'https',
          status:downloadError?'unsupported':cacheChoices.length?'approved-cache':'needs-review',
          cacheChoices,downloadError,risk,license:descriptor?{status:'known',name:descriptor.license,source:'extension-package'}:unknownLicense()});
      }
      const index=await tx.get(DEPENDENCY_STORE,key.manifest(host.namespace,manifestDigest)),locks=[];
      for (const id of (index?.lockIds || []).slice(0,20)) locks.push(publicLock(await verifiedLock(await tx.get(DEPENDENCY_STORE,key.lock(host.namespace,id)),host.namespace,id)));
      return {manifestDigest,requires,locks,admission:assessUserScriptExecution(parsed,{entryFormat,phase:'preview',dependenciesLocked:locks.length>0})};
    });
    result.permissionOrigins=[];
    for (const row of result.requires.filter(r=>r.url && r.sourceKind==='https' && !r.downloadError)) {
      const pattern=permissionFor(dependencyUrl(row.url));
      if (!result.permissionOrigins.includes(pattern) && !await api.permissions?.contains?.({origins:[pattern]})) result.permissionOrigins.push(pattern);
    }
    await hostFor(sender,host);
    return result;
  }
  async function httpsAsset(row,remaining) {
    const url=dependencyUrl(row.url),origin=permissionFor(url);
    ensure(await api.permissions?.contains?.({origins:[origin]}),'E_DEPENDENCY_PERMISSION','请先明确授权下载来源：'+url.origin);
    ensure(typeof fetchImpl==='function','E_RESOURCE_UNAVAILABLE');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),DEPENDENCY_LIMITS.timeoutMs);
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
      fail(controller.signal.aborted?'E_DEPENDENCY_TIMEOUT':'E_DEPENDENCY_FETCH',controller.signal.aborted?'依赖下载超过 20 秒':'依赖下载失败；重定向、网络错误或浏览器阻止均不会被绕过');
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
    fields(request,['sourceUtf8','entryFormat','importSourceUrl','explicitUserAction','selections']);
    ensure(request.explicitUserAction===true,'E_DEPENDENCY_REVIEW','下载依赖需要用户明确操作');
    const host=await hostFor(sender),{parsed,manifest,entryFormat}=manifestFor(request);
    assertUserScriptExecutable(parsed,{entryFormat,phase:'preview',dependenciesLocked:true});
    ensure(parsed.requires.length>0,'E_DEPENDENCY_EMPTY','源码没有 @require');
    const selections=request.selections || [];ensure(Array.isArray(selections)&&selections.length<=parsed.requires.length,'E_SCHEMA');
    const selected=new Map();
    for(const choice of selections){
      fields(choice,['order','assetSha256','localFile']);
      ensure(Number.isSafeInteger(choice.order)&&choice.order>=0&&choice.order<parsed.requires.length&&!selected.has(choice.order) &&
        !(choice.assetSha256 && choice.localFile) && (choice.assetSha256===undefined || HEX64.test(choice.assetSha256)),'E_SCHEMA');
      selected.set(choice.order,choice);
    }
    const assets=new Map(),entries=[],retrieved=new Map();let totalBytes=0;
    for(const row of parsed.requires){
      dependencyUrl(row.url);
      const choice=selected.get(row.order);let obtained;
      if(choice?.assetSha256){
        obtained=await inTransaction(host,'readonly',async tx=>{
          const match=(await cachedChoices(tx,host.namespace,row)).find(e=>e.sha256===choice.assetSha256);
          ensure(match,'E_DEPENDENCY_REVIEW','当前身份尚未批准该声明来源的所选缓存');
          const {asset}=await verifiedAsset(await tx.get(DEPENDENCY_STORE,key.asset(match.sha256)),match.sha256,match.byteLength);
          return {...match,bytes:asset.bytes,acquisition:'approved-cache',reusedFrom:{lockId:match.lockId}};
        });
      } else if(choice?.localFile) obtained=await localAsset(choice.localFile);
      else if(retrieved.has(row.url)) obtained=retrieved.get(row.url);
      else {
        const descriptor=packagedDescriptor(row.url);
        if(descriptor){
          const loaded=await loadPackagedJquery({runtime:api.runtime,fetchImpl});
          obtained={bytes:encoder.encode(loaded.code).buffer,sourceKind:'packaged',resolvedUrl:api.runtime.getURL(descriptor.path),
            acquisition:'extension-package',mime:'text/javascript',license:{status:'known',name:descriptor.license,source:'extension-package'},
            integrityRepresentation:'packaged-utf8-bytes',name:descriptor.id,version:descriptor.version};
        } else obtained=await httpsAsset(row,DEPENDENCY_LIMITS.totalBytes-totalBytes);
        retrieved.set(row.url,obtained);
      }
      ensure(obtained.bytes.byteLength>0&&obtained.bytes.byteLength<=DEPENDENCY_LIMITS.assetBytes,'E_DEPENDENCY_LIMIT');
      totalBytes+=obtained.bytes.byteLength;ensure(totalBytes<=DEPENDENCY_LIMITS.totalBytes,'E_DEPENDENCY_LIMIT','整组依赖最多 4 MiB，重复声明也计入执行预算');
      const integrityResult=await verifyIntegrity(obtained.bytes,row),sha256=await hashBytes(obtained.bytes);decodeCode(obtained.bytes);
      assets.set(sha256,{tag:'userscript-asset-v1',sha256,bytes:obtained.bytes,byteLength:obtained.bytes.byteLength,integrityStatus:'verified',createdAt:timestamp()});
      entries.push({order:row.order,raw:row.raw || row.originalUrl || row.url,originalUrl:row.originalUrl || row.url,url:row.url,
        ...sourceSummary(row.url),...(obtained.name?{name:obtained.name,version:obtained.version}:{}),sourceKind:obtained.sourceKind,
        resolvedUrl:obtained.resolvedUrl,acquisition:obtained.acquisition,reusedFrom:obtained.reusedFrom || null,
        sha256,byteLength:obtained.bytes.byteLength,world:'USER_SCRIPT',integrity:clone(row.integrity || []),integrityResult,
        integrityRepresentation:obtained.integrityRepresentation,license:obtained.license,mime:obtained.mime,risk});
    }
    const reviewId=`dep-review-${crypto.randomUUID()}`,manifestDigest=await hashObject(manifest);
    const review={tag:'userscript-review-v1',reviewId,namespace:host.namespace,status:'pending-review',approvalStatus:'pending',
      manifest,manifestDigest,entries,totalBytes,createdAt:timestamp()};
    review.reviewDigest=await hashObject(reviewCore(review));
    await hostFor(sender,host);
    await inTransaction(host,'readwrite',async tx=>{
      for(const [sha256,asset] of assets){
        const existing=await tx.get(DEPENDENCY_STORE,key.asset(sha256));
        if(existing) await verifiedAsset(existing,sha256,asset.byteLength);
        else await tx.put(DEPENDENCY_STORE,asset,key.asset(sha256));
      }
      await tx.put(DEPENDENCY_STORE,review,key.review(host.namespace,reviewId));
      await tx.put(DEPENDENCY_STORE,{tag:'userscript-reference-v1',namespace:host.namespace,ownerType:'review',ownerId:reviewId,
        assetHashes:[...assets.keys()]},key.reference(host.namespace,'review',reviewId));
    });
    return clone({reviewId,manifestDigest,status:review.status,approvalStatus:review.approvalStatus,entries,totalBytes});
  }
  async function approve(request,sender) {
    fields(request,['reviewId','explicitUserAction','acceptedHashes']);
    ensure(request.explicitUserAction===true && /^dep-review-[a-f0-9-]{36}$/.test(request.reviewId),'E_DEPENDENCY_REVIEW','请明确审核下载后的来源、内容哈希和风险');
    ensure(Array.isArray(request.acceptedHashes)&&request.acceptedHashes.every(h=>HEX64.test(h)),'E_DEPENDENCY_REVIEW');
    const host=await hostFor(sender);
    const reviewed=await inTransaction(host,'readonly',async tx=>{
      const review=await tx.get(DEPENDENCY_STORE,key.review(host.namespace,request.reviewId));
      ensure(review?.tag==='userscript-review-v1' && review.namespace===host.namespace && review.reviewId===request.reviewId && Array.isArray(review.entries) &&
        same(request.acceptedHashes,review.entries.map(e=>e.sha256)) && review.manifestDigest===await hashObject(review.manifest) &&
        review.reviewDigest===await hashObject(reviewCore(review)),
      'E_DEPENDENCY_REVIEW','审核记录或明确接受的哈希不匹配');
      for(const entry of review.entries){
        const {asset}=await verifiedAsset(await tx.get(DEPENDENCY_STORE,key.asset(entry.sha256)),entry.sha256,entry.byteLength);
        await verifyIntegrity(asset.bytes,entry);
      }
      return review;
    });
    const core={lockVersion:1,namespace:host.namespace,manifestDigest:reviewed.manifestDigest,manifest:reviewed.manifest,
      world:'USER_SCRIPT',reviewId:reviewed.reviewId,approvedAt:timestamp(),entries:reviewed.entries};
    const lock={tag:'userscript-lock-v1',...core,lockId:`dep-lock-${await hashObject(core)}`,status:'locked',approvalStatus:'approved'};
    await hostFor(sender,host);
    return inTransaction(host,'readwrite',async tx=>{
      const current=await tx.get(DEPENDENCY_STORE,key.review(host.namespace,request.reviewId));
      if(current?.lockId) {
        const existing=await verifiedLock(await tx.get(DEPENDENCY_STORE,key.lock(host.namespace,current.lockId)),host.namespace,current.lockId);
        ensure(same(reviewCore(current),reviewCore(reviewed)) && existing.reviewId===reviewed.reviewId &&
          existing.manifestDigest===reviewed.manifestDigest && same(existing.manifest,reviewed.manifest) &&
          same(existing.entries,reviewed.entries) && same(existing.entries.map(e=>e.sha256),request.acceptedHashes),
        'E_DEPENDENCY_REVIEW','已有批准锁不属于当前审核或明确接受的资源');
        return publicLock(existing);
      }
      ensure(same(current,reviewed),'E_DEPENDENCY_REVIEW','审核内容在批准前发生变化');
      // Recheck within the same atomic commit: a concurrently corrupted/deleted
      // asset must never receive an approved lock based on an earlier snapshot.
      for(const entry of lock.entries) await verifiedAsset(await tx.get(DEPENDENCY_STORE,key.asset(entry.sha256)),entry.sha256,entry.byteLength);
      await tx.put(DEPENDENCY_STORE,lock,key.lock(host.namespace,lock.lockId));
      await tx.put(DEPENDENCY_STORE,{...current,status:'reviewed',approvalStatus:'approved',lockId:lock.lockId},key.review(host.namespace,request.reviewId));
      const manifestKey=key.manifest(host.namespace,lock.manifestDigest),index=await tx.get(DEPENDENCY_STORE,manifestKey);
      await tx.put(DEPENDENCY_STORE,{tag:'userscript-manifest-index-v1',namespace:host.namespace,manifestDigest:lock.manifestDigest,
        lockIds:[lock.lockId,...(index?.lockIds || [])]},manifestKey);
      for(const url of new Set(lock.entries.map(e=>e.url))){
        const sourceKey=key.source(host.namespace,url),source=await tx.get(DEPENDENCY_STORE,sourceKey),choices=[];
        for(const entry of lock.entries.filter(e=>e.url===url)) if(!choices.some(c=>c.sha256===entry.sha256))
          choices.push({lockId:lock.lockId,order:entry.order,sha256:entry.sha256});
        // A source's picker needs one proof per immutable hash, while old full
        // lock/reference records remain untouched for installed/history users.
        const previous=(source?.choices || []).filter(c=>!choices.some(next=>next.sha256===c.sha256));
        await tx.put(DEPENDENCY_STORE,{tag:'userscript-source-index-v1',namespace:host.namespace,url,choices:[...choices,...previous]},sourceKey);
      }
      await tx.put(DEPENDENCY_STORE,{tag:'userscript-reference-v1',namespace:host.namespace,ownerType:'lock',ownerId:lock.lockId,
        assetHashes:[...new Set(lock.entries.map(e=>e.sha256))]},key.reference(host.namespace,'lock',lock.lockId));
      return publicLock(lock);
    });
  }
  async function loadForExecution(request,sender) {
    fields(request,['sourceUtf8','entryFormat','importSourceUrl','lockId']);
    const host=await hostFor(sender);
    const result=await loadInNamespace(request,host.namespace,work=>inTransaction(host,'readonly',work));
    await hostFor(sender,host);
    return result;
  }
  async function loadInNamespace(request,namespace,read) {
    const {parsed,manifest,entryFormat}=manifestFor(request),manifestDigest=await hashObject(manifest);
    assertUserScriptExecutable(parsed,{entryFormat,phase:'preview',dependenciesLocked:true});
    if(!parsed.requires.length){
      ensure(!request.lockId,'E_DEPENDENCY_LOCK','无依赖源码不能冒用其他依赖锁');
      return {lockId:null,manifestDigest,entries:[],world:'USER_SCRIPT'};
    }
    ensure(typeof request.lockId==='string' && /^dep-lock-[a-f0-9]{64}$/.test(request.lockId),'E_DEPENDENCY_UNLOCKED','请先下载、审核并锁定依赖');
    const result=await read(async tx=>{
      const lock=await verifiedLock(await tx.get(DEPENDENCY_STORE,key.lock(namespace,request.lockId)),namespace,request.lockId);
      ensure(lock.manifestDigest===manifestDigest && same(lock.manifest,manifest) && lock.entries.length===parsed.requires.length,
        'E_DEPENDENCY_LOCK_STALE','依赖声明、来源身份或入口模式已改变，请建立新的依赖锁');
      const entries=[];let total=0;
      for(const [order,entry] of lock.entries.entries()){
        ensure(entry.order===order && entry.url===parsed.requires[order].url,'E_DEPENDENCY_LOCK');
        const {asset,code}=await verifiedAsset(await tx.get(DEPENDENCY_STORE,key.asset(entry.sha256)),entry.sha256,entry.byteLength);
        total+=asset.byteLength;ensure(total<=DEPENDENCY_LIMITS.totalBytes,'E_DEPENDENCY_LIMIT');
        await verifyIntegrity(asset.bytes,parsed.requires[order]);entries.push({...clone(entry),code});
      }
      return {lockId:lock.lockId,manifestDigest,entries,world:'USER_SCRIPT'};
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
    return row;
  }
  async function importPageCandidate(request,sender) {
    fields(request,['programId','revision','sourceUtf8','entryFormat','importSourceUrl','lockId','pageRules']);
    // Freeze both bytes and settings before the first asynchronous operation.
    // Neither mutating a request later nor a native pageRules field grants a service.
    request=clone(request);
    ensure(typeof request.programId==='string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(request.programId) &&
      Number.isSafeInteger(request.revision) && request.revision>0,'E_REVISION');
    ensure(typeof request.sourceUtf8==='string' && request.sourceUtf8.trim().length>0,'E_SOURCE','页面程序源码不能为空');
    const {parsed,entryFormat}=manifestFor(request);
    const admission=assertUserScriptExecutable(parsed,{entryFormat,phase:'preview',dependenciesLocked:true});
    const pageRules=resolvePageProgramRules(parsed,admission,request.pageRules);
    const lock=await loadForExecution({sourceUtf8:request.sourceUtf8,entryFormat,
      importSourceUrl:request.importSourceUrl,lockId:request.lockId},sender);
    const manifest={format:'opendesk.page-program.v1',runtimeKind:'page-userscript',
      programId:request.programId,revision:request.revision,
      sourceHash:await hashBytes(encoder.encode(request.sourceUtf8)),entryFormat,
      sourceProfile:{metadataProfile:parsed.profile,importSourceUrl:parsed.importSourceUrl},
      dependencyLockId:lock.lockId,dependencyManifestDigest:lock.manifestDigest,pageRules};
    const environment=builtinIdentity(await loadBuiltin({runtime:api.runtime,fetchImpl}));
    const manifestHash=await hashObject(manifest),host=await hostFor(sender);
    return inTransaction(host,'readwrite',async tx=>{
      const key=pageKey(host.namespace,manifest.programId,manifest.revision),old=await tx.get(DEPENDENCY_STORE,key);
      if(old) {
        await pageRow(old,host.namespace);
        ensure(old.manifestHash===manifestHash && old.sourceUtf8===request.sourceUtf8,'E_REQUEST_CONFLICT');
        assertBuiltinIdentity(old.builtinIdentity,environment);
        return pageView(old);
      }
      const row={tag:'page-candidate-v1',namespace:host.namespace,
        candidateId:'page-'+await hashObject([host.namespace,manifestHash,environment]),builtinIdentity:environment,
        manifestHash,manifest,sourceUtf8:request.sourceUtf8,stage:'Candidate',verification:null,createdAt:timestamp()};
      await tx.put(DEPENDENCY_STORE,row,key);
      return pageView(row);
    });
  }
  async function getPageCandidate(request,sender) {
    fields(request,['programId','revision']);
    const host=await hostFor(sender);
    return inTransaction(host,'readonly',async tx=>{
      const row=await pageRow(await tx.get(DEPENDENCY_STORE,pageKey(host.namespace,request.programId,request.revision)),host.namespace);
      return {...pageView(row),manifest:clone(row.manifest),sourceUtf8:row.sourceUtf8,builtinIdentity:row.builtinIdentity};
    });
  }
  // Internal broker-only reader for a persisted installation. It provides
  // immutable bytes, never a grant; the installation authority is separate.
  // No foundation/UI route exposes arbitrary namespace access.
  async function readStoredPageCandidate(namespace,programId,revision) {
    ensure(typeof namespace==='string'&&namespace.length>0,'E_OWNER');
    const read=work=>storage.transaction([DEPENDENCY_STORE],'readonly',work);
    const row=await read(async tx=>clone(await pageRow(await tx.get(DEPENDENCY_STORE,pageKey(namespace,programId,revision)),namespace)));
    const resolution=await loadInNamespace({sourceUtf8:row.sourceUtf8,entryFormat:row.manifest.entryFormat,
      importSourceUrl:row.manifest.sourceProfile.importSourceUrl,lockId:row.manifest.dependencyLockId},namespace,read);
    return {candidate:row,resolution};
  }
  // References are durable and no automatic GC runs. A future collector must
  // trace revisions, installations and historical runs in addition to these
  // review/lock references; deleting an editor draft cannot delete asset bytes.
  return Object.freeze({inspect,prepare,approve,loadForExecution,importPageCandidate,getPageCandidate,readStoredPageCandidate});
}
