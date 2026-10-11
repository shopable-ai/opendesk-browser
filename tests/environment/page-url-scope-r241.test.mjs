import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageProgramURLMatcher,pageProgramUrlMatches,isPageMatchPattern,validatePageProgramRules}
  from '../../src/scripting/user-scripts/page-program-rules.js';

const rules=(matches,excludeMatches=[])=>({matches,excludeMatches,runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'});
const checkBad=s=>assert.throws(()=>validatePageProgramRules(rules([s])),e=>e.code==='E_PAGE_MATCH');

test('R24.1 inclusions/exclusions, scheme, multiple sites, paths and query',()=>{
  const m=createPageProgramURLMatcher(rules(
    ['https://example.com/read/*','http://localhost/fixture/*'],
    ['https://example.com/read/private/*','http://localhost/fixture/secret*']));
  assert.equal(m('https://example.com/read/hello?mode=1#frag'),true);
  assert.equal(m('https://example.com/read/private/a'),false);
  assert.equal(m('https://example.com/reading/x'),false);
  assert.equal(m('http://example.com/read/hello'),false);
  assert.equal(m('http://localhost/fixture/a#hash'),true);
  assert.equal(m('http://localhost/fixture/secret-file'),false);
  assert.equal(m('https://evil-example.com/read/a'),false);
  assert.equal(m('file:///tmp/a'),false);
  assert.equal(m('not a URL'),false);
});

test('R24.1 wildcard subdomains match apex and real descendants only',()=>{
  const m=createPageProgramURLMatcher(rules(['*://*.example.com/*','https://second.example/*']));
  assert.equal(m('https://example.com/'),true);
  assert.equal(m('http://a.b.example.com/'),true);
  assert.equal(m('https://second.example/path'),true);
  assert.equal(m('https://example.com.evil.invalid/'),false);
  assert.equal(m('https://notexample.com/'),false);
  assert.equal(m('ftp://a.example.com/'),false);
});

test('R24.1 match paths include query, ignore fragment, exclude wins',()=>{
  const m=rules(['https://docs.example/item?view=*'],['https://docs.example/item?view=private*']);
  assert.equal(pageProgramUrlMatches(m,'https://docs.example/item?view=public#private'),true);
  assert.equal(pageProgramUrlMatches(m,'https://docs.example/item?view=private#public'),false);
  assert.equal(pageProgramUrlMatches(m,'https://docs.example/item#view=public'),false);
});

test('R24.1 pattern matching is not localhost exact-port authorization',()=>{
  const m=createPageProgramURLMatcher(rules(['http://127.0.0.1/*']));
  assert.equal(m('http://127.0.0.1:43111/demo-form.html'),true);
  assert.equal(m('http://127.0.0.1:43112/demo-form.html'),true);
  for(const pattern of ['http://localhost:43111/*','https://example.com:*/*',
    'https://example.com:99999/*','<all_urls>','file:///*',
    'https://example.com/#fragment','https://example.com/\\foo']){
    assert.equal(isPageMatchPattern(pattern),false,pattern);checkBad(pattern);
  }
});

test('R24.1 malformed rule never becomes a permissive matcher',()=>{
  assert.throws(()=>createPageProgramURLMatcher({...rules(['https://a.example/*']),world:'MAIN'}),e=>e.code==='E_WORLD_NOT_APPROVED');
  assert.throws(()=>createPageProgramURLMatcher(rules([])),e=>e.code==='E_PAGE_MATCH');
  assert.throws(()=>createPageProgramURLMatcher(rules(['https://a.example/*','https://a.example/*'])),e=>e.code==='E_PAGE_RULES');
});
