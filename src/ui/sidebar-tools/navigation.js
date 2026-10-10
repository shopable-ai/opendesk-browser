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
  // MV3 sender.url must match the committed document URL, not replaceState.
  // Clear unknown parameters, but preserve a *validated* installed tool locator.
  const id=requestedToolId(url.href);
  url.search='';url.hash='';
  url.searchParams.set('hostInstanceId',hostInstanceId);
  if(id)url.searchParams.set('toolId',id);
  return url.href;
}
