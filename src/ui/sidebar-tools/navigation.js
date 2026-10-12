// Fixed extension-owned navigation. Tool IDs are locators, never authority.
import {validToolId,validPreviewId,validHostInstanceId} from '../../tool-document-url.js';
export {validToolId};
export function toolPageHref(runtime,id){
  if(!validToolId(id))throw new TypeError('工具 ID 无效');
  const url=new URL(runtime.getURL('ui/tool.html'));
  url.searchParams.set('toolId',id);
  return url.href;
}
export function requestedToolId(address){
  const ids=new URL(address).searchParams.getAll('toolId');
  return ids.length===1&&validToolId(ids[0])?ids[0]:null;
}

export function canonicalToolHostUrl(address,hostInstanceId){
  if(!validHostInstanceId(hostInstanceId))
    throw new TypeError('invalid host instance id');
  const url=new URL(address);
  const toolId=requestedToolId(url.href),previewId=requestedPreviewId(url.href);
  const scheduledRunner=url.searchParams.getAll('scheduledRunner');
  const runnerAlone=!url.searchParams.has('toolId')&&!url.searchParams.has('previewId');
  // The first navigation commits the stable sender URL. Never carry over
  // unapproved parameters or both mutually exclusive locators.
  url.search='';url.hash='';
  url.searchParams.set('hostInstanceId',hostInstanceId);
  if(toolId&&!previewId)url.searchParams.set('toolId',toolId);
  if(previewId&&!toolId)url.searchParams.set('previewId',previewId);
  if(runnerAlone&&!toolId&&!previewId&&scheduledRunner.length===1&&scheduledRunner[0]==='1')
    url.searchParams.set('scheduledRunner','1');
  return url.href;
}

export function requestedPreviewId(address){
  const ids=new URL(address).searchParams.getAll('previewId');
  return ids.length===1&&validPreviewId(ids[0])?ids[0]:null;
}
export function toolPreviewHref(runtime,previewId){
  if(!validPreviewId(previewId))throw new TypeError('invalid preview ID');
  const url=new URL(runtime.getURL('ui/tool.html'));
  url.searchParams.set('previewId',previewId);
  return url.href;
}
