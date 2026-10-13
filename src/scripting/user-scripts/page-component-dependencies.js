// ESM authoring adapter for the existing dependency manager. Assets, owner
// transactions and the HTTPS transport are shared with classic dependency
// reviews; these records never become @require declarations or runtime grants.
import {remoteURL,validateRemoteLock,REMOTE_LIMITS} from './remote-esm-contract.js';
export const COMPONENT_DEPENDENCY_STORAGE_KEYS=Object.freeze({
  review:(ns,id)=>'component-esm-review:v1:'+JSON.stringify([ns,id]),
  lock:(ns,id)=>'component-esm-lock:v1:'+JSON.stringify([ns,id]),
  manifest:(ns,hash)=>'component-esm-manifest:v1:'+JSON.stringify([ns,hash]),
  source:(ns,url)=>'component-esm-source:v1:'+JSON.stringify([ns,url])
});
const keys=COMPONENT_DEPENDENCY_STORAGE_KEYS,STORE='frameworkKV';
const coreFields=['componentSource','framework','roots','programId'];
export function createPageComponentDependencyMethods({hostFor,inTransaction,httpsAsset,verifiedAsset,
  timestamp,hashObject,hashBytes,ensure,fields,clone,assetKey,referenceKey,risk}){
  const encode=value=>new TextEncoder().encode(value);
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?
    Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
  const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
  async function profile(request){
    const controller=request.framework==='controller';
    ensure(typeof request.componentSource==='string'&&request.componentSource.trim()&&
      encode(request.componentSource).byteLength<=128*1024&&['react','vue','controller'].includes(request.framework),
      'E_PAGE_COMPONENT_IDENTITY','组件来源或框架无效');
    // Controller reviews are tied to the exact program AND author source. A
    // shared byte cache is not an authorization for a different script.
    ensure(controller
      ? typeof request.programId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(request.programId)
      : request.programId===undefined,'E_REMOTE_PROGRAM','Controller needs an explicit script ID; Page locks have no Controller identity');
    ensure(Array.isArray(request.roots)&&request.roots.length>0&&request.roots.length<=REMOTE_LIMITS.modules,
      'E_REMOTE_IMPORT','需要明确的静态 HTTPS 根模块列表');
    const roots=request.roots.map(remoteURL).sort();
    ensure(new Set(roots).size===roots.length&&roots.every(url=>request.roots.includes(url)),'E_REMOTE_URL','模块来源须为无重复的规范 HTTPS URL');
    const sourceHash=await hashBytes(encode(request.componentSource));
    const manifest={format:'opendesk.component-esm.v1',world:controller?'CONTROLLER':'USER_SCRIPT',
      framework:request.framework,roots,...(controller?{programId:request.programId,sourceHash}:{})};
    return {manifest,manifestDigest:await hashObject(manifest),sourceHash};
  }
  const entryPin=entry=>({url:entry.url,sha256:entry.sha256,bytes:entry.bytes});
  const reviewCore=row=>({reviewId:row.reviewId,namespace:row.namespace,manifest:row.manifest,
    manifestDigest:row.manifestDigest,sourceHash:row.sourceHash,entries:row.entries,createdAt:row.createdAt});
  const lockCore=row=>({namespace:row.namespace,manifest:row.manifest,manifestDigest:row.manifestDigest,
    reviewId:row.reviewId,approvedAt:row.approvedAt,remoteLock:row.remoteLock,entries:row.entries,graph:row.graph});
  function lockFor(entries){
    return validateRemoteLock({format:'opendesk.remote-lock.v1',modules:Object.fromEntries(
      [...entries].sort((a,b)=>a.url.localeCompare(b.url)).map(row=>[row.url,{sha256:row.sha256,bytes:row.bytes}]))});
  }
  async function verifyReview(row,host,input){
    ensure(row?.tag==='component-esm-review-v1'&&row.namespace===host.namespace&&
      row.manifestDigest===input.manifestDigest&&row.sourceHash===input.sourceHash&&
      same(row.manifest,input.manifest)&&Array.isArray(row.entries)&&
      row.reviewDigest===await hashObject(reviewCore(row)),'E_REMOTE_REVIEW','组件源码或依赖审阅身份已改变');
    lockFor(row.entries);return row;
  }
  async function verifyLock(row,host,lockId){
    ensure(row?.tag==='component-esm-lock-v1'&&row.namespace===host.namespace&&row.status==='approved'&&
      row.lockId===lockId&&row.manifestDigest===await hashObject(row.manifest)&&
      row.lockId==='component-lock-'+await hashObject(lockCore(row)),
      'E_REMOTE_LOCK','固定组件依赖锁不存在、已损坏或不属于当前工具身份');
    validateRemoteLock(row.remoteLock);
    ensure(same(lockFor(row.entries),row.remoteLock),'E_REMOTE_LOCK','依赖锁条目与固定图不一致');
    return row;
  }
  const publicLock=row=>clone({lockId:row.lockId,manifestDigest:row.manifestDigest,approvedAt:row.approvedAt,
    entries:row.entries,remoteLock:row.remoteLock,status:row.status});
  async function modulesIn(tx,entries){
    const modules=[];
    for(const entry of entries){
      const {code}=await verifiedAsset(await tx.get(STORE,assetKey(entry.sha256)),entry.sha256,entry.bytes);
      modules.push({...entryPin(entry),code});
    }
    return modules;
  }
  // Content-addressed bytes may be shared; only the previous APPROVED lock
  // may index them, and each new Controller program still has to approve its
  // own distinct program/source/world lock before execution.
  async function cachedApproved(tx,host,url){
    const index=await tx.get(STORE,keys.source(host.namespace,url));
    if(!index)return null;
    ensure(index.tag==='component-esm-source-index-v1'&&index.namespace===host.namespace&&index.url===url&&
      Array.isArray(index.choices)&&index.choices.length<=24,'E_REMOTE_CACHE','Malformed approved source index');
    const entries=[];
    for(const item of index.choices){
      const lock=await verifyLock(await tx.get(STORE,keys.lock(host.namespace,item.lockId)),host,item.lockId);
      const entry=lock.entries[item.order];
      ensure(entry?.url===url,'E_REMOTE_CACHE','Source index no longer matches its approved lock');
      if(!entries.some(x=>x.sha256===entry.sha256))entries.push(entry);
    }
    ensure(entries.length<=1,'E_REMOTE_CACHE_CHOICE','Source URL has multiple approved byte versions; choose an immutable versioned URL or use the local builder');
    const entry=entries[0];
    if(!entry)return null;
    const {asset}=await verifiedAsset(await tx.get(STORE,assetKey(entry.sha256)),entry.sha256,entry.bytes);
    return {entry,asset};
  }
  async function inspectComponentDependencies(request,sender){
    fields(request,coreFields);const input=await profile(request),host=await hostFor(sender);
    const {locks,cachedUrls}=await inTransaction(host,'readonly',async tx=>{
      const index=await tx.get(STORE,keys.manifest(host.namespace,input.manifestDigest)),locks=[],cachedUrls=[];
      for(const id of (index?.lockIds||[]).slice(0,20)){
        const row=await verifyLock(await tx.get(STORE,keys.lock(host.namespace,id)),host,id);
        ensure(same(row.manifest,input.manifest),'E_REMOTE_LOCK','来源索引与依赖锁不一致');locks.push(publicLock(row));
      }
      for(const url of input.manifest.roots)if(await cachedApproved(tx,host,url))cachedUrls.push(url);
      return {locks,cachedUrls};
    });
    await hostFor(sender,host);
    return {...input,locks,cachedUrls}; // Read-only: no code acquisition, permission prompt or execution.
  }
  async function prepareComponentDependencies(request,sender){
    fields(request,[...coreFields,'reviewId','reviewDigest','approvedUrls','explicitUserAction']);
    ensure(request.explicitUserAction===true,'E_REMOTE_REVIEW','获取新的 HTTPS 模块需要用户明确确认');
    request=clone(request);const input=await profile(request),host=await hostFor(sender);
    ensure(Array.isArray(request.approvedUrls)&&request.approvedUrls.length>0&&request.approvedUrls.length<=REMOTE_LIMITS.modules,
      'E_REMOTE_REVIEW','请确认本次展示的模块来源');
    const urls=request.approvedUrls.map(remoteURL).sort();
    ensure(new Set(urls).size===urls.length&&urls.every(url=>request.approvedUrls.includes(url)),
      'E_REMOTE_REVIEW','确认来源须是规范且无重复的 URL');
    let previous=null;
    if(request.reviewId){
      previous=await inTransaction(host,'readonly',async tx=>{
        const row=await verifyReview(await tx.get(STORE,keys.review(host.namespace,request.reviewId)),host,input);
        ensure(row.status==='pending'&&row.reviewDigest===request.reviewDigest,'E_REMOTE_REVIEW','依赖审阅已变化或已固定');
        await modulesIn(tx,row.entries);return clone(row);
      });
    }else ensure(urls.every(url=>input.manifest.roots.includes(url)),'E_REMOTE_REVIEW','首次获取须属于已展示的根模块来源');
    const entries=[...(previous?.entries||[])],assets=new Map();let total=entries.reduce((n,row)=>n+row.bytes,0);
    for(const url of urls){
      if(entries.some(row=>row.url===url))continue; // Explicit retry can only reuse these exact pending bytes.
      ensure(entries.length<REMOTE_LIMITS.modules,'E_REMOTE_LIMIT','浏览器模块图最多 32 个模块');
      let acquired;
      // A previously approved identical URL+SHA may reuse its original bytes
      // after the new program confirms the source. This is NOT new-run approval.
      const reused=await inTransaction(host,'readonly',tx=>cachedApproved(tx,host,url));
      if(reused){
        acquired={bytes:reused.asset.bytes,license:reused.entry.license,mime:reused.entry.mime,acquisition:'approved-cache'};
      }else{
        try{acquired=await httpsAsset({url},Math.min(REMOTE_LIMITS.moduleBytes,REMOTE_LIMITS.totalBytes-total));}
        catch(error){if(error.code==='E_DEPENDENCY_LIMIT')ensure(false,'E_REMOTE_LIMIT',
          '浏览器源码准备最多 32 个模块、单个 128 KiB、整图 256 KiB；更大依赖请导入已构建并冻结的 JSON 项目');throw error;}
      }
      const size=acquired.bytes.byteLength;
      ensure(size>0&&size<=REMOTE_LIMITS.moduleBytes&&total+size<=REMOTE_LIMITS.totalBytes,
        'E_REMOTE_LIMIT','浏览器模块上限为单个 128 KiB、整图 256 KiB');
      const sha256=await hashBytes(acquired.bytes);total+=size;
      assets.set(sha256,{tag:'userscript-asset-v1',sha256,bytes:acquired.bytes,byteLength:size,integrityStatus:'verified',createdAt:timestamp()});
      entries.push({url,sha256,bytes:size,license:acquired.license,mime:acquired.mime,risk});
      await hostFor(sender,host);
    }
    entries.sort((a,b)=>a.url.localeCompare(b.url));lockFor(entries);
    const row={tag:'component-esm-review-v1',reviewId:previous?.reviewId||'component-review-'+crypto.randomUUID(),
      namespace:host.namespace,...input,entries,status:'pending',createdAt:previous?.createdAt??timestamp()};
    row.reviewDigest=await hashObject(reviewCore(row));
    await hostFor(sender,host);
    const modules=await inTransaction(host,'readwrite',async tx=>{
      const current=await tx.get(STORE,keys.review(host.namespace,row.reviewId));
      ensure(previous?same(current,previous):!current,'E_REMOTE_REVIEW','来源审阅在获取期间已变化');
      for(const [hash,asset] of assets){
        const existing=await tx.get(STORE,assetKey(hash));
        if(existing)await verifiedAsset(existing,hash,asset.byteLength);else await tx.put(STORE,asset,assetKey(hash));
      }
      await tx.put(STORE,row,keys.review(host.namespace,row.reviewId));
      await tx.put(STORE,{tag:'userscript-reference-v1',namespace:host.namespace,ownerType:'component-review',ownerId:row.reviewId,
        assetHashes:[...new Set(entries.map(entry=>entry.sha256))]},referenceKey(host.namespace,'component-review',row.reviewId));
      return modulesIn(tx,entries);
    });
    return clone({...input,reviewId:row.reviewId,reviewDigest:row.reviewDigest,entries,modules,totalBytes:total});
  }
  function verifiedGraph(graph,entries,roots){
    ensure(Array.isArray(graph)&&graph.length===entries.length,'E_REMOTE_GRAPH','需要完整静态依赖图');
    const urls=new Set(entries.map(row=>row.url)),edges=new Map();
    for(const row of graph){
      fields(row,['url','children']);ensure(urls.has(row.url)&&!edges.has(row.url)&&Array.isArray(row.children)&&
        row.children.every(url=>urls.has(url))&&new Set(row.children).size===row.children.length,
        'E_REMOTE_GRAPH','依赖图缺少模块或包含未准备的引用');
      edges.set(row.url,[...row.children].sort());
    }
    const seen=new Set(),todo=[...roots];
    while(todo.length){const url=todo.pop();if(seen.has(url))continue;ensure(edges.has(url),'E_REMOTE_GRAPH','根模块未准备');seen.add(url);todo.push(...edges.get(url));}
    ensure(seen.size===urls.size,'E_REMOTE_GRAPH','依赖图含未引用的模块');
    return [...edges].sort(([a],[b])=>a.localeCompare(b)).map(([url,children])=>({url,children}));
  }
  async function approveComponentDependencies(request,sender){
    fields(request,[...coreFields,'reviewId','reviewDigest','acceptedModules','graph','explicitUserAction']);
    ensure(request.explicitUserAction===true,'E_REMOTE_REVIEW','固定版本需要用户明确确认完整来源与 SHA-256');
    request=clone(request);const input=await profile(request),host=await hostFor(sender);
    const reviewed=await inTransaction(host,'readonly',async tx=>{
      const row=await verifyReview(await tx.get(STORE,keys.review(host.namespace,request.reviewId)),host,input);
      ensure(row.reviewDigest===request.reviewDigest&&same(request.acceptedModules,row.entries.map(entryPin)),
        'E_REMOTE_REVIEW','明确接受的模块、哈希或审阅版本不一致');
      await modulesIn(tx,row.entries);return row;
    });
    const graph=verifiedGraph(request.graph,reviewed.entries,input.manifest.roots);
    const core={namespace:host.namespace,manifest:input.manifest,manifestDigest:input.manifestDigest,
      reviewId:reviewed.reviewId,approvedAt:timestamp(),remoteLock:lockFor(reviewed.entries),entries:reviewed.entries,graph};
    const lock={tag:'component-esm-lock-v1',...core,lockId:'component-lock-'+await hashObject(core),status:'approved'};
    await hostFor(sender,host);
    return inTransaction(host,'readwrite',async tx=>{
      const current=await verifyReview(await tx.get(STORE,keys.review(host.namespace,request.reviewId)),host,input);
      ensure(current.reviewDigest===request.reviewDigest,'E_REMOTE_REVIEW','确认前依赖审阅已变化');
      await modulesIn(tx,current.entries); // Rehash within the approval transaction.
      if(current.lockId){
        const existing=await verifyLock(await tx.get(STORE,keys.lock(host.namespace,current.lockId)),host,current.lockId);
        ensure(same(existing.graph,graph)&&same(existing.entries.map(entryPin),request.acceptedModules),'E_REMOTE_REVIEW','已固定版本与本次确认不一致');
        return publicLock(existing);
      }
      await tx.put(STORE,lock,keys.lock(host.namespace,lock.lockId));
      await tx.put(STORE,{...current,status:'approved',lockId:lock.lockId},keys.review(host.namespace,current.reviewId));
      const indexKey=keys.manifest(host.namespace,input.manifestDigest),index=await tx.get(STORE,indexKey);
      await tx.put(STORE,{tag:'component-esm-manifest-v1',namespace:host.namespace,manifestDigest:input.manifestDigest,
        lockIds:[lock.lockId,...(index?.lockIds||[])]},indexKey);
      await tx.put(STORE,{tag:'userscript-reference-v1',namespace:host.namespace,ownerType:'component-lock',ownerId:lock.lockId,
        assetHashes:[...new Set(lock.entries.map(entry=>entry.sha256))]},referenceKey(host.namespace,'component-lock',lock.lockId));
      for(let order=0;order<lock.entries.length;order++){
        const url=lock.entries[order].url,k=keys.source(host.namespace,url),prev=await tx.get(STORE,k);
        const older=(prev?.choices||[]).filter(x=>x.lockId!==lock.lockId);
        await tx.put(STORE,{tag:'component-esm-source-index-v1',namespace:host.namespace,url,
          choices:[{lockId:lock.lockId,order},...older].slice(0,24)},k);
      }
      return publicLock(lock);
    });
  }
  async function loadComponentDependencies(request,sender){
    fields(request,[...coreFields,'lockId']);request=clone(request);const input=await profile(request),host=await hostFor(sender);
    const result=await inTransaction(host,'readonly',async tx=>{
      const lock=await verifyLock(await tx.get(STORE,keys.lock(host.namespace,request.lockId)),host,request.lockId);
      ensure(lock.manifestDigest===input.manifestDigest&&same(lock.manifest,input.manifest),
        'E_REMOTE_LOCK_STALE','来源或框架变化；请检查并固定新版本');
      return {...input,lockId:lock.lockId,lock:lock.remoteLock,modules:await modulesIn(tx,lock.entries)};
    });
    await hostFor(sender,host);return clone(result); // Offline and read-only, even after a cache error.
  }
  return {inspectComponentDependencies,prepareComponentDependencies,approveComponentDependencies,loadComponentDependencies};
}
