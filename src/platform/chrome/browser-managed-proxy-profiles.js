// Source-reviewed browser-global proxy profile registry.
// There is no approved commercial Provider or endpoint as of 2026-10-16.
// A future entry MUST be reviewed in trusted Host source and include:
// {reviewId,reviewedAt,reviewedBy,toolId,packageHash,config:{endpoint,domains}}
// Review endpoint ownership, target-domain authorization and outage policy.
// Never load entries from sandbox, tool storage, remote URLs, validated:true
// or developer loopback preferences.
export const REVIEWED_MANAGED_PROXY_PROFILES=Object.freeze([]);
