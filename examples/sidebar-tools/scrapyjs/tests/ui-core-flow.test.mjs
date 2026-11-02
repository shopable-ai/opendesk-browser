import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {createExtensionCenterDOM} from '../../../../tests/helpers/extension-center-react-dom.mjs';
import {App} from './react-fixture.mjs';
import {createCoreFlow,fixtureBase,plain} from './core-flow-fixture.mjs';

const initialConfig=()=>({url:fixtureBase+'core-records.html',itemConfig:{_listContainer:'.catalog',_listItem:'.book',
  id:'.id::text',title:'a::text',price:'.price::text',note:'.note::text',url:'a::href'},
  waitForSelector:'.book',timeoutMs:30000});
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,0));};

async function mount(t,flow){
  const keys=['OpenDeskTool','ScrapyAppModel','ScrapyAppSdk','requestAnimationFrame','FocusEvent'];
  const previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  const hostStates=[];
  const tool={request:flow.request,setState(value){hostStates.push(structuredClone(value));},setConversationState(){}};
  Object.assign(globalThis,{OpenDeskTool:tool,ScrapyAppModel:flow.appModel,ScrapyAppSdk:flow.appSdk,
    requestAnimationFrame:callback=>setTimeout(callback,0),
    FocusEvent:class extends Event{constructor(type,options){super(type,options);this.relatedTarget=options?.relatedTarget??null;}}});
  const cleanup=[];
  const ui=createExtensionCenterDOM({after:fn=>cleanup.push(fn)},{component:()=>{
    tool.root=document.getElementById('opendesk-react-app');return React.createElement(App);
  }});
  // Browser-only APIs absent from linkedom. These shims establish no native UI evidence.
  ui.window.getSelection=()=>({anchorNode:null,anchorOffset:0,focusNode:null,focusOffset:0});
  ui.window.HTMLElement.prototype.scrollIntoView=function(){};
  ui.window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};
  let disposed=false;
  const dispose=async()=>{if(disposed)return;disposed=true;for(const fn of cleanup)await fn();Object.assign(globalThis,previous);};
  t.after(dispose);
  const get=id=>{const node=ui.doc.getElementById(id);assert.ok(node,'missing UI control: '+id);return node;};
  const label=name=>{const node=ui.doc.querySelector('[aria-label="'+name+'"]');assert.ok(node,'missing UI control: '+name);return node;};
  const edit=(node,value)=>{node.type='text';node.value=value;node.dispatch('input');};
  const order=id=>[...get(id).children].map(node=>node.dataset.fieldKey);
  async function move(name,key){label(name).dispatch('keydown',{key:' '});label(name).dispatch('keydown',{key});label(name).dispatch('keydown',{key:'Enter'});await settle();}
  await settle();
  return {...ui,get,label,edit,order,move,dispose,hostStates};
}

// RFC 4180 cells: commas, escaped quotes and embedded newlines must survive.
function csvRows(text){
  const rows=[],row=[];let cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(ch===','||ch==='\r'||ch==='\n')){
      row.push(cell);cell='';if(ch!==','){rows.push(row.splice(0));if(ch==='\r'&&text[i+1]==='\n')i++;}
    }else cell+=ch;
  }
  assert.equal(quoted,false);row.push(cell);rows.push(row);return rows;
}

