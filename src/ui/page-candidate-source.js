import {parseUserScriptDependencies} from '../scripting/user-scripts/dependency-metadata.js';
import {validatePageProgramRules} from '../scripting/user-scripts/page-program-rules.js';

// Native source is not a UserScript metadata document. Scheduling settings are
// frozen beside the original bytes; only the existing Authority can install it.
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const fail = (code,message) => {throw Object.assign(new Error(message),{code});};

export function preparePageCandidateDraft({sourceUtf8,entryFormat,lockId,importSourceUrl = null,
  programId,revision,previewUrl,pageRules} = {}) {
  if(typeof sourceUtf8!=='string'||!sourceUtf8.trim())fail('E_SOURCE','请先在当前网页成功试运行非空 JavaScript');
  if(!['classic-userscript','async-main'].includes(entryFormat))fail('E_ENTRY_FORMAT','不支持的页面程序入口');
  if(typeof programId!=='string'||!ID.test(programId)||
     !Number.isSafeInteger(revision)||revision<1)fail('E_REVISION','请填写有效的脚本 ID 和正整数版本');
  let url;
  try{url=new URL(previewUrl);}catch{fail('E_PAGE_MATCH','需要有效的当前网页地址');}
  if(!['https:','http:'].includes(url.protocol)||!url.hostname||
     !/^[a-z0-9.-]+$/i.test(url.hostname))fail('E_PAGE_MATCH','仅支持 HTTP(S) 主网站作为默认匹配范围');
  const parsed=parseUserScriptDependencies(sourceUtf8,{importSourceUrl});
  const generatedMatch=!parsed.hasHeader && pageRules === undefined;
  const match=url.protocol+'//'+url.hostname+'/*';
  const rules=pageRules !== undefined ? validatePageProgramRules(pageRules) : !parsed.hasHeader
    ? validatePageProgramRules({matches:[match],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'})
    : undefined;
  if(new TextEncoder().encode(sourceUtf8).byteLength>128*1024)fail('E_SOURCE','冻结后的页面源码不能超过 128 KiB');
  return Object.freeze({
    request:Object.freeze({programId,revision,sourceUtf8,entryFormat,
      importSourceUrl,lockId:lockId??null,...(rules ? {pageRules:rules} : {})}),
    generatedMatch,match:generatedMatch?match:null,sourceChanged:false,
    summary:parsed.hasHeader
      ? '兼容导入保留原文件声明与源码；声明不代表已授权。'
      : '源码保持原样；网页运行范围单独保存：'+rules.matches.join('、')+
        '。这是 Chrome 网页匹配范围（可能包含多个端口），不是跨站网络服务授权。'
  });
}
