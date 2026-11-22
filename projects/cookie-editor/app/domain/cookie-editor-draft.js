import {localExpirationText,parseLocalExpiration} from './cookie-expiration.js';
import {key} from './cookie-model.js';

// Keep only structured attribute changes. Free-form name, domain, path and
// value input stay in the mounted editor; even validated text can be private.
export function cookieAttributePatch(initial,draft){
  const patch={};
  for(const field of ['secure','httpOnly']){
    if(typeof draft[field]==='boolean'&&draft[field]!==initial[field])patch[field]=draft[field];
  }
  if(['unspecified','lax','strict','no_restriction'].includes(draft.sameSite)&&draft.sameSite!==initial.sameSite)
    patch.sameSite=draft.sameSite;
  if(draft.session===true&&initial.session===false)patch.session=true;
  if(draft.session===false&&(initial.session||draft.expiration!==initial.expiration)){
    const parsed=parseLocalExpiration(draft.expiration);
    if(parsed.status==='valid'&&parsed.seconds>Date.now()/1000){
      patch.session=false;patch.expirationSeconds=parsed.seconds;
    }
  }
  return Object.keys(patch).length?patch:null;
}

export function applyCookieAttributePatch(initial,patch){
  if(!patch)return initial;
  const {expirationSeconds,...changes}=patch;
  if(changes.session===false){
    const expiration=localExpirationText(expirationSeconds);
    if(expirationSeconds>Date.now()/1000&&parseLocalExpiration(expiration).seconds===expirationSeconds)
      changes.expiration=expiration;
    else delete changes.session;
  }
  return {...initial,...changes};
}

// The controller has already bracketed the metadata read with Store and
// Partition checks. Bind to that scope even when the selected row is unpartitioned.
export function cookieDraftBinding(snapshot,id){
  const {target,verifiedScope,rows}=snapshot;
  if(snapshot.phase!=='ready'||snapshot.navigationPending||snapshot.syncStale||
     !target?.origin||!verifiedScope||id===null||id==='new')return null;
  const matched=rows.filter(row=>row.id===id);
  if(matched.length!==1)return null;
  const [row]=matched;
  const [store,site,ancestor]=JSON.parse(verifiedScope);
  if(key(row)!==id||row.storeId!==store||row.partitionKey&&
     (row.partitionKey.topLevelSite!==site||Boolean(row.partitionKey.hasCrossSiteAncestor)!==ancestor))return null;
  return JSON.stringify([target.origin,verifiedScope,id,
    row.secure,row.httpOnly,row.sameSite,row.session,row.expirationDate??null]);
}
