import test from 'node:test';
import assert from 'node:assert/strict';
import {createCookieController} from '../app/controller/cookie-controller.js';
import {parseTarget} from '../app/domain/cookie-model.js';

const url='https://diagnostic.example.test/private-path?private-query=1';
const row={name:'PRIVATE_COOKIE_NAME',value:'PRIVATE_COOKIE_VALUE',domain:'diagnostic.example.test',
  path:'/private-path',hostOnly:true,session:true,storeId:'0'};
const fault=code=>Object.assign(Error('RAW_HOST_DETAIL '+url+' '+row.value),{code,reply:{row,url}});
const source=JSON.stringify([row]);

async function fixture(t){
  const log=t.mock.method(console,'warn',()=>{});
  const successes=[];
  const calls={write:0,copy:0,download:0};
  const adapter={targetFor:async()=>({target:parseTarget(url)}),checkRead:async()=>({callableNow:true}),
    getStore:async()=>({storeId:'0'}),getPartition:async()=>({partitionKey:{topLevelSite:new URL(url).origin}}),
    list:async(at,{includeValues}={})=>includeValues?[{...row,valueRedacted:false}]:
      [{...row,value:undefined,valueRedacted:true}],
    exactList:async()=>[],supportsWriteMany:()=>false,
    write:async()=>{calls.write++;return {saved:true,verified:true};},
    beginExportIntent:async()=>({authorized:true,ref:1}),finishExportIntent:async()=>{},
    copy:async()=>{calls.copy++;return {copied:true};},
    download:async()=>{calls.download++;return {started:true};}};
  const controller=createCookieController({adapter,onSuccess:message=>successes.push(message)});
  t.after(()=>controller.dispose());
  assert.equal(await controller.load(),true);
  return {controller,adapter,calls,successes,logs:()=>log.mock.calls.map(call=>call.arguments)};
}

test('verified save, import and export keep success feedback and no Console diagnostics',async t=>{
  const {controller:c,calls,successes,logs}=await fixture(t);
  assert.equal(await c.save(row),true);
  assert.equal((await c.previewImport(source)).accepted,1);
  assert.equal(await c.executeImport(source),true);
  assert.equal(await c.exportTo({method:'copy'}),true);
  assert.equal(await c.exportTo({method:'download'}),true);
  assert.deepEqual(calls,{write:2,copy:1,download:1});
  assert.deepEqual(successes.map(s=>s.match(/保存|导入|复制|下载/)[0]),['保存','导入','复制','下载']);
  assert.deepEqual(logs(),[]);
});

test('save, import and export diagnostics contain only operation, stage, allowlisted code and result',async t=>{
  const {controller:c,adapter:a,calls,successes,logs}=await fixture(t);
  a.write=async()=>{calls.write++;throw fault('E_PRIVATE_'+row.value);};
  assert.equal(await c.save(row),false);
  assert.match(c.snapshot().message,/手动核对/);
  a.write=async()=>{calls.write++;return {saved:true,verified:false,raw:row};};
  assert.equal((await c.previewImport(source)).accepted,1);
  assert.equal(await c.executeImport(source),false);
  assert.equal(c.snapshot().importOutcome,'unknown');
  a.copy=async()=>{calls.copy++;throw fault('E_OUTCOME_UNKNOWN');};
  assert.equal(await c.exportTo({method:'copy'}),false);
  assert.match(c.snapshot().message,/先核对剪贴板或下载记录/);
  a.download=async()=>{calls.download++;throw fault('E_DOWNLOAD');};
  assert.equal(await c.exportTo({method:'download'}),false);
  assert.match(c.snapshot().message,/检查浏览器下载设置，或改用复制/);
  assert.doesNotMatch(c.snapshot().message,/E_DOWNLOAD|RAW_HOST_DETAIL|PRIVATE_COOKIE/);
  assert.deepEqual(c.snapshot().unknownEffects,['import','copy']);
  assert.deepEqual(calls,{write:2,copy:1,download:1});
  assert.deepEqual(successes,[]);
  assert.deepEqual(logs(),[
    ['[Cookie Editor]',{operation:'save',stage:'write',code:'E_COOKIE_SET',status:'failed'}],
    ['[Cookie Editor]',{operation:'import',stage:'receipt',code:'E_OUTCOME_UNKNOWN',status:'unknown'}],
    ['[Cookie Editor]',{operation:'copy',stage:'clipboard',code:'E_OUTCOME_UNKNOWN',status:'unknown'}],
    ['[Cookie Editor]',{operation:'download',stage:'download',code:'E_DOWNLOAD',status:'failed'}]
  ]);
  assert.doesNotMatch(JSON.stringify(logs()),/PRIVATE_COOKIE|RAW_HOST_DETAIL|https:|diagnostic.example.test|private-path|private-query/);
});

test('import preflight errors are recoverable and ordinary export cancellation is silent',async t=>{
  const {controller:c,calls,adapter:a,logs}=await fixture(t);
  assert.equal(await c.previewImport('{'+row.value,'json'),null);
  assert.match(c.snapshot().message,/原文保留/);
  a.beginExportIntent=async()=>{throw fault('E_CANCELLED');};
  assert.equal(await c.exportTo({method:'copy'}),false);
  assert.match(c.snapshot().message,/已取消/);
  assert.deepEqual(c.snapshot().unknownEffects,[]);
  assert.equal(calls.copy,0);
  assert.deepEqual(logs(),[['[Cookie Editor]',{operation:'import',stage:'parse',code:'E_COOKIE_IMPORT',status:'failed'}]]);
});

test('a failed read identifies the stage without logging the reply and can be retried',async t=>{
  const {controller:c,adapter:a,logs}=await fixture(t);
  const list=a.list;
  a.list=async()=>{throw fault('E_COOKIE_READ');};
  assert.equal(await c.load(),undefined);
  assert.equal(c.snapshot().phase,'error');
  assert.match(c.snapshot().message,/手动刷新/);
  a.list=list;
  assert.equal(await c.load(),true);
  assert.equal(c.snapshot().phase,'ready');
  assert.deepEqual(logs(),[['[Cookie Editor]',{operation:'load',stage:'list',code:'E_COOKIE_READ',status:'failed'}]]);
});
