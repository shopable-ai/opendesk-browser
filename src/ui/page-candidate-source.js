import {parseUserScriptDependencies} from '../scripting/user-scripts/dependency-metadata.js';
import {inspectPageSource} from '../scripting/user-scripts/page-bundle.js';
import {validatePageProgramRules} from '../scripting/user-scripts/page-program-rules.js';
import {digestUtf8} from '../platform/protocol.js';

// Native source is not a UserScript metadata document. Scheduling settings are
// frozen beside the original bytes; only the existing Authority can install it.
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const fail = (code,message) => {throw Object.assign(new Error(message),{code});};

// Check the editor attachment before restoring it. Hash agreement proves only
// that these bytes were saved together, never that the author bytes compiled.
export async function validatePageCandidateAuthoring(saved){
  if(!Object.hasOwn(saved??{},'authoring'))return null;
  const value=saved.authoring,keys=['framework','sourceUtf8','authorSourceHash','sourceHash'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||
    !Object.keys(value).every(key=>keys.includes(key))||!['react','vue'].includes(value.framework)||
    typeof value.sourceUtf8!=='string'||!value.sourceUtf8.trim()||
    new TextEncoder().encode(value.sourceUtf8).byteLength>128*1024||
    !/^[a-f0-9]{64}$/.test(value.authorSourceHash)||!/^[a-f0-9]{64}$/.test(value.sourceHash)||
    saved.manifest?.compilation||saved.manifest?.entryFormat!=='async-main'||typeof saved.sourceUtf8!=='string')
    fail('E_PAGE_AUTHORING','组件作者元数据无效');
  // Snapshot before digest awaits so caller mutations cannot change restoration.
  const authoring={...value},sourceUtf8=saved.sourceUtf8,sourceHash=saved.manifest.sourceHash;
  if(authoring.sourceHash!==sourceHash||sourceHash!==await digestUtf8(sourceUtf8)||
    authoring.authorSourceHash!==await digestUtf8(authoring.sourceUtf8))
    fail('E_SOURCE_HASH','组件作者源码或执行绑定已改变');
  return Object.freeze(authoring);
}

export function preparePageCandidateDraft({sourceUtf8,entryFormat,lockId,importSourceUrl = null,dependencyScope,
  programId,revision,previewUrl,pageRules,sourceFormat,compiledSourceUtf8,compilerVersion,
  componentMode,authoringSourceUtf8} = {}) {
  if(typeof sourceUtf8!=='string'||!sourceUtf8.trim())fail('E_SOURCE','请先在当前网页成功试运行非空 JavaScript');
  if(!['classic-userscript','async-main'].includes(entryFormat))fail('E_ENTRY_FORMAT','不支持的页面程序入口');
  if(typeof programId!=='string'||!ID.test(programId)||
     !Number.isSafeInteger(revision)||revision<1)fail('E_REVISION','请填写有效的脚本 ID 和正整数版本');
  if(dependencyScope!==undefined&&dependencyScope!=='program')fail('E_DEPENDENCY_PROGRAM','依赖审核范围无效');
  let url;
  try{url=new URL(previewUrl);}catch{fail('E_PAGE_MATCH','需要有效的当前网页地址');}
  if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password||
     !/^[a-z0-9.-]+$/i.test(url.hostname))fail('E_PAGE_MATCH','仅支持 HTTP(S) 主网站作为默认匹配范围');
  const parsed=parseUserScriptDependencies(sourceUtf8,{importSourceUrl});
  const generatedMatch=!parsed.hasHeader && pageRules === undefined;
  // Never widen one preview host into an all-site auto-run match.
  const match=`${url.protocol}//${url.hostname}/*`;
  const rules=pageRules !== undefined ? validatePageProgramRules(pageRules) : !parsed.hasHeader
    ? validatePageProgramRules({matches:[match],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'})
    : undefined;
  inspectPageSource(sourceUtf8);
  // Editable JSX/SFC is non-executable metadata. The fixed source above remains
  // the only execution input; this declaration is not a compilation receipt.
  let authoring;
  // Managed/frozen JavaScript previews can copy the executable into this slot.
  // Such a copy is not component authoring and keeps the original JS save path.
  const executableCopy=componentMode==='javascript'&&authoringSourceUtf8===sourceUtf8;
  if((componentMode!==undefined&&componentMode!=='javascript')||
    (authoringSourceUtf8!==undefined&&!executableCopy)){
    if(!['react','vue'].includes(componentMode)||sourceFormat!==undefined||compilerVersion!==undefined||
      entryFormat!=='async-main'||typeof authoringSourceUtf8!=='string'||!authoringSourceUtf8.trim()||
      new TextEncoder().encode(authoringSourceUtf8).byteLength>128*1024)
      fail('E_PAGE_AUTHORING','组件作者源码必须与 React/Vue 类型和固定执行产物一起保存');
    authoring=Object.freeze({framework:componentMode,sourceUtf8:authoringSourceUtf8});
  }
  if(sourceFormat!==undefined){
    if(sourceFormat!=='esm-page'||entryFormat!=='async-main'||compilerVersion!=='7.29.9')
      fail('E_STATIC_ESM_IDENTITY','需要当前 Page 离线编译产物');
    inspectPageSource(compiledSourceUtf8);
  }
  return Object.freeze({
    request:Object.freeze({programId,revision,sourceUtf8:sourceFormat?compiledSourceUtf8:sourceUtf8,entryFormat,
      ...(sourceFormat?{authorSourceUtf8:sourceUtf8,authorLockId:lockId??null,compilerVersion}:{}),
      ...(authoring?{authoring}:{}),
      importSourceUrl,lockId:sourceFormat?null:lockId??null,
      ...(dependencyScope==='program'?{dependencyScope:'program'}:{}),...(rules ? {pageRules:rules} : {})}),
    generatedMatch,match:generatedMatch?match:null,sourceChanged:false,
    summary:parsed.hasHeader
      ? (parsed.matches.length
          ? '兼容导入保留原文件声明与源码；明确的 @match 范围不变；声明不代表已授权。'
          : '兼容导入保留原文件声明与源码；无 @match 的兼容脚本可能使用较广范围，安装前必须审阅；声明不代表已授权。')
      : '源码保持原样；网页运行范围单独保存：'+rules.matches.join('、')+
        '。网页匹配包含不同端口，但不授予跨站网络服务权限；自动执行仍需明确安装授权。'
  });
}
