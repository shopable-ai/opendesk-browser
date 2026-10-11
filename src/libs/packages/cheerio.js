// Genuine upstream cheerio@1.2.0 browser slim entry; no undici, remote
// fetch, stream or Node APIs are exposed. Text parsing is NOT HTML sanitizing.
import {load as upstreamLoad} from 'cheerio/slim';
const MAX_HTML_BYTES=512*1024;
const fail=(code,message)=>Object.assign(new Error(message),{code});
export function installPageCheerio(scope=globalThis){
  if(!scope.document)
    throw fail('E_BUILTIN_WORLD','Cheerio requires an opt-in Page document');
  if(Object.hasOwn(scope,'cheerio'))
    throw fail('E_BUILTIN_COLLISION','Cheerio global already exists');
  if(typeof upstreamLoad!=='function')
    throw fail('E_BUILTIN_VERSION_UNAVAILABLE','Cheerio slim load() is missing');
  const api=Object.freeze({
    load(html,options,isDocument=true){
      if(typeof html!=='string'||typeof isDocument!=='boolean'||
        options!==undefined&&(!options||typeof options!=='object'||Array.isArray(options)))
        throw fail('E_CONFIG_UNSUPPORTED','Cheerio only accepts HTML text and parser options');
      if(new TextEncoder().encode(html).length>MAX_HTML_BYTES)
        throw fail('E_LIMIT','Cheerio input exceeds 512 KiB');
      return upstreamLoad(html,options,isDocument);
    }
  });
  Object.defineProperty(scope,'cheerio',{value:api,writable:false,configurable:false,enumerable:false});
}
