import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=path=>readFile('examples/tasks/'+path,'utf8');
test('specialized Workflow fixtures stay linked from the existing Browser Test Lab',async()=>{
 const [root,search,commerce]=await Promise.all([load('demo-form.html'),load('workflow-search.html'),load('workflow-commerce.html')]);
 assert.match(root,/id="lab-workflow-search-link" href="\.\/workflow-search\.html"/);
 assert.match(root,/id="lab-workflow-commerce-link" href="\.\/workflow-commerce\.html"/);
 for(const html of [search,commerce]){
  assert.doesNotMatch(html,/\b(?:fetch\(|XMLHttpRequest|navigator\.sendBeacon|localStorage|sessionStorage|<script[^>]+src=)/i);
  assert.match(html,/<html lang="zh-CN">/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/setTimeout\(/);
  assert.match(html,/history\.replaceState\(/);
 }
 for(const id of ['workflow-search-query','workflow-search-submit','workflow-search-results',
   'workflow-search-status','workflow-search-detail-title','workflow-search-duplicates'])
  assert.ok(search.includes('id="'+id+'"'),id);
 for(const id of ['workflow-commerce-query','workflow-commerce-submit','workflow-commerce-results',
   'workflow-commerce-status','workflow-commerce-product-title','workflow-commerce-product-price',
   'workflow-commerce-sort','workflow-commerce-category'])
  assert.ok(commerce.includes('id="'+id+'"'),id);
 assert.match(search,/\?detail=/);assert.match(commerce,/\?product=/);
 for(const [id,name] of [['camera-x','Camera X'],['lens-y','Lens Y']]){
  assert.ok(commerce.includes("id:'"+id+"',name:'"+name+"'"),name+' needs an exact local commerce fixture');
 }
 assert.doesNotMatch(commerce,/id="(?:buy|checkout|payment|submit-order)"/);
});
