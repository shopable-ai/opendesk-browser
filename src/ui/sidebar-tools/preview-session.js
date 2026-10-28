// Ephemeral trusted-UI handoff for a user-requested read-only sandbox preview.
// Nothing in this session grants disk access, installed permissions or Task runs.
import {validateSidebarToolPackage} from './package.js';
import {toolPreviewHref} from './navigation.js';
import {previewStorageKey} from '../../native-agent/tool-snapshot.js';
export const PREVIEW_SESSION_FORMAT='opendesk.tool-preview-session.v1';
const SHA=/^[a-f0-9]{64}$/,SOURCE=/^source-[a-f0-9]{24}$/;
const WORKSPACE=/^workspace-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
export const SIDE_PANEL_PREVIEW_FORMAT='opendesk.tool-preview-panel.v1';
export function panelPreviewStorageKey(windowId){
  if(!Number.isSafeInteger(windowId)||windowId<0)fail('invalid Side Panel window');
  return SIDE_PANEL_PREVIEW_FORMAT+':'+windowId;
}
export function validatePanelPreviewPointer(value,windowId,now=Date.now()){
  if(!plain(value)||value.format!==SIDE_PANEL_PREVIEW_FORMAT||
    Object.keys(value).sort().join(',')!=='createdAt,format,previewId,windowId'||
    value.windowId!==windowId||!UUID.test(value.previewId)||
    !Number.isSafeInteger(value.createdAt)||value.createdAt>now||now-value.createdAt>10*60*1000)
    fail('Side Panel preview was not explicitly opened in this window');
  return Object.freeze({...value});
}
export const panelPreviewPointer=(previewId,windowId,createdAt)=>
  validatePanelPreviewPointer({format:SIDE_PANEL_PREVIEW_FORMAT,previewId,windowId,createdAt},windowId,createdAt);
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
export async function openPreviewSession({api,workspaceId,sourceId,snapshot,now=Date.now(),id=crypto.randomUUID(),
  surface='tab',windowId=null}){
  if(!api?.storage?.session?.set||surface!=='tab'&&surface!=='sidepanel'||
    surface==='tab'&&!api?.tabs?.create||surface==='sidepanel'&&!Number.isSafeInteger(windowId)||!snapshot?.tool||
    !SHA.test(snapshot.sha256)||!SOURCE.test(sourceId)||!WORKSPACE.test(workspaceId))
    fail('trusted preview handoff is unavailable');
  const tool=validateSidebarToolPackage(snapshot.tool),key=previewStorageKey(id);
  const value={format:PREVIEW_SESSION_FORMAT,previewId:id,tool,sha256:snapshot.sha256,
    createdAt:now,sourceId,workspaceId,buildId:snapshot.buildId??null};
  await api.storage.session.set(surface==='sidepanel'?{[key]:value,
    [panelPreviewStorageKey(windowId)]:panelPreviewPointer(id,windowId,now)}:{[key]:value});
  if(surface==='sidepanel')return Object.freeze({previewId:id,tabId:null,windowId,
    surface:'sidepanel',toolId:tool.id,readOnly:true,installed:false});
  try{
    const opened=await api.tabs.create({url:toolPreviewHref(api.runtime,id)});
    return Object.freeze({previewId:id,tabId:Number.isSafeInteger(opened?.id)?opened.id:null,
      toolId:tool.id,readOnly:true,installed:false});
  }catch(error){
    try{await api.storage.session.remove?.(key);}catch{ /* best-effort ephemeral cleanup */ }
    throw error;
  }
}

// Re-publish only into the already user-opened, same-origin read-only preview.
// This never touches installed tools or the persistent storage namespace.
export async function updatePreviewSession({api,previewId,workspaceId,sourceId,snapshot,now=Date.now()}){
  if(!api?.storage?.session?.get||!api?.storage?.session?.set||
    !snapshot?.tool||!SHA.test(snapshot.sha256)||!SOURCE.test(sourceId)||!WORKSPACE.test(workspaceId))
    fail('trusted preview update is unavailable');
  const key=previewStorageKey(previewId);
  const current=validatePreviewSession((await api.storage.session.get(key))[key],previewId,now);
  const tool=validateSidebarToolPackage(snapshot.tool);
  if(current.sourceId!==sourceId||current.workspaceId!==workspaceId||current.tool.id!==tool.id)
    fail('tool preview owner has changed; open a new explicit preview');
  if(current.sha256===snapshot.sha256&&current.buildId===(snapshot.buildId??null)&&now-current.createdAt<60000)
    return Object.freeze({updated:false,previewId});
  const next={format:PREVIEW_SESSION_FORMAT,previewId,tool,sha256:snapshot.sha256,
    createdAt:now,sourceId,workspaceId,buildId:snapshot.buildId??null};
  await api.storage.session.set({[key]:next});
  return Object.freeze({updated:true,previewId,sha256:snapshot.sha256});
}
