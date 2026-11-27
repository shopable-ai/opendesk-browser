// Run with ego-browser nodejs; set EGO_TEST_SPACE and EGO_FIXTURE_URL in the script.
const page=(await taskSpace(EGO_TEST_SPACE)).page('p1');
const fixtureUrl=new URL(EGO_FIXTURE_URL);
if(fixtureUrl.protocol!=='http:'||fixtureUrl.hostname!=='127.0.0.1'||
  !fixtureUrl.pathname.endsWith('/tests/fixtures/failed-edit.html'))throw Error('Expected a loopback fixture URL');
fixtureUrl.searchParams.set('run',crypto.randomUUID());
await page.goto(fixtureUrl.href);
await page.waitForFunction(()=>window.failedEditFixture||window.fixtureError,null,{timeout:8000});
const assert=(ok,why)=>{if(!ok)throw Error(why);};
assert(!await page.evaluate(()=>window.fixtureError),'Local fixture failed to mount');
const state=()=>page.evaluate(()=>failedEditFixture.read());
const type='textarea[aria-label="暂停草稿正文"]';
const edit='[data-action="edit"][data-id="q1"]';
const copy='[data-action="copy"]';
const save='[data-action="edit-save"]';
const cancel='[data-action="edit-cancel"]';
const read=()=>page.evaluate(()=>{
  const root=document.querySelector('[data-od-id$="send-queue.feedback"]')?.shadowRoot;
  const input=root?.querySelector('.sq-recovery-editor textarea');
  const manual=root?.querySelector('textarea[readonly]');
  const reason=root?.querySelector('.sq-error-text');
  const r=root?.querySelector('[data-action="copy"]')?.getBoundingClientRect();
  return {editor:input?.value??null,focused:root?.activeElement===input,reason:reason?.textContent,
    hit:r&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===root.host,
    receipt:root?.querySelector('.sq-recovery-editor .sq-error-receipt')?.textContent,
    manual:manual&&{value:manual.value,readOnly:manual.readOnly,selected:manual.selectionStart===0&&
      manual.selectionEnd===manual.value.length&&root.activeElement===manual}};
});
const baseline=await state(),original=baseline.cache.items[0].text;
const edited='  Edited synthetic item 🙂\n\nFinal line  ';
assert(baseline.cache.inFlight?.id==='q1'&&baseline.cache.items.length===2,'Expected fresh local fixture data');
await page.click(edit,{label:'Open failed queue editor'});
let ui=await read();
assert(ui.editor===original&&ui.focused,'Editor must open with the exact original and focus');
assert(ui.hit&&ui.reason.includes('刷新前发送结果未知'),'Copy must be clickable above the simulated site header');
const diagnostic=ui.reason;
await page.click(copy,{label:'Copy complete failure reason'});
assert((await state()).clipboard.at(-1)===diagnostic,'Clipboard received an incomplete or different diagnosis');
await page.evaluate(()=>failedEditFixture.denyClipboard());
await page.click(copy,{label:'Try copy with permission denied'});
ui=await read();
assert(ui.manual?.value===diagnostic&&ui.manual.readOnly&&ui.manual.selected,'Manual copy must select the complete diagnostic');
await page.fill(type,edited);
await page.click(cancel,{label:'Cancel the first edit'});
assert((await read()).editor===null,'Cancel did not close the editor');
assert(JSON.stringify((await state()).cache)===JSON.stringify(baseline.cache),'Cancel changed the original queue');
await page.click(edit,{label:'Reopen the failure editor'});
assert((await read()).editor===original,'Cancel must discard the unsaved edit');
await page.fill(type,edited);
await page.evaluate(()=>failedEditFixture.allowSave(false));
await page.click(save,{label:'Save with storage denied'});
ui=await read();
assert(ui.editor===edited&&/缓存保存失败/.test(ui.receipt),'Failed save lost the edited text or its error');
assert(JSON.stringify((await state()).cache)===JSON.stringify(baseline.cache),'Failed save changed persisted state');
await page.evaluate(()=>failedEditFixture.allowSave(true));
await page.click(save,{label:'Save as a paused draft'});
assert((await read()).editor===null,'Successful save left the editor open');
const saved=await state(),items=saved.cache.items;
assert(items.length===3&&items[1].text===edited&&items[1].state==='paused','Edited copy must be paused and exact');
assert(JSON.stringify([items[0],items[2]])===JSON.stringify(baseline.cache.items)&&saved.cache.inFlight.id==='q1',
  'Saving changed the original or another queue item');
assert(saved.clicks===0&&saved.composer===baseline.composer,'Recovery changed the real composer or submitted');
await page.fill('#prompt-textarea','');
await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,1600)));
assert((await state()).clicks===0,'Recovery caused a click with a ready, empty native composer');
await page.reload();
await page.waitForFunction(()=>!!window.failedEditFixture,null,{timeout:8000});
await page.waitForFunction(()=>{
  const list=document.querySelector('[data-od-id$="send-queue.list"]')?.shadowRoot;
  return !!list?.querySelector('.sq-unknown[data-id-row="q1"]')&&
    !!list?.querySelector('.sq-paused[data-id-row="q3"]');
},null,{timeout:8000});
const restored=await state();
assert(restored.cache.inFlight.id==='q1'&&restored.cache.items[1].text===edited&&
  restored.cache.items[1].state==='paused'&&restored.clicks===0,'Refresh lost the paused draft or released the lock');
console.log({status:'PASS',nativeClicks:0,editableOriginal:true,cancelPreserved:true,saveFailurePreserved:true,
  pausedAfterReload:true,clipboardExact:true,manualCopyExact:true,headerHitTest:true});
