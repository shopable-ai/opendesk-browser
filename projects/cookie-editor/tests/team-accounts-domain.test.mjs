import test from 'node:test';
import assert from 'node:assert/strict';
import {createCookieTeamAccounts} from '../app/domain/team-accounts.js';

function fixture(){
  let stored,reviewed,version=1,assignmentRevision=1,authEpoch=1,available=true,drop=false,denied=false,malformed=false,invitation='a';
  const calls=[],receipts=new Map();let writes=0,pairs=0,imports=0;
  const target={origin:'https://team.example.test',url:'https://team.example.test/',documentId:'doc-A',tabId:1,
    storeId:'0',partitionKey:null,packageHash:'a'.repeat(64),installEpoch:'installation-A'};
  const accounts=[{alias:'local-one',version:1,origin:target.origin,cookieCount:1}];
  const wire=async(method,path,body)=>{
    calls.push({method,path,body:structuredClone(body)});
    if(method==='GET'&&path.includes('/team-operations/'))return receipts.get(path.split('/').at(-1))??{status:'UNKNOWN'};
    if(method==='GET')return {member:{tenantId:'local',userId:'member_A',deviceId:'device_A',authEpoch},
      accounts:available?[{accountId:'one',version,assignmentRevision,origin:target.origin,displayName:'合成一',expiresAt:Date.now()+60000,state:'AVAILABLE'}]:[]};
    if(denied){denied=false;throw Object.assign(Error('ASSIGNMENT_CONFLICT'),{teamRejected:true});}
    const result={operationId:body.operationId,member:{tenantId:'local',userId:'member_A',deviceId:'device_A',authEpoch},
      accountVersion:version,assignmentRevision,...(path.endsWith('/claim')?
      {status:'CLAIMED',inviteUrl:'https://relay.invalid/i/'+invitation.repeat(32),senderFingerprint:'a'.repeat(64)}:{status:'AUTHORIZED',target:body.target})};
    receipts.set(body.operationId,{status:'CONFIRMED',result});
    if(drop){drop=false;throw Error('Lost response');}if(malformed){malformed=false;return {...result,operationId:undefined};}return result;
  };
  const account=async(action,payload)=>{
    calls.push({action,payload});
    if(action==='status')return {revision:1,accounts};
    if(action==='sharePair'){pairs++;return {pair:{requestId:'pairA',receiverFingerprint:'b'.repeat(64)}};}
    if(action==='shareClaim'){imports++;return {sessionImported:true,alias:'local-one'};}
    if(action==='switch'){writes++;if(reviewed)throw Error('lost native response');return {switched:true,verified:true,loginVerified:false,changed:1,verification:'cookie-effects',snapshotState:'matches'};}
    assert.fail(action);
  };
  const journal={read:async()=>structuredClone(stored),write:async value=>{stored=structuredClone(value);}};
  const make=()=>createCookieTeamAccounts({wire,account,scope:async()=>structuredClone(target),journal});
  return {client:make(),make,calls,target,accounts,journal,counts:()=>({writes,pairs,imports}),
    update:()=>{version++;assignmentRevision++;},reassign:()=>{assignmentRevision++;},revoke:()=>{available=false;authEpoch++;},
    drop:()=>{drop=true;},deny:()=>{denied=true;},malformed:()=>{malformed=true;},newInvitation:()=>{invitation='c';assignmentRevision++;},loseNativeReceipt:()=>{reviewed=true;}};
}
async function downloaded(f){await f.client.pair('one');await f.client.receive('one');}

