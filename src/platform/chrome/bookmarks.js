// Owned Chrome bookmark adapter for the ONE installed-tool Browser Host.
// Native bookmark IDs stay inside Chrome extension storage. No tree listing,
// global deletion, or tool-controlled parentId is exposed to sandbox callers.
import {BOOKMARK_OWNED_STORE_PREFIX} from '../../framework/sdk/browser-contract.js';
import {writeVerifiedLocalValue} from '../../ui/sidebar-tools/storage-state.js';
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const TOKEN=/^[A-Za-z0-9_-]{16,160}$/;
const TOOL=/^[a-z][a-z0-9-]{1,39}$/,HASH=/^[a-f0-9]{64}$/;
const MAX_OWNED=64;
function owner(context){
  if(!context||!TOOL.test(context.toolId||'')||!HASH.test(context.packageHash||'')||
    typeof context.toolVersion!=='string'||!context.toolVersion||
    typeof context.installEpoch!=='string'||!context.installEpoch)
    throw fail('E_OWNER','Verified installed-tool identity required');
  return JSON.stringify([context.toolId,context.toolVersion,context.packageHash,context.installEpoch]);
}
function originFor(raw){
  if(typeof raw!=='string'||raw.length>2048||raw.trim()!==raw)throw fail('E_SCHEMA');
  let url;
  try{url=new URL(raw)}catch{throw fail('E_SCHEMA','Invalid bookmark URL')}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.href!==raw)
    throw fail('E_SCHEMA','Only canonical credential-free HTTP(S) bookmarks are allowed');
  return url.origin;
}
function isMissingBookmarkError(error){
  // Observed in controlled Chrome 155. Broad substring matches also accept
  // permission/service failures and could incorrectly release owned mappings.
  return String(error?.message||error||'').trim()==="Can't find bookmark for id.";
}
export function createBrowserBookmarksHost({api=globalThis.chrome,authorize,
  createRef=()=>crypto.randomUUID(),clock=Date}={}){
  if(typeof authorize!=='function')
    throw fail('E_CONTEXT','Existing Browser Host authorization is required');
  let generation=0;
  const key=context=>BOOKMARK_OWNED_STORE_PREFIX+context.toolId;
  async function read(context,{allowReset=false}={}){
    // Optional API availability must not break unrelated Browser Host routes.
    // Fail closed only when an installed tool actually invokes Bookmarks.
    if(!api?.storage?.local?.get||!api?.storage?.local?.set)
      throw fail('E_CHROME_UNSUPPORTED','Chrome local storage is unavailable for owned bookmarks');
    const identity=owner(context);
    let raw;
    try{raw=(await api.storage.local.get(key(context)))[key(context)]}
    catch{throw fail('E_HOST_STORAGE_READ','Cannot verify owned bookmark records')}
    if(raw===undefined)return {owner:identity,refs:{}};
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||
      Object.keys(raw).sort().join(',')!=='owner,refs'||typeof raw.owner!=='string'||
      !raw.refs||typeof raw.refs!=='object'||Array.isArray(raw.refs)||
      Object.keys(raw.refs).length>MAX_OWNED||
      Object.entries(raw.refs).some(([ref,row])=>
        !TOKEN.test(ref)||!row||typeof row!=='object'||Array.isArray(row)||
        Object.keys(row).sort().join(',')!=='createdAt,nativeId,origin,url'||
        typeof row.nativeId!=='string'||!row.nativeId||row.nativeId.length>128||
        typeof row.url!=='string'||typeof row.origin!=='string'||
        !Number.isSafeInteger(row.createdAt)||row.createdAt<0||
        (()=>{try{return originFor(row.url)!==row.origin}catch{return true}})()))
      throw fail('E_BOOKMARK_STORAGE_CORRUPT','Owned bookmark mapping is invalid');
    if(raw.owner!==identity){
      if(!allowReset)throw fail('E_BOOKMARK_REF_INVALID','Bookmark belongs to another tool revision');
      return {owner:identity,refs:{}};
    }
    return raw;
  }
  async function write(context,previous,next){
    await writeVerifiedLocalValue(api,key(context),next,previous,'本工具书签引用');
  }
  async function guard(operation,context,origin){
    await authorize({operation,context,origin});
  }
  async function create(input,context){
    const identity=owner(context),origin=originFor(input?.url);
    if(input.parentRef!==undefined)
      throw fail('E_BOOKMARK_PARENT_UNAVAILABLE','No tool-owned bookmark folder exists');
    if(input.title!==undefined&&(typeof input.title!=='string'||!input.title.trim()||
       input.title.length>256||/[\u0000-\u001f\u007f]/.test(input.title)))
      throw fail('E_SCHEMA','Invalid bookmark title');
    if(!api?.bookmarks?.create)throw fail('E_CHROME_UNSUPPORTED','Chrome bookmarks.create unavailable');
    const previous=await read(context,{allowReset:true});
    if(Object.keys(previous.refs).length>=MAX_OWNED)
      throw fail('E_LIMIT','At most 64 owned bookmarks per installed tool');
    await guard('browser.bookmarks.create',context,origin);
    const ref=createRef(),epoch=generation;
    if(typeof ref!=='string'||!TOKEN.test(ref)||Object.hasOwn(previous.refs,ref))
      throw fail('E_CONTEXT','Unique opaque bookmark reference unavailable');
    let node;
    try{node=await api.bookmarks.create({url:input.url,
      ...(input.title!==undefined?{title:input.title}:{})})}
    catch{throw fail('E_OUTCOME_UNKNOWN','Bookmark may have been created; do not retry blindly')}
    if(typeof node?.id!=='string'||!node.id||node.id.length>128||node.url!==input.url)
      throw fail('E_OUTCOME_UNKNOWN','Chrome did not confirm exact bookmark identity');
    try{await guard('browser.bookmarks.create',context,origin)}
    catch{throw fail('E_OUTCOME_UNKNOWN','Bookmark may have been created before revocation')}
    if(generation!==epoch)throw fail('E_OUTCOME_UNKNOWN','Bookmark may have been created before revocation');
    // Re-read under the existing per-tool Host lock. Every ref is private to
    // the exact installed package hash and install epoch.
    const current=await read(context,{allowReset:true});
    if(current.owner!==identity||Object.keys(current.refs).length>=MAX_OWNED)
      throw fail('E_OUTCOME_UNKNOWN','Bookmark mapping changed after native creation');
    try{await write(context,current,{owner:identity,refs:{
      ...current.refs,[ref]:{nativeId:node.id,url:input.url,origin,createdAt:clock.now()}
    }})}
    catch{throw fail('E_OUTCOME_UNKNOWN','Bookmark created but durable ownership record is uncertain')}
    try{await guard('browser.bookmarks.create',context,origin)}
    catch{throw fail('E_OUTCOME_UNKNOWN','Bookmark was created but tool authority changed')}
    if(generation!==epoch)throw fail('E_OUTCOME_UNKNOWN');
    return {bookmarkRef:ref};
  }
  async function removeOwned(input,context){
    owner(context);
    if(typeof input?.bookmarkRef!=='string'||!TOKEN.test(input.bookmarkRef))
      throw fail('E_SCHEMA','Opaque owned BookmarkRef required');
    const saved=await read(context),row=saved.refs[input.bookmarkRef];
    if(!row)throw fail('E_BOOKMARK_REF_INVALID','No bookmark is owned by this tool under that reference');
    await guard('browser.bookmarks.removeOwned',context,row.origin);
    if(!api?.bookmarks?.get||!api?.bookmarks?.remove)
      throw fail('E_CHROME_UNSUPPORTED','Chrome owned bookmark removal unavailable');
    let nodes;
    try{nodes=await api.bookmarks.get(row.nativeId)}
    catch(error){
      if(isMissingBookmarkError(error))nodes=[];
      else throw fail('E_CHROME','Cannot confirm the bookmarked URL')
    }
    if(!Array.isArray(nodes))throw fail('E_CHROME','Invalid Chrome bookmarks.get result');
    if(nodes.length>1||nodes.length===1&&(nodes[0].id!==row.nativeId||
      nodes[0].url!==row.url))
      throw fail('E_BOOKMARK_REF_INVALID','Original bookmark was changed or replaced');
    await guard('browser.bookmarks.removeOwned',context,row.origin);
    const epoch=generation;
    if(nodes.length){
      try{await api.bookmarks.remove(row.nativeId)}
      catch{throw fail('E_OUTCOME_UNKNOWN','Bookmark removal outcome unknown; inspect Chrome bookmarks')}
    }
    try{await guard('browser.bookmarks.removeOwned',context,row.origin)}
    catch{throw fail('E_OUTCOME_UNKNOWN','Bookmark removal may have occurred before revocation')}
    if(generation!==epoch)throw fail('E_OUTCOME_UNKNOWN');
    const current=await read(context);
    if(current.refs[input.bookmarkRef]?.nativeId!==row.nativeId)
      throw fail('E_OUTCOME_UNKNOWN','Owned mapping changed during removal');
    const refs={...current.refs};delete refs[input.bookmarkRef];
    try{await write(context,current,{...current,refs})}
    catch{throw fail('E_OUTCOME_UNKNOWN','Bookmark removal outcome is not durably confirmed')}
    return {removed:nodes.length===1};
  }
  const revokeAll=()=>{generation++};
  return Object.freeze({create,removeOwned,revokeAll,
    diagnostics:()=>({generation})});
}
