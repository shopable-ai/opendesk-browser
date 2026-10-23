import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {focusPackageHash} from '../../examples/sidebar-tools/stay-focus/trusted/policy.js';
import {sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
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

test('v3 mutation rejects a stale revision even if the model SHA and policy match',async()=>{
  let receipt=initial(),attempted=0;
  const controller=createFocusController({
    request:async()=>{throw Error('No private worker operation is allowed');},
    siteBudget:{
      getStatus:async()=>structuredClone(receipt),
      setPolicy:async commit=>{
        attempted++;
        // A lost or stale revision must not look like a successful policy
        // commit merely because a model hash appears in the response.
        return {...receipt,modelRef:commit.modelRef,
          sealedModel:commit.sealedModel,desiredPolicy:commit.desiredPolicy};
      }
    },now:()=>at
  });
  await assert.rejects(controller.operate('focus.disable',{}),
    {code:'E_OUTCOME_UNKNOWN'});
  assert.equal(attempted,1);
  assert.equal(receipt.desiredPolicyRev,0);
});

test('unknown outcome readback requires model, policy AND exact revision',async()=>{
  let reads=0,pending;
  const controller=createFocusController({
    request:async()=>{throw Error('No private worker operation is allowed');},
    siteBudget:{
      getStatus:async()=>{
        reads++;
        return reads===1?initial():{
          ...initial(),desiredPolicyRev:1,modelRef:pending.modelRef,
          // Deliberately stale policy despite a matching model SHA.
          desiredPolicy:initial().desiredPolicy
        };
      },
      setPolicy:async commit=>{
        pending=commit;
        throw Object.assign(new Error('Native result unknown'),{code:'E_OUTCOME_UNKNOWN'});
      }
    },now:()=>at
  });
  await assert.rejects(controller.operate('focus.site.put',{site}),
    {code:'E_OUTCOME_UNKNOWN'});
  assert.equal(reads,2,'one authoritative readback; never replay an unknown commit');
});

test('unchanged v3 policy and sealed model are valid no-op commits',async()=>{
  let receipt=initial(),expected=[];
  const controller=createFocusController({
    request:async()=>{throw Error('No private worker operation is allowed');},
    siteBudget:{
      getStatus:async()=>structuredClone(receipt),
      setPolicy:async commit=>{
        expected.push(commit.expectedRev);
        const isNoop=receipt.modelRef===commit.modelRef&&
          JSON.stringify(receipt.desiredPolicy)===JSON.stringify(commit.desiredPolicy);
        const revision=receipt.desiredPolicyRev+(isNoop?0:1);
        receipt={...receipt,modelRef:commit.modelRef,
          sealedModel:commit.sealedModel,desiredPolicy:commit.desiredPolicy,
          desiredPolicyRev:revision,appliedPolicyRev:revision};
        return structuredClone(receipt);
      }
    },now:()=>at
  });
  await controller.operate('focus.disable',{});
  await controller.operate('focus.disable',{});
  assert.deepEqual(expected,[0,1]);
  assert.equal(receipt.desiredPolicyRev,1,'idempotent update must not invent a revision');
});

test('old Focus identity gets a verified legacy fallback for Driver E_TOOL_CHANGED',async()=>{
  const operations=[];
  const controller=createFocusController({
    request:async operation=>{
      operations.push(operation);
      return {enabled:false,sites:[]};
    },
    siteBudget:{
      getStatus:async()=>{throw Object.assign(new Error('no v3 capability'),
        {code:'E_TOOL_CHANGED'});},
      setPolicy:async()=>{throw Error('must not enter v3');}
    },now:()=>at
  });
  assert.equal((await controller.readStatus()).enabled,false);
  await controller.operate('focus.site.remove',{host:'example.com'});
  assert.deepEqual(operations,['focus.status','focus.status','focus.site.remove']);
});

test('failed legacy proof never caches fallback after an install-epoch change',async()=>{
  let statusReads=0,legacyReads=0;
  const controller=createFocusController({
    request:async()=>{
      legacyReads++;
      throw Object.assign(new Error('old tool revoked'),{code:'E_TOOL_CHANGED'});
    },
    siteBudget:{
      getStatus:async()=>{
        statusReads++;
        if(statusReads===1)
          throw Object.assign(new Error('old owner'),{code:'E_TOOL_CHANGED'});
        return initial();
      },
      setPolicy:async()=>{throw Error('no mutation requested');}
    },now:()=>at
  });
  await assert.rejects(controller.readStatus(),{code:'E_TOOL_CHANGED'});
  assert.equal((await controller.readStatus()).enabled,false);
  assert.equal(statusReads,2,'next read must recheck the live public Driver');
  assert.equal(legacyReads,1,'a revoked legacy worker cannot become a cached fallback');
});

test('old Focus grant hash is NOT the new public Installer package digest',async()=>{
  const legacy=JSON.parse(await readFile(
    new URL('../../examples/sidebar-tools/stay-focus/stay-focus.opendesk-tool.json',import.meta.url),
    'utf8'));
  assert.equal(legacy.version,'1.0.10','test must attest the pinned legacy owner');
  assert.equal(legacy.id,'stay-focus');
  const oldHash=await focusPackageHash(legacy);
  const publicHash=await sidebarToolPackageHash(legacy);
  assert.match(oldHash,/^[a-f0-9]{64}$/);
  assert.match(publicHash,/^[a-f0-9]{64}$/);
  assert.notEqual(oldHash,publicHash,
    'legacy Focus grant and public Browser SDK have distinct package identities');
  const state=emptyFocus(at);
  state.enabled=true;state.authorizedHash=oldHash;
  state.authorizedEpoch='installed-legacy-epoch';
  const plan=migrateFocusState(state,{at});
  assert.equal(plan.legacyAuthorizedHash,oldHash,
    'migration input preserves the true legacy grant digest, never public hash');
  assert.equal(plan.legacyAuthorizedEpoch,'installed-legacy-epoch');
  assert.equal(plan.sealedModel.authorizedHash,null,
    'obsolete Focus grant can never become standalone v3 Driver authority');
});

test('an open legacy UI adopts the authenticated v3 Driver after package replacement',async()=>{
  let installed='legacy',legacyReads=0,driverReads=0;
  const controller=createFocusController({
    request:async operation=>{
      assert.equal(operation,'focus.status');
      legacyReads++;
      if(installed==='v3')
        throw Object.assign(new Error('old package lease retired'),{code:'E_TOOL_CHANGED'});
      return {enabled:false,sites:[]};
    },
    siteBudget:{
      getStatus:async()=>{
        driverReads++;
        if(installed==='legacy')
          throw Object.assign(new Error('not a v3 app'),{code:'E_TOOL_CHANGED'});
        return initial();
      },
      setPolicy:async()=>{throw Error('read-only test');}
    },now:()=>at
  });
  assert.equal((await controller.readStatus()).enabled,false);
  installed='v3';
  assert.equal((await controller.readStatus()).enabled,false);
  assert.equal(legacyReads,2,'the original Host must refuse the retired lease');
  assert.equal(driverReads,2,'new epoch must be independently checked by public SDK');
  await controller.readStatus();
  assert.equal(legacyReads,2,'v3 adoption must never return to old privileged RPC');
  assert.equal(driverReads,3);
});

test('unverified replacement never reports an old UI as successfully migrated',async()=>{
  let reads=0;
  const controller=createFocusController({
    request:async()=>{
      reads++;
      if(reads===1)return {enabled:false,sites:[]};
      throw Object.assign(new Error('old lease retired'),{code:'E_TOOL_CHANGED'});
    },
    siteBudget:{
      getStatus:async()=>{throw Object.assign(new Error('no public lease'),
        {code:'E_TOOL_CHANGED'});},
      setPolicy:async()=>{throw Error('forbidden');}
    },now:()=>at
  });
  await controller.readStatus();
  await assert.rejects(controller.readStatus(),{code:'E_TOOL_CHANGED'},
    'old Host retirement alone is not v3 installation or native success');
});
