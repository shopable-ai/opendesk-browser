// Pure manifest/compiler layer. Not an authority, executor, database or registration side effect.
// The trusted broker must first produce an Available + installed grant and then call
// chrome.userScripts.register/unregister with the returned descriptor.
import {canonical,digest} from '../../platform/protocol.js';
import {JQUERY_371} from './packaged-dependencies.js';
export {JQUERY_371} from './packaged-dependencies.js';
import {compileLockedPageSource} from './execution-source.js';
import {hashPageProgramManifest,validatePageProgramManifest,verifyPageProgramSource,
  validatePageProgramRules,PAGE_PROGRAM_RUNTIME} from './page-program-contract.js';
const HEX64 = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const RUN_AT = new Set(['document_start', 'document_end', 'document_idle']);
const MATCH = /^(?:https?|\*):\/\/(?:\*|(?:\*\.)?[A-Za-z0-9.-]+)\/[^\s]*$/;
const reject = code => { const error = new Error(code); error.code = code; throw error; };
const ensure = (ok, code) => { if (!ok) reject(code); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function sha256Utf8(source) {
  ensure(typeof source === 'string' && typeof crypto?.subtle?.digest === 'function', 'E_HASH_UNAVAILABLE');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function validateRules(rules) {
  ensure(rules && typeof rules === 'object' && !Array.isArray(rules), 'E_PAGE_RULES');
  const {matches, excludeMatches = [], runAt = 'document_idle', allFrames = false, world = 'USER_SCRIPT'} = rules;
  ensure(Array.isArray(matches) && matches.length > 0 && matches.length <= 32 &&
    matches.every(value => typeof value === 'string' && MATCH.test(value)), 'E_PAGE_MATCH');
  ensure(Array.isArray(excludeMatches) && excludeMatches.length <= 32 &&
    excludeMatches.every(value => typeof value === 'string' && MATCH.test(value)), 'E_PAGE_MATCH');
  ensure(RUN_AT.has(runAt) && typeof allFrames === 'boolean', 'E_PAGE_RULES');
  // MAIN is deliberately disabled in this first slice; no unsupported worldId in MAIN.
  ensure(world === 'USER_SCRIPT', 'E_WORLD_NOT_APPROVED');
  return {matches: [...matches], excludeMatches: [...excludeMatches], runAt, allFrames, world};
}

function validateDependencyLock(lock) {
  ensure(Array.isArray(lock) && lock.length <= 1, 'E_DEPENDENCY_LOCK');
  for (const row of lock) {
    ensure(row && row.id === 'jquery' && row.version === '3.7.1' && row.world === 'USER_SCRIPT' &&
      Number.isSafeInteger(row.order) && row.order === 0 && HEX64.test(row.sha256) &&
      row.sha256 === JQUERY_371.sha256, 'E_DEPENDENCY_LOCK');
  }
  return lock.map(row => ({id:row.id,version:row.version,sha256:row.sha256,order:row.order,world:row.world}));
}

// No CDN, npm resolution or fetching occurs in this compiler. Bytes are provided by
// an independently verified extension-bundled loader; they never run in SW/Worker.

function wrapper(source, identity, withJquery) {
  const instanceKey = JSON.stringify(`${identity.scriptId}:${identity.revision}:${identity.manifestHash}`);
  // The once-token lives only in this script's USER_SCRIPT world and document.
  // Async main's return is not a durable Controller result; listeners may remain.
  return `(()=>{\n'use strict';\nconst __key=${instanceKey};\nconst __symbol=Symbol.for('opendesk.page-program.once.v1');\nconst __seen=globalThis[__symbol]||(globalThis[__symbol]=new Set());\nif(__seen.has(__key))return;\n__seen.add(__key);\nPromise.resolve().then(async()=>{\n${withJquery ? "if(!globalThis.jQuery||globalThis.jQuery.fn?.jquery!=='3.7.1')throw new Error('E_DEPENDENCY_NOT_READY');" : ''}\n${source}\nif(typeof main!=='function')throw new Error('E_MAIN_REQUIRED');\nreturn await main();\n}).catch(error=>console.error('[OpenDesk Page Program]',error));\n})();`;
}

// Caller contract: `authority.assertAvailable` MUST be the existing trusted broker
// validation, not a function surfaced to page scripts/untrusted UI. A plain
// candidate.state string is never sufficient authorization.
export async function prepareLegacyPageProgramRegistration({candidate, sourceUtf8, authority, dependencySources = {}}) {
  ensure(candidate && typeof candidate === 'object' && typeof authority?.assertAvailable === 'function', 'E_AUTHORITY_REQUIRED');
  const {candidateId, manifestHash, revision, manifest} = candidate;
  ensure(ID.test(candidateId) && HEX64.test(manifestHash) && revision && ID.test(revision.scriptId) &&
    Number.isSafeInteger(revision.revision) && revision.revision > 0 && HEX64.test(revision.contentHash), 'E_REVISION');
  ensure(manifest?.entryFormat === 'async-main-v1' && typeof sourceUtf8 === 'string' && sourceUtf8.length > 0 &&
    new TextEncoder().encode(sourceUtf8).length <= 128 * 1024, 'E_SOURCE');
  ensure(await sha256Utf8(sourceUtf8) === revision.contentHash, 'E_SOURCE_HASH');
  const rules = validateRules(manifest.pageRules);
  const dependencies = validateDependencyLock(manifest.dependenciesLock || []);
  const proof = await authority.assertAvailable(candidateId);
  ensure(proof?.candidateId === candidateId && proof?.manifestHash === manifestHash &&
    proof?.status === 'Available' && proof?.installationEnabled === true &&
    same(proof.revision, revision) && same(proof.approvedMatches, rules.matches) &&
    (rules.allFrames === false || proof.frameScope === 'all'), 'E_NOT_AVAILABLE');
  ensure(Object.keys(dependencySources).every(key => dependencies.some(row => row.id === key)), 'E_DEPENDENCY_LOCK');
  const sources = [];
  for (const dependency of dependencies) {
    const code = dependencySources[dependency.id];
    ensure(typeof code === 'string' && code.length > 0 && await sha256Utf8(code) === dependency.sha256, 'E_DEPENDENCY_HASH');
    sources.push({code});
  }
  const identity = {candidateId,manifestHash,scriptId:revision.scriptId,revision:revision.revision};
  const ownerHash = await sha256Utf8(JSON.stringify(identity));
  return Object.freeze({
    id:`opendesk-page-${ownerHash.slice(0,48)}`,
    matches:rules.matches, excludeMatches:rules.excludeMatches,
    runAt:rules.runAt, allFrames:rules.allFrames, world:'USER_SCRIPT',
    worldId:`opendesk-page-${ownerHash.slice(0,48)}`,
    js:Object.freeze([...sources, {code:wrapper(sourceUtf8, identity, dependencies.length > 0)}]),
  });
}

// D1 Page asset compiler. The caller supplies trusted loadForExecution() output
// and an authority scoped to this owner namespace. It must separately reconcile
// registration IDs, configure/verify native world isolation and obtain real type-
// specific verification. Producing this descriptor grants no installation state.
// Legacy R3/JQ descriptors use the explicit function above; there is no automatic
// reinterpretation of async-main-v1 or the Controller opendesk.task.v1 contract.
export async function preparePageProgramRegistration({candidate,sourceUtf8,authority,dependencyResolution,jqueryCode} = {}) {
  ensure(candidate && typeof candidate === 'object' && typeof authority?.assertAvailable === 'function','E_AUTHORITY_REQUIRED');
  const snapshot = structuredClone(candidate), resolution = structuredClone(dependencyResolution);
  const {candidateId,namespace,manifestHash} = snapshot;
  ensure(typeof candidateId === 'string' && ID.test(candidateId) && typeof namespace === 'string' && namespace.length > 0 && namespace.length <= 256 &&
    HEX64.test(manifestHash),'E_PAGE_CANDIDATE');
  const manifest = validatePageProgramManifest(snapshot.manifest);
  ensure(await hashPageProgramManifest(manifest) === manifestHash,'E_MANIFEST_HASH');
  await verifyPageProgramSource({manifest,sourceUtf8,dependencyResolution:resolution});
  const proof = await authority.assertAvailable(candidateId);
  ensure(proof?.candidateId === candidateId && proof.namespace === namespace && proof.manifestHash === manifestHash &&
    proof.status === 'Available' && proof.installationEnabled === true &&
    proof.runtimeKind === PAGE_PROGRAM_RUNTIME && proof.entryFormat === manifest.entryFormat &&
    proof.programId === manifest.programId && proof.revision === manifest.revision && proof.sourceHash === manifest.sourceHash &&
    proof.dependencyLockId === manifest.dependencyLockId && proof.dependencyManifestDigest === manifest.dependencyManifestDigest,
    'E_NOT_AVAILABLE');
  const approvedRules = validatePageProgramRules(proof.approvedPageRules);
  ensure(canonical(approvedRules) === canonical(manifest.pageRules),'E_NOT_AVAILABLE');
  const compiled = await compileLockedPageSource({sourceUtf8,entryFormat:manifest.entryFormat,
    entries:resolution.entries,importSourceUrl:manifest.sourceProfile.importSourceUrl,jqueryCode});
  ensure(compiled.sourceHash === manifest.sourceHash && compiled.world === manifest.pageRules.world,'E_SOURCE_HASH');
  const identityHash = await digest({namespace,candidateId,manifestHash});
  const id = 'opendesk-page-d1-' + identityHash.slice(0,48), rules = manifest.pageRules;
  return Object.freeze({id,matches:rules.matches,excludeMatches:rules.excludeMatches,runAt:rules.runAt,
    allFrames:rules.allFrames,world:'USER_SCRIPT',worldId:id,js:compiled.js});
}
