// Trusted active-document references for the existing Browser SDK Host.
// Never grant an Owned TabRef for an arbitrary selected page.
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const REF=/^[A-Za-z0-9_-]{16,160}$/;
const validId=n=>Number.isSafeInteger(n)&&n>=0;
function isHttp(value){
  try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&
    !u.username&&!u.password&&u.href===value?u:null}
  catch{return null}
}
export function createCurrentPageReferences({api=globalThis.chrome,clock=Date,
  makeRef=()=>crypto.randomUUID()}={}){
  const refs=new Map(),TTL=60000,CAP=64;
  const owner=c=>{
    if(typeof c?.toolId!=='string'||typeof c?.toolVersion!=='string'||
      !/^[a-f0-9]{64}$/.test(c?.packageHash||'')||
      typeof c?.installEpoch!=='string'||!c.installEpoch||
      !/^[0-9a-f-]{36}$/i.test(c?.hostInstanceId||'')||
      !/^[0-9a-f-]{36}$/i.test(c?.toolInstance||''))
      throw fail('E_OWNER','Verified tool instance required');
    return JSON.stringify([c.toolId,c.toolVersion,c.packageHash,c.installEpoch,
      c.hostInstanceId,c.toolInstance]);
  };
  const prune=()=>{for(const [ref,row] of refs)if(row.expiresAt<=clock.now())refs.delete(ref)};
  async function current(d){
    if(!d||!validId(d.tabId)||!validId(d.windowId)||
      typeof d.documentId!=='string'||!d.documentId||d.documentId.length>160||
      typeof d.title!=='string'||d.title.length>512||
      !isHttp(d.url)||d.origin!==new URL(d.url).origin)
      throw fail('E_DOCUMENT_STALE','Invalid trusted page document');
    const same=tab=>tab?.id===d.tabId&&tab.windowId===d.windowId&&tab.active===true&&
      !tab.incognito&&!tab.pendingUrl&&!['loading','unloaded'].includes(tab.status)&&
      tab.url===d.url;
    const a=await api.tabs.query({active:true,windowId:d.windowId});
    if(!Array.isArray(a)||a.length!==1||!same(a[0]))
      throw fail('E_DOCUMENT_STALE','Current active tab changed');
    const frame=await api.webNavigation.getFrame({tabId:d.tabId,frameId:0});
    if(frame?.documentId!==d.documentId||frame?.url!==d.url||frame.errorOccurred||
      frame.documentLifecycle&&frame.documentLifecycle!=='active')
      throw fail('E_DOCUMENT_STALE','Main document changed');
    const b=await api.tabs.query({active:true,windowId:d.windowId});
    if(!Array.isArray(b)||b.length!==1||!same(b[0]))
      throw fail('E_DOCUMENT_STALE','Tab changed during verification');
    return {tabId:d.tabId,windowId:d.windowId,documentId:d.documentId,
      url:d.url,origin:d.origin,title:String(b[0].title||d.title||d.url).slice(0,512)};
  }
  async function issue({document,context}){
    const key=owner(context),value=await current(document);prune();
    for(const row of refs.values())if(row.owner===key&&row.tabId===value.tabId&&
      row.windowId===value.windowId&&row.documentId===value.documentId&&row.url===value.url)
      return {status:'available',url:row.url,title:value.title,
        tabRef:row.tabRef,documentRef:row.documentRef};
    if(refs.size>=CAP)throw fail('E_LIMIT','Current-page reference limit');
    const tabRef=makeRef(),documentRef=makeRef();
    if(!REF.test(tabRef)||!REF.test(documentRef)||tabRef===documentRef||
      refs.has(tabRef)||[...refs.values()].some(row=>row.documentRef===documentRef))
      throw fail('E_CONTEXT','Invalid unique reference');
    refs.set(tabRef,{...value,tabRef,documentRef,owner:key,expiresAt:clock.now()+TTL});
    return {status:'available',url:value.url,title:value.title,tabRef,documentRef};
  }
  async function verify(source,context){
    const key=owner(context),row=refs.get(source?.tabRef);
    if(!row||row.owner!==key||row.documentRef!==source?.documentRef||
      row.url!==source?.url||row.expiresAt<=clock.now()){
      if(row&&row.expiresAt<=clock.now())refs.delete(row.tabRef);
      throw fail('E_DOCUMENT_STALE','Current-page reference expired, forged or revoked');
    }
    await current(row);
    if(refs.get(row.tabRef)!==row||row.expiresAt<=clock.now())
      throw fail('E_DOCUMENT_STALE','Current-page reference invalidated during read');
    return {tabId:row.tabId,windowId:row.windowId,documentId:row.documentId,url:row.url};
  }
  return Object.freeze({issue,verify,
    invalidateTab:id=>{for(const [ref,row] of refs)if(row.tabId===id)refs.delete(ref)},
    revokeAll:()=>refs.clear(),diagnostics:()=>({references:refs.size})});
}
