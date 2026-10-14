// Shared URL gate for fixed extension-owned tool hosts. Services additionally
// validate the live document/context, installation, capability and epoch.
export function isSidebarToolHostSender(api,sender,expectedToolId=null) {
  if(!api?.runtime?.id || sender?.id!==api.runtime.id || typeof sender.url!=='string')return false;
  try {
    const source=new URL(sender.url), shell=new URL(api.runtime.getURL('ui/tool.html'));
    const token=source.searchParams.get('hostInstanceId');
    return source.protocol===shell.protocol && source.host===shell.host && source.pathname===shell.pathname &&
      !source.hash && (source.searchParams.size===1 || source.searchParams.size===2 &&
      typeof expectedToolId==='string' && source.searchParams.get('toolId')===expectedToolId &&
      /^[a-z][a-z0-9-]{1,39}$/.test(expectedToolId)) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token||'');
  }catch{return false;}
}
