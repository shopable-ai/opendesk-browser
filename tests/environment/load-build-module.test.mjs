import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createBuildModuleLoader} from '../../scripts/load-build-module.mjs';
import developmentBuild from '../../modules/development-build.js';

test('fresh build graphs reload transitive code, retain old identity and share external caches',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'opendesk-build-loader-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const root=join(directory,'repo');await mkdir(root);
  const write=(path,text)=>writeFile(join(root,path),text);
  await mkdir(join(root,'node_modules/fixture-dependency'),{recursive:true});
  await write('node_modules/fixture-dependency/package.json',JSON.stringify({type:'module',exports:'./index.js'}));
  await write('node_modules/fixture-dependency/index.js','export const identity = {};');
  await writeFile(join(directory,'outside.mjs'),'export const identity = {};');
  await symlink(join(directory,'outside.mjs'),join(root,'outside-link.mjs'));
  await write('leaf.mjs','export const value = 1; export const identity = {};');
  await write('middle.js',"export {value,identity} from './leaf.mjs';");
  await write('entry.mjs',`export {value,identity} from './middle.js';
    export {identity as dependency} from 'fixture-dependency';
    export {identity as outside} from '../outside.mjs';
    export {identity as linkedOutside} from './outside-link.mjs';
    export const later = () => import('./leaf.mjs');`);
  const ordinary=createBuildModuleLoader({fresh:false,root});
  const baseline=await ordinary('./entry.mjs');
  assert.equal(baseline,await import(pathToFileURL(join(root,'entry.mjs')).href));
  const firstLoader=createBuildModuleLoader({fresh:true,root});
  const first=await firstLoader('./entry.mjs');
  assert.notEqual(first.identity,baseline.identity);
  assert.equal((await firstLoader('./leaf.mjs')).identity,first.identity);
  await write('leaf.mjs','export const value = 2; export const identity = {};');
  const secondLoader=createBuildModuleLoader({fresh:true,root});
  const second=await secondLoader('./entry.mjs');
  assert.equal(first.value,1);assert.equal(second.value,2);
  assert.notEqual(first.identity,second.identity);
  assert.equal((await first.later()).identity,first.identity);
  assert.equal((await second.later()).identity,second.identity);
  assert.equal(await firstLoader('./entry.mjs'),first);
  assert.equal(await ordinary('./entry.mjs'),baseline);
  for(const graph of [first,second]){
    assert.equal(graph.dependency,baseline.dependency);
    assert.equal(graph.outside,baseline.outside);
    assert.equal(graph.linkedOutside,baseline.linkedOutside);
  }
  assert.equal((await secondLoader('../outside.mjs')).identity,baseline.outside);
});

test('WXT recovery keeps fixed content registrations in sync with fresh hooks',async t=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-build-module-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const chatgpt={matches:['https://chatgpt.com/*'],js:['agents/chatgpt-fixed-bridge.js']};
  const gemini={matches:['https://gemini.google.com/*'],js:['agents/gemini-fixed-send-queue.js']};
  const writeGeneration=(value,contentScripts)=>writeFile(join(root,'leaf.mjs'),
    'export const value='+value+'; export const contentScripts='+JSON.stringify(contentScripts)+';');
  await writeGeneration(1,[chatgpt]);
  await writeFile(join(root,'wxt.config.mjs'),`import {value,contentScripts} from './leaf.mjs';
    export default {manifest:{content_scripts:contentScripts},hooks:{'build:done':()=>value}};`);
  const cachedManifest=()=>({content_scripts:structuredClone([chatgpt]),name:'protected-name'});
  const fixture=()=>{
    const registered=new Map();
    return {config:{root,command:'serve',hooks:{stale:true},manifest:cachedManifest(),outDir:'protected-output',vite:'protected-vite'},
      hook:(name,fn)=>registered.set(name,fn),registered};
  };
  const first=fixture();await developmentBuild.setup(first);
  const installed=first.config.hooks;
  assert.equal(installed['build:done'](),1);
  await writeGeneration(2,[chatgpt,gemini]);
  const next=fixture();await developmentBuild.setup(next);
  const nextHooks=next.config.hooks;
  assert.equal(nextHooks['build:done'](),2);
  assert.deepEqual(next.config.manifest,{content_scripts:[chatgpt,gemini],name:'protected-name'});
  next.config={...next.config,hooks:{stale:true},manifest:cachedManifest()};
  next.registered.get('config:resolved')();
  assert.equal(next.config.hooks,nextHooks);
  assert.deepEqual(next.config.manifest,{content_scripts:[chatgpt,gemini],name:'protected-name'});
  assert.equal(next.config.outDir,'protected-output');
  assert.equal(next.config.vite,'protected-vite');
  assert.equal(installed['build:done'](),1);
  assert.deepEqual(first.config.manifest.content_scripts,[chatgpt]);
});

test('static builds do not refresh config or register development hooks',async()=>{
  const config={command:'build',root:'/not-a-project',hooks:{unchanged:true}};
  await developmentBuild.setup({config,hook:()=>assert.fail('static hook registered')});
  assert.deepEqual(config.hooks,{unchanged:true});
});
