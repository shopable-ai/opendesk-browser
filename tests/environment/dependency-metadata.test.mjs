import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseUserScriptDependencies,requirePinnedDependencies} from '../../src/scripting/user-scripts/dependency-metadata.js';
const prefix='// ==UserScript==\n';
const suffix='\n// ==/UserScript==\nasync function main(){return true;}';
const read = src=>parseUserScriptDependencies(src);
const expectFail=(source,code)=>assert.throws(()=>read(source),error=>error.code===code);
test('regular async main without metadata stays compatible with Controller and Page preview',()=>{
  assert.deepEqual(read('async function main(){return true;}').requires,[]);
  assert.equal(read('async function main(){return true;}').hasHeader,false);
});
test('portable ordered @require URLs accept locked SHA256 hex or SRI Base64 and optional @match',()=>{
  const hash='a'.repeat(64);
  const b64=Buffer.from(hash,'hex').toString('base64');
  const src=prefix+'// @name Example\n// @match https://example.com/*\n'+
    '// @require https://cdn.example.com/a.js#sha256='+hash+'\n'+
    '// @require https://cdn.example.com/b.js#sha256-'+b64+suffix;
  const out=read(src);
  assert.equal(out.hasHeader,true);
  assert.deepEqual([...out.matches],['https://example.com/*']);
  assert.equal(out.requires[0].url,'https://cdn.example.com/a.js');
  assert.equal(out.requires[0].sha256,hash);
  assert.equal(out.requires[0].order,0);
  assert.equal(out.requires[1].sha256,hash);
  assert.equal(out.requires[1].order,1);
  assert.equal(requirePinnedDependencies(out).length,2);
});
test('unlocked standard @require remains parseable for explicit lock flow, but cannot execute',()=>{
  const out=read(prefix+'// @require https://example.com/library.js'+suffix);
  assert.equal(out.requires[0].sha256,null);
  assert.throws(()=>requirePinnedDependencies(out),e=>e.code==='E_DEPENDENCY_UNLOCKED');
});
test('reject unsafe URL schemes, missing headers, duplicates and malformed integrity',()=>{
  for(const bad of ['http://example.com/a.js','file:///tmp/a.js','javascript:alert(1)','https://u:p@x.example/a.js'])
    expectFail(prefix+'// @require '+bad+suffix,'E_DEPENDENCY_URL');
  expectFail(prefix+'// @require https://example.com/a.js#md5=abcd'+suffix,'E_DEPENDENCY_INTEGRITY');
  expectFail(prefix+'// @require https://example.com/a.js#sha256=oops'+suffix,'E_DEPENDENCY_INTEGRITY');
  expectFail(prefix+'// @require https://example.com/a.js\n// @require https://example.com/a.js'+suffix,'E_DEPENDENCY_DUPLICATE');
  expectFail(prefix+'// @require https://example.com/a.js\n'+
    'const userCode = 1;'+suffix,'E_METADATA_HEADER');
  expectFail(prefix+'// @name Unclosed','E_METADATA_HEADER');
});
test('fail closed for unsupported high-privilege directives and bounded dependency count',()=>{
  expectFail(prefix+'// @grant GM_xmlhttpRequest'+suffix,'E_GRANT_UNSUPPORTED');
  expectFail(prefix+'// @inject-into page'+suffix,'E_WORLD_NOT_APPROVED');
  expectFail(prefix+'// @resource css https://example.com/file.css'+suffix,'E_RESOURCE_UNSUPPORTED');
  let many=prefix;
  for(let i=0;i<9;i++)many+='// @require https://cdn.example.com/'+i+'.js\n';
  expectFail(many+suffix,'E_DEPENDENCY_LIMIT');
  assert.equal(createHash('sha256').update('unchanged source').digest('hex').length,64);
});
