import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {HistoryStore} from '../../ai-account-usage/history-store.mjs';
import {ServiceBindingStore} from '../../ai-account-usage/service-binding-store.mjs';
import {TeamAccountStore} from '../../ai-account-usage/team-account-store.mjs';
import {createTeamAccountService} from '../../ai-account-usage/team-accounts.mjs';
import {startManagementServer} from '../../ai-account-usage/web-server.mjs';
const op=()=>randomUUID(), invite=n=>'https://relay.example/i/'+String(n).padStart(22,'a');
const fp='a'.repeat(64),base='/opendesk/admin/api/',v1='/opendesk/v1/';
const target={origin:'https://chatgpt.com',documentId:'doc_a',tabId:3,url:'https://chatgpt.com/c/123',storeId:'0',partitionKey:null,packageHash:'b'.repeat(64),installEpoch:'epoch'};
async function setup(t){const dir=await mkdtemp(join(tmpdir(),'team-accounts-'));t.after(()=>rm(dir,{force:true,recursive:true}));
  for(const name of ['index.html','app.js','app.css'])await writeFile(join(dir,name),'asset');
  const history=new HistoryStore({directory:join(dir,'history')});await history.register({alias:'acct_01',displayName:'Usage'});
  const bindingStore=new ServiceBindingStore({directory:join(dir,'bindings')}),teamStore=new TeamAccountStore({directory:join(dir,'teams')});let now=1800000000000;
  const start=()=>startManagementServer({store:history,service:{query:()=>{throw Error('NO_UPSTREAM');}},assetsDirectory:dir,bindingStore,teamStore,clock:()=>now});
  const server=await start();t.after(()=>server.close());const origin=new URL(server.url).origin;
  const req=(path,{method='GET',body,headers={}}={})=>new Promise((resolve,reject)=>{const r=httpRequest({hostname:'127.0.0.1',port:new URL(origin).port,path,method,headers:{host:new URL(origin).host,...(body!==undefined?{'content-type':'application/json'}:{}),...headers}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,data:JSON.parse(text)}));});r.on('error',reject);r.end(body===undefined?undefined:JSON.stringify(body));});
  const session=await req('/session',{method:'POST',body:{code:server.pairingCode},headers:{origin}}),adminHeaders={origin,cookie:session.headers['set-cookie'][0].split(';')[0]};
  const admin=(path,body)=>req(base+path,{method:body?'POST':'GET',body,headers:adminHeaders});
  async function pair(memberId){const pairing=await admin('client-pairing',memberId?{memberId}:{});assert.equal(pairing.status,200);
    const paired=await req('/opendesk/client/pair',{method:'POST',headers:{origin:'chrome-extension://'+'a'.repeat(32)},body:{code:pairing.data.code,connectionId:op(),operationId:op(),receiptKey:op().replaceAll('-','').repeat(2),label:memberId??'Legacy'}});assert.equal(paired.status,200);
    const call=(path,body,method=body?'POST':'GET')=>req('/opendesk/client/request',{method:'POST',body:{session:paired.data.session,method,path:v1+path,...(body!==undefined?{body}:{})}});
    return {...paired.data,call};}
  const publish=(accountId,expectedVersion=0)=>admin('team-accounts',{operationId:op(),accountId,expectedVersion,displayName:accountId,origin:target.origin,expiresAt:now+100000});
  const assign=(accountId,deviceId,expectedRevision=0,url=invite(accountId),senderFingerprint=null,accountVersion=1)=>admin('team-assignments',{operationId:op(),accountId,accountVersion,deviceId,expectedRevision,inviteUrl:url,senderFingerprint});
  return {dir,server,start,bindingStore,teamStore,req,origin,adminHeaders,admin,pair,publish,assign,advance:n=>now+=n};}
const claim=(revision=1,version=1)=>({operationId:op(),accountVersion:version,assignmentRevision:revision,authEpoch:1});

