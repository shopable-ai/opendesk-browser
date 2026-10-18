// Shared internationalization for trusted OpenDesk pages (not untrusted installed tools).
// A locale affects UI strings only. Native protocol fields, paths, signatures and file bytes are never transformed.
import en from './locales/en.js';
import zhCN from './locales/zh-CN.js';
import zhTW from './locales/zh-TW.js';
import ja from './locales/ja.js';

export const LOCALE_STORAGE_KEY='opendesk.ui.locale.v1';
export const SUPPORTED_LOCALES=Object.freeze(['en','zh-CN','zh-TW','ja']);
export const LOCALE_NAMES=Object.freeze({en:'English','zh-CN':'简体中文','zh-TW':'繁體中文',ja:'日本語'});
export const CATALOGS=Object.freeze({en,'zh-CN':zhCN,'zh-TW':zhTW,ja});
const canonical=Object.keys(en);
const bySource=new Map(Object.entries(zhCN).map(([key,value])=>[value,key]));

export function normalizeLocale(value){
  if(typeof value!=='string'||!value.trim())return null;
  const input=value.trim().replace(/_/g,'-').toLowerCase();
  if(input==='zh-tw'||input==='zh-hk'||input==='zh-mo'||input==='zh-hant'||input.startsWith('zh-hant-'))return 'zh-TW';
  if(input==='zh'||input==='zh-cn'||input==='zh-sg'||input==='zh-hans'||input.startsWith('zh-hans-'))return 'zh-CN';
  if(input==='ja'||input.startsWith('ja-'))return 'ja';
  if(input==='en'||input.startsWith('en-'))return 'en';
  return null;
}
export function resolveLocale(preference='auto',languages=globalThis.navigator?.languages||[globalThis.navigator?.language]){
  if(preference!=='auto'){
    // Explicit choices must match a supported locale, not reinterpret an unknown stored value.
    if(SUPPORTED_LOCALES.includes(preference))return preference;
  }
  for(const language of Array.isArray(languages)?languages:[languages]){
    const normalized=normalizeLocale(language);
    if(normalized)return normalized;
  }
  return 'en';
}
function cachedPreference(){
  try{
    const value=globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    if(value==='auto'||SUPPORTED_LOCALES.includes(value))return value;
  }catch{/* Storage is optional; safe browser-language fallback. */}
  return 'auto';
}
let preference=cachedPreference(),currentLocale=resolveLocale(preference),revision=0;
const listeners=new Set();
export const getLocale=()=>currentLocale;
export const getLocalePreference=()=>preference;
export function translate(key,params={},locale=currentLocale){
  // Fallback never reveals the raw internal key. CI verifies all locale keys.
  const template=CATALOGS[locale]?.[key]??en[key];
  if(typeof template!=='string')return 'Translation unavailable';
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(_,name)=>{
    const value=params?.[name];
    if(value===undefined||value===null)return '';
    return typeof value==='number'?new Intl.NumberFormat(locale).format(value):String(value);
  });
}
export function localizeLiteral(value,locale=currentLocale){
  // Only explicit, known source messages: never translate arbitrary user file data.
  const key=bySource.get(value);
  return key?translate(key,{},locale):value;
}
export function numberFormatter(locale=currentLocale,options={}){return new Intl.NumberFormat(locale,options);}
export function dateFormatter(locale=currentLocale,options={dateStyle:'medium'}){return new Intl.DateTimeFormat(locale,options);}
export function collator(locale=currentLocale,options={numeric:true}){return new Intl.Collator(locale,options);}
export function formatFileSize(bytes,locale=currentLocale){
  if(!Number.isFinite(bytes)||bytes<0)throw new RangeError('Invalid file byte count');
  if(bytes<1024)return numberFormatter(locale).format(bytes)+' B';
  if(bytes<1048576)return numberFormatter(locale,{maximumFractionDigits:1}).format(bytes/1024)+' KiB';
  return numberFormatter(locale,{maximumFractionDigits:1}).format(bytes/1048576)+' MiB';
}
export function subscribeLocale(callback){
  if(typeof callback!=='function')throw new TypeError('Locale subscriber must be a function');
  listeners.add(callback);return ()=>listeners.delete(callback);
}
export function setLocalePreference(next,{api=globalThis.chrome,persist=true}={}){
  if(next!=='auto'&&!SUPPORTED_LOCALES.includes(next))throw new RangeError('Unsupported locale');
  const was=preference,oldLocale=currentLocale;
  preference=next;currentLocale=resolveLocale(next);revision++;
  if(persist){
    try{globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY,next);}catch{/* no localStorage */}
    try{api?.storage?.local?.set({[LOCALE_STORAGE_KEY]:next})?.catch?.(()=>{});}catch{/* no chrome.storage */}
  }
  if(was!==next||oldLocale!==currentLocale)for(const callback of [...listeners])callback(currentLocale);
  return currentLocale;
}
export async function loadLocalePreference({api=globalThis.chrome}={}){
  const atStart=revision;
  try{
    const value=(await api?.storage?.local?.get(LOCALE_STORAGE_KEY))?.[LOCALE_STORAGE_KEY];
    if(revision===atStart&&(value==='auto'||SUPPORTED_LOCALES.includes(value)))
      setLocalePreference(value,{api,persist:false});
  }catch{/* Storage permission/read failure is not a file permission failure. */}
  return currentLocale;
}
export function verifyLocaleCatalogs(){
  const missing={},extras={},placeholders={};
  const signature=text=>[...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(v=>v[1]).sort().join(',');
  for(const locale of SUPPORTED_LOCALES){
    const catalog=CATALOGS[locale];
    missing[locale]=canonical.filter(key=>typeof catalog[key]!=='string'||!catalog[key].trim());
    extras[locale]=Object.keys(catalog).filter(key=>!Object.hasOwn(en,key));
    placeholders[locale]=canonical.filter(key=>typeof catalog[key]==='string'&&signature(catalog[key])!==signature(en[key]));
  }
  return {missing,extras,placeholders,valid:SUPPORTED_LOCALES.every(locale=>!missing[locale].length&&!extras[locale].length&&!placeholders[locale].length)};
}

// Used by the existing imperative Workspace and Settings pages during migration.
// New React consumers call translate()/subscribeLocale() directly; no React DOM is edited.
export function initTrustedPageLocale({doc=globalThis.document,api=globalThis.chrome,page='workspace'}={}){
  if(!doc?.createTreeWalker||!doc?.body)return ()=>{};
  const root=page==='workspace'?doc.getElementById('file-workspace'):doc.querySelector('main');
  if(!root)return ()=>{};
  const slots=[];
  const walker=doc.createTreeWalker(root,4); // SHOW_TEXT; preserve SVG, controls, editor drafts and other nodes
  let node;
  while((node=walker.nextNode())){
    if(node.parentElement?.closest?.('script,style,textarea,pre,#file-list,#file-preview-slot,#app-preview-slot'))continue;
    const matched=/^(\s*)([\s\S]*?)(\s*)$/.exec(node.nodeValue||'');
    if(!matched||!bySource.has(matched[2]))continue;
    slots.push({kind:'text',node,original:matched[2],lead:matched[1],tail:matched[3],last:node.nodeValue});
  }
  for(const element of root.querySelectorAll('[aria-label],[title],[placeholder]')){
    if(element.closest?.('#file-list,#file-preview-slot,#app-preview-slot'))continue;
    for(const attribute of ['aria-label','title','placeholder']){
      const original=element.getAttribute(attribute);
      if(original&&bySource.has(original))
        slots.push({kind:'attribute',node:element,attribute,original,last:original});
    }
  }
  const picker=doc.getElementById(page==='workspace'?'workspace-locale':'settings-locale');
  function render(locale){
    doc.documentElement.lang=locale;
    doc.title=translate(page+'.documentTitle',{},locale);
    for(const slot of slots){
      const previous=slot.kind==='text'?slot.node.nodeValue:slot.node.getAttribute(slot.attribute);
      // If business logic has replaced a field with a path, user text, or status, do not overwrite it.
      if(previous!==slot.last&&previous!==(slot.kind==='text'?slot.lead+slot.original+slot.tail:slot.original))continue;
      const next=translate(bySource.get(slot.original),{},locale);
      slot.last=slot.kind==='text'?slot.lead+next+slot.tail:next;
      if(slot.kind==='text')slot.node.nodeValue=slot.last;
      else slot.node.setAttribute(slot.attribute,slot.last);
    }
    if(picker)picker.value=preference;
  }
  const stop=subscribeLocale(render);
  const onChange=()=>setLocalePreference(picker.value,{api});
  picker?.addEventListener('change',onChange);
  render(currentLocale);
  void loadLocalePreference({api});
  const onChromeChange=(changes,area)=>{
    const value=changes?.[LOCALE_STORAGE_KEY]?.newValue;
    if(area==='local'&&(value==='auto'||SUPPORTED_LOCALES.includes(value))&&value!==preference)
      setLocalePreference(value,{api,persist:false});
  };
  api?.storage?.onChanged?.addListener?.(onChromeChange);
  return ()=>{stop();picker?.removeEventListener('change',onChange);api?.storage?.onChanged?.removeListener?.(onChromeChange);};
}
