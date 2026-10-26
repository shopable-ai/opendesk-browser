// Display only. A shortened title never grants navigation or Host authority.
// The owning tool keeps its full page label and existing Back/dirty-state policy.
const COMPACT_PAGE_LABELS=Object.freeze({
  '提示词详情':'详情',
  '摘录详情':'详情',
  '新建书签':'新建',
  '新建文件夹':'新建',
  '新建提示词':'新建',
  '新建便签':'新建',
  '编辑书签':'编辑',
  '编辑文件夹':'编辑',
  '编辑提示词':'编辑',
  '编辑摘录':'编辑',
  '编辑知识':'编辑'
});

function resolveTitle({toolTitle='',pageTitle='',isSettings=false,isHome=false}={}){
  const tool=typeof toolTitle==='string'?toolTitle.trim():'';
  if(!tool)return {tool:'',page:'',fullPage:''};
  let fullPage=isSettings?'设置':isHome?'':typeof pageTitle==='string'?pageTitle.trim():'';
  if(fullPage.startsWith(tool+' / '))fullPage=fullPage.slice(tool.length+3);
  if(fullPage===tool||fullPage==='首页')fullPage='';
  const leaf=fullPage.split(' / ').at(-1)||'';
  // Admitted page labels may be "constructor" or "__proto__". Only own
  // dictionary entries are replacements; unknown names remain strings.
  const page=Object.hasOwn(COMPACT_PAGE_LABELS,leaf)?COMPACT_PAGE_LABELS[leaf]:leaf;
  return {tool,page,fullPage};
}

// Normalize once, then supply the visible and accessible strings to one node.
export function formatSidebarToolHeading(options={}){
  const {tool,page,fullPage}=resolveTitle(options);
  if(!tool)return {visible:'',context:''};
  const readOnly=typeof options.readOnlyLabel==='string'?options.readOnlyLabel.trim():'';
  const suffix=readOnly?` · ${readOnly}`:'';
  return {
    visible:`${page||tool}${suffix}`,
    context:`${tool}${fullPage?' / '+fullPage:''}${suffix}`
  };
}

// Existing internal helpers remain compatible. Host calls the combined formatter.
export function sidebarToolTitleParts(options={}){
  const {tool,page}=resolveTitle(options);
  return {tool,page};
}
export function formatSidebarToolTitle(options={}){
  return formatSidebarToolHeading(options).visible;
}
export function formatSidebarToolTitleContext(options={}){
  return formatSidebarToolHeading(options).context;
}
