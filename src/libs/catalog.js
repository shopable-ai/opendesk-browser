// Author-only additions to the immutable runtime catalog.
// Runtime IDs/versions/worlds/output filenames live exactly once in runtime-contract.js.
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG,BUILTIN_RESOURCE_PATHS} from './runtime-contract.js';
export {BUILTIN_ABI,BUILTIN_RESOURCE_PATHS,BUILTIN_RUNTIME_CATALOG} from './runtime-contract.js';

const author=Object.freeze({
  lodash:Object.freeze({origin:'npm',npm:'lodash-es',license:'MIT',
    licensePath:'licenses/lodash-es-MIT.txt',
    methods:Object.freeze(['get','has','words','trim','uniq','chunk','escape','truncate'])}),
  dayjs:Object.freeze({origin:'npm',npm:'dayjs',license:'MIT',
    licensePath:'licenses/dayjs-MIT.txt',methods:Object.freeze(['isDayjs','duration','isDuration','utc','tz'])}),
  myUtils:Object.freeze({origin:'vendor',license:'MIT',
    source:'src/libs/vendor/my-utils/1.0.0/index.js',
    licenseSource:'src/libs/vendor/my-utils/1.0.0/LICENSE.txt',
    licensePath:'licenses/my-utils-MIT.txt',
    licenseSha256:'8bda717ea4cf7fa207cb97d1a80a1d12aaedbb95eb4bafe56956ef7f9dc2579c',
    methods:Object.freeze(['upper'])}),
  jsCookie:Object.freeze({origin:'npm',npm:'js-cookie',license:'MIT',
    licensePath:'licenses/js-cookie-MIT.txt',
    methods:Object.freeze(['get','set','remove','withAttributes','withConverter'])}),
  cryptoJs:Object.freeze({origin:'npm',npm:'crypto-js',license:'MIT',
    licensePath:'licenses/crypto-js-MIT.txt',
    methods:Object.freeze(['SHA256','HmacSHA256','AES','enc'])}),
  fileSaver:Object.freeze({origin:'npm',npm:'file-saver',license:'MIT',
    licensePath:'licenses/file-saver-MIT.txt',methods:Object.freeze(['saveAs'])}),
  queryString:Object.freeze({origin:'npm',npm:'query-string',license:'MIT',
    licensePath:'licenses/query-string-MIT.txt',
    methods:Object.freeze(['extract','parse','stringify','parseUrl','stringifyUrl','pick','exclude'])}),
  axios:Object.freeze({origin:'npm',npm:'axios',license:'MIT',
    licensePath:'licenses/axios-MIT.txt',
    methods:Object.freeze(['get','post','put','delete','request','create','getUri'])}),
  store:Object.freeze({origin:'npm',npm:'store',license:'MIT',
    licensePath:'licenses/store-MIT.txt',methods:Object.freeze(['get','set','remove','clearAll','each'])}),
  cheerio:Object.freeze({origin:'npm',npm:'cheerio',license:'MIT',
    licensePath:'licenses/cheerio-MIT.txt',methods:Object.freeze(['load'])}),
  jquery:Object.freeze({origin:'vendor',
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
