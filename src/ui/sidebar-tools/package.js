import {SIDEBAR_TOOL_LIMITS} from './limits.js';
import {normalizeTaskDelegations} from '../../platform/tasks/delegation-contract.js';
import {validateToolLocalization,verifyToolLocalization} from './localization.js';
import {APPROVED_BROWSER_DIRECT_BINDINGS} from '../../framework/sdk/browser-direct.generated.js';
import {normalizeSidebarToolBackgroundPolicy,SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V2,SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V3} from './background-policy.js';
import {MANAGED_SITE_BUDGET_CAPABILITY} from '../../platform/host/managed-site-runtime-contract.js';
// Sidebar tool UI package contract. This is NOT a Task v1 program or an authority grant.
export const SIDEBAR_TOOL_FORMAT = 'opendesk.sidebar-tool.v1';
export const SIDEBAR_TOOL_FORMAT_V2 = 'opendesk.sidebar-tool.v2';
export const SIDEBAR_TOOL_STORE = 'opendesk.sidebar-tools.installed.v1';
export const SIDEBAR_TOOL_DATA_PREFIX = 'opendesk.sidebar-tools.data.v1:';
export const SIDEBAR_TOOL_PROTOCOL = 'opendesk.sidebar-tool.bridge.v1';
export const SIDEBAR_TOOL_SHARED_UI_RUNTIME='opendesk.react-ui.v1';
export const SIDEBAR_TOOL_BACKGROUND_KIND='opendesk.app-service.v1';
export const SIDEBAR_TOOL_DATA_LIMITS=Object.freeze({itemBytes:8192,totalBytes:32768,maxKeys:32});
const MAX_PACKAGE_BYTES = SIDEBAR_TOOL_LIMITS.packageBytes;
const LIMITS = Object.freeze({title:80,description:300,html:SIDEBAR_TOOL_LIMITS.html,css:SIDEBAR_TOOL_LIMITS.css,js:SIDEBAR_TOOL_LIMITS.js});
const CAPABILITIES = Object.freeze(['ai.generate','storage.local','currentPage.read','tasks.open','page.toc','page.clip','page.videoSpeed','page.videoContext','page.mediaDownload','user.export','page.capture','knowledge.store','time.review','focus.control','ai.access','adblock.control']);
const V2_CAPABILITIES = Object.freeze([...new Set([...CAPABILITIES,'localTasks','browser.page.environment.read','browser.fingerprint.control','tasks.run','page.prompts','browser.contextMenu','browser.tabs','browser.sidePanel','network',
  'browser.network.observe','browser.events','browser.operations','browser.screenshot','browser.bookmarks','browser.bookmarks.full','browser.scheduler',
  'browser.cookies.read','browser.cookies.values','browser.cookies.write','browser.cookies.observe','browser.cookies.clear','browser.storage','browser.proxy.managed',MANAGED_SITE_BUDGET_CAPABILITY,
  ...APPROVED_BROWSER_DIRECT_BINDINGS.flatMap(row=>row.requiredCapabilities)])]);
