(function(){
'use strict';
// Packaged as a pinned Classic dependency; statically imported by the trusted page.
const fail=msg=>{const e=new Error(msg);e.code='E_PROMPT_DATA';throw e;};
const parts=text=>Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),v=>v.segment);
const visible=part=>/[\p{L}\p{N}\p{M}\p{P}\p{S}]/u.test(part);
const auto=body=>parts(body).filter(visible).slice(0,2).join('');
const validLabel=label=>{const p=parts(label);return p.length>=1&&p.length<=2&&p.every(visible);};
// The opaque installed-tool sandbox is not guaranteed to expose randomUUID.
// getRandomValues is available in insecure contexts; never fall back to predictable IDs.
function secureId(){
  const crypto=globalThis.crypto;
  if(typeof crypto?.randomUUID==='function')return crypto.randomUUID();
  if(typeof crypto?.getRandomValues!=='function')fail('当前运行环境不能安全生成提示词 ID，请更新浏览器');
  const random=crypto.getRandomValues(new Uint8Array(16));
  return 'ps_'+Array.from(random,byte=>byte.toString(16).padStart(2,'0')).join('');
}
// The same schema:1 library remains the sole storage and page-refresh source.
const IMAGE_SIZES=Object.freeze({compact:Object.freeze([48,40]),
  standard:Object.freeze([56,44]),large:Object.freeze([68,48])});
function normalizeImageUrl(value,required=false){
  if(value==null||value===''){
    if(required)fail('图片按钮需要 HTTPS 图片 URL');
    return '';
  }
  if(typeof value!=='string'||value.length>512||/[\u0000-\u001f\u007f]/u.test(value))
    fail('图片 URL 格式无效或超过 512 字符');
  const raw=value.trim();
  if(!raw){if(required)fail('图片按钮需要 HTTPS 图片 URL');return '';}
  let url;try{url=new URL(raw);}catch{fail('图片 URL 无效');}
  if(url.protocol!=='https:'||!url.hostname||url.origin==='null'||url.username||url.password)
    fail('图片仅支持不含账号密码的 HTTPS URL');
  if(/\.svg$/iu.test(url.pathname))fail('暂不支持 SVG 图片，请使用 PNG、JPEG 或 WebP');
  return url.href;
}
function normalizeImageAssetId(value){
  if(value==null||value==='')return '';
  if(typeof value!=='string'||!/^psa_[a-f0-9]{32}$/.test(value))
    fail('无效的本地图片资源标识');
  return value;
}
const SCROLL_NAV_DEFAULTS=Object.freeze({regionTop:true,regionBottom:true,
  conversationTop:true,conversationBottom:true,floatingTop:true});
