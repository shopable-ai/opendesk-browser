// Fixed extension-owned navigation. Tool IDs are locators, never authority.
import {validToolId,validPreviewId,validHostInstanceId,SIDEPANEL_DOCUMENT_PATH,SIDEPANEL_DOCUMENT_PATHNAME} from '../../tool-document-url.js';
export {validToolId};
// A page hint is routing data, never a tool locator, URL or permission grant.
// Sections are app-defined slugs; consumers must reject unknown section names.
const OWN_PAGE_SECTION=/^[a-z][a-z0-9-]{0,39}$/;
export function normalizeOwnPageTarget(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const keys=Object.keys(value);
  if(keys.length!==2||!keys.includes('view')||!keys.includes('section')||
     value.view!=='settings'||typeof value.section!=='string'||
     !OWN_PAGE_SECTION.test(value.section))return null;
  return Object.freeze({view:'settings',section:value.section});
}
export function requestedOwnPageTarget(address){
  const url=new URL(address);
  if(!requestedToolId(url.href)||url.searchParams.getAll('view').length!==1||
     url.searchParams.getAll('section').length!==1)return null;
  return normalizeOwnPageTarget({view:url.searchParams.get('view'),
    section:url.searchParams.get('section')});
}
export function toolPageHref(runtime,id,target=null){
  if(!validToolId(id))throw new TypeError('工具 ID 无效');
  const url=new URL(runtime.getURL(SIDEPANEL_DOCUMENT_PATH));
  url.searchParams.set('toolId',id);
  if(target!==null){
    const page=normalizeOwnPageTarget(target);
    if(!page)throw new TypeError('不支持的工具页面目标');
    url.searchParams.set('view',page.view);
    url.searchParams.set('section',page.section);
  }
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
  if(url.protocol!=='chrome-extension:'||url.pathname!==SIDEPANEL_DOCUMENT_PATHNAME||url.username||url.password)
    throw new TypeError('invalid Side Panel document URL');
  const toolId=requestedToolId(url.href),previewId=requestedPreviewId(url.href);
  const ownPage=toolId&&!previewId?requestedOwnPageTarget(url.href):null;
  const scheduledRunner=url.searchParams.getAll('scheduledRunner');
  const runnerAlone=!url.searchParams.has('toolId')&&!url.searchParams.has('previewId');
  // The first navigation commits the stable sender URL. Never carry over
  // unapproved parameters or both mutually exclusive locators.
  url.search='';url.hash='';
  url.searchParams.set('hostInstanceId',hostInstanceId);
  if(toolId&&!previewId)url.searchParams.set('toolId',toolId);
  if(toolId&&!previewId&&ownPage){
    url.searchParams.set('view',ownPage.view);
    url.searchParams.set('section',ownPage.section);
  }
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
  const url=new URL(runtime.getURL(SIDEPANEL_DOCUMENT_PATH));
  url.searchParams.set('previewId',previewId);
  return url.href;
}
