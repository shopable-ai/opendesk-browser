import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {transform} from 'esbuild';
import {parseHTML} from 'linkedom';
import {createPageComponentEntry} from '../../scripts/page-component-entry.mjs';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../src/libs/page-frameworks/contract.js';

async function fixture(framework,fail){
 const {window,document}=parseHTML('<html><body></body></html>');
 const context=vm.createContext({window,document,console:{...console,error(){}},
   setTimeout,clearTimeout,performance,TextEncoder,TextDecoder,
   Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement});
 vm.runInContext(await readFile(PAGE_FRAMEWORK_RUNTIMES[framework].source,'utf8'),context);
 const runtime=context[framework==='react'?'OpenDeskPageReact':'OpenDeskPageVue'];
 const host=document.createElement('div');document.body.append(host);
 let destroyed=false;const cleanups=[];
 const ui={content:host,onDispose:fn=>cleanups.push(fn),getMountDiagnostics:()=>({}),
  destroy(){if(destroyed)return;destroyed=true;for(const fn of cleanups)fn();host.remove();}};
 const Component=framework==='react'?function App(){
   runtime.useLayoutEffect(()=>{if(fail==='layout')throw Error('controlled layout failure');},[]);
   if(fail&&fail!=='layout')throw Error('controlled render failure');return runtime.createElement('button',null,'ready');
 }:{setup(){if(fail)throw typeof fail==='object'?fail.value:Error('controlled render failure');return()=>runtime.h('button',null,'ready');}};
 const source=createPageComponentEntry({id:'completion-test',runtimeKind:'page-userscript',
   entryMode:'component',framework,entry:'App.js'});
 const compiled=await transform(source,{format:'cjs'});
 context.module={exports:{}};context.exports=context.module.exports;
 context.require=name=>name==='@opendesk/ui'?{createPageUI:()=>ui}:
   name.startsWith('./')?{__esModule:true,default:Component}:runtime;
 vm.runInContext(compiled.code,context);
 return {main:context.module.exports.default,host,ui,get destroyed(){return destroyed;}};
}
test('react first layout error cannot be acknowledged as a successful mount',async t=>{
 const f=await fixture('react','layout');t.after(()=>f.ui.destroy());
 await assert.rejects(f.main(),/controlled layout failure/);
 assert.equal(f.destroyed,true);
});
for(const value of [0,null,undefined])test('vue preserves a falsy thrown value: '+String(value),async t=>{
 const f=await fixture('vue',{value});t.after(()=>f.ui.destroy());let rejected=false;
 try{await f.main();}catch(error){rejected=true;assert.equal(error,value);}
 assert.equal(rejected,true);assert.equal(f.destroyed,true);
});
for(const framework of ['react','vue']){
 test(framework+' reports success only after the first real DOM commit',async t=>{
  const f=await fixture(framework,false);t.after(()=>f.ui.destroy());
  const result=await f.main();assert.equal(result.framework,framework);
  assert.equal(f.host.querySelector('button')?.textContent,'ready');
 });
 test(framework+' initial render error rejects and releases its own UI',async t=>{
  const f=await fixture(framework,true);t.after(()=>f.ui.destroy());
  await assert.rejects(f.main(),/controlled render failure/);
  assert.equal(f.destroyed,true);assert.equal(f.host.isConnected,false);
 });
}
