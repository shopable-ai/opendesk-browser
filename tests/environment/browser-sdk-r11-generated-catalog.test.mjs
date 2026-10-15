import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
import {deriveBrowserBindingCatalog,syncBrowserBindings} from '../../scripts/generate-browser-bindings.mjs';

const matrix=JSON.parse(await readFile(new URL('../../docs/api/browser-sdk-interface-matrix.json',import.meta.url),'utf8'));
const generated=JSON.parse(await readFile(new URL('../../docs/api/browser-sdk-binding-catalog.generated.json',import.meta.url),'utf8'));
const err=pattern=>error=>pattern.test(String(error?.message||error));

test('R11 all approved Chrome Binding descriptors are deterministic and derived, never permission grants',async()=>{
  const derived=deriveBrowserBindingCatalog(matrix);
  assert.deepEqual(generated,derived);
  assert.deepEqual(generated.counts,{approved:72,public:70,hostOnly:2});
  const nativeRows=new Map(matrix.nativeInterfaces.map(x=>[x.nativeApi,x]));
  let mapped=0;
  for(const binding of generated.bindings){
    assert.equal(binding.nativeSignatures.length,binding.nativeApis.length);
    for(const call of binding.nativeSignatures){
      const source=nativeRows.get(call.nativeApi);
      assert(source,'The Binding cannot fabricate a Chrome native method');
      assert.equal(call.kind,source.kind);
      assert.equal(call.signature,source.signature);
      assert.deepEqual(call.parameters,source.parameters??[]);
      assert.equal(call.returnType,source.returnType??null);
      mapped++;
    }
  }
  assert.equal(mapped,90,'Only currently approved native relationships are counted');
  const publicOps=generated.bindings.filter(x=>x.visibility==='APPROVED_TOOL_REGISTERED');
  assert.deepEqual(publicOps.map(x=>x.operation).sort(),Object.keys(BROWSER_OPERATIONS).sort());
  for(const desc of publicOps){
    const runtime=BROWSER_OPERATIONS[desc.operation];
    assert.deepEqual(desc.toolCapabilities,runtime.requiredCapabilities);
    assert.deepEqual(desc.chromePermissions,runtime.requiredChromePermissions);
    assert.equal(desc.maxRequestBytes,runtime.maxRequestBytes);
    assert.equal(desc.maxResponseBytes,runtime.maxResponseBytes);
    assert.equal(desc.userGesture,runtime.requiresUserGesture);
    assert.notEqual(desc.mode,'DENIED');
  }
  assert.deepEqual(generated.bindings.filter(x=>x.mode==='DENIED').map(x=>x.operation).sort(),[
    'browser.history.searchTrusted','browser.permissions.requestForTool'
  ]);
  const report=await syncBrowserBindings({check:true});
  assert.equal(report.ok,true);
  assert.equal(report.nativeChrome,'NOT_TESTED');
});

test('R11 generator rejects privilege drift, invented public Binding and unsafe Host-only exposure',()=>{
  const forged=structuredClone(matrix);
  forged.approvedOperations.find(x=>x.id==='browser.bookmarks.createOwned')
    .toolCapabilities=['browser.bookmarks.full'];
  assert.throws(()=>deriveBrowserBindingCatalog(forged),err(/security contract drift/));
  const opened=structuredClone(matrix);
  opened.approvedOperations.find(x=>x.id==='browser.history.searchTrusted').mappingKind='SCOPED';
  assert.throws(()=>deriveBrowserBindingCatalog(opened),err(/Trusted-only operation is not DENIED/));
  const unknown=structuredClone(matrix);
  unknown.approvedOperations.push({...unknown.approvedOperations.find(x=>x.id==='browser.tabs.create'),id:'browser.tabs.queryAll'});
  assert.throws(()=>deriveBrowserBindingCatalog(unknown),err(/visibility drift/));
});
