// Run with an ego-browser Page in the task's existing TaskSpace. This exercises
// production picker/converter modules and trusted browser input, not an install.
import assert from 'node:assert/strict';

const point=(page,selector)=>page.evaluate(selector=>{
 const node=document.querySelector(selector);node.scrollIntoView({block:'center',inline:'start'});
 const r=node.getBoundingClientRect();
 const left=Math.max(r.left,0),top=Math.max(r.top,0);
 const width=Math.min(r.right,innerWidth)-left,height=Math.min(r.bottom,innerHeight)-top;
 if(width>0&&height>0){
  const x=left+Math.min(width/2,16);
  for(const y of [top+Math.min(height/2,16),top+height/2]){
   if(node.contains(document.elementFromPoint(x,y)))return [x,y];
  }
 }
 throw Error('No unobscured point in the visible part of '+selector);
},selector);

// In ego, mouse.click may briefly hide the target after pointerdown while its
// visual cursor is shown. Use trusted CDP input on the same visible fixture tab.
async function clickPoint(page,selector,modifiers=0){
 const [x,y]=await point(page,selector);
 await page.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,modifiers});
 for(const type of ['mousePressed','mouseReleased']){
  await page.cdp('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1,modifiers});
 }
}
async function movePoint(page,selector){
 const [x,y]=await point(page,selector);
 await page.cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
}

export async function checkVirtualizedTurnPicking(page){
 await page.evaluate(()=>{
  document.querySelector('#thread').innerHTML=
   '<div id="virtual-transcript"><div id="virtual-turn" data-turn-key="a">'+
   '<p id="virtual-hit">目标段落</p><p>同一条消息的下一段</p></div>'+
   '<div data-turn-key="b"><p>相邻消息</p></div></div>';
 });
 const start=async()=>{await clickPoint(page,'#start');await movePoint(page,'#virtual-hit');};
 const read=async()=>{
  await page.waitForFunction(()=>!!regionTest.result||!!regionTest.error);
  return page.evaluate(()=>({selected:regionTest.selected,markdown:regionTest.result?.markdown}));
 };
 await start();await clickPoint(page,'#virtual-hit');
 assert.deepEqual(await read(),{selected:'virtual-hit',markdown:'目标段落\n'});
 await start();
 await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');
 await page.keyboard.press('Enter');
 assert.deepEqual(await read(),{selected:'virtual-turn',markdown:'目标段落\n\n同一条消息的下一段\n'});
}