test('independent members, two accounts, pairing then fingerprint delivery and exact use receipts',async t=>{
  const f=await setup(t),a=await f.pair('alice'),b=await f.pair('bob');
  assert.equal((await a.call('self')).data.userId,'alice');assert.equal((await b.call('self')).data.userId,'bob');
  await f.publish('first');await f.publish('second');assert.equal((await f.assign('first',a.device.deviceId)).status,200);await f.assign('second',b.device.deviceId);
  const list=await a.call('team-accounts');assert.deepEqual(list.data.accounts.map(a=>a.accountId),['first']);assert.equal(list.data.member.authEpoch,1);
  assert.equal((await b.call('team-accounts/first/claim',claim())).status,403);
  const body=claim(),claimed=await a.call('team-accounts/first/claim',body);assert.equal(claimed.data.senderFingerprint,null);assert.equal(claimed.data.inviteUrl,invite('first'));
  assert.equal((await a.call('team-accounts/first/authorize-use',{...claim(),target})).data.error,'FINGERPRINT_REQUIRED');
  await f.assign('first',a.device.deviceId,1,invite('first'),fp);
  assert.equal((await a.call('team-accounts/first/claim',body)).status,409);
  const current=claim(2),res=await a.call('team-accounts/first/claim',current);assert.equal(res.data.senderFingerprint,fp);
  assert.deepEqual((await a.call('team-accounts/first/claim',current)).data,res.data);
  assert.equal((await a.call('team-accounts/first/claim',{...current,authEpoch:2})).status,409);
  for(const installEpoch of ['', 'x'.repeat(161),{},1,' bad'])assert.equal((await a.call('team-accounts/first/authorize-use',{...claim(2),target:{...target,installEpoch}})).status,400);
  const use={...claim(2),target},used=await a.call('team-accounts/first/authorize-use',use);assert.equal(used.status,200);assert.equal(used.data.status,'AUTHORIZED');assert.deepEqual(used.data.target,target);assert.equal(Object.hasOwn(used.data,'applied'),false);
  assert.deepEqual((await a.call('team-operations/'+use.operationId)).data.result,used.data);assert.equal((await a.call('team-operations/'+use.operationId)).data.status,'CONFIRMED');
  assert.deepEqual((await f.admin('team-operations/'+current.operationId)).data.result,res.data);
  assert.equal((await b.call('team-operations/'+current.operationId)).status,404);
  assert.equal((await a.call('team-accounts/first/authorize-use',{...use,target:{...target,tabId:4}})).data.error,'OPERATION_CONFLICT');
  for(const payload of [list.data,(await f.admin('team-accounts')).data]){assert.equal(JSON.stringify(payload).includes('inviteUrl'),false);assert.equal(JSON.stringify(payload).includes('senderFingerprint'),false);}
  const devices=(await f.admin('team-accounts')).data.devices;assert.deepEqual(devices.map(d=>d.userId).sort(),['alice','bob']);
});

