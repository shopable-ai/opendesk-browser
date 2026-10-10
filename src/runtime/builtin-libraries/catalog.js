// One published, versioned contract for the two isolated user-code realms.
// The extension author, not the end user, chooses and locks these dependencies.
export const BUILTIN_CATALOG = Object.freeze({
  format:'opendesk.builtin-catalog.v1',
  abi:'opendesk-builtins.v1-lodash-es-4.18.1-dayjs-1.11.23-core17',
  pageCore:'runtime/builtin-libraries/page-core.js',
  resourceManifest:'runtime/builtin-libraries/manifest.json',
  libraries:Object.freeze({
    lodash:Object.freeze({npm:'lodash-es',version:'4.18.1',license:'MIT',
      licensePath:'licenses/lodash-es-MIT.txt',worlds:Object.freeze(['CONTROLLER','USER_SCRIPT']),
      methods:Object.freeze(['get','has','words','trim','uniq','uniqBy','groupBy','sortBy','orderBy',
        'isEmpty','cloneDeep','values','pick','omit','chunk','escape','truncate'])}),
    dayjs:Object.freeze({npm:'dayjs',version:'1.11.23',license:'MIT',
      licensePath:'licenses/dayjs-MIT.txt',worlds:Object.freeze(['CONTROLLER','USER_SCRIPT']),
      methods:Object.freeze(['format','isDayjs'])})
  })
});
export const BUILTIN_ABI=BUILTIN_CATALOG.abi;
