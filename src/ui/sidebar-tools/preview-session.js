// Ephemeral trusted-UI handoff for a user-requested read-only sandbox preview.
// Nothing in this session grants disk access, installed permissions or Task runs.
import {validateSidebarToolPackage} from './package.js';
import {toolPreviewHref} from './navigation.js';
import {previewStorageKey} from '../../native-agent/tool-snapshot.js';
export const PREVIEW_SESSION_FORMAT='opendesk.tool-preview-session.v1';
const SHA=/^[a-f0-9]{64}$/,SOURCE=/^source-[a-f0-9]{24}$/;
const WORKSPACE=/^workspace-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const fail=message=>{const e=new Error('E_TOOL_PREVIEW: '+message);e.code='E_TOOL_PREVIEW';throw e;};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
export function validatePreviewSession(value,previewId,now=Date.now()){
  if(!plain(value)||value.format!==PREVIEW_SESSION_FORMAT||
    Object.keys(value).sort().join(',')!==['format','previewId','tool','sha256','createdAt','sourceId','workspaceId','buildId'].sort().join(',')||
    value.previewId!==previewId||!SHA.test(value.sha256)||
    !SOURCE.test(value.sourceId)||!WORKSPACE.test(value.workspaceId)||
    !(value.buildId===null||typeof value.buildId==='string'&&value.buildId.length<=100)||
    !Number.isSafeInteger(value.createdAt)||now-value.createdAt<0||now-value.createdAt>10*60*1000)
    fail('preview session is missing, invalid or expired');
  return Object.freeze({...value,tool:validateSidebarToolPackage(value.tool)});
}
export async function openPreviewSession({api,workspaceId,sourceId,snapshot,now=Date.now(),id=crypto.randomUUID()}){
  if(!api?.storage?.session?.set||!api?.tabs?.create||!snapshot?.tool||
    !SHA.test(snapshot.sha256)||!SOURCE.test(sourceId)||!WORKSPACE.test(workspaceId))
    fail('trusted preview handoff is unavailable');
  const tool=validateSidebarToolPackage(snapshot.tool),key=previewStorageKey(id);
  const value={format:PREVIEW_SESSION_FORMAT,previewId:id,tool,sha256:snapshot.sha256,
    createdAt:now,sourceId,workspaceId,buildId:snapshot.buildId??null};
  await api.storage.session.set({[key]:value});
  try{
    await api.tabs.create({url:toolPreviewHref(api.runtime,id)});
  }catch(error){
    await api.storage.session.remove?.(key).catch(()=>{});
    throw error;
  }
  return Object.freeze({previewId:id,toolId:tool.id,readOnly:true,installed:false});
}