test('admin validates exact bodies, URL uniqueness, spoofed identities, versions and target scope',async t=>{
  const f=await setup(t),a=await f.pair('alice'),b=await f.pair('bob');await f.publish('first');await f.publish('second');await f.assign('first',a.device.deviceId,0,invite(1),fp);
  assert.equal((await f.assign('second',b.device.deviceId,0,invite(1),fp)).data.error,'INVITATION_REUSED');
  assert.equal((await f.assign('first',b.device.deviceId,0,invite(1),fp)).status,409);
  assert.equal((await f.assign('first','fake')).status,404);
  assert.equal((await f.assign('first',a.device.deviceId,1,'http://relay.example/i/'+'a'.repeat(22),fp)).status,400);
  assert.equal((await f.assign('first',a.device.deviceId,1,invite(2),'bad')).status,400);
  for(const extra of [{userId:'bob'},{tenantId:'elsewhere'},{deviceId:b.device.deviceId},{cookies:[]}])assert.equal((await a.call('team-accounts/first/claim',{...claim(),...extra})).status,400);
  const badTarget={...target,origin:'https://other.example',url:'https://other.example/'};
  assert.equal((await a.call('team-accounts/first/authorize-use',{...claim(),target:badTarget})).status,403);
  assert.equal((await a.call('team-accounts/first/authorize-use',{...claim(),target:{...target,cookies:[]}})).status,400);
  const receipt=await a.call('team-accounts/first/claim',claim());await f.publish('first',1);
  assert.equal((await a.call('team-accounts/first/claim',claim())).status,409);assert.equal((await a.call('team-accounts')).data.accounts.length,0);
  assert.deepEqual((await a.call('team-operations/'+receipt.data.operationId)).data.result,receipt.data);
  await f.assign('first',a.device.deviceId,1,invite(3),fp,2);assert.equal((await a.call('team-accounts/first/claim',claim(2,2))).status,200);
  const publish={operationId:op(),accountId:'third',expectedVersion:0,displayName:'Third',origin:target.origin,expiresAt:1800000100000};
  assert.equal((await f.admin('team-accounts',publish)).status,200);assert.equal((await f.admin('team-accounts',{...publish,displayName:'Changed'})).data.error,'OPERATION_CONFLICT');
  assert.equal((await f.admin('team-accounts',{...publish,operationId:op(),cookies:[]})).status,400);
});

test('revoke, expiry, epoch changes and restart fail closed while receipts and metadata persist',async t=>{
  const f=await setup(t),a=await f.pair('alice');await f.publish('first');await f.assign('first',a.device.deviceId,0,invite(1),fp);
  const saved=await a.call('team-accounts/first/claim',claim());
  const revoke={operationId:op(),accountId:'first',deviceId:a.device.deviceId,expectedRevision:1};assert.equal((await f.admin('team-revoke',revoke)).status,200);
  assert.equal((await a.call('team-accounts/first/claim',claim())).status,403);assert.equal((await a.call('team-accounts/first/authorize-use',{...claim(),target})).status,403);
  assert.deepEqual((await a.call('team-operations/'+saved.data.operationId)).data.result,saved.data);
  await f.assign('first',a.device.deviceId,2,invite(2),fp);f.advance(100001);
  assert.equal((await a.call('team-accounts')).data.accounts[0].state,'EXPIRED');assert.equal((await a.call('team-accounts/first/claim',claim(3))).status,410);
  f.advance(-100001);await a.call('devices/'+a.device.deviceId,{operationId:op(),authEpoch:1},'DELETE');
  assert.equal((await a.call('team-accounts')).status,403);assert.deepEqual((await a.call('team-operations/'+saved.data.operationId)).data.result,saved.data);
  const persisted=await f.teamStore.read();assert.equal(persisted.operations.length>0,true);assert.equal((await stat(join(f.dir,'teams/team-accounts-v1.json'))).mode&0o777,0o600);
  const next=await f.start();try{await assert.rejects(next.serviceBinding.request(a.session,{method:'GET',path:v1+'team-accounts'}),{code:'TRUSTED_SESSION_REQUIRED'});
    const client=await next.serviceBinding.createLocalClient({connectionId:op(),installationId:op(),userId:'alice',grantFamilyId:op(),resourceIds:['acct_01']});
    await next.serviceBinding.request(client.secret,{method:'POST',path:v1+'devices',body:{operationId:op(),label:'Restart'}});
    assert.deepEqual((await next.serviceBinding.request(client.secret,{method:'GET',path:v1+'team-accounts'})).accounts,[]);
  }finally{await next.close();}
  assert.equal((await new TeamAccountStore({directory:join(f.dir,'teams')}).read()).accounts[0].accountId,'first');
});

