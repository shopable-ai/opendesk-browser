// Reviewed static feature registry. No runtime URL imports or inherited Chrome grants.
export const FEATURE_CATALOG = Object.freeze({
  'dom-inspector': Object.freeze({
    dependencies: [],
    permissions: ['activeTab', 'scripting'],
    modules: ['packages/features/page-qa/capture.js', 'packages/features/page-qa/highlight.js', 'packages/features/page-qa/identity.js'],
    entrypoints: ['popup']
  }),
  'a11y-check': Object.freeze({
    dependencies: ['dom-inspector'],
    permissions: [],
    modules: ['packages/features/page-qa/a11y.js'],
    entrypoints: ['popup']
  }),
  'local-settings': Object.freeze({
    dependencies: [],
    permissions: ['storage'],
    modules: ['packages/features/page-qa/settings.js'],
    entrypoints: ['popup']
  })
});
