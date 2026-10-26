// Scope-only offline Page package derived from the exactly installed source.
// The original Page Package validator and Installer remain the only authority.
import {canonical,digest,digestUtf8,invariant} from '../../platform/protocol.js';
import {PAGE_INSTALL_FORMAT,validatePageInstallPackage} from './page-install-package.js';
import {SCROLL_CONFIG_PROGRAM_ID,SCROLL_CONFIG_MIN_REVISION,SCROLL_SITE_REVISION_BASE,scrollSiteInstallMatches,scrollProgramUrlMatches} from './scroll-config-contract.js';

export async function scrollSiteRevision(manifestHash,matches){
  const hash=await digest({manifestHash,matches:[...new Set(matches)]});
  return SCROLL_SITE_REVISION_BASE+Number.parseInt(hash.slice(0,12),16)%
    (2147483648-SCROLL_SITE_REVISION_BASE);
}

export async function buildScrollSiteUpgradePackage({installed,candidate,origin,pathScope,revision}){
  invariant(installed?.programId===SCROLL_CONFIG_PROGRAM_ID&&
    candidate?.manifest?.programId===SCROLL_CONFIG_PROGRAM_ID&&
    candidate.manifest.revision>=SCROLL_CONFIG_MIN_REVISION&&
    installed.revision===candidate.manifest.revision&&
    installed.sourceHash===candidate.manifest.sourceHash&&
    installed.manifestHash===candidate.manifestHash&&
    canonical(installed.pageRules)===canonical(candidate.manifest.pageRules),
    'E_PAGE_AUTHORIZATION','站点扩权必须使用原导航的精确已安装版本');
  invariant(installed.enabled===true&&installed.nativeState==='registered'&&
    installed.authorization?.status==='active'&&!installed.error,
    'E_PAGE_AUTHORIZATION','停用、待确认、撤权和异常的安装均不可通过新增网站恢复');
  const proposed=scrollSiteInstallMatches(origin,pathScope),current=installed.pageRules;
  invariant(!scrollProgramUrlMatches(current,origin+pathScope),
    'E_SITE_ALREADY_ALLOWED','当前范围已有授权；请在目标网站直接配置滚动区域');
  const matches=[...new Set([...current.matches,...proposed])];
  const expectedRevision=await scrollSiteRevision(candidate.manifestHash,matches);
  invariant(revision===expectedRevision&&revision!==installed.revision,
    'E_REVISION','网站候选必须使用可信宿主派生的独立修订身份');
  invariant(matches.length<=128,'E_PAGE_MATCH','原生匹配规则数量超限');
  invariant(!current.matches.includes('<all_urls>')&&
    !current.matches.some(p=>/^(https?|\*):\/\/\*\//.test(p)),
    'E_PAGE_SCOPE','不能从全网安装派生自定义网站权限');
  const source=candidate.sourceUtf8;
  invariant(typeof source==='string'&&source.startsWith('// ==UserScript==\n')&&
    source.includes('__openDeskScrollConfig'),
    'E_PAGE_SOURCE','此安装不支持可信网站配置，请先审阅升级');
  const end=source.indexOf('// ==/UserScript==');
  invariant(end>0&&end<8192,'E_PAGE_SOURCE','固定版本缺少 UserScript 元数据');
  const header=source.slice(0,end);
  const existing=[...header.matchAll(/^\/\/ @match ([^\r\n]+)$/gm)].map(m=>m[1]);
  invariant(canonical(existing)===canonical(current.matches),'E_PAGE_METADATA_RULES',
    'UserScript 元数据与已安装范围不一致');
  invariant(!/^\/\/ @(?:include|exclude|exclude-match|require|grant)\b/m.test(header)&&
    current.excludeMatches.length===0&&current.allFrames===false&&
    current.world==='USER_SCRIPT'&&current.runAt==='document_idle',
    'E_PAGE_METADATA_RULES','此版本不允许生成新的安装范围');
  const versionMatch=/^\/\/ @version ([^\r\n]+)$/m.exec(header);
  invariant(versionMatch,'E_PAGE_SOURCE','缺少固定版本');
  const baseVersion=versionMatch[1].split('+')[0];
  invariant(/^\d+\.\d+\.\d+$/.test(baseVersion),'E_PAGE_SOURCE','无法识别正式版本');
  const nextVersion=baseVersion+'+site.r'+revision;
  const before=existing.map(match=>'// @match '+match).join('\n')+'\n';
  invariant(header.includes(before)&&header.indexOf(before)===header.lastIndexOf(before),
    'E_PAGE_METADATA_RULES','原始 @match 元数据不连续或有重复');
  const nextSource=source.replace(before,matches.map(match=>'// @match '+match).join('\n')+'\n')
    .replace('// @version '+versionMatch[1]+'\n','// @version '+nextVersion+'\n');
  const payload={format:PAGE_INSTALL_FORMAT,programId:SCROLL_CONFIG_PROGRAM_ID,
    version:nextVersion,title:installed.title||'AI 对话滚动导航',
    revision,entryFormat:candidate.manifest.entryFormat,sourceUtf8:nextSource,
    sourceHash:await digestUtf8(nextSource),pageRules:{...current,matches}};
  return validatePageInstallPackage({...payload,packageHash:await digest(payload)});
}
