// Pure trusted-UI message catalog. No storage, Chrome API or language-controller side effects.
// Browser protocol values, installed-tool content and user data are never translated here.
import en from './locales/en.js';
import zhCN from './locales/zh-CN.js';
import zhTW from './locales/zh-TW.js';
import ja from './locales/ja.js';
import {SIDEBAR_NAV_MESSAGES} from './sidebar-navigation.js';

export const CATALOGS=Object.freeze({
  en:Object.freeze({...en,...SIDEBAR_NAV_MESSAGES.en}),
  'zh-CN':Object.freeze({...zhCN,...SIDEBAR_NAV_MESSAGES['zh-CN']}),
  'zh-TW':Object.freeze({...zhTW,...SIDEBAR_NAV_MESSAGES['zh-TW']}),
  ja:Object.freeze({...ja,...SIDEBAR_NAV_MESSAGES.ja})
});

export function translateUiText(key,params={},locale='zh-CN'){
  const template=CATALOGS[locale]?.[key]??en[key];
  if(typeof template!=='string')return 'Translation unavailable';
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(_,name)=>{
    const value=params?.[name];
    if(value===undefined||value===null)return '';
    return typeof value==='number'?new Intl.NumberFormat(locale).format(value):String(value);
  });
}
