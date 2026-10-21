import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowObservationGrantMatches,workflowObservationRecipientId} from '../../src/ui/workflow/observation.js';

const now=Date.UTC(2026,9,22);
const grantFor=row=>({provider:row.selected,sessionId:row.sessionId,
  origin:row.captured.origin,recipientId:row.recipientId,receiverPattern:row.receiverPattern,
  scope:'semantic-dom-summary-v1',approvedAt:now-1000,expiresAt:now-1000+30*60*1000});
const rowFor=(selected,recipientId,receiverPattern=null)=>({
  selected,sessionId:selected==='local_codex'?'native-session':'workflow-window',
  captured:{origin:'http://127.0.0.1:43111'},recipientId,receiverPattern
});

test('R23.17: same local session and site reuse existing approval, including legacy grant',()=>{
  const row=rowFor('local_codex','local_codex'),grant=grantFor(row);
  assert.equal(workflowObservationGrantMatches(grant,row,now),true);
  const {provider,recipientId,receiverPattern,...legacy}=grant;
  assert.equal(workflowObservationGrantMatches(legacy,row,now),true);
  assert.equal(workflowObservationGrantMatches(null,row,now),false);
  assert.equal(workflowObservationGrantMatches(grant,{...row,sessionId:'new-dialog'},now),false);
  assert.equal(workflowObservationGrantMatches(grant,{...row,captured:{origin:'https://other.example'}},now),false);
  assert.equal(workflowObservationGrantMatches(grant,row,grant.expiresAt),false);
  assert.equal(workflowObservationGrantMatches({...grant,scope:'full-dom'},row,now),false);
  assert.equal(workflowObservationGrantMatches({...grant,expiresAt:grant.expiresAt+60000},row,now),false);
});

test('R23.17: external recipient grant is exact, bounded and never leaks endpoint secrets',async()=>{
  const endpoint='https://api.example.test/v1/responses?token=NOT_FOR_STORAGE';
  const recipientId=await workflowObservationRecipientId({selected:'cloud_responses',endpoint,model:'m1'});
  const repeated=await workflowObservationRecipientId({selected:'cloud_responses',endpoint,model:'m1'});
  assert.equal(repeated,recipientId);
  assert.match(recipientId,/^cloud_responses:[0-9a-f]{64}$/);
  assert.doesNotMatch(recipientId,/NOT_FOR_STORAGE|api\.example\.test|\/v1\/responses/);
  const pattern='https://api.example.test/*',row=rowFor('cloud_responses',recipientId,pattern);
  const grant=grantFor(row);
  assert.equal(workflowObservationGrantMatches(grant,row,now),true);
  const otherModel=await workflowObservationRecipientId({selected:'cloud_responses',endpoint,model:'m2'});
  const otherPath=await workflowObservationRecipientId({selected:'cloud_responses',
    endpoint:'https://api.example.test/v2/responses?token=NOT_FOR_STORAGE',model:'m1'});
  const otherProvider=await workflowObservationRecipientId({selected:'custom_https',endpoint,model:'m1'});
  for(const mismatch of [
    {...row,recipientId:otherModel},{...row,recipientId:otherPath},
    {...row,recipientId:otherProvider,selected:'custom_https'},
    {...row,receiverPattern:'https://other.example/*'},
    {...row,sessionId:'other-window'},
    {...row,captured:{origin:'http://127.0.0.1:44444'}}
  ])assert.equal(workflowObservationGrantMatches(grant,mismatch,now),false);
  const {provider,recipientId:ignored,receiverPattern,...legacy}=grant;
  assert.equal(workflowObservationGrantMatches(legacy,row,now),false);
  assert.equal(JSON.stringify(grant).includes('NOT_FOR_STORAGE'),false);
});

test('R23.17: remote recipient identity denies invalid or changed HTTPS configuration',async()=>{
  assert.equal(await workflowObservationRecipientId({selected:'local_codex'}),'local_codex');
  for(const settings of [
    {selected:'cloud_responses',endpoint:'http://api.example.test/',model:'m1'},
    {selected:'custom_https',endpoint:'https://user:pass@api.example.test/',model:'m1'},
    {selected:'cloud_responses',endpoint:'https://api.example.test/#fragment',model:'m1'},
    {selected:'cloud_responses',endpoint:'https://api.example.test/',model:''},
    {selected:'unknown',endpoint:'https://api.example.test/',model:'m1'}
  ])await assert.rejects(workflowObservationRecipientId(settings),{code:'E_AI_CONFIG'});
});
