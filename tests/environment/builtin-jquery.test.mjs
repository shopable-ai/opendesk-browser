import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {pageWantsJquery,compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {JQUERY_371} from '../../src/scripting/user-scripts/packaged-dependencies.js';
globalThis.crypto ||= webcrypto;
const source='// @opendesk-lib jquery\nasync function main(){return $(".item").length;}';
const header=['// ==UserScript==','// @match https://example.com/*',
  '// @opendesk-lib jquery','// ==/UserScript==','async function main(){return jQuery.fn.jquery;}'].join('\n');
const errorCode=code=>error=>error.code===code;
test('only a leading static declaration or UserScript header activates packaged jQuery',()=>{
  assert.equal(pageWantsJquery(source),true);
  assert.equal(pageWantsJquery(header),true);
  assert.equal(pageWantsJquery('async function main(){return "/* @opendesk-lib jquery */"}'),false);
  assert.equal(pageWantsJquery('const x=1;\n// @opendesk-lib jquery'),false);
  assert.equal(pageWantsJquery('async function main(){return typeof $}'),false);
  for(const invalid of ['// @opendesk-lib axios\nasync function main(){}',
    '// ==UserScript==\n// @opendesk-lib jquery\n// @opendesk-lib jquery\n// ==/UserScript==\nasync function main(){}'])
    assert.throws(()=>pageWantsJquery(invalid),errorCode('E_BUILTIN_DECLARATION'));
  const mixed='// ==UserScript==\n// @opendesk-lib jquery\n// @require https://cdn.example.org/jquery.js\n// ==/UserScript==\nasync function main(){}';
  assert.throws(()=>pageWantsJquery(mixed),errorCode('E_BUILTIN_CONFLICT'));
});
test('optional jQuery uses the already audited extension bytes before user JS in one USER_SCRIPT source',async()=>{
  const jqueryCode=await readFile('src/vendor/jquery-3.7.1.min.js','utf8');
  assert.equal(createHash('sha256').update(jqueryCode).digest('hex'),JQUERY_371.sha256);
  const row=await compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',jqueryCode});
  assert.equal(row.world,'USER_SCRIPT');
  assert.equal(row.packagedJquerySha256,JQUERY_371.sha256);
  assert.equal(row.js.length,1);
  const code=row.js[0].code;
  assert.ok(code.includes(jqueryCode));
  assert.ok(code.indexOf('E_BUILTIN_COLLISION')<code.indexOf(jqueryCode));
  assert.ok(code.indexOf(jqueryCode)<code.indexOf('async function main()'));
  assert.ok(code.includes('E_DEPENDENCY_NOT_READY'));
  assert.ok(!code.includes('chrome.runtime'));
  assert.equal(row.sourceHash,createHash('sha256').update(source).digest('hex'));
  await assert.rejects(compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main'}),errorCode('E_DEPENDENCY_HASH'));
  await assert.rejects(compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',jqueryCode:'modified'}),errorCode('E_DEPENDENCY_HASH'));
  await assert.rejects(compileLockedPageSource({sourceUtf8:'async function main(){}',entryFormat:'async-main',jqueryCode}),errorCode('E_BUILTIN_CONFLICT'));
});
test('default Page scripts do not obtain website globals or opt-in packages implicitly',async()=>{
  const plain=await compileLockedPageSource({sourceUtf8:'async function main(){return typeof jQuery}',entryFormat:'async-main'});
  assert.equal(plain.js.length,1);
  assert.equal(Object.hasOwn(plain,'packagedJquerySha256'),false);
  assert.equal(plain.js[0].code.includes('3.7.1'),false);
  assert.equal(await vm.runInNewContext(plain.js[0].code,{}),'undefined');
});
