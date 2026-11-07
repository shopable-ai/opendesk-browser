import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {HistoryStore} from '../../ai-account-usage/history-store.mjs';
import {ServiceBindingStore,bindingError} from '../../ai-account-usage/service-binding-store.mjs';
import {startManagementServer} from '../../ai-account-usage/web-server.mjs';
const extension='chrome-extension://'+'a'.repeat(32),op=()=>randomUUID(),receiptKey=()=>randomBytes(32).toString('hex');
async function setup(t,{failDelete=false,failPair=false}={}) {
  const directory=await mkdtemp(join(tmpdir(),'usage-http-client-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  for(const name of ['index.html','app.js','app.css'])await writeFile(join(directory,name),'synthetic asset');
  const store=new HistoryStore({directory:join(directory,'history')});
  await store.register({alias:'acct_01',displayName:'Synthetic cached account'});
  const bindingStore=new ServiceBindingStore({directory:join(directory,'bindings')});
  let now=1800000000000,upstream=0;
  if(failDelete){const transact=bindingStore.transact.bind(bindingStore);let calls=0;
    bindingStore.transact=async run=>{if(++calls===2){if(failDelete==='after')await transact(run);throw bindingError('STORE_WRITE',503);}return transact(run);};}
  if(failPair){const transact=bindingStore.transact.bind(bindingStore);
    bindingStore.transact=async run=>{if(failPair==='after')await transact(run);throw bindingError('STORE_WRITE',503);};}
  const server=await startManagementServer({store,bindingStore,clock:()=>now,assetsDirectory:directory,
    service:{query:async()=>{upstream++;throw Error('UPSTREAM_FORBIDDEN');}}});
  t.after(async()=>{assert.equal(upstream,0);await server.close();});
  const origin=new URL(server.url).origin;
  const req=(path,{method='POST',body,headers={}}={})=>new Promise((resolve,reject)=>{
    const r=request({hostname:'127.0.0.1',port:new URL(origin).port,path,method,agent:false,
      headers:{host:new URL(origin).host,...(body!==undefined?{'content-type':'application/json'}:{}),...headers}},res=>{
      const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>{
        const text=Buffer.concat(chunks).toString();resolve({status:res.statusCode,headers:res.headers,json:()=>JSON.parse(text)});
      });});r.on('error',reject);r.end(body===undefined?undefined:JSON.stringify(body));});
  const admin=await req('/session',{body:{code:server.pairingCode},headers:{origin}});
  const headers={origin,cookie:admin.headers['set-cookie'][0].split(';')[0]};
  const issue=()=>req('/opendesk/admin/api/client-pairing',{body:{},headers});
  const pair=(code,extra={})=>req('/opendesk/client/pair',{headers:{origin:extension,'sec-fetch-site':'cross-site'},body:{code,connectionId:'conn_'+op(),label:'Synthetic HTTP',operationId:op(),receiptKey:receiptKey(),...extra}});
  const call=(session,method,path,body)=>req('/opendesk/client/request',{headers:{origin:extension},body:{session,method,path,...(body===undefined?{}:{body})}});
  return {server,store,bindingStore,req,origin,headers,issue,pair,call,advance:ms=>{now+=ms;}};
}
async function connect(f){const issued=await f.issue();assert.equal(issued.status,200);const grant=issued.json();
  assert.deepEqual(Object.keys(grant).sort(),['code','expiresAt','origin']);assert.equal(grant.origin,f.origin);
  const response=await f.pair(grant.code);assert.equal(response.status,200);return response.json();}

test('ordinary HTTP application pairing, bounded cache, UNVERIFIED binding, fragment exchange, unbind and disconnect receipts',async t=>{
  const f=await setup(t),c=await connect(f);
  assert.deepEqual(Object.keys(c).sort(),['device','expiresAt','serviceInstanceId','session']);
  assert.equal(c.serviceInstanceId,c.device.serviceInstanceId);
  const state=await f.bindingStore.read(),d=state.devices[0];
  assert.equal(d.userId,'local_http');assert.notEqual(d.installationId,'conn_http');assert.notEqual(d.grantFamilyId,'conn_http');
  await f.store.register({alias:'acct_02',displayName:'Added after pairing'});
  assert.deepEqual((await f.call(c.session,'GET','/opendesk/v1/accounts')).json().accounts.map(a=>a.remoteAccountId),['acct_01']);
  assert.equal((await f.call(c.session,'GET','/opendesk/v1/accounts/acct_01/usage')).json().status,'UNKNOWN');
  assert.equal((await f.call(c.session,'GET','/opendesk/v1/accounts/acct_02/usage')).status,404);
  const bound=await f.call(c.session,'POST','/opendesk/v1/bindings',{operationId:op(),purpose:'usage',providerKey:'codex',remoteAccountId:'acct_01',expectedRevision:0,
    localAccount:{origin:'https://chatgpt.com',alias:'saved_01',version:1,storeId:'0',partitionKey:null}});
  assert.equal(bound.status,200);const b=bound.json();assert.equal(b.verificationState,'UNVERIFIED');assert.equal(b.verifiedAt,null);
  const opened=await f.call(c.session,'POST','/opendesk/v1/management-open',{bindingId:b.bindingId,remoteAccountId:'acct_01'});
  assert.equal(opened.status,200);const url=new URL(opened.json().url);
  assert.equal(url.origin,f.origin);assert.equal(url.pathname,'/opendesk/admin/accounts/acct_01');
  const code=new URLSearchParams(url.hash.slice(1)).get('open');
  const exchanged=await f.req('/opendesk/open-session',{headers:{origin:f.origin},body:{code}});
  assert.equal(exchanged.status,200);const cookie=exchanged.headers['set-cookie'][0].split(';')[0];
  assert.equal((await f.req('/opendesk/open-session',{headers:{origin:f.origin},body:{code}})).status,401);
  assert.equal((await f.req('/api/v1/accounts',{method:'GET',headers:{cookie}})).json().accounts.length,1);
  assert.equal((await f.req('/api/v1/accounts/acct_01/refresh',{headers:{cookie,origin:f.origin},body:{}})).status,403);
  assert.equal((await f.call(c.session,'POST','/opendesk/v1/management-open',{})).status,200);
  const unbindOp=op(),unbound=await f.call(c.session,'DELETE','/opendesk/v1/bindings/'+b.bindingId,{operationId:unbindOp,authEpoch:1,expectedRevision:1});
  assert.equal(unbound.status,200);assert.equal((await f.call(c.session,'POST','/opendesk/v1/management-open',{bindingId:b.bindingId,remoteAccountId:'acct_01'})).status,404);
  const disconnectOp=op(),disconnected=await f.call(c.session,'DELETE','/opendesk/v1/devices/'+c.device.deviceId,{operationId:disconnectOp,authEpoch:unbound.json().authEpoch});
  assert.equal(disconnected.status,200);
  assert.equal((await f.call(c.session,'GET','/opendesk/v1/operations/'+disconnectOp)).json().deviceRevoked,true);
  assert.equal((await f.call(c.session,'GET','/opendesk/v1/accounts')).status,403);
  assert.equal((await f.call(c.session,'POST','/opendesk/v1/management-open',{})).status,403);
  assert.equal((await f.req('/api/v1/accounts',{method:'GET',headers:{cookie}})).status,401);
});

test('pairing rejects admin code, replay, extra identities, expiry and session expiry; issuance is same-origin admin only',async t=>{
  const f=await setup(t);
  assert.equal((await f.pair(f.server.pairingCode)).status,401);
  const issued=(await f.issue()).json();
  assert.equal((await f.pair(issued.code,{installationId:'forged'})).status,400);
  const first=await f.pair(issued.code);assert.equal(first.status,200);
  assert.equal((await f.pair(issued.code)).status,401);
  const second=(await f.issue()).json();f.advance(5*60_000);
  assert.equal((await f.pair(second.code)).status,401);
  f.advance(10*60_000);assert.equal((await f.call(first.json().session,'GET','/opendesk/v1/accounts')).status,403);
  assert.equal((await f.req('/opendesk/admin/api/client-pairing',{body:{}})).status,401);
  assert.equal((await f.req('/opendesk/admin/api/client-pairing',{headers:{cookie:f.headers.cookie},body:{}})).status,403);
  assert.equal((await f.req('/opendesk/admin/api/client-pairing',{headers:f.headers,body:{resourceIds:['acct_01']}})).status,400);
});

test('Host, Origin, envelope and action boundaries reject web/null origins, extra fields, query credentials and arbitrary routes without CORS',async t=>{
  const f=await setup(t),c=await connect(f);
  const body={session:c.session,method:'GET',path:'/opendesk/v1/accounts'};
  for(const origin of ['null','https://evil.invalid','chrome-extension://'+'z'.repeat(32),extension+'/']){
    const r=await f.req('/opendesk/client/request',{headers:{origin},body});assert.equal(r.status,403);assert.equal(r.headers['access-control-allow-origin'],undefined);
  }
  assert.equal((await f.req('/opendesk/client/request',{headers:{host:'evil.invalid'},body})).status,403);
  assert.equal((await f.req('/opendesk/client/request',{headers:{'sec-fetch-site':'cross-site'},body})).status,403);
  assert.equal((await f.req('/opendesk/client/request',{body})).status,200);
  for(const bad of [{...body,installationId:'forged'},{...body,body:{}},{...body,method:'PUT'},{...body,path:'/api/v1/accounts/acct_01/refresh'},
    {...body,path:'/opendesk/v1/accounts?token=secret'},{...body,path:'/opendesk/v1/../v1/accounts'},{...body,path:'http://evil.invalid/'},
    {...body,path:'/opendesk/v1/management-open',method:'POST',body:{deviceId:c.device.deviceId}}])
    assert.equal((await f.req('/opendesk/client/request',{body:bad})).status,400);
  assert.equal((await f.req('/opendesk/client/request?session=secret',{body})).status,400);
  assert.equal((await f.req('/opendesk/client/request',{method:'OPTIONS'})).status,405);
  assert.equal((await f.req('/opendesk/admin/api/devices',{method:'GET',headers:{origin:extension,cookie:f.headers.cookie}})).status,403);
});

test('unknown DELETE is never replayed and irreversibly attenuates to GET receipts',async t=>{
  const f=await setup(t,{failDelete:true}),c=await connect(f),operationId=op();
  const open=await f.call(c.session,'POST','/opendesk/v1/management-open',{});
  const code=new URLSearchParams(new URL(open.json().url).hash.slice(1)).get('open');
  const result=await f.call(c.session,'DELETE','/opendesk/v1/devices/'+c.device.deviceId,{operationId,authEpoch:1});
  assert.equal(result.status,503);assert.equal(result.json().error,'STORE_WRITE');
  assert.equal((await f.call(c.session,'GET','/opendesk/v1/accounts')).status,403);
  assert.equal((await f.call(c.session,'POST','/opendesk/v1/management-open',{})).status,403);
  assert.equal((await f.call(c.session,'DELETE','/opendesk/v1/devices/'+c.device.deviceId,{operationId,authEpoch:1})).status,403);
  assert.equal((await f.call(c.session,'GET','/opendesk/v1/operations/'+operationId)).status,404);
  assert.equal((await f.req('/opendesk/open-session',{headers:{origin:f.origin},body:{code}})).status,401);
  assert.equal((await f.bindingStore.read()).devices[0].revoked,false);
});

test('lost committed DELETE returns its original error and permits only the committed receipt',async t=>{
  const f=await setup(t,{failDelete:'after'}),c=await connect(f),operationId=op();
  const result=await f.call(c.session,'DELETE','/opendesk/v1/devices/'+c.device.deviceId,{operationId,authEpoch:1});
  assert.equal(result.status,503);assert.deepEqual(result.json(),{error:'STORE_WRITE'});
  const receipt=await f.call(c.session,'GET','/opendesk/v1/operations/'+operationId);
  assert.equal(receipt.status,200);assert.equal(receipt.json().deviceRevoked,true);
  assert.equal((await f.call(c.session,'GET','/opendesk/v1/accounts/acct_01/usage')).status,403);
  assert.equal((await f.call(c.session,'POST','/opendesk/v1/management-open',{})).status,403);
});

test('initial application code is separate and single-use; reissuance replaces it and rejects oversized scopes',async t=>{
  const f=await setup(t),initial=f.server.applicationPairing;
  assert.equal(initial.origin,f.origin);assert.notEqual(initial.code,f.server.pairingCode);
  const c=(await f.pair(initial.code)).json();assert.ok(c.session);
  assert.equal((await f.pair(initial.code)).status,401);
  const old=(await f.issue()).json(),fresh=(await f.issue()).json();
  await f.store.register({alias:'acct_02',displayName:'After code issuance'});
  assert.equal((await f.pair(old.code)).status,401);
  const paired=await f.req('/opendesk/client/pair',{body:{code:fresh.code,connectionId:'conn_no_origin',label:'SDK',operationId:op(),receiptKey:receiptKey()}});
  assert.equal(paired.status,200);
  assert.deepEqual((await f.call(paired.json().session,'GET','/opendesk/v1/accounts')).json().accounts.map(a=>a.remoteAccountId),['acct_01']);
  // HistoryStore itself caps accounts at 64; inject only the cache contract to
  // exercise this boundary independently without weakening its persisted schema.
  f.store.accounts=async()=>Array.from({length:65},(_,i)=>({alias:'acct_'+i}));
  assert.equal((await f.issue()).status,400);
});

test('ordinary serve prints exact application origin/code and supports HTTP without Native, credentials or upstream', {timeout:15000},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'usage-http-cli-'));
  let child;
  t.after(async()=>{if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}await rm(directory,{recursive:true,force:true});});
  const owner=fileURLToPath(new URL('../../ai-account-usage/',import.meta.url));
  const guard=fileURLToPath(new URL('./fixtures/standalone-guard.mjs',import.meta.url));
  const store=new HistoryStore({directory:join(directory,'state')});await store.register({alias:'acct_01',displayName:'Synthetic'});
  const config=join(directory,'config.json'),audit=join(directory,'audit.txt');
  await writeFile(config,JSON.stringify({accounts:[{alias:'acct_01',displayName:'Synthetic',mode:'CODEX_OAUTH',source:{type:'CODEX_AUTH_FILE',path:join(directory,'never-read-auth.json')}}]}));
  child=spawn(process.execPath,['--permission',...(process.allowedNodeEnvironmentFlags.has('--allow-net')?['--allow-net']:[]),`--allow-fs-read=${owner}`,`--allow-fs-read=${directory}`,`--allow-fs-read=${guard}`,`--allow-fs-write=${directory}`,'--allow-worker','--import',guard,
    join(owner,'manage.mjs'),'serve','--config',config,'--data-dir',join(directory,'state')],
    {cwd:directory,env:{HOME:directory,TMPDIR:directory,USAGE_TEST_AUDIT:audit},stdio:['ignore','pipe','pipe']});
  // Startup output is deliberately a credential channel; never include it in
  // failure diagnostics. Parse lines instead of assuming one stdout chunk/URL.
  const lines=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(Error('CLI_STARTUP_TIMEOUT')),8000);
    child.once('error',()=>{clearTimeout(timer);reject(Error('CLI_STARTUP_FAILED'));});
    child.stdout.on('data',part=>{output+=part;if(output.trim().split('\n').length>=2){clearTimeout(timer);resolve(output.trim().split('\n'));}});
  });
  const admin=new URL(lines[0]),application=JSON.parse(lines[1].replace(/^Application pairing: /,''));
  assert.equal(application.origin,admin.origin);assert.deepEqual(Object.keys(application).sort(),['code','expiresAt','origin']);
  const req=(path,body,headers={})=>new Promise((resolve,reject)=>{
    const r=request({hostname:'127.0.0.1',port:admin.port,path,method:'POST',headers:{host:admin.host,'content-type':'application/json',...headers}},res=>{
      const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks).toString())}));});
    r.on('error',reject);r.end(JSON.stringify(body));});
  assert.equal((await req('/session',{code:new URLSearchParams(admin.hash.slice(1)).get('pair')},{origin:admin.origin})).status,200);
  const pair=await req('/opendesk/client/pair',{code:application.code,connectionId:'cli_http',label:'Synthetic CLI',operationId:op(),receiptKey:receiptKey()});
  assert.equal(pair.status,200);
  const resources=await req('/opendesk/client/request',{session:pair.body.session,method:'GET',path:'/opendesk/v1/accounts'});
  assert.equal(resources.status,200);assert.equal(resources.body.accounts[0].remoteAccountId,'acct_01');
  assert.equal(await readFile(audit,'utf8'),'guard-ready\n');
});


