// Genuine upstream @fingerprintjs/fingerprintjs@5.3.0 (MIT).
// Only an explicitly selected Page USER_SCRIPT can install this facade.
// No FingerprintJS.load(), Agent.get(), telemetry or network request occurs
// during import or installation. Upstream npm monitoring defaults to true;
// every permitted load() forces monitoring:false, with no caller override.
import upstream from '@fingerprintjs/fingerprintjs';

const fail=(code,message=code)=>Object.assign(new Error(message),{code});
export function installPageFingerprintJS(scope=globalThis,source=upstream){
  if(!scope.document)
    throw fail('E_BUILTIN_WORLD','FingerprintJS requires a Page document');
  if(Object.hasOwn(scope,'FingerprintJS'))
    throw fail('E_BUILTIN_COLLISION','FingerprintJS is already installed');
  if(typeof source?.load!=='function'||typeof source.hashComponents!=='function'||
     typeof source.componentsToDebugString!=='function')
    throw fail('E_BUILTIN_VERSION_UNAVAILABLE','Upstream FingerprintJS API changed');

  function load(options={}){
    if(!options||typeof options!=='object'||Array.isArray(options)||
       Object.keys(options).some(key=>!['monitoring','delayFallback','debug'].includes(key)))
      throw fail('E_CONFIG_UNSUPPORTED','Unexpected FingerprintJS options');
    // Reject rather than silently accepting requests to turn on telemetry.
    if(Object.hasOwn(options,'monitoring')&&options.monitoring!==false)
      throw fail('E_MONITORING_DISABLED','FingerprintJS usage monitoring is disabled');
    // Prevent dumping entropy components into the page console by default.
    if(Object.hasOwn(options,'debug')&&options.debug!==false)
      throw fail('E_CONFIG_UNSUPPORTED','FingerprintJS debug logging is unavailable');
    const delay=options.delayFallback;
    if(delay!==undefined&&(!Number.isSafeInteger(delay)||delay<0||delay>30000))
      throw fail('E_CONFIG_UNSUPPORTED','Invalid FingerprintJS delayFallback');
    // New object built from reviewed keys; caller cannot inject monitoring.
    // This is the first point at which upstream initialization may execute.
    return source.load({monitoring:false,debug:false,
      ...(delay===undefined?{}:{delayFallback:delay})});
  }
  const api=Object.freeze({
    load,
    hashComponents:source.hashComponents,
    componentsToDebugString:source.componentsToDebugString
  });
  Object.defineProperty(scope,'FingerprintJS',
    {value:api,writable:false,configurable:false,enumerable:false});
}
