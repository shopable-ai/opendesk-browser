// Framework-owned application UI locale. Deliberately independent of chrome.i18n and Browser SDK.
export const UI_LOCALE_STORE='opendesk.ui.locale.v1';
export const UI_LOCALE_DEFAULT='zh-CN';

export function canonicalUiLocale(value){
  if(typeof value!=='string'||value.length<2||value.length>45||!/^[A-Za-z0-9-]+$/.test(value))return null;
  try{return Intl.getCanonicalLocales(value)[0]||null;}catch{return null;}
}
export function resolveUiLocale(requested,available=[UI_LOCALE_DEFAULT],source=UI_LOCALE_DEFAULT){
  const locales=[...new Set((Array.isArray(available)?available:[]).map(canonicalUiLocale).filter(Boolean))];
  const fallback=canonicalUiLocale(source)||UI_LOCALE_DEFAULT;
  const base=locales.includes(fallback)?fallback:locales[0]||fallback;
  const wanted=canonicalUiLocale(requested)||base;
  if(locales.includes(wanted))return wanted;
  const language=new Intl.Locale(wanted).language;
  if(locales.includes(language))return language;
  const candidates=locales.filter(item=>new Intl.Locale(item).language===language);
  return candidates.length===1?candidates[0]:base;
}
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const tokens=text=>[...String(text).matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(match=>match[1]).sort().join(',');
const safeText=value=>typeof value==='string'&&value.length>0&&value.length<=380&&
  !/[<>\u0000-\u001f]/.test(value)&&!/javascript\s*:|\bon[a-z]+\s*=/i.test(value);

// Build-time validation: unknown executable fields, stale translations and placeholder drift fail closed.
// Published target messages carry the exact reviewed source text, so editing the source invalidates them.
export function compileToolLocaleCatalog(catalog){
  if(!plain(catalog)||Object.keys(catalog).sort().join(',')!=='messages,sourceLocale'||
     !plain(catalog.messages))throw Error('E_TOOL_LOCALE_SCHEMA');
  const source=canonicalUiLocale(catalog.sourceLocale);
  const ids=Object.keys(catalog.messages);
  if(!source||!ids.includes(source)||ids.length>12||ids.length===0||
     ids.some(id=>id!==canonicalUiLocale(id)))throw Error('E_TOOL_LOCALE_IDS');
  const original=catalog.messages[source];
  if(!plain(original)||!Object.keys(original).length||Object.keys(original).length>160)
    throw Error('E_TOOL_LOCALE_SOURCE');
  const keys=Object.keys(original);
  if(keys.some(key=>!/^[a-z][a-zA-Z0-9]{0,63}$/.test(key)||!safeText(original[key])))
    throw Error('E_TOOL_LOCALE_SOURCE_MESSAGE');
  const output={[source]:{...original}};
  for(const lang of ids){
    if(lang===source)continue;
    const rows=catalog.messages[lang];
    if(!plain(rows)||Object.keys(rows).length>keys.length)throw Error('E_TOOL_LOCALE_TARGET');
    output[lang]={};
    for(const [key,row] of Object.entries(rows)){
      if(!keys.includes(key)||!plain(row)||Object.keys(row).sort().join(',')!=='source,text'||
         row.source!==original[key]||!safeText(row.text)||tokens(row.text)!==tokens(row.source))
        throw Error('E_TOOL_LOCALE_STALE_OR_UNSAFE: '+lang+'.'+key);
      output[lang][key]=row.text;
    }
  }
  return Object.freeze({sourceLocale:source,messages:output});
}
export function uiMessage(catalog,locale,key,parameters={}){
  const source=catalog?.sourceLocale||UI_LOCALE_DEFAULT,groups=catalog?.messages||{};
  const fallback=groups[source]?.[key];
  const chosen=resolveUiLocale(locale,Object.keys(groups),source);
  const candidate=groups[chosen]?.[key];
  const text=typeof candidate==='string'?candidate:
    (plain(candidate)&&candidate.source===fallback&&typeof candidate.text==='string'?candidate.text:null);
  const base=typeof text==='string'&&safeText(text)&&tokens(text)===tokens(fallback)?text:
    typeof fallback==='string'?fallback:'';
  return base.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(_,name)=>
    typeof parameters?.[name]==='string'||typeof parameters?.[name]==='number'?
      String(parameters[name]).slice(0,180):'');
}
export function createUiLocaleController(api){
  let locale=UI_LOCALE_DEFAULT,closed=false;
  const subscribers=new Set();
  const notify=()=>{for(const fn of subscribers)fn(locale);};
  const update=value=>{const normalized=canonicalUiLocale(value)||UI_LOCALE_DEFAULT;
    if(locale===normalized)return;locale=normalized;notify();};
  const onChanged=(changes,area)=>{if(area==='local'&&Object.hasOwn(changes,UI_LOCALE_STORE))
    update(changes[UI_LOCALE_STORE].newValue);};
  api?.storage?.onChanged?.addListener(onChanged);
  const ready=Promise.resolve().then(()=>api?.storage?.local?.get(UI_LOCALE_STORE))
    .then(data=>{if(!closed)update(data?.[UI_LOCALE_STORE]);})
    .catch(()=>{}); // storage unavailable -> always keep the usable source language
  return Object.freeze({
    ready,
    getLocale:()=>locale,
    subscribe(fn){subscribers.add(fn);return ()=>subscribers.delete(fn);},
    async setLocale(value){
      const normalized=canonicalUiLocale(value);
      if(!normalized)throw Error('E_UI_LOCALE_INVALID');
      if(!api?.storage?.local?.set)throw Error('E_UI_LOCALE_STORAGE');
      await api.storage.local.set({[UI_LOCALE_STORE]:normalized});
      if(!closed)update(normalized);
    },
    dispose(){closed=true;subscribers.clear();api?.storage?.onChanged?.removeListener(onChanged);}
  });
}
