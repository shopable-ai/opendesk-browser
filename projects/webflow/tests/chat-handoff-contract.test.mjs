import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAT_HANDOFF_PROTOCOL, createChatHandoffKey, parseChatHandoff} from '../src/chat-handoff-contract.js';
const NOW=1800000000000;
const COPY=value=>JSON.parse(JSON.stringify(value));
const BASE={
  protocol:CHAT_HANDOFF_PROTOCOL,workflowId:'workflow-001',stepId:'step-0001',
  handoffId:'handoff-0001',attemptId:'attempt-0001',idempotencyKey:'',
  source:{adapter:'chatgpt-web',profileId:'profile-001',conversationId:'conversation-001',turnId:'turn-001'},
  target:{adapter:'chatgpt-web',profileId:'profile-001',mode:'create-new',conversationId:null},
  returnTo:{adapter:'chatgpt-web',profileId:'profile-001',conversationId:'conversation-001',turnId:'turn-001'},
  objective:'Review issue and report uncertainties.',summary:'Only non-sensitive data.',
  inputRefs:[{kind:'github-issue',id:'issue-public-001',sha256:'a'.repeat(64)}],
  expectedResult:{kind:'assistant-reply',mustIncludeEvidence:true},authorizationRef:'grantref-001',
  stopConditions:['Stop if credentials are requested.'],
  limits:{maxSteps:2,maxHandoffs:1,maxNewConversations:1,deadlineAt:NOW+5000},
  createdAt:NOW-1000,expiresAt:NOW+2000
};
BASE.idempotencyKey=JSON.stringify([BASE.protocol,BASE.workflowId,BASE.stepId,BASE.handoffId]);
const options=(v=BASE)=>({now:NOW,expectedSource:COPY(v.source),expectedTarget:COPY(v.target),
  expectedInputRefs:COPY(v.inputRefs),expectedAuthorizationRef:v.authorizationRef});
