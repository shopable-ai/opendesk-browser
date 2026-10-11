// Fixed first-party distribution metadata. Never an authority source by itself.
// A release is installable only when its exact packaged bytes pass the host validator.
export const MARKET_SCHEMA = 'opendesk.market.catalog.v1';
export const OFFICIAL_APPS = Object.freeze([
  {id:'opendesk/reading-toc',toolId:'reading-toc',version:'1.0.2',title:'阅读目录',category:'阅读',author:'OpenDesk',summary:'浏览网页章节、快速定位标题，可选网页悬浮目录。',sites:'普通 HTTP(S) 网页；按网站单独授权',surfaces:['侧边栏','网页目录'],features:['多级标题导航','独立站点授权','悬浮目录'],media:'chapters'},
  {id:'opendesk/web-markdown-clipper',toolId:'web-markdown-clipper',version:'1.0.0',title:'网页剪藏',category:'阅读',author:'OpenDesk',summary:'按需把已授权网页的正文或选区整理为 Markdown。',sites:'普通 HTTP(S) 网页；正文读取单独授权',surfaces:['侧边栏'],features:['正文与选区','复制 Markdown','下载文件'],media:'clip'},
  {id:'opendesk/quick-notes',toolId:'quick-notes',version:'1.1.1',title:'网页笔记',category:'笔记',author:'OpenDesk',summary:'独立保存简短笔记，也可主动关联网页标题与链接。',sites:'本地笔记；关联网页由你主动选择',surfaces:['侧边栏','独立标签页'],features:['本机存储','关联网页','快速编辑'],media:'notes'},
  {id:'opendesk/markdown-workbench',toolId:'markdown-workbench',version:'1.0.0',title:'Markdown 工作台',category:'Markdown',author:'OpenDesk',summary:'离线编辑、预览与导入导出 Markdown。',sites:'无需网站权限',surfaces:['侧边栏','独立标签页'],features:['源码与预览','本地文件导入','导出 Markdown'],media:'markdown'},
  {id:'opendesk/knowledge-inbox',toolId:'knowledge-inbox',version:'1.0.0',title:'ChatGPT 知识收件箱',category:'AI',author:'OpenDesk',summary:'在获授权的 ChatGPT 页面按点击保存回答、图片及想法。',sites:'chatgpt.com；按网站单独授权',surfaces:['侧边栏','ChatGPT 页面'],features:['保存回答','整理收件箱','显式导出'],media:'inbox'}
]);
export const OFFICIAL_COLLECTIONS = Object.freeze([
  {id:'reading-kit',revision:1,title:'阅读与摘录',description:'从章节导航到剪藏，再把想法写进笔记。',
    members:[{id:'opendesk/reading-toc',version:'1.0.2'},{id:'opendesk/web-markdown-clipper',version:'1.0.0'},{id:'opendesk/quick-notes',version:'1.1.1'}]}
]);
export const getOfficialApp = id => OFFICIAL_APPS.find(row=>row.id===id)||null;
export const getOfficialCollection = (id,revision) =>
  OFFICIAL_COLLECTIONS.find(row=>row.id===id&&row.revision===revision)||null;
export const officialPackagePath = app => 'sidebar-tools/'+app.toolId+'.opendesk-tool.json';
