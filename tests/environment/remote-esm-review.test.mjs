import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {lockProgramRemote} from '../../scripts/lock-program-remote.mjs';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
const rootURL='https://cdn.example.org/lib@1.2.3/main.js';
const childURL='https://cdn.example.org/lib@1.2.3/math.js';
const sources=new Map([[rootURL,"export {twice} from './math.js';"],[childURL,'export const twice=n=>n*2;']]);

async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'opendesk-remote-review-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src'));
  const pkg=JSON.parse(await readFile('examples/programs/page-heading/package.json','utf8'));
  pkg.name='review-fixture';pkg.opendesk.id='test.remote-review';
  await writeFile(join(root,'package.json'),JSON.stringify(pkg));
  const put=source=>writeFile(join(root,'src/main.js'),source);
  await put("import {twice} from '"+rootURL+"';\nexport default ()=>twice(21);");
  const calls=[],fetchImpl=async url=>{
    calls.push(url);
    assert.ok(sources.has(url),'unexpected URL: '+url);
    return new Response(sources.get(url),{status:200,headers:{'content-type':'text/javascript'}});
  };
  return {root,put,fetchImpl,calls};
}

test('review is offline and unchanged source token approves roots, not undisclosed transitive URLs',async t=>{
  const f=await fixture(t);
  const pre=await lockProgramRemote(f.root);
  assert.equal(pre.status,'REVIEW_REQUIRED');
  assert.equal(pre.noNetwork,true);
  assert.deepEqual(pre.remoteRoots.map(x=>x.url),[rootURL]);
  assert.equal(f.calls.length,0);
  await assert.rejects(lockProgramRemote(f.root,{approve:'0'.repeat(20),fetchImpl:f.fetchImpl}),{code:'E_REMOTE_APPROVAL_CHANGED'});
  assert.equal(f.calls.length,0);
  const childReviews=[];
  await assert.rejects(lockProgramRemote(f.root,{approve:pre.reviewToken,fetchImpl:f.fetchImpl,
    allowURL:async url=>{childReviews.push(url);return false;}}),{code:'E_REMOTE_APPROVAL_REQUIRED'});
  assert.deepEqual(childReviews,[childURL]);
  await assert.rejects(readFile(join(f.root,'opendesk.remote-lock.json')),{code:'ENOENT'});
  const approved=await lockProgramRemote(f.root,{approve:pre.reviewToken,fetchImpl:f.fetchImpl,
    allowURL:async url=>url===childURL});
  assert.equal(approved.status,'LOCKED_NOT_EXECUTED');
  assert.equal(approved.remoteModuleCount,2);
  const locked=JSON.parse(await readFile(join(f.root,'opendesk.remote-lock.json'),'utf8'));
  assert.deepEqual(Object.keys(locked.modules).sort(),[rootURL,childURL].sort());
  const bytes=await buildProgramProjectInMemory(f.root);
  assert.equal(await vm.runInNewContext(bytes.sourceUtf8+'\nmain()', {document:{}}),42);
  const callsAfterPin=f.calls.length;
  const offline=await lockProgramRemote(f.root);
  const again=await lockProgramRemote(f.root,{approve:offline.reviewToken,
    fetchImpl:async()=>{throw new Error('should remain offline');},allowURL:async()=>assert.fail('cannot reprompt approved bytes')});
  assert.equal(again.status,'LOCKED_NOT_EXECUTED');
  assert.equal(f.calls.length,callsAfterPin);
});

test('changed source invalidates reviewed approval before any request',async t=>{
  const f=await fixture(t),pre=await lockProgramRemote(f.root);
  await f.put("import {twice} from '"+rootURL+"';\nexport default ()=>twice(22);");
  await assert.rejects(lockProgramRemote(f.root,{approve:pre.reviewToken,fetchImpl:f.fetchImpl}),{code:'E_REMOTE_APPROVAL_CHANGED'});
  assert.equal(f.calls.length,0);
});

test('source edits during a remote fetch cannot commit a lock for the former graph',async t=>{
  const f=await fixture(t),pre=await lockProgramRemote(f.root);
  const mutate=async url=>{
    if(url===rootURL)await f.put("import {twice} from '"+rootURL+"';\nexport default ()=>twice(23);");
    return f.fetchImpl(url);
  };
  await assert.rejects(lockProgramRemote(f.root,{approve:pre.reviewToken,allowURL:async()=>true,
    fetchImpl:mutate}),{code:'E_REMOTE_APPROVAL_CHANGED'});
  await assert.rejects(readFile(join(f.root,'opendesk.remote-lock.json')),{code:'ENOENT'});
});

test('A -> B -> C remote hosts are individually approved; denial commits no partial lock',async t=>{
  const f=await fixture(t);
  const A='https://a.example.org/lib/main.js';
  const B='https://b.example.net/lib/bridge.js';
  const C='https://c.example.com/lib/value.js';
  const graph=new Map([[A,"export {answer} from '"+B+"';"],
    [B,"export {answer} from '"+C+"';"],[C,'export const answer=42;']]);
  await f.put("import {answer} from '"+A+"'; export default ()=>answer;");
  const requested=[];
  const download=async url=>{
    requested.push(url);assert.ok(graph.has(url),'unexpected URL '+url);
    return new Response(graph.get(url),{status:200,headers:{'content-type':'text/javascript'}});
  };
  const review=await lockProgramRemote(f.root);
  assert.equal(review.noNetwork,true);
  assert.deepEqual(review.remoteRoots.map(x=>x.url),[A]);
  assert.deepEqual(requested,[],'review must be offline');
  const asked=[];
  await assert.rejects(lockProgramRemote(f.root,{approve:review.reviewToken,
    fetchImpl:download,allowURL:async url=>{asked.push(url);return url===B;}}),
    {code:'E_REMOTE_APPROVAL_REQUIRED'});
  assert.deepEqual(asked,[B,C]);
  await assert.rejects(readFile(join(f.root,'opendesk.remote-lock.json')),{code:'ENOENT'});
  const permitted=[];
  const result=await lockProgramRemote(f.root,{approve:review.reviewToken,
    fetchImpl:download,allowURL:async url=>{permitted.push(url);return url===B||url===C;}});
  assert.equal(result.status,'LOCKED_NOT_EXECUTED');
  assert.deepEqual(permitted,[B,C]);
  const lock=JSON.parse(await readFile(join(f.root,'opendesk.remote-lock.json'),'utf8'));
  assert.deepEqual(Object.keys(lock.modules).sort(),[A,B,C].sort());
  const build=await buildProgramProjectInMemory(f.root);
  assert.equal(await vm.runInNewContext(build.sourceUtf8+'\nmain()', {document:{}}),42);
  const count=requested.length;
  const offline=await buildProgramProjectInMemory(f.root);
  assert.equal(offline.sourceHash,build.sourceHash);
  assert.equal(requested.length,count,'pinned rebuild cannot use downloader');
});
