import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {request as httpRequest} from 'node:http';
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

test('manual proof query reads committed original-document events without changing them or claiming native success',async t=>{
  const f=await fixture(t);
  assert.equal((await f.send(f.row(1,'ready',{name:''}))).status,204);
  assert.equal((await f.send(f.row(2,'submit'))).status,204);
  assert.equal((await f.send(f.row(3,'done',{done:'已提交：Cloud-Test-Unique'}))).status,204);
  assert.equal((await f.send(f.row(4,'submit'))).status,204);
  const before=await readFile(path.join(f.directory,'events.jsonl'),'utf8');
  const response=await fetch(new URL('/__opendesk_cloud_proof/query',f.server.url),{
    method:'POST',headers:{origin:new URL(f.server.url).origin,'content-type':'application/json'},
    body:JSON.stringify({name:'Cloud-Test-Unique'}),
  });
  assert.equal(response.status,200,'the manual effect lookup must be available');
  const proof=await response.json();
  assert.equal(proof.sessionId,f.session.sessionId);
  assert.equal(proof.proofLevel,'PASSIVE_ONLY');
  assert.equal(proof.nativeIdentity,'NOT_OBSERVED');
  assert.equal(proof.task.version,'1.0.0');
  assert.equal(proof.documents.length,1);
  const doc=proof.documents[0];
  assert.equal(doc.documentInstance,f.documentInstance);
  assert.equal(doc.htmlSha256,sha(f.html));
  assert.equal(doc.submitCount,2,'a second submit must not disappear behind a completion');
  assert.equal(doc.matchingSubmitCount,2);
  assert.equal(doc.sequenceContinuous,true);
  assert.deepEqual(doc.events.map(e=>e.type),['ready','submit','done','submit']);
  assert.equal(doc.events[2].done,'已提交：Cloud-Test-Unique');
  assert.equal(await readFile(path.join(f.directory,'events.jsonl'),'utf8'),before,'lookup never appends evidence');
  assert.ok(!JSON.stringify(proof).includes(f.directory),'private paths must not leave the observer');
});

test('proof query requires exact same-origin POST and exact bounded name; unknown name is not success',async t=>{
  const f=await fixture(t),url=new URL('/__opendesk_cloud_proof/query',f.server.url);
  assert.equal((await fetch(url)).status,405);
  const request=(body,origin=new URL(f.server.url).origin)=>fetch(url,{method:'POST',
    headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await request({name:'Cloud-Test-Unique'},'https://example.com')).status,403);
  for(const body of [{name:''},{name:'x'.repeat(41)},{name:12},{name:'Alice',requestKey:'not-accepted'}])
    assert.equal((await request(body)).status,400);
  assert.equal((await request({name:'x'.repeat(4096)})).status,413);
  assert.equal((await f.send(f.row(1,'ready',{name:''}))).status,204);
  assert.equal((await f.send(f.row(2,'submit',{name:' Alice '}))).status,204);
  assert.equal((await request({name:'Alice'})).status,200);
  assert.deepEqual((await (await request({name:'Alice'})).json()).documents,[],'do not trim or match a different name');
  assert.equal((await (await request({name:' Alice '})).json()).documents.length,1);
});

test('proof query exposes sequence gaps and redacts other names within a matched document',async t=>{
  const f=await fixture(t);
  await f.send(f.row(1,'ready',{name:''}));
  await f.send(f.row(3,'submit'));
  await f.send(f.row(4,'done',{name:'Other-private-name',done:'已提交：Other-private-name'}));
  const response=await fetch(new URL('/__opendesk_cloud_proof/query',f.server.url),{
    method:'POST',headers:{origin:new URL(f.server.url).origin},body:JSON.stringify({name:'Cloud-Test-Unique'}),
  });
  assert.equal(response.status,200);
  const proof=await response.json(),doc=proof.documents[0];
  assert.equal(doc.sequenceContinuous,false);
  assert.equal(doc.events[2].matchesName,false);
  assert.ok(!JSON.stringify(proof).includes('Other-private-name'));
  assert.equal((await fetch(new URL('/cloud-proof.html',f.server.url))).status,200);
});

