import {loadFakeBuiltin} from '../environment/builtin-support.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRunAuthority} from '../../src/platform/host/authority.js';
import {CONTRACT_VERSION, CONTRACT_HASH, digest} from '../../src/platform/protocol.js';

// A serial transaction oracle checks control ordering, not IndexedDB/browser behavior.
function serialStore() {
  let state = new Map(), queue = Promise.resolve();
  return {transaction(names,mode,body) {
    const operation = queue.then(async () => {
      const copy = structuredClone(state);
      const store = name => { if (!names.includes(name)) throw new Error('Store outside transaction'); if (!copy.has(name)) copy.set(name,new Map()); return copy.get(name); };
      const tx = {get:async(n,k)=>structuredClone(store(n).get(k)), put:async(n,v,k)=>store(n).set(k,structuredClone(v)),
        delete:async(n,k)=>store(n).delete(k), all:async n=>[...store(n).values()].map(v=>structuredClone(v))};
      const result = await body(tx); if (mode === 'readwrite') state = copy; return result;
    });
    queue = operation.catch(()=>{}); return operation;
  }};
}
async function setup() {
  const template = JSON.parse(await readFile(new URL('../../contracts/fixtures/transaction-template.json',import.meta.url)));
  const storage = serialStore(); storage.getTemplateByHash = async hash => { assert.equal(hash,template.contentHash); return template; };
  let allowed = true;
  const api = {runtime:{id:'extension',getURL:p=>`chrome-extension://extension/${p}`},permissions:{contains:async()=>allowed}};
  const sender = {id:'extension',url:api.runtime.getURL('ui/tool.html'),documentId:'host-document',frameId:0,documentLifecycle:'active',tab:{id:1,incognito:false}};
  const snapshot = {policyVersion:'1.0.0',tier:'pro',approvedAt:'2026-10-02T00:00:00.000Z',claimHash:'a'.repeat(64),offlineAgeMs:0,effectiveLimits:template.limits,maxSavedTemplates:50,approvedCapabilities:template.requiredCapabilities,runExpiryRevokes:false};
  const authority = createRunAuthority({loadBuiltin:loadFakeBuiltin,storage,api,session:'session',entitlement:{admitRun:async()=>snapshot},validatePlan:async()=>{}});
  const registration = await authority.registerHost({hostInstanceId:'host-instance',claimedContractVersion:CONTRACT_VERSION,claimedContractHash:CONTRACT_HASH},sender);
  const claim = () => authority.claimRun({registrationId:registration.registrationId,templateHash:template.contentHash},sender);
  const claimed = await claim();
  const target = {targetSessionId:'target-session',tabId:2,frameId:0,documentId:'target-document',allowedOrigin:template.allowedOrigin,targetVersion:1,browserSessionIncarnation:'session',creationId:'creation'};
  const identity = {runId:claimed.runId,hostInstanceId:'host-instance',hostDocumentId:'host-document',ownerEpoch:1,runRevision:1,templateHash:template.contentHash,target};
  await storage.transaction(['runs'], 'readwrite', async tx => { const r=await tx.get('runs',claimed.runId);r.identity=identity;r.target=target;await tx.put('runs',r,r.runId); });
  const commandId = 'command';
  const payload = {selector:'a.next',url:'https://fixture.example/list?page=2',endMarkerSelector:'.end',priorPageSignature:'b'.repeat(64),waitMs:2000};
  const prepared = () => authority.prepareCommand({identity,commandId,kind:'next-link',payload},sender);
  return {authority,storage,sender,identity,claimed,claim,prepared,commandId,setAllowed:v=>{allowed=v;}};
}
test('stop commit before dispatch forbids any new external call', async () => {
  const s=await setup();await s.prepared();
  await s.authority.stopRun({runId:s.claimed.runId,expectedRunRevision:1,requestId:'stop'},s.sender);
  await assert.rejects(s.authority.authorizeDispatch({identity:s.identity,commandId:s.commandId},s.sender),e=>['E_REVISION','E_TARGET','E_CANCELLED'].includes(e.code));
});
test('dispatch commit grants exactly one call even if stop subsequently commits', async () => {
  const s=await setup();await s.prepared();
  const first=await s.authority.authorizeDispatch({identity:s.identity,commandId:s.commandId},s.sender);
  assert.equal(first.call,true);
  await s.authority.stopRun({runId:s.claimed.runId,expectedRunRevision:1,requestId:'stop'},s.sender);
  const again=await s.authority.authorizeDispatch({identity:s.identity,commandId:s.commandId},s.sender);
  assert.equal(again.call,false); assert.equal(first.command.submissionCount,1);
});
test('a worker restart freezes a dispatched gap, holds slot and never repeats start', async () => {
  const s=await setup();await s.prepared();await s.authority.authorizeDispatch({identity:s.identity,commandId:s.commandId},s.sender);
  await s.authority.recover();
  const view=await s.authority.snapshotRun({runId:s.claimed.runId},s.sender);
  assert.equal(view.run.state,'paused_unknown'); assert.equal(view.slotAvailable,false);
  const again=await s.authority.authorizeDispatch({identity:s.identity,commandId:s.commandId},s.sender);
  assert.equal(again.call,false);assert.equal(again.command.state,'effect_unknown');
  await assert.rejects(s.claim(),e=>e.code==='E_OWNER');
});
test('actual sender, optional grant and immutable command ID are enforced', async () => {
  const s=await setup(); await s.prepared();
  await assert.rejects(s.authority.snapshotRun({}, {...s.sender,documentId:'other-document'}),e=>e.code==='E_OWNER');
  await assert.rejects(s.authority.prepareCommand({identity:s.identity,commandId:s.commandId,kind:'next-link',payload:{selector:'a.next',url:'https://fixture.example/different',endMarkerSelector:'.end',priorPageSignature:'b'.repeat(64),waitMs:2000}},s.sender),e=>e.code==='E_HASH');
  s.setAllowed(false);
  await assert.rejects(s.authority.authorizeDispatch({identity:s.identity,commandId:s.commandId},s.sender),e=>e.code==='E_PERMISSION');
});
test('stop repeats historical ACK; fencing cannot free the target slot by itself', async () => {
  const s=await setup(); const request={runId:s.claimed.runId,expectedRunRevision:1,requestId:'stop'};
  const ack=await s.authority.stopRun(request,s.sender); assert.deepEqual(await s.authority.stopRun(request,s.sender),ack);
  const retired=await s.authority.abandonUnknown({runId:s.claimed.runId,expectedRunRevision:ack.runRevision,requestId:'abandon',userExplicit:true},s.sender);
  assert.equal(retired.state,'retiring'); assert.equal((await s.authority.snapshotRun({runId:s.claimed.runId},s.sender)).slotAvailable,false);
  await assert.rejects(s.claim(),e=>e.code==='E_OWNER');
});
