// From the repo root, with the offline preview already open in the caller's p1:
// { printf '\nconst SPACE_ID=%s;\n' "$BAIDU_EGO_SPACE"; cat prototypes/sidebar/my/baidu-run-ui.ego.mjs; } | ego-browser nodejs
// This drives the preview's memory-only demo state. The caller owns the tab and TaskSpace.
const assert = (await import('node:assert/strict')).default;
const fs = await import('node:fs/promises');
const path = await import('node:path');
const { createHash } = await import('node:crypto');
const ROOT = '/Users/shopme/Documents/workspace/opendesk-browser';
const source = path.join(ROOT, 'prototypes/sidebar/my/index.html');
const outRoot = path.join(ROOT, 'artifacts/baidu-run-ui-ego');
await fs.mkdir(outRoot, { recursive: true });
const out = await fs.mkdtemp(path.join(outRoot, 'run-'));
const reportPath = path.join(out, 'assertions.json');
const report = {
  startedAt: new Date().toISOString(), status: 'RUNNING', spaceId: SPACE_ID, page: 'p1',
  boundary: 'Offline preview; real browser inputs except explicitly synthetic composition events. No real Baidu, extension side panel, OS IME, browser zoom, or independent reviewer score.',
  layout: { standard: '360 × 820 CSS px; one representative sidebar viewport' },
  checks: [], scenarioErrors: [], screenshots: [], snapshots: [], nativeAx: {},
};
const sha = data => createHash('sha256').update(data).digest('hex');
const save = () => fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
const errorText = error => String(error.stack ?? error);
const ownershipStop = error => /takeover|user control|hard stop|permission denied|access denied/i.test(String(error));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const BAIDU = 'baidu-preview';
const DIALOG = '#params-dialog';
const QUERY = '#param-query';
const TARGET = '#param-target';
const DRAWER = '#baidu-destination';
const DRAWER_TOGGLE = '#baidu-summary-toggle';
const URL_FIELD = '#param-startUrl';
const FRONT = '#param-showExecutionTab';
const JSON_FIELD = '#params-json';
const RUN = '#params-run';
const CANCEL = '#params-cancel';
const CLOSE = '#params-close';
const HOME = 'https://www.baidu.com/';
const SAME = '周末徒步';
const DIFFERENT = '上海周末徒步路线';
const START = HOME + 's?wd=' + encodeURIComponent(SAME);
const HOME_PREVIEW = /(?:新(?:开|建)?.*标签页.*(?:首页|www\.baidu\.com)|(?:首页|www\.baidu\.com).*新(?:开|建)?.*标签页)/;
const HOME_RECEIPT = /新(?:开|建)?.*标签页.*(?:首页|https:\/\/www\.baidu\.com\/(?:\s|$))|首页.*新(?:开|建)?.*标签页/;
const row = id => '[data-select="' + id + '"]';
const prepare = id => '[data-prepare="' + id + '"]';
let page, scene, metricsTouched = false;

async function element(selector) {
  return page.evaluate(sel => {
    const node = document.querySelector(sel);
    if (!node) return { exists: false, visible: false };
    const style = getComputedStyle(node);
    const collapsed = node.closest('details:not([open])');
    return {
      exists: true, visible: !!node.getClientRects().length && style.visibility === 'visible' &&
        !node.closest('[hidden]') && (!collapsed || node === collapsed || collapsed.querySelector(':scope > summary')?.contains(node) === true),
      tag: node.localName, text: node.textContent.trim(), value: node.value, checked: node.checked,
      disabled: node.matches(':disabled') || node.getAttribute('aria-disabled') === 'true',
      open: node.open, invalid: node.getAttribute('aria-invalid'), focused: document.activeElement === node,
    };
  }, selector);
}
const click = selector => page.click(selector);
const key = value => page.keyboard.press(value);
const fill = (selector, value) => page.fill(selector, value);
const text = async selector => (await element(selector)).text ?? '';
const targetText = async () => (await text('#baidu-target')) + ' · ' + (await text('#baidu-target-brief'));
const active = () => page.evaluate(() => {
  const node = document.activeElement;
  return node?.id ? '#' + node.id : node?.outerHTML.split('>')[0] + '>';
});
const history = async () => Number((await text('#history-count')).match(/\d+/)?.[0] ?? 0);
const running = async () => (await element('#run-dock')).visible;
const settlePaint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function until(label, probe, timeout = 5000) {
  const deadline = Date.now() + timeout;
  do {
    const result = await probe();
    if (result) return result;
    await delay(60);
  } while (Date.now() < deadline);
  throw new Error('Timed out waiting for ' + label);
}
const opened = () => until('open parameter sheet', async () => (await element(DIALOG)).open);
const closed = () => until('closed parameter sheet', async () => !(await element(DIALOG)).open);
const idleTarget = () => until('settled Baidu destination', async () => {
  const state = await element('#baidu-target');
  return state.visible && state.text && !/(?:正在|检查中|检测中|判断中|识别中)/.test(state.text) && state.text;
});
const readyRun = () => until('enabled Run', async () => {
  const run = await element(RUN);
  return run.visible && !run.disabled;
});
async function check(name, read, verify) {
  const entry = { scene, name, status: 'FAIL' };
  try {
    entry.observed = await read();
    verify(entry.observed);
    entry.status = 'PASS';
  } catch (error) {
    entry.error = errorText(error);
    if (ownershipStop(error)) throw error;
  }
  report.checks.push(entry);
}
const eq = (name, read, expected) => check(name, read, observed => assert.deepEqual(observed, expected));
const matches = (name, read, pattern) => check(name, read, observed => assert.match(observed, pattern));
const property = (selector, name) => async () => (await element(selector))[name];
async function openTask(id = BAIDU, expectSheet = true) {
  await page.hover(row(id), { label: 'Reveal task actions' });
  await click(prepare(id));
  if (expectSheet) await opened();
}
async function menu(selector) {
  await click('#demo-open');
  await click(selector);
  await until('closed demo menu', async () => !(await element('#utility-dialog')).open);
}
const scenario = name => menu('[data-baidu-scenario="' + name + '"]');
async function size(width, height = 820) {
  metricsTouched = true; // Also clear if CDP changes metrics but the reply fails.
  await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await until('emulated viewport ' + width + ' × ' + height, () => page.evaluate(
    ([w, h]) => innerWidth === w && innerHeight === h, [width, height]));
}
async function group(name, run) {
  scene = name;
  try {
    if ((await element(DIALOG)).open) await click(CLOSE);
    if ((await element('#utility-dialog')).open) await click('#utility-close');
    await menu('[data-scene="normal"]');
    await scenario('eligible');
    await run();
  } catch (error) {
    report.scenarioErrors.push({ scene, error: errorText(error) });
    // An access/ownership stop is not a product failure; do not keep driving.
    if (ownershipStop(error)) throw error;
    if ((await element(DIALOG)).open || (await element('#result')).visible) await capture('failure-' + name);
  }
  await save();
}
async function capture(name) {
  const entry = { scene, name, file: name + '.png' };
  report.screenshots.push(entry);
  try {
    await settlePaint();
    entry.viewport = await page.evaluate(() => [innerWidth, innerHeight]);
    const png = path.join(out, entry.file);
    await page.screenshot({ path: png });
    const bytes = await fs.readFile(png);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    entry.pixels = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    entry.sha256 = sha(bytes);
    entry.status = 'CAPTURED';
  } catch (error) {
    entry.status = 'ERROR';
    entry.error = errorText(error);
    if (ownershipStop(error)) throw error;
  }
}

