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
const defaults=()=>({schema:1,items:[],settings:{webButtons:true}});
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
function draft(input,previous=null,newId=secureId){
  if(typeof input?.body!=='string'||!input.body.trim())fail('提示词内容是唯一必填项');
  const label=typeof input.label==='string'?input.label.trim():'';
  const name=typeof input.name==='string'?input.name.trim():'';
  if(label&&!validLabel(label))fail('短标签只能是 1–2 个 Unicode 可见字素');
  if(name&&name.length>60)fail('显示名称最多 60 个字符');
  const fallback=auto(input.body);
  if(!fallback)fail('请输入包含可见字符的正文');
  return {id:previous?.id||newId(),body:input.body,label:label||fallback,name:name||fallback,
    labelAuto:!label,nameAuto:!name,shape:input.shape==='round'||(input.shape===undefined&&previous?.shape==='round')?'round':'square',
    enabled:input.enabled!==false,order:previous?.order??0};
}
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{8,64}$/.test(id);
function load(value){
  if(value==null)return defaults();
  if(!value||value.schema!==1||!Array.isArray(value.items)||value.items.length>80||
      typeof value.settings?.webButtons!=='boolean')fail('提示词存储无效，已拒绝覆盖');
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
    return {...v,labelAuto,nameAuto,label:labelAuto?fallback:v.label,name:nameAuto?fallback:v.name};
  });
  return {schema:1,items:items.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)),
    settings:{webButtons:value.settings.webButtons}};
}

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
  return matching[0]?.enabled?matching[0]:null;
}

Object.defineProperty(globalThis,'OpenDeskPromptShortcutsModel',{
  value:Object.freeze({parts,visible,auto,validLabel,defaults,bytes,draft,load,
    sitesDefaults,siteUrl,validSelector,siteRule,sitesLoad,siteFor}),configurable:true
});
})();
