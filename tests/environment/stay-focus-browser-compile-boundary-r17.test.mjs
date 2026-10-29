import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createOfficialToolResources,officialToolInputs}
  from '../../scripts/build-official-tools.mjs';
import {validateOfficialSourceCatalog} from '../../src/sidebar-tools/official-catalog.js';

test('Browser production fingerprint is independent of Focus React/business sources',async()=>{
  const inputs=await officialToolInputs();
  assert.ok(inputs.includes('projects/stay-focus/stay-focus.opendesk-tool.json'));
  const forbidden=/^examples\/sidebar-tools\/stay-focus\/(?:src\/|trusted\/|vite\.config|tool\.config|dist\/)/;
  assert.ok(!inputs.some(path=>forbidden.test(path)),
    'Browser official release must fingerprint the pinned package, not Focus source');
  const builder=await readFile(new URL('../../scripts/build.mjs',import.meta.url),'utf8');
  assert.ok(!builder.includes('buildStayFocusReact'),
    'Browser build must never compile Focus React');
});
test('offline official catalog uses one bounded, reviewed prepacked release',async()=>{
  const source=validateOfficialSourceCatalog(JSON.parse(await readFile(
    new URL('../../official-tools/catalog.json',import.meta.url),'utf8')));
  const focus=source.tools.find(tool=>tool.id==='stay-focus');
  assert.equal(focus?.packageFile,'stay-focus.opendesk-tool.json');
  const resources=await createOfficialToolResources();
  const release=resources.catalog.apps.find(row=>row.toolId==='stay-focus');
  const bytes=resources.resources.get(release.packagePath);
  assert.ok(bytes?.length>0);
  assert.equal(bytes.length,release.bytes);
  assert.match(release.sha256,/^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(bytes.toString()).version,release.version);
  assert.equal(JSON.parse(bytes.toString()).backgroundPolicy.kind,'site-budget.v2',
    'Unmigrated legacy Focus release must remain deliberately pinned');
});
