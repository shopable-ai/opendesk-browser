// Sidebar tool UI package contract. This is NOT a Task v1 program or an authority grant.
export const SIDEBAR_TOOL_FORMAT = 'opendesk.sidebar-tool.v1';
export const SIDEBAR_TOOL_STORE = 'opendesk.sidebar-tools.installed.v1';
export const SIDEBAR_TOOL_DATA_PREFIX = 'opendesk.sidebar-tools.data.v1:';
export const SIDEBAR_TOOL_PROTOCOL = 'opendesk.sidebar-tool.bridge.v1';
export const MAX_INSTALLED_TOOLS = 12;
const MAX_PACKAGE_BYTES = 320000;
const LIMITS = Object.freeze({title:80,description:300,html:64000,css:120000,js:220000});
const CAPABILITIES = Object.freeze(['storage.local','currentPage.read','tasks.open','page.toc']);
const fail = (message,code='E_TOOL_SCHEMA') => { const error=new Error(message);error.code=code;throw error; };
const plain = value => value!==null && typeof value==='object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null);
const fields=(obj,keys) => Object.keys(obj).every(key=>keys.includes(key));
const validText=(text,max,optional=false) => typeof text==='string' && text.length<=max && (optional || text.trim().length>0);

export function validateSidebarToolPackage(value) {
  if (!plain(value) || !fields(value,['format','id','version','title','description','capabilities','html','css','js']))
    fail('工具包包含不支持的字段');
  if (value.format!==SIDEBAR_TOOL_FORMAT || typeof value.id!=='string' ||
      !/^[a-z][a-z0-9-]{1,39}$/.test(value.id) ||
      typeof value.version!=='string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version))
    fail('工具格式、ID 或版本无效');
  for (const name of ['title','description','html','css','js'])
    if (!validText(value[name],LIMITS[name],name==='css')) fail('工具字段过大或无效：'+name,'E_TOOL_LIMIT');
  if (!Array.isArray(value.capabilities) || value.capabilities.length>CAPABILITIES.length ||
      new Set(value.capabilities).size!==value.capabilities.length ||
      !value.capabilities.every(item=>CAPABILITIES.includes(item)))
    fail('工具能力声明超出当前支持范围');
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

export function sidebarToolStorageKey(id) {
  if (typeof id!=='string' || !/^[a-z][a-z0-9-]{1,39}$/.test(id)) fail('工具 ID 无效');
  return SIDEBAR_TOOL_DATA_PREFIX+id;
}
