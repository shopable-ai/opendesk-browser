import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {dirname} from 'node:path';
import {stat} from 'node:fs/promises';
import {startTeamPreview} from '../preview/react/team-http.mjs';
import {createCookieTeamAccounts} from '../app/domain/team-accounts.js';

test('same-source team flow uses real HTTP, encryption and trusted accounts with two isolated synthetic members',async t=>{
  const h=await startTeamPreview({port:0});t.after(()=>h.close());await h.seed();
  const a=h.clients.A.client,b=h.clients.B.client;
  assert.deepEqual((await a.list()).accounts.map(x=>x.accountId),['one','two']);
  assert.deepEqual((await b.list()).accounts,[]);
  await assert.rejects(b.pair('one'),{code:'E_TEAM_UNAVAILABLE'});
  await assert.rejects(h.clients.B.wire('POST','/opendesk/v1/team-accounts/one/claim',{
    operationId:randomUUID(),accountVersion:1,assignmentRevision:1,authEpoch:1}),{status:403});
  for(const [id,marker]of [['one','OPERATIONS'],['two','DESIGN']]){
    const before=h.inspect().members.A.writes;
    await a.pair(id);await h.deliver(id);const received=await a.receive(id);
    assert.equal(received.phase,'DOWNLOADED');assert.equal(h.inspect().members.A.writes,before);
    await assert.rejects(a.use(id),{code:'E_TEAM_REVIEW_REQUIRED'});
    await a.review(id);const applied=await a.use(id);
    assert.equal(applied.receipt.verified,true);assert.equal(applied.receipt.websiteLoginConfirmed,false);
    assert.equal(h.inspect().members.A.currentSyntheticAccount,marker);
  }
  assert.equal(h.inspect().members.A.writes,2);assert.equal(h.inspect().members.B.writes,0);
  await a.review('one');await h.revoke('one');
  await assert.rejects(a.use('one'),{code:'E_TEAM_UNAVAILABLE'});
  assert.equal(h.inspect().members.A.currentSyntheticAccount,'DESIGN');
  const revoked=(await h.admin('team-accounts')).assignments.find(x=>x.accountId==='one');assert.equal(revoked.revoked,true);
  await a.review('two');
  await h.admin('team-accounts',{operationId:randomUUID(),accountId:'two',expectedVersion:1,displayName:'新版合成设计账号',
    origin:'https://team.example.test',expiresAt:Date.now()+3600000});
  await assert.rejects(a.use('two'),{code:'E_TEAM_UNAVAILABLE'});
  assert.equal(h.inspect().members.A.writes,2);assert.equal((await a.list()).accounts.length,0);
});

test('lost HTTP and trusted receipts remain fenced across client reopen without replay',async t=>{
  const h=await startTeamPreview({port:0});t.after(()=>h.close());await h.seed();
  const own=h.clients.A;let posts=0;
  const client=createCookieTeamAccounts({wire:async(method,path,body)=>{
    const result=await own.wire(method,path,body);if(method==='POST'){posts++;throw Error('synthetic response lost');}return result;
  },account:(name,payload)=>own.consumer.dispatch(name,payload),scope:own.consumer.scope,journal:own.journal});
  await assert.rejects(client.pair('one'),{code:'E_TEAM_UNKNOWN'});
  const reopened=own.make(),state=await reopened.list();assert.equal(state.pending,true);
  await assert.rejects(reopened.pair('one'),{code:'E_TEAM_UNKNOWN'});
  assert.equal((await reopened.reconcile(state.local[0].operationId)).status,'CONFIRMED');assert.equal(posts,1);
  assert.equal((await own.consumer.dispatch('status')).accounts.length,0);
  await reopened.pair('one');await h.deliver('one');await reopened.receive('one');await reopened.review('one');
  own.consumer.controls.loseSwitchReceipt=true;
  await assert.rejects(reopened.use('one'),{code:'E_TEAM_UNKNOWN'});
  const again=own.make(),unknown=await again.list();assert.equal(unknown.pending,true);
  assert.equal((await again.reconcile(unknown.local[0].operationId)).status,'UNKNOWN');
  await assert.rejects(again.review('one'),{code:'E_TEAM_UNKNOWN'});
  assert.equal(h.inspect().members.A.writes,1);assert.equal(h.inspect().members.B.writes,0);
});

test('synthetic preview RPC rejects cross-origin, unknown actions and arbitrary forwarding',async t=>{
  const h=await startTeamPreview({port:0});t.after(()=>h.close());
  const denied=await fetch(h.previewOrigin+h.rpc,{method:'POST',headers:{'content-type':'application/json',origin:'https://unrelated.invalid'},
    body:JSON.stringify({member:'A',action:'seed',argument:null})});assert.equal(denied.status,403);
  const unknown=await fetch(h.previewOrigin+h.rpc,{method:'POST',headers:{'content-type':'application/json',origin:h.previewOrigin},
    body:JSON.stringify({member:'A',action:'forward',argument:'https://unrelated.invalid'})});assert.equal(unknown.status,400);
  const config=await (await fetch(h.previewOrigin+'/__cookie-team/config')).json();
  assert.deepEqual(Object.keys(config).sort(),['mode','origin','rpc']);assert.equal(config.mode,'SYNTHETIC_TRUSTED_DRIVER');
  assert.equal(h.inspect().audit.length,2);assert.equal(h.inspect().members.A.writes,0);
});

test('owned preview CLI SIGTERM closes its ports and removes its private synthetic data',async t=>{
  const child=spawn(process.execPath,[new URL('../preview/react/team-http.mjs',import.meta.url).pathname],{
    env:{...process.env,COOKIE_TEAM_PREVIEW_PORT:'0'},stdio:['pipe','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
  let output='';
  const ready=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('preview start timeout')),15000);timer.unref();
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',()=>{clearTimeout(timer);reject(Error('preview exited before ready'));});
    child.stdout.on('data',part=>{output+=part;if(output.length>8192)return reject(Error('unexpected preview output'));
      const line=output.split('\n').find(line=>line.startsWith('{"url":'));if(line){clearTimeout(timer);resolve(JSON.parse(line));}});
  });
  const {url,backendOrigin,launchFile}=await ready;
  const rendered=await fetch(url);assert.equal(rendered.status,200);assert.match(await rendered.text(),/src\/main\.jsx/);
  await stat(launchFile);
  const exit=once(child,'exit');child.kill('SIGTERM');const [code,signal]=await exit;
  assert.equal(code,0);assert.equal(signal,null);
  await assert.rejects(stat(dirname(launchFile)),{code:'ENOENT'});
  await assert.rejects(fetch(url));await assert.rejects(fetch(backendOrigin));
});
