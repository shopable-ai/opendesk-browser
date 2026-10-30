import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {COOKIE_JOURNAL_KEY,planCookieJournalMigration,validateMigratedCookieJournal,
  legacyCookieBarrier,migrateCookieJournal,planCookieAttempt,planCookieReceipt,
  reserveCookieAttempt,saveCookieReceipt,cookieAttemptConflicts} from '../src/cookie-journal.js';

const clone=v=>structuredClone(v);
const legacy=overrides=>({schemaVersion:1,deliveryId:'delivery',attemptId:'attempt',accountId:'account',
  serviceOrigin:'http://127.0.0.1:7898',targetUrl:'http://127.0.0.1:7898/session/',
  state:'unknown',count:2,results:[],seen:[{deliveryId:'earlier',expiresAt:1700000000000}],...overrides});
const mapping={sourceId:'commercial-a',siteId:'site-a',serviceOrigin:'http://127.0.0.1:7898',
  targetUrl:'http://127.0.0.1:7898/session/',accountId:'account'};
const success=()=>legacy({state:'success',results:[0,1].map(index=>({index,saved:true,verified:true}))});
function storage(initial,options={}){
  let value=clone(initial),reads=0,writes=0;
  const etag=()=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const request=async(op,args)=>{
    assert.equal(args.key,COOKIE_JOURNAL_KEY);
    if(op==='storage.get'){
      reads++;
      if(options.failRead===reads)throw Error('read unavailable');
      return {value:clone(value),etag:etag(),...(options.preview?{preview:true}:{})};
    }
    assert.equal(op,'storage.set');writes++;
    if(options.concurrent)value=clone(options.concurrent);
    if(args.ifMatch!==etag())throw Error('CAS conflict');
    if(options.failWrite)throw Error('write unavailable');
    value=clone(args.value);
    if(options.dropAck)throw Error('ack lost');
    return {saved:true};
  };
  return {request,get value(){return clone(value);},get writes(){return writes;}};
}

