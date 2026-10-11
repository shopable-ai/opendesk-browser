import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProjectInMemory,mapProgramGeneratedPosition} from '../../scripts/build-program-project.mjs';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../src/libs/page-frameworks/contract.js';
import {compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';

const folder='examples/programs/page-ui-react';
test('R24.3 official App.jsx validates as a component with zero user npm runtime dependencies',async()=>{
  const result=await validateProgramProject(folder);
  assert.equal(result.entryMode,'component');
  assert.equal(result.entry,'src/App.jsx');
  assert.deepEqual(result.npmDependencies,[]);
  assert.deepEqual(result.sources.map(row=>row.path),['src/App.jsx']);
  const raw=await readFile(folder+'/src/App.jsx','utf8');
  assert.match(raw,/from 'react'/);
  assert.match(raw,/return <button/);
  assert.doesNotMatch(raw,/createPageUI|createDemoEnhancer|main\(/);
});
test('R24.3 real JSX esbuild/Webpack pipeline links pinned runtime and emits a managed Page preview',async()=>{
  const output=await buildProgramProjectInMemory(folder,{mode:'development'});
  assert.ok(output.sourceBytes<100000);
  assert.match(output.sourceUtf8,/\/\/ @opendesk-lib react/);
  assert.match(output.sourceUtf8,/globalThis\.OpenDeskPageReact/);
  assert.doesNotMatch(output.sourceUtf8,/ReactDOMClient|react-dom\/client\/index/);
  const framework=PAGE_FRAMEWORK_RUNTIMES.react;
  const compiled=await compileLockedPageSource({sourceUtf8:output.sourceUtf8,entryFormat:'async-main',
    entries:[],frameworkSource:{id:framework.id,version:framework.version,sha256:framework.sha256,
      code:await readFile(framework.source,'utf8')}});
  assert.equal(compiled.world,'USER_SCRIPT');
  assert.equal(compiled.packagedFrameworkId,'react');
  const sourceMap=JSON.parse(output.sourceMapUtf8);
  assert.ok(sourceMap.sources.some(x=>x.includes('App.jsx')));
  assert.ok(sourceMap.sourcesContent.some(x=>x?.includes('已点击')));
});
