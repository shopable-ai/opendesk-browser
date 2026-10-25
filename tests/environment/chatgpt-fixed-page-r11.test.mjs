import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {validateChatGPTTaskRequest,baiduSearchTarget,fixedPageReadTarget,FIXED_PAGE_URL}
  from '../../src/native-agent/chatgpt-task-request.js';
const src=await readFile(new URL('../../examples/tasks/page-read-fixed.js',import.meta.url),'utf8');
const pkg=JSON.parse(await readFile(new URL('../../examples/tasks/page.read.fixed.v1.opendesk-task.json',import.meta.url),'utf8'));
const sha=text=>createHash('sha256').update(text).digest('hex');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):
  Array.isArray(v)?'['+v.map(canonical).join(',')+']':
  '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const execute=async ({url='https://httpbingo.org/html',title='Test page',heading='Herman Melville - Moby-Dick',body='Herman Melville - Moby-Dick\nSample page excerpt'}={})=>{
  const page={url:async()=>url,title:async()=>title,locator:selector=>({
    textContent:async()=>selector==='h1'?heading:'',
    innerText:async()=>selector==='body'?body:''
  })};
  const context={page,URL,Date,Error,Object,Promise,String};
  vm.createContext(context);
  vm.runInContext(src+';globalThis.invoke=main;',context,{timeout:1000});
  return context.invoke();
};
test('fixed page package keeps source, checksum, zero parameters and one site',()=>{
  assert.equal(pkg.manifest.taskId,'page.read.fixed');
  assert.equal(pkg.manifest.version,'1.0.0');
  assert.deepEqual(pkg.manifest.siteOrigins,['https://httpbingo.org']);
  assert.deepEqual(pkg.manifest.paramsSchema,{type:'object',properties:{},required:[],additionalProperties:false});
  assert.equal(pkg.sourceUtf8,src);
  assert.equal(pkg.manifest.program.sourceHash,sha(src));
  assert.equal(pkg.manifestHash,sha(canonical(pkg.manifest)));
});
test('reads one target and returns bounded content without clicks',async()=>{
  const out=await execute({body:'OpenDesk '.repeat(300)});
  assert.equal(out.kind,'page.read.fixed.result');
  assert.equal(out.sourceUrl,FIXED_PAGE_URL);
  assert.equal(out.heading,'Herman Melville - Moby-Dick');
  assert.equal(out.excerpt.length,800);
});
test('refuses any different target, extra query or missing content',async()=>{
  for(const url of ['https://evil.example/html','http://httpbingo.org/html','https://httpbingo.org/get',
    'https://httpbingo.org/html?debug=1','https://httpbingo.org/html#section'])
    await assert.rejects(execute({url}),{code:'E_TARGET'});
  await assert.rejects(execute({heading:''}),{code:'E_PAGE_CONTENT'});
  await assert.rejects(execute({body:''}),{code:'E_PAGE_CONTENT'});
});
const base={protocol:'opendesk.task.request.v1',kind:'opendesk.task.request',version:1,requestId:'request-2026-00001'};
const check=o=>validateChatGPTTaskRequest(JSON.stringify(o));
test('fixed page uses existing strict request protocol without any privilege claim',()=>{
  const request=check({...base,taskId:'page.read.fixed',args:{}});
  assert.equal(fixedPageReadTarget(request),FIXED_PAGE_URL);
  assert.equal(request.approved,undefined);
  assert.ok(Object.isFrozen(request)&&Object.isFrozen(request.args));
});
test('rejects injected URL, selector, extra parameters and arbitrary task IDs',()=>{
  for(const args of [{url:'https://evil.example/'},{selector:'input'},{query:'secret'},{limit:3}])
    assert.throws(()=>check({...base,taskId:'page.read.fixed',args}),{code:'E_BRIDGE_SCHEMA'});
  assert.throws(()=>check({...base,taskId:'page.read.arbitrary',args:{}}),{code:'E_BRIDGE_SCHEMA'});
});
test('keeps original Baidu parser and destination unchanged',()=>{
  const request=check({...base,taskId:'baidu.search.top3',args:{query:'ai自动化第一选择',limit:3}});
  assert.equal(baiduSearchTarget(request),'https://www.baidu.com/s?wd=ai%E8%87%AA%E5%8A%A8%E5%8C%96%E7%AC%AC%E4%B8%80%E9%80%89%E6%8B%A9');
});
