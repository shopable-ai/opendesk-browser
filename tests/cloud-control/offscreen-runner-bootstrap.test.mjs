import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const path='cloud-control/runner.html';
const url='chrome-extension://trusted/'+path;
const source=(await readFile(new URL('../../src/entrypoints/cloud-runner.js',import.meta.url),'utf8'))
  .replace(/^import .*;\n/gm,'').replace('export default ','');

function bootstrap(href=url){
  const calls=[],client={},host={};
  const api={runtime:{getURL:value=>'chrome-extension://trusted/'+value}};
  const document={},runner={start:()=>calls.push('start'),dispose:()=>{}};
  const promise=runInNewContext(source,{
    chrome:api,location:{href},document,CLOUD_RUNNER_DOCUMENT_PATH:path,
    defineUnlistedScript:callback=>callback(),
    createHostClient:actual=>{assert.equal(actual,api);calls.push('client');return client;},
    createRunHost:options=>{assert.equal(options.api,api);assert.equal(options.client,client);
      assert.equal(options.document,document);assert.equal(options.templateModuleFactory,null);
      calls.push('host');return host;},
    createCloudRunnerLoop:options=>{assert.equal(options.client,client);assert.equal(options.host,host);
      calls.push('loop');return runner;},
    window:{addEventListener:(type,callback,options)=>{assert.equal(type,'pagehide');
      assert.equal(callback,runner.dispose);assert.equal(options.once,true);calls.push('pagehide');}}
  });
  return {promise,calls};
}

test('real offscreen runtime surface without getContexts starts the original Host and runner',async()=>{
  const {promise,calls}=bootstrap();await promise;
  assert.deepEqual(calls,['client','host','loop','pagehide','start']);
});

test('a noncanonical URL cannot bootstrap the fixed runner document',async()=>{
  for(const href of ['https://example.com/',url+'?fake=1']){
    const {promise,calls}=bootstrap(href);
    await assert.rejects(promise,/E_CLOUD_RUNNER_IDENTITY/);
    assert.deepEqual(calls,[]);
  }
});