test('lost pairing response reconciles exact original result without session or duplicate devices',async t=>{
  const f=await setup(t),identity={receiptKey:receiptKey(),connectionId:'receipt_connection',operationId:op()};
  const issued=(await f.issue()).json(),paired=await f.pair(issued.code,identity);
  assert.equal(paired.status,200);
  const lookup=body=>f.req('/opendesk/client/pair-result',{headers:{origin:extension},body});
  for(let i=0;i<2;i++)assert.deepEqual((await lookup(identity)).json(),{operationId:identity.operationId,status:'CONFIRMED',result:paired.json()});
  for(const changed of [{receiptKey:receiptKey()},{connectionId:'wrong_connection'},{operationId:op()}]){
    const result=await lookup({...identity,...changed});assert.equal(result.status,404);assert.deepEqual(result.json(),{error:'RESULT_UNKNOWN'});
  }
  for(const changed of [{},{receiptKey:receiptKey()},{operationId:op()},{connectionId:'changed_connection'}])
    assert.equal((await f.pair(issued.code,{...identity,...changed})).status,409);
  assert.equal((await f.bindingStore.read()).devices.length,1);
  const newer=(await f.issue()).json();
  assert.equal((await f.pair(newer.code,identity)).status,409);
  assert.equal((await f.pair(newer.code)).status,200); // Conflict did not consume new code.
  f.advance(15*60_000);
  assert.equal((await lookup(identity)).status,404);
});

