// Admission contract for code-free managed policies consumed by an audited,
// precompiled Chrome worker. This is NOT a new Host or background JS loader.
// An installable package may change data only within the advertised contract;
// it cannot ask Chrome to run privileged JavaScript from a package.
export const MANAGED_SITE_RUNTIME_CONTRACT='opendesk.managed-site-runtime.v1';
export const MANAGED_SITE_BUDGET_CAPABILITY='browser.siteBudget';
export const MANAGED_SITE_BUDGET_V3_PROTOCOL='opendesk.browser.site-budget.v3';
export const MANAGED_SITE_BUDGET_PROTOCOL='opendesk.browser.site-budget.v2';
const unsupported=kind=>Object.assign(new Error(
  '当前 OpenDesk Browser 后台不能执行 '+String(kind).slice(0,80)+
  ' 声明式规则，请更新浏览器后再安装或升级此工具；不会执行安装包的特权 JavaScript'),
  {code:'E_TOOL_RUNTIME_POLICY_UNSUPPORTED'});

export function assertManagedSitePolicySupported(tool,worker){
  const declared=tool?.backgroundPolicy;
  if(declared===undefined)return;
  const runtime=worker?.managedSiteRuntime;
  if(!declared||typeof declared.kind!=='string'||
     runtime?.contract!==MANAGED_SITE_RUNTIME_CONTRACT||
     runtime.privilegedJs!==false||
     !Array.isArray(runtime.policyKinds)||
     !runtime.policyKinds.every(kind=>typeof kind==='string')||
     !runtime.policyKinds.includes(declared.kind))throw unsupported(declared?.kind||'未知');
}
