import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {ItemLoader} from '../engine/browser.js';
import {validateCapture} from '../controller/capture.js';
import {applyInlineField} from '../src/editor.js';
import {probeRule} from '../preview/rule-selection.js';

const context=vm.createContext({URL,TextEncoder});
vm.runInContext(await readFile(new URL('../src/app-model.js',import.meta.url),'utf8'),context);
const {validateConfig}=context.ScrapyAppModel;
const html='<main><section><article class="book"><h2>Alpha</h2><i>10</i></article></section><div><article class="book"><h2>Beta</h2></article></div></main>';
const config={url:'http://127.0.0.1:43111/list.html',itemConfig:{_listItem:'main .book',title:'h2::text',price:'i::text'}};

test('app and Controller accept record selectors without a container',()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(validateConfig(config))),config);
  assert.deepEqual(validateCapture(config),config);
});
test('clearing a redundant container retains the selected records and unrelated options',()=>{
  const original={...config,itemConfig:{...config.itemConfig,_listContainer:'main'},timeoutMs:10000};
  const next=applyInlineField(original,{scopeOnly:true,container:'',item:'main .book'});
  assert.equal(Object.hasOwn(next.itemConfig,'_listContainer'),false);
  assert.deepEqual(JSON.parse(JSON.stringify(validateConfig(next))),{...config,timeoutMs:10000});
  assert.equal(original.itemConfig._listContainer,'main');
});
test('pinned SDK and offline rule preview keep the same record boundaries',async()=>{
  const {document}=parseHTML(html);
  const page={evaluate:async(callback,...args)=>JSON.parse(JSON.stringify(vm.runInNewContext('('+callback.toString()+')(...args)',{document,args})))};
  assert.deepEqual(await ItemLoader.parse(page,config.itemConfig),[{title:'Alpha',price:'10'},{title:'Beta',price:''}]);
  const report=probeRule(document,'i::text','','main .book');
  assert.equal(report.total,2);
  assert.equal(report.missing,1);
  assert.deepEqual(report.rows.map(row=>row.value),['10','']);
  assert.equal(probeRule(document,'h2::text','','.missing').status,'error');
});
