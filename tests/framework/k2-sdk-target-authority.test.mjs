import test from 'node:test';
import assert from 'node:assert/strict';
import {sdkMethods} from '../../src/platform/host/sdk-methods.js';
import {validateSdkRequest} from '../../src/framework/sdk/registry.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {snapshotSdkApproval} from '../../src/ui/sdk-approval.js';

const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const A='https://a.example', B='https://b.example', C='https://c.example';
function fixture(){
  let tail=Promise.resolve();
  const stores=new Map(['commandJournal','runs','results'].map(name=>[name,new Map()]));
  const hooks={transaction:null,native:null}, nativeOrigins=new Set([`${A}/*`,`${B}/*`,`${C}/*`]);
  const storage={async transaction(names,mode,body){
    await hooks.transaction?.(names,mode);
    const previous=tail,release=deferred();tail=release.promise;await previous;
    const copy=new Map([...stores].map(([name,values])=>[name,new Map([...values].map(([key,value])=>[key,structuredClone(value)]))]));
    const tx={get:async(name,key)=>structuredClone(copy.get(name).get(key)),all:async name=>[...copy.get(name).values()].map(value=>structuredClone(value)),
      put:async(name,value,key)=>{assert.equal(mode,'readwrite');assert.ok(names.includes(name));copy.get(name).set(key,structuredClone(value));},
      delete:async(name,key)=>{assert.equal(mode,'readwrite');copy.get(name).delete(key);}};
    try{const result=await body(tx);if(mode==='readwrite')for(const name of names)stores.set(name,copy.get(name));return result;}finally{release.resolve();}
  }};
  const source={id:'extension',tab:{id:2,incognito:false},frameId:0,documentId:'document-A',documentLifecycle:'active',url:`${A}/page`};
  const api={runtime:{id:'extension'},webNavigation:{getAllFrames:async({tabId})=>{await hooks.native?.();return tabId===2?[{frameId:0,documentId:'document-A',documentLifecycle:'active',url:`${A}/page`}]:[];}},
    permissions:{contains:async({origins=[],permissions=[]})=>origins.every(value=>nativeOrigins.has(value))&&permissions.every(value=>value==='notifications')}};
  const options={storage,api,session:'browser-session',clock:{now:()=>1000},assertHost:async()=>({registrationId:'trusted-tool'}),currentHost:async()=>{}};
  const authority=sdkMethods(options);
  const grant=(targets=[B],capabilities=['network'],owner=authority)=>owner.grantSdk({tabId:2,frameId:0,documentId:'document-A',capabilities,...(targets===null?{}:{targetOrigins:targets})},{});
  const request=(id='one',url=`${B}/read`,deadlineAt=10000)=>validateSdkRequest({requestId:id,method:'AXIOS_GET',args:{url},deadlineAt});
  return {authority,options,stores,hooks,nativeOrigins,source,grant,request};
}

test('real authority receipt matches the tool snapshot; B never changes A namespace',async()=>{
  const f=fixture(),receipt=await f.grant([B,B]);
  const expected=snapshotSdkApproval({document:{tabId:2,frameId:0,documentId:'document-A',url:`${A}/page`},capabilities:['network'],targetText:B});
  for(const field of ['documentId','sourceOrigin','capabilities','targetOrigins','allowedOrigins'])assert.deepEqual(receipt[field],expected[field]);
  const admitted=await f.authority.admitSdk(f.request(),f.source);
  assert.equal(admitted.context.namespace,`page:${A}`);
  await admitted.context.authorize({url:`${B}/read`,capability:'network',phase:'pre'});
  assert.equal(admitted.context.grantIncarnation,receipt.grantIncarnation);
});

test('native A/B/C permissions alone cannot create application authority',async()=>{
  const f=fixture();await assert.rejects(f.authority.admitSdk(f.request(),f.source),{code:'E_GRANT_REVOKED'});
  assert.equal(f.stores.get('runs').size,0);
});

for(const [name,url] of [['unapproved C',`${C}/read`],['different port',`${B}:444/read`],['different protocol','http://b.example/read'],['subdomain','https://sub.b.example/read']])
  test(`exact target authorization rejects ${name}`,async()=>{
    const f=fixture();await f.grant();await assert.rejects(f.authority.admitSdk(f.request('rejected',url),f.source),{code:'E_PERMISSION'});
    assert.equal(f.stores.get('runs').size,0);
  });

test('target native permission is checked independently before dispatch',async()=>{
  const f=fixture();await f.grant();const old=await f.authority.admitSdk(f.request(),f.source);
  f.nativeOrigins.delete(`${B}/*`);
  await assert.rejects(old.context.authorize({url:`${B}/read`,capability:'network',phase:'pre'}),{code:'E_PERMISSION'});
  const operation=[...f.stores.get('commandJournal').values()].find(value=>value.tag==='sdk-operation');
  assert.equal(operation.submissionCount,0);assert.equal(operation.state,'admitted');
});

test('omitted and empty scopes are source-only; equivalent scope reuses only live grant',async()=>{
  const f=fixture(),first=await f.grant(null),same=await f.grant([]);
  assert.equal(first.grantIncarnation,same.grantIncarnation);assert.deepEqual(first.allowedOrigins,[A]);
  await assert.rejects(f.authority.admitSdk(f.request(),f.source),{code:'E_PERMISSION'});
  const expanded=await f.grant([B,B,A]);assert.notEqual(expanded.grantIncarnation,first.grantIncarnation);
  assert.equal((await f.grant([B])).grantIncarnation,expanded.grantIncarnation);
  const narrowed=await f.grant([]);assert.notEqual(narrowed.grantIncarnation,expanded.grantIncarnation);
});

