import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';
import {canonical} from '../../src/platform/protocol.js';

const src=await readFile(new URL('../../examples/tasks/baidu-search-top3.js',import.meta.url),'utf8');
const pkg=JSON.parse(await readFile(new URL('../../examples/tasks/baidu.search.top3.v1.opendesk-task.json',import.meta.url),'utf8'));
const sha=text=>createHash('sha256').update(text).digest('hex');
test('Baidu Task package is importable and pins identical source and manifest bytes',async()=>{
  await verifyTaskPackage(pkg);
  assert.equal(pkg.manifest.taskId,'baidu.search.top3');
  assert.equal(pkg.manifest.version,'1.1.1');
  assert.equal(pkg.manifest.program.revision,1);
  assert.equal(pkg.manifest.deadlineMs,60000);
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
  const summary={isConnected:true,innerText:'摘要 '+n,textContent:'摘要 '+n,closest:()=>null};
  const label={isConnected:true,textContent:'广告',closest:()=>null};
  return {isConnected:true,closest:()=>null,matches:()=>false,
    innerText:'标题 '+n+' 摘要 '+n+(ad?'广告':''),
    textContent:'标题 '+n+' 摘要 '+n+(ad?'广告':''),
    getAttribute:s=>s==='id'?String(n):s==='tpl'?'se_com_default':null,
    querySelector:s=>s.startsWith('.c-abstract')?summary:null,
    querySelectorAll:s=>s==='h3 a'?[a]:s==='h3'?[heading]:s.startsWith('.c-abstract')?[summary]:s==='span,a,em,small'&&ad?[label]:[]};
};
async function run(rows,params={query:'关键词',limit:3},body='',{searchAreaAvailable=true}={}){
 const locator=items=>{
   const one=()=>{assert.equal(items.length,1,'Locator read must be strict');return items[0];};
   return {
     count:async()=>items.length,
     nth:index=>locator(items.slice(index,index+1)),
     first:()=>locator(items.slice(0,1)),
     isVisible:async()=>items.length===1&&items[0].isConnected!==false&&items[0].visible!==false,
     getAttribute:async name=>one().getAttribute?.(name)??null,
     innerText:async()=>one().innerText??one().textContent??'',
     textContent:async()=>one().textContent??one().innerText??'',
     locator:selector=>locator(items.flatMap(node=>node.querySelectorAll(selector))),
   };
 };
 const page={url:async()=> 'https://www.baidu.com/s?wd='+encodeURIComponent('关键词'),
   locator:selector=>{
     if(selector==='body')return locator([{innerText:body}]);
     if(selector==='#content_left')return {waitFor:async()=>{
       if(!searchAreaAvailable)throw Object.assign(new Error('Search area did not become visible'),{code:'E_TIMEOUT'});
     }};
     assert.ok(searchAreaAvailable,'Unavailable search area must not be extracted');
     assert.equal(selector,'#content_left .result.c-container');return locator(rows);
   }};
 const ctx={page,params,URL,Date,Error,Object,Promise,TextEncoder,setTimeout:fn=>{fn();return 0;}};
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

test('returns only the visible abstract and preserves safe direct URLs',async()=>{
 const node=row(1),attr=node.getAttribute;
 node.innerText='标题 1 网站导航 无关模块文字 摘要 1';
 node.getAttribute=name=>name==='mu'?'https://example.org/direct':attr(name);
 const response=await run([node]);
 assert.equal(response.results[0].summary,'摘要 1');
 assert.equal(response.results[0].directUrl,'https://example.org/direct');
});

test('omits missing or hidden abstracts instead of synthesizing summaries from the card',async()=>{
 const missing=row(1),hidden=row(2);
 const query=missing.querySelectorAll;
 missing.querySelectorAll=s=>s.startsWith('.c-abstract')?[]:query(s);
 hidden.querySelector('.c-abstract').visible=false;
 const response=await run([missing,hidden,row(3)]);
 assert.equal(response.count,1);
 assert.equal(response.results[0].title,'标题 3');
});

test('filters self ad classes, empty ad attributes and exact visible labels without rejecting prose',async()=>{
 const self=row(1),attr=self.getAttribute;
 self.getAttribute=name=>name==='class'?'result c-container ec-tuiguang':attr(name);
 const marked=row(2),markedAttr=marked.getAttribute;
 marked.getAttribute=name=>name==='data-ad'?'':markedAttr(name);
 const prose=row(4);
 prose.innerText=prose.textContent='标题 4 介绍广告技术的自然网页';
 const response=await run([self,marked,row(3,true),prose,row(5)]);
 assert.deepEqual(Array.from(response.results,x=>x.title),['标题 4','标题 5']);
});

test('ignores hidden title anchors and hidden ad labels',async()=>{
 const node=row(1,true),query=node.querySelectorAll;
 query('span,a,em,small')[0].visible=false;
 const hidden={...query('h3 a')[0],visible:false};
 node.querySelectorAll=s=>s==='h3 a'?[hidden,...query(s)]:query(s);
 const response=await run([node]);
 assert.equal(response.count,1);
 assert.equal(response.results[0].title,'标题 1');
});

test('rejects unsafe and credentialed result URLs and never exposes unsafe direct URLs',async()=>{
 const badHref=['javascript:alert(1)','data:text/html,bad','https://user:pass@example.org/'];
 const rows=badHref.map((href,i)=>{
   const node=row(i),anchor=node.querySelectorAll('h3 a')[0],attr=anchor.getAttribute;
   anchor.getAttribute=name=>name==='href'?href:attr(name);return node;
 });
 for(const [i,mu] of ['javascript:alert(1)','https://user:pass@example.org/','/relative'].entries()){
   const node=row(i+10),attr=node.getAttribute;
   node.getAttribute=name=>name==='mu'?mu:attr(name);rows.push(node);
 }
 const response=await run(rows);
 assert.equal(response.count,3);
 assert.ok(response.results.every(item=>!Object.hasOwn(item,'directUrl')));
 assert.deepEqual(Array.from(response.results,x=>x.url),['https://example.org/10','https://example.org/11','https://example.org/12']);
});

test('preserves English challenge and unavailable-DOM status classification',async()=>{
 assert.equal((await run([],undefined,'Security verification required')).status,'blocked');
 assert.equal((await run([],undefined,'结果加载中',{searchAreaAvailable:false})).status,'dom_unavailable');
});

test('caps Unicode result samples and serialized UTF-8 output for the existing Bridge budget',async()=>{
 const rows=[1,2,3].map(n=>{
   const node=row(n),attr=node.getAttribute,anchor=node.querySelectorAll('h3 a')[0];
   anchor.innerText='标题😀'.repeat(100);
   anchor.getAttribute=name=>name==='href'?'https://example.org/'+n+'a'.repeat(1100):null;
   node.querySelector('.c-abstract').innerText='摘要😀'.repeat(300);
   node.getAttribute=name=>name==='mu'?'https://direct.example.org/'+n+'b'.repeat(1100):attr(name);
   return node;
 });
 const response=await run(rows);
 assert.equal(response.status,'success');
 assert.ok(response.count>0&&response.count<=3);
 for(const item of response.results){
   assert.ok([...item.title].length<=96);
   assert.ok([...item.summary].length<=200);
   assert.equal(item.title.isWellFormed(),true);
   assert.equal(item.summary.isWellFormed(),true);
   assert.ok(item.url.length<1200);
   assert.ok(!item.directUrl||item.directUrl.length<1200);
 }
 assert.ok(Buffer.byteLength(JSON.stringify(response),'utf8')<=6144);
 assert.equal(response.truncated,true);
 if(response.count<3)assert.equal(response.observedCount,3);
});

test('skips oversized result URLs and omits oversized direct URLs rather than truncating link identities',async()=>{
 const oversized=row(1),anchor=oversized.querySelectorAll('h3 a')[0];
 anchor.getAttribute=name=>name==='href'?'https://example.org/'+'a'.repeat(1200):null;
 const safe=row(2),attr=safe.getAttribute;
 safe.getAttribute=name=>name==='mu'?'https://direct.example.org/'+'a'.repeat(1200):attr(name);
 const response=await run([oversized,safe]);
 assert.equal(response.count,1);
 assert.equal(response.results[0].url,'https://example.org/2');
 assert.equal(Object.hasOwn(response.results[0],'directUrl'),false);
});
