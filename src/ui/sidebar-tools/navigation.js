// Fixed extension-owned navigation. Tool IDs are locators, never authority.
const TOOL_ID=/^[a-z][a-z0-9-]{1,39}$/;
export function validToolId(id){return typeof id==='string'&&TOOL_ID.test(id);}
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
  if(typeof hostInstanceId!=='string'||hostInstanceId.length<10||hostInstanceId.length>90)
    throw new TypeError('invalid host instance id');
  const url=new URL(address);
  const toolId=requestedToolId(url.href),previewId=requestedPreviewId(url.href);
  // The first navigation commits the stable sender URL. Never carry over
  // unapproved parameters or both mutually exclusive locators.
  url.search='';url.hash='';
  url.searchParams.set('hostInstanceId',hostInstanceId);
  if(toolId&&!previewId)url.searchParams.set('toolId',toolId);
  if(previewId&&!toolId)url.searchParams.set('previewId',previewId);
  return url.href;
}

const PREVIEW_ID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
export function requestedPreviewId(address){
  const ids=new URL(address).searchParams.getAll('previewId');
  return ids.length===1&&PREVIEW_ID.test(ids[0])?ids[0]:null;
}
export function toolPreviewHref(runtime,previewId){
  if(typeof previewId!=='string'||!PREVIEW_ID.test(previewId))throw new TypeError('invalid preview ID');
  const url=new URL(runtime.getURL('ui/tool.html'));
  url.searchParams.set('previewId',previewId);
  return url.href;
}
