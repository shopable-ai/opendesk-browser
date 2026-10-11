import {digestUtf8 as sha256Utf8} from '../../platform/protocol.js';

import {BUILTIN_RUNTIME_CATALOG as BUILTIN_CATALOG} from '../../libs/runtime-contract.js';
const row=BUILTIN_CATALOG.libraries.jquery;
export const JQUERY_371=Object.freeze({
  id:row.id,version:row.version,sha256:row.sha256,path:row.output,
  license:row.license,origin:'packaged'
});

const fail=code=>Object.assign(new Error(code),{code});
// Only usable inside a trusted extension host. This returns audited JS text,
// never evaluates it in the SW or pulls a script from a website/CDN.
export async function loadPackagedJquery({runtime=globalThis.chrome?.runtime,fetchImpl=globalThis.fetch}={}) {
  if(typeof runtime?.getURL!=='function'||typeof fetchImpl!=='function')
    throw fail('E_RESOURCE_UNAVAILABLE');
  let root,url;
  try{root=runtime.getURL('');url=runtime.getURL(JQUERY_371.path);}
  catch{throw fail('E_RESOURCE_IDENTITY');}
  if(!/^chrome-extension:\/\/[^/?#]+\/$/.test(root)||url!==root+JQUERY_371.path||
     (runtime.id&&root!=='chrome-extension://'+runtime.id+'/'))
    throw fail('E_RESOURCE_IDENTITY');
  let response;
  try{response=await fetchImpl(url,{cache:'no-store',credentials:'omit'});}
  catch{throw fail('E_RESOURCE_UNAVAILABLE');}
  if(!response?.ok||response.redirected||(response.url&&response.url!==url))
    throw fail('E_RESOURCE_UNAVAILABLE');
  let code;
  try{code=await response.text();}
  catch{throw fail('E_RESOURCE_UNAVAILABLE');}
  if(typeof code!=='string'||new TextEncoder().encode(code).byteLength!==row.bytes||
     await sha256Utf8(code)!==JQUERY_371.sha256)throw fail('E_DEPENDENCY_HASH');
  return Object.freeze({descriptor:JQUERY_371,code});
}