test('known header attribution preserves every old unscoped seen ID and unknown fact',()=>{
  const record=legacy({results:[{index:0,saved:true,verified:false,code:'E_OUTCOME_UNKNOWN'}]});
  const next=planCookieJournalMigration(record,[mapping]);
  assert.deepEqual(next.legacy,{record,attribution:{sourceId:'commercial-a',siteId:'site-a'}});
  assert.equal(legacyCookieBarrier(next,'brand-new'),'E_COOKIE_UNRESOLVED');
  assert.equal(legacyCookieBarrier(next,'other-site'),'E_COOKIE_UNRESOLVED');
  assert.deepEqual(record.seen,[{deliveryId:'earlier',expiresAt:1700000000000}]);
});
test('success is only a setting fact; historical seen cannot be assigned to its header site',()=>{
  const next=planCookieJournalMigration(success(),[mapping]);
  assert.equal(legacyCookieBarrier(next,'earlier'),'E_COOKIE_REPLAY');
  assert.equal(legacyCookieBarrier(next,'delivery'),'E_COOKIE_REPLAY');
  assert.equal(legacyCookieBarrier(next,'different'),null);
  assert.equal(Object.hasOwn(next,'loggedIn'),false);
});
test('no/ambiguous mapping keeps a global gate even for old success; exact service/target/assignment matter',()=>{
  for(const mappings of [[],[mapping,mapping],[{...mapping,targetUrl:'http://localhost:7898/session/'}],
    [{...mapping,serviceOrigin:'http://localhost:7898'}],[{...mapping,accountId:'other'}],
    [{...mapping,sharedAccountId:'missing'}]]){
    const next=planCookieJournalMigration(success(),mappings);
    assert.equal(next.legacy.attribution,null);
    assert.equal(legacyCookieBarrier(next,'new'),'E_COOKIE_LEGACY_UNATTRIBUTED');
  }
});
test('partial, failed, null and exact shared assignment are not conflated',()=>{
  assert.equal(legacyCookieBarrier(planCookieJournalMigration(legacy({state:'partial'}),[mapping]),'new'),
    'E_COOKIE_UNRESOLVED');
  assert.equal(legacyCookieBarrier(planCookieJournalMigration(legacy({state:'failed'}),[mapping]),'delivery'),
    'E_COOKIE_REPLAY');
  assert.equal(legacyCookieBarrier(planCookieJournalMigration(null),'new'),null);
  const r=legacy({sharedAccountId:'shared',scope:JSON.stringify([['session','/session/','']])});
  assert.equal(planCookieJournalMigration(r,[mapping]).legacy.attribution,null);
  assert.equal(planCookieJournalMigration(r,[{...mapping,sharedAccountId:'shared'}]).legacy.attribution.siteId,'site-a');
});
test('contradictory or incomplete old receipts preserve facts and keep the global lock',()=>{
  for(const record of [legacy({state:'success'}),
    legacy({state:'failed',results:[{index:0,saved:true,verified:true}]}),
    legacy({state:'failed',results:[{index:0,saved:false,verified:false,code:'E_OUTCOME_UNKNOWN'}]}),
    legacy({state:'success',results:[{index:0,saved:true,verified:false}]})]){
    const next=planCookieJournalMigration(record,[mapping]);
    assert.deepEqual(next.legacy.record,record);
    assert.equal(legacyCookieBarrier(next,'new'),'E_COOKIE_UNRESOLVED');
  }
});
test('unknown fields, raw payload, malformed receipts, impossible types and oversized storage fail closed',()=>{
  for(const value of [legacy({cookies:[{value:'secret'}]}),legacy({token:'secret'}),
    legacy({scope:'not a JSON scope'}),legacy({seen:[{deliveryId:'x',expiresAt:0}]}),
    legacy({results:[{index:0,saved:false,verified:true}]}),legacy({state:'logged-in'}),
    legacy({count:0}),legacy({targetUrl:'https://target.test/?token=secret'}),
    legacy({serviceOrigin:'http://127.0.0.1:7898/path'})]){
    assert.throws(()=>planCookieJournalMigration(value,[mapping]),{code:'E_COOKIE_STORAGE'});
  }
  const r=legacy({seen:Array.from({length:50},(_,i)=>({deliveryId:String(i).padEnd(120,'x'),expiresAt:1800000000000}))});
  assert.throws(()=>planCookieJournalMigration(r,[mapping]),{code:'E_COOKIE_LIMIT'});
  assert.throws(()=>validateMigratedCookieJournal({schemaVersion:2,legacy:{record:null,attribution:mapping}}));
});
test('single CAS on the original key survives lost acknowledgement and reopens without rewriting',async()=>{
  const s=storage(legacy(),{dropAck:true});
  const result=await migrateCookieJournal(s.request,[mapping]);
  assert.equal(result.value.schemaVersion,2);
  assert.equal(s.writes,1);
  assert.equal(legacyCookieBarrier(result.value,'new'),'E_COOKIE_UNRESOLVED');
  assert.deepEqual(await migrateCookieJournal(s.request,[mapping]),result);
  assert.equal(s.writes,1);
});
test('missing or ambiguous attribution writes nothing; a later unique mapping can migrate the original',async()=>{
  const original=success(),s=storage(original);
  for(const mappings of [[],[mapping,mapping]]){
    await assert.rejects(migrateCookieJournal(s.request,mappings),{code:'E_COOKIE_LEGACY_UNATTRIBUTED'});
    assert.equal(s.writes,0);assert.deepEqual(s.value,original);
  }
  const result=await migrateCookieJournal(s.request,[mapping]);
  assert.equal(s.writes,1);
  assert.equal(result.value.legacy.attribution.siteId,'site-a');
  assert.deepEqual(result.value.legacy.record,original);
  assert.equal(legacyCookieBarrier(result.value,'earlier'),'E_COOKIE_REPLAY');
});
test('migration storage failure, readback loss and concurrent modification never confirm or overwrite a lock',async()=>{
  for(const options of [{failRead:1},{failRead:2},{failWrite:true},
    {concurrent:legacy({attemptId:'other-instance',state:'partial'})},{preview:true}]){
    const s=storage(legacy(),options);
    await assert.rejects(migrateCookieJournal(s.request,[mapping]));
    assert.ok(s.writes<=1);
    assert.ok(['unknown','partial'].includes(s.value.schemaVersion===2?s.value.legacy.record.state:s.value.state));
    if(options.concurrent)assert.equal(s.value.attemptId,'other-instance');
    if(options.failRead===1||options.preview)assert.equal(s.writes,0);
  }
});
test('malformed old storage stays byte-for-byte untouched',async()=>{
  const initial={schemaVersion:1,unexpected:'do not discard'};
  const s=storage(initial);
  await assert.rejects(migrateCookieJournal(s.request,[mapping]),{code:'E_COOKIE_STORAGE'});
  assert.equal(s.writes,0);assert.deepEqual(s.value,initial);
});

