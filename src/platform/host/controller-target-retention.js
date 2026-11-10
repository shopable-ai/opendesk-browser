// A reviewed, hash-covered installed Task may leave its owned browser tab to
// the user after its Controller worker has been conclusively retired.
// This is a resource disposition policy, NOT a task grant or execution retry.
// Ordinary owned targets remain close-on-retirement.
export const RETAIN_ON_SUCCESS = 'retain-on-success';

export function controllerMayRetainOwnedTarget(run) {
  return run?.targetDisposition === RETAIN_ON_SUCCESS &&
    run.sourceKind === 'saved' &&
    run.selection?.mode === 'owned' &&
    run.target?.mode === 'owned' &&
    run.state === 'completed' &&
    run.workerRetired === true &&
    typeof run.retirementId === 'string' && run.retirementId.length > 0 &&
    run.browserSessionIncarnation === run.target.browserSessionIncarnation &&
    Number.isSafeInteger(run.target.tabId) && run.target.tabId >= 0 &&
    run.target.frameId === 0 &&
    typeof run.target.documentId === 'string' && run.target.documentId.length > 0 &&
    typeof run.target.allowedOrigin === 'string' && run.target.allowedOrigin.length > 0;
}
