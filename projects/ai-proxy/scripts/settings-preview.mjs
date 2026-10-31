// Real clicks in the existing, sandboxed, memory-only source Preview.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=resolve(process.env.AI_PROXY_PREVIEW_OUTPUT||'artifacts/ai-proxy/settings-refinement/current');
const baseline=process.argv.includes('--baseline');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
const context=await browser.newContext({viewport:{width:1000,height:1120},deviceScaleFactor:1});
const page=await context.newPage(),errors=[],external=[],checks=[];
page.setDefaultTimeout(8000);
page.on('pageerror',error=>errors.push(error.message));
context.on('request',request=>{if(/^https?:/.test(request.url())&&new URL(request.url()).origin!=='http://127.0.0.1:43263')external.push(request.url());});
const app=page.frameLocator('#opendesk-preview-frame');
const sections=[['profiles','代理配置'],['rules','网站规则'],['subscriptions','订阅管理'],['backup','导入与备份'],['diagnostic','网络诊断'],['general','通用设置'],['official','官方网络']];
const report={scope:'source-bound memory Preview only',baseline,browser:browser.version(),checks,screenshots:{},errors,external,at:new Date().toISOString()};
async function choose(id,name){
 if(baseline)await app.getByRole('navigation',{name:'设置栏目',exact:true}).getByRole('button',{name,exact:true}).click();
 else await app.getByRole('combobox',{name:'设置栏目',exact:true}).selectOption(id);
 await app.getByRole('heading',{name,exact:true}).first().waitFor();
}
async function shot(name){
 const frame=page.frames().find(frame=>frame.parentFrame());
 await frame.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 const file=join(out,name+'.png');
 await page.locator('#opendesk-preview-frame').screenshot({path:file});
 report.screenshots[name]={file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')};
}
try{
 await page.goto('http://127.0.0.1:43263/ai-proxy-preview?view=settings');
 await app.getByRole('heading',{name:'代理配置',exact:true}).waitFor();
 for(const [id,name] of sections){
  await choose(id,name);
  await app.locator('.proxy-route').evaluate(element=>element.scrollTop=0);
  await shot(id);
  const geometry=await app.locator('.optionsContent').evaluate(element=>({width:element.clientWidth,scrollWidth:element.scrollWidth}));
  assert.ok(geometry.scrollWidth<=geometry.width+1,id+' content has no horizontal overflow');
  const last=app.locator('.optionsContent').locator('button,input,select,textarea,summary').filter({visible:true}).last();
  await last.scrollIntoViewIfNeeded();assert.equal(await last.isVisible(),true);
  checks.push(id+': content and last action reachable');
 }
 if(!baseline){
  await choose('profiles','代理配置');
  const select=app.getByRole('combobox',{name:'设置栏目',exact:true});
  assert.equal(await select.locator('option').count(),7);
  await select.focus();await select.press('Tab');await app.getByRole('button',{name:'复制本页链接',exact:true}).press('Shift+Tab');
  assert.equal(await select.evaluate(el=>el===document.activeElement),true);
  assert.notEqual(await select.evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  checks.push('section selector is keyboard reachable with visible focus; OS menu arrows verified separately in IAB');
  await choose('profiles','代理配置');
  await app.getByRole('button',{name:'编辑 工作代理',exact:true}).click();
  const dialog=app.getByRole('dialog');
  await dialog.locator('#ep-host').focus();
  const tabStops=[];
  for(let i=0;i<10;i++){
   await page.keyboard.press('Tab');
   const id=await dialog.evaluate(el=>el.ownerDocument.activeElement.id);tabStops.push(id);
   if(id==='ep-scheme'||id==='ep-port')break;
  }
  assert.equal(tabStops.at(-1),'ep-scheme','forward Tab reaches protocol before port');
  report.proxyEditorTabStops=tabStops;
  checks.push('proxy editor Tab follows visible host, protocol, port order');
  await dialog.locator('.proxyAuthDetails summary').click();
  await shot('authentication-limit');
  await dialog.locator('.proxyAuthDetails summary').click();
  await dialog.getByRole('textbox',{name:'主机',exact:true}).fill('cancel.example.com');
  await dialog.getByRole('button',{name:'关闭代理编辑',exact:true}).click();
  await app.locator('#proxy-confirm-cancel').waitFor();
  await shot('proxy-discard');
  await app.locator('#proxy-confirm-cancel').click();
  assert.equal(await dialog.locator('#ep-host').inputValue(),'cancel.example.com');
  await dialog.locator('#ep-host').press('Escape');
  await app.locator('#proxy-confirm-cancel').click();
  assert.equal(await dialog.locator('#ep-host').inputValue(),'cancel.example.com');
  await dialog.locator('#ep-host').press('Escape');
  await app.locator('#proxy-confirm-accept').click();
  await dialog.waitFor({state:'hidden'});
  assert.doesNotMatch(await app.locator('.profileRecords').innerText(),/cancel.example.com/);
  assert.equal(await app.getByRole('button',{name:'编辑 工作代理',exact:true}).evaluate(el=>el===document.activeElement),true);
  checks.push('dirty proxy Close/Escape confirm discard; Keep preserves fields; accept closes without writing and restores focus');
  await app.getByRole('button',{name:'编辑 工作代理',exact:true}).click();
  await dialog.getByRole('textbox',{name:'主机',exact:true}).fill('cancel.example.com');
  await dialog.getByRole('button',{name:'取消',exact:true}).click();
  assert.equal(await app.getByRole('button',{name:'编辑 工作代理',exact:true}).evaluate(el=>el===document.activeElement),true);
  assert.doesNotMatch(await app.locator('.profileRecords').innerText(),/cancel.example.com/);
  checks.push('edit Cancel keeps saved data and restores trigger focus');
  await app.getByRole('button',{name:'＋ 添加代理',exact:true}).click();
  await dialog.getByRole('textbox',{name:'主机',exact:true}).fill('settings.example.com');
  await dialog.getByRole('spinbutton',{name:'端口',exact:true}).fill('65536');
  await dialog.getByRole('button',{name:'保存代理',exact:true}).click();
  assert.equal(await dialog.getByRole('spinbutton',{name:'端口',exact:true}).evaluate(el=>el.validity.valid),false);
  await dialog.getByRole('spinbutton',{name:'端口',exact:true}).press('Tab');
  await shot('invalid-proxy');
  await dialog.getByRole('spinbutton',{name:'端口',exact:true}).fill('8443');
  await dialog.getByRole('spinbutton',{name:'端口',exact:true}).press('Enter');
  await dialog.waitFor({state:'hidden'});
  assert.match(await app.locator('.profileRecords').innerText(),/settings.example.com:8443/);
  assert.match(await app.locator('body').innerText(),/尚未管理浏览器代理|未管理/);
  checks.push('invalid port rejected; Enter saves without applying proxy');
  await app.getByRole('button',{name:'删除 工作代理',exact:true}).click();
  await app.locator('#proxy-confirm-cancel').waitFor();
  assert.equal(await page.locator('#od-preview-scenario').isEnabled(),false);
  await app.locator('#proxy-confirm-cancel').press('Escape');
  await app.locator('#proxy-confirm-cancel').waitFor({state:'hidden'});
  assert.equal(await app.getByRole('button',{name:'删除 工作代理',exact:true}).evaluate(el=>el===document.activeElement),true);
  checks.push('delete Escape retains data, locks replacement and restores focus');
  await app.getByText('其他添加方式',{exact:true}).click();
  for(const name of ['导入配置','添加本地客户端','本地 PAC'])assert.equal(await app.getByRole('button',{name,exact:true}).isVisible(),true);
  await app.getByText('其他添加方式',{exact:true}).click();
  checks.push('all secondary creation actions remain discoverable');
  await app.locator('.pacDetails > summary').click();
  await app.locator('#pac-name').fill('Unsaved PAC');
  await app.locator('#pac-text').fill('function FindProxyForURL(){return "PROXY draft.example.com:8080";}');
  const pacEdit=app.locator('.pacDetails .records').getByRole('button',{name:'编辑',exact:true}).first();
  await pacEdit.click();
  await app.locator('#proxy-confirm-cancel').click();
  assert.equal(await app.locator('#pac-name').inputValue(),'Unsaved PAC');
  assert.match(await app.locator('#pac-text').inputValue(),/draft.example.com/);
  await pacEdit.click();
  await app.locator('#proxy-confirm-accept').click();
  assert.equal(await app.locator('#pac-name').inputValue(),'PAC 示例');
  assert.equal(await app.locator('#pac-text').inputValue(),'function FindProxyForURL(url,host) { return "DIRECT"; }');
  assert.equal(await app.locator('#pac-name').evaluate(el=>el===document.activeElement),true);
  await app.locator('.pacDetails').getByRole('button',{name:'取消编辑',exact:true}).click();
  checks.push('PAC edit confirms replacement: Cancel preserves name/script; accept loads target and focuses editor');
  await choose('rules','网站规则');
  await app.locator('.rulesList').getByRole('button',{name:'编辑',exact:true}).first().click();
  assert.equal(await app.locator('#rule-domain').evaluate(el=>el===document.activeElement),true);
  await app.locator('#rule-domain').fill('unsaved-rule.example.com');
  await app.locator('.rulesList').getByRole('button',{name:'编辑',exact:true}).nth(1).click();
  await app.locator('#proxy-confirm-cancel').waitFor();
  await shot('rule-discard');
  await app.locator('#proxy-confirm-cancel').click();
  assert.equal(await app.locator('#rule-domain').inputValue(),'unsaved-rule.example.com');
  await app.locator('.rulesList').getByRole('button',{name:'编辑',exact:true}).nth(1).click();
  await app.locator('#proxy-confirm-accept').click();
  assert.equal(await app.locator('#rule-domain').inputValue(),'example.org');
  assert.equal(await app.locator('#rule-domain').evaluate(el=>el===document.activeElement),true);
  checks.push('switching rule A to B confirms discard; Cancel preserves A; accept loads B and focuses editor');
  await app.getByRole('button',{name:'取消编辑',exact:true}).click();
  checks.push('rule Edit reveals and focuses the actual editor');
  await app.getByRole('textbox',{name:'网站域名或网址',exact:true}).fill('draft.example.com');
  await select.selectOption('backup');
  await app.locator('#proxy-draft-cancel').click();
  assert.equal(await select.inputValue(),'rules');
  assert.equal(await app.getByRole('textbox',{name:'网站域名或网址',exact:true}).inputValue(),'draft.example.com');
  await select.selectOption('backup');
  await app.locator('#proxy-draft-accept').click();
  await app.getByRole('heading',{name:'导入与备份',exact:true}).waitFor();
  checks.push('section selector guards drafts: Keep preserves route/input; discard navigates');
  await app.locator('#import-data').fill('existing backup draft');
  await app.locator('#backup-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{bad')});
  await app.getByRole('alert').first().waitFor();
  assert.equal(await app.locator('#import-data').inputValue(),'existing backup draft');
  const backupText=JSON.stringify({schemaVersion:2,sources:[],endpoints:[],profiles:[],rules:[],defaultTarget:{action:'direct'},selection:{mode:'system'},managed:false});
  const backupFile={name:'valid.json',mimeType:'application/json',buffer:Buffer.from(backupText)};
  await app.locator('#backup-file').setInputFiles(backupFile);
  await app.locator('#proxy-confirm-cancel').click();
  assert.equal(await app.locator('#import-data').inputValue(),'existing backup draft');
  await app.locator('#backup-file').setInputFiles(backupFile);
  await app.locator('#proxy-confirm-accept').click();
  assert.equal(await app.locator('#import-data').inputValue(),backupText);
  assert.equal(await page.locator('#od-preview-scenario').isEnabled(),false);
  checks.push('invalid file retains backup draft; valid replacement confirms Keep/discard without importing');
  await select.selectOption('general');
  await app.locator('#proxy-draft-accept').click();
  await choose('general','通用设置');
  for(const [locale,heading]of [['en','General settings'],['zh-TW','通用設定'],['zh-CN','通用设置']]){
   await app.locator('#ui-locale').selectOption(locale);
   // The preference persists only in the Preview memory boundary.
   await app.getByRole('heading',{name:heading,exact:true}).waitFor();
   await shot('general-'+locale);
   if(locale==='en'){
    await app.locator('#settings-section').selectOption('profiles');
    await app.getByRole('heading',{name:'Proxy profiles',exact:true}).waitFor();
    await app.locator('.proxy-route').evaluate(el=>el.scrollTop=0);await shot('profiles-en');
    await app.locator('#settings-section').selectOption('general');
   }
  }
  checks.push('three languages render and retain accessible section selector');
  await choose('profiles','代理配置');
  await app.getByRole('button',{name:'← 返回',exact:true}).click();
  await app.getByRole('heading',{name:'连接方式',exact:true}).waitFor();
  await shot('quick-unchanged');
  checks.push('return to original QuickPanel');
  for(const scenario of ['empty','error','permission-denied','conflict','revoked']){
   await page.goto('http://127.0.0.1:43263/ai-proxy-preview?view=settings&scenario='+scenario);
   await app.getByRole('heading',{name:'代理配置',exact:true}).waitFor();
   await shot('state-'+scenario);
   if(scenario==='empty'){
    await app.getByRole('button',{name:'添加自己的代理',exact:true}).click();
    await app.getByRole('dialog').waitFor();
    await app.getByRole('button',{name:'关闭代理编辑',exact:true}).click();
   }
   if(scenario==='permission-denied'){
    await app.getByRole('button',{name:'应用选择',exact:true}).click();
    await app.getByRole('alert').first().waitFor();
    assert.match(await app.getByRole('alert').first().innerText(),/拒绝|权限/);
    await app.locator('.proxy-route').evaluate(el=>el.scrollTop=0);
    await shot('permission-denied-after-apply');
    await choose('rules','网站规则');
    await app.locator('#rule-domain').fill('denied-draft.example.com');
    await app.getByRole('button',{name:'刷新状态',exact:true}).click();
    assert.equal(await app.locator('#rule-domain').inputValue(),'denied-draft.example.com');
    assert.equal(await page.locator('#od-preview-scenario').isEnabled(),false);
    checks.push('denied Apply shows feedback; refresh preserves rule draft and host replacement lock');
   }
   assert.equal(await app.locator('#settings-section option').count(),7);
  }
  checks.push('empty/error/denied/conflict/revoked keep all sections; empty Add opens editor');
 }
 assert.equal(await page.locator('#opendesk-preview-frame').getAttribute('sandbox'),'allow-scripts');
 report.manifest=await page.locator('#opendesk-preview-manifest').evaluate(el=>JSON.parse(el.textContent));
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 report.result='PASS';
}catch(error){report.result='FAIL';report.failure=error.stack;throw error;}
finally{await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({result:report.result,checks,report:join(out,'report.json')}));
