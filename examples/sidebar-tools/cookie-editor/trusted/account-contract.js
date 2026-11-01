// Fixed first-party account RPC. Only extension-owned Side Panel and MV3 worker
// import this file; installed sandbox programs do not gain Host authority.
export const COOKIE_ACCOUNT_PROTOCOL='opendesk.cookie-accounts.v1';
export const COOKIE_ACCOUNT_STORE_KEY='opendesk.cookie-editor.accounts.v1';
export const COOKIE_ACCOUNT_VAULT_KEY='opendesk.cookie-editor.vault.v1';
export const COOKIE_ACCOUNT_SESSION_KEY='opendesk.cookie-editor.vault-session.v1';
export const COOKIE_ACCOUNT_SEEN_KEY='opendesk.cookie-editor.auto-seen.v1';
export const COOKIE_ACCOUNT_SHARE_FIELDS=Object.freeze({
  shareCreate:['alias','accountVersion','revision','relayOrigin','expiresInSeconds','maxClaims','mode'],
  shareStatus:['ref'],shareRevoke:['ref'],shareInspect:['inviteUrl'],
  shareClaim:['inviteUrl','revision'],shareList:['alias'],
  sharePair:['inviteUrl'],sharePairs:['ref'],
  shareDeliver:['ref','requestId','receiverFingerprint','revision']
});
export const COOKIE_ACCOUNT_SHARE_OPTIONAL_FIELDS=Object.freeze({shareClaim:['senderFingerprint']});
// Saving configuration grants no Native or Cookie-transfer authority. Native
// actions are separately admitted by the fixed consumer and original Host.
export const COOKIE_SERVICE_FIELDS=Object.freeze({
  serviceStatus:[],
  serviceSave:['revision','label','mode','serviceOrigin'],
  serviceRename:['revision','connectionId','label'],
  serviceDisconnect:['revision','connectionId'],
  serviceAssociate:['revision','connectionId','alias','accountVersion','remoteAccountId','organization','providerKey'],
  serviceRemoveAssociation:['revision','associationId'],
  serviceConnect:['revision','sessionRevision','connectionId','serviceId','providerEpoch'],
  serviceResources:['connectionId'],
  serviceReadPolicy:['connectionId'],
  serviceCommitAssociation:['revision','sessionRevision','associationId'],
  serviceUnbindAssociation:['revision','sessionRevision','associationId'],
  serviceRemoteDisconnect:['revision','sessionRevision','connectionId'],
  serviceAcceptPolicy:['revision','sessionRevision','connectionId','desiredRevision','desiredHash','scope'],
  serviceOpenManagement:['revision','sessionRevision','connectionId','associationId'],
  serviceReconcile:['connectionId'],
  serviceArchiveOpenUnknown:['revision','sessionRevision','connectionId','operationId']
});
export const COOKIE_SERVICE_NATIVE_OPERATIONS=Object.freeze([
  'serviceConnect','serviceResources','serviceReadPolicy','serviceCommitAssociation',
  'serviceUnbindAssociation','serviceRemoteDisconnect','serviceAcceptPolicy',
  'serviceOpenManagement','serviceReconcile','serviceArchiveOpenUnknown'
]);
export const COOKIE_SERVICE_READS=Object.freeze([
  'serviceStatus','serviceResources','serviceReadPolicy','serviceReconcile'
]);
export const COOKIE_ACCOUNT_OPERATIONS=Object.freeze([
  'status','create','rename','update','attach','delete','switch',
  'setAutoEnabled','setAutoRefresh','allowAlias',...Object.keys(COOKIE_ACCOUNT_SHARE_FIELDS),
  ...Object.keys(COOKIE_SERVICE_FIELDS)
]);
export const COOKIE_ACCOUNT_EFFECTS=Object.freeze(
  COOKIE_ACCOUNT_OPERATIONS.filter(name=>name!=='status'&&!COOKIE_SERVICE_READS.includes(name))
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
