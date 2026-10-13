import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {rollup} from 'rollup';
import vm from 'node:vm';
import config from '../../wxt.config.mjs';
import {createRunHost} from '../../src/run-host.js';

test('Sidebar omits disabled template code while preserving modern Host and source compatibility',async()=>{
  const editor=await readFile('src/ui/script-editor.js','utf8');
  assert.ok(editor.includes('hostFactory({api, client, document: doc, templateModuleFactory: null})'));
  const runHost=resolve('src/run-host.js'),buildConfig={mode:'development',build:{lib:{},rollupOptions:{},terserOptions:{},sourcemap:false},plugins:[]};
  config.hooks['vite:build:extendConfig']([{name:'tool-shell',type:'unlisted-script'}],buildConfig);
  const policy=buildConfig.plugins.find(plugin=>plugin.name==='opendesk-fixed-tool-shell');
  const shim='\0sidebar-host-contract';
  const bundle=await rollup({input:shim,plugins:[{name:'sidebar-host-contract',
    resolveId(id){if(id===shim)return id;},
    load(id){if(id===shim)return `export {createRunHost} from ${JSON.stringify(runHost)};`;},
    transform(code,id){return policy.transform(code,id);}}]});
  let chunk;
  try{chunk=(await bundle.generate({format:'iife',name:'sidebarHost'})).output[0];}
  finally{await bundle.close();}
  assert.equal(Object.entries(chunk.modules).some(([id,row])=>id.includes('/features/scraping/')&&row.renderedLength>0),false);
  assert.doesNotMatch(chunk.code,/\.compileTemplate\(/);
  const context=vm.createContext({TextEncoder,TextDecoder,Uint8Array,crypto,URL,Blob,structuredClone,performance,DOMException,setTimeout,clearTimeout});
  vm.runInContext(chunk.code,context);
  const options={api:{},document:{},client:{ready:Promise.resolve(),controller:{},runCommands:{},storage:{},pagePort:{},exportBridge:{},entitlement:{}}};
  const source=createRunHost({...options,templateModuleFactory:null}),compiled=context.sidebarHost.createRunHost(options);
  try{
    assert.throws(()=>source.module,{code:'E_MODULE_NOT_INSTALLED'});
    assert.throws(()=>compiled.module,{code:'E_MODULE_NOT_INSTALLED'});
    for(const name of ['start','stop','subscribe','resourceSnapshot','dispose'])assert.equal(typeof compiled[name],'function',name);
    assert.equal(compiled.currentRun,null);assert.equal(compiled.executionPending,false);
    assert.equal(JSON.stringify(compiled.handshake),JSON.stringify(source.handshake));
    const disabled={code:'E_MODULE_NOT_INSTALLED',message:'Template module is disabled or unregistered'};
    await assert.rejects(source.start({}),disabled);
    await assert.rejects(compiled.start({}),disabled);
  }finally{source.dispose();compiled.dispose();}
  const injected={dispose(){}};
  const custom=createRunHost({...options,templateModuleFactory:()=>injected});
  assert.equal(custom.module,injected);custom.dispose();
  for(const factory of [args=>createRunHost({...args,templateModuleFactory:null}),context.sidebarHost.createRunHost]){
    const rejected={code:'E_NATIVE_NOT_READY'};
    const offline=factory({...options,client:{...options.client,ready:Promise.reject(rejected)}});
    await assert.rejects(offline.start({}),error=>error===rejected);offline.dispose();
    const closed=factory({...options,client:{...options.client,ready:new Promise(()=>{})}});
    closed.dispose();await assert.rejects(closed.start({}),{code:'E_OWNER'});
  }
  const code=await readFile(runHost,'utf8');
  assert.equal(policy.transform(code,runHost)?.code.includes('templateModuleFactory = null'),true);
  const otherConfig={...buildConfig,build:{...buildConfig.build},plugins:[]};
  config.hooks['vite:build:extendConfig']([{name:'marketplace',type:'unlisted-script'}],otherConfig);
  assert.equal(otherConfig.plugins.find(plugin=>plugin.name==='opendesk-fixed-marketplace').transform(code,runHost),undefined);
});
