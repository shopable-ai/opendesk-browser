import {digest,digestUtf8,invariant} from '../../platform/protocol.js';
import {hasUnbuiltESM} from '../../ui/esm-source-detector.js';
import {readPageFrameResources,PAGE_FRAME_DRAFT_LIMIT} from './page-frame-resources.js';
import {validatePageSource} from './page-bundle.js';
import {describeDependencyManifest} from './dependency-manifest.js';
import {assertUserScriptExecutable} from './dependency-metadata.js';
import {resolvePageProgramRules} from './page-program-rules.js';

export const PAGE_INSTALL_FORMAT='opendesk.page-install.v1';
export const PAGE_INSTALL_INPUT_LIMIT=PAGE_FRAME_DRAFT_LIMIT;
const keys=['format','programId','version','title','revision','entryFormat','sourceUtf8','sourceHash','pageRules','packageHash'];
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const semver=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

// This validates data only. Receipts, grants and execution targets cannot be imported.
export async function validatePageInstallPackage(value){
  invariant(value&&typeof value==='object'&&!Array.isArray(value)&&
    [Object.prototype,null].includes(Object.getPrototypeOf(value))&&
    Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k)),
    'E_PAGE_PACKAGE','页面安装包字段不完整或包含未知字段');
  const snapshot=structuredClone(value);
  invariant(new TextEncoder().encode(JSON.stringify(snapshot)).length<=PAGE_INSTALL_INPUT_LIMIT,
    'E_PAGE_PACKAGE','页面安装包超过离线资源预算');
  invariant(snapshot.format===PAGE_INSTALL_FORMAT,'E_PAGE_PACKAGE','需要 Page 离线安装包');
  invariant(typeof snapshot.programId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(snapshot.programId)&&
    Number.isSafeInteger(snapshot.revision)&&snapshot.revision>0,'E_REVISION','需要固定程序 ID 和正整数 Revision');
  invariant(typeof snapshot.version==='string'&&snapshot.version.length<=128&&semver.test(snapshot.version),
    'E_PAGE_PACKAGE','版本必须为语义版本');
  invariant(typeof snapshot.title==='string'&&snapshot.title.trim().length>0&&snapshot.title.length<=100,
    'E_PAGE_PACKAGE','工具名称需要 1–100 个字符');
  invariant(['classic-userscript','async-main'].includes(snapshot.entryFormat),'E_ENTRY_FORMAT');
  invariant(sha(snapshot.sourceHash)&&sha(snapshot.packageHash),'E_PAGE_PACKAGE','缺少固定 SHA-256');
  const {packageHash,...payload}=snapshot;
  invariant(await digest(payload)===packageHash,'E_PAGE_PACKAGE_HASH','安装包 SHA-256 不符');
  await validatePageSource(snapshot.sourceUtf8);
  const frames=await readPageFrameResources(snapshot.sourceUtf8);
  invariant(!hasUnbuiltESM(snapshot.sourceUtf8)&&frames.every(row=>!hasUnbuiltESM(row.code)),
    'E_DEPENDENCY_MODULE','离线源码及子帧必须先闭合 ESM，不能在安装后导入外部模块');
  invariant(await digestUtf8(snapshot.sourceUtf8)===snapshot.sourceHash,'E_SOURCE_HASH','页面源码 SHA-256 不符');
  const {parsed}=await describeDependencyManifest({sourceUtf8:snapshot.sourceUtf8,entryFormat:snapshot.entryFormat,importSourceUrl:null});
  invariant(parsed.requires.length===0,'E_DEPENDENCY_LOCK','离线安装包不接受外部 @require；请先闭合依赖');
  const admission=assertUserScriptExecutable(parsed,{entryFormat:snapshot.entryFormat,phase:'preview',dependenciesLocked:true});
  snapshot.pageRules=resolvePageProgramRules(parsed,admission,snapshot.pageRules);
  invariant(snapshot.pageRules.world==='USER_SCRIPT'&&!snapshot.pageRules.allFrames&&snapshot.pageRules.runAt==='document_idle',
    'E_PAGE_RULES','离线安装仅支持顶层 document_idle / USER_SCRIPT');
  return freeze(snapshot);
}
