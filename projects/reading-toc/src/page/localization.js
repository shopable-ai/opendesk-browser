// Pure catalog rendering, preserved from the existing view's locale semantics.
const UI_LOCALE_DEFAULT='zh-CN';
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
