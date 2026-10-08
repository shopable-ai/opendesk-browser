import {httpUrl, permissionPattern} from '../../environment.js';
import {FoundationError, invariant} from '../../platform/protocol.js';
import {JQUERY_371, sha256Utf8} from './page-program-package.js';
import {loadPackagedJquery} from './packaged-dependencies.js';

// One-shot developer preview only. Not a Task Candidate, durable Controller
// Result, installed Page Program or a persistent userScripts.register grant.
const MAX_SOURCE_BYTES = 32 * 1024;
function fields(value, allowed) {
  invariant(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
    Object.keys(value).every(key => allowed.includes(key)) &&
    allowed.every(key => Object.hasOwn(value, key)), 'E_SCHEMA', 'Unexpected page preview fields');
}
function freezeTarget(raw) {
  fields(raw, ['tabId', 'frameId', 'documentId', 'expectedUrl', 'expectedWindowId']);
  const url = httpUrl(raw.expectedUrl);
  invariant(Number.isSafeInteger(raw.tabId) && raw.tabId >= 0 && raw.frameId === 0 &&
    Number.isSafeInteger(raw.expectedWindowId) && raw.expectedWindowId >= 0 &&
    typeof raw.documentId === 'string' && raw.documentId.length > 0 &&
    raw.documentId.length <= 128 && url.href === raw.expectedUrl,
    'E_TARGET', 'Only the exact current HTTP(S) main document is supported');
  return Object.freeze({...raw});
}
function frozenSource(request) {
  fields(request, ['sourceUtf8', 'withJquery', 'target']);
  invariant(typeof request.withJquery === 'boolean' && typeof request.sourceUtf8 === 'string' &&
    request.sourceUtf8.trim().length > 0 &&
    new TextEncoder().encode(request.sourceUtf8).byteLength <= MAX_SOURCE_BYTES &&
    /\basync\s+function\s+main\s*\(/.test(request.sourceUtf8),
    'E_SOURCE', 'Preview requires a bounded async function main()');
  return Object.freeze({sourceUtf8:request.sourceUtf8, withJquery:request.withJquery,
    target:freezeTarget(request.target)});
}
export async function compilePageScriptPreview({sourceUtf8, withJquery, jqueryCode} = {}) {
  invariant(typeof sourceUtf8 === 'string' && typeof withJquery === 'boolean' &&
    sourceUtf8.trim().length > 0 &&
    new TextEncoder().encode(sourceUtf8).byteLength <= MAX_SOURCE_BYTES &&
    /\basync\s+function\s+main\s*\(/.test(sourceUtf8),
    'E_SOURCE', 'Preview requires a bounded async function main()');
  const hash = await sha256Utf8(sourceUtf8);
  const js = [];
  if (withJquery) {
    invariant(typeof jqueryCode === 'string' && await sha256Utf8(jqueryCode) === JQUERY_371.sha256,
      'E_DEPENDENCY_HASH', 'Packaged jQuery source integrity differs');
    js.push({code:jqueryCode});
  } else invariant(jqueryCode === undefined, 'E_DEPENDENCY_LOCK', 'Unexpected dependency bytes');
  // Chrome awaits the promise returned by this final source. MAIN is never used.
  const guard = withJquery
    ? "if (globalThis.jQuery?.fn?.jquery !== '3.7.1') throw new Error('E_DEPENDENCY_NOT_READY');\n" : '';
  js.push({code:"(async () => {\n'use strict';\n" + guard + sourceUtf8 +
    "\nif (typeof main !== 'function') throw new Error('E_MAIN_REQUIRED');\nreturn await main();\n})()"});
  return Object.freeze({sourceHash:hash, world:'USER_SCRIPT',
    worldId:'opendesk-preview-' + hash.slice(0,48) + (withJquery ? '-jq' : '-plain'),
    js:Object.freeze(js)});
}
export function createPageScriptPreview({api, storage, assertHost, fetchImpl = globalThis.fetch}) {
  invariant(api && storage && typeof assertHost === 'function', 'E_SCHEMA', 'Trusted preview dependencies missing');
  async function verifyTarget(t) {
    // Trusted browser observation, then documentIds injection; never fall back
    // to origin-only authorization or whichever tab happens to be active.
    const [tab, active] = await Promise.all([
      api.tabs.get(t.tabId), api.tabs.query({active:true,windowId:t.expectedWindowId})
    ]);
    invariant(tab?.id === t.tabId && tab.windowId === t.expectedWindowId && tab.active === true &&
      !tab.incognito && tab.url === t.expectedUrl && !tab.pendingUrl &&
      !['loading', 'unloaded'].includes(tab.status) &&
      Array.isArray(active) && active.length === 1 && active[0].id === t.tabId,
      'E_DOCUMENT_STALE', 'Current page or window changed');
    const frames = await api.webNavigation.getAllFrames({tabId:t.tabId});
    const root = frames?.find(row => row.frameId === 0);
    invariant(root?.documentId === t.documentId && root.url === t.expectedUrl &&
      !root.errorOccurred && (!root.documentLifecycle || root.documentLifecycle === 'active'),
      'E_DOCUMENT_STALE', 'Current page document changed');
    invariant(await api.permissions.contains({origins:[permissionPattern(t.expectedUrl)]}),
      'E_PERMISSION', 'Site permission was not granted or was revoked');
    const slot = await storage.transaction(['runs'], 'readonly', tx => tx.get('runs','@slot'));
    invariant(!slot?.currentRunId, 'E_OWNER', 'A Controller task currently owns the run slot');
  }
  async function preview(request, sender) {
    await assertHost(sender); // Existing authenticated packaged tool document.
    const frozen = frozenSource(request);
    await verifyTarget(frozen.target);
    let jqueryCode;
    if (frozen.withJquery) {
      const packed = await loadPackagedJquery({runtime:api.runtime,fetchImpl});
      jqueryCode = packed.code;
    }
    const script = await compilePageScriptPreview({...frozen, jqueryCode});
    let native;
    try {
      native = api.userScripts;
      if (typeof native?.getScripts !== 'function' || typeof native.execute !== 'function')
        throw new Error('User Scripts API is disabled');
      await native.getScripts();
    } catch {
      throw new FoundationError('E_USER_SCRIPTS_UNAVAILABLE',
        '请在 chrome://extensions 中打开此扩展的「允许用户脚本」开关');
    }
    await verifyTarget(frozen.target);
    const tabId = frozen.target.tabId, documentId = frozen.target.documentId;
    const results = await native.execute({target:{tabId,documentIds:[documentId]},
      world:script.world,worldId:script.worldId,js:script.js});
    invariant(Array.isArray(results) && results.length === 1 &&
      results[0]?.frameId === 0 && results[0]?.documentId === documentId,
      'E_RESULT_FORMAT', 'Native user script returned no exact document receipt');
    const receipt = results[0];
    if (receipt.error) throw new FoundationError('E_PAGE_SCRIPT_EXECUTION',String(receipt.error));
    let resultText;
    try {resultText = receipt.result === undefined ? 'undefined' : JSON.stringify(receipt.result);}
    catch {resultText = '（返回值不可 JSON 序列化）';}
    if(typeof resultText !== 'string') resultText = String(receipt.result);
    return {state:'preview-evaluated',durable:false,registered:false,tabId,documentId,
      sourceHash:script.sourceHash,world:script.world,withJquery:frozen.withJquery,
      dependency:frozen.withJquery ? {id:JQUERY_371.id,version:JQUERY_371.version} : null,
      resultText:resultText.slice(0,2048)};
  }
  return Object.freeze({preview});
}
