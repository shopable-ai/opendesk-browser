// Real upstream query-string@9.5.1, with exact npm lock and transitive SRI.
// This compatibility surface is Page USER_SCRIPT opt-in only; it neither
// accesses Chrome privileges nor changes the target website MAIN global.
import upstream from 'query-string';

const exposed=Object.freeze(['extract','parse','stringify','parseUrl','stringifyUrl','pick','exclude']);
export function installPageQueryString(scope=globalThis){
  if(!scope.document)
    throw Object.assign(new Error('query-string requires Page USER_SCRIPT'),{code:'E_BUILTIN_WORLD'});
  if(Object.hasOwn(scope,'queryString'))
    throw Object.assign(new Error('queryString global already exists'),{code:'E_BUILTIN_COLLISION'});
  if(exposed.some(name=>typeof upstream[name]!=='function'))
    throw Object.assign(new Error('Upstream query-string public API changed'),{code:'E_BUILTIN_VERSION_UNAVAILABLE'});
  const api=Object.freeze(Object.fromEntries(exposed.map(name=>[name,upstream[name]])));
  Object.defineProperty(scope,'queryString',{value:api,writable:false,configurable:false,enumerable:false});
}
