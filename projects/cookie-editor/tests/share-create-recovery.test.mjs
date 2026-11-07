import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCookieAccountShare,COOKIE_SHARE_STORAGE_KEY} from '../trusted/account-share.js';

// Real disposable Relay process/SQLite, synthetic metadata, serial Foundation
// reference storage. No Chrome, TLS, live DB, real Cookie or private store.
const relayModule=new URL('../../../services/cookie-share-relay/server.mjs',import.meta.url).href;
async function fixture(t){
  const directory=await mkdtemp(join(tmpdir(),'od-create-recovery-'));
  const origin='https://synthetic-relay.invalid',site='https://synthetic-account.invalid';
  let child,root,drop=false,authorized=true,granted=true;
  const records=new Map(),calls=[];let tail=Promise.resolve();
  const start=async()=>{
    child=spawn(process.execPath,['--input-type=module','-e',`
      import {createShareRelay,createShareHttpServer} from ${JSON.stringify(relayModule)};
      const relay=createShareRelay({dbPath:process.env.TEST_RELAY_DB,publicOrigin:${JSON.stringify(origin)}});
      const server=createShareHttpServer(relay);
      server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
    `],{env:{...process.env,TEST_RELAY_DB:join(directory,'relay.sqlite')},
      stdio:['ignore','ignore','pipe','ipc']});
    const [message]=await once(child,'message',{signal:AbortSignal.timeout(10000)});
    root='http://127.0.0.1:'+message.port;
  };
  const stop=async()=>{const exited=once(child,'exit');child.kill('SIGTERM');await exited;};
  await start();t.after(async()=>{await stop();await rm(directory,{recursive:true});});
  const storage=async()=>({transaction(stores,mode,work){
    assert.deepEqual(stores,['frameworkKV']);
    const run=tail.then(async()=>{
      const draft=structuredClone(records);
      const value=await work({get:async(_s,k)=>structuredClone(draft.get(k)),
        put:async(_s,v,k)=>draft.set(k,structuredClone(v)),
        delete:async(_s,k)=>draft.delete(k)});
      if(mode==='readwrite'){records.clear();for(const [k,v] of draft)records.set(k,v);}
      return value;
    });tail=run.catch(()=>{});return run;
  }});
  const account={alias:'acct_synthetic_001',origin:site,displayName:'Synthetic account',
    description:'No session values',version:1,cookies:[]};
  const vault={read:async()=>({revision:1,accounts:[structuredClone(account)]})};
  const fetcher=async(url,options)=>{
    assert.ok(url.startsWith(origin+'/v1/'));calls.push({url,options});
    if(options.method==='POST'&&url.endsWith('/v1/invites')){
      const stored=records.get(COOKIE_SHARE_STORAGE_KEY).items.at(-1);
      assert.equal(stored.phase,'creating','intent must commit before the actual POST');
    }
    const response=await fetch(root+url.slice(origin.length),options);
    if(drop&&options.method==='POST'){drop=false;await response.arrayBuffer();throw Error('lost create reply');}
    // Preserve the logical HTTPS origin seen by the client, as the existing
    // Relay integration fixture does; do not expose the injected loopback URL.
    return new Response(await response.text(),{status:response.status,headers:response.headers});
  };
  const create=(options={})=>createCookieAccountShare({storage,vault,fetcher,
    api:{permissions:{contains:async()=>granted}},
    authorize:async()=>{if(!authorized)throw Object.assign(Error(),{code:'E_TOOL_CHANGED'});},...options});
  const payload={origin:site,alias:account.alias,accountVersion:1,revision:1,
    relayOrigin:origin,expiresInSeconds:3600,maxClaims:1,mode:'configuration'};
  return {create,records,calls,payload,origin,site,
    loseReply:()=>{drop=true;},restart:async()=>{await stop();await start();},
    permission:value=>{granted=value;},authorize:value=>{authorized=value;}};
}

