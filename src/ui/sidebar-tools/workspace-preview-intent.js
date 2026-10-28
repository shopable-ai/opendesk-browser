// A short-lived trusted UI handoff, never a Native or installed-tool grant.
const PREFIX='opendesk.tool-workspace-preview.intent.v1:';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const SOURCE=/^source-[a-f0-9]{24}$/,TOOL=/^[a-z][a-z0-9-]{1,39}$/;
const fail=()=>{throw new Error('实时预览入口已失效，请从开发页重新打开');};
export async function openToolPreviewWorkspace({api,sourceId,toolId=null,surface='tab',now=Date.now(),id=crypto.randomUUID()}){
  if(!SOURCE.test(sourceId)||!UUID.test(id)||!(toolId===null||TOOL.test(toolId))||
    !['tab','sidepanel'].includes(surface))fail();
  // A Side Panel intent is bound to its initiating Chrome window. The Workspace
  // must still prove its Native source lease before publishing any snapshot.
  const windowId=surface==='sidepanel'?(await api.windows.getCurrent())?.id:null;
  if(surface==='sidepanel'&&(!Number.isSafeInteger(windowId)||windowId<0))fail();
  const key=PREFIX+id;
  await api.storage.session.set({[key]:{sourceId,toolId,expiresAt:now+60000,
    ...(surface==='sidepanel'?{surface,windowId}:{})}});
  try{
    return await api.tabs.create({url:api.runtime.getURL('native-agent/workspace.html')+
      '?sourceId='+encodeURIComponent(sourceId)+'&previewIntent='+id});
  }catch(error){await api.storage.session.remove(key).catch(()=>{});throw error;}
}
export async function consumeToolPreviewIntent({api,id,sourceId,windowId=null,
  now=Date.now,lockManager=globalThis.navigator?.locks}){
  if(!UUID.test(id)||!SOURCE.test(sourceId))fail();
  // All extension documents share this Web Lock. A copied URL cannot consume
  // the same user gesture twice, including a racing second Workspace page.
  if(typeof lockManager?.request!=='function')fail();
  return lockManager.request(PREFIX+id,async()=>{
    const key=PREFIX+id,value=(await api.storage.session.get(key))[key];
    const time=typeof now==='function'?now():now;
    const sidepanel=value?.surface==='sidepanel';
    if(!value||Object.keys(value).sort().join(',')!==
      (sidepanel?'expiresAt,sourceId,surface,toolId,windowId':'expiresAt,sourceId,toolId')||
      (sidepanel&&(!Number.isSafeInteger(windowId)||windowId!==value.windowId))||
      value.sourceId!==sourceId||!(value.toolId===null||TOOL.test(value.toolId))||
      !Number.isSafeInteger(value.expiresAt)||value.expiresAt<=time||value.expiresAt>time+60000)fail();
    await api.storage.session.remove(key);
    return Object.freeze({sourceId:value.sourceId,toolId:value.toolId,
      surface:sidepanel?'sidepanel':'tab',windowId:sidepanel?value.windowId:null});
  });
}
