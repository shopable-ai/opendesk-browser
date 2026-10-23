import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalCodexPlanner} from '../../src/ui/workflow/local-codex.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const identity=id=>({sessionId:id,threadId:'thread-'+id,cursor:0,state:'READY_FOR_TURN'});

// Shared transport, separate actual planners. Every close must name a session;
// the harness never provides an owner-wide close fallback.
function harness(override=()=>{}) {
  const calls=[],sessions=new Map();let next=0;
  const client={async requestWorkflowAI(method,params={},sessionId=null) {
    calls.push({method,params,sessionId});
    const intercepted=override({method,params,sessionId,sessions});
    if(intercepted!==undefined)return intercepted;
    if(method==='ai.session.open') {
      const row={...identity('session-'+(++next)),turn:0};sessions.set(row.sessionId,row);return row;
    }
    if(method==='ai.session.close') {
      assert.equal(typeof sessionId,'string');assert.ok(sessionId);
      sessions.delete(sessionId);return {state:'CLOSED'};
    }
    const row=sessions.get(sessionId);assert.ok(row,'exact live session');
    if(method==='ai.plan.start')return {...row,turnId:'turn-'+(++row.turn)};
    if(method==='ai.events.read') {
      const events=[{type:'message.completed',text:JSON.stringify({sessionId,turn:row.turn})},
        {type:'turn.completed',status:'completed'}].map((event,index)=>({
        ...event,sessionId,threadId:row.threadId,turnId:'turn-'+row.turn,sequence:params.cursor+index+1
      }));
      return {events,cursor:events.at(-1).sequence,hasMore:false,state:'READY_FOR_TURN'};
    }
    throw Error('Unexpected '+method);
  }};
  return {calls,sessions,planner:()=>createLocalCodexPlanner({client,pollIntervalMs:1,timeoutMs:2000,cancelTimeoutMs:2000})};
}

for(const action of ['cancel','close','dispose'])test('R2.1.1 '+action+' pending open: late ACK closes only old session',async t=>{
  const pending=deferred();let opens=0;
  const h=harness(({method})=>method==='ai.session.open'&&++opens===1?pending.promise:undefined);
  const a=h.planner(),b=h.planner();t.after(()=>{a.dispose();b.dispose();});
  const running=a.planStructured({input:'old'}),rejected=assert.rejects(running);
  await a[action]();await rejected;
  const other=await b.planStructured({input:'other consumer'});
  const fresh=action==='dispose'?null:await a.planStructured({input:'new intent'});
  pending.resolve(identity('late-old'));await tick();
  assert.deepEqual(h.calls.filter(row=>row.method==='ai.session.close').map(row=>row.sessionId),['late-old']);
  assert.equal(b.snapshot().sessionId,other.sessionId);
  if(fresh)assert.equal(a.snapshot().sessionId,fresh.sessionId);
  assert.equal(h.calls.some(row=>row.method==='ai.plan.start'&&row.sessionId==='late-old'),false);
  assert.equal((await b.planStructured({input:'continue'})).turn,2);
});

test('R2.1.1 malformed open ACK still retires its exact allocated session',async t=>{
  const h=harness(({method})=>method==='ai.session.open'?{sessionId:'malformed-owned',cursor:0}:undefined);
  const planner=h.planner();t.after(()=>planner.dispose());
  await assert.rejects(planner.planStructured({input:'request'}),{code:'E_AI_PROTOCOL'});
  assert.deepEqual(h.calls.filter(row=>row.method==='ai.session.close').map(row=>row.sessionId),['malformed-owned']);
  assert.equal(h.calls.some(row=>row.method==='ai.plan.start'),false);
  assert.equal(planner.snapshot().busy,false);
});

test('R2.1.1 Cancel during pending start closes its session and ignores the late turn ACK',async t=>{
  const pending=deferred(),entered=deferred();let heldId=null;
  const h=harness(({method,sessionId})=>{
    if(method==='ai.plan.start'&&!heldId){heldId=sessionId;entered.resolve();return pending.promise;}
  });
  const a=h.planner(),b=h.planner();t.after(()=>{a.dispose();b.dispose();});
  const running=a.planStructured({input:'pending start'}),rejected=assert.rejects(running,{code:'E_CANCELLED'});
  await entered.promise;await a.cancel();await rejected;
  const other=await b.planStructured({input:'unaffected'});
  pending.resolve({...identity(heldId),turnId:'late-turn'});await tick();
  assert.deepEqual(h.calls.filter(row=>row.method==='ai.session.close').map(row=>row.sessionId),[heldId]);
  assert.equal(h.calls.some(row=>row.method==='ai.events.read'&&row.sessionId===heldId),false);
  assert.equal(a.snapshot().sessionId,null);
  assert.equal(b.snapshot().sessionId,other.sessionId);
});

