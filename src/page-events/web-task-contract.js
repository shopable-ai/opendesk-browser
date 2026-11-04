export const WEB_TASK_PROTOCOL='opendesk.web-task.v1';
export const SITE_PROFILES_KEY='opendesk.web-task.site-profiles.v1';
export const WEB_TASK_INTENT_PROTOCOL='webflow.task.intent.v1';
// Compiled routing identity; it carries no Task grant and cannot be registered
// or replaced by website data.
export const CHATGPT_TASK_PROFILE=Object.freeze({id:'chatgpt',version:'1.0.0',origin:'https://chatgpt.com',
  adapter:'chatgpt',adapterVersion:'1.0.0',protocols:Object.freeze([WEB_TASK_INTENT_PROTOCOL]),enabled:true});

// Structural identity only. The ingress must obtain these fields from Chrome,
// match the reviewed Profile, and verify permissions before using the ledger.
export function validWebTaskSource(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!=='documentId,tabId,url'||
    !Number.isSafeInteger(value.tabId)||value.tabId<0||
    typeof value.documentId!=='string'||!value.documentId||value.documentId.length>128||
    typeof value.url!=='string'||value.url.length>2048)return false;
  try{
    const url=new URL(value.url);
    return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&!url.hostname.includes('*');
  }catch{return false;}
}