function navigationSettings(value){
  if(value===undefined)return {...SCROLL_NAV_DEFAULTS};
  if(!value||typeof value!=='object'||Array.isArray(value)||
      Object.entries(value).some(([key,flag])=>!Object.hasOwn(SCROLL_NAV_DEFAULTS,key)||
        typeof flag!=='boolean'))fail('滚动导航设置无效，已拒绝覆盖');
  return {...SCROLL_NAV_DEFAULTS,...value};
}
const defaults=()=>({schema:1,items:[],settings:{webButtons:true,imageSize:'large',
  scrollNavigation:navigationSettings()}});
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
function draft(input,previous=null,newId=secureId){
  if(typeof input?.body!=='string'||!input.body.trim())fail('提示词内容是唯一必填项');
  const label=typeof input.label==='string'?input.label.trim():'';
  const name=typeof input.name==='string'?input.name.trim():'';
  if(label&&!validLabel(label))fail('短标签只能是 1–2 个 Unicode 可见字素');
  if(name&&name.length>60)fail('显示名称最多 60 个字符');
  const fallback=auto(input.body);
  if(!fallback)fail('请输入包含可见字符的正文');
  const appearance=input.appearance??previous?.appearance??'text';
  if(!['text','image'].includes(appearance))fail('不支持的按钮外观');
  // Asset IDs reference separate trusted tool storage; never inline image bytes.
  const imageAssetId=normalizeImageAssetId(input.imageAssetId??previous?.imageAssetId);
  let imageUrl='';
  if(appearance==='image'&&!imageAssetId)
    imageUrl=normalizeImageUrl(input.imageUrl??previous?.imageUrl,true);
  else if(!imageAssetId)try{imageUrl=normalizeImageUrl(input.imageUrl??previous?.imageUrl);}
  catch{/* Hidden stale URL is ignored. */}
  return {id:previous?.id||newId(),body:input.body,label:label||fallback,name:name||fallback,
    labelAuto:!label,nameAuto:!name,shape:input.shape==='round'||(input.shape===undefined&&previous?.shape==='round')?'round':'square',
    enabled:input.enabled!==false,order:previous?.order??0,appearance,imageUrl,
    ...(imageAssetId?{imageAssetId}:{})};
}
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{8,64}$/.test(id);
function load(value){
  if(value==null)return defaults();
  if(!value||value.schema!==1||!Array.isArray(value.items)||value.items.length>80||
      typeof value.settings?.webButtons!=='boolean'||
      (value.settings.imageSize!==undefined&&!Object.hasOwn(IMAGE_SIZES,value.settings.imageSize)))
    fail('提示词存储无效，已拒绝覆盖');
  const seen=new Set();
  const items=value.items.map(v=>{
    if(!v||!validId(v.id)||seen.has(v.id)||typeof v.body!=='string'||!v.body.trim()||
      typeof v.label!=='string'||!validLabel(v.label)||(v.name!==undefined&&(typeof v.name!=='string'||(v.name!==''&&!v.name.trim())||v.name.length>60))||
      !['square','round'].includes(v.shape)||typeof v.enabled!=='boolean'||!Number.isSafeInteger(v.order)||v.order<0)
      fail('某条提示词数据无效，已拒绝覆盖');
    seen.add(v.id);
    const fallback=auto(v.body);if(!fallback)fail('提示词正文无可见字符');
    // Old saved entries without auto flags stay manual.
    const labelAuto=v.labelAuto===true,nameAuto=v.nameAuto===true||v.name===''||v.name===undefined;
    const appearance=v.appearance??'text';
    if(!['text','image'].includes(appearance))fail('提示词按钮外观无效');
    const imageAssetId=normalizeImageAssetId(v.imageAssetId);
    let imageUrl='';
    if(appearance==='image'&&!imageAssetId)imageUrl=normalizeImageUrl(v.imageUrl,true);
    else if(!imageAssetId)try{imageUrl=normalizeImageUrl(v.imageUrl);}
    catch{/* Legacy text rows remain usable. */}
    return {...v,labelAuto,nameAuto,label:labelAuto?fallback:v.label,
      name:nameAuto?fallback:v.name,appearance,imageUrl,
      ...(imageAssetId?{imageAssetId}:{})};
  });
  return {schema:1,items:items.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)),
    settings:{webButtons:value.settings.webButtons,imageSize:value.settings.imageSize??'large',
      scrollNavigation:navigationSettings(value.settings.scrollNavigation)}};
}

// Runtime reads expand defaults; persistence stores only navigation overrides.
// Keep generic bytes() literal for site data and the Host's unchanged quotas.
function libraryForStorage(value){
  const library=load(value);
  const {scrollNavigation,...settings}=library.settings;
  const overrides=Object.fromEntries(Object.entries(scrollNavigation).filter(([,flag])=>flag===false));
  return {...library,settings:{...settings,
    ...(Object.keys(overrides).length?{scrollNavigation:overrides}:{})}};
}
const libraryBytes=value=>bytes(libraryForStorage(value));

