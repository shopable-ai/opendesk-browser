import {parseUserScriptDependencies, assertUserScriptExecutable} from '../scripting/user-scripts/dependency-metadata.js';

// Ordinary JavaScript runs without metadata. Detect a main() declaration;
// otherwise treat the source as normal top-level statements.
export function inferPageEntryFormat(sourceUtf8) {
  // The async-main compiler wraps source inside a function taking `main` as
  // a parameter. A top-level `const/let main` would redeclare that parameter,
  // while examples in comments must not be mistaken for an executable entry.
  return /^[\t ]*(?:async[\t ]+)?function[\t ]+main[\t ]*\(/m.test(sourceUtf8)
    ? 'async-main' : 'classic-userscript';
}

// Only reuse previously approved @require locks. Dependencies from new URLs
// must be bundled by the author; no UI insertion, CDN fetch or silent approval.
export function createPageDependencyResolver({client,getSource,onState=()=>{}}) {
  let disposed=false,sequence=0,sourceKey=null,pending=false,locks=[],lookupError=null;
  const current=()=>{
    const sourceUtf8=getSource(),parsed=parseUserScriptDependencies(sourceUtf8);
    const entryFormat=inferPageEntryFormat(sourceUtf8);
    const key=JSON.stringify({entryFormat,importSourceUrl:parsed.importSourceUrl,
      requires:parsed.requires.map(row=>({order:row.order,raw:row.raw,url:row.url,integrity:row.integrity}))});
    return {sourceUtf8,parsed,entryFormat,key};
  };
  function refresh() {
    if(disposed)return;
    const candidate=current();
    if(candidate.key===sourceKey)return;
    const version=++sequence;
    sourceKey=candidate.key;locks=[];lookupError=null;pending=Boolean(candidate.parsed.requires.length);
    onState();
    if(!pending)return;
    Promise.resolve(client.ready).then(()=>{
      if(disposed||version!==sequence)return null;
      return client.request('inspectPageDependencies',
        {sourceUtf8:candidate.sourceUtf8,entryFormat:candidate.entryFormat});
    }).then(report=>{
      if(disposed||version!==sequence||!report)return;
      locks=Array.isArray(report.locks)?report.locks.filter(row=>typeof row?.lockId==='string'):[];
    }).catch(error=>{
      if(!disposed&&version===sequence)lookupError=error;
    }).finally(()=>{
      if(disposed||version!==sequence)return;
      pending=false;onState();
    });
  }
  function capture() {
    const candidate=current();
    // Recheck live metadata even if the textarea changes without an input
    // event. Previously approved bytes cannot authorize changed policy.
    assertUserScriptExecutable(candidate.parsed,
      {entryFormat:candidate.entryFormat,phase:'preview',dependenciesLocked:true});
    if(candidate.key!==sourceKey)refresh();
    let lockId=null;
    if(candidate.parsed.requires.length) {
      if(pending)throw {code:'E_DEPENDENCY_PENDING',message:'正在读取已有依赖版本，请稍后重试'};
      if(lookupError)throw {code:'E_DEPENDENCY_INSPECT',message:'读取已有依赖版本失败：'+(lookupError.message||lookupError)};
      if(locks.length>1)throw {code:'E_DEPENDENCY_LOCK_AMBIGUOUS',
        message:'发现多份已批准的第三方资源版本。请在本地 JavaScript 项目中固定依赖并重新构建，避免自动选择不同代码'};
      if(locks.length===0)throw {code:'E_DEPENDENCY_UNLOCKED',
        message:'源码含旧格式 @require，但没有已批准的本地版本。请在本地项目用 import / package.json 固定并打包依赖，再导入构建结果；不会自动下载执行远程 JavaScript'};
      lockId=locks[0].lockId;
    }
    return {sourceUtf8:candidate.sourceUtf8,entryFormat:candidate.entryFormat,lockId};
  }
  refresh();
  return {capture,refresh,get busy(){return pending;},dispose(){disposed=true;sequence++;}};
}

export const dependencyMessage = item => (item?.code ? item.code+'：' : '')+
  (item?.message || String(item));
