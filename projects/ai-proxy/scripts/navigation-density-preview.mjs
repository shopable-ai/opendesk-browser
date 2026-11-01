// Source-bound, memory-only UI check. Caller supplies existing Playwright;
// no installation, real proxy, profile data or privileged browser APIs.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.argv[2];
assert.ok(url?.startsWith('http://127.0.0.1:43263/projects/ai-proxy/.opendesk-preview/source-'));
const out=resolve(process.argv[3]||'projects/ai-proxy/evidence/navigation-density-20261031');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
const context=await browser.newContext({viewport:{width:1100,height:1120}});
const page=await context.newPage();page.setDefaultTimeout(7000);
const app=page.frameLocator('#opendesk-preview-frame'),checks=[],errors=[],external=[];
const report={kind:'source-bound Chromium memory UI',url,browser:browser.version(),at:new Date().toISOString(),checks,errors,external,screenshots:{},metrics:{}};
page.on('pageerror',e=>errors.push(e.message));
context.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==new URL(url).origin)external.push(r.url());});
const section=id=>app.locator('#settings-section').selectOption(id);
async function shot(name){
 for(const frame of page.frames())await frame.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 const file=join(out,name+'.png');await page.locator('.preview-device').screenshot({path:file});
 report.screenshots[name]={file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')};
}
async function profileMetrics(){
 return app.locator('.optionsContent--profiles').evaluate(root=>{
  const css=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {height:r.height,margin:s.margin,padding:s.padding,gap:s.gap,borderTop:s.borderTopWidth};};
  return {content:css(root),header:css(root.querySelector('.optionsPageHead')),list:css(root.querySelector('.profileRecords')),rows:[...root.querySelectorAll('.proxyRecord')].map(css)};
 });
}
try{
 await page.goto(url);
 await app.locator('#quick-settings').click();
 await app.getByRole('heading',{name:/代理配置/}).waitFor();
 assert.equal(await app.getByRole('tablist').count(),0);
 assert.equal(await app.locator('#settings-section option').count(),7);
 assert.equal(await app.locator('.settingsAddWays').count(),0);
 assert.equal(await app.locator('#settings-import').getAttribute('title'),'导入配置');
 assert.equal(await app.locator('#settings-import').innerText(),'导入配置');
 await app.locator('#settings-import').focus();await app.locator('#settings-import').press('Enter');await app.locator('#backup-file').waitFor();
 assert.equal(await app.locator('#settings-section').inputValue(),'backup');await section('profiles');
 for(const source of ['subscription','local']){
  await app.getByRole('button',{name:source==='subscription'?'记录订阅来源':'添加本地客户端',exact:true}).click();
  const field=app.locator(source==='subscription'?'#r72-sub-url':'#r72-local-port');await field.waitFor();
  const value=source==='subscription'?'https://example.net/private-fixture?token=memory-only':'7899';
  await field.fill(value);
  for(const exit of ['cancel','escape']){
   const dismiss=()=>exit==='cancel'?app.locator('.sourceEditorHead').getByRole('button',{name:'取消',exact:true}).click():field.press('Escape');
   await dismiss();await app.locator('#proxy-confirm-cancel').click();assert.equal(await field.inputValue(),value);
   await dismiss();await app.locator('#proxy-confirm-accept').click();await app.locator('#source-editor').waitFor({state:'hidden'});
   if(exit==='cancel'){
    await section('profiles');await app.getByRole('button',{name:source==='subscription'?'记录订阅来源':'添加本地客户端',exact:true}).click();
    await field.fill(value);
   }
  }
  await section('profiles');
 }
 checks.push('Subscription/local Cancel and Escape both Keep every draft field or discard only after confirmation');
 const localEdit=app.getByRole('button',{name:'编辑 本地客户端',exact:true});
 const localEditId=await localEdit.getAttribute('id');
 await localEdit.click();await app.locator('#r72-local-port').waitFor();
 assert.equal(await app.locator('#r72-local-name').inputValue(),'本地客户端');
 const originalPort=await app.locator('#r72-local-port').inputValue();
 assert.ok(originalPort);await app.locator('#r72-local-port').fill('7898');
 await app.locator('.sourceEditorHead').getByRole('button',{name:'取消',exact:true}).click();
 await app.locator('#proxy-confirm-cancel').click();assert.equal(await app.locator('#r72-local-port').inputValue(),'7898');
 await app.locator('#r72-local-port').press('Escape');await app.locator('#proxy-confirm-accept').click();
 await app.locator('#'+localEditId).waitFor();assert.equal(await app.locator('#'+localEditId).evaluate(el=>el===document.activeElement),true);
 await localEdit.click();assert.equal(await app.locator('#r72-local-port').inputValue(),originalPort);
 await app.locator('#r72-local-port').fill('7898');await app.locator('.sourceForm button[type="submit"]').click();
 await app.locator('#'+localEditId).waitFor();assert.equal(await app.locator('#'+localEditId).evaluate(el=>el===document.activeElement),true);
 assert.match(await app.locator('.proxyRecord').filter({has:app.locator('#'+localEditId)}).innerText(),/:7898/);
 assert.equal(await app.locator('.proxyRecord').count(),3);assert.equal(await app.locator('.proxyApplied').count(),0);
 checks.push('Local-client edit opens the selected endpoint; discard/save return to its original row and focus without adding or applying');
 checks.push('No mixed add menu; import opens backup, subscription opens its URL form, local client opens its port form');
 report.metrics.profiles=await profileMetrics();
 report.metrics.sections=await app.locator('.optionsContent--profiles').evaluate(root=>{
  const children=[...root.children].filter(el=>el.getBoundingClientRect().height>0);
  return children.map((el,i)=>({class:el.className,margin:getComputedStyle(el).margin,
   before:i?el.getBoundingClientRect().top-children[i-1].getBoundingClientRect().bottom:null}));
 });
 assert.ok(report.metrics.sections.every(row=>row.margin==='0px'&&(row.before===null||row.before===16)));
 const {content,header,list,rows}=report.metrics.profiles;
 assert.equal(content.gap,'16px');assert.equal(header.margin,'0px');assert.equal(list.margin,'0px');
 assert.equal(new Set(rows.map(r=>r.height-parseFloat(r.borderTop))).size,1);
 for(const row of rows){assert.equal(row.gap,'8px');assert.equal(row.padding,'12px 0px');}
 assert.equal(await app.locator('.recordActions').first().evaluate(el=>getComputedStyle(el).gap),'8px');
 assert.equal(await app.locator('.proxyRecordTitle [role="img"]').count(),1);
 await shot('profiles');checks.push('No business Tabs; seven settings sections; zero stacked margins; uniform two-line rows; inline local-client status');
 await app.locator('#settings-import').press('Tab');await app.locator('#settings-close').focus();
 report.metrics.icons=await app.locator('.options .proxyIconButton:visible').evaluateAll(elements=>elements.map(el=>{
  const css=getComputedStyle(el),rect=el.getBoundingClientRect();return {label:el.getAttribute('aria-label'),title:el.title,
   width:rect.width,height:rect.height,focus:el.matches(':focus-visible'),outline:css.outlineStyle,outlineWidth:css.outlineWidth};
 }));
 assert.ok(report.metrics.icons.every(icon=>icon.width===34&&icon.height===34&&icon.title&&icon.label));
 assert.ok(report.metrics.icons.some(icon=>icon.focus&&icon.outline==='solid'&&parseFloat(icon.outlineWidth)>=2));
 await app.locator('#settings-import').focus();await shot('import-focus');
 await app.locator('.pacDetails > summary').click();
 report.metrics.pac=await app.locator('.pacContent').evaluate(root=>({gap:getComputedStyle(root).gap,
  children:[...root.children].map(el=>({margin:getComputedStyle(el).margin})),
  fieldsGap:getComputedStyle(root.querySelector('.pacEditorFields')).gap,
  fieldGaps:[...root.querySelectorAll('.proxyFormField')].map(el=>getComputedStyle(el).gap),
  actionsGap:root.querySelector('.pacEditorForm .actions').getBoundingClientRect().top-root.querySelector('.pacEditorFields').getBoundingClientRect().bottom}));
 assert.equal(report.metrics.pac.gap,'16px');assert.ok(report.metrics.pac.children.every(row=>row.margin==='0px'));
 assert.equal(report.metrics.pac.fieldsGap,'12px');assert.ok(report.metrics.pac.fieldGaps.every(gap=>gap==='8px'));assert.equal(report.metrics.pac.actionsGap,16);
 const pacRow=app.locator('.pacRecord').first(),pacEdit=pacRow.getByRole('button',{name:/编辑/}),pacDelete=pacRow.getByRole('button',{name:/删除/});
 await pacEdit.press('Tab');await pacEdit.focus();
 report.metrics.pacRecord=await pacRow.evaluate(row=>{
  const text=row.firstElementChild.getBoundingClientRect(),actions=row.lastElementChild.getBoundingClientRect();
  return {height:row.getBoundingClientRect().height,columns:getComputedStyle(row).gridTemplateColumns,
   sameRow:Math.abs((text.top+text.bottom)/2-(actions.top+actions.bottom)/2)<1,
   icons:[...row.querySelectorAll('button')].map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();
    return {label:el.getAttribute('aria-label'),title:el.title,width:r.width,height:r.height,focus:el.matches(':focus-visible'),outline:s.outlineWidth};})};
 });
 assert.equal(report.metrics.pacRecord.sameRow,true);assert.ok(report.metrics.pacRecord.icons.every(i=>i.label&&i.title&&i.width===34&&i.height===34));
 assert.ok(report.metrics.pacRecord.icons.some(i=>i.focus&&parseFloat(i.outline)>=2));
 const dangerNormal=await pacDelete.evaluate(el=>getComputedStyle(el).color);await pacDelete.hover();
 report.metrics.dangerHover=await pacDelete.evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));
 assert.equal(report.metrics.dangerHover.color,dangerNormal);assert.notEqual(report.metrics.dangerHover.background,'rgba(0, 0, 0, 0)');
 await pacEdit.click();const originalPacName=await app.locator('#pac-name').inputValue(),originalPac=await app.locator('#pac-text').inputValue();
 assert.equal(originalPacName,'PAC 示例');assert.match(originalPac,/FindProxyForURL/);
 await app.locator('#pac-name').fill('replace PAC draft');await pacEdit.click();await app.locator('#proxy-confirm-cancel').click();
 assert.equal(await app.locator('#pac-name').inputValue(),'replace PAC draft');
 await pacEdit.click();await app.locator('#proxy-confirm-accept').click();assert.equal(await app.locator('#pac-name').inputValue(),originalPacName);
 await pacDelete.click();await app.locator('#proxy-confirm-cancel').click();assert.equal(await app.locator('.pacRecord').count(),1);
 await pacDelete.click();await app.locator('#proxy-confirm-accept').click();await app.locator('.pacRecord').waitFor({state:'hidden'});
 await app.locator('.pacEditorForm button[type="submit"]').click();await app.locator('.pacRecord').waitFor();
 assert.equal(await app.locator('.pacRecord').count(),1);assert.equal(await app.locator('.proxyApplied').count(),0);
 checks.push('Expanded PAC icons have labels, 34px targets, keyboard focus and same-row layout; edit refills, replacement Keep/discard and delete Cancel/confirm work; save remains unapplied');
 await app.locator('#pac-name').fill('keep PAC draft');await app.locator('#settings-close').click();
 await app.locator('#proxy-draft-cancel').click();assert.equal(await app.locator('#pac-name').inputValue(),'keep PAC draft');
 await app.locator('#settings-close').click();await app.locator('#proxy-draft-accept').click();await app.locator('#quick-settings').click();
 await app.locator('.pacDetails > summary').click();await app.locator('.pacEditorForm').scrollIntoViewIfNeeded();await shot('pac');
 await app.locator('.pacDetails > summary').click();await app.locator('.proxy-route').evaluate(el=>el.scrollTop=0);
 checks.push('PAC uses shared 16/12/8 rhythm; closing settings keeps or discards its independent draft');
 const choice=app.getByRole('button',{name:'选择 工作代理',exact:true});
 await choice.click();await assert.doesNotReject(()=>choice.getAttribute('aria-pressed').then(v=>assert.equal(v,'true')));
 assert.equal(await app.locator('.proxyApplied').count(),0);
 checks.push('Selection is exposed with aria-pressed and does not claim applied routing');
 await app.getByRole('button',{name:'＋ 添加代理',exact:true}).click();
 const dialog=app.locator('.proxyEditorDialog');
 report.metrics.form=await app.locator('.proxyEditorForm').evaluate(el=>{
  const s=getComputedStyle(el),fields=el.querySelector('.proxyEditorFields'),actions=el.querySelector('.editorActions');
  return {display:s.display,gap:s.gap,padding:s.padding,dialogPadding:getComputedStyle(el.parentElement).padding,
   fieldsGap:getComputedStyle(fields).gap,actionsMargin:getComputedStyle(actions).margin,actionsBefore:actions.getBoundingClientRect().top-fields.getBoundingClientRect().bottom,
   fieldGaps:[...el.querySelectorAll('.proxyPrimaryFields > div,.proxyNameField')].map(e=>getComputedStyle(e).gap),
   childMargins:[...el.children].map(e=>({class:e.className,margin:getComputedStyle(e).margin}))};
 });
 assert.equal(report.metrics.form.display,'grid');assert.equal(report.metrics.form.gap,'16px');assert.equal(report.metrics.form.fieldsGap,'12px');
 assert.equal(report.metrics.form.actionsMargin,'0px');assert.equal(report.metrics.form.actionsBefore,16);
 assert.equal(report.metrics.form.dialogPadding,'0px');assert.equal(report.metrics.form.padding,'16px');
 assert.deepEqual(new Set(report.metrics.form.fieldGaps),new Set(['8px']));
 await shot('add-proxy');
 await dialog.locator('#ep-host').fill('density.example.net');await dialog.locator('#ep-port').fill('65536');
 await dialog.getByRole('button',{name:'保存代理',exact:true}).click();
 assert.equal(await dialog.locator('#ep-port').evaluate(el=>el.validity.valid),false);
 const longTarget='Long target '+'x'.repeat(60);
 await dialog.locator('#ep-scheme').selectOption('https');await dialog.locator('#ep-port').fill('8443');await dialog.locator('#ep-name').fill(longTarget);
 await dialog.locator('#ep-port').press('Enter');await dialog.waitFor({state:'hidden'});
 assert.match(await app.locator('.profileRecords').innerText(),/density.example.net:8443/);
 assert.equal(await app.locator('.proxyApplied').count(),0);
 checks.push('Single form gutter; 12px group/8px label rhythm; invalid port rejected; Enter saves without applying');
 await app.getByRole('button',{name:'编辑 工作代理',exact:true}).click();
 await dialog.locator('#ep-host').fill('unsaved.example.net');await dialog.locator('#ep-host').press('Escape');
 await app.locator('#proxy-confirm-cancel').click();assert.equal(await dialog.locator('#ep-host').inputValue(),'unsaved.example.net');
 await dialog.locator('#ep-host').press('Escape');await app.locator('#proxy-confirm-accept').click();await dialog.waitFor({state:'hidden'});
 assert.equal(await app.getByRole('button',{name:'编辑 工作代理',exact:true}).evaluate(el=>el===document.activeElement),true);
 assert.doesNotMatch(await app.locator('.profileRecords').innerText(),/unsaved.example.net/);
 checks.push('Proxy dirty Escape preserves on Keep, discards on confirmation and returns focus to edit icon');
 for(const method of ['cancel','close','escape']){
  const trigger=app.getByRole('button',{name:'＋ 添加代理',exact:true});await trigger.click();
  await dialog.locator('#ep-host').fill('cancel-path.example.net');await dialog.locator('#ep-port').fill('8443');
  const dismiss=()=>method==='cancel'?dialog.getByRole('button',{name:'取消',exact:true}).click():
   method==='close'?dialog.locator('.editorHead button').click():dialog.locator('#ep-host').press('Escape');
  await dismiss();await app.locator('#proxy-confirm-cancel').waitFor();
  await app.locator('#proxy-confirm-cancel').click();assert.equal(await dialog.locator('#ep-host').inputValue(),'cancel-path.example.net');
  await dismiss();await app.locator('#proxy-confirm-accept').click();await dialog.waitFor({state:'hidden'});
  assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
 }
 checks.push('Proxy footer Cancel, X and Escape share dirty Keep/discard confirmation and return focus');
 await section('rules');await shot('rules');
 const ruleEdit=app.locator('#settings-rule-rule-docs');
 assert.match(await ruleEdit.getAttribute('aria-label'),/example.com/);assert.ok(await ruleEdit.getAttribute('title'));
 report.metrics.rules=await app.locator('.ruleRecord').evaluateAll(es=>es.map(e=>({height:e.getBoundingClientRect().height,gap:getComputedStyle(e).gap,state:e.querySelector('[role="img"]').getAttribute('aria-label')})));
 await ruleEdit.focus();await ruleEdit.press('Enter');await app.locator('#rule-domain').fill('dirty.example.net');
 report.metrics.ruleForm=await app.locator('.rulesEditorFields').evaluate(el=>{
  const fields=el.querySelector('.ruleInputFields'),actions=el.querySelector('.actions');return {gap:getComputedStyle(el).gap,fieldsGap:getComputedStyle(fields).gap,actionsMargin:getComputedStyle(actions).margin,actionsBefore:actions.getBoundingClientRect().top-fields.getBoundingClientRect().bottom,
   originBefore:el.querySelector('label').getBoundingClientRect().top-el.closest('.rulesEditor').querySelector('.siteRuleOrigin').getBoundingClientRect().bottom};
 });
 assert.deepEqual(report.metrics.ruleForm,{gap:'16px',fieldsGap:'12px',actionsMargin:'0px',actionsBefore:16,originBefore:12});
 await app.locator('#settings-close').click();await app.locator('#proxy-draft-cancel').click();
 assert.equal(await app.locator('#rule-domain').inputValue(),'dirty.example.net');
 await shot('rule-editor');
 await app.locator('#settings-close').click();await app.locator('#proxy-draft-accept').click();
 await app.locator('#quick-settings').waitFor();
 assert.equal(await app.locator('#quick-settings').evaluate(el=>el===document.activeElement),true);
 checks.push('Icon rules preserve domain/scope labels; keyboard opens editor; closing settings keeps/discards draft; panel restores gear focus');
 await app.locator('#quick-manage-rules').click();await app.locator('#settings-rule-add').click();
 await app.locator('#rule-domain').fill('new-rule.example.net');
 await app.locator('#rule-endpoint').selectOption({label:longTarget+' · HTTPS'});
 await app.getByRole('button',{name:'保存规则',exact:true}).click();await app.locator('.rulesList').waitFor();
 const added=app.locator('.ruleRecord').filter({hasText:'new-rule.example.net'});
 assert.equal(await added.count(),1);
 const detail=added.locator('.ruleRecordText small');assert.equal(await detail.getAttribute('title'),await detail.innerText());
 await app.locator('#settings-section').focus();await page.mouse.move(0,0);
 assert.equal(await detail.evaluate(el=>el.scrollWidth>el.clientWidth),true);assert.equal(await added.locator('.proxyIconButton').count(),2);
 assert.equal(await added.locator('.actions').evaluate(el=>getComputedStyle(el).gap),'8px');await shot('long-rule-target');
 const addedEdit=added.getByRole('button',{name:/编辑/});await addedEdit.focus();
 assert.equal(await detail.evaluate(el=>getComputedStyle(el).whiteSpace),'normal');
 assert.equal(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth),true);await shot('long-rule-keyboard');
 await addedEdit.press('Escape');assert.equal(await detail.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
 assert.equal(await addedEdit.evaluate(el=>el===document.activeElement),true);
 await added.getByRole('button',{name:/删除/}).click();await app.locator('#proxy-confirm-cancel').click();assert.equal(await added.count(),1);
 await added.getByRole('button',{name:/删除/}).click();await app.locator('#proxy-confirm-accept').click();await added.waitFor({state:'hidden'});
 assert.equal(await app.locator('.rulesList .r86Notice').count(),0);
 assert.equal(await app.locator('#settings-rule-rule-local').evaluate(el=>el===document.activeElement),true);
 checks.push('Long rule target retains full title and actions; rule save, delete Cancel/confirm, stale receipt clearing and surviving neighbor focus work');
 for(const locale of ['en','zh-TW','zh-CN']){
  await section('general');await app.locator('#ui-locale').selectOption(locale);await section('profiles');
  await app.locator('.optionsContent--profiles').waitFor();
  await app.locator('.proxy-route').evaluate(el=>el.scrollTop=0);await shot('profiles-'+locale);
  assert.equal(await app.locator('.proxyRecord .proxyIconButton').count(),12);
  if(locale!=='zh-CN'){
   await app.locator('.profilePanelHead .primary').click();await dialog.waitFor();await shot('add-'+locale);
   await dialog.locator('.editorHead button').click();await dialog.waitFor({state:'hidden'});
  }
 }
 checks.push('Chinese, English and Traditional Chinese retain list/actions and add form');
 await app.locator('#settings-close').click();await shot('panel');
 // A fresh memory instance isolates the save-another flow from the list fixtures above.
 await page.goto(url);await app.locator('#quick-settings').click();
 await app.locator('.profilePanelHead .primary').click();await dialog.locator('#ep-host').fill('another.example.net');
 await dialog.locator('#ep-port').fill('8443');await dialog.getByRole('button',{name:'保存并继续添加',exact:true}).click();
 await dialog.locator('#ep-host').waitFor();
 assert.equal(await dialog.locator('#ep-host').inputValue(),'');assert.equal(await dialog.locator('#ep-port').inputValue(),'');
 assert.equal(await dialog.locator('#ep-name').inputValue(),'');
 assert.equal(await dialog.locator('#ep-host').evaluate(el=>el===document.activeElement),true);
 await dialog.locator('#ep-host').press('Tab');
 assert.equal(await dialog.locator('.proxyQuickPicks').first().getByRole('button',{name:'127.0.0.1',exact:true}).evaluate(el=>el===document.activeElement),true);
 for(let i=0;i<3;i++)await page.keyboard.press('Tab');
 assert.equal(await dialog.locator('#ep-port').evaluate(el=>el===document.activeElement),true);
 assert.equal(await app.locator('.profileRecords .proxyRecord').count(),4);assert.equal(await app.locator('.proxyApplied').count(),0);
 await dialog.locator('#ep-host').focus();await shot('save-another-focus');
 await dialog.locator('.editorHead button').click();await dialog.waitFor({state:'hidden'});
 checks.push('Save and add another clears the clean draft and focuses Host; Tab follows host presets/protocol to Port, saved record exists without applying');
 // Empty state uses the same Add/import/source actions; all data remains in a new mock instance.
 await page.goto(url);await app.locator('#quick-settings').waitFor();
 await page.locator('.preview-diagnostic-area summary').click();await page.locator('#od-preview-scenario').selectOption('empty');
 await app.getByRole('heading',{name:'订阅与本地客户端',exact:true}).waitFor();
 await app.locator('#quick-settings').click();
 assert.equal(await app.locator('.proxyRecord').count(),0);
 assert.equal(await app.locator('.profilePanelHead .primary').count(),1);
 assert.equal(await app.locator('#settings-import').count(),1);assert.equal(await app.locator('.profileSourceLinks button').count(),2);
 await shot('empty-profiles');await app.locator('#settings-close').click();await shot('empty-panel');
 checks.push('Empty panel names subscriptions/local clients; empty settings keeps one Add action, import and both source shortcuts');
 // Return to the frozen input before reading its manifest.
 await page.goto(url);await app.locator('#quick-settings').waitFor();
 report.manifest=await page.locator('#opendesk-preview-manifest').evaluate(el=>JSON.parse(el.textContent));
 assert.equal(await page.locator('#opendesk-preview-frame').getAttribute('sandbox'),'allow-scripts');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 report.result='PASS';
}catch(e){report.result='FAIL';report.failure=e.stack;await shot('failure').catch(()=>{});throw e;}
finally{await writeFile(join(out,'interactions.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({result:report.result,checks,report:join(out,'interactions.json')}));
