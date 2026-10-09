import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePageCandidateDraft} from '../../src/ui/page-candidate-source.js';
import {parseUserScriptDependencies,assertUserScriptExecutable} from '../../src/scripting/user-scripts/dependency-metadata.js';

const src='async function main(){document.title = "page candidate";return 42;}';
const basic={sourceUtf8:src,entryFormat:'async-main',lockId:null,programId:'my-page-script',
  revision:1,previewUrl:'https://example.com/profile?myId=42#section'};

test('R12: ordinary Page JavaScript freezes a narrow origin rule, not a grant or native registration',()=>{
  const value=preparePageCandidateDraft(basic);
  assert.equal(value.generatedMatch,true);
  assert.equal(value.match,'https://example.com/*');
  assert.equal(value.sourceChanged,true);
  assert.match(value.request.sourceUtf8,/^\/\/ ==UserScript==\n\/\/ @match https:\/\/example\.com\/\*/);
  assert.equal(value.request.sourceUtf8.endsWith(src),true);
  assert.equal(value.request.programId,'my-page-script');
  assert.equal(value.request.revision,1);
  assert.equal(value.request.lockId,null);
  assert.equal(Object.hasOwn(value.request,'installationEnabled'),false);
  assert.equal(Object.hasOwn(value.request,'verification'),false);
  const parsed=parseUserScriptDependencies(value.request.sourceUtf8);
  const admission=assertUserScriptExecutable(parsed,{entryFormat:'async-main',phase:'registration',dependenciesLocked:true});
  assert.deepEqual(admission.nativeOptions.matches,['https://example.com/*']);
  assert.deepEqual(admission.nativeOptions.excludeMatches,[]);
  assert.equal(admission.nativeOptions.allFrames,false);
  assert.equal(admission.nativeOptions.runAt,'document_idle');
});

test('R12: explicit userscript metadata is preserved byte-for-byte, not silently broadened',()=>{
  const declared=['// ==UserScript==','// @match https://example.org/path/*',
    '// @run-at document-idle','// @noframes','// ==/UserScript==',src].join('\n');
  const result=preparePageCandidateDraft({...basic,sourceUtf8:declared});
  assert.equal(result.request.sourceUtf8,declared);
  assert.equal(result.generatedMatch,false);
  assert.equal(result.match,null);
  assertUserScriptExecutable(parseUserScriptDependencies(result.request.sourceUtf8),
    {entryFormat:'async-main',phase:'registration',dependenciesLocked:true});
});

test('R12: HTTP demo host is scoped by hostname; port is not allowed in match patterns',()=>{
  const result=preparePageCandidateDraft({...basic,previewUrl:'http://127.0.0.1:43111/demo-form.html'});
  assert.equal(result.match,'http://127.0.0.1/*');
  assert.deepEqual(assertUserScriptExecutable(parseUserScriptDependencies(result.request.sourceUtf8),
    {entryFormat:'async-main',phase:'registration',dependenciesLocked:true}).nativeOptions.matches,
  ['http://127.0.0.1/*']);
});

test('R12: rejected inputs cannot manufacture Candidate authority or widen match permissions',()=>{
  const invalid=[
    [{...basic,programId:'not a safe ID'},'E_REVISION'],
    [{...basic,revision:0},'E_REVISION'],
    [{...basic,revision:1.1},'E_REVISION'],
    [{...basic,entryFormat:'controller'},'E_ENTRY_FORMAT'],
    [{...basic,previewUrl:'file:///private/tmp/demo.html'},'E_PAGE_MATCH'],
    [{...basic,previewUrl:'https://[::1]/'},'E_PAGE_MATCH'],
    [{...basic,sourceUtf8:' '},'E_SOURCE'],
    [{...basic,sourceUtf8:'a'.repeat(131073)},'E_SOURCE']
  ];
  for(const [value,code] of invalid)assert.throws(()=>preparePageCandidateDraft(value),e=>e?.code===code);
});
