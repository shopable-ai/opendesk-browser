// Run with ego-browser nodejs after defining EGO_TEST_SPACE; optionally reuse EGO_TEST_PAGE.
const task=await taskSpace(EGO_TEST_SPACE);
const page=typeof EGO_TEST_PAGE==='undefined' ? await task.newPage() : task.page(EGO_TEST_PAGE);
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const timeout={timeout:3000};
await page.goto('http://127.0.0.1:62824/projects/ai-scroll-navigation/tests/fixtures/floating-navigation.html');
await page.waitForFunction(()=>!!window.scrollNavigationFixture,undefined,timeout);
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1250,height:730,deviceScaleFactor:1,mobile:false});

const state=()=>page.evaluate(()=>{
  const port=document.querySelector('main');
  const keys=kind=>[...document.querySelectorAll('[data-opendesk-ai-scroll-navigation="'+kind+'"]')]
    .map(host=>[...host.shadowRoot.querySelectorAll('button')].map(button=>button.dataset.scrollNavKey));
  return {y:port.scrollTop,dock:keys('dock').flat(),replies:keys('reply')};
});
const locate=(kind,key,index)=>page.evaluate(({kind,key,index})=>{
  const host=document.querySelectorAll('[data-opendesk-ai-scroll-navigation="'+kind+'"]')[index];
  const button=host?.shadowRoot.querySelector('[data-scroll-nav-key="'+key+'"]');
  const rect=button?.getBoundingClientRect();
  if(!rect?.width||rect.top<64||rect.bottom>innerHeight||button.getAttribute('aria-disabled')==='true')return null;
  const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
  return document.elementFromPoint(x,y)===host?[x,y]:null;
},{kind,key,index});
async function click(kind,key,index=0){
  // The floating dock can move after scrolling. Aim at the button after
  // scroll/hover reconciliation, and ensure it isn't covered by another host.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const first=await locate(kind,key,index);
  assert(first,key+' must be actionable');
  await page.mouse.move(...first,{label:'Aim at navigation control'});
  const point=await locate(kind,key,index);
  assert(point,key+' must remain actionable');
  await page.mouse.click(...point,{label:'Click '+key+' control'});
}
async function waitFor(step,condition,arg){
  try{await page.waitForFunction(condition,arg,timeout);}
  catch(error){throw Error(step+': '+JSON.stringify(await state()),{cause:error});}
}
for(const site of ['deepseek','gemini']){
  await page.selectOption('#site',site);
  const start=await state();
  assert(start.dock.length===4&&start.replies.length===3,site+' missing controls '+JSON.stringify(start));
  await page.click('#paging');
  const noPaging=(await state()).dock;
  assert(noPaging.length===2&&!noPaging.some(key=>key.startsWith('turn')),site+' paging toggle changed the wrong controls');
  await page.click('#paging');
  assert((await state()).dock.includes('turnNext'),site+' paging did not return');
  await click('dock','turnNext');
  await waitFor(site+' next round',()=>document.querySelector('main').scrollTop>500);
  await click('dock','turnPrevious');
  await waitFor(site+' previous round',()=>document.querySelector('main').scrollTop<100);
  await page.click('#reply-top');
  const bottomOnly=(await state()).replies;
  assert(bottomOnly.length===3&&bottomOnly.every(keys=>keys.join(',')==='regionBottom'),site+' reply switch did not remove only top');
  await page.click('#reply-top');

  // Put reply #2's native footer inside the viewport before each click.
  // The starting offsets differ from both landing positions.
  const positionFooter=()=>page.evaluate(()=>{
    const port=document.querySelector('main');
    const host=document.querySelectorAll('[data-opendesk-ai-scroll-navigation="reply"]')[1];
    port.scrollTop+=host.getBoundingClientRect().top-port.getBoundingClientRect().top-390;
  });
  const relativeEdge=async edge=>page.evaluate(({site,edge})=>{
    const port=document.querySelector('main').getBoundingClientRect();
    const body=document.querySelectorAll(site==='gemini'?'model-response .markdown':'.ds-assistant-message-main-content')[1]
      .getBoundingClientRect();
    return body[edge]-port[edge];
  },{site,edge});
  await positionFooter();
  await click('reply','regionTop',1);
  await waitFor(site+' reply start',({site})=>{
    const content=document.querySelectorAll(site==='gemini'?'model-response .markdown':'.ds-assistant-message-main-content')[1];
    return Math.abs(content.getBoundingClientRect().top-document.querySelector('main').getBoundingClientRect().top-12)<3;
  },{site});
  const replyTop=await relativeEdge('top');
  await positionFooter();
  await click('reply','regionBottom',1);
  await waitFor(site+' reply end',({site})=>{
    const content=document.querySelectorAll(site==='gemini'?'model-response .markdown':'.ds-assistant-message-main-content')[1];
    return Math.abs(content.getBoundingClientRect().bottom-document.querySelector('main').getBoundingClientRect().bottom+12)<3;
  },{site});
  const replyBottom=await relativeEdge('bottom');
  await click('dock','conversationBottom');
  await waitFor(site+' conversation end',()=>{const s=document.querySelector('main');return s.scrollHeight-s.clientHeight-s.scrollTop<2;});
  const bottom=await state();
  await click('dock',bottom.dock.find(key=>key.endsWith('Top')));
  await waitFor(site+' conversation start',()=>document.querySelector('main').scrollTop<2);
  console.log({site,replyTop,replyBottom,conversationTop:(await state()).y,conversationBottom:bottom.y,paging:true,toggles:true});
}
await page.evaluate(()=>{
  document.querySelector('model-response').setAttribute('aria-busy','true');
  const copy=document.createElement('button');copy.textContent='Copy';copy.setAttribute('aria-label','Copy');
  document.querySelectorAll('model-response .buttons-container-v2')[1].append(copy);
  window.scrollNavigationFixture.refresh();
});
const survivingReplies=await page.evaluate(()=>[...document.querySelectorAll('model-response')]
  .map(reply=>!!reply.querySelector('[data-opendesk-ai-scroll-navigation="reply"]')));
assert(survivingReplies.join(',')==='false,false,true','busy and ambiguous Gemini replies must hide only their own controls');
await page.selectOption('#site','unsupported');
const last=await state();
assert(!last.dock.length&&!last.replies.length,'unsupported route mounted navigation');
console.log('Busy/ambiguous reply and unsupported route cases passed (local fixture).');
await page.close();