async function snapshot(name) {
  const body = String(await page.snapshot({ scope: 'full_page' }));
  const file = name + '.ax.txt';
  await fs.writeFile(path.join(out, file), body + '\n');
  report.snapshots.push({ scene, file, sha256: sha(body + '\n') });
}
async function nativeAx(name) {
  const { nodes } = await page.cdp('Accessibility.getFullAXTree');
  const result = nodes.filter(node => !node.ignored && ['textbox', 'switch', 'checkbox', 'DisclosureTriangle'].includes(node.role?.value))
    .map(node => ({ role: node.role.value, name: node.name?.value ?? '', description: node.description?.value ?? '',
      properties: Object.fromEntries((node.properties ?? []).map(property => [property.name, property.value.value])) }));
  report.nativeAx[name] = result;
  return result;
}
async function labelCells() {
  return page.evaluate(() => [...document.querySelectorAll('#params-fields .run-field')]
    .filter(row => !row.hidden).map(row => {
      const control = row.querySelector('[data-param]');
      const label = control.labels[0];
      const a = label.getBoundingClientRect(), b = control.getBoundingClientRect();
      return { id: control.id, oneTable: row.parentElement.id === 'params-fields',
        paired: a.right <= b.left && a.top < b.bottom && a.bottom > b.top,
        required: control.required, marker: label.querySelector('[aria-hidden=true]')?.textContent ?? null,
        help: label.title, described: document.getElementById(control.getAttribute('aria-describedby'))?.textContent === label.title };
    }));
}

