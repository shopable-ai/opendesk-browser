import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {build} from 'esbuild';
import {BUILTIN_TASK_RELEASES,PACKAGED_TASK_RESOURCES,loadPackagedTask} from '../../src/platform/tasks/builtin-releases.js';
import {preparePackagedTaskResources,verifyPackagedTaskResources,readPackagedTaskResource} from '../../scripts/packaged-task-resources.mjs';
import {TASK_PACKAGE_LIMIT} from '../../src/platform/source-budgets.js';

const runtime={id:'task-test',getURL:path=>'chrome-extension://task-test/'+path};
const release=BUILTIN_TASK_RELEASES[0],resource=PACKAGED_TASK_RESOURCES.find(row=>row.taskId===release.taskId);
const raw=await readFile(resolve(resource.sourcePath),'utf8');
const reply=(url,text=raw)=>({ok:true,redirected:false,url,text:async()=>text});

test('Task package source stays data outside the fixed runtime import graph',async()=>{
  const result=await build({entryPoints:['src/platform/tasks/builtin-releases.js'],bundle:true,write:false,metafile:true,format:'esm',logLevel:'silent'});
  assert.ok(Object.keys(result.metafile.inputs).every(path=>path.startsWith('src/')&&!path.endsWith('.json')));
  const pkg=JSON.parse(raw);
  assert.equal(result.outputFiles[0].text.includes(pkg.sourceUtf8),false);
});

test('private Task resource loader returns exact reviewed packages including historical versions',async()=>{
  for(const row of PACKAGED_TASK_RESOURCES){
    const text=await readFile(resolve(row.sourcePath),'utf8');
    const pkg=await loadPackagedTask(row,{runtime,fetchImpl:async(url,options)=>{
      assert.equal(url,runtime.getURL(row.path));assert.equal(options.credentials,'omit');
      assert.equal(options.cache,'no-store');assert.ok(options.signal);
      return reply(url,text);
    }});
    assert.equal(pkg.manifestHash,row.manifestHash);assert.equal(pkg.manifest.program.sourceHash,row.sourceHash);
  }
  let fetched=false;
  assert.equal(await loadPackagedTask({...release,sourceHash:'0'.repeat(64)},{runtime,fetchImpl:()=>{fetched=true;}}),null);
  assert.equal(fetched,false);
});

test('Task loader rejects missing, redirected, cross-origin, malformed, oversized and substituted data',async()=>{
  const fail=(fetchImpl,code)=>assert.rejects(loadPackagedTask(release,{runtime,fetchImpl}),{code});
  await fail(async url=>({...reply(url),ok:false}),'E_BUILTIN_RESOURCE');
  await fail(async url=>({...reply(url),redirected:true}),'E_BUILTIN_RESOURCE');
  await fail(async()=>reply('https://example.com/task.json'),'E_BUILTIN_RESOURCE');
  await fail(async url=>reply(url,'{'),'E_SCHEMA');
  await fail(async url=>reply(url,' '.repeat(TASK_PACKAGE_LIMIT+1)),'E_LIMIT');
  const tampered=JSON.parse(raw);tampered.sourceUtf8+='tampered';
  await fail(async url=>reply(url,JSON.stringify(tampered)),'E_HASH');
  const other=await readFile(resolve(PACKAGED_TASK_RESOURCES.find(row=>row.taskId!==release.taskId).sourcePath),'utf8');
  await fail(async url=>reply(url,other),'E_VERIFICATION');
  let fetched=false;
  await assert.rejects(loadPackagedTask(release,{runtime:{...runtime,getURL:path=>'https://example.com/'+path},fetchImpl:()=>{fetched=true;}}),{code:'E_BUILTIN_RESOURCE'});
  assert.equal(fetched,false);
});

test('asset preparation and package verification reject drift and symlinks without changing valid output',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'task-resources-'))),output=join(root,'output');
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const row of PACKAGED_TASK_RESOURCES){
    const file=join(root,row.sourcePath);await mkdir(dirname(file),{recursive:true});
    await writeFile(file,await readFile(resolve(row.sourcePath)));
  }
  await preparePackagedTaskResources(output,{root});await verifyPackagedTaskResources(output,{root});
  const target=join(output,resource.path),before=await readFile(target);
  const source=join(root,resource.sourcePath);
  await writeFile(source,raw.replace('async function main','async function changed'));
  await assert.rejects(preparePackagedTaskResources(output,{root}));
  assert.deepEqual(await readFile(target),before);
  await rm(source);await symlink(resolve(resource.sourcePath),source);
  await assert.rejects(readPackagedTaskResource(resource.sourcePath,{root}),/must not be a symlink/);
  await rm(source);await writeFile(source,raw);
  await writeFile(target,before.toString()+' ');
  await assert.rejects(verifyPackagedTaskResources(output,{root}),/differs from reviewed source/);
});
