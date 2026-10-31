import {showPageToast} from '../../scripting/user-scripts/page-toast.js';

// Trusted adapters supply their existing authorization and live target checks.
// This is not a sandbox RPC, permission grant, or arbitrary-script interface.
export async function requestPageToast({api,currentPageTarget,assertCurrent,assertInstalled,id,message,variant,duration,position}){
  assertCurrent();
  const target=currentPageTarget.capture();
  let url;
  try{url=new URL(target.url);}catch{/* Rejected below. */}
  if(!Number.isSafeInteger(target.tabId)||target.tabId<0||!target.documentId||
    !url||!['http:','https:'].includes(url.protocol)||url.origin!==target.origin)
    throw Object.assign(new Error('Page toast requires a live webpage'),{code:'E_UI_DOCUMENT'});
  await currentPageTarget.revalidate(target);
  await assertInstalled();
  assertCurrent();
  const live=currentPageTarget.capture();
  if(['windowId','tabId','documentId','url','origin'].some(key=>live[key]!==target[key]))
    throw Object.assign(new Error('Page changed before feedback'),{code:'E_DOCUMENT_STALE'});
  const results=await api.scripting.executeScript({target:{tabId:target.tabId,documentIds:[target.documentId]},
    world:'ISOLATED',func:showPageToast,args:[{id,message,variant,duration,position}]});
  const receipt=results?.find(row=>row.documentId===target.documentId&&row.frameId===0);
  return {shown:receipt?.result?.shown===true};
}
