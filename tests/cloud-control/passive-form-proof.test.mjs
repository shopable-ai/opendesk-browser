import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t){
  const module=await import('./passive-form-proof.mjs').catch(()=>({}));
  assert.equal(typeof module.startPassiveFormProof,'function','passive observation support is missing');
  const temporary=await mkdtemp(path.join(tmpdir(),'opendesk-passive-proof-'));
  const directory=path.join(temporary,'session');
  t.after(()=>rm(temporary,{recursive:true,force:true}));
  const server=await module.startPassiveFormProof({directory,port:0});
  t.after(()=>server.close());
  const response=await fetch(server.url),html=await response.text();
  const documentInstance=html.match(/data-opendesk-proof="([a-f0-9-]{36})"/)[1];
  const session=JSON.parse(await readFile(path.join(directory,'session.json'),'utf8'));
  const row=(eventSeq,type,extra={})=>({sessionId:session.sessionId,documentInstance,
    eventSeq,type,url:server.url,name:'Cloud-Test-Unique',done:null,
    at:new Date().toISOString(),...extra});
  const send=body=>fetch(new URL('/__opendesk_cloud_proof',server.url),{
    method:'POST',headers:{origin:new URL(server.url).origin,'content-type':'text/plain'},
    body:JSON.stringify(body)});
  return {directory,server,html,documentInstance,session,row,send};
}
const lines=async filename=>(await readFile(filename,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);

test('records the actual HTML and immutable Task, then persists every submit before acknowledging',async t=>{
  const f=await fixture(t);
  const original=await readFile('examples/tasks/demo-form.html');
  const documents=await lines(path.join(f.directory,'documents.jsonl'));
  assert.equal(f.session.originalPageSha256,sha(original));
  assert.equal(f.session.task.taskId,'sample.form-fill');
  assert.equal(f.session.task.version,'1.0.0');
  assert.equal(documents[0].htmlSha256,sha(f.html));
  assert.equal(await readFile(path.join(f.directory,'documents',f.documentInstance+'.html'),'utf8'),f.html);
  assert.equal((await f.send(f.row(1,'ready',{name:''}))).status,204);
  for(const [seq,type] of [[2,'submit'],[3,'done'],[4,'submit'],[5,'done']])
    assert.equal((await f.send(f.row(seq,type,{done:type==='done'?'已提交：Cloud-Test-Unique':null}))).status,204);
  const events=await lines(path.join(f.directory,'events.jsonl'));
  assert.deepEqual(events.map(e=>e.receiveSeq),[1,2,3,4,5]);
  assert.equal(events.filter(e=>e.type==='submit').length,2,'same-name second submit must remain visible');
  assert.ok(events.every(e=>e.documentInstance===f.documentInstance&&e.receivedAt));
  assert.equal(f.session.nativeIdentity,'NOT_OBSERVED');
});

test('rejects foreign origins, unknown documents and extra fields; preserves gaps and duplicate events',async t=>{
  const f=await fixture(t);
  const route=new URL('/__opendesk_cloud_proof',f.server.url);
  assert.equal((await fetch(route,{method:'POST',headers:{origin:'https://example.com'},body:JSON.stringify(f.row(1,'ready'))})).status,403);
  assert.equal((await f.send(f.row(1,'ready',{documentInstance:'00000000-0000-4000-8000-000000000000'}))).status,400);
  assert.equal((await f.send(f.row(1,'ready',{credential:'must-not-be-saved'}))).status,400);
  assert.equal((await f.send(f.row(1,'ready'))).status,204);
  assert.equal((await f.send(f.row(3,'submit'))).status,204);
  assert.equal((await f.send(f.row(3,'submit'))).status,204);
  const events=await lines(path.join(f.directory,'events.jsonl'));
  assert.equal(events.length,3);
  assert.deepEqual(events.map(e=>e.sequenceContinuous),[true,false,false]);
  assert.equal(events.filter(e=>e.type==='submit').length,2);
  assert.ok(!(await readFile(path.join(f.directory,'events.jsonl'),'utf8')).includes('credential'));
  assert.equal((await fetch(new URL('/form-fill.v1.opendesk-task.json',f.server.url))).status,200);
  assert.equal((await fetch(new URL('/__opendesk_cloud_proof',f.server.url))).status,405);
  assert.equal((await fetch(new URL('/%2e%2e/%2e%2e/AGENTS.md',f.server.url))).status,404);
});

test('the observer is passive and emits repeated form submissions and same-text new completion nodes',async t=>{
  const f=await fixture(t),events=[],handlers=new Map();
  let done=null,mutate;
  const name=Object.freeze({value:'Cloud-Test-Unique'}),form=Object.freeze({id:'demo-form'});
  const document=Object.freeze({
    querySelector:selector=>selector==='#name'?name:selector==='#done'?done:null,
    addEventListener:(type,callback,capture)=>{assert.equal(capture,true);handlers.set(type,callback);},
  });
  const source=f.html.match(/<script data-opendesk-proof="[^"]+">([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(source,{document,location:Object.freeze({href:f.server.url}),
    navigator:Object.freeze({sendBeacon:(_url,body)=>{events.push(JSON.parse(body));return true;}}),
    MutationObserver:class{constructor(callback){mutate=callback;}observe(target){assert.equal(target,document);}},Date});
  assert.equal(events[0].type,'ready');
  for(let i=0;i<2;i++){
    handlers.get('submit')({target:form});
    done=Object.freeze({textContent:'已提交：Cloud-Test-Unique'});mutate();
  }
  assert.deepEqual(events.map(e=>e.type),['ready','submit','done','submit','done']);
  assert.deepEqual(events.map(e=>e.eventSeq),[1,2,3,4,5]);
  assert.ok(events.slice(1).every(e=>e.name===name.value));
  assert.equal(name.value,'Cloud-Test-Unique');
});
