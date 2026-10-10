// Single source of truth for shipped library versions, worlds, source bytes and output paths.
// Npm output hashes are recorded per build in the sealed package manifest.
export const BUILTIN_CATALOG=Object.freeze({
  format:'opendesk.builtin-catalog.v2',
  abi:'opendesk-builtins.v2-lodash-es-4.18.1-dayjs-1.11.23-my-utils-1.0.0',
  bootstrap:'libs/runtime/bootstrap.js',
  bootstrapSha256:'d8b6ff3a7a6a58a3ede0f630cd906f0af134307eeaa8a7db1f096ed24687868d',
  pageCore:'libs/runtime/page-core.js',
  controllerCore:'scripting/sandbox/worker-runtime.js',
  resourceManifest:'libs/manifest.json',
  libraries:Object.freeze({
    lodash:Object.freeze({id:'lodash',origin:'npm',npm:'lodash-es',version:'4.18.1',license:'MIT',
      output:'libs/packages/lodash.js',licensePath:'licenses/lodash-es-MIT.txt',
      worlds:Object.freeze(['CONTROLLER','USER_SCRIPT']),default:true,
      methods:Object.freeze(['get','has','words','trim','uniq','chunk','escape','truncate'])}),
    dayjs:Object.freeze({id:'dayjs',origin:'npm',npm:'dayjs',version:'1.11.23',license:'MIT',
      output:'libs/packages/dayjs.js',licensePath:'licenses/dayjs-MIT.txt',
      worlds:Object.freeze(['CONTROLLER','USER_SCRIPT']),default:true,
      methods:Object.freeze(['isDayjs'])}),
    myUtils:Object.freeze({id:'myUtils',origin:'vendor',version:'1.0.0',license:'MIT',
      source:'src/libs/vendor/my-utils/1.0.0/index.js',
      output:'libs/vendor/my-utils/1.0.0/index.js',
      sha256:'948e074af991e89df08091e28f8c7f42981dc213ae089da013772e755e54c461',bytes:291,
      licenseSource:'src/libs/vendor/my-utils/1.0.0/LICENSE.txt',
      licensePath:'licenses/my-utils-MIT.txt',licenseSha256:'8bda717ea4cf7fa207cb97d1a80a1d12aaedbb95eb4bafe56956ef7f9dc2579c',
      worlds:Object.freeze(['CONTROLLER','USER_SCRIPT']),default:true,
      methods:Object.freeze(['upper'])}),
    jquery:Object.freeze({id:'jquery',origin:'vendor',version:'3.7.1',license:'MIT',
      source:'src/libs/vendor/jquery/3.7.1/jquery.min.js',
      output:'libs/vendor/jquery/3.7.1/jquery.min.js',
      sha256:'fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a',bytes:87533,
      licenseSource:'src/libs/vendor/jquery/3.7.1/LICENSE.txt',
      licensePath:'licenses/jquery-MIT.txt',
      licenseSha256:'d4db9ebe6f29f5168eac45ad713f055623ac5d0dcd5ba92da23d650ae012020d',
      worlds:Object.freeze(['USER_SCRIPT']),default:false,
      methods:Object.freeze(['jQuery','$'])})
  })
});
export const BUILTIN_ABI=BUILTIN_CATALOG.abi;
export const BUILTIN_RESOURCE_PATHS=Object.freeze([
  BUILTIN_CATALOG.bootstrap,
  ...Object.values(BUILTIN_CATALOG.libraries).map(row=>row.output),
  BUILTIN_CATALOG.pageCore,BUILTIN_CATALOG.controllerCore,
  ...Object.values(BUILTIN_CATALOG.libraries).map(row=>row.licensePath)
]);
