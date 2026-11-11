// Public store navigation is presentation-only. It grants no installation authority.
// The externally connectable install channel remains in channel-config.json.
import {BROWSER_PUBLIC_CONFIG} from '../config/browser-config.js';

export const STORE_WEBSITE_SCHEMA='opendesk.market.website-navigation.v1';
// Adapt the framework public config to the original navigation contract.
// Trusted installation origins and approvals are not part of this projection.
const source=BROWSER_PUBLIC_CONFIG?Object.freeze({
  schema:STORE_WEBSITE_SCHEMA,url:BROWSER_PUBLIC_CONFIG.navigation.extensionStore
}):null;
const invalid=()=>({status:'invalid',url:null});

export function resolveStoreWebsiteConfig(config=source){
  if(!config||typeof config!=='object'||Array.isArray(config)||
    Object.keys(config).sort().join(',')!=='schema,url'||config.schema!==STORE_WEBSITE_SCHEMA)
    return invalid();
  if(config.url===null)return {status:'coming_soon',url:null};
  if(typeof config.url!=='string'||config.url.length>2048||config.url!==config.url.trim())
    return invalid();
  let target;
  try{target=new URL(config.url);}catch{return invalid();}
  const host=target.hostname.toLowerCase();
  if(target.protocol!=='https:'||target.username||target.password||
    target.search||target.hash||target.port||!host.includes('.')||
    host.startsWith('.')||host.endsWith('.')||host.includes(':')||
    !/^[a-z0-9.-]+$/.test(host)||/^[\d.]+$/.test(host)||
    /(^|\.)(localhost|local|test|invalid|example|internal)$/.test(host)||
    /(^|\.)example\.(com|net|org)$/.test(host))
    return invalid();
  return {status:'ready',url:target.href};
}

export const OFFICIAL_STORE_WEBSITE=Object.freeze(resolveStoreWebsiteConfig());

// A store click only opens a website. Never fall back to the bundled market,
// install a package, or infer website authority from this navigation URL.
export function navigateOfficialStore(api,config=source){
  const website=resolveStoreWebsiteConfig(config);
  if(website.status!=='ready')return Promise.resolve(website);
  try{
    return Promise.resolve(api.tabs.create({url:website.url,active:true}))
      .then(()=>({status:'tab_created',url:website.url}))
      .catch(error=>({status:'failed',error}));
  }catch(error){return Promise.resolve({status:'failed',error});}
}
