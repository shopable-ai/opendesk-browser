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
  refresh();
  return {capture,refresh,chooseLock(id){
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
