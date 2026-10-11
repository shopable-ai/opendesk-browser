import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateProgramDraft} from '../../src/ui/program-source.js';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const fixtures=[
  {framework:'react',bytes:20575,draftSha:'9c9bfb0a54fd4e4aa835ccc0ae076e073357075ee116fd97ef6c69bd735db912',
    sourceHash:'29186e6f09cc72a2e2671e1dfbc777dbf62c24b0b5c90dd3d013029b383118ba'},
  {framework:'vue',bytes:20267,draftSha:'423dae24742e16446e387a9b8d0e922fb39e3578f98a04b1f3837ce8aed8f873',
    sourceHash:'f83a08b3e2d9952cf5729276b01388b1fca8a5334ea683b5df00ad4e372618f5'}
];
for(const fixture of fixtures)test('R24.3 current '+fixture.framework+' direct JSON matches actual component source',async()=>{
  const base='page-ui-'+fixture.framework+'-direct';
  const bytes=await readFile('examples/import-ready/'+base+'.opendesk-draft.json');
  assert.equal(bytes.length,fixture.bytes);
  assert.equal(sha(bytes),fixture.draftSha);
  const draft=await validateProgramDraft(JSON.parse(bytes.toString('utf8')));
  assert.equal(draft.project.id,'sample.'+base);
  assert.equal(draft.project.entryMode,'component');
  assert.equal(draft.project.entry,'src/main.js');
  assert.deepEqual(draft.authoring.files.map(row=>row.path),['src/main.js']);
  assert.equal(draft.build.sourceHash,fixture.sourceHash);
  assert.equal(sha(draft.sourceUtf8),fixture.sourceHash);
  assert.match(draft.sourceUtf8,new RegExp('// @opendesk-lib '+fixture.framework));
  const compiled=await buildProgramProjectInMemory('examples/programs/'+base,{mode:'production'});
  assert.equal(compiled.sourceHash,draft.build.sourceHash,'Current JSON cannot silently lag project source');
  assert.equal(compiled.sourceUtf8,draft.sourceUtf8);
  assert.ok(compiled.sourceBytes<100000);
});
