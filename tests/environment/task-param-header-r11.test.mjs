import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileTaskSourceParams,parseTaskParamsHeader} from '../../scripts/compile-task-param-items.mjs';
import {leadingLineComments} from '../../src/scripting/source-trivia.js';

const read=name=>readFileSync(new URL('../../task-packs/examples/'+name,import.meta.url),'utf8');
const minimal=read('task-params-minimal.example.js');
const full=read('task-params-header.example.js');
const header=minimal.slice(0,minimal.indexOf('async function'));
const dependency='// ==UserScript==\n// @require https://example.com/lib.js\n// ==/UserScript==\n';
const packaged='// ==UserScript==\n// @opendesk-lib jquery\n// ==/UserScript==\n';

test('minimal and complete fixtures preserve their canonical parameter projection',()=>{
  const schema=compileTaskSourceParams(minimal);
  assert.deepEqual(schema,{
    paramsSchemaVersion:2,
    paramsSchema:{type:'object',properties:{keyword:{type:'string',title:'关键词',minLength:1},limit:{type:'integer',title:'数量',default:20,minimum:1,maximum:100}},required:['keyword'],additionalProperties:false},
    paramsUi:{version:1,order:['keyword','limit'],fields:{}}
  });
  assert.equal(Object.keys(compileTaskSourceParams(full).paramsSchema.properties).length,14);
  assert.equal(new Set(parseTaskParamsHeader(full).paramItems.map(item=>item.type)).size,12);
});

test('copyright and separate dependency declarations coexist in either order',()=>{
  const expected=compileTaskSourceParams(minimal);
  for(const source of ['/* Copyright\n * License */\n'+minimal,'// Copyright\n'+dependency+minimal,header+dependency+'async function main() {}','\ufeff'+dependency+minimal,packaged+minimal,header+packaged+'async function main() {}']){
    assert.deepEqual(compileTaskSourceParams(source),expected);
  }
});

test('actual line comments only: block comment, string, template and body markers are ignored',()=>{
  for(const source of ['/*\n'+header+'*/\nasync function main() {}','const s='+JSON.stringify(header)+';\n'+minimal,'const s=`\n'+header+'`;\n'+minimal,'async function main() {}\n'+minimal]){
    assert.equal(compileTaskSourceParams(source),null);
  }
  assert.deepEqual(compileTaskSourceParams('/*\n'+header+'*/\n'+minimal),compileTaskSourceParams(minimal));
  assert.deepEqual(compileTaskSourceParams(minimal+'\n'+header),compileTaskSourceParams(minimal));
});

test('duplicate, malformed, orphaned and unknown headers fail closed before code',()=>{
  for(const source of [header+header+'async function main() {}',header+'// other\n'+header,header+'// ==/OpenDeskParams==\n', '// ==/OpenDeskParams==\n'+minimal,'// ==OpenDeskParams\n'+minimal,'//==OpenDeskParams==\n'+minimal, minimal.replace('@version 1','@version 2'),minimal.replace('// ==/OpenDeskParams==','// missing')]){
    assert.throws(()=>compileTaskSourceParams(source),TypeError);
  }
  assert.throws(()=>compileTaskSourceParams('/* copyright */\n'+minimal.replace('@version 1','@version 2')),/line 3/);
  assert.deepEqual(parseTaskParamsHeader('// ==OpenDeskParams==\n// @version 1\n// ==/OpenDeskParams==\n'),{paramItemsVersion:1,paramItems:[]});
});

test('UTF-8 metadata budget is enforced independently of unrelated leading copyright',()=>{
  const wrap=s=>'// ==OpenDeskParams==\n// @version 1\n// @param text s "'+s+'"\n// ==/OpenDeskParams==\n';
  assert.throws(()=>parseTaskParamsHeader(wrap('汉'.repeat(23000))),/64 KiB UTF-8/);
  assert.throws(()=>parseTaskParamsHeader(wrap('a'.repeat(66000))),/64 KiB UTF-8/);
  assert.deepEqual(compileTaskSourceParams('/*'+'a'.repeat(66000)+'*/\n'+minimal),compileTaskSourceParams(minimal));
});

test('shared scan follows ECMAScript line endings and stops at first token',()=>{
  const expected=compileTaskSourceParams(minimal);
  for(const eol of ['\r\n','\r','\u2028','\u2029']){
    assert.deepEqual(compileTaskSourceParams(('/* copyright */\n'+minimal).replaceAll('\n',eol)),expected);
  }
  const rows=[...leadingLineComments('\ufeff /* one\r\ntwo */\r// copyright\u2028  // next\nlet x;\n// ignored')];
  assert.deepEqual(rows.map(({raw,line})=>({raw,line})),[{raw:'// copyright',line:3},{raw:'// next',line:4}]);
});

test('parameter authoring examples share one home; derived data agrees with source and old copies are absent',()=>{
  assert.deepEqual(parseTaskParamsHeader(full),JSON.parse(read('task-param-items.example.json')));
  assert.deepEqual(compileTaskSourceParams(full),JSON.parse(read('task-params-v2.example.json')));
  for(const name of ['task-params-minimal.example.js','task-params-header.example.js','task-param-items.example.json','task-params-v2.example.json']){
    assert.throws(()=>readFileSync(new URL('../../examples/tasks/'+name,import.meta.url)),{code:'ENOENT'});
  }
});
