import {httpUrl, permissionPattern} from '../../environment.js';
import {FoundationError, invariant} from '../../platform/protocol.js';
import {JQUERY_371, sha256Utf8} from './page-program-package.js';
import {loadPackagedJquery} from './packaged-dependencies.js';
import {loadPackagedPageFramework} from '../../libs/page-frameworks/loader.js';
import {loadBuiltinPageSource,loadPackagedOptionalPageLibraries} from '../../libs/loader.js';
import {BUILTIN_ABI} from '../../libs/runtime-contract.js';
import {PAGE_BROWSER_COMPILER} from '../../libs/page-frameworks/contract.js';
import {builtinIdentity,assertBuiltinIdentity} from '../../libs/identity.js';
import {createDependencyManager} from './dependency-manager.js';
import {compileLockedPageSource, builtinReadinessSource, pageWantsJquery, pageSelectedPackagedLibraries, pageOptionalLibraryId, pageConsumerSource, PAGE_PREVIEW_RECEIPT_FORMAT, PAGE_ENTRY_FORMATS, PAGE_WORLD_CSP} from './execution-source.js';
import {inspectPageSource} from './page-bundle.js';
import {createPreviewWorlds} from './preview-worlds.js';
import {parseUserScriptDependencies, assertUserScriptExecutable} from './dependency-metadata.js';
import {managedUIBootstrapSource,managedUIRetireSource} from './managed-ui-lifecycle.js';
import {createPageFrameRuntime,pageFrameBootstrapSource} from './page-frame-runtime.js';
import {readPageFrameResources} from './page-frame-resources.js';

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
    const allowed = ['sourceUtf8','entryFormat','lockId','target','importSourceUrl','managedUI','programId',
      'authorSourceUtf8','authorLockId','authorManifestDigest','compilerVersion'];
    invariant(typeof request === 'object' && !Array.isArray(request) &&
      Object.keys(request).every(key => allowed.includes(key)) &&
      ['sourceUtf8','entryFormat','target'].every(key => Object.hasOwn(request,key)), 'E_SCHEMA', 'Unexpected page preview fields');
    invariant(typeof request.sourceUtf8 === 'string' && request.sourceUtf8.trim().length > 0 &&
      (inspectPageSource(request.sourceUtf8), true) &&
      PAGE_ENTRY_FORMATS.includes(request.entryFormat) &&
      (request.lockId == null || typeof request.lockId === 'string'), 'E_SOURCE', 'Invalid page script entry or source');
    const authorFields=['authorSourceUtf8','authorLockId','authorManifestDigest','compilerVersion'];
    const authoring=authorFields.some(key=>Object.hasOwn(request,key));
    invariant(!authoring||authorFields.every(key=>Object.hasOwn(request,key))&&
      typeof request.authorSourceUtf8==='string'&&request.entryFormat==='async-main'&&request.lockId==null&&
      (request.authorLockId===null||/^dep-lock-[a-f0-9]{64}$/.test(request.authorLockId))&&
      /^[a-f0-9]{64}$/.test(request.authorManifestDigest)&&request.compilerVersion===PAGE_BROWSER_COMPILER.version,
      'E_STATIC_ESM_IDENTITY','Page import 预览需要作者源码和完整的固定依赖身份');
    return Object.freeze({sourceUtf8:request.sourceUtf8,entryFormat:request.entryFormat,
      ...(authoring?Object.fromEntries(authorFields.map(key=>[key,request[key]])):{}),
      lockId:request.lockId ?? null, ...(request.importSourceUrl ? {importSourceUrl:request.importSourceUrl} : {}),
       ...(request.programId!==undefined?{programId:request.programId}:{}),
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
export async function compilePageScriptPreview({sourceUtf8, withJquery, jqueryCode,receiptNonce,builtinSource} = {}) {
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
  if(builtinSource!==undefined) {
    invariant(builtinSource?.abi===BUILTIN_ABI && typeof builtinSource.code==='string' &&
      await sha256Utf8(builtinSource.code)===builtinSource.sha256,
      'E_BUILTIN_HASH','内置库固定资源损坏');
  }
  js.push({code:(builtinSource?.code ? builtinSource.code+'\n;\n' : '')+
    builtinReadinessSource(pageConsumerSource(guard+sourceUtf8,'async-main',receiptNonce),builtinSource,receiptNonce)});
  return Object.freeze({sourceHash:hash, world:'USER_SCRIPT',
    worldId:'opendesk-preview-' + hash.slice(0,48) + (withJquery ? '-jq' : '-plain'),
    js:Object.freeze(js),receiptNonce,
    ...(builtinSource?{builtinAbi:BUILTIN_ABI,builtinCatalogSha256:builtinSource.catalogSha256,
      builtinBundleSha256:builtinSource.sha256}:{})});
}
export function createPageScriptPreview({api, storage, assertHost, dependencies, admission, managedFactory=globalThis.__opendeskNativeManagedUI, fetchImpl = globalThis.fetch,
  loadBuiltin=loadBuiltinPageSource}) {
  invariant(api && storage && typeof assertHost === 'function'&&typeof admission?.reserve==='function'&&typeof admission.release==='function', 'E_SCHEMA', 'Trusted preview dependencies missing');
  const dependencyManager = dependencies || createDependencyManager({api,storage,assertHost,fetchImpl});
  const worlds = createPreviewWorlds({api});
  const pageFrames=createPageFrameRuntime({api,worlds});
  const managed=managedFactory?.({worlds,assertHost,verifyTarget});
  // Developer authority is captured from the original trusted Host. A worker
  // restart cannot reconstruct it from a user-script message or an installation.
  const framePreviews=new Map();
  let active = false;
  let permissionRemovalEpoch=0;
  api.permissions.onRemoved?.addListener(()=>{permissionRemovalEpoch++;});
  async function nativeAPI(){
    try{
      const native=api.userScripts;
      if(typeof native?.getScripts!=='function'||typeof native.execute!=='function')throw new Error();
      await native.getScripts();return native;
    }catch{throw new FoundationError('E_USER_SCRIPTS_UNAVAILABLE','请在 chrome://extensions 中打开此扩展的「允许用户脚本」开关');}
  }
  async function verifyTarget(t,nonce,{requireActive=true,allowLoading=false}={}) {
    // Trusted browser observation, then documentIds injection; never fall back
    // to origin-only authorization or whichever tab happens to be active.
    const [tab, active] = await Promise.all([
      api.tabs.get(t.tabId), requireActive?api.tabs.query({active:true,windowId:t.expectedWindowId}):null
    ]);
    invariant(tab?.id === t.tabId && tab.windowId === t.expectedWindowId && (!requireActive||tab.active === true) &&
      !tab.incognito && tab.url === t.expectedUrl && !tab.pendingUrl &&
      tab.status !== 'unloaded' && (allowLoading || tab.status !== 'loading') &&
      (!requireActive||Array.isArray(active) && active.length === 1 && active[0].id === t.tabId),
      'E_DOCUMENT_STALE', 'Page changed');
    const frames = await api.webNavigation.getAllFrames({tabId:t.tabId});
    const root = frames?.find(row => row.frameId === 0);
    invariant(root?.documentId === t.documentId && root.url === t.expectedUrl &&
      !root.errorOccurred && (!root.documentLifecycle || root.documentLifecycle === 'active'),
      'E_DOCUMENT_STALE', 'Document changed');
    invariant(await api.permissions.contains({origins:[permissionPattern(t.expectedUrl)]}),
      'E_PERMISSION', 'Site permission was not granted or was revoked');
    const slot = await storage.transaction(['runs'], 'readonly', tx => tx.get('runs','@slot'));
    invariant(!slot?.currentRunId&&(!slot?.preview||slot.preview.nonce===nonce), 'E_OWNER', 'Controller/Page preview owns slot');
  }
  async function preview(request, sender, authorize, {managedVerification=false}={}) {
    invariant(!active, 'E_OWNER', '已有页面脚本试运行正在等待浏览器回执');
    active = true;
    let receipt,verificationPreview;
    try {
      // Only the frozen-candidate verifier selects this internal option. Reuse
      // the original workbench's owned lifecycle, including its cleanup fence.
      if(managedVerification&&(await readPageFrameResources(request.sourceUtf8)).length){
        const owner=await assertHost(sender),target=freezeTarget(request.target);
        const prior=(await worlds.records()).filter(row=>row.tabId===target.tabId&&
          row.documentId===target.documentId&&row.managed?.registrationId===owner.registrationId&&
          !['retired','discarded'].includes(row.managed.state));
        invariant(prior.length<=1,'E_UI_OWNER','旧受管预览仍需原工作台确认清理');
        verificationPreview=crypto.randomUUID();
        request={...request,managedUI:{previewId:verificationPreview,
          bindingId:prior[0]?.managed.bindingId??'browser-v1-'+crypto.randomUUID().replaceAll('-','').slice(0,24),enabled:true}};
      }
      receipt=await evaluate(request,sender,authorize);
    } finally {active = false;}
    // A failed or unknown execution never reaches this cleanup or a Verified
    // proof. Successful verification must also confirm managed UI retirement.
    if(verificationPreview)await retire({previewId:verificationPreview},sender);
    return receipt;
  }
  // Only the installed-program broker supplies this internal guard. It is
  // never accepted as a field in a UI/Native preview request.
  async function evaluate(request, sender, authorize) {
    const owner=await assertHost(sender); // Existing authenticated packaged tool document.
    const frozen = frozenSource(request);
    const authorEpoch=permissionRemovalEpoch;
    const guard=async()=>{
      if(Object.hasOwn(frozen,'authorSourceUtf8')){
        const fixed=await dependencyManager.loadForCompilation({sourceUtf8:frozen.authorSourceUtf8,
          entryFormat:'async-main',sourceFormat:'esm-page',lockId:frozen.authorLockId,
          ...(frozen.importSourceUrl?{importSourceUrl:frozen.importSourceUrl}:{})},sender);
        invariant(fixed.lockId===frozen.authorLockId&&fixed.manifestDigest===frozen.authorManifestDigest&&
          permissionRemovalEpoch===authorEpoch,'E_DEPENDENCY_LOCK_STALE','作者依赖或来源授权在预览期间已变化');
      }
      if(authorize)await authorize();
      invariant(!Object.hasOwn(frozen,'authorSourceUtf8')||permissionRemovalEpoch===authorEpoch,
        'E_DEPENDENCY_PERMISSION','依赖来源权限在派发前已撤销');
    };
    await guard();
    await verifyTarget(frozen.target);
    let jqueryCode, locked, script,frameworkSource,optionalSources=[];
    const receiptNonce=crypto.randomUUID();
    const builtinSource=await loadBuiltin({runtime:api.runtime,fetchImpl});
    if (frozen.legacy && frozen.withJquery) {
      const packed = await loadPackagedJquery({runtime:api.runtime,fetchImpl});
      jqueryCode = packed.code;
    }
    if(!frozen.legacy&&pageWantsJquery(frozen.sourceUtf8))
      jqueryCode=(await loadPackagedJquery({runtime:api.runtime,fetchImpl})).code;
    const selected=frozen.legacy?[]:pageSelectedPackagedLibraries(frozen.sourceUtf8);
    const ids=selected.map(pageOptionalLibraryId).filter(Boolean);
    if(ids.length)optionalSources=await loadPackagedOptionalPageLibraries(ids,{runtime:api.runtime,fetchImpl});
    const frameworkId=selected.find(id=>id==='react'||id==='vue');
    if(frameworkId)frameworkSource=await loadPackagedPageFramework(frameworkId,{runtime:api.runtime,fetchImpl});
    if (frozen.legacy) script = await compilePageScriptPreview({...frozen,jqueryCode,receiptNonce,builtinSource});
    else {
      locked = await dependencyManager.loadForExecution({sourceUtf8:frozen.sourceUtf8,
        entryFormat:frozen.entryFormat,lockId:frozen.lockId,
        ...(frozen.programId!==undefined?{programId:frozen.programId}:{}),
        ...(frozen.importSourceUrl ? {importSourceUrl:frozen.importSourceUrl} : {})},sender);
      script = await compileLockedPageSource({...frozen,entries:locked.entries,receiptNonce,builtinSource,jqueryCode,frameworkSource,optionalSources});
    }
    const frameResources=await readPageFrameResources(frozen.sourceUtf8);
    const native=await nativeAPI();
    invariant(!frozen.managedUI||managed,'E_UI_LIFECYCLE','受管预览未加载');
    const context=frozen.managedUI?await managed.inspect(frozen,owner):null;
    invariant(!frameResources.length||context,'E_UI_LIFECYCLE','固定资源预览需要原工作台的受管 UI 生命周期');
    // Both routes prove isolation, including the transitional packaged-library
    // checkbox. Legacy source-hash worlds can also exhaust Chromium's budget.
    const worldId = await worlds.allocate(native,frozen.target);
    await assertHost(sender);
    const tabId = frozen.target.tabId, documentId = frozen.target.documentId;
    await admission.reserve({nonce:receiptNonce,tabId,documentId,sourceHash:script.sourceHash},sender);
    let dispatched=false,confirmed=false,previousCleanup,frameContext;
    try {
    await verifyTarget(frozen.target,receiptNonce);
    if(context?.previous){
        const previousFrames=framePreviews.get(context.previous.worldId);
        if(previousFrames)previousFrames.stopping=true;
      previousCleanup=await managed.retire(native,context.previous,receiptNonce,{sender,dispatch:()=>{dispatched=true;confirmed=false;},confirm:()=>{confirmed=true;}});
    }
    const managedRecord=context?await managed.prepare(native,context,worldId,script.sourceHash,receiptNonce,sender):null;
      let js=script.js;
      if(frameResources.length){
        frameContext={...managedRecord,receiptNonce,sender,guard,epoch:permissionRemovalEpoch,parentSettled:false,stopping:false,
          candidate:{sourceUtf8:frozen.sourceUtf8}};
        await worlds.editRecords(rows=>{
          const row=rows.find(row=>row.worldId===worldId);
          invariant(row?.managed?.nonce===managedRecord.nonce&&!row.previewFrames,'E_FRAME_IDENTITY','原受管预览世界已改变');
          row.previewFrames={previewId:managedRecord.previewId,sourceHash:script.sourceHash,receiptNonce,state:'ready',frames:[]};
        });
        framePreviews.set(worldId,frameContext);
        await native.configureWorld({worldId,csp:PAGE_WORLD_CSP,messaging:true});
        const bootstrap=pageFrameBootstrapSource({previewId:managedRecord.previewId,worldId,sourceHash:script.sourceHash,
          receiptNonce,resourceIds:frameResources.map(row=>row.resourceId)});
        js=[{code:bootstrap+';\n'+script.js.map(row=>row.code).join('\n;\n')}];
      }
    await guard();
    dispatched=true;confirmed=false;
    const results = await native.execute({target:{tabId,documentIds:[documentId]},
      world:script.world,worldId,js});
    invariant(Array.isArray(results) && results.length === 1 &&
      results[0]?.frameId === 0 && results[0]?.documentId === documentId,
      'E_RESULT_FORMAT', 'Native user script returned no exact document receipt');
    const receipt = results[0];
    if (receipt.error !== undefined) throw new FoundationError('E_PAGE_SCRIPT_EXECUTION',String(receipt.error));
    const completion=receipt.result;
    invariant(completion && completion.format===PAGE_PREVIEW_RECEIPT_FORMAT && completion.nonce===receiptNonce &&
      typeof completion.ok==='boolean','E_PAGE_SCRIPT_EXECUTION',
      '脚本未返回完成回执，请查看网页控制台');
    if(managedRecord)await managed.mark(managedRecord,'evaluated',{
      format:completion.format,nonce:completion.nonce,ok:completion.ok,
      ...(!completion.ok?{error:String(completion.error||'').slice(0,2048)}:{})});
    confirmed=true;
    if(frameContext)await worlds.editRecords(rows=>{
      const row=rows.find(row=>row.worldId===worldId);
      invariant(row?.previewFrames?.receiptNonce===receiptNonce,'E_FRAME_IDENTITY','原预览资源身份已改变');
      row.previewFrames.state=completion.ok?'evaluated':'failed';
    });
      const identity={tabId,documentId,sourceHash:script.sourceHash,world:script.world,worldId,receiptNonce,
        builtinAbi:script.builtinAbi,builtinCatalogSha256:script.builtinCatalogSha256,
        builtinBundleSha256:script.builtinBundleSha256,
        ...(script.packagedJquerySha256?{packagedJquerySha256:script.packagedJquerySha256}:{}),
        ...(script.packagedFrameworkId?{packagedFrameworkId:script.packagedFrameworkId,
          packagedFrameworkSha256:script.packagedFrameworkSha256}:{}),
        ...(script.packagedOptionals?{packagedOptionals:script.packagedOptionals}:{}),
        ...(script.packagedOptionalId?{packagedOptionalId:script.packagedOptionalId,
          packagedOptionalSha256:script.packagedOptionalSha256}:{})};
      if(!completion.ok)throw Object.assign(new FoundationError('E_PAGE_SCRIPT_EXECUTION',completion.error || '页面脚本执行失败'),
        {response:{...identity,state:'preview-failed',
          ...(managedRecord?{managedUI:true,managedPreviewId:managedRecord.previewId}:{}),
          completion:{format:completion.format,nonce:completion.nonce,
          ok:false,error:String(completion.error||'').slice(0,2048)}}});
    // A real receipt proves the effect in the original document. Navigation
    // while awaiting it must not be reported as current-document success or replayed.
    await verifyTarget(frozen.target,receiptNonce);
    await guard();
    const value=completion.value;
    let resultText;
    try {resultText = value === undefined ? 'undefined' : JSON.stringify(value);}
    catch {resultText = '（返回值不可 JSON 序列化）';}
    if(typeof resultText !== 'string') resultText = String(value);
    if(frozen.entryFormat==='classic-userscript') resultText='经典脚本的顶层同步代码已执行；异步 IIFE、监听器和定时器不等待，也不会因预览返回而停止。';
      return {state:'preview-evaluated',durable:false,registered:false,...identity,
      ...(managedRecord?{managedUI:true,managedPreviewId:managedRecord.previewId,...(previousCleanup?{previousCleanup:{previewId:context.previous.previewId,...previousCleanup}}:{})}:{}),
      ...(frozen.legacy ? {withJquery:frozen.withJquery,
        dependency:frozen.withJquery ? {id:JQUERY_371.id,version:JQUERY_371.version} : null} :
        {entryFormat:frozen.entryFormat,lockId:locked.lockId,manifestDigest:locked.manifestDigest,
          dependencies:locked.entries.map(({order,url,sha256,sourceKind})=>({order,url,sha256,sourceKind})),
          warnings:script.warnings}),
      resultText:resultText.slice(0,2048)};
    }catch(error){
      if(dispatched&&!confirmed)throw new FoundationError('E_EFFECT_UNKNOWN',error.message+'；原页面执行效果未知，不能自动重试');
      if(dispatched&&confirmed)error.effectConfirmed=true;
      throw error;
    }finally{
      if(frameContext){
        frameContext.parentSettled=confirmed;
        if(!dispatched)framePreviews.delete(worldId);
      }
      if((!dispatched||confirmed)&&(!frameContext||await framesSettled(frameContext)))await admission.release({nonce:receiptNonce});
    }
  }
  async function framesSettled(context){
    const row=(await worlds.records()).find(row=>row.worldId===context.worldId);
    return row?.previewFrames?.receiptNonce===context.receiptNonce&&
      !row.previewFrames.frames.some(frame=>['dispatched','unknown'].includes(frame.state));
  }
  async function handlePreviewFrame(message,sender){
    const common=['protocol','action','previewId','worldId','sourceHash','receiptNonce','operation','requestId'];
    fields(message,message?.operation==='retire'?common:[...common,'resourceId','url','portToken','data']);
    const context=framePreviews.get(message.worldId),t=context?.target;
    invariant(context&&message.protocol==='opendesk.page-installed.boot.v1'&&message.action==='page-frame'&&
      message.previewId===context.previewId&&message.sourceHash===context.sourceHash&&message.receiptNonce===context.receiptNonce&&
      /^[a-f0-9-]{36}$/.test(message.requestId)&&sender?.id===api.runtime.id&&sender.frameId===0&&
      sender.tab?.id===t.tabId&&!sender.tab.incognito&&sender.documentId===t.documentId&&
      sender.url===t.expectedUrl&&sender.origin===new URL(t.expectedUrl).origin,
      'E_FRAME_IDENTITY','子帧只接受原工作台预览的真实父文档消息');
    const authorize=async()=>{
      invariant(!context.stopping&&permissionRemovalEpoch===context.epoch,'E_FRAME_IDENTITY','原预览已停止或权限已变化');
      const row=(await worlds.records()).find(row=>row.worldId===context.worldId);
      invariant(row?.managed?.nonce===context.nonce&&row.managed.sourceHash===context.sourceHash&&
        ['executing','evaluated'].includes(row.managed.state)&&row.managed.completion?.ok!==false&&
        row.previewFrames?.receiptNonce===context.receiptNonce&&['ready','evaluated'].includes(row.previewFrames.state),
        'E_FRAME_IDENTITY','原受管预览已经结束或身份已改变');
      invariant((await assertHost(context.sender)).registrationId===context.registrationId,'E_OWNER','原预览工作台已变化');
      await context.guard();await nativeAPI();
      await verifyTarget(t,held?message.requestId:context.receiptNonce,{requireActive:false});
      invariant(!context.stopping&&permissionRemovalEpoch===context.epoch,'E_FRAME_IDENTITY','原预览已停止或权限已变化');
    };
    const parent={nonce:context.receiptNonce,registrationId:context.registrationId,
      tabId:t.tabId,documentId:t.documentId,sourceHash:context.sourceHash};
    const reservation={nonce:message.requestId,tabId:t.tabId,documentId:t.documentId,sourceHash:context.sourceHash};
    let held=false,dispatched=false,confirmed=false;
    const dispatch=async invoke=>{
      const claim=await admission.reserveFrame(reservation,parent,context.sender);held=!claim.shared;
      await authorize();await admission.assertFrame(reservation,parent,context.sender,claim);
      // No asynchronous observation between Stop/revocation and Chrome dispatch.
      invariant(!context.stopping&&permissionRemovalEpoch===context.epoch,'E_FRAME_IDENTITY','原预览已停止或权限已变化');
      dispatched=true;const completion=Promise.resolve(invoke());completion.catch(()=>{});return {completion};
    };
    try{
      if(message.operation!=='retire')await authorize();
      const result=await pageFrames.execute({message,sender,candidate:context.candidate,preview:context},authorize,dispatch);
      confirmed=true;
      if(message.operation==='retire')await admission.release({nonce:message.requestId});
      return result;
    }finally{
      if(held&&(!dispatched||confirmed))await admission.release({nonce:message.requestId});
      if(context.parentSettled&&await framesSettled(context))await admission.release({nonce:context.receiptNonce});
    }
  }
  async function retire(request,sender){
    invariant(!active&&managed,'E_OWNER','受管清理不可用或忙碌');active=true;
    try{
      const owner=await assertHost(sender),record=await managed.read(request?.previewId,owner);
      const context=framePreviews.get(record.worldId);if(context)context.stopping=true;
      return await managed.retirePreview(request,sender,{assertHost,verifyTarget,nativeAPI,admission});
    }
    finally{active=false;}
  }
  // Read the original receipt only. A UI timeout must never turn into another
  // execute call, a new admission, or a claim about a later document/version.
  async function query(request,sender){
    fields(request,['previewId','sourceHash','tabId','documentId']);
    invariant(managed&&/^[a-f0-9-]{36}$/.test(request.previewId)&&
      /^[a-f0-9]{64}$/.test(request.sourceHash)&&Number.isSafeInteger(request.tabId)&&request.tabId>=0&&
      typeof request.documentId==='string'&&request.documentId.length>0&&request.documentId.length<=128,
      'E_SCHEMA','Expected the original managed preview identity');
    const owner=await assertHost(sender),record=await managed.read(request.previewId,owner);
    invariant(record.sourceHash===request.sourceHash&&record.target.tabId===request.tabId&&
      record.target.documentId===request.documentId,'E_UI_LIFECYCLE','查询身份与原预览不一致');
    invariant(await api.permissions.contains({origins:[permissionPattern(record.target.expectedUrl)]}),
      'E_PERMISSION','Site permission was not granted or was revoked');
    invariant((await assertHost(sender)).registrationId===owner.registrationId,'E_HOST_STALE','工作台身份已变化');
    const receipt=record.completion;
    const confirmed=receipt?.format===PAGE_PREVIEW_RECEIPT_FORMAT&&
      /^[a-f0-9-]{36}$/.test(receipt.nonce)&&typeof receipt.ok==='boolean';
    const state=record.state==='retired'?'preview-retired':
      record.state==='executing'?'preview-pending':record.state==='evaluated'&&confirmed?
      (receipt.ok?'preview-evaluated':'preview-failed'):'preview-unknown';
    return {state,queryOnly:true,durable:false,originalDocumentOnly:true,
      managedUI:true,managedPreviewId:record.previewId,sourceHash:record.sourceHash,
      tabId:record.target.tabId,documentId:record.target.documentId,world:'USER_SCRIPT',worldId:record.worldId,
      ...(confirmed?{receiptNonce:receipt.nonce,completion:{format:receipt.format,nonce:receipt.nonce,
        ok:receipt.ok,...(!receipt.ok?{error:String(receipt.error||'').slice(0,2048)}:{})}}:{})};
  }
  // Only the trusted installed-program service supplies frozen bytes and its
  // persisted grant. No UI/Native message route exposes this method directly.
  // Reuse the compiler, native world proof and unique Authority slot.
  const installedIdentity=['namespace','programId','revision','sourceHash','manifestHash',
    'installationId','grantGeneration','executionKey','receiptNonce'];
  async function markInstalled(worldId,receiptNonce,change){
    await worlds.editRecords(rows=>{
      const row=rows.find(row=>row.worldId===worldId);
      invariant(row?.installed?.receiptNonce===receiptNonce,'E_UI_LIFECYCLE','原安装清理身份已变化');
      row.installed={...row.installed,...change(row.installed)};
    });
  }
  // Internal broker control only: no UI message accepts an installation or
  // source here. Reuse the existing world ledger and lexical UI registry.
  async function retireInstalled(installation,{includeCurrent=true}={}){
    const records=(await worlds.records()).filter(row=>{
      const r=row.installed,a=installation.authorization;
      return r&&r.namespace===installation.namespace&&r.programId===installation.programId&&
        r.installationId===a?.installationId&&r.grantGeneration<=a.generation&&
        (includeCurrent||r.grantGeneration<a.generation);
    });
    // Extension reload or session-ledger loss does not prove an old document
    // died. The persisted execution still fences a false "nothing to clean".
    const executions=await storage.transaction(['frameworkKV'],'readonly',async tx=>(await tx.all('frameworkKV')).filter(r=>
      r?.tag==='page-execution-v1'&&r.namespace===installation.namespace&&r.programId===installation.programId&&
      r.installationId===installation.authorization?.installationId&&r.grantGeneration<=installation.authorization.generation&&
      (includeCurrent||r.grantGeneration<installation.authorization.generation)&&r.managedUI));
    let unknown=false;
    for(const execution of executions){
      if(records.some(row=>row.worldId===execution.managedUI.worldId&&
        installedIdentity.every(key=>row.installed[key]===execution[key])))continue;
      try{
        const frame=await api.webNavigation.getFrame({documentId:execution.documentId});
        if(frame!==null&&frame!==undefined)unknown=true;
      }catch{unknown=true;}
    }
    for(const row of records){
      const r=row.installed;
      if(r.state==='retired'||r.state==='discarded')continue;
      let dispatched=false;
      try{
        const execution=await storage.transaction(['frameworkKV'],'readonly',tx=>tx.get('frameworkKV',r.executionKey));
        invariant(execution?.tag==='page-execution-v1'&&installedIdentity.every(key=>execution[key]===r[key])&&
          execution.tabId===row.tabId&&execution.documentId===row.documentId&&r.target?.tabId===row.tabId&&
          r.target.documentId===row.documentId&&/^[a-f0-9]{64}$/.test(r.compiledSha256)&&
          execution.managedUI?.worldId===row.worldId&&execution.managedUI.compiledSha256===r.compiledSha256,
          'E_UI_LIFECYCLE','受管清理与原始安装执行不一致');
        // getAllFrames omits BFCache. Only exact UUID absence proves death.
        // Chrome validates optional tab/frame query fields against the UUID;
        // getFrame's RESULT has parentFrameId, not tabId or frameId.
        const frame=await api.webNavigation.getFrame({tabId:row.tabId,frameId:0,documentId:row.documentId});
        if(frame===null||frame===undefined){
          const original=await api.webNavigation.getFrame({documentId:row.documentId});
          invariant(original===null||original===undefined,'E_DOCUMENT_STALE','原文档仍存在但不属于此顶层目标');
          await markInstalled(row.worldId,r.receiptNonce,()=>({state:'retired',contextGone:true}));continue;
        }
        // Uncertain cleanup can observe document death, but must never replay.
        if(['retiring','unknown','failed'].includes(r.state)){unknown=true;continue;}
        invariant(frame.documentId===row.documentId&&frame.parentFrameId===-1&&frame.parentDocumentId===undefined&&
          frame.frameType==='outermost_frame'&&
          !frame.errorOccurred&&(!frame.documentLifecycle||frame.documentLifecycle==='active'),
          'E_DOCUMENT_STALE','原安装文档当前不可清理');
        const native=await nativeAPI(),requestNonce=crypto.randomUUID();
        await markInstalled(row.worldId,r.receiptNonce,current=>{
          invariant(['ready','evaluated'].includes(current.state),'E_EFFECT_UNKNOWN','原清理状态已变化');
          return {state:'retiring'};
        });
        dispatched=true;
        const results=await native.execute({target:{tabId:row.tabId,documentIds:[row.documentId]},
          world:'USER_SCRIPT',worldId:row.worldId,js:[{code:managedUIRetireSource(r.receiptNonce,requestNonce)}]});
        const result=results?.[0],receipt=result?.result;
        invariant(Array.isArray(results)&&results.length===1&&result.frameId===0&&
          result.documentId===row.documentId&&result.error===undefined&&
          receipt?.format==='opendesk.managed-ui.v1'&&receipt.nonce===r.receiptNonce&&
          receipt.requestNonce===requestNonce&&receipt.scope==='managed-ui-only'&&
          typeof receipt.ok==='boolean'&&Number.isSafeInteger(receipt.instances)&&receipt.instances>=0,
          'E_EFFECT_UNKNOWN','缺少原文档的受管清理回执');
        await markInstalled(row.worldId,r.receiptNonce,()=>({state:receipt.ok?'retired':'failed',receipt}));
        if(!receipt.ok)unknown=true;
      }catch(error){
        unknown=true;
        await markInstalled(row.worldId,r.receiptNonce,()=>({state:'unknown',
          error:{code:dispatched?'E_EFFECT_UNKNOWN':error.code||'E_EFFECT_UNKNOWN',message:String(error.message||error).slice(0,1024)}}));
      }
    }
    return {scope:'managed-ui-only',state:unknown?'unknown':'retired',records:Math.max(records.length,executions.length)};
  }
  async function executeInstalled({candidate,resolution,target,installation},authorize,dispatch) {
    invariant(!active&&typeof admission.reserveInstalled==='function','E_OWNER','页面执行入口正忙');
    const t=freezeTarget(target);
    active=true;let dispatched=false,confirmed=false,reserved=false,installedWorld;
    const receiptNonce=crypto.randomUUID();
    try {
      invariant(typeof dispatch==='function','E_OWNER','缺少安装派发授权');
      await authorize();await verifyTarget(t,undefined,{requireActive:false,allowLoading:true});
      const history=await storage.transaction(['frameworkKV'],'readonly',async tx=>(await tx.all('frameworkKV')).filter(row=>
        row?.tag==='page-execution-v1'&&row.namespace===installation.namespace&&row.programId===installation.programId&&
        row.documentId===t.documentId&&row.executionKey!==installation.executionKey&&row.managedUI));
      const known=await worlds.records();
      invariant(history.every(execution=>known.some(row=>row.worldId===execution.managedUI.worldId&&
        row.tabId===execution.tabId&&row.documentId===execution.documentId&&
        installedIdentity.every(key=>row.installed?.[key]===execution[key])&&
        row.installed.compiledSha256===execution.managedUI.compiledSha256&&
        ['retired','discarded'].includes(row.installed.state))),
        'E_UI_CLEANUP_FAILED','原安装的受管清理未确认；请重新加载原网页，不执行新源码');
      const builtinSource=await loadBuiltin({runtime:api.runtime,fetchImpl});
      assertBuiltinIdentity(candidate.builtinIdentity,builtinIdentity(builtinSource));
      const jqueryCode=pageWantsJquery(candidate.sourceUtf8)
        ? (await loadPackagedJquery({runtime:api.runtime,fetchImpl})).code : undefined;
      const selected=pageSelectedPackagedLibraries(candidate.sourceUtf8);
      const ids=selected.map(pageOptionalLibraryId).filter(Boolean);
      const frameworkId=selected.find(id=>id==='react'||id==='vue');
      const frameworkSource=frameworkId
        ? await loadPackagedPageFramework(frameworkId,{runtime:api.runtime,fetchImpl}):undefined;
      const optionalSources=ids.length
        ? await loadPackagedOptionalPageLibraries(ids,{runtime:api.runtime,fetchImpl}):[];
      const script=await compileLockedPageSource({sourceUtf8:candidate.sourceUtf8,
        entryFormat:candidate.manifest.entryFormat,entries:resolution.entries,
        importSourceUrl:candidate.manifest.sourceProfile.importSourceUrl,receiptNonce,builtinSource,jqueryCode,frameworkSource,optionalSources});
      const native=await nativeAPI(),worldId=await worlds.allocate(native,t);
      await admission.reserveInstalled({nonce:receiptNonce,tabId:t.tabId,documentId:t.documentId,
        sourceHash:script.sourceHash},installation);reserved=true;
      invariant(script.sourceHash===installation.sourceHash,'E_SOURCE_HASH','安装源码已变化');
      const frameResources=await readPageFrameResources(candidate.sourceUtf8);
      if(frameResources.length)await native.configureWorld({worldId,csp:PAGE_WORLD_CSP,messaging:true});
      const frameBootstrap=frameResources.length?pageFrameBootstrapSource({executionKey:installation.executionKey,
        receiptNonce,resourceIds:frameResources.map(row=>row.resourceId)}):'';
      const js=[{code:managedUIBootstrapSource(receiptNonce)+';\n'+frameBootstrap+';\n'+script.js.map(row=>row.code).join('\n;\n')}];
      const compiledSha256=await sha256Utf8(js[0].code);
      // Persist the world/code binding in the original Authority execution too;
      // session metadata alone cannot choose a world for privileged control.
      await storage.transaction(['frameworkKV'],'readwrite',async tx=>{
        const execution=await tx.get('frameworkKV',installation.executionKey);
        invariant(execution?.state==='prepared'&&execution.receiptNonce===receiptNonce&&
          execution.sourceHash===script.sourceHash&&!execution.managedUI,'E_UI_LIFECYCLE','原执行已变化');
        await tx.put('frameworkKV',{...execution,managedUI:{worldId,compiledSha256}},installation.executionKey);
      });
      await worlds.editRecords(rows=>{
        const row=rows.find(row=>row.worldId===worldId);
        invariant(row&&!row.installed&&!row.managed,'E_UI_LIFECYCLE','安装执行世界已被占用');
        row.installed={namespace:installation.namespace,programId:installation.programId,revision:installation.revision,
          sourceHash:script.sourceHash,manifestHash:installation.manifestHash,
          installationId:installation.authorization.installationId,grantGeneration:installation.authorization.generation,
          executionKey:installation.executionKey,receiptNonce,target:t,compiledSha256,state:'ready',
          builtinBundleSha256:script.builtinBundleSha256,dependencyHashes:resolution.entries.map(row=>row.sha256)};
      });installedWorld=worldId;
      await verifyTarget(t,receiptNonce,{requireActive:false,allowLoading:true});
      // Serialize the last grant check and native invocation with disable and
      // replacement. Release that queue before awaiting user code completion.
      const pending=await dispatch(receiptNonce,()=>{
        dispatched=true;
        return native.execute({target:{tabId:t.tabId,documentIds:[t.documentId]},
          world:'USER_SCRIPT',worldId,js});
      });
      const results=await pending.completion;
      invariant(Array.isArray(results)&&results.length===1&&results[0]?.frameId===0&&
        results[0]?.documentId===t.documentId,'E_RESULT_FORMAT','缺少安装脚本的精确文档回执');
      const result=results[0];
      if(result.error!==undefined)throw new FoundationError('E_PAGE_SCRIPT_EXECUTION',String(result.error));
      const completion=result.result;
      invariant(completion?.format===PAGE_PREVIEW_RECEIPT_FORMAT&&completion.nonce===receiptNonce&&
        typeof completion.ok==='boolean','E_PAGE_SCRIPT_EXECUTION','安装脚本缺少完成回执');
      confirmed=true;
      await markInstalled(worldId,receiptNonce,current=>current.state==='ready'?{state:'evaluated'}:{});
      invariant(completion.ok,'E_PAGE_SCRIPT_EXECUTION',completion.error||'安装脚本执行失败');
      await verifyTarget(t,receiptNonce,{requireActive:false,allowLoading:true});
      await authorize(); // A completed native effect does not revive a revoked grant.
      let resultText;try{resultText=completion.value===undefined?'undefined':JSON.stringify(completion.value);}catch{resultText='（返回值不可 JSON 序列化）';}
      if(candidate.manifest.entryFormat==='classic-userscript')resultText='经典脚本同步顶层求值完成；异步 IIFE、监听器和定时器不等待，也不会因返回而停止。';
      return {state:'page-installed-evaluated',sourceHash:script.sourceHash,tabId:t.tabId,
        documentId:t.documentId,world:'USER_SCRIPT',worldId,receiptNonce,
        resultText:String(resultText).slice(0,2048),entryFormat:candidate.manifest.entryFormat,
        builtinAbi:script.builtinAbi,builtinCatalogSha256:script.builtinCatalogSha256,
        builtinBundleSha256:script.builtinBundleSha256,
        ...(script.packagedJquerySha256?{packagedJquerySha256:script.packagedJquerySha256}:{}),
        ...(script.packagedFrameworkId?{packagedFrameworkId:script.packagedFrameworkId,
          packagedFrameworkSha256:script.packagedFrameworkSha256}:{}),
        ...(script.packagedOptionals?{packagedOptionals:script.packagedOptionals}:{}),
        ...(script.packagedOptionalId?{packagedOptionalId:script.packagedOptionalId,
          packagedOptionalSha256:script.packagedOptionalSha256}:{})};
    }catch(error){
      if(dispatched&&!confirmed)throw new FoundationError('E_EFFECT_UNKNOWN',error.message+'；本次效果未知，不自动重放');
      if(dispatched&&confirmed)error.effectConfirmed=true;
      throw error;
    }finally{
      try{
        if(installedWorld&&!dispatched)await markInstalled(installedWorld,receiptNonce,()=>({state:'discarded'}));
        if(reserved&&(!dispatched||confirmed))await admission.release({nonce:receiptNonce});
      }finally{active=false;}
    }
  }
  return Object.freeze({preview,retire,query,executeInstalled,retireInstalled,executeFrame:pageFrames.execute,handlePreviewFrame,async cleanupWorlds(details){
    for(const [worldId,context] of framePreviews)if(context.target.tabId===details.tabId&&
      (details.removed||context.target.documentId!==details.documentId)){context.stopping=true;if(details.removed)framePreviews.delete(worldId);}
    if(details.removed)await admission.release({removedTabId:details.tabId});
    return worlds.cleanup(details);
  }});
}
