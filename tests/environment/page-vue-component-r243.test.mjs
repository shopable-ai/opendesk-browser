import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {PAGE_FRAMEWORK_RUNTIMES,PAGE_FRAMEWORK_IMPORTS} from '../../src/libs/page-frameworks/contract.js';

const project='examples/programs/page-ui-vue';
test('R24.3 official Vue App.vue is a component source, not a user build artifact',async()=>{
  const validated=await validateProgramProject(project);
  assert.equal(validated.entry,'src/App.vue');
  assert.equal(validated.entryMode,'component');
  assert.deepEqual(validated.npmDependencies,[]);
  assert.equal(validated.componentStyles.length,1);
  assert.match(validated.componentStyles[0].css,/data-v-/);
  const app=await readFile(project+'/src/App.vue','utf8');
  assert.match(app,/<script setup>/);
  assert.match(app,/<template>/);
  assert.doesNotMatch(app,/createPageUI|createApp|main\(/);
});
test('R24.3 Vue SFC emits small managed USER_SCRIPT with official render helpers and scoped CSS',async()=>{
  const output=await buildProgramProjectInMemory(project,{mode:'development'});
  assert.ok(output.sourceBytes<100000);
  assert.match(output.sourceUtf8,/\/\/ @opendesk-lib vue/);
  assert.match(output.sourceUtf8,/globalThis\.OpenDeskPageVue/);
  assert.match(output.sourceUtf8,/data-v-/);
  assert.ok(PAGE_FRAMEWORK_IMPORTS.vue.vue.includes('createElementVNode'));
  const runtime=PAGE_FRAMEWORK_RUNTIMES.vue;
  const compiled=await compileLockedPageSource({sourceUtf8:output.sourceUtf8,
    entryFormat:'async-main',entries:[],frameworkSource:{
      id:runtime.id,version:runtime.version,sha256:runtime.sha256,
      code:await readFile(runtime.source,'utf8')
    }});
  assert.equal(compiled.world,'USER_SCRIPT');
  assert.equal(compiled.packagedFrameworkId,'vue');
});
