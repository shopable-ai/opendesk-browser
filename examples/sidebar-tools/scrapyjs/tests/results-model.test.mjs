import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {transform} from 'esbuild';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createExtensionCenterDOM} from '../../../../tests/helpers/extension-center-react-dom.mjs';
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
const buttonUrl='data:text/javascript,'+encodeURIComponent(`import * as React from ${JSON.stringify(reactUrl)}; export function Button({variant,base,...props}){return React.createElement('button',props)};export function IconButton({label,...props}){return React.createElement('button',{'aria-label':label,...props})};export function Input(props){return React.createElement('input',props)};export function Textarea(props){return React.createElement('textarea',props)}`);
const source=await readFile(new URL('../src/Results.jsx',import.meta.url),'utf8');
const columnSource=await readFile(new URL('../src/ColumnSettings.jsx',import.meta.url),'utf8');
const orderSource=await readFile(new URL('../src/FieldOrder.jsx',import.meta.url),'utf8');
const orderCompiled=await transform(orderSource.replace("'react'",JSON.stringify(reactUrl)).replace("'@opendesk/ui'",JSON.stringify(buttonUrl)),{loader:'jsx',format:'esm',jsx:'transform'});
const orderUrl='data:text/javascript;base64,'+Buffer.from(orderCompiled.code).toString('base64');
const columnCompiled=await transform(columnSource.replace("'react'",JSON.stringify(reactUrl)).replace("'@opendesk/ui'",JSON.stringify(buttonUrl)).replace("'./FieldOrder.jsx'",JSON.stringify(orderUrl)),{loader:'jsx',format:'esm',jsx:'transform'});
const columnUrl='data:text/javascript;base64,'+Buffer.from(columnCompiled.code).toString('base64');
const compiled=await transform(source.replace("import './results.css';",'').replace("'react'",JSON.stringify(reactUrl)).replace("'@opendesk/ui'",JSON.stringify(buttonUrl)).replace("'./results-model.js'",JSON.stringify(helperUrl)).replace("'./ColumnSettings.jsx'",JSON.stringify(columnUrl)).replace("'./FieldOrder.jsx'",JSON.stringify(orderUrl)),{loader:'jsx',format:'esm',jsx:'transform'});
const {default:Results}=await import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'));

test('component renders bounded accessible rows, original IDs and escaped untrusted text',()=>{
  const data=Array.from({length:51},(_,i)=>({title:i===0?'<script>unsafe</script>':'row '+i,price:0,author:null,url:'https://example.test/'+i,description:'Long '.repeat(80)}));
  const result={data};const before=JSON.stringify(result);
  const html=renderToStaticMarkup(React.createElement(Results,{state:{result,snapshot:{status:'completed'},retired:true},busy:false,app:{}}));
  for(const id of ['record-summary','run-profile','export-actions','download-csv','download-json','table-help','result-empty','record-scroll','record-table','run-details','refresh-run','host-status','engine-status','stop-status','retired-status','result'])assert.ok(html.includes(`id="${id}"`),id);
  assert.equal((html.match(/<tbody>[\s\S]*<\/tbody>/)?.[0].match(/<tr>/g)||[]).length,50);
  assert.match(html,/第 1 \/ 2 页/);assert.match(html,/&lt;script&gt;unsafe/);assert.ok(!html.includes('<script>unsafe'));
  assert.match(html,/（null）/);assert.match(html,/打开第 1 条完整记录/);assert.match(html,/自定义 CSV 表头/);assert.ok(!html.includes('id="custom-csv-settings"'));
  assert.equal(JSON.stringify(result),before);
});
test('results keep raw field names even when export names are configured',()=>{
  const html=renderToStaticMarkup(React.createElement(Results,{state:{result:{data:[{title:'value'}]},config:{output:{fieldNames:{title:'标题'}}},retired:true},busy:false,app:{}}));
  assert.match(html,/<th[^>]*scrapy-col-title[^>]*>title<\/th>/);
});
test('component retains original export calls and public copy boundary',()=>{
  assert.match(source,/app.download\('csv',output\)/);assert.match(source,/app.download\(\)/);
  assert.match(source,/OpenDeskTool.request\('browser.clipboard.writeText',\{text\}\)/);
  assert.doesNotMatch(source,/navigator\.clipboard|execCommand|dangerouslySetInnerHTML/);
  assert.match(source,/onCancel=/);assert.match(source,/origin\.focus\(\)/);
});
test('failed host and engine snapshots render a failed heading and their reason, never a no-match result',()=>{
  for(const state of [
    {snapshot:{status:'failed'},result:{data:[],engine:{status:'failed',message:'选择器等待超时'}}},
    {snapshot:{status:'failed',message:'原任务执行失败'},result:null}
  ]){
    const html=renderToStaticMarkup(React.createElement(Results,{state, busy:false,app:{}}));
    assert.match(html,/本次采集失败/);assert.doesNotMatch(html,/本次没有匹配的记录/);
    assert.ok(html.includes(state.result?.engine.message||state.snapshot.message));
  }
});