const empty=()=>planCookieJournalMigration(null);
function attempt(host='a.example.test',changes={}){
  return {scopeKey:JSON.stringify(['source','https://source.example.test',host,'same-account','grant-1',
    'setCookies',`https://${host}/session/`,['ordinary','no-assignment']]),
    deliveryId:'same-delivery',requestId:'same-request',attemptId:'attempt-1',policyVersion:'1',
    payloadHash:'a'.repeat(64),expiresAt:1800000000000,count:2,
    slots:['session','context'].map(name=>({name,domain:host,hostOnly:true,path:'/session/',
      storeId:'authorized-store',partitionKey:null})),state:'unknown',resolution:'pending',results:[],...changes};
}
const ref=row=>({scopeKey:row.scopeKey,attemptId:row.attemptId});
const saved=()=>({receipt:{saved:2,verified:2,results:[0,1].map(index=>({index,saved:true,verified:true}))}});

test('new records scope identical IDs by site; late A receipt is saved to A without a current-site argument',()=>{
  const a=attempt(),b=attempt('b.example.test');
  const pendingA=planCookieAttempt(empty(),a);
  assert.throws(()=>planCookieAttempt(pendingA,b),{code:'E_COOKIE_UNRESOLVED'});
  const savedA=planCookieReceipt(pendingA,ref(a),saved());
  const pendingB=planCookieAttempt(savedA,b);
  assert.equal(pendingB.attempts.length,2);
  assert.equal(pendingB.attempts[0].scopeKey,a.scopeKey);
  assert.equal(pendingB.attempts[0].state,'success');
  assert.equal(pendingB.attempts[1].state,'unknown');
  assert.deepEqual(cookieAttemptConflicts(savedA,b),[]);
  assert.deepEqual(planCookieReceipt(pendingB,ref(a),saved()),pendingB);
  assert.throws(()=>planCookieAttempt(savedA,a),{code:'E_COOKIE_REPLAY'});
  assert.equal(Object.hasOwn(savedA.attempts[0],'loggedIn'),false);
});
test('only explicit pre-dispatch cancellation permits a new user-confirmed attempt for the same exact delivery',()=>{
  const a=attempt(),pending=planCookieAttempt(empty(),a);
  for(const errorCode of ['E_CANCELLED','E_TIMEOUT','E_CLOSED','E_OUTCOME_UNKNOWN']){
    const unchanged=planCookieReceipt(pending,ref(a),{errorCode});
    assert.deepEqual(unchanged,pending);
    assert.throws(()=>planCookieAttempt(unchanged,attempt('b.example.test')),{code:'E_COOKIE_UNRESOLVED'});
  }
  const cancelled=planCookieReceipt(pending,ref(a),{errorCode:'E_COOKIE_NOT_SUBMITTED'});
  assert.equal(cancelled.attempts[0].resolution,'not-submitted');
  const retry=attempt('a.example.test',{attemptId:'new-user-attempt'});
  assert.equal(planCookieAttempt(cancelled,retry).attempts.length,2);
  assert.throws(()=>planCookieAttempt(cancelled,{...retry,payloadHash:'b'.repeat(64)}),{code:'E_COOKIE_REPLAY'});
  assert.throws(()=>planCookieAttempt(cancelled,{...retry,policyVersion:'changed'}),{code:'E_COOKIE_REPLAY'});
  assert.throws(()=>planCookieAttempt(cancelled,a),{code:'E_COOKIE_REPLAY'});
  const finished=planCookieReceipt(pending,ref(a),saved());
  assert.throws(()=>planCookieReceipt(finished,ref(a),{errorCode:'E_COOKIE_NOT_SUBMITTED'}),
    {code:'E_COOKIE_RECEIPT_CONFLICT'});
  const neverCalled=planCookieReceipt(pending,ref(a),{notInvoked:true});
  assert.equal(neverCalled.attempts[0].resolution,'not-submitted');
  assert.throws(()=>planCookieReceipt(pending,ref(a),{notInvoked:false}),{code:'E_COOKIE_RECEIPT'});
});
test('legacy success without Store/Partition cannot silently replace a related host login',()=>{
  const journal=planCookieJournalMigration(success(),[mapping]);
  assert.throws(()=>planCookieAttempt(journal,attempt('127.0.0.1')),{code:'E_COOKIE_LEGACY_SCOPE_UNPROVEN'});
  assert.equal(planCookieAttempt(journal,attempt('localhost')).attempts.length,1);
  assert.equal(cookieAttemptConflicts(journal,attempt('127.0.0.1')).length,1);
  assert.deepEqual(cookieAttemptConflicts(journal,attempt('localhost')),[]);
});
test('partial/unknown item facts persist across reopen and block every new reservation',()=>{
  const a=attempt(),pending=planCookieAttempt(empty(),a);
  for(const receipt of [
    {saved:1,verified:1,stopped:true,results:[{index:0,saved:true,verified:true},
      {index:1,saved:false,verified:false,code:'E_COOKIE_CONFLICT'}]},
    {saved:1,verified:0,stopped:true,results:[{index:0,saved:true,verified:false,code:'E_OUTCOME_UNKNOWN'}]}
  ]){
    const next=planCookieReceipt(pending,ref(a),{receipt});
    const reopened=validateMigratedCookieJournal(JSON.parse(JSON.stringify(next)));
    assert.deepEqual(reopened.attempts[0].results,receipt.results);
    assert.ok(['unknown','partial'].includes(reopened.attempts[0].state));
    assert.throws(()=>planCookieAttempt(reopened,attempt('b.example.test',{expiresAt:2000000000000})),
      {code:'E_COOKIE_UNRESOLVED'});
    assert.throws(()=>planCookieReceipt(reopened,ref(a),{errorCode:'E_COOKIE_NOT_SUBMITTED'}),
      {code:'E_COOKIE_RECEIPT_CONFLICT'});
  }
  for(const receipt of [{...saved().receipt,saved:0},{saved:0,verified:0,results:[]},
    {...saved().receipt,results:[{index:1,saved:true,verified:true}]}]){
    assert.throws(()=>planCookieReceipt(pending,ref(a),{receipt}),{code:'E_COOKIE_RECEIPT'});
    assert.equal(pending.attempts[0].state,'unknown');
  }
});
test('ports do not isolate records and overlapping replacement must retain the complete approved slot set',()=>{
  const a=attempt(),savedA=planCookieReceipt(planCookieAttempt(empty(),a),ref(a),saved());
  const tuple=JSON.parse(a.scopeKey);tuple[2]='different-site';tuple[6]='https://a.example.test:444/session/';
  const sameHost=attempt('a.example.test',{scopeKey:JSON.stringify(tuple),deliveryId:'new',requestId:'new'});
  assert.equal(cookieAttemptConflicts(savedA,sameHost).length,1);
  assert.equal(planCookieAttempt(savedA,sameHost).attempts.length,2);
  for(const slots of [[sameHost.slots[0]],sameHost.slots.map(s=>({...s,path:'/'}))]){
    assert.throws(()=>planCookieAttempt(savedA,{...sameHost,slots,count:slots.length}),{code:'E_COOKIE_SCOPE'});
  }
  const renamed={...a,deliveryId:'new-delivery',requestId:'new-request',attemptId:'next-attempt',
    policyVersion:'2',slots:a.slots.map(s=>({...s,name:'replacement_'+s.name}))};
  assert.equal(cookieAttemptConflicts(savedA,renamed).length,1);
  assert.throws(()=>planCookieAttempt(savedA,renamed),{code:'E_COOKIE_SCOPE'});
  assert.throws(()=>planCookieAttempt(savedA,{...renamed,scopeKey:sameHost.scopeKey}),{code:'E_COOKIE_SCOPE'});
});
test('unresolved contexts preserve replay locks and cannot evade complete session replacement',()=>{
  const a=attempt();a.slots=a.slots.map(s=>({...s,storeId:null,partitionKey:'unresolved'}));
  const pending=planCookieAttempt(empty(),a);
  assert.throws(()=>planCookieAttempt(pending,attempt('b.example.test')),{code:'E_COOKIE_UNRESOLVED'});
  const savedA=planCookieReceipt(pending,ref(a),saved());
  const next={...a,deliveryId:'next-delivery',requestId:'next-request',attemptId:'next-attempt'};
  assert.equal(cookieAttemptConflicts(savedA,next).length,1);
  assert.equal(planCookieAttempt(savedA,next).attempts.length,2);
  for(const slots of [[a.slots[0]],attempt().slots,
    a.slots.map(s=>({...s,name:'replacement_'+s.name}))])
    assert.throws(()=>planCookieAttempt(savedA,{...next,slots,count:slots.length}),{code:'E_COOKIE_SCOPE'});
  // Distinct actual Hosts remain disjoint even without an invented browser Store.
  const b=attempt('b.example.test');b.slots=b.slots.map(s=>({...s,storeId:null,partitionKey:'unresolved'}));
  assert.deepEqual(cookieAttemptConflicts(savedA,b),[]);
  assert.equal(planCookieAttempt(savedA,b).attempts.length,2);
});
test('a settled zero-save receipt preserves replay history without inventing Cookie replacement obligations',()=>{
  const a=attempt();
  const failed=planCookieReceipt(planCookieAttempt(empty(),a),ref(a),{receipt:{saved:0,verified:0,
    stopped:true,results:[{index:0,saved:false,verified:false,code:'E_COOKIE_CONFLICT'}]}});
  const next={...a,deliveryId:'new-delivery',requestId:'new-request',attemptId:'next-attempt',count:1,slots:[a.slots[0]]};
  assert.equal(planCookieAttempt(failed,next).attempts.length,2);
  assert.deepEqual(cookieAttemptConflicts(failed,next),[]);
  assert.throws(()=>planCookieAttempt(failed,a),{code:'E_COOKIE_REPLAY'});
});
test('reserve refuses before persistence when the marker fits but the final receipt cannot fit',async()=>{
  const a=attempt('a.example.test',{count:50,slots:Array.from({length:50},(_,i)=>({
    name:'cookie'+i,domain:'a.example.test',hostOnly:true,path:'/session/',storeId:'authorized-store',partitionKey:null
  }))});
  assert.ok(Buffer.byteLength(JSON.stringify({...empty(),attempts:[a]}))<8192);
  const results=Array.from({length:50},(_,index)=>({index,saved:true,verified:true}));
  assert.ok(Buffer.byteLength(JSON.stringify({...empty(),attempts:[{...a,state:'success',resolution:'receipt',results}]}))>8192);
  const s=storage(empty());
  await assert.rejects(reserveCookieAttempt(s.request,a),{code:'E_COOKIE_LIMIT'});
  assert.equal(s.writes,0);assert.deepEqual(s.value,empty());
});
test('two instances racing through the same CAS key confirm at most one marker',async()=>{
  const s=storage(empty());
  const a=attempt(),b=attempt('b.example.test');
  const results=await Promise.allSettled([reserveCookieAttempt(s.request,a),reserveCookieAttempt(s.request,b)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(s.value.attempts.length,1);
  assert.equal(s.value.attempts[0].resolution,'pending');
  const winner=s.value.attempts[0];
  const after=await saveCookieReceipt(s.request,ref(winner),saved());
  assert.equal(after.value.attempts[0].state,'success');
  const reopened=validateMigratedCookieJournal(s.value);
  assert.deepEqual(reopened,after.value);
});
test('even identical concurrent intent objects receive unique reservation owners and only one confirms',async()=>{
  const s=storage(empty()),a=attempt();
  const results=await Promise.allSettled([reserveCookieAttempt(s.request,a),reserveCookieAttempt(s.request,a)]);
  const winners=results.filter(r=>r.status==='fulfilled');
  assert.equal(winners.length,1);
  assert.notEqual(s.value.attempts[0].attemptId,a.attemptId);
  assert.deepEqual(winners[0].value.reference,ref(s.value.attempts[0]));
  const before=clone(s.value);
  await assert.rejects(reserveCookieAttempt(s.request,a),{code:'E_COOKIE_UNRESOLVED'});
  assert.deepEqual(s.value,before);
});
test('failed marker persistence never confirms permission to dispatch, and receipt acknowledgement loss is read back once',async()=>{
  const a=attempt();
  for(const options of [{failWrite:true},{failRead:2},{concurrent:empty()}]){
    const s=storage(empty(),options);
    // Replacing storage with the identical empty value is not a CAS conflict,
    // so use a distinct unknown marker for a real competing write.
    if(options.concurrent)options.concurrent=planCookieAttempt(empty(),attempt('b.example.test'));
    await assert.rejects(reserveCookieAttempt(s.request,a));
    assert.ok(s.writes<=1);
  }
  const old=storage(legacy());
  await assert.rejects(reserveCookieAttempt(old.request,a),{code:'E_COOKIE_MIGRATION_REQUIRED'});
  assert.equal(old.writes,0);
  const s=storage(planCookieAttempt(empty(),a),{dropAck:true});
  const result=await saveCookieReceipt(s.request,ref(a),saved());
  assert.equal(s.writes,1);assert.equal(result.value.attempts[0].state,'success');
});
test('new schema rejects secret/unknown fields, contradictory facts and storage overflow without discarding history',()=>{
  const a=attempt();
  for(const row of [{...a,cookies:[{value:'secret'}]},{...a,token:'secret'},
    {...a,slots:[{...a.slots[0],value:'secret'},a.slots[1]]},
    {...a,scopeKey:'not-structured'}, {...a,payloadHash:'not-hash'},
    {...a,state:'success'},{...a,resolution:'not-submitted',state:'unknown'}])
    assert.throws(()=>planCookieAttempt(empty(),row));
  let journal=empty(),limited=false;
  for(let i=0;i<20;i++){
    const row=attempt(`${i}.example.test`);
    try{journal=planCookieReceipt(planCookieAttempt(journal,row),ref(row),saved());}
    catch(error){assert.equal(error.code,'E_COOKIE_LIMIT');limited=true;break;}
  }
  assert.equal(limited,true);
  assert.ok(journal.attempts.length>1);
  assert.ok(journal.attempts.every(r=>r.state==='success'));
});
