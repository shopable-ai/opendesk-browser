// Exact extension-owned document paths. Locators never grant authority.
export const SIDEPANEL_DOCUMENT_PATH='sidepanel.html';
export const APP_DOCUMENT_PATH='app.html';
export const CLOUD_RUNNER_DOCUMENT_PATH='cloud-control/runner.html';
export const SIDEPANEL_DOCUMENT_PATHNAME='/'+SIDEPANEL_DOCUMENT_PATH;
export const APP_DOCUMENT_PATHNAME='/'+APP_DOCUMENT_PATH;
const TOOL_ID=/^[a-z][a-z0-9-]{1,39}$/;
const PREVIEW_ID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const HOST_INSTANCE_ID=/^[A-Za-z0-9._:-]{1,128}$/;
const PAGE_SLUG=/^[a-z][a-z0-9-]{0,39}$/;
export const validToolId=id=>typeof id==='string'&&TOOL_ID.test(id);
export const validPreviewId=id=>typeof id==='string'&&PREVIEW_ID.test(id);
export const validHostInstanceId=id=>typeof id==='string'&&HOST_INSTANCE_ID.test(id);
export function toolDocumentIdentity(baseAddress,address){
  try{
    const base=new URL(baseAddress),url=new URL(address);
    const app=base.pathname===APP_DOCUMENT_PATHNAME;
    if(base.protocol!=='chrome-extension:'||
       ![SIDEPANEL_DOCUMENT_PATHNAME,APP_DOCUMENT_PATHNAME].includes(base.pathname)||
       url.protocol!==base.protocol||url.host!==base.host||url.pathname!==base.pathname||
       url.hash||url.username||url.password)return null;
    const pairs=[...url.searchParams],keys=new Set(pairs.map(([key])=>key));
    const allowed=app?['hostInstanceId','toolId','view','section']:
      ['hostInstanceId','toolId','previewId','scheduledRunner','view','section'];
    if(pairs.length!==keys.size||[...keys].some(key=>!allowed.includes(key)))return null;
    const hostInstanceId=url.searchParams.get('hostInstanceId');
    const toolId=url.searchParams.get('toolId');
    const previewId=url.searchParams.get('previewId');
    const scheduledRunner=url.searchParams.get('scheduledRunner');
    const ownPage=keys.has('view')||keys.has('section');
    if(pairs.length&&(!validHostInstanceId(hostInstanceId)||pairs.length>(ownPage?4:2)))return null;
    if(app){
      if(!validToolId(toolId)||previewId||scheduledRunner||keys.has('section')&&!keys.has('view')||
         keys.has('view')&&!PAGE_SLUG.test(url.searchParams.get('view')||'')||
         keys.has('section')&&!PAGE_SLUG.test(url.searchParams.get('section')||''))return null;
    }else{
      // Saved Side Panel deep-links remain strictly settings+section.
      if(ownPage&&(!validToolId(toolId)||previewId||scheduledRunner||
         url.searchParams.get('view')!=='settings'||
         !PAGE_SLUG.test(url.searchParams.get('section')||'')||
         !keys.has('view')||!keys.has('section')))return null;
      if(keys.has('scheduledRunner')&&(scheduledRunner!=='1'||toolId||previewId))return null;
      if(keys.has('toolId')&&!validToolId(toolId)||keys.has('previewId')&&!validPreviewId(previewId)||
         toolId&&previewId)return null;
    }
    return {hostInstanceId,toolId,previewId,scheduledRunner:scheduledRunner==='1',
      hasLocator:Boolean(toolId||previewId||scheduledRunner)};
  }catch{return null;}
}
