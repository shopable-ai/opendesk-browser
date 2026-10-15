// Operator-owned release configuration, not a user-editable tool setting.
// Do NOT fill these URLs until there is a deployed HTTPS service implementing
// docs/framework/workstreams/ai-smart-access-r1.md and an approved proxy relay.
// An empty configuration fails closed; historical todo6.com card/login endpoints
// are NOT compatible activation servers and must never be reused here.
export const AI_PROVIDER=Object.freeze({
  activateUrl:null,
  verifyUrl:null
});

// Replaced with a literal by WXT. A production build always replaces this
// with false, even when the local test environment variable is present.
// No storage value, installed package or URL can enable this adapter.
export const AI_LOCAL_TEST_ENABLED=typeof __OPENDESK_AI_LOCAL_TEST__!=='undefined'&&
  __OPENDESK_AI_LOCAL_TEST__===true;
export const AI_LOCAL_PACKAGE_HASH=AI_LOCAL_TEST_ENABLED&&
  typeof __OPENDESK_AI_LOCAL_PACKAGE_HASH__!=='undefined'?__OPENDESK_AI_LOCAL_PACKAGE_HASH__:null;
export const AI_RUNTIME_PROVIDER=AI_LOCAL_TEST_ENABLED?Object.freeze({
  activateUrl:'http://127.0.0.1:7898/api/activate',
  verifyUrl:'http://127.0.0.1:7898/api/verify'
}):AI_PROVIDER;
export function isAiLocalTestEndpoint(endpoint){
  return AI_LOCAL_TEST_ENABLED&&endpoint?.scheme==='http'&&
    endpoint.host==='127.0.0.1'&&endpoint.port===7897;
}
