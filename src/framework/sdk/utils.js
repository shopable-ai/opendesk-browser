import {fail} from './registry.js';
export function createSleep({setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  const entries = new Set(); let disposed = false;
  const counts = () => Object.freeze({pending: entries.size, timers: [...entries].filter(entry => entry.timer != null).length,
    subscriptions: [...entries].filter(entry => entry.listening).length, ports: 0, workers: 0, blobs: 0});
  const resourceDiagnostics = () => Object.freeze({scope: 'sdk.sleep', counts: counts(), observationMissing: null});
  function sleep(milliseconds, {signal} = {}) {
    if (disposed) return Promise.reject(fail('E_CANCELLED', 'SDK sleep owner disposed'));
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 2147483647) return Promise.reject(fail('E_SCHEMA', 'Invalid sleep duration'));
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(fail('E_CANCELLED'));
      const entry = {timer: null, listening: false};
      const cleanup = () => { clearTimer(entry.timer); entry.timer = null; if (entry.listening) signal.removeEventListener('abort', cancel);
        entry.listening = false; entries.delete(entry); };
      const cancel = () => { cleanup(); reject(fail('E_CANCELLED')); };
      entry.cancel = cancel; entries.add(entry);
      try {
        entry.timer = setTimer(() => { cleanup(); resolve(); }, milliseconds);
        signal?.addEventListener('abort', cancel, {once: true});
        entry.listening = Boolean(signal);
      } catch (error) { cleanup(); reject(error); }
    });
  }
  Object.defineProperty(sleep, 'resourceDiagnostics', {value: resourceDiagnostics});
  Object.defineProperty(sleep, 'dispose', {value: () => { if (disposed) return; disposed = true; for (const entry of entries) entry.cancel(); }});
  Object.defineProperty(sleep, 'diagnostics', {value: () => ({scope: 'sdk.sleep', pending: entries.size, disposed, counts: counts(), observationMissing: null, resources: [resourceDiagnostics()]})});
  return sleep;
}
export const sleep = createSleep();
export async function getFingerprint() { throw fail('E_RESOURCE_UNAVAILABLE', 'Fingerprint resource is not in the approved resource allowlist', {stage: 'lookup'}); }
