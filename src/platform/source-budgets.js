// Source-only budgets. These do not expand RPC values, page frames, params,
// results, capabilities or storage quotas. JSON envelopes are bounded separately
// because escaped source and authoring snapshots can duplicate executable text.
export const CONTROLLER_SOURCE_LIMIT = 2 * 1024 * 1024;
export const CONTROLLER_AUTHORING_LIMIT = 4 * 1024 * 1024;
export const TASK_PACKAGE_LIMIT = 4 * 1024 * 1024;
export const CONTROLLER_DRAFT_LIMIT = 12 * 1024 * 1024;
