// Real Chromium + the existing offline React preview and simulated SDK only.
// Usage: node unified-rules-interactions.mjs <preview-url> <output-directory>
// Does not build, serve, install an extension, or contact a capture website.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';

const [url, output] = process.argv.slice(2);
if (!url || !output || process.argv.length !== 4) {
  throw Error('Usage: node unified-rules-interactions.mjs <preview-url> <output-directory>');
}
const out = resolve(output);
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
await mkdir(out, {recursive: true});
const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page = await browser.newPage({viewport: {width: 1200, height: 1120}, reducedMotion: 'reduce', acceptDownloads: true});
page.setDefaultTimeout(10000);
const report = {url, kind: 'REAL_CHROMIUM_OFFLINE_REACT_SIMULATED_SDK', status: 'RUNNING', checks: [], errors: [], nativeInstallation: 'NOT_TESTED'};
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });

// Reuse the memory SDK, intercepting only returned record data. No React state
// injection: visibility, ordering, edits, downloads and switching use real UI.
function installFixture() {
  if (globalThis.__unifiedRulesHook) return;
  globalThis.__unifiedRulesHook = true;
  const define = Object.defineProperty;
  Object.defineProperty = function(target, key, descriptor) {
    if (target === globalThis && key === 'OpenDeskTool' && descriptor.value?.request) {
      const tool = descriptor.value;
      const fixture = {rows: [{title: 'TITLE_A', source: 'SOURCE_A'}, {title: 'TITLE_B', source: 'SOURCE_B'}], calls: [], target: null};
      globalThis.__unifiedRulesFixture = fixture;
      descriptor = {...descriptor, value: Object.freeze({...tool, request: async(operation, payload) => {
        fixture.calls.push({operation, payload: structuredClone(payload)});
        const reply = await tool.request(operation, payload);
        if (operation === 'currentPage.info' && fixture.target) return {...reply, url: fixture.target};
        if (operation === 'tasks.read' && reply.value?.data) {
          reply.value.data = structuredClone(fixture.rows);
          reply.result = reply.value;
        }
        return reply;
      }})};
    }
    return define(target, key, descriptor);
  };
}
await page.addInitScript(source => {
  const code = '(' + source + ')();';
  // The existing preview bootstraps an opaque srcdoc iframe. Inject before its
  // own SDK definition; do not rewrite preview files or relax the sandbox.
  const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
  Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {...descriptor, set(value) {
    descriptor.set.call(this, value.replace('<head>', '<head><script>' + code + '</scr' + 'ipt>'));
  }});
  (0, eval)(code);
}, installFixture.toString());

const f = page.frameLocator('#opendesk-preview-frame');
const get = id => f.locator('#' + id);
const button = name => f.getByRole('button', {name, exact: true, includeHidden:true});
const handle = key => button('调整列顺序：' + key);
const eye = key => button('显示列 ' + key);
const nameInput = key => f.getByRole('textbox', {name: key + ' 显示名称', exact: true});
const keys = () => get('field-list').locator('.rule-entry[data-field-key]').evaluateAll(elements => elements.map(el => el.dataset.fieldKey));
const headers = () => get('record-table').locator('thead th').allTextContents();
const cells = () => get('record-table').locator('tbody tr').first().locator('td').allTextContents();
const clean = async() => assert.equal(await get('profile-current').getAttribute('data-dirty'), 'false');
const config = async() => { await get('tab-json').click(); const value = JSON.parse(await get('config-json').inputValue()); await get('tab-rules').click(); await fieldsOpen(); return value; };
const fixture = rows => get('tool-root').evaluate((_, rows) => { globalThis.__unifiedRulesFixture.rows = rows; }, rows);
const check = async(label, action) => {
  await action();
  report.checks.push({label, status: 'PASS'});
  console.log('PASS ' + report.checks.length + ': ' + label);
};
const namesToggle = () => f.getByRole('switch', {name:'显示名称',exact:true});
const namesOpen = async() => {if(!await namesToggle().isChecked())await get('field-editor').locator('.rule-display-toggle label').click();};
const fieldsOpen = async() => {if(await namesToggle().isChecked())await get('field-editor').locator('.rule-display-toggle label').click();};
const displayOptions = async() => { if(await get('column-view-settings').getAttribute('open')===null)await get('column-view-settings').locator('summary').click(); };
const order = async(key, movement, commit = 'Enter') => {
  await fieldsOpen();
  await handle(key).press('Space');
  for (const move of movement) await handle(key).press(move);
  await handle(key).press(commit);
};
const run = async() => {
  const target=(await config()).url;
  await get('tool-root').evaluate((_,url)=>{globalThis.__unifiedRulesFixture.target=url;},target);
  await get('tab-results').click();
  await get('refresh-target').click();
  await get('start').waitFor({state: 'visible'});
  await get('start').click();
  await get('run-summary').filter({hasText: '采集完成'}).waitFor();
  // Waiting for enabled also proves the old simulated run has retired.
  await get('start').evaluate(el => new Promise((resolve, reject) => {
    const end = Date.now() + 10000;
    const tick = () => !el.disabled && el.getAttribute('aria-disabled') !== 'true' ? resolve() : Date.now() > end ? reject(Error('run did not retire')) : setTimeout(tick, 40);
    tick();
  }));
};
const download = async id => {
  const waiting = page.waitForEvent('download');
  await get(id).click();
  const item = await waiting;
  assert.equal(await item.failure(), null);
  return readFile(await item.path(), 'utf8');
};
const pointerStart = async(fromKey, toKey) => {
  await fieldsOpen();
  await handle(fromKey).scrollIntoViewIfNeeded();
  const from = await handle(fromKey).boundingBox();
  const to = await handle(toKey).boundingBox();
  assert.ok(from && to, 'drag handles have real hit targets');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {steps: 12});
};

