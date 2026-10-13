// Sidebar tool UI package contract. This is NOT a Task v1 program or an authority grant.
export const SIDEBAR_TOOL_FORMAT = 'opendesk.sidebar-tool.v1';
export const SIDEBAR_TOOL_FORMAT_V2 = 'opendesk.sidebar-tool.v2';
export const SIDEBAR_TOOL_STORE = 'opendesk.sidebar-tools.installed.v1';
export const SIDEBAR_TOOL_DATA_PREFIX = 'opendesk.sidebar-tools.data.v1:';
export const SIDEBAR_TOOL_PROTOCOL = 'opendesk.sidebar-tool.bridge.v1';
export const MAX_INSTALLED_TOOLS = 12;
export const SIDEBAR_TOOL_DATA_LIMITS=Object.freeze({itemBytes:8192,totalBytes:32768,maxKeys:32});
const MAX_PACKAGE_BYTES = 320000;
const LIMITS = Object.freeze({title:80,description:300,html:64000,css:120000,js:220000});
const CAPABILITIES = Object.freeze(['storage.local','currentPage.read','tasks.open','page.toc','page.clip','user.export','page.capture','knowledge.store','time.review','focus.control']);
const V2_CAPABILITIES = Object.freeze([...CAPABILITIES,'browser.contextMenu','browser.tabs','browser.sidePanel','network',
  'browser.network.observe','browser.events','browser.operations','browser.screenshot']);
const PACKAGE_FIELDS=Object.freeze(['format','id','version','title','description','capabilities','html','css','js']);
const V2_FIELDS=Object.freeze([...PACKAGE_FIELDS,'requires','contributes']);
const MENU_CONTEXTS=Object.freeze(['page','selection','link']);
const fail = (message,code='E_TOOL_SCHEMA') => { const error=new Error(message);error.code=code;throw error; };
const plain = value => value!==null && typeof value==='object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null);
const fields=(obj,keys) => Object.keys(obj).every(key=>keys.includes(key));
const validText=(text,max,optional=false) => typeof text==='string' && text.length<=max && (optional || text.trim().length>0);

export function validateSidebarToolPackage(value) {
  const v2=value?.format===SIDEBAR_TOOL_FORMAT_V2;
  if (!plain(value) || !fields(value,v2?V2_FIELDS:PACKAGE_FIELDS))
    fail('工具包包含不支持的字段');
  if (![SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_FORMAT_V2].includes(value.format) || typeof value.id!=='string' ||
      !/^[a-z][a-z0-9-]{1,39}$/.test(value.id) ||
      typeof value.version!=='string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version))
    fail('工具格式、ID 或版本无效');
  for (const name of ['title','description','html','css','js'])
    if (!validText(value[name],LIMITS[name],name==='css')) fail('工具字段过大或无效：'+name,'E_TOOL_LIMIT');
  if (!Array.isArray(value.capabilities) || value.capabilities.length>(v2?V2_CAPABILITIES:CAPABILITIES).length ||
      new Set(value.capabilities).size!==value.capabilities.length ||
      !value.capabilities.every(item=>(v2?V2_CAPABILITIES:CAPABILITIES).includes(item)))
    fail('工具能力声明超出当前支持范围');
  if(v2){
    if(!plain(value.requires)||!fields(value.requires,['browserSdk'])||
       value.requires.browserSdk!=='1.0.0')fail('浏览器 SDK 版本不受支持');
    if(!plain(value.contributes)||!fields(value.contributes,['contextMenus'])||
       !Array.isArray(value.contributes.contextMenus)||
       value.contributes.contextMenus.length>(value.capabilities.includes('browser.contextMenu')?3:0)||
       (value.capabilities.includes('browser.contextMenu')&&value.contributes.contextMenus.length===0))
      fail('右键菜单声明与工具能力不一致');
    const used=new Set();
    for(const action of value.contributes.contextMenus){
      if(!plain(action)||!fields(action,['actionId','title','contexts','documentUrlPatterns','handler'])||
         typeof action.actionId!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(action.actionId)||
         used.has(action.actionId)||!validText(action.title,80)||
         !Array.isArray(action.contexts)||action.contexts.length<1||action.contexts.length>3||
         new Set(action.contexts).size!==action.contexts.length||
         !action.contexts.every(item=>MENU_CONTEXTS.includes(item))||
         !Array.isArray(action.documentUrlPatterns)||!action.documentUrlPatterns.length||
         action.documentUrlPatterns.length>5||
         !action.documentUrlPatterns.every(pattern=>{
           if(typeof pattern!=='string'||pattern.length>200||
              !/^https?:\/\/[a-z0-9.-]+\/\*$/.test(pattern))return false;
           try {const url=new URL(pattern);return !url.username&&!url.password&&url.hostname.includes('.')&&
             url.pathname==='/*'&& !url.hash && !url.search;}catch{return false;}
         })||action.handler!=='open-self')fail('右键菜单只能使用明确网站和 open-self 动作');
      used.add(action.actionId);
    }
  }
  // HTML is placed ONLY inside an opaque sandbox page. Refuse alternate code paths.
  if (/<\s*\/?\s*(?:script|iframe|object|embed|base|link|meta|style)\b/i.test(value.html) ||
      /\son[a-z]+\s*=/i.test(value.html) || /\b(?:srcdoc|formaction)\s*=/i.test(value.html) ||
      /javascript\s*:/i.test(value.html) || /<\s*form\b[^>]*\baction\s*=/i.test(value.html))
    fail('HTML 不允许脚本标签、内联事件或外部页面入口');
  if (/@import\b|url\s*\(\s*['"]?\s*(?:https?:|\/\/|javascript:)/i.test(value.css))
    fail('样式不允许远程导入或远程资源');
  if (/(?:^|\n)\s*(?:import|export)\s+(?:[\w*{]|["'])/.test(value.js))
    fail('界面代码须先构建为单个经典 JavaScript 文件');
  const utf8 = new TextEncoder().encode(JSON.stringify(value));
  if (utf8.byteLength>MAX_PACKAGE_BYTES) fail('工具包超过 320 KB','E_TOOL_LIMIT');
  return structuredClone(value);
}

// Stable schema order also allows an installed package whose object keys were
// reordered by Chrome Storage to be compared with a canonical official digest.
export function serializeSidebarToolPackage(value){
  const tool=validateSidebarToolPackage(value);
  const isV2=tool.format===SIDEBAR_TOOL_FORMAT_V2;
  const stable=Object.fromEntries((isV2?V2_FIELDS:PACKAGE_FIELDS).map(key=>[key,tool[key]]));
  // Persisted Chrome Storage does not promise nested object property order.
  // A version-matched v2 contribution must have ONE canonical digest regardless
  // of object-key order; never let storage reordering revoke or inherit grants.
  if(isV2){
    stable.requires={browserSdk:tool.requires.browserSdk};
    stable.contributes={contextMenus:tool.contributes.contextMenus.map(action=>({
      actionId:action.actionId,title:action.title,contexts:action.contexts,
      documentUrlPatterns:action.documentUrlPatterns,handler:action.handler
    }))};
  }
  return JSON.stringify(stable,null,2)+'\n';
}

export function sidebarToolStorageKey(id) {
  if (typeof id!=='string' || !/^[a-z][a-z0-9-]{1,39}$/.test(id)) fail('工具 ID 无效');
  return SIDEBAR_TOOL_DATA_PREFIX+id;
}
