// Reproducible official previews for users who prefer 'Discover -> Import'.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateProgramDraft} from '../../src/ui/program-source.js';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {parseUserScriptDependencies} from '../../src/scripting/user-scripts/dependency-metadata.js';

const fixtures=[
  {name:'page-ui-react-direct',id:'sample.page-ui-react-direct',
    sourceHash:'34b22968dacd96ad4f706be99e44aee5f46479f0cd82fb5e07cec5eea7ea4d52',
    draftSha:'617697c46b2d20d88c987750dbd87d6161f307a3120ecd83157974ce6d45cedd'},
  {name:'page-ui-vue-direct',id:'sample.page-ui-vue-direct',
    sourceHash:'ca7c8e01193dfe1868244809bcbf440e15d073b9b109fafde49e02a842694885',
    draftSha:'7d2b097638627c136fdae0d56de9a7d6314988cb61fdef532c240cdd8707364f'}
];

for (const fixture of fixtures) test('R24.2 direct-import '+fixture.name+' is immutable and matches source',async()=>{
  const path='examples/import-ready/'+fixture.name+'.opendesk-draft.json';
  const bytes=await readFile(path);
  const sha=createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha,fixture.draftSha,'Published demo bytes must match the reviewed CI build');
  const draft=await validateProgramDraft(JSON.parse(bytes.toString('utf8')));
  assert.equal(draft.runtimeKind,'page-userscript');
  assert.equal(draft.project.id,fixture.id);
  assert.equal(draft.build.mode,'production');
  assert.equal(draft.build.sourceHash,fixture.sourceHash);
  assert.ok(draft.build.byteLength<100000);
  assert.equal(draft.build.sourceHash,createHash('sha256').update(draft.sourceUtf8).digest('hex'));
  assert.equal(draft.authoring.files.length,2);
  const parsed=parseUserScriptDependencies(draft.sourceUtf8);
  assert.deepEqual(parsed.matches,['http://127.0.0.1:43111/*']);
  assert.deepEqual(parsed.excludeMatches,['http://127.0.0.1:43111/private/*']);
  const framework=fixture.name.includes('react')?'react':'vue';
  assert.equal(parsed.directives.filter(x=>x.name==='opendesk-lib')[0]?.value,framework);
  const compiled=await buildProgramProjectInMemory('examples/programs/'+fixture.name,{mode:'production'});
  assert.equal(compiled.sourceHash,draft.build.sourceHash,
    'Import-ready snapshot must correspond to currently reviewed source files');
});
