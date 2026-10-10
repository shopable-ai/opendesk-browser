import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePageCandidateDraft} from '../../src/ui/page-candidate-source.js';
import {parseUserScriptDependencies,assertUserScriptExecutable} from '../../src/scripting/user-scripts/dependency-metadata.js';
import {validatePageProgramRules} from '../../src/scripting/user-scripts/page-program-rules.js';

const src='async function main(){document.title = "page candidate";return 42;}';
const basic={sourceUtf8:src,entryFormat:'async-main',lockId:null,programId:'my-page-script',
  revision:1,previewUrl:'https://example.com/profile?myId=42#section'};

test('native Page JavaScript keeps original bytes and freezes scheduling outside source',()=>{
  const value=preparePageCandidateDraft(basic);
  assert.equal(value.generatedMatch,true);
  assert.equal(value.match,'*://*/*');
  assert.equal(value.sourceChanged,false);
  assert.equal(value.request.sourceUtf8,src);
  assert.equal(parseUserScriptDependencies(value.request.sourceUtf8).hasHeader,false);
  assert.equal(value.request.programId,'my-page-script');
  assert.equal(value.request.revision,1);
  assert.equal(value.request.lockId,null);
  assert.equal(Object.hasOwn(value.request,'installationEnabled'),false);
  assert.equal(Object.hasOwn(value.request,'verification'),false);
  assert.deepEqual(value.request.pageRules,{matches:['*://*/*'],excludeMatches:[],
    allFrames:false,runAt:'document_idle',world:'USER_SCRIPT'});
  assert.ok(Object.isFrozen(value.request.pageRules));
  assert.throws(()=>value.request.pageRules.matches.push('https://evil.example/*'),TypeError);
  assert.match(value.summary,/源码保持原样/);
});

test('explicit legacy metadata is preserved byte-for-byte, not silently broadened',()=>{
  const declared=['// ==UserScript==','// @match https://example.org/path/*',
    '// @run-at document-idle','// @noframes','// ==/UserScript==',src].join('\n');
  const result=preparePageCandidateDraft({...basic,sourceUtf8:declared});
  assert.equal(result.request.sourceUtf8,declared);
  assert.equal(result.generatedMatch,false);
  assert.equal(result.sourceChanged,false);
  assert.equal(result.match,null);
  assert.equal(Object.hasOwn(result.request,'pageRules'),false);
  assertUserScriptExecutable(parseUserScriptDependencies(result.request.sourceUtf8),
    {entryFormat:'async-main',phase:'registration',dependenciesLocked:true});
});

test('HTTP demo and HTTPS use the same all-site default, not a current-host grant',()=>{
  const result=preparePageCandidateDraft({...basic,previewUrl:'http://127.0.0.1:43111/demo-form.html'});
  assert.equal(result.match,'*://*/*');
  assert.deepEqual(validatePageProgramRules(result.request.pageRules).matches,['*://*/*']);
  assert.equal(result.request.sourceUtf8,src);
  assert.match(result.summary,/不同端口/);
  assert.deepEqual(result.request.pageRules.matches,preparePageCandidateDraft(basic).request.pageRules.matches);
});

test('invalid inputs cannot manufacture Candidate authority or unsafe match scope',()=>{
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

test('explicit native settings are copied without source rewriting or implicit new permissions',()=>{
  const pageRules={matches:['https://example.com/narrow/*'],excludeMatches:[],
    allFrames:false,runAt:'document_idle',world:'USER_SCRIPT'};
  const result=preparePageCandidateDraft({...basic,pageRules});
  pageRules.matches[0]='https://evil.example/*';
  assert.deepEqual(result.request.pageRules.matches,['https://example.com/narrow/*']);
  assert.equal(result.generatedMatch,false);
  assert.equal(result.request.sourceUtf8,src);
  const full=src+' '.repeat(128*1024-new TextEncoder().encode(src).byteLength);
  assert.equal(preparePageCandidateDraft({...basic,sourceUtf8:full}).request.sourceUtf8,full);
  assert.throws(()=>preparePageCandidateDraft({...basic,pageRules:null}),{code:'E_PAGE_CONTRACT'});
  assert.throws(()=>preparePageCandidateDraft({...basic,pageRules:{...pageRules,matches:['<all_urls>']}}),{code:'E_PAGE_MATCH'});
});
