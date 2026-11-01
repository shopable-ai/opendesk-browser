import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import * as selection from '../preview/rule-selection.js';
const dom=()=>parseHTML('<ul id="sample-list"><li><a class="book-title" href="/a">第一本</a><img src="/a.png"></li><li><a class="book-title" href="/b">第二本</a><img src="/b.png"></li><li><a class="book-title" href="/c"></a><a class="extra">重复</a></li></ul>').document;
test('relative CSS selects equivalent fields across list items',()=>{
 assert.equal(typeof selection.suggestSelector,'function');
 const d=dom(),a=d.querySelector('a');assert.equal(selection.suggestSelector(a,a.closest('li')),'a.book-title');
 const report=selection.probeRule(d,'a.book-title::href','#sample-list','li');
 assert.equal(report.total,3);assert.equal(report.status,'pass');assert.equal(report.rows[1].value,'/b');
});
test('validation exposes empty, missing and ambiguous values instead of a false pass',()=>{
 assert.equal(typeof selection.probeRule,'function');const d=dom();
 const empty=selection.probeRule(d,'a.book-title::text','#sample-list','li');assert.equal(empty.status,'warning');assert.equal(empty.empty,1);
 const multi=selection.probeRule(d,'a::text','#sample-list','li');assert.equal(multi.ambiguous,1);
 const missing=selection.probeRule(d,'img::src','#sample-list','li');assert.equal(missing.missing,1);
 assert.equal(selection.probeRule(d,'p::text','#sample-list','li').matched,0);
});
test('invalid CSS, empty scope and unsupported complex rules never pass',()=>{
 assert.equal(typeof selection.probeRule,'function');const d=dom();
 for(const [rule,container,item] of [['[::text','#sample-list','li'],['a::text','.absent','li'],['a::text','#sample-list','['],['xpath=//a','#sample-list','li'],[{selector:'a'},'#sample-list','li']])
 assert.equal(selection.probeRule(d,rule,container,item).status,'error');
 assert.equal(selection.probeRule(d,'.::text','#sample-list','li').total,3);
});

test('list enumeration matches engine direct children and optional item filter',()=>{
 const d=dom();
 assert.equal(selection.probeRule(d,'a.book-title::href','#sample-list','a.book-title').status,'error');
 assert.equal(selection.probeRule(d,'a.book-title::href','#sample-list','').total,3);
 assert.equal(selection.probeRule(d,'a.book-title::href','','').total,1);
});

test('container choices identify distinct repeated lists and keep direct-child filtering',()=>{
 const d=dom();d.body.appendChild(d.createElement('div')).innerHTML='<ol id="recommendations"><li>第四本</li><li>第五本</li></ol><ul id="single"><li>只有一本</li></ul>';
 assert.equal(typeof selection.listContainerChoices,'function');
 const choices=selection.listContainerChoices(d,'li');
 assert.equal(choices.length,2);
 assert.deepEqual(choices.map(row=>[row.container,row.item,row.count]),[['#sample-list','li',3],['#recommendations','li',2]]);
 assert.equal(choices[0].samples[0],'第一本');
 assert.equal(selection.listContainerChoices(d,'a.book-title').length,0);
 assert.equal(selection.listContainerChoices(d,'[').length,0);
});

test('container choice never accepts ambiguous selectors or loses a supplied filter',()=>{
 const {document:d}=parseHTML('<main><ul class="books"><li>A</li><li>B</li></ul><ul class="books"><li>C</li><li>D</li></ul></main>');
 const choices=selection.listContainerChoices(d,'li');assert.equal(choices.length,2);
 for(const row of choices){assert.equal(d.querySelectorAll(row.container).length,1);assert.equal(row.item,'li');assert.equal(row.count,2);}
 assert.equal(selection.listContainerChoices(d,'li.absent').length,0);
});

test('preview list coverage agrees with the original engine on current scope cases',async()=>{
 const {readFile}=await import('node:fs/promises'),{runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('../vendor/scrapyjs/src/item/item-loader-extraction.js',import.meta.url),'utf8');
 for(const scope of [{_listItem:'#sample-list > li'},{_listContainer:'#sample-list',_listItem:'li'},{_listContainer:'#sample-list'},{_listContainer:'#sample-list',_listItem:'a.book-title'},{}]){
  const document=dom(),context={module:{exports:{}},document};runInNewContext(source,context);
  const engine=context.module.exports,actual=engine.extractRecords(engine.normalizeConfig({...scope,title:'a.book-title::href'}));
  const preview=selection.probeRule(document,'a.book-title::href',scope._listContainer||'',scope._listItem||'');
  assert.equal(preview.total,actual.records.length,JSON.stringify(scope));
 }
});
