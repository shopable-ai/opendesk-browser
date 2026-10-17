// Shared classic declaration identity. Keep the Page package/UI contract
// independent of the privileged manager and its ESM parser.
import {parseUserScriptDependencies} from './dependency-metadata.js';
import {digestUtf8} from '../../platform/protocol.js';
import {inspectPageSource,validatePageSource} from './page-bundle.js';
const ensure=(ok,code,message)=>{if(!ok)throw Object.assign(new Error(message),{code});};
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])) : v);
export function classicDependencyProfile(request) {
  inspectPageSource(request.sourceUtf8);
  const entryFormat=request.entryFormat===undefined?'async-main':request.entryFormat;
  ensure(['classic-userscript','async-main'].includes(entryFormat),'E_ENTRY_FORMAT','页面入口必须明确为 classic-userscript 或 async-main');
  ensure(request.sourceFormat===undefined,'E_SOURCE_FORMAT','经典 Page 合同不能接收原始 ESM');
  const parsed=parseUserScriptDependencies(request.sourceUtf8,{importSourceUrl:request.importSourceUrl});
  const manifest={lockVersion:1,entryFormat,importSourceUrl:parsed.importSourceUrl||null,world:'USER_SCRIPT',
    requires:parsed.requires.map(row=>({order:row.order,raw:row.raw||row.originalUrl||row.url,
      originalUrl:row.originalUrl||row.url,url:row.url,integrity:row.integrity||[]}))};
  return {parsed,manifest,entryFormat};
}
export async function describeDependencyManifest(request) {
  const profile=classicDependencyProfile(request);
  await validatePageSource(request.sourceUtf8);
  return {...profile,manifestDigest:await digestUtf8(canonical(profile.manifest))};
}
