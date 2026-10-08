import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {buildProgramProject,mapProgramGeneratedPosition} from '../../scripts/build-program-project.mjs';
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
  const draft=JSON.parse(await readFile(join(out,'program.opendesk-draft.json'),'utf8'));
  assert.equal(digest(code),checked.sourceHash);
  assert.equal(checked.sourceHash,'623d850fadb321a8fca76883adb464f9600a6dbbc95414520981b4a34d3461e5');
  assert.equal(checked.buildMode,'production');
  assert.equal(checked.draftFile,'program.opendesk-draft.json');
  assert.equal(checked.sourceMapFile,undefined);
  assert.equal(metadata.sourceHash,checked.sourceHash);
  assert.equal(metadata.sourceHash,draft.build.sourceHash);
  assert.equal(draft.format,'opendesk.program-draft.v1');
  assert.deepEqual(draft.project,{id:'sample.page-heading',version:'0.1.0',entry:'src/main.js'});
  assert.equal(draft.runtimeKind,'page-userscript');
  assert.equal(draft.build.mode,'production');
  assert.equal(draft.build.byteLength,Buffer.byteLength(code,'utf8'));
  assert.equal(draft.sourceUtf8,code);
  assert.deepEqual(draft.authoring.files.map(row=>row.path),['src/describe.js','src/dom.js','src/main.js']);
  assert.ok(draft.authoring.files.every(row=>!row.path.includes('node_modules')&&
    digest(row.sourceUtf8)===row.sha256));
  assert.equal(metadata.entryFormat,'async-main');
  assert.deepEqual((await readdir(out)).sort(),['artifact.json','program.js','program.opendesk-draft.json']);
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
  assert.equal(result.sourceHash,'c8788deb74810cc24be36f6740614e5beeb7aea2b217159372bd096daed9f3dd');
  assert.equal(result.installable,false);
  assert.equal(result.candidateFile,'program.opendesk-task.json');
  assert.equal(result.draftFile,'program.opendesk-draft.json');
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

test('development mode emits readable program JS, draft metadata and a separate local source map only',async t=>{
  const out=await temp();t.after(()=>rm(out,{recursive:true,force:true}));
  const result=await buildProgramProject('examples/programs/page-heading',{outputDirectory:out,mode:'development'});
  assert.equal(result.buildMode,'development');
  assert.equal(result.sourceMapFile,'program.js.map');
  assert.equal(result.draftFile,'program.opendesk-draft.json');
  const names=(await readdir(out)).sort();
  assert.deepEqual(names,['artifact.json','program.js','program.js.map','program.opendesk-draft.json']);
  const code=await readFile(join(out,'program.js'),'utf8');
  assert.match(code,/\.\/src\/main\.js/);
  assert.match(code,/\/\/# sourceMappingURL=program\.js\.map\s*$/);
  const map=JSON.parse(await readFile(join(out,'program.js.map'),'utf8'));
  assert.equal(map.file,'program.js');
  assert.ok(map.sources.some(source=>source.includes('/src/main.js')||source.endsWith('./src/main.js')));
  const draft=JSON.parse(await readFile(join(out,'program.opendesk-draft.json'),'utf8'));
  assert.equal(draft.build.mode,'development');
  assert.equal(draft.build.sourceHash,result.sourceHash);
  assert.equal(draft.sourceUtf8,code);
  assert.ok(Buffer.byteLength(JSON.stringify(draft),'utf8')<=512000);
});

test('development source map maps final generated throw position back to local authoring module',async t=>{
  const root=await temp();t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src'));
  await writeFile(join(root,'package.json'),JSON.stringify({
    name:'@local/source-map-throw',
    version:'1.0.0',
    private:true,
    type:'module',
    description:'source map throw fixture',
    opendesk:{
      format:'opendesk.project.v1',
      id:'local.source-map-throw',
      runtimeKind:'page-userscript',
      sourceFormat:'esm',
      entry:'src/main.js',
      pageRules:{matches:['https://example.com/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'}
    }
  }));
  await writeFile(join(root,'src/main.js'),
    "export default async function main() {\n  throw new Error('mapped boom');\n}\n");
  const out=join(root,'dist');
  await buildProgramProject(root,{outputDirectory:out,mode:'development'});
  const code=await readFile(join(out,'program.js'),'utf8');
  const map=await readFile(join(out,'program.js.map'),'utf8');
  const index=code.indexOf("throw new Error('mapped boom')");
  assert.notEqual(index,-1);
  const prefix=code.slice(0,index);
  const line=prefix.split('\n').length;
  const column=prefix.length-prefix.lastIndexOf('\n')-1;
  const mapped=mapProgramGeneratedPosition(map,{line,column});
  assert.ok(mapped.source.includes('/src/main.js')||mapped.source.endsWith('./src/main.js'),mapped.source);
  assert.equal(mapped.line,2);
});

test('a declared Page stylesheet enters the immutable program artifact rather than failing closed',async t=>{
  const out=await temp();t.after(()=>rm(out,{recursive:true,force:true}));
  const root=join(out,'project');await mkdir(join(root,'src'),{recursive:true});
  await mkdir(join(root,'assets'));
  const pkg=JSON.parse(await readFile('examples/programs/page-heading/package.json','utf8'));
  pkg.opendesk.assets=[{path:'assets/panel.css',kind:'css'}];
  await writeFile(join(root,'package.json'),JSON.stringify(pkg));
  await writeFile(join(root,'src/main.js'),
    "export default function main({assets}){return assets['assets/panel.css'].text;}");
  await writeFile(join(root,'assets/panel.css'),'.local{color:red}');
  const compiled=await buildProgramProject(root,{outputDirectory:join(out,'dist')});
  const code=await readFile(join(out,'dist','program.js'),'utf8');
  assert.equal(compiled.status,'BUILT_UNVERIFIED');
  assert.equal(compiled.assets.length,1);
  assert.equal(compiled.assets[0].kind,'css');
  assert.equal(digest(code),compiled.sourceHash);
  assert.match(code,/\.local\{color:red\}/);
  assert.equal(compiled.installable,false);
});

test('webpack dependency failures report project, phase and importing source location',async t=>{
  const root=await temp();t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src'));
  await writeFile(join(root,'package.json'),JSON.stringify({
    name:'@local/missing-webpack-dep',
    version:'1.0.0',
    private:true,
    type:'module',
    description:'missing dependency fixture',
    dependencies:{'missing-webpack-dep':'1.0.0'},
    opendesk:{
      format:'opendesk.project.v1',
      id:'local.missing-webpack-dep',
      runtimeKind:'page-userscript',
      sourceFormat:'esm',
      entry:'src/main.js',
      pageRules:{matches:['https://example.com/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'}
    }
  }));
  await writeFile(join(root,'package-lock.json'),JSON.stringify({
    packages:{'':{dependencies:{'missing-webpack-dep':'1.0.0'}}}
  }));
  await writeFile(join(root,'src/main.js'),
    "import missing from 'missing-webpack-dep';\nexport default async function main(){return missing;}\n");
  await assert.rejects(buildProgramProject(root,{outputDirectory:join(root,'dist')}),error=>{
    assert.equal(error.code,'E_PROJECT_WEBPACK');
    assert.equal(error.project,root.split('/').pop());
    assert.equal(error.phase,'webpack');
    assert.equal(error.location.file,'src/main.js');
    assert.equal(error.location.line,1);
    return true;
  });
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
