// Author-only additions to the immutable runtime catalog.
// Runtime IDs/versions/worlds/output filenames live exactly once in runtime-contract.js.
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG,BUILTIN_RESOURCE_PATHS} from './runtime-contract.js';
export {BUILTIN_ABI,BUILTIN_RESOURCE_PATHS,BUILTIN_RUNTIME_CATALOG} from './runtime-contract.js';

const author=Object.freeze({
  lodash:Object.freeze({origin:'npm',npm:'lodash-es',license:'MIT',
    licensePath:'licenses/lodash-es-MIT.txt',
    methods:Object.freeze(['get','has','words','trim','uniq','chunk','escape','truncate'])}),
  dayjs:Object.freeze({origin:'npm',npm:'dayjs',license:'MIT',
    licensePath:'licenses/dayjs-MIT.txt',methods:Object.freeze(['isDayjs'])}),
  myUtils:Object.freeze({origin:'vendor',license:'MIT',
    source:'src/libs/vendor/my-utils/1.0.0/index.js',
    licenseSource:'src/libs/vendor/my-utils/1.0.0/LICENSE.txt',
    licensePath:'licenses/my-utils-MIT.txt',
    licenseSha256:'8bda717ea4cf7fa207cb97d1a80a1d12aaedbb95eb4bafe56956ef7f9dc2579c',
    methods:Object.freeze(['upper'])}),
  jquery:Object.freeze({origin:'vendor',license:'MIT',
    source:'src/libs/vendor/jquery/3.7.1/jquery.min.js',
    licenseSource:'src/libs/vendor/jquery/3.7.1/LICENSE.txt',
    licensePath:'licenses/jquery-MIT.txt',
    licenseSha256:'d4db9ebe6f29f5168eac45ad713f055623ac5d0dcd5ba92da23d650ae012020d',
    methods:Object.freeze(['jQuery','$'])})
});
export const BUILTIN_CATALOG=Object.freeze({
  ...BUILTIN_RUNTIME_CATALOG,
  format:'opendesk.builtin-catalog.v2',
  libraries:Object.freeze(Object.fromEntries(Object.entries(BUILTIN_RUNTIME_CATALOG.libraries)
    .map(([id,row])=>[id,Object.freeze({...row,...author[id]})])))
});
if(!Object.values(BUILTIN_CATALOG.libraries).every(row=>row.license&&row.licensePath))
  throw Error('Missing author library metadata');
