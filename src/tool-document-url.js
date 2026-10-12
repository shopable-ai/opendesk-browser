// Pure identity/locator parsing shared by trusted navigation and host admission.
// A locator selects existing UI; it never approves installation, a Task or a run.
const TOOL_ID=/^[a-z][a-z0-9-]{1,39}$/;
const PREVIEW_ID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const HOST_INSTANCE_ID=/^[A-Za-z0-9._:-]{1,128}$/;
export const validToolId=id=>typeof id==='string'&&TOOL_ID.test(id);
export const validPreviewId=id=>typeof id==='string'&&PREVIEW_ID.test(id);
export const validHostInstanceId=id=>typeof id==='string'&&HOST_INSTANCE_ID.test(id);
export function toolDocumentIdentity(baseAddress,address){
  try{
    const base=new URL(baseAddress),url=new URL(address);
    if(url.protocol!==base.protocol||url.host!==base.host||url.pathname!==base.pathname||
      url.hash||url.username||url.password)return null;
    const pairs=[...url.searchParams],keys=new Set(pairs.map(([key])=>key));
    if(pairs.length!==keys.size||[...keys].some(key=>!['hostInstanceId','toolId','previewId'].includes(key)))return null;
    const hostInstanceId=url.searchParams.get('hostInstanceId'),toolId=url.searchParams.get('toolId'),previewId=url.searchParams.get('previewId');
    if(pairs.length&&(!validHostInstanceId(hostInstanceId)||pairs.length>2))return null;
    if(keys.has('toolId')&&!validToolId(toolId)||keys.has('previewId')&&!validPreviewId(previewId)||toolId&&previewId)return null;
    return {hostInstanceId,toolId,previewId,hasLocator:Boolean(toolId||previewId)};
  }catch{return null;}
}