test('latest field UI edits, renames and orders saved rules; reopening executes those exact rules',async t=>{
  const original=initialConfig();original.itemConfig.title='a::href';
  const flow=await createCoreFlow({initialConfig:original});
  let ui=await mount(t,flow);let {get,label,edit}=ui;
  get('tab-rules').dispatch('click');
  edit(label('采集规则 title'),'a::text');
  edit(label('字段名 title'),'book_title');
  get('csv-preset').open=true;get('csv-preset').dispatch('toggle');
  edit(label('book_title 显示名称'),'书名');
  await ui.move('调整字段顺序：note','Home');
  const expectedOrder=['note','id','book_title','price','url'];
  assert.deepEqual(ui.order('field-list'),expectedOrder);
  assert.equal(get('save-config').disabled,false);
  get('save-config').dispatch('click');await settle();
  const saved=flow.storage.value.records[0];
  assert.equal(saved.name,'原配置');
  assert.equal(saved.config.itemConfig.book_title,'a::text');
  assert.equal(Object.hasOwn(saved.config.itemConfig,'title'),false);
  assert.deepEqual(saved.config.output,{fieldNames:{book_title:'书名'},fieldOrder:expectedOrder});
  assert.equal(flow.calls.some(call=>call.operation==='tasks.start'),false,'editing and saving cannot collect');
  await ui.dispose();
  ui=await mount(t,flow);({get,label,edit}=ui);
  get('tab-rules').dispatch('click');
  assert.deepEqual(ui.order('field-list'),expectedOrder);
  assert.equal(label('采集规则 book_title').value,'a::text');
  assert.equal(label('book_title 显示名称').value,'书名');
  get('start').dispatch('click');await settle();
  const starts=flow.calls.filter(call=>call.operation==='tasks.start');
  assert.equal(starts.length,1);
  const sent=starts[0].payload.params;
  assert.deepEqual(JSON.parse(sent.configJson),saved.config.itemConfig);
  assert.deepEqual(JSON.parse(sent.optionsJson),{},'CSV metadata never enters the engine');
  assert.equal(sent.waitForSelector,saved.config.waitForSelector);
  assert.equal(sent.timeoutMs,saved.config.timeoutMs);
  const rows=plain([...flow.runs.values()][0].value.data);
  assert.equal(rows.length,3,'container excludes the unrelated fourth record');
  assert.deepEqual(rows.map(row=>row.id),['A','B','C']);
  assert.equal(rows[0].book_title,rows[1].book_title,'same-title records keep independent rows');
  assert.equal(rows[0].price,'0');assert.equal(rows[1].price,'');assert.equal(rows[2].note,'false');
  assert.equal(get('stop').disabled,true);assert.match(get('retired-status').textContent,/已确认退休/);
  get('tab-results').dispatch('click');get('custom-csv').dispatch('click');await settle();
  assert.equal(label('book_title CSV 表头').value,'书名','saved preset must prefill the reopened export panel');
  get('download-custom-csv').dispatch('click');await settle();
  assert.equal(flow.downloads.length,1);
  const exported=csvRows(flow.downloads[0].text);
  assert.deepEqual([...exported[0]].sort(),['id','书名','price','note','url'].sort());
  const titleColumn=exported[0].indexOf('书名');
  assert.deepEqual(exported.slice(1).map(row=>row[titleColumn]),['同名，"甲"','同名，"甲"',"'=SUM(1,2)"],
    'download uses the persisted preset without another name edit');
  assert.equal(flow.calls.filter(call=>call.operation==='tasks.start').length,1);
});

