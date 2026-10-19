// Native Workspace domain invariants. Pure data operations; no document, Chrome
// API, Native Bridge or React dependency. The Native Host remains authoritative.
const SHA256=/^[a-f0-9]{64}$/;
const MAX_TEXT_BYTES=32*1024;
const AUTHORITY_FIELDS=['workspaceId','sourceId','leaseEpoch','sessionId','access'];
const fail=(code,message,outcome='NOT_DISPATCHED')=>{throw {code,message,outcome};};

export const isDirtyWorkspaceDraft=record=>!!record&&record.content!==record.baseContent;
export const sameWorkspaceAuthority=(a,b)=>!!a&&!!b&&AUTHORITY_FIELDS.every(key=>a[key]===b[key]);
export const workspaceRecordKey=(workspaceId,path)=>workspaceId+'\0'+path;

export function validateWorkspaceRead(data,workspaceId,path){
  if(!data||data.workspaceId!==workspaceId||data.path!==path||typeof data.content!=='string'||
    !SHA256.test(data.sha256)||!Number.isSafeInteger(data.bytes)||data.bytes<0||
    data.bytes!==new TextEncoder().encode(data.content).length||data.bytes>MAX_TEXT_BYTES)
    fail('E_FILES_PROTOCOL','文件响应格式不完整，未替换当前草稿');
  return data;
}

export function createWorkspaceDraft(read){
  // Keep the validated Native identity and the saved baseline together.
  return {...read,baseContent:read.content,unknown:false,remote:null};
}

export function reconcileWorkspaceRead(record,disk,{preserveDraft=false}={}){
  // Never allow a late response from another file or authorization to replace
  // the user's in-memory draft. The controller separately checks session/lease.
  if(!record||!disk||record.workspaceId!==disk.workspaceId||record.path!==disk.path)
    fail('E_FILES_SESSION','磁盘回包属于另一工作区或文件，原草稿已保留。');
  const keepDraft=preserveDraft||isDirtyWorkspaceDraft(record);
  if(keepDraft&&disk.sha256===record.sha256)
    return {kind:'unchanged',record:{...record,authority:disk.authority,unknown:false,remote:null}};
  if(keepDraft&&disk.content!==record.content)
    return {kind:'conflict',record:{...record,authority:disk.authority,remote:disk,unknown:false}};
  return {kind:'accepted',record:{...record,...disk,baseContent:disk.content,remote:null,unknown:false}};
}

export function verifyWorkspaceWriteReceipt(receipt,{workspaceId,path,sha256,create=false}={}){
  // A Native ACK is not proof of durability. Callers MUST read back and
  // compare bytes before clearing unknown or marking the draft saved.
  if(!receipt||receipt.saved!==true||receipt.workspaceId!==workspaceId||
    receipt.path!==path||receipt.sha256!==sha256||(create&&receipt.created!==true))
    fail('E_FILES_PROTOCOL','保存回执无法核对，请重读磁盘。','OUTCOME_UNKNOWN');
  return true;
}

export function verifyWorkspaceWriteReadBack(disk,{workspaceId,path,content,sha256}){
  validateWorkspaceRead(disk,workspaceId,path);
  return disk.content===content&&disk.sha256===sha256;
}
