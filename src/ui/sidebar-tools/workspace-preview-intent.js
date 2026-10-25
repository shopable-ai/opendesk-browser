// A short-lived trusted UI handoff, never a Native or installed-tool grant.
const PREFIX='opendesk.tool-workspace-preview.intent.v1:';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const SOURCE=/^source-[a-f0-9]{24}$/,TOOL=/^[a-z][a-z0-9-]{1,39}$/;
const fail=()=>{throw new Error('实时预览入口已失效，请从开发页重新打开');};
export async function openToolPreviewWorkspace({api,sourceId,toolId=null,now=Date.now(),id=crypto.randomUUID()}){
  if(!SOURCE.test(sourceId)||!UUID.test(id)||!(toolId===null||TOOL.test(toolId)))fail();
  const key=PREFIX+id;
  await api.storage.session.set({[key]:{sourceId,toolId,expiresAt:now+60000}});
  try{
    return await api.tabs.create({url:api.runtime.getURL('native-agent/workspace.html')+
      '?sourceId='+encodeURIComponent(sourceId)+'&previewIntent='+id});
  }catch(error){await api.storage.session.remove(key).catch(()=>{});throw error;}
}
export async function consumeToolPreviewIntent({api,id,sourceId,now=Date.now,lockManager=globalThis.navigator?.locks}){
  if(!UUID.test(id)||!SOURCE.test(sourceId))fail();
  // All extension documents share this Web Lock. A copied URL cannot consume
  // the same user gesture twice, including a racing second Workspace page.
  if(typeof lockManager?.request!=='function')fail();
  return lockManager.request(PREFIX+id,async()=>{
    const key=PREFIX+id,value=(await api.storage.session.get(key))[key];
    const time=typeof now==='function'?now():now;
    if(!value||Object.keys(value).sort().join(',')!=='expiresAt,sourceId,toolId'||
      value.sourceId!==sourceId||!(value.toolId===null||TOOL.test(value.toolId))||
      !Number.isSafeInteger(value.expiresAt)||value.expiresAt<=time||value.expiresAt>time+60000)fail();
    await api.storage.session.remove(key);
    return Object.freeze({sourceId:value.sourceId,toolId:value.toolId});
  });
}
