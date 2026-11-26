// Run via ego-browser nodejs; provide EGO_TEST_SPACE and EGO_TEST_BASE over stdin.
const p=(await taskSpace(EGO_TEST_SPACE)).page('p1');
const url=EGO_TEST_BASE+'/projects/ai-scroll-navigation/tests/fixtures/reply-pin.html';
const fixed='[data-opendesk-ai-scroll-navigation="reply-fixed"]';
const inline='[data-opendesk-chatgpt-jump-top="host"]';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const size=(width,height)=>p.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
const pin=async(show=true)=>{
  try{await p.waitForFunction(({fixed,show})=>Boolean(document.querySelector(fixed))===show,{fixed,show},{timeout:4000});}
  catch(error){console.log('PIN WAIT',show,await data());throw error;}
};
const ready=()=>p.waitForFunction(()=>!!window.replyPinFixture,undefined,{timeout:4000});
const data=()=>p.evaluate(({fixed,inline})=>{
  const get=s=>document.querySelector(s),rect=e=>e?.getBoundingClientRect().toJSON();
  const host=get(fixed),widget=get('#writing');
  return {scroll:get('#port').scrollTop,root:document.scrollingElement.scrollTop,inline:document.querySelectorAll(inline).length,
    count:document.querySelectorAll(fixed).length,box:rect(host),header:rect(get('#native')),composer:rect(get('form')),
    writing:rect(widget),inlineBox:rect(widget?.previousElementSibling),second:rect(get('#with-header')),
    reply:rect(get('#reply')),fallback:rect(get('#role-only')),flag:get('#pin').checked,
    mixed:rect(get('#mixed')),nested:rect(get('#nested-writing')),
    buttons:[...host?.shadowRoot.querySelectorAll('button')||[]].map(b=>{const r=rect(b),x=r.x+r.width/2,y=r.y+r.height/2;
      return {x,y,width:r.width,hit:document.elementFromPoint(x,y)===host};})};
},{fixed,inline});
const mid=selector=>p.evaluate(async selector=>{
  const port=document.querySelector('#port');port.scrollTop+=document.querySelector(selector).getBoundingClientRect().top+450;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
},selector);
const click=async(i,label)=>{
  const m=await data(),b=m.buttons[i];assert(m.count===1&&b?.hit&&b.width>=44,label+' hit-test');
  await p.mouse.click(b.x,b.y,{label});
};
await size(1150,720);await p.goto(url);await ready();
if((await data()).flag)await p.click('#pin');
const anchors=await p.evaluate(inline=>['#writing','#with-header header','#role-only','.turn-action-controls']
  .map((s,i)=>i%2?!!document.querySelector(s+' '+inline):document.querySelector(s).previousElementSibling.matches(inline)),inline);
assert(anchors.every(Boolean),'missing inline host with and without header/footer');
await mid('#writing');await pin(false);
await p.click('#pin');await p.evaluate(()=>{document.querySelector('#port').scrollTop=0;});
await p.mouse.move(575,320);await p.mouse.wheel(0,670);await pin();
const wheel=await data();assert(wheel.scroll>400&&wheel.inlineBox.bottom<0&&wheel.box.top>=wheel.header.bottom,'wrong wheel position');
assert(await p.evaluate(inline=>[...document.querySelectorAll('article')].every(article=>
  article.querySelectorAll(inline).length===(article.querySelector('#mixed')?2:1)),inline),
  'expected one inline control per reply and one extra for its nested widget');
await click(0,'writing start');await pin(false);
const top=await data();assert(top.writing.top>=52&&top.writing.top<190&&top.scroll<wheel.scroll&&!top.root,'wrong start');
await mid('#writing');await pin();await click(1,'writing end');
const end=await data();assert(end.writing.bottom<=end.composer.top&&end.writing.bottom>=end.composer.top-20&&!end.root,'wrong writing end');
await mid('#with-header');await pin();await click(0,'second writing start');
const second=await data();assert(second.second.top>=52&&second.second.top<190,'wrong reply selected');
await mid('#reply');await pin();await click(1,'regular reply end');
const regular=await data();assert(regular.reply.bottom<=regular.composer.top&&regular.reply.bottom>=regular.composer.top-20,'wrong regular end');
await mid('#nested-writing');await pin();await click(0,'mixed reply start');
const mixedStart=await data();assert(mixedStart.mixed.top>=52&&mixedStart.mixed.top<190&&
  mixedStart.nested.top>mixedStart.mixed.top+240,'fixed start switched to the nested writing block');
await mid('#nested-writing');await pin();await click(1,'mixed reply end');
const mixedEnd=await data();assert(mixedEnd.mixed.bottom<=mixedEnd.composer.top&&
  mixedEnd.mixed.bottom>=mixedEnd.composer.top-20&&mixedEnd.nested.bottom<mixedEnd.mixed.bottom-240,
  'fixed end switched to the nested writing block');
await mid('#role-only');await pin();await p.evaluate(fixed=>
  document.querySelector(fixed).shadowRoot.querySelector('[data-scroll-nav-key="regionTop"]').focus({preventScroll:true}),fixed);
