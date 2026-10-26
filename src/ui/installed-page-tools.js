import {requireChromePermissions} from '../platform/chrome/permission-gate.js';
import {pageHostPermissionOrigins} from '../scripting/user-scripts/page-install-authorization.js';

// Reuse the existing Page Authority restore operation for a suspended grant.
// A suspended but enabled installation needs enabled:true, not another disable.
// This only reuses the original approved site scope; it never expands it.
export function installedPageEnableAction(installed){
  if(installed?.authorization?.status==='suspended')
    return {enabled:true,label:'恢复自动运行'};
  return installed?.enabled===true
    ? {enabled:false,label:'停用自动运行'}
    : {enabled:true,label:'启用自动运行'};
}

// Trusted enable/restore operation used by the unified Extension Center.
// It does not install, convert, or enlarge a Page program's website rules.
export async function setInstalledPageProgramEnabled({api,client,row,enabled}){
  const installed=row?.installed;
  if(!installed||installed.manifestHash!==row.manifestHash)
    throw Object.assign(new Error('已安装网页程序身份已变化，请刷新列表'),{code:'E_PAGE_CHANGED'});
  // The master Switch sends its explicit desired state. The legacy row-menu
  // action still preserves the separate "restore suspended grant" behavior.
  if(enabled!==undefined&&typeof enabled!=='boolean')
    throw Object.assign(new Error('无效的网页增强启用意图'),{code:'E_PAGE_ENABLED'});
  const targetEnabled=enabled??installedPageEnableAction(installed).enabled;
  if(targetEnabled)await requireChromePermissions({
    api,request:{origins:pageHostPermissionOrigins(installed.pageRules.matches)}});
  const result=await client.request('setInstalledPageEnabled',{
    programId:row.programId,manifestHash:installed.manifestHash,enabled:targetEnabled,
    expectedGeneration:installed.authorization?.generation??null});
  if(result.error)throw result.error;
  return result;
}
