// The only Side Panel caller for the preloaded, existing Sidebar Tools host.
// Fixed HTML loads sidebar-tool-host.js first; sandbox scripts never see this global.
export function createSidebarTools(options){
  const fn=globalThis.__opendeskCreateSidebarTools;
  if(typeof fn!=='function')throw new Error('E_TRUSTED_TOOL_HOST_MISSING: fixed Sidebar Tools host did not load');
  return fn(options);
}
