// L2: genuine Examples + Webpack/Resolver. Browser execution is tested separately
// by local-dev-native-acceptance.mjs, never by these Node page fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {LocalDevResolver} from '../../native-agent/local-dev/resolver.mjs';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {MAX_BYTES,requestShape} from '../../native-agent/wire.mjs';
import {lockMockRemoteExample} from '../framework/esm-r22-examples.mjs';
import {compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';

const sha=value=>createHash('sha256').update(value).digest('hex');
const exec=promisify(execFile);
async function copy(t,name){
  const base=path.resolve('.runtime/tests/esm-examples');
  await fs.mkdir(base,{recursive:true});
  const root=await fs.mkdtemp(path.join(base,name+'-'));
  await fs.cp(path.resolve('examples/programs',name),root,{recursive:true});
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const resolver=new LocalDevResolver({allowedPaths:[root]});
  t.after(()=>resolver.close());
  const {bindingId}=resolver.attach({path:root});
  return {root,resolver,bindingId,resolve:()=>resolver.resolve(bindingId)};
}
const execute=(source,page)=>vm.runInNewContext(source+'\nmain()',
  {page,params:{},axiosx:{},AppStorage:{},AppLocal:{},storage:{}});

test('L2 committed local-controller reads title and heading, edits invalidate source and keep old bytes',async t=>{
  const p=await copy(t,'local-controller');
  const page={title:async()=>'Browser Lab',locator(selector){
    assert.equal(selector,'h1');return {textContent:async()=>'Browser Lab heading'};
  }};
  const first=await p.resolve();
  assert.deepEqual(JSON.parse(JSON.stringify(await execute(first.sourceUtf8,page))),
    {version:1,title:'Browser Lab',heading:'Browser Lab heading'});
  assert.equal(first.sourceHash,sha(first.sourceUtf8));
  assert.equal(first.sourceHash,(await buildProgramProjectInMemory(p.root)).sourceHash);
  const repeat=await p.resolve();
  assert.equal(repeat.cacheHit,true);assert.equal(repeat.timings.buildCount,0);
  const file=path.join(p.root,'src/extract.js'),original=await fs.readFile(file,'utf8');
  assert.match(original,/version:1/);
  await fs.writeFile(file,original.replace('version:1','version:2'));
  const next=await p.resolve();
  assert.equal(next.cacheHit,false);assert.equal(next.timings.buildCount,1);
  assert.notEqual(next.sourceHash,first.sourceHash);assert.notEqual(next.inputHash,first.inputHash);
  assert.equal((await execute(next.sourceUtf8,page)).version,2);
  assert.equal((await execute(first.sourceUtf8,page)).version,1);
  assert.equal(first.sourceHash,sha(first.sourceUtf8));
  assert.deepEqual((await fs.readdir(p.root)).sort(),['README.md','package.json','src']);
  await fs.writeFile(file,'export const broken=;');
  await assert.rejects(p.resolve(),{code:'E_PROJECT_SYNTAX'});
  await fs.unlink(file);
  await assert.rejects(p.resolve(),{code:'E_PROJECT_FILE'});
});

test('L2 actual sidebar Page child edit keeps its complete graph and immutable compiled bytes',async t=>{
  const p=await copy(t,'sidebar-page-demo'),first=await p.resolve();
  assert.deepEqual(first.files.filter(x=>x.path.endsWith('.js')).map(x=>x.path),
    ['src/fixture.js','src/main.js','src/proof.js']);
  for(const row of first.files)assert.equal(sha(await fs.readFile(path.join(p.root,row.path))),row.sha256);
  assert.equal(first.sourceHash,(await buildProgramProjectInMemory(p.root)).sourceHash);
  const file=path.join(p.root,'src/proof.js'),source=await fs.readFile(file,'utf8');
  await fs.writeFile(file,source.replace('多文件 Page 程序已运行','多文件 Page R2.2 已运行'));
  const second=await p.resolve();assert.notEqual(second.sourceHash,first.sourceHash);
  assert.notEqual(second.inputHash,first.inputHash);assert.equal(second.cacheHit,false);
  assert.match(first.sourceUtf8,/多文件 Page 程序已运行/);assert.match(second.sourceUtf8,/多文件 Page R2.2 已运行/);
  assert.equal(first.sourceHash,sha(first.sourceUtf8));
  const plan=await compileLockedPageSource({sourceUtf8:second.sourceUtf8,entryFormat:'async-main',entries:[]});
  assert.equal(plan.world,'USER_SCRIPT');assert.equal(plan.js.length,1);
});

test('L2 committed Controller Locator exceptions propagate from the actual compiled Example',async t=>{
  const p=await copy(t,'sidebar-controller-demo'),source=await p.resolve();
  const failure=Object.assign(new Error('Actual Locator fixture failure'),{code:'E_LOCATOR_NOT_FOUND'});
  const page={getByLabel(){return {fill:async()=>{throw failure;}};}};
  await assert.rejects(execute(source.sourceUtf8,page),failure);
  assert.deepEqual(source.files.filter(x=>x.path.endsWith('.js')).map(x=>x.path),
    ['src/main.js','src/params.js','src/search.js']);
});

test('L2 real remote Example Mock locks A/B/C, OS-denied offline builds and damaged cache fail closed',async t=>{
  const p=await copy(t,'remote-esm-page'),proof=await lockMockRemoteExample(p.root);
  assert.equal(proof.cache.length,3);const first=await p.resolve();
  const output=path.join(p.root,'offline-build');
  // Existing offline process probes actual net.connect denial before Webpack.
  // Requires a Node release with network permissions (CI explicitly pins 26).
  const runOffline=async out=>{
    const {stdout}=await exec(process.execPath,['--permission','--allow-fs-read=*','--allow-fs-write=*',
      path.resolve('tests/framework/r101-offline-build.mjs'),p.root,out]);
    const value=JSON.parse(stdout);assert.equal(value.networkPermission,false);assert.equal(value.probe,'ERR_ACCESS_DENIED');return value.artifact;
  };
  const offline=await runOffline(output);assert.equal(offline.sourceHash,first.sourceHash);
  const file=path.join(p.root,'src/main.js');await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace('20, 22','21, 22'));
  const edited=await runOffline(path.join(p.root,'offline-edited'));assert.notEqual(edited.sourceHash,first.sourceHash);
  const lock=JSON.parse(await fs.readFile(path.join(p.root,'opendesk.remote-lock.json'),'utf8'));
  const row=Object.values(lock.modules)[0],cache=path.join(p.root,'.opendesk/remote-cache',row.sha256+'.mjs');
  const original=await fs.readFile(cache);await fs.writeFile(cache,'export default ()=>0;');
  await assert.rejects(p.resolve(),{code:'E_REMOTE_HASH'});
  await fs.writeFile(cache,original);await fs.unlink(cache);await assert.rejects(p.resolve(),{code:'E_REMOTE_CACHE'});
  assert.equal(first.sourceHash,sha(first.sourceUtf8));
});

