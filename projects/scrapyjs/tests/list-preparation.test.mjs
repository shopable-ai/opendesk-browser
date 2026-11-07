import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {DOMParser} from 'linkedom';
import * as proposals from '../src/ai-config.js';
import {ItemLoader} from '../engine/browser.js';
const context=vm.createContext({URL,TextEncoder});
vm.runInContext(await readFile(new URL('../src/app-model.js',import.meta.url),'utf8'),context);
const validate=context.ScrapyAppModel.validateConfig;
globalThis.DOMParser=DOMParser;
const sample='<main class="catalog"><article class="book"><a href="/a">Same</a><b>10</b></article><article class="book"><a href="/b">Same</a></article></main><aside><article class="book"><a href="/trap">Trap</a></article></aside>';
const base={url:'https://example.com/',itemConfig:{title:'.catalog article.book a::text',url:'.catalog article.book a::href',price:'.catalog article.book b::text'},validation:{version:1,rowShape:'old'},fieldRequirements:[{key:'url',required:true,valueType:'text'}],dedupeKey:'url',maxPages:2,nextPageSelector:'a.next',output:{fieldNames:{title:'标题'}}};
const plain=value=>JSON.parse(JSON.stringify(value));
// Match the public page.evaluate contract; ItemLoader.parse does not accept a
// raw DOM Document as a page bridge (document.evaluate is native XPath).
const page=html=>({evaluate:async(callback,...args)=>plain(vm.runInNewContext('('+callback.toString()+')(...args)',{document:new DOMParser().parseFromString(html,'text/html'),args}))});

test('real SDK prepares complete fields and replays saved JSON twice without changing unrelated config',async()=>{
 assert.equal(typeof proposals.prepareListProposal,'function');
 const before=JSON.stringify(base),result=await proposals.prepareListProposal(base,validate,base.url,sample);
 assert.equal(result.status,'ready',JSON.stringify(result));
 assert.equal(result.recordCount,2);
 assert.deepEqual(result.records,[{title:'Same',url:'/a',price:'10'},{title:'Same',url:'/b',price:''}]);
 assert.deepEqual(plain({...result.config,itemConfig:base.itemConfig,validation:base.validation}),base);
 assert.equal(result.config.validation.rowShape,result.rowShape);
 assert.deepEqual(result.itemConfig,plain(result.config.itemConfig));
 for(let i=0;i<2;i++)assert.deepEqual(await ItemLoader.parse(page(sample),JSON.parse(JSON.stringify(result.config.itemConfig))),result.records);
 assert.equal(JSON.stringify(base),before);
});
test('ordinary parseProposal leaves flat fields untouched and never prepares a list',()=>{
 const before=JSON.stringify(base);
 assert.deepEqual(plain(proposals.parseProposal(base,validate,base.url)),base);
 assert.equal(JSON.stringify(base),before);
 assert.equal(Object.hasOwn(base.itemConfig,'_listItem'),false);
});
test('missing samples and explicit record rules never become preparation proposals',async()=>{
 assert.equal(typeof proposals.prepareListProposal,'function');
 const missing=await proposals.prepareListProposal(base,validate,base.url,'  ');
 assert.equal(missing.status,'needsInput');assert.ok(missing.missing.length);assert.equal(missing.config,undefined);
 const explicit=await proposals.prepareListProposal({...base,itemConfig:{_listItem:'article',title:'a'}},validate,base.url,sample);
 assert.equal(explicit.status,'needsInput');assert.match(explicit.diagnostics[0].message,/原配置/);assert.equal(explicit.config,undefined);
});
test('target changes, failed validators, absent field evidence and duplicate declared identity reject without a draft',async()=>{
 assert.equal(typeof proposals.prepareListProposal,'function');
 for(const [config,validator,url,html] of [
  [base,validate,'https://example.org/',sample],
  [base,()=>{throw Error('original validation failed');},base.url,sample],
  [base,validate,base.url,sample.replace('href="/b"','href="/a"')],
 ]){const result=await proposals.prepareListProposal(config,validator,url,html);assert.equal(result.status,'rejected',JSON.stringify(result));assert.equal(result.config,undefined);assert.ok(result.diagnostics.length);}
 const missing=await proposals.prepareListProposal(base,validate,base.url,'<main></main>');
 assert.equal(missing.status,'needsInput');assert.equal(missing.config,undefined);
});

test('preparation refuses missing required values and even identical duplicate identity rows',async()=>{
 const before=JSON.stringify(base);
 for(const html of [sample.replace('href="/b"',''),sample.replace('href="/b"','href="/a"').replace('</a></article></main>','</a><b>10</b></article></main>')]){
  const result=await proposals.prepareListProposal(base,validate,base.url,html);
  assert.equal(result.status,'rejected',JSON.stringify(result));assert.equal(result.config,undefined);
  assert.ok(result.diagnostics.some(row=>['E_LIST_REQUIRED','E_LIST_IDENTITY'].includes(row.code)));
 }
 assert.equal(JSON.stringify(base),before);
});
