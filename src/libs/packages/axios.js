// Real upstream axios@1.20.0 (post-2026 security fixes), locked with npm SRI.
// It exposes Page's ordinary Axios instance or an opt-in Controller instance
// whose transport is ONLY the existing admitted axiosx Broker service.
import upstreamAxios from 'axios';
import {createAuthorizedAxiosTransport} from '../adapters/axios-transport.js';

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

// Optional Controller service: created ONLY inside the authenticated, isolated
// Worker main() realm. Do not share it with extension SW, website MAIN or Page.
export function installControllerAxios(scope=globalThis,http){
  if(scope?.document||!http||!['get','post','put','delete'].every(name=>typeof http[name]==='function'))
    throw fail('E_BUILTIN_WORLD','Controller Axios needs the admitted axiosx transport');
  if(Object.hasOwn(scope,'axios'))throw fail('E_BUILTIN_COLLISION','Axios global already exists');
  if(typeof upstreamAxios?.create!=='function'||typeof upstreamAxios.AxiosError!=='function')
    throw fail('E_BUILTIN_VERSION_UNAVAILABLE','Upstream Axios version incompatible');

  const create=options=>{
    if(options!==undefined&&(!options||typeof options!=='object'||Array.isArray(options)||
      Object.hasOwn(options,'adapter')||Object.hasOwn(options,'transport')))
      throw fail('E_CONFIG_UNSUPPORTED','Controller Axios cannot replace the authorized transport');
    let instance;
    const admitted=createAuthorizedAxiosTransport({
      http,getUri:config=>instance.getUri(config),
      makeHttpError:(response,config)=>new upstreamAxios.AxiosError(
        'Request failed with status code '+response.status,
        response.status>=500?upstreamAxios.AxiosError.ERR_BAD_RESPONSE:upstreamAxios.AxiosError.ERR_BAD_REQUEST,
        config,null,response)
    });
    instance=upstreamAxios.create({...options,withCredentials:false,adapter:admitted,
      timeout:options?.timeout??15000});
    // Request interceptors are LIFO. Register this protector FIRST, so it
    // executes LAST after all user interceptors and cannot be ejected/cleared.
    const guardId=instance.interceptors.request.use(config=>{
      if(config.adapter!==admitted)throw fail('E_CONFIG_UNSUPPORTED','Controller Axios adapter override denied');
      return config;
    });
    const requestInterceptors=Object.freeze({
      use:(...args)=>instance.interceptors.request.use(...args),
      eject:id=>{if(id===guardId)throw fail('E_CONFIG_UNSUPPORTED','Cannot remove Controller transport guard');
        instance.interceptors.request.eject(id);},
      clear:()=>{throw fail('E_CONFIG_UNSUPPORTED','Cannot clear Controller transport guard');}
    });
    const responseInterceptors=Object.freeze({
      use:(...args)=>instance.interceptors.response.use(...args),
      eject:id=>instance.interceptors.response.eject(id),
      clear:()=>instance.interceptors.response.clear()
    });
    const api=(...args)=>instance(...args);
    for(const method of ['get','post','put','delete','request','getUri'])
      Object.defineProperty(api,method,{value:(...args)=>instance[method](...args),enumerable:true});
    Object.defineProperty(api,'create',{value:create,enumerable:true});
    Object.defineProperty(api,'interceptors',{value:Object.freeze({
      request:requestInterceptors,response:responseInterceptors}),enumerable:true});
    Object.defineProperty(api,'defaults',{value:instance.defaults,enumerable:true});
    return Object.freeze(api);
  };
  const client=create();
  Object.defineProperty(scope,'axios',{value:client,writable:false,configurable:false,enumerable:false});
  return client;
}
