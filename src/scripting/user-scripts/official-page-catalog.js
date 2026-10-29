// Bundled Page release discovery. This is metadata and byte integrity only:
// install, website grants, registration and revocation remain in Page Authority.
import {OFFICIAL_SOURCE_REPOSITORY,loadBundledOfficialResource} from '../../sidebar-tools/official-catalog.js';
import {validatePageInstallPackage,PAGE_INSTALL_INPUT_LIMIT} from './page-install-package.js';

export const OFFICIAL_PAGE_SOURCE_SCHEMA='opendesk.official-pages.sources.v1';
export const OFFICIAL_PAGE_RELEASE_SCHEMA='opendesk.official-pages.releases.v1';
export const OFFICIAL_PAGE_SOURCE_PATH='official-pages/sources.json';
export const OFFICIAL_PAGE_CATALOG_PATH='official-pages/catalog.json';
const scopes=Object.freeze({
  'opendesk.ai-scroll-navigation':Object.freeze({project:'examples/programs/chatgpt-jump-top',
    sites:['https://chatgpt.com/*','https://chat.deepseek.com/*','https://gemini.google.com/*'],policy:'reviewed',packageFile:'ai-scroll-navigation.opendesk-page.json'}),
  'opendesk.ai-reply-mindmap':Object.freeze({project:'projects/chatgpt-mindmap',
    sites:['https://chatgpt.com/*'],policy:'on-demand',packageFile:'ai-reply-mindmap.opendesk-page.json'}),
  'opendesk.ai-send-queue':Object.freeze({project:'examples/sidebar-tools/ai-send-queue',
    sites:['https://chatgpt.com/*'],policy:'reviewed',packageFile:'ai-send-queue.opendesk-page.json'})
});
const error=(code,message)=>Object.assign(new Error(message),{code});
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const bounded=value=>typeof value==='string'&&value.trim().length>0&&value.length<=200;
export function officialPagePackagePath(programId){
  if(!Object.hasOwn(scopes,programId))throw error('E_PAGE_CATALOG','未知官方 Page 身份');
  return 'official-pages/'+programId+'/'+programId+'.opendesk-page.json';
}
function catalog(value,source){
  const schema=source?OFFICIAL_PAGE_SOURCE_SCHEMA:OFFICIAL_PAGE_RELEASE_SCHEMA;
  const name=source?'programs':'apps';
  if(!exact(value,['schema','sourceRepository',name])||value.schema!==schema||
    value.sourceRepository!==OFFICIAL_SOURCE_REPOSITORY||
    !Array.isArray(value[name])||value[name].length!==Object.keys(scopes).length)
    throw error('E_PAGE_CATALOG','官方 Page 目录结构不可信');
  const seen=new Set();
  for(const row of value[name]){
    const scope=scopes[row?.programId];
    const blocked=(source?row?.publication:row?.status)==='blocked';
    const keys=source?['programId','project','packageFile','version','revision','title','description','sites',
      'installationPolicy','publication',...(blocked?['blockedReason']:[])]:
      ['programId','kind','version','revision','title','description','sites','installationPolicy','status',
        ...(blocked?['blockedReason']:['packagePath','bytes','sha256','sourceHash','packageHash'])];
    if(!scope||seen.has(row.programId)||!exact(row,keys)||
      (source&&(row.project!==scope.project||row.packageFile!==scope.packageFile))||
      (!source&&row.kind!=='page-program')||
      row.installationPolicy!==scope.policy||!same(row.sites,scope.sites)||
      !bounded(row.title)||!bounded(row.description)||
      typeof row.version!=='string'||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(row.version)||
      !Number.isSafeInteger(row.revision)||row.revision<1||
      (blocked?(!bounded(row.blockedReason)):
        source?row.publication!=='approved':
          row.status!=='available'||row.packagePath!==officialPagePackagePath(row.programId)||
          !Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>PAGE_INSTALL_INPUT_LIMIT||
          !sha(row.sha256)||!sha(row.sourceHash)||!sha(row.packageHash)))
      throw error('E_PAGE_CATALOG','官方 Page 身份、范围、版本或发行状态不可信');
    seen.add(row.programId);
  }
  return structuredClone(value);
}
export const validateOfficialPageSources=value=>catalog(value,true);
export const validateOfficialPageReleases=value=>catalog(value,false);

const json=bytes=>{
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw error('E_PAGE_CATALOG','官方 Page 目录或安装包 JSON 无效');}
};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
  byte=>byte.toString(16).padStart(2,'0')).join('');
export async function loadOfficialPageCatalog({api=globalThis.chrome,fetcher=globalThis.fetch}={}){
  const bytes=await loadBundledOfficialResource(OFFICIAL_PAGE_CATALOG_PATH,32768,{api,fetcher});
  return validateOfficialPageReleases(json(bytes));
}
export async function loadOfficialPagePackage(release,{api=globalThis.chrome,fetcher=globalThis.fetch}={}){
  const current=await loadOfficialPageCatalog({api,fetcher});
  const actual=current.apps.find(row=>row.programId===release?.programId);
  // Review never trusts the UI object's claims about the bundled release.
  if(!actual||!same(actual,release)||actual.status!=='available')
    throw error('E_PAGE_RELEASE_CHANGED','官方发行候选已变化或尚未开放安装，请刷新审阅');
  const bytes=await loadBundledOfficialResource(actual.packagePath,PAGE_INSTALL_INPUT_LIMIT,{api,fetcher});
  if(bytes.length!==actual.bytes||await hash(bytes)!==actual.sha256)
    throw error('E_PAGE_PACKAGE_INTEGRITY','官方 Page 安装包长度或 SHA-256 不一致');
  const pkg=await validatePageInstallPackage(json(bytes));
  if(pkg.programId!==actual.programId||pkg.version!==actual.version||
    pkg.revision!==actual.revision||pkg.title!==actual.title||
    pkg.sourceHash!==actual.sourceHash||pkg.packageHash!==actual.packageHash||
    !same(pkg.pageRules.matches,actual.sites)||pkg.pageRules.excludeMatches.length!==0||
    pkg.pageRules.world!=='USER_SCRIPT'||pkg.pageRules.allFrames!==false||
    pkg.pageRules.runAt!=='document_idle')
    throw error('E_PAGE_PACKAGE_IDENTITY','官方 Page 安装包身份或网站授权范围不符合发行合同');
  return {pkg,release:actual};
}
