// Trusted ToolHost display-only title. The tool or sandbox owns real Back
// behavior; this formatter neither carries nor infers navigation authority.
export function formatSidebarToolTitle({
  toolTitle='',pageTitle='',isSettings=false,isHome=false,readOnlyLabel=''
}={}){
  if(typeof toolTitle!=='string'||!toolTitle.trim())return '';
  const tool=toolTitle.trim();
  const child=isSettings?'设置':isHome?'':typeof pageTitle==='string'?pageTitle.trim():'';
  // Root titles and already-qualified child paths must not be repeated.
  const page=child===tool||child==='首页'?'':child;
  const path=!page?tool:page.startsWith(tool+' / ')?page:`${tool} / ${page}`;
  return typeof readOnlyLabel==='string'&&readOnlyLabel.trim()?
    `${path} · ${readOnlyLabel.trim()}`:path;
}
