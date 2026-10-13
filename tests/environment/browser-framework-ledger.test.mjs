import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
test('four-layer browser ledger reconciles current Registry, candidate list, Cookie priority and acceptance',()=>{
 const run=spawnSync(process.execPath,['scripts/check-browser-framework-ledger.mjs','--check'],{
  cwd:process.cwd(),encoding:'utf8',timeout:30000
 });
 assert.equal(run.status,0,run.stderr||run.stdout);
 const result=JSON.parse(run.stdout.trim());
 assert.equal(result.ok,true);assert.equal(result.formal,Object.keys(BROWSER_OPERATIONS).length);
 assert.equal(result.promoted,4);
 assert.equal(result.originalCandidates,114);assert.equal(result.pending,result.originalCandidates-result.promoted);
 assert.equal(result.cookieSdkFormal,0);assert.equal(result.cookieCandidates,10);
 assert.equal(result.formalNativePass,0);
});
test('supplemental reference domains stay audit-only and Cookie is first priority',()=>{
 const data=JSON.parse(readFileSync('docs/framework/workstreams/browser-framework-four-layer-ledger.json','utf8'));
 assert.equal(data.firstPriority.name,'Cookies');
 assert(data.supplementalAudits.length>=20);
 assert(data.supplementalAudits.every(x=>x.layer3.status==='AUDIT_ONLY_NOT_REGISTERED'));
 assert.equal(new Set(data.candidateCatalog.map(x=>x.id)).size,114);
 assert.equal(data.candidateCatalog.filter(x=>x.id.startsWith('browser.cookies.')).length,10);
});
