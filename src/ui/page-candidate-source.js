import {parseUserScriptDependencies} from '../scripting/user-scripts/dependency-metadata.js';

// UI-only adapter into E07.1's existing immutable Candidate API. This never
// creates an Available/Installed grant and never calls chrome.userScripts.
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const fail = (code,message) => {throw Object.assign(new Error(message),{code});};

export function preparePageCandidateDraft({sourceUtf8,entryFormat,lockId,importSourceUrl = null,
  programId,revision,previewUrl} = {}) {
  if(typeof sourceUtf8!=='string'||!sourceUtf8.trim())fail('E_SOURCE','请先在当前网页成功试运行非空 JavaScript');
  if(!['classic-userscript','async-main'].includes(entryFormat))fail('E_ENTRY_FORMAT','不支持的页面程序入口');
  if(typeof programId!=='string'||!ID.test(programId)||
     !Number.isSafeInteger(revision)||revision<1)fail('E_REVISION','请填写有效的脚本 ID 和正整数版本');
  let url;
  try{url=new URL(previewUrl);}catch{fail('E_PAGE_MATCH','需要有效的当前网页地址');}
  if(!['https:','http:'].includes(url.protocol)||!url.hostname||
     !/^[a-z0-9.-]+$/i.test(url.hostname))fail('E_PAGE_MATCH','仅支持 HTTP(S) 主网站作为默认匹配范围');
  const parsed=parseUserScriptDependencies(sourceUtf8,{importSourceUrl});
  // Existing userscript metadata remains authoritative and is not rewritten.
  // For ordinary JavaScript, make a visible, deliberately narrow origin rule.
  const generatedMatch=!parsed.hasHeader;
  const match=url.protocol+'//'+url.hostname+'/*';
  const source=generatedMatch
    ? ['// ==UserScript==','// @match '+match,'// @run-at document-idle',
      '// @noframes','// ==/UserScript==','',sourceUtf8].join('\n')
    : sourceUtf8;
  if(new TextEncoder().encode(source).byteLength>128*1024)fail('E_SOURCE','冻结后的页面源码不能超过 128 KiB');
  return Object.freeze({
    request:Object.freeze({programId,revision,sourceUtf8:source,entryFormat,
      importSourceUrl,lockId:lockId??null}),
    generatedMatch,match:generatedMatch?match:null,
    sourceChanged:generatedMatch
  });
}
