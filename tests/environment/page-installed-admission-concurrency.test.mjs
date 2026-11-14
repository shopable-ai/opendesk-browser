import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewAdmission,MAX_INSTALLED_PARENT_INVOCATIONS,installedPageReservation,
  assertInstalledPageDispatch} from '../../src/platform/host/preview-admission.js';
import {canonical} from '../../src/platform/protocol.js';
import {pageInstallScope} from '../../src/scripting/user-scripts/page-install-authorization.js';

// Transactional component evidence only: no browser or user source execution.
function fixture() {
  const session='browser-session';
  const pageRules={matches:['https://example.com/*'],excludeMatches:[],
    runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
  const grant={tag:'page-installed-v1',namespace:'tool:concurrency',programId:'script',revision:3,
    sourceHash:'a'.repeat(64),manifestHash:'b'.repeat(64),token:'c'.repeat(32),enabled:true,pageRules,
    authorization:{tag:'page-install-authorization-v1',status:'active',generation:2,approvedAt:1,
      installationId:'11111111-1111-4111-8111-111111111111',scope:pageInstallScope(pageRules)}};
  let db=new Map([
    ['frameworkKV',new Map([['page-installed:'+canonical([grant.namespace,grant.programId]),grant]])],
    ['runs',new Map([['@slot',{tag:'slot',currentRunId:null}]])],['commandJournal',new Map()]
  ]),queue=Promise.resolve(),pause;
  const storage={transaction(stores,mode,work) {
    const next=queue.then(async()=>{
      if(pause){const gate=pause;pause=undefined;gate.enter();await gate.wait;}
      const copy=structuredClone(db),table=name=>{
        assert.ok(stores.includes(name),'transaction must declare its stores');return copy.get(name);
      };
      const result=await work({get:async(name,key)=>structuredClone(table(name).get(key)),
        put:async(name,value,key)=>{
          assert.equal(mode,'readwrite');table(name).set(key,structuredClone(value));
        }});
      if(mode==='readwrite')db=copy;
      return result;
    });
    queue=next.catch(()=>{});return next;
  }};
  const admission=createPreviewAdmission({storage,session,
    assertHost:async()=>({registrationId:'host'}),currentHost:async()=>{}});
  const read=(name,key)=>structuredClone(db.get(name).get(key));
  async function document(id,{tabId=id,documentId='document-'+id,programId=grant.programId,revision=grant.revision}={}) {
    const currentGrant={...structuredClone(grant),programId,revision};
    await storage.transaction(['frameworkKV'],'readwrite',tx=>tx.put('frameworkKV',currentGrant,
      'page-installed:'+canonical([grant.namespace,programId])));
    const executionKey='page-execution:'+canonical([grant.namespace,grant.manifestHash,documentId,id]);
    const preview={nonce:'nonce-'+id,tabId,documentId,sourceHash:grant.sourceHash};
    const installation={...currentGrant,executionKey};
    await storage.transaction(['frameworkKV'],'readwrite',tx=>tx.put('frameworkKV',{
      tag:'page-execution-v1',namespace:grant.namespace,programId,revision,
      sourceHash:grant.sourceHash,manifestHash:grant.manifestHash,installationToken:grant.token,
      installationId:grant.authorization.installationId,grantGeneration:grant.authorization.generation,
      executionKey,receiptId:'receipt-'+id,browserSessionIncarnation:session,
      tabId,documentId,state:'prepared',createdAt:1
    },executionKey));
    return {preview,installation,executionKey};
  }
  const reserve=(row,options)=>admission.reserveInstalled(row.preview,row.installation,options);
  const settle=(nonce,options={})=>admission.settleInstalled({nonce,dispatched:true,confirmed:true,...options});
  const slot=()=>read('runs','@slot');
  const lookup=nonce=>installedPageReservation(slot(),nonce);
  const dispatch=row=>({nonce:row.preview.nonce,executionKey:row.executionKey,session,
    tabId:row.preview.tabId,documentId:row.preview.documentId});
  async function child(parent,nonce='child-nonce') {
    await storage.transaction(['frameworkKV'],'readwrite',async tx=>{
      const execution=await tx.get('frameworkKV',parent.executionKey);
      await tx.put('frameworkKV',{...execution,state:'dispatched'},parent.executionKey);
    });
    return {preview:{...parent.preview,nonce},installation:{...parent.installation,
      receiptNonce:parent.preview.nonce},executionKey:parent.executionKey};
  }
  return {admission,storage,document,reserve,settle,slot,lookup,dispatch,child,read,
    pauseNextTransaction(){
      let enter,release;
      const entered=new Promise(resolve=>{enter=resolve;}),wait=new Promise(resolve=>{release=resolve;});
      pause={enter,wait};return {entered,release};
    }};
}

test('simultaneous distinct documents get exactly two durable grants; a freed place is reusable',async()=>{
  assert.equal(MAX_INSTALLED_PARENT_INVOCATIONS,2);
  const f=fixture(),rows=await Promise.all([1,2,3].map(id=>f.document(id)));
  const outcomes=await Promise.allSettled(rows.map(row=>f.reserve(row)));
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,2);
  assert.equal(outcomes[2].status,'rejected');
  assert.equal(outcomes[2].reason.code,'E_OWNER');
  assert.equal(f.slot().preview.kind,'installed-documents-v1');
  assert.equal(f.slot().preview.entries.length,2);
  for(const row of rows.slice(0,2)){
    assert.ok(f.lookup(row.preview.nonce));
    assert.equal(f.read('frameworkKV',row.executionKey).receiptNonce,row.preview.nonce);
    assert.doesNotThrow(()=>assertInstalledPageDispatch(f.slot(),f.dispatch(row)));
  }
  assert.equal(f.read('frameworkKV',rows[2].executionKey).receiptNonce,undefined);
  await f.settle(rows[0].preview.nonce);
  await f.reserve(rows[2]);
  assert.ok(f.lookup(rows[1].preview.nonce));
  assert.ok(f.lookup(rows[2].preview.nonce));
});

