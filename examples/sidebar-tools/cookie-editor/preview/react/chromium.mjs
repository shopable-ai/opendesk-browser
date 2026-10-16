// React 19 *real built candidate* smoke; run after `npm run build`.
import {chromium} from 'playwright';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,dirname,resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const here=dirname(fileURLToPath(import.meta.url));
const url=pathToFileURL(join(here,'index.html')).href;
const output=join(here,'screenshots');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:384,height:880},acceptDownloads:true});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const pass=[];
const test=async(name,run)=>{await run();pass.push(name);console.log('PASS',name)};
try{
 await page.goto(url,{waitUntil:'load'});
 await test('React 19 render eight cookies',async()=>{await page.locator('.cookie-row').first().waitFor();assert.equal(await page.locator('.cookie-row').count(),8);});
 await page.screenshot({path:join(output,'384-initial.png'),fullPage:true});
 await test('inline dirty restore and save',async()=>{
   await page.locator('[data-row="b"]').click();await page.locator('#cookie-name').fill('renamed');assert.equal(await page.getByText('未保存',{exact:true}).count(),1);
   await page.locator('#cookie-name').fill('theme');assert.equal(await page.getByText('未保存',{exact:true}).count(),0);
   await page.locator('#cookie-name').fill('renamed');await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByText('已保存 Cookie').waitFor();
   assert.match(await page.locator('[data-row="b"]').innerText(),/renamed/);
 });
 await test('draft switch and discard inline',async()=>{await page.locator('[data-row="b"]').click();await page.locator('#cookie-name').fill('again');await page.locator('[data-row="c"]').click();await page.getByText('放弃当前未保存修改？').waitFor();await page.getByRole('button',{name:'放弃',exact:true}).click();assert.equal(await page.locator('[data-row="c"]').getAttribute('aria-expanded'),'true');});
 await test('search pins active draft',async()=>{await page.locator('#cookie-name').fill('temporary');await page.getByRole('searchbox',{name:'搜索 Cookie'}).fill('renamed');await page.getByText('当前编辑项不符合筛选条件，暂时保留显示。').waitFor();await page.locator('#cookie-name').fill('locale');await page.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('searchbox',{name:'搜索 Cookie'}).fill('');});
 await test('create and value reveal',async()=>{
  await page.getByRole('button',{name:'新建 Cookie'}).click();await page.locator('#cookie-name').fill('created');await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByText('已保存 Cookie').waitFor();
  await page.locator('[data-row="a"]').click();assert.equal(await page.getByText('sess_demo_only_C18').count(),0);await page.getByRole('button',{name:'读取并显示 Cookie 值'}).click();assert.equal(await page.getByText('sess_demo_only_C18').count(),1);
  await page.getByRole('button',{name:'隐藏 Cookie 值'}).click();assert.equal(await page.getByText('sess_demo_only_C18').count(),0);await page.getByRole('button',{name:'取消',exact:true}).click();
 });
 await test('import preview detects conflict and writes after confirm',async()=>{await page.getByRole('button',{name:'导入 Cookie'}).click();await page.locator('textarea').fill('[{"name":"created","value":"new"},{"name":"imported","value":"ok"}]');await page.getByRole('button',{name:'预览影响'}).click();await page.getByText('新增 1 · 覆盖 1 · 错误 0').waitFor();await page.getByRole('button',{name:'确认导入',exact:true}).click();await page.getByRole('button',{name:'确认',exact:true}).click();await page.getByText('已导入 2 条 Cookie').waitFor();});
 await test('metadata-only JSON download',async()=>{await page.getByRole('button',{name:'导出 Cookie'}).click();const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'下载',exact:true}).click()]);assert.match(download.suggestedFilename(),/\.json$/);});
 await test('viewport + zoom + dark',async()=>{
  for(const width of [320,360,384,420,520]){await page.setViewportSize({width,height:850});assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`overflow ${width}`);await page.screenshot({path:join(output,`${width}-export.png`),fullPage:true});for(const zoom of ['125%','150%','200%']){await page.evaluate(z=>document.body.style.zoom=z,zoom);assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`overflow ${width}@${zoom}`);}await page.evaluate('document.body.style.zoom=""');}
  await page.getByRole('button',{name:'深色'}).click();await page.screenshot({path:join(output,'384-dark.png'),fullPage:true});
 });
 await test('unauthorized is not empty',async()=>{await page.locator('[data-testid="scenario"]').selectOption('first');await page.getByText('尚未授权查看本站 Cookie').waitFor();assert.equal(await page.getByText('本站暂无 Cookie').count(),0);});
 assert.deepEqual(errors,[],`Runtime errors: ${errors.join('; ')}`);
 console.log(JSON.stringify({result:'PASS',react:'19.2.0',passed:pass.length,pass,errors},null,2));
}finally{await browser.close();}
