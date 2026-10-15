// Fixed, audited website-scope policy. No sandbox package code is executed here.
import {validateSidebarToolPackage,sidebarToolStorageKey,sidebarToolPackageHash} from '../../../../src/ui/sidebar-tools/package.js';
import {sidebarToolEnabled} from '../../../../src/ui/sidebar-tools/lifecycle.js';
export const PROMPT_ID='prompt-shortcuts';
export const PROMPT_CAPABILITY='page.prompts';
export const PROMPT_SITE_STORE='opendesk.sidebar-tools.prompt-sites.v1';
export const PROMPT_DATA_STORE=sidebarToolStorageKey(PROMPT_ID);
export const CHATGPT_ORIGIN='https://chatgpt.com';
export function supportedOrigin(value){
  try{const url=new URL(value);return !url.username&&!url.password&&url.origin===CHATGPT_ORIGIN?url.origin:null;}
  catch{return null;}
}
export function installedPromptTool(rows){
  if(!Array.isArray(rows))return null;
  const candidate=rows.find(row=>row?.id===PROMPT_ID);
  try{
    const tool=validateSidebarToolPackage(candidate);
    return tool.capabilities.includes(PROMPT_CAPABILITY)?tool:null;
  }catch{return null;}
}
// Built-in, fixed-source ChatGPT adapter: installing a reviewed tool with
// page.prompts is the one-time consent. No redundant per-origin prompt grant.
// Keep the origin and installed/enable checks at every render and click.
export async function allowedPromptSite({installed,enabled,url}){
  return Boolean(supportedOrigin(url)&&sidebarToolEnabled(enabled,PROMPT_ID)&&
    installedPromptTool(installed));
}
export async function changePromptSiteGrant(grants,tool,installEpoch,enabled){
  if(tool?.id!==PROMPT_ID||!tool.capabilities?.includes(PROMPT_CAPABILITY)||
    typeof enabled!=='boolean')throw Error('无效的提示词网站授权');
  const existing=grants&&typeof grants==='object'&&!Array.isArray(grants)?grants:{};
  const next={...existing};
  // Revocation removes a complete grant, not just an individual origin string.
  if(!enabled)delete next[PROMPT_ID];
  else next[PROMPT_ID]={version:tool.version,packageHash:await sidebarToolPackageHash(tool),
    installEpoch,origins:[CHATGPT_ORIGIN]};
  return next;
}
