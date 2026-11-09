import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:[new URL('../src/domain/config.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const config=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
test('0.3.9 legacy preferences are optional, new shortcuts are a strict list of known IDs',()=>{
  const old=config.freshConfig();
  assert.equal(config.validateConfig(old).headerActions,undefined);
  const next={...old,headerActions:['settings','add-proxy']};
  assert.deepEqual(config.validateConfig(next).headerActions,next.headerActions);
  assert.deepEqual(config.validateConfig({...old,headerActions:[]}).headerActions,[]);
  for(const bad of [['settings','settings'],['run-script'],['settings',7],null,{},Array(5).fill('settings')])
    assert.throws(()=>config.validateConfig({...old,headerActions:bad}));
  const exported=config.exportShare(next);
  assert.deepEqual(exported.headerActions,next.headerActions);
  assert.equal(exported.managed,false);
});
