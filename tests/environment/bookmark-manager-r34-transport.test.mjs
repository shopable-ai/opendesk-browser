import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the actual dispatch/receipt boundary without calling Chrome or
// inventing another implementation. Full integration is the native UI suite.
const source=await readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
const start=source.indexOf('      let reply;\n      try{\n');
const end=source.indexOf('        if(importBatchOwner){',start);
assert.ok(start>=0&&end>start);
const dispatch=new Function('api','operation','envelope','assertSession','source','token',
  'return (async()=>{'+source.slice(start,end)+'return reply;}catch(error){throw error;}})();');
const run=(operation,sendMessage)=>dispatch({runtime:{sendMessage}},operation,{},()=>{},null,null);

test('R3.4 lost mutation replies fail unknown without dispatching twice',async()=>{
 for(const operation of ['create','update','move','remove','removeTree']){
  let nativeWrites=0;
  await assert.rejects(run('browser.bookmarks.'+operation,async()=>{
   nativeWrites++;throw Error('Message port closed after native commit');
  }),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(nativeWrites,1);
 }
});
test('R3.4 malformed mutation receipts are unknown; explicit Host denials stay definite',async()=>{
 await assert.rejects(run('browser.bookmarks.create',async()=>undefined),{code:'E_OUTCOME_UNKNOWN'});
 for(const code of ['E_CANCELLED','E_GRANT_REVOKED','E_BOOKMARK_STALE'])
  await assert.rejects(run('browser.bookmarks.create',async()=>({ok:false,error:{code,message:'denied'}})),{code});
 assert.deepEqual(await run('browser.bookmarks.create',async()=>({ok:true,data:{id:'real-id'}})),{ok:true,data:{id:'real-id'}});
});
test('R3.4 read transport errors retain their original non-write meaning',async()=>{
 const error=Error('disconnected');
 await assert.rejects(run('browser.bookmarks.getTree',async()=>{throw error}),e=>e===error);
});
