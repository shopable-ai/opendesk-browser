import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCookieWriteIntentGate} from '../../src/ui/sidebar-tools/cookie-write-intent.js';

const owner='official-cookie-editor/installation/frame',origin='https://example.com';
const args={owner,origin,name:'session_id',path:'/'};
test('untrusted requests cannot authorize a save without a user click',()=>{
  const gate=createCookieWriteIntentGate();
  assert.throws(()=>gate.start({...args,verifiedUserActivation:false}),
    {code:'E_USER_GESTURE_REQUIRED'});
  assert.equal(gate.acquire(args),false);
});
test('a Save grants one bound request, then it cannot be reused',()=>{
  const gate=createCookieWriteIntentGate();
  const first=gate.start({...args,verifiedUserActivation:true});
  assert.equal(gate.acquire(args),true);
  assert.throws(()=>gate.acquire(args),{code:'E_BUSY'});
  gate.settle({owner});
  assert.equal(gate.acquire(args),false);
  assert.deepEqual(gate.close(owner,first.ref),{closed:false});
});
test('other names, paths, sites, owners and stale sessions cannot reuse a click',()=>{
  let now=100;
  const gate=createCookieWriteIntentGate({now:()=>now});
  const first=gate.start({...args,verifiedUserActivation:true});
  assert.equal(gate.acquire({...args,owner:'clone'}),false);
  assert.throws(()=>gate.acquire({...args,name:'other'}),{code:'E_DOCUMENT_CHANGED'});
  assert.equal(gate.acquire(args),false);
  const second=gate.start({...args,verifiedUserActivation:true});
  assert.deepEqual(gate.close(owner,first.ref),{closed:false});
  assert.throws(()=>gate.acquire({...args,path:'/other'}),{code:'E_DOCUMENT_CHANGED'});
  gate.start({...args,verifiedUserActivation:true});
  now+=120000;
  assert.throws(()=>gate.acquire(args),{code:'E_DOCUMENT_CHANGED'});
  assert.deepEqual(gate.close(owner,second.ref),{closed:false});
});
test('Host mints a single exact approval and preserves review for other callers',async()=>{
  const code=await readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
  assert.match(code,/cookieEditor\.write\.begin/);
  assert.match(code,/cookieWriteGate\.acquire/);
  assert.match(code,/if\(!importBatchOwner&&!writeIntentOwner\)/);
  assert.match(code,/operation:'browser\.intent\.confirm'/);
  assert.match(code,/matchesOfficialRelease\(release,tool\)/);
});

test('one trusted Delete click authorizes only the exact Cookie removal',()=>{
  const gate=createCookieWriteIntentGate();
  const remove=gate.start({...args,action:'remove',verifiedUserActivation:true});
  assert.equal(remove.authorized,true);
  assert.throws(()=>gate.acquire({...args,action:'set'}),{code:'E_DOCUMENT_CHANGED'});
  assert.equal(gate.acquire({...args,action:'remove'}),false);
  gate.start({...args,action:'remove',verifiedUserActivation:true});
  assert.equal(gate.acquire({...args,action:'remove'}),true);
  gate.settle({owner});
  assert.equal(gate.acquire({...args,action:'remove'}),false);
});
test('single-delete React and Host use the existing write-intent gate',async()=>{
  const [panel,app,adapter]=await Promise.all([
    readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8'),
    readFile(new URL('../../examples/sidebar-tools/cookie-editor/app/CookieEditorApp.jsx',import.meta.url),'utf8'),
    readFile(new URL('../../examples/sidebar-tools/cookie-editor/app/adapters/browser-sdk.js',import.meta.url),'utf8')
  ]);
  assert.match(panel,/\['browser\.cookies\.set','browser\.cookies\.remove'\]\.includes\(operation\)/);
  assert.match(panel,/action:operation==='browser\.cookies\.remove'\?'remove':'set'/);
  assert.match(app,/adapter\.beginRemoveIntent\(state\.target,row\)/);
  assert.match(adapter,/action:'remove'/);
});
