import {httpUrl, permissionPattern} from '../../environment.js';
import {FoundationError, invariant} from '../../platform/protocol.js';
import {JQUERY_371, sha256Utf8} from './page-program-package.js';
import {loadPackagedJquery} from './packaged-dependencies.js';
import {createDependencyManager} from './dependency-manager.js';
import {compileLockedPageSource, pageConsumerSource, PAGE_PREVIEW_RECEIPT_FORMAT, PAGE_ENTRY_FORMATS, PAGE_SOURCE_LIMIT} from './execution-source.js';
import {createPreviewWorlds} from './preview-worlds.js';
import {parseUserScriptDependencies, assertUserScriptExecutable} from './dependency-metadata.js';

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
  if (request && !Object.hasOwn(request, 'withJquery')) {
    const allowed = ['sourceUtf8','entryFormat','lockId','target','importSourceUrl','managedUI'];
    invariant(typeof request === 'object' && !Array.isArray(request) &&
      Object.keys(request).every(key => allowed.includes(key)) &&
      ['sourceUtf8','entryFormat','target'].every(key => Object.hasOwn(request,key)), 'E_SCHEMA', 'Unexpected page preview fields');
    invariant(typeof request.sourceUtf8 === 'string' && request.sourceUtf8.trim().length > 0 &&
      new TextEncoder().encode(request.sourceUtf8).byteLength <= PAGE_SOURCE_LIMIT &&
      PAGE_ENTRY_FORMATS.includes(request.entryFormat) &&
      (request.lockId == null || typeof request.lockId === 'string'), 'E_SOURCE', 'Invalid page script entry or source');
    return Object.freeze({sourceUtf8:request.sourceUtf8,entryFormat:request.entryFormat,
      lockId:request.lockId ?? null, ...(request.importSourceUrl ? {importSourceUrl:request.importSourceUrl} : {}),
      ...(request.managedUI?{managedUI:Object.freeze({...request.managedUI})}:{}),
      target:freezeTarget(request.target),legacy:false});
  }
  fields(request, ['sourceUtf8', 'withJquery', 'target']);
  invariant(typeof request.withJquery === 'boolean' && typeof request.sourceUtf8 === 'string' &&
    request.sourceUtf8.trim().length > 0 &&
    new TextEncoder().encode(request.sourceUtf8).byteLength <= MAX_SOURCE_BYTES &&
    /\basync\s+function\s+main\s*\(/.test(request.sourceUtf8),
    'E_SOURCE', 'Preview requires a bounded async function main()');
  // Transitional checkbox requests must not bypass metadata admission or
  // silently ignore @require. New declarations always use the reviewed lock.
  const metadata = parseUserScriptDependencies(request.sourceUtf8);
  assertUserScriptExecutable(metadata,{entryFormat:'async-main',dependenciesLocked:metadata.requires.length === 0});
  return Object.freeze({sourceUtf8:request.sourceUtf8, withJquery:request.withJquery,
    target:freezeTarget(request.target),legacy:true});
}
export async function compilePageScriptPreview({sourceUtf8, withJquery, jqueryCode,receiptNonce} = {}) {
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
  js.push({code:pageConsumerSource(guard+sourceUtf8,'async-main',receiptNonce)});
  return Object.freeze({sourceHash:hash, world:'USER_SCRIPT',
    worldId:'opendesk-preview-' + hash.slice(0,48) + (withJquery ? '-jq' : '-plain'),
    js:Object.freeze(js),receiptNonce});
}
export function createPageScriptPreview({api, storage, assertHost, dependencies, admission, managedFactory=globalThis.__opendeskNativeManagedUI, fetchImpl = globalThis.fetch}) {
  invariant(api && storage && typeof assertHost === 'function'&&typeof admission?.reserve==='function'&&typeof admission.release==='function', 'E_SCHEMA', 'Trusted preview dependencies missing');
  const dependencyManager = dependencies || createDependencyManager({api,storage,assertHost,fetchImpl});
  const worlds = createPreviewWorlds({api});
  const managed=managedFactory?.({worlds,assertHost,verifyTarget});
  let active = false;
  async function nativeAPI(){
    try{
      const native=api.userScripts;
      if(typeof native?.getScripts!=='function'||typeof native.execute!=='function')throw new Error();
      await native.getScripts();return native;
    }catch{throw new FoundationError('E_USER_SCRIPTS_UNAVAILABLE','请在 chrome://extensions 中打开此扩展的「允许用户脚本」开关');}
  }
  async function verifyTarget(t,nonce) {
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
    invariant(!slot?.currentRunId&&(!slot?.preview||slot.preview.nonce===nonce), 'E_OWNER', 'A Controller task or page preview owns the run slot');
  }
  async function preview(request, sender) {
    invariant(!active, 'E_OWNER', '已有页面脚本试运行正在等待浏览器回执');
    active = true;
    try {return await evaluate(request,sender);} finally {active = false;}
  }
  async function evaluate(request, sender) {
    const owner=await assertHost(sender); // Existing authenticated packaged tool document.
    const frozen = frozenSource(request);
    await verifyTarget(frozen.target);
    let jqueryCode, locked, script;
    const receiptNonce=crypto.randomUUID();
    if (frozen.legacy && frozen.withJquery) {
      const packed = await loadPackagedJquery({runtime:api.runtime,fetchImpl});
      jqueryCode = packed.code;
    }
    if (frozen.legacy) script = await compilePageScriptPreview({...frozen,jqueryCode,receiptNonce});
    else {
      locked = await dependencyManager.loadForExecution({sourceUtf8:frozen.sourceUtf8,
        entryFormat:frozen.entryFormat,lockId:frozen.lockId,
        ...(frozen.importSourceUrl ? {importSourceUrl:frozen.importSourceUrl} : {})},sender);
      script = await compileLockedPageSource({...frozen,entries:locked.entries,receiptNonce});
    }
    const native=await nativeAPI();
    invariant(!frozen.managedUI||managed,'E_UI_LIFECYCLE','受管预览未加载');
    const context=frozen.managedUI?await managed.inspect(frozen,owner):null;
    // Both routes prove isolation, including the transitional packaged-library
    // checkbox. Legacy source-hash worlds can also exhaust Chromium's budget.
    const worldId = await worlds.allocate(native,frozen.target);
    await assertHost(sender);
    const tabId = frozen.target.tabId, documentId = frozen.target.documentId;
    await admission.reserve({nonce:receiptNonce,tabId,documentId,sourceHash:script.sourceHash},sender);
    let dispatched=false,confirmed=false,previousCleanup;
    try {
    await verifyTarget(frozen.target,receiptNonce);
    if(context?.previous){
      previousCleanup=await managed.retire(native,context.previous,receiptNonce,{sender,dispatch:()=>{dispatched=true;confirmed=false;},confirm:()=>{confirmed=true;}});
    }
    const managedRecord=context?await managed.prepare(native,context,worldId,script.sourceHash,receiptNonce,sender):null;
    dispatched=true;confirmed=false;
    const results = await native.execute({target:{tabId,documentIds:[documentId]},
      world:script.world,worldId,js:script.js});
    invariant(Array.isArray(results) && results.length === 1 &&
      results[0]?.frameId === 0 && results[0]?.documentId === documentId,
      'E_RESULT_FORMAT', 'Native user script returned no exact document receipt');
    const receipt = results[0];
    if (receipt.error !== undefined) throw new FoundationError('E_PAGE_SCRIPT_EXECUTION',String(receipt.error));
    const completion=receipt.result;
    invariant(completion && completion.format===PAGE_PREVIEW_RECEIPT_FORMAT && completion.nonce===receiptNonce &&
      typeof completion.ok==='boolean','E_PAGE_SCRIPT_EXECUTION',
      '脚本未返回完成回执，可能存在语法错误、依赖异常或无法传回的结果；请查看网页控制台');
    if(managedRecord)await managed.mark(managedRecord,'evaluated');
    confirmed=true;
    invariant(completion.ok,'E_PAGE_SCRIPT_EXECUTION',completion.error || '页面脚本执行失败');
    // A real receipt proves the effect in the original document. Navigation
    // while awaiting it must not be reported as current-document success or replayed.
    await verifyTarget(frozen.target);
    const value=completion.value;
    let resultText;
    try {resultText = value === undefined ? 'undefined' : JSON.stringify(value);}
    catch {resultText = '（返回值不可 JSON 序列化）';}
    if(typeof resultText !== 'string') resultText = String(value);
    if(frozen.entryFormat==='classic-userscript') resultText='经典脚本的顶层同步代码已执行；异步 IIFE、监听器和定时器不等待，也不会因预览返回而停止。';
    return {state:'preview-evaluated',durable:false,registered:false,tabId,documentId,
      sourceHash:script.sourceHash,world:script.world,worldId,
      ...(managedRecord?{managedUI:true,managedPreviewId:managedRecord.previewId,...(previousCleanup?{previousCleanup:{previewId:context.previous.previewId,...previousCleanup}}:{})}:{}),
      ...(frozen.legacy ? {withJquery:frozen.withJquery,
        dependency:frozen.withJquery ? {id:JQUERY_371.id,version:JQUERY_371.version} : null} :
        {entryFormat:frozen.entryFormat,lockId:locked.lockId,manifestDigest:locked.manifestDigest,
          dependencies:locked.entries.map(({order,url,sha256,sourceKind})=>({order,url,sha256,sourceKind})),
          warnings:script.warnings}),
      resultText:resultText.slice(0,2048)};
    }catch(error){
      if(dispatched&&!confirmed)throw new FoundationError('E_EFFECT_UNKNOWN',error.message+'；原页面执行效果未知，不能自动重试');
      throw error;
    }finally{if(!dispatched||confirmed)await admission.release({nonce:receiptNonce});}
  }
  async function retire(request,sender){
    invariant(!active&&managed,'E_OWNER','受管清理不可用或忙碌');active=true;
    try{return await managed.retirePreview(request,sender,{assertHost,verifyTarget,nativeAPI,admission});}
    finally{active=false;}
  }
  return Object.freeze({preview,retire,async cleanupWorlds(details){
    if(details.removed)await admission.release({removedTabId:details.tabId});
    return worlds.cleanup(details);
  }});
}