// Measure actual hit-testing before touching the footer; no scroll-to-click fallback.
async function footer(selector) {
  return page.evaluate(sel => {
    const node = document.querySelector(sel);
    if (!node) return { actionable: false, missing: true };
    const r = node.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const fits = r.width > 0 && r.height > 0 && r.left >= -1 && r.top >= -1 &&
      r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
    return { actionable: fits && node.contains(hit) && !node.matches(':disabled,[aria-disabled="true"]'),
      fits, hit: node.contains(hit), box: [r.x, r.y, r.width, r.height], viewport: [innerWidth, innerHeight] };
  }, selector);
}
async function tap(selector) {
  const box = await footer(selector);
  assert.ok(box.fits && box.hit, JSON.stringify({ selector, ...box }));
  const [x, y, width, height] = box.box;
  // A real pointer click even when the control intentionally rejects activation as disabled.
  await page.mouse.click(x + width / 2, y + height / 2);
}
async function clipping() {
  return page.evaluate(() => {
    const dialog = document.querySelector('#params-dialog');
    const overflows = [];
    const body = dialog.querySelector('.dialog-body') ?? dialog;
    for (const sel of ['#params-dialog', '#params-dialog .dialog-body', '#params-dialog .dialog-foot']) {
      const node = document.querySelector(sel);
      if (node && node.scrollWidth > node.clientWidth + 1) overflows.push(sel + ': horizontal scroll');
    }
    for (const sel of ['#params-title', '#param-query', '#param-target', '#param-showExecutionTab',
      '#param-startUrl', '#baidu-target', '#baidu-target-brief', '#baidu-target-detail', '#params-error', '#params-cancel', '#params-run']) {
      const node = document.querySelector(sel);
      if (!node?.getClientRects().length || getComputedStyle(node).visibility !== 'visible' ||
        (node.closest('details:not([open])') && !node.closest('summary'))) continue;
      const r = node.getBoundingClientRect();
      if (r.left < -1 || r.right > innerWidth + 1) overflows.push(sel + ': outside viewport');
      if (body.contains(node) && node !== body && ['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(body).overflowX)) {
        const left = body.getBoundingClientRect().left + body.clientLeft;
        if (r.left < left - 1 || r.right > left + body.clientWidth + 1) overflows.push(sel + ': clipped by body');
      }
      if (node.matches('input,select,textarea')) continue; // Native editing surfaces scroll their values deliberately.
      const range = document.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some(rect => rect.left < r.left - 1 || rect.right > r.right + 1)) overflows.push(sel + ': text outside control');
    }
    return { width: innerWidth, height: innerHeight, overflows };
  });
}
const noClips = name => check(name, clipping, evidence => assert.deepEqual(evidence.overflows, []));
const affordance = (name, selector) => check(name, () => footer(selector), evidence => assert.equal(evidence.actionable, true));
async function watchNoRun(before, duration = 350, expectedOpen = true) {
  const deadline = Date.now() + duration;
  do {
    const state = { history: await history(), running: await running(), sheetOpen: (await element(DIALOG)).open };
    if (state.history !== before || state.running || state.sheetOpen !== expectedOpen) return state;
    await delay(65);
  } while (Date.now() < deadline);
  return { history: await history(), running: await running(), sheetOpen: (await element(DIALOG)).open };
}
const noRun = (name, before, sheetOpen = true, duration) => eq(name,
  () => watchNoRun(before, duration, sheetOpen), { history: before, running: false, sheetOpen });
async function receipt(action = () => click(RUN)) {
  const before = await history();
  await action();
  await closed();
  await until('one new receipt and no running dock', async () => (await history()) > before && !(await running()), 11000);
  return { added: (await history()) - before, result: await text('#result') };
}
const resultLines = value => value.split('\n').filter(line => /^\s*\d+[.、．)]\s*/.test(line));
const oneReceipt = result => () => result.added;
const resultText = result => () => result.result;
const readJson = async () => JSON.parse(await property(JSON_FIELD, 'value')());
async function setTarget(value) {
  const on = value === 'new-tab';
  if ((await element(TARGET)).checked !== on) await click(TARGET);
  assert.equal((await element(TARGET)).checked, on, 'Switch reflects ' + value);
}
async function tabToRun() {
  const trace = [];
  let inside = true;
  for (let i = 0; i < 24; i++) {
    if ((await element(RUN)).focused) break;
    await key('Tab');
    trace.push(await active());
    inside &&= await page.evaluate(() => document.querySelector('#params-dialog').contains(document.activeElement));
  }
  return { trace, inside, reached: (await element(RUN)).focused, cancelReached: trace.includes(CANCEL) };
}
async function composingEvent(type, data) {
  return page.evaluate(({ type, data }) => document.querySelector('#param-query').dispatchEvent(new CompositionEvent(type,
    { data, bubbles: true, cancelable: true, composed: true })), { type, data });
}
async function composingKey(value) {
  return page.evaluate(value => {
    const args = { key: value, code: value, isComposing: true, bubbles: true, cancelable: true, composed: true };
    const input = document.activeElement;
    input.dispatchEvent(new KeyboardEvent('keydown', args));
    input.dispatchEvent(new KeyboardEvent('keyup', args));
  }, value);
}

