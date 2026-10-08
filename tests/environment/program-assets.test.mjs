import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';

async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'od-assets-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src'));await mkdir(join(root,'assets'));
  const pkg=JSON.parse(await readFile('examples/programs/page-heading/package.json','utf8'));
  pkg.opendesk.assets=[
    {path:'assets/tool.css',kind:'css'},
    {path:'assets/mark.png',kind:'image'},
    {path:'assets/config.json',kind:'json'}
  ];
  await writeFile(join(root,'package.json'),JSON.stringify(pkg));
  await writeFile(join(root,'src/main.js'),"export default async function main({assets}){return assets['assets/mark.png'].url;}");
  await writeFile(join(root,'assets/tool.css'),'.icon{background:url("./mark.png")}');
  await writeFile(join(root,'assets/mark.png'),await readFile('examples/programs/sidebar-assets-contract/assets/mark.png'));
  await writeFile(join(root,'assets/config.json'),'{"active":true}');
  return {root,pkg};
}
test('CSS url() points to embedded image, with JSON and hashes; no runtime dev server',async t=>{
  const {root}=await fixture(t);
  const checked=await validateProgramProject(root);
  assert.equal(checked.assets.length,3);
  const out=join(root,'built');
  const built=await buildProgramProject(root,{outputDirectory:out});
  const code=await readFile(join(out,'program.js'),'utf8');
  assert.equal(built.status,'BUILT_UNVERIFIED');
  assert.match(code,/data:image\/png;base64,/);
  assert.match(code,/\.icon\{background:url\(\\?"data:image/);
  const metadata=JSON.parse(await readFile(join(out,'artifact.json'),'utf8'));
  const draft=JSON.parse(await readFile(join(out,'program.opendesk-draft.json'),'utf8'));
  assert.deepEqual(metadata.assets.map(x=>x.path),checked.assets.map(x=>x.path));
  assert.equal(draft.sourceUtf8,code);
  assert.equal(draft.build.sourceHash,built.sourceHash);
  assert.ok(built.sourceBytes<=100000);
  await writeFile(join(root,'assets/tool.css'),'.icon{background:url("./mark.png");opacity:.9}');
  const cssBuild=await buildProgramProject(root,{outputDirectory:join(root,'css-build')});
  assert.notEqual(cssBuild.sourceHash,built.sourceHash);
  const img=join(root,'assets/mark.png');
  await writeFile(img,Buffer.concat([await readFile(img),Buffer.from([0])]));
  const imgBuild=await buildProgramProject(root,{outputDirectory:join(root,'img-build')});
  assert.notEqual(imgBuild.sourceHash,cssBuild.sourceHash);
});
test('reject CSS network/import/undeclared URLs and spoofed image bytes',async t=>{
  const {root}=await fixture(t);
  const css=join(root,'assets/tool.css');
  for(const value of ['@import url("https://a.test/x.css");',
    '.icon{background:url("./missing.png")}', '.icon{background:url("../../escape.png")}']){
    await writeFile(css,value);
    await assert.rejects(validateProgramProject(root),e=>e.code==='E_PROJECT_ASSET_URL');
  }
  await writeFile(css,'.icon{color:red}');
  await writeFile(join(root,'assets/mark.png'),'not-an-image');
  await assert.rejects(validateProgramProject(root),e=>e.code==='E_PROJECT_ASSET_TYPE');
});
test('original JavaScript-only program keeps its output without adding base CSS',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'od-no-ui-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const built=await buildProgramProject('examples/programs/page-heading',{outputDirectory:dir});
  const code=await readFile(join(dir,'program.js'),'utf8');
  assert.equal(built.assets,undefined);
  assert.doesNotMatch(code,/opendesk\.page-ui\.v1|data:image\/png;base64/);
});
