/** Pure Chrome Side Panel identity check; no TSX/UI/runtime imports. */
export async function isActualSidePanelContext({api,href}={}){
  if(!api?.runtime?.getContexts||typeof href!=='string'||!href)return false;
  try{
    const contexts=await api.runtime.getContexts({
      contextTypes:['SIDE_PANEL'],documentUrls:[href]
    });
    return Array.isArray(contexts)&&contexts.some(row=>
      row?.contextType==='SIDE_PANEL'&&row.documentUrl===href&&
      typeof row.documentId==='string'&&row.documentId.length>0);
  }catch{return false;}
}