test('a matching input name never discloses a stale completion belonging to another name',async t=>{
  const f=await fixture(t);
  await f.send(f.row(1,'ready',{name:''}));
  await f.send(f.row(2,'submit',{name:'Alice',done:'已提交：Other-private-name'}));
  await f.send(f.row(3,'done',{name:'Alice',done:'已提交：Alice'}));
  const response=await fetch(new URL('/__opendesk_cloud_proof/query',f.server.url),{
    method:'POST',headers:{origin:new URL(f.server.url).origin},body:JSON.stringify({name:'Alice'}),
  });
  const result=await response.json();
  assert.equal(response.status,200);
  assert.ok(!JSON.stringify(result).includes('Other-private-name'));
  assert.equal(result.documents[0].events[1].completionRedacted,true);
  assert.equal(result.documents[0].events[1].done,null);
  assert.equal(result.documents[0].events[2].done,'已提交：Alice');
  const stored=await readFile(path.join(f.directory,'events.jsonl'),'utf8');
  assert.ok(stored.includes('Other-private-name'),'the private original evidence is not rewritten');
});

test('root GET serves an inert HTML document after persisting only path, server time and sequence',async t=>{
  const f=await fixture(t),origin=new URL(f.server.url).origin;
  assert.equal(f.session.rootRequestLog?.path,'/','root-only observation metadata must be present');
  assert.deepEqual(f.session.rootRequestLog.methods,['GET']);
  const filename=path.join(f.directory,'root-requests.jsonl');
  assert.equal(await readFile(filename,'utf8'),'','a new session begins with no root requests');
  const documentsBefore=await readFile(path.join(f.directory,'documents.jsonl'),'utf8');
  for(const alias of ['secret-alias-A','secret-alias-B']){
    const response=await fetch(origin+'/#od-account='+alias,{headers:{
      cookie:'session=secret-cookie-value',authorization:'secret-auth-value',
      referer:origin+'/secret-referrer',
    }});
    assert.equal(response.status,200,'the shortcut root must be a normal document');
    assert.equal(response.headers.get('content-type'),'text/html; charset=utf-8');
    const html=await response.text();
    assert.match(html,/^<!doctype html>/i);
    assert.doesNotMatch(html,/<script\b|data-opendesk-proof|secret-alias|secret-cookie|secret-auth/i);
    assert.equal(Number(response.headers.get('content-length')),Buffer.byteLength(html));
    assert.equal(f.session.rootDocument?.htmlSha256,sha(html));
    assert.equal(response.headers.get('content-security-policy'),"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    assert.equal(response.headers.get('cache-control'),'no-store');
    const saved=await lines(filename);
    assert.equal(saved.length,alias==='secret-alias-A'?1:2,'the HTTP response follows durable observation');
  }
  const saved=await lines(filename);
  assert.deepEqual(saved.map(row=>row.requestSeq),[1,2]);
  assert.ok(saved.every(row=>row.path==='/'&&Number.isFinite(Date.parse(row.receivedAt))));
  assert.ok(saved.every(row=>Object.keys(row).sort().join(',')==='path,receivedAt,requestSeq'));
  assert.doesNotMatch(await readFile(filename,'utf8'),/secret|od-account|cookie|authorization|referer/i);
  assert.equal((await stat(filename)).mode&0o777,0o600);
  assert.equal(await readFile(path.join(f.directory,'documents.jsonl'),'utf8'),documentsBefore);
  assert.equal(f.session.execution,'NOT_TESTED');
});

test('HEAD, queries, other paths and denied hosts never masquerade as root document requests',async t=>{
  const f=await fixture(t),origin=new URL(f.server.url).origin;
  assert.equal(f.session.rootRequestLog?.path,'/');
  const head=await fetch(origin+'/',{method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal(head.headers.get('content-type'),'text/html; charset=utf-8');
  assert.ok(Number(head.headers.get('content-length'))>0);
  assert.equal(await head.text(),'');
  assert.equal((await fetch(origin+'/?secret-query=not-recorded')).status,404);
  assert.equal((await fetch(origin+'/',{method:'POST',body:'not-recorded'})).status,405);
  const deniedHost=await new Promise((resolve,reject)=>{
    const request=httpRequest(origin+'/',{headers:{host:'foreign.invalid'}},response=>{
      response.resume();response.on('end',()=>resolve(response.statusCode));
    });
    request.on('error',reject);request.end();
  });
  assert.equal(deniedHost,403);
  assert.equal((await fetch(origin+'/cloud-proof.html')).status,200);
  assert.equal((await fetch(f.server.url)).status,200);
  const pkg=await fetch(origin+'/form-fill.v1.opendesk-task.json');
  assert.equal(pkg.status,200);
  assert.equal(await pkg.text(),await readFile('examples/tasks/form-fill.v1.opendesk-task.json','utf8'));
  assert.equal(await readFile(path.join(f.directory,'root-requests.jsonl'),'utf8'),'');
});