test('Host/Origin and administrator boundaries stay strict; legacy pairing remains local_http',async t=>{
  const f=await setup(t),a=await f.pair();assert.equal((await a.call('self')).data.userId,'local_http');
  assert.equal((await f.req(base+'team-accounts')).status,401);
  assert.equal((await f.req(base+'team-accounts',{headers:{...f.adminHeaders,host:'localhost'}})).status,403);
  assert.equal((await f.req(base+'team-accounts',{headers:{...f.adminHeaders,origin:'https://evil.example'}})).status,403);
  assert.equal((await f.req(base+'team-accounts',{method:'POST',body:{},headers:{cookie:f.adminHeaders.cookie}})).status,403);
  assert.equal((await f.req(v1+'team-accounts',{headers:f.adminHeaders})).status,403);
  assert.equal((await f.req('/opendesk/client/request',{method:'POST',body:{session:a.session,method:'GET',path:v1+'team-accounts'},headers:{origin:'https://evil.example'}})).status,403);
  assert.equal((await f.admin('client-pairing',{memberId:'alice',tenantId:'other'})).status,400);
});

test('cross tenant cannot use a local assignment; bounded store rejects unknown or oversized state',async t=>{
  const f=await setup(t),a=await f.pair('alice');await f.publish('first');await f.assign('first',a.device.deviceId);
  // Separate authenticated tenant returned by the binding authority, never an HTTP field.
  const other={tenantId:'elsewhere',userId:'alice',deviceId:a.device.deviceId,authEpoch:1,serviceInstanceId:'foreign',resourceIds:[],connectionId:'c',installationId:'i',grantFamilyId:'g',revoked:false};
  const service=createTeamAccountService({store:f.teamStore,bindingStore:{read:async()=>({devices:[other]}),withAuthorization:async run=>run({devices:[other]})},bindings:{serviceInstanceId:'foreign',request:async()=>other}});
  const context={...other};const list=await service.request(context,{method:'GET',path:v1+'team-accounts'});assert.deepEqual(list.accounts,[]);
  await assert.rejects(service.request(context,{method:'POST',path:v1+'team-accounts/first/claim',body:claim()}),{code:'NOT_FOUND'});
  await assert.rejects(f.teamStore.transact(s=>{s.cookies=[];}),{code:'STORE_SCHEMA'});
  await assert.rejects(f.teamStore.transact(s=>{s.accounts=Array(257).fill(s.accounts[0]);}),{code:'STORE_SCHEMA'});
  const raw=await readFile(join(f.dir,'teams/team-accounts-v1.json'),'utf8');assert.equal(raw.includes('cookies'),false);
});

test('same member on another device receives no grant; policy epoch change invalidates assignment',async t=>{
  const f=await setup(t),a=await f.pair('alice'),other=await f.pair('alice');await f.publish('first');await f.assign('first',a.device.deviceId,0,invite(1),fp);
  assert.deepEqual((await other.call('team-accounts')).data.accounts,[]);assert.equal((await other.call('team-accounts/first/claim',claim())).status,403);
  const receipt=await a.call('team-accounts/first/authorize-use',{...claim(),target});assert.equal(receipt.status,200);
  assert.equal((await a.call('policy-acceptances',{operationId:op(),action:'revoke',authEpoch:1})).status,200);
  assert.deepEqual((await a.call('team-accounts')).data.accounts,[]);assert.equal((await a.call('team-accounts')).data.member.authEpoch,2);
  assert.equal((await a.call('team-accounts/first/claim',claim())).data.error,'EPOCH_CONFLICT');
  assert.equal((await a.call('team-accounts/first/authorize-use',{...claim(),target})).status,409);
  await f.assign('first',a.device.deviceId,1,invite(2),fp);assert.equal((await a.call('team-accounts/first/claim',{...claim(2),authEpoch:2})).status,200);
  assert.deepEqual((await a.call('team-operations/'+receipt.data.operationId)).data.result,receipt.data);
});

