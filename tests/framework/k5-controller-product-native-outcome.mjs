// Missing native observation proves neither a product failure nor a PASS.
export function durableReadReady(view, runId, lifecycle) {
  const client = lifecycle?.owners?.client;
  return lifecycle?.scope === 'extension-tool-document' && client?.pending === 0 && client?.timers === 0 &&
    view.state === 'results' && view.runId === runId && view.text.startsWith(`任务 ${runId}：`) && view.result.includes(runId);
}

export function nativeFailureOutcome(error) {
  if (error?.code === 'E_NATIVE_PERMISSION_WAIT') return {status:'BLOCKED', attribution:'permission-wait'};
  if (error?.code === 'E_OBSERVATION_TIMEOUT') return {status:'NOT_TESTED', attribution:'observation-timeout'};
  if (error?.code === 'E_CAMPAIGN_OBSERVATION_MISSING') return {status:'NOT_TESTED', attribution:'observation-missing'};
  if (error?.code?.startsWith('E_RUNNER')) return {status:'NOT_TESTED', attribution:'runner'};
  return {status:'FAIL', attribution:'product-or-native-contract'};
}
