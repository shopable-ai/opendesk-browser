import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const src=await readFile(new URL('../../examples/tasks/baidu-search-top3.js',import.meta.url),'utf8');
const pkg=JSON.parse(await readFile(new URL('../../examples/tasks/baidu.search.top3.v1.opendesk-task.json',import.meta.url),'utf8'));
const sha=text=>createHash('sha256').update(text).digest('hex');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):
  Array.isArray(v)?'['+v.map(canonical).join(',')+']':
  '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
test('Baidu Task package pins identical source and manifest bytes',()=>{
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
async function run(rows,params={query:'关键词',limit:3},body=''){
 const page={url:async()=> 'https://www.baidu.com/s?wd='+encodeURIComponent('关键词'),
   locator:()=>({waitFor:async()=>{},innerText:async()=>body}),
   $$eval:async (selector,fn)=>{assert.equal(selector,'#content_left .result.c-container');return fn(rows);}};
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
test('no invented results on partial or empty SERP',async()=>{
 assert.equal((await run([row(1)])).count,1);
 const none=await run([],undefined,'没有找到相关内容');
 assert.equal(none.count,0);assert.equal(none.status,'no_results');
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
