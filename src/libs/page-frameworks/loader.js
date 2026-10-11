// Trusted extension-host loader. Never fetch executable scripts from a page,
// CDN or arbitrary URL; verify immutable bundled bytes before USER_SCRIPT use.
import {digestUtf8} from '../../platform/protocol.js';
import {PAGE_FRAMEWORK_RUNTIMES,PAGE_FRAMEWORK_RESOURCE_LIMIT} from './contract.js';
const fail=code=>Object.assign(new Error(code),{code});
export async function loadPackagedPageFramework(id,{runtime=globalThis.chrome?.runtime,fetchImpl=globalThis.fetch}={}){
  const descriptor=Object.hasOwn(PAGE_FRAMEWORK_RUNTIMES,id)?PAGE_FRAMEWORK_RUNTIMES[id]:null;
  if(!descriptor)throw fail('E_PAGE_FRAMEWORK_UNKNOWN');
  if(typeof runtime?.getURL!=='function'||typeof fetchImpl!=='function')
    throw fail('E_RESOURCE_UNAVAILABLE');
  let root,url;
  try{root=runtime.getURL('');url=runtime.getURL(descriptor.output);}
  catch{throw fail('E_RESOURCE_IDENTITY');}
  if(!/^chrome-extension:\/\/[^/?#]+\/$/.test(root)||url!==root+descriptor.output||
    runtime.id&&root!=='chrome-extension://'+runtime.id+'/')throw fail('E_RESOURCE_IDENTITY');
  let response;
  try{response=await fetchImpl(url,{cache:'no-store',credentials:'omit'});}
  catch{throw fail('E_RESOURCE_UNAVAILABLE');}
  if(!response?.ok||response.redirected||response.url&&response.url!==url)
    throw fail('E_RESOURCE_UNAVAILABLE');
  let code;
  try{code=await response.text();}
  catch{throw fail('E_RESOURCE_UNAVAILABLE');}
  if(typeof code!=='string'||new TextEncoder().encode(code).length!==descriptor.bytes||
    descriptor.bytes>PAGE_FRAMEWORK_RESOURCE_LIMIT||
    await digestUtf8(code)!==descriptor.sha256)throw fail('E_DEPENDENCY_HASH');
  return Object.freeze({id:descriptor.id,version:descriptor.version,sha256:descriptor.sha256,code});
}
