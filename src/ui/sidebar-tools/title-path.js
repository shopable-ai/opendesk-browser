// Presentation labels only: neither the visible title nor its context grants Back or Host authority.
// Keep business navigation titles untouched for the owning tool and screen-reader context.
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
  if(typeof toolTitle!=='string'||!toolTitle.trim())return {tool:'',page:'',fullPage:''};
  const tool=toolTitle.trim();
  let fullPage=isSettings?'设置':isHome?'':typeof pageTitle==='string'?pageTitle.trim():'';
  if(fullPage.startsWith(tool+' / '))fullPage=fullPage.slice(tool.length+3);
  if(fullPage===tool||fullPage==='首页')fullPage='';
  const leaf=fullPage.split(' / ').at(-1);
  return {tool,page:COMPACT_PAGE_LABELS[leaf]||leaf,fullPage};
}

export function sidebarToolTitleParts(options={}){
  const {tool,page}=resolveTitle(options);
  return {tool,page};
}

function appendReadOnly(text,readOnlyLabel){
  return typeof readOnlyLabel==='string'&&readOnlyLabel.trim()?
    `${text} · ${readOnlyLabel.trim()}`:text;
}

export function formatSidebarToolTitle(options={}){
  const {tool,page}=resolveTitle(options);
  return tool?appendReadOnly(page||tool,options.readOnlyLabel):'';
}

export function formatSidebarToolTitleContext(options={}){
  const {tool,fullPage}=resolveTitle(options);
  return tool?appendReadOnly(fullPage?`${tool} / ${fullPage}`:tool,options.readOnlyLabel):'';
}
