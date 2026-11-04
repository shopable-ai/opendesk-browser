import {createSiteProfileRegistry} from './site-profiles.js';
import {permissionPattern} from '../environment.js';

// This prefix is reserved to this reconciler, including across SW restarts.
const prefix='opendesk-web-task-';
async function registrationId(profile,scriptPath){
  // Include every reviewed execution input. No mutable in-memory version ledger.
  const identity=JSON.stringify([profile.id,profile.version,profile.origin,profile.adapter,
    profile.adapterVersion,[...profile.protocols].sort(),scriptPath]);
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
  return prefix+profile.id+'-'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function matchesRegistration(actual,expected){
  return actual.allFrames===false&&actual.world===expected.world&&actual.runAt===expected.runAt&&
    actual.persistAcrossSessions===true&&actual.js?.length===1&&actual.js[0]===expected.js[0]&&
    actual.matches?.length===1&&actual.matches[0]===expected.matches[0]&&
    !actual.css?.length&&!actual.excludeMatches?.length&&!actual.matchOriginAsFallback;
}

// Trusted framework caller supplies a fixed packaged script path, never Profile JS.
// Unregistering prevents future injection; it does NOT dispose already loaded
// documents. The SW/runtime must independently enforce revocation there.
// Returns completed changes: [{type:'unregister'|'register',id}]. API failures reject.
export function createSiteContentRegistration({api,profiles,adapterIds,protocolIds,
  scriptPath='agents/web-task-content.js'}={}){
  if(typeof scriptPath!=='string'||!/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.js$/u.test(scriptPath))
    throw new TypeError('Expected a fixed packaged JavaScript path');
  let pending=Promise.resolve();
  async function reconcile(){
    const current=typeof profiles==='function'?await profiles():profiles;
    // Validate the entire configuration before permissions or registration APIs.
    const registry=createSiteProfileRegistry({profiles:current,adapterIds,protocolIds});
    // select() provides immutable validated copies; disabled profiles return null.
    const selected=current.map(profile=>profile.enabled?registry.select(profile.origin):null).filter(Boolean);
    const desired=new Map();
    for(const profile of selected){
      // ChatGPT keeps its existing static bridge/entry point.
      if(profile.id==='chatgpt'||profile.adapter==='chatgpt'||profile.origin==='https://chatgpt.com')continue;
      // Chrome match patterns cover all ports on this host. Runtime/ingress
      // must still compare the full origin (including port) to the Profile.
      const match=permissionPattern(profile.origin);
      if(await api.permissions.contains({origins:[match]})!==true)continue;
      const id=await registrationId(profile,scriptPath);
      desired.set(id,{id,matches:[match],js:[scriptPath],allFrames:false,world:'ISOLATED',
        runAt:'document_idle',persistAcrossSessions:true});
    }
    const existing=await api.scripting.getRegisteredContentScripts();
    const retained=new Set(),obsolete=[];
    for(const entry of existing){
      if(!entry.id.startsWith(prefix))continue;
      const expected=desired.get(entry.id);
      if(expected&&matchesRegistration(entry,expected))retained.add(entry.id);
      else obsolete.push(entry.id);
    }
    const changes=[];
    // Remove all revoked/stale owned registrations before adding any replacements.
    if(obsolete.length){
      await api.scripting.unregisterContentScripts({ids:obsolete});
      changes.push(...obsolete.map(id=>({type:'unregister',id})));
    }
    const additions=[...desired.values()].filter(entry=>!retained.has(entry.id));
    if(additions.length){
      await api.scripting.registerContentScripts(additions);
      changes.push(...additions.map(({id})=>({type:'register',id})));
    }
    return changes;
  }
  return Object.freeze({reconcile(){
    const result=pending.then(reconcile);
    pending=result.catch(()=>{}); // Release the queue; caller still receives rejection.
    return result;
  }});
}
