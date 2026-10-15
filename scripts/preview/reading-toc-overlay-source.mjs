// Preview-only adapter: mounts the EXACT trusted webpage view + placement + common locale
// sources in a simulated article. The real content script still owns all navigation,
// policy, indexing and storage in production; none of those APIs are mocked as grants.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=url=>readFile(url,'utf8');
const sha256=s=>createHash('sha256').update(s).digest('hex');
const dataUrl=source=>'data:text/javascript;base64,'+Buffer.from(source,'utf8').toString('base64');

export async function readingTocOverlayPreview({scenario='success',locale='zh-CN'}={}){
  const [view,placement,uiLocale,catalog]=await Promise.all([
    read(new URL('../../src/reading-toc/view.js',import.meta.url)),
    read(new URL('../../src/reading-toc/placement.js',import.meta.url)),
    read(new URL('../../src/ui/app-localization.js',import.meta.url)),
    read(new URL('../../examples/sidebar-tools/reading-toc/locales.json',import.meta.url))
  ]);
  const imports=[
    "import {readTocPlacement,tocViewport,tocClampPoint,tocPlacementFromPoint,tocPlacementPoint} from './placement.js';",
    "import readingTocCatalog from './locales.generated.js';",
    "import {uiMessage,resolveUiLocale} from '../ui/app-localization.js';"
  ];
  if(!imports.every(item=>view.includes(item)))throw Error('E_TOC_PREVIEW_SOURCE_IMPORTS');
  let viewCode=view;
  for(const item of imports)viewCode=viewCode.replace(item,'');
  if(/^\s*import\s/m.test(viewCode)||/^\s*import\s/m.test(placement)||/^\s*import\s/m.test(uiLocale))
    throw Error('E_TOC_PREVIEW_SOURCE_GRAPH');
  const fixture=`
const sampleItems=[
 {id:'h-1',sourceId:'s-1',label:'OpenDesk Browser 阅读指南',depth:0,topId:'h-1'},
 {id:'h-2',sourceId:'s-1',label:'产品目标',depth:1,topId:'h-1'},
 {id:'h-3',sourceId:'s-1',label:'安装与开始使用',depth:1,topId:'h-1'},
 {id:'h-4',sourceId:'s-1',label:'常用操作',depth:0,topId:'h-4'},
 {id:'h-5',sourceId:'s-1',label:'快速打开工具',depth:1,topId:'h-4'},
 {id:'h-6',sourceId:'s-1',label:'按需刷新目录',depth:1,topId:'h-4'},
 {id:'h-7',sourceId:'s-1',label:'多语言界面',depth:1,topId:'h-4'},
 {id:'h-8',sourceId:'s-1',label:'数据安全',depth:0,topId:'h-8'},
 {id:'h-9',sourceId:'s-1',label:'扩展权限说明',depth:1,topId:'h-8'}
];
let scenario=${JSON.stringify(scenario)};
let locale=${JSON.stringify(locale)};
let selected='h-2';
let position=null;
const stage=document.querySelector('#simulated-stage');
const surface=createReadingTocView({
 doc:document,win:window,initialLocale:locale,
 onPlacementChange:next=>{position=next;},
 onNavigate:(id,sourceId)=>{
  if(sourceId!=='s-1'||!sampleItems.some(row=>row.id===id))return;
  selected=id;
  document.getElementById(id)?.scrollIntoView({block:'start'});
  render();
  parent.postMessage({kind:'opendesk-toc-preview-navigation',label:sampleItems.find(row=>row.id===id).label},'*');
 }
});
function render(){
 const show=scenario==='success';
 stage.textContent=show?'模拟文章 · 章节保留原文':
   scenario==='empty'?'模拟空目录：当前网页没有可识别的标题':
   scenario==='loading'?'模拟加载状态：网页章节暂未读取完成':
   scenario==='permission-denied'||scenario==='untrusted'?'模拟授权受限：未读取真实页面':
   '模拟读取错误：不访问网页或网络';
 const items=show?sampleItems:[];
 surface.render({
   items,sources:show?[{id:'s-1',label:'当前文章'}]:[],activeId:show?selected:'',
   overview:show?{'s-1':{ids:['h-1','h-4','h-8'],hiddenCount:6,representedId:'h-1'}}:{}
 });
}
window.addEventListener('message',event=>{
 if(event.source!==parent||!event.data||typeof event.data!=='object')return;
 if(event.data.kind==='opendesk-toc-preview-locale'&&['zh-CN','en'].includes(event.data.locale)){
   locale=event.data.locale;surface.setLocale(locale);
 }
 if(event.data.kind==='opendesk-toc-preview-scenario'&&
  ['success','empty','error','loading','permission-denied','untrusted'].includes(event.data.scenario)){
   scenario=event.data.scenario;render();
 }
});
render();
`;
  const moduleSource=placement+'\n'+uiLocale+'\n'+
    'const readingTocCatalog='+JSON.stringify(JSON.parse(catalog))+';\n'+viewCode+'\n'+fixture;
  const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src data:; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>Reading TOC · 可信网页悬浮源码模拟</title>
<style>
html{scroll-behavior:auto}body{min-height:920px;margin:0;padding:14px 18px;background:#fafaf8;color:#252c38;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
#simulated-stage{margin-bottom:8px;font-size:11px;color:#7e8491}
article{max-width:480px}article h1{font-size:21px;margin:14px 0}article h2{font-size:15px;margin:44px 0 7px}
article p{max-width:310px;color:#737987;line-height:1.8;margin:0}
</style></head><body>
<div id="simulated-stage" role="status">模拟网页 · 未连接任何网站</div>
<article aria-label="模拟文章，标题原文保持不变">
<h1 id="h-1">OpenDesk Browser 阅读指南</h1><h2 id="h-2">产品目标</h2><p>以下模拟文章仅用于展示真实的可信网页悬浮目录 UI。</p>
<h2 id="h-3">安装与开始使用</h2><p>点击右侧真实悬浮目录的条目，在模拟文章内导航。</p>
<h1 id="h-4">常用操作</h1><h2 id="h-5">快速打开工具</h2><p>中文与英文切换不翻译网页标题。</p>
<h2 id="h-6">按需刷新目录</h2><h2 id="h-7">多语言界面</h2><h1 id="h-8">数据安全</h1><h2 id="h-9">扩展权限说明</h2>
</article><script type="module" src="${dataUrl(moduleSource)}"></script></body></html>`;
  return Object.freeze({html,sourceSha256:sha256(JSON.stringify([view,placement,uiLocale,catalog])),
    moduleSha256:sha256(moduleSource),realView:true,mockData:true});
}
