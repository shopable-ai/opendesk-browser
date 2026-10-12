// Trusted extension-host loader; never evaluates source or uses runtime CDN.
import {digestUtf8} from '../platform/protocol.js';
import {BUILTIN_ABI,BUILTIN_PACKAGE_RESOURCE_LIMIT,BUILTIN_RUNTIME_CATALOG as catalog,BUILTIN_RESOURCE_PATHS as paths} from './runtime-contract.js';
const fail=code=>Object.assign(new Error(code),{code});
const hex=/^[a-f0-9]{64}$/;
const libs=Object.values(catalog.libraries);
async function read(path,ctx,limit){
  const {runtime,fetchImpl}=ctx;
  if(typeof runtime?.getURL!=='function'||typeof fetchImpl!=='function')
    throw fail('E_BUILTIN_RESOURCE');
  let root,url;
  try{root=runtime.getURL('');url=runtime.getURL(path);}
  catch{throw fail('E_BUILTIN_RESOURCE');}
  if(!/^chrome-extension:\/\/[^/?#]+\/$/.test(root)||url!==root+path||
    runtime.id&&root!=='chrome-extension://'+runtime.id+'/')
    throw fail('E_BUILTIN_RESOURCE');
  let reply;
  try{reply=await fetchImpl(url,{cache:'no-store',credentials:'omit'});}
  catch{throw fail('E_BUILTIN_RESOURCE');}
  if(!reply?.ok||reply.redirected||reply.url&&reply.url!==url)
    throw fail('E_BUILTIN_RESOURCE');
  let text;
  try{text=await reply.text();}catch{throw fail('E_BUILTIN_RESOURCE');}
  if(typeof text!=='string')throw fail('E_BUILTIN_RESOURCE');
  const bytes=new TextEncoder().encode(text).length;
  if(!bytes||bytes>limit)throw fail('E_BUILTIN_RESOURCE');
  return {text,bytes};
}
async function manifestFor(ctx){
  const {text:json}=await read(catalog.resourceManifest,ctx,16384);
  let manifest;
  try{manifest=JSON.parse(json);}catch{throw fail('E_BUILTIN_MANIFEST');}
  const catalogSha256=await digestUtf8(JSON.stringify(catalog)),rows=manifest?.resources;
  if(manifest?.format!=='opendesk.builtin-resources.v2'||manifest.abi!==BUILTIN_ABI||
    manifest.catalogSha256!==catalogSha256||!Array.isArray(rows)||rows.length!==paths.length||
    rows.some((item,i)=>item?.path!==paths[i]||!Number.isSafeInteger(item.bytes)||
      item.bytes<1||item.bytes>BUILTIN_PACKAGE_RESOURCE_LIMIT||!hex.test(item.sha256))||
    !libs.every(lib=>!lib.sha256||rows.some(item=>item.path===lib.output&&
      item.sha256===lib.sha256&&item.bytes===lib.bytes)))
    throw fail('E_BUILTIN_VERSION_UNAVAILABLE');
  return {rows,catalogSha256};
}
async function checked(path,ctx,rows){
  const row=rows[paths.indexOf(path)];
  if(!row)throw fail('E_BUILTIN_VERSION_UNAVAILABLE');
  const {text,bytes}=await read(path,ctx,BUILTIN_PACKAGE_RESOURCE_LIMIT);
  if(bytes!==row.bytes||await digestUtf8(text)!==row.sha256)
    throw fail('E_BUILTIN_HASH');
  const pinned=libs.find(x=>x.output===path&&x.sha256);
  if(path===catalog.bootstrap&&row.sha256!==catalog.bootstrapSha256||
    pinned&&(row.sha256!==pinned.sha256||row.bytes!==pinned.bytes))
    throw fail('E_BUILTIN_HASH');
  return {text,bytes,sha256:row.sha256};
}
async function load(world,{runtime=globalThis.chrome?.runtime,fetchImpl=globalThis.fetch}={}){
  const ctx={runtime,fetchImpl};
  const {rows,catalogSha256}=await manifestFor(ctx);
  const selected=[catalog.bootstrap,...libs.filter(x=>x.default&&x.worlds.includes(world)).map(x=>x.output),
    world==='CONTROLLER'?catalog.controllerCore:catalog.pageCore];
  const parts=[],resources=[];
  for(const path of selected){
    const item=await checked(path,ctx,rows);
    parts.push(item.text);resources.push(Object.freeze({path,bytes:item.bytes,sha256:item.sha256}));
  }
  const code=parts.join('\n;\n');
  return Object.freeze({code,sha256:await digestUtf8(code),catalogSha256,abi:BUILTIN_ABI,
    resources:Object.freeze(resources)});
}
export const loadBuiltinPageSource=options=>load('USER_SCRIPT',options);
export const loadBuiltinWorkerSource=options=>load('CONTROLLER',options);

// Every selection is verified against ONE fixed manifest; selection grants
// no new world/network authority and does not fetch anything before validation.
export async function loadPackagedOptionalPageLibraries(ids,{runtime=globalThis.chrome?.runtime,
  fetchImpl=globalThis.fetch}={}){
  if(!Array.isArray(ids)||!ids.length||ids.length>6||new Set(ids).size!==ids.length||
    ids.some(id=>typeof id!=='string'||!Object.hasOwn(catalog.libraries,id)||
      catalog.libraries[id].default||!catalog.libraries[id].worlds.includes('USER_SCRIPT')))
    throw fail('E_BUILTIN_DECLARATION');
  const ctx={runtime,fetchImpl},{rows,catalogSha256}=await manifestFor(ctx);
  const chosen=[];
  for(const id of ids){
    const library=catalog.libraries[id],asset=await checked(library.output,ctx,rows);
    chosen.push(Object.freeze({id:library.id,version:library.version,code:asset.text,
      bytes:asset.bytes,sha256:asset.sha256,catalogSha256,abi:BUILTIN_ABI}));
  }
  return Object.freeze(chosen);
}
export async function loadPackagedOptionalPageLibrary(id,options){
  return (await loadPackagedOptionalPageLibraries([id],options))[0];
}

// Only Axios is currently admitted to the Controller optional world. The
// binary is the SAME pinned resource used by Page, never a second npm bundle.
export function controllerSelectedPackagedLibrary(sourceUtf8){
  if(typeof sourceUtf8!=='string')throw fail('E_BUILTIN_DECLARATION');
  const ids=[];
  for(const line of sourceUtf8.replace(/^\uFEFF/,'').split(/\r?\n/)){
    if(/^\s*$/.test(line))continue;
    const row=/^\s*\/\/\s*@opendesk-lib\s+([^\s]+)\s*$/.exec(line);
    if(row){ids.push(row[1]);continue;}
    if(!/^\s*\/\//.test(line))break;
  }
  const chosen=[...new Set(ids)];
  if(chosen.length>1||chosen.some(id=>id!=='axios')||
     ids.length>6)throw fail('E_BUILTIN_DECLARATION');
  return chosen[0]??null;
}
export async function loadPackagedOptionalControllerLibrary(id,options){
  if(id!=='axios'||!catalog.libraries.axios.worlds.includes('CONTROLLER'))
    throw fail('E_BUILTIN_DECLARATION');
  // The shared loader performs one manifest read and exact SHA-256 per asset.
  return (await loadPackagedOptionalPageLibraries([id],options))[0];
}
