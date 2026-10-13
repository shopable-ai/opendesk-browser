// Reproducible official previews for users who prefer 'Discover -> Import'.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {validateProgramDraft} from '../../src/ui/program-source.js';
import {parseUserScriptDependencies} from '../../src/scripting/user-scripts/dependency-metadata.js';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {prepareHistoricalPageFrameworkProject} from '../framework/page-frameworks-r242-native.mjs';

const fixtures=[
  {name:'page-ui-react-direct',id:'sample.page-ui-react-direct',
    sourceHash:'34b22968dacd96ad4f706be99e44aee5f46479f0cd82fb5e07cec5eea7ea4d52',
    draftSha:'617697c46b2d20d88c987750dbd87d6161f307a3120ecd83157974ce6d45cedd'},
  {name:'page-ui-vue-direct',id:'sample.page-ui-vue-direct',
    sourceHash:'ca7c8e01193dfe1868244809bcbf440e15d073b9b109fafde49e02a842694885',
    draftSha:'7d2b097638627c136fdae0d56de9a7d6314988cb61fdef532c240cdd8707364f'}
];

for (const fixture of fixtures) test('R24.2 historical '+fixture.name+' preserves reviewed source and immutable bytes',async()=>{
  const path='examples/import-ready/history/r242-'+fixture.name+'.opendesk-draft.json';
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
  const legacy=draft.authoring.files.find(row=>row.path==='src/main.js').sourceUtf8;
  assert.match(legacy,/createDemoEnhancer/);
  assert.match(legacy,/(?:root|app)\.unmount\(\)/);
  const destination=await mkdtemp(join(tmpdir(),'opendesk-r242-history-'));
  try{
    await prepareHistoricalPageFrameworkProject({root:process.cwd(),framework,destination});
    const checked=await validateProgramProject(destination);
    assert.equal(checked.entry,'src/main.js');
    assert.equal(checked.entryMode,undefined);
    const pkg=JSON.parse(await readFile(join(destination,'package.json'),'utf8'));
    assert.deepEqual(pkg.opendesk.pageRules.matches,parsed.matches);
    assert.deepEqual(pkg.opendesk.pageRules.excludeMatches,parsed.excludeMatches);
    assert.deepEqual(checked.sources.map(file=>file.path),draft.authoring.files.map(file=>file.path));
    for(const file of draft.authoring.files)
      assert.equal(await readFile(join(destination,file.path),'utf8'),file.sourceUtf8);
    const built=await buildProgramProjectInMemory(destination,{mode:'production'});
    assert.ok(built.sourceBytes<100000);
    assert.match(built.sourceUtf8,new RegExp('// @opendesk-lib '+framework));
  }finally{await rm(destination,{recursive:true,force:true});}
});
