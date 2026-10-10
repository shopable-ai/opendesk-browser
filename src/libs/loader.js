import {digestUtf8} from '../platform/protocol.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG,BUILTIN_RESOURCE_PATHS} from './runtime-contract.js';

const error=(code,message)=>Object.assign(new Error(message||code),{code});
const hex=/^[a-f0-9]{64}$/;
const encoder=new TextEncoder();
async function packagedText(path,{runtime,fetchImpl},maxBytes) {
  if(typeof runtime?.getURL!=='function'||typeof fetchImpl!=='function')
    throw error('E_BUILTIN_RESOURCE','扩展内置库加载器不可用');
  const url=runtime.getURL(path),parsed=new URL(url),root=new URL(runtime.getURL(''));
  if(root.protocol!=='chrome-extension:'||!root.host||root.pathname!=='/'||
    parsed.protocol!==root.protocol||parsed.host!==root.host||parsed.search||parsed.hash||
    parsed.pathname!=='/'+path||(runtime.id&&runtime.id!==root.host))
    throw error('E_BUILTIN_RESOURCE','内置库必须来自当前扩展');
  let response;
  try{response=await fetchImpl(url,{cache:'no-store',credentials:'omit'});}
  catch{throw error('E_BUILTIN_RESOURCE','扩展内置资源无法读取');}
  if(!response?.ok||response.redirected||(response.url&&response.url!==url))
    throw error('E_BUILTIN_RESOURCE','内置资源缺失或被重定向');
  const text=await response.text(),bytes=encoder.encode(text).byteLength;
  if(!bytes||bytes>maxBytes)throw error('E_BUILTIN_RESOURCE','内置资源大小不符合合同');
  return {text,bytes};
}
async function loadBuiltinSource(world,{runtime=globalThis.chrome?.runtime,fetchImpl=globalThis.fetch}={}) {
  const provider={runtime,fetchImpl};
  const {text:manifestText}=await packagedText(BUILTIN_RUNTIME_CATALOG.resourceManifest,provider,16384);
  let manifest;try{manifest=JSON.parse(manifestText);}catch{throw error('E_BUILTIN_MANIFEST','发布清单不是 JSON');}
  const catalogSha256=await digestUtf8(JSON.stringify(BUILTIN_RUNTIME_CATALOG));
  const paths=BUILTIN_RESOURCE_PATHS;
  if(manifest?.format!=='opendesk.builtin-resources.v2'||manifest.abi!==BUILTIN_ABI||
    manifest.catalogSha256!==catalogSha256||!Array.isArray(manifest.resources)||
    manifest.resources.length!==paths.length||
    manifest.resources.some((row,i)=>row?.path!==paths[i]||
      !Number.isSafeInteger(row.bytes)||row.bytes<=0||row.bytes>512*1024||!hex.test(row.sha256)))
    throw error('E_BUILTIN_VERSION_UNAVAILABLE','内置库目录与发布清单不一致，请重新验证任务');
  const selected=[BUILTIN_RUNTIME_CATALOG.bootstrap,
    ...Object.values(BUILTIN_RUNTIME_CATALOG.libraries).filter(row=>row.default&&row.worlds.includes(world)).map(row=>row.output),
    world==='CONTROLLER'?BUILTIN_RUNTIME_CATALOG.controllerCore:BUILTIN_RUNTIME_CATALOG.pageCore];
  const pieces=[],loaded=[];
  for(const path of selected) {
    const row=manifest.resources[paths.indexOf(path)];
    if(!row)throw error('E_BUILTIN_VERSION_UNAVAILABLE','未登记库资源: '+path);
    const {text,bytes}=await packagedText(path,provider,512*1024);
    if(bytes!==row.bytes||await digestUtf8(text)!==row.sha256)
      throw error('E_BUILTIN_HASH','库文件完整性校验失败: '+path);
    const vendor=Object.values(BUILTIN_RUNTIME_CATALOG.libraries).find(pkg=>pkg.output===path&&pkg.origin==='vendor');
    if((path===BUILTIN_RUNTIME_CATALOG.bootstrap&&row.sha256!==BUILTIN_RUNTIME_CATALOG.bootstrapSha256)||
       (vendor&&(row.sha256!==vendor.sha256||row.bytes!==vendor.bytes)))
      throw error('E_BUILTIN_HASH','源码固定 SHA 与发布资源不一致: '+path);
    pieces.push(text);loaded.push(Object.freeze({path,bytes,sha256:row.sha256}));
  }
  const code=pieces.join('\n;\n');
  return Object.freeze({code,sha256:await digestUtf8(code),catalogSha256,abi:BUILTIN_ABI,
    resources:Object.freeze(loaded)});
}
export const loadBuiltinPageSource=options=>loadBuiltinSource('USER_SCRIPT',options);
export const loadBuiltinWorkerSource=options=>loadBuiltinSource('CONTROLLER',options);
