import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {startSharedConfirmationServer} from '../helpers/shared-confirmation-server.mjs';

// Explicit opt-in only. Ego's injected OpenDeskSDK conflicts with the opaque
// HTTP sandbox, so this source fixture requires a clean Chromium context.
const modulePath=process.env.OPENDESK_PLAYWRIGHT_MODULE;
test('shared confirmation preserves real sandbox drafts, focus and business ownership',{
  skip:modulePath?false:'NOT_TESTED: OPENDESK_PLAYWRIGHT_MODULE required',timeout:90000
},async t=>{
  const {chromium}=await import(modulePath),fixture=await startSharedConfirmationServer({aiProxyIdentity:'source'});
  t.after(()=>fixture.close());
  assert.deepEqual(fixture.manifest.gaps,[]);
  const browser=await chromium.launch({headless:true,...(process.env.OPENDESK_CHROMIUM_EXECUTABLE?
    {executablePath:process.env.OPENDESK_CHROMIUM_EXECUTABLE}:{})});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:400,height:600}}),errors=[],checks=[];
  page.setDefaultTimeout(6500);page.on('pageerror',error=>errors.push(String(error.stack)));
  const report={inputHash:fixture.inputHash,browser:browser.version(),surface:'offline source fixture',
    aiProxyIdentity:fixture.manifest.aiProxyIdentity,installation:'NOT_TESTED',chromePermissions:'NOT_TESTED',checks,errors};
  t.after(()=>writeFile(fixture.outputDir+'/confirmation-results.json',JSON.stringify(report,null,2)+'\n'));
  t.diagnostic(fixture.outputDir);
  const frame=()=>page.frameLocator('#sidebar-tool-frame iframe');
  const modal=()=>page.getByRole('alertdialog');
  const cancel=()=>page.locator('#sidebar-tool-action-cancel');
  const accept=()=>page.locator('#sidebar-tool-action-continue');
  async function open(id){
    await page.evaluate(id=>fixture.open(id),id);
    const expected=id==='vue'?'vue-notes-starter':id==='vue-confirm'?'vue-confirm-fixture':id;
    await page.waitForFunction(expected=>{
      const fields=fixture.view.getSnapshot().fields;
      return fields['sidebar-tool-display'].data.toolId===expected||!fields['sidebar-tool-action-review'].hidden;
    },expected);
    // A legacy starter does not publish an explicit saved/dirty baseline. Its
    // conservative original departure guard still requires a deliberate choice.
    if(await modal().isVisible())await accept().click();
    await frame().locator('#tool-status').waitFor({state:'hidden'});
  }
  async function dismiss(key='Escape'){
    if(key==='click')await cancel().click();else await page.keyboard.press(key);
    await modal().waitFor({state:'hidden'});
  }
  async function assertModal(){
    await modal().waitFor();
    assert.equal(await modal().count(),1);
    assert.equal(await cancel().evaluate(n=>n===document.activeElement),true);
    const facts=await modal().evaluate(n=>{
      const r=n.getBoundingClientRect(),surface=n.parentElement.getBoundingClientRect();
      return {name:document.getElementById(n.getAttribute('aria-labelledby'))?.textContent,
        description:document.getElementById(n.getAttribute('aria-describedby'))?.textContent,
        hostInert:document.getElementById('opendesk-react-app').inert,
        scrollLocked:document.body.style.overflow==='hidden',
        x:surface.x,y:surface.y,right:surface.right,bottom:surface.bottom,width:innerWidth,height:innerHeight};
    });
    assert.ok(facts.name&&facts.description);assert.ok(facts.hostInert&&facts.scrollLocked);
    assert.ok(facts.x>=0&&facts.y>=0&&facts.right<=facts.width+1&&facts.bottom<=facts.height+1);
    return facts;
  }
  try{
    await page.goto(fixture.url);await page.waitForFunction(()=>window.fixture||window.fixtureError);
    assert.equal(await page.evaluate(()=>window.fixtureError),undefined);
    await open('webflow');
    await frame().getByRole('tab',{name:'脚本',exact:true}).click();
    await frame().getByText('百度搜索 · 前三条自然结果',{exact:true}).click();
    const query=frame().locator('#wf-query');await query.fill('preserved fixture draft');
    const iframe=await page.locator('iframe').elementHandle(),bounds=await page.locator('iframe').boundingBox();
    await page.locator('#sidebar-tool-back').click();await assertModal();
    assert.deepEqual(await page.locator('iframe').boundingBox(),bounds,'confirmation does not reflow the business canvas');
    await page.screenshot({path:fixture.outputDir+'/webflow-confirm.png'});
    await dismiss();
    assert.equal(await query.inputValue(),'preserved fixture draft');
    assert.equal(await page.locator('iframe').evaluate((n,original)=>n===original,iframe),true);
    await page.locator('#sidebar-tool-back').click();await assertModal();await accept().click();
    await page.locator('#sidebar-tool-list-view').waitFor({state:'visible'});
    assert.equal(await page.locator('iframe').count(),0);
    checks.push('Web Flow cancel preserves draft/iframe; discard leaves once; overlay does not resize canvas');

    await open('quick-notes');await frame().locator('#add-note').click();
    const note=frame().locator('#note-text');await note.fill('Quick Notes browser fixture');
    await page.locator('#sidebar-tool-back').click();await assertModal();await dismiss('click');
    assert.equal(await note.inputValue(),'Quick Notes browser fixture');
    await frame().locator('#save-note').click();
    await frame().getByText('已保存到本机。',{exact:true}).waitFor();
    const writes=()=>page.evaluate(()=>fixture.calls.filter(row=>row.operation==='storage.set').length);
    const beforeDelete=await writes();
    await frame().locator('#delete-note').click();await assertModal();await dismiss();
    assert.equal(await writes(),beforeDelete,'cancel does not delete');
    await frame().locator('#delete-note').click();await assertModal();await accept().click();
    await frame().getByText('笔记已删除。',{exact:true}).waitFor();
    assert.equal(await writes(),beforeDelete+1,'one confirmed conditional business write');
    assert.equal(await frame().locator('#note-confirm').isVisible(),false,'no second business confirmation');
    checks.push('HTML internal header navigation uses shared confirmation; cancel writes zero; delete writes exactly once');

    await open('vue');await frame().locator('textarea').fill('unchanged Vue starter');
    await frame().getByRole('button',{name:'保存',exact:true}).click();
    await frame().getByText('已保存',{exact:true}).waitFor();
    checks.push('unchanged Vue SFC opens, edits, saves through its original SDK');
    await open('vue-confirm');const trigger=frame().locator('#vue-confirm');
    await trigger.focus();await page.keyboard.down('Enter');await assertModal();
    await page.keyboard.down('Enter');await page.keyboard.up('Enter');
    assert.equal(await modal().count(),1,'held opening key does not approve');
    await page.mouse.click(1,1);assert.equal(await modal().count(),1,'backdrop does not dismiss');
    await page.keyboard.press('Tab');assert.equal(await accept().evaluate(n=>n===document.activeElement),true);
    await page.keyboard.press('Tab');assert.equal(await cancel().evaluate(n=>n===document.activeElement),true);
    await page.keyboard.press('Shift+Tab');assert.equal(await accept().evaluate(n=>n===document.activeElement),true);
    await dismiss();await frame().getByText('{"action":"cancel","reason":"escape"}',{exact:true}).waitFor();
    await trigger.evaluate(n=>new Promise((resolve,reject)=>{
      let remaining=60;function check(){if(n===document.activeElement)resolve(true);
        else if(--remaining)requestAnimationFrame(check);else reject(Error('trigger focus not restored'));}check();}));
    await trigger.focus();await page.keyboard.press('Space');await assertModal();
    await accept().focus();await page.keyboard.press('Enter');
    await frame().getByText('{"action":"confirm"}',{exact:true}).waitFor();
    await modal().waitFor({state:'hidden'});
    checks.push('Vue ordinary API: real Enter/Space/Escape, repeat suppression, focus cycle and cross-iframe restoration');
    const sandbox=await (await page.locator('iframe').elementHandle()).contentFrame();
    await sandbox.evaluate(()=>{
      const dialog=document.createElement('dialog');dialog.id='native-cancel-fixture';
      dialog.innerHTML='<button id="native-cancel-focus">Native dialog focus</button>';
      OpenDeskTool.root.append(dialog);window.nativeCancelResult=null;
      dialog.addEventListener('cancel',event=>{
        event.preventDefault();window.nativeCancelTrusted=event.isTrusted;
        OpenDeskTool.ui.confirm({title:'Native Escape',message:'Keep or discard this draft?',confirmLabel:'Discard'})
          .then(result=>{window.nativeCancelResult=result;},error=>{window.nativeCancelResult=error.code;});
      });
      dialog.showModal();dialog.requestClose();
    });
    await sandbox.waitForFunction(()=>window.nativeCancelResult!==null);
    assert.equal(await sandbox.evaluate(()=>window.nativeCancelTrusted),true);
    assert.equal(await sandbox.evaluate(()=>window.nativeCancelResult),'E_USER_GESTURE_REQUIRED');
    assert.equal(await modal().count(),0,'script requestClose cannot acquire a display gesture');
    await sandbox.evaluate(()=>{window.nativeCancelResult=null;});
    await sandbox.locator('#native-cancel-focus').press('Escape');await assertModal();await dismiss();
    await sandbox.waitForFunction(()=>window.nativeCancelResult?.action==='cancel');
    assert.deepEqual(await sandbox.evaluate(()=>window.nativeCancelResult),{action:'cancel',reason:'escape'});
    await sandbox.evaluate(()=>document.getElementById('native-cancel-fixture').remove());
    checks.push('native dialog: script trusted cancel rejected; real Escape opens one ordinary confirmation');
    assert.equal(await page.evaluate(()=>document.getElementById('opendesk-react-app').inert),false);
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
    assert.ok(!String(await page.locator('iframe').getAttribute('sandbox')).includes('allow-modals'));
    await page.setViewportSize({width:320,height:300});await page.emulateMedia({colorScheme:'dark'});
    await frame().locator('#vue-confirm-long').click();await assertModal();
    assert.equal(await modal().locator('b').count(),0,'message tags remain plain text');
    assert.match(await modal().innerText(),/<b>仅作为文字<\/b>/);
    const long=await modal().evaluate(n=>({surface:n.parentElement.scrollHeight>n.parentElement.clientHeight,
      paper:getComputedStyle(n.parentElement).backgroundColor}));
    assert.equal(long.surface,true,'long consequence scrolls inside the bounded modal');
    assert.notEqual(long.paper,'rgb(255, 255, 255)','portal uses the existing dark tokens');
    await accept().scrollIntoViewIfNeeded();await page.screenshot({path:fixture.outputDir+'/long-dark-confirm.png'});
    await dismiss('click');await page.setViewportSize({width:400,height:600});await page.emulateMedia({colorScheme:'light'});
    checks.push('long plain-text confirmation fits a 320x300 dark host and keeps both decisions reachable');

    // The existing full tool page hosts the real trusted Surface and native
    // editor. Memory installation/storage/status replace external services only.
    await page.evaluate(()=>fixture.setSurface('page'));
    await page.evaluate(()=>fixture.open('ai-proxy'));
    const addProxy=page.getByRole('button',{name:'＋ 添加代理',exact:true});
    await addProxy.click();
    const editor=page.locator('.proxyEditorDialog'),host=page.locator('#ep-host');
    await editor.waitFor();await host.fill('proxy.example.net');await page.locator('#ep-port').fill('8080');
    await host.focus();await host.evaluate(n=>n.setSelectionRange(2,8));
    await host.press('Escape');await assertModal();
    assert.equal(await editor.evaluate(n=>n.open),false,'editor yields its native top layer');
    assert.equal(await page.locator('dialog[open]').count(),0,'no competing native modal');
    await page.screenshot({path:fixture.outputDir+'/ai-proxy-confirm.png'});
    await dismiss();await editor.waitFor({state:'visible'});
    assert.equal(await host.inputValue(),'proxy.example.net');
    assert.equal(await page.locator('#ep-port').inputValue(),'8080');
    assert.equal(await host.evaluate(n=>n===document.activeElement),true);
    assert.deepEqual(await host.evaluate(n=>[n.selectionStart,n.selectionEnd]),[2,8]);
    // Let the original close event finish before the next real Escape.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await editor.evaluate(n=>n.open),true);
    await host.press('Escape');await assertModal();await accept().click();
    await editor.waitFor({state:'hidden'});
    assert.equal(await page.locator('#proxy-confirm').count(),0,'shared support never opens the local fallback');
    await addProxy.click();await editor.waitFor();
    assert.equal(await host.inputValue(),'','discard clears only the old editor generation');
    await host.press('Escape');await editor.waitFor({state:'hidden'});
    assert.equal(await modal().count(),0,'clean editor closes without confirmation');
    checks.push('React AI Proxy: real native Escape yields modal; Keep restores draft/focus/selection; discard closes once; clean reopen stays clean');
    assert.deepEqual(await page.evaluate(()=>fixture.errors),[]);
    assert.deepEqual(errors,[]);
    // A browser run describes this frozen candidate, never later parallel edits.
    for(const [name,input]of Object.entries(fixture.inputs)){
      if(name.startsWith('node_modules/'))continue;
      assert.equal(createHash('sha256').update(await readFile(new URL('../../'+name,import.meta.url))).digest('hex'),
        input.sha256,'source changed during browser run: '+name);
    }
    report.result='PASS';
  }catch(error){report.result='FAIL';report.failure=error.message;
    await page.screenshot({path:fixture.outputDir+'/failure.png'}).catch(()=>{});throw error;}
});