test('same-program document reservations collide even with different executions and spare capacity',async()=>{
  const f=fixture(),a=await f.document(1),b=await f.document(2,{
    tabId:a.preview.tabId,documentId:a.preview.documentId});
  await f.reserve(a);
  await assert.rejects(f.reserve(b),{code:'E_OWNER'});
  assert.equal(f.slot().preview.entries.length,1);
});

test('manual previews and installed groups exclude each other in both directions',async()=>{
  const f=fixture(),a=await f.document(1),manual={nonce:'manual',tabId:9,documentId:'manual-document'};
  await f.admission.reserve(manual,{});
  await assert.rejects(f.reserve(a),{code:'E_OWNER'});
  await f.admission.release({nonce:manual.nonce});
  await f.reserve(a);
  await assert.rejects(f.admission.reserve(manual,{}),{code:'E_OWNER'});
  assert.ok(f.lookup(a.preview.nonce));
});

test('exclusive installed reservations exclude an existing group and block later documents',async()=>{
  const f=fixture(),a=await f.document(1),b=await f.document(2);
  await f.reserve(a);
  await assert.rejects(f.reserve(b,{exclusive:true}),{code:'E_OWNER'});
  await f.settle(a.preview.nonce);
  await f.reserve(b,{exclusive:true});
  await assert.rejects(f.reserve(a),{code:'E_OWNER'});
  assert.ok(f.lookup(b.preview.nonce));
});

test('a shared resource holds its parent place after main success until the child settles',async()=>{
  const f=fixture(),a=await f.document(1),b=await f.document(2),c=await f.document(3);
  await f.reserve(a);await f.reserve(b);
  const resource=await f.child(a);
  assert.equal((await f.reserve(resource,{resource:true})).shared,true);
  await f.settle(a.preview.nonce);
  assert.ok(f.lookup(resource.preview.nonce),'child remains reserved after main settlement');
  await assert.rejects(f.reserve(c),{code:'E_OWNER'});
  await f.settle(resource.preview.nonce);
  await f.reserve(c);
  assert.ok(f.lookup(b.preview.nonce));
  assert.ok(f.lookup(c.preview.nonce));
});

