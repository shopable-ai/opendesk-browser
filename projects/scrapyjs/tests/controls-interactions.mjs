import {readFile} from 'node:fs/promises';

// Observe and pause only the offline memory adapter. Never change generated HTML.
export async function exerciseControls(page,url,{screenshot=async()=>{}}={}){
  const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
  await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
  await page.addInitScript(()=>{
    const install=()=>{
      const define=Object.defineProperty;
      Object.defineProperty=function(target,key,descriptor){
        if(target===globalThis&&key==='OpenDeskTool'&&descriptor.value?.request){
          const tool=descriptor.value,t={calls:[],fail:false,pause:null,holdRetirement:false,unknownStart:false};
          globalThis.__scrapyControls=t;
          descriptor={...descriptor,value:Object.freeze({...tool,request:async(operation,payload)=>{
            t.calls.push({operation,payload:structuredClone(payload)});
            if(t.pause===operation){t.pause=null;await new Promise(resolve=>t.resume=resolve);}
            if(t.fail&&operation==='browser.downloads.text'){t.fail=false;throw Error('[纯模拟] 导出失败');}
            if(t.unknownStart&&operation==='tasks.start')throw Error('[纯模拟] 请求结果未知');
            const reply=await tool.request(operation,payload);
            if(t.holdRetirement&&['tasks.read','tasks.stop'].includes(operation)&&payload.clientRequestId)reply.retirementState='pending';
            return reply;
          }})};
        }
        return define(target,key,descriptor);
      };
    };
    const code='('+install.toString()+')();',d=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'srcdoc');
    Object.defineProperty(HTMLIFrameElement.prototype,'srcdoc',{...d,set(value){d.set.call(this,value.replace('<head>','<head><script>'+code+'</scr'+'ipt>'));}});
    install();
  });
  await page.goto(url);
  const f=page.frameLocator('#opendesk-preview-frame'),get=id=>f.locator('#'+id),click=id=>get(id).click();
  const patch=value=>get('tool-root').evaluate((_,v)=>Object.assign(globalThis.__scrapyControls,v),value);
  const focused=async id=>{await get(id).evaluate(el=>new Promise((resolve,reject)=>{let tries=0;const tick=()=>document.activeElement===el?resolve():++tries>90?reject(Error('focus missing: '+el.id)):requestAnimationFrame(tick);tick();}));return true;};
  const count=op=>get('tool-root').evaluate((_,op)=>globalThis.__scrapyControls.calls.filter(c=>c.operation===op).length,op);
  await f.locator('#profile-list option[value="demo"]').waitFor({state:'attached'});
  check(await get('tool-root').evaluate(()=>!!globalThis.__scrapyControls),'memory-only SDK observer installed');
  await screenshot('capture-icons');
  for(const [id,label] of [['start','开始采集'],['stop','停止采集']]){
    check(await get(id).getAttribute('aria-label')===label&&(id==='start'?(await get(id).innerText()).includes(label):await get(id).getAttribute('title')===label),label+' has a clear visible name or tooltip and accessible name');
    check((id==='start'?(await get(id).innerText()).includes('开始采集'):await get(id).innerText()==='')&&await get(id).locator('svg').count()===1,label+' retains its requested text/icon presentation');
  }
  const sizes=await get('start').evaluate(el=>[el.offsetWidth,el.offsetHeight,el.nextElementSibling.offsetWidth,el.nextElementSibling.offsetHeight]);
  check(sizes[0]>sizes[2]&&sizes[1]===sizes[3]&&sizes[2]<=44,'wide start has text beside the compact stop icon');
  check(await get('stop').isDisabled(),'idle stop is disabled');
  check(await get('manage-profiles').innerText()===''&&await get('manage-profiles').getAttribute('title')==='配置库'&&await get('manage-profiles').getAttribute('aria-label')==='配置库','library is icon-only with a clear tooltip and accessible name');
  await click('tab-rules');await namesMode(f,false);
  const groups=await f.locator('#rules-editor > :is(#field-editor,#crawl-editor,#mode-settings)').evaluateAll(es=>es.map(e=>({id:e.id,tag:e.tagName,skin:e.className})));
  check(groups.map(e=>e.id).join(',')==='field-editor,crawl-editor,mode-settings'&&groups[0].tag==='SECTION'&&groups.slice(1).every(e=>e.tag==='DETAILS')&&new Set(groups.slice(1).map(e=>e.skin)).size===1&&await f.getByRole('textbox',{name:'采集规则 title',exact:true}).isVisible(),'inline fields precede pagination and advanced groups with one disclosure skin');
  check(await get('rules-editor').evaluate(e=>getComputedStyle(e).display==='grid'&&parseFloat(getComputedStyle(e).rowGap)>0),'same-level rule groups have a consistent layout gap');
  await get('crawl-editor').locator(':scope > summary').click();
  check(await get('next-selector').isVisible(),'pagination group expands');
  await get('crawl-editor').locator(':scope > summary').click();await get('mode-settings').locator(':scope > summary').click();
  check(await get('execution-mode').isVisible(),'advanced group expands and exposes original mode control');
  await screenshot('rule-groups');await get('mode-settings').locator(':scope > summary').click();
  const placeholder=await get('ai-preview-placeholder').count()>0;
  const closeChat=()=>placeholder?f.getByRole('button',{name:'收起 AI 占位窗口',exact:true}).click():f.locator('.od-conversation-close').click();
  await page.locator('#sidebar-tool-conversation-toggle').click();if(!placeholder)await get('ai-requirement').fill('保留本轮 Chat 草稿');
  if(placeholder){
    check(await get('ai-preview-placeholder').isVisible()&&(await get('ai-preview-placeholder').innerText()).includes('OpenDesk「扩展」'),'preview AI displays a short placeholder and the real extension entry');
    check(await get('ai-preview-placeholder').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;}),'AI placeholder stays fully inside the tool viewport beside a scrollable rules editor');
    check(await get('ai-preview-placeholder').locator('input,textarea,form').count()===0&&await get('ai-panel').count()===0,'preview has no full AI form or fake sending controls');
    await screenshot('ai-placeholder');
    await closeChat();await page.locator('#sidebar-tool-conversation-toggle').focus();await page.locator('#sidebar-tool-conversation-toggle').press('Enter');
    await get('ai-preview-placeholder').waitFor({state:'visible'});
    await f.getByRole('button',{name:'收起 AI 占位窗口',exact:true}).press('Escape');
    await page.locator('#sidebar-tool-conversation-toggle').evaluate(e=>new Promise((resolve,reject)=>{let n=0;const tick=()=>document.activeElement===e?resolve():++n>90?reject(Error('AI trigger focus missing')):requestAnimationFrame(tick);tick();}));
    check(await get('ai-preview-placeholder').isHidden(),'AI placeholder closes by Escape and restores the outer trigger');
    await page.locator('#sidebar-tool-conversation-toggle').click();
    check(await count('ai.info')===0&&await count('ai.generate')===0&&await count('ai.cancel')===0,'opening and closing placeholder makes zero AI adapter requests');
  }
  await f.getByRole('textbox',{name:'采集规则 title',exact:true}).fill('h2 a');
  const originalJSON=await get('config-json').inputValue(),writes=await count('storage.set');
  await click('new-profile');await get('profile-confirm[open]').waitFor();
  check(await get('profile-confirm').evaluate(e=>e.matches(':modal'))&&await get('profile-confirm').getAttribute('role')==='alertdialog','new config uses a real sandbox modal alertdialog');
  check((await get('profile-confirm-text').innerText())==='未保存的 JSON 或未应用编辑将丢弃。确认新建配置？','discard description explicitly covers both draft kinds');
  check(await focused('profile-confirm-cancel'),'safe default focus is Cancel');
  await get('profile-confirm-cancel').press('Shift+Tab');check(await focused('profile-confirm-accept'),'backward Tab remains in dialog');
  await get('profile-confirm-accept').press('Tab');check(await focused('profile-confirm-cancel'),'forward Tab remains in dialog');
  await get('profile-list').evaluate(el=>el.focus());check(await focused('profile-confirm-cancel'),'modal background cannot take focus');
  await screenshot('discard-field-dialog');await click('profile-confirm-cancel');
  check(await focused('new-profile')&&await get('field-rule').inputValue()==='h2 a','cancel retains unapplied field and returns to plus');
  check(await get('config-json').inputValue()===originalJSON&&await count('storage.set')===writes,'cancel preserves full config without a storage write');
  await click('new-profile');await get('profile-confirm-cancel').press('Escape');
  check(await focused('new-profile')&&await get('field-rule').inputValue()==='h2 a','Escape retains field draft and returns focus');
  await click('manage-profiles');await click('library-new-profile');await click('profile-confirm-cancel');
  check(await focused('library-new-profile')&&await get('profile-management').isVisible(),'library new config shares modal and restores its own trigger');
  await click('profile-entry-douban');await click('profile-confirm-cancel');
  check(await focused('profile-entry-douban')&&await get('profile-list').inputValue()==='demo','cancel switch preserves exact saved identity');
  await get('profile-more-actions').locator(':scope > summary').click();
  await click('delete-profile');check((await get('profile-confirm-text').innerText()).includes('示例 · 列表采集'),'delete confirmation retains precise record name');await click('profile-confirm-cancel');
  await page.locator('#sidebar-tool-back').click();check(await get('field-rule').inputValue()==='h2 a'&&(placeholder?await get('ai-preview-placeholder').isVisible():await get('ai-requirement').inputValue()==='保留本轮 Chat 草稿'),'library roundtrip retains rule and Chat drafts');
  await closeChat();
  await click('apply-field');await click('tab-json');
  const applied=JSON.parse(await get('config-json').inputValue());
  const complex={...applied,validation:{version:1,rowShape:'book'},itemConfig:{...applied.itemConfig,nested:{selector:'p',read:'innerHTML'}}};
  await get('config-json').fill(JSON.stringify(complex,null,2));
  check(await get('config-json').getAttribute('aria-invalid')==='false','full JSON still accepts complex rules and validation');
  await get('config-json').evaluate(e=>{e.scrollTop=0;e.blur();});
  await screenshot('json-layout');
  let download=page.waitForEvent('download');await click('export-config');
  check(JSON.stringify(JSON.parse(await readFile(await (await download).path(),'utf8')))===JSON.stringify(complex),'compact export downloads the complete current JSON');
  await patch({fail:true});await click('export-config');await get('config-export-error').filter({hasText:'导出失败'}).waitFor();
  check(await get('config-export-status').isHidden()&&await get('config-export-error').isVisible(),'failed export is visible next to JSON and clears stale success');
  await screenshot('json-export-error');
  await patch({pause:'browser.downloads.text'});await click('export-config');
  check(await get('export-config').isDisabled(),'pending export blocks duplicate download');
  download=page.waitForEvent('download');await get('tool-root').evaluate(()=>globalThis.__scrapyControls.resume());await download;
  await get('config-json').fill('{ invalid JSON');await get('json-error').waitFor({state:'visible'});
  check(await get('export-config').isDisabled()&&await get('config-json').getAttribute('aria-invalid')==='true','invalid JSON remains visible and cannot export');
  await screenshot('json-invalid');
  await click('new-profile');await screenshot('discard-json-dialog');await click('profile-confirm-cancel');
  check(await focused('new-profile')&&await get('config-json').inputValue()==='{ invalid JSON','Cancel preserves invalid JSON verbatim');
  await click('new-profile');await get('profile-confirm-cancel').press('Escape');
  check(await focused('new-profile')&&await get('config-json').inputValue()==='{ invalid JSON','Escape preserves invalid JSON verbatim');
  await click('manage-profiles');await click('library-new-profile');await get('profile-confirm-cancel').press('Escape');
  check(await focused('library-new-profile')&&await get('config-json').inputValue()==='{ invalid JSON','library Escape preserves JSON and restores its own trigger');await page.locator('#sidebar-tool-back').click();
  await click('new-profile');await get('profile-confirm').dispatchEvent('compositionstart');
  await get('profile-confirm-accept').dispatchEvent('keydown',{key:'Enter',isComposing:true,keyCode:229});
  await get('profile-confirm-accept').dispatchEvent('click');await get('profile-confirm').dispatchEvent('cancel');
  check(await get('profile-confirm').evaluate(e=>e.open)&&await get('config-json').inputValue()==='{ invalid JSON','composition events cannot confirm or dismiss the draft');
  await get('profile-confirm').dispatchEvent('compositionend');await click('profile-confirm-accept');await get('profile-confirm').waitFor({state:'hidden'});
  check(await get('profile-list').inputValue()===''&&await get('config-json').inputValue()!=='{ invalid JSON','only explicit confirmation creates a fresh config');
  check(await focused('new-profile')&&await count('storage.set')===writes,'new config returns focus and does not overwrite saved profiles');
  // A just-created config is itself an unsaved draft in the existing model.
  // Return to a saved clean profile before checking the no-confirmation path.
  await click('manage-profiles');await click('profile-entry-demo');await click('profile-confirm-accept');await page.locator('#sidebar-tool-back').click();
  await click('new-profile');check(await get('profile-confirm').isHidden(),'clean saved config requires no discard step');
  await click('manage-profiles');await click('profile-entry-demo');await click('profile-confirm-accept');
  await click('library-new-profile');check(await get('profile-confirm').isHidden(),'clean library creation requires no discard step');
  await click('profile-entry-demo');await click('profile-confirm-accept');await f.locator('#profile-entry-demo[aria-pressed="true"]').waitFor();await page.locator('#sidebar-tool-back').click();
  await click('tab-results');
  const columnName=f.getByRole('textbox',{name:'title 显示名称',exact:true});
  // Results become available after a normal run below; retain original column controls.
  await patch({holdRetirement:true});await get('start').press('Enter');
  await get('run-summary').filter({hasText:'正在采集'}).waitFor();
  check(await get('start').isDisabled()&&await get('new-profile').isDisabled(),'running locks start and new config');
  await click('manage-profiles');check(await get('library-new-profile').isDisabled()&&await get('delete-profile').isDisabled(),'busy library cannot bypass creation or deletion lock');await page.locator('#sidebar-tool-back').click();
  await get('stop').press('Space');await get('run-summary').filter({hasText:'等待原实例退出'}).waitFor();
  check(await get('stop').isDisabled()&&await get('start').isDisabled(),'accepted stop stays disabled while waiting for original retirement');
  const identities=await get('tool-root').evaluate(()=>{const c=globalThis.__scrapyControls.calls;return {start:c.find(x=>x.operation==='tasks.start'),stops:c.filter(x=>x.operation==='tasks.stop')};});
  check(identities.stops.length===1&&identities.stops[0].payload.clientRequestId===identities.start.payload.clientRequestId,'keyboard play and stop preserve original correlated request');
  await screenshot('stop-waiting');
  await patch({holdRetirement:false});await get('run-summary').filter({hasText:'采集已停止'}).waitFor();
  await get('start').press('Space');await get('run-summary').filter({hasText:'采集完成'}).waitFor();
  check(await get('record-table').isVisible(),'normal restart still renders original result component');
  await click('edit-result-columns');await namesMode(f,true);
  await columnName.fill('本轮列名称');await columnName.press('Enter');await namesMode(f,false);
  await click('manage-profiles');await page.locator('#sidebar-tool-back').click();await click('tab-results');
  check((await get('record-table').locator('thead').innerText()).includes('本轮列名称'),'library roundtrip retains result column settings');
  await click('tab-results');await screenshot('results-compatible');
  await patch({unknownStart:true});await click('start');await get('run-summary').filter({hasText:'运行状态待确认'}).waitFor();
  const starts=await count('tasks.start');
  check(await get('start').isDisabled()&&await get('new-profile').isDisabled()&&starts===3,'unknown start remains fenced without replay or profile change');
  check(await page.locator('#opendesk-preview-frame').getAttribute('sandbox')==='allow-scripts allow-downloads','opaque sandbox privileges remain unchanged');
  return {checks,count:checks.length,ime:'SYNTHETIC_COMPOSITION_ONLY',unknown:'TEST_MEMORY_ONLY_REAL_UNKNOWN_UNTOUCHED'};
}

async function namesMode(frame,selected){
  const control=frame.getByRole('switch',{name:'显示名称',exact:true});
  if(await control.isChecked()!==selected)await frame.locator('.rule-display-toggle label').click();
}
async function restoreColumns(frame){
  const options=frame.locator('#column-view-settings');
  if(await options.getAttribute('open')===null)await options.locator('summary').click();
  await frame.locator('#reset-columns').click();
}
