// Exercise the actual shared App in the built, offline React 19 candidate.
import {chromium} from 'playwright';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=dirname(fileURLToPath(import.meta.url));
const output=resolve(process.argv[2]||resolve(here,'../../../../../artifacts/cookie-editor-r523'));
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
// Check both entry frames and settled layout; no fixed timeout masks overflow.
const checkSheetBounds=async(sheet,width,height,stage)=>{
 const measure=()=>sheet.evaluate(el=>{
  const b=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();
  return {x:b.x,y:b.y,width:b.width,height:b.height,
   parent:{x:p.x,y:p.y,width:p.width,height:p.height,
    clientHeight:el.parentElement.clientHeight},
   viewport:{width:innerWidth,height:innerHeight},
   animations:el.getAnimations().map(a=>({state:a.playState,time:a.currentTime}))};
 });
 const check=sample=>assert.ok(
  sample.x>=0&&sample.x+sample.width<=width&&
  sample.y>=0&&sample.y+sample.height<=height,
  stage+' sheet overflows viewport: '+JSON.stringify(sample));
 check(await measure());
 await sheet.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
 const settled=await measure();check(settled);
 return settled;
};
try{
 await page.goto(pathToFileURL(join(here,'index.html')).href,{waitUntil:'load'});
 await test('R2.6 defaults to three fictional accounts and product-owned share/market views',async()=>{
  const accountTab=page.getByRole('tab',{name:'账号',exact:true});
  await accountTab.waitFor();
  assert.equal(await accountTab.getAttribute('aria-selected'),'true');
  await page.locator('.cookie-account-card').first().waitFor();
  assert.equal(await page.locator('.cookie-account-card').count(),3);
  assert.equal(await page.locator('.cookie-account-current').count(),1);
  assert.equal(await page.locator('.site-hostname').count(),1);
  await page.screenshot({path:join(output,'380-r26-accounts-light.png'),fullPage:true});
  await openLab();
  for(const width of [320,360,380,400,440,520]){
   await page.setViewportSize({width,height:880});
   await page.getByTestId('width').selectOption(String(width));
   await page.locator('.cookie-account-card').first().waitFor();
   assert.equal(Math.round((await page.locator('.cookie-app').boundingBox()).width),width);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
    'R2.6 account external overflow at '+width+'px');
   await page.screenshot({path:join(output,width+'-r26-accounts-light.png'),fullPage:true});
  }
  await page.setViewportSize({width:380,height:880});
  await page.getByTestId('width').selectOption('380');
  await button('深色').click();
  await lab.locator('summary').click();
  await page.screenshot({path:join(output,'380-r26-accounts-dark.png'),fullPage:true});
  await openLab();await button('浅色').click();await lab.locator('summary').click();
  await button('更多操作：个人账号').click();
  await page.getByRole('menuitem',{name:'分享配置'}).click();
  await page.getByRole('region',{name:'分享配置'}).waitFor();
  await page.getByLabel('匿名邀请').check();
  await page.getByRole('button',{name:'模拟生成邀请'}).click();
  await page.getByText('https://example.invalid/invite/demo-only').waitFor();
  await page.getByRole('button',{name:'模拟过期'}).click();
  await page.getByText(/模拟邀请已过期/).waitFor();
  await page.screenshot({path:join(output,'380-r26-share-light.png'),fullPage:true});
  await button('返回账号').click();
  await page.getByRole('tab',{name:'市场',exact:true}).click();
  const cards=page.locator('.cookie-market-resource');
  assert.equal(await cards.count(),3);
  await page.screenshot({path:join(output,'380-r26-market-light.png'),fullPage:true});
  await openLab();
  for(const width of [320,360,380,400,440,520]){
   await page.setViewportSize({width,height:880});
   await page.getByTestId('width').selectOption(String(width));
   assert.equal(Math.round((await page.locator('.cookie-app').boundingBox()).width),width);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
    'R2.6 market external overflow at '+width+'px');
   await page.screenshot({path:join(output,width+'-r26-market-light.png'),fullPage:true});
  }
  await page.setViewportSize({width:380,height:880});
  await page.getByTestId('width').selectOption('380');
  await lab.locator('summary').click();
  await page.getByRole('searchbox',{name:'搜索市场资源'}).fill('委托');
  assert.equal(await cards.count(),1);
  await page.getByRole('button',{name:'查看详情'}).click();
  await page.getByRole('button',{name:'模拟申请'}).click();
  await page.getByText(/只更新页面状态/).waitFor();
  await button('返回市场').click();
  await scene('ready');
  await ready();
  await lab.locator('summary').click();
 });
 await test('fixed React 19 + Shared UI, one actual App and 380px frame',async()=>{
  assert.equal(await page.title(),'Cookie Editor R2.6 · React 同源视觉与交互预览');
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
  const field=await page.locator('.searchbox').boundingBox();
  const icon=await page.locator('.cookie-search-symbol svg').boundingBox();
  const input=await page.getByRole('searchbox',{name:'搜索 Cookie'}).boundingBox();
  assert.ok(icon.x>field.x&&icon.x+icon.width<input.x&&input.x+input.width<=field.x+field.width,
    'the glyph and search text share the same border');
  await page.screenshot({path:join(output,'380-light.png'),fullPage:true});
 });
 await test('320/360/400/440px bottom sheet and a mounted Cookie list',async()=>{
  for(const width of [320,360,400,440,520]){
   await page.setViewportSize({width,height:760});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await button('导入 Cookie').click();
   const sheet=page.getByRole('dialog',{name:'导入 Cookie'});await sheet.waitFor();
   assert.equal(await page.locator('dialog:modal').count(),0);
   assert.equal(await page.locator('.cookie-row').count(),8,'Cookie list must remain mounted');
   const hostBox=await page.locator('.cookie-app').boundingBox();
   assert.ok(hostBox.y>=0&&hostBox.y+hostBox.height<=760,
    width+'px preview Host frame must fit viewport: '+JSON.stringify(hostBox));
   assert.equal(await page.locator('.cookie-react-view').getAttribute('inert'),'');
   const geom=await checkSheetBounds(sheet,width,760,width+'px list');
   assert.equal(await sheet.getByRole('checkbox',{name:'覆盖已有 Cookie'}).isChecked(),true);
   const layout=await sheet.evaluate(el=>{
     const body=el.querySelector('.cookie-import-body');
     return {height:el.getBoundingClientRect().height,
       bodyClient:body.clientHeight,bodyScroll:body.scrollHeight};
   });
   assert.ok(layout.height<495,'empty sheet must fit its content: '+JSON.stringify(layout));
   assert.ok(layout.bodyClient-layout.bodyScroll<24,
     'import body must not stretch to fill empty space: '+JSON.stringify(layout));
   await page.screenshot({path:join(output,width+'-sheet-light.png')});
   const field=await sheet.getByRole('textbox',{name:'粘贴 Cookie 内容'}).boundingBox();
   assert.ok(field.width>=190&&field.height>=72);
   const action=await sheet.getByRole('button',{name:'导入',exact:true}).boundingBox();
   assert.ok(action.y>=geom.y&&action.y+action.height<=geom.y+geom.height);
   await page.keyboard.press('Escape');await sheet.waitFor({state:'detached'});
   await ready();
  }
  await page.setViewportSize({width:380,height:880});
 });
 await test('short 420px sidebar retains the sheet actions',async()=>{
  await page.setViewportSize({width:320,height:420});
  await button('导入 Cookie').click();
  const sheet=page.getByRole('dialog',{name:'导入 Cookie'});await sheet.waitFor();
  const hostBox=await page.locator('.cookie-app').boundingBox();
  assert.ok(hostBox.y>=0&&hostBox.y+hostBox.height<=420,
   'short preview Host frame must fit viewport: '+JSON.stringify(hostBox));
  await checkSheetBounds(sheet,320,420,'320x420 short viewport');
  await page.screenshot({path:join(output,'320x420-sheet-light.png')});
  const cancel=await sheet.getByRole('button',{name:'取消'}).boundingBox();
  const save=await sheet.getByRole('button',{name:'导入',exact:true}).boundingBox();
  assert.ok(cancel.y+cancel.height<=420&&save.y+save.height<=420);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await sheet.getByRole('button',{name:'取消'}).click();await sheet.waitFor({state:'detached'});
  await page.setViewportSize({width:380,height:880});
 });
 await test('search clear, filter and scroll stay unchanged during a clean sheet',async()=>{
  const search=page.getByRole('searchbox',{name:'搜索 Cookie'});
  await search.fill('session');
  await button('清除搜索').click();assert.equal(await search.inputValue(),'');
  assert.equal(await button('清除搜索').count(),0);
  await button('筛选与排序').click();
  await page.setViewportSize({width:360,height:420});
  const list=page.locator('.cookie-list');
  const scroll=await list.evaluate(el=>{el.scrollTop=32;return el.scrollTop;});
  await button('导入 Cookie').click();
  const sheet=page.getByRole('dialog',{name:'导入 Cookie'});await sheet.waitFor();
  assert.equal(await page.locator('.cookie-row').count(),8);
  await sheet.getByRole('button',{name:'关闭导入'}).click();
  await sheet.waitFor({state:'detached'});
  assert.equal(await list.evaluate(el=>el.scrollTop),scroll);
  assert.equal(await page.locator('.filter-panel').count(),1);
  await button('筛选与排序').click();
  await page.setViewportSize({width:380,height:880});
 });
 await test('dirty editor blocks import submit without losing either draft',async()=>{
  await row('session_id').click();await nameInput().fill('unsaved_cookie_draft');
  await button('导入 Cookie').click();
  const sheet=page.getByRole('dialog',{name:'导入 Cookie'});await sheet.waitFor();
  const content=JSON.stringify([{name:'not_yet_written',value:'fictional'}]);
  await sheet.getByRole('textbox',{name:'粘贴 Cookie 内容'}).fill(content);
  await sheet.getByRole('button',{name:'导入',exact:true}).click();
  await sheet.getByRole('alert').filter({hasText:/请先保存或取消当前 Cookie 编辑草稿/}).waitFor();
  assert.equal(await page.locator('.cookie-inline-editor input[aria-label="名称"]').inputValue(),'unsaved_cookie_draft');
  assert.equal(await row('not_yet_written').count(),0);
  await page.keyboard.press('Escape');
  await sheet.getByRole('group',{name:'放弃导入内容'}).waitFor();
  await sheet.getByRole('button',{name:'继续导入'}).click();
  assert.equal(await sheet.getByRole('textbox',{name:'粘贴 Cookie 内容'}).inputValue(),content);
  await page.locator('.cookie-import-dismiss-layer').click({position:{x:3,y:3}});
  await sheet.getByRole('button',{name:'放弃内容'}).click();
  await sheet.waitFor({state:'detached'});
  assert.equal(await nameInput().inputValue(),'unsaved_cookie_draft');
  await button('取消').click();await button('放弃').click();
 });
 await test('site change during a read safely restarts without unknown-effect recovery',async()=>{
  await page.evaluate(()=>{
   document.querySelector('[aria-label="刷新 Cookie"]').click();
   document.querySelector('.cookie-app').dispatchEvent(new Event('opendesk-page-changed'));
  });
  await ready();
  assert.equal(await button('重新读取 Cookie').count(),0);
  assert.equal(await page.getByText('正在读取 Cookie…',{exact:true}).count(),0);
  assert.equal(await page.getByText(/结果可能未知；请手动核对/).count(),0);
  assert.equal(await page.locator('.site-hostname').innerText(),'shop.example.com');
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
 await test('one confirmed Host-only clear removes exact cookies without a second dialog',async()=>{
  await button('安全清理本站 Cookie').click();
  const dialog=page.getByRole('dialog',{name:'清理本站 Cookie'});
  await dialog.waitFor();
  assert.match(await dialog.innerText(),/6 条/);
  await dialog.getByRole('button',{name:'清理 6 条',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.cookie-row').length===2);
  assert.equal(await page.locator('dialog:modal').count(),0,
    'the original confirmation must close after one clear attempt');
  assert.equal(await page.getByRole('button',{name:'确认本次 Cookie 操作'}).count(),0,
    'the old second Host confirmation must not appear in the React flow');
  await reset();
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
  const summaries=page.locator('.cookie-row .row-text small');
  assert.equal(await summaries.count(),8,'live Cookie rows must show expiration metadata');
  assert.match(await summaries.first().innerText(),/会话|到期|已过期/);
  assert.ok(await page.locator('.cookie-row .row-flags abbr').count()>0,
    'Cookie flags should preserve H / S / P metadata');
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
 await test('six product tabs match approved HTML and keep keyboard navigation',async()=>{
  for(const width of [320,360,380,400,440,520]){
   await page.setViewportSize({width,height:880});
   const tabs=page.getByRole('tablist',{name:'Cookie Editor 页面'});
   assert.deepEqual(await tabs.getByRole('tab').allTextContents(),
     ['Cookie','账号','企业','市场','定制','圈子']);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
     width+'px navigation overflow');
  }
  const tabs=page.getByRole('tablist',{name:'Cookie Editor 页面'});
  await tabs.getByRole('tab',{name:'Cookie',exact:true}).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await tabs.getByRole('tab',{name:'账号'}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('ArrowRight');
  assert.equal(await tabs.getByRole('tab',{name:'企业'}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('ArrowRight');
  assert.equal(await tabs.getByRole('tab',{name:'市场'}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('Home');
  assert.equal(await tabs.getByRole('tab',{name:'Cookie'}).getAttribute('aria-selected'),'true');
  await ready();await page.setViewportSize({width:380,height:880});
 });
 await test('Expiration is local, session stays session, and expired drafts cannot save',async()=>{
  for(const width of [320,360,380,400,440,520]){
   await page.setViewportSize({width,height:880});
   await row('theme').click();
   await editor().locator('details.advanced > summary').click();
   const session=editor().getByRole('checkbox',{name:'Session',exact:true});
   const expiration=editor().locator('input[type="datetime-local"]');
   assert.equal(await session.isChecked(),false);
   const original=await expiration.inputValue();
   assert.match(original,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
   assert.match(await editor().innerText(),/过期时间（Expiration）/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
     width+'px advanced expiry overflow');
   await session.check();
   assert.equal(await expiration.count(),0);
   assert.match(await editor().innerText(),/会话 Cookie · 不设置 Expiration/);
   await session.uncheck();
   assert.equal(await expiration.inputValue(),original);
   await expiration.fill('2000-01-01T00:00');
   await button('保存').click();
   await editor().getByRole('alert').getByText(/过期时间必须晚于现在/).waitFor();
   assert.ok((await expiration.inputValue()).startsWith('2000-01-01T00:00'));
   if(width===320)await page.screenshot({path:join(output,'320-expiration-light.png'),fullPage:true});
   await expiration.fill(original.slice(0,16));
   await button('取消').click();
  }
  await page.setViewportSize({width:380,height:880});
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
 await test('one-click import uses the in-place sheet and real Controller',async()=>{
  await button('导入 Cookie').click();
  const workspace=page.getByRole('dialog',{name:'导入 Cookie'});await workspace.waitFor();
  assert.equal(await page.locator('dialog:modal').count(),0);
  assert.equal(await page.locator('.cookie-row').count(),8);
  assert.equal(await page.locator('.cookie-import-panel').count(),0);
  assert.equal(await page.getByRole('status',{name:'导入预检结果'}).count(),0);
  assert.equal(await workspace.getByRole('checkbox',{name:'覆盖已有 Cookie'}).isChecked(),true);
  const input=workspace.getByRole('textbox',{name:'粘贴 Cookie 内容'});
  await input.fill(JSON.stringify([{name:'import_a',value:'fictional A'},
    {name:'import_b',value:'fictional B'},{name:'bad name',value:'invalid'},
    {name:'theme',value:'overwrite existing'}]));
  assert.equal(await page.locator('.cookie-row').count(),8);
  assert.equal(await page.getByRole('status',{name:'导入预检结果'}).count(),0);
  await workspace.getByRole('button',{name:'导入',exact:true}).click();
  await row('import_a').waitFor();await workspace.waitFor({state:'detached'});
  assert.equal(await page.locator('.cookie-row').count(),10);
  assert.match(await page.locator('.cookie-import-toast').innerText(),/已导入 3 条，跳过 1 条/);
  await row('theme').click();await valueInput().waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-cookie-secret-input]')?.value==='overwrite existing');
  assert.equal(await valueInput().inputValue(),'overwrite existing',
    'default checked import must replace the exact existing Cookie');
  await reset();
 });
 await test('unchecked overwrite skips existing and each fresh sheet restores checked default',async()=>{
  await button('导入 Cookie').click();
  let sheet=page.getByRole('dialog',{name:'导入 Cookie'});await sheet.waitFor();
  const option=sheet.getByRole('checkbox',{name:'覆盖已有 Cookie'});
  assert.equal(await option.isChecked(),true);
  await option.uncheck();
  await sheet.getByRole('button',{name:'取消'}).click();
  await sheet.waitFor({state:'detached'});
  assert.equal(await page.getByRole('group',{name:'放弃导入内容'}).count(),0,
    'changing only an option is not unsaved import content');
  await button('导入 Cookie').click();sheet=page.getByRole('dialog',{name:'导入 Cookie'});
  await sheet.waitFor();
  const checkbox=sheet.getByRole('checkbox',{name:'覆盖已有 Cookie'});
  assert.equal(await checkbox.isChecked(),true);
  await checkbox.uncheck();
  await sheet.getByRole('textbox',{name:'粘贴 Cookie 内容'}).fill(
    JSON.stringify([{name:'unchecked_added',value:'added'},
      {name:'theme',value:'must not overwrite'}]));
  await sheet.getByRole('button',{name:'导入',exact:true}).click();
  await row('unchecked_added').waitFor();await sheet.waitFor({state:'detached'});
  assert.match(await page.locator('.cookie-import-toast').innerText(),/跳过 1 条/);
  await row('theme').click();await valueInput().waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-cookie-secret-input]')?.value==='light');
  assert.equal(await valueInput().inputValue(),'light',
    'manually unchecked import must preserve existing Cookie');
  await button('取消').click();await reset();
 });
 await test('invalid-domain errors stay in workspace; real file chooser click imports once',async()=>{
  await button('导入 Cookie').click();
  const workspace=page.getByRole('dialog',{name:'导入 Cookie'});await workspace.waitFor();
  await workspace.getByRole('textbox',{name:'粘贴 Cookie 内容'}).fill(
    JSON.stringify([{name:'invalid_domain',value:'fictional',domain:'https://elsewhere.invalid'}]));
  await workspace.getByRole('button',{name:'导入',exact:true}).click();
  const alert=workspace.getByRole('alert');await alert.waitFor();
  assert.match(await alert.innerText(),/未导入 1 条/);
  assert.equal(await page.locator('.cookie-row').count(),8);
  assert.equal(await page.locator('dialog:modal').count(),0);
  assert.equal(await page.getByRole('status',{name:'导入预检结果'}).count(),0);
  await page.keyboard.press('Escape');
  await workspace.getByRole('button',{name:'放弃内容'}).click();
  await workspace.waitFor({state:'detached'});
  await button('导入 Cookie').click();await workspace.waitFor();
  const chooserPromise=page.waitForEvent('filechooser');
  await workspace.getByRole('button',{name:'选择或拖入 Cookie 文件'}).click();
  const chooser=await chooserPromise;
  const file=JSON.stringify([{name:'import_file',value:'fictional'}]);
  await chooser.setFiles({
    name:'cookies.json',mimeType:'application/json',buffer:Buffer.from(file)});
  await workspace.getByText('已选择 cookies.json · 点击导入即可写入',{exact:true}).waitFor();
  assert.equal(await row('import_file').count(),0,'choosing a file must not write before import');
  await workspace.getByRole('button',{name:'导入',exact:true}).click();
  await row('import_file').waitFor();await workspace.waitFor({state:'detached'});
  assert.equal(await page.locator('.cookie-row').count(),9);await reset();
 });
 await test('export floats above the list, uses two tabs and closes on outside focus',async()=>{
  for(const width of [320,360,400,440]){
   await page.setViewportSize({width,height:760});
   await button('导出 Cookie').click();
   const popup=page.getByRole('dialog',{name:'导出 Cookie'});await popup.waitFor();
   assert.equal(await page.locator('.cookie-row').count(),8,'list remains mounted');
   assert.equal(await popup.getByRole('tab').count(),2);
   assert.equal(await popup.getByRole('tab',{name:'Netscape'}).count(),0);
   assert.equal(await popup.getByRole('tab',{name:'JSON'}).getAttribute('aria-selected'),'true');
   assert.equal(await page.locator('dialog:modal').count(),0);
   const box=await popup.boundingBox();
   const segment=await popup.locator('.cookie-export-tabs').boundingBox();
   const format=await popup.getByRole('tab',{name:'Cookie Header'}).boundingBox();
   assert.ok(segment.width<230,'format control must be compact');
   assert.ok(format.height>=28&&format.width>=90,
     'compact tabs must retain usable pointer targets');
   assert.ok(box.x>=4&&box.x+box.width<=width-4,'popover within '+width+'px');
   await page.keyboard.press('Escape');await popup.waitFor({state:'detached'});
   assert.equal(await button('导出 Cookie').evaluate(el=>el===el.ownerDocument.activeElement),true);
  }
  await page.setViewportSize({width:380,height:880});
  await button('导出 Cookie').click();
  const popup=page.getByRole('dialog',{name:'导出 Cookie'});await popup.waitFor();
  await page.keyboard.press('ArrowRight');
  assert.equal(await popup.getByRole('tab',{name:'Cookie Header'}).getAttribute('aria-selected'),'true');
  assert.equal(await popup.getByRole('button',{name:'复制'}).isDisabled(),true,'partitioned data cannot export as header');
  // The anchored popover must not geometrically cover the search field.
  // A single real pointer click focuses search and dismisses the menu.
  const search=page.getByRole('searchbox',{name:'搜索 Cookie'});
  const menuBox=await popup.boundingBox();
  const searchBox=await search.boundingBox();
  assert.ok(menuBox.y>=searchBox.y+searchBox.height-1,
    'popover must not cover search, even in a narrow sidebar');
  await search.click();
  await popup.waitFor({state:'detached'});
  assert.equal(await search.evaluate(el=>el===el.ownerDocument.activeElement),true);
 });
 await test('export preserves search, list scroll and pending Host receipts',async()=>{
  await page.setViewportSize({width:360,height:420});
  const list=page.locator('.cookie-list');
  const search=page.getByRole('searchbox',{name:'搜索 Cookie'});
  // Filtering changes list geometry and may naturally reset scrollTop.
  // Capture the baseline only after the unfiltered list is restored.
  await search.fill('session');await search.fill('');
  const before=await list.evaluate(el=>{el.scrollTop=55;return el.scrollTop;});
  assert.ok(before>0,'scroll test must actually have an overflowing Cookie list');
  await button('导出 Cookie').click();
  let popup=page.getByRole('dialog',{name:'导出 Cookie'});await popup.waitFor();
  assert.equal(await search.inputValue(),'');
  await page.keyboard.press('Escape');await popup.waitFor({state:'detached'});
  assert.equal(await list.evaluate(el=>el.scrollTop),before,'export popup must keep list scroll');
  await search.fill('session');
  await button('导出 Cookie').click();await popup.waitFor();
  await page.keyboard.press('Escape');await popup.waitFor({state:'detached'});
  assert.equal(await search.inputValue(),'session','export popup must keep search query');
  await search.fill('');
  await button('导出 Cookie').click();await popup.waitFor();
  await page.evaluate(()=>{
    // A fictional delayed copy receipt exercises synchronous blur-before-render.
    // The real Host path is tested separately and never mocked as authorized.
    const clipboard=globalThis.OpenDeskSDK.browser.clipboard;
    const original=clipboard.writeText;
    clipboard.writeText=()=>new Promise(resolve=>{
      globalThis.__finishCookiePreviewCopy=()=>{
        clipboard.writeText=original;resolve({copied:true});
      };
    });
    [...document.querySelectorAll('.cookie-export-popover button')]
      .find(node=>node.textContent.trim()==='复制')?.click();
    window.dispatchEvent(new Event('blur'));
  });
  await page.waitForFunction(()=>typeof globalThis.__finishCookiePreviewCopy==='function');
  assert.equal(await popup.count(),1,'pending effect must not close on window blur');
  await page.evaluate(()=>{
    globalThis.__finishCookiePreviewCopy();
    delete globalThis.__finishCookiePreviewCopy;
  });
  await popup.waitFor({state:'detached'});
  await page.setViewportSize({width:380,height:880});
 });
 await test('JSON copy/download use real Controller without navigation or data preview',async()=>{
  await button('导出 Cookie').click();
  const popup=page.getByRole('dialog',{name:'导出 Cookie'});await popup.waitFor();
  assert.equal(await popup.getByRole('tab',{name:'JSON'}).getAttribute('aria-selected'),'true');
  assert.equal(await popup.getByRole('checkbox',{name:/包含 Cookie 值/}).isChecked(),true);
  // Header cannot silently restore sensitive values after an explicit opt-out.
  await popup.getByRole('checkbox',{name:/包含 Cookie 值/}).uncheck();
  await popup.getByRole('tab',{name:'Cookie Header'}).click();
  await popup.getByRole('alert').filter({hasText:/Cookie Header 需要包含 Cookie 值/}).waitFor();
  assert.equal(await popup.getByRole('button',{name:'复制'}).isDisabled(),true);
  await popup.getByRole('tab',{name:'JSON'}).click();
  await popup.getByRole('checkbox',{name:/包含 Cookie 值/}).check();
  assert.equal(await page.locator('.cookie-row').count(),8);
  assert.equal(await popup.locator('[data-cookie-secret-output]').count(),0);
  await popup.getByRole('button',{name:'复制'}).click();await ready();
  await popup.waitFor({state:'detached'});
  assert.equal(await button('导出 Cookie').evaluate(el=>el===el.ownerDocument.activeElement),true);
  await button('导出 Cookie').click();await popup.waitFor();
  const downloadEvent=page.waitForEvent('download');
  await popup.getByRole('button',{name:'下载'}).click();
  const download=await downloadEvent;await download.saveAs(join(output,'fictional-cookies.json'));
  assert.equal(JSON.parse(await readFile(join(output,'fictional-cookies.json'),'utf8')).length,8);
  await popup.waitFor({state:'detached'});
  await scene('valuesDenied');await ready();
  await button('导出 Cookie').click();await popup.waitFor();
  await popup.getByRole('button',{name:'复制'}).click();
  await popup.getByRole('alert').filter({hasText:/E_COOKIE_VALUES/}).waitFor();await reset();
 });
 await test('one-shot export failure remains in the popover and manual retry succeeds',async()=>{
  await page.getByTestId('failure').selectOption('copy');
  await button('导出 Cookie').click();
  const popup=page.getByRole('dialog',{name:'导出 Cookie'});await popup.waitFor();
  await popup.getByRole('button',{name:'复制'}).click();
  await popup.getByRole('alert').filter({hasText:/E_CLIPBOARD/}).waitFor();
  assert.equal(await page.locator('.cookie-row').count(),8);
  await popup.getByRole('button',{name:'复制'}).click();await ready();
  await popup.waitFor({state:'detached'});
  assert.equal(await page.getByRole('alert').count(),0);
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
 await test('account Vault lock requires an affirmative trusted receipt',async()=>{
  await scene('accountLockUnknown');
  await button('锁定账号仓库').waitFor();
  await button('锁定账号仓库').click();
  await page.getByText(/账号仓库锁定回执未确认/).waitFor();
  assert.equal(await button('锁定账号仓库').count(),1,
    'ambiguous lock must retain the last confirmed unlocked view');
  assert.equal(await page.getByText('账号仓库已锁定。').count(),0);
  await scene('accountsDemo');
  await button('锁定账号仓库').waitFor();
  await button('锁定账号仓库').click();
  await page.getByText('账号仓库已锁定。').waitFor();
  await page.getByRole('button',{name:'解锁',exact:true}).waitFor();
 });
 await test('blocked/loading/empty/read-only scenes come from SDK responses',async()=>{
  await scene('first');await button('允许管理所有网站 Cookie').waitFor();
  assert.equal(await page.locator('.cookie-row').count(),0);
  await button('允许管理所有网站 Cookie').click();await ready();
  for(const hostname of ['docs.example.org','store.example.net']){
   await openLab();await page.getByTestId('site').selectOption(hostname);
   await page.locator('.site-hostname').filter({hasText:hostname}).waitFor();
   assert.equal(await page.locator('.cookie-row').count(),2);
   assert.equal(await button('允许管理所有网站 Cookie').count(),0);
  }
  await button('预览授权设置').click();
  await page.getByRole('region',{name:'Cookie 全站授权设置'}).getByText(/已授权/).waitFor();
  await button('撤销全站授权').click();
  await button('允许管理所有网站 Cookie').last().waitFor();
  assert.equal(await page.locator('.cookie-row').count(),0);
  await button('允许管理所有网站 Cookie').last().click();
  await openLab();await page.getByTestId('site').selectOption('shop.example.com');await ready();
  await row('session_id').click();await nameInput().fill('grant_checked_sid');
  await button('保存').click();await row('grant_checked_sid').waitFor();
  await row('grant_checked_sid').click();assert.equal(await nameInput().inputValue(),'grant_checked_sid');
  await reset();
  await scene('loading');await page.getByText('正在读取 Cookie…',{exact:true}).waitFor();await reset();
  await scene('empty');await page.locator('.cookie-react-view').waitFor();assert.equal(await page.locator('.cookie-row').count(),0);
  await scene('readonly');await ready();await row('session_id').click();await nameInput().fill('denied_write');await button('保存').click();await page.getByText(/E_PERMISSION_REQUIRED/).waitFor();await reset();
 });
 await test('site header keeps refresh without the website URL tools dropdown',async()=>{
  const header=page.locator('.site-bar');
  assert.equal(await header.locator('details,summary,select').count(),0);
  assert.equal(await page.getByLabel('网站 URL',{exact:true}).count(),0);
  assert.equal(await header.getByRole('button',{name:'刷新 Cookie',exact:true}).count(),1);
  await button('刷新 Cookie').click();await ready();
 });
 await test('380px dark and editing evidence; clear-value icon stays inside input',async()=>{
  await reset();await button('深色').click();
  await lab.locator('summary').click();
  await page.screenshot({path:join(output,'380-dark.png'),fullPage:true});
  await openLab();await button('浅色').click();
  await row('session_id').click();await valueInput().waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-cookie-secret-input]')?.value==='sess_demo_only_C18');
  await valueInput().fill('fictional R5.23 editing');
  await lab.locator('summary').click();
  const clear=page.locator('.value-input').getByRole('button',{name:'清空值'});
  const field=await valueInput().boundingBox(),icon=await clear.boundingBox();
  assert.ok(Math.abs(field.y+field.height/2-icon.y-icon.height/2)<=1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:join(output,'380-editing.png'),fullPage:true});
  await clear.click();assert.equal(await valueInput().inputValue(),'');assert.equal(await button('保存').isEnabled(),true);
 });
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 const receipt={status:'PASS',htmlSha256:sha(html),chromium:browser.version(),viewport:{width:380,height:880},tests:pass,errors,network,screenshots:['380-r26-accounts-light.png','380-r26-accounts-dark.png','380-r26-share-light.png','380-r26-market-light.png',...([320,360,380,400,440,520].flatMap(width=>[width+'-r26-accounts-light.png',width+'-r26-market-light.png'])),'380-light.png','380-dark.png','380-editing.png'],gaps:['Real Chrome Cookie SDK/permissions/install not exercised','Prebuilt fixed Shared UI resource reused; no host build','Real browser zoom and signed installed package out of scope']};
 await writeFile(join(output,'chromium-results.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:'PASS',tests:pass.length,htmlSha256:receipt.htmlSha256,output}));
}catch(error){
 await page.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});
 await writeFile(join(output,'chromium-failure.json'),JSON.stringify({passed:pass,errors,network,error:String(error)},null,2));throw error;
}finally{await browser.close();}
