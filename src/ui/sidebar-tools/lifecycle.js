// Runtime preference only: installation and site grants retain their existing stores.
export const SIDEBAR_TOOL_ENABLE_STORE='opendesk.sidebar-tools.enabled.v1';
export const TOOL_REVOCATION_EPOCHS_STORE='opendesk.sidebar-tools.revocation-epochs.v1';
const toolIdPattern=/^[a-z][a-z0-9-]{1,39}$/;
// Uninstall must protect the SAME instance revocation authority as enable/disable.
// A corrupt epoch map cannot be repaired by spreading it into a new object.
export function requireToolRevocationEpochs(value){
  if(value===undefined)return {};
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.entries(value).some(([id,epoch])=>!toolIdPattern.test(id)||typeof epoch!=='string'))
    throw Object.assign(new Error('工具实例撤销记录损坏；已停止安装生命周期修改以保护原始数据'),
      {code:'E_STORAGE_CORRUPT'});
  return value;
}
export function requireToolEnableRecords(value){
  if(value===undefined)return {};
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.entries(value).some(([id,enabled])=>!toolIdPattern.test(id)||typeof enabled!=='boolean'))
    throw Object.assign(new Error('工具启停记录损坏；已停止运行和修改以保护原始数据'),{code:'E_STORAGE_CORRUPT'});
  return value;
}
export function sidebarToolEnabled(value,id){
  try{return requireToolEnableRecords(value)[id]!==false;}catch{return false;}
}
export async function assertSidebarToolEnabled(api,id){
  const value=(await api.storage.local.get(SIDEBAR_TOOL_ENABLE_STORE))[SIDEBAR_TOOL_ENABLE_STORE];
  if(requireToolEnableRecords(value)[id]===false)
    throw Object.assign(new Error('工具已停用；请在详情设置中启用后主动打开'),{code:'E_TOOL_DISABLED'});
}
// An absent old value is the legacy default. Corrupt maps revoke every consumer.
export function sidebarToolLifecycleChanged(changes,id){
  for(const key of [SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE]){
    if(!Object.hasOwn(changes,key))continue;
    const change=changes[key];
    try{
      if(key===SIDEBAR_TOOL_ENABLE_STORE){
        if((requireToolEnableRecords(change.oldValue)[id]!==false)!==(requireToolEnableRecords(change.newValue)[id]!==false))return true;
      }else{
        for(const value of [change.oldValue,change.newValue]){
          if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)||
            Object.entries(value).some(([toolId,epoch])=>!toolIdPattern.test(toolId)||typeof epoch!=='string')))return true;
        }
        if((change.oldValue?.[id]??null)!==(change.newValue?.[id]??null))return true;
      }
    }catch{return true;}
  }
  return false;
}
