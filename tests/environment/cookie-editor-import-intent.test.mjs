import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCookieImportIntentGate as createStrictGate} from '../../src/ui/sidebar-tools/cookie-import-intent.js';
const documentFor=origin=>({tabId:12,windowId:7,documentId:'doc-1',url:origin+'/page',origin});
// Existing regression calls now pass a real same-document identity to strict gate.
const createCookieImportIntentGate=options=>{
  const gate=createStrictGate(options);
  return Object.freeze({...gate,
    start:args=>gate.start({...args,document:args.document??documentFor(args.origin)}),
    acquire:args=>gate.acquire({...args,document:args.document??documentFor(args.sourceOrigin??args.origin)})});
};

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
test('one official click admits destination domains only while the source remains unchanged',()=>{
  const gate=createCookieImportIntentGate(),owner='official/cookie-editor';
  const source='https://shop.example.com',destination='https://accounts.example.net';
  const session=gate.start({owner,origin:source,verifiedUserActivation:true,multiOrigin:true});
  assert.equal(gate.acquire({owner,origin:destination,sourceOrigin:source,count:30}),true);
  gate.settle({owner,count:30,confirmed:true});
  assert.throws(()=>gate.acquire({owner,origin:destination,sourceOrigin:'https://wrong.example',count:1}),
    {code:'E_DOCUMENT_CHANGED'});
  assert.equal(gate.acquire({owner,origin:destination,sourceOrigin:source,count:1}),false);
  assert.deepEqual(gate.close(owner,session.ref),{closed:false});
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

test('Chrome document identity is mandatory and a reload or tab switch revokes import',()=>{
  const origin='https://shop.example.com',owner='official',gate=createStrictGate();
  const document=documentFor(origin);
  assert.throws(()=>gate.start({owner,origin,verifiedUserActivation:true}),{code:'E_SCHEMA'});
  gate.start({owner,origin,document,multiOrigin:true,verifiedUserActivation:true});
  assert.throws(()=>gate.acquire({owner,origin:'https://auth.example.org',sourceOrigin:origin,
    count:15,document:{...document,documentId:'new-document'}}),{code:'E_DOCUMENT_CHANGED'});
  assert.equal(gate.acquire({owner,origin:'https://auth.example.org',sourceOrigin:origin,
    count:15,document}),false);
  gate.start({owner,origin,document,multiOrigin:true,verifiedUserActivation:true});
  assert.throws(()=>gate.acquire({owner,origin:'https://auth.example.org',sourceOrigin:origin,
    count:15,document:{...document,tabId:99}}),{code:'E_DOCUMENT_CHANGED'});
});
test('native approval and per-write callback verify original Chrome document',async()=>{
  const [panel,host]=await Promise.all([
    readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8'),
    readFile(new URL('../../src/platform/chrome/context-menus.js',import.meta.url),'utf8')
  ]);
  assert.match(panel,/captureCookieImportDocument/);
  assert.match(panel,/cookieImportSource:sourceOrigin,document/);
  assert.match(host,/verifyCookieImportDocument\(document,cookieImportSource\)/);
  assert.match(host,/verifyCookieImportDocument\(importDocument,importSource\)/);
});