test('concurrent revisions serialize; full receipt ledger rejects new work without evicting originals',async t=>{
  const f=await setup(t),a=await f.pair('alice');await f.publish('first');
  const both=await Promise.all([f.assign('first',a.device.deviceId,0,invite(1)),f.assign('first',a.device.deviceId,0,invite(2))]);assert.deepEqual(both.map(r=>r.status).sort(),[200,409]);
  const saved=await a.call('team-accounts/first/claim',claim());assert.equal(saved.status,200);
  await f.teamStore.transact(s=>{const template=s.operations[0];while(s.operations.length<4096){const operationId=op();s.operations.push({...structuredClone(template),operationId,result:{...structuredClone(template.result),operationId}});}return {};});
  assert.equal((await f.publish('second')).data.error,'TEAM_CAPACITY');assert.equal((await a.call('team-accounts/first/claim',claim())).data.error,'TEAM_CAPACITY');
  assert.equal((await a.call('team-operations/'+saved.data.operationId)).data.status,'CONFIRMED');assert.equal((await f.teamStore.read()).operations.length,4096);
  assert.deepEqual((await a.call('team-accounts/first/claim',{operationId:saved.data.operationId,accountVersion:1,assignmentRevision:1,authEpoch:1})).data,saved.data);
});

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
for(const kind of ['claim','authorize-use'])for(const revokeDevice of [true,false])test(`queued ${kind} rechecks ${revokeDevice?'device revocation':'authEpoch'} before committing`,async t=>{
  const f=await setup(t),a=await f.pair('alice');await f.publish('first');await f.assign('first',a.device.deviceId,0,invite(1),fp);
  const saved=await a.call('team-accounts/first/claim',claim());assert.equal(saved.status,200);
  const entered=deferred(),release=deferred(),queued=deferred();t.after(()=>release.resolve());
  const blocker=f.teamStore.transact(async()=>{entered.resolve();await release.promise;return {};});await entered.promise;
  const transact=f.teamStore.transact.bind(f.teamStore);
  f.teamStore.transact=(...args)=>{const result=transact(...args);queued.resolve();return result;};
  const body={...claim(),...(kind==='authorize-use'?{target}:{})},pending=a.call('team-accounts/first/'+kind,body);
  await queued.promise;
  const revoked=revokeDevice?await a.call('devices/'+a.device.deviceId,{operationId:op(),authEpoch:1},'DELETE'):await a.call('policy-acceptances',{operationId:op(),action:'revoke',authEpoch:1});
  assert.equal(revoked.status,200);assert.equal((await f.bindingStore.read()).devices.find(d=>d.deviceId===a.device.deviceId).authEpoch,2);
  release.resolve();await blocker;
  const result=await pending;assert.equal(result.data.error,revokeDevice?'DEVICE_REVOKED':'EPOCH_CONFLICT');
  assert.equal((await f.teamStore.read()).operations.some(o=>o.operationId===body.operationId),false);
  assert.deepEqual((await a.call('team-operations/'+saved.data.operationId)).data.result,saved.data);
});

test('device authorization lock spans durable team receipt commit across store instances',async t=>{
  const f=await setup(t),a=await f.pair('alice');await f.publish('first');await f.assign('first',a.device.deviceId,0,invite(1),fp);
  const committed=deferred(),release=deferred(),withAuthorization=f.bindingStore.withAuthorization.bind(f.bindingStore);
  f.bindingStore.withAuthorization=run=>withAuthorization(async state=>{const result=await run(state);committed.resolve();await release.promise;return result;});
  const body=claim(),pending=a.call('team-accounts/first/claim',body);t.after(()=>release.resolve());
  await committed.promise;
  try{
    const persisted=await new TeamAccountStore({directory:join(f.dir,'teams')}).read();
    assert.equal(persisted.operations.find(o=>o.operationId===body.operationId)?.result.status,'CLAIMED');
    const contender=new ServiceBindingStore({directory:join(f.dir,'bindings')});
    await assert.rejects(contender.transact(s=>{s.devices[0].authEpoch++;return {};}),{code:'STORE_BUSY'});
  }finally{release.resolve();}
  assert.equal((await pending).status,200);
  assert.equal((await a.call('devices/'+a.device.deviceId,{operationId:op(),authEpoch:1},'DELETE')).status,200);
  assert.deepEqual((await a.call('team-operations/'+body.operationId)).data.result.status,'CLAIMED');
});
