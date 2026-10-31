import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from './helpers/controller-fixture.mjs';

test('redeeming while an ordinary site is selected cannot deliver a different member website session',async()=>{
  for(const [selection,host] of [['ordinary-0','localhost:7901'],['ordinary-1','127.0.0.1:7902']]){
    const e=await runtime();
    try{
      await e.chooseSite(selection);
      await e.click('local-connect');
      await e.preview();
      await e.click('redeem-confirm');
      assert.equal(e.fixture.ledger.size,1);
      assert.equal(e.get('member-state').textContent,'权益有效');
      assert.equal(e.get('site-select').value,selection);
      assert.ok(e.get('site-source').textContent.includes(host));
      assert.equal(e.get('cookie-install').hidden,true,'ordinary selection has no member delivery to install');
      assert.equal(e.get('shared-receive').hidden,true,'member recovery action belongs to the member website');
      assert.equal(e.calls.filter(row=>row.data?.operation==='sharedSession').length,0);
      assert.equal(e.cookieCalls.length,0);
      assert.equal(e.tabCalls.length,0);

      await e.chooseSite('commercial');
      await e.click('site-receive');
      assert.equal(e.calls.filter(row=>row.data?.operation==='sharedSession').length,1);
      assert.equal(e.get('cookie-install').hidden,false,'explicit member website acquisition remains available');
      assert.match(e.get('cookie-status').textContent,/127\.0\.0\.1:7898/);
      assert.equal(e.cookieCalls.length,0,'acquisition still requires a separate trusted write confirmation');
    }finally{e.release?.();}
  }
});
