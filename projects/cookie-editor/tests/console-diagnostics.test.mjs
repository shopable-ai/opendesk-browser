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
  const info=t.mock.method(console,'info',()=>{});
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
  return {controller,adapter,calls,successes,logs:()=>log.mock.calls.map(call=>call.arguments),infos:()=>info.mock.calls.map(call=>call.arguments)};
}

test('success callbacks and the structured import diagnostic each have one owner',async t=>{
  const {controller:c,calls,successes,logs,infos}=await fixture(t);
  assert.equal(await c.save(row),true);
  assert.equal((await c.previewImport(source)).accepted,1);
  assert.equal(await c.executeImport(source),true);
  assert.equal(await c.exportTo({method:'copy'}),true);
  assert.equal(await c.exportTo({method:'download'}),true);
  assert.deepEqual(calls,{write:2,copy:1,download:1});
  assert.deepEqual(successes.map(s=>s.match(/保存|导入|复制|下载/)[0]),['保存','复制','下载']);
  assert.deepEqual(logs(),[]);
  assert.equal(infos().length,1);
  assert.equal(infos()[0][1].confirmed,1);
  assert.doesNotMatch(JSON.stringify(infos()),/PRIVATE_COOKIE|https:/);
});

test('direct import defers conflict checks to the batch Host without preflight list reads',async t=>{
  const {controller:c,adapter:a}=await fixture(t);
  let batches=0;
  a.supportsWriteMany=()=>true;
  a.getPartition=async()=>assert.fail('No partition lookup for an unpartitioned import');
  a.exactList=async()=>assert.fail('The batch Host owns exact conflict decisions');
  a.writeMany=async(_target,items,options)=>{
    batches++;
    assert.equal(options.skipConflicts,true);
    assert.equal(items[0].ifAbsent,true);
    return {saved:0,verified:0,results:[{
      index:0,saved:false,verified:false,skipped:true,code:'E_COOKIE_CONFLICT'}]};
  };
  const plan=await c.previewImport(source,'json',false,{submitDirectly:true});
  assert.equal(plan.accepted,1);
  assert.equal(batches,0);
  assert.equal(await c.executeImport(source,'json',false),true);
  assert.equal(batches,1);
  const {confirmed,skipped}=c.snapshot().importResult;
  assert.deepEqual({confirmed,skipped},{confirmed:0,skipped:1});
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
  assert.deepEqual(c.snapshot().unknownEffects,['copy']);
  assert.deepEqual(calls,{write:2,copy:1,download:1});
  assert.deepEqual(successes,[]);
  assert.deepEqual(logs(),[
    ['[Cookie Editor]',{operation:'save',stage:'write',code:'E_COOKIE_SET',status:'failed'}],
    ['[Cookie Editor] 导入回执',{operation:'import',...c.snapshot().importResult}],
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