test('CSV header editor uses one name input per key and previews normalized fallback labels',async()=>{
  const {default:ColumnSettings}=await import(columnUrl);
  const html=renderToStaticMarkup(React.createElement(ColumnSettings,{keys:['source','title','extra'],names:{source:' 来源 ',title:''},onNamesChange:()=>{}}));
  assert.equal((html.match(/<input/g)||[]).length,3);
  assert.match(html,/<th scope="col">来源<\/th><th scope="col">title<\/th><th scope="col">extra<\/th>/);
  assert.doesNotMatch(html,/button|checkbox|调整列顺序|显示列/);
  const duplicate=renderToStaticMarkup(React.createElement(ColumnSettings,{keys:['title','source'],names:{title:'source'},onNamesChange:()=>{}}));
  assert.match(duplicate,/表头名称重复/);
});
test('changing only export names never claims the capture rules changed',()=>{
  const config={url:'https://example.test',itemConfig:{title:'h2'}};
  const render=current=>renderToStaticMarkup(React.createElement(Results,{state:{config:current,runProfile:{config},result:{data:[{title:'A'}]},retired:true},busy:false,app:{}}));
  assert.doesNotMatch(render({...config,output:{fieldNames:{title:'标题'}}}),/当前规则已有更改/);
  assert.match(render({...config,itemConfig:{title:'h3'}}),/当前规则已有更改/);
});

test('CSV sorting is optional and locked controls preserve header preview order',async()=>{
  const {default:ColumnSettings}=await import(columnUrl);
  const render=locked=>renderToStaticMarkup(React.createElement(ColumnSettings,{keys:['source','title'],names:{title:'标题'},onNamesChange:()=>{},onOrderChange:()=>{},locked}));
  const html=render(false);
  assert.equal((html.match(/<input/g)||[]).length,2);
  assert.equal((html.match(/<button/g)||[]).length,2);
  assert.match(html,/data-sortable="true"/);
  assert.match(html,/调整 CSV 列顺序：source/);
  assert.match(html,/<th scope="col">source<\/th><th scope="col">标题<\/th>/);
  assert.equal((render(true).match(/disabled=""/g)||[]).length,4);
});

// Use the existing in-memory DOM with actual Results/FieldOrder state transitions.
function resultFixture(t){
  const previous=globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame=callback=>{callback();return 0;};
  const state={profileEpoch:1,selectedId:'a',clientRequestId:'r1',runId:'run1',
    config:{itemConfig:{source:'a',title:'h2'},output:{fieldNames:{title:'标题'}}},
    result:{data:[{source:'site',title:'Book'}]},snapshot:{resultId:'one'},retired:true};
  const downloads=[];
  const ui=createExtensionCenterDOM(t,{component:({show=true,...props})=>show?React.createElement(Results,props):null,
    props:{state,active:true,busy:false,columnsLocked:false,app:{download:async(...args)=>downloads.push(args)}}});
  ui.window.HTMLElement.prototype.scrollIntoView=function(){};
  t.after(()=>{globalThis.requestAnimationFrame=previous;});
  const get=id=>ui.doc.getElementById(id);
  const headers=()=>[...get('record-table').querySelectorAll('thead th')].slice(1).map(node=>node.textContent);
  const handle=(list,key)=>get(list).querySelector(`[data-field-key="${key}"] button`);
  const move=(list,key,commit=true)=>{
    handle(list,key).dispatch('keydown',{key:' '});
    handle(list,key).dispatch('keydown',{key:'Home'});
    handle(list,key).dispatch('keydown',{key:commit?'Enter':'Escape'});
  };
  const update=patch=>{ui.state.state={...ui.state.state,...patch};ui.paint();};
  return {ui,get,headers,handle,move,update,state,downloads};
}

