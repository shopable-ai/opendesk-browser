import {createPackagedPageSession} from './registry.js';
import {PageError, requireValue, frozenCopy, encodeValue, decodeValue} from '../../framework/control/value.js';
import {SDK_FILES} from '../../framework/sdk/registry.js';

export const PAGE_SESSION_MESSAGE = 'OPENDESK_CONTROLLER_PAGE_SESSION_V1';
const methods = new Set(['title', 'content', 'contentOpen', 'contentRead', 'contentClose', 'url', 'snapshot', 'snapshots', 'click', 'type', 'keyboard',
  'waitForTimeout', 'waitForSelector', 'uploadChunk', 'uploadCommit', 'addScriptTag', 'addStyleTag',
  'locatorRead', 'locatorPrepare', 'locatorCommit', 'locatorObserve']);
const installations = new WeakMap();
const ownerKey = run => JSON.stringify([run.runId, run.ownerEpoch]);
function owner(run) {
  requireValue(run?.tag === 'controller-run' && typeof run.runId === 'string' && run.runId &&
    Number.isSafeInteger(run.ownerEpoch) && run.ownerEpoch > 0, 'E_OWNER_CHANGED');
  return ownerKey(run);
}

// Independently bundled, ISOLATED-only entry. No property is installed on the
// user's window, and no DOM/event payload is accepted as an extension sender.
export function installPackagedPageSession({api = globalThis.chrome, document: doc = globalThis.document,
  window: win = doc?.defaultView, packageURLs = api?.runtime?.getURL ? [api.runtime.getURL(SDK_FILES.main)] : []} = {}) {
  requireValue(api?.runtime?.onMessage && doc && win, 'E_CAPABILITY_UNAVAILABLE');
  if (installations.has(doc)) return installations.get(doc);
  const sessions = new Map(), retired = new Set(); let disposed = false;
  function trusted(sender) {
    if (sender?.id !== api.runtime.id || sender.tab) return false;
    if (sender.url === undefined) return true; // A service worker may omit URL.
    try { const url = new URL(sender.url); return url.protocol === 'chrome-extension:' && url.host === api.runtime.id; }
    catch { return false; }
  }
  function cancel(run) {
    const key = owner(run); retired.add(key);
    const session = sessions.get(key);
    session?.controller.abort(new PageError('E_CANCELLED')); session?.registry.dispose(); sessions.delete(key);
  }
  async function execute(input) {
    const envelope = frozenCopy(input), key = owner(envelope.identity);
    requireValue(!disposed && !retired.has(key), 'E_CANCELLED');
    requireValue(Number.isSafeInteger(envelope.target?.frameId) && envelope.target.frameId >= 0 && typeof envelope.target.documentId === 'string' &&
      typeof envelope.requestId === 'string' && envelope.requestId, 'E_TARGET');
    requireValue(envelope.operation?.kind === 'packaged' && methods.has(envelope.operation.method), 'E_OPERATION_UNSUPPORTED');
    const args = decodeValue(envelope.operation.args, {maxBytes: envelope.operation.method === 'uploadChunk' ? 131072 : 65536});
    requireValue(Array.isArray(args), 'E_ARGUMENT_TYPE');
    let session = sessions.get(key);
    if (!session) {
      const controller = new AbortController();
      session = {controller, documentId: envelope.target.documentId, frameId: envelope.target.frameId, revision: JSON.stringify(envelope.revision), requests: new Map(),
        registry: createPackagedPageSession({document: doc, window: win, signal: controller.signal, packageURLs})};
      sessions.set(key, session);
    }
    requireValue(session.documentId === envelope.target.documentId && session.frameId === envelope.target.frameId, 'E_DOCUMENT_REPLACED');
    requireValue(session.revision === JSON.stringify(envelope.revision), 'E_OWNER_CHANGED');
    const fingerprint = JSON.stringify(envelope), previous = session.requests.get(envelope.requestId);
    if (previous) { requireValue(previous.fingerprint === fingerprint, 'E_OPERATION_REPLAY'); return previous.result; }
    const result = Promise.resolve().then(async () => {
      requireValue(!disposed && !retired.has(key), 'E_CANCELLED');
      const value = await session.registry.execute(envelope.operation.method, args,
        {documentId:envelope.target.documentId, targetVersion:envelope.target.targetVersion});
      requireValue(!disposed && !retired.has(key), 'E_CANCELLED');
      return {requestId: envelope.requestId, runId: envelope.identity.runId, ownerEpoch: envelope.identity.ownerEpoch, value: encodeValue(value)};
    });
    session.requests.set(envelope.requestId, {fingerprint, result});
    // Completed read-only Locator requests can be replayed by re-reading the
    // document. Retain all commit and legacy effect IDs for exactly-once.
    if (['locatorRead','locatorPrepare','locatorObserve','content','contentOpen','contentRead','contentClose'].includes(envelope.operation.method)) {
      const release = () => {
        if (session.requests.get(envelope.requestId)?.result === result) session.requests.delete(envelope.requestId);
      };
      result.then(release, release);
    }
    return result;
  }
  function listener(message, sender, respond) {
    if (disposed || message?.type !== PAGE_SESSION_MESSAGE || !trusted(sender)) return false;
    if (message.action === 'ping') { respond({type: PAGE_SESSION_MESSAGE, ready: true}); return false; }
    if (message.action === 'cancel') {
      try { cancel(message.run); respond({type: PAGE_SESSION_MESSAGE, cancelled: true}); }
      catch (error) { respond({error: {code: error.code || 'E_ARGUMENT_TYPE', message: error.message}}); }
      return false;
    }
    if (message.action !== 'execute') return false;
    let settled = false;
    const finish = reply => { if (!settled) { settled = true; respond(reply); } };
    execute(message.envelope).then(finish, error => finish({requestId: message.envelope?.requestId,
      runId: message.envelope?.identity?.runId, ownerEpoch: message.envelope?.identity?.ownerEpoch,
      error: {code: error.code || 'E_PAGE_EXECUTION', message: String(error.message)}}));
    return true;
  }
  function dispose() {
    if (disposed) return; disposed = true;
    api.runtime.onMessage.removeListener(listener); win.removeEventListener('pagehide', dispose);
    for (const session of sessions.values()) { session.controller.abort(new PageError('E_DOCUMENT_REPLACED')); session.registry.dispose(); }
    sessions.clear(); retired.clear(); installations.delete(doc);
  }
  const installation = Object.freeze({dispose, snapshot: () => ({disposed, sessions: sessions.size,
    waits: [...sessions.values()].reduce((n, session) => n + session.registry.snapshot().waits, 0),
    uploads: [...sessions.values()].reduce((n, session) => n + session.registry.snapshot().uploads, 0)})});
  api.runtime.onMessage.addListener(listener); win.addEventListener('pagehide', dispose, {once: true});
  installations.set(doc, installation); return installation;
}

export function initPageSession() {
if (typeof chrome !== 'undefined' && typeof document !== 'undefined' &&
  ['http:', 'https:'].includes(globalThis.location?.protocol)) {
  installPackagedPageSession({api: chrome, document, window});
}

}
