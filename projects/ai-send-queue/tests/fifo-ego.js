// Run against the local fixture only; replace EGO_TEST_SPACE before running.
const t=await taskSpace(EGO_TEST_SPACE);
const p=await t.newPage();
await p.cdp('Network.enable');
await p.cdp('Network.setCacheDisabled',{cacheDisabled:true});
const assert=(value,message)=>{if(!value)throw Error(message);};
const size=width=>p.cdp('Emulation.setDeviceMetricsOverride',{width,height:870,deviceScaleFactor:1,mobile:false});
const state=()=>p.evaluate(()=>window.fifoFixture.state());
const step=ms=>p.evaluate(ms=>window.fifoFixture.step(ms),ms);
const finishReply=()=>p.evaluate(()=>window.fifoFixture.finishReply());
const site=typeof EGO_TEST_SITE==='undefined'?'chatgpt':EGO_TEST_SITE;
const expected=site==='gemini'?['第一条，本地模拟 🙂\n\n  保留空格  ','第二条，本地模拟：'+'这是一段可用键盘展开的完整消息。'.repeat(10)]:
  ['第一条，本地模拟 🙂','第二条，本地模拟'];
await size(390);
await p.goto('http://127.0.0.1:62824/projects/ai-send-queue/tests/fixtures/long-text.html?fifo&site='+site);
await p.waitForFunction(()=>!!window.fifoFixture,undefined,{timeout:4000});
assert(await p.evaluate(()=>window.queueFixture.fit()),'crown did not fit narrow composer');
const layout=()=>p.evaluate(()=>{
  const button=document.querySelector('[data-fixture-ui$=".button"]').shadowRoot.querySelector('.sq-send');
  const pane=document.querySelector('[data-fixture-ui$=".list"]');
  const form=document.querySelector('input-area-v2').getBoundingClientRect();
  const native=document.querySelector('#native-send').getBoundingClientRect();
  const entry=button.getBoundingClientRect();
  const crown=button.querySelector('.sq-crown');
  const art=crown.getBoundingClientRect();
  const arrow=button.querySelector('svg');
  const glyph=arrow.getBoundingClientRect();
  const clip=button.getRootNode().host.closest('.surface').getBoundingClientRect();
  const style=getComputedStyle(button),face=getComputedStyle(button,'::before');
  const crownStyle=getComputedStyle(crown),arrowStyle=getComputedStyle(arrow);
  const list=pane.getBoundingClientRect(), cue=pane.shadowRoot.querySelector('.sq-empty-mark');
  return {right:entry.right,adjacent:entry.left>=native.right&&entry.left-native.right<12&&
    Math.abs(entry.top+entry.height/2-native.top-native.height/2)<2,
  composition:(style.backgroundImage!=='none'||face.backgroundImage!=='none')&&
    arrowStyle.display!=='none'&&Math.abs(glyph.left+glyph.width/2-entry.left-entry.width/2)<1&&
    Math.abs(glyph.top+glyph.height/2-entry.top-entry.height/2)<1&&
    crownStyle.backgroundImage!=='none'&&crownStyle.transform!=='none'&&
    Number(crownStyle.zIndex)>Number(arrowStyle.zIndex)&&
    art.width>0&&art.left>=entry.left&&art.right<=entry.right&&art.top<entry.top&&art.bottom<glyph.top&&
    art.top>=clip.top&&art.right<=clip.right,
  hitSize:entry.width,arrowSize:glyph.width,faceSize:face.width,
  rows:pane.shadowRoot.querySelectorAll('[role=listitem]').length,
  emptyCue:cue?.textContent==='···'&&cue.getBoundingClientRect().height>0,
  aligned:Math.abs(list.left-form.left)<=1&&Math.abs(list.right-form.right)<=1&&list.bottom<=form.top,
  hidden:list.height===0};
});
const gemini=site==='gemini',initial=gemini?await layout():null;
if(gemini)assert(!initial.hidden&&initial.emptyCue&&initial.aligned&&initial.adjacent&&initial.composition,
  'empty queue cue must be visible above the composer beside the unchanged crown layout');
