import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';
import {parseUserScriptDependencies} from '../../src/scripting/user-scripts/dependency-metadata.js';
import {compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';
import {controllerProgramBody} from '../../src/scripting/sandbox/worker-runtime.js';

const digest=s=>createHash('sha256').update(s).digest('hex');
const temp=()=>mkdtemp(join(tmpdir(),'opendesk-build-test-'));
const errorCode=code=>error=>error.code===code;

test('three-file ESM Page project becomes one locally hashed JS consumed by existing USER_SCRIPT compiler',async t=>{
  const out=await temp();t.after(()=>rm(out,{recursive:true,force:true}));
  const checked=await buildProgramProject('examples/programs/page-heading',{outputDirectory:out});
  assert.equal(checked.format,'opendesk.build-artifact.v1');
  assert.equal(checked.runtimeKind,'page-userscript');
  assert.equal(checked.status,'BUILT_UNVERIFIED');
  assert.equal(checked.installable,false);
  assert.equal(checked.sourceModules.length,3);
  const code=await readFile(join(out,'program.js'),'utf8');
  const metadata=JSON.parse(await readFile(join(out,'artifact.json'),'utf8'));
  assert.equal(digest(code),checked.sourceHash);
  assert.equal(metadata.sourceHash,checked.sourceHash);
  assert.equal(metadata.entryFormat,'async-main');
  assert.deepEqual(parseUserScriptDependencies(code).matches,['https://example.com/*']);
  assert.equal(parseUserScriptDependencies(code).requires.length,0);
  assert.doesNotMatch(code,/sourceMappingURL|^\s*import\s+.*from\s+['"]|^\s*export\s+/m);
  const compiled=await compileLockedPageSource({sourceUtf8:code,entryFormat:'async-main',entries:[]});
  assert.equal(compiled.js.length,1);
  assert.equal(compiled.world,'USER_SCRIPT');
  const result=await vm.runInNewContext(compiled.js[0].code,{
    document:{querySelector:s=>s==='h1'?{textContent:'  Example heading  '}:null}
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{heading:'Example heading',found:true});
  const again=await buildProgramProject('examples/programs/page-heading',{outputDirectory:out});
  assert.equal(again.sourceHash,checked.sourceHash);
  assert.equal((await readFile(join(out,'program.js'),'utf8')),code,'rebuilds are identical and immutable');
});

test('Controller ESM project produces the existing genuine Task v1 Candidate import format, not an Available claim',async t=>{
  const out=await temp();t.after(()=>rm(out,{recursive:true,force:true}));
  const result=await buildProgramProject('examples/programs/controller-title',{outputDirectory:out});
  assert.equal(result.runtimeKind,'controller');
  assert.equal(result.installable,false);
  assert.equal(result.candidateFile,'program.opendesk-task.json');
  const raw=JSON.parse(await readFile(join(out,'program.opendesk-task.json'),'utf8'));
  const verified=await verifyTaskPackage(raw);
  assert.equal(verified.manifest.format,'opendesk.task.v1');
  assert.equal(verified.manifest.taskId,'sample.controller-title');
  assert.equal(verified.manifest.program.sourceHash,result.sourceHash);
  const source=await readFile(join(out,'program.js'),'utf8');
  const AsyncBody=Object.getPrototypeOf(async function(){}).constructor;
  const execute=new AsyncBody('page','params','axiosx','AppStorage','AppLocal','storage',controllerProgramBody(source));
  const outcome=await execute({title:async()=>'Controller title'}, {},null,null,null,null);
  assert.deepEqual(outcome,{title:'Controller title'});
  assert.equal(digest(source),result.sourceHash);
});

test('an unbundled asset is rejected rather than included in a supposedly complete project',async t=>{
  const out=await temp();t.after(()=>rm(out,{recursive:true,force:true}));
  const root=join(out,'project');await mkdir(join(root,'src'),{recursive:true});
  await mkdir(join(root,'assets'));
  const pkg=JSON.parse(await readFile('examples/programs/page-heading/package.json','utf8'));
  pkg.opendesk.assets=[{path:'assets/panel.css',kind:'css'}];
  await writeFile(join(root,'package.json'),JSON.stringify(pkg));
  await writeFile(join(root,'src/main.js'),'export default function main(){return 1;}');
  await writeFile(join(root,'assets/panel.css'),'body{color:red}');
  await assert.rejects(buildProgramProject(root,{outputDirectory:join(out,'dist')}),errorCode('E_PROJECT_ASSET_BUILD'));
});

test('untrusted remote and dynamic ESM imports are rejected before Webpack',async t=>{
  const out=await temp();t.after(()=>rm(out,{recursive:true,force:true}));
  const root=join(out,'project');await mkdir(join(root,'src'),{recursive:true});
  const pkg=JSON.parse(await readFile('examples/programs/page-heading/package.json','utf8'));
  await writeFile(join(root,'package.json'),JSON.stringify(pkg));
  await writeFile(join(root,'src/main.js'),"import x from 'https://cdn.example/run.js'; export default x;");
  await assert.rejects(buildProgramProject(root,{outputDirectory:join(out,'dist')}),errorCode('E_PROJECT_IMPORT'));
  await writeFile(join(root,'src/main.js'),"export default function main(){return import('./next.js');}");
  await assert.rejects(buildProgramProject(root,{outputDirectory:join(out,'dist')}),errorCode('E_PROJECT_DYNAMIC_IMPORT'));
});

test('a frozen output directory rejects replacement without quietly publishing new bytes',async t=>{
  const out=await temp();t.after(()=>rm(out,{recursive:true,force:true}));
  await buildProgramProject('examples/programs/page-heading',{outputDirectory:out});
  await writeFile(join(out,'program.js'),'malicious replacement');
  await assert.rejects(buildProgramProject('examples/programs/page-heading',{outputDirectory:out}),
    errorCode('E_BUILD_IMMUTABLE'));
});
