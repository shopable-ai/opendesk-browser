import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src/insight-core.js';
const C=globalThis.AIInsightCore;
const M=C.MIN;
const state=()=>C.demoState();
const m=s=>C.problemMetrics(s,'prob_bug');
function ev(type,minute,extra={}){return {type,atMs:minute*M,eventId:'evt_'+type+'_'+minute,dedupeKey:'dom_'+type+'_'+minute,scopeId:'scope_demo_local',origin:'https://chatgpt.com',accountId:'account_demo_1',generationId:'gen_1',...extra};}
test('schema version and explicit object/event/consent definitions',()=>{
  const schema=JSON.parse(readFileSync(new URL('../contracts/insight-r5.schema.json',import.meta.url)));
  assert.equal(schema.$defs.Problem.properties.id.type,'string');
  assert.deepEqual(schema.$defs.ProblemRelation.properties.relation.enum,C.RELATIONS);
  assert.equal(schema.$defs.Event.additionalProperties,false);
  assert.equal(schema.$defs.Consent.properties.metadata.type,'boolean');
});
test('1. one problem one conversation',()=>{let s=state();s.links=s.links.slice(0,1);assert.equal(m(s).conversationCount,1)});
test('2. same problem across 3 chats & 2 platforms after user confirmation',()=>{
  let s=C.applyAction(state(),{type:'LINK_CANDIDATE',candidateId:'candidate_b'});
  assert.equal(m(s).conversationCount,3);assert.equal(m(s).platformCount,2);
  assert.equal(s.links.find(l=>l.conversationId==='conv_b').decisionSource,'USER');
});
test('3. a conversation may reference multiple problems without altering identity',()=>{
  let s=state();s.links.push({id:'shared',problemId:'prob_theme',conversationId:'conv_a',status:'CONFIRMED'});
  assert.equal(C.problemMetrics(s,'prob_theme').conversationCount,1);
  assert.equal(m(s).conversationCount,2);
});
test('4. SIMILAR cannot auto merge',()=>{
  assert.throws(()=>C.applyAction(state(),{type:'LINK_CANDIDATE',candidateId:'candidate_x'}),/相似/);
  const s=C.applyAction(state(),{type:'REJECT_CANDIDATE',candidateId:'candidate_x'});
  assert.equal(s.candidates.find(c=>c.id==='candidate_x').status,'REJECTED');
});
test('5. parent/child has distinct identity and metrics',()=>{
  const s=state();s.relations.push(C.relationDecision('prob_bug','prob_theme','SUBPROBLEM_OF','USER',[],[]));
  assert.equal(m(s).conversationCount,2);assert.equal(C.problemMetrics(s,'prob_theme').conversationCount,0);
});
test('6. mistaken merge undo and derived recalculation',()=>{
  let s=C.applyAction(state(),{type:'LINK_CANDIDATE',candidateId:'candidate_b'});
  assert.equal(m(s).sumMs,65*M);assert.equal(m(s).unionMs,40*M);
  s=C.applyAction(s,{type:'UNDO_LINK',linkId:'link_conv_b'});
  assert.equal(m(s).sumMs,40*M);assert.equal(m(s).conversationCount,2);
  assert.equal(s.audit.at(-1).action,'UNDO_LINK');
});
test('7. duplicate DOM mutation is not new count',()=>{
  const r=C.reduceExecution([ev('SUBMITTED_OBSERVED',0),ev('SUBMITTED_OBSERVED',0),ev('FIRST_OUTPUT_OBSERVED',1),ev('COMPLETION_OBSERVED',40)]);
  assert.equal(r.accepted,3);assert.equal(r.duplicates,1);assert.equal(r.durationMs,40*M);
});
test('8. regenerated response requires different generation id',()=>{
  const r=C.reduceExecution([ev('SUBMITTED_OBSERVED',0),ev('COMPLETION_OBSERVED',10),ev('REGENERATED',11)]);
  assert.equal(r.status,'REGENERATED');
  const later=C.reduceExecution([ev('SUBMITTED_OBSERVED',12,{generationId:'gen_2'}),ev('COMPLETION_OBSERVED',25,{generationId:'gen_2'})]);
  assert.equal(later.durationMs,13*M);
});
test('9. normally observed execution has precise stages',()=>{
  const r=C.reduceExecution([ev('SUBMITTED_OBSERVED',0),ev('FIRST_OUTPUT_OBSERVED',2),ev('OUTPUT_PROGRESS_OBSERVED',12),ev('COMPLETION_OBSERVED',40)]);
  assert.equal(r.firstOutputLatencyMs,2*M);assert.equal(r.observedOutputMs,38*M);
});
test('10. incomplete or observation-gap execution is not exact',()=>{
  const r=C.reduceExecution([ev('SUBMITTED_OBSERVED',0),ev('OBSERVATION_GAP',30),ev('COMPLETION_OBSERVED',60)]);
  assert.equal(r.durationMs,null);assert.equal(r.coverage,'PARTIAL');
  const u=C.reduceExecution([ev('SUBMITTED_OBSERVED',0),ev('STATUS_UNKNOWN',60)]);
  assert.equal(u.rightCensored,true);assert.equal(u.durationMs,null);
});
test('11. 40+25 overlapping 25 => sum 65, union 40',()=>{
  const s=C.applyAction(state(),{type:'LINK_CANDIDATE',candidateId:'candidate_b'});
  assert.deepEqual([m(s).sumMs,m(s).unionMs,m(s).overlapMultiplicityMs],[65*M,40*M,25*M]);
  assert.equal(m(s).unknownSampleCount,1);
});
test('12. visible tab does not imply attention or server computing',()=>{
  assert.equal('attentionMs' in C.intervalMetrics(state().executions),false);
});
test('13. AI claim is not independently verified',()=>{
  assert.equal(state().outcome.state,'CLAIMED_BY_AI');
  let s=C.applyAction(state(),{type:'SET_OUTCOME',problemId:'prob_bug',value:'USER_CONFIRMED'});
  assert.equal(s.outcome.state,'USER_CONFIRMED');assert.equal(s.outcome.verifiedEvidenceIds.length,0);
  s=C.applyAction(s,{type:'RECORD_DEMO_TEST',problemId:'prob_bug'});
  assert.equal(s.outcome.state,'EVIDENCE_VERIFIED');assert.equal(s.evidence.at(-1).isDemo,true);
});
test('14. revoked permission blocks new observation, including stale revision',()=>{
  let s=C.applyAction(state(),{type:'REVOKE_ORIGIN',origin:'https://chatgpt.com'});
  assert.throws(()=>C.applyAction(s,{type:'OBSERVE_EVENT',event:{...ev('SUBMITTED_OBSERVED',0),consentRevision:1}}),/撤销/);
  s=C.applyAction(s,{type:'GRANT_ORIGIN',origin:'https://chatgpt.com'});
  assert.throws(()=>C.applyAction(s,{type:'OBSERVE_EVENT',event:{...ev('SUBMITTED_OBSERVED',0),consentRevision:1}}),/失效/);
});
test('15. deletion removes problem and its exclusive derived records',()=>{
  const s=C.applyAction(state(),{type:'DELETE_PROBLEM',problemId:'prob_bug'});
  assert.equal(C.problemMetrics(s,'prob_bug'),null);
  assert.equal(s.executions.some(e=>e.id==='exec_a'),false);
  assert.equal(s.conversations.some(c=>c.id==='conv_a'),false);
  assert.equal(s.evidence.some(e=>e.id==='evi_ai_claim'),false);
});
test('16. missing historic timestamp cannot yield fabricated duration',()=>{
  const v=C.intervalMetrics([{id:'unknown',startMs:0,endMs:null,status:'STATUS_UNKNOWN',coverage:'PARTIAL'}]);
  assert.equal(v.exactSampleCount,0);assert.equal(v.unionMs,0);assert.equal(v.coverage,0);
  assert.deepEqual(v.unknownIds,['unknown']);
});
test('17. split creates new stable id and recomputes',()=>{
  const s=C.applyAction(state(),{type:'SPLIT_LINK',linkId:'link_c',title:'单独的复测任务'});
  assert.equal(m(s).conversationCount,1);
  assert.equal(C.problemMetrics(s,'prob_new_001').conversationCount,1);
});
test('18. event idempotency is scoped by origin, account, generation and consent revision',()=>{
  let s=state(),e={...ev('SUBMITTED_OBSERVED',0),consentRevision:1};
  s=C.applyAction(s,{type:'OBSERVE_EVENT',event:e});
  s=C.applyAction(s,{type:'OBSERVE_EVENT',event:e});
  assert.equal(s.observedEvents.length,1);
  assert.throws(()=>C.applyAction(s,{type:'OBSERVE_EVENT',event:{...e,promptText:'secret'}}),/正文/);
});

test('19. schema-shaped eventType/observedAt is accepted by state reducer',()=>{
  const e=ev('SUBMITTED_OBSERVED',0),f=ev('COMPLETION_OBSERVED',60);
  delete e.type;delete e.atMs;e.eventType='SUBMITTED_OBSERVED';e.observedAt='2026-11-11T00:00:00.000Z';
  delete f.type;delete f.atMs;f.eventType='COMPLETION_OBSERVED';f.observedAt='2026-11-11T01:00:00.000Z';
  const r=C.reduceExecution([e,f]);assert.equal(r.durationMs,60*M);
});
test('20. event idempotency is isolated by consent revision',()=>{
  let s=state(),e={...ev('SUBMITTED_OBSERVED',0),consentRevision:1};
  s=C.applyAction(s,{type:'OBSERVE_EVENT',event:e});
  s=C.applyAction(s,{type:'REVOKE_ORIGIN',origin:'https://chatgpt.com'});
  s=C.applyAction(s,{type:'GRANT_ORIGIN',origin:'https://chatgpt.com'});
  s=C.applyAction(s,{type:'OBSERVE_EVENT',event:{...e,consentRevision:3,eventId:'fresh'}});
  assert.equal(s.observedEvents.length,2);
});