function heldTurn() {
  const entered=deferred(),read=deferred(),draining=deferred(),drain=deferred(),ack=deferred(),closeAck=deferred();
  let heldId=null,cancelling=false;
  const h=harness(({method,sessionId,params,sessions})=>{
    if(method==='ai.plan.start'&&!heldId)heldId=sessionId;
    if(sessionId!==heldId)return;
    if(method==='ai.plan.cancel'){cancelling=true;return ack.promise;}
    if(method==='ai.events.read') {
      if(cancelling){draining.resolve({params,row:sessions.get(sessionId)});return drain.promise;}
      entered.resolve();return read.promise;
    }
    if(method==='ai.session.close')return closeAck.promise;
  });
  return {...h,entered,draining,drain,ack,closeAck};
}

test('R2.1.1 Cancel fences Send until exact terminal, while another consumer continues',async t=>{
  const h=heldTurn(),a=h.planner(),b=h.planner();t.after(()=>{a.dispose();b.dispose();});
  const running=a.planStructured({input:'held'}),rejected=assert.rejects(running,{code:'E_CANCELLED'});
  await h.entered.promise;const cleanup=a.cancel();await rejected;
  assert.equal(a.cancel(),cleanup);
  await assert.rejects(a.planStructured({input:'too early'}),{code:'E_AI_BUSY'});
  const other=await b.planStructured({input:'independent'});
  h.ack.resolve({state:'CANCELLING'});const {params,row}=await h.draining.promise;
  assert.equal(a.snapshot().busy,true);
  h.drain.resolve({events:[{type:'turn.completed',status:'interrupted',sessionId:row.sessionId,
    threadId:row.threadId,turnId:'turn-1',sequence:params.cursor+1}],
  cursor:params.cursor+1,hasMore:false,state:'CANCELLED'});
  assert.deepEqual(await cleanup,{state:'CANCELLED',terminalStatus:'interrupted'});
  assert.equal(a.snapshot().busy,false);
  assert.equal(b.snapshot().sessionId,other.sessionId);
  assert.equal(h.calls.filter(row=>row.method==='ai.plan.cancel').length,1);
});

test('R2.1.1 Close preempts Cancel and shares its exact close ACK',async t=>{
  const h=heldTurn(),a=h.planner();t.after(()=>a.dispose());
  const running=a.planStructured({input:'held'}),rejected=assert.rejects(running,{code:'E_CANCELLED'});
  await h.entered.promise;const cleanup=a.cancel();await rejected;
  const closed=a.close();assert.equal(a.close(),closed);
  assert.equal(h.calls.filter(row=>row.method==='ai.session.close').length,1);
  h.closeAck.resolve({state:'CLOSED'});
  assert.deepEqual(await cleanup,await closed);
  assert.equal(a.snapshot().busy,false);
});

for(const mode of ['unknown','wrong-turn','wrong-session'])test('R2.1.1 '+mode+' terminal cannot authorize reuse or replay',async t=>{
  const h=heldTurn(),a=h.planner(),b=h.planner();t.after(()=>{a.dispose();b.dispose();});
  const running=a.planStructured({input:'held'}),rejected=assert.rejects(running,{code:'E_CANCELLED'});
  await h.entered.promise;const old=a.snapshot().sessionId;
  const cleanup=a.cancel(),unknown=assert.rejects(cleanup,{code:'E_AI_OUTCOME_UNKNOWN'});await rejected;
  h.ack.resolve({state:'CANCELLING'});const {params,row}=await h.draining.promise;
  h.drain.resolve({events:[{type:'turn.completed',status:'failed',sessionId:mode==='wrong-session'?'other':row.sessionId,
    threadId:row.threadId,turnId:mode==='wrong-turn'?'other-turn':'turn-1',sequence:params.cursor+1,
    ...(mode==='unknown'?{error:{outcome:'OUTCOME_UNKNOWN'}}:{})}],
  cursor:params.cursor+1,hasMore:false,state:'CLOSED'});
  // Close remains a cleanup fence, even when the turn outcome is unknown.
  await tick();assert.equal(a.snapshot().busy,true);
  const other=await b.planStructured({input:'unaffected'});
  h.closeAck.resolve({state:'CLOSED'});await unknown;
  assert.equal(a.snapshot().sessionId,null);assert.equal(a.snapshot().resumable,false);
  assert.equal((await a.planStructured({input:'explicit retry'})).turn,1);
  assert.equal(b.snapshot().sessionId,other.sessionId);
  assert.deepEqual(h.calls.filter(row=>row.method==='ai.session.close').map(row=>row.sessionId),[old]);
  assert.equal(h.calls.filter(row=>row.method==='ai.plan.start'&&row.sessionId===old).length,1);
});
