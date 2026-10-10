// Host-only package-byte loader. No eval, CDN or extra execution worker.
import {digestUtf8} from '../platform/protocol.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG as catalog,BUILTIN_RESOURCE_PATHS as paths} from './runtime-contract.js';

const fail=(code)=>Object.assign(new Error(code),{code});
const hex=/^[a-f0-9]{64}$/;
async function read(path,ctx,limit) {
  const {runtime,fetchImpl}=ctx;
  if(typeof runtime?.getURL!=='function'||typeof fetchImpl!=='function')
    throw fail('E_BUILTIN_RESOURCE');
  const root=runtime.getURL(''),url=runtime.getURL(path);
  // Fixed paths are from the compiled catalog, not user input. Require exact
  // current-extension root plus path and refuse a foreign/redirected response.
  if(!/^chrome-extension:\/\/[^/?#]+\/$/.test(root)||url!==root+path||
      (runtime.id&&root!=='chrome-extension://'+runtime.id+'/'))
    throw fail('E_BUILTIN_RESOURCE');
  let reply;
  try{reply=await fetchImpl(url,{cache:'no-store',credentials:'omit'});}
  catch{throw fail('E_BUILTIN_RESOURCE');}
  if(!reply?.ok||reply.redirected||(reply.url&&reply.url!==url))
    throw fail('E_BUILTIN_RESOURCE');
  const text=await reply.text(),bytes=new TextEncoder().encode(text).length;
  if(bytes===0||bytes>limit)throw fail('E_BUILTIN_RESOURCE');
  return {text,bytes};
}
async function load(world,{runtime=globalThis.chrome?.runtime,fetchImpl=globalThis.fetch}={}) {
  const ctx={runtime,fetchImpl};
  const {text:json}=await read(catalog.resourceManifest,ctx,16384);
  let manifest;
  try{manifest=JSON.parse(json);}catch{throw fail('E_BUILTIN_MANIFEST');}
  const catalogSha256=await digestUtf8(JSON.stringify(catalog)),rows=manifest?.resources;
  if(manifest?.format!=='opendesk.builtin-resources.v2'||manifest.abi!==BUILTIN_ABI||
     manifest.catalogSha256!==catalogSha256||!Array.isArray(rows)||rows.length!==paths.length||
     rows.some((item,i)=>item?.path!==paths[i]||!Number.isSafeInteger(item.bytes)||
       item.bytes<1||item.bytes>524288||!hex.test(item.sha256)))
    throw fail('E_BUILTIN_VERSION_UNAVAILABLE');
  const libs=Object.values(catalog.libraries);
  const selected=[catalog.bootstrap,...libs.filter(x=>x.default&&x.worlds.includes(world)).map(x=>x.output),
    world==='CONTROLLER'?catalog.controllerCore:catalog.pageCore];
  const parts=[],resources=[];
  for(const path of selected) {
    const row=rows[paths.indexOf(path)];
    if(!row)throw fail('E_BUILTIN_VERSION_UNAVAILABLE');
    const {text,bytes}=await read(path,ctx,524288);
    if(bytes!==row.bytes||await digestUtf8(text)!==row.sha256)
      throw fail('E_BUILTIN_HASH');
    const pinned=libs.find(x=>x.output===path&&x.sha256);
    if((path===catalog.bootstrap&&row.sha256!==catalog.bootstrapSha256)||
      (pinned&&(row.sha256!==pinned.sha256||row.bytes!==pinned.bytes)))
      throw fail('E_BUILTIN_HASH');
    parts.push(text);resources.push(Object.freeze({path,bytes,sha256:row.sha256}));
  }
  const code=parts.join('\n;\n');
  return Object.freeze({code,sha256:await digestUtf8(code),catalogSha256,abi:BUILTIN_ABI,
    resources:Object.freeze(resources)});
}
export const loadBuiltinPageSource=options=>load('USER_SCRIPT',options);
export const loadBuiltinWorkerSource=options=>load('CONTROLLER',options);
