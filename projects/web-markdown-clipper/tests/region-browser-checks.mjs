// Run with an ego-browser Page in the task's existing TaskSpace. This exercises
// production picker/converter modules and trusted browser input, not an install.
import assert from 'node:assert/strict';

export async function runRegionBrowserChecks(page,{baseUrl='http://127.0.0.1:18765'}={}){
 const checks=[];
 await page.cdp('Network.setCacheDisabled',{cacheDisabled:true});
 await page.goto(baseUrl+'/projects/web-markdown-clipper/tests/fixtures/region-picker.html');
 await page.waitForFunction(()=>!!window.regionTest);
 const state=()=>page.evaluate(()=>({selected:regionTest.selected,result:regionTest.result,error:regionTest.error,
  overlay:!!document.querySelector('[data-opendesk-clip-root]'),websiteActions:regionTest.websiteActions,hash:location.hash}));
 const done=async()=>{await page.waitForFunction(()=>!!regionTest.result||!!regionTest.error);return state();};
 const start=()=>page.click('#start');
 await start();await page.click('#chapter-18 p');
 let s=await done();assert.equal(s.selected,'reply-a');
 const markdown=s.result.markdown;
 for(const part of ['# 目标回答 A','第 1 章','第 36 章','END\\_OF\\_REPLY\\_A','**重要结论**',
  '*强调*','```js\nconst answer = 42;','  - 第二层','> 需要保留的引用','| 项目 | 结果 |'])assert.ok(markdown.includes(part),part);
 assert.doesNotMatch(markdown,/OTHER|HIDDEN|INPUT_SECRET/);assert.equal(s.overlay,false);
 checks.push({id:'long-answer-format-isolation',status:'PASS',bytes:Buffer.byteLength(markdown),chapters:36});

 await start();await page.click('#other');s=await done();
 assert.equal(s.selected,'reply-b');assert.doesNotMatch(s.result.markdown,/目标回答 A/);
 checks.push({id:'reselect-other-answer',status:'PASS'});

 await start();await page.hover('#lead');await page.click('#test-link');s=await done();
 assert.equal(s.websiteActions,0);assert.equal(s.hash,'');assert.equal(s.selected,'reply-a');
 checks.push({id:'link-click-is-consumed',status:'PASS'});

 await start();await page.hover('#chapter-18 p');
 await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.click('#chapter-18 p');
 s=await done();assert.equal(s.selected,'chapter-18');assert.doesNotMatch(s.result.markdown,/第 1 章|第 36 章/);
 checks.push({id:'narrow-range-click',status:'PASS'});

 await start();await page.hover('#chapter-18 p');
 await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 s=await done();assert.equal(s.selected,'chapter-18');
 checks.push({id:'keyboard-keeps-highlighted-range',status:'PASS'});

 await start();await page.hover('#lead');await page.keyboard.press('Escape');s=await done();
 assert.match(s.error,/取消/);assert.equal(s.overlay,false);assert.equal(s.result,null);
 await page.click('#website-action');s=await state();assert.equal(s.websiteActions,1);
 checks.push({id:'escape-restores-website-events',status:'PASS'});

 await start();await page.evaluate(()=>document.querySelector('#lead').dispatchEvent(new MouseEvent('click',{bubbles:true,button:0})));
 s=await state();assert.equal(s.result,null);assert.equal(s.error,null);
 await page.keyboard.press('Escape');await done();
 checks.push({id:'untrusted-click-cannot-capture',status:'PASS'});

 await page.evaluate(()=>document.querySelector('#reply-a').setAttribute('aria-busy','true'));
 await start();await page.click('#lead');s=await done();assert.equal(s.result.streaming,true);assert.equal(s.result.loadedOnly,true);
 await page.evaluate(()=>document.querySelector('#reply-a').removeAttribute('aria-busy'));
 checks.push({id:'streaming-is-labelled-as-snapshot',status:'PASS'});

 assert.deepEqual(await page.evaluate(()=>regionTest.candidates('#private-input').ids),[]);
 checks.push({id:'input-is-not-selectable',status:'PASS'});

 await start();await page.hover('#lead');await page.evaluate(()=>history.pushState({},'', '?route-change=1'));
 s=await done();assert.match(s.error,/网页已变化/);assert.equal(s.selected,null);assert.equal(s.overlay,false);
 await page.evaluate(()=>history.replaceState({},'',location.pathname));
 checks.push({id:'spa-route-cancels-before-extraction',status:'PASS'});

 for(const key of ['Enter','Space']){
  await start();await page.hover('#test-link');
  await page.evaluate(()=>{
   document.querySelector('#test-link').focus();
   // Simulate a site routing in its earlier Window capture handler, within
   // the same trusted key dispatch and before the picker's document handler.
   window.addEventListener('keydown',event=>{
    regionTest.routeKeyEvent=event;history.pushState({},'', '?route-key=1');
   },{capture:true,once:true});
  });
  await page.keyboard.press(key);s=await done();
  assert.match(s.error,/网页已变化/);assert.equal(s.result,null);assert.equal(s.overlay,false);
  assert.equal(await page.evaluate(()=>regionTest.routeKeyEvent.defaultPrevented),true);
  assert.equal(s.websiteActions,1);assert.equal(s.hash,'');
  await page.evaluate(()=>history.replaceState({},'',location.pathname));
  checks.push({id:'stale-route-consumes-'+key.toLowerCase(),status:'PASS'});
 }

 await page.evaluate(()=>regionTest.start({timeoutMs:30}));s=await done();assert.match(s.error,/超时/);assert.equal(s.overlay,false);
 checks.push({id:'timeout-cleans-overlay',status:'PASS'});

 await page.evaluate(()=>{
  const pre=document.createElement('pre'),code=document.createElement('code');code.className='language-js';
  code.id='large-code';code.textContent='\\'.repeat(140000);pre.append(code);document.querySelector('#reply-a').replaceChildren(pre);
 });
 await start();await page.click('#large-code');s=await done();assert.equal(s.error,null);
 assert.equal(s.result.markdown,'```js\n'+'\\'.repeat(140000)+'\n```\n');
 checks.push({id:'large-code-json-expansion',status:'PASS',markdownBytes:Buffer.byteLength(s.result.markdown),jsonBytes:Buffer.byteLength(JSON.stringify(s.result))});

 for(const length of [159999,160000,160001]){
  await page.evaluate(length=>{
   const p=document.createElement('p');p.id='boundary';
   p.textContent='中'.repeat(Math.floor((length-1)/3))+'x'.repeat((length-1)%3);
   document.querySelector('#reply-a').replaceChildren(p);
  },length);
  await start();await page.click('#boundary');s=await done();
  if(length>160000){assert.match(s.error,/160,000/);assert.equal(s.result,null);}
  else{assert.equal(s.error,null);assert.equal(Buffer.byteLength(s.result.markdown),length);}
  assert.equal(s.overlay,false);
  checks.push({id:'utf8-'+length,status:'PASS'});
 }
 return {level:'SOURCE_BROWSER_FIXTURE',browser:'ego-browser',checks};
}
