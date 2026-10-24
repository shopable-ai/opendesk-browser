// Framework-owned application UI locale. Deliberately independent of chrome.i18n and Browser SDK.
export const UI_LOCALE_STORE='opendesk.ui.locale.v1';
export const UI_LOCALE_DEFAULT='zh-CN';

// Global UI preferences are deliberately narrower than tool catalog target locales.
export const UI_LOCALE_SUPPORTED=Object.freeze(['en','zh-CN','zh-TW','ja']);
export const isUiLocalePreference=value=>value==='auto'||UI_LOCALE_SUPPORTED.includes(value);
export function normalizeUiLocale(value){
  if(typeof value!=='string')return null;
  const input=value.trim().replace(/_/g,'-').toLowerCase();
  if(/^zh-(?:tw|hk|mo)(?:-|$)/.test(input)||/^zh-hant(?:-|$)/.test(input))return 'zh-TW';
  if(input==='zh'||/^zh-(?:cn|sg|hans)(?:-|$)/.test(input))return 'zh-CN';
  if(/^ja(?:-|$)/.test(input))return 'ja';
  if(/^en(?:-|$)/.test(input))return 'en';
  return null;
}
export function resolveGlobalUiLocale(preference='auto',languages=
  typeof globalThis.document==='undefined'?['zh-CN']:
    (globalThis.navigator?.languages?.length?globalThis.navigator.languages:[globalThis.navigator?.language])){
  if(UI_LOCALE_SUPPORTED.includes(preference))return preference;
  for(const language of Array.isArray(languages)?languages:[languages]){
    const locale=normalizeUiLocale(language);if(locale)return locale;
  }
  return 'en';
}

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
const localeWrites=new WeakMap();
function serializeLocaleWrite(api,action){
  const locks=globalThis.navigator?.locks;
  if(locks?.request)return locks.request('opendesk.ui.locale.preference',action);
  const key=api?.storage?.local;
  if(!key)return action();
  const next=(localeWrites.get(key)||Promise.resolve()).then(action);
  localeWrites.set(key,next.catch(()=>{}));return next;
}
// Shared preference lifecycle for trusted pages. Tool catalogs above keep arbitrary BCP47.
export function createUiLocaleController(api=globalThis.chrome,{languages,eventTarget=globalThis,
  storage=()=>globalThis.localStorage}={}){
  let preference='auto',error=null,closed=false,revision=0,intent=0,recoveryGeneration=0,unknown=false,connectedApi;
  const subscribers=new Set();
  const resolve=()=>resolveGlobalUiLocale(preference,languages);
  let locale;
  const notify=()=>{
    for(const fn of [...subscribers]){
      if(closed)break;
      if(!subscribers.has(fn))continue;
      try{fn(locale);}catch{/* One consumer cannot block another or fail a storage write. */}
    }
  };
  const update=(value,nextError=null)=>{
    const next=isUiLocalePreference(value)?value:'auto';
    const previous=locale,oldPreference=preference,oldError=error;
    preference=next;locale=resolve();error=nextError;
    if(previous!==locale||oldPreference!==preference||oldError!==error)notify();
  };
  const storageError=cause=>Object.assign(new Error('E_UI_LOCALE_STORAGE',{cause}),{code:'E_UI_LOCALE_STORAGE'});
  const unknownError=cause=>Object.assign(new Error('E_UI_LOCALE_OUTCOME_UNKNOWN',{cause}),{code:'E_UI_LOCALE_OUTCOME_UNKNOWN'});
  try{const value=storage()?.getItem(UI_LOCALE_STORE);if(isUiLocalePreference(value))preference=value;}
  catch(cause){error=storageError(cause);}
  locale=resolve();
  let committed=preference;
  const pending=new Map();
  const onChanged=(changes,area)=>{
    if(!closed&&area==='local'&&Object.hasOwn(changes||{},UI_LOCALE_STORE)){
      const value=changes[UI_LOCALE_STORE]?.newValue;
      if(pending.has(value))return; // Ignore our write echoes, including older queued choices.
      revision++;update(value,unknown?error:null);committed=preference;
    }
  };
  const onStorage=event=>{
    // Chrome storage is authoritative when available; localStorage is its startup cache.
    if(!closed&&!connectedApi?.storage?.local&&
       (event.key===UI_LOCALE_STORE||event.key===null)){
      revision++;update(event.key===null?'auto':event.newValue);committed=preference;
    }
  };
  const onLanguage=()=>{if(!closed&&preference==='auto')update('auto',error);};
  const connect=nextApi=>{
    if(connectedApi===nextApi)return;
    connectedApi?.storage?.onChanged?.removeListener?.(onChanged);
    connectedApi=nextApi;
    connectedApi?.storage?.onChanged?.addListener?.(onChanged);
  };
  eventTarget?.addEventListener?.('storage',onStorage);
  eventTarget?.addEventListener?.('languagechange',onLanguage);
  async function load(nextApi=connectedApi){
    if(closed)return locale;
    connect(nextApi);
    const atStart=revision;
    try{
      if(connectedApi?.storage?.local){
        if(!connectedApi.storage.local.get)throw Error('Storage read unavailable');
        const data=await connectedApi.storage.local.get(UI_LOCALE_STORE);
        if(!closed&&revision===atStart){unknown=false;update(data?.[UI_LOCALE_STORE]);committed=preference;}
      }
    }catch(cause){if(!closed&&revision===atStart)update(preference,unknown?unknownError(cause):storageError(cause));}
    return locale;
  }
  let writes=Promise.resolve();
  function change(value,{persist=true,api:nextApi=connectedApi}={}){
    if(!isUiLocalePreference(value))throw Error('E_UI_LOCALE_INVALID');
    if(closed)throw Error('E_UI_LOCALE_DISPOSED');
    if(unknown)throw error;
    connect(nextApi);
    ++revision;
    const ownIntent=++intent;
    const generation=recoveryGeneration;
    update(value);
    if(!persist){committed=value;return Promise.resolve();}
    pending.set(value,(pending.get(value)||0)+1);
    // Serialize writes so a slower older set cannot become the final stored choice.
    const operation=writes.then(()=>serializeLocaleWrite(nextApi,async()=>{
      if(unknown)throw error;
      if(generation!==recoveryGeneration)throw Object.assign(new Error('E_UI_LOCALE_RECOVERY_REQUIRED'),{code:'E_UI_LOCALE_RECOVERY_REQUIRED'});
      let outcomeUnknown=false;
      try{
        if(nextApi?.storage?.local){
          if(!nextApi.storage.local.set)throw Error('Storage write unavailable');
          let writeFailure;
          try{await nextApi.storage.local.set({[UI_LOCALE_STORE]:value});}
          catch(cause){writeFailure=cause;}
          // A lost acknowledgement can follow a durable write. Reconcile the
          // actual preference before rolling back or reporting it as saved.
          let actual;
          try{actual=(await nextApi.storage.local.get(UI_LOCALE_STORE))?.[UI_LOCALE_STORE];}
          catch(cause){outcomeUnknown=true;throw cause;}
          if(actual!==value){
            if(isUiLocalePreference(actual))committed=actual;
            throw writeFailure||Error('Locale preference readback mismatch');
          }
          try{storage()?.setItem(UI_LOCALE_STORE,value);}catch{/* Chrome is authoritative. */}
        }else{
          const local=storage();if(!local?.setItem)throw Error('Storage unavailable');
          local.setItem(UI_LOCALE_STORE,value);
        }
        committed=value;
        if(!closed&&intent===ownIntent)update(value);
      }catch(cause){
        const failure=outcomeUnknown?unknownError(cause):storageError(cause);
        if(outcomeUnknown){unknown=true;recoveryGeneration++;}
        if(!closed&&(intent===ownIntent||outcomeUnknown))update(outcomeUnknown?preference:committed,failure);
        throw failure;
      }
    })).finally(()=>{
        const count=pending.get(value)-1;
        if(count)pending.set(value,count);else pending.delete(value);
    });
    writes=operation.catch(()=>{});
    return operation;
  }
  connect(api);
  const ready=load(api);
  return Object.freeze({
    ready,load,
    getLocale:()=>locale,
    getPreference:()=>preference,
    getError:()=>error,
    subscribe(fn){
      if(typeof fn!=='function')throw new TypeError('Locale subscriber must be a function');
      if(closed)return ()=>{};
      subscribers.add(fn);return ()=>subscribers.delete(fn);
    },
    async setLocale(value){await change(value);},
    // Synchronous presentation API retained for trusted i18n; errors remain observable.
    setLocalePreference(value,options){void change(value,options).catch(()=>{});return locale;},
    dispose(){
      if(closed)return;closed=true;revision++;subscribers.clear();
      connectedApi?.storage?.onChanged?.removeListener?.(onChanged);
      eventTarget?.removeEventListener?.('storage',onStorage);
      eventTarget?.removeEventListener?.('languagechange',onLanguage);
    }
  });
}
