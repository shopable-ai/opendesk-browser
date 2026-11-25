const localCapabilities=new Set(['storage.local','user.export']);
export function isPortableSidebarPackage(tool){
  return !tool.pageModule&&!tool.controller&&!tool.background&&!tool.backgroundPolicy&&
    !tool.contributes?.contextMenus?.length&&tool.capabilities.every(capability=>localCapabilities.has(capability));
}
export function matchesRecoveryRelease(entry,release){
  return entry?.kind==='app'&&entry.source==='official'&&entry.enabled===true&&
    release?.installationPolicy==='optional'&&!release.remoteCommit&&!release.sourceId&&
    release.toolId===entry.id&&release.id==='opendesk/'+entry.id&&
    release.version===entry.version&&release.sha256===entry.hash&&
    release.capabilities.every(capability=>localCapabilities.has(capability));
}