test('L2 legal large Webpack output is rejected by full Native run.start bytes, never shortened',async t=>{
  const p=await copy(t,'local-controller');
  await fs.writeFile(path.join(p.root,'src/extract.js'),
    'export async function readSummary(page){return {title:await page.title(),payload:'+JSON.stringify('x'.repeat(61000))+'};}\n');
  const source=await p.resolve();assert.ok(source.sourceBytes>61000&&source.sourceBytes<=65536);
  const envelope={v:1,kind:'request',method:'run.start',requestId:'large-real-webpack',params:{
    registrationId:'large-host',target:{windowId:1,tabId:1,frameId:0,documentId:'large-document',url:'https://example.com/',origin:'https://example.com'},
    sourceHash:source.sourceHash,sourceBytes:source.sourceBytes,source:{kind:'draft',sourceUtf8:source.sourceUtf8},params:{},deadlineMs:30000}};
  const jsonBytes=Buffer.byteLength(JSON.stringify(envelope));assert.ok(jsonBytes>MAX_BYTES);
  assert.throws(()=>requestShape(envelope),error=>error.code==='E_LIMIT'&&error.message.includes('jsonBytes='+jsonBytes));
  assert.equal(envelope.params.source.sourceUtf8,source.sourceUtf8);assert.equal(source.sourceHash,sha(source.sourceUtf8));
});
