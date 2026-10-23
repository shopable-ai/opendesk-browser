// Test-only native Chrome Side Panel discovery. Never used by the product Host or SDK.
// CDP "tab" wrappers and ordinary extension tabs are not SIDE_PANEL documents.
// An early getContexts snapshot can become stale when Chrome creates/replaces
// the document or sidepanel.html acquires a hostInstanceId.
import assert from 'node:assert/strict';

export function sidePanelDocumentTarget(target,extensionId,excludeTargetIds=[]) {
  if(!target||!['page','other'].includes(target.type)||
    excludeTargetIds.includes(target.targetId))return false;
  try {
    const url=new URL(target.url);
    return url.protocol==='chrome-extension:'&&url.host===extensionId&&
      url.pathname==='/sidepanel.html';
  } catch {return false;}
}

/**
 * All pieces must belong to the SAME, current document. A past Context
 * documentId is evidence of a previous document, not an attachment key.
 * A matching URL alone cannot authenticate a normal extension tab.
 */
export function verifiedSidePanelDocument({target,identity,extensionId}) {
  if(!sidePanelDocumentTarget(target,extensionId)||
    !identity?.realPanel||typeof identity.href!=='string'||
    identity.currentTabId!==null||
    typeof identity.hostInstanceId!=='string'||!identity.hostInstanceId)return null;
  let href;
  try {href=new URL(identity.href);}catch{return null;}
  if(href.protocol!=='chrome-extension:'||href.host!==extensionId||
    href.pathname!=='/sidepanel.html'||
    href.searchParams.get('hostInstanceId')!==identity.hostInstanceId||
    target.url!==href.href)return null;
  const contexts=(Array.isArray(identity.contexts)?identity.contexts:[]).filter(row=>{
    if(row?.contextType!=='SIDE_PANEL'||!row.documentId)return false;
    try {
      const url=new URL(row.documentUrl);
      return url.protocol==='chrome-extension:'&&url.host===extensionId&&
        url.pathname==='/sidepanel.html';
    }catch{return false;}
  });
  // Never guess which of two windows/panels belongs to the action under test.
  if(contexts.length!==1)return null;
  const current=contexts[0];
  if(current.documentUrl!==href.href||
    current.documentOrigin!=='chrome-extension://'+extensionId||
    current.frameId!==0||current.tabId!==-1)return null;
  return current;
}

/**
 * Attach with the caller's EXISTING CDP connection and native input helpers.
 * A successful attachment is returned only after evaluating the real document,
 * re-reading its live SIDE_PANEL context and refreshing the CDP target URL.
 * Every unsuccessful candidate is detached; ambiguity fails closed.
 */
export async function attachVerifiedSidePanel({
  client,extensionId,excludeTargetIds=[],attachTarget,evaluate,until,
  timeout=25000,onFailure=()=>{}
}) {
  assert.match(extensionId,/^[a-p]{32}$/,'actual installed Chrome extension ID');
  let lastDiagnostic={};
  try {
    return await until(async()=>{
      const candidates=(await client.send('Target.getTargets',{filter:[{}]})).targetInfos
        .filter(target=>sidePanelDocumentTarget(target,extensionId,excludeTargetIds));
      const accepted=[],observed=[];
      for(const candidate of candidates) {
        let session=null;
        try {
          session=await attachTarget(candidate.targetId);
          const identity=await evaluate(session,`(async()=>{
            const href=location.href;
            const tab=await chrome.tabs.getCurrent();
            return {href,hostInstanceId:new URL(href).searchParams.get('hostInstanceId'),
              currentTabId:tab?.id??null,
              contexts:await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}),
              realPanel:!!document.querySelector('#tab-tools')&&
                !!document.querySelector('#sidebar-tool-frame')};
          })()`);
          const target=(await client.send('Target.getTargetInfo',
            {targetId:candidate.targetId})).targetInfo;
          const context=verifiedSidePanelDocument({target,identity,extensionId});
          observed.push({targetId:candidate.targetId,type:target.type,
            targetUrl:target.url,documentUrl:identity?.href,
            hostInstanceId:identity?.hostInstanceId,
            documentIds:identity?.contexts?.map(row=>row.documentId),
            currentTabId:identity?.currentTabId,verified:!!context});
          if(context) {
            accepted.push({target,session,identity,context});
            session=null;
          }
        }catch(error){
          observed.push({targetId:candidate.targetId,error:String(error)});
        }finally{
          if(session)await client.send('Target.detachFromTarget',
            {sessionId:session}).catch(()=>{});
        }
      }
      lastDiagnostic={candidates:candidates.map(({targetId,type,url})=>({targetId,type,url})),
        observed,acceptedCount:accepted.length};
      if(accepted.length===1)return accepted[0];
      // Even two individually valid targets are not a unique Side Panel.
      for(const row of accepted)await client.send('Target.detachFromTarget',
        {sessionId:row.session}).catch(()=>{});
      return null;
    },'real Side Panel live document, unique context and hostInstanceId',timeout);
  }catch(error){
    onFailure({extensionId,...lastDiagnostic,error:String(error)});
    throw error;
  }
}
