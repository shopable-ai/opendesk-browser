import {invariant,digestUtf8 as sha256Utf8} from '../../platform/protocol.js';
import {parseUserScriptDependencies, assertUserScriptExecutable} from './dependency-metadata.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG} from '../../libs/runtime-contract.js';
import {JQUERY_371} from './packaged-dependencies.js';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../libs/page-frameworks/contract.js';

export const PAGE_ENTRY_FORMATS = Object.freeze(['classic-userscript', 'async-main']);
export const PAGE_SOURCE_LIMIT = 128 * 1024;
export const PAGE_WORLD_CSP = "script-src 'self'; object-src 'none'";
export const PAGE_PREVIEW_RECEIPT_FORMAT = 'opendesk.page-preview-receipt.v1';
// Declaration aliases only; versions, worlds and resources remain in runtime-contract.js.
const OPTIONAL_PAGE_LIBRARY_IDS=Object.freeze({'js-cookie':'jsCookie','crypto-js':'cryptoJs','file-saver':'fileSaver','query-string':'queryString'});
export const pageOptionalLibraryId=name=>Object.hasOwn(OPTIONAL_PAGE_LIBRARY_IDS,name)?OPTIONAL_PAGE_LIBRARY_IDS[name]:null;
/** One opt-in Page-only library declaration; never scanned after source code. */
export function pageSelectedPackagedLibrary(sourceUtf8,parsed=parseUserScriptDependencies(sourceUtf8)) {
  const header=parsed.directives.filter(row=>row.name==='opendesk-lib').map(row=>row.value);
  const leading=[];
  if(!parsed.hasHeader){
    // Only the leading comment preamble may opt into an extension-bundled
    // runtime. Do not discover an embedded comment inside executable JS.
    for(const line of sourceUtf8.replace(/^\uFEFF/,'').split(/\r?\n/)){
      if(/^\s*$/.test(line))continue;
      const directive=/^\s*\/\/\s*@opendesk-lib\s+([^\s]+)\s*$/.exec(line);
      if(directive)leading.push(directive[1]);
      else if(!/^\s*\/\//.test(line))break;
    }
  }
  const values=parsed.hasHeader?header:leading;
  invariant(values.length<=1&&values.every(value=>['jquery','react','vue',...Object.keys(OPTIONAL_PAGE_LIBRARY_IDS)].includes(value)),
    'E_BUILTIN_DECLARATION','@opendesk-lib 必须唯一');
  invariant(!values.length||parsed.requires.length===0,
    'E_BUILTIN_CONFLICT','不能混用 @opendesk-lib 和 @require');
  return values[0]??null;
}
export function pageWantsJquery(sourceUtf8,parsed=parseUserScriptDependencies(sourceUtf8)) {
  return pageSelectedPackagedLibrary(sourceUtf8,parsed)==='jquery';
}

export function pageConsumerSource(sourceUtf8,entryFormat,receiptNonce) {
  invariant(receiptNonce===undefined || /^[a-f0-9-]{36}$/.test(receiptNonce),'E_RESULT_FORMAT','Invalid preview completion identity');
  const marker=receiptNonce===undefined ? null : JSON.stringify({format:PAGE_PREVIEW_RECEIPT_FORMAT,nonce:receiptNonce});
  if(entryFormat==='classic-userscript') return sourceUtf8 + (marker ? '\n;\n({...'+marker+',ok:true})' : '');
  const body="(async function(main) {\n'use strict';\n" + sourceUtf8 +
    "\nif (typeof main !== 'function') throw new Error('E_MAIN_REQUIRED: 需要 async function main()');\nreturn await main();\n})(undefined)";
  if(!marker)return body;
  // This completion contract distinguishes a legitimate undefined result from
  // Chromium returning no result after an exception. It is not an Available
  // proof or a security attestation about arbitrary user code.
  return '(async()=>{try{const value=await '+body+';return {...'+marker+',ok:true,value};}\n'+
    'catch(error){return {...'+marker+",ok:false,error:String(error?.message || error)};}})()";
}

// This compiler only produces text for chrome.userScripts. It never evaluates
// source in the extension, and it never resolves URLs or reads a mutable CDN.
export function builtinReadinessSource(source,builtinSource,receiptNonce) {
  if(!builtinSource)return source;
  const ready="globalThis.OpenDeskLibs?.abi==="+JSON.stringify(BUILTIN_ABI)+
    "&&globalThis._===globalThis.OpenDeskLibs.lodash&&globalThis.dayjs===globalThis.OpenDeskLibs.dayjs&&typeof globalThis.OpenDeskLibs.myUtils?.upper==='function'";
  const failed=receiptNonce===undefined ? "throw Error('E_BUILTIN_NOT_READY')" :
    '('+JSON.stringify({format:PAGE_PREVIEW_RECEIPT_FORMAT,nonce:receiptNonce,ok:false,error:'E_BUILTIN_NOT_READY'})+')';
  return 'if('+ready+'){\n'+source+'\n}else{'+failed+'}';
}

export async function compileLockedPageSource({sourceUtf8, entryFormat, entries = [], importSourceUrl,receiptNonce,builtinSource,jqueryCode,frameworkSource,optionalSource} = {}) {
  invariant(typeof sourceUtf8 === 'string' && sourceUtf8.trim().length > 0 &&
    new TextEncoder().encode(sourceUtf8).byteLength <= PAGE_SOURCE_LIMIT,
    'E_SOURCE', '页面脚本源码须为非空文本，且不超过 128 KiB');
  invariant(PAGE_ENTRY_FORMATS.includes(entryFormat), 'E_ENTRY_FORMAT', '请选择经典用户脚本或 async main 入口');
  const parsed = parseUserScriptDependencies(sourceUtf8, {importSourceUrl});
  const admission = assertUserScriptExecutable(parsed, {entryFormat, phase:'preview', dependenciesLocked:true});
  invariant(Array.isArray(entries) && entries.length === parsed.requires.length,
    'E_DEPENDENCY_LOCK', '源码依赖声明与已经批准的锁不同');
  const selected=pageSelectedPackagedLibrary(sourceUtf8,parsed),jquery=selected==='jquery';
  invariant(jquery||jqueryCode===undefined,'E_BUILTIN_CONFLICT','未声明内置 jQuery 却提供了依赖字节');
  const framework=selected&&Object.hasOwn(PAGE_FRAMEWORK_RUNTIMES,selected)?PAGE_FRAMEWORK_RUNTIMES[selected]:null;
  const optionalId=pageOptionalLibraryId(selected);
  const optional=optionalId?BUILTIN_RUNTIME_CATALOG.libraries[optionalId]:null;
  invariant(framework?frameworkSource?.id===framework.id&&frameworkSource?.version===framework.version&&
    frameworkSource.sha256===framework.sha256&&typeof frameworkSource.code==='string':frameworkSource===undefined,
    'E_PAGE_FRAMEWORK_IDENTITY','Page framework identity mismatch');
  if(framework)invariant(await sha256Utf8(frameworkSource.code)===framework.sha256&&
    new TextEncoder().encode(frameworkSource.code).length===framework.bytes,
    'E_DEPENDENCY_HASH','Page framework hash mismatch');
  invariant(optional?optionalSource?.id===optional.id&&optionalSource.version===optional.version&&
    optionalSource.abi===BUILTIN_ABI&&optionalSource.catalogSha256===
      (builtinSource?.catalogSha256??optionalSource.catalogSha256)&&
    /^[a-f0-9]{64}$/.test(optionalSource.sha256)&&typeof optionalSource.code==='string'
    :optionalSource===undefined,'E_BUILTIN_VERSION_UNAVAILABLE',
    'Package identity mismatch');
  if(optional)invariant(await sha256Utf8(optionalSource.code)===optionalSource.sha256&&
    new TextEncoder().encode(optionalSource.code).length===optionalSource.bytes,
    'E_DEPENDENCY_HASH','Package hash mismatch');
  if(jquery)invariant(typeof jqueryCode==='string' &&
    await sha256Utf8(jqueryCode)===JQUERY_371.sha256,
    'E_DEPENDENCY_HASH','内置 jQuery 资源缺失或完整性不符');
  const sources = [];
  if(builtinSource!==undefined) {
    invariant(builtinSource?.abi===BUILTIN_ABI && typeof builtinSource.code==='string' &&
      /^[a-f0-9]{64}$/.test(builtinSource.sha256) &&
      await sha256Utf8(builtinSource.code)===builtinSource.sha256,
      'E_BUILTIN_HASH','预装库不是经过校验的固定资源');
    sources.push(builtinSource.code);
    // Even if a native world were to lose its globals, fail before any
    // approved @require or user source is executed.
  }

  if(jquery){
    // One compilation unit: built-in readiness, jQuery and user JS stop
    // synchronously on the first failure; never use another execution world.
    sources.push("if(typeof globalThis.jQuery!=='undefined'||typeof globalThis.$!=='undefined')throw new Error('E_BUILTIN_COLLISION')");
    sources.push(jqueryCode);
    sources.push("if(globalThis.jQuery?.fn?.jquery!=='3.7.1')throw new Error('E_DEPENDENCY_NOT_READY')");
  }
  if(optional){
    // Same admitted USER_SCRIPT world; never overwrite preexisting globals.
    const globalName=optional.id==='jsCookie'?'Cookies':optional.id==='cryptoJs'?'CryptoJS':optional.id==='fileSaver'?'FileSaver':'queryString';
    sources.push('if(Object.hasOwn(globalThis,'+JSON.stringify(globalName)+'))throw Error("E_BUILTIN_COLLISION")');
    sources.push(optionalSource.code);
    sources.push(optional.id==='jsCookie'
      ?"if(typeof globalThis.Cookies?.get!=='function'||typeof globalThis.Cookies?.set!=='function')throw Error('E_DEPENDENCY_NOT_READY')"
      :optional.id==='cryptoJs'
        ?"if(typeof globalThis.CryptoJS?.SHA256!=='function'||typeof globalThis.CryptoJS?.HmacSHA256!=='function')throw Error('E_DEPENDENCY_NOT_READY')"
        :optional.id==='fileSaver'
          ?"if(typeof globalThis.FileSaver?.saveAs!=='function')throw Error('E_DEPENDENCY_NOT_READY')"
          :"if(typeof globalThis.queryString?.parse!=='function'||typeof globalThis.queryString?.stringify!=='function')throw Error('E_DEPENDENCY_NOT_READY')");
  }
  if(framework){
    sources.push(frameworkSource.code);
    const expected=JSON.stringify(framework.version),api='globalThis.'+framework.global;
    sources.push('if('+api+'?.version!=='+expected+')throw Error("E_PAGE_FRAMEWORK_NOT_READY")');
  }
  for (let order = 0; order < entries.length; order++) {
    const row = entries[order];
    invariant(row?.order === order && typeof row.code === 'string' &&
      /^[a-f0-9]{64}$/.test(row.sha256) && await sha256Utf8(row.code) === row.sha256,
      'E_DEPENDENCY_HASH', '依赖内容与固定 SHA-256 不符');
    sources.push(row.code);
  }
  // A local parameter prevents a dependency's global main() from impersonating
  // an absent user entry. The source's actual function declaration binds here.
  const consumer = pageConsumerSource(sourceUtf8,entryFormat,receiptNonce);
  sources.push(consumer);
  // One compilation unit gives synchronous dependency errors fail-stop behavior.
  // Separate ScriptSource entries do not document that cross-file guarantee.
  // Newlines and semicolons preserve trailing comments and ASI boundaries. No
  // strict directive is added. Receipt2 puts dependencies and classic source
  // in one lexical block; prior runtime approvals require revalidation.
  const code = (builtinSource?sources.shift()+'\n;\n':'')+
    builtinReadinessSource(sources.join('\n;\n'),builtinSource,receiptNonce);
  return Object.freeze({sourceHash:await sha256Utf8(sourceUtf8), entryFormat,
    world:'USER_SCRIPT', js:Object.freeze([{code}]), warnings:admission.warnings,receiptNonce,
    ...(jquery?{packagedJquerySha256:JQUERY_371.sha256}:{}),
    ...(framework?{packagedFrameworkId:framework.id,packagedFrameworkSha256:framework.sha256}:{}),
    ...(optional?{packagedOptionalId:optional.id,packagedOptionalSha256:optionalSource.sha256}:{}),
    ...(builtinSource?{builtinAbi:BUILTIN_ABI,builtinCatalogSha256:builtinSource.catalogSha256,
      builtinBundleSha256:builtinSource.sha256}:{})});
}