test('list and receive remain distinct from explicit reviewed application',async()=>{
  const f=fixture();await f.client.list();assert.deepEqual(f.counts(),{writes:0,pairs:0,imports:0});
  await downloaded(f);assert.deepEqual(f.counts(),{writes:0,pairs:1,imports:1});
  await assert.rejects(f.client.use('one'),{code:'E_TEAM_REVIEW_REQUIRED'});
  await f.client.review('one');const result=await f.client.use('one');
  assert.equal(result.phase,'APPLIED');assert.equal(result.receipt.websiteLoginConfirmed,false);
  assert.equal(f.counts().writes,1);
  assert.equal(f.calls.filter(row=>row.method==='POST'&&row.path.endsWith('/authorize-use')).length,1);
  assert.equal(JSON.stringify(await f.journal.read()).includes('https://relay.invalid'),false);
});
test('document, Store, Partition, installation, local version and assignment changes invalidate review',async()=>{
  for(const change of [f=>f.target.documentId='doc-B',f=>f.target.storeId='1',
    f=>f.target.partitionKey={topLevelSite:'https://elsewhere.test',hasCrossSiteAncestor:false},
    f=>f.target.installEpoch='installation-B',f=>f.target.packageHash='b'.repeat(64),
    f=>f.accounts[0].version++,f=>f.reassign(),f=>f.update(),f=>f.revoke()]){
    const f=fixture();await downloaded(f);await f.client.review('one');change(f);
    await assert.rejects(f.client.use('one'));assert.equal(f.counts().writes,0);
  }
});
test('lost server receipt persists across reopen, blocks mutations and recovers by GET only',async()=>{
  const f=fixture();f.drop();await assert.rejects(f.client.pair('one'),{code:'E_TEAM_UNKNOWN'});
  const reopened=f.make(),state=await reopened.list(),id=state.local[0].operationId;
  assert.equal(state.pending,true);const posts=f.calls.filter(x=>x.method==='POST').length;
  await assert.rejects(reopened.pair('one'),{code:'E_TEAM_UNKNOWN'});
  assert.equal((await reopened.reconcile(id)).status,'CONFIRMED');
  assert.equal(f.calls.filter(x=>x.method==='POST').length,posts);
  assert.deepEqual(f.counts(),{writes:0,pairs:0,imports:0});
});
test('lost local application result cannot be replayed, rolled back or marked successful',async()=>{
  const f=fixture();await downloaded(f);await f.client.review('one');f.loseNativeReceipt();
  await assert.rejects(f.client.use('one'),{code:'E_TEAM_UNKNOWN'});
  const reopened=f.make(),list=await reopened.list();assert.equal(list.pending,true);
  assert.equal(list.local[0].phase,'DOWNLOADED');
  assert.equal((await reopened.reconcile(list.local[0].operationId)).status,'UNKNOWN');
  await assert.rejects(reopened.review('one'),{code:'E_TEAM_UNKNOWN'});
  assert.equal(f.counts().writes,1);
});
test('rapid repeated click submits only one operation',async()=>{
  const f=fixture(),first=f.client.pair('one');
  await assert.rejects(f.client.pair('one'),{code:'E_TEAM_BUSY'});await first;
  assert.equal(f.counts().pairs,1);
});
test('a new assignment cannot reuse a downloaded alias, while fingerprint delivery can finish an unconsumed pair',async()=>{
  const f=fixture();await downloaded(f);f.reassign();
  await assert.rejects(f.client.review('one'),{code:'E_TEAM_DOWNLOAD_REQUIRED'});
  await assert.rejects(f.client.use('one'),{code:'E_TEAM_REVIEW_REQUIRED'});
  assert.equal(f.counts().writes,0);
  const g=fixture();await g.client.pair('one');g.reassign();await g.client.receive('one');
  await g.client.review('one');await g.client.use('one');assert.equal(g.counts().writes,1);
  const h=fixture();await h.client.pair('one');h.newInvitation();
  await assert.rejects(h.client.receive('one'),{code:'E_TEAM_ASSIGNMENT_CHANGED'});
  assert.equal(h.counts().imports,0);
  await h.client.pair('one');await h.client.receive('one');assert.equal(h.counts().imports,1);
});
test('validated protocol denial clears only the rejected intent and never invokes the trusted consumer',async()=>{
  const f=fixture();f.deny();await assert.rejects(f.client.pair('one'),{code:'E_TEAM_UNAVAILABLE'});
  assert.equal((await f.client.list()).pending,false);assert.equal(f.counts().pairs,0);
});
test('a successful HTTP response with an uncorrelated receipt remains unknown',async()=>{
  const f=fixture();f.malformed();await assert.rejects(f.client.pair('one'),{code:'E_TEAM_UNKNOWN'});
  assert.equal((await f.make().list()).pending,true);assert.equal(f.counts().pairs,0);
});
