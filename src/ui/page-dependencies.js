import {parseUserScriptDependencies, assertUserScriptExecutable} from '../scripting/user-scripts/dependency-metadata.js';
import {hasUnbuiltESM} from './esm-source-detector.js';

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

// Only reuse previously approved @require locks. Dependencies from new URLs
// must be bundled by the author; no UI insertion, CDN fetch or silent approval.
export function createPageDependencyResolver({client,getSource,getProgramId=()=>undefined,onState=()=>{}}) {
  let disposed=false,sequence=0,sourceKey=null,pending=false,locks=[],lookupError=null,inspection=null;
  let selectedLockId=null;
  const current=()=>{
    const sourceUtf8=getSource(),parsed=parseUserScriptDependencies(sourceUtf8);
    const entryFormat=inferPageEntryFormat(sourceUtf8);
    const programId=parsed.requires.length?getProgramId():undefined;
    const key=JSON.stringify({entryFormat,programId,importSourceUrl:parsed.importSourceUrl,
      requires:parsed.requires.map(row=>({order:row.order,raw:row.raw,url:row.url,integrity:row.integrity}))});
    return {sourceUtf8,parsed,entryFormat,programId,key};
  };
  function refresh(force=false) {
    if(disposed)return;
    const candidate=current();
    if(candidate.key===sourceKey&&!force)return;
    const version=++sequence;
    sourceKey=candidate.key;locks=[];inspection=null;lookupError=null;pending=Boolean(candidate.parsed.requires.length);
    onState();
    if(!pending)return;
    Promise.resolve(client.ready).then(()=>{
      if(disposed||version!==sequence)return null;
      return client.request('inspectPageDependencies',
        {sourceUtf8:candidate.sourceUtf8,entryFormat:candidate.entryFormat,
          ...(candidate.programId!==undefined?{programId:candidate.programId}:{})});
    }).then(report=>{
      if(disposed||version!==sequence||!report)return;
      inspection=report;
      locks=Array.isArray(report.locks)?report.locks.filter(row=>typeof row?.lockId==='string'):[];
      if(!locks.some(row=>row.lockId===selectedLockId))selectedLockId=locks.length===1?locks[0].lockId:null;
    }).catch(error=>{
      if(!disposed&&version===sequence)lookupError=error;
    }).finally(()=>{
      if(disposed||version!==sequence)return;
      pending=false;onState();
    });
  }
  function capture() {
    const candidate=current();
    assertPageSourceReadyToRun(candidate.sourceUtf8);
    // Recheck live metadata even if the textarea changes without an input
    // event. Previously approved bytes cannot authorize changed policy.
    assertUserScriptExecutable(candidate.parsed,
      {entryFormat:candidate.entryFormat,phase:'preview',dependenciesLocked:true});
    if(candidate.key!==sourceKey)refresh();
    let lockId=null;
    if(candidate.parsed.requires.length) {
      if(pending)throw {code:'E_DEPENDENCY_PENDING',message:'正在读取已有依赖版本，请稍后重试'};
      if(lookupError)throw {code:'E_DEPENDENCY_INSPECT',message:'读取已有依赖版本失败：'+(lookupError.message||lookupError)};
      if(locks.length>1&&!locks.some(row=>row.lockId===selectedLockId))throw {code:'E_DEPENDENCY_LOCK_AMBIGUOUS',
        message:'发现多份已批准的第三方资源版本。请在「开发 → 第三方 JS 依赖」明确选择本次运行的 SHA 锁；不会自动选择新代码'};
      if(locks.length===0)throw {code:'E_DEPENDENCY_UNLOCKED',
        message:'本程序尚未批准 @require 的固定字节。请在「开发 → 第三方 JS 依赖」先检查来源，再手动获取、审核 SHA 并批准；试运行不会自动下载'};
      lockId=locks.find(row=>row.lockId===selectedLockId)?.lockId||locks[0].lockId;
    }
    return {sourceUtf8:candidate.sourceUtf8,entryFormat:candidate.entryFormat,lockId,
      ...(candidate.programId!==undefined?{programId:candidate.programId}:{})};
  }

  // A trusted author Run creates an immutable snapshot. Unlike capture(), it
  // does not require a previous manual SHA approval ceremony.
  function captureForRun(){
    const candidate=current();
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
  return {capture,captureForRun,resolveForRun,refresh,chooseLock(id){
    if(id&& !locks.some(row=>row.lockId===id))throw {code:'E_DEPENDENCY_LOCK',message:'所选依赖锁不属于当前程序'};
    selectedLockId=id||null;onState();
  },approved(id){
    if(!/^dep-lock-[a-f0-9]{64}$/.test(id))throw {code:'E_DEPENDENCY_LOCK'};
    selectedLockId=id;refresh(true);
  },get inspection(){return inspection;},get inspectError(){return lookupError;},
  get selectedLockId(){return selectedLockId;},get busy(){return pending;},
  dispose(){disposed=true;sequence++;}};
}

export const dependencyMessage = item => (item?.code ? item.code+'：' : '')+
  (item?.message || String(item));
