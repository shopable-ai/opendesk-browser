import {sidebarToolEnabled} from '../ui/sidebar-tools/lifecycle.js';
import {validateSidebarToolPackage,sidebarToolStorageKey} from '../ui/sidebar-tools/package.js';
import {grantedOrigins,changeTocGrant} from '../reading-toc/policy.js';

export const KNOWLEDGE_TOOL_ID='knowledge-inbox';
export const KNOWLEDGE_PROTOCOL='opendesk.knowledge.v1';
export const KNOWLEDGE_CAPABILITY='knowledge.store';
export const CAPTURE_CAPABILITY='page.capture';
export const CAPTURE_SITE_STORE='opendesk.sidebar-tools.capture-sites.v1';
export const KNOWLEDGE_DATA_KEY=sidebarToolStorageKey(KNOWLEDGE_TOOL_ID);
export const KNOWLEDGE_WORKSPACE_PREFIX='opendesk.knowledge.workspace.v1:';
export const KNOWLEDGE_OPERATIONS=Object.freeze(['knowledge.list','knowledge.get','knowledge.create','knowledge.update','knowledge.remove','knowledge.backup','knowledge.download','knowledge.openSource','knowledge.workspace']);
export const KNOWLEDGE_LIMITS=Object.freeze({records:200,recordBytes:150000,totalBytes:4*1024*1024});
export function chatCaptureOrigin(value){
  try{
    const url=new URL(value);
    return !url.username&&!url.password&&['https://chatgpt.com','https://chat.openai.com'].includes(url.origin)?url.origin:null;
  }catch{return null;}
}
export function captureSource(value){
  if(!chatCaptureOrigin(value))return null;
  const url=new URL(value);url.search='';url.hash='';return url.href;
}
export function installedKnowledgeTool(installed){
  const candidate=Array.isArray(installed)&&installed.find(row=>row?.id===KNOWLEDGE_TOOL_ID);
  try{
    const tool=validateSidebarToolPackage(candidate);
    return tool.capabilities.includes(KNOWLEDGE_CAPABILITY)?tool:null;
  }catch{return null;}
}
export function captureAllowed(installed,sites,url,enableRecords){
  const tool=installedKnowledgeTool(installed),origin=chatCaptureOrigin(url);
  return Boolean(sidebarToolEnabled(enableRecords,KNOWLEDGE_TOOL_ID)&&tool&&tool.capabilities.includes(CAPTURE_CAPABILITY)&&origin&&grantedOrigins(sites,tool.id).includes(origin));
}
export function changeCaptureGrant(sites,id,url,enabled){
  if(id!==KNOWLEDGE_TOOL_ID||!chatCaptureOrigin(url))throw new Error('当前只支持 ChatGPT 网站的知识保存');
  return changeTocGrant(sites,id,url,enabled);
}
export async function knowledgeDigest(value){
  const bytes=new TextEncoder().encode(value);
  const result=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(result),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export const knowledgePackageHash=tool=>knowledgeDigest(JSON.stringify(
  ['format','id','version','title','description','capabilities','html','css','js'].map(key=>tool[key])));
