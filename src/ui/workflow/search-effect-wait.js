function abortableDelay(ms, signal) {
  return new Promise(resolve => {
    let timer;
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    if (signal?.aborted) return resolve();
    signal?.addEventListener('abort', done, {once:true});
    timer = setTimeout(done, ms);
  });
}

// Only discover and read effects of an already dispatched action. No action
// callback is accepted, so an unknown click result can never be replayed here.
export async function waitForWorkflowSearchEffect({captured, currentPageTarget,
  signal, observe, verify, hasPermission, onDiagnostic, clock = Date.now, delay = abortableDelay,
  timeoutMs = 10000, intervalMs = 250}) {
  const start = clock(), deadline = start + timeoutMs;
  const pollMs = Math.max(1, intervalMs);
  const observeGap = Math.max(500, (timeoutMs - Math.min(pollMs, timeoutMs)) / 3);
  const internal = new AbortController();
  let observations = 0, nextObservation = start, cancel, timedOut = false;
  let phase = 'target', reason = 'deadline', lastTarget = null, verified = false;
  const cancelled = new Promise(resolve => {
    cancel = () => { internal.abort(); resolve(null); };
  });
  const timer = setTimeout(() => { timedOut = true; cancel(); }, Math.max(0, timeoutMs));
  const stopped = () => internal.signal.aborted || timedOut || clock() >= deadline;
  const differentTarget = next => next && ['windowId', 'tabId', 'origin'].some(
    key => next[key] != null && next[key] !== captured[key]);
  // Race cancellation even when a supplied reader has not settled yet. The
  // race also handles late rejections without starting any follow-up work.
  const read = callback => Promise.race([Promise.resolve().then(() =>
    stopped() ? null : callback()), cancelled]);
  signal?.addEventListener('abort', cancel, {once:true});
  if (signal?.aborted) cancel();
  try {
    if (!captured || captured.frameId !== 0) { reason = 'invalid-target'; return null; }
    while (!stopped()) {
      phase = 'permission';
      if (!await read(() => hasPermission(captured)) || stopped()) { reason = 'permission'; return null; }
      phase = 'refresh';
      const next = await read(() => currentPageTarget.refresh({preserveRetry:true}));
      lastTarget = next && {status:next.status, reason:next.reason || null,
        message:next.message || null, documentId:next.documentId || null};
      if (stopped() || differentTarget(next)) { reason = 'target-changed'; return null; }
      if (next?.status === 'available' && next.windowId === captured.windowId &&
          next.tabId === captured.tabId && next.origin === captured.origin &&
          next.frameId === 0 && next.documentId && !next.loading &&
          !next.pendingUrl && !['loading', 'unloaded'].includes(next.tabStatus) &&
          observations < 4 && clock() >= nextObservation) {
        const effectTarget = structuredClone(next);
        phase = 'permission';
        if (!await read(() => hasPermission(effectTarget)) || stopped()) { reason = 'permission'; return null; }
        if (differentTarget(currentPageTarget.snapshot)) { reason = 'target-changed'; return null; }
        observations++;
        nextObservation = clock() + observeGap;
        phase = 'observe';
        const after = await read(() => observe(effectTarget, {signal:internal.signal}));
        if (stopped() || differentTarget(currentPageTarget.snapshot)) { reason = 'target-changed'; return null; }
        phase = 'permission';
        if (!await read(() => hasPermission(effectTarget)) || stopped()) { reason = 'permission'; return null; }
        phase = 'verify';
        const effect = await read(() => verify(after, effectTarget));
        if (stopped() || differentTarget(currentPageTarget.snapshot)) { reason = 'target-changed'; return null; }
        if (effect) {
          phase = 'permission';
          if (!await read(() => hasPermission(effectTarget)) || stopped()) { reason = 'permission'; return null; }
          if (differentTarget(currentPageTarget.snapshot)) { reason = 'target-changed'; return null; }
          verified = true; reason = 'verified';
          return {effect, effectTarget:structuredClone(effectTarget)};
        }
      }
      phase = 'wait';
      if (!stopped()) await read(() => delay(Math.min(pollMs, deadline - clock()),
        internal.signal));
    }
  } catch (error) {
    reason = typeof error?.code === 'string' ? error.code.slice(0,80) : 'reader-failed';
    // Missing/failed evidence is never a business result or permission to retry writes.
  } finally {
    clearTimeout(timer);
    internal.abort();
    signal?.removeEventListener('abort', cancel);
    // Diagnostic metadata cannot grant evidence or interfere with cleanup.
    try { onDiagnostic?.({state:verified?'verified':'unconfirmed',
      reason:signal?.aborted?'cancelled':timedOut||clock()>=deadline?'deadline':reason,
      phase, elapsedMs:clock()-start, observations, lastTarget}); } catch {}
  }
  return null;
}
