// Integration seam for the existing unified-account design. A production
// identity/snapshot service is not available. Never infer an identity from
// Chrome Sync, a display name, URL parameters, or an untrusted tool frame.
// A trusted adapter returns {id, label, isCurrent(), read(), write(revision, value)}.
// The transport must bind read/write and CAS to the credential, not a userId
// supplied by the caller; switching credentials invalidates isCurrent().
export const extensionRecoveryAccounts={async current(){return null;}};
