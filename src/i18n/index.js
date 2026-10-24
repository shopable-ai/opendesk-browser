// Shared internationalization for trusted OpenDesk pages (not untrusted installed tools).
// A locale affects UI strings only. Native protocol fields, paths, signatures and file bytes are never transformed.
import {UI_LOCALE_STORE,UI_LOCALE_SUPPORTED,normalizeUiLocale,resolveGlobalUiLocale,createUiLocaleController} from '../ui/app-localization.js';
import en from './locales/en.js';
import zhCN from './locales/zh-CN.js';
import zhTW from './locales/zh-TW.js';
import ja from './locales/ja.js';

export const LOCALE_STORAGE_KEY=UI_LOCALE_STORE;
export const SUPPORTED_LOCALES=UI_LOCALE_SUPPORTED;
export const LOCALE_NAMES=Object.freeze({en:'English','zh-CN':'简体中文','zh-TW':'繁體中文',ja:'日本語'});
export const CATALOGS=Object.freeze({en,'zh-CN':zhCN,'zh-TW':zhTW,ja});
const canonical=Object.keys(en);
const bySource=new Map(Object.entries(zhCN).map(([key,value])=>[value,key]));

export const normalizeLocale=normalizeUiLocale;
export const resolveLocale=resolveGlobalUiLocale;
const controller=createUiLocaleController();
export const getLocale=controller.getLocale;
export const getLocalePreference=controller.getPreference;
export const getLocaleError=controller.getError;
export function translate(key,params={},locale=getLocale()){
  // Fallback never reveals the raw internal key. CI verifies all locale keys.
  const template=CATALOGS[locale]?.[key]??en[key];
  if(typeof template!=='string')return 'Translation unavailable';
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(_,name)=>{
    const value=params?.[name];
    if(value===undefined||value===null)return '';
    return typeof value==='number'?new Intl.NumberFormat(locale).format(value):String(value);
  });
}
export function localizeLiteral(value,locale=getLocale()){
  // Only explicit, known source messages: never translate arbitrary user file data.
  const key=bySource.get(value);
  return key?translate(key,{},locale):value;
}
export function numberFormatter(locale=getLocale(),options={}){return new Intl.NumberFormat(locale,options);}
export function dateFormatter(locale=getLocale(),options={dateStyle:'medium'}){return new Intl.DateTimeFormat(locale,options);}
export function collator(locale=getLocale(),options={numeric:true}){return new Intl.Collator(locale,options);}
export function formatFileSize(bytes,locale=getLocale()){
  if(!Number.isFinite(bytes)||bytes<0)throw new RangeError('Invalid file byte count');
  if(bytes<1024)return numberFormatter(locale).format(bytes)+' B';
  if(bytes<1048576)return numberFormatter(locale,{maximumFractionDigits:1}).format(bytes/1024)+' KiB';
  return numberFormatter(locale,{maximumFractionDigits:1}).format(bytes/1048576)+' MiB';
}
export const subscribeLocale=controller.subscribe;
export function setLocalePreference(next,options){
  if(next!=='auto'&&!SUPPORTED_LOCALES.includes(next))throw new RangeError('Unsupported locale');
  return controller.setLocalePreference(next,options);
}
export function loadLocalePreference({api=globalThis.chrome}={}){return controller.load(api);}
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
  // One locale registry owns choices across trusted pages. Adding a language
  // never requires modifying Workspace/Settings HTML or a second selector.
  if(picker){
    const names=[['auto',translate('common.browserLanguage')],...SUPPORTED_LOCALES.map(id=>[id,LOCALE_NAMES[id]])];
    picker.replaceChildren(...names.map(([id,label])=>{
      const option=doc.createElement('option');option.value=id;option.textContent=label;return option;
    }));
  }
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
    if(picker){
      const auto=picker.querySelector('option[value="auto"]');
      if(auto)auto.textContent=translate('common.browserLanguage',{},locale);
      picker.value=getLocalePreference();
    }
  }
  const stop=subscribeLocale(render);
  const onChange=()=>setLocalePreference(picker.value,{api});
  picker?.addEventListener('change',onChange);
  render(getLocale());
  void loadLocalePreference({api});
  return ()=>{stop();picker?.removeEventListener('change',onChange);};
}
