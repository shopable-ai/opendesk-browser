import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectBrowserSdkLedger,checkBrowserSdk} from '../../scripts/check-browser-sdk-coverage.mjs';
const ledger=JSON.parse(await readFile(new URL('../../docs/framework/workstreams/browser-sdk-acceptance.json',import.meta.url),'utf8'));
test('Browser SDK ledger matches 32 original plus three R5 methods',()=>{
 assert.equal(ledger.operations.length,35);
 assert.deepEqual(inspectBrowserSdkLedger(ledger),[]);
});
test('a status cannot be changed to PASS without real evidence',()=>{
 const bad=structuredClone(ledger);
 bad.operations[0].positiveTest.status='PASS';
 bad.operations.find(x=>x.implementation==='PLANNED').sdkEntry='src/framework/sdk/browser.js';
 bad.operations.find(x=>x.implementation==='NOT_EXPOSED').exposure='APPROVED_TOOL';
 assert(inspectBrowserSdkLedger(bad).length>=3);
});
test('a phase cannot be accepted with untested candidate checks',()=>{
 const bad=structuredClone(ledger);bad.phases.R4.status='PASS';
 assert(inspectBrowserSdkLedger(bad).some(x=>x.includes('premature phase')));
});
test('current source and human readable matrix can be compared',async()=>{
 assert.equal((await checkBrowserSdk()).operations,35);
});
