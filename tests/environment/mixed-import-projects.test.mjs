// Mixed-import source/lock checks run offline by default.
// OPENDESK_MIXED_IMPORT_BUILD=1 enables real Webpack/Node execution after npm ci in both projects.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,rm,writeFile,unlink} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {parse} from 'acorn';
import words from 'lodash-es/words.js';
import dayjs from 'dayjs';
import {installPageQueryString} from '../../src/libs/packages/query-string.js';
import {installControllerAxios} from '../../src/libs/packages/axios.js';
import {BUILTIN_RUNTIME_CATALOG} from '../../src/libs/runtime-contract.js';
import {controllerProgramBody} from '../../src/scripting/sandbox/worker-runtime.js';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';

const projects=Object.freeze({
  page:resolve('examples/programs/mixed-import-page'),
  controller:resolve('examples/programs/mixed-import-controller')
});
const remote='https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';
const pinned='691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=path=>readFile(path,'utf8').then(JSON.parse);
const expectCode=code=>error=>error?.code===code;
const buildEnabled=process.env.OPENDESK_MIXED_IMPORT_BUILD==='1';
const noNetwork=()=>{throw Error('Offline build attempted an HTTP download');};
const expectedImports={https:5,npm:'A &amp; B',relative:[2,5,3]};
const expectedDefaults={words:2,date:'2026-10-14'};

async function copyProject(t,kind) {
  const parent=await mkdtemp(join(tmpdir(),'od-mixed-import-'));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const root=join(parent,'project');
  await cp(projects[kind],root,{recursive:true});
  return root;
}
async function saveJson(path,object) {
  await writeFile(path,JSON.stringify(object,null,2)+'\n');
}
function checkImports(source) {
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const specifiers=ast.body.filter(node=>node.type==='ImportDeclaration').map(node=>node.source.value);
  assert.deepEqual(specifiers,[remote,'lodash-es/escape.js','./lib/scores.js']);
  assert.equal(ast.body.filter(node=>node.type==='ExportDefaultDeclaration').length,1);
}