export async function runRegionBrowserChecks(page,{baseUrl='http://127.0.0.1:18765',onCheck=()=>{},screenshot}={}){
 const checks=[];
 const record=entry=>{checks.push(entry);onCheck(entry);};
 await page.cdp('Network.setCacheDisabled',{cacheDisabled:true});
 await page.goto(baseUrl+'/projects/web-markdown-clipper/tests/fixtures/region-picker.html');
 await page.waitForFunction(()=>!!window.regionTest);
 const state=()=>page.evaluate(()=>({selected:regionTest.selected,result:regionTest.result,error:regionTest.error,
  overlay:!!document.querySelector('[data-opendesk-clip-root]'),websiteActions:regionTest.websiteActions,hash:location.hash}));
 const done=async()=>{await page.waitForFunction(()=>!!regionTest.result||!!regionTest.error);return state();};
 const start=async()=>{await clickPoint(page,'#start');await page.waitForFunction(()=>!!document.querySelector('[data-opendesk-clip-root]'));};
 const move=selector=>movePoint(page,selector);
 const click=(selector,modifiers)=>clickPoint(page,selector,modifiers);
 for(const [target,selected,pattern] of [
  ['#short-title','short-title',/^## 短题/],['#tiny','tiny',/^字/],
  ['#list-hit','list-hit',/第二层/],['#code-hit','fence',/const answer = 42/]
 ]){
  await start();await click(target);const s=await done();
  assert.equal(s.selected,selected,s.error||target);assert.match(s.result.markdown,pattern);
 }
 record({id:'short-title-tiny-nested-list-code',status:'PASS'});
 await start();await move('#tiny');
 const border=()=>page.evaluate(()=>{
  const overlay=document.querySelector('[data-opendesk-clip-root]');
  return {width:overlay.getBoundingClientRect().width,color:getComputedStyle(overlay).borderColor,
   text:getComputedStyle(overlay.firstElementChild).display==='none'?'':overlay.textContent};
 });
 assert.ok((await border()).width<50);
 await page.keyboard.press('ArrowUp');assert.ok((await border()).width>=50);
 await page.keyboard.press('ArrowDown');assert.ok((await border()).width<50);
 await page.keyboard.down('Meta');assert.deepEqual((await border()).color,'rgb(14, 165, 233)');assert.equal((await border()).text,'+');
 if(screenshot)await page.screenshot({path:screenshot});
 await page.keyboard.up('Meta');assert.equal((await border()).color,'rgb(37, 99, 235)');assert.equal((await border()).text,'');
 await page.keyboard.down('Meta');await click('#tiny',4);await page.keyboard.up('Meta');
 let tiny=await done();assert.equal(tiny.selected,'tiny');assert.equal(tiny.result.append,true);
 record({id:'highlight-range-and-modifier-add',status:'PASS'});

 await page.evaluate(()=>{document.querySelector('#nest').style.paddingBottom='12px';});
 await start();await move('#nested-paragraph');await page.keyboard.press('ArrowUp');
 const outlined=selector=>{
  const overlay=document.querySelector('[data-opendesk-clip-root]')?.getBoundingClientRect();
  const target=document.querySelector(selector)?.getBoundingClientRect();
  return Boolean(overlay?.width&&target&&['left','top','width','height'].every(key=>Math.abs(overlay[key]-target[key])<1));
 };
 assert.equal(await page.evaluate(outlined,'#nest'),true);
 assert.equal(await page.evaluate(outlined,'#nested-paragraph'),false);
 await page.evaluate(()=>{document.querySelector('#nest').append(document.createElement('textarea'));});
 // Ego's waitForFunction can time out on this geometry even when evaluate
 // sees the refreshed outline. Poll fresh geometry without moving the pointer.
 let refreshedOutline=false;
 const outlineDeadline=Date.now()+4000;
 do{
  refreshedOutline=await page.evaluate(outlined,'#nested-paragraph');
  if(!refreshedOutline)await new Promise(resolve=>setTimeout(resolve,50));
 }while(!refreshedOutline&&Date.now()<outlineDeadline);
 assert.ok(refreshedOutline,'the stationary pointer outline must refresh before capture');
 assert.equal((await state()).result,null);
 await page.keyboard.press('Enter');const refreshed=await done();assert.equal(refreshed.selected,'nested-paragraph');
 await page.evaluate(()=>{document.querySelector('#nest textarea').remove();document.querySelector('#nest').style.removeProperty('padding-bottom');});
 record({id:'dynamic-dom-clears-ineligible-highlight',status:'PASS'});
 await start();await move('#chapter-18 p');
 await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');
 await page.keyboard.press('Enter');
 let s=await done();assert.equal(s.selected,'reply-a');
 const markdown=s.result.markdown;
 for(const part of ['# 目标回答 A','第 1 章','第 36 章','END\\_OF\\_REPLY\\_A','**重要结论**',
  '*强调*','```js\nconst answer = 42;','  - 第二层','> 需要保留的引用','| 项目 | 结果 |'])assert.ok(markdown.includes(part),part);
 assert.doesNotMatch(markdown,/OTHER|HIDDEN|INPUT_SECRET/);assert.equal(s.overlay,false);
 record({id:'long-answer-format-isolation',status:'PASS',bytes:Buffer.byteLength(markdown),chapters:36});

 await start();await click('#other');s=await done();
 assert.equal(s.selected,'other');assert.doesNotMatch(s.result.markdown,/目标回答 A/);
 record({id:'reselect-other-answer',status:'PASS'});

 await start();await move('#lead');await click('#test-link');s=await done();
 assert.equal(s.websiteActions,0);assert.equal(s.hash,'');assert.equal(s.selected,'test-link');
 record({id:'link-click-is-consumed',status:'PASS'});

 await start();await move('#chapter-18 p');
 await page.keyboard.press('ArrowUp');await click('#chapter-18 p');
 s=await done();assert.equal(s.selected,'chapter-18');assert.doesNotMatch(s.result.markdown,/第 1 章|第 36 章/);
 record({id:'narrow-range-click',status:'PASS'});

 await start();await move('#chapter-18 p');
 await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
 s=await done();assert.equal(s.selected,'chapter-18');
 record({id:'keyboard-keeps-highlighted-range',status:'PASS'});

 await start();await move('#lead');await page.keyboard.press('Escape');s=await done();
 assert.match(s.error,/取消/);assert.equal(s.overlay,false);assert.equal(s.result,null);
 await click('#website-action');s=await state();assert.equal(s.websiteActions,1);
 record({id:'escape-restores-website-events',status:'PASS'});

 await start();await page.evaluate(()=>document.querySelector('#lead').dispatchEvent(new MouseEvent('click',{bubbles:true,button:0})));
 s=await state();assert.equal(s.result,null);assert.equal(s.error,null);
 await page.keyboard.press('Escape');await done();
 record({id:'untrusted-click-cannot-capture',status:'PASS'});

 await page.evaluate(()=>document.querySelector('#reply-a').setAttribute('aria-busy','true'));
 await start();await click('#lead');s=await done();assert.equal(s.result.streaming,true);assert.equal(s.result.loadedOnly,true);
 await page.evaluate(()=>document.querySelector('#reply-a').removeAttribute('aria-busy'));
 record({id:'streaming-is-labelled-as-snapshot',status:'PASS'});

 assert.deepEqual(await page.evaluate(()=>regionTest.candidates('#private-input').ids),[]);
 record({id:'input-is-not-selectable',status:'PASS'});

 await start();await move('#lead');await page.evaluate(()=>history.pushState({},'', '?route-change=1'));
 s=await done();assert.match(s.error,/网页已变化/);assert.equal(s.selected,null);assert.equal(s.overlay,false);
 await page.evaluate(()=>history.replaceState({},'',location.pathname));
 record({id:'spa-route-cancels-before-extraction',status:'PASS'});

 for(const key of ['Enter','Space']){
  await start();await move('#test-link');
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
  record({id:'stale-route-consumes-'+key.toLowerCase(),status:'PASS'});
 }

 await page.evaluate(()=>regionTest.start({timeoutMs:30}));s=await done();assert.match(s.error,/超时/);assert.equal(s.overlay,false);
 record({id:'timeout-cleans-overlay',status:'PASS'});

 await page.evaluate(()=>{
  const pre=document.createElement('pre'),code=document.createElement('code');code.className='language-js';
  code.id='large-code';code.textContent='\\'.repeat(140000);pre.append(code);document.querySelector('#reply-a').replaceChildren(pre);
 });
 await start();await click('#large-code');s=await done();assert.equal(s.error,null);
 assert.equal(s.result.markdown,'```js\n'+'\\'.repeat(140000)+'\n```\n');
 record({id:'large-code-json-expansion',status:'PASS',markdownBytes:Buffer.byteLength(s.result.markdown),jsonBytes:Buffer.byteLength(JSON.stringify(s.result))});

 for(const length of [159999,160000,160001]){
  await page.evaluate(length=>{
   const p=document.createElement('p');p.id='boundary';
   p.textContent='中'.repeat(Math.floor((length-1)/3))+'x'.repeat((length-1)%3);
   document.querySelector('#reply-a').replaceChildren(p);
  },length);
  await start();await click('#boundary');s=await done();
  if(length>160000){assert.match(s.error,/160,000/);assert.equal(s.result,null);}
  else{assert.equal(s.error,null);assert.equal(Buffer.byteLength(s.result.markdown),length);}
  assert.equal(s.overlay,false);
  record({id:'utf8-'+length,status:'PASS'});
 }
 await checkVirtualizedTurnPicking(page);
 record({id:'virtualized-turn-default-and-parent-boundary',status:'PASS'});
 return {level:'SOURCE_BROWSER_FIXTURE',browser:'ego-browser',checks};
}
