// Confirm durable Chrome local writes instead of trusting a possibly lost acknowledgement.
// Callers hold the existing per-tool/catalog lock; there is no cross-call transaction.
export const storageError=(code,message,cause)=>Object.assign(new Error(message),{code,...(cause?{cause}:{})});
export function stableStorageString(value){
  return JSON.stringify(value,(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)
    ?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
}
export function sameStorageValue(a,b){return stableStorageString(a)===stableStorageString(b);}
export function classifyStorageWriteError(cause,scope='扩展本地存储'){
  if(cause?.code&&String(cause.code).startsWith('E_'))return cause;
  const message=String(cause?.message||cause||'');
  if(/QUOTA_BYTES|quota exceeded|quota.*exceed|storage.*full|disk.*full|no space left|空间不足/i.test(message))
    return storageError('E_HOST_STORAGE_QUOTA',scope+'写入受到 Chrome 配额或设备空间限制；已保留原数据',cause);
  return storageError('E_HOST_STORAGE_WRITE',scope+'写入失败；已保留原数据，请检查浏览器存储状态',cause);
}
export function unknownStorageOutcome(cause,scope='本地存储'){
  return storageError('E_OUTCOME_UNKNOWN',scope+'实际写入状态暂时无法确认；请先恢复核对，不要盲目重试',cause);
}
// A rejected promise may occur after persistent mutation. Compare the complete
// value read under the caller's lock before deciding whether the write failed.
export async function writeVerifiedLocalValue(api,key,next,previous,scope='本地存储'){
  let failure=null;
  try{await api.storage.local.set({[key]:next});}catch(error){failure=error;}
  let actual;
  try{actual=(await api.storage.local.get(key))[key];}
  catch(error){throw unknownStorageOutcome(error,scope);}
  if(sameStorageValue(actual,next))return {confirmed:true,acknowledgementLost:Boolean(failure)};
  if(failure&&sameStorageValue(actual,previous))
    throw classifyStorageWriteError(failure,scope);
  throw unknownStorageOutcome(failure,scope);
}