try {
  await page.goto(url);
  await f.locator('#profile-list option[value="demo"]').waitFor({state: 'attached'});
  await get('tab-rules').click();
  const original = await config();
  await check('01 unified editor is available before capture, with no legacy column panel', async() => {
    assert.ok(await get('field-editor').isVisible());
    assert.deepEqual(await keys(), ['title']);
    assert.equal(await get('result-columns').count(), 0);
    assert.equal(await eye('title').getAttribute('aria-pressed'), 'true');
    assert.ok(await get('tool-root').evaluate(() => !!globalThis.__unifiedRulesFixture));
  });
  await check('02 pre-capture eye hides the rule without dirtying configuration', async() => {
    await eye('title').click();
    assert.equal(await eye('title').getAttribute('aria-pressed'), 'false'); await clean();
  });
  await check('03 pre-capture display-name settings expose named inputs and keep config intact', async() => {
    assert.equal(await namesToggle().isChecked(),false);
    await namesOpen(); await nameInput('title').fill('标题'); await nameInput('title').press('Enter');
    assert.deepEqual(await config(), original); await clean();
  });
  await check('04 tab roundtrip preserves pre-capture visibility and name', async() => {
    await get('tab-results').click(); await get('tab-rules').click(); await namesOpen();
    assert.equal(await nameInput('title').inputValue(), '标题');
    assert.equal(await eye('title').getAttribute('aria-pressed'), 'false');
  });
  await check('05 first result honors pre-capture hiding and adds source without restoring title', async() => {
    await run(); await get('tab-results').click();
    assert.equal((await headers()).length, 2); assert.ok((await headers())[1].startsWith('source'));
    assert.equal((await cells())[1], 'SOURCE_A');
  });
  await check('06 result settings return to rules and focus a field handle', async() => {
    await button('设置显示列').click();
    assert.equal(await get('tab-rules').getAttribute('aria-selected'), 'true');
    assert.ok(await get('field-list').evaluate(el => el.contains(document.activeElement) && document.activeElement.getAttribute('aria-label')?.startsWith('调整列顺序：')));
  });
  await check('07 source is an appended read-only column, never an extraction rule', async() => {
    assert.deepEqual(await keys(), ['title', 'source']);
    const row = get('field-list').locator('[data-field-key="source"]');
    assert.ok(await row.isVisible());
    assert.equal(await row.getByRole('button', {name: '删除字段 source', exact: true}).count(), 0);
    assert.equal(await row.getByRole('textbox', {name: '采集规则 source', exact: true}).count(), 0);
    assert.deepEqual(await config(), original);
  });
  await check('08 re-enabling title aligns renamed heading and record value', async() => {
    await eye('title').click(); await get('tab-results').click();
    assert.ok((await headers())[1].startsWith('标题')); assert.deepEqual((await cells()).slice(1), ['TITLE_A', 'SOURCE_A']);
    await get('tab-rules').click();
  });
  await check('09 keyboard pick and End are tentative until committed', async() => {
    await handle('title').press('Space'); await handle('title').press('End');
    await get('tab-results').click(); assert.ok((await headers())[1].startsWith('标题')); await get('tab-rules').click();
    await handle('title').press('Escape'); assert.deepEqual(await keys(), ['title', 'source']);
  });
  await check('10 Space End Enter commits order and restores handle focus', async() => {
    await order('title', ['End']); assert.deepEqual(await keys(), ['source', 'title']);
    assert.ok(await handle('title').evaluate(el => el === document.activeElement));
  });
  await check('11 reordered result headings and cells stay aligned', async() => {
    await get('tab-results').click(); assert.ok((await headers())[1].startsWith('source'));
    assert.deepEqual((await cells()).slice(1), ['SOURCE_A', 'TITLE_A']); await get('tab-rules').click();
  });
  await check('12 Home places the last field first', async() => { await order('title', ['Home']); assert.deepEqual(await keys(), ['title', 'source']); });
  await check('13 ArrowDown commits a one-step move', async() => { await order('title', ['ArrowDown']); assert.deepEqual(await keys(), ['source', 'title']); });
  await check('14 ArrowUp commits a one-step move', async() => { await order('title', ['ArrowUp']); assert.deepEqual(await keys(), ['title', 'source']); });
  await check('15 Escape cancels tentative keyboard order', async() => { await order('title', ['End'], 'Escape'); assert.deepEqual(await keys(), ['title', 'source']); });
  await check('16 appended source can be renamed and hidden without changing config', async() => {
    await namesOpen(); await nameInput('source').fill('来源'); await nameInput('source').press('Enter'); await fieldsOpen(); await eye('source').click();
    await get('tab-results').click(); assert.equal((await headers()).length, 2); assert.deepEqual((await cells()).slice(1), ['TITLE_A']);
    await get('tab-rules').click(); assert.deepEqual(await config(), original); await clean();
  });
  await check('17 JSON download retains all records, original names and hidden source', async() => {
    await get('tab-results').click(); const value = JSON.parse(await download('download-json'));
    assert.deepEqual(value.result.data, [{title: 'TITLE_A', source: 'SOURCE_A'}, {title: 'TITLE_B', source: 'SOURCE_B'}]);
  });
  await check('18 CSV download retains complete original headers and values', async() => {
    const csv = (await download('download-csv')).replace(/^\uFEFF/, '');
    assert.equal(csv, '"title","source"\r\n"TITLE_A","SOURCE_A"\r\n"TITLE_B","SOURCE_B"');
  });
  await check('19 all-hidden table has only record actions and downloads remain available', async() => {
    await get('tab-rules').click(); await eye('title').click(); await get('tab-results').click();
    assert.equal((await headers()).length, 1); assert.equal((await cells()).length, 1);
    assert.ok(await get('download-json').isEnabled()); assert.ok(await get('download-csv').isEnabled());
  });
  await check('20 restore default recovers all columns, original labels and order', async() => {
    await get('tab-rules').click(); await displayOptions(); await get('reset-columns').click(); await namesOpen();
    assert.deepEqual(await keys(), ['title', 'source']); assert.equal(await nameInput('title').inputValue(), 'title');
    assert.equal(await nameInput('source').inputValue(), 'source');
    for (const key of ['title', 'source']) assert.equal(await eye(key).getAttribute('aria-pressed'), 'true');
    await clean();
  });
  await check('21 mouse pointer drop commits a real reorder', async() => {
    await pointerStart('source', 'title'); await page.mouse.up(); assert.deepEqual(await keys(), ['source', 'title']);
  });
  await check('22 Escape during pointer drag cancels placement', async() => {
    const before = await keys(); await pointerStart('title', 'source'); await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(await keys(), before);
  });
  await check('23 pointer release outside iframe clears drag and leaves controls usable', async() => {
    await pointerStart('title', 'source'); await page.mouse.move(1190, 10, {steps: 12}); await page.mouse.up();
    // Outside release may drop the last target or cancel; neither may strand a
    // live drag. A subsequent explicit default + keyboard move must be final.
    await get('reset-columns').click(); await order('title', ['End']);
    assert.deepEqual(await keys(), ['source', 'title']); await eye('title').click();
    assert.equal(await eye('title').getAttribute('aria-pressed'), 'false');
  });
  await check('24 rerun preserves presentation settings in the same profile epoch', async() => {
    await namesOpen(); await nameInput('source').fill('来源'); await nameInput('source').press('Enter');
    await run(); await get('tab-results').click(); assert.equal((await headers()).length, 2);
    assert.ok((await headers())[1].startsWith('来源')); assert.equal((await cells())[1], 'SOURCE_A');
    await get('tab-rules').click(); await clean();
  });
  await check('25 pending rule edit disables every eye and handle and leaves JSON unapplied', async() => {
    await f.getByRole('textbox', {name: '采集规则 title', exact: true}).fill('h2::text');
    for (const key of ['title', 'source']) { assert.ok(await eye(key).isDisabled()); assert.ok(await handle(key).isDisabled()); }
    assert.ok(await get('apply-field').isVisible()); assert.ok(await get('cancel-field').isEnabled());
    assert.deepEqual(await config(), original);
  });
  await check('26 cancelling pending rule restores controls and view preferences', async() => {
    await get('cancel-field').click(); assert.ok(await eye('title').isEnabled()); assert.ok(await handle('source').isEnabled());
    assert.equal(await eye('title').getAttribute('aria-pressed'), 'false'); await clean();
  });
  await check('27 adding a rule adds exactly one unified column', async() => {
    await get('new-field').click(); await get('field-key').fill('price'); await get('field-rule').fill('.price::text'); await get('apply-field').click();
    assert.equal((await keys()).filter(key => key === 'price').length, 1); assert.equal(await eye('price').getAttribute('aria-pressed'), 'true');
    assert.equal((await config()).itemConfig.price, '.price::text');
  });
  await check('28 renaming an uncollected rule removes its old column without a ghost', async() => {
    await f.getByRole('textbox', {name: '字段名 price', exact: true}).fill('cost'); await get('apply-field').click();
    assert.equal((await keys()).includes('price'), false); assert.equal((await keys()).filter(key => key === 'cost').length, 1);
    assert.equal(await eye('price').count(), 0); assert.equal((await config()).itemConfig.cost, '.price::text');
  });
  await check('29 deleting the renamed rule removes its controls and display-name input', async() => {
    await button('删除字段 cost').click(); await button('确认删除字段').click();
    assert.equal((await keys()).includes('cost'), false); assert.equal(await eye('cost').count(), 0);
    await namesOpen(); assert.equal(await nameInput('cost').count(), 0); assert.equal(Object.hasOwn((await config()).itemConfig, 'cost'), false);
  });
  await check('30 profile switch resets order, names and visibility and removes stale source', async() => {
    // Save actual rule edits before switching; presentation alone never needed saving.
    await get('save-config').click(); await get('profile-current[data-dirty="false"]').waitFor();
    await get('profile-list').selectOption('douban');
    await f.getByRole('textbox', {name: '采集规则 rating', exact: true}).waitFor();
    assert.deepEqual(await keys(), ['title', 'rating']); await namesOpen();
    assert.equal(await nameInput('title').inputValue(), 'title'); assert.equal(await eye('title').getAttribute('aria-pressed'), 'true');
    assert.equal(await eye('source').count(), 0); await clean();
  });
  await check('31 switched profile result aligns new rule and appended columns', async() => {
    await fixture([{title: 'BOOK_A', rating: '9.5', source: 'NEW_SOURCE'}]); await run(); await get('tab-results').click();
    assert.deepEqual((await cells()).slice(1), ['BOOK_A', '9.5', 'NEW_SOURCE']);
    const h = await headers(); assert.ok(h[1].startsWith('title') && h[2].startsWith('rating') && h[3].startsWith('source'));
  });
  await check('32 returning to original profile resets rather than reviving old view preferences', async() => {
    await get('tab-rules').click(); await get('profile-list').selectOption('demo');
    await f.getByRole('textbox', {name: '采集规则 title', exact: true}).waitFor();
    assert.deepEqual(await keys(), ['title']); await namesOpen();
    assert.equal(await eye('title').getAttribute('aria-pressed'), 'true'); assert.equal(await nameInput('title').inputValue(), 'title');
    assert.deepEqual(await config(), original); await clean();
  });
  await check('33 sandbox boundary remains opaque and browser reports no runtime errors', async() => {
    assert.equal(await page.locator('#opendesk-preview-frame').getAttribute('sandbox'), 'allow-scripts allow-downloads');
    assert.deepEqual(report.errors, []);
  });
  await check('34 pre-capture keyboard order and hiding apply to the first multi-rule result', async() => {
    await page.goto(url);
    await f.locator('#profile-list option[value="douban"]').waitFor({state: 'attached'});
    await get('profile-list').selectOption('douban'); await get('tab-rules').click();
    await f.getByRole('textbox', {name: '采集规则 rating', exact: true}).waitFor();
    const before = await config();
    await order('rating', ['Home']); assert.deepEqual(await keys(), ['rating', 'title']);
    await eye('title').click(); await namesOpen();
    await nameInput('rating').fill('评分'); await nameInput('rating').press('Enter');
    await get('tab-results').click(); await get('tab-rules').click();
    assert.deepEqual(await keys(), ['rating', 'title']);
    assert.deepEqual(await config(), before); await clean();
    await fixture([{title: 'HIDDEN_BOOK', rating: '8.7', source: 'FIRST_SOURCE'}]);
    await run(); await get('tab-results').click();
    const h = await headers();
    assert.equal(h.length, 3); assert.ok(h[1].startsWith('评分') && h[2].startsWith('source'));
    assert.deepEqual((await cells()).slice(1), ['8.7', 'FIRST_SOURCE']);
    assert.deepEqual(report.errors, []);
  });
  await check('35 HTTP rule view keeps display controls without inventing CSS rules', async() => {
    await page.goto(url); await f.locator('#profile-list option[value="demo"]').waitFor({state:'attached'});
    await get('tab-json').click();
    const configValue=JSON.parse(await get('config-json').inputValue());
    await get('config-json').fill(JSON.stringify({...configValue,url:'http://127.0.0.1:43121/http-echo',executionMode:'http-local',maxPages:1,http:{headers:{}},itemConfig:{title:'payload.title'}}));
    await get('tab-rules').click(); assert.ok(await get('http-fields').isVisible());
    assert.ok(await eye('title').isVisible()); assert.ok(await handle('title').isVisible());
    assert.equal(await f.getByRole('textbox',{name:'采集规则 title',exact:true}).count(),0);
    assert.equal(await get('new-field').isVisible(),false);
    await eye('title').click();assert.equal(await eye('title').getAttribute('aria-pressed'),'false');
    assert.deepEqual((await config()).itemConfig,{title:'payload.title'});
  });
  await check('36 one switch replaces each selector slot with its header alias', async() => {
    await namesToggle().press('Space');assert.equal(await namesToggle().isChecked(),true);
    assert.equal(await get('field-list').isVisible(),true);assert.equal(await nameInput('title').isVisible(),true);
    assert.equal(await get('field-list').locator('.rule-row input').count(),1);
    assert.equal(await get('tab-column-names').count(),0);
    assert.equal(await get('field-editor').getByText(/个采集字段|拖动排序 · 眼睛控制显示/).count(),0);
    await nameInput('title').fill('标题');await nameInput('title').press('Enter');
    await namesToggle().press('Space');assert.equal(await namesToggle().isChecked(),false);
    assert.equal(await nameInput('title').count(),0);assert.deepEqual((await config()).itemConfig,{title:'payload.title'});
  });
  await check('37 restoring names preserves visibility and order', async() => {
    await page.goto(url);await f.locator('#profile-list option[value="demo"]').waitFor({state:'attached'});await run();await get('tab-rules').click();
    await order('source',['Home']);await eye('title').click();await namesOpen();await nameInput('source').fill('来源');await nameInput('source').press('Enter');
    await displayOptions();await get('reset-column-names').click();assert.equal(await nameInput('source').inputValue(),'source');
    await fieldsOpen();assert.deepEqual(await keys(),['source','title']);assert.equal(await eye('title').getAttribute('aria-pressed'),'false');await clean();
  });
  await check('38 returning after an unreported opaque-iframe release cancels drag', async() => {
    const before=await keys();await pointerStart('title','source');await page.mouse.move(1190,10,{steps:1});await page.mouse.up();
    // CDP can omit every child-document exit/up event on a single-step jump
    // across the opaque iframe. Returning with no buttons must recover safely.
    const target=await handle('title').boundingBox();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:1});
    assert.equal(await handle('title').getAttribute('aria-pressed'),'false');assert.equal(await eye('title').isEnabled(),true);assert.deepEqual(await keys(),before);
  });
  await check('39 consecutive unsaved new profiles reset display preferences', async() => {
    await get('new-profile').click();await get('tab-rules').click();await fieldsOpen();await eye('title').click();assert.equal(await eye('title').getAttribute('aria-pressed'),'false');
    await get('new-profile').click();await get('profile-confirm-accept').click();
    await get('field-list').locator('[aria-label="显示列 title"][aria-pressed="true"]').waitFor();
    assert.deepEqual(await keys(),['title']);assert.equal(await eye('title').getAttribute('aria-pressed'),'true');
  });
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1;
  try { await page.screenshot({path: join(out, 'failure.png'), fullPage: true}); } catch (captureError) { report.screenshotError = captureError.message; }
} finally {
  report.previewSha256=createHash('sha256').update(url.startsWith('file:')?await readFile(new URL(url)):Buffer.from(await(await fetch(url)).arrayBuffer())).digest('hex');
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