const parsed=(v=BASE,o=options())=>parseChatHandoff(JSON.stringify(v),o);
const fails=(v,code='E_CHAT_HANDOFF_SCHEMA',o=options())=>assert.throws(()=>parsed(v,o),e=>e.code===code);
const edit=fn=>{const v=COPY(BASE);fn(v);return v;};
test('valid data remains deeply frozen; only data parsed',()=>{
  const result=parsed();assert.deepEqual(result,BASE);
  const visit=v=>{if(v&&typeof v==='object'){assert.ok(Object.isFrozen(v));Object.values(v).forEach(visit);}};
  visit(result);
  assert.throws(()=>{result.target.mode='existing';},TypeError);
  assert.throws(()=>result.inputRefs.push({}),TypeError);
});
test('key is stable, scheme is distinct from v1',()=>{
  const key=createChatHandoffKey({protocol:BASE.protocol,workflowId:BASE.workflowId,
    stepId:BASE.stepId,handoffId:BASE.handoffId});
  assert.equal(key,BASE.idempotencyKey);
  assert.throws(()=>createChatHandoffKey({protocol:'opendesk.workflow.handoff.v1',workflowId:BASE.workflowId,
    stepId:BASE.stepId,handoffId:BASE.handoffId}),e=>e.code==='E_CHAT_HANDOFF_SCHEMA');
  fails(edit(v=>v.protocol='opendesk.workflow.handoff.v1'));
  fails(edit(v=>v.idempotencyKey='forged'));
});
test('closed schema rejects untrusted grants and extra fields at all levels',()=>{
  for(const path of ['source','target','returnTo','limits','expectedResult','inputRefs']){
    fails(edit(v=>{const t=path==='inputRefs'?v.inputRefs[0]:v[path];t.granted=true;}));
  }
  fails(edit(v=>v.trustedByModel=true));
  fails(edit(v=>delete v.authorizationRef));
  // A syntactically valid reference is only data; parsing does not grant permission.
  const changed=edit(v=>v.authorizationRef='untrusted');
  fails(changed,'E_CHAT_HANDOFF_SCOPE');
  assert.equal(parsed(changed,options(changed)).authorizationRef,'untrusted');
  fails(edit(v=>v.expectedResult.mustIncludeEvidence=false));
});
test('source, destination, and return target cannot be swapped',()=>{
  fails(edit(v=>v.source.conversationId='other'), 'E_CHAT_HANDOFF_SCOPE');
  fails(edit(v=>v.returnTo.turnId='other'), 'E_CHAT_HANDOFF_SCOPE');
  fails(edit(v=>v.target.profileId='other'), 'E_CHAT_HANDOFF_SCOPE');
  fails(edit(v=>v.target.conversationId='other'), 'E_CHAT_HANDOFF_SCHEMA');
  fails(edit(v=>v.target.mode='existing'), 'E_CHAT_HANDOFF_SCHEMA');
  fails(edit(v=>v.target.adapter='codex-local'));
  fails(BASE,'E_CHAT_HANDOFF_SCOPE',{...options(),expectedSource:{...BASE.source,conversationId:'wrong'}});
  fails(BASE,'E_CHAT_HANDOFF_SCOPE',{...options(),expectedTarget:{...BASE.target,profileId:'other'}});
  assert.throws(()=>parseChatHandoff(JSON.stringify(BASE)),e=>e.code==='E_CHAT_HANDOFF_SCOPE');
});
test('time, budgets, text and evidence are bounded',()=>{
  fails(edit(v=>v.expiresAt=NOW),'E_CHAT_HANDOFF_EXPIRED');
  fails(edit(v=>v.createdAt=NOW+1),'E_CHAT_HANDOFF_EXPIRED');
  fails(edit(v=>v.limits.deadlineAt=NOW+1));
  fails(edit(v=>v.limits.maxSteps=100));
  fails(edit(v=>v.limits.maxNewConversations=2));
  fails(edit(v=>v.limits.maxHandoffs=2));
  fails(edit(v=>v.stopConditions=[]));
  fails(edit(v=>v.stopConditions.push(v.stopConditions[0])));
  fails(edit(v=>v.objective='x'.repeat(4097)));
  fails(edit(v=>v.inputRefs[0].sha256='B'.repeat(64)));
  fails(edit(v=>v.inputRefs.push(v.inputRefs[0])));
  const valid=edit(v=>{v.summary='界'.repeat(100);v.inputRefs[0].kind='conversation-turn';});
  assert.deepEqual(parsed(valid,options(valid)),valid);
});
test('unexpected inputs are never interpreted as an action',()=>{
  for(const x of [null,undefined,{},'','{}','[]','{','null'])
    assert.throws(()=>parseChatHandoff(x,options()),e=>e.code==='E_CHAT_HANDOFF_SCHEMA');
  const extra=JSON.stringify(BASE)+' '.repeat(32769);
  assert.throws(()=>parseChatHandoff(extra,options()),e=>e.code==='E_CHAT_HANDOFF_SCHEMA');
  fails(edit(v=>v.inputRefs[0].kind='execute-shell'));
  fails(edit(v=>v.expectedResult.kind='git-write'));
});
test('reordered keys do not change the identity or data',()=>{
  const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'
    ?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reorder(x)])):v;
  const input=reorder(BASE);
  assert.deepEqual(parsed(input),input);
  assert.deepEqual(parsed(input,reorder(options())),input);
});
test('identity and scope fields reject malformed or missing values',()=>{
  for(const path of ['workflowId','stepId','handoffId','attemptId','authorizationRef']){
    for(const value of ['',null,8,'short','x'.repeat(129),'a/slash','é-invalid']){
      const v=edit(x=>x[path]=value);
      if(['workflowId','stepId','handoffId'].includes(path))v.idempotencyKey=JSON.stringify([v.protocol,v.workflowId,v.stepId,v.handoffId]);
      fails(v);
    }
  }
  for(const field of ['profileId','conversationId','turnId']){
    for(const value of ['',' untrimmed','line\nfeed',9,'x'.repeat(257)])
      fails(edit(v=>v.source[field]=value));
  }
  for(const field of ['source','target','returnTo','limits','expectedResult']){
    fails(edit(v=>v[field]=null));
    fails(edit(v=>v[field]=[]));
  }
  fails(BASE,'E_CHAT_HANDOFF_SCOPE',{...options(),unexpected:true});
  fails(BASE,'E_CHAT_HANDOFF_SCOPE',{...options(),expectedInputRefs:[{...BASE.inputRefs[0],id:'other'}]});
  fails(BASE,'E_CHAT_HANDOFF_SCOPE',{...options(),expectedAuthorizationRef:'other-grant'});
});
test('limits and temporal boundaries reject invalid values',()=>{
  for(const field of ['createdAt','expiresAt'])for(const v of [null,0,-1,'1800000000000',1.5,Number.MAX_SAFE_INTEGER+1])
    fails(edit(d=>d[field]=v));
  for(const v of [null,0,-1,1.5,'1800000000000'])
    fails(BASE,'E_CHAT_HANDOFF_SCHEMA',{...options(),now:v});
  const atBoundary=edit(v=>{v.createdAt=NOW;v.expiresAt=NOW+1;v.limits.deadlineAt=NOW+1;});
  assert.deepEqual(parsed(atBoundary),atBoundary);
  fails(edit(v=>v.expiresAt=v.limits.deadlineAt+1));
  fails(edit(v=>v.limits.maxSteps='2'));
});
test('reference count, duplicate ids and UTF-8 budget are enforced',()=>{
  fails(edit(v=>v.inputRefs=[]));
  fails(edit(v=>v.inputRefs=Array.from({length:17},(_,i)=>({...v.inputRefs[0],id:'item-'+i}))));
  fails(edit(v=>v.inputRefs[0].id='a'.repeat(513)));
  fails(edit(v=>v.inputRefs[0].id='\u0000bad'));
  fails(edit(v=>v.summary='😀'.repeat(2049)));
  const over=edit(v=>{v.objective='界'.repeat(4096);v.summary='界'.repeat(4096);v.stopConditions=Array.from({length:8},(_,i)=>'界'.repeat(511)+i);});
  assert.ok(JSON.stringify(over).length<32768);
  assert.ok(Buffer.byteLength(JSON.stringify(over))>32768);
  fails(over);
  const text=JSON.stringify(BASE);
  const pad=text+' '.repeat(32768-Buffer.byteLength(text));
  assert.deepEqual(parseChatHandoff(pad,options()),BASE);
  assert.throws(()=>parseChatHandoff(pad+' ',options()),e=>e.code==='E_CHAT_HANDOFF_SCHEMA');
});