test('merged CSV UI independently orders preview and download, preserves full records and guards invalid drafts',async t=>{
  const flow=await createCoreFlow({initialConfig:initialConfig()});
  const {doc,get,label,edit,order,move,hostStates}=await mount(t,flow);
  get('start').dispatch('click');await settle();
  assert.equal(flow.runs.size,1);assert.match(get('record-summary').textContent,/共 3 条/);
  const rows=plain([...flow.runs.values()][0].value.data);
  assert.deepEqual(rows,[
    {id:'A',title:'同名，"甲"',price:'0',note:'第一行\n第二行',url:'/scrapyjs-fixtures/detail-A.html'},
    {id:'B',title:'同名，"甲"',price:'',note:'',url:'/scrapyjs-fixtures/detail-B.html'},
    {id:'C',title:'=SUM(1,2)',price:'30.00',note:'false',url:'/scrapyjs-fixtures/detail-C.html'}
  ],'independent expected records come from the authored fixture, not the UI result');
  const rawOrder=['id','title','price','note','url'];
  const snapshot=JSON.parse(get('result').textContent);
  label('打开第 2 条完整记录').dispatch('click');await settle();
  const detail=get('record-detail-text');
  assert.deepEqual(JSON.parse(detail.value||detail.defaultValue),rows[1]); // linkedom textarea reflection.
  [...doc.querySelectorAll('button')].find(node=>node.textContent==='关闭详情').dispatch('click');await settle();
  assert.equal(doc.getElementById('edit-result-columns'),null,'one settings entry');
  get('custom-csv').dispatch('click');await settle();
  const preview=doc.querySelector('.csv-table-order');assert.equal(Boolean(preview.open),false);
  preview.open=true;preview.dispatch('toggle');await settle();
  await move('调整显示顺序：url','Home');
  const displayOrder=['url','title','id','price','note']; // Preview defaults to title first; raw CSV does not.
  assert.deepEqual(order('result-column-list'),displayOrder);
  const assertPreview=()=>{
    assert.deepEqual([...get('record-table').querySelectorAll('thead th')].slice(1).map(node=>node.textContent),displayOrder);
    assert.deepEqual([...get('record-table').querySelectorAll('tbody tr')].map(row=>
      [...row.querySelectorAll('td')].slice(1).map(cell=>cell.textContent)),[
      ['/scrapyjs-fixtures/detail-A.html','同名，"甲"','A','0','第一行\n第二行'],
      ['/scrapyjs-fixtures/detail-B.html','同名，"甲"','B','（空）','（空）'],
      ['/scrapyjs-fixtures/detail-C.html','=SUM(1,2)','C','30.00','false']
    ],'each preview cell must stay under its reordered field');
  };
  assertPreview();
  await move('调整 CSV 列顺序：price','Home');
  const exportOrder=['price','id','title','note','url'];assert.deepEqual(order('csv-column-list'),exportOrder);
  edit(label('title CSV 表头'),'书名');
  assertPreview();
  assert.deepEqual(order('result-column-list'),displayOrder,'CSV order cannot change preview order');
  get('download-custom-csv').dispatch('click');await settle();
  const custom=csvRows(flow.downloads.at(-1).text);
  assert.deepEqual(custom[0],exportOrder.map(key=>key==='title'?'书名':key));
  const csvCell=value=>/^[=+@\-\t\r]/.test(value)?"'"+value:value;
  assert.deepEqual(custom.slice(1),rows.map(row=>exportOrder.map(key=>csvCell(row[key]))),
    'every exported cell follows its header, including missing values, newlines and formula protection');
  get('download-csv').dispatch('click');await settle();
  const raw=csvRows(flow.downloads.at(-1).text);assert.deepEqual(raw[0],rawOrder);
  assert.deepEqual(raw.slice(1),rows.map(row=>rawOrder.map(key=>csvCell(row[key]))));
  get('download-json').dispatch('click');await settle();
  assert.deepEqual(JSON.parse(flow.downloads.at(-1).text),snapshot);
  assert.equal(flow.downloads.length,3,'one download per explicit action');
  assert.deepEqual(flow.storage.value.records[0].config,initialConfig(),'temporary export settings do not save configuration');
  edit(label('title CSV 表头'),'id');assert.equal(get('download-custom-csv').disabled,true);
  assert.match(get('custom-csv-settings').textContent,/表头名称重复/);
  get('download-custom-csv').dispatch('click');await settle();assert.equal(flow.downloads.length,3);
  get('cancel-custom-csv').dispatch('click');get('custom-csv').dispatch('click');await settle();
  assert.equal(label('title CSV 表头').value,'');assert.deepEqual(order('csv-column-list'),rawOrder);
  assert.deepEqual(order('result-column-list'),displayOrder,'closing CSV settings retains preview preference');
  assert.equal(Boolean(doc.querySelector('.csv-table-order').open),false);
  get('tab-rules').dispatch('click');
  assert.equal(hostStates.at(-1).dirty,false);
  edit(label('采集规则 title'),'.id::text');await settle();
  assert.equal(hostStates.at(-1).dirty,true,'valid unsaved edits must protect the host draft');
  label('清空采集规则 title').dispatch('click');await settle();
  assert.equal(get('save-config').disabled,true);assert.equal(get('start').disabled,true);
  assert.equal(get('custom-csv').disabled,true);assert.equal(get('download-custom-csv').disabled,true);
  label('采集规则 title').dispatch('keydown',{key:'Escape'});await settle();
  assert.equal(label('采集规则 title').value,'.id::text','Esc restores the last valid edit, not the initial rule');
  assert.equal(hostStates.at(-1).dirty,true,'restoring a valid rule must retain the unsaved draft');
  assert.deepEqual(flow.storage.value.records[0].config,initialConfig(),'Esc must not save or replace stored configuration');
  assert.equal(get('save-config').disabled,false);assert.equal(get('start').disabled,false);
  assert.equal(flow.calls.filter(call=>call.operation==='tasks.start').length,1,'all later actions only format or edit');
});
