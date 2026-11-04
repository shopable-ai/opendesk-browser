// Shared data only: these preferences never establish directory/chat authority.
export const CHATGPT_FILES_CONFIG_KEY='opendesk.chatgpt.files.preferences.v1';
export const DEFAULT_CHATGPT_FILES_PREFERENCES=Object.freeze({enabled:true,diagnosticsVisible:false});
export function normalizeChatGPTFilesPreferences(value=undefined){
  if(value===undefined)return {...DEFAULT_CHATGPT_FILES_PREFERENCES};
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).some(key=>!Object.hasOwn(DEFAULT_CHATGPT_FILES_PREFERENCES,key)||typeof value[key]!=='boolean'))
    throw {code:'E_FILE_SCHEMA',message:'文件偏好只接受 enabled / diagnosticsVisible 布尔字段',outcome:'NOT_DISPATCHED'};
  return {...DEFAULT_CHATGPT_FILES_PREFERENCES,...value};
}
export async function readChatGPTFilesPreferences(api){
  return normalizeChatGPTFilesPreferences((await api.storage.local.get(CHATGPT_FILES_CONFIG_KEY))[CHATGPT_FILES_CONFIG_KEY]);
}
