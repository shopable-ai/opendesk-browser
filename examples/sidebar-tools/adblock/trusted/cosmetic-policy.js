// Fixed AdBlock cosmetic-rule policy. Network DNR policy/storage stays separate.
import {adblockHost} from './policy.js';

export const ADBLOCK_COSMETIC_STORE='opendesk.adblock.cosmetic.v1';
export const ADBLOCK_COSMETIC_PROTOCOL='opendesk.adblock.cosmetic.page.v1';
export const ADBLOCK_COSMETIC_MAX_SITE=35;
export const ADBLOCK_COSMETIC_MAX_TOTAL=300;
export const ADBLOCK_COSMETIC_PICK_TTL_MS=120000;

// Keep the existing isolated-world ID/nth-of-type format; advanced editing
// may additionally use only bounded advertising-themed class selectors.
// No arbitrary CSS, pseudo-class, attribute, universal or root selectors.
const AD_CLASS='(?:[a-z][a-z0-9-]{0,23}[-_])?(?:ad|ads|advert|advertisement|sponsor|sponsored|promo)(?:[-_][a-z0-9][a-z0-9_-]{0,40})?';
const CLASS_ATOM='(?:[a-z][a-z0-9-]{0,31})?\\.'+AD_CLASS;
const ATOM='(?:#[A-Za-z][A-Za-z0-9_-]{0,63}|[a-z][a-z0-9-]{0,31}:nth-of-type\\([1-9][0-9]{0,2}\\)|'+CLASS_ATOM+')';
const PATH=new RegExp('^'+ATOM+'(?: > '+ATOM+'){0,11}$');
export function validCosmeticSelector(selector){
  return typeof selector==='string'&&selector.length>1&&selector.length<=320&&
    PATH.test(selector)&&!/(?:^| > )(?:html|body|head)(?:\.|:nth-of-type\()/.test(selector)&&
    !/(?:^| > )(?:main|nav|form):nth-of-type\([1-9][0-9]{0,2}\)$/.test(selector)&&
    !/(?:^| > )#(?:app|root|__next|__nuxt|main|site-root)$/i.test(selector)&&
    !selector.endsWith(' > ');
}
const fields=(v,keys)=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
const bad=()=>Object.assign(new Error('手动屏蔽规则存储损坏，原始数据保留；请先修复，不能覆盖保存'),{code:'E_ADBLOCK_COSMETIC_CORRUPT'});
export function readCosmeticState(raw){
  if(raw===undefined)return {version:1,entries:[]};
  if(!fields(raw,['version','entries'])||raw.version!==1||
    !Array.isArray(raw.entries)||raw.entries.length>ADBLOCK_COSMETIC_MAX_TOTAL)throw bad();
  const seen=new Set(),counts=new Map();
  for(const entry of raw.entries){
    if(!fields(entry,['host','selector'])||adblockHost(entry.host)!==entry.host||
       !validCosmeticSelector(entry.selector))throw bad();
    const key=entry.host+'\n'+entry.selector;
    if(seen.has(key))throw bad();
    seen.add(key);
    counts.set(entry.host,(counts.get(entry.host)||0)+1);
    if(counts.get(entry.host)>ADBLOCK_COSMETIC_MAX_SITE)throw bad();
  }
  return {version:1,entries:raw.entries.map(entry=>({host:entry.host,selector:entry.selector}))};
}
export function cosmeticForHost(state,host){
  return host&&adblockHost(host)===host?
    state.entries.filter(entry=>entry.host===host).map(entry=>({selector:entry.selector})):[];
}
export function addCosmeticRule(state,host,selector){
  if(adblockHost(host)!==host||!validCosmeticSelector(selector))
    throw Object.assign(Error('网站或屏蔽区域无效'),{code:'E_ADBLOCK_COSMETIC_SELECTOR'});
  if(state.entries.some(entry=>entry.host===host&&entry.selector===selector))return state;
  if(state.entries.length>=ADBLOCK_COSMETIC_MAX_TOTAL||
    state.entries.filter(entry=>entry.host===host).length>=ADBLOCK_COSMETIC_MAX_SITE)
    throw Object.assign(Error('本站屏蔽区域已达上限，请先恢复不需要的规则'),{code:'E_ADBLOCK_COSMETIC_LIMIT'});
  return {version:1,entries:[...state.entries,{host,selector}].sort(
    (a,b)=>a.host.localeCompare(b.host)||a.selector.localeCompare(b.selector))};
}
export function hasCosmeticRule(state,host,selector){
  return state.entries.some(entry=>entry.host===host&&entry.selector===selector);
}
export function removeCosmeticRule(state,host,selector){
  if(adblockHost(host)!==host||!validCosmeticSelector(selector))
    throw Object.assign(Error('待恢复的网站或区域无效'),{code:'E_ADBLOCK_COSMETIC_SELECTOR'});
  return {version:1,entries:state.entries.filter(entry=>
    entry.host!==host||entry.selector!==selector)};
}
