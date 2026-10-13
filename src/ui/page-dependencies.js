import {parseUserScriptDependencies, assertUserScriptExecutable} from '../scripting/user-scripts/dependency-metadata.js';
import {hasUnbuiltESM} from './esm-source-detector.js';
import {digestUtf8} from '../platform/protocol.js';

// Ordinary JavaScript runs without metadata. Detect a main() declaration;
// otherwise treat the source as normal top-level statements.
export function inferPageEntryFormat(sourceUtf8) {
  // The async-main compiler wraps source inside a function taking `main` as
  // a parameter. A top-level `const/let main` would redeclare that parameter,
  // while examples in comments must not be mistaken for an executable entry.
  return /^[\t ]*(?:async[\t ]+)?function[\t ]+main[\t ]*\(/m.test(sourceUtf8)
    ? 'async-main' : 'classic-userscript';
}

// The Sidebar is a JavaScript editor, but the current Page preview executes
// fixed classic code. It cannot interpret raw ESM (including HTTPS imports).
// Fail before requesting website permission, instead of silently injecting or
// treating an HTTPS URL as a classic UserScript dependency.
export function assertPageSourceReadyToRun(sourceUtf8) {
  // Check lexical tokens, not only declarations at the beginning of lines.
  // A semicolon followed by ESM on the SAME line must still be refused.
  if(hasUnbuiltESM(sourceUtf8)) {
    throw {code:'E_ESM_BUILD_REQUIRED',
      message:'当前编辑框是普通 JavaScript，不直接运行 ESM import/export。请在「开发 → 本地项目」连接已授权的 ESM 项目并明确运行；没有项目时，先创建本地项目，单独批准远端依赖锁定。不会直接从 HTTPS 下载并执行代码。'};
  }
}

// Lookup and capture never download, approve or prompt for permissions.
export function createPageDependencyResolver({client,getSource,getProgramId=()=>undefined,preparer,onState=()=>{}}) {
  let disposed=false,sequence=0,sourceKey=null,pending=false,locks=[],lookupError=null,report=null,inspection=null;
  let selectedFormat='esm-page',lookup=Promise.resolve();
  let restoredLock=null,selectedLockId=null;
  const current=()=>{
    const sourceUtf8=getSource(),parsed=parseUserScriptDependencies(sourceUtf8);
    if(hasUnbuiltESM(sourceUtf8)) {
      const sourceFormat=selectedFormat,world=sourceFormat==='esm-controller'?'CONTROLLER':'USER_SCRIPT';
      return {sourceUtf8,parsed,entryFormat:'async-main',sourceFormat,world,
        key:JSON.stringify({sourceUtf8,entryFormat:'async-main',sourceFormat,world})};
    }
    const entryFormat=inferPageEntryFormat(sourceUtf8);
    const programId=parsed.requires.length?getProgramId():undefined;
    const key=JSON.stringify({entryFormat,programId,importSourceUrl:parsed.importSourceUrl,
      requires:parsed.requires.map(row=>({order:row.order,raw:row.raw,url:row.url,integrity:row.integrity}))});
    return {sourceUtf8,parsed,entryFormat,programId,key};
  };
  function refresh({force=false,sourceFormat}={}) {
    if(typeof arguments[0]==='boolean') force=arguments[0];
    if(disposed)return;
    if(sourceFormat!==undefined) {
      if(!['esm-page','esm-controller'].includes(sourceFormat))throw {code:'E_SOURCE_FORMAT',message:'请选择 Page 或 Controller 静态 import'};
      selectedFormat=sourceFormat;
    }
    const candidate=current();
    if(restoredLock&&restoredLock.key!==candidate.key)restoredLock=null;
    if(candidate.key===sourceKey&&!force)return lookup;
    preparer?.cancel();
    const version=++sequence;
    sourceKey=candidate.key;locks=[];lookupError=null;report=null;inspection=null;pending=Boolean(candidate.sourceFormat||candidate.parsed.requires.length);
    onState();
    if(!pending)return lookup=Promise.resolve();
    lookup=Promise.resolve(client.ready).then(()=>{
      if(disposed||version!==sequence)return null;
      return client.request('inspectPageDependencies',
        {sourceUtf8:candidate.sourceUtf8,entryFormat:candidate.entryFormat,
          ...(candidate.sourceFormat?{sourceFormat:candidate.sourceFormat}:{}),
          ...(candidate.programId!==undefined?{programId:candidate.programId}:{})});
    }).then(async value=>{
      if(disposed||version!==sequence||!value)return;
      report=value;inspection=value;
      if(candidate.sourceFormat&&(value.sourceFormat!==candidate.sourceFormat||value.world!==candidate.world))
        throw {code:'E_DEPENDENCY_WORLD',message:'依赖声明不属于当前运行世界'};
      locks=Array.isArray(value.locks)?value.locks.filter(row=>typeof row?.lockId==='string'&&
        (!candidate.sourceFormat||row.sourceFormat===candidate.sourceFormat&&row.world===candidate.world)):[];
      if(!locks.some(row=>row.lockId===selectedLockId))selectedLockId=value.selectedLockId&&locks.some(row=>row.lockId===value.selectedLockId)
        ? value.selectedLockId : locks.length===1?locks[0].lockId:null;
      if(restoredLock&&value.manifestDigest!==restoredLock.manifestDigest)
        throw {code:'E_DEPENDENCY_LOCK_STALE',message:'重开的依赖声明与保存版本不符'};
      if(restoredLock?.lockId&&!locks.some(row=>row.lockId===restoredLock.lockId)){
        const fixed=await client.request('loadPageESMForCompilation',{sourceUtf8:candidate.sourceUtf8,
          entryFormat:candidate.entryFormat,sourceFormat:candidate.sourceFormat,lockId:restoredLock.lockId});
        if(disposed||version!==sequence)return;
        if(fixed.lockId!==restoredLock.lockId||fixed.manifestDigest!==restoredLock.manifestDigest||
          fixed.sourceFormat!==candidate.sourceFormat||fixed.world!==candidate.world)
          throw {code:'E_DEPENDENCY_LOCK_STALE',message:'保存版本的批准依赖身份不符'};
        locks.push({lockId:fixed.lockId,sourceFormat:fixed.sourceFormat,world:fixed.world});
      }
    }).catch(error=>{
      if(!disposed&&version===sequence)lookupError=error;
    }).finally(()=>{
      if(disposed||version!==sequence)return;
      pending=false;onState();
    });
    return lookup;
  }
  function capture({sourceFormat}={}) {
    if(sourceFormat===undefined)assertPageSourceReadyToRun(getSource());
    if(sourceFormat!==undefined&&hasUnbuiltESM(getSource())&&sourceFormat!==selectedFormat) {
      throw {code:'E_DEPENDENCY_WORLD',message:'准备与运行世界不同，请在源码旁为本次 Page 或 Controller 运行准备并批准依赖'};
    }
    const candidate=current();
    // Recheck live metadata even if the textarea changes without an input
    // event. Previously approved bytes cannot authorize changed policy.
    if(!candidate.sourceFormat)assertUserScriptExecutable(candidate.parsed,
      {entryFormat:candidate.entryFormat,phase:'preview',dependenciesLocked:true});
    if(candidate.key!==sourceKey)refresh();
    let lockId=null;
    if(candidate.sourceFormat||candidate.parsed.requires.length) {
      if(pending)throw {code:'E_DEPENDENCY_PENDING',message:'正在读取已有依赖版本，请稍后重试'};
      if(lookupError)throw {code:'E_DEPENDENCY_INSPECT',message:'读取已有依赖版本失败：'+(lookupError.message||lookupError)};
      if(candidate.sourceFormat&&!Array.isArray(report?.requires))
        throw {code:'E_DEPENDENCY_PENDING',message:'正在读取静态 import 声明，请稍后重试'};
    }
    const requires=candidate.sourceFormat?report.requires:candidate.parsed.requires;
    if(restoredLock){
      if(restoredLock.lockId===null&&requires.length||restoredLock.lockId!==null&&!requires.length)
        throw {code:'E_DEPENDENCY_LOCK_STALE',message:'重开的依赖锁与作者声明不符'};
      if(restoredLock.lockId!==null&&!locks.some(row=>row.lockId===restoredLock.lockId))
        throw {code:'E_DEPENDENCY_LOCK_STALE',message:'保存版本的批准依赖锁不可用，请明确重新审核；不能自动选择其他字节'};
    }
    if(requires.length) {
      const selected=locks.find(row=>row.lockId===(restoredLock?.lockId??selectedLockId??report?.selectedLockId));
      if(locks.length>1&&!selected)throw {code:'E_DEPENDENCY_LOCK_AMBIGUOUS',
        message:'发现多份已批准的第三方资源版本。请在「开发 → 第三方 JS 依赖」明确选择本次运行的 SHA 锁；不会自动选择新代码'};
      if(locks.length===0)throw {code:'E_DEPENDENCY_UNLOCKED',
        message:'源码含外部依赖，但没有当前运行世界的批准版本。请在源码旁的「网络 JS」中下载准备、查看缓存源码并明确批准固定字节，再单独点击运行'};
      lockId=(selected??locks[0]).lockId;
    }
    return {sourceUtf8:candidate.sourceUtf8,entryFormat:candidate.entryFormat,lockId,
      ...(candidate.programId!==undefined?{programId:candidate.programId}:{}),
      ...(candidate.sourceFormat?{sourceFormat:candidate.sourceFormat,world:candidate.world,
        manifestDigest:report.manifestDigest,key:candidate.key,version:sequence}:{})};
  }
  function snapshot() {
    const candidate=current();
    if(!candidate.sourceFormat)assertUserScriptExecutable(candidate.parsed,
      {entryFormat:candidate.entryFormat,phase:'preview',dependenciesLocked:true});
    if(candidate.key!==sourceKey)refresh();
    if(pending)throw {code:'E_DEPENDENCY_PENDING',message:'正在读取依赖声明'};
    if(lookupError)throw lookupError;
    return {sourceUtf8:candidate.sourceUtf8,entryFormat:candidate.entryFormat,key:candidate.key,report,
      ...(candidate.sourceFormat?{sourceFormat:candidate.sourceFormat,world:candidate.world}:{})};
  }
  function accept(lock,captured) {
    if(disposed||current().sourceUtf8!==captured.sourceUtf8||current().key!==captured.key)
      throw {code:'E_DEPENDENCY_LOCK_STALE',message:'审核期间源码已变化，请重新准备'};
    if(typeof lock?.lockId!=='string'||lock.manifestDigest!==captured.report?.manifestDigest)
      throw {code:'E_DEPENDENCY_REVIEW',message:'批准回执与当前声明不符'};
    if(captured.sourceFormat&&!captured.report?.requires?.length)
      throw {code:'E_DEPENDENCY_REVIEW',message:'没有外部依赖，无需批准空锁'};
    if(captured.sourceFormat&&(lock.sourceFormat!==captured.sourceFormat||lock.world!==captured.world))
      throw {code:'E_DEPENDENCY_WORLD',message:'批准回执的运行世界不符'};
    sequence++;pending=false;locks=[lock];selectedLockId=lock.lockId;report={...report,locks:[lock],selectedLockId:lock.lockId};lookupError=null;onState();
    restoredLock=null;
  }
  async function restore({sourceFormat,authorSourceHash,dependencyLockId,dependencyManifestDigest}={}) {
    if(sourceFormat!=='esm-page'||!(dependencyLockId===null||/^dep-lock-[a-f0-9]{64}$/.test(dependencyLockId))||
      !/^[a-f0-9]{64}$/.test(dependencyManifestDigest)||!/^[a-f0-9]{64}$/.test(authorSourceHash))
      throw {code:'E_STATIC_ESM_IDENTITY',message:'保存版本的 Page import 身份无效'};
    const source=getSource(),version=sequence;
    const actual=await digestUtf8(source);
    if(disposed||source!==getSource()||version!==sequence||actual!==authorSourceHash)
      throw {code:'E_SOURCE_HASH',message:'重开期间作者源码或恢复身份已变化'};
    selectedFormat=sourceFormat;
    const candidate=current();
    if(candidate.sourceFormat!==sourceFormat)throw {code:'E_STATIC_ESM_IDENTITY',message:'作者源码与保存的运行世界不符'};
    restoredLock={key:candidate.key,lockId:dependencyLockId,manifestDigest:dependencyManifestDigest};
    return refresh({force:true});
  }
  function assertCaptured(captured) {
    const candidate=current();
    if(disposed||candidate.sourceUtf8!==captured.sourceUtf8||candidate.key!==captured.key||sequence!==captured.version)
      throw {code:'E_DEPENDENCY_LOCK_STALE',message:'离线编译期间作者源码、运行世界或批准版本已改变'};
  }
  async function compile(captured) {
    if(!captured.sourceFormat)return captured;
    assertCaptured(captured);
    const input=await client.request('loadPageESMForCompilation',{
      sourceUtf8:captured.sourceUtf8,entryFormat:captured.entryFormat,sourceFormat:captured.sourceFormat,lockId:captured.lockId});
    assertCaptured(captured);
    if(input?.lockId!==captured.lockId||input.manifestDigest!==captured.manifestDigest||
      input.sourceFormat!==captured.sourceFormat||input.world!==captured.world||!Array.isArray(input.entries))
      throw {code:'E_DEPENDENCY_WORLD',message:'离线依赖回执与冻结的源码、锁或运行世界不符'};
    if(!preparer)throw {code:'E_STATIC_ESM_RESOURCE',message:'固定离线编译器不可用'};
    const built=await preparer.prepare({...structuredClone(input),sourceUtf8:captured.sourceUtf8});
    const authorSourceHash=await digestUtf8(captured.sourceUtf8);
    assertCaptured(captured);
    if(built.sourceFormat!==captured.sourceFormat||built.lockId!==captured.lockId||built.manifestDigest!==captured.manifestDigest||
      built.authorSourceHash!==authorSourceHash||built.entryFormat!=='async-main')
      throw {code:'E_STATIC_ESM_OUTPUT',message:'编译产物与冻结的作者源码或批准锁不符'};
    return built;
  }

  // A trusted author Run creates an immutable snapshot. Unlike capture(), it
  // does not require a previous manual SHA approval ceremony.
  function captureForRun(){
    const candidate=current();
    if(candidate.sourceFormat)return capture({sourceFormat:'esm-page'});
    assertPageSourceReadyToRun(candidate.sourceUtf8);
    assertUserScriptExecutable(candidate.parsed,
      {entryFormat:candidate.entryFormat,phase:'preview',dependenciesLocked:true});
    return {sourceUtf8:candidate.sourceUtf8,entryFormat:candidate.entryFormat,lockId:null,
      ...(candidate.programId!==undefined?{programId:candidate.programId}:{})};
  }
  async function resolveForRun(snapshot,assertRunCurrent=()=>{}){
    const rejected=(code,message)=>Object.assign(new Error(message),{code});
    const stillCurrent=()=>{
      assertRunCurrent();
      const live=current();
      if(disposed||live.sourceUtf8!==snapshot.sourceUtf8||
        live.entryFormat!==snapshot.entryFormat||live.programId!==snapshot.programId)
        throw rejected('E_DEPENDENCY_STALE','源码或程序身份已更改；不会执行之前准备的依赖');
    };
    stillCurrent();
    if(snapshot.sourceFormat)return snapshot;
    const parsed=parseUserScriptDependencies(snapshot.sourceUtf8);
    if(!parsed.requires.length)return snapshot;
    const input={sourceUtf8:snapshot.sourceUtf8,entryFormat:snapshot.entryFormat,
      ...(snapshot.programId!==undefined?{programId:snapshot.programId}:{})};
    // All byte verification and persistent locks remain in the existing
    // authenticated Broker Dependency Manager. Never execute here.
    const report=await client.request('inspectPageDependencies',input);stillCurrent();
    if(!/^[a-f0-9]{64}$/.test(report?.manifestDigest)||
      !Array.isArray(report.requires)||report.requires.length!==parsed.requires.length||
      !Array.isArray(report.locks))
      throw rejected('E_DEPENDENCY_INSPECT','依赖检查未返回完整可验证的清单');
    const available=report.locks.filter(row=>/^dep-lock-[a-f0-9]{64}$/.test(row.lockId));
    if(available.length!==report.locks.length)
      throw rejected('E_DEPENDENCY_LOCK','依赖锁格式不合法');
    const pinned=available.find(row=>row.lockId===selectedLockId)||
      (available.length===1?available[0]:null);
    if(pinned){selectedLockId=pinned.lockId;return {...snapshot,lockId:pinned.lockId};}
    if(available.length>1)
      throw rejected('E_DEPENDENCY_LOCK_AMBIGUOUS','当前程序存在不同的固定依赖版本；请先在高级详情选择要运行的版本');
    const selections=[];
    for(const [order,row] of report.requires.entries()){
      if(row.order!==order||row.url!==parsed.requires[order].url)
        throw rejected('E_DEPENDENCY_INSPECT','远程依赖清单与本次固定源码不一致');
      if(row.downloadError)throw rejected(row.downloadError.code||'E_DEPENDENCY_URL',row.downloadError.message||'依赖来源无效');
      if(row.sourceKind==='packaged')continue;
      if(row.sourceKind!=='https')throw rejected('E_DEPENDENCY_SOURCE','不支持的第三方库来源');
      // A moving "latest" URL is not a fixed version. An author supplied
      // strong hash may also pin original bytes independently of URL naming.
      const fixed=/@v?\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?(?:\/|$)|(?:^|[\/._-])v?\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?(?:\/|[._-]|$)|\/[a-f0-9]{40}(?:\/|$)/i.test(new URL(row.url).pathname);
      const integrity=Array.isArray(row.integrity)?row.integrity:[];
      if(!fixed&&!integrity.some(pin=>['sha256','sha384','sha512'].includes(pin.algorithm)))
        throw rejected('E_DEPENDENCY_VERSION','依赖 URL 必须包含明确版本或强完整性哈希；不能自动选择 latest：'+row.url);
      // Prefer the current program's SHA, then a cross-program asset proven to
      // come from the exact HTTPS URL. Conflicting bytes cannot auto-upgrade.
      const choose=rows=>{
        const shaPins=integrity.filter(pin=>pin.algorithm==='sha256').map(pin=>pin.digestHex);
        const unique=[...new Map((rows||[]).filter(pin=>/^[a-f0-9]{64}$/.test(pin.sha256))
          .filter(pin=>!shaPins.length||shaPins.includes(pin.sha256))
          .map(pin=>[pin.sha256,pin])).values()];
        if(unique.length>1)throw rejected('E_DEPENDENCY_LOCK_AMBIGUOUS','同一来源存在多份 SHA 字节；请提供明确 integrity，不自动选择不同版本');
        return unique[0]||null;
      };
      const own=choose(row.cacheChoices);
      if(own)selections.push({order,assetSha256:own.sha256});
      else {
        const shared=choose(row.sharedCacheChoices);
        if(shared)selections.push({order,sharedAssetSha256:shared.sha256});
      }
    }
    // The Run click is the deliberate developer action; acceptedHashes bind
    // the verified, just-obtained byte identities, not an extra approval UI.
    const review=await client.request('preparePageDependencies',
      {...input,explicitUserAction:true,selections});stillCurrent();
    if(review?.status!=='pending-review'||review.manifestDigest!==report.manifestDigest||
      !Array.isArray(review.entries)||review.entries.length!==parsed.requires.length||
      !review.entries.every((row,i)=>row.order===i&&row.url===parsed.requires[i].url&&/^[a-f0-9]{64}$/.test(row.sha256)))
      throw rejected('E_DEPENDENCY_REVIEW','未获得完整且匹配当前源码的固定依赖资产');
    const lock=await client.request('approvePageDependencies',{
      reviewId:review.reviewId,...(snapshot.programId!==undefined?{programId:snapshot.programId}:{}),
      explicitUserAction:true,acceptedHashes:review.entries.map(row=>row.sha256)});
    stillCurrent();
    if(lock?.approvalStatus!=='approved'||lock.manifestDigest!==report.manifestDigest||
      !/^dep-lock-[a-f0-9]{64}$/.test(lock.lockId))
      throw rejected('E_DEPENDENCY_LOCK','自动固定后的技术锁无效，不执行脚本');
    selectedLockId=lock.lockId;refresh(true);
    return {...snapshot,lockId:lock.lockId};
  }
  refresh();
  return {capture,captureForRun,resolveForRun,refresh,snapshot,accept,restore,compile,get sourceFormat(){return current().sourceFormat;},
  chooseLock(id){
    if(id&& !locks.some(row=>row.lockId===id))throw {code:'E_DEPENDENCY_LOCK',message:'所选依赖锁不属于当前程序'};
    selectedLockId=id||null;onState();
  },approved(id){
    if(!/^dep-lock-[a-f0-9]{64}$/.test(id))throw {code:'E_DEPENDENCY_LOCK'};
    selectedLockId=id;refresh(true);
  },get inspection(){return inspection;},get inspectError(){return lookupError;},
  get selectedLockId(){return selectedLockId;},get busy(){return pending;},
  dispose(){disposed=true;sequence++;preparer?.cancel();}};
}

export const dependencyMessage = item => (item?.code ? item.code+'：' : '')+
  (item?.message || String(item));
