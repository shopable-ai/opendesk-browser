// R2.2 acceptance: published comparison must be pure machine-readable JSON,
// and every measured candidate byte/digest must match the files actually built.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'../..');
const comparison=resolve(root,'artifacts/quick-notes-implementation-comparison.json');
const native=resolve(root,'artifacts/sidebar-tools/quick-notes/native-candidate.opendesk-tool.json');
const react=resolve(root,'artifacts/sidebar-tools/quick-notes-react/react-candidate.opendesk-tool.json');
const sha256=value=>createHash('sha256').update(value).digest('hex');

test('R2.2 comparison is pure JSON with exact candidate hashes and identical capabilities',async()=>{
  const bytes=await readFile(comparison,'utf8');
  assert.ok(bytes.trimStart().startsWith('{'),'npm banner or log text must not precede JSON');
  const report=JSON.parse(bytes);
  assert.equal(report.contract,'quick-notes-native-vs-shared-ui.v1');
  assert.deepEqual(report.identities,{native:'quick-notes',react:'quick-notes-react'});
  for(const [kind,file] of [['native',native],['react',react]]){
    const payload=await readFile(file);
    const tool=JSON.parse(payload);
    assert.equal(tool.id,report.identities[kind]);
    assert.equal(tool.version,report.versions[kind]);
    assert.equal(report.generatedToolBytes[kind].package,payload.length);
    assert.equal(report.generatedToolBytes[kind].sha256,sha256(payload));
    assert.equal(report.generatedToolBytes[kind].js,Buffer.byteLength(tool.js));
    assert.equal(report.generatedToolBytes[kind].css,Buffer.byteLength(tool.css));
  }
  const first=JSON.parse(await readFile(native));
  const second=JSON.parse(await readFile(react));
  assert.deepEqual(first.capabilities,second.capabilities);
  assert.ok(report.fixedBrowserResourcesNotFree.react19>100_000);
  assert.ok(report.fixedBrowserResourcesNotFree.sharedUI>0);
  assert.ok(report.fixedBrowserResourcesNotFree.sharedUICSS>0);
  assert.ok(report.countedHandwrittenSources.react.some(x=>x.path==='src/App.jsx'));
  assert.ok(report.unmeasured.includes('Chrome startup P50'));
});
