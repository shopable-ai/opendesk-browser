// Display-only labels. A title never grants navigation or Host authority.
export function sidebarToolTitleParts({toolTitle='',pageTitle='',isSettings=false,isHome=false}={}){
  if(typeof toolTitle!=='string'||!toolTitle.trim())return {tool:'',page:''};
  const tool=toolTitle.trim();
  let page=isSettings?'设置':isHome?'':typeof pageTitle==='string'?pageTitle.trim():'';
  if(page===tool||page==='首页')page='';
  if(page.startsWith(tool+' / '))page=page.slice(tool.length+3);
  return {tool,page};
}

export function formatSidebarToolTitle({
  toolTitle='',pageTitle='',isSettings=false,isHome=false,readOnlyLabel=''
}={}){
  const {tool,page}=sidebarToolTitleParts({toolTitle,pageTitle,isSettings,isHome});
  if(!tool)return '';
  const path=page?`${tool} / ${page}`:tool;
  return typeof readOnlyLabel==='string'&&readOnlyLabel.trim()?
    `${path} · ${readOnlyLabel.trim()}`:path;
}
