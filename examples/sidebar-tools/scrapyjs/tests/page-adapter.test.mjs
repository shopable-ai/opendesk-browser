import test from 'node:test';
import assert from 'node:assert/strict';
import {controlledPage} from '../adapters/page.js';
function fixture(href,count=1){
  const calls=[];
  const element={getAttribute:async()=>href,click:async()=>calls.push('click')};
  const page={url:async()=> 'http://127.0.0.1:43111/scrapyjs-fixtures/list-1.html',
    goto:async url=>calls.push(url),content:async()=>'',waitForSelector:async()=>{},evaluate:async()=>page.url(),
    locator:()=>({count:async()=>count,first:()=>element})};
  return {page,calls};
}
test('link pagination uses authorized goto rather than losing document ownership',async()=>{
  const {page,calls}=fixture('list-2.html');await (await controlledPage(page).$('a.next')).click();
  assert.deepEqual(calls,['http://127.0.0.1:43111/scrapyjs-fixtures/list-2.html']);
});
test('missing control terminates and same-document button keeps its original click',async()=>{
  assert.equal(await controlledPage(fixture(null,0).page).$('a.next'),null);
  const {page,calls}=fixture(null);await (await controlledPage(page).$('button')).click();assert.deepEqual(calls,['click']);
});
test('hash pagination preserves its handler; relative links respect the document base',async()=>{
  for(const href of ['#','#next','list-1.html#next']){
    const {page,calls}=fixture(href);await (await controlledPage(page).$('a')).click();assert.deepEqual(calls,['click']);
  }
  const {page,calls}=fixture('list-2.html');page.evaluate=async()=> 'http://127.0.0.1:43111/nested/';
  await (await controlledPage(page).$('a')).click();assert.deepEqual(calls,['http://127.0.0.1:43111/nested/list-2.html']);
});
test('an unapproved link cannot issue either navigation or a click',async()=>{
  for(const href of ['https://example.com/','http://127.0.0.1:43112/','javascript:alert(1)']){
    const {page,calls}=fixture(href);await assert.rejects((await controlledPage(page).$('a')).click(),/E_CAPTURE_ORIGIN/);assert.deepEqual(calls,[]);
  }
});