test('unknown settlement blocks dispatch synchronously before persistence, then globally on disk',async()=>{
  const f=fixture(),a=await f.document(1),b=await f.document(2),c=await f.document(3);
  await f.reserve(a);await f.reserve(b);
  const gate=f.pauseNextTransaction();
  const settling=f.settle(a.preview.nonce,{confirmed:false});
  try {
    assert.throws(()=>f.admission.assertDispatch(),'unknown must fence dispatch in the calling turn');
    await gate.entered;
    assert.doesNotThrow(()=>assertInstalledPageDispatch(f.slot(),f.dispatch(b)),
      'durable state has not yet received the unknown result');
  } finally {gate.release();await settling;}
  assert.ok(f.lookup(b.preview.nonce),'lookup is independent of dispatch validation');
  assert.throws(()=>assertInstalledPageDispatch(f.slot(),f.dispatch(b)));
  await assert.rejects(f.reserve(c));
});

test('dispatch requires the exact reservation tuple and checks unknown siblings',async()=>{
  const f=fixture(),a=await f.document(1),b=await f.document(2);
  await f.reserve(a);await f.reserve(b);
  for(const [field,value] of [['nonce','other'],['executionKey','other'],['session','old'],
    ['tabId',99],['documentId','other']]){
    assert.throws(()=>assertInstalledPageDispatch(f.slot(),{...f.dispatch(a),[field]:value}),field);
  }
  await f.settle(b.preview.nonce,{confirmed:false});
  assert.ok(f.lookup(a.preview.nonce));
  assert.throws(()=>assertInstalledPageDispatch(f.slot(),f.dispatch(a)));
});
test('trusted retirement fences a late Native rejection without orphaning the unknown latch',async()=>{
  const f=fixture(),a=await f.document(1),b=await f.document(2);
  await f.reserve(a);
  await f.admission.release({removedTabId:a.preview.tabId});
  f.admission.blockInstalled(a.preview.nonce);
  await f.settle(a.preview.nonce,{confirmed:false});
  assert.doesNotThrow(()=>f.admission.assertDispatch());
  await f.reserve(b);
  assert.doesNotThrow(()=>assertInstalledPageDispatch(f.slot(),f.dispatch(b)));
});
test('failed unknown persistence keeps the synchronous dispatch fence until trusted release',async()=>{
  const f=fixture(),a=await f.document(1),b=await f.document(2);
  await f.reserve(a);await f.reserve(b);
  const transaction=f.storage.transaction;
  f.storage.transaction=()=>Promise.reject(new Error('durable write failed'));
  await assert.rejects(f.settle(a.preview.nonce,{confirmed:false}),/durable write failed/);
  assert.throws(()=>f.admission.assertDispatch());
  f.storage.transaction=transaction;
  await f.admission.release({nonce:a.preview.nonce});
  assert.doesNotThrow(()=>f.admission.assertDispatch());
  assert.ok(f.lookup(b.preview.nonce));
});

test('a known settled main releases after recovery proves its last child absent',async()=>{
  const f=fixture(),a=await f.document(1);
  await f.reserve(a);const child=await f.child(a);await f.reserve(child,{resource:true});
  await f.settle(a.preview.nonce);
  await f.admission.recoverInstalled(async row=>row.resourceNonce===child.preview.nonce);
  assert.ok(!f.slot().preview);
  assert.doesNotThrow(()=>f.admission.assertDispatch());
});

test('stale settlement and trusted release never delete a sibling or a replacement nonce',async()=>{
  const f=fixture(),a=await f.document(1),b=await f.document(2),replacement=await f.document(3,{
    tabId:a.preview.tabId,documentId:a.preview.documentId});
  await f.reserve(a);await f.reserve(b);
  await f.admission.release({nonce:'stale'});
  await f.admission.release({removedTabId:99});
  assert.equal(f.slot().preview.entries.length,2);
  await f.settle(a.preview.nonce);
  await f.reserve(replacement);
  await Promise.all([f.settle(a.preview.nonce),f.admission.release({nonce:a.preview.nonce})]);
  assert.ok(f.lookup(replacement.preview.nonce));
  assert.ok(f.lookup(b.preview.nonce));
  await f.admission.release({removedTabId:replacement.preview.tabId});
  assert.ok(!f.lookup(replacement.preview.nonce));
  assert.ok(f.lookup(b.preview.nonce));
});

