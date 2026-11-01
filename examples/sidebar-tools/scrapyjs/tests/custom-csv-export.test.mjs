import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const context=vm.createContext({TextEncoder});
vm.runInContext(await readFile(new URL('../adapters/app-sdk.js',import.meta.url),'utf8'),context);
function fixture(){
  const calls=[];
  const sdk=context.ScrapyAppSdk.createSdk(async(operation,payload)=>{calls.push({operation,...payload});return {started:true};});
  return {sdk,calls};
}

test('custom CSV uses one complete order for both renamed headers and every data row',async()=>{
  const {sdk,calls}=fixture();
  const snapshot={result:{data:[{title:'A',price:0,nested:{a:[1,null]}},{title:'B',price:false,extra:'last'}]}};
  const output={fieldOrder:['extra','nested','price','title'],fieldNames:{title:'标题',nested:'详情',extra:' '}};
  const before=JSON.stringify({snapshot,output});
  await sdk.download(snapshot,'csv',output);
  assert.equal(calls[0].operation,'browser.downloads.text');
  assert.equal(calls[0].text,'"extra","详情","price","标题"\r\n"","{""a"":[1,null]}","0","A"\r\n"last","","false","B"');
  await sdk.download(snapshot,'csv');
  assert.ok(calls[1].text.startsWith('"title","price","nested","extra"\r\n"A","0",'));
  await sdk.download(snapshot,'json',output);
  assert.equal(calls[2].text,JSON.stringify(snapshot,null,2));
  assert.equal(JSON.stringify({snapshot,output}),before);
});

test('invalid custom orders fail before requesting a download and never omit fields',async()=>{
  const {sdk,calls}=fixture(),snapshot={result:{data:[{title:'A'},{later:'B'}]}};
  for(const fieldOrder of [null,undefined,'title,later',{},[],['title'],['title','title'],['title','unknown'],['title',1],['title',{}],['title',,'later'],Array(2)]){
    await assert.rejects(sdk.download(snapshot,'csv',{fieldOrder}),/CSV 列顺序无效/);
  }
  assert.equal(calls.length,0);
  await sdk.download({value:{data:snapshot.result.data}},'csv',{fieldOrder:['later','title']});
  assert.equal(calls[0].text,'"later","title"\r\n"","A"\r\n"B",""');
});

test('reordering retains normalized name validation, blank fallback and duplicate rejection',async()=>{
  const {sdk,calls}=fixture(),snapshot={result:{data:[{title:'A',source:'B'}]}};
  const fieldOrder=['source','title'];
  await sdk.download(snapshot,'csv',{fieldOrder,fieldNames:{source:'  e\u0301  ',title:' '}});
  assert.equal(calls[0].text,'"é","title"\r\n"B","A"');
  for(const fieldNames of [{source:'title'},{source:'é',title:'e\u0301'},{source:3},{source:'x\n'},{source:'x'.repeat(81)}])
    await assert.rejects(sdk.download(snapshot,'csv',{fieldOrder,fieldNames}),/CSV 表头名称/);
  assert.equal(calls.length,1);
});

test('custom ordering protects formulas in headers and cells without changing numeric values or JSON',async()=>{
  const {sdk,calls}=fixture();
  const snapshot={result:{data:[{title:'  =1+1',source:'\tcommand',number:-2},{title:'+cmd',source:'@SUM(A1)',number:0}]}};
  await sdk.download(snapshot,'csv',{fieldOrder:['number','source','title'],fieldNames:{title:'=header'}});
  assert.equal(calls[0].text,'"number","source","\'=header"\r\n"-2","\'\tcommand","\'  =1+1"\r\n"0","\'@SUM(A1)","\'+cmd"');
  await sdk.download(snapshot,'json');
  assert.equal(calls[1].text,JSON.stringify(snapshot,null,2));
});

test('custom CSV exports all records and enforces the UTF-8 limit without truncation',async()=>{
  const {sdk,calls}=fixture();
  const snapshot={result:{data:Array.from({length:121},(_,index)=>({title:'记录 '+index,source:index}))}};
  await sdk.download(snapshot,'csv',{fieldOrder:['source','title']});
  assert.equal(calls[0].text.split('\r\n').length,122);
  assert.ok(calls[0].text.endsWith('"120","记录 120"'));
  await sdk.download({result:{data:[{a:'x'.repeat(149993)}]}},'csv',{fieldOrder:['a']});
  assert.equal(new TextEncoder().encode(calls[1].text).length,150000);
  await assert.rejects(sdk.download({result:{data:[{a:'x'.repeat(149994)}]}},'csv',{fieldOrder:['a']}),/150000/);
  await assert.rejects(sdk.download({result:{data:[{a:'中'.repeat(50000)}]}},'csv',{fieldOrder:['a']}),/150000/);
  assert.equal(calls.length,2);
});
