import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyFocus} from '../../examples/sidebar-tools/stay-focus/trusted/model.js';
import {migrateFocusState} from '../../examples/sidebar-tools/stay-focus/trusted/migrations.js';
import {mutateFocusModel} from '../../examples/sidebar-tools/stay-focus/trusted/mutations.js';
import {createFocusController} from '../../examples/sidebar-tools/stay-focus/trusted/focus-controller.js';

const at=new Date(2026,9,23,13,0,0).getTime();
const site={host:'example.com',subdomains:true,enabled:true,
  group:'entertainment',mode:'limit',minutes:30};
const initial=()=>({kind:'site-budget.v3',desiredPolicyRev:0,appliedPolicyRev:0,
  status:'inactive',desiredPolicy:{kind:'site-budget.v3',enabled:false,sites:[],whitelist:[]},
  modelRef:null,sealedModel:null,usage:{},day:'2026-10-23',clockHighWater:0,
  permissions:{idle:true,dnr:true,ready:true}});
test('Stay Focus v1 mutations are owned by the app, finite and preserve source',()=>{
  const before=emptyFocus(at),copy=structuredClone(before);
  const after=mutateFocusModel(structuredClone(before),'focus.site.put',{site},at);
  assert.deepEqual(before,copy);
  assert.equal(after.sites[0].host,'example.com');
  assert.equal(after.groups.entertainment,30);
  assert.throws(()=>mutateFocusModel(structuredClone(after),'focus.group.remove',
    {id:'entertainment'},at),{code:'E_FOCUS_DATA'});
});
test('lossless legacy preparation conserves per-pool usage and STOP',()=>{
  const state=emptyFocus(at);
  state.sites=[site];state.groups.entertainment=30;
  state.usage={'g:entertainment':120000,'s:other.test':5000};
  const before=structuredClone(state),converted=migrateFocusState(state,{at});
  assert.equal(converted.usedBefore,125000);
  assert.equal(converted.usedAfter,125000);
  assert.deepEqual(converted.usage,state.usage);
  assert.equal(converted.desiredPolicy.enabled,false);
  assert.deepEqual(state,before);
});
test('old reminders survive transfer while sealed app model cannot bill usage twice',()=>{
  const state=emptyFocus(at);
  state.sites=[site];state.groups.entertainment=30;
  state.enabled=false;
  state.usage={'g:entertainment':25*60000,'s:other.test':20000};
  state.notices={day:state.day,revision:7,budgetMs:30*60000,thresholds:[10,5]};
  const snapshot=structuredClone(state),converted=migrateFocusState(state,{at});
  assert.deepEqual(state,snapshot,'preflight never mutates the source snapshot');
  assert.deepEqual(converted.notices.pools['g:entertainment'],
    {limitMs:30*60000,thresholds:[10,5]});
  assert.deepEqual(converted.usage,state.usage,'per-pool usage must be conserved');
  assert.deepEqual(converted.sealedModel.usage,{},'one authoritative Driver ledger');
  assert.equal(converted.sealedModel.checkpoint,null,'never replay old time checkpoint');
  assert.equal(converted.sealedModel.clockHighWater,0);
  assert.equal(converted.sealedModel.authorizedHash,null);
  assert.equal(converted.sealedModel.authorizedEpoch,null);
  // The Installer will hash and journal this plan; an app or callback must
  // not be able to alter a nested counter, grant or reminder after preflight.
  for(const value of [converted,converted.model,converted.model.sites[0],
    converted.desiredPolicy,converted.desiredPolicy.sites[0],
    converted.usage,converted.sealedModel,
    converted.notices.pools['g:entertainment'].thresholds])
    assert.equal(Object.isFrozen(value),true,'migration snapshot must be recursively sealed');
  assert.throws(()=>{converted.usage['g:entertainment']=0;},TypeError);
  assert.deepEqual(state,snapshot,'deep freeze may not mutate legacy storage');
  assert.throws(()=>migrateFocusState(undefined,{at}),{code:'E_MIGRATION_SOURCE'},
    'missing legacy state cannot be silently interpreted as first install');
  const corrupt=structuredClone(state);
  corrupt.notices.thresholds=[10,5];
  corrupt.notices.budgetMs=null;
  assert.throws(()=>migrateFocusState(corrupt,{at}),{code:'E_MIGRATION_NOTICE'},
    'unknown reminder limit must not create duplicate alerts');
  // Enabled legacy owners must have BOTH halves of their original grant.
  // A hash without its installation epoch is not upgrade authority.
  const incomplete=structuredClone(state);
  incomplete.enabled=true;incomplete.authorizedHash='a'.repeat(64);
  incomplete.authorizedEpoch=null;
  assert.throws(()=>migrateFocusState(incomplete,{at}),{code:'E_MIGRATION_GRANT'});
  incomplete.authorizedHash=null;incomplete.authorizedEpoch='legacy-epoch';
  assert.throws(()=>migrateFocusState(incomplete,{at}),{code:'E_MIGRATION_GRANT'});
});
test('public v3 Controller issues sealed finite commits, no focus RPC',async()=>{
  let receipt=initial(),calls=[];
  const siteBudget={
    getStatus:async()=>structuredClone(receipt),
    setPolicy:async commit=>{
      calls.push(commit);
      receipt={...receipt,desiredPolicyRev:receipt.desiredPolicyRev+1,
        appliedPolicyRev:receipt.appliedPolicyRev+1,status:'inactive',
        desiredPolicy:commit.desiredPolicy,modelRef:commit.modelRef,
        sealedModel:commit.sealedModel};
      return structuredClone(receipt);
    }
  };
  const controller=createFocusController({
    request:async name=>{throw Error('Forbidden private RPC: '+name)},
    siteBudget,now:()=>at
  });
  const summary=await controller.operate('focus.site.put',{site});
  assert.equal(summary.sites.length,1);
  assert.equal(summary.sites[0].host,'example.com');
  assert.equal(calls.length,1);
  assert.equal(calls[0].expectedRev,0);
  assert.equal(calls[0].desiredPolicy.sites[0].pool,'g:entertainment');
  assert.equal(calls[0].sealedModel.sites.length,1);
  assert.equal(calls[0].sealedModel.authorizedHash,null,
    'legacy authorization hash must never re-enter v3 sealed model');
  assert.equal(calls[0].sealedModel.authorizedEpoch,null);
  assert.equal((await controller.readStatus()).sites.length,1);
});
test('known legacy permission failure preserves old installed tool path',async()=>{
  const methods=[];
  const controller=createFocusController({
    request:async name=>{methods.push(name);return {enabled:false,sites:[]}},
    siteBudget:{getStatus:async()=>{throw Object.assign(new Error('unavailable'),
      {code:'E_TOOL_CAPABILITY_REQUIRED'})},setPolicy:async()=>{throw Error('never')}}});
  await controller.readStatus();
  assert.deepEqual(methods,['focus.status']);
  await controller.operate('focus.site.remove',{host:'example.com'});
  assert.deepEqual(methods,['focus.status','focus.status','focus.site.remove']);
});

test('v3 Focus UI authorization follows only the authenticated Driver site review',async()=>{
  const model=emptyFocus(at);
  model.authorizedHash='a'.repeat(64);
  model.authorizedEpoch='legacy-epoch';
  const receipt={...initial(),modelRef:'a'.repeat(64),sealedModel:model,
    siteReviewActive:false};
  const controller=createFocusController({
    request:async()=>{throw Error('legacy private operation is not allowed')},
    siteBudget:{getStatus:async()=>structuredClone(receipt),
      setPolicy:async()=>{throw Error('not required')}},
    now:()=>at
  });
  assert.equal((await controller.readStatus()).authorized,false,
    'a sealed legacy hash alone is not an application review');
  receipt.siteReviewActive=true;
  assert.equal((await controller.readStatus()).authorized,true,
    'the Driver may preserve a genuine reviewed grant after user STOP');
  receipt.siteReviewActive=false;
  assert.equal((await controller.readStatus()).authorized,false,
    'revocation or epoch mismatch must not be presented as authorized');
});
