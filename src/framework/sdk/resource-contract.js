// Only fixed packaged resources are readable. Old aliases refer to the composed
// MAIN bundle; they do not restore remote text execution or seven installations.
export const SDK_RESOURCE_PATHS = Object.freeze(['framework/sdk-main.js', 'agents/page-relay.js']);
export const SDK_RESOURCE_ALIASES = Object.freeze(Object.fromEntries([
  'assets/js/core/brige.js', 'assets/js/core/common.js', 'assets/js/core/axiosx.js',
  'assets/js/core/appStorage.js', 'assets/js/core/appLocal.js', 'assets/js/core/utils.js',
  'assets/js/Env.js'
].map(path => [path, 'framework/sdk-main.js'])));
export const SDK_RESOURCE_MANIFEST = 'framework/sdk-resources.json';