test('installed resource retirement binds parent execution and cannot release a main or sibling nonce',async()=>{
  const f=fixture(),a=await f.document(1),b=await f.document(2);
  await f.reserve(a);await f.reserve(b);
  const child=await f.child(a);await f.reserve(child,{resource:true});
  const installedResource={namespace:a.installation.namespace,executionKey:a.executionKey,
    receiptNonce:a.preview.nonce,tabId:a.preview.tabId,documentId:a.preview.documentId};
  for(const nonce of [a.preview.nonce,b.preview.nonce]){
    const before=f.slot();await f.admission.release({nonce,installedResource});assert.deepEqual(f.slot(),before);
  }
  for(const field of ['namespace','executionKey','receiptNonce','tabId','documentId']){
    const before=f.slot();await f.admission.release({nonce:child.preview.nonce,
      installedResource:{...installedResource,[field]:field==='tabId'?999:'wrong'}});
    assert.deepEqual(f.slot(),before,field+' must bind the retirement');
  }
  const current=f.slot(),stale=structuredClone(current);
  stale.preview.entries.find(row=>row.nonce===a.preview.nonce).browserSessionIncarnation='older-session';
  await f.storage.transaction(['runs'],'readwrite',tx=>tx.put('runs',stale,'@slot'));
  await f.admission.release({nonce:child.preview.nonce,installedResource});
  assert.deepEqual(f.slot(),stale,'retirement must not release a reservation from another browser session');
  await f.storage.transaction(['runs'],'readwrite',tx=>tx.put('runs',current,'@slot'));
  await f.admission.release({nonce:child.preview.nonce,installedResource});
  assert.ok(f.lookup(a.preview.nonce));assert.ok(f.lookup(b.preview.nonce));
  assert.equal(f.lookup(a.preview.nonce).children.length,0);
  await f.settle(a.preview.nonce);
  const late=await f.child(a,'late-resource');
  await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
    const execution=await tx.get('frameworkKV',a.executionKey);
    await tx.put('frameworkKV',{...execution,state:'completed'},a.executionKey);
  });
  await f.reserve(late,{resource:true});
  await f.admission.release({nonce:late.preview.nonce,installedResource});
  assert.ok(!f.lookup(late.preview.nonce));assert.ok(f.lookup(b.preview.nonce));
  // Retirement raced ahead of Native's late rejection: no global fence revives.
  await f.settle(late.preview.nonce,{confirmed:false});
  assert.doesNotThrow(()=>f.admission.assertDispatch());
});

test('legacy installed reservations remain readable and releasable but cannot admit another document',async()=>{
  const f=fixture(),a=await f.document(1),b=await f.document(2);
  const legacy={...a.preview,executionKey:a.executionKey,installedProgramId:a.installation.programId,
    manifestHash:a.installation.manifestHash,browserSessionIncarnation:'browser-session'};
  await f.storage.transaction(['runs'],'readwrite',tx=>tx.put('runs',{
    tag:'slot',currentRunId:null,preview:legacy},'@slot'));
  assert.deepEqual(f.lookup(a.preview.nonce),legacy);
  await assert.rejects(f.reserve(b),{code:'E_OWNER'});
  await f.admission.release({nonce:a.preview.nonce});
  assert.ok(!f.slot().preview);
});

