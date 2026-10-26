import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';

const src=await readFile(new URL('../../examples/tasks/baidu-search-top3.js',import.meta.url),'utf8');
const pkg=JSON.parse(await readFile(new URL('../../examples/tasks/baidu.search.top3.v1.opendesk-task.json',import.meta.url),'utf8'));
const sha=text=>createHash('sha256').update(text).digest('hex');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):
  Array.isArray(v)?'['+v.map(canonical).join(',')+']':
  '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
test('Baidu Task package is importable and pins identical source and manifest bytes',async()=>{
  await verifyTaskPackage(pkg);
  assert.equal(pkg.manifest.taskId,'baidu.search.top3');
  assert.equal(pkg.manifest.version,'1.0.0');
  assert.deepEqual(pkg.manifest.siteOrigins,['https://www.baidu.com']);
  assert.equal(pkg.sourceUtf8,src);
  assert.equal(pkg.manifest.program.sourceHash,sha(src));
  assert.equal(pkg.manifestHash,sha(canonical(pkg.manifest)));
  assert.deepEqual(pkg.manifest.paramsSchema.properties.limit.enum,[3]);
});
const row=(n,ad=false)=>{
  const heading={isConnected:true,closest:()=>null};
  const a={isConnected:true,innerText:'标题 '+n,textContent:'标题 '+n,
    closest:s=>s==='h3'?heading:null,getAttribute:s=>s==='href'?'https://example.org/'+n:null};
  const summary={isConnected:true,innerText:'摘要 '+n,closest:()=>null};
  const label={isConnected:true,textContent:'广告',closest:()=>null};
  return {isConnected:true,closest:()=>null,matches:()=>false,
    getAttribute:s=>s==='id'?String(n):s==='tpl'?'se_com_default':null,
    querySelector:s=>s.startsWith('.c-abstract')?summary:null,
    querySelectorAll:s=>s==='h3 a'?[a]:s==='span,a,em,small'&&ad?[label]:[]};
};
async function run(rows,params={query:'关键词',limit:3},body='',{searchAreaAvailable=true}={}){
 const page={url:async()=> 'https://www.baidu.com/s?wd='+encodeURIComponent('关键词'),
   locator:selector=>({waitFor:async()=>{
     assert.equal(selector,'#content_left');
     if(!searchAreaAvailable)throw new Error('Search area did not become visible');
   },innerText:async()=>body}),
   $$eval:async (selector,fn)=>{
     assert.ok(searchAreaAvailable,'Unavailable search area must not be extracted');
     assert.equal(selector,'#content_left .result.c-container');return fn(rows);
   }};
 const ctx={page,params,URL,Date,Error,Object,Promise,getComputedStyle:()=>({display:'block',visibility:'visible'})};
 vm.createContext(ctx);
 vm.runInContext(src+';globalThis.run=main;',ctx,{timeout:1000});
 return ctx.run();
}
test('fixed task filters paid positions and returns top three organic links',async()=>{
 const response=await run([row(1),row(2,true),row(3),row(4),row(5)]);
 assert.equal(response.status,'success');
 assert.equal(response.count,3);
 assert.deepEqual(Array.from(response.results,x=>x.title),['标题 1','标题 3','标题 4']);
 assert.equal(response.results[0].url,'https://example.org/1');
});
test('recognizes observed www_index organic results while retaining ad and unknown-template filters',async()=>{
 const observed=(n,ad=false)=>{
   const node=row(n,ad),attr=node.getAttribute;
   node.getAttribute=name=>name==='tpl'?'www_index':attr(name);
   return node;
 };
 const unknown=row(99),attr=unknown.getAttribute;
 unknown.getAttribute=name=>name==='tpl'?'bk_polysemy':attr(name);
 const response=await run([observed(1),observed(2),observed(3,true),unknown,observed(5)]);
 assert.equal(response.count,3);
 assert.deepEqual(Array.from(response.results,x=>x.title),['标题 1','标题 2','标题 5']);
 assert.ok(response.results.every(x=>x.evidence.tpl==='www_index'));
});
test('no invented results on partial or empty SERP',async()=>{
 assert.equal((await run([row(1)])).count,1);
 const none=await run([],undefined,'没有找到相关内容');
 assert.equal(none.count,0);assert.equal(none.status,'no_results');
});
test('fixed task classifies captcha and missing or changed search DOM without invented results',async()=>{
 for(const [searchAreaAvailable,body,status] of [
   [false,'请完成安全验证','blocked'],
   [false,'搜索页面仍未就绪','dom_unavailable'],
   [true,'请输入验证码','blocked'],
   [true,'搜索页面使用了尚未识别的结果结构','dom_changed']
 ]){
   const result=await run(searchAreaAvailable?[]:[row(1)],undefined,body,{searchAreaAvailable});
   assert.equal(result.status,status);
   assert.equal(result.count,0);
   assert.deepEqual(Array.from(result.results),[]);
   assert.equal(result.query,'关键词');
   assert.equal(result.sourceUrl,'https://www.baidu.com/s?wd='+encodeURIComponent('关键词'));
 }
});
test('refuses query mismatch and non-three limits before reading results',async()=>{
 await assert.rejects(run([],{query:'other',limit:3}),{code:'E_TARGET'});
 await assert.rejects(run([],{query:'关键词',limit:2}),{code:'E_TASK_PARAMS'});
});

test('scans beyond duplicate and invalid candidates before choosing three unique URLs',async()=>{
 const response=await run([row(1),row(1),row(2),row(3)]);
 assert.equal(response.count,3);
 assert.deepEqual(Array.from(response.results,x=>x.title),['标题 1','标题 2','标题 3']);
});
test('conservatively excludes unknown Baidu templates',async()=>{
 const promoted=row(99),attr=promoted.getAttribute;
 promoted.getAttribute=name=>name==='tpl'?'paid_unknown':attr(name);
 const response=await run([promoted,row(1)]);
 assert.equal(response.count,1);
 assert.equal(response.results[0].title,'标题 1');
});
