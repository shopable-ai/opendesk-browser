import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';
import {buildAssetRecords} from '../../scripts/program-assets.mjs';

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
test('CSS comments and URL-like string content retain their literal meaning',async t=>{
  const {root}=await fixture(t);
  const css=`.icon{background:url(/* local */"./mark.png")} .note::before{content:"/* status */"} .url::before{content:'url("./mark.png")'}`;
  await writeFile(join(root,'assets/tool.css'),css);
  const checked=await validateProgramProject(root);
  const bytes=new Map(await Promise.all(checked.assets.map(async row=>[row.path,await readFile(join(root,row.path))])));
  const records=buildAssetRecords(checked.assets,bytes);
  assert.match(records['assets/tool.css'].text,/background:url\("data:image\/png;base64,/);
  assert.ok(records['assets/tool.css'].text.includes('content:"/* status */"'));
  assert.ok(records['assets/tool.css'].text.includes(`content:'url("./mark.png")'`));
});

test('reject CSS escaped tokens and unsupported string image URLs',async t=>{
  const {root}=await fixture(t);
  for(const css of [
    String.raw`.icon{background:u\72l("https://assets.example/x.png")}`,
    String.raw`@im\70ort "https://assets.example/x.css";`,
    '.icon{background:image-set("https://assets.example/x.png" 1x)}',
    '.icon{background:-webkit-image-set("https://assets.example/x.png" 1x)}',
    '.icon{background:image("https://assets.example/x.png")}',
    '@font-face{font-family:external;src:src("https://assets.example/x.woff2")}'
  ]){
    await writeFile(join(root,'assets/tool.css'),css);
    await assert.rejects(validateProgramProject(root),e=>e.code==='E_PROJECT_ASSET_URL');
  }
});

test('malformed CSS strings cannot hide runtime URL tokens',async t=>{
  const {root}=await fixture(t);
  for(const newline of ['\n','\r','\f']){
    await writeFile(join(root,'assets/tool.css'),'.icon{--a:"'+newline+';background:url(https://assets.example/x.png);--b:"'+newline+';}');
    await assert.rejects(validateProgramProject(root),e=>e.code==='E_PROJECT_ASSET_URL');
  }
  for(const css of ['.note::before{content:"a/*\n*/b"}',String.raw`.note::before{content:"a/*\
*/b"}`]){
    await writeFile(join(root,'assets/tool.css'),css);
    await assert.rejects(validateProgramProject(root),e=>e.code==='E_PROJECT_ASSET_URL');
  }
});

test('Controller resource declarations fail before packaging',async t=>{
  const {root,pkg}=await fixture(t);
  const controller=JSON.parse(await readFile('examples/programs/sidebar-controller-demo/package.json','utf8'));
  controller.opendesk.assets=pkg.opendesk.assets;
  controller.opendesk.entry='src/main.js';
  await writeFile(join(root,'package.json'),JSON.stringify(controller));
  await assert.rejects(buildProgramProject(root,{outputDirectory:join(root,'built')}),e=>e.code==='E_PROJECT_ASSET_ENV');
});

test('invalid JSON, UTF-8 and per-file/aggregate resource budgets fail closed',async t=>{
  const {root,pkg}=await fixture(t);
  const json=join(root,'assets/config.json'),css=join(root,'assets/tool.css');
  await writeFile(json,'{invalid}');
  await assert.rejects(validateProgramProject(root),e=>e.code==='E_PROJECT_ASSET_JSON');
  await writeFile(json,'{}');
  await writeFile(css,Buffer.from([0xff]));
  await assert.rejects(validateProgramProject(root),e=>e.code==='E_PROJECT_ASSET_ENCODING');
  await writeFile(css,'x'.repeat(24*1024+1));
  await assert.rejects(validateProgramProject(root),e=>e.code==='E_PROJECT_LIMIT');
  pkg.opendesk.assets=[];
  for(const [name,bytes] of [['first',24*1024],['second',24*1024],['third',16*1024]]){
    const path='assets/'+name+'.css';
    pkg.opendesk.assets.push({path,kind:'css'});
    await writeFile(join(root,path),'/*'+'x'.repeat(bytes-4)+'*/');
  }
  await writeFile(join(root,'package.json'),JSON.stringify(pkg));
  await assert.rejects(validateProgramProject(root),e=>e.code==='E_PROJECT_ASSET_LIMIT');
});

test('original JavaScript-only program keeps its output without adding base CSS',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'od-no-ui-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const built=await buildProgramProject('examples/programs/page-heading',{outputDirectory:dir});
  const code=await readFile(join(dir,'program.js'),'utf8');
  assert.equal(built.assets,undefined);
  assert.doesNotMatch(code,/opendesk\.page-ui\.v1|data:image\/png;base64/);
});
