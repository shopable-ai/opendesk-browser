// Fixed first-party distribution metadata. Never an authority source by itself.
// A release is installable only when its exact packaged bytes pass the host validator.
// Presentation copy is optional: registering a new tool only needs the source
// catalog. Current versions, titles and capabilities always come from releases.
const APP_PRESENTATION = Object.freeze([
  {id:'opendesk/time-review',toolId:'time-review',category:'效率',author:'OpenDesk',summary:'明确开始后，在本机回顾聚焦、非空闲网站的使用时长。',sites:'HTTP(S) 网页；需明确开启与空闲检测授权',surfaces:['侧边栏','独立标签页','MV3 后台'],features:['今日与七天','网站排行','暂停恢复','本机 JSON / CSV 导出'],media:'time',externalWeb:{label:'打开旧版时间清单网站',url:'https://todo6.com/',verifiedAt:'2026-10-11',source:'docs/contracts/source-snapshots/todo-src-bex/src-bex/background.ts:446'}},
  {id:'opendesk/reading-toc',toolId:'reading-toc',category:'阅读',author:'OpenDesk',summary:'浏览网页章节、快速定位标题，可选网页悬浮目录。',sites:'普通 HTTP(S) 网页默认可用；支持按网站停用',surfaces:['侧边栏','网页目录'],features:['多级标题导航','网站与页面例外','悬浮目录'],media:'chapters'},
  {id:'opendesk/web-markdown-clipper',toolId:'web-markdown-clipper',category:'阅读',author:'OpenDesk',summary:'按需把已授权网页的正文或选区整理为 Markdown。',sites:'普通 HTTP(S) 网页；正文读取单独授权',surfaces:['侧边栏'],features:['正文与选区','复制 Markdown','下载文件'],media:'clip'},
  {id:'opendesk/quick-notes',toolId:'quick-notes',category:'笔记',author:'OpenDesk',summary:'独立保存简短笔记，也可主动关联网页标题与链接。',sites:'本地笔记；关联网页由你主动选择',surfaces:['侧边栏','独立标签页'],features:['本机存储','关联网页','快速编辑'],media:'notes'},
  {id:'opendesk/markdown-workbench',toolId:'markdown-workbench',category:'Markdown',author:'OpenDesk',summary:'离线编辑、预览与导入导出 Markdown。',sites:'无需网站权限',surfaces:['侧边栏','独立标签页'],features:['源码与预览','本地文件导入','导出 Markdown'],media:'markdown'},
  {id:'opendesk/cookie-editor',toolId:'cookie-editor',category:'开发工具',author:'OpenDesk',summary:'离线模拟 Cookie 新增、编辑、删除以及 JSON、Header、Netscape 导入导出。',sites:'本地临时工作区；当前尚不读取或修改浏览器 Cookie',surfaces:['侧边栏','独立标签页'],features:['Cookie 列表与属性','多格式导入导出','本地编辑与清空'],media:'cookies'},
  {id:'opendesk/knowledge-inbox',toolId:'knowledge-inbox',category:'AI',author:'OpenDesk',summary:'在获授权的 ChatGPT 页面按点击保存回答、图片及想法。',sites:'chatgpt.com；按网站单独授权',surfaces:['侧边栏','ChatGPT 页面'],features:['保存回答','整理收件箱','显式导出'],media:'inbox'}
]);
export const OFFICIAL_COLLECTIONS = Object.freeze([
  {id:'reading-kit',revision:4,title:'阅读与摘录',description:'目录、剪藏与网页笔记；固定阅读目录 1.0.4 默认网站可用性的组合。',
    members:[{id:'opendesk/reading-toc',version:'1.0.4'},{id:'opendesk/web-markdown-clipper',version:'1.0.0'},{id:'opendesk/quick-notes',version:'1.1.8'}]},
  {id:'reading-kit',revision:3,title:'阅读与摘录',description:'目录、剪藏与网页笔记；包含网页笔记 1.1.8 窄屏修复的固定组合。',
    members:[{id:'opendesk/reading-toc',version:'1.0.3'},{id:'opendesk/web-markdown-clipper',version:'1.0.0'},{id:'opendesk/quick-notes',version:'1.1.8'}]},
  {id:'reading-kit',revision:2,title:'阅读与摘录',description:'目录、剪藏与网页笔记；2026-10-12 固定版本组合。',
    members:[{id:'opendesk/reading-toc',version:'1.0.3'},{id:'opendesk/web-markdown-clipper',version:'1.0.0'},{id:'opendesk/quick-notes',version:'1.1.6'}]},
  {id:'reading-kit',revision:1,title:'阅读与摘录',description:'从章节导航到剪藏，再把想法写进笔记。',
    members:[{id:'opendesk/reading-toc',version:'1.0.2'},{id:'opendesk/web-markdown-clipper',version:'1.0.0'},{id:'opendesk/quick-notes',version:'1.1.1'}]}
]);
export function officialMarketApps(catalog){
  return catalog.apps.map(row=>{
    const copy=APP_PRESENTATION.find(item=>item.id===row.id);
    return {...copy,category:copy?.category||'工具',author:'OpenDesk',
      sites:copy?.sites||'网站访问需独立授权',surfaces:copy?.surfaces||['侧边栏'],
      features:copy?.features||[],...row,title:row.packageTitle,summary:copy?.summary||row.description};
  });
}
export const getOfficialCollection = (id,revision) =>
  OFFICIAL_COLLECTIONS.find(row=>row.id===id&&row.revision===revision)||null;
