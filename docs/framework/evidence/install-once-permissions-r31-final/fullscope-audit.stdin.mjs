// Independent read-only component check. Run from the repository root:
// node --input-type=module < /workspace/scratch/eceef8694f0a/r31-fullscope-audit.stdin.mjs
// Chrome API observations are component doubles, not real Chrome evidence.
import assert from 'node:assert/strict';
import {preparePageCandidateDraft} from './src/ui/page-candidate-source.js';
import {parseUserScriptDependencies,assessUserScriptExecution} from './src/scripting/user-scripts/dependency-metadata.js';
import {resolvePageProgramRules} from './src/scripting/user-scripts/page-program-rules.js';
import {pageInstallScope,pageInstallScopeDelta,pageInstallAffectedByRemoval,assertPageInstallAuthorization} from './src/scripting/user-scripts/page-install-authorization.js';
import {createChromePermissionConsent,requireChromePermissions} from './src/platform/chrome/permission-gate.js';
const draft=preparePageCandidateDraft({sourceUtf8:'async function main(){return document.title}',entryFormat:'async-main',programId:'audit',revision:1,previewUrl:'https://example.com/'});
const wide=draft.request.pageRules, narrow={...wide,matches:['https://example.com/*']};
assert.deepEqual(wide.matches,['*://*/*']);assert.equal(wide.allFrames,false);
const imported=parseUserScriptDependencies('// ==UserScript==\n// @name audit\n// ==/UserScript==\nvoid 0;');
const assessment=assessUserScriptExecution(imported,{phase:'registration',entryFormat:'classic-userscript'});
assert.equal(assessment.status,'executable');assert.deepEqual(assessment.nativeOptions.matches,['*://*/*']);assert.equal(assessment.nativeOptions.allFrames,false);
const plain=parseUserScriptDependencies('void 0;');
assert.deepEqual(resolvePageProgramRules(plain,assessUserScriptExecution(plain),narrow),narrow);
const delta=pageInstallScopeDelta(pageInstallScope(narrow),pageInstallScope(wide));
assert.equal(delta.requiresConfirmation,true);assert.deepEqual(delta.addedSites,['*://*/*']);
assert.equal(pageInstallScopeDelta(pageInstallScope(wide),pageInstallScope(wide)).requiresConfirmation,false);
const row={pageRules:wide,authorization:{tag:'page-install-authorization-v1',installationId:'12345678-1234-1234-1234-123456789012',generation:1,status:'active',scope:pageInstallScope(narrow),approvedAt:1}};
assert.throws(()=>assertPageInstallAuthorization(row),e=>e.code==='E_PAGE_AUTHORIZATION');
row.authorization.scope=pageInstallScope(wide);assertPageInstallAuthorization(row);
const removed=['https://example.com/*','http://localhost:45678/*','*://*.example.org/*','<all_urls>','https://[::1]:45678/*'];
for(const origin of removed)assert.equal(pageInstallAffectedByRemoval(wide,{origins:[origin]}),true,origin);
assert.equal(pageInstallAffectedByRemoval(wide,{origins:['file:///*']}),false);
let broad=false,requests=[];
const api={permissions:{contains:async({origins})=>origins.every(x=>x==='https://example.com/*'||broad),request:async r=>{requests.push(structuredClone(r));broad=true;return true;}}};
const consent=createChromePermissionConsent({api});
assert.equal((await consent.prepare({origins:wide.matches})).granted,false);
await assert.rejects(()=>requireChromePermissions({api,request:{origins:wide.matches}}),e=>e.code==='E_PERMISSION');assert.equal(requests.length,0);
const pending=consent.confirm({isTrusted:true},{origins:wide.matches});
assert.deepEqual(requests,[{origins:['*://*/*']}]);await pending;
assert.equal((await consent.prepare({origins:wide.matches})).granted,true);
await consent.confirm({isTrusted:true},{origins:wide.matches});
for(let i=0;i<20;i++)await requireChromePermissions({api,request:{origins:wide.matches}});
assert.equal(requests.length,1);
console.log(JSON.stringify({plainDefault:wide.matches,headerWithoutMatch:assessment.nativeOptions,existingNarrowFrozen:true,narrowToWideRequiresConfirmation:delta.requiresConfirmation,wideSameScopeReuses:true,narrowGrantForWideRejected:true,overlappingRevocations:removed,onlyInstallPrompt:requests.length,subsequentRuntimeRequests:0,nativeChromeEvidence:false},null,2));
