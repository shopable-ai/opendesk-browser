import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {transform} from 'esbuild';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {valueText,columnKind,resultKeys,pageRows,resultIdentity,emptyMessage} from '../src/results-model.js';

test('presentation preserves full values, zero, false, nested data and input records',()=>{
  const row={title:'长标题'.repeat(100),price:0,available:false,description:'line\n'.repeat(100),nested:{a:[1,null]},empty:null};
  const before=JSON.stringify(row);
  assert.equal(valueText(row.title),row.title);
  assert.equal(valueText(row.price),'0');assert.equal(valueText(false),'false');
  assert.equal(valueText(null),'');assert.equal(valueText(undefined),'');assert.equal(valueText(''),'');
  assert.deepEqual(JSON.parse(valueText(row.nested)),row.nested);
  assert.deepEqual(resultKeys([row,{url:'https://example.test',title:'other'}]),[...Object.keys(row),'url']);
  assert.equal(JSON.stringify(row),before);
});
test('semantic columns cover title, author, price, URL and long description',()=>{
  for(const [key,kind] of Object.entries({title:'title',name:'title',作者:'author',author:'author',price:'price',detailUrl:'url',href:'url',description:'description',intro:'description',isbn:'text'}))assert.equal(columnKind(key),kind);
  assert.deepEqual(resultKeys([{url:'x',price:2},{title:'T',url:'y'}]),['title','url','price']);
});
test('50-row pages reach every record without mutating or truncating exports',()=>{
  const rows=Array.from({length:121},(_,id)=>({id}));
  assert.deepEqual([0,1,2].flatMap(page=>pageRows(rows,page).rows),rows);
  assert.equal(pageRows(rows,2).start,100);assert.equal(pageRows(rows,2).rows.length,21);
  assert.equal(pageRows(rows,99).page,2);assert.equal(pageRows(rows,-1).page,0);
  assert.deepEqual(pageRows([],0),{page:0,pages:1,start:0,rows:[]});assert.equal(rows.length,121);
});
test('identity changes clear view state while status refreshes keep the same view',()=>{
  const state={profileEpoch:1,selectedId:'a',clientRequestId:'request',runId:'run',snapshot:{resultId:'result',status:'running'}};
  for(const patch of [{profileEpoch:2},{selectedId:'b'},{clientRequestId:'new'},{runId:'new'},{snapshot:{resultId:'new'}}])assert.notEqual(resultIdentity(state),resultIdentity({...state,...patch}));
  assert.equal(resultIdentity(state),resultIdentity({...state,snapshot:{...state.snapshot,status:'completed'}}));
});
test('loading, failure and empty states are distinct',()=>{
  assert.match(emptyMessage({},true),/采集中/);assert.match(emptyMessage({error:'denied'},false),/失败/);
  assert.match(emptyMessage({snapshot:{status:'failed'}},false),/失败/);
  assert.match(emptyMessage({},false),/开始采集/);assert.match(emptyMessage({result:{data:[]}},false),/没有记录/);
});

// Compile JSX in memory; no app build, output-directory writes or browser use.
const require=createRequire(import.meta.url);
const reactUrl=pathToFileURL(require.resolve('react')).href;
const helperUrl=new URL('../src/results-model.js',import.meta.url).href;
const buttonUrl='data:text/javascript,'+encodeURIComponent(`import * as React from ${JSON.stringify(reactUrl)}; export function Button({variant,...props}){return React.createElement('button',props)}`);
const source=await readFile(new URL('../src/Results.jsx',import.meta.url),'utf8');
const compiled=await transform(source.replace("import './results.css';",'').replace("'react'",JSON.stringify(reactUrl)).replace("'@opendesk/ui'",JSON.stringify(buttonUrl)).replace("'./results-model.js'",JSON.stringify(helperUrl)),{loader:'jsx',format:'esm',jsx:'transform'});
const {default:Results}=await import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'));

test('component renders bounded accessible rows, original IDs and escaped untrusted text',()=>{
  const data=Array.from({length:51},(_,i)=>({title:i===0?'<script>unsafe</script>':'row '+i,price:0,author:null,url:'https://example.test/'+i,description:'Long '.repeat(80)}));
  const result={data};const before=JSON.stringify(result);
  const html=renderToStaticMarkup(React.createElement(Results,{state:{result,snapshot:{status:'completed'},retired:true},busy:false,app:{}}));
  for(const id of ['record-summary','run-profile','export-actions','download-csv','download-json','table-help','result-empty','record-scroll','record-table','run-details','refresh-run','host-status','engine-status','stop-status','retired-status','result'])assert.ok(html.includes(`id="${id}"`),id);
  assert.equal((html.match(/<tbody>[\s\S]*<\/tbody>/)?.[0].match(/<tr>/g)||[]).length,50);
  assert.match(html,/第 1 \/ 2 页/);assert.match(html,/&lt;script&gt;unsafe/);assert.ok(!html.includes('<script>unsafe'));
  assert.match(html,/（null）/);assert.match(html,/打开第 1 条完整记录/);assert.match(html,/显示名称/);
  assert.equal(JSON.stringify(result),before);
});
test('component retains original export calls and public copy boundary',()=>{
  assert.match(source,/app.download\('csv'\)/);assert.match(source,/app.download\(\)/);
  assert.match(source,/OpenDeskTool.request\('browser.clipboard.writeText',\{text\}\)/);
  assert.doesNotMatch(source,/navigator\.clipboard|execCommand|dangerouslySetInnerHTML/);
  assert.match(source,/onCancel=/);assert.match(source,/origin\.focus\(\)/);
});
