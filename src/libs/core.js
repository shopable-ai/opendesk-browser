import {BUILTIN_ABI,BUILTIN_CATALOG} from './catalog.js';

const registerKey=Symbol.for('opendesk.libs.register.v1');
const entriesKey=Symbol.for('opendesk.libs.entries.v1');
const fail=(code,detail)=>Object.assign(new Error(detail||code),{code});
const versions=Object.freeze(Object.fromEntries(Object.entries(BUILTIN_CATALOG.libraries)
  .filter(([,row])=>row.default).map(([id,row])=>[id,row.version])));
const expectedDefault=Object.entries(BUILTIN_CATALOG.libraries).filter(([,row])=>row.default);
function methodsMatch(api,methods){
  return (typeof api==='function'||api!==null&&typeof api==='object')&&Object.isFrozen(api)&&
    Object.keys(api).length===methods.length&&
    methods.every(name=>Object.hasOwn(api,name)&&typeof api[name]==='function');
}
function identical(scope){
  const descriptor=Object.getOwnPropertyDescriptor(scope,'OpenDeskLibs');
  const installed=descriptor?.value;
  const lodash=Object.getOwnPropertyDescriptor(scope,'_');
  const dayjs=Object.getOwnPropertyDescriptor(scope,'dayjs');
  // Do not silently adopt another realm's forged ABI/global facade. This is
  // an idempotence check, not merely a version-string comparison.
  return installed?.abi===BUILTIN_ABI&&Object.isFrozen(installed)&&
    descriptor&&!descriptor.writable&&!descriptor.configurable&&
    lodash&&!lodash.writable&&!lodash.configurable&&lodash.value===installed.lodash&&
    dayjs&&!dayjs.writable&&!dayjs.configurable&&dayjs.value===installed.dayjs&&
    Object.isFrozen(installed.versions)&&
    Object.keys(installed.versions).sort().join(',')===
      expectedDefault.map(([id])=>id).sort().join(',')&&
    expectedDefault.every(([id,row])=>
      installed.versions[id]===row.version&&methodsMatch(installed[id],row.methods));
}
export function installBuiltinLibraries(scope=globalThis) {
  // A reused USER_SCRIPT world may already own the immutable API. Never
  // overwrite a website or another extension's globals.
  if(Object.hasOwn(scope,'OpenDeskLibs')||Object.hasOwn(scope,'_')||Object.hasOwn(scope,'dayjs')) {
    if(identical(scope)){
      // Repeated preview world: close the fresh, unused registration facade.
      if(Object.hasOwn(scope,registerKey))delete scope[registerKey];
      if(Object.hasOwn(scope,entriesKey))delete scope[entriesKey];
      return scope.OpenDeskLibs;
    }
    throw fail('E_BUILTIN_COLLISION','OpenDesk built-in global collision');
  }
  const entries=scope[entriesKey],register=scope[registerKey];
  if(!entries||Object.getPrototypeOf(entries)!==null||typeof register!=='function')
    throw fail('E_BUILTIN_NOT_READY','内置库注册器尚未就绪');
  const expected=Object.entries(BUILTIN_CATALOG.libraries).filter(([,row])=>row.default);
  if(Object.keys(entries).length!==expected.length)
    throw fail('E_BUILTIN_VERSION_UNAVAILABLE','内置库数量与目录不一致');
  for(const [id,row] of expected) {
    const actual=Object.getOwnPropertyDescriptor(entries,id)?.value;
    if(!actual||actual.version!==row.version||!Object.isFrozen(actual.api)||
      Object.keys(actual.api).sort().join(',')!==row.methods.slice().sort().join(',') ||
      row.methods.some(method=>typeof actual.api[method]!=='function'))
      throw fail('E_BUILTIN_VERSION_UNAVAILABLE','内置库未注册或 API 版本不匹配: '+id);
  }
  const lodash=entries.lodash.api,dayjs=entries.dayjs.api,myUtils=entries.myUtils.api;
  const installed=Object.freeze({abi:BUILTIN_ABI,lodash,dayjs,myUtils,versions});
  // Remove the temporary registration interface before arbitrary user code.
  if(!delete scope[registerKey]||!delete scope[entriesKey])
    throw fail('E_BUILTIN_NOT_READY','无法关闭内置库注册接口');
  for(const [key,value] of [['OpenDeskLibs',installed],['_',lodash],['dayjs',dayjs]])
    Object.defineProperty(scope,key,{value,writable:false,configurable:false,enumerable:false});
  return installed;
}
