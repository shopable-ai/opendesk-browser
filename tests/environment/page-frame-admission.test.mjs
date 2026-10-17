import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewAdmission} from '../../src/platform/host/preview-admission.js';
import {canonical} from '../../src/platform/protocol.js';
import {pageInstallScope} from '../../src/scripting/user-scripts/page-install-authorization.js';

function fixture(change=()=>{}){
  const session='browser-session',executionKey='parent-execution',receiptNonce='parent-receipt';
  const pageRules={matches:['https://example.com/*'],excludeMatches:[],
    runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
  const grant={tag:'page-installed-v1',namespace:'tool:frame',programId:'script',revision:3,
    sourceHash:'a'.repeat(64),manifestHash:'b'.repeat(64),token:'c'.repeat(32),enabled:true,pageRules,
    authorization:{tag:'page-install-authorization-v1',status:'active',generation:2,approvedAt:1,
      installationId:'11111111-1111-4111-8111-111111111111',scope:pageInstallScope(pageRules)}};
  const installation={...structuredClone(grant),executionKey,receiptNonce};
  const execution={tag:'page-execution-v1',namespace:grant.namespace,programId:grant.programId,
    revision:3,sourceHash:grant.sourceHash,manifestHash:grant.manifestHash,executionKey,receiptNonce,
    installationToken:grant.token,installationId:grant.authorization.installationId,grantGeneration:2,
    browserSessionIncarnation:session,tabId:1,documentId:'parent-document',state:'dispatched'};
  const preview={nonce:'frame-request',tabId:1,documentId:execution.documentId,sourceHash:grant.sourceHash};
  const slot={tag:'slot',currentRunId:null,preview:{...preview,nonce:receiptNonce,executionKey,
    installedProgramId:grant.programId,manifestHash:grant.manifestHash,browserSessionIncarnation:session}};
  const rows={grant,installation,execution,preview,slot};change(rows);
  let db=structuredClone(new Map([
    ['frameworkKV',new Map([
      ['page-installed:'+canonical([grant.namespace,grant.programId]),grant],[executionKey,execution]
    ])],['runs',new Map([['@slot',slot]])]
  ]));
  const writes=[];
  const storage={async transaction(stores,mode,work){
    assert.equal(mode,'readwrite');
    const copy=structuredClone(db),table=name=>{assert.ok(stores.includes(name));return copy.get(name);};
    const result=await work({get:async(name,key)=>structuredClone(table(name).get(key)),
      put:async(name,value,key)=>{writes.push({name,key});table(name).set(key,structuredClone(value));}});
    db=copy;return result;
  }};
  const admission=createPreviewAdmission({storage,session,
    assertHost:()=>assert.fail('resource admission must not manufacture a Host identity'),
    currentHost:()=>assert.fail('resource admission must not manufacture a Host identity')});
  return {...rows,executionKey,admission,writes,
    reserve:()=>admission.reserveInstalled(preview,installation,{resource:true}),
    snapshot:()=>structuredClone(db),read:(name,key)=>structuredClone(db.get(name).get(key))};
}

test('a resource shares the awaiting parent main slot without changing any durable row',async()=>{
  const f=fixture(),before=f.snapshot();
  assert.deepEqual(await f.reserve(),{shared:true});
  assert.deepEqual(f.writes,[]);
  assert.deepEqual(f.snapshot(),before);
  await f.admission.release({nonce:f.preview.nonce});
  assert.deepEqual(f.snapshot(),before,'releasing the child request must keep the parent main slot');
});

test('a completed parent resource claims an idle slot with its request nonce and preserves the parent receipt',async()=>{
  const f=fixture(rows=>{rows.execution.state='completed';delete rows.slot.preview;});
  const parent=f.read('frameworkKV',f.executionKey);
  assert.deepEqual(await f.reserve(),{shared:false});
  assert.deepEqual(f.read('runs','@slot'),{tag:'slot',currentRunId:null,preview:{...f.preview,
    installedProgramId:f.grant.programId,manifestHash:f.grant.manifestHash,
    executionKey:f.executionKey,browserSessionIncarnation:'browser-session'}});
  assert.deepEqual(f.writes,[{name:'runs',key:'@slot'}]);
  assert.deepEqual(f.read('frameworkKV',f.executionKey),parent);
  const occupied=f.snapshot();
  await assert.rejects(f.admission.reserveInstalled({...f.preview,nonce:'next-frame'},f.installation,{resource:true}),{code:'E_OWNER'});
  assert.deepEqual(f.snapshot(),occupied,'another resource cannot share the first resource request nonce');
  await f.admission.release({nonce:f.preview.nonce});
  assert.deepEqual(f.read('runs','@slot'),{tag:'slot',currentRunId:null});
  assert.deepEqual(f.read('frameworkKV',f.executionKey),parent);
});

test('resource admission rejects stale parent identity and conflicting owners before any write',async()=>{
  for(const [label,change] of [
    ['wrong parent receipt',rows=>{rows.installation.receiptNonce='other-receipt';}],
    ['missing parent receipt',rows=>{delete rows.installation.receiptNonce;delete rows.execution.receiptNonce;}],
    ['parent not dispatched',rows=>{rows.execution.state='prepared';}],
    ['Controller owns the slot',rows=>{rows.slot.currentRunId='controller';}],
    ['another execution preview',rows=>{rows.slot.preview.executionKey='other-execution';}],
    ['another preview nonce',rows=>{rows.slot.preview.nonce='other-preview';}],
    ['stale grant generation',rows=>{rows.execution.grantGeneration++;}],
    ['different parent document',rows=>{rows.execution.documentId='other-document';}]
  ]){
    const f=fixture(change),before=f.snapshot();
    await assert.rejects(f.reserve(),{code:'E_OWNER'},label);
    assert.deepEqual(f.writes,[],label);
    assert.deepEqual(f.snapshot(),before,label);
  }
});
