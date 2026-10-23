// Trusted Host-owned site review for the PUBLIC site-budget.v3 Driver.
// Chrome's extension-wide <all_urls> is NEVER proof of a particular app's grant.
// Stored grants are keyed to one installed package digest AND revocation epoch.
// This pure contract has no UI, Chrome native calls, installer or executable JS.
import {isManagedSiteV3Host,normalizeManagedSiteV3Policy}
  from '../sdk/site-budget-v3-policy.js';

export const MANAGED_SITE_REVIEWED_SCOPE_STORE='opendesk.browser.site-budget.reviewed-sites.v1';
const fail=()=>{throw Object.assign(new Error('受管网站范围记录无效，已停止授权'),
  {code:'E_SITE_SCOPE_CORRUPT'});};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,fields)=>plain(value)&&Object.keys(value).sort().join(',')===fields.slice().sort().join(',');
const toolId=id=>typeof id==='string'&&/^[a-z][a-z0-9-]{1,39}$/.test(id);
const packageDigest=sha=>typeof sha==='string'&&/^[a-f0-9]{64}$/.test(sha);
const validEpoch=value=>value===null||typeof value==='string'&&value.length>0&&value.length<=100;
function validated(raw){
  if(raw===undefined)return {};
  if(!plain(raw)||Object.keys(raw).length>12)fail();
  const records={};
  for(const [id,record] of Object.entries(raw)){
    if(!toolId(id)||!exact(record,['installEpoch','packageHash','sites'])||
       !validEpoch(record.installEpoch)||!packageDigest(record.packageHash)||
       !Array.isArray(record.sites)||record.sites.length>60)fail();
    const hosts=new Set();
    for(const site of record.sites){
      if(!exact(site,['host','subdomains'])||!isManagedSiteV3Host(site.host)||
         typeof site.subdomains!=='boolean'||hosts.has(site.host))fail();
      hosts.add(site.host);
    }
    records[id]=record;
  }
  return records;
}
const grants=(record,installEpoch,packageHash)=>
  record?.installEpoch===installEpoch&&record.packageHash===packageHash?record.sites:[];
function covers(granted,site){
  return granted.some(entry=>
    (entry.host===site.host&&(entry.subdomains||!site.subdomains))||
    entry.subdomains&&site.host.endsWith('.'+entry.host));
}
export function reviewedManagedSiteScopeCovers(raw,toolIdValue,installEpoch,packageHash,policy){
  if(!toolId(toolIdValue)||!validEpoch(installEpoch)||!packageDigest(packageHash))
    return false;
  let records,normalized;
  try{records=validated(raw);normalized=normalizeManagedSiteV3Policy(policy);}
  catch{return false;}
  if(!normalized.enabled)return true;
  return normalized.sites.filter(site=>site.enabled)
    .every(site=>covers(grants(records[toolIdValue],installEpoch,packageHash),site));
}
export function extendReviewedManagedSiteScopes(raw,{id,installEpoch,packageHash,policy}){
  if(!toolId(id)||!validEpoch(installEpoch)||!packageDigest(packageHash))fail();
  const records=validated(raw),normalized=normalizeManagedSiteV3Policy(policy);
  if(!normalized.enabled)return {...records};
  const prior=grants(records[id],installEpoch,packageHash).map(x=>({...x}));
  const needed=normalized.sites.filter(site=>site.enabled);
  for(const site of needed){
    if(covers(prior,site))continue;
    const existing=prior.find(row=>row.host===site.host);
    if(existing)existing.subdomains=existing.subdomains||site.subdomains;
    else prior.push({host:site.host,subdomains:site.subdomains});
  }
  if(prior.length>60)fail();
  return {...records,[id]:{installEpoch,packageHash,sites:prior}};
}
export function managedSiteV3RequiredOrigins(policy){
  const normalized=normalizeManagedSiteV3Policy(policy);
  return normalized.enabled?normalized.sites.filter(site=>site.enabled)
    .map(site=>'*://'+(site.subdomains?'*.':'')+site.host+'/*'):[];
}

// A *trusted Installer*, after verifying both installed packages' provenance,
// may carry an existing app-level review to a new installation epoch. The
// passed policy MUST be read from the old sealed Driver ledger, never from
// candidate JS. The old grant is replaced, not widened or duplicated.
// This is a pure proposed state: caller journals, serializes and verifies the
// Chrome Storage write under the existing tool/catalog/grant locks.
export function rebindReviewedManagedSiteScopes(raw,{
  id,fromEpoch,fromHash,toEpoch,toHash,policy
}={}){
  if(!toolId(id)||!validEpoch(fromEpoch)||fromEpoch===null||
     !validEpoch(toEpoch)||toEpoch===null||
     !packageDigest(fromHash)||!packageDigest(toHash)||
     fromEpoch===toEpoch&&fromHash===toHash)fail();
  const records=validated(raw),normalized=normalizeManagedSiteV3Policy(policy);
  const prior=records[id];
  if(!prior)return {...records}; // No previous user review to inherit.
  if(prior.installEpoch===toEpoch&&prior.packageHash===toHash){
    // Readback of a previously committed transfer is idempotent only when
    // the migrated record still covers the persisted policy.
    if(!reviewedManagedSiteScopeCovers(records,id,toEpoch,toHash,normalized))fail();
    return {...records};
  }
  if(prior.installEpoch!==fromEpoch||prior.packageHash!==fromHash||
     !reviewedManagedSiteScopeCovers(records,id,fromEpoch,fromHash,normalized))
    fail(); // No implicit scope escalation or cross-owner inheritance.
  const next={installEpoch:toEpoch,packageHash:toHash,
    sites:prior.sites.map(site=>({...site}))};
  if(!reviewedManagedSiteScopeCovers({...records,[id]:next},id,toEpoch,toHash,normalized))
    fail();
  return {...records,[id]:next};
}