test('lost create reply is visible after client restart and recovered by GET after Relay process restart',async t=>{
  const f=await fixture(t);f.loseReply();
  await assert.rejects(f.create().dispatch('shareCreate',f.payload,'owner'),{code:'E_OUTCOME_UNKNOWN'});
  const listing=await f.create().dispatch('shareList',f.payload,'owner');
  assert.equal(listing.creationRecoveryVersion,1);
  const [pending]=listing.pendingInvitations;
  assert.ok(pending,'durable creating row must remain visible');
  assert.equal(pending.phase,'creating');assert.equal(pending.recoveryAvailable,true);
  const original=structuredClone(f.records.get(COOKIE_SHARE_STORAGE_KEY).items[0]);
  const sent=JSON.parse(f.calls[0].options.body);
  assert.equal(sent.operationRef,pending.ref);
  assert.equal(f.calls[0].options.headers['x-opendesk-invite-manager'],original.managerSecret);
  await f.restart();
  const recovered=await f.create().dispatch('shareStatus',{ref:pending.ref,origin:f.site},'owner');
  assert.equal(recovered.phase,'active');assert.equal(recovered.ref,pending.ref);
  assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
  assert.equal(f.calls.at(-1).options.method,'GET');
  assert.ok(f.calls.at(-1).url.endsWith('/v1/invite-creations/'+pending.ref));
  assert.equal(f.records.get(COOKIE_SHARE_STORAGE_KEY).items[0].managerSecret,original.managerSecret);
  assert.doesNotMatch(JSON.stringify({pending,recovered}),/managerSecret|createRequest|operationRef/);
  assert.equal(f.records.get(COOKIE_SHARE_STORAGE_KEY).items.length,1);
});
test('pending create blocks concurrent or reopened creates even with a changed Relay or installation owner',async t=>{
  const f=await fixture(t);f.loseReply();
  const results=await Promise.allSettled([f.create().dispatch('shareCreate',f.payload,'owner'),
    f.create().dispatch('shareCreate',f.payload,'owner')]);
  assert.ok(results.every(r=>r.status==='rejected'&&r.reason.code==='E_OUTCOME_UNKNOWN'));
  await assert.rejects(f.create().dispatch('shareCreate',{
    ...f.payload,relayOrigin:'https://changed.invalid'},'updated-installation'),{code:'E_OUTCOME_UNKNOWN'});
  const pending=(await f.create().dispatch('shareList',f.payload,'updated-installation')).pendingInvitations;
  assert.equal(pending.length,1);assert.equal(pending[0].recoveryAvailable,false);
  assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
});
test('historical uncorrelated pending remains visible and cannot be cleared or fabricated as recovered',async t=>{
  const f=await fixture(t);
  const row={ref:'historical-ref-00000000000001',owner:'previous-installation',relay:f.origin,
    alias:f.payload.alias,siteOrigin:f.site,url:'',phase:'creating'};
  f.records.set(COOKIE_SHARE_STORAGE_KEY,{format:1,items:[row],claims:[]});
  const listed=await f.create().dispatch('shareList',f.payload,'owner');
  assert.equal(listed.pendingInvitations.length,1);assert.equal(listed.pendingInvitations[0].recoveryAvailable,false);
  await assert.rejects(f.create().dispatch('shareCreate',f.payload,'owner'),{code:'E_OUTCOME_UNKNOWN'});
  await assert.rejects(f.create().dispatch('shareStatus',{ref:row.ref,origin:f.site},row.owner),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.length,0);assert.deepEqual(f.records.get(COOKIE_SHARE_STORAGE_KEY).items,[row]);
});
test('recovery cannot bypass current installation identity, site scope or revoked service permission',async t=>{
  const f=await fixture(t);f.loseReply();
  await assert.rejects(f.create().dispatch('shareCreate',f.payload,'owner'),{code:'E_OUTCOME_UNKNOWN'});
  const row=f.records.get(COOKIE_SHARE_STORAGE_KEY).items[0],size=f.calls.length;
  await assert.rejects(f.create().dispatch('shareStatus',{ref:row.ref,origin:f.site},'other-owner'),{code:'E_SHARE_NOT_FOUND'});
  await assert.rejects(f.create().dispatch('shareStatus',{ref:row.ref,origin:'https://wrong.invalid'},'owner'),{code:'E_SITE_MISMATCH'});
  f.permission(false);
  await assert.rejects(f.create().dispatch('shareStatus',{ref:row.ref,origin:f.site},'owner'),{code:'E_SHARE_PERMISSION_REQUIRED'});
  f.permission(true);f.authorize(false);
  await assert.rejects(f.create().dispatch('shareStatus',{ref:row.ref,origin:f.site},'owner'),{code:'E_TOOL_CHANGED'});
  assert.equal(f.calls.length,size);assert.equal(f.records.get(COOKIE_SHARE_STORAGE_KEY).items[0].phase,'creating');
});

test('uninstall cleanup removes secrets but retains the original unknown fence across reinstall',async t=>{
  const f=await fixture(t);f.loseReply();
  await assert.rejects(f.create().dispatch('shareCreate',f.payload,'owner'),{code:'E_OUTCOME_UNKNOWN'});
  const before=structuredClone(f.records.get(COOKIE_SHARE_STORAGE_KEY).items[0]);
  await f.create().clear();
  const retained=f.records.get(COOKIE_SHARE_STORAGE_KEY)?.items[0];
  assert.ok(retained,'cleanup cannot erase an unresolved operation');
  assert.equal(retained.ref,before.ref);assert.equal(retained.phase,'creating');
  assert.equal(retained.managerSecret,undefined);assert.equal(retained.createRequest,undefined);
  assert.equal(retained.clearedUnknown,true);
  await assert.rejects(f.create().dispatch('shareCreate',f.payload,'reinstalled-owner'),{code:'E_OUTCOME_UNKNOWN'});
  const list=await f.create().dispatch('shareList',f.payload,'reinstalled-owner');
  assert.equal(list.pendingInvitations[0].ref,before.ref);assert.equal(list.pendingInvitations[0].recoveryAvailable,false);
  assert.equal(f.calls.length,1);
});
test('previous-installation revocation pending is visible without granting management authority',async t=>{
  const f=await fixture(t);
  const row={ref:'old-revocation-00000000000001',owner:'old-owner',relay:f.origin,
    alias:f.payload.alias,siteOrigin:f.site,url:f.origin+'/i/'+'a'.repeat(32),phase:'revoking',
    managerSecret:'not-for-ui',invite:{id:'a'.repeat(32),origin:f.site,displayName:'Synthetic',
      description:'',mode:'configuration',expiresAt:Date.now()+3600000,remainingClaims:1,revoked:false}};
  f.records.set(COOKIE_SHARE_STORAGE_KEY,{format:1,items:[row],claims:[]});
  const listed=await f.create().dispatch('shareList',f.payload,'new-owner');
  assert.equal(listed.pendingInvitations.length,1);assert.equal(listed.pendingInvitations[0].phase,'revoking');
  assert.equal(listed.pendingInvitations[0].recoveryAvailable,false);assert.equal(listed.pendingInvitations[0].invite,undefined);
  await assert.rejects(f.create().dispatch('shareCreate',f.payload,'new-owner'),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.length,0);
});

