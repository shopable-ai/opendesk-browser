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
  signal, observe, verify, hasPermission, clock = Date.now, delay = abortableDelay,
  timeoutMs = 10000, intervalMs = 250}) {
  const start = clock(), deadline = start + timeoutMs;
  const pollMs = Math.max(1, intervalMs);
  const observeGap = Math.max(500, (timeoutMs - Math.min(pollMs, timeoutMs)) / 3);
  const internal = new AbortController();
  let observations = 0, nextObservation = start, cancel, timedOut = false;
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
    if (!captured || captured.frameId !== 0) return null;
    while (!stopped()) {
      if (!await read(() => hasPermission(captured)) || stopped()) return null;
      const next = await read(() => currentPageTarget.refresh({preserveRetry:true}));
      if (stopped() || differentTarget(next)) return null;
      if (next?.status === 'available' && next.windowId === captured.windowId &&
          next.tabId === captured.tabId && next.origin === captured.origin &&
          next.frameId === 0 && next.documentId && !next.loading &&
          !next.pendingUrl && !['loading', 'unloaded'].includes(next.tabStatus) &&
          observations < 4 && clock() >= nextObservation) {
        const effectTarget = structuredClone(next);
        if (!await read(() => hasPermission(effectTarget)) || stopped()) return null;
        if (differentTarget(currentPageTarget.snapshot)) return null;
        observations++;
        nextObservation = clock() + observeGap;
        const after = await read(() => observe(effectTarget, {signal:internal.signal}));
        if (stopped() || differentTarget(currentPageTarget.snapshot)) return null;
        if (!await read(() => hasPermission(effectTarget)) || stopped()) return null;
        const effect = await read(() => verify(after, effectTarget));
        if (stopped() || differentTarget(currentPageTarget.snapshot)) return null;
        if (effect) {
          if (!await read(() => hasPermission(effectTarget)) || stopped() ||
              differentTarget(currentPageTarget.snapshot)) return null;
          return {effect, effectTarget:structuredClone(effectTarget)};
        }
      }
      if (!stopped()) await read(() => delay(Math.min(pollMs, deadline - clock()),
        internal.signal));
    }
  } catch {
    // Missing/failed evidence is never a business result or permission to retry writes.
  } finally {
    clearTimeout(timer);
    internal.abort();
    signal?.removeEventListener('abort', cancel);
  }
  return null;
}
