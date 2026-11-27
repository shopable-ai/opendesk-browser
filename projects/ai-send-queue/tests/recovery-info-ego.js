// Run with ego-browser nodejs and EGO_TEST_SPACE / EGO_EVIDENCE_DIR.
const task=await taskSpace(EGO_TEST_SPACE),page=(await task.tabs()).find(t=>t.label==='p2')?.page??await task.newPage();
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const read=()=>page.evaluate(()=>{
  const queue=document.querySelector('[data-fixture-ui$=".list"]').shadowRoot;
  const overlay=document.querySelector('[data-fixture-ui$=".button"]').shadowRoot;
  const panel=queue.querySelector('.sq-panel'),info=queue.querySelector('.sq-info-trigger');
  const notice=overlay.querySelector('[role="dialog"]');
  const manual=notice?.querySelector('textarea'),editor=document.querySelector('#prompt-textarea');
  const box=info?.getBoundingClientRect(),n=notice?.getBoundingClientRect();
  const bounds=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
  return {visible:!!box?.width,notice:!!n?.width,queueChildren:panel.children.length,
    size:[bounds(panel),bounds(editor)],count:queue.querySelectorAll('.sq-info-trigger').length,
    old:!!document.querySelector('[data-recovery="copy"]')||!!queue.querySelector('[data-recovery="copy"],.sq-info-body,[role="dialog"]'),
    accessible:!!info?.getAttribute('aria-label')&&info.getAttribute('aria-haspopup')==='dialog',
    focused:queue.activeElement?.dataset.action??overlay.activeElement?.dataset.action??null,
    manual:manual?{exact:manual.value===infoFixture.backup,readOnly:manual.readOnly,focused:overlay.activeElement===manual}:null,
    target:box?.width?[box.width,box.height]:null,
    fits:!n||n.left>=0&&n.right<=innerWidth&&n.top>=0&&n.bottom<=innerHeight&&
      (n.bottom<=panel.getBoundingClientRect().top||n.top>=panel.getBoundingClientRect().bottom)&&
      notice.scrollWidth<=notice.clientWidth+1,
    checked:!notice?.querySelector('[data-action="draft-done"]')?.hidden,
    recovering:infoFixture.recovering(),draft:editor.textContent,theme:matchMedia('(prefers-color-scheme: dark)').matches,
    touch:matchMedia('(pointer: coarse)').matches,sendClicks:queueFixture.state().sendClicks};
});
const focus=(action,kind)=>page.evaluate(({action,kind})=>document.querySelector('[data-fixture-ui$=".'+kind+'"]').shadowRoot.querySelector('[data-action="'+action+'"]').focus(),{action,kind});
const clickInfo=async()=>{
  const hit=await page.evaluate(()=>{
    const host=document.querySelector('[data-fixture-ui$=".list"]');
    const info=host.shadowRoot.querySelector('.sq-info-trigger'),r=info.getBoundingClientRect();
    const x=r.x+r.width/2,y=r.y+r.height/2;
    return document.elementFromPoint(x,y)===host&&info.contains(host.shadowRoot.elementFromPoint(x,y))?[x,y]:null;
  });
  assert(hit,'Info does not receive pointer input');
  await page.mouse.click(...hit,{label:'Open queue recovery notice'});
};
await page.cdp('Emulation.setDeviceMetricsOverride',{width:700,height:860,deviceScaleFactor:1,mobile:false});
await page.goto('http://127.0.0.1:62824/projects/ai-send-queue/tests/fixtures/long-text.html?info');
await page.waitForFunction(()=>!!window.infoFixture,undefined,{timeout:6000});
await page.evaluate(()=>queueFixture.fit());
assert(!(await read()).visible,'normal empty queue shows Info');
await page.evaluate(()=>infoFixture.addRow());
assert(!(await read()).visible,'normal queue with an item shows Info');
await page.evaluate(()=>infoFixture.recover());
const idle=await read();
assert(idle.visible&&idle.count===1&&!idle.notice&&!idle.old&&idle.accessible,'only the Info icon is shown by default');
await page.screenshot({path:EGO_EVIDENCE_DIR+'/notify-closed.png'});
await clickInfo();
assert((await read()).notice,'mouse did not open Info');
await page.keyboard.press('Escape');
await focus('info','list');await page.keyboard.press('Enter');
let state=await read();assert(state.notice&&state.focused==='remove'&&!state.checked,'Enter opens notice, focuses Close and requires copy');
assert(JSON.stringify(state.size)===JSON.stringify(idle.size)&&state.queueChildren===idle.queueChildren,'opening changed queue layout');
await page.keyboard.press('Escape');
state=await read();assert(!state.notice&&state.focused==='info','Escape dismisses the notification and returns focus');
const geometry=[];
for(const width of [700,380,320]){
  await page.cdp('Emulation.setDeviceMetricsOverride',{width,height:860,deviceScaleFactor:1,mobile:false});
  if(width===320){
    await page.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
    await page.cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  }
  await page.evaluate(()=>queueFixture.fit());const before=await read();
  await page.keyboard.press('Space');state=await read();
  assert(state.notice&&state.fits&&!state.old&&JSON.stringify(state.size)===JSON.stringify(before.size),'notification size/overlap at '+width+': '+JSON.stringify(state));
  if(width===320)assert(state.theme&&state.touch&&state.target.every(n=>n>=44),'dark/coarse pointer or target size');
  geometry.push({width,queueHeight:state.size[0][3],target:state.target,dark:state.theme,coarse:state.touch});
  if(width===320)await page.screenshot({path:EGO_EVIDENCE_DIR+'/notify-open-320-dark.png'});
  await page.keyboard.press('Escape');
}
await page.keyboard.press('Enter');await page.evaluate(()=>infoFixture.rejectClipboard());
await focus('draft-copy','button');await page.keyboard.press('Enter');
state=await read();assert(state.manual?.exact&&state.manual?.readOnly&&state.manual?.focused&&state.recovering&&state.checked,'denied clipboard must expose exact backup without unblocking');
assert(!state.old&&state.fits,'manual backup must stay in the notification and fit');
await page.screenshot({path:EGO_EVIDENCE_DIR+'/notify-manual-320-dark.png'});
await page.keyboard.press('Escape');
state=await read();assert(!state.manual&&!state.notice&&state.focused==='info','closing destroys the manual backup field and restores focus');
await page.keyboard.press('Enter');
state=await read();assert(state.notice&&state.recovering&&!state.manual&&!state.checked,'reopen must retain recovery but reset the confirmation prompt');
await focus('draft-copy','button');await page.keyboard.press('Enter');
state=await read();assert(state.manual?.exact&&state.recovering,'backup changed after closing and reopening');
await page.evaluate(()=>infoFixture.changeRoute());
state=await read();assert(!state.visible&&!state.notice&&!state.draft&&state.sendClicks===0,'route change hides backup without editing/sending');
await page.evaluate(()=>infoFixture.restoreRoute());
await focus('info','list');await page.keyboard.press('Enter');
await page.evaluate(()=>infoFixture.acceptClipboard());
await focus('draft-copy','button');await page.keyboard.press('Enter');
state=await read();assert(!state.manual&&state.checked&&state.recovering,'successful copy must leave the send lock in place');
assert(await page.evaluate(()=>infoFixture.copied===infoFixture.backup),'clipboard received text different from the backup');
await focus('draft-done','button');await page.keyboard.press('Enter');
state=await read();assert(!state.notice&&!state.visible&&!state.recovering&&state.sendClicks===0,'explicit confirmation did not release only the recovery lock');
console.log(JSON.stringify({status:'PASS',evidence:'local fixture in Chromium',iconOnly:true,mouse:true,keyboard:true,unchangedLayout:true,geometry,clipboardDeniedExact:true,reopenKeepsBackup:true,routeIsolation:true,copyNeedsExplicitConfirmation:true,sendClicks:0}));
