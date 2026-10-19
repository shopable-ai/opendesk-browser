import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCookieImportIntentGate} from '../../src/ui/sidebar-tools/cookie-import-intent.js';

test('untrusted operations cannot mint an import intent without user activation',()=>{
  const gate=createCookieImportIntentGate();
  assert.throws(()=>gate.start({owner:'official/instance',origin:'https://example.com',
    verifiedUserActivation:false}),{code:'E_USER_GESTURE_REQUIRED'});
  assert.equal(gate.acquire({owner:'official/instance',origin:'https://example.com',count:25}),false);
});
test('one trusted user action covers 25, 50 and 100 bounded batches',()=>{
  const gate=createCookieImportIntentGate();
  const owner='official/instance',origin='https://example.com';
  assert.equal(gate.start({owner,origin,verifiedUserActivation:true}).authorized,true);
  for(const count of [25,50,25]){
    assert.equal(gate.acquire({owner,origin,count}),true);
    assert.throws(()=>gate.acquire({owner,origin,count:1}),{code:'E_BUSY'});
    gate.settle({owner,count,confirmed:true});
  }
  assert.equal(gate.acquire({owner,origin,count:900}),true);
  gate.settle({owner,count:900,confirmed:true});
  assert.equal(gate.acquire({owner,origin,count:1}),false);
});
test('wrong owner, wrong origin, expiration and unknown failures cannot reuse a click',()=>{
  let time=100;
  const gate=createCookieImportIntentGate({now:()=>time});
  gate.start({owner:'a',origin:'https://a.test',verifiedUserActivation:true});
  assert.equal(gate.acquire({owner:'b',origin:'https://a.test',count:1}),false);
  assert.throws(()=>gate.acquire({owner:'a',origin:'https://b.test',count:1}),{code:'E_DOCUMENT_CHANGED'});
  assert.equal(gate.acquire({owner:'a',origin:'https://a.test',count:1}),false);
  gate.start({owner:'a',origin:'https://a.test',verifiedUserActivation:true});
  assert.equal(gate.acquire({owner:'a',origin:'https://a.test',count:25}),true);
  gate.settle({owner:'a',count:25,confirmed:false});
  assert.equal(gate.acquire({owner:'a',origin:'https://a.test',count:1}),false);
  gate.start({owner:'a',origin:'https://a.test',verifiedUserActivation:true});
  time+=120000;
  assert.throws(()=>gate.acquire({owner:'a',origin:'https://a.test',count:1}),{code:'E_DOCUMENT_CHANGED'});
});
test('verified official package, original Host approval and existing review survive',async()=>{
  const code=await readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
  assert.match(code,/navigator\?\.userActivation\?\.isActive===true/);
  assert.match(code,/matchesOfficialRelease\(release,tool\)/);
  assert.match(code,/grant\?\.sha256===release\.sha256/);
  assert.match(code,/cookieSiteRecord\(tool,origin\)\?\.write!==true/);
  assert.match(code,/cookieImportGate\.acquire/);
  assert.match(code,/operation:'browser\.intent\.confirm'/);
  assert.match(code,/cookieImportGate\.settle/);
  assert.match(code,/if\(!importBatchOwner&&!writeIntentOwner\)/);
});

test('a delayed finish from an earlier click cannot cancel a newer import',()=>{
  const gate=createCookieImportIntentGate(),owner='cookie-editor/install/instance';
  const origin='https://example.com';
  const first=gate.start({owner,origin,verifiedUserActivation:true});
  const second=gate.start({owner,origin,verifiedUserActivation:true});
  assert.notEqual(first.ref,second.ref);
  assert.deepEqual(gate.close(owner,first.ref),{closed:false});
  assert.equal(gate.acquire({owner,origin,count:25}),true);
  gate.settle({owner,count:25,confirmed:true});
  assert.deepEqual(gate.close(owner,second.ref),{closed:true});
  assert.equal(gate.acquire({owner,origin,count:1}),false);
});
