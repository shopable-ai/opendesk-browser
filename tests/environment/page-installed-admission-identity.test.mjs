import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewAdmission} from '../../src/platform/host/preview-admission.js';
import {canonical} from '../../src/platform/protocol.js';
import {pageInstallScope} from '../../src/scripting/user-scripts/page-install-authorization.js';

// Isolated transactional component fixture, using the installed service's row
// shapes and keys. This does not execute user source or provide Chrome evidence.
function fixture(change=()=>{}) {
  const session='browser-session';
  const pageRules={matches:['https://example.com/*'],excludeMatches:[],
    runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
  const grant={tag:'page-installed-v1',namespace:'tool:test',programId:'script',revision:3,
    sourceHash:'a'.repeat(64),manifestHash:'b'.repeat(64),token:'c'.repeat(32),enabled:true,pageRules,
    authorization:{tag:'page-install-authorization-v1',
      installationId:'11111111-1111-4111-8111-111111111111',generation:2,status:'active',
      scope:pageInstallScope(pageRules),approvedAt:1}};
  const installKey='page-installed:'+canonical([grant.namespace,grant.programId]);
  const executionKey='page-execution:'+canonical([grant.namespace,grant.manifestHash,'web-document']);
  const installation={...structuredClone(grant),executionKey};
  const execution={tag:'page-execution-v1',namespace:grant.namespace,programId:grant.programId,
    revision:grant.revision,sourceHash:grant.sourceHash,manifestHash:grant.manifestHash,
    installationToken:grant.token,installationId:grant.authorization.installationId,
    grantGeneration:grant.authorization.generation,executionKey,receiptId:'receipt',
    browserSessionIncarnation:session,tabId:1,documentId:'web-document',state:'prepared',createdAt:1};
  const preview={nonce:'receipt-nonce',tabId:1,documentId:'web-document',sourceHash:grant.sourceHash};
  const records={grant,installation,execution,preview,slot:{tag:'slot',currentRunId:null}};
  change(records);
  let db=new Map([
    ['frameworkKV',new Map([[installKey,records.grant],[executionKey,records.execution]])],
    ['runs',new Map([['@slot',records.slot]])],['commandJournal',new Map()]
  ]),queue=Promise.resolve();
  db=structuredClone(db);
  const writes=[],hostChecks=[];
  const storage={transaction(stores,mode,work){
    const next=queue.then(async()=>{
      const copy=structuredClone(db),table=name=>{
        assert.ok(stores.includes(name),'transaction must declare its stores');return copy.get(name);
      };
      const tx={get:async(name,key)=>structuredClone(table(name).get(key)),
        put:async(name,value,key)=>{
          assert.equal(mode,'readwrite');writes.push({name,key});table(name).set(key,structuredClone(value));
        }};
      const result=await work(tx);
      if(mode==='readwrite')db=copy;
      return result;
    });
    queue=next.catch(()=>{});return next;
  }};
  const admission=createPreviewAdmission({storage,session,
    assertHost:async sender=>{hostChecks.push(sender);return {registrationId:'host'};},
    currentHost:async(_tx,host,sender)=>hostChecks.push({host,sender})});
  return {admission,installation,preview,writes,hostChecks,
    snapshot:()=>structuredClone(db),read:(name,key)=>structuredClone(db.get(name).get(key)),executionKey};
}

async function rejectedWithoutWrites(change,code) {
  const f=fixture(change),before=f.snapshot();
  await assert.rejects(()=>f.admission.reserveInstalled(f.preview,f.installation),error=>error.code===code);
  assert.deepEqual(f.writes,[],'rejection must precede every put');
  assert.deepEqual(f.snapshot(),before,'rejection must preserve the slot and execution receipt');
}

test('current complete installation and prepared execution reserve the shared slot',async()=>{
  const f=fixture();
  await f.admission.reserveInstalled(f.preview,f.installation);
  assert.deepEqual(f.read('runs','@slot'),{tag:'slot',currentRunId:null,preview:{...f.preview,
    installedProgramId:f.installation.programId,manifestHash:f.installation.manifestHash,
    executionKey:f.executionKey,browserSessionIncarnation:'browser-session'}});
  const execution=f.read('frameworkKV',f.executionKey);
  assert.equal(execution.receiptNonce,f.preview.nonce);
  assert.equal(execution.state,'prepared');
  assert.equal(f.writes.length,2);
  assert.deepEqual(f.hostChecks,[],'installed admission must not manufacture a Host identity');
});

for(const owner of ['grant','installation']) {
  test(`${owner} without installation authorization is not admitted`,()=>
    rejectedWithoutWrites(rows=>{delete rows[owner].authorization;},'E_PAGE_AUTHORIZATION'));
  for(const status of ['disabled','suspended','needs-confirmation']) {
    test(`${owner} authorization ${status} is rejected even with enabled true and the same token`,()=>
      rejectedWithoutWrites(rows=>{rows[owner].authorization.status=status;},'E_PERMISSION'));
  }
  for(const [field,value] of [
    ['tag','legacy-authorization'],['installationId','invalid'],['generation',0],['approvedAt',null]
  ]) {
    test(`${owner} malformed authorization ${field} is rejected`,()=>
      rejectedWithoutWrites(rows=>{rows[owner].authorization[field]=value;},'E_PAGE_AUTHORIZATION'));
  }
  test(`${owner} authorization must describe its actual Page scope`,()=>
    rejectedWithoutWrites(rows=>{rows[owner].authorization.scope.networkOrigins=['https://other.example'];},
      'E_PAGE_AUTHORIZATION'));
  for(const [field,value] of [
    ['installationId','22222222-2222-4222-8222-222222222222'],['generation',3]
  ]) {
    test(`${owner} changed authorization ${field} with an unchanged token is rejected`,()=>
      rejectedWithoutWrites(rows=>{rows[owner].authorization[field]=value;},'E_PERMISSION'));
  }
}

for(const owner of ['grant','installation']) {
  for(const [field,value] of [
    ['namespace','tool:other'],['programId','other-script'],['revision',4],
    ['sourceHash','d'.repeat(64)],['manifestHash','e'.repeat(64)],['token','f'.repeat(32)]
  ]) {
    test(`${owner} ${field} must match the captured installation and current grant`,()=>
      rejectedWithoutWrites(rows=>{rows[owner][field]=value;},'E_PERMISSION'));
  }
}

for(const [field,value] of [
  ['namespace','tool:other'],['programId','other-script'],['revision',4],['executionKey','other-execution'],
  ['installationId','22222222-2222-4222-8222-222222222222'],['grantGeneration',3],
  ['sourceHash','d'.repeat(64)],['manifestHash','e'.repeat(64)]
]) {
  test(`a forged execution ${field} is rejected despite an identical installation token`,()=>
    rejectedWithoutWrites(rows=>{rows.execution[field]=value;},'E_OWNER'));
}
for(const field of ['namespace','programId','revision','executionKey','installationId','grantGeneration']) {
  test(`legacy execution without ${field} is rejected`,()=>
    rejectedWithoutWrites(rows=>{delete rows.execution[field];},'E_OWNER'));
}

for(const [field,value] of [
  ['tag','other'],['state','dispatched'],['browserSessionIncarnation','old-session'],
  ['installationToken','other-token'],['documentId','other-document'],['tabId',2]
]) {
  test(`existing execution ${field} guard still rejects without writes`,()=>
    rejectedWithoutWrites(rows=>{rows.execution[field]=value;},'E_OWNER'));
}
test('disabled durable installation is rejected',()=>
  rejectedWithoutWrites(rows=>{rows.grant.enabled=false;},'E_PERMISSION'));
test('missing durable installation is rejected',()=>
  rejectedWithoutWrites(rows=>{rows.grant=undefined;},'E_PERMISSION'));
test('missing prepared execution is rejected',()=>
  rejectedWithoutWrites(rows=>{rows.execution=undefined;},'E_OWNER'));
test('preview source must match the authorized source',()=>
  rejectedWithoutWrites(rows=>{rows.preview.sourceHash='d'.repeat(64);},'E_PERMISSION'));
test('Controller ownership cannot be displaced by an installed execution',()=>
  rejectedWithoutWrites(rows=>{rows.slot.currentRunId='controller';},'E_OWNER'));
test('another preview cannot be displaced by an installed execution',()=>
  rejectedWithoutWrites(rows=>{rows.slot.preview={nonce:'other',tabId:2};},'E_OWNER'));

test('release ignores mismatched nonce and tab, and releases only the matching installed slot',async()=>{
  const f=fixture();await f.admission.reserveInstalled(f.preview,f.installation);
  const before=f.snapshot(),writes=f.writes.length;
  await f.admission.release({nonce:'other'});
  await f.admission.release({removedTabId:2});
  assert.deepEqual(f.snapshot(),before);assert.equal(f.writes.length,writes);
  await f.admission.release({nonce:f.preview.nonce});
  assert.deepEqual(f.read('runs','@slot'),{tag:'slot',currentRunId:null});
  assert.deepEqual(f.read('frameworkKV',f.executionKey),before.get('frameworkKV').get(f.executionKey));
});
test('ordinary Host reserve and tab removal still use the same shared slot',async()=>{
  const f=fixture(),sender={documentId:'host-document'};
  await f.admission.reserve(f.preview,sender);
  assert.deepEqual(f.hostChecks,[sender,{host:{registrationId:'host'},sender}]);
  assert.deepEqual(f.read('runs','@slot').preview,{...f.preview,registrationId:'host'});
  await f.admission.release({removedTabId:f.preview.tabId});
  assert.deepEqual(f.read('runs','@slot'),{tag:'slot',currentRunId:null});
});
