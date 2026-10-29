// Fixed first-party account RPC. Only extension-owned Side Panel and MV3 worker
// import this file; installed sandbox programs do not gain Host authority.
export const COOKIE_ACCOUNT_PROTOCOL='opendesk.cookie-accounts.v1';
export const COOKIE_ACCOUNT_STORE_KEY='opendesk.cookie-editor.accounts.v1';
export const COOKIE_ACCOUNT_VAULT_KEY='opendesk.cookie-editor.vault.v1';
export const COOKIE_ACCOUNT_SESSION_KEY='opendesk.cookie-editor.vault-session.v1';
export const COOKIE_ACCOUNT_SEEN_KEY='opendesk.cookie-editor.auto-seen.v1';
export const COOKIE_ACCOUNT_OPERATIONS=Object.freeze([
  'status','create','rename','update','attach','delete','switch',
  'setAutoEnabled','setAutoRefresh','allowAlias'
]);
export const COOKIE_ACCOUNT_EFFECTS=Object.freeze(
  COOKIE_ACCOUNT_OPERATIONS.filter(name=>name!=='status')
);

// Pure metadata validation; the trusted service calls this before Vault writes.
// Old RPC clients may omit description. No extra account authority is granted.
export function normalizeAccountDescription(value,prior=''){
  if(value===undefined)return prior;
  if(typeof value!=='string'||value.length>120||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))
    throw Object.assign(new Error('E_ACCOUNT_DESCRIPTION'),{code:'E_ACCOUNT_DESCRIPTION'});
  return value.trim().replace(/\s+/g,' ');
}