test('only code rejection before creation produces a rejected pairing receipt',async t=>{
  const f=await setup(t),identity={receiptKey:receiptKey(),connectionId:'rejected_connection',operationId:op()};
  assert.equal((await f.pair('invalid_code',identity)).status,401);
  const result=await f.req('/opendesk/client/pair-result',{body:identity});
  assert.equal(result.status,200);assert.deepEqual(result.json(),{operationId:identity.operationId,status:'REJECTED',error:'PAIRING_INVALID'});
  assert.equal((await f.bindingStore.read()).devices.length,0);
  for(const failPair of [true,'after'])await t.test(String(failPair),async t=>{
    const failed=await setup(t,{failPair}),identity={receiptKey:receiptKey(),connectionId:'uncertain_connection',operationId:op()};
    assert.equal((await failed.pair(failed.server.applicationPairing.code,identity)).status,503);
    assert.equal((await failed.req('/opendesk/client/pair-result',{body:identity})).status,404);
    assert.equal((await failed.pair(failed.server.applicationPairing.code,identity)).status,409);
    assert.equal((await failed.bindingStore.read()).devices.length,failPair==='after'?1:0);
  });
});

test('receipt validation and capacity reject before consuming code or creating devices',async t=>{
  const f=await setup(t),grant=f.server.applicationPairing;
  for(const key of [undefined,'a'.repeat(63),'A'.repeat(64),'g'.repeat(64)])
    assert.equal((await f.pair(grant.code,{receiptKey:key})).status,400);
  for(let i=0;i<128;i++)assert.equal((await f.pair('invalid_code')).status,401);
  assert.equal((await f.pair(grant.code)).status,503);
  assert.equal((await f.bindingStore.read()).devices.length,0);
  f.advance(15*60_000);
  const fresh=(await f.issue()).json();assert.equal((await f.pair(fresh.code)).status,200);
});


