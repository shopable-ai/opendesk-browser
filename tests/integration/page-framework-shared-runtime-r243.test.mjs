// Run AFTER both framework example projects execute npm run build:framework.
// This is a real Vite -> real OpenDesk builder contract, NOT a Chrome PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../src/libs/page-frameworks/contract.js';
import {compileLockedPageSource,pageSelectedPackagedLibrary} from '../../src/scripting/user-scripts/execution-source.js';

globalThis.crypto ||= webcrypto;

for(const id of ['react','vue']){
  test(`R24.3 ${id} genuine authoring compiles to a bounded OpenDesk Page program with no duplicated runtime`,async()=>{
    const directory=`examples/programs/page-ui-${id}`;
    const generated=`${directory}/src/compiled/framework.js`;
    const generatedBytes=await readFile(generated);
    assert.ok(generatedBytes.length>100 && generatedBytes.length<50000,
      `${generated}: component-only output must not contain the framework runtime`);
    const js=generatedBytes.toString('utf8');
    assert.doesNotMatch(js,/\bimport\s*(?:\{|\*|[\w$])[^;]*?from\s*['"](?:vue|react|react-dom)/);
    assert.doesNotMatch(js,/\beval\s*\(|\bnew\s+Function\s*\(|\bimport\s*\(/);
    assert.match(js,id==='react'?/OpenDeskPageReact/:/OpenDeskPageVue/);

    const pkg=JSON.parse(await readFile(`${directory}/package.json`,'utf8'));
    assert.equal(pkg.opendesk.framework,id);
    const validation=await validateProgramProject(directory);
    assert.equal(validation.runtimeKind,'page-userscript');
    assert.deepEqual(validation.npmDependencies,[],
      'framework must be supplied by extension instead of bundled from project node_modules');

    const output=await buildProgramProjectInMemory(directory,{mode:'production'});
    assert.ok(output.sourceBytes>0&&output.sourceBytes<=100000,
      'final Page execution byte budget remains unchanged');
    assert.equal(pageSelectedPackagedLibrary(output.sourceUtf8),id);
    assert.match(output.sourceUtf8,new RegExp('\\/\\/ @opendesk-lib '+id));

    const row=PAGE_FRAMEWORK_RUNTIMES[id],frameworkSource={
      id:row.id,version:row.version,sha256:row.sha256,
      code:await readFile(row.source,'utf8')
    };
    const prepared=await compileLockedPageSource({
      sourceUtf8:output.sourceUtf8,entryFormat:'async-main',entries:[],frameworkSource
    });
    assert.equal(prepared.packagedFrameworkId,id);
    assert.equal(prepared.packagedFrameworkSha256,row.sha256);
    assert.equal(prepared.world,'USER_SCRIPT');
    assert.equal(prepared.js.length,1);
  });
}

test('R24.3 Vue SFC adapter shares pinned Vue h/ref/onMounted and fails closed on version mismatch',async()=>{
  const source='../../examples/programs/page-ui-vue/src/vue-runtime-adapter.js';
  const {createApp,ref,onMounted,createElementVNode,createElementBlock,openBlock,toDisplayString}=await import(source);
  const previous=globalThis.OpenDeskPageVue;
  const calls=[];
  try{
    globalThis.OpenDeskPageVue={
      version:'3.5.22',
      createApp:(...args)=>{calls.push(['app',args]);return {mount(){}};},
      ref:x=>({value:x}),onMounted:fn=>{calls.push(['mounted',fn]);},
      h:(...args)=>{calls.push(['h',args]);return {__vnode:true,args};}
    };
    assert.equal(ref('ready').value,'ready');
    assert.equal(createApp('Widget').mount instanceof Function,true);
    const fn=()=>{};onMounted(fn);
    assert.equal(openBlock(),undefined);
    assert.deepEqual(createElementVNode('p',null,'Hi').args,['p',null,'Hi']);
    assert.deepEqual(createElementBlock('button',{},'Press',1).args,['button',{},'Press']);
    assert.equal(toDisplayString(null),'');
    assert.equal(toDisplayString(2),'2');
    globalThis.OpenDeskPageVue={...globalThis.OpenDeskPageVue,version:'3.5.23'};
    assert.throws(()=>ref(false),/E_PAGE_FRAMEWORK_NOT_READY/);
  }finally{
    if(previous===undefined)delete globalThis.OpenDeskPageVue;
    else globalThis.OpenDeskPageVue=previous;
  }
});
