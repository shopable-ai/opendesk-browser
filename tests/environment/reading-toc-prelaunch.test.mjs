import test from 'node:test';
import assert from 'node:assert/strict';
import {READING_TOC_RELEASE_IDENTITY_REQUIRED,verifyOfficialReadingToc,tocGrantAllowed,
  changeTocSiteAllowed,changeTocPageAllowed,readingTocPageAllowed}
  from '../../examples/sidebar-tools/reading-toc/trusted/policy.js';

const tool={format:'opendesk.sidebar-tool.v1',id:'reading-toc',version:'1.0.7',
  title:'阅读目录',description:'Local reader',capabilities:['page.toc'],
  html:'<main>目录</main>',css:'',js:'void 0;'};
const url='https://example.com/article';

test('prelaunch readers work without pinned release bytes or marketplace provenance',async()=>{
  assert.equal(READING_TOC_RELEASE_IDENTITY_REQUIRED,false);
  for(const provenance of [undefined,{},
    {'reading-toc':{marketId:'opendesk/reading-toc',version:'1.0.0',sha256:'0'.repeat(64)}}]){
    const verified=await verifyOfficialReadingToc([tool],provenance);
    assert.equal(verified,true);
    assert.equal(tocGrantAllowed([tool],{},tool.id,url,{},verified),true);
    assert.equal(await verifyOfficialReadingToc([tool],provenance,true),false,
      'strict release policy remains available without gating prelaunch access');
  }
});

test('prelaunch admission still requires one valid installed reader with page.toc',async()=>{
  for(const installed of [undefined,{},[],[tool,tool],[{...tool,id:'other-toc'}],
    [{...tool,capabilities:[]}],[{...tool,format:'invalid'}]])
    assert.equal(await verifyOfficialReadingToc(installed,{}),false);
});

test('prelaunch readers honor disable, site/page stops and ordinary HTTP(S) scope',async()=>{
  const installed=[tool],verified=await verifyOfficialReadingToc(installed,{});
  assert.equal(tocGrantAllowed(installed,{},tool.id,url,{[tool.id]:false},verified),false);
  assert.equal(tocGrantAllowed(installed,{},tool.id,url,{[tool.id]:'false'},verified),false);
  assert.equal(tocGrantAllowed(installed,changeTocSiteAllowed({},tool.id,url,false),
    tool.id,url,{},verified),false);
  assert.equal(readingTocPageAllowed(changeTocPageAllowed({},tool.id,url,false),tool.id,url),false);
  for(const denied of ['chrome://settings','file:///private/article','about:blank'])
    assert.equal(tocGrantAllowed(installed,{},tool.id,denied,{},verified),false);
  const other={...tool,id:'other-toc'};
  assert.equal(tocGrantAllowed([other],{},other.id,url,{},verified),false);
  assert.equal(tocGrantAllowed([other],{[other.id]:['https://example.com']},other.id,url),true);
});
