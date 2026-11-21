// Run with ego-browser nodejs; Replace EGO_TEST_SPACE with your dedicated TaskSpace ID via stdin.
const t=await taskSpace(EGO_TEST_SPACE);
const base='http://127.0.0.1:62824';
const assert=(ok,label)=>{if(!ok)throw Error(label);};
const until=async(fn,label)=>{for(let i=0;i<20;i++){const x=await fn();if(x)return x;await new Promise(r=>setTimeout(r,75));}throw Error(label);};
const size=(p,width,height)=>p.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
const q=await t.newPage();await size(q,1000,900);
await q.goto(base+'/projects/ai-send-queue/tests/fixtures/long-text.html');
await until(()=>q.evaluate(()=>window.fixtureReady),'queue fixture not ready');
console.log('QUEUE drafts',JSON.stringify(await q.evaluate(()=>window.runQueueBrowserChecks())));
console.log('QUEUE waiting',JSON.stringify(await q.evaluate(()=>window.runQueueWaitingBrowserChecks())));
await q.evaluate(()=>{
  const n=document.querySelector('#native-send');for(let i=0;i<6;i++){const el=document.createElement('button');el.type='button';el.textContent='+';el.style.flex='0 0 42px';n.before(el);}
  document.querySelector('[contenteditable]').textContent='本地窄屏草稿🙂';
});
for(const w of [700,380,320,700]){
  await size(q,w===700?1000:w+20,900);
  const geometry=await q.evaluate(w=>{
    document.body.style.margin='8px';document.querySelector('#composer-parent').style.width=w+'px';
    const f=window.queueFixture,n=document.querySelector('#native-send');
    const existing=document.querySelector('[data-fixture-ui$=".button"]');
    let before;
    if(existing&&existing.parentElement===n.parentElement){
      const original=existing.style.getPropertyValue('position'),priority=existing.style.getPropertyPriority('position');
      existing.style.setProperty('position','absolute','important');before=n.getBoundingClientRect().width;
      existing.style.setProperty('position',original,priority);
    }else before=n.getBoundingClientRect().width;
    const first=f.fit(),h=document.querySelector('[data-fixture-ui$=".button"]'),b=h.shadowRoot.querySelector('.sq-crown-button,button');
    const parent=h.parentElement;let moves=0;const mo=new MutationObserver(()=>{});mo.observe(parent,{childList:true});
    const repeat=f.fit();moves=mo.takeRecords().length;mo.disconnect();const r=b.getBoundingClientRect();
    return {before,after:n.getBoundingClientRect().width,first,repeat,moves,
      detached:parent.id==='composer-parent',draft:f.state().draft,clicks:f.state().sendClicks,point:[r.x+r.width/2,r.y+r.height/2],viewport:innerWidth};
  },w);
  assert(geometry.first&&geometry.repeat&&geometry.before===geometry.after&&geometry.moves===0&&geometry.draft==='本地窄屏草稿🙂'&&geometry.clicks===0,'queue geometry '+w+' '+JSON.stringify(geometry));
  if(w===320){
    assert(geometry.detached,'narrow layout did not relocate crown');
    await q.mouse.click(...geometry.point);
    await until(()=>q.evaluate(()=>{const s=window.queueFixture.state();return s.queue.some(x=>x.text==='本地窄屏草稿🙂')&&s.draft===''&&s.sendClicks===0;}),'crown did not enqueue exact draft');
    await q.evaluate(()=>{document.querySelector('[contenteditable]').textContent='本地窄屏草稿🙂';});
  }
  console.log('QUEUE layout',JSON.stringify({width:w,...geometry}));
}

const firstControl=await q.evaluate(()=>{
  const r=document.querySelector('[data-fixture-ui$=".list"]').shadowRoot;
  return r.querySelector('button[data-action="pause"]')?.dataset.id;
});
assert(firstControl,'running item has no pause control');
const action=async(operation)=>{
  const point=await q.evaluate(({operation,id})=>{
    const panel=document.querySelector('[data-fixture-ui$=".list"]').shadowRoot;
    const b=panel.querySelector('button[data-action="'+operation+'"][data-id="'+id+'"]');
    if(!b)return null;
    const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];
  },{operation,id:firstControl});
  assert(point,'missing queue '+operation+' control');await q.mouse.click(...point);
};
await action('pause');
await until(()=>q.evaluate(()=>window.queueFixture.state().queue[0].state==='paused'),'item did not pause');
await action('resume');
await until(()=>q.evaluate(()=>{const s=window.queueFixture.state();return s.queue[0].state==='queued'&&s.sendClicks===0;}),'item did not resume');
console.log('QUEUE pause/resume: queued again, no dispatch');
