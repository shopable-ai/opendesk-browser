import {digestUtf8} from '../../platform/protocol.js';
import {BUILTIN_ABI,BUILTIN_CATALOG} from './catalog.js';

const error=(code,detail)=>Object.assign(new Error(detail||code),{code});
const hex=/^[a-f0-9]{64}$/;
const utf8=new TextEncoder();
async function packagedText(path,{runtime,fetchImpl},maxBytes) {
  if(typeof runtime?.getURL!=='function'||typeof fetchImpl!=='function')throw error('E_BUILTIN_RESOURCE','扩展内置库加载器不可用');
  const url=runtime.getURL(path),parsed=new URL(url);
  if(parsed.protocol!=='chrome-extension:'||!parsed.host||parsed.search||parsed.hash||
    !parsed.pathname.endsWith('/'+path))throw error('E_BUILTIN_RESOURCE','内置库必须来自当前扩展');
  let response;
  try{response=await fetchImpl(url,{cache:'no-store',credentials:'omit'});}
  catch{throw error('E_BUILTIN_RESOURCE','扩展内置资源无法读取');}
  if(!response?.ok||response.redirected||response.url&&response.url!==url)throw error('E_BUILTIN_RESOURCE','内置资源缺失或被重定向');
  const code=await response.text();
  if(utf8.encode(code).byteLength===0||utf8.encode(code).byteLength>maxBytes)throw error('E_BUILTIN_RESOURCE','内置资源大小不符合合同');
  return code;
}
async function loadBuiltinSource(path,{runtime=globalThis.chrome?.runtime,fetchImpl=globalThis.fetch}={}) {
  const provider={runtime,fetchImpl},manifestText=await packagedText(BUILTIN_CATALOG.resourceManifest,provider,8192);
  let manifest;try{manifest=JSON.parse(manifestText);}catch{throw error('E_BUILTIN_MANIFEST','内置库发布清单不是 JSON');}
  const catalogSha256=await digestUtf8(JSON.stringify(BUILTIN_CATALOG));
  const paths=[BUILTIN_CATALOG.pageCore,BUILTIN_CATALOG.controllerCore,BUILTIN_CATALOG.libraries.lodash.licensePath,
    BUILTIN_CATALOG.libraries.dayjs.licensePath];
  if(manifest?.format!=='opendesk.builtin-resources.v1'||manifest.abi!==BUILTIN_ABI||
    manifest.catalogSha256!==catalogSha256||!Array.isArray(manifest.resources)||
    manifest.resources.length!==paths.length||
    manifest.resources.some((row,i)=>row?.path!==paths[i]||!Number.isSafeInteger(row.bytes)||
      row.bytes<=0||row.bytes>512*1024||!hex.test(row.sha256)))
    throw error('E_BUILTIN_VERSION_UNAVAILABLE','内置库目录与发布清单不一致，请更新扩展');
  const index=paths.indexOf(path);
  if(index<0||index>1)throw error('E_BUILTIN_RESOURCE','不允许读取任意内置库路径');
  const source=await packagedText(path,provider,512*1024);
  const row=manifest.resources[index];
  if(utf8.encode(source).byteLength!==row.bytes||await digestUtf8(source)!==row.sha256)
    throw error('E_BUILTIN_HASH','内置库固定脚本的内容哈希错误，用户代码未执行');
  return Object.freeze({code:source,sha256:row.sha256,catalogSha256,abi:BUILTIN_ABI});
}

export const loadBuiltinPageSource=options=>loadBuiltinSource(BUILTIN_CATALOG.pageCore,options);
export const loadBuiltinWorkerSource=options=>loadBuiltinSource(BUILTIN_CATALOG.controllerCore,options);