test('HTTP accounts paginate cached 64-account scope while trusted Native keeps its full list',async t=>{
  const f=await setup(t);
  for(let i=2;i<=64;i++)await f.store.register({alias:'acct_'+String(i).padStart(2,'0'),displayName:'Synthetic account '+i});
  const c=await connect(f),seen=[];
  let cursor=0;
  do{
    const response=await f.call(c.session,'GET',cursor?'/opendesk/v1/accounts-page/'+cursor:'/opendesk/v1/accounts');
    assert.equal(response.status,200);const page=response.json();assert.equal(page.accounts.length,16);
    assert.ok(Buffer.byteLength(JSON.stringify(page))<=8192);seen.push(...page.accounts.map(a=>a.remoteAccountId));
    cursor=page.nextCursor;
  }while(cursor!==null);
  assert.equal(seen.length,64);assert.equal(new Set(seen).size,64);
  for(const offset of ['0','64','01','-1'])assert.equal((await f.call(c.session,'GET','/opendesk/v1/accounts-page/'+offset)).status,400);
  const native=await f.server.serviceBinding.createLocalClient({connectionId:'trusted_full',installationId:'trusted_install',grantFamilyId:'trusted_grant',userId:'trusted_user',resourceIds:seen});
  await f.server.serviceBinding.request(native.secret,{method:'POST',path:'/opendesk/v1/devices',body:{label:'Trusted test',operationId:op()}});
  assert.equal((await f.server.serviceBinding.request(native.secret,{method:'GET',path:'/opendesk/v1/accounts'})).accounts.length,64);
});


