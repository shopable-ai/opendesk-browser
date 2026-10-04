import {fail} from './registry.js';
export function createSleep({setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  return function sleep(milliseconds, {signal} = {}) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 2147483647) return Promise.reject(fail('E_SCHEMA', 'Invalid sleep duration'));
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(fail('E_CANCELLED'));
      const cleanup = () => { clearTimer(timer); signal?.removeEventListener('abort', cancel); };
      const cancel = () => { cleanup(); reject(fail('E_CANCELLED')); };
      const timer = setTimer(() => { cleanup(); resolve(); }, milliseconds);
      signal?.addEventListener('abort', cancel, {once: true});
    });
  };
}
export const sleep = createSleep();
export async function getFingerprint() { throw fail('E_RESOURCE_UNAVAILABLE', 'Fingerprint resource is not in the approved resource allowlist', {stage: 'lookup'}); }
