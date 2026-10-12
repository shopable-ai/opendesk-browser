// @deprecated 2026-10-12: Page QA Inspector is not an active commercial product.
// DEPRECATED / NO_RELEASE / MANUAL_FIXTURE_ONLY.
// Historical Extension Factory R2 fixture only. Do not publish or use as default.
// See products/page-qa-inspector/README.zh-CN.md.
import {PAGE_QA_PRODUCT_ID,PAGE_QA_VERSION} from '../../packages/features/page-qa/identity.js';
import {PRODUCT_SCHEMA} from '../../packages/extension-factory/resolve-product.mjs';

export default Object.freeze({
  schema:PRODUCT_SCHEMA,
  productId:PAGE_QA_PRODUCT_ID,
  displayName:'Page QA Inspector',
  purpose:'用户点击后检查当前网页 DOM 定位与基础可访问性问题',
  description:'按需检查当前标签页的页面结构和基础无障碍标记，并导出本地 JSON 报告。',
  owner:'OpenDesk Browser product engineering',
  userStories:['作为 QA，我检查当前页面的结构和无障碍提示','作为 QA，我定位问题元素并导出报告'],
  version:PAGE_QA_VERSION,
  minimumChromeVersion:'138',
  channels:['development','production'],
  ui:{popup:true,sidePanel:false,options:false},
  features:['dom-inspector','a11y-check','local-settings'],
  hostPatterns:[],
  optionalHostPatterns:[],
  requiredPermissions:['activeTab','scripting','storage'],
  optionalPermissions:[],
  runtimeModules:{controller:false,userscript:false,native:false},
  storageSchemaVersion:1,
  budgets:{maxJsBytes:160000,maxZipBytes:1200000},
  releasePolicy:{manualReviewRequired:true}
});
