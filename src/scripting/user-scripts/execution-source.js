import {invariant,digestUtf8 as sha256Utf8} from '../../platform/protocol.js';
import {parseUserScriptDependencies, assertUserScriptExecutable} from './dependency-metadata.js';
import {BUILTIN_ABI} from '../../runtime/builtin-libraries/catalog.js';

export const PAGE_ENTRY_FORMATS = Object.freeze(['classic-userscript', 'async-main']);
export const PAGE_SOURCE_LIMIT = 128 * 1024;
export const PAGE_WORLD_CSP = "script-src 'self'; object-src 'none'";
export const PAGE_PREVIEW_RECEIPT_FORMAT = 'opendesk.page-preview-receipt.v1';
/** One opt-in Page-only library declaration; never scanned after source code. */
export function pageWantsJquery(sourceUtf8,parsed=parseUserScriptDependencies(sourceUtf8)) {
  const header=parsed.directives.filter(row=>row.name==='opendesk-lib').map(row=>row.value);
  const first=/^(?:\uFEFF)?[ \t]*\/\/[ \t]*@opendesk-lib[ \t]+([^\r\n]+)(?:\r?\n|$)/i.exec(sourceUtf8);
  const values=[...header,...(first?[first[1].trim()]:[])];
  invariant(values.length<=1&&values.every(value=>value==='jquery'),
    'E_BUILTIN_DECLARATION','仅允许一次 // @opendesk-lib jquery 声明');
  invariant(!values.length||parsed.requires.length===0,
    'E_BUILTIN_CONFLICT','内置 jQuery 与 @require 不可混合加载；请只选择一种依赖来源');
  return values.length===1;
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
export async function compileLockedPageSource({sourceUtf8, entryFormat, entries = [], importSourceUrl,receiptNonce,builtinSource} = {}) {
  invariant(typeof sourceUtf8 === 'string' && sourceUtf8.trim().length > 0 &&
    new TextEncoder().encode(sourceUtf8).byteLength <= PAGE_SOURCE_LIMIT,
    'E_SOURCE', '页面脚本源码须为非空文本，且不超过 128 KiB');
  invariant(PAGE_ENTRY_FORMATS.includes(entryFormat), 'E_ENTRY_FORMAT', '请选择经典用户脚本或 async main 入口');
  const parsed = parseUserScriptDependencies(sourceUtf8, {importSourceUrl});
  const admission = assertUserScriptExecutable(parsed, {entryFormat, phase:'preview', dependenciesLocked:true});
  invariant(Array.isArray(entries) && entries.length === parsed.requires.length,
    'E_DEPENDENCY_LOCK', '源码依赖声明与已经批准的锁不同');
  const sources = [];
  if(builtinSource!==undefined) {
    invariant(builtinSource?.abi===BUILTIN_ABI && typeof builtinSource.code==='string' &&
      /^[a-f0-9]{64}$/.test(builtinSource.sha256) &&
      await sha256Utf8(builtinSource.code)===builtinSource.sha256,
      'E_BUILTIN_HASH','预装库不是经过校验的固定资源');
    sources.push(builtinSource.code);
    // Even if a native world were to lose its globals, fail before any
    // approved @require or user source is executed.
    sources.push("if(globalThis.OpenDeskLibs?.abi!=="+JSON.stringify(BUILTIN_ABI)+
      "||globalThis._!==globalThis.OpenDeskLibs.lodash||globalThis.dayjs!==globalThis.OpenDeskLibs.dayjs)throw new Error('E_BUILTIN_NOT_READY')");
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
  // wrapper or injected strict directive is added to classic userscript code.
  const code = sources.join('\n;\n');
  return Object.freeze({sourceHash:await sha256Utf8(sourceUtf8), entryFormat,
    world:'USER_SCRIPT', js:Object.freeze([{code}]), warnings:admission.warnings,receiptNonce,
    ...(builtinSource?{builtinAbi:BUILTIN_ABI,builtinCatalogSha256:builtinSource.catalogSha256,
      builtinBundleSha256:builtinSource.sha256}:{})});
}
