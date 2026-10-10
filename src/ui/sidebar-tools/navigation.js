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