try {
  await save();
  page = (await taskSpace(SPACE_ID)).page('p1');
  const identity = await page.evaluate(() => ({
    url: location.href, title: document.title, ua: navigator.userAgent,
    preview: !!document.querySelector('[data-prepare="baidu-preview"]') && !!document.querySelector('#demo-open') &&
      !!document.querySelector('#params-dialog') && !!document.querySelector('#history-count'),
    viewport: [innerWidth, innerHeight],
  }));
  const location = new URL(identity.url);
  assert.ok(identity.preview && (location.protocol === 'file:' ||
    (['http:', 'https:'].includes(location.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))),
  'p1 must already show the offline preview on a local file or loopback server');
  if (location.protocol === 'file:') assert.equal((await import('node:url')).fileURLToPath(location), source);
  assert.equal((await element(DIALOG)).open, false, 'Close any active parameter sheet before running');
  assert.equal((await element('#utility-dialog')).open, false, 'Close any active demo menu before running');
  assert.equal(await running(), false, 'Wait for the current preview run to finish before running');
  const disk = await fs.readFile(source);
  const loadedSha = async () => {
    const { frameTree } = await page.cdp('Page.getResourceTree');
    const { content, base64Encoded } = await page.cdp('Page.getResourceContent', { frameId: frameTree.frame.id, url: identity.url });
    return sha(Buffer.from(content, base64Encoded ? 'base64' : 'utf8'));
  };
  report.candidate = { ...identity, loadedHtmlSha256: await loadedSha(), sourceSha256AtStart: sha(disk) };
  report.candidate.loadedHtmlMatchesWorkspace = report.candidate.loadedHtmlSha256 === report.candidate.sourceSha256AtStart;
  assert.ok(report.candidate.loadedHtmlMatchesWorkspace, 'Reload the preview from the current file before running');
  await size(360);

  await group('defaults-and-current-read', async () => {
    await openTask();
    await idleTarget();
    await eq('Opening from the task row focuses the keyword', property(QUERY, 'focused'), true);
    await eq('The required keyword starts blank', property(QUERY, 'value'), '');
    await eq('Baidu hides the redundant simulation and draft note', property('#params-context', 'visible'), false);
    await page.hover('label[for="param-query"]', { label: 'Find keyword label help' });
    await check('Required and optional controls are paired with labels in the same table, with hover and accessible help', labelCells, cells => {
      assert.deepEqual(cells.map(({ id, required, marker }) => [id, required, marker]),
        [['param-query', true, '*'], ['param-target', false, null], ['param-showExecutionTab', false, null]]);
      assert.ok(cells.every(cell => cell.oneTable && cell.paired && cell.help && cell.described));
    });
    await eq('Fixed result count is not editable', property(DIALOG + ' #param-limit', 'visible'), false);
    await eq('Current destination preview is read-only', () => page.evaluate(() => ['#baidu-target', '#baidu-target-brief', '#baidu-target-detail'].every(sel => {
      const el = document.querySelector(sel);
      return !!el && !el.isContentEditable && !el.matches('input,textarea,select,button,[role="textbox"]') &&
        !el.querySelector('input,textarea,select,button,[contenteditable="true"],[role="textbox"]');
    })), true);
    await matches('Default automatic destination is the current Baidu page', targetText, /当前.*百度|百度.*当前/);
    await matches('Run preview discloses the default tab switch', targetText, /切到执行页/);
    await eq('Run drawer starts collapsed and keeps the destination visible', async () => [
      (await element(DRAWER)).open, (await element('#baidu-target')).visible, (await element('#baidu-target-detail')).visible], [false, true, false]);
    await noClips('Default sheet fits at 360 CSS px');
    await snapshot('default-360');
    await check('Native AX exposes the required field, two default states and a collapsed run group', () => nativeAx('default-360'), nodes => {
      const find = role => nodes.find(node => node.role === role && /搜索关键词|始终新开标签页|切到执行页|本次运行/.test(node.name));
      assert.equal(find('textbox')?.properties.required, true);
      assert.equal(find('switch')?.properties.checked, 'false');
      assert.match(find('switch')?.description ?? '', /自动选择.*百度首页新开/);
      assert.equal(find('checkbox')?.properties.checked, 'true');
      assert.equal(find('DisclosureTriangle')?.properties.expanded, false);
      assert.ok(!nodes.some(node => node.name.includes('起始网址')));
    });
    await capture('default-360-blank');
    await tap(RUN);
    await eq('Submitting a blank keyword marks the keyword field invalid', property(QUERY, 'invalid'), 'true');
    await noRun('Submitting a blank keyword does not dispatch', 0);
    await fill(QUERY, SAME);
    await readyRun();
    await eq('Correcting the keyword clears its invalid state', async () => (await element(QUERY)).invalid === 'true', false);
    await matches('Same keyword previews reading existing results', targetText, /直接读取|读取.*同词|无需.*搜索/);
    const run = await receipt();
    await eq('Current-page run creates one receipt', oneReceipt(run), 1);
    await matches('Same keyword result confirms no repeat search', resultText(run), /直接读取|未重新搜索|复用.*结果/);
    await eq('Receipt displays exactly three numbered results', () => resultLines(run.result).length, 3);
    await matches('Result preserves the submitted keyword', resultText(run), /搜索关键词[：:]\s*周末徒步/);
    await page.evaluate(() => document.querySelector('#result')?.scrollIntoView({ block: 'nearest' }));
    await capture('result-360');
  });

  await group('replace-current-search', async () => {
    await openTask();
    await idleTarget();
    await fill(QUERY, DIFFERENT);
    await readyRun();
    await matches('Different keyword warns that it replaces the prior search', targetText, /替换.*(?:原结果|原搜索|周末徒步)|周末徒步.*替换/);
    const run = await receipt();
    await matches('Different keyword result reports a new search', resultText(run), /新关键词.*搜索|搜索.*新关键词|重新搜索/);
    await openTask();
    await idleTarget();
    await matches('After replacement, the same new keyword now previews a direct read', targetText, /直接读取|读取.*同词|无需.*搜索/);
  });

  await group('automatic-homepage', async () => {
    await scenario('absent');
    await openTask();
    await idleTarget();
    await fill(QUERY, DIFFERENT);
    await readyRun();
    await matches('No eligible page previews a new tab at Baidu home', targetText, HOME_PREVIEW);
    const run = await receipt();
    await eq('Automatic fallback creates exactly one simulated receipt', oneReceipt(run), 1);
    await matches('Automatic fallback receipt reports a new tab at Baidu home', resultText(run), HOME_RECEIPT);
  });

  await group('explicit-new-tab', async () => {
    await openTask();
    await idleTarget();
    await fill(QUERY, SAME);
    await eq('Target is an off switch with an explicit automatic label', () => page.evaluate(() => {
      const node = document.querySelector('#param-target');
      return [node.getAttribute('role'), node.checked, node.labels[0].textContent, node.parentElement.querySelector('.run-switch-off').checkVisibility()];
    }), ['switch', false, '始终新开标签页', true]);
    await eq('Automatic mode conceals the start URL', property(URL_FIELD, 'visible'), false);
    await eq('Foreground defaults on', property(FRONT, 'checked'), true);
    await page.press(TARGET, 'Space');
    await eq('Space changes the new-tab switch once and preserves focus', async () => [
      (await element(TARGET)).checked, (await element(TARGET)).focused], [true, true]);
    await eq('Explicit new-tab reveals the start URL', property(URL_FIELD, 'visible'), true);
    await matches('Explicit new-tab with no URL previews a new tab at Baidu home', targetText, HOME_PREVIEW);
    await check('The URL joins the same table when allowed; each optional row includes help', labelCells, cells => {
      assert.deepEqual(cells.map(cell => cell.id), ['param-query', 'param-target', 'param-startUrl', 'param-showExecutionTab']);
      assert.ok(cells.every(cell => cell.oneTable && cell.paired && cell.help && cell.described));
      assert.ok(cells.slice(1).every(cell => !cell.required && cell.marker === null));
    });
    await fill(URL_FIELD, 'http://www.baidu.com/');
    await tap(RUN);
    await eq('Non-HTTPS start URL is marked invalid', property(URL_FIELD, 'invalid'), 'true');
    await eq('URL validation focuses the URL field', property(URL_FIELD, 'focused'), true);
    await noClips('Inline URL error and footer fit at the standard width');
    await capture('invalid-url-360');
    await noRun('Invalid start URL cannot start the task', 0);
    await fill(URL_FIELD, START);
    // Space on the browser-focused checkbox also covers custom switch styling.
    await page.press(FRONT, 'Space');
    await eq('Space turns off the foreground switch', property(FRONT, 'checked'), false);
    await click('.run-field > label.check-field');
    await eq('Clicking the right cell beside the checkbox toggles it', property(FRONT, 'checked'), true);
    await page.press(FRONT, 'Space');
    await eq('A valid start URL clears the URL error', async () => (await element(URL_FIELD)).invalid === 'true', false);
    await noClips('Customized sheet fits at the standard width');
    await affordance('Run is visible and hit-testable with all four rows', RUN);
    await matches('Collapsed custom decision shows same-word read and background behavior', targetText, /直接读取同词结果.*不主动切页/);
    await page.press(DRAWER_TOGGLE, 'Enter');
    await eq('Enter expands the run drawer and leaves focus on its control', async () => [
      (await element(DRAWER)).open, (await element(DRAWER_TOGGLE)).focused], [true, true]);
    await check('Expanded decision shows the exact start URL', () => element('#baidu-target-detail'), e => assert.ok(e.visible && e.text.includes(START)));
    await eq('The fixed output description is separate from the URL', () => text('#baidu-output'), '返回前三条自然网页结果。');
    await check('Native AX exposes the optional URL and the expanded group', () => nativeAx('custom-360'), nodes => {
      assert.equal(nodes.find(node => node.role === 'textbox' && node.name.includes('起始网址'))?.properties.required, false);
      assert.equal(nodes.find(node => node.role === 'switch' && node.name.includes('始终新开标签页'))?.properties.checked, 'true');
      assert.equal(nodes.find(node => node.role === 'DisclosureTriangle' && node.name.includes('本次运行'))?.properties.expanded, true);
    });
    await snapshot('custom-360');
    await capture('custom-360');
    await click(DRAWER_TOGGLE);
    await eq('Pointer closes the drawer without changing the parameters', async () => [
      (await element(DRAWER)).open, (await element(URL_FIELD)).value], [false, START]);
    await click('#mode-json');
    await eq('Form export omits the fixed result limit and undeclared fields',
      async () => Object.keys(await readJson()).sort(), ['query', 'showExecutionTab', 'startUrl', 'target']);
    await eq('Form export preserves the entered values', readJson,
      { query: SAME, target: 'new-tab', startUrl: START, showExecutionTab: false });
    await click('#mode-form');
    await eq('JSON round trip preserves explicit start URL', property(URL_FIELD, 'value'), START);
    await readyRun();
    const run = await receipt(() => tap(RUN));
    await matches('Explicit new-tab result identifies the chosen URL', resultText(run), /新(?:开|建)?.*标签页/);
    await check('Explicit run uses the exact entered start URL', resultText(run), value => assert.ok(value.includes(START)));
    await matches('Background run reports it did not switch tabs', resultText(run), /未主动切到|不主动切换|未切换|保持.*当前标签页/);
    await matches('New-tab receipt confirms reading the same-keyword results', resultText(run), /直接读取同词结果/);
    await eq('Background run still returns three results', () => resultLines(run.result).length, 3);
    await openTask();
    await setTarget('auto');
    await eq('Returning to automatic hides the URL field', property(URL_FIELD, 'visible'), false);
    await setTarget('new-tab');
    await eq('Revealing the URL again does not revive a discarded value', property(URL_FIELD, 'value'), '');
  });

  await group('json-defaults', async () => {
    await openTask();
    await idleTarget();
    await setTarget('new-tab');
    await fill(URL_FIELD, START);
    await page.press(FRONT, 'Space');
    await click('#mode-json');
    await fill(JSON_FIELD, JSON.stringify({ query: DIFFERENT }));
    await click('#mode-form');
    await eq('Valid JSON with omitted options restores the keyword', property(QUERY, 'value'), DIFFERENT);
    await eq('Omitted target resets to automatic instead of carrying old new-tab', property(TARGET, 'checked'), false);
    await eq('Omitted foreground setting restores true instead of carrying old false', property(FRONT, 'checked'), true);
    await setTarget('new-tab');
    await eq('Omitted URL does not revive the prior explicit URL', property(URL_FIELD, 'value'), '');
  });

  await group('invalid-json-drafts', async () => {
    await openTask();
    await idleTarget();
    await click('#mode-json');
    const bad = [
      ['malformed JSON', '{ "query": "周末徒步", ', /JSON 格式/],
      ['extra key', JSON.stringify({ query: SAME, extra: true }), /不支持的参数：extra/],
      ['wrong option type', JSON.stringify({ query: SAME, showExecutionTab: 'false' }), /须为 true 或 false/],
      ['wrong switch type', JSON.stringify({ query: SAME, target: true }), /target 须为 "auto" 或 "new-tab"/],
      ['wrong parameter type', JSON.stringify({ query: 42 }), /搜索关键词.*文本/],
      ['multiline keyword', JSON.stringify({ query: '周末\n徒步' }), /搜索关键词.*单行.*换行/],
      ['multiline URL', JSON.stringify({ query: SAME, target: 'new-tab', startUrl: HOME + '\n' }), /单行百度 HTTPS/],
      ['credentialed URL', JSON.stringify({ query: SAME, target: 'new-tab', startUrl: 'https://example@www.baidu.com/' }), /不含登录凭据/],
      ['off-site URL', JSON.stringify({ query: SAME, target: 'new-tab', startUrl: 'https://example.com/' }), /百度 HTTPS/],
      ['changed fixed count', JSON.stringify({ query: SAME, limit: 2 }), /固定返回 3 条/],
      ['auto with URL', JSON.stringify({ query: SAME, target: 'auto', startUrl: START }), /只有选择「新开标签页」/],
    ];
    for (const [name, raw, reason] of bad) {
      await fill(JSON_FIELD, raw);
      await tap(RUN);
      await noRun(name + ' does not submit', 0);
      await click('#mode-form');
      await eq(name + ' prevents leaving JSON mode', property(JSON_FIELD, 'visible'), true);
      await eq(name + ' retains the exact raw draft', property(JSON_FIELD, 'value'), raw);
      await check(name + ' explains the specific JSON error', () => element('#params-error'), e => {
        assert.ok(e.visible); assert.match(e.text, reason);
      });
    }
    await click(CLOSE);
    await closed();
    await openTask('summary');
    await click('#mode-json');
    await eq('An invalid Baidu draft does not leak into another script’s JSON', readJson, { length: '简明', includeLinks: true });
    await click(CLOSE);
    await closed();
    await openTask();
    await eq('Closing, opening another task and returning preserves the exact invalid Baidu JSON', property(JSON_FIELD, 'value'), bad.at(-1)[1]);
    await eq('Reopening an invalid draft stays in JSON mode', property(JSON_FIELD, 'visible'), true);
    await click('#mode-form');
    await snapshot('json-error-360');
    await fill(JSON_FIELD, JSON.stringify({ query: '  ' + SAME + '  ', limit: 3 }));
    const recovered = await receipt();
    await matches('Corrected legacy JSON runs with a trimmed keyword', resultText(recovered), /搜索关键词：周末徒步\n/);
    await eq('Legacy count 3 still yields exactly three results', () => resultLines(recovered.result).length, 3);
  });

  await group('blocked-authorization', async () => {
    await scenario('blocked');
    await openTask();
    await idleTarget();
    await fill(QUERY, DIFFERENT);
    await matches('Unavailable authorization is explained near the destination', targetText, /授权.*(?:不可用|未|恢复|没有|失效)|权限.*(?:不足|不可用)/);
    await eq('Unavailable authorization disables Run', property(RUN, 'disabled'), true);
    await noClips('Blocked sheet fits at the standard width');
    await affordance('Cancel remains visible and actionable when blocked', CANCEL);
    await snapshot('blocked-360');
    await capture('blocked-360');
    await tap(RUN);
    await noRun('A pointer attempt cannot run with unavailable authorization', 0);
  });

  await group('authorization-revoked-in-json', async () => {
    await scenario('revokes');
    await openTask();
    await idleTarget();
    await click('#mode-json');
    const raw = JSON.stringify({ query: DIFFERENT, target: 'new-tab' });
    await fill(JSON_FIELD, raw);
    await page.focus(RUN);
    await until('revoked authorization explanation', async () => /授权.*(?:失效|撤销|不可用)|权限.*(?:取消|失效|不可用)/.test(await targetText()));
    await eq('Revocation blocks even explicit new-tab JSON', property(RUN, 'disabled'), true);
    await eq('Revocation retains the edited JSON verbatim', property(JSON_FIELD, 'value'), raw);
    await eq('Revocation rehomes focused Run to the visible drawer summary', active, DRAWER_TOGGLE);
    await eq('The blocked reason remains visible on the collapsed drawer', async () => [
      (await element(DRAWER)).open, (await element('#baidu-target')).visible], [false, true]);
    await snapshot('revoked-json-360');
    await tap(RUN);
    await noRun('Revocation prevents a pointer attempt from starting', 0);
    await matches('The collapsed blocker points to the right place to recover authorization', targetText, /右上角「选择演示状态」/);
    await click(CLOSE);
    await scenario('eligible');
    await openTask();
    await readyRun();
    await eq('Restoring authorization preserves the same JSON and does not run', async () => [
      (await element(JSON_FIELD)).value, await history(), await running()], [raw, 0, false]);
  });

  await group('current-page-changed', async () => {
    await scenario('changes');
    await openTask();
    await idleTarget();
    await fill(QUERY, DIFFERENT);
    await page.focus(RUN);
    await until('visible Recheck action', () => property('#baidu-recheck', 'visible')());
    await eq('Automatic mode waits for recheck after the original page changes', property(RUN, 'disabled'), true);
    await eq('The check action owns focus and is available without opening the drawer', async () => [
      await active(), (await element(DRAWER)).open], ['#baidu-recheck', false]);
    await snapshot('target-recheck-360');
    await tap(RUN);
    await noRun('Run cannot bypass recheck', 0);
    await setTarget('new-tab');
    await fill(URL_FIELD, 'http://www.baidu.com/');
    await eq('Invalid explicit new-tab URL does not ask to recheck an unrelated original page', async () => [
      await property('#baidu-recheck', 'visible')(), await property(RUN, 'disabled')()], [false, false]);
    await matches('Explicit new-tab summary identifies the parameter error', targetText, /参数待修正/);
    await tap(RUN);
    await eq('Run locates the invalid URL after the original tab was lost', active, URL_FIELD);
    await noRun('Invalid explicit new-tab URL does not start a run', 0);
    await fill(URL_FIELD, START);
    await matches('Fixing the URL previews the chosen new tab without rechecking the original page', targetText, /从指定网址新开标签页/);
    await setTarget('auto');
    await eq('Only returning to automatic selection restores the original page check', property('#baidu-recheck', 'visible'), true);
    await page.press('#baidu-recheck', 'Enter');
    await readyRun();
    await eq('Recheck returns focus to the keyword', active, QUERY);
    await matches('Explicit recheck previews a homepage fallback', targetText, HOME_PREVIEW);
    await eq('Recheck leaves the entered keyword unchanged', property(QUERY, 'value'), DIFFERENT);
    await noRun('Recheck updates the preview without dispatching', 0);
    const run = await receipt();
    await check('Fallback receipt contains the original entered keyword', resultText(run), result => assert.ok(result.includes(DIFFERENT)));
    await matches('Fallback receipt reports Baidu home', resultText(run), HOME_RECEIPT);
  });

  await group('unknown-receipt-prevents-repeat', async () => {
    await menu('#demo-baidu-unknown');
    await openTask();
    await idleTarget();
    await fill(QUERY, DIFFERENT);
    await setTarget('new-tab');
    await fill(URL_FIELD, START);
    await readyRun();
    const run = await receipt();
    await eq('The unknown run contributes one original receipt', oneReceipt(run), 1);
    await matches('Unknown result is explained on the task', () => text('#task-alert'), /未知|尚未确认|无法确认|不能确定/);
    await click('#open-original');
    await eq('Opening the original reveals history', property('#history-panel', 'open'), true);
    await check('History shows the original unresolved run', () => text('#history-body'), value => assert.match(value, /未知|无法确认|不能确定/));
    await check('The original unknown receipt identifies the submitted keyword and destination without fabricating results', () => text('#history-body .receipt-text'), value => {
      assert.ok(value.includes('搜索关键词：' + DIFFERENT));
      assert.ok(value.includes('执行目标：新开标签页，从 ' + START + ' 开始'));
      assert.equal(resultLines(value).length, 0);
    });
    await openTask(BAIDU, false);
    await noRun('Trying Run again keeps the sheet closed and creates no repeat', 1, false, 2200);
  });

  await group('cancel-close-and-focus', async () => {
    for (const [name, action] of [['Cancel', () => click(CANCEL)], ['Close', () => click(CLOSE)], ['Escape', () => key('Escape')]]) {
      await openTask();
      await fill(QUERY, DIFFERENT);
      await action();
      await closed();
      await eq(name + ' returns focus to the task-row launcher', property(prepare(BAIDU), 'focused'), true);
      await noRun(name + ' dismisses without creating a run', 0, false);
      await key('Enter');
      await opened();
      await eq(name + ' preserves the keyword when reopened by keyboard', property(QUERY, 'value'), DIFFERENT);
      await click(CLOSE);
      await closed();
    }
  });

  await group('keyboard-and-synthetic-composition', async () => {
    await openTask();
    await idleTarget();
    await fill(QUERY, SAME);
    await readyRun();
    await composingEvent('compositionstart', '周');
    await composingKey('Enter');
    await noRun('Synthetic composing Enter does not dispatch', 0);
    await composingKey('Escape');
    await eq('Synthetic composing Escape leaves the sheet open', property(DIALOG, 'open'), true);
    const composingTrace = await tabToRun();
    assert.ok(composingTrace.reached, 'Run must be focused to test Enter suppression');
    await key('Enter');
    await noRun('Real Enter on focused Run is suppressed during synthetic composition', 0);
    await key('Escape');
    await eq('Real Escape during synthetic composition leaves the sheet open', property(DIALOG, 'open'), true);
    await composingEvent('compositionend', SAME);
    await key('Escape');
    await closed();
    await eq('Real Escape after composition returns focus', property(prepare(BAIDU), 'focused'), true);
    await key('Enter');
    await opened();
    await readyRun();
    const trace = await tabToRun();
    await check('Tab reaches both footer actions without escaping the modal', () => trace,
      seen => assert.ok(seen.inside && seen.reached && seen.cancelReached && seen.trace.includes(DRAWER_TOGGLE)));
    if (!trace.reached) throw new Error('Keyboard never reached Run');
    await key('Tab');
    await eq('Tab wraps from the last footer action to Close', property(CLOSE, 'focused'), true);
    await key('Shift+Tab');
    await eq('Shift+Tab wraps back to Run', property(RUN, 'focused'), true);
    assert.equal((await element(RUN)).focused, true, 'Keyboard focus is not on Run');
    const run = await receipt(() => key('Enter'));
    await eq('Real Enter on the focused footer action submits exactly once', oneReceipt(run), 1);
  });

  await group('baidu-stop', async () => {
    await openTask();
    await idleTarget();
    await fill(QUERY, DIFFERENT);
    await readyRun();
    const stopped = await receipt(async () => {
      await click(RUN);
      await until('running Baidu with available Stop', running);
      await page.press('#stop-run', 'Space');
    });
    await eq('Stopping Baidu creates one receipt', oneReceipt(stopped), 1);
    await eq('Keyboard Stop moves focus to the visible receipt heading', active, '#result-heading');
    await check('Stopped receipt confirms no simulated result was returned', resultText(stopped), value => {
      assert.match(value, /已停止.*未操作网页/);
      assert.equal(resultLines(value).length, 0);
    });
    await openTask();
    await idleTarget();
    await eq('Stopping leaves the Baidu keyword in the draft', property(QUERY, 'value'), DIFFERENT);
  });

  await group('unrelated-summary-task', async () => {
    await openTask();
    await idleTarget();
    await fill(QUERY, SAME);
    await setTarget('new-tab');
    await fill(URL_FIELD, START);
    await click(CANCEL);
    await openTask('summary');
    await eq('The summary task does not show the Baidu drawer or switch', async () => [
      (await element(DRAWER)).visible, (await element(TARGET)).visible], [false, false]);
    await eq('The summary form has its own length default', property('#param-length', 'value'), '简明');
    await eq('A categorical select remains a native select in the existing summary task', property('#param-length', 'tag'), 'select');
    await page.selectOption('#param-length', '详细');
    await click('#mode-json');
    await eq('Summary JSON contains summary options instead of Baidu options', readJson,
      { length: '详细', includeLinks: true });
    await click('#mode-form');
    await eq('Summary mode round trip restores the edited length', property('#param-length', 'value'), '详细');
    const run = await receipt();
    await matches('Summary still executes and renders its own result', resultText(run), /文章|摘要|原文/);
    await openTask('summary');
    const stopped = await receipt(async () => {
      await click(RUN);
      await until('running summary with available Stop', running);
      await click('#stop-run');
    });
    await matches('Stopping summary produces a stopped receipt', resultText(stopped), /已停止|已中止/);
    await openTask();
    await idleTarget();
    await eq('Returning to Baidu restores only its own draft', async () => [
      (await element(QUERY)).value, (await element(TARGET)).checked, (await element(URL_FIELD)).value,
      (await element('#param-length')).exists], [SAME, true, START, false]);
  });

  report.candidate.loadedHtmlSha256AtEnd = await loadedSha();
  report.candidate.sourceSha256AtEnd = sha(await fs.readFile(source));
  report.candidate.loadedHtmlStable = report.candidate.loadedHtmlSha256 === report.candidate.loadedHtmlSha256AtEnd;
  report.candidate.workspaceSourceStable = report.candidate.sourceSha256AtStart === report.candidate.sourceSha256AtEnd;
} catch (error) {
  report.fatal = errorText(error);
} finally {
  if (metricsTouched) {
    try {
      await page.cdp('Emulation.clearDeviceMetricsOverride');
      report.emulationReset = { status: 'CLEARED', viewport: await page.evaluate(() => [innerWidth, innerHeight]) };
    } catch (error) {
      report.emulationReset = { status: 'ERROR', error: errorText(error) };
    }
  }
  report.finishedAt = new Date().toISOString();
  report.totals = {
    passed: report.checks.filter(item => item.status === 'PASS').length,
    failed: report.checks.filter(item => item.status === 'FAIL').length,
    scenariosInterrupted: report.scenarioErrors.length,
    screenshotsCaptured: report.screenshots.filter(item => item.status === 'CAPTURED').length,
  };
  report.status = report.fatal || report.scenarioErrors.length || report.emulationReset?.status !== 'CLEARED' ||
    !report.candidate?.loadedHtmlMatchesWorkspace || !report.candidate?.loadedHtmlStable || !report.candidate?.workspaceSourceStable ? 'INCOMPLETE' :
    report.totals.failed ||
    report.screenshots.some(item => item.status !== 'CAPTURED') ? 'FAILED' : 'PASSED';
  await save();
  console.log(JSON.stringify({ status: report.status, ...report.totals, reportPath }));
  if (report.status !== 'PASSED') throw new Error('Baidu UI evidence ' + report.status + ': ' + reportPath);
}
