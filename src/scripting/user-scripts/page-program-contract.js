import {canonical,digest,digestUtf8,invariant} from '../../platform/protocol.js';
import {parseUserScriptDependencies,assertUserScriptExecutable} from './dependency-metadata.js';
import {describeDependencyManifest} from './dependency-manager.js';
import {validatePageProgramRules,resolvePageProgramRules} from './page-program-rules.js';
export {validatePageProgramRules} from './page-program-rules.js';

// A Page asset is distinct from opendesk.task.v1 (Controller). This is a source
// contract, not a database migration, verification receipt or installation grant.
export const PAGE_PROGRAM_FORMAT = 'opendesk.page-program.v1';
export const PAGE_PROGRAM_RUNTIME = 'page-userscript';
const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const LOCK_ID = /^dep-lock-[a-f0-9]{64}$/;
function object(value,allowed) {
  invariant(value && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype,null].includes(Object.getPrototypeOf(value)) &&
    Object.keys(value).every(key => allowed.includes(key)) && allowed.every(key => Object.hasOwn(value,key)),
    'E_PAGE_CONTRACT','页面程序合同字段不完整或含未知字段');
}
function frozen(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}
export function validatePageProgramManifest(value) {
  object(value,['format','runtimeKind','programId','revision','sourceHash','entryFormat','sourceProfile',
    'dependencyLockId','dependencyManifestDigest','pageRules']);
  invariant(value.format === PAGE_PROGRAM_FORMAT && value.runtimeKind === PAGE_PROGRAM_RUNTIME,
    'E_PAGE_KIND','需要明确的 Page Program v1；不能把 Controller Task 当成页面脚本');
  invariant(typeof value.programId === 'string' && ID.test(value.programId) &&
    Number.isSafeInteger(value.revision) && value.revision > 0 && typeof value.sourceHash === 'string' && SHA256.test(value.sourceHash),
    'E_REVISION','页面程序必须引用固定的程序 ID、版本和源码 SHA-256');
  invariant(['classic-userscript','async-main'].includes(value.entryFormat),'E_ENTRY_FORMAT','页面入口必须明确为 classic-userscript 或 async-main');
  object(value.sourceProfile,['metadataProfile','importSourceUrl']);
  // This persisted value identifies the dependency/import parser version, not
  // an authorization model. Native JS does not need a UserScript header.
  invariant(value.sourceProfile.metadataProfile === 'opendesk-d1','E_PAGE_PROFILE','不支持的源码解析配置');
  const identity = parseUserScriptDependencies('',{importSourceUrl:value.sourceProfile.importSourceUrl});
  invariant(!identity.diagnostics.length && identity.importSourceUrl === value.sourceProfile.importSourceUrl,
    'E_IMPORT_SOURCE','来源身份须为真实、规范化的脚本导入 URL 或 null');
  invariant((value.dependencyLockId === null || LOCK_ID.test(value.dependencyLockId)) && SHA256.test(value.dependencyManifestDigest),
    'E_DEPENDENCY_LOCK','页面程序必须绑定依赖声明摘要和不可变锁');
  validatePageProgramRules(value.pageRules);
  canonical(value);
  return frozen(structuredClone(value));
}
export async function hashPageProgramManifest(manifest) {
  return digest(validatePageProgramManifest(manifest));
}
function checkResolution(parsed,manifestDigest,resolution) {
  invariant(resolution && resolution.world === 'USER_SCRIPT' && resolution.manifestDigest === manifestDigest &&
    Array.isArray(resolution.entries) && resolution.entries.length === parsed.requires.length,
    'E_DEPENDENCY_LOCK_STALE','依赖加载结果与当前源码声明不一致');
  invariant(parsed.requires.length ? LOCK_ID.test(resolution.lockId) : resolution.lockId === null,
    'E_DEPENDENCY_LOCK','依赖缺少固定锁，或无依赖源码冒用了其他锁');
  for (const [order,row] of resolution.entries.entries()) invariant(row?.order === order &&
    row.url === parsed.requires[order].url && row.world === 'USER_SCRIPT' && SHA256.test(row.sha256),
    'E_DEPENDENCY_LOCK','依赖资产的顺序、来源或执行世界不一致');
}
// dependencyResolution MUST be returned by the trusted dependency manager's
// loadForExecution(), not reconstructed from Sidebar fields or raw asset hashes.
export async function createPageProgramManifest({programId,revision,sourceUtf8,entryFormat,importSourceUrl,
  dependencyResolution,pageRules} = {}) {
  invariant(typeof sourceUtf8 === 'string' && sourceUtf8.trim().length > 0,'E_SOURCE','页面程序源码不能为空');
  const resolution = structuredClone(dependencyResolution);
  const explicitRules = pageRules === undefined ? undefined : structuredClone(pageRules);
  const {parsed,manifestDigest} = await describeDependencyManifest({sourceUtf8,entryFormat,importSourceUrl});
  const admission = assertUserScriptExecutable(parsed,{entryFormat,phase:'preview',dependenciesLocked:true});
  checkResolution(parsed,manifestDigest,resolution);
  const rules = resolvePageProgramRules(parsed,admission,explicitRules);
  return validatePageProgramManifest({format:PAGE_PROGRAM_FORMAT,runtimeKind:PAGE_PROGRAM_RUNTIME,
    programId,revision,sourceHash:await digestUtf8(sourceUtf8),entryFormat,
    sourceProfile:{metadataProfile:parsed.profile,importSourceUrl:parsed.importSourceUrl},
    dependencyLockId:resolution.lockId,dependencyManifestDigest:manifestDigest,pageRules:rules});
}
export async function verifyPageProgramSource({manifest,sourceUtf8,dependencyResolution}) {
  invariant(typeof sourceUtf8 === 'string' && sourceUtf8.trim().length > 0,'E_SOURCE','页面程序源码不能为空');
  const checked = validatePageProgramManifest(manifest), resolution = structuredClone(dependencyResolution);
  invariant(await digestUtf8(sourceUtf8) === checked.sourceHash,'E_SOURCE_HASH','页面源码已偏离冻结版本');
  const {parsed,manifestDigest} = await describeDependencyManifest({sourceUtf8,entryFormat:checked.entryFormat,
    importSourceUrl:checked.sourceProfile.importSourceUrl});
  const admission = assertUserScriptExecutable(parsed,{entryFormat:checked.entryFormat,phase:'preview',dependenciesLocked:true});
  invariant(checked.dependencyManifestDigest === manifestDigest,'E_DEPENDENCY_LOCK_STALE','页面程序依赖声明摘要不符');
  checkResolution(parsed,manifestDigest,resolution);
  invariant(checked.dependencyLockId === resolution.lockId,'E_DEPENDENCY_LOCK_STALE','加载的依赖版本与固定程序不一致');
  resolvePageProgramRules(parsed,admission,checked.pageRules);
  return checked;
}
