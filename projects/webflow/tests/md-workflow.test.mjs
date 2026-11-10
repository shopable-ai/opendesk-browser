import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/ui/md-workflow.js',import.meta.url),'utf8');
const sandbox=vm.createContext({TextEncoder,URL,crypto:webcrypto});
vm.runInContext(source,sandbox);
const W=sandbox.OpenDeskMdWorkflow;
const MD='<!-- webflow-todo:v1 -->\n# 计算接力\n## 目标\n验证自动交接\n'+
'## T01 求和\n### 输入\nnumbers: [17, 28, 35]\n### 任务\n求和\n### 产出\nsum count marker inputVersion\n### 验收\nauto:sum-count-marker:v1\n'+
'## T02 翻倍\n### 输入\nartifact: T01\nmultiplier: 2\n### 任务\n翻倍\n### 产出\ndoubled marker inputVersion\n### 验收\nauto:doubled-marker:v1\n';
const version='a'.repeat(64),marker='12345678-1234-1234-1234-123456789abc',ctx={version,marker};
const realm=value=>vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(value))+')',sandbox);
const t1=(sum=80)=>realm({sum,count:3,marker,inputVersion:version});
const t2=doubled=>realm({doubled,marker,inputVersion:version});
const code=expected=>error=>error?.code===expected;
test('real Markdown text parses two tasks in order',()=>{
  const w=W.parse(MD);
  assert.equal(w.title,'计算接力');
  assert.deepEqual(Array.from(w.tasks,x=>x.id),['T01','T02']);
  assert.equal(W.spec(w).multiplier,2);
  assert.ok(Object.isFrozen(w));
});
test('duplicate IDs and required fields report structured failures',()=>{
  assert.throws(()=>W.parse(MD+'\n## T01 同 ID\n'),e=>e.code==='E_MD_DUPLICATE'&&e.line>0);
  assert.throws(()=>W.parse(MD.replace('### 输入\nnumbers:','### 输入\nx\n### 输入\nnumbers:')),code('E_MD_DUPLICATE'));
  assert.throws(()=>W.parse(MD.replace('### 产出\nsum count marker inputVersion\n','')),code('E_MD_REQUIRED'));
  assert.throws(()=>W.parse(MD.replace('webflow-todo:v1','webflow-todo:v2')),code('E_MD_FORMAT'));
  assert.throws(()=>W.parse(MD.replace('auto:sum-count-marker:v1','答案很好自动通过')),code('E_MD_ACCEPTANCE'));
});
test('fenced headings cannot become tasks or alter acceptance',()=>{
  const fence=String.fromCharCode(96).repeat(3);
  const x=MD.replace('### 任务\n求和','### 任务\n'+fence+'md\n## T99 伪任务\n### 验收\nauto:forged\n'+fence+'\n求和');
  assert.deepEqual(Array.from(W.parse(x).tasks,t=>t.id),['T01','T02']);
  assert.throws(()=>W.parse(x.replace(fence+'\n求和','求和')),code('E_MD_FORMAT'));
});
test('GitHub URL validation rejects tokens, wrong origins and wrong file types',()=>{
  assert.equal(W.githubRaw('https://github.com/u/r/blob/main/demo.md'),'https://raw.githubusercontent.com/u/r/main/demo.md');
  for(const url of ['http://github.com/u/r/blob/main/demo.md','https://example.com/x.md',
  'https://github.com/u/r/blob/main/a.js','https://github.com/u/r/blob/main/x.md?secret=1',
  'https://github.com/u/r/blob/main/%2e%2e/x.md'])
    assert.throws(()=>W.githubRaw(url),code('E_MD_SOURCE'));
});
test('public read returns fetched content and version; 403, 404 and network fail closed',async()=>{
  const url='https://github.com/u/r/blob/main/demo.md';let count=0;
  const reply=await W.readGithub(url,{fetcher:async raw=>{count++;
    assert.equal(raw,'https://raw.githubusercontent.com/u/r/main/demo.md');
    return {ok:true,status:200,text:async()=>MD};}});
  assert.equal(count,1);assert.equal(reply.content,MD);assert.match(reply.version,/^[a-f0-9]{64}$/);
  for(const [response,expected] of [[{status:403,ok:false},'E_MD_AUTH'],[{status:404,ok:false},'E_MD_FETCH']])
    await assert.rejects(W.readGithub(url,{fetcher:async()=>response}),code(expected));
  await assert.rejects(W.readGithub(url,{fetcher:async()=>{throw Error('offline');}}),code('E_MD_FETCH'));
  await assert.rejects(W.readGithub(url),code('E_MD_FETCH'));
  await assert.rejects(W.readGithub(url,{fetcher:async()=>{throw Object.assign(Error('denied'),{code:'E_NETWORK_NOT_SUBMITTED'});}}),code('E_MD_PERMISSION'));
});
test('T01 checks actual numbers, marker, version, and disallows extra keys',()=>{
  const w=W.parse(MD);
  assert.equal(W.verifyT01(w,ctx,t1()),true);
  for(const bad of [{...t1(),sum:79},{...t1(),marker:'forged'},
    {...t1(),inputVersion:'b'.repeat(64)},{...t1(),verified:true}])
    assert.throws(()=>W.verifyT01(w,ctx,realm(bad)),code('E_DEMO_ACCEPTANCE'));
  assert.ok(!W.promptT01(w,ctx).includes('80'));
});
test('T02 receives the verified saved content, never raw first-task numbers',()=>{
  const w=W.parse(MD),saved=t1(),read=t1(),prompt=W.promptT02(w,ctx,saved,read);
  assert.ok(prompt.includes('"sum":80'));assert.ok(!prompt.includes('[17,28,35]'));
  assert.equal(W.verifyT02(w,ctx,saved,read,t2(160)),true);
  assert.throws(()=>W.promptT02(w,ctx,saved,t1(79)),code('E_DEMO_READBACK'));
  assert.throws(()=>W.promptT02(w,ctx,saved,realm({path:'T01.json'})),code('E_DEMO_READBACK'));
  assert.throws(()=>W.verifyT02(w,ctx,saved,read,t2(159)),code('E_DEMO_ACCEPTANCE'));
});
test('35 → 36 changes independent expected sum/doubled to 81 and 162',()=>{
  const w=W.parse(MD.replace('35]','36]')),saved=t1(81);
  assert.equal(W.verifyT01(w,ctx,saved),true);
  assert.equal(W.verifyT02(w,ctx,saved,t1(81),t2(162)),true);
  assert.throws(()=>W.verifyT01(w,ctx,t1(80)),code('E_DEMO_ACCEPTANCE'));
  assert.throws(()=>W.verifyT02(w,ctx,saved,saved,t2(160)),code('E_DEMO_ACCEPTANCE'));
});
