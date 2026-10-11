import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../src/libs/page-frameworks/contract.js';
import {compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
for(const framework of ['react','vue'])test('R24.3 '+framework+' direct official JavaScript is managed while R24.2 source remains reversible',async()=>{
  const path='examples/programs/page-ui-'+framework+'-direct';
  const checked=await validateProgramProject(path);
  assert.equal(checked.entryMode,'component');
  assert.equal(checked.entry,'src/main.js');
  assert.deepEqual(checked.npmDependencies,[]);
  assert.deepEqual(checked.sources.map(f=>f.path),['src/main.js']);
  const source=await readFile(path+'/src/main.js','utf8');
  assert.match(source,new RegExp("from '"+framework+"'"));
  assert.match(source,/export default/);
  assert.doesNotMatch(source,/createPageUI|createDemoEnhancer|OpenDeskPage|function main\(/);
  if(framework==='react'){
    assert.match(source,/useReducer/);assert.match(source,/useCallback/);
  }else{
    assert.match(source,/\bref\b/);assert.match(source,/\bh\b/);
  }
  const historical=await readFile(path+'/src/legacy-main.js','utf8');
  assert.match(historical,/createDemoEnhancer/);
  assert.match(historical,/(?:root|app)\.unmount\(\)/);
  const built=await buildProgramProjectInMemory(path,{mode:'production'});
  assert.ok(built.sourceBytes<100000);
  assert.match(built.sourceUtf8,new RegExp('// @opendesk-lib '+framework));
  const row=PAGE_FRAMEWORK_RUNTIMES[framework];
  const compiled=await compileLockedPageSource({sourceUtf8:built.sourceUtf8,entryFormat:'async-main',
    entries:[],frameworkSource:{id:row.id,version:row.version,sha256:row.sha256,
      code:await readFile(row.source,'utf8')}});
  assert.equal(compiled.world,'USER_SCRIPT');
  assert.equal(compiled.packagedFrameworkId,framework);
});