test('independent display sorting leaves rule order, custom CSV names/order and original exports intact',async t=>{
  const f=resultFixture(t),before=JSON.stringify(f.state);
  assert.ok(f.get('edit-result-columns'),'results must retain their independent display settings entry');
  f.get('edit-result-columns').dispatch('click');
  assert.ok(f.get('result-display-settings'));
  assert.equal(f.get('result-display-settings').querySelectorAll('input').length,0);
  assert.equal(f.get('result-display-settings').querySelectorAll('[role=switch]').length,0);
  f.get('custom-csv').dispatch('click');
  const csvHeaders=()=>[...f.get('custom-csv-settings').querySelectorAll('th')].map(node=>node.textContent);
  assert.deepEqual(csvHeaders(),['source','标题']);
  f.move('result-column-list','source');
  assert.deepEqual(f.headers(),['source','title']);
  assert.deepEqual(csvHeaders(),['source','标题']);
  f.move('csv-column-list','title');
  assert.deepEqual(csvHeaders(),['标题','source']);
  assert.deepEqual(f.headers(),['source','title']);
  f.get('download-custom-csv').dispatch('click');await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.downloads[0],['csv',{fieldNames:{title:'标题'},fieldOrder:['title','source']}]);
  f.get('download-csv').dispatch('click');await new Promise(resolve=>setImmediate(resolve));
  f.get('download-json').dispatch('click');await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.downloads.slice(1),[['csv',undefined],[]]);
  assert.equal(JSON.stringify(f.state),before);
  f.get('close-result-display').dispatch('click');
  assert.equal(f.ui.doc.activeElement,f.get('edit-result-columns'));
  f.get('edit-result-columns').dispatch('click');
  assert.deepEqual(f.headers(),['source','title']);
  f.get('reset-result-order').dispatch('click');
  assert.deepEqual(f.headers(),['title','source']);
  assert.deepEqual(csvHeaders(),['标题','source']);
});

test('display preference survives same-profile reruns and tab returns, merges result keys and resets with the session',t=>{
  const f=resultFixture(t);
  assert.ok(f.get('edit-result-columns'),'independent display settings are available');
  f.get('edit-result-columns').dispatch('click');f.move('result-column-list','source');
  f.ui.state.active=false;f.ui.paint();f.ui.state.active=true;f.ui.paint();
  assert.deepEqual(f.headers(),['source','title']);
  f.update({clientRequestId:'r2',runId:null,snapshot:null,result:null});
  assert.equal(f.get('edit-result-columns'),null);
  f.update({runId:'run2',snapshot:{resultId:'two'},result:{data:[{source:'new',title:'New',price:0}]}});
  assert.deepEqual(f.headers(),['source','title','price']);
  f.update({result:{data:[{title:'New',price:0,extra:false}]}});
  assert.deepEqual(f.headers(),['title','price','extra']);
  f.update({result:{data:[{source:'new',title:'New'}]}});
  assert.deepEqual(f.headers(),['source','title']);
  f.update({selectedId:'b'});assert.deepEqual(f.headers(),['title','source']);
  f.get('edit-result-columns').dispatch('click');f.move('result-column-list','source');
  f.update({profileEpoch:2});assert.deepEqual(f.headers(),['title','source']);
  f.get('edit-result-columns').dispatch('click');f.move('result-column-list','source');
  f.ui.state.show=false;f.ui.paint();f.ui.state.show=true;f.ui.paint();
  assert.deepEqual(f.headers(),['title','source']);
});

test('display keyboard cancel and locking preserve the committed order without changing CSV controls',t=>{
  const f=resultFixture(t);
  assert.ok(f.get('edit-result-columns'),'independent display settings are available');
  f.get('edit-result-columns').dispatch('click');
  f.move('result-column-list','source',false);assert.deepEqual(f.headers(),['title','source']);
  f.handle('result-column-list','source').dispatch('keydown',{key:' '});
  f.handle('result-column-list','source').dispatch('keydown',{key:'Home'});
  f.ui.state.columnsLocked=true;f.ui.paint();
  assert.equal(f.get('edit-result-columns').disabled,true);
  assert.equal(f.get('reset-result-order').disabled,true);
  assert.equal(f.handle('result-column-list','source').disabled,true);
  assert.deepEqual(f.headers(),['title','source']);
  f.ui.state.columnsLocked=false;f.ui.paint();
  f.get('display-settings-heading').dispatch('keydown',{key:'Escape',isComposing:true});
  assert.ok(f.get('result-display-settings'));
  f.get('display-settings-heading').dispatch('keydown',{key:'Escape'});
  assert.equal(f.get('result-display-settings'),null);
  assert.equal(f.ui.doc.activeElement,f.get('edit-result-columns'));
});
