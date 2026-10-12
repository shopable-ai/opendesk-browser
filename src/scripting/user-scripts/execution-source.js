import {invariant,digestUtf8 as sha256Utf8} from '../../platform/protocol.js';
import {parseUserScriptDependencies, assertUserScriptExecutable} from './dependency-metadata.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG,PAGE_OPTIONAL_LIBRARY_IDS} from '../../libs/runtime-contract.js';
import {JQUERY_371} from './packaged-dependencies.js';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../libs/page-frameworks/contract.js';
import {validatePageSource} from './page-bundle.js';

export const PAGE_ENTRY_FORMATS = Object.freeze(['classic-userscript', 'async-main']);
export const PAGE_SOURCE_LIMIT = 128 * 1024;
export const PAGE_WORLD_CSP = "script-src 'self'; object-src 'none'";
export const PAGE_PREVIEW_RECEIPT_FORMAT = 'opendesk.page-preview-receipt.v1';
// Declaration aliases, versions, worlds and output files have one source.
export const pageOptionalLibraryId=name=>Object.hasOwn(PAGE_OPTIONAL_LIBRARY_IDS,name)?PAGE_OPTIONAL_LIBRARY_IDS[name]:null;
// Opening metadata/comments only. Repeated IDs share one immutable resource.
export const PAGE_OPTIONAL_LIBRARY_LIMIT=6;
export const PAGE_COMPILED_SOURCE_LIMIT=512*1024;
export function pageSelectedPackagedLibraries(sourceUtf8,parsed=parseUserScriptDependencies(sourceUtf8)){
  const header=parsed.directives.filter(row=>row.name==='opendesk-lib').map(row=>row.value);
  const leading=[];
  if(!parsed.hasHeader){
    for(const line of sourceUtf8.replace(/^\uFEFF/,'').split(/\r?\n/)){
      if(/^\s*$/.test(line))continue;
      const directive=/^\s*\/\/\s*@opendesk-lib\s+([^\s]+)\s*$/.exec(line);
      if(directive)leading.push(directive[1]);
      else if(!/^\s*\/\//.test(line))break;
    }
  }
  const ids=parsed.hasHeader?header:leading;
  invariant(ids.length<=PAGE_OPTIONAL_LIBRARY_LIMIT&&
    ids.every(id=>['jquery','react','vue',...Object.keys(PAGE_OPTIONAL_LIBRARY_IDS)].includes(id)),
    'E_BUILTIN_DECLARATION','预装库声明未知或超过六条');
  invariant(!ids.length||!parsed.requires.length,'E_BUILTIN_CONFLICT','不能混用 @opendesk-lib 与 @require');
  const unique=[...new Set(ids)];
  invariant(!(unique.includes('react')&&unique.includes('vue')),'E_BUILTIN_CONFLICT','React/Vue 运行时不能在同一 Page 程序同时声明');
  return Object.freeze(unique);
}
// Historical scalar helper: deliberately fails closed on a multiple-selection caller.
export function pageSelectedPackagedLibrary(sourceUtf8,parsed=parseUserScriptDependencies(sourceUtf8)){
  const ids=pageSelectedPackagedLibraries(sourceUtf8,parsed);
  invariant(ids.length<=1,'E_BUILTIN_DECLARATION','请使用多库选择接口');
  return ids[0]??null;
}
export function pageWantsJquery(sourceUtf8,parsed=parseUserScriptDependencies(sourceUtf8)){
  return pageSelectedPackagedLibraries(sourceUtf8,parsed).includes('jquery');
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

export async function compileLockedPageSource({sourceUtf8, entryFormat, entries = [], importSourceUrl,receiptNonce,builtinSource,jqueryCode,frameworkSource,optionalSource,optionalSources,storeOwnerId} = {}) {
  await validatePageSource(sourceUtf8);
  invariant(PAGE_ENTRY_FORMATS.includes(entryFormat), 'E_ENTRY_FORMAT', '请选择经典用户脚本或 async main 入口');
  const parsed = parseUserScriptDependencies(sourceUtf8, {importSourceUrl});
  const admission = assertUserScriptExecutable(parsed, {entryFormat, phase:'preview', dependenciesLocked:true});
  invariant(Array.isArray(entries) && entries.length === parsed.requires.length,
    'E_DEPENDENCY_LOCK', '源码依赖声明与已经批准的锁不同');
  const sourceHash=await sha256Utf8(sourceUtf8);
  const selected=pageSelectedPackagedLibraries(sourceUtf8,parsed),jquery=selected.includes('jquery');
  const frameworkId=selected.find(id=>Object.hasOwn(PAGE_FRAMEWORK_RUNTIMES,id));
  const framework=frameworkId?PAGE_FRAMEWORK_RUNTIMES[frameworkId]:null;
  const ids=selected.map(pageOptionalLibraryId).filter(Boolean);
  invariant(optionalSource===undefined||optionalSources===undefined,'E_BUILTIN_CONFLICT','不可同时提供新旧库入参');
  const assets=optionalSources??(optionalSource===undefined?[]:[optionalSource]);
  invariant(Array.isArray(assets)&&assets.length===ids.length&&assets.every((a,i)=>a?.id===ids[i]),
    'E_BUILTIN_VERSION_UNAVAILABLE','库身份或加载顺序与声明不一致');
  invariant(jquery||jqueryCode===undefined,'E_BUILTIN_CONFLICT','无声明 jQuery 字节');
  invariant(framework?frameworkSource?.id===framework.id&&frameworkSource?.version===framework.version&&
    frameworkSource.sha256===framework.sha256&&typeof frameworkSource.code==='string':frameworkSource===undefined,
    'E_PAGE_FRAMEWORK_IDENTITY','Page framework identity mismatch');
  if(framework)invariant(await sha256Utf8(frameworkSource.code)===framework.sha256&&
    new TextEncoder().encode(frameworkSource.code).length===framework.bytes,'E_DEPENDENCY_HASH');
  for(let i=0;i<assets.length;i++){
    const asset=assets[i],descriptor=BUILTIN_RUNTIME_CATALOG.libraries[ids[i]];
    invariant(asset.version===descriptor.version&&asset.abi===BUILTIN_ABI&&
      asset.catalogSha256===(builtinSource?.catalogSha256??asset.catalogSha256)&&
      /^[a-f0-9]{64}$/.test(asset.sha256)&&typeof asset.code==='string'&&
      Number.isSafeInteger(asset.bytes)&&asset.bytes>0,'E_BUILTIN_VERSION_UNAVAILABLE');
    invariant(await sha256Utf8(asset.code)===asset.sha256&&
      new TextEncoder().encode(asset.code).length===asset.bytes,'E_DEPENDENCY_HASH');
  }
  if(jquery)invariant(typeof jqueryCode==='string'&&await sha256Utf8(jqueryCode)===JQUERY_371.sha256,
    'E_DEPENDENCY_HASH');
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

  // Each fixed bundle executes once, in user-declared order in one isolated world.
  for(const name of selected){
    if(name==='jquery'){
    // One compilation unit: built-in readiness, jQuery and user JS stop
    // synchronously on the first failure; never use another execution world.
    sources.push("if(typeof globalThis.jQuery!=='undefined'||typeof globalThis.$!=='undefined')throw new Error('E_BUILTIN_COLLISION')");
    sources.push(jqueryCode);
    sources.push("if(globalThis.jQuery?.fn?.jquery!=='3.7.1')throw new Error('E_DEPENDENCY_NOT_READY')");
    }else if(name===frameworkId){
    sources.push(frameworkSource.code);
    const expected=JSON.stringify(framework.version),api='globalThis.'+framework.global;
    sources.push('if('+api+'?.version!=='+expected+')throw Error("E_PAGE_FRAMEWORK_NOT_READY")');
    }else{
      const optional=BUILTIN_RUNTIME_CATALOG.libraries[pageOptionalLibraryId(name)];
      const optionalSource=assets[ids.indexOf(optional.id)];
    // Same admitted USER_SCRIPT world; never overwrite preexisting globals.
    const globalName=optional.id==='jsCookie'?'Cookies':optional.id==='cryptoJs'?'CryptoJS':optional.id==='fileSaver'?'FileSaver':optional.id==='queryString'?'queryString':optional.id==='store'?'store':optional.id==='cheerio'?'cheerio':optional.id==='fingerprintjs'?'FingerprintJS':'axios';
    sources.push('if(Object.hasOwn(globalThis,'+JSON.stringify(globalName)+'))throw Error("E_BUILTIN_COLLISION")');
    if(optional.id==='store'){
      invariant(storeOwnerId===undefined||typeof storeOwnerId==='string'&&storeOwnerId.length>0&&storeOwnerId.length<=512,
        'E_BUILTIN_DECLARATION','Invalid fixed store owner identity');
      const ownerHash=await sha256Utf8('opendesk.store.v1:'+(storeOwnerId??'preview:'+sourceHash));
      // Trusted compilation identity only. The stored bundle bytes remain
      // immutable; this scope is not a browser permission boundary.
      sources.push("if(Object.hasOwn(globalThis,'__opendeskStoreOwnerV1'))throw Error('E_BUILTIN_COLLISION')");
      sources.push("Object.defineProperty(globalThis,'__opendeskStoreOwnerV1',{value:"+JSON.stringify(ownerHash)+",configurable:true,writable:false})");
    }
    sources.push(optionalSource.code);
    sources.push(optional.id==='jsCookie'
      ?"if(typeof globalThis.Cookies?.get!=='function'||typeof globalThis.Cookies?.set!=='function')throw Error('E_DEPENDENCY_NOT_READY')"
      :optional.id==='cryptoJs'
        ?"if(typeof globalThis.CryptoJS?.SHA256!=='function'||typeof globalThis.CryptoJS?.HmacSHA256!=='function')throw Error('E_DEPENDENCY_NOT_READY')"
        :optional.id==='fileSaver'
          ?"if(typeof globalThis.FileSaver?.saveAs!=='function')throw Error('E_DEPENDENCY_NOT_READY')"
          :optional.id==='queryString'
            ?"if(typeof globalThis.queryString?.parse!=='function'||typeof globalThis.queryString?.stringify!=='function')throw Error('E_DEPENDENCY_NOT_READY')"
            :optional.id==='store'
              ?"if(typeof globalThis.store?.get!=='function'||typeof globalThis.store?.set!=='function')throw Error('E_DEPENDENCY_NOT_READY')"
              :optional.id==='cheerio'
                ?"if(typeof globalThis.cheerio?.load!=='function')throw Error('E_DEPENDENCY_NOT_READY')"
                :optional.id==='fingerprintjs'
                  ?"if(typeof globalThis.FingerprintJS?.load!=='function'||typeof globalThis.FingerprintJS?.hashComponents!=='function')throw Error('E_DEPENDENCY_NOT_READY')"
                  :"if(typeof globalThis.axios!=='function'||typeof globalThis.axios?.create!=='function'||typeof globalThis.axios?.interceptors?.request?.use!=='function')throw Error('E_DEPENDENCY_NOT_READY')");
    }
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
  // Only newly introduced multi-library combinations use this bounded single
  // compiled text budget. Do not retrofit it onto existing large, already
  // reviewed external ESM/JSON programs with zero or one packaged library.
  invariant(selected.length<=1||new TextEncoder().encode(code).length<=PAGE_COMPILED_SOURCE_LIMIT,
    'E_PAGE_SOURCE_LIMIT','多库编译文本超过 512 KiB；请减少依赖');
  return Object.freeze({sourceHash, entryFormat,
    world:'USER_SCRIPT', js:Object.freeze([{code}]), warnings:admission.warnings,receiptNonce,
    ...(jquery?{packagedJquerySha256:JQUERY_371.sha256}:{}),
    ...(framework?{packagedFrameworkId:framework.id,packagedFrameworkSha256:framework.sha256}:{}),
    ...(assets.length?{packagedOptionals:Object.freeze(assets.map(a=>Object.freeze({id:a.id,sha256:a.sha256})))}:{}),
    ...(assets.length===1?{packagedOptionalId:assets[0].id,packagedOptionalSha256:assets[0].sha256}:{}),
    ...(builtinSource?{builtinAbi:BUILTIN_ABI,builtinCatalogSha256:builtinSource.catalogSha256,
      builtinBundleSha256:builtinSource.sha256}:{})});
}
