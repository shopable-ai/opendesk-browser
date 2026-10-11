// Real upstream axios@1.20.0 (post-2026 security fixes), locked with npm SRI.
// This package is a Page USER_SCRIPT opt-in only. It does NOT expose the
// Controller/extension network Broker or grant cross-origin privileges.
import upstreamAxios from 'axios';

const fail=(code,message)=>Object.assign(new Error(message),{code});
export function installPageAxios(scope=globalThis){
  if(!scope.document)throw fail('E_BUILTIN_WORLD','Axios Page library requires a document');
  if(Object.hasOwn(scope,'axios'))throw fail('E_BUILTIN_COLLISION','Axios global already exists');
  if(typeof upstreamAxios?.create!=='function'||typeof upstreamAxios.get!=='function')
    throw fail('E_BUILTIN_VERSION_UNAVAILABLE','Upstream Axios factory unavailable');
  // New instance per USER_SCRIPT world. Keep its documented mutable defaults
  // and interceptors, but seal the top-level global. Ordinary browser fetch/XHR
  // still applies; never fall back to chrome API or privileged axiosx.
  const instance=upstreamAxios.create({withCredentials:false,timeout:15000});
  if(typeof instance!=='function'||typeof instance.get!=='function'||
     typeof instance.post!=='function'||typeof instance.put!=='function'||
     typeof instance.delete!=='function'||typeof instance.request!=='function'||
     typeof instance.getUri!=='function'||typeof instance.interceptors?.request?.use!=='function'||
     typeof instance.interceptors?.response?.use!=='function')
    throw fail('E_BUILTIN_VERSION_UNAVAILABLE','Upstream Axios API mismatch');
  Object.defineProperty(scope,'axios',{value:instance,writable:false,configurable:false,enumerable:false});
}
