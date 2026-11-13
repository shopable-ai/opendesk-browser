// Cookie Editor alone may ignore visual-only changes while preserving the
// established navigation contract for every other tool.
export function classifyCookiePageTransition(previous,current){
  // Chromium also emits loading for History API updates. Keep only the
  // redacted view fenced while identity is unresolved; this is never a target
  // or a grant. A real onBeforeNavigate always invalidates immediately.
  if(previous?.status==='available'&&current?.status==='unavailable'&&
    current.reason==='E_DOCUMENT_UNRESOLVED'&&current.navigationStarted!==true&&
    current.windowId===previous.windowId&&Number.isSafeInteger(current.tabId)&&
    current.tabId===previous.tabId)return 'pending';
  if(!previous||!current||previous.status!=='available'||current.status!=='available')
    return 'invalidate';
  for(const key of ['windowId','tabId','frameId','documentId','origin']){
    if((!previous[key]&&previous[key]!==0)||(!current[key]&&current[key]!==0)||
      previous[key]!==current[key])return 'invalidate';
  }
  try{
    const a=new URL(previous.url),b=new URL(current.url);
    if(!['http:','https:'].includes(a.protocol)||!['http:','https:'].includes(b.protocol)||
       a.origin!==previous.origin||b.origin!==current.origin||a.origin!==b.origin)
      return 'invalidate';
    // Only Path may affect this same-document, site-exact-host Cookie view.
    return a.pathname===b.pathname?'ignore':'sync';
  }catch{return 'invalidate';}
}
