import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createWorkspaceStore,projectWorkspaceState} from '../../src/native-agent/workspace-store.js';
import {sameWorkspaceAuthority,isDirtyWorkspaceDraft,validateWorkspaceRead,createWorkspaceDraft,
  reconcileWorkspaceRead,verifyWorkspaceWriteReceipt,verifyWorkspaceWriteReadBack,workspaceRecordKey}
  from '../../src/native-agent/workspace-domain.js';
const sha=text=>createHash('sha256').update(text).digest('hex');
const ws='workspace-00000000-0000-4000-8000-000000000001';
const ws2='workspace-00000000-0000-4000-8000-000000000002';
const disk=(workspaceId=ws,path='README.md',content='original')=>({workspaceId,path,content,sha256:sha(content),bytes:Buffer.byteLength(content),authority:{workspaceId,sourceId:'source-aaa',sessionId:'secret-session',leaseEpoch:'secret-lease',access:'read-write'}});

test('authorization identity includes session, grant and source, never just a matching display name',()=>{
  const a=disk().authority;
  assert.ok(sameWorkspaceAuthority(a,{...a}));
  for(const change of [{workspaceId:ws2},{sourceId:'source-bbb'},{sessionId:'old'},{leaseEpoch:'old'},{access:'read-only'}])
    assert.equal(sameWorkspaceAuthority(a,{...a,...change}),false);
  assert.equal(sameWorkspaceAuthority(null,null),false);
  assert.notEqual(workspaceRecordKey(ws,'README.md'),workspaceRecordKey(ws2,'README.md'));
});

test('read validation rejects stale, over-limit, malformed and conflicting Native responses',()=>{
  const a=disk();assert.equal(validateWorkspaceRead(a,ws,'README.md'),a);
  const invalid=[{...a,workspaceId:ws2},{...a,path:'secret.md'},{...a,bytes:1},
    {...a,sha256:'f'}, {...a,bytes:-1},{...a,content:'a'.repeat(32769),bytes:32769}];
  for(const bad of invalid)assert.throws(()=>validateWorkspaceRead(bad,ws,'README.md'),{code:'E_FILES_PROTOCOL'});
});

test('disk reread never overwrites a modified draft, but supports explicit conflict recovery',()=>{
  const base=createWorkspaceDraft(disk()),draft={...base,content:'unsaved content'};
  assert.ok(isDirtyWorkspaceDraft(draft));
  const matching=reconcileWorkspaceRead(draft,disk());
  assert.equal(matching.kind,'unchanged');assert.equal(matching.record.content,'unsaved content');
  assert.equal(matching.record.remote,null);
  const external=reconcileWorkspaceRead(draft,disk(ws,'README.md','new disk value'));
  assert.equal(external.kind,'conflict');assert.equal(external.record.content,'unsaved content');
  assert.equal(external.record.remote.content,'new disk value');
  assert.equal(reconcileWorkspaceRead(base,disk(ws,'README.md','new disk value')).kind,'accepted');
  assert.throws(()=>reconcileWorkspaceRead(draft,disk(ws2)),{code:'E_FILES_SESSION'});
});

test('write ACK and post-write readback are separate proof steps',()=>{
  const payload='saved',receipt={saved:true,workspaceId:ws,path:'README.md',sha256:sha(payload)};
  assert.equal(verifyWorkspaceWriteReceipt(receipt,{workspaceId:ws,path:'README.md',sha256:sha(payload)}),true);
  assert.equal(verifyWorkspaceWriteReadBack(disk(ws,'README.md',payload),{workspaceId:ws,path:'README.md',content:payload,sha256:sha(payload)}),true);
  assert.equal(verifyWorkspaceWriteReadBack(disk(ws,'README.md','external'),{workspaceId:ws,path:'README.md',content:payload,sha256:sha(payload)}),false);
  for(const bad of [{...receipt,sha256:sha('wrong')},{...receipt,saved:false},null])
    assert.throws(()=>verifyWorkspaceWriteReceipt(bad,{workspaceId:ws,path:'README.md',sha256:sha(payload)}),{outcome:'OUTCOME_UNKNOWN'});
  assert.throws(()=>verifyWorkspaceWriteReceipt(receipt,{workspaceId:ws,path:'README.md',sha256:sha(payload),create:true}),{outcome:'OUTCOME_UNKNOWN'});
});

test('store supplies stable immutable snapshots and unsubscribes safely',()=>{
  const store=createWorkspaceStore(),versions=[];
  assert.equal(store.getSnapshot(),store.getSnapshot());
  const stop=store.subscribe(()=>versions.push(store.getSnapshot().revision));
  const tree=new Map([['',{expanded:true,entries:[{kind:'file',path:'README.md',name:'README.md'}]}]]);
  const draft={...createWorkspaceDraft(disk()),content:'draft'};
  const state=projectWorkspaceState({connected:true,busy:false,workspaceId:ws,
    rows:[{workspaceId:ws,name:'Authorized',access:'read-write',sourceId:'source-aaa'}],
    current:draft,treeFolders:tree,access:'read-write'});
  const published=store.publish(state);
  assert.equal(published.file.content,'draft');assert.equal(published.file.dirty,true);
  assert.equal(published.writable,true);assert.equal(published.tree[0].path,'README.md');
  assert.equal(JSON.stringify(published).includes('secret-session'),false);
  assert.equal(JSON.stringify(published).includes('secret-lease'),false);
  assert.ok(Object.isFrozen(published.file));
  assert.deepEqual(versions,[1]);stop();store.publish(state);assert.deepEqual(versions,[1]);
  store.dispose();const previous=store.getSnapshot();store.publish({});assert.equal(store.getSnapshot(),previous);
});
