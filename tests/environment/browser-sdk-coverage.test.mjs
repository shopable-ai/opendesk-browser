import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {inspectBrowserSdkLedger,checkBrowserSdk} from '../../scripts/check-browser-sdk-coverage.mjs';
import {BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
const ledger=JSON.parse(await readFile(new URL('../../docs/framework/workstreams/browser-sdk-acceptance.json',import.meta.url),'utf8'));
test('Browser SDK current ledger derives its denominator from the implemented registry',()=>{
 assert.equal(ledger.operations.length,Object.keys(BROWSER_OPERATIONS).length);
 assert.deepEqual(inspectBrowserSdkLedger(ledger),[]);
});
test('a status cannot be changed to PASS without real evidence',()=>{
 const bad=structuredClone(ledger);
 bad.operations[0].positiveTest.status='PASS';
 bad.operations[1].sdkEntry=null;
 bad.operations.push({...bad.operations[2],api:'browser.speech.speak'});
 assert(inspectBrowserSdkLedger(bad).length>=3);
});
test('a phase cannot be accepted with untested candidate checks',()=>{
 const bad=structuredClone(ledger);bad.phases.R4.status='PASS';
 assert(inspectBrowserSdkLedger(bad).some(x=>x.includes('premature phase')));
});
test('current source and human readable matrix can be compared',async()=>{
 assert.equal((await checkBrowserSdk()).operations,Object.keys(BROWSER_OPERATIONS).length);
});

test('a renamed operation cannot pass with a legacy Schema source',()=>{
 const changed=structuredClone(ledger);
 changed.operations.find(x=>x.api==='browser.tabs.create').inputSchema='src/framework/sdk/browser-contract.js#browser.tabs.open';
 assert(inspectBrowserSdkLedger(changed).some(x=>x.includes('browser.tabs.create: stale inputSchema source')));
});

// Historical SHA metadata alone must not make a missing or tampered report PASS.
test('R10.7.1 missing or tampered historical PASS evidence fails closed',async t=>{
 const root=await mkdtemp(join(tmpdir(),'opendesk-sdk-evidence-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const location=join(root,'docs/framework/workstreams');
 await mkdir(location,{recursive:true});
 const candidate=structuredClone(ledger);
 const receipt=candidate.operations[0].positiveTest;
 receipt.status='PASS';
 const evidencePath='docs/framework/workstreams/evidence/missing-original.json';
 receipt.evidence=[{path:evidencePath,sha256:'0'.repeat(64),candidateSha:'fixture-candidate',
  caseId:'R10.7.1-missing',command:'node --test fixture',environment:'test-only fixture'}];
 await writeFile(join(location,'browser-sdk-acceptance.json'),JSON.stringify(candidate));
 await writeFile(join(location,'browser-sdk-status.md'),
  await readFile(new URL('../../docs/framework/workstreams/browser-sdk-status.md',import.meta.url)));
 await assert.rejects(checkBrowserSdk({root}),/PASS evidence missing: docs\/framework\/workstreams\/evidence\/missing-original\.json/);
 const file=join(root,evidencePath);await mkdir(dirname(file),{recursive:true});
 await writeFile(file,'{"record":"tampered"}\n');
 await assert.rejects(checkBrowserSdk({root}),/PASS evidence hash mismatch: docs\/framework\/workstreams\/evidence\/missing-original\.json/);
});