// R2: Site configuration is a separate 8-KiB tool-local data item.
// Selectors are inert, bounded CSS data, never JavaScript or execution paths.
const sitesDefaults=()=>({schema:1,rules:[]});
const siteUrl=value=>{
  if(typeof value!=='string'||value.length>4096)fail('无效的网站地址');
  let url;try{url=new URL(value);}catch{fail('无效的网站地址');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname||
     url.origin==='null')fail('仅支持明确选择的 HTTP(S) 网站');
  return url;
};
const validSelector=value=>{
  if(typeof value!=='string')return false;
  const s=value.trim();
  // No selector lists, costly pseudo selectors, CSS escapes or relative selectors.
  return s.length>0&&s.length<=220&&
    !/[,;:{}()*~+\\<>@]|\p{Cc}/u.test(s)&&
    /^[\p{L}\p{N}\p{M}_#.\[\]=\s'"\/-]+$/u.test(s)&&
    !/^\s*[.#\[]?\s*$/.test(s)&&
    (s.match(/\[/g)||[]).length<5&&
    (s.match(/\[/g)||[]).length===(s.match(/\]/g)||[]).length;
};
function siteRule(value){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('网站规则无效');
  const url=siteUrl(value.origin);
  if(url.origin!==value.origin)fail('网站来源必须是精确 Origin');
  const pathScope=value.pathScope??'/';
  if(typeof pathScope!=='string'||!pathScope.startsWith('/')||pathScope.length>180||
    /[?#\\\u0000-\u001f]/u.test(pathScope)||pathScope.includes('//'))
    fail('网页路径范围无效');
  if(!validSelector(value.containerSelector)||!validSelector(value.editorSelector))
    fail('请选择有效的容器和输入框；不允许脚本、复杂伪选择器或动态路径');
  if(value.enabled!==undefined&&typeof value.enabled!=='boolean')fail('网站启停状态无效');
  if(value.editorType!==undefined&&value.editorType!=='auto')fail('不支持的网站编辑器策略');
  if(value.placement!==undefined&&value.placement!=='left-center')fail('不支持的网站按钮布局');
  return {origin:url.origin,pathScope,containerSelector:value.containerSelector.trim(),
    editorSelector:value.editorSelector.trim(),placement:'left-center',
    editorType:'auto',enabled:value.enabled!==false};
}
function sitesLoad(value){
  if(value==null)return sitesDefaults();
  if(!value||value.schema!==1||!Array.isArray(value.rules)||value.rules.length>24)
    fail('网站规则存储无效，已停止写入');
  const seen=new Set();
  const rules=value.rules.map(raw=>{
    const rule=siteRule(raw),key=rule.origin+rule.pathScope;
    if(seen.has(key))fail('同一网站路径存在重复规则');
    seen.add(key);return rule;
  });
  if(bytes({schema:1,rules})>8192)fail('网站规则超过 8 KiB 存储上限');
  return {schema:1,rules};
}
function siteFor(sites,value){
  let url;try{url=siteUrl(value);}catch{return null;}
  const matching=sitesLoad(sites).rules.filter(rule=>rule.origin===url.origin&&
    (rule.pathScope==='/'||url.pathname===rule.pathScope||
     url.pathname.startsWith(rule.pathScope.endsWith('/')?rule.pathScope:rule.pathScope+'/')));
  matching.sort((a,b)=>b.pathScope.length-a.pathScope.length);
  if(matching.length)return matching[0].enabled?matching[0]:null;
  return builtinSite(value);
}

// Fixed extension defaults, never persisted into the user's custom rules.
function builtinSite(value){
  let url;try{url=siteUrl(value);}catch{return null;}
  const deepSeek=url.origin==='https://chat.deepseek.com'&&
    /^(?:\/|\/a\/chat\/s\/[a-f0-9-]+\/?)$/iu.test(url.pathname);
  const gemini=url.origin==='https://gemini.google.com'&&
    /^\/app(?:\/[A-Za-z0-9_-]+)?\/?$/u.test(url.pathname);
  if(!deepSeek&&!gemini)return null;
  return {...siteRule({origin:url.origin,pathScope:deepSeek?'/':'/app',
    containerSelector:deepSeek?'#root':'chat-window',
    editorSelector:deepSeek?'#root textarea':'rich-textarea div.ql-editor[contenteditable="true"]'}),
    builtin:deepSeek?'deepseek':'gemini'};
}

// Candidate CSS selectors are suggestions, never automatic permissions or compatibility claims.
// The existing trusted prompt.page.check must validate them on the real page before saving.
const SITE_HINTS=Object.freeze({
  'https://claude.ai':{
    name:'Claude',pathScope:'/',containers:['main','[role="main"]'],
    editors:['[data-testid="chat-input"][contenteditable="true"]',
      '[data-testid="chat-input"] div.ProseMirror[contenteditable="true"]',
      'div.ProseMirror[contenteditable="true"]']
  },
  'https://gemini.google.com':{
    name:'Gemini',pathScope:'/',containers:['chat-window','main','[role="main"]'],
    editors:['rich-textarea div.ql-editor[contenteditable="true"]',
      'div.ql-editor[contenteditable="true"]',
      'rich-textarea [contenteditable="true"]']
  },
  'https://chat.deepseek.com':{
    // Observed 2026-10-20: the chat column has no main landmark and the
    // textarea has no id. These remain checked proposals, never permissions.
    name:'DeepSeek',pathScope:'/',containers:['#root'],
    editors:['#root textarea']
  },
  'https://www.perplexity.ai':{
    name:'Perplexity',pathScope:'/',containers:['main','[role="main"]'],
    editors:['textarea[data-testid="search-input"]',
      'textarea[data-testid="composer-input"]']
  },
  'https://perplexity.ai':{
    name:'Perplexity',pathScope:'/',containers:['main','[role="main"]'],
    editors:['textarea[data-testid="search-input"]',
      'textarea[data-testid="composer-input"]']
  },
  'https://grok.com':{
    name:'Grok',pathScope:'/',containers:['main','[role="main"]'],
    editors:['[data-testid="chat-input"] div.ProseMirror[contenteditable="true"]',
      'div.ProseMirror[contenteditable="true"]',
      'div[data-testid="chat-input"][contenteditable="true"]']
  },
  'https://x.com':{
    name:'Grok',pathScope:'/i/grok',containers:['main','[role="main"]'],
    editors:['[data-testid="grokInput"][contenteditable="true"]',
      '[data-testid="grokInput"] div.ProseMirror[contenteditable="true"]']
  }
});
function siteHint(origin,path='/'){
  if(!Object.hasOwn(SITE_HINTS,origin)||typeof path!=='string')return null;
  const item=SITE_HINTS[origin],scope=item.pathScope;
  if(scope!=='/'&&path!==scope&&!path.startsWith(scope+'/'))return null;
  return {name:item.name,pathScope:scope,containers:[...item.containers],editors:[...item.editors]};
}

// R3.2: v2 adds appearance and a global image size; site rules and grants stay private.
const BACKUP_FORMAT='opendesk.prompt-shortcuts',BACKUP_VERSION=2,BACKUP_MAX_BYTES=262144;
const duplicateKey=body=>body.normalize('NFC').replace(/\r\n?/g,'\n').trim();
const validBackupItemFieldsV1=new Set(['id','body','label','name','labelAuto','nameAuto','shape','enabled','order']);
const validBackupItemFieldsV2=new Set([...validBackupItemFieldsV1,'appearance','imageUrl']);
function backupExport(library,exportedAt=new Date().toISOString()){
  const saved=load(library);
  // Never silently generate an incomplete v2 backup without the local asset bytes.
  if(saved.items.some(item=>item.imageAssetId))
    fail('当前提示词包含本地图片：v2 JSON 无法完整备份图片。请先保留当前数据并使用 HTTPS 图片，待图片备份格式可用后再导出');
  if(!Number.isFinite(Date.parse(exportedAt)))fail('导出时间无效');
  const items=saved.items.map(item=>({
    id:item.id,body:item.body,label:item.label,name:item.name,
    labelAuto:item.labelAuto===true,nameAuto:item.nameAuto===true,
    shape:item.shape,enabled:item.enabled,order:item.order,
    appearance:item.appearance,imageUrl:item.imageUrl
  }));
  return JSON.stringify({format:BACKUP_FORMAT,version:BACKUP_VERSION,exportedAt,
    imageSize:saved.settings.imageSize,items},null,2)+'\n';
}
function backupParse(text){
  if(typeof text!=='string'||!text.length||new TextEncoder().encode(text).length>BACKUP_MAX_BYTES)
    fail('JSON 文件必须为 1 B～256 KiB');
  let obj;
  try{obj=JSON.parse(text.replace(/^\uFEFF/u,''));}
  catch{fail('JSON 文件损坏或格式无效');}
  if(!obj||typeof obj!=='object'||Array.isArray(obj)||obj.format!==BACKUP_FORMAT||
     ![1,2].includes(obj.version)||!Array.isArray(obj.items))
    fail('备份格式或版本不受支持，请选择本工具导出的 v1 / v2 JSON');
  if(obj.version===1&&Object.hasOwn(obj,'imageSize'))fail('v1 备份不包含图片尺寸设置');
  if(obj.version===2&&obj.imageSize!==undefined&&!Object.hasOwn(IMAGE_SIZES,obj.imageSize))
    fail('备份中的图片尺寸设置无效');
  if(obj.items.length<1)fail('空备份不能用于导入，防止误清空');
  if(obj.items.length>80)fail('一次最多导入 80 条提示词');
  const positions=new Set(),ids=new Set();
  const rows=obj.items.map((v,i)=>{
    const prefix='第 '+(i+1)+' 条：';
    const fields=obj.version===1?validBackupItemFieldsV1:validBackupItemFieldsV2;
    if(!v||typeof v!=='object'||Array.isArray(v)||
       Object.keys(v).some(key=>!fields.has(key)))
      fail(prefix+'字段无效');
    if(typeof v.body!=='string'||!v.body.trim()||v.body.includes('\u0000'))
      fail(prefix+'提示词正文无效');
    if(v.label!==undefined&&(typeof v.label!=='string'||(v.label.trim()&&!validLabel(v.label.trim()))))
      fail(prefix+'短标签必须为 1–2 个可见字素');
    if(v.name!==undefined&&(typeof v.name!=='string'||v.name.length>60))
      fail(prefix+'显示名称无效');
    if(v.labelAuto!==undefined&&typeof v.labelAuto!=='boolean'||
       v.nameAuto!==undefined&&typeof v.nameAuto!=='boolean'||
       v.enabled!==undefined&&typeof v.enabled!=='boolean'||
       v.shape!==undefined&&!['square','round'].includes(v.shape)||
       v.appearance!==undefined&&!['text','image'].includes(v.appearance)||
       v.imageUrl!==undefined&&typeof v.imageUrl!=='string')
      fail(prefix+'按钮设置无效');
    const order=v.order===undefined?i:v.order;
    if(!Number.isSafeInteger(order)||order<0||positions.has(order))fail(prefix+'排序无效或重复');
    positions.add(order);
    // Imported IDs always receive fresh entropy; no overwrite by untrusted ID.
    const generated=draft({body:v.body,label:v.labelAuto===true?'':v.label||'',
      name:v.nameAuto===true?'':v.name||'',shape:v.shape,enabled:v.enabled,
      appearance:v.appearance??'text',imageUrl:v.imageUrl??''});
    if(!validId(generated.id)||ids.has(generated.id))fail('无法安全分配导入条目的唯一 ID');
    ids.add(generated.id);
    return {...generated,order};
  }).sort((a,b)=>a.order-b.order).map((row,order)=>({...row,order}));
  // Keep the existing backupParse -> backupPlan array contract; metadata is not a row.
  Object.defineProperty(rows,'imageSize',{value:obj.version===2?(obj.imageSize??null):null});
  return rows;
}
function backupPlan(library,imported,mode='append'){
  if(!['append','replace'].includes(mode))fail('不支持的导入方式');
  const saved=load(library);
  if(!Array.isArray(imported)||imported.length<1||imported.length>80)fail('待导入内容无效');
  if(imported.imageSize!=null&&!Object.hasOwn(IMAGE_SIZES,imported.imageSize))
    fail('备份图片尺寸无效');
  const incoming=load({schema:1,items:imported,settings:{webButtons:true}}).items;
  const nextItems=mode==='replace'?[]:saved.items.slice();
  const bodies=new Set(nextItems.map(row=>duplicateKey(row.body)));
  const ids=new Set(nextItems.map(row=>row.id));
  let skipped=0,added=0;
  for(const row of incoming){
    const body=duplicateKey(row.body);
    if(bodies.has(body)){skipped++;continue;}
    bodies.add(body);
    let id=row.id,attempts=0;
    while(ids.has(id)&&attempts++<8)id=secureId();
    if(ids.has(id)||!validId(id))fail('不能安全解决导入 ID 冲突');
    ids.add(id);nextItems.push({...row,id});added++;
  }
  if(nextItems.length>80)fail('提示词数量不能超过 80 条');
  const settings={...saved.settings,
    imageSize:mode==='replace'&&imported.imageSize?imported.imageSize:saved.settings.imageSize};
  const next=load({schema:1,settings,
    items:nextItems.map((row,order)=>({...row,order}))});
  const size=libraryBytes(next);
  return {next,added,skipped,bytes:size,overLimit:size>8192};
}

Object.defineProperty(globalThis,'OpenDeskPromptShortcutsModel',{
  value:Object.freeze({parts,visible,auto,validLabel,IMAGE_SIZES,SCROLL_NAV_DEFAULTS,navigationSettings,normalizeImageUrl,normalizeImageAssetId,defaults,bytes,draft,load,libraryForStorage,libraryBytes,
     BACKUP_FORMAT,BACKUP_VERSION,BACKUP_MAX_BYTES,duplicateKey,backupExport,backupParse,backupPlan,
    sitesDefaults,siteUrl,validSelector,siteRule,sitesLoad,siteFor,builtinSite,siteHint}),configurable:true
});
})();
