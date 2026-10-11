// Real upstream js-cookie@3.0.8, compiled locally by the approved WXT entry.
// Page USER_SCRIPT opt-in only. No Cookie API / HttpOnly / Background privilege.
import Cookies from 'js-cookie';

export function installPageCookies(scope=globalThis) {
  if(!scope.document)throw Object.assign(new Error('Cookies require a DOM Page'),{code:'E_BUILTIN_WORLD'});
  if(Object.hasOwn(scope,'Cookies'))
    throw Object.assign(new Error('Cookies global already present'),{code:'E_BUILTIN_COLLISION'});
  if(typeof Cookies?.get!=='function'||typeof Cookies.set!=='function'||
    typeof Cookies.remove!=='function'||typeof Cookies.withAttributes!=='function'||
    typeof Cookies.withConverter!=='function')
    throw Object.assign(new Error('js-cookie public API mismatch'),{code:'E_BUILTIN_VERSION_UNAVAILABLE'});
  Object.defineProperty(scope,'Cookies',{
    value:Object.freeze(Cookies),configurable:false,writable:false,enumerable:false
  });
}
