// React 19 *real built candidate* smoke; run after `npm run build`.
import {chromium} from 'playwright';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,dirname,resolve} from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
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
 assert.equal(await page.title(),'Cookie Editor R5.2 · 380px 交互预览','React build must have the R4.11 preview title');
 await test('380px native-width panel when standalone HTML is opened on desktop',async()=>{
   await page.setViewportSize({width:1280,height:880});
   await page.locator('.cookie-app').waitFor();
   const app=await page.locator('.cookie-app').boundingBox();
   const lab=await page.locator('.demo-lab').boundingBox();
   assert.ok(app&&Math.abs(app.width-380)<=1,`expected 380px sidebar, got ${app?.width}`);
   assert.ok(lab&&lab.width<=381,`preview controls exceed sidebar width: ${lab?.width}`);
   assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'desktop horizontal overflow');
   await page.screenshot({path:join(output,'380-standalone-desktop.png'),fullPage:true});
   await page.setViewportSize({width:384,height:880});
 });
 await test('React 19 render eight cookies',async()=>{await page.locator('.cookie-row').first().waitFor();assert.equal(await page.locator('.cookie-row').count(),8);});
 await page.screenshot({path:join(output,'384-initial.png'),fullPage:true});
 await test('import/export icons convey data flow, download icon still means file download',async()=>{
   const path=async(label)=>page.getByRole('button',{name:label,exact:true}).locator('svg path').first().getAttribute('d');
   assert.equal(await path('导入 Cookie'),'M12 21V9m-4 4 4-4 4 4M4 3v4h16V3');
   assert.equal(await path('导出 Cookie'),'M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4');
   await page.getByRole('button',{name:'导出 Cookie'}).click();
   assert.equal(await path('下载'),'M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4');
   await page.getByRole('button',{name:'关闭导出'}).click();
 });
 await test('clear site is visible beside import/export and requires scoped confirmation',async()=>{
   const clear=page.getByRole('button',{name:'安全清理本站 Cookie',exact:true});
   assert.equal(await clear.count(),1);
   const toolbar=page.locator('.list-toolbar');
   assert.equal(await toolbar.getByRole('button',{name:'导入 Cookie'}).count(),1);
   assert.equal(await toolbar.getByRole('button',{name:'导出 Cookie'}).count(),1);
   assert.equal(await toolbar.getByRole('button',{name:'新建 Cookie'}).count(),1);
   assert.equal(await toolbar.getByRole('button',{name:'安全清理本站 Cookie'}).count(),1);
   await clear.click();
   await page.getByRole('group',{name:'确认安全清理本站 Cookie'}).waitFor();
   await page.getByText(/不会清理父域 Cookie/).waitFor();
   assert.equal(await page.locator('.cookie-row').count(),8,'click alone must never clear');
   await page.getByRole('button',{name:'取消',exact:true}).click();
   assert.equal(await page.locator('.cookie-row').count(),8,'cancellation preserves every fixture');
   await clear.click();
   await page.getByRole('button',{name:/确认清理 6 条/}).click();
   await page.getByText(/已模拟安全清理 6 条/).waitFor();
   assert.equal(await page.locator('.cookie-row').count(),2,'domain and partition rows are excluded');
   await page.locator('[data-testid="scenario"]').selectOption('ready');
   assert.equal(await page.locator('.cookie-row').count(),8);
 });
 await test('inline dirty restore and save',async()=>{
   await page.locator('[data-row="b"]').click();await page.locator('#cookie-name').fill('renamed');assert.equal(await page.getByText('未保存',{exact:true}).count(),1);
   await page.locator('#cookie-name').fill('theme');assert.equal(await page.getByText('未保存',{exact:true}).count(),0);
   await page.locator('#cookie-name').fill('renamed');await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByText(/已模拟重命名/).waitFor();
   assert.match(await page.locator('[data-row="b"]').innerText(),/renamed/);
 });
 await test('draft switch and discard inline',async()=>{await page.locator('[data-row="b"]').click();await page.locator('#cookie-name').fill('again');await page.locator('[data-row="c"]').click();await page.getByText('放弃当前未保存修改？').waitFor();await page.getByRole('button',{name:'放弃',exact:true}).click();assert.equal(await page.locator('[data-row="c"]').getAttribute('aria-expanded'),'true');});
 await test('search pins active draft',async()=>{
   assert.equal(await page.locator('[data-row="c"]').getAttribute('aria-expanded'),'true');
   await page.locator('#cookie-name').fill('temporary');
   await page.getByRole('searchbox',{name:'搜索 Cookie'}).fill('not-a-matching-cookie-r52');
   // Capture browser facts before the existing strict assertion; diagnose React vs test failures.
   const pinFacts=await page.evaluate(()=>({
     search:document.querySelector('[aria-label="搜索 Cookie"]')?.value,
     activeRows:[...document.querySelectorAll('.row-trigger[aria-expanded="true"]')].map(el=>el.dataset.row),
     shownRows:[...document.querySelectorAll('.row-trigger')].map(el=>el.dataset.row),
     draft:document.querySelector('#cookie-name')?.value??null,
     note:document.querySelector('.pinned-note')?.textContent??null
   }));
   console.log('R522_PIN_FACTS',JSON.stringify(pinFacts));
   await page.screenshot({path:join(output,'search-pin-diagnostic.png'),fullPage:true});
   await page.locator('.pinned-note').waitFor();
   await page.locator('#cookie-name').fill('locale');
   await page.getByRole('button',{name:'取消',exact:true}).click();
   await page.getByRole('searchbox',{name:'搜索 Cookie'}).fill('');
 });
 await test('create and value reveal',async()=>{
  await page.getByRole('button',{name:'新建 Cookie'}).click();await page.locator('#cookie-name').fill('created');await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByText('已保存 Cookie').waitFor();
  await page.locator('[data-row="a"]').click();assert.equal(await page.getByLabel('Cookie 值',{exact:true}).inputValue(),'');await page.getByRole('button',{name:'读取并显示 Cookie 值'}).click();assert.equal(await page.getByLabel('Cookie 值',{exact:true}).inputValue(),'sess_demo_only_C18');
  await page.getByRole('button',{name:'隐藏 Cookie 值'}).click();assert.equal(await page.getByLabel('Cookie 值',{exact:true}).inputValue(),'');await page.getByRole('button',{name:'取消',exact:true}).click();
 });

 await test('R5.2 Host and Cookie destruction buttons belong to distinct toolbars',async()=>{
   assert.equal(await page.locator('.preview-host-header').getByRole('button',{name:'卸载工具'}).count(),1);
   assert.equal(await page.locator('.list-toolbar').getByRole('button',{name:'安全清理本站 Cookie'}).count(),1);
 });
 await test('R5.2 advanced properties, Session toggle and timezone date validation',async()=>{
  await page.locator('[data-row="b"]').click();
  await page.getByText('属性与高级设置').click();
  assert.equal(await page.getByLabel('Domain').inputValue(),'shop.example.com');
  assert.equal(await page.getByLabel('Domain').getAttribute('readonly'),'');
  assert.equal(await page.getByLabel('Path').getAttribute('readonly'),'');
  assert.equal(await page.getByRole('checkbox',{name:/仅当前主机/}).isDisabled(),true);
  await page.getByText('Store ID',{exact:true}).waitFor();
  await page.getByText('PartitionKey',{exact:true}).waitFor();
  const expiry=page.getByLabel('过期时间（本地时间）');
  assert.match(await expiry.inputValue(),/^2027-12-10T10:30/);
  await page.getByRole('checkbox',{name:/Session/}).check();
  assert.equal(await page.getByLabel('过期时间（本地时间）').count(),0);
  await page.getByRole('checkbox',{name:/Session/}).uncheck();
  assert.match(await page.getByLabel('过期时间（本地时间）').inputValue(),/^2027-12-10T10:30/);
  assert.equal(await page.getByText('未保存',{exact:true}).count(),0);
  await page.getByLabel('过期时间（本地时间）').fill('2020-01-01T12:00');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByText(/请选择有效的未来过期时间/).waitFor();
  await page.getByLabel('过期时间（本地时间）').fill('2027-12-10T10:30');
  assert.equal(await page.getByText('未保存',{exact:true}).count(),0);
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.locator('[data-row="h"]').click();
  await page.getByText('属性与高级设置').click();
  await page.getByText(/partner.example.net/).waitFor();
  await page.getByRole('button',{name:'取消',exact:true}).click();
 });
 await test('R5.2 empty vs retained value, semantic dirty and secure constraints',async()=>{
  await page.locator('[data-row="b"]').click();
  const value=page.getByLabel('Cookie 值',{exact:true});
  assert.equal(await value.getAttribute('type'),'password');
  await page.getByRole('button',{name:'清空值'}).click();
  await page.getByText('将写入空值').waitFor();
  assert.equal(await page.getByText('未保存',{exact:true}).count(),1);
  await page.getByRole('button',{name:'恢复原值'}).click();
  assert.equal(await page.getByText('未保存',{exact:true}).count(),0);
  await value.fill('light');
  assert.equal(await page.getByText('未保存',{exact:true}).count(),0);
  await value.fill('dark');
  assert.equal(await page.getByText('未保存',{exact:true}).count(),1);
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.getByRole('button',{name:'放弃',exact:true}).click();
  await page.locator('[data-row="b"]').click();
  await page.getByText('属性与高级设置').click();
  await page.getByLabel('SameSite').selectOption('no_restriction');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByText(/SameSite=None 必须/).waitFor();
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.getByRole('button',{name:'放弃',exact:true}).click();
 });
 await test('R5.2 new persistent Cookie requires future expiration and prefix safety',async()=>{
  await page.getByRole('button',{name:'新建 Cookie'}).click();
  await page.locator('#cookie-name').fill('__Host-demo');
  await page.getByText('属性与高级设置').click();
  await page.getByRole('checkbox',{name:/Session/}).uncheck();
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByText(/请选择有效的未来过期时间/).waitFor();
  const future=await page.evaluate(()=>{
   const d=new Date(Date.now()+365*24*60*60*1000),p=n=>String(n).padStart(2,'0');
   return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());
  });
  await page.getByLabel('过期时间（本地时间）').fill(future);
  await page.getByRole('checkbox',{name:'Secure'}).uncheck();
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByText(/__Host- Cookie 必须/).waitFor();
  await page.getByRole('checkbox',{name:'Secure'}).check();
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByText('已保存 Cookie').waitFor();
 });
 await test('R5.2 full expanded form is responsive including zoom',async()=>{
  await page.locator('[data-row="h"]').click();
  await page.getByText('属性与高级设置').click();
  for(const width of [320,360,380,420,520]){
    await page.setViewportSize({width,height:850});
    assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'expanded width '+width);
    for(const zoom of ['125%','150%','200%']){
      await page.evaluate(z=>document.body.style.zoom=z,zoom);
      assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'expanded width '+width+' zoom '+zoom);
    }
    await page.evaluate('document.body.style.zoom=""');
  }
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.setViewportSize({width:384,height:880});
 });
 await test('R5.2.1 compact validation and new-editor keyboard focus',async()=>{
  await page.getByRole('button',{name:'新建 Cookie'}).click();
  await page.locator('#cookie-name').fill('invalid name');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByText(/名称不可为空/).waitFor();
  assert.equal(await page.locator('details.advanced').getAttribute('open'),null,'basic error must not expand advanced fields');
  assert.equal(await page.locator('#cookie-name').getAttribute('aria-invalid'),'true');
  await page.waitForFunction(()=>document.activeElement?.id==='cookie-name');
  await page.locator('#cookie-name').fill('');
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='新建 Cookie');
  await page.getByRole('button',{name:'新建 Cookie'}).click();
  await page.locator('#cookie-name').fill('temporary');
  await page.getByRole('button',{name:'关闭编辑'}).click();
  await page.getByText('放弃当前未保存修改？').waitFor();
  await page.getByRole('button',{name:'放弃',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='新建 Cookie');
 });
 await test('R5.2.1 unknown writes block deletion until refresh',async()=>{
  await page.locator('[data-row="b"]').click();
  await page.locator('#cookie-name').fill('pending_rename');
  await page.locator('[data-testid="failure"]').selectOption('unknown');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByText(/写入结果未知/).waitFor();
  assert.equal(await page.locator('.delete-btn').isDisabled(),true);
  await page.getByRole('button',{name:'刷新 Cookie'}).click();
  assert.equal(await page.locator('.delete-btn').isDisabled(),false);
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.getByRole('button',{name:'放弃',exact:true}).click();
 });
 await test('R4.11 automatically analyzes import, safe skip, overwrite on opt-in',async()=>{
   await page.getByRole('button',{name:'导入 Cookie'}).click();
   const input=page.getByRole('textbox',{name:'Cookie 内容'});
   await input.fill('[{"name":"created","value":"new"},{"name":"imported","value":"ok"}]');
   await page.getByText('新增 1 · 重复 1 · 无效 0').waitFor();
   assert.equal(await page.getByRole('button',{name:'预览影响'}).count(),0);
   await page.getByRole('button',{name:'导入 1 条'}).click();
   await page.getByText('已导入 1 条 · 跳过 1 条（预览模拟）').waitFor();
   assert.equal(await page.getByRole('button',{name:'确认',exact:true}).count(),0);
   await page.getByRole('button',{name:'导入 Cookie'}).click();
   await input.fill('[{"name":"created","value":"changed"}]');
   await page.getByText('新增 0 · 重复 1 · 无效 0').waitFor();
   assert.equal(await page.getByRole('button',{name:'导入 0 条'}).isDisabled(),true);
   await page.getByText('覆盖现有同身份 Cookie（默认跳过）').click();
   await page.getByRole('button',{name:'导入 1 条'}).click();
   await page.getByText('已导入 1 条 · 跳过 0 条（预览模拟）').waitFor();
 });
 await test('R4.11 file, Cookie Header, Netscape and safety failures',async()=>{
   await page.getByRole('button',{name:'导入 Cookie'}).click();
   const input=page.getByRole('textbox',{name:'Cookie 内容'});
   await page.locator('input[type=file]').setInputFiles({name:'cookies.txt',mimeType:'text/plain',buffer:Buffer.from('Cookie: prefA=1; prefB=2')});
   await page.getByText('Cookie Header · 2 条').waitFor();
   await page.getByText('cookies.txt',{exact:true}).waitFor();
   await page.getByRole('button',{name:'清空'}).click();
   await input.fill('# Netscape HTTP Cookie File\nshop.example.com\tFALSE\t/\tTRUE\t0\tprefC\t3');
   await page.getByText('Netscape · 1 条').waitFor();
   await input.fill('[{"name":"valid","value":"1"},{"name":"","value":"2"}]');
   await page.getByText('新增 1 · 重复 0 · 无效 1').waitFor();
   await input.fill('[{"name":"leak","value":"x","domain":"evil.example.org"}]');
   await page.getByText(/域名不属于当前网站/).waitFor();
   assert.equal(await page.getByRole('button',{name:'导入 0 条'}).isDisabled(),true);
   await input.fill('[{"name":"part","value":"x","partitioned":true}]');
   await page.getByText(/缺少 PartitionKey/).waitFor();
   await input.fill('[{"name":"safe","value":"ok"}]');
   await page.locator('[data-testid="failure"]').selectOption('import');
   await page.getByRole('button',{name:'导入 1 条'}).click();
   await page.getByText(/导入未完成/).waitFor();
   assert.equal(await input.inputValue(),'[{"name":"safe","value":"ok"}]');
   await page.getByRole('button',{name:'取消',exact:true}).click();
 });
 await test('R5.2.1 Netscape local datetime and Unix expiration roundtrip',async()=>{
  await page.locator('[data-testid="scenario"]').selectOption('ready');
  await page.getByRole('button',{name:'导入 Cookie'}).click();
  await page.getByRole('textbox',{name:'Cookie 内容'}).fill('# Netscape HTTP Cookie File\nshop.example.com\tFALSE\t/\tTRUE\t1893456000\tfuture_roundtrip\tdemo');
  await page.getByText('Netscape · 1 条').waitFor();
  await page.getByRole('button',{name:'导入 1 条'}).click();
  await page.getByText(/已导入 1 条/).waitFor();
  const row=page.locator('.cookie-row').filter({hasText:'future_roundtrip'});
  await row.locator('.row-trigger').click();
  await page.getByText('属性与高级设置').click();
  const expiry=page.getByLabel('过期时间（本地时间）');
  assert.equal(await expiry.evaluate(el=>new Date(el.value).getTime()/1000),1893456000);
  const adjusted=await page.evaluate(()=>{
   const d=new Date(1893459600*1000),p=n=>String(n).padStart(2,'0');
   return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
  });
  await expiry.fill(adjusted);
  await page.getByText('未保存',{exact:true}).waitFor();
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByText('已保存 Cookie').waitFor();
  await row.locator('.row-trigger').click();
  await page.getByText('属性与高级设置').click();
  assert.equal(await page.getByLabel('过期时间（本地时间）').inputValue(),adjusted);
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.getByRole('button',{name:'导出 Cookie'}).click();
  await page.getByLabel('导出格式').selectOption('netscape');
  await page.locator('.partition-option input').check();
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'下载',exact:true}).click()]);
  const content=await readFile(await download.path(),'utf8');
  const matching=content.split('\n').find(line=>line.includes('\tfuture_roundtrip\t'));
  assert.ok(matching,'persistent Cookie missing from exported Netscape');
  assert.equal(matching.split('\t')[4],'1893459600','Unix seconds must survive editor save and export');
  await page.getByRole('button',{name:'关闭导出'}).click();
  await page.locator('[data-testid="scenario"]').selectOption('ready');
 });
 await test('R4.11.1 copy button compact and search SVG fixed size and unfilled',async()=>{
   await page.getByRole('button',{name:'导出 Cookie'}).click();
   for(const width of [320,360,384]){
     await page.setViewportSize({width,height:880});
     const copy=await page.getByRole('button',{name:'复制',exact:true}).boundingBox();
     const download=await page.getByRole('button',{name:'下载',exact:true}).boundingBox();
     const search=await page.locator('.searchbox>svg').boundingBox();
     assert.ok(copy&&download&&search,'export controls and search icon visible');
     assert.ok(copy.width<=100&&download.width>copy.width,'copy must be compact; download primary');
     assert.ok(search.width<=17&&search.height<=17,'search icon must stay 16px');
     assert.equal(await page.locator('.searchbox>svg circle').evaluate(e=>getComputedStyle(e).fill),'none','search lens never filled');
     assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'no layout overflow');
   }
   await page.setViewportSize({width:384,height:880});
   await page.getByRole('button',{name:'关闭导出'}).click();
 });
 await test('R4.11.1 drag-drop file parse, replacement, invalid file safety and picker compatibility',async()=>{
   await page.getByRole('button',{name:'导入 Cookie'}).click();
   const zone=page.getByRole('button',{name:'选择或拖入 Cookie 文件'});
   assert.equal(await zone.count(),1);
   await zone.focus();
   const drop=async(name,content,extra=false)=>zone.evaluate((element,{name,content,extra})=>{
     const dt=new DataTransfer();
     dt.items.add(new File([content],name,{type:'text/plain'}));
     if(extra)dt.items.add(new File(['Cookie: other=1'],'second.txt',{type:'text/plain'}));
     element.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:dt}));
     element.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));
     element.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
   },{name,content,extra});
   await drop('first.txt','Cookie: drag_cookie=1; second_cookie=2');
   await page.getByText('Cookie Header · 2 条').waitFor();
   await page.getByText('first.txt',{exact:true}).waitFor();
   await drop('second.json','[{"name":"drag_replaced","value":"yes"}]');
   await page.getByText('JSON · 1 条').waitFor();
   await page.getByText('second.json',{exact:true}).waitFor();
   await drop('large.txt','x'.repeat(150001));
   await page.getByText(/文件超过 150 KB/).waitFor();
   assert.equal(await page.getByRole('textbox',{name:'Cookie 内容'}).inputValue(),'[{"name":"drag_replaced","value":"yes"}]','too-large replacement preserves valid input');
   await drop('binary.txt','Cookie: bad='+String.fromCharCode(0));
   await page.getByText(/文件不是有效的 Cookie 文本/).waitFor();
   assert.equal(await page.getByRole('textbox',{name:'Cookie 内容'}).inputValue(),'[{"name":"drag_replaced","value":"yes"}]','binary input must not replace previous valid source');
   await drop('many.txt','Cookie: a=1',true);
   await page.getByText(/一次只能导入一个/).waitFor();
   await page.locator('input[type=file]').setInputFiles({name:'picked.txt',mimeType:'text/plain',buffer:Buffer.from('Cookie: picked=1')});
   await page.getByText('picked.txt',{exact:true}).waitFor();
   await page.getByRole('button',{name:'清空'}).click();
   assert.equal(await page.getByRole('textbox',{name:'Cookie 内容'}).inputValue(),'');
   await page.getByRole('button',{name:'取消',exact:true}).click();
 });
 await test('R4.11 Chinese IME Escape preserves the import panel',async()=>{
   await page.getByRole('button',{name:'导入 Cookie'}).click();
   const input=page.getByRole('textbox',{name:'Cookie 内容'});
   await input.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,isComposing:true})));
   assert.equal(await page.getByRole('button',{name:'关闭导入'}).count(),1,'IME candidate Escape must not dismiss import');
   await input.focus();
   await page.keyboard.press('Escape');
   assert.equal(await page.getByRole('button',{name:'关闭导入'}).count(),0,'normal Escape should close import');
 });
 await test('R4.11 full-value JSON and metadata backup without app confirmation',async()=>{
   await page.getByRole('button',{name:'导出 Cookie'}).click();
   assert.match(await page.locator('.export-brief').innerText(),/包含 Cookie 值/);
   const [full]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'下载',exact:true}).click()]);
   assert.match(full.suggestedFilename(),/\.json$/);
   assert.equal(await page.getByRole('button',{name:'确认下载'}).count(),0);
   const backup=JSON.parse(await readFile(await full.path(),'utf8'));
   assert.equal(backup.find(row=>row.name==='session_id').value,'sess_demo_only_C18');
   await page.getByRole('checkbox',{name:'包含值'}).uncheck();
   assert.match(await page.locator('.export-brief').innerText(),/仅导出属性/);
   const [meta]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'下载',exact:true}).click()]);
   assert.ok(!Object.hasOwn(JSON.parse(await readFile(await meta.path(),'utf8'))[0],'value'));
   await page.getByRole('button',{name:'复制',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'确认复制'}).count(),0);
 });
 await test('R4.9.2 horizontal value icon alignment',async()=>{
   await page.getByRole('button',{name:'导出 Cookie'}).click();
   await page.locator('[data-row="b"]').click();
   for(const width of [320,384,520]){
     await page.setViewportSize({width,height:880});
     const input=await page.locator('.value-input input').boundingBox();
     const button=await page.getByRole('button',{name:'读取并显示 Cookie 值'}).boundingBox();
     assert.ok(input&&button,'value input/icon must be visible');
     const delta=Math.abs((input.y+input.height/2)-(button.y+button.height/2));
     assert.ok(delta<=1,`Value eye button not vertically centered: ${width}px, delta=${delta}`);
   }
   await page.getByRole('button',{name:'取消',exact:true}).click();
 });
 await test('viewport + zoom + dark',async()=>{
  for(const width of [320,360,384,420,520]){await page.setViewportSize({width,height:850});assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`overflow ${width}`);await page.screenshot({path:join(output,`${width}-export.png`),fullPage:true});for(const zoom of ['125%','150%','200%']){await page.evaluate(z=>document.body.style.zoom=z,zoom);assert.equal(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`overflow ${width}@${zoom}`);}await page.evaluate('document.body.style.zoom=""');}
  await page.getByRole('button',{name:'深色'}).click();await page.screenshot({path:join(output,'384-dark.png'),fullPage:true});
 });
 await test('first authorization denial, recovery, auto-hide and revocation',async()=>{
   await page.locator('[data-testid="scenario"]').selectOption('first');
   await page.getByRole('button',{name:'允许访问',exact:true}).waitFor();
   assert.equal(await page.locator('.cookie-row').count(),0);
   assert.equal(await page.getByText('本站暂无 Cookie').count(),0);
   await page.locator('[data-testid="failure"]').selectOption('grantDenied');
   await page.getByRole('button',{name:'允许访问',exact:true}).click();
   await page.getByText('授权已取消或被拒绝。未读取本站 Cookie，可重新尝试。').waitFor();
   assert.equal(await page.locator('.permission-state').count(),1);
   await page.getByRole('button',{name:'允许访问',exact:true}).click();
   await page.locator('.cookie-row').first().waitFor();
   assert.equal(await page.locator('.permission-state').count(),0);
   assert.equal(await page.locator('.site-status').count(),0,'no permanent authorized badge');
   assert.equal(await page.locator('.cookie-row').count(),8);
   await page.getByText('已允许访问本站 Cookie').waitFor();
   await page.getByText('已允许访问本站 Cookie').waitFor({state:'hidden',timeout:7000});
   assert.equal(await page.locator('.site-permissions').count(),0,'no daily revoke menu');
   await page.locator('[data-testid="scenario"]').selectOption('first');
   await page.getByRole('button',{name:'允许访问',exact:true}).waitFor();
   assert.equal(await page.locator('.cookie-row').count(),0);
   await page.locator('[data-testid="failure"]').selectOption('grantError');
   await page.getByRole('button',{name:'允许访问',exact:true}).click();
   await page.getByText('授权请求未完成，请检查权限后重试。').waitFor();
   assert.equal(await page.locator('.permission-state').count(),1);
   await page.getByRole('button',{name:'允许访问',exact:true}).click();
   await page.locator('.cookie-row').first().waitFor();
   assert.equal(await page.locator('.permission-state').count(),0);
   await page.locator('[data-testid="scenario"]').selectOption('ready');
   assert.equal(await page.locator('.permission-state').count(),0,'already authorized session should have no authorization card');
 });
 await test('loading is not an authorization prompt and empty authorized site stays empty',async()=>{
   await page.locator('[data-testid="scenario"]').selectOption('loading');
   await page.getByText('正在读取本站 Cookie…').waitFor();
   assert.equal(await page.getByRole('button',{name:'允许访问',exact:true}).count(),0);
   await page.locator('[data-testid="scenario"]').selectOption('empty');
   assert.equal(await page.locator('.permission-state').count(),0);
   await page.getByText('本站暂无 Cookie').waitFor();
 });
 assert.deepEqual(errors,[],`Runtime errors: ${errors.join('; ')}`);
 console.log(JSON.stringify({result:'PASS',react:'19.2.0',passed:pass.length,pass,errors},null,2));
}finally{await browser.close();}
