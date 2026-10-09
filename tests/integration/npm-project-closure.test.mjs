import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';
import {compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';

const project='examples/programs/page-npm-lodash';
test('real npm ci lodash-es module is bundled into isolated Page program and runs without CDN',async t=>{
  const installed=JSON.parse(await readFile(project+'/node_modules/lodash-es/package.json','utf8'));
  assert.equal(installed.version,'4.17.21','First run npm ci --prefix '+project);
  const out=await mkdtemp(join(tmpdir(),'opendesk-r9-npm-'));
  t.after(()=>rm(out,{recursive:true,force:true}));
  const artifact=await buildProgramProject(project,{outputDirectory:out});
  assert.equal(artifact.status,'BUILT_UNVERIFIED');
  assert.deepEqual(artifact.npmPackages,['lodash-es']);
  assert.equal(artifact.npmDependencies[0].version,'4.17.21');
  assert.match(artifact.npmDependencies[0].integrity,/^sha512-/);
  assert.ok(artifact.npmBundledModules.some(path=>path.startsWith('node_modules/lodash-es/')),
    'Webpack provenance must list the imported registry module');
  const sourceUtf8=await readFile(join(out,'program.js'),'utf8');
  assert.equal(createHash('sha256').update(sourceUtf8).digest('hex'),artifact.sourceHash);
  assert.doesNotMatch(sourceUtf8,/https:\/\/registry\.npmjs\.org|https:\/\/cdn\./);
  const plan=await compileLockedPageSource({sourceUtf8,entryFormat:'async-main',entries:[]});
  assert.equal(plan.world,'USER_SCRIPT');
  const result=await vm.runInNewContext(plan.js[0].code,{
    document:{querySelector:()=>({textContent:' Tom & Jerry <b> '})}
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{
    text:'Tom & Jerry <b>',safeHtml:'Tom &amp; Jerry &lt;b&gt;'
  });
});
