import test from 'node:test';
import assert from 'node:assert/strict';
import {createFileWorkspaceService,FILES_PROTOCOL} from '../../src/native-agent/file-workspace-service.js';
import {createNativeAgentService} from '../../src/native-agent/service-worker.js';
import {AGENT_ENABLED_KEY} from '../../src/native-agent/protocol.js';
import {renderMarkdown,validatePreviewURL} from '../../src/native-agent/file-preview.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture({permission=async()=>true,timeoutMs=1000}={}){
  const sent=[],port={postMessage:m=>sent.push(m)},connection={enabled:true,ready:true,generation:1,port};
  const service=createFileWorkspaceService({api:{permissions:{contains:permission}},connection:()=>connection,timeoutMs});
  service.negotiate(1);const sessionId='a'.repeat(32);
  service.receive({v:1,kind:'files.state',protocol:FILES_PROTOCOL,connected:true,sessionId,maxContentBytes:32768});
  const reply=(request,body)=>service.receive({v:1,kind:'files.response',protocol:FILES_PROTOCOL,sessionId,requestId:request.requestId,...body});
  return {service,sent,connection,reply};
}
test('workspace messages reuse the authenticated connection and return confirmed conflicts unchanged',async t=>{
  const f=fixture();t.after(f.service.dispose);
  const read=f.service.request('files.read',{workspaceId:'w',path:'README.md'});await tick();
  assert.equal(f.sent[0].kind,'files.request');assert.equal(f.sent[0].protocol,FILES_PROTOCOL);
  f.reply(f.sent[0],{result:{content:'hello'}});assert.deepEqual(await read,{content:'hello'});
  const write=f.service.request('files.write',{workspaceId:'w',path:'README.md',content:'new',expectedSha256:'1'.repeat(64)});
  const rejected=assert.rejects(write,e=>e.code==='E_FILES_CONFLICT'&&e.outcome==='NOT_DISPATCHED');await tick();
  f.reply(f.sent[1],{error:{code:'E_FILES_CONFLICT',message:'external edit',outcome:'NOT_DISPATCHED'}});await rejected;
  assert.equal(f.sent.length,2,'writes never retry');
});
for(const body of [{error:null},{error:false},{error:{}},{error:{code:'X',message:'x',outcome:'SUCCESS'}},{result:null},{result:{}},{result:{saved:true,sha256:'bad'}},{result:{saved:true,sha256:'a'.repeat(64)},error:{code:'X',message:'x'}}]){
  test('malformed write response is never reported as saved: '+JSON.stringify(body),async t=>{
    const f=fixture();t.after(f.service.dispose);
    const p=f.service.request('files.write',{workspaceId:'w',path:'x.md',content:'x',expectedSha256:'0'.repeat(64)});
    const rejected=assert.rejects(p,e=>e.outcome==='OUTCOME_UNKNOWN');await tick();f.reply(f.sent[0],body);await rejected;
    assert.equal(f.sent.length,1);
  });
}
test('caller input is frozen before permission await, and reconnect fences pending writes',async t=>{
  let release;const permission=new Promise(r=>{release=r;}),f=fixture({permission:()=>permission});t.after(f.service.dispose);
  const params={workspaceId:'w',path:'a.md',content:'original',expectedSha256:'0'.repeat(64)};
  const p=f.service.request('files.write',params);const rejected=assert.rejects(p,e=>e.outcome==='OUTCOME_UNKNOWN');
  params.content='mutated';release(true);await tick();assert.equal(f.sent[0].params.content,'original');
  f.service.disconnected();await rejected;assert.equal(f.sent.length,1);
});
test('permission revocation or generation change while checking permission prevents dispatch',async t=>{
  let release;const f=fixture({permission:()=>new Promise(r=>{release=r;})});t.after(f.service.dispose);
  const p=f.service.request('files.read',{});const rejected=assert.rejects(p,e=>e.code==='E_FILES_DISCONNECTED');
  f.connection.generation++;release(true);await rejected;assert.equal(f.sent.length,0);
});
test('write timeout remains unknown and never resends; read timeout is confirmed',async t=>{
  const f=fixture({timeoutMs:8});t.after(f.service.dispose);
  await assert.rejects(f.service.request('files.write',{}),e=>e.code==='E_FILES_TIMEOUT'&&e.outcome==='OUTCOME_UNKNOWN');
  await assert.rejects(f.service.request('files.read',{}),e=>e.code==='E_FILES_TIMEOUT'&&e.outcome==='FAILED_CONFIRMED');
  assert.equal(f.sent.length,2);
});
test('old hosts remain supported for existing features but cannot receive file requests',async t=>{
  const f=fixture();t.after(f.service.dispose);f.service.negotiate(undefined);
  assert.deepEqual(f.service.state(),{supported:false,connected:false,maxContentBytes:32768});
  await assert.rejects(f.service.request('files.read',{}),e=>e.code==='E_FILES_UNSUPPORTED');assert.equal(f.sent.length,0);
});
test('invalid files.state is rejected without changing the live session',async t=>{
  const f=fixture();t.after(f.service.dispose);
  assert.equal(f.service.receive({v:1,kind:'files.state',protocol:FILES_PROTOCOL,connected:true,sessionId:'b'.repeat(32),maxContentBytes:999999}),false);
  const p=f.service.request('files.read',{});await tick();assert.equal(f.sent[0].sessionId,'a'.repeat(32));
  f.reply(f.sent[0],{result:{ok:true}});await p;
});
test('only the exact top-level extension workspace may request native files',async t=>{
  const events=()=>({addListener(){},removeListener(){}}),id='a'.repeat(32);
  const api={runtime:{id,getURL:p=>'chrome-extension://'+id+'/'+p},
    storage:{local:{get:async()=>({[AGENT_ENABLED_KEY]:false})}},permissions:{contains:async()=>false,onRemoved:events()}};
  const service=createNativeAgentService({api});t.after(service.dispose);await service.ready;
  const sender={id,url:api.runtime.getURL('native-agent/workspace.html'),documentId:'document',frameId:0};
  assert.equal((await service.handleSettings({type:'files.state'},sender)).connected,false);
  const query='?workspaceId=workspace-00000000-0000-4000-8000-000000000001';
  assert.equal((await service.handleSettings({type:'files.state'},{...sender,url:sender.url+query})).connected,false);
  const sourceQuery='?sourceId=source-'+ 'a'.repeat(24);
  assert.equal((await service.handleSettings({type:'files.state'},{...sender,url:sender.url+sourceQuery})).connected,false);
  for(const bad of [{...sender,url:'https://chatgpt.com/'},{...sender,frameId:1},{...sender,id:'b'.repeat(32)},
    {...sender,url:sender.url+'?trusted=true'},{...sender,documentId:undefined},
    {...sender,url:sender.url+'?workspaceId=demo-workspace'},{...sender,url:sender.url+query+'&workspaceId=duplicate'},
    {...sender,url:sender.url+query+'&trusted=true'},{...sender,url:sender.url+query+'#fragment'},
    {...sender,url:sender.url+'?sourceId=arbitrary-path'},{...sender,url:sender.url+sourceQuery+'&sourceId=duplicate'},
    {...sender,url:sender.url+sourceQuery+'&'+query.slice(1)}])
    await assert.rejects(service.handleSettings({type:'files.request',method:'files.read',params:{}},bad),e=>e.code==='E_OWNER');
  await assert.rejects(service.handleSettings({type:'enable'},sender),e=>e.code==='E_CAPABILITY');
});
test('basic Markdown escapes active HTML and implements headings, lists, fences and tables',()=>{
  const out=renderMarkdown('# Hello\n\n**bold**\n\n- one\n- two\n\n<script>alert(1)</script>\n\n```html\n<img onerror=x>\n```\n\n| A | B |\n| --- | --- |\n| x | y |');
  assert.match(out,/<h1>Hello<\/h1>/);assert.match(out,/<strong>bold<\/strong>/);assert.match(out,/<ul>/);assert.match(out,/<table>/);
  assert.doesNotMatch(out,/<script|<img|onerror="/);assert.match(out,/&lt;script&gt;/);
});
test('local app URL parser rejects remote, credential-bearing, opaque, ambiguous hosts',()=>{
  for(const good of ['http://127.0.0.1:3000/','http://localhost:43111/demo-form.html'])assert.equal(validatePreviewURL(good),new URL(good).href);
  for(const bad of ['https://127.0.0.1:3000/','http://127.0.0.1.evil.test:3000/','http://127.0.0.1:3000@evil.test/',
    'http://me:secret@localhost:3000/','javascript:alert(1)','file:///tmp/index.html','http://localhost:3000/#token','https://example.com','http://[::1]:8080/'])assert.throws(()=>validatePreviewURL(bad));
});
