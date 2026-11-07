import test from 'node:test';
import assert from 'node:assert/strict';
import {checkKey,canReuse,validateDevUrl} from '../preview/react/check-accounts.mjs';

const inputs={sourceHash:'source',checks:{runner:'a',test:'b'},browser:'Chrome 155',
 node:'24.15.0',platform:'darwin-arm64',selection:'account layout spacing and receive return'};
test('account check reuse follows relevant inputs rather than Git HEAD',()=>{
 const key=checkKey(inputs);
 assert.equal(checkKey({...inputs}),key);
 for(const change of [{sourceHash:'new source'},{checks:{runner:'new',test:'b'}},
  {browser:'Chrome 156'},{node:'24.16.0'},{platform:'linux-x64'},
  {selection:'a different selection'}])assert.notEqual(checkKey({...inputs,...change}),key);
});
test('only a successful current-source account check with the same inputs can be reused',()=>{
 const key=checkKey(inputs);
 const receipt={format:'opendesk.cookie-account-ui-check.v1',status:'PASS',
  mode:'CURRENT_SOURCE_DEV',key};
 assert.equal(canReuse(receipt,key),true);
 for(const bad of [null,{}, {...receipt,status:'FAIL'}, {...receipt,status:'RUNNING'},
  {...receipt,mode:'STATIC'}, {...receipt,format:'other'}, {...receipt,key:'old'}])
  assert.equal(canReuse(bad,key),false);
});
test('account UI checks accept only the existing loopback dev page',()=>{
 assert.equal(validateDevUrl('http://127.0.0.1:43134/dev.html').hostname,'127.0.0.1');
 for(const url of ['https://example.com/dev.html','http://127.0.0.1:43134/other',
  'http://user:secret@127.0.0.1:43134/dev.html','file:///dev.html'])
  assert.throws(()=>validateDevUrl(url));
});