if(gemini){
  await p.cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  try{
    assert(await p.evaluate(()=>window.queueFixture.fit()),'touch hit area did not fit');
    const touch=await layout();
    assert(touch.composition&&touch.hitSize===42&&touch.faceSize==='34px'&&touch.arrowSize===initial.arrowSize,
      'touch mode should keep the full desktop face inside the larger target');
  }finally{await p.cdp('Emulation.setTouchEmulationEnabled',{enabled:false});}
  assert(await p.evaluate(()=>window.queueFixture.fit()),'desktop hit area did not fit after touch check');
  const transient=await p.evaluate(()=>{
    const send=document.querySelector('#native-send');
    send.hidden=true;
    try{
      const fits=window.queueFixture.fit();
      const right=document.querySelector('[data-fixture-ui$=".button"]').getBoundingClientRect().right;
      return {fits,right};
    }finally{send.hidden=false;window.queueFixture.fit();}
  });
  assert(transient.fits&&transient.right===initial.right,'native button unmount moved or hid the queue button');
}
for(const text of expected){
  await p.focus('#prompt-textarea');await p.keyboard.insertText(text);
  const point=await p.evaluate(()=>{
    const button=document.querySelector('[data-fixture-ui$=".button"]')?.shadowRoot?.querySelector('button.sq-send');
    const r=button?.getBoundingClientRect();return r?.width&&r?.height?[r.x+r.width/2,r.y+r.height/2]:null;
  });
  assert(point,'crown is not visible');
  await p.mouse.click(...point,{label:'Queue local sample message'});
  assert((await state()).draft==='','queued draft not cleared');
  if(gemini){
    assert(await p.evaluate(()=>window.queueFixture.fit()),'queue no longer fits after enqueue');
    const current=await layout();
    assert(!current.hidden&&current.aligned&&current.adjacent&&current.right===initial.right,'queue shifted or list lost alignment');
  }
}
assert((await state()).items.map(item=>item.text).join('|')===expected.join('|'),'queued order or text changed');
if(gemini){
  assert((await layout()).rows===2,'both queued rows must be visible');
  const focusLast=action=>p.evaluate(action=>{
    const row=document.querySelector('[data-fixture-ui$=".list"]').shadowRoot.querySelector('.sq-row:last-child');
    row.querySelector('[data-action="'+action+'"]').focus();
  },action);
  await focusLast('preview');
  await p.keyboard.press('Enter');
  assert(await p.evaluate(text=>[...document.querySelector('[data-fixture-ui$=".list"]').shadowRoot.querySelectorAll('.sq-preview')]
    .some(node=>!node.hidden&&node.textContent===text),expected[1]),'keyboard preview lost or truncated text');
  await p.keyboard.press('Enter');
  await focusLast('pause');
  await p.keyboard.press('Enter');
  assert((await state()).items[1].state==='paused','keyboard pause did not change queue state');
  assert(await p.evaluate(()=>document.querySelector('[data-fixture-ui$=".list"]').shadowRoot.activeElement?.dataset.action==='resume'),
    'pause moved focus away from its matching resume control');
  await p.keyboard.press('Enter');
  if(typeof EGO_TEST_SCREENSHOT!=='undefined'){
    await size(900);assert(await p.evaluate(()=>window.queueFixture.fit()),'900px layout failed');
    console.log({localScreenshot:await p.screenshot({path:EGO_TEST_SCREENSHOT})});
    await size(390);await p.evaluate(()=>window.queueFixture.fit());
  }
}
await step(0);await step(1200);await step(0);await step(0);
let reply=await state();
assert(reply.sends.length===1&&reply.sends[0]===expected[0]&&reply.items[0]?.text===expected[1],'wrong first dispatch');
if(gemini){
  await p.evaluate(()=>window.queueFixture.fit());
  const current=await layout();
  assert(current.adjacent&&current.composition&&current.right===initial.right&&current.aligned,
    'queue or crown shifted when native Stop appeared');
}
await size(800);assert(await p.evaluate(()=>window.queueFixture.fit()),'queue disappeared on resize');
await step(1600);await step(1600);reply=await state();
assert(reply.sends.length===1&&reply.draft===''&&reply.reason.includes('回复完成'),'second message dispatched before first reply completed');
await finishReply();await step(0);await step(1200);await step(1200);await step(0);await step(0);
const second=await state();
assert(second.sends.join('|')===expected.join('|')&&second.items.length===0,'second message not sent exactly once after reply');
await finishReply();await step(0);await step(1200);
if(gemini){
  const cleared=await layout();
  assert(!cleared.hidden&&cleared.emptyCue&&cleared.aligned&&cleared.rows===0,
    'queue must return to the visible empty cue after both messages are sent');
}
console.log({fixture:'local source and simulated reply',site,widths:[390,800],sends:2,ordered:true,waitedForReply:true,realMessages:0});
await p.close();
