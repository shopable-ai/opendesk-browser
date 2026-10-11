import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePageProgramRules} from '../../src/scripting/user-scripts/page-program-rules.js';

const root=new URL('../../examples/programs/',import.meta.url);
const source=p=>readFile(new URL(p,root),'utf8');

test('R24.1 framework examples use explicit Page rules, managed UI and unmount',async()=>{
  for(const name of ['page-ui-react','page-ui-vue']){
    const pkg=JSON.parse(await source(name+'/package.json'));
    assert.equal(pkg.private,true);
    assert.equal(pkg.opendesk.runtimeKind,'page-userscript');
    const rules=validatePageProgramRules(pkg.opendesk.pageRules);
    assert.deepEqual(rules.matches,['http://127.0.0.1:43111/*']);
    assert.deepEqual(rules.excludeMatches,['http://127.0.0.1/private/*']);
    const entry=await source(name+'/src/main.js');
    assert.match(entry,/createPageUI\(/);
    assert.match(entry,/pageRules/);
    assert.match(entry,/ui\.onDispose\(\(\)\s*=>\s*(root|app)\.unmount\(\)\)/);
    assert.match(entry,/\.\/compiled\/framework\.js/);
    assert.match(entry,/@opendesk\/ui/);
    assert.match(entry,/createDemoEnhancer/);
    const config=await source(name+'/vite.config.mjs');
    assert.match(config,/inlineDynamicImports:true/);
    assert.match(config,/src\/compiled/);
    assert.doesNotMatch(config,/https?:\/\//);
  }
});

test('R24.1 JSX and SFC contain genuine framework source',async()=>{
  assert.match(await source('page-ui-react/src/framework.jsx'),/createRoot\(container\)/);
  assert.match(await source('page-ui-react/src/framework.jsx'),/useState\(/);
  assert.match(await source('page-ui-vue/src/framework.js'),/createApp\(Widget,props\)/);
  assert.match(await source('page-ui-vue/src/Widget.vue'),/<script setup>/);
  assert.match(await source('page-ui-vue/src/Widget.vue'),/ref\(/);
});

test('R24.1 all three examples share a bounded and reversible DOM modification',async()=>{
  const code=await Promise.all(['page-ui-basic','page-ui-react','page-ui-vue'].map(n=>source(n+'/src/enhancement.js')));
  assert.equal(new Set(code).size,1);
  for(const text of code){
    assert.match(text,/rows\.length\s*!==\s*1/);
    assert.match(text,/ui\.observe\(region,sync,\{childList:true,subtree:true\}\)/);
    assert.match(text,/ui\.onDispose/);
    assert.match(text,/oldOutline/);
    assert.doesNotMatch(text,/(?:innerHTML\s*=|eval\()/);
  }
});
