// Fixed extension-owned navigation; tool locator and view are not Authority.
import {validToolId,validPreviewId,validHostInstanceId,SIDEPANEL_DOCUMENT_PATH,
  SIDEPANEL_DOCUMENT_PATHNAME,APP_DOCUMENT_PATH,APP_DOCUMENT_PATHNAME} from '../../tool-document-url.js';
export {validToolId};
const SLUG=/^[a-z][a-z0-9-]{0,39}$/;
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
  (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
export function normalizeOwnPageTarget(value){
  if(!plain(value))return null;
  const keys=Object.keys(value);
  if(!keys.includes('view')||keys.length>2||keys.some(key=>!['view','section'].includes(key))||
     typeof value.view!=='string'||!SLUG.test(value.view)||
     keys.includes('section')&&(typeof value.section!=='string'||!SLUG.test(value.section)))return null;
  return Object.freeze({view:value.view,...(keys.includes('section')?{section:value.section}:{})});
}
export function requestedOwnPageTarget(address){
  const url=new URL(address);
  if(!requestedToolId(url.href)||url.searchParams.getAll('view').length!==1||
     url.searchParams.getAll('section').length>1)return null;
  return normalizeOwnPageTarget({view:url.searchParams.get('view'),
    ...(url.searchParams.has('section')?{section:url.searchParams.get('section')}:{})});
}
export function requestedAppPageLocator(address){
  try{
    const url=new URL(address);
    if(url.protocol!=='chrome-extension:'||url.pathname!==APP_DOCUMENT_PATHNAME||
       url.hash||url.username||url.password)return null;
    const pairs=[...url.searchParams],keys=new Set(pairs.map(([key])=>key));
    if(pairs.length!==keys.size||[...keys].some(key=>!['hostInstanceId','toolId','view','section'].includes(key))||
       !keys.has('toolId')||keys.has('section')&&!keys.has('view'))return null;
    const toolId=requestedToolId(url.href);
    const hostInstanceId=url.searchParams.get('hostInstanceId');
    if(!toolId||keys.has('hostInstanceId')&&!validHostInstanceId(hostInstanceId))return null;
    const page=keys.has('view')?requestedOwnPageTarget(url.href):null;
    if(keys.has('view')&&!page)return null;
    return Object.freeze({toolId,page,hostInstanceId});
  }catch{return null;}
}
export function toolPageHref(runtime,id,target=null){
  if(!validToolId(id))throw new TypeError('工具 ID 无效');
  const url=new URL(runtime.getURL(APP_DOCUMENT_PATH));
  url.searchParams.set('toolId',id);
  if(target!==null){
    const page=normalizeOwnPageTarget(target);
    if(!page)throw new TypeError('不支持的工具页面目标');
    url.searchParams.set('view',page.view);
    if(page.section!==undefined)url.searchParams.set('section',page.section);
  }
  return url.href;
}
export function requestedToolId(address){
  const ids=new URL(address).searchParams.getAll('toolId');
  return ids.length===1&&validToolId(ids[0])?ids[0]:null;
}
export function canonicalToolHostUrl(address,hostInstanceId){
  if(!validHostInstanceId(hostInstanceId))throw new TypeError('invalid host instance id');
  const url=new URL(address);
  if(url.protocol!=='chrome-extension:'||url.username||url.password)
    throw new TypeError('invalid extension document URL');
  if(url.pathname===APP_DOCUMENT_PATHNAME){
    const locator=requestedAppPageLocator(url.href);
    if(!locator)throw new TypeError('invalid app page locator');
    url.search='';url.hash='';
    url.searchParams.set('hostInstanceId',hostInstanceId);
    url.searchParams.set('toolId',locator.toolId);
    if(locator.page){
      url.searchParams.set('view',locator.page.view);
      if(locator.page.section!==undefined)url.searchParams.set('section',locator.page.section);
    }
    return url.href;
  }
  if(url.pathname!==SIDEPANEL_DOCUMENT_PATHNAME)
    throw new TypeError('invalid Side Panel document URL');
  const toolId=requestedToolId(url.href),previewId=requestedPreviewId(url.href);
  const ownPage=toolId&&!previewId?requestedOwnPageTarget(url.href):null;
  const scheduledRunner=url.searchParams.getAll('scheduledRunner');
  const runnerAlone=!url.searchParams.has('toolId')&&!url.searchParams.has('previewId');
  // Preserve previous Side Panel canonicalization and saved settings deep-links.
  url.search='';url.hash='';
  url.searchParams.set('hostInstanceId',hostInstanceId);
  if(toolId&&!previewId)url.searchParams.set('toolId',toolId);
  if(toolId&&!previewId&&ownPage?.view==='settings'&&ownPage.section){
    url.searchParams.set('view','settings');url.searchParams.set('section',ownPage.section);
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