const BROWSER_SDK_VERSION='1.0.0';
// Derived from the validator's sole allowlist, never a permission grant. Each
// fixed runtime computes this from its own loaded code, not a fetched catalog.
export function sidebarToolPackageContract(){
  return {protocol:SIDEBAR_TOOL_PROTOCOL,formats:{
    [SIDEBAR_TOOL_FORMAT]:[...CAPABILITIES],[SIDEBAR_TOOL_FORMAT_V2]:[...V2_CAPABILITIES]
  },limits:{...SIDEBAR_TOOL_LIMITS},browserSdk:BROWSER_SDK_VERSION};
}
export async function sidebarToolPackageContractHash(){
  const bytes=new TextEncoder().encode(JSON.stringify(sidebarToolPackageContract()));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    value=>value.toString(16).padStart(2,'0')).join('');
}
const PACKAGE_FIELDS=Object.freeze(['format','id','version','title','description','capabilities','html','css','js','uiRuntime','backgroundPolicy','localization']);
const V2_FIELDS=Object.freeze([...PACKAGE_FIELDS,'requires','contributes','scripts','initialData','background','delegatedTasks']);
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
  if(value.localization!==undefined)validateToolLocalization(value.localization);
  if(value.uiRuntime!==undefined&&value.uiRuntime!==SIDEBAR_TOOL_SHARED_UI_RUNTIME)
    fail('不支持的共享 UI Runtime','E_TOOL_RUNTIME');
  for (const name of ['title','description','html','css','js'])
    if (!validText(value[name],LIMITS[name],name==='css')) fail('工具字段过大或无效：'+name,'E_TOOL_LIMIT');
  if(new TextEncoder().encode(value.js).byteLength>LIMITS.js)
    fail('界面源码 UTF-8 字节超限','E_TOOL_LIMIT');
  const supportedCapabilities=v2?V2_CAPABILITIES:CAPABILITIES;
  if (!Array.isArray(value.capabilities)) fail('工具能力声明必须是数组');
  if (value.capabilities.length>supportedCapabilities.length) fail('工具能力声明数量超出当前支持范围');
  if (!value.capabilities.every(item=>typeof item==='string')) fail('工具能力声明的每一项必须是字符串');
  if (new Set(value.capabilities).size!==value.capabilities.length) fail('工具能力声明包含重复项');
  const unsupportedCapabilities=value.capabilities.filter(item=>!supportedCapabilities.includes(item));
  if (unsupportedCapabilities.length) {
    const names=unsupportedCapabilities.slice(0,4).map(item=>item.length>80?item.slice(0,80)+'…':item).join('、');
    fail('当前安装器不支持此工具格式的能力：'+names+(unsupportedCapabilities.length>4?'等 '+unsupportedCapabilities.length+' 项':'')+
      '。请核对工具包格式与扩展运行身份；确认新版支持这些能力后再更新 OpenDesk Browser。','E_TOOL_CAPABILITY_UNSUPPORTED');
  }
  if(value.capabilities.includes('tasks.run')||value.delegatedTasks!==undefined){
    if(!v2||!value.capabilities.includes('tasks.run'))fail('固定任务委托必须在 v2 包中审阅 tasks.run');
    normalizeTaskDelegations(value.delegatedTasks);
  }
  if(value.background!==undefined){
    const background=value.background;
    if(!v2||!plain(background)||Object.keys(background).sort().join(',')!=='js,kind,sha256'||
       background.kind!==SIDEBAR_TOOL_BACKGROUND_KIND||
       typeof background.sha256!=='string'||!/^[a-f0-9]{64}$/.test(background.sha256)||
       typeof background.js!=='string'||!background.js.trim()||
       !['browser.storage','browser.scheduler'].every(capability=>value.capabilities.includes(capability)))
      fail('后台服务需要固定 v2 源码、SHA 及 browser.storage/browser.scheduler 能力','E_TOOL_BACKGROUND');
    if(background.js.length>LIMITS.js||new TextEncoder().encode(background.js).byteLength>LIMITS.js)fail('后台服务源码字段过大','E_TOOL_LIMIT');
    if(/(?:^|\n)\s*(?:import|export)\s+(?:[\w*{]|["'])/.test(background.js))
      fail('后台服务必须是 Classic JavaScript；ESM 请先使用可信构建器','E_TOOL_BACKGROUND');
  }
  const backgroundPolicy=normalizeSidebarToolBackgroundPolicy(value.backgroundPolicy);
  if(backgroundPolicy&&!value.capabilities.includes('focus.control')&&
     !value.capabilities.includes(MANAGED_SITE_BUDGET_CAPABILITY))
    fail('网站预算声明需要已审阅的受管后台能力','E_TOOL_POLICY');
  if(value.capabilities.includes(MANAGED_SITE_BUDGET_CAPABILITY)&&
     (!v2||![SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V2,SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V3].includes(backgroundPolicy?.kind)||
       value.capabilities.includes('focus.control')))
    fail('公共预算能力只支持独立的 v2 有限预算合同','E_TOOL_POLICY');
  if(v2){
    if(!plain(value.requires)||!fields(value.requires,['browserSdk'])||
       value.requires.browserSdk!==BROWSER_SDK_VERSION)fail('浏览器 SDK 版本不受支持');
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
           // A protocol-only declaration is a TEMPLATE, never an all-sites grant.
           // Native entries are projected solely for per-Origin approved sites.
           if(pattern==='http://*/*'||pattern==='https://*/*')return true;
           if(typeof pattern!=='string'||pattern.length>200||
              !/^https?:\/\/[a-z0-9.-]+\/\*$/.test(pattern))return false;
           try {const url=new URL(pattern);return !url.username&&!url.password&&url.hostname.includes('.')&&
             url.pathname==='/*'&& !url.hash && !url.search;}catch{return false;}
         })||action.handler!=='open-self')fail('右键菜单只能使用明确网站和 open-self 动作');
      used.add(action.actionId);
    }
  }
  // Declarative first-install content is inert JSON, never executable package code.
  // It occupies the existing tool-owned storage namespace and its item limits.
  if(value.initialData!==undefined){
    if(!v2||!plain(value.initialData)||!Object.keys(value.initialData).length||
       Object.keys(value.initialData).length>SIDEBAR_TOOL_DATA_LIMITS.maxKeys)
      fail('首次安装数据必须是非空的 v2 工具存储对象');
    let total=0;
    for(const [key,row] of Object.entries(value.initialData)){
      if(!/^[a-zA-Z][a-zA-Z0-9._-]{0,59}$/.test(key)||
         ['constructor','prototype','__proto__'].includes(key))
        fail('首次安装存储字段无效');
      let json;
      try{json=JSON.stringify(row);}catch{fail('首次安装数据必须为可序列化的 JSON');}
      if(typeof json!=='string'||json==='null')
        fail('首次安装数据不能是空字段');
      const size=new TextEncoder().encode(json).byteLength;
      if(size>SIDEBAR_TOOL_DATA_LIMITS.itemBytes)fail('首次安装单项数据超过 8 KiB');
      total+=size;
    }
    if(new TextEncoder().encode(JSON.stringify(value.initialData)).byteLength>
       SIDEBAR_TOOL_DATA_LIMITS.totalBytes||total>SIDEBAR_TOOL_DATA_LIMITS.totalBytes)
      fail('首次安装数据超过 32 KiB');
  }
  // V2 standalone tools may pin several Classic assets for ordered execution
  // in the existing opaque sandbox. The SHA is revalidated from UTF-8 bytes
  // by the sandbox before any dependency code runs; no remote URL is trusted.
  if(value.scripts!==undefined){
    if(!v2||!Array.isArray(value.scripts)||value.scripts.length<1||value.scripts.length>8)
      fail('只有 v2 工具支持 1–8 个独立固定 JavaScript 资产','E_TOOL_SCRIPTS');
    const names=new Set(),enc=new TextEncoder();
    for(const asset of value.scripts){
      if(!plain(asset)||Object.keys(asset).sort().join(',')!=='code,name,sha256'||
        typeof asset.name!=='string'||!/^([A-Za-z0-9][A-Za-z0-9._/-]{0,119})$/.test(asset.name)||
        asset.name.split('/').some(part=>!part||part==='.'||part==='..')||
        names.has(asset.name)||typeof asset.sha256!=='string'||!/^[a-f0-9]{64}$/.test(asset.sha256)||
        typeof asset.code!=='string'||!asset.code.trim()||enc.encode(asset.code).byteLength>96000)
        fail('固定 JS 资产名称、SHA 或字节预算不合法','E_TOOL_SCRIPTS');
      if(/(?:^|\n)\s*(?:import|export)\s+(?:[\w*{]|["'])/.test(asset.code))
        fail('固定独立文件必须是 Classic JavaScript；ESM 请先使用可信构建器','E_TOOL_SCRIPTS');
      names.add(asset.name);
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
  if (utf8.byteLength>MAX_PACKAGE_BYTES) fail('工具包超过 2 MiB','E_TOOL_LIMIT');
  return backgroundPolicy?{...structuredClone(value),backgroundPolicy}:structuredClone(value);
}

// Stable schema order also allows an installed package whose object keys were
// reordered by Chrome Storage to be compared with a canonical official digest.
export function serializeSidebarToolPackage(value){
  const tool=validateSidebarToolPackage(value);
  const isV2=tool.format===SIDEBAR_TOOL_FORMAT_V2;
  const stable=Object.fromEntries((isV2?V2_FIELDS:PACKAGE_FIELDS).map(key=>[key,tool[key]]));
  if(tool.localization!==undefined){
    const canonical=row=>row&&typeof row==='object'?
      Object.fromEntries(Object.keys(row).sort().map(key=>[key,canonical(row[key])])):row;
    stable.localization=canonical(tool.localization);
  }
  // Persisted Chrome Storage does not promise nested object property order.
  // A version-matched v2 contribution must have ONE canonical digest regardless
  // of object-key order; never let storage reordering revoke or inherit grants.
  if(isV2){
    if(tool.delegatedTasks!==undefined)stable.delegatedTasks=normalizeTaskDelegations(tool.delegatedTasks).map(({taskId,version,manifestHash,contentHash})=>({taskId,version,manifestHash,contentHash}));
    if(tool.background!==undefined)stable.background={
      kind:tool.background.kind,js:tool.background.js,sha256:tool.background.sha256
    };
    if(tool.initialData!==undefined){
      // Chrome Storage may reorder nested object keys; the approved package
      // hash and install identity must not depend on such key order.
      const canonical=row=>Array.isArray(row)?row.map(canonical):
        row&&typeof row==='object'?
          Object.fromEntries(Object.keys(row).sort().map(key=>[key,canonical(row[key])])):row;
      stable.initialData=canonical(tool.initialData);
    }
    if(tool.scripts!==undefined)stable.scripts=tool.scripts.map(asset=>({
      name:asset.name,sha256:asset.sha256,code:asset.code
    }));
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

export async function sidebarToolPackageHash(tool){
  const verified=await verifySidebarToolBackground(tool);
  const bytes=new TextEncoder().encode(serializeSidebarToolPackage(verified));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    value=>value.toString(16).padStart(2,'0')).join('');
}

// Shape admission remains synchronous. Installation and service consumers must
// also verify the fixed UTF-8 payload; a self-declared hash is not publisher trust.
export async function verifySidebarToolBackground(value){
  const tool=validateSidebarToolPackage(value);
  if(tool.localization!==undefined)await verifyToolLocalization(tool.localization);
  if(tool.background===undefined)return tool;
  const bytes=new TextEncoder().encode(tool.background.js);
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    value=>value.toString(16).padStart(2,'0')).join('');
  if(sha256!==tool.background.sha256)fail('后台服务源码与固定 SHA-256 不一致','E_TOOL_BACKGROUND_SHA');
  return tool;
}