test('changed capability or targets fence old context and request identity',async()=>{
  for(const [targets,capabilities] of [[[B,C],['network']],[[],['storage.persistent']]]){
    const f=fixture();const original=await f.grant(),old=await f.authority.admitSdk(f.request(),f.source);
    const next=await f.grant(targets,capabilities);assert.notEqual(next.grantIncarnation,original.grantIncarnation);
    assert.throws(()=>old.context.assertDispatch(),{code:'E_GRANT_REVOKED'});
    await assert.rejects(old.context.authorize({url:`${B}/read`,capability:'network',phase:'post'}));
    if(capabilities.includes('network'))await assert.rejects(f.authority.admitSdk(f.request(),f.source),{code:'E_GRANT_REVOKED'});
  }
});

test('observed target removal fences immediately while persistence waits; quick reapproval survives old callback',async()=>{
  const f=fixture();const original=await f.grant(),old=await f.authority.admitSdk(f.request(),f.source);
  const entered=deferred(),release=deferred();let intercepted=false;
  f.hooks.transaction=async(names,mode)=>{if(!intercepted&&mode==='readwrite'){intercepted=true;entered.resolve();await release.promise;}};
  const removal=f.authority.revokeSdkGrants({origins:[`${B}/*`]});await entered.promise;
  assert.throws(()=>old.context.assertDispatch(),{code:'E_GRANT_REVOKED'});
  // Simulate the native browser permission already reapproved while persistence waits.
  const next=await f.grant();assert.notEqual(next.grantIncarnation,original.grantIncarnation);
  release.resolve();await removal;
  await f.authority.helloSdk({sdkVersion:'1.0.0'},f.source);
  await assert.rejects(f.authority.admitSdk(f.request(),f.source),{code:'E_GRANT_REVOKED'});
  assert.throws(()=>old.context.assertDispatch(),{code:'E_GRANT_REVOKED'});
  const fresh=await f.authority.admitSdk(f.request('fresh'),f.source);assert.equal(fresh.context.grantIncarnation,next.grantIncarnation);
});

test('same request ID conflicts on args or deadline, different IDs are not coalesced',async()=>{
  const f=fixture();await f.grant();const first=await f.authority.admitSdk(f.request(),f.source);
  const repeated=await f.authority.admitSdk(f.request(),f.source);assert.equal(repeated.operation.opId,first.operation.opId);
  for(const request of [f.request('one',`${B}/different`),f.request('one',`${B}/read`,10001)])
    await assert.rejects(f.authority.admitSdk(request,f.source),{code:'E_REQUEST_CONFLICT'});
  const different=await f.authority.admitSdk(f.request('two'),f.source);assert.notEqual(different.operation.opId,first.operation.opId);
});

for(const point of ['native','first readonly','second readonly'])test(`readonly reference cannot cross revocation at ${point} barrier`,async()=>{
  const f=fixture();await f.grant();const request=f.request(),old=await f.authority.admitSdk(request,f.source);
  await old.context.authorize({url:request.args.url,capability:'network',phase:'pre'});
  const payload={requestId:request.requestId,method:request.method,argsWire:encodeValue(request.args),deadlineAt:request.deadlineAt};
  const before=await f.authority.lookupSdkInvocation(payload,f.source);assert.equal(before.invocation.grantIncarnation,old.context.grantIncarnation);
  const entered=deferred(),release=deferred();let count=0;
  if(point==='native')f.hooks.native=async()=>{if(++count===1){entered.resolve();await release.promise;}};
  else f.hooks.transaction=async(names,mode)=>{if(mode==='readonly'&&++count===(point==='first readonly'?1:2)){entered.resolve();await release.promise;}};
  const lookup=f.authority.lookupSdkInvocation(payload,f.source);const rejection=assert.rejects(lookup);
  await entered.promise;await f.authority.revokeSdkGrants({origins:[`${B}/*`]});await f.grant();
  release.resolve();await rejection;
});

test('worker recovery never replays dispatched effects or restores cross-origin authority',async()=>{
  const f=fixture();const initial=await f.grant(),old=await f.authority.admitSdk(f.request(),f.source);
  await old.context.authorize({url:`${B}/read`,capability:'network',phase:'pre'});
  const restored=sdkMethods(f.options);await restored.recoverSdk();
  await assert.rejects(restored.helloSdk({sdkVersion:'1.0.0'},f.source),{code:'E_GRANT_REVOKED'});
  const operation=[...f.stores.get('commandJournal').values()].find(row=>row.tag==='sdk-operation');
  assert.equal(operation.state,'effect_unknown');assert.equal(operation.submissionCount,1);
  const next=await f.grant([B],['network'],restored);assert.notEqual(next.grantIncarnation,initial.grantIncarnation);
  await assert.rejects(restored.admitSdk(f.request(),f.source),{code:'E_GRANT_REVOKED'});
});

test('legacy remains same-origin; new record has old-reader active:false; unknown format fails closed',async()=>{
  const f=fixture();await f.grant([]);
  const restored=sdkMethods(f.options);await restored.recoverSdk();await restored.helloSdk({sdkVersion:'1.0.0'},f.source);
  await assert.rejects(restored.admitSdk(f.request(),f.source),{code:'E_PERMISSION'});
  await f.grant();const grant=[...f.stores.get('commandJournal').values()].find(value=>value.tag==='sdk-grant'&&value.crossOriginActive);
  assert.equal(grant.active,false);assert.equal(grant.targetScopeVersion,1);
  grant.targetScopeVersion=999;
  await assert.rejects(f.authority.helloSdk({sdkVersion:'1.0.0'},f.source),{code:'E_GRANT_REVOKED'});
});