await p.keyboard.press('Enter');await pin(false);
assert(await p.evaluate(()=>document.activeElement.id==='role-only'),'keyboard focus lost after start jump');
await p.keyboard.press('Tab');assert(await p.evaluate(()=>!document.querySelector('#role-only').hasAttribute('tabindex')),'temporary focus target was not released');
console.log('PASS desktop wheel, reply landings and keyboard');
await size(360,640);await mid('#writing');await pin();
const narrow=await data();assert(narrow.box.left>=0&&narrow.box.right<=360&&narrow.buttons.every(b=>b.hit),'narrow pin clipped');
await p.click('#native-button');assert(await p.evaluate(()=>document.querySelector('#native-button').dataset.clicked==='true'),'native header click blocked');
await p.click('textarea');assert(await p.evaluate(()=>document.activeElement.localName==='textarea'),'composer click blocked');
await click(0,'narrow writing start');await pin(false);
const narrowStart=await data();assert(narrowStart.writing.top>=52&&narrowStart.writing.top<190,'wrong narrow start');
await mid('#writing');await pin();
await p.evaluate(()=>{
  const blocker=document.createElement('button');blocker.id='fixture-overlay';blocker.textContent='浮动工具';
  blocker.style.cssText='position:fixed;inset:52px 8px auto;height:124px;z-index:2147483646';
  blocker.onclick=e=>blocker.dataset.clicked=String(e.isTrusted);
  document.querySelector('main').append(blocker);
});
await p.waitForFunction(fixed=>document.querySelector(fixed)?.getBoundingClientRect().top>=176,fixed,{timeout:4000});
const relocated=await data();assert(relocated.buttons.every(b=>b.hit),'relocated pin is not clickable');
await p.click('#fixture-overlay');assert(await p.evaluate(()=>document.querySelector('#fixture-overlay').dataset.clicked==='true'),'peer tool click blocked');
await click(0,'relocated writing start');
await p.waitForFunction(()=>{const y=document.querySelector('#writing').getBoundingClientRect().top;return y>=52&&y<190;},undefined,{timeout:4000});
await mid('#writing');await pin();
await p.evaluate(()=>{document.querySelector('#fixture-overlay').style.height='270px';window.replyPinFixture.refresh();});await pin(false);
await p.evaluate(()=>document.querySelector('#fixture-overlay').remove());await pin();
console.log('PASS narrow header/composer clicks, peer tool, slot relocation and full obstruction');
await p.evaluate(()=>{const d=document.createElement('dialog');d.id='conflict';d.textContent='Modal';document.body.append(d);d.showModal();});await pin(false);
await p.evaluate(()=>document.querySelector('#conflict').remove());await pin();
await p.evaluate(()=>{const v=document.createElement('div');v.id='viewer';v.setAttribute('data-opendesk-chatgpt-mindmap','viewer');
  v.style.cssText='position:fixed;top:130px;width:100px;height:100px';document.body.append(v);});await pin(false);
await p.evaluate(()=>document.querySelector('#viewer').remove());await pin();
console.log('PASS modal and Mind Map yield/restore');
await p.click('#pin');await pin(false);assert((await data()).inline===wheel.inline,'toggle off removed inline');
await p.reload();await ready();assert(!(await data()).flag,'fixture switch did not remember off');
await p.click('#pin');await p.reload();await ready();assert((await data()).flag,'fixture switch did not remember on');
await mid('#writing');await pin();
const old=await data();
await p.evaluate(()=>{
  history.pushState({},'',location.pathname+'?conversation=next');
  document.querySelector('#writing').closest('article').remove();
  document.querySelector('#port').scrollTop=0;
});
await pin(false);await p.mouse.click(old.buttons[0].x,old.buttons[0].y,{label:'Check stale control removed'});
assert((await data()).scroll===0,'old pin scrolled the new conversation');
await mid('#with-header');await pin();await p.evaluate(fixed=>
  document.querySelector(fixed).shadowRoot.querySelector('[data-scroll-nav-key="regionTop"]').focus({preventScroll:true}),fixed);
await p.keyboard.press('Space');await pin(false);
assert((await data()).second.top>=52&&(await data()).second.top<190,'Space did not jump to the next conversation reply');
await mid('#with-header');await pin();await p.evaluate(()=>window.replyPinFixture.dispose());await pin(false);
await p.mouse.move(180,300);await p.mouse.wheel(0,140);
assert(!(await data()).inline&&!(await data()).count,'disposed navigation returned');
console.log(JSON.stringify({anchors,wheel:wheel.scroll,inlineBottom:wheel.inlineBox.bottom,start:top.writing.top,
  end:end.writing.bottom,composer:end.composer.top,second:second.second.top,regularEnd:regular.reply.bottom,
  mixedStart:mixedStart.mixed.top,mixedEnd:mixedEnd.mixed.bottom,
  narrow:narrow.box,narrowStart:narrowStart.writing.top,relocated:relocated.box,
  conflicts:'peer click, slot relocation, full obstruction, modal and mind map',keyboard:'Enter/Tab/Space',
  toggle:'fixture persisted both values',spa:'stale pin removed; next reply selectable',cleanup:'verified'}));
