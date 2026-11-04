import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const path='cloud-control/runner.html';
const url='chrome-extension://trusted/'+path;
const source=(await readFile(new URL('../../src/entrypoints/cloud-runner.js',import.meta.url),'utf8'))
  .replace(/^import .*;\n/gm,'').replace('export default ','');

function bootstrap(href=url){
  const calls=[],client={},host={cancelStart:requestId=>calls.push(['cancel',requestId]),
    currentRun:'run-one',stop:async value=>calls.push(['stop',value.runId])};
  let listener,hide;
  const api={runtime:{id:'trusted',getURL:value=>'chrome-extension://trusted/'+value,
    onMessage:{addListener:value=>{listener=value;},removeListener:value=>{assert.equal(value,listener);listener=null;}}}};
  const document={},runner={start:()=>calls.push('start'),dispose:()=>{}};
  const promise=runInNewContext(source,{
    chrome:api,location:{href},document,CLOUD_RUNNER_DOCUMENT_PATH:path,WEB_TASK_PROTOCOL:'opendesk.web-task.v1',
    defineUnlistedScript:callback=>callback(),
    createHostClient:actual=>{assert.equal(actual,api);calls.push('client');return client;},
    createRunHost:options=>{assert.equal(options.api,api);assert.equal(options.client,client);
      assert.equal(options.document,document);assert.equal(options.templateModuleFactory,null);
      calls.push('host');return host;},
    createCloudRunnerLoop:options=>{assert.equal(options.client,client);assert.equal(options.host,host);
      calls.push('loop');return runner;},
    window:{addEventListener:(type,callback,options)=>{assert.equal(type,'pagehide');
      hide=callback;assert.equal(options.once,true);calls.push('pagehide');}}
  });
  return {promise,calls,send:(message,sender)=>new Promise(resolve=>{
    if(!listener(message,sender,resolve))resolve(null);}),hide:()=>hide()};
}

test('real offscreen runtime surface without getContexts starts the original Host and runner',async()=>{
  const {promise,calls}=bootstrap();await promise;
  assert.deepEqual(calls,['client','host','loop','pagehide','start']);
});
test('only fixed SW can stop its exact active background Run; another Run is left alone',async()=>{
  const h=bootstrap();await h.promise;
  const message={protocol:'opendesk.web-task.v1',kind:'stop-owned',requestId:'original-request',runId:'run-one'};
  assert.equal(await h.send(message,{id:'trusted',url:'chrome-extension://trusted/sidepanel.html'}),null);
  assert.equal(await h.send(message,{id:'trusted',tab:{id:7}}),null);
  await h.send({...message,runId:'other-run'},{id:'trusted'});
  assert.equal(h.calls.filter(row=>Array.isArray(row)&&row[0]==='stop').length,0);
  await h.send(message,{id:'trusted'});
  assert.deepEqual(h.calls.at(-1),['stop','run-one']);h.hide();
});

test('a noncanonical URL cannot bootstrap the fixed runner document',async()=>{
  for(const href of ['https://example.com/',url+'?fake=1']){
    const {promise,calls}=bootstrap(href);
    await assert.rejects(promise,/E_CLOUD_RUNNER_IDENTITY/);
    assert.deepEqual(calls,[]);
  }
});
