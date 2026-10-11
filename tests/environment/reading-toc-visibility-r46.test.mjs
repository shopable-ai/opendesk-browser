import test from 'node:test';
import assert from 'node:assert/strict';
import {READING_TOC_VISIBILITY_STORE,readingTocPageScope,readingTocDisplayState,
  changeReadingTocVisibility,changeTocGrant,tocGrantAllowed} from '../../src/reading-toc/policy.js';

const id='reading-toc';
const page='https://chatgpt.com/c/one?search=secret#private';
const other='https://chatgpt.com/c/two';
const tool={format:'opendesk.sidebar-tool.v1',id,version:'1.0.2',
  title:'阅读目录',description:'Official',capabilities:['page.toc'],html:'<main></main>',css:'',js:'void 0;'};

test('R4.6 hides a specific route without persisting queries or hiding another route',()=>{
  assert.equal(readingTocPageScope(page),'https://chatgpt.com/c/one');
  let preferences=changeReadingTocVisibility({},id,page,'page',true);
  assert.deepEqual(preferences[id],{hiddenSites:[],hiddenPages:['https://chatgpt.com/c/one']});
  assert.equal(JSON.stringify(preferences).includes('secret'),false);
  assert.deepEqual(readingTocDisplayState(preferences,id,page),
    {hiddenOnSite:false,hiddenOnPage:true,show:false});
  assert.equal(readingTocDisplayState(preferences,id,'https://chatgpt.com/c/one?other=yes').show,false);
  assert.equal(readingTocDisplayState(preferences,id,other).show,true);
  preferences=changeReadingTocVisibility(preferences,id,'https://chatgpt.com/c/one','page',false);
  assert.deepEqual(preferences,{});
});

test('R4.6 site-level hidden preference covers sibling pages and restores independently',()=>{
  let preferences=changeReadingTocVisibility({},id,page,'site',true);
  assert.equal(readingTocDisplayState(preferences,id,page).show,false);
  assert.equal(readingTocDisplayState(preferences,id,other).show,false);
  assert.equal(readingTocDisplayState(preferences,id,'https://example.org/article').show,true);
  preferences=changeReadingTocVisibility(preferences,id,page,'page',true);
  preferences=changeReadingTocVisibility(preferences,id,page,'site',false);
  assert.deepEqual(readingTocDisplayState(preferences,id,page),
    {hiddenOnSite:false,hiddenOnPage:true,show:false});
  assert.equal(readingTocDisplayState(preferences,id,other).show,true);
  preferences=changeReadingTocVisibility(preferences,id,page,'page',false);
  assert.deepEqual(preferences,{});
});

test('R4.6 display choices cannot grant/revoke page.toc and are scoped per tool',()=>{
  const grants=changeTocGrant({},id,page,true);
  const preferences=changeReadingTocVisibility({},id,page,'site',true);
  assert.equal(tocGrantAllowed([tool],grants,id,page),true);
  assert.equal(readingTocDisplayState(preferences,id,page).show,false);
  assert.equal(readingTocDisplayState(preferences,'other-toc',page).show,true);
  assert.equal(tocGrantAllowed([tool],grants,'other-toc',page),false);
  assert.match(READING_TOC_VISIBILITY_STORE,/toc-visibility/);
});

test('R4.6 rejects invalid URL, id and scope, ignores corrupted stored preferences',()=>{
  for(const url of ['chrome://extensions','javascript:alert(1)','https://user:pass@site.example/path']){
    assert.equal(readingTocPageScope(url),null);
    assert.throws(()=>changeReadingTocVisibility({},id,url,'page',true));
  }
  assert.equal(readingTocPageScope('https://example.org/'+('a'.repeat(900))),null);
  assert.throws(()=>changeReadingTocVisibility({},'__proto__',page,'site',true));
  assert.throws(()=>changeReadingTocVisibility({},id,page,'unknown',true));
  assert.throws(()=>changeReadingTocVisibility({},id,page,'site','true'));
  assert.deepEqual(readingTocDisplayState({[id]:{hiddenSites:['https://evil.example','invalid'],
    hiddenPages:['https://chatgpt.com/c/one?token=secret']}},id,page),
    {hiddenOnSite:false,hiddenOnPage:false,show:true});
});

test('R4.6 website and page limits prevent unbounded preference growth',()=>{
  let preferences={};
  for(let n=0;n<64;n++){
    preferences=changeReadingTocVisibility(preferences,id,'https://site-'+n+'.example/path','site',true);
  }
  assert.equal(preferences[id].hiddenSites.length,64);
  assert.throws(()=>changeReadingTocVisibility(preferences,id,'https://overflow.example/','site',true),/64/);
  preferences=changeReadingTocVisibility(preferences,id,'https://site-0.example/','site',false);
  assert.equal(preferences[id].hiddenSites.length,63);
});
