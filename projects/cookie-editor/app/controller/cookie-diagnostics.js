import {safeCode} from '../adapters/browser-sdk.js';

// Callers supply fixed operation/stage labels. Never log the error object or
// operation arguments: they can contain site URLs, Cookie data or raw replies.
export function warnCookieFailure(operation,stage,error,fallback,status='failed'){
  try{
    const code=error?.code;
    const sanitized=safeCode({code,message:code==='E_TOOL'?error?.message:undefined},fallback);
    if(sanitized==='E_CANCELLED'&&status==='failed')return;
    console.warn('[Cookie Editor]',{operation,stage,code:sanitized,status});
  }catch{} // Diagnostics must never change the operation's outcome.
}

export function logImportResult(result){
  try{
    const {status,stage,code,total,confirmed,skipped,failed,unknown,notRun,skipCounts}=result;
    const log=code?console.warn:console.info;
    log('[Cookie Editor] 导入回执',{operation:'import',status,stage,code,total,
      confirmed,skipped,failed,unknown,notRun,skipCounts});
  }catch{} // Never attach source bytes, Cookie identities, or an exception object.
}
