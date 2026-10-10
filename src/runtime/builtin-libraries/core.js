// Bundled from the exact root npm lock at extension build time. No CDN,
// runtime package manager or extra authority / network capability is involved.
import get from 'lodash-es/get.js';
import has from 'lodash-es/has.js';
import words from 'lodash-es/words.js';
import trim from 'lodash-es/trim.js';
import uniq from 'lodash-es/uniq.js';
import uniqBy from 'lodash-es/uniqBy.js';
import groupBy from 'lodash-es/groupBy.js';
import sortBy from 'lodash-es/sortBy.js';
import orderBy from 'lodash-es/orderBy.js';
import chunk from 'lodash-es/chunk.js';
import escape from 'lodash-es/escape.js';
import truncate from 'lodash-es/truncate.js';
import dayjsCore from 'dayjs';
import {BUILTIN_ABI,BUILTIN_CATALOG} from './catalog.js';

const lodash=Object.freeze({get,has,words,trim,uniq,uniqBy,groupBy,sortBy,orderBy,chunk,escape,truncate});
// No .extend or .locale mutator: scripts must not mutate the shared Day.js
// implementation between executions in the same USER_SCRIPT world.
const dayjs=Object.freeze(Object.assign((...args)=>dayjsCore(...args),{isDayjs:dayjsCore.isDayjs}));
const installed=Object.freeze({abi:BUILTIN_ABI,lodash,dayjs,
  versions:Object.freeze({lodash:BUILTIN_CATALOG.libraries.lodash.version,
    dayjs:BUILTIN_CATALOG.libraries.dayjs.version})});

const conflict=(key)=>Object.assign(new Error('Built-in library global collision: '+key),{code:'E_BUILTIN_COLLISION'});
export function installBuiltinLibraries(scope=globalThis) {
  // A world may be re-used for consecutive previews. Same ABI and owned
  // read-only descriptors are idempotent; foreign globals never get hijacked.
  const previous=Object.getOwnPropertyDescriptor(scope,'OpenDeskLibs');
  if(previous) {
    if(previous.value?.abi===BUILTIN_ABI && Object.isFrozen(previous.value) &&
      Object.getOwnPropertyDescriptor(scope,'_')?.value===previous.value.lodash &&
      Object.getOwnPropertyDescriptor(scope,'dayjs')?.value===previous.value.dayjs &&
      [previous,Object.getOwnPropertyDescriptor(scope,'_'),Object.getOwnPropertyDescriptor(scope,'dayjs')]
        .every(row=>row && row.writable===false && row.configurable===false))return previous.value;
    throw conflict('OpenDeskLibs');
  }
  for(const key of ['_','dayjs'])if(Object.hasOwn(scope,key))throw conflict(key);
  for(const [key,value] of [['OpenDeskLibs',installed],['_',lodash],['dayjs',dayjs]])
    Object.defineProperty(scope,key,{value,writable:false,configurable:false,enumerable:false});
  return installed;
}
