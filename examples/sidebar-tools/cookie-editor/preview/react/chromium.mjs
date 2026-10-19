// Exercise the actual shared App in the built, offline React 19 candidate.
import {chromium} from 'playwright';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=dirname(fileURLToPath(import.meta.url));
const output=resolve(here,'../../../../../artifacts/cookie-editor-r520');
await mkdir(output,{recursive:true});
const html=await readFile(join(here,'index.html'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined});
const context=await browser.newContext({viewport:{width:380,height:880},acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(7000);
const errors=[],network=[],pass=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',req=>{if(/^https?:/.test(req.url()))network.push(req.url());});
const button=name=>page.getByRole('button',{name,exact:true});
const test=async(name,run)=>{await run();pass.push(name);console.log('PASS',name);};
const ready=async()=>{await page.locator('.cookie-row').first().waitFor();assert.equal(await page.locator('.cookie-row').count(),8);};
const lab=page.locator('.demo-lab');
const openLab=async()=>{if(await lab.getAttribute('open')===null)await lab.locator('summary').click();};
const scene=async value=>{await openLab();await page.getByTestId('scenario').selectOption(value);};
const reset=async()=>{await openLab();await button('重置').click();await ready();};
const row=name=>page.locator('.row-trigger').filter({has:page.locator('strong',{hasText:new RegExp('^'+name+'$')})});
const nameInput=()=>page.getByRole('textbox',{name:'名称',exact:true});
const valueInput=()=>page.getByRole('textbox',{name:'Cookie 值',exact:true});
const editor=()=>page.locator('.cookie-inline-editor');
try{
 await page.goto(pathToFileURL(join(here,'index.html')).href,{waitUntil:'load'});await ready();
 await test('fixed React 19 + Shared UI, one actual App and 380px frame',async()=>{
  assert.equal(await page.title(),'Cookie Editor R5.20 · 380px 交互预览');
  assert.deepEqual(await page.evaluate(()=>({react:OpenDeskPageReact.version,button:typeof OpenDeskSidebarUI.Button,chrome:typeof chrome?.cookies})),{react:'19.2.0',button:'function',chrome:'undefined'});
  assert.equal(await page.locator('.cookie-editor-react').count(),1);
  assert.equal(await page.locator('.site-hostname').count(),1);
  assert.equal(await page.getByText('更多 · 变化观察',{exact:true}).count(),0);
  assert.equal(await lab.getAttribute('open'),null);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(Math.round((await page.locator('.cookie-app').boundingBox()).width),380);
  for(const trigger of await page.locator('.row-trigger').all()){
   assert.ok((await trigger.locator('.row-text').boundingBox()).width>=120,'Cookie names must have readable space');
   assert.ok((await trigger.locator(':scope > svg').boundingBox()).height<=20,'row chevron must not consume the row');
  }
  assert.ok((await page.locator('.searchbox > svg').boundingBox()).width<=20,'search icon must stay compact');
  await page.screenshot({path:join(output,'380-light.png'),fullPage:true});
 });
 await test('toolbar uses approved icons and a real scoped clear modal with inert cancel',async()=>{
  for(const name of ['导入 Cookie','导出 Cookie','新建 Cookie','安全清理本站 Cookie'])assert.equal(await button(name).count(),1);
  await button('安全清理本站 Cookie').click();
  const dialog=page.getByRole('dialog',{name:'清理本站 Cookie'});await dialog.waitFor();
  assert.equal(await dialog.evaluate(el=>el.matches(':modal')),true);
  assert.match(await dialog.innerText(),/6 条/);assert.match(await dialog.innerText(),/Host-only/);
  assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()),'取消');
  await page.keyboard.press('Escape');await ready();
  assert.equal(await page.locator('dialog:modal').count(),0);
  await button('安全清理本站 Cookie').click();await dialog.getByRole('button',{name:'取消',exact:true}).click();await ready();
 });
 await test('inline edit: original value, clean cancel, dirty guard and restoration',async()=>{
  await row('session_id').click();await valueInput().waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-cookie-secret-input]')?.value==='sess_demo_only_C18');
  assert.equal(await editor().locator('.editor-top > strong').innerText(),'编辑');
  assert.equal(await valueInput().getAttribute('placeholder'),'留空保留原值');
  assert.equal(await button('保存').isDisabled(),true);
  await button('取消').click();assert.equal(await editor().count(),0);
  await row('session_id').click();await nameInput().fill('edited_session');
  await button('取消').click();await page.getByText('放弃当前未保存修改？',{exact:true}).waitFor();
  await button('继续编辑').click();assert.equal(await nameInput().inputValue(),'edited_session');
  await nameInput().fill('session_id');assert.equal(await button('保存').isDisabled(),true);
  await valueInput().fill('fictional replacement');await button('恢复原值').click();
  assert.equal(await valueInput().inputValue(),'sess_demo_only_C18');assert.equal(await button('保存').isDisabled(),true);
  await button('取消').click();
 });
 await test('save rename uses actual Controller and preserves the old value',async()=>{
  await row('session_id').click();await nameInput().fill('renamed_sid');
  assert.equal((await editor().locator('.editor-hint').innerText()).trim(),'更名先创建新项，再删除旧项。');
  await button('保存').click();
  await row('renamed_sid').waitFor();assert.equal(await row('session_id').count(),0);
  await row('renamed_sid').click();
  await page.waitForFunction(()=>document.querySelector('[data-cookie-secret-input]')?.value==='sess_demo_only_C18');
  await button('取消').click();await reset();
 });
 await test('search, filter and advanced attributes remain in shared App',async()=>{
  const search=page.getByRole('searchbox',{name:'搜索 Cookie'});await search.fill('theme');
  assert.equal(await page.locator('.cookie-row').count(),1);await search.fill('');
  await button('筛选与排序').click();await button('分区').click();
  assert.equal(await page.locator('.cookie-row').count(),1);assert.equal(await row('embedded_pref').count(),1);
  await button('全部').click();await button('筛选与排序').click();
  await row('embedded_pref').click();
  const attributes=editor().locator('details.advanced');
  assert.equal(await attributes.locator(':scope > summary').innerText(),'属性');
  await attributes.locator(':scope > summary').click();
  assert.equal(await editor().getByRole('textbox',{name:'Domain',exact:true}).getAttribute('readonly'),'');
  assert.equal(await editor().getByRole('textbox',{name:'Path',exact:true}).getAttribute('readonly'),'');
  assert.equal(await editor().getByRole('checkbox',{name:'Host-only',exact:true}).isDisabled(),true);
  const storage=editor().locator('details.editor-identity');
  assert.equal(await storage.getAttribute('open'),null);
  assert.equal(await storage.locator(':scope > summary').innerText(),'存储信息');
  await storage.locator(':scope > summary').click();
  assert.match(await storage.innerText(),/Store ID/);assert.match(await storage.innerText(),/PartitionKey/);
  assert.match(await storage.innerText(),/partner\.example\.net/);
  assert.equal(await page.locator('input[type=password]').count(),0);
  await button('取消').click();
 });
 await test('dirty switching protects draft, then explicit discard opens new editor',async()=>{
  await row('session_id').click();await nameInput().fill('held_draft');
  await page.getByRole('searchbox',{name:'搜索 Cookie'}).fill('theme');
  assert.equal(await nameInput().inputValue(),'held_draft');assert.equal(await row('session_id').count(),1);
  await page.getByRole('searchbox',{name:'搜索 Cookie'}).fill('');await button('新建 Cookie').click();
  await page.getByText('放弃未保存修改？',{exact:true}).waitFor();
  assert.equal(await nameInput().inputValue(),'held_draft');await button('继续编辑').click();
  await button('新建 Cookie').click();await button('放弃').click();
  assert.equal(await nameInput().inputValue(),'');await nameInput().fill('new_cookie');await valueInput().fill('new fictional value');
  await button('保存').click();await row('new_cookie').waitFor();
  await row('new_cookie').click();await button('删除 Cookie').click();await ready();
 });
 await test('save failure retains draft and unknown writes require manual checking',async()=>{
  await scene('saveError');await ready();await row('session_id').click();await nameInput().fill('keep_on_failure');
  await button('保存').click();await page.getByText(/E_COOKIE_SET/).waitFor();
  assert.equal(await nameInput().inputValue(),'keep_on_failure');await reset();
  await page.getByTestId('failure').selectOption('unknown');await row('session_id').click();await nameInput().fill('unknown_sid');await button('保存').click();
  await page.getByText(/E_OUTCOME_UNKNOWN/).waitFor();assert.equal(await nameInput().inputValue(),'unknown_sid');
  assert.equal(await row('unknown_sid').count(),0);await reset();
 });
 await test('import is a native modal with no inline preview, one click commit and toast',async()=>{
  await button('导入 Cookie').click();
  const dialog=page.getByRole('dialog',{name:'导入 Cookie'});await dialog.waitFor();
  assert.equal(await dialog.evaluate(el=>el.matches(':modal')),true);
  assert.equal(await page.locator('.cookie-import-panel').count(),0);
  assert.equal(await page.getByRole('status',{name:'导入预检结果'}).count(),0);
  const input=dialog.getByRole('textbox',{name:'粘贴 Cookie 内容'});
  await input.fill(JSON.stringify([{name:'import_a',value:'fictional A'},
    {name:'import_b',value:'fictional B'},{name:'bad name',value:'invalid'},
    {name:'theme',value:'overwrite existing'}]));
  assert.equal(await page.locator('.cookie-row').count(),8);
  assert.equal(await page.getByRole('status',{name:'导入预检结果'}).count(),0);
  await dialog.getByRole('button',{name:'导入',exact:true}).click();
  await row('import_a').waitFor();await dialog.waitFor({state:'hidden'});
  assert.equal(await page.locator('.cookie-row').count(),10);
  assert.match(await page.locator('.cookie-import-toast').innerText(),/已导入 3 条，跳过 1 条/);
  await reset();
 });
 await test('foreign-domain failures are concise and file selection imports immediately',async()=>{
  await button('导入 Cookie').click();
  const dialog=page.getByRole('dialog',{name:'导入 Cookie'});await dialog.waitFor();
  await dialog.getByRole('textbox',{name:'粘贴 Cookie 内容'}).fill(
    JSON.stringify([{name:'foreign',value:'fictional',domain:'elsewhere.invalid'}]));
  await dialog.getByRole('button',{name:'导入',exact:true}).click();
  const alert=dialog.getByRole('alert');await alert.waitFor();
  assert.match(await alert.innerText(),/未导入 1 条/);
  assert.equal(await page.locator('.cookie-row').count(),8);
  assert.equal(await dialog.evaluate(el=>el.matches(':modal')),true);
  assert.equal(await page.getByRole('status',{name:'导入预检结果'}).count(),0);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await button('导入 Cookie').click();await dialog.waitFor();
  const file=JSON.stringify([{name:'import_file',value:'fictional'}]);
  await dialog.locator('input[type=file]').setInputFiles({
    name:'cookies.json',mimeType:'application/json',buffer:Buffer.from(file)});
  await row('import_file').waitFor();await dialog.waitFor({state:'hidden'});
  assert.equal(await page.locator('.cookie-row').count(),9);await reset();
 });
 await test('JSON copy/download use actual export UI; partition loss and denied values are blocked',async()=>{
  await button('导出 Cookie').click();
  assert.equal(await page.getByRole('checkbox',{name:/包含/}).isChecked(),true);
  await button('复制').click();await page.waitForFunction(()=>[...document.querySelectorAll('.cookie-export-panel button')].some(button=>button.textContent.trim()==='复制'&&!button.disabled));assert.equal(await page.getByRole('alert').count(),0);
  const downloadEvent=page.waitForEvent('download');await button('下载').click();
  const download=await downloadEvent;await download.saveAs(join(output,'fictional-cookies.json'));
  assert.equal(JSON.parse(await readFile(join(output,'fictional-cookies.json'),'utf8')).length,8);
  await page.locator('.cookie-export-panel select').selectOption('header');
  assert.equal(await button('复制').isDisabled(),true);await page.getByText(/已禁止导出/).waitFor();
  await button('关闭导出').click();await scene('valuesDenied');await ready();
  await button('导出 Cookie').click();await button('复制').click();await page.getByText(/E_COOKIE_VALUES/).waitFor();await reset();
 });
 await test('one-shot export failure reports error; retry succeeds without remount',async()=>{
  await page.getByTestId('failure').selectOption('copy');await button('导出 Cookie').click();await button('复制').click();
  await page.getByText(/E_CLIPBOARD/).waitFor();await button('复制').click();await page.waitForFunction(()=>[...document.querySelectorAll('.cookie-export-panel button')].some(button=>button.textContent.trim()==='复制'&&!button.disabled));assert.equal(await page.getByRole('alert').count(),0);await button('关闭导出').click();
 });
 await test('grant event synchronously scrubs the secret DOM and discards the invalidated editor',async()=>{
  await row('session_id').click();
  await page.waitForFunction(()=>document.querySelector('[data-cookie-secret-input]')?.value==='sess_demo_only_C18');
  const scrubbed=await page.locator('.cookie-app').evaluate(root=>{
   const input=root.querySelector('[data-cookie-secret-input]');
   root.dispatchEvent(new Event('opendesk-cookie-grants-changed'));return input.value;
  });
  assert.equal(scrubbed,'');await editor().waitFor({state:'detached'});await ready();
 });
 await test('confirmed clear preserves parent domain and partition rows',async()=>{
  await button('安全清理本站 Cookie').click();
  await page.getByRole('dialog').getByRole('button',{name:'清理 6 条',exact:true}).click();
  await row('embedded_pref').waitFor();assert.equal(await page.locator('.cookie-row').count(),2);
  assert.equal(await row('analytics_consent').count(),1);await reset();
 });
 await test('blocked/loading/empty/read-only scenes come from SDK responses',async()=>{
  await scene('first');await page.getByText('本站 Cookie 尚未就绪',{exact:true}).waitFor();
  assert.equal(await page.locator('.cookie-row').count(),0);
  await button('模拟允许访问').click();await ready();
  await scene('loading');await page.getByText('正在读取 Cookie…',{exact:true}).waitFor();await reset();
  await scene('empty');await page.locator('.cookie-react-view').waitFor();assert.equal(await page.locator('.cookie-row').count(),0);
  await scene('readonly');await ready();await row('session_id').click();await nameInput().fill('denied_write');await button('保存').click();await page.getByText(/E_PERMISSION_REQUIRED/).waitFor();await reset();
 });
 await test('shared offline workspace starts empty and live data returns on explicit browser mode',async()=>{
  const utility=page.locator('.cookie-utility-settings');await utility.locator('summary').click();
  await button('离线文件').click();await page.locator('.cookie-offline').waitFor();
  assert.equal(await page.locator('.cookie-row').count(),0);
  await button('返回浏览器').click();await ready();
 });
 await test('380px dark and editing evidence; clear-value icon stays inside input',async()=>{
  await reset();await button('深色').click();
  await lab.locator('summary').click();
  await page.screenshot({path:join(output,'380-dark.png'),fullPage:true});
  await openLab();await button('浅色').click();
  await row('session_id').click();await valueInput().waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-cookie-secret-input]')?.value==='sess_demo_only_C18');
  await valueInput().fill('fictional R5.20 editing');
  await lab.locator('summary').click();
  const clear=page.locator('.value-input').getByRole('button',{name:'清空值'});
  const field=await valueInput().boundingBox(),icon=await clear.boundingBox();
  assert.ok(Math.abs(field.y+field.height/2-icon.y-icon.height/2)<=1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:join(output,'380-editing.png'),fullPage:true});
  await clear.click();assert.equal(await valueInput().inputValue(),'');assert.equal(await button('保存').isEnabled(),true);
 });
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 const receipt={status:'PASS',htmlSha256:sha(html),chromium:browser.version(),viewport:{width:380,height:880},tests:pass,errors,network,screenshots:['380-light.png','380-dark.png','380-editing.png'],gaps:['Real Chrome Cookie SDK/permissions/install not exercised','Prebuilt fixed Shared UI resource reused; no host build','Other widths and browser zoom out of scope']};
 await writeFile(join(output,'chromium-results.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:'PASS',tests:pass.length,htmlSha256:receipt.htmlSha256,output}));
}catch(error){
 await page.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});
 await writeFile(join(output,'chromium-failure.json'),JSON.stringify({passed:pass,errors,network,error:String(error)},null,2));throw error;
}finally{await browser.close();}
