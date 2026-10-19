/** Pure Chrome Side Panel identity check; no TSX/UI/runtime imports. */
import {toolDocumentIdentity,SIDEPANEL_DOCUMENT_PATH} from '../tool-document-url.js';
export async function isActualSidePanelContext({api,href}={}){
  if(!api?.runtime?.getContexts||typeof href!=='string'||!href)return false;
  try{
    if(!toolDocumentIdentity(api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH),href))return false;
    const contexts=await api.runtime.getContexts({
      contextTypes:['SIDE_PANEL'],documentUrls:[href]
    });
    return Array.isArray(contexts)&&contexts.some(row=>
      row?.contextType==='SIDE_PANEL'&&row.documentUrl===href&&!row.incognito&&
      (row.frameId===undefined||row.frameId===0)&&
      (!row.documentLifecycle||row.documentLifecycle==='active')&&
      typeof row.documentId==='string'&&row.documentId.length>0);
  }catch{return false;}
}