test('completed-parent resource recovery fences dispatch and releases only proven absent documents',async()=>{
  const f=fixture(),a=await f.document(1),b=await f.document(2);
  await f.reserve(a);await f.reserve(b);
  await f.settle(a.preview.nonce);
  const resource=await f.child(a,'resource-only');
  await f.storage.transaction(['frameworkKV'],'readwrite',async tx=>{
    const execution=await tx.get('frameworkKV',a.executionKey);
    await tx.put('frameworkKV',{...execution,state:'completed'},a.executionKey);
  });
  assert.equal((await f.reserve(resource,{resource:true})).shared,false);
  let observations=0;
  await f.admission.recoverInstalled(async context=>{
    observations++;
    assert.throws(()=>f.admission.assertDispatch(),'recovery fences dispatch before observation');
    assert.throws(()=>assertInstalledPageDispatch(f.slot(),f.dispatch(b)));
    return context.tabId===resource.preview.tabId&&context.documentId===resource.preview.documentId;
  });
  assert.ok(observations>0);
  assert.ok(!f.lookup(resource.preview.nonce));
  assert.ok(f.lookup(b.preview.nonce),'a still-present sibling must survive recovery');
  assert.throws(()=>assertInstalledPageDispatch(f.slot(),f.dispatch(b)),
    'presence does not prove that previously dispatched code completed');
});


test('two owners on one document share the bound and settle only their exact parent and children',async()=>{
  const f=fixture(),a=await f.document(1),b=await f.document(2,{
    tabId:a.preview.tabId,documentId:a.preview.documentId,programId:'other'}),c=await f.document(3);
  await f.reserve(a);await f.reserve(b);
  const ca=await f.child(a,'child-a'),cb=await f.child(b,'child-b');
  assert.equal((await f.reserve(ca,{resource:true})).shared,true);
  assert.equal((await f.reserve(cb,{resource:true})).shared,true);
  assert.deepEqual(f.lookup(ca.preview.nonce).children,[{nonce:'child-a',unknown:false}]);
  assert.deepEqual(f.lookup(cb.preview.nonce).children,[{nonce:'child-b',unknown:false}]);
  let done=false;
  const waiting=f.admission.waitInstalledReservation({...a.preview,executionKey:a.executionKey,
    receiptNonce:a.preview.nonce}).then(()=>{done=true;});
  await f.settle(a.preview.nonce);await f.settle(b.preview.nonce);
  await f.settle(ca.preview.nonce);await waiting;
  assert.equal(done,true,'the other parent child must not hold this parent lease');
  assert.ok(f.lookup(cb.preview.nonce));
  await f.reserve(c);assert.equal(f.slot().preview.entries.length,2);
  await f.settle(cb.preview.nonce);
  assert.ok(f.lookup(c.preview.nonce));
});

test('same owner and document cannot overlap a new revision',async()=>{
  const f=fixture(),a=await f.document(1);await f.reserve(a);
  const b=await f.document(2,{tabId:a.preview.tabId,documentId:a.preview.documentId,revision:4});
  await assert.rejects(f.reserve(b),{code:'E_OWNER'});
  assert.equal(f.lookup(a.preview.nonce).nonce,a.preview.nonce);
});


test('same-document parents retain independent sixteen-child budgets and exact parent nonce checks',async()=>{
  const f=fixture(),a=await f.document(1),b=await f.document(2,{
    tabId:a.preview.tabId,documentId:a.preview.documentId,programId:'other'});
  await f.reserve(a);await f.reserve(b);
  const ca=await f.child(a,'a-0'),cb=await f.child(b,'b-0');
  await assert.rejects(f.reserve({...ca,installation:{...ca.installation,receiptNonce:b.preview.nonce}},{resource:true}),{code:'E_OWNER'});
  assert.equal(f.lookup(a.preview.nonce).children.length,0);
  assert.equal(f.lookup(b.preview.nonce).children.length,0);
  for(let n=0;n<16;n++)for(const [child,prefix] of [[ca,'a'],[cb,'b']])
    assert.equal((await f.reserve({...child,preview:{...child.preview,nonce:prefix+'-'+n}},{resource:true})).shared,true);
  for(const child of [ca,cb])await assert.rejects(f.reserve({
    ...child,preview:{...child.preview,nonce:child.preview.nonce+'-overflow'}},{resource:true}),{code:'E_OWNER'});
  for(const parent of [a,b])assert.equal(f.lookup(parent.preview.nonce).children.length,16);
  assert.equal(f.slot().preview.entries.length,2);
});
