import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateProgramDraft} from '../../src/ui/program-source.js';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const fixtures=[
  {framework:'react',bytes:26881,draftSha:'7e31482c6bc387fa9e17ab4a55adffe656965fbbb2572e06f612b0d6d2aa0bb9',
    sourceHash:'81563526280f69099783d54924394e4b41b76c0e751dbf818311df19176b7a06'},
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
  assert.deepEqual(draft.authoring.files.map(row=>row.path),fixture.framework==='react'
    ?['src/counter.js','src/demo-config.js','src/main.js']:['src/main.js']);
  assert.equal(draft.build.sourceHash,fixture.sourceHash);
  assert.equal(sha(draft.sourceUtf8),fixture.sourceHash);
  assert.match(draft.sourceUtf8,new RegExp('// @opendesk-lib '+fixture.framework));
  const compiled=await buildProgramProjectInMemory('examples/programs/'+base,{mode:'production'});
  assert.equal(compiled.sourceHash,draft.build.sourceHash,'Current JSON cannot silently lag project source');
  assert.equal(compiled.sourceUtf8,draft.sourceUtf8);
  assert.ok(compiled.sourceBytes<100000);
});
