import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createShareRelay,createShareHttpServer} from '../../services/cookie-share-relay/server.mjs';
import {createCookieAccountShare,cookieShareAddress,COOKIE_SHARE_STORAGE_KEY}
  from '../../examples/sidebar-tools/cookie-editor/trusted/account-share.js';
import {createCookieAccountVault,COOKIE_ACCOUNT_STORE_KEY}
  from '../../examples/sidebar-tools/cookie-editor/trusted/account-vault.js';
import {captureBackup} from '../../src/platform/storage/idb.js';

// Real HTTP/SQLite Relay, injected loopback transport. This is a NODE test,
// never evidence for TLS, Chrome permissions, native IDB or TWO_DEVICE_LAN.
async function fixture(t){
  const dir=await mkdtemp(join(tmpdir(),'od-cookie-share-'));
  const origin='https://relay.lan.invalid';
  const relay=createShareRelay({dbPath:join(dir,'relay.sqlite'),publicOrigin:origin});
  const server=createShareHttpServer(relay);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));relay.close();await rm(dir,{recursive:true});});
  const calls=[],records=new Map();let granted=true,authorized=true,drop=false,commitLost=false;
  let serial=Promise.resolve(),readHook=()=>{},responseHook=()=>{};
  const storage=async()=>({transaction(stores,mode,work){
    assert.deepEqual(stores,['frameworkKV']);
    const run=serial.then(async()=>{
      const next=structuredClone(records);
      const result=await work({get:async(s,k)=>{readHook(k,mode,next);return structuredClone(next.get(k));},
        put:async(s,v,k)=>{assert.equal(mode,'readwrite');next.set(k,structuredClone(v));},
        delete:async(s,k)=>{next.delete(k);}});
      if(mode==='readwrite'){
        records.clear();for(const [k,v] of next)records.set(k,v);
        if(commitLost){commitLost=false;throw Error('lost transaction receipt');}
      }
      return result;
    });serial=run.catch(()=>{});return run;
  }});
  const api={storage:{local:{get:async()=>({})}},permissions:{contains:async()=>granted}};
  const vault=createCookieAccountVault({api,storage});
  const authorize=async()=>{if(!authorized)throw Object.assign(Error('changed'),{code:'E_TOOL_CHANGED'});};
  const fetcher=async(url,options)=>{
    assert.ok(url.startsWith(origin+'/v1/invites'));assert.equal(options.redirect,'error');
    assert.equal(options.credentials,'omit');calls.push({url,options});
    const reply=await fetch('http://127.0.0.1:'+server.address().port+url.slice(origin.length),options);
    if(drop&&options.method==='POST')throw Error('lost HTTP receipt');
    const text=await reply.text();responseHook(url,options);
    return new Response(text,{status:reply.status,headers:reply.headers});
  };
  const create=()=>{
    const service=createCookieAccountShare({api,storage,vault,authorize,fetcher});
    return {...service,dispatch:(action,payload,owner)=>service.dispatch(action,{
      origin:'https://example.com',...payload},owner)};
  };
  const saved={alias:'acct_source_123',origin:'https://example.com',displayName:'工作账号',
    description:'账号描述',version:1,allowAuto:true,cookies:[{name:'auth',value:'NEVER_TRANSMIT_COOKIE'}]};
  await vault.update(0,data=>data.accounts.push(saved));
  const payload={origin:saved.origin,alias:saved.alias,accountVersion:1,revision:1,
    relayOrigin:origin,expiresInSeconds:3600,maxClaims:3,mode:'configuration'};
  return {relay,create,records,calls,vault,saved,payload,origin,
    revoke:()=>{granted=false;},disable:()=>{authorized=false;},
    grant:()=>{granted=true;},
    drop:()=>{drop=true;},loseCommit:()=>{commitLost=true;},
    onRead:fn=>{readHook=fn;},onResponse:fn=>{responseHook=fn;}};
}
test('share addresses require exact HTTPS origin or invitation path, never credentials or fragments',()=>{
  assert.deepEqual(cookieShareAddress('https://lan.example:8443'),{origin:'https://lan.example:8443'});
  for(const value of ['http://localhost:8713','https://user:pass@lan.example',
    'https://lan.example/path','https://lan.example/?token=secret','https://lan.example/#id'])
    assert.throws(()=>cookieShareAddress(value));
  const id='a'.repeat(32);
  assert.equal(cookieShareAddress('https://lan.example/i/'+id,{invitation:true}).id,id);
  for(const value of ['https://lan.example/i/short','https://lan.example/i/'+id+'/extra',
    'https://lan.example/v1/invites/'+id])assert.throws(()=>cookieShareAddress(value,{invitation:true}));
});
test('real Relay create/status/revoke exposes no manager secret or Cookie bytes',async t=>{
  const f=await fixture(t),service=f.create();
  const result=await service.dispatch('shareCreate',f.payload,'owner');
  assert.equal(result.phase,'active');assert.equal(result.invite.remainingClaims,3);
  assert.ok(result.url.startsWith(f.origin+'/i/'));
  assert.doesNotMatch(JSON.stringify(result),/managerSecret|NEVER_TRANSMIT_COOKIE|acct_source/);
  assert.deepEqual(JSON.parse(f.calls[0].options.body),{origin:f.saved.origin,displayName:'工作账号',
    description:'账号描述',mode:'configuration',expiresInSeconds:3600,maxClaims:3});
  assert.equal((await f.create().dispatch('shareStatus',{ref:result.ref},'owner')).phase,'active');
  await assert.rejects(service.dispatch('shareRevoke',{ref:result.ref},'other-owner'),{code:'E_SHARE_NOT_FOUND'});
  await assert.rejects(service.dispatch('shareRevoke',{ref:result.ref,
    origin:'https://other.example'},'owner'),{code:'E_SITE_MISMATCH'});
  const revoked=await service.dispatch('shareRevoke',{ref:result.ref},'owner');
  assert.equal(revoked.phase,'revoked');
  assert.equal((await service.dispatch('shareStatus',{ref:result.ref},'owner')).phase,'revoked');
  const manager=f.records.get(COOKIE_SHARE_STORAGE_KEY).items[0].managerSecret;
  assert.equal(f.calls.filter(x=>x.options.headers['x-opendesk-invite-manager']).length,1);
  assert.doesNotMatch(JSON.stringify(revoked),new RegExp(manager));
});
test('configuration claim creates distinct alias/name, preserves sessions and is not claimed twice after restart',async t=>{
  const f=await fixture(t),service=f.create();
  const created=await service.dispatch('shareCreate',f.payload,'owner');
  const inspected=await service.dispatch('shareInspect',{inviteUrl:created.url},'owner');
  assert.equal(inspected.invite.mode,'configuration');
  const result=await service.dispatch('shareClaim',{
    origin:f.saved.origin,revision:1,inviteUrl:created.url},'owner');
  assert.equal(result.status,'configuration_imported');assert.notEqual(result.alias,f.saved.alias);
  assert.equal(result.cookieWriteVerified,false);assert.equal(result.websiteLoginConfirmed,false);
  const data=await f.vault.read(),added=data.accounts.find(x=>x.alias===result.alias);
  assert.equal(added.displayName,'工作账号（领取 2）');assert.deepEqual(added.cookies,[]);
  assert.equal(added.allowAuto,false);assert.deepEqual(data.accounts[0],f.saved);
  const again=await f.create().dispatch('shareClaim',{
    origin:f.saved.origin,revision:2,inviteUrl:created.url},'owner');
  assert.equal(again.alias,result.alias);assert.equal((await f.vault.read()).accounts.length,2);
  assert.equal(f.calls.filter(x=>x.url.endsWith('/claim')).length,1);
  assert.equal((await service.dispatch('shareStatus',{ref:created.ref},'owner')).invite.remainingClaims,2);
  assert.doesNotMatch(JSON.stringify(result),/NEVER_TRANSMIT_COOKIE|managerSecret/);
});
test('reopened inspection recognizes a saved configuration after sender revocation without another network request',async t=>{
  const f=await fixture(t),service=f.create();
  const created=await service.dispatch('shareCreate',{...f.payload,maxClaims:1},'owner');
  const result=await service.dispatch('shareClaim',{revision:1,inviteUrl:created.url},'owner');
  const stored=f.records.get(COOKIE_SHARE_STORAGE_KEY).items[0];
  f.relay.operations.revoke(stored.id,stored.managerSecret);
  const calls=f.calls.length;
  const inspection=await f.create().dispatch('shareInspect',{inviteUrl:created.url},'owner');
  assert.equal(inspection.configurationImported,true);
  assert.equal(inspection.localSavePending,false);
  assert.equal(inspection.cookieWriteVerified,false);
  assert.equal(inspection.websiteLoginConfirmed,false);
  assert.equal(f.calls.length,calls);
  assert.equal((await f.vault.read()).accounts.some(a=>a.alias===result.alias),true);
  await assert.rejects(f.create().dispatch('shareInspect',{inviteUrl:created.url},'other-owner'),
    {code:'E_INVITE_REVOKED'});
});
test('reopened inspection never reports a deleted received account as saved',async t=>{
  const f=await fixture(t),service=f.create();
  const created=await service.dispatch('shareCreate',f.payload,'owner');
  const result=await service.dispatch('shareClaim',{revision:1,inviteUrl:created.url},'owner');
  await f.vault.update(2,data=>{data.accounts=data.accounts.filter(a=>a.alias!==result.alias);});
  const calls=f.calls.length;
  await assert.rejects(f.create().dispatch('shareInspect',{inviteUrl:created.url},'owner'),
    {code:'E_ACCOUNT_NOT_FOUND'});
  assert.equal(f.calls.length,calls);
});
test('empty accounts can be shared, wrong website and session invites never consume a claim',async t=>{
  const f=await fixture(t);await f.vault.update(1,data=>{data.accounts[0].cookies=[];});
  const service=f.create();
  const created=await service.dispatch('shareCreate',{...f.payload,revision:2},'owner');
  await assert.rejects(service.dispatch('shareClaim',{
    origin:'https://other.example',revision:2,inviteUrl:created.url},'owner'),{code:'E_SITE_MISMATCH'});
  const session=f.relay.operations.create({origin:f.saved.origin,displayName:'会话账号',
    mode:'session',expiresInSeconds:3600,maxClaims:1});
  await assert.rejects(service.dispatch('shareClaim',{
    origin:f.saved.origin,revision:2,inviteUrl:session.url},'owner'),{code:'E_SHARE_DEVICE_KEY_STORAGE_REQUIRED'});
  await assert.rejects(service.dispatch('shareCreate',{
    ...f.payload,revision:2,mode:'session'},'owner'),{code:'E_SHARE_DEVICE_KEY_STORAGE_REQUIRED'});
  assert.equal(f.calls.filter(x=>x.url.endsWith('/claim')).length,0);
});
test('revoked permission and changed installed identity stop network effects',async t=>{
  for(const operation of ['revoke','disable']){
    const f=await fixture(t);f[operation]();
    await assert.rejects(f.create().dispatch('shareCreate',f.payload,'owner'),{
      code:operation==='revoke'?'E_SHARE_PERMISSION_REQUIRED':'E_TOOL_CHANGED'});
    assert.equal(f.calls.length,0);
  }
});
test('lost remote claim receipt retains durable fence; restart never automatically reclaims',async t=>{
  const f=await fixture(t),service=f.create();
  const created=await service.dispatch('shareCreate',f.payload,'owner');f.drop();
  const payload={origin:f.saved.origin,revision:1,inviteUrl:created.url};
  await assert.rejects(service.dispatch('shareClaim',payload,'owner'),{code:'E_OUTCOME_UNKNOWN'});
  await assert.rejects(f.create().dispatch('shareClaim',payload,'owner'),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.filter(x=>x.url.endsWith('/claim')).length,1);
  assert.equal((await f.vault.read()).accounts.length,1);
  assert.equal(f.records.get(COOKIE_SHARE_STORAGE_KEY).claims[0].phase,'claiming');
});
test('reopened inspection preserves an unknown claim fence instead of presenting a new invitation',async t=>{
  const f=await fixture(t),service=f.create();
  const created=await service.dispatch('shareCreate',f.payload,'owner');f.drop();
  await assert.rejects(service.dispatch('shareClaim',{revision:1,inviteUrl:created.url},'owner'),
    {code:'E_OUTCOME_UNKNOWN'});
  const calls=f.calls.length;
  await assert.rejects(f.create().dispatch('shareInspect',{inviteUrl:created.url},'owner'),
    {code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.length,calls);
  assert.equal((await f.vault.read()).accounts.length,1);
});
test('permission revoked before dispatch does not strand an unsent claim after explicit reauthorization',async t=>{
  const f=await fixture(t),service=f.create();
  const created=await service.dispatch('shareCreate',{...f.payload,maxClaims:1},'owner');
  f.onRead(key=>{
    if(key===COOKIE_SHARE_STORAGE_KEY&&f.records.get(key)?.claims[0]?.phase==='claiming')f.revoke();
  });
  const payload={revision:1,inviteUrl:created.url};
  await assert.rejects(service.dispatch('shareClaim',payload,'owner'),{code:'E_SHARE_PERMISSION_REQUIRED'});
  assert.equal(f.calls.filter(x=>x.url.endsWith('/claim')).length,0,'permission check stopped the actual POST');
  f.onRead(()=>{});f.grant();
  const inspection=await f.create().dispatch('shareInspect',{inviteUrl:created.url},'owner');
  assert.equal(inspection.invite.remainingClaims,1);
  const result=await f.create().dispatch('shareClaim',payload,'owner');
  assert.equal(result.status,'configuration_imported');
  assert.equal(f.calls.filter(x=>x.url.endsWith('/claim')).length,1);
  assert.equal(f.records.get(COOKIE_SHARE_STORAGE_KEY).claims.length,1);
});
test('permission revoked after a real remote claim retains the unknown fence even after reauthorization',async t=>{
  const f=await fixture(t),service=f.create();
  const created=await service.dispatch('shareCreate',{...f.payload,maxClaims:1},'owner');
  f.onResponse(url=>{if(url.endsWith('/claim'))f.revoke();});
  const payload={revision:1,inviteUrl:created.url};
  await assert.rejects(service.dispatch('shareClaim',payload,'owner'),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.filter(x=>x.url.endsWith('/claim')).length,1);
  assert.equal(f.records.get(COOKIE_SHARE_STORAGE_KEY).claims[0].phase,'claiming');
  f.onResponse(()=>{});f.grant();
  await assert.rejects(f.create().dispatch('shareInspect',{inviteUrl:created.url},'owner'),{code:'E_OUTCOME_UNKNOWN'});
  await assert.rejects(f.create().dispatch('shareClaim',payload,'owner'),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.filter(x=>x.url.endsWith('/claim')).length,1);
  assert.equal((await f.vault.read()).accounts.length,1);
  assert.equal(f.relay.operations.public(created.invite.id).remainingClaims,0);
});
test('uncertain durable create fence prevents any remote POST and cleanup preserves unrelated account data',async t=>{
  const f=await fixture(t);f.loseCommit();
  await assert.rejects(f.create().dispatch('shareCreate',f.payload,'owner'),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.length,0);
  await f.create().clear();assert.equal(f.records.has(COOKIE_SHARE_STORAGE_KEY),false);
  assert.equal(f.records.has(COOKIE_ACCOUNT_STORE_KEY),true);
});

test('a saved claim receipt cannot identify a deleted account or a different website',async t=>{
  const f=await fixture(t),service=f.create();
  const created=await service.dispatch('shareCreate',f.payload,'owner');
  const result=await service.dispatch('shareClaim',{origin:f.saved.origin,revision:1,inviteUrl:created.url},'owner');
  await assert.rejects(service.dispatch('shareClaim',{
    origin:'https://other.example',revision:2,inviteUrl:created.url},'owner'),{code:'E_SITE_MISMATCH'});
  await f.vault.update(2,data=>{data.accounts=data.accounts.filter(a=>a.alias!==result.alias);});
  await assert.rejects(service.dispatch('shareClaim',{
    origin:f.saved.origin,revision:3,inviteUrl:created.url},'owner'),{code:'E_ACCOUNT_NOT_FOUND'});
  assert.equal(f.calls.filter(x=>x.url.endsWith('/claim')).length,1);
});

test('capacity is checked before consuming a single-use invitation',async t=>{
  const f=await fixture(t),service=f.create();
  await f.vault.update(1,data=>{for(let n=1;n<48;n++)data.accounts.push({
    ...f.saved,alias:'acct_capacity_'+n,displayName:'已有账号 '+n,cookies:[]});});
  const created=await service.dispatch('shareCreate',{...f.payload,revision:2,maxClaims:1},'owner');
  await assert.rejects(service.dispatch('shareClaim',{
    origin:f.saved.origin,revision:2,inviteUrl:created.url},'owner'),{code:'E_SHARE_LIMIT'});
  assert.equal(f.calls.filter(x=>x.url.endsWith('/claim')).length,0);
  assert.equal((await service.dispatch('shareStatus',{ref:created.ref},'owner')).invite.remainingClaims,1);
});

test('revocation during vault loading stops the local account mutation after a real Relay claim',async t=>{
  const f=await fixture(t),service=f.create();
  const created=await service.dispatch('shareCreate',f.payload,'owner');
  f.onRead(key=>{
    if(key===COOKIE_ACCOUNT_STORE_KEY&&f.records.get(COOKIE_SHARE_STORAGE_KEY)?.claims[0]?.phase==='received')f.disable();
  });
  await assert.rejects(service.dispatch('shareClaim',{
    origin:f.saved.origin,revision:1,inviteUrl:created.url},'owner'),{code:'E_TOOL_CHANGED'});
  assert.equal(f.records.get(COOKIE_ACCOUNT_STORE_KEY).accounts.length,1);
  assert.equal(f.records.get(COOKIE_SHARE_STORAGE_KEY).claims[0].phase,'received');
});

test('received configurations can finish a conflicted local save without another remote claim',async t=>{
  const f=await fixture(t),service=f.create();
  const created=await service.dispatch('shareCreate',{...f.payload,maxClaims:1},'owner');let changed=false;
  f.onRead((key,mode,next)=>{
    if(!changed&&key===COOKIE_ACCOUNT_STORE_KEY&&f.records.get(COOKIE_SHARE_STORAGE_KEY)?.claims[0]?.phase==='received'){
      // Model a competing committed writer, not a transient changed read.
      changed=true;
      const competing=structuredClone(f.records.get(key));competing.revision++;
      f.records.set(key,competing);next.set(key,structuredClone(competing));
    }
  });
  await assert.rejects(service.dispatch('shareClaim',{
    origin:f.saved.origin,revision:1,inviteUrl:created.url},'owner'),{code:'E_VAULT_CONFLICT'});
  f.onRead(()=>{});
  const pending=await f.create().dispatch('shareInspect',{inviteUrl:created.url},'owner');
  assert.equal(pending.localSavePending,true);
  const refreshed=await f.vault.status();assert.equal(refreshed.revision,2);
  const result=await f.create().dispatch('shareClaim',{
    origin:f.saved.origin,revision:refreshed.revision,inviteUrl:created.url},'owner');
  assert.equal(result.status,'configuration_imported');
  assert.equal(f.calls.filter(x=>x.url.endsWith('/claim')).length,1);
});

test('existing raw-backup contract rejects a real nonextractable CryptoKey: session transfer remains BLOCKED',async()=>{
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  await assert.rejects(crypto.subtle.exportKey('jwk',pair.privateKey));
  const row={key:'cookie-device-private',value:structuredClone(pair.privateKey)};
  // Cursor delivery double tests the actual backup encoder, not native IDB.
  const db={name:'diagnostic',version:2,objectStoreNames:['frameworkKV'],transaction(){
    const tx={objectStore(){return {openCursor(){
      const request={};
      setImmediate(()=>{request.result={primaryKey:row.key,value:row.value,continue(){
        setImmediate(()=>{request.result=null;request.onsuccess();setImmediate(()=>tx.oncomplete());});
      }};request.onsuccess();});return request;
    }}}};return tx;
  }};
  await assert.rejects(captureBackup(db),error=>error.code==='E_VERSION'&&
    error.message==='Unsupported backup value');
});
