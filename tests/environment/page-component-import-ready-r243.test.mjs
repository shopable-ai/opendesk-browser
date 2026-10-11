import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateProgramDraft} from '../../src/ui/program-source.js';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const fixtures=[
  {framework:'react',entry:'src/App.jsx',bytes:20085,
    draftSha:'5bbe94e8623770b68e25d223bf7e40da1066654502f6eda2428eb5cb0487b656',
    sourceHash:'97ff050d29977932156b130a01f2149799a2c821a65a25778c2f269591e3c557'},
  {framework:'vue',entry:'src/App.vue',bytes:20416,
    draftSha:'fea91e9418d7d503c6b070e404c82c18f87bb209f88382d9fe55ed7deef23240',
    sourceHash:'747838ef6225583e6128f906ec2491f0ce141b7f8f50f3d01e2bcf7877f8f0c0'}
];
for(const fixture of fixtures)test('R24.3 import-ready '+fixture.framework+
  ' matches the real current official source, compiler and pinned Page runtime',async()=>{
  const bytes=await readFile('examples/import-ready/page-ui-'+fixture.framework+'.opendesk-draft.json');
  assert.equal(bytes.length,fixture.bytes);
  assert.equal(sha(bytes),fixture.draftSha);
  const draft=await validateProgramDraft(JSON.parse(bytes.toString('utf8')));
  assert.equal(draft.runtimeKind,'page-userscript');
  assert.equal(draft.project.entryMode,'component');
  assert.equal(draft.project.entry,fixture.entry);
  assert.equal(draft.build.mode,'production');
  assert.equal(draft.build.sourceHash,fixture.sourceHash);
  assert.equal(draft.build.sourceHash,sha(draft.sourceUtf8));
  assert.deepEqual(draft.authoring.files.map(f=>f.path),[fixture.entry]);
  assert.match(draft.sourceUtf8,new RegExp('// @opendesk-lib '+fixture.framework));
  const built=await buildProgramProjectInMemory('examples/programs/page-ui-'+fixture.framework,{mode:'production'});
  assert.equal(built.sourceHash,draft.build.sourceHash,
    'A stale import-ready JSON cannot be treated as the current source');
  assert.equal(built.sourceUtf8,draft.sourceUtf8);
  assert.ok(built.sourceBytes<100000);
});