test('inflight pairing lookup stays unknown and cannot replay the reserved mutation',async t=>{
  const f=await setup(t),identity={receiptKey:receiptKey(),connectionId:'inflight_connection',operationId:op()};
  const transact=f.bindingStore.transact.bind(f.bindingStore);
  let release,started;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
  f.bindingStore.transact=async run=>{started();await gate;return transact(run);};
  const pairing=f.pair(f.server.applicationPairing.code,identity);
  try{
    await entered;
    assert.equal((await f.req('/opendesk/client/pair-result',{body:identity})).status,404);
    assert.equal((await f.pair(f.server.applicationPairing.code,identity)).status,409);
  }finally{release();}
  assert.equal((await pairing).status,200);
  assert.equal((await f.bindingStore.read()).devices.length,1);
});

test('HTTP policy omits redundant private binding details while trusted Native retains them',async t=>{
  const f=await setup(t);
  for(let i=2;i<=4;i++)await f.store.register({alias:'acct_0'+i,displayName:'Synthetic '+i});
  const c=await connect(f),origin='https://'+Array(30).fill('a'.repeat(60)).join('.')+'.example';
  for(let i=1;i<=4;i++){
    const result=await f.call(c.session,'POST','/opendesk/v1/bindings',{operationId:op(),purpose:'usage',providerKey:'codex',remoteAccountId:'acct_0'+i,expectedRevision:0,
      localAccount:{origin,alias:'saved_0'+i,version:1,storeId:'0',partitionKey:null}});
    assert.equal(result.status,200);
  }
  const policy=await f.call(c.session,'GET','/opendesk/v1/sync-policy');
  assert.equal(policy.status,200);assert.equal(policy.json().bindings,undefined);
  const full=await f.server.serviceBinding.request(c.session,{method:'GET',path:'/opendesk/v1/sync-policy'});
  assert.equal(full.bindings.length,4);assert.ok(Buffer.byteLength(JSON.stringify(full))>8192);
});

test('confirmed invalid code permits a new explicit pairing operation for the same connection',async t=>{
  const f=await setup(t);
  assert.equal((await f.pair('f'.repeat(64))).status,401);
  assert.equal((await f.pair(f.server.applicationPairing.code)).status,200);
  assert.equal((await f.bindingStore.read()).devices.length,1);
});
