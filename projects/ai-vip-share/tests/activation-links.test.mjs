import test from 'node:test';
import assert from 'node:assert/strict';
import {DEVELOPMENT_ACTIVATION_URLS,activationCodeFromVerifiedPage,
  readAutoPreparationPauses,isAutoPreparationPaused,addAutoPreparationPause}
  from '../src/activation-links.js';

const url='http://192.168.30.3:7899/activate?activation_code=DEMO-VIP-01';
const page=value=>({status:'available',url:value});
test('only the canonical reviewed landing URL can prepare, with no extra/encoded aliases',()=>{
  assert.equal(activationCodeFromVerifiedPage(page(url),DEVELOPMENT_ACTIVATION_URLS),'DEMO-VIP-01');
  for(const malformed of [
    url+'#fragment',url+'&next=unexpected',url.replace('DEMO-VIP-01','DEMO%2DVIP-01'),
    url.replace('/activate?','/x/../activate?'),url.replace('?activation_code','/?activation_code'),
    url.replace('192.168.30.3:7899','192.168.30.3.evil.test:7899'),
    url.replace('activation_code','ticket'),url.replace('DEMO-VIP-01','abc')
  ])assert.equal(activationCodeFromVerifiedPage(page(malformed),DEVELOPMENT_ACTIVATION_URLS),null,malformed);
  assert.equal(activationCodeFromVerifiedPage({status:'unavailable',url},DEVELOPMENT_ACTIVATION_URLS),null);
  assert.equal(activationCodeFromVerifiedPage(page(url),[]),null);
});

test('paused auto-preparation is durable by service and beneficiary, not by ticket',()=>{
  const a={accountId:'recipient-1',serviceOrigin:'http://127.0.0.1:7903'};
  const b={accountId:'recipient-2',serviceOrigin:'http://127.0.0.1:7903'};
  const initial=readAutoPreparationPauses(null);
  assert.equal(isAutoPreparationPaused(initial,a),false);
  const paused=addAutoPreparationPause(initial,a);
  assert.equal(isAutoPreparationPaused(paused,a),true);
  assert.equal(isAutoPreparationPaused(paused,b),false);
  assert.deepEqual(addAutoPreparationPause(paused,a),paused);
  const two=addAutoPreparationPause(paused,b);
  assert.equal(two.scopes.length,2);
  assert.throws(()=>readAutoPreparationPauses({...two,extra:true}),/取消记录/);
  assert.throws(()=>readAutoPreparationPauses({...two,scopes:[a,a]}),/取消记录/);
  assert.throws(()=>readAutoPreparationPauses({schemaVersion:1,scopes:[{...a,token:'secret'}]}),/取消记录/);
  assert.throws(()=>addAutoPreparationPause({schemaVersion:1,
    scopes:Array.from({length:64},(_,i)=>({accountId:'r'+i,serviceOrigin:'s'}))},
    {accountId:'new',serviceOrigin:'s'}),/记录已满/);
});
