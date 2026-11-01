import test from 'node:test';
import assert from 'node:assert/strict';
import {readbackFailureState,sessionActions,verifyEnvironment} from '../src/run-session.js';
import {ORIGINAL_CONFIG} from '../src/env-config.js';

const active={sessionRef:'s'.repeat(24)};
test('an accepted apply keeps Stop after read timeout, unsupported service or denied read',()=>{
  for(const code of ['E_TIMEOUT','E_SERVICE_UNSUPPORTED','E_UNVERIFIED_READBACK','E_USER_DENIED']){
    const status=readbackFailureState({code});
    assert.notEqual(status,'unknown','a read error is not an unknown mutation');
    assert.equal(sessionActions(status,active).canRestore,true);
  }
});
test('an accepted Stop allows only read-only retries, even when restoration is unknown',()=>{
  const status=readbackFailureState({code:'E_TIMEOUT'},{restore:true});
  assert.equal(status,'restore_unknown');
  assert.deepEqual(sessionActions(status,{...active,restoreAccepted:true}),
    {canRead:true,canRestore:false});
  assert.deepEqual(sessionActions(status,active),{canRead:false,canRestore:false},
    'an unknown restore mutation cannot be replayed');
});
test('invalidation wins over late read errors and cannot re-enable session actions',()=>{
  for(const restore of [false,true]){
    const status=readbackFailureState({code:'E_TIMEOUT'},{restore,invalidated:true});
    assert.equal(status,'invalidated');
    assert.deepEqual(sessionActions(status,{...active,restoreAccepted:restore}),
      {canRead:false,canRestore:false});
  }
  assert.deepEqual(sessionActions('applied_unverified',{...active,invalidated:true}),
    {canRead:false,canRestore:false});
});
test('missing and uncertain mutation receipts never enable readback or restore',()=>{
  for(const session of [null,{}, {...active,uncertain:true}])
    assert.deepEqual(sessionActions('applied_unverified',session),{canRead:false,canRestore:false});
});
test('retry after accepted Stop stays bound to its document and sends no mutation',async()=>{
  const calls=[];
  const ctx={status:'available',url:'https://example.test/qa',
    tabRef:'t'.repeat(24),documentRef:'d'.repeat(24)};
  const session={...active,restoreAccepted:true,target:{origin:'https://example.test',
    volatile:{url:ctx.url,tabRef:ctx.tabRef,documentRef:ctx.documentRef}}};
  let lost=true;
  const adapter={context:async()=>ctx,request:async(name,args)=>{
    calls.push(name);
    if(name==='browser.capabilities.getStatus')return {operation:args.operation,
      implementation:'implemented',authorization:{tool:'granted'},callableNow:true};
    assert.equal(name,'browser.fingerprint.readback');
    assert.deepEqual(args,{sessionRef:session.sessionRef,documentRef:ctx.documentRef,mode:'restore'});
    if(lost){lost=false;throw Object.assign(Error('timeout'),{code:'E_TIMEOUT'});}
    return {source:'trusted-browser-host',sessionRef:session.sessionRef,
      documentRef:ctx.documentRef,rows:[],controlledKeys:['ua']};
  }};
  await assert.rejects(()=>verifyEnvironment(adapter,session,ORIGINAL_CONFIG,{restore:true}),{code:'E_TIMEOUT'});
  assert.equal(sessionActions('restore_unknown',session).canRead,true);
  const result=await verifyEnvironment(adapter,session,ORIGINAL_CONFIG,{restore:true});
  assert.equal(result.kind,'restore');
  assert.equal(result.status,'partial','missing observations never count as restoration');
  assert.equal(calls.filter(name=>name==='browser.fingerprint.readback').length,2);
  assert.equal(calls.some(name=>/\.(apply|restore)$/.test(name)),false);
});