test('lost claim receipt stays fenced after uninstall, repeated cleanup and client reinstall',async t=>{
  const f=await fixture(t);
  const created=await f.create().dispatch('shareCreate',f.payload,'owner');f.loseReply();
  const input={origin:f.site,revision:1,inviteUrl:created.url};
  await assert.rejects(f.create().dispatch('shareClaim',input,'owner'),{code:'E_OUTCOME_UNKNOWN'});
  const original=structuredClone(f.records.get(COOKIE_SHARE_STORAGE_KEY).claims[0]);
  await f.create().clear();await f.create().clear();
  const retained=f.records.get(COOKIE_SHARE_STORAGE_KEY).claims[0],calls=f.calls.length;
  assert.equal(retained.ref,original.ref);assert.equal(retained.url,created.url);
  assert.equal(retained.phase,'claiming');assert.equal(retained.clearedUnknown,true);
  assert.equal(retained.invite,undefined);assert.equal(retained.encryptedPacket,undefined);
  for(const action of ['shareInspect','shareClaim','sharePair'])
    await assert.rejects(f.create().dispatch(action,input,'reinstalled-owner'),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.length,calls);assert.equal(f.calls.filter(c=>c.url.endsWith('/claim')).length,1);
});

test('owner retirement cannot collect a terminal invitation with an unknown delivery after cleanup',async t=>{
  const f=await fixture(t),cleared=[];
  f.records.set(COOKIE_SHARE_STORAGE_KEY,{format:1,claims:[],items:[{
    ref:'unknown-delivery-000000000001',owner:'old-owner',alias:f.payload.alias,siteOrigin:f.site,
    relay:f.origin,url:f.origin+'/i/'+'a'.repeat(32),phase:'expired',
    invite:{mode:'session'},deliveries:[{requestId:'original-delivery-0000000001',phase:'delivering'}]}]});
  const service=f.create({clearSessionKeys:async owner=>{cleared.push(owner);}});
  await service.clear();
  const original=structuredClone(f.records.get(COOKIE_SHARE_STORAGE_KEY));
  assert.equal(original.items[0].clearedUnknown,true);
  await assert.rejects(service.dispatch('shareCreate',f.payload,'new-owner'),{code:'E_OUTCOME_UNKNOWN'});
  assert.deepEqual(f.records.get(COOKIE_SHARE_STORAGE_KEY),original);
  assert.equal(f.calls.length,0);assert.deepEqual(cleared,['old-owner']);
});
test('current-owner unknown revocation remains available for read-only status after reopen',async t=>{
  const f=await fixture(t);
  const created=await f.create().dispatch('shareCreate',f.payload,'owner');f.loseReply();
  const input={ref:created.ref,origin:f.site};
  await assert.rejects(f.create().dispatch('shareRevoke',input,'owner'),{code:'E_OUTCOME_UNKNOWN'});
  const pending=(await f.create().dispatch('shareList',f.payload,'owner')).invitations[0];
  assert.equal(pending.phase,'revoking');assert.equal(pending.statusAvailable,true);
  const result=await f.create().dispatch('shareStatus',input,'owner');
  assert.equal(result.phase,'revoked');assert.equal(result.invite.revoked,true);
  assert.equal(f.calls.filter(c=>c.options.method==='POST').length,2);
  assert.equal(f.calls.at(-1).options.method,'GET');
});

test('older invitation-list consumers only receive real invite metadata while pending stays visible separately',async t=>{
  const f=await fixture(t);f.loseReply();
  await assert.rejects(f.create().dispatch('shareCreate',f.payload,'owner'),{code:'E_OUTCOME_UNKNOWN'});
  const response=await f.create().dispatch('shareList',f.payload,'owner');
  assert.equal(response.invitations.length,0,'the installed older UI dereferences invite.expiresAt for every invitation');
  assert.equal(response.pendingInvitations.length,1);
  assert.equal(response.pendingInvitations[0].phase,'creating');
  assert.equal(response.creationRecoveryVersion,1);
});