test('two examples use exactly 3 real static ESM imports and pinned source identities',async()=>{
  const knownNpm=await json('examples/programs/page-npm-lodash/package-lock.json');
  for(const [kind,root] of Object.entries(projects)){
    const source=await readFile(join(root,'src/main.js'),'utf8');
    checkImports(source);
    assert.match(source,/export default async function main\(\)/);
    const project=await validateProgramProject(root);
    assert.equal(project.runtimeKind,kind==='page'?'page-userscript':'controller');
    assert.deepEqual(project.remoteImports,[remote]);
    assert.deepEqual(project.npmPackages,['lodash-es']);
    assert.deepEqual(project.sources.map(x=>x.path),['src/lib/scores.js','src/main.js']);
    const manifest=await json(join(root,'package.json'));
    assert.deepEqual(manifest.opendesk.libraries,[kind==='page'?'query-string':'axios']);
    assert.equal(manifest.dependencies['lodash-es'],'4.17.21');
    const lock=await json(join(root,'package-lock.json'));
    assert.equal(lock.name,manifest.name);
    assert.deepEqual(lock.packages[''].dependencies,manifest.dependencies);
    assert.deepEqual(lock.packages['node_modules/lodash-es'],knownNpm.packages['node_modules/lodash-es']);
    assert.equal(project.npmDependencies[0].integrity,knownNpm.packages['node_modules/lodash-es'].integrity);
    const remoteLock=await json(join(root,'opendesk.remote-lock.json'));
    assert.equal(remoteLock.format,'opendesk.remote-lock.v1');
    assert.deepEqual(Object.keys(remoteLock.modules),[remote]);
    assert.deepEqual(remoteLock.modules[remote],{sha256:pinned,bytes:502});
    const original=await readFile(join(root,'.opendesk/remote-cache',pinned+'.mjs'));
    assert.equal(original.length,502);
    assert.equal(digest(original),pinned);
    assert.match(original.toString('utf8'),/^export default function max\(/);
  }
  assert.equal(BUILTIN_RUNTIME_CATALOG.libraries.queryString.worlds.includes('CONTROLLER'),false);
  assert.equal(BUILTIN_RUNTIME_CATALOG.libraries.axios.worlds.includes('CONTROLLER'),true);
  for(const id of ['lodash','dayjs'])assert.equal(BUILTIN_RUNTIME_CATALOG.libraries[id].default,true);
});

test('validation fails closed for bad npm metadata, missing relative file and forbidden world',async t=>{
  await t.test('missing npm lock',async sub=>{
    const root=await copyProject(sub,'page');
    await unlink(join(root,'package-lock.json'));
    await assert.rejects(validateProgramProject(root),expectCode('E_PROJECT_FILE'));
  });
  await t.test('mismatched npm lock version',async sub=>{
    const root=await copyProject(sub,'page'),lock=await json(join(root,'package-lock.json'));
    lock.packages['node_modules/lodash-es'].version='4.17.20';
    await saveJson(join(root,'package-lock.json'),lock);
    await assert.rejects(validateProgramProject(root),expectCode('E_PROJECT_NPM_LOCK'));
  });
  await t.test('missing relative source file',async sub=>{
    const root=await copyProject(sub,'controller');
    await unlink(join(root,'src/lib/scores.js'));
    await assert.rejects(validateProgramProject(root),expectCode('E_PROJECT_FILE'));
  });
  await t.test('Page-only opt-in rejected for Controller',async sub=>{
    const root=await copyProject(sub,'controller'),pkg=await json(join(root,'package.json'));
    pkg.opendesk.libraries=['query-string'];
    await saveJson(join(root,'package.json'),pkg);
    await assert.rejects(validateProgramProject(root),expectCode('E_PROJECT_LIBRARIES'));
  });
  await t.test('Controller cannot declare a path as an exact authorized origin',async sub=>{
    const root=await copyProject(sub,'controller'),pkg=await json(join(root,'package.json'));
    pkg.opendesk.siteOrigins=['http://127.0.0.1:43111/demo-form.html'];
    await saveJson(join(root,'package.json'),pkg);
    await assert.rejects(validateProgramProject(root),expectCode('E_PROJECT_PERMISSION'));
  });
});

test('real offline Webpack resolves all imports and executes one mixed result in each world',
  {skip:buildEnabled?false:'Run npm ci in each example, then set OPENDESK_MIXED_IMPORT_BUILD=1'},async t=>{
  const out=await mkdtemp(join(tmpdir(),'od-mixed-bundle-'));
  t.after(()=>rm(out,{recursive:true,force:true}));
  const produced={};
  for(const [kind,root] of Object.entries(projects)){
    const installed=await json(join(root,'node_modules/lodash-es/package.json'));
    assert.equal(installed.version,'4.17.21','Each project must use its local npm ci, not root lodash 4.18.1');
    const artifact=await buildProgramProject(root,{outputDirectory:join(out,kind),fetchImpl:noNetwork});
    assert.equal(artifact.status,'BUILT_UNVERIFIED');
    assert.equal(artifact.runtimeKind,kind==='page'?'page-userscript':'controller');
    assert.equal(artifact.installable,false);
    assert.deepEqual(artifact.remoteModules,[{url:remote,sha256:pinned,bytes:502}]);
    assert.ok(artifact.npmBundledModules.some(value=>value.includes('node_modules/lodash-es/escape.js')),
      'Actual npm escape.js must enter the build graph');
    assert.deepEqual(artifact.sourceModules.map(x=>x.path),['src/lib/scores.js','src/main.js']);
    assert.equal(artifact.npmLockSha256,digest(await readFile(join(root,'package-lock.json'))));
    const source=await readFile(join(out,kind,'program.js'),'utf8');
    assert.equal(digest(source),artifact.sourceHash);
    assert.doesNotMatch(source,/^\s*import\s+.+from\s+['"]https:/m);
    const repeated=await buildProgramProject(root,{outputDirectory:join(out,kind),fetchImpl:noNetwork});
    assert.equal(repeated.sourceHash,artifact.sourceHash);
    produced[kind]={source,artifact};
  }

  // L2: run actual bundled ESM; use real upstream libraries as globals.
  // This is deliberately not a Chrome USER_SCRIPT receipt.
  const document={title:'OpenDesk Mixed Import Fixture'};
  const pageGlobal={document};
  installPageQueryString(pageGlobal);
  const pageResult=await vm.runInNewContext(produced.page.source+'\nmain()',{
    document,queryString:pageGlobal.queryString,_:Object.freeze({words}),dayjs
  });
  assert.deepEqual(JSON.parse(JSON.stringify(pageResult)),{
    imports:expectedImports,packaged:'demo',defaults:expectedDefaults,pageTitle:document.title
  });
  assert.match(produced.page.source,/\/\/ @opendesk-lib query-string/);

  // L2: real Controller Axios getUri() with a transport guaranteed not to run.
  let calls=0;
  const unexpected=()=>{calls++;throw Error('getUri must not issue HTTP requests');};
  const axiosGlobal={};
  installControllerAxios(axiosGlobal,{get:unexpected,post:unexpected,put:unexpected,delete:unexpected});
  const execute=vm.runInNewContext(
    '(async function(page,params,axiosx,AppStorage,AppLocal,storage){'+
      controllerProgramBody(produced.controller.source)+'\n})',
    {axios:axiosGlobal.axios,_:Object.freeze({words}),dayjs,URL}
  );
  const page={url:async()=> 'http://127.0.0.1:43111/demo-form.html',
    title:async()=> 'OpenDesk Mixed Import Fixture'};
  const controllerResult=await execute(page,{},null,null,null,null);
  assert.deepEqual(JSON.parse(JSON.stringify(controllerResult)),{
    imports:expectedImports,
    packaged:'http://127.0.0.1:43111/demo-form.html?mode=demo',
    defaults:expectedDefaults,pageTitle:'OpenDesk Mixed Import Fixture'
  });
  assert.equal(calls,0);
  assert.match(produced.controller.source,/\/\/ @opendesk-lib axios/);
  const denied=Object.assign(new Error('Origin permission denied'),{code:'E_PERMISSION'});
  await assert.rejects(execute({url:async()=>{throw denied;}},{},null,null,null,null),error=>error===denied);
  // Machine-readable provenance from one genuine locked Webpack graph per
  // world. Node VM results are never labeled Chrome/USER_SCRIPT receipts.
  t.diagnostic(JSON.stringify({
    format:'opendesk.mixed-import-node-evidence.v1',level:'NODE_BUILD_VM_NOT_CHROME',
    projects:Object.fromEntries(Object.entries(produced).map(([kind,row])=>[
      kind,{sourceHash:row.artifact.sourceHash,sourceBytes:row.artifact.sourceBytes,
        npmLockSha256:row.artifact.npmLockSha256,npmDependencies:row.artifact.npmDependencies,
        npmBundledModules:row.artifact.npmBundledModules,remoteModules:row.artifact.remoteModules}
    ])),
    results:{page:JSON.parse(JSON.stringify(pageResult)),
      controller:JSON.parse(JSON.stringify(controllerResult))}
  }));
});

test('offline runtime rejects damaged HTTPS, missing ESM exports and stale source identity',
  {skip:buildEnabled?false:'Run npm ci in each example, then set OPENDESK_MIXED_IMPORT_BUILD=1'},async t=>{
  await t.test('missing HTTPS cache',async sub=>{
    const root=await copyProject(sub,'page');
    await unlink(join(root,'.opendesk/remote-cache',pinned+'.mjs'));
    await assert.rejects(buildProgramProject(root,{outputDirectory:join(root,'out'),fetchImpl:noNetwork}),expectCode('E_REMOTE_CACHE'));
  });
  await t.test('tampered HTTPS SHA',async sub=>{
    const root=await copyProject(sub,'controller');
    await writeFile(join(root,'.opendesk/remote-cache',pinned+'.mjs'),'export default ()=>999;\n');
    await assert.rejects(buildProgramProject(root,{outputDirectory:join(root,'out'),fetchImpl:noNetwork}),expectCode('E_REMOTE_HASH'));
  });
  await t.test('missing named export from relative module',async sub=>{
    const root=await copyProject(sub,'page');
    await writeFile(join(root,'src/lib/scores.js'),'export const wrongName=()=>[2,5,3];\n');
    await assert.rejects(buildProgramProject(root,{outputDirectory:join(root,'out'),fetchImpl:noNetwork}),expectCode('E_PROJECT_WEBPACK'));
  });
  await t.test('source changed during compilation',async sub=>{
    const root=await copyProject(sub,'controller');
    const file=join(root,'src/lib/scores.js');
    await assert.rejects(buildProgramProject(root,{
      outputDirectory:join(root,'out'),fetchImpl:noNetwork,
      onCompile:()=>writeFileSync(file,'export function getScores(){return [9];}\n')
    }),expectCode('E_PROJECT_CHANGED'));
  });
  await t.test('undeclared Page optional global is not installed',async sub=>{
    const root=await copyProject(sub,'page'),pkg=await json(join(root,'package.json'));
    delete pkg.opendesk.libraries;
    await saveJson(join(root,'package.json'),pkg);
    const artifact=await buildProgramProject(root,{outputDirectory:join(root,'out'),fetchImpl:noNetwork});
    const source=await readFile(join(artifact.outputDirectory,'program.js'),'utf8');
    assert.doesNotMatch(source,/\/\/ @opendesk-lib query-string/);
    await assert.rejects(vm.runInNewContext(source+'\nmain()',{
      document:{title:'Fixture'},_:Object.freeze({words}),dayjs
    }),/queryString is not defined/);
  });
});
