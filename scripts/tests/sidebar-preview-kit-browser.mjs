// Evidence: STATIC_PREVIEW_CHROME. No extension, Native, real AI or installation.
import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export async function verifyPreview(page, {repo = ROOT, artifact, out} = {}) {
  const dir = join(out,'browser-' + Date.now());
  await fs.mkdir(dir,{recursive:true});
  const digest = data => crypto.createHash('sha256').update(data).digest('hex');
  const manifest = JSON.parse(await fs.readFile(artifact + '/manifest.json','utf8'));
  const evidence = {grade:'STATIC_PREVIEW_CHROME', nativeChrome:'NOT_TESTED', realAI:'NOT_TESTED', browser:page.context().browser().version(), platform:process.platform, sourceHash:manifest.sourceHash, htmlHash:digest(await fs.readFile(artifact + '/preview.html')), checks:[], styles:[], network:[], errors:[]};
  for (const [path, expected] of Object.entries(manifest.inputs)) {
    if (digest(await fs.readFile(repo + '/' + path)) !== expected) throw Error('Artifact input drift: ' + path);
  }
  evidence.observerHash = digest(await fs.readFile(repo + '/scripts/tests/sidebar-preview-kit-browser.mjs'));
  const assert = (ok, name, detail) => { if (!ok) throw Error(name + ': ' + JSON.stringify(detail)); evidence.checks.push(name); };
  const wait = () => page.waitForFunction(() => document.readyState === 'complete');
  const status = () => page.locator('#app-status').innerText();
  const focused = () => page.evaluate(() => document.activeElement.id);
  const type = async (locator, text) => { await locator.click(); await locator.press('ControlOrMeta+A'); await locator.press('Backspace'); await locator.pressSequentially(text); };
  const state = index => page.locator('#preview-state [data-state]').nth(index).click();
  const visibleFocus = () => page.evaluate(() => {
    const el = document.activeElement, r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight && el.matches(':focus-visible');
  });
  let reference;
  page.on('pageerror', error => evidence.errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') evidence.errors.push(msg.text()); });
  page.on('request', req => { if (/^https?:/.test(req.url())) evidence.network.push(req.url()); });
  try {
    await page.goto('file://' + artifact + '/preview.html'); await wait();
    assert(await page.locator('#item-list>div').count() === 2,'initial list');
    assert(await page.locator('h1').count() === 1,'single main heading');
    await page.locator('#create-item').click();
    assert(await focused() === 'item-title','create focuses input');
    await page.locator('#item-title').press('Enter');
    assert(await page.locator('#item-error').isVisible(),'empty submit shows error');
    assert(await page.locator('#item-title').getAttribute('aria-invalid') === 'true','field error association');
    await page.locator('#item-title').press('Tab'); assert(await focused() === 'save-item','Tab reaches save');
    await page.keyboard.press('Shift+Tab'); assert(await focused() === 'item-title','Shift+Tab returns input');
    await type(page.locator('#item-title'),'原生键盘新建'); await page.locator('#item-title').press('Enter');
    assert(await page.locator('#item-list>div').count() === 3,'save creates one item');
    assert(await focused() === 'create-item','save restores origin focus');
    await page.locator('#edit-3').click(); await type(page.locator('#item-title'),'取消不提交'); await page.locator('#cancel-form').click();
    assert((await page.locator('#item-list').innerText()).includes('原生键盘新建') && !(await page.locator('#item-list').innerText()).includes('取消不提交'),'cancel preserves data');
    assert(await focused() === 'edit-3','cancel restores row focus');
    await page.locator('#edit-3').click(); await type(page.locator('#item-title'),'已编辑'); await page.locator('#save-item').click();
    assert((await page.locator('#item-list').innerText()).includes('已编辑'),'edit saves existing item');
    await page.locator('#edit-3').click(); await page.keyboard.press('Escape');
    assert(await page.locator('#list-view').isVisible() && await focused() === 'edit-3','Escape cancels form');
    await page.locator('#remove-3').click(); assert(await focused() === 'cancel-delete','confirm starts on safe action');
    await page.locator('#cancel-delete').click();
    assert(await page.locator('#item-list>div').count() === 3 && await focused() === 'remove-3','delete cancel preserves item and focus');
    await page.locator('#remove-3').click(); await page.keyboard.press('Escape');
    assert(await page.locator('#item-list>div').count() === 3 && await focused() === 'remove-3','Escape cancels confirmation');
    await page.locator('#remove-3').click(); await page.locator('#confirm-delete').click();
    assert(await page.locator('#item-list>div').count() === 2 && await focused() === 'create-item','confirmed delete and fallback focus');
    await state(1); assert(await page.locator('#item-list>div').count() === 0 && !await page.locator('#create-item').isDisabled(),'empty state is actionable');
    for (const [index, label] of [[2,'failure'],[3,'revoked'],[4,'busy']]) {
      await state(index);
      assert(await page.locator('#create-item').isDisabled() && await page.locator('#reset-items').isDisabled() && await page.locator('#item-list>div').count() === 0,label + ' blocks mutations');
      assert((await status()).length > 0,label + ' has status text');
    }
    await state(5); assert(await page.locator('#item-list>div').count() === 24,'long state has scrollable content');
    await page.locator('#edit-24').scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => scrollY);
    await page.locator('#edit-24').click(); await page.locator('#cancel-form').click();
    assert(await focused() === 'edit-24','long form return focuses origin');
    assert(Math.abs(await page.evaluate(() => scrollY) - scrollBefore) < 2,'long form restores scroll');
    const rectVisible = await page.locator('#edit-24').evaluate(el => { const r=el.getBoundingClientRect(); return r.top>=0&&r.bottom<=innerHeight; });
    assert(rectVisible,'restored focus is visible');
    await state(0);
    await page.locator('#reset-items').click(); assert(await page.locator('#item-list>div').count() === 2,'reset uses local data');
    const canonical = await fs.readFile(repo+'/src/ui/design-tokens.css','utf8') + '\n' + await fs.readFile(repo+'/src/ui/design-system.css','utf8');
    reference = await page.context().newPage();
    await reference.setContent('<!doctype html><html><head><style>'+canonical+'</style></head><body><main><h1 id="ref-title" class="od-page-title">Canonical 参考</h1><input id="ref-before" class="od-field" aria-label="参考输入"><button type="button" id="ref-main" class="od-button">新建</button><button type="button" id="ref-secondary" class="od-button od-button--secondary">编辑</button><button type="button" id="ref-danger" class="od-button od-button--danger">删除</button><button type="button" id="ref-disabled" class="od-button" disabled>新建</button><button type="button" id="ref-icon" class="od-icon-button" aria-label="重置模拟数据">↻</button><div class="od-stack"><div id="ref-surface" class="od-surface od-surface--padded">示例</div></div><details class="od-disclosure od-disclosure--flat"><summary id="ref-summary">说明</summary></details></main></body></html>');
    const props=['color','backgroundColor','borderTopColor','borderTopWidth','borderRadius','fontFamily','fontSize','fontWeight','lineHeight','paddingTop','paddingRight','minHeight','opacity','filter','outlineColor','outlineWidth','outlineOffset'];
    const style = (p, selector) => p.locator(selector).first().evaluate((el, keys) => { const s=getComputedStyle(el); return Object.fromEntries(keys.map(key=>[key,s[key]])); },props);
    async function compare(label,a,b) {
      const actual=await style(page,a), expected=await style(reference,b);
      evidence.styles.push({label,actual,expected}); assert(JSON.stringify(actual)===JSON.stringify(expected),'canonical style '+label,{actual,expected});
    }
    for (const theme of ['light','dark']) {
      await page.emulateMedia({colorScheme:theme}); await reference.emulateMedia({colorScheme:theme});
      await page.locator('h1').click(); await reference.locator('#ref-title').click();
      await page.mouse.move(0,0); await reference.mouse.move(0,0);
      for (const [label,a,b] of [['primary','#create-item','#ref-main'],['secondary','#edit-1','#ref-secondary'],['danger','#remove-1','#ref-danger'],['icon','#reset-items','#ref-icon'],['field','#item-title','#ref-before'],['surface','#item-list>div','#ref-surface'],['disclosure','summary','#ref-summary']]) await compare(theme+' '+label,a,b);
      await page.locator('#create-item').hover(); await reference.locator('#ref-main').hover(); await compare(theme+' hover','#create-item','#ref-main');
      await page.locator('#reset-items').press('Tab'); await reference.locator('#ref-before').press('Tab');
      assert(await focused()==='create-item' && await visibleFocus(),theme+' keyboard visible focus');
      await compare(theme+' focus','#create-item','#ref-main');
      await page.screenshot({path:dir+'/'+theme+'.png',fullPage:true});
      await state(4); await page.mouse.move(0,0); await compare(theme+' disabled','#create-item','#ref-disabled'); await state(0);
    }
    assert(await page.locator('aside').isVisible(),'runtime preview declaration preserved');
    assert(await page.locator('style').count()===3,'runtime style block count preserved');
    evidence.runtimeInlineStyles = await page.locator('[style]').evaluateAll(els => els.map(el => ({tag:el.tagName,id:el.id,value:el.getAttribute('style')})));
    // Screenshot instrumentation can leave style=""; no declaration means no visual override.
    assert(evidence.runtimeInlineStyles.every(item => !item.value.trim()),'runtime no inline style declaration',evidence.runtimeInlineStyles);
    assert(await page.locator('script').count()===1,'runtime single behavior script');
    assert(evidence.network.length===0,'no HTTP network requests',evidence.network);
    assert(evidence.errors.length===0,'no console or page errors',evidence.errors);
    for (const [path, expected] of Object.entries(manifest.inputs)) assert(digest(await fs.readFile(repo+'/'+path))===expected,'stable input '+path);
    assert(digest(await fs.readFile(artifact+'/preview.html'))===evidence.htmlHash,'stable tested HTML');
    evidence.result='PASS';
  } catch(error) {
    evidence.result='FAIL'; evidence.failure=error.stack;
    await page.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});
    throw error;
  } finally {
    await reference?.close(); await page.emulateMedia({colorScheme:null});
    await fs.writeFile(dir+'/report.json',JSON.stringify(evidence,null,2)+'\n');
  }
  return {dir,result:evidence.result,checks:evidence.checks.length,styleComparisons:evidence.styles.length,browser:evidence.browser,htmlHash:evidence.htmlHash};
}

async function cli() {
  if (!process.argv[2] || !process.argv[3]) throw Error('用法：node scripts/tests/sidebar-preview-kit-browser.mjs <套件目录> <独立证据目录>；使用现有 Playwright，必要时 OPENDESK_PLAYWRIGHT_MODULE 指向其 index.mjs');
  const {chromium} = await import(process.env.OPENDESK_PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({headless:true, executablePath:process.env.OPENDESK_PREVIEW_CHROME_BIN});
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    console.log(JSON.stringify(await verifyPreview(page,{artifact:resolve(process.argv[2]),out:resolve(process.argv[3])}),null,2));
  } finally { await browser.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) cli().catch(error => { console.error(error.stack); process.exitCode=1; });
