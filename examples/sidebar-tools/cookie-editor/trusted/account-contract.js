// Fixed first-party account RPC. Only extension-owned Side Panel and MV3 worker
// import this file; installed sandbox programs do not gain Host authority.
export const COOKIE_ACCOUNT_PROTOCOL='opendesk.cookie-accounts.v1';
export const COOKIE_ACCOUNT_OPERATIONS=Object.freeze([
  'status','unlock','lock','create','rename','update','delete','switch',
  'setAutoEnabled','setAutoRefresh','allowAlias'
]);
export const COOKIE_ACCOUNT_EFFECTS=Object.freeze(
  COOKIE_ACCOUNT_OPERATIONS.filter(name=>name!=='status')
);
