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
 report.metrics.profiles=await profileMetrics();
 const {content,header,list,rows}=report.metrics.profiles;
 assert.equal(content.gap,'16px');assert.equal(header.margin,'0px');assert.equal(list.margin,'0px');
 assert.equal(new Set(rows.map(r=>r.height-parseFloat(r.borderTop))).size,1);
 for(const row of rows){assert.equal(row.gap,'8px');assert.equal(row.padding,'12px 0px');}
 assert.equal(await app.locator('.recordActions').first().evaluate(el=>getComputedStyle(el).gap),'8px');
 assert.equal(await app.locator('.proxyRecordTitle [role="img"]').count(),1);
 await shot('profiles');checks.push('No business Tabs; seven settings sections; zero stacked margins; uniform two-line rows; inline local-client status');
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
  const fields=el.querySelector('.ruleInputFields'),actions=el.querySelector('.actions');return {gap:getComputedStyle(el).gap,fieldsGap:getComputedStyle(fields).gap,actionsMargin:getComputedStyle(actions).margin,actionsBefore:actions.getBoundingClientRect().top-fields.getBoundingClientRect().bottom};
 });
 assert.deepEqual(report.metrics.ruleForm,{gap:'16px',fieldsGap:'12px',actionsMargin:'0px',actionsBefore:16});
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
 assert.equal(await detail.evaluate(el=>el.scrollWidth>el.clientWidth),true);assert.equal(await added.locator('.proxyIconButton').count(),2);
 assert.equal(await added.locator('.actions').evaluate(el=>getComputedStyle(el).gap),'8px');await shot('long-rule-target');
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
 report.manifest=await page.locator('#opendesk-preview-manifest').evaluate(el=>JSON.parse(el.textContent));
 assert.equal(await page.locator('#opendesk-preview-frame').getAttribute('sandbox'),'allow-scripts');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 report.result='PASS';
}catch(e){report.result='FAIL';report.failure=e.stack;throw e;}
finally{await writeFile(join(out,'interactions.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({result:report.result,checks,report:join(out,'interactions.json')}));
