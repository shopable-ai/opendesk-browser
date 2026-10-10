// Minimal immutable runtime contract. This is the only source for published
// ids, versions, paths, worlds and pinned raw-code SHA values. Author metadata
// in catalog.js extends these rows, but is NOT imported into privileged SW.
export const BUILTIN_ABI='opendesk-builtins.v2-lodash-es-4.18.1-dayjs-1.11.23-my-utils-1.0.0';
export const BUILTIN_RUNTIME_CATALOG=Object.freeze({
  abi:BUILTIN_ABI,
  bootstrap:'libs/runtime/bootstrap.js',
  bootstrapSha256:'d8b6ff3a7a6a58a3ede0f630cd906f0af134307eeaa8a7db1f096ed24687868d',
  pageCore:'libs/runtime/page-core.js',
  controllerCore:'scripting/sandbox/worker-runtime.js',
  resourceManifest:'libs/manifest.json',
  libraries:Object.freeze({
    lodash:Object.freeze({id:'lodash',version:'4.18.1',output:'libs/packages/lodash.js',
      worlds:Object.freeze(['CONTROLLER','USER_SCRIPT']),default:true}),
    dayjs:Object.freeze({id:'dayjs',version:'1.11.23',output:'libs/packages/dayjs.js',
      worlds:Object.freeze(['CONTROLLER','USER_SCRIPT']),default:true}),
    myUtils:Object.freeze({id:'myUtils',version:'1.0.0',
      output:'libs/vendor/my-utils/1.0.0/index.js',
      sha256:'948e074af991e89df08091e28f8c7f42981dc213ae089da013772e755e54c461',bytes:291,
      worlds:Object.freeze(['CONTROLLER','USER_SCRIPT']),default:true}),
    jquery:Object.freeze({id:'jquery',version:'3.7.1',license:'MIT',
      output:'libs/vendor/jquery/3.7.1/jquery.min.js',
      sha256:'fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a',bytes:87533,
      worlds:Object.freeze(['USER_SCRIPT']),default:false})
  })
});
export const BUILTIN_RESOURCE_PATHS=Object.freeze([
  BUILTIN_RUNTIME_CATALOG.bootstrap,
  ...Object.values(BUILTIN_RUNTIME_CATALOG.libraries).map(row=>row.output),
  BUILTIN_RUNTIME_CATALOG.pageCore,BUILTIN_RUNTIME_CATALOG.controllerCore,
  'licenses/lodash-es-MIT.txt','licenses/dayjs-MIT.txt',
  'licenses/my-utils-MIT.txt','licenses/jquery-MIT.txt'
]);
