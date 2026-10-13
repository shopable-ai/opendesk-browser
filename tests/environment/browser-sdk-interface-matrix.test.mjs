import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
import {inspectBrowserSdkInterfaceMatrix,checkBrowserSdkInterfaceMatrix} from '../../scripts/check-browser-sdk-interface-matrix.mjs';

const source=JSON.parse(await readFile(new URL('../../docs/api/browser-sdk-interface-matrix.json',import.meta.url),'utf8'));
test('pinned Chromium matrix and registered Browser SDK agree, without granting native APIs',async()=>{
 assert.deepEqual(inspectBrowserSdkInterfaceMatrix(source),[]);
 const result=await checkBrowserSdkInterfaceMatrix();
 assert.equal(result.approved,source.approvedOperations.length);
 assert.equal(result.callableRegistry,Object.keys(BROWSER_OPERATIONS).length);
 assert.equal(result.nativeChrome,'NOT_TESTED');
 assert.equal(result.upstreamSourceBytesReparsed,false);
});
test('unapproved runtime operation is never accepted as a harmless catalog difference',()=>{
 const forged=[...Object.keys(BROWSER_OPERATIONS),'browser.tabs.queryAll'];
 assert(inspectBrowserSdkInterfaceMatrix(source,forged).some(row=>row.includes('Runtime Browser SDK')));
});
test('trusted Cookie host operations cannot be promoted into a sandbox API by metadata',()=>{
 const modified=structuredClone(source),operation=modified.approvedOperations.find(x=>x.id==='browser.cookies.getAll');
 operation.visibility='APPROVED_TOOL_REGISTERED';
 assert(inspectBrowserSdkInterfaceMatrix(modified).length>0);
});
test('Chromium source hash and reciprocal native mappings are mandatory',()=>{
 const modified=structuredClone(source);modified.sourceFiles[0].gitBlobSha='0'.repeat(40);
 const errors=inspectBrowserSdkInterfaceMatrix(modified);
 assert(errors.some(row=>row.includes('Unpinned native source')));
 const extra=structuredClone(source);
 const update=extra.nativeInterfaces.find(x=>x.nativeApi==='chrome.tabs.update');
 update.approvedOperationIds.push('browser.tabs.queryAll');
 assert(inspectBrowserSdkInterfaceMatrix(extra).some(row=>row.includes('Native mapping admits')));
});
