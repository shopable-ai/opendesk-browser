// The real bridge emits root events on navigation and tool-state changes.
// This contract is source-level only; genuine Chrome events are tested by CDP.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=()=>readFile(new URL('../../examples/sidebar-tools/adblock/src/App.jsx',import.meta.url),'utf8');
test('AdBlock React subscribes to the sandbox bridge root, never a missing parent postMessage',async()=>{
  const code=await src();
  for(const name of ['opendesk-page-changed','opendesk-tool-state-changed']){
    assert.ok(code.includes("addEventListener?.('"+name+"',onPageChanged)"));
    assert.ok(code.includes("removeEventListener?.('"+name+"',onPageChanged)"));
  }
  assert.doesNotMatch(code,/event\.data\?\.kind==='page-changed'/);
});
test('context invalidation disables stale site actions ahead of async status read',async()=>{
  const code=await src();
  assert.match(code,/const onPageChanged=\(\)=>\{[\s\S]*?current\.current=null;setState\(null\);setLoading\(true\);[\s\S]*?void refresh\(\);/);
  assert.match(code,/const host=state\?\.currentSite\?\.status==='ready'\?state\.currentHost:null/);
  assert.match(code,/const siteLocked=switchLocked\|\|!on\|\|!host;/);
});
