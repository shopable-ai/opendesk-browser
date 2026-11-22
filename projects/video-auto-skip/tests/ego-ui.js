// Pipe a declaration of options followed by this file into ego-browser nodejs.
// options: {spaceId, url, candidate, outputDirectory}
const assert = (await import('node:assert/strict')).default;
const {readFile, writeFile} = await import('node:fs/promises');
const {createHash} = await import('node:crypto');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = await readFile(options.candidate);
const candidate = JSON.parse(bytes);
const task = await taskSpace(options.spaceId);
const page = task.page(options.page ?? 'p1');
const report = {mode: 'candidate-assets-mock-sdk', browser: 'ego(lite)', nativeSidePanel: 'NOT_TESTED_IN_EGO', checks: []};
const check = async (name, run) => {
  try { report.checks.push({name, status:'PASS', evidence:await run()}); }
  catch (error) { report.checks.push({name, status:'FAIL', error:String(error.stack ?? error)}); throw error; }
};
const field = (key, part) => '#vas-' + key + '-' + part;
const get = selector => page.evaluate(s => document.querySelector(s).value, selector);
const label = selector => page.evaluate(s => document.querySelector(s).textContent, selector);
const click = (selector, label) => page.click(selector, {label});
const slider = selector => page.evaluate(s => Number(document.querySelector(s + '-slider').getAttribute('aria-valuenow')), selector);
const drag = async (selector, dx) => {
  const knob = selector + '-slider .vas-knob';
  await page.hover(knob, {label:'Locate timeline handle'});
  const {x, y} = await page.evaluate(s => {
    const r = document.querySelector(s).getBoundingClientRect();
    return {x:r.left + r.width / 2, y:r.top + r.height / 2};
  }, knob);
  await page.mouse.move(x, y, {label:'Move to timeline handle'});
  await page.mouse.down();
  try { await page.mouse.move(x + dx, y, {label:'Drag timeline handle'}); }
  finally { await page.mouse.up(); }
  return slider(selector);
};
const time = n => [Math.floor(n / 60), n % 60].map(x => String(x).padStart(2,'0')).join(':');
const inputs = async key => [await get(field(key,'start')), await get(field(key,'end'))];
const ready = () => page.waitForSelector('#vas-settings:not([hidden]) #vas-intro-end:not(:disabled)', {state:'visible', timeout:8000});
const writes = () => page.evaluate(() => egoUiFixture.receipt.filter(x => x.op === 'video.save'));
const set = async (key, part, value) => {
  const selector = field(key, part);
  await page.fill(selector, value);
  await page.press(selector, 'Enter');
};
const save = async () => {
  await click('#vas-save:not(:disabled)', 'Save playback rules');
  await page.waitForFunction(() => document.querySelector('#vas-save').disabled &&
    document.querySelector('#vas-feedback').textContent.includes('已保存至'), undefined, {timeout:5000});
  return label('#vas-feedback');
};
try {
  await page.goto(options.url);
  await ready();
  await check('candidate identity and four visible handles', async () => {
    const observed = await page.evaluate(async () => {
      const identity = await (await fetch('/identity.json')).json();
      const assets = {};
      for (const name of ['html', 'css', 'js']) {
        const bytes = await (await fetch('/tool.' + name)).arrayBuffer();
        assets[name] = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2,'0')).join('');
      }
      const handles = [...document.querySelectorAll('.vas-track [role=slider]')].filter(e => e.getBoundingClientRect().width > 0).length;
      return {identity, assets, handles, width:document.querySelector('#tool').getBoundingClientRect().width, userAgent:navigator.userAgent};
    });
    assert.equal(observed.identity.sha256, hash(bytes));
    assert.equal(observed.identity.version, candidate.version);
    assert.equal(observed.identity.id, candidate.id);
    assert.deepEqual(observed.assets, Object.fromEntries(['html','css','js'].map(k => [k, hash(candidate[k])])));
    assert.equal(observed.handles, 4);
    report.candidate = observed.identity;
    return {handles:observed.handles, width:observed.width, userAgent:observed.userAgent};
  });
  await check('suggested anchors and time-axis preference have no playback or storage effect', async () => {
    const initial = await page.evaluate(() => ({
      window: document.querySelector('#vas-window-value').textContent,
      placeholder: document.querySelector('#vas-outro-start').placeholder,
      end: document.querySelector('#vas-outro-end').placeholder,
      introAnchor: document.querySelector('#vas-intro-start-slider').dataset.bound,
      tailAnchor: document.querySelector('#vas-outro-end-slider').dataset.bound,
      tailPreviewDisabled: document.querySelector('#vas-preview-outro').disabled,
      enabled: document.querySelector('#vas-rule-outro').checked,
      saveDisabled: document.querySelector('#vas-save').disabled,
    }));
    assert.deepEqual(initial, {window:'5分钟', placeholder:'43:30', end:'End', introAnchor:'true', tailAnchor:'true',
      tailPreviewDisabled:true, enabled:true, saveDisabled:true});
    assert.deepEqual(await inputs('outro'), ['', '']);
    await page.press('#vas-window-range', 'End');
    assert.equal(await label('#vas-window-value'), '10分钟');
    await click('#vas-window-reset', 'Restore recommended timeline range');
    assert.equal(await label('#vas-window-value'), '5分钟');
    assert.deepEqual(await writes(), []);
    assert.match(await label('#vas-media'), /00:42.*已暂停/);
    return initial;
  });
  await check('default 00:00 and End can be dragged and restored without saving', async () => {
    const intro = '#vas-intro-start', outro = '#vas-outro-end';
    const info = selector => page.evaluate(s => {
      const handle = document.querySelector(s + '-slider');
      return {bound: handle.dataset.bound, disabled: handle.getAttribute('aria-disabled'), tabIndex: handle.tabIndex};
    }, selector);
    for (const selector of [intro, outro]) {
      assert.deepEqual(await info(selector), {bound:'true', disabled:'false', tabIndex:0});
    }
    const introStart = await drag(intro, 24);
    const outroEnd = await drag(outro, -24);
    assert.ok(introStart > 0);
    assert.ok(outroEnd < 2700);
    assert.equal(await get(intro), time(introStart));
    assert.equal(await get(outro), time(outroEnd));
    for (const selector of [intro, outro]) assert.equal((await info(selector)).bound, 'false');
    assert.equal(await get('#vas-outro-start'), '');
    await page.press(intro + '-slider', 'Home');
    await page.press(outro + '-slider', 'End');
    assert.equal(await slider(intro), 0);
    assert.equal(await slider(outro), 2700);
    for (const selector of [intro, outro]) assert.equal((await info(selector)).bound, 'true');
    assert.deepEqual(await writes(), []);
    return {introStart, outroEnd};
  });
  await check('text inputs move four handles', async () => {
    const values = {};
    for (const [key,part,typed,seconds] of [['intro','start','20',20], ['intro','end','1:30',90], ['outro','start','43:30',2610], ['outro','end','2680',2680]]) {
      await set(key, part, typed);
      const selector = field(key, part);
      assert.equal(await get(selector), time(seconds));
      assert.equal(await slider(selector), seconds);
      values[selector] = {typed, seconds};
    }
    return values;
  });
  await check('pointer and keyboard move four handles and update text', async () => {
    const values = {};
    for (const key of ['intro','outro']) for (const part of ['start','end']) {
      const selector = field(key,part);
      const initial = await slider(selector);
      const direction = part === 'start' ? 1 : -1;
      const dragged = await drag(selector, 13 * direction);
      assert.ok((dragged - initial) * direction > 0, selector + ' moves with the pointer');
      assert.equal(await get(selector), time(dragged));
      assert.equal(await page.evaluate(() => document.activeElement.id), selector.slice(1) + '-slider');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await slider(selector), dragged - 1);
      assert.equal(await get(selector), time(dragged - 1));
      values[selector] = {initial, dragged, keyboard:dragged - 1};
    }
    return values;
  });
  await check('invalid interval blocks save', async () => {
    await set('intro', 'start', '95');
    await set('intro', 'end', '90');
    const invalid = await page.evaluate(() => ({saveDisabled:document.querySelector('#vas-save').disabled,
      message:document.querySelector('#vas-error-intro').textContent,
      ariaInvalid:document.querySelector('#vas-intro-end').getAttribute('aria-invalid')}));
    assert.equal(invalid.saveDisabled, true);
    assert.equal(invalid.ariaInvalid, 'true');
    assert.match(invalid.message, /开始必须早于结束/);
    await set('intro','start','20');
    await page.waitForSelector('#vas-save:not(:disabled)');
    return invalid;
  });
  await check('save sends relative tail rule and reads back before feedback', async () => {
    await set('outro','start','43:30');
    await set('outro','end','End');
    assert.deepEqual(await inputs('outro'), ['43:30','45:00']);
    assert.match(await label('#vas-tail-match'), /手动设置.*倒数 01:30.*待保存/);
    const feedback = await save();
    assert.match(feedback, /本作品当前季/);
    assert.match(await label('#vas-tail-match'), /已保存.*倒数 01:30/);
    const receipt = await page.evaluate(() => egoUiFixture.receipt.slice(-3));
    assert.deepEqual(receipt, [
      {op:'video.save',scope:'series',rules:{intro:{kind:'fixed',start:20,end:90},outro:{kind:'tail',seconds:90}},etag:'1'},
      {op:'storage.get',etag:'1'}, {op:'ui.notify',message:feedback},
    ]);
    return {feedback,receipt};
  });
  await check('discard restores saved settings without writing or seeking', async () => {
    await set('intro','end','1:45');
    await page.press('#vas-window-range', 'End');
    assert.equal(await get('#vas-intro-end'),'01:45');
    await click('#vas-cancel','Discard unsaved playback changes');
    assert.deepEqual(await inputs('intro'),['00:20','01:30']);
    assert.equal(await label('#vas-window-value'), '10分钟');
    assert.equal((await writes()).length, 1);
    assert.match(await label('#vas-media'), /00:42.*已暂停/);
    return {feedback:await label('#vas-feedback')};
  });
  await check('episode override survives reopening and can restore inheritance', async () => {
    await page.evaluate(() => egoUiFixture.seedEpisode({intro:{kind:'fixed',start:20,end:95}}));
    await page.reload();
    await ready();
    await set('intro','end','100');
    assert.match(await save(), /当前集/);
    await page.reload();
    await ready();
    assert.deepEqual(await inputs('intro'),['00:20','01:40']);
    assert.deepEqual(await inputs('outro'),['43:30','45:00']);
    const reopened = await label('#vas-summary-intro');
    assert.match(reopened, /本集例外/);
    await click('#vas-restore-intro','Restore inherited intro rule');
    assert.match(await save(), /当前集/);
    const record = await page.evaluate(() => egoUiFixture.read());
    assert.deepEqual(record.value.series['local:ego-fixture:season-1'].episodes,{});
    assert.deepEqual(await inputs('intro'),['00:20','01:30']);
    return {reopened,readback:record};
  });
  await check('tail follows longer duration without another save', async () => {
    await click('#source-length','Switch mock source duration');
    await click('#vas-refresh','Read updated player duration');
    await page.waitForFunction(() => document.querySelector('#vas-context').textContent.includes('48:00'), undefined, {timeout:5000});
    const fields = await inputs('outro');
    assert.deepEqual(fields,['46:30','48:00']);
    const summary = await label('#vas-tail-match');
    assert.match(summary, /46:30–48:00.*已保存.*倒数 01:30/);
    assert.equal(await page.evaluate(() => egoUiFixture.read().etag),'4');
    assert.equal(await page.evaluate(() => document.querySelector('#vas-save').disabled),true);
    return {fields,summary,etag:'4'};
  });
  await check('disabled outro keeps absolute times on save and reopen', async () => {
    await click('#vas-rule-outro','Disable automatic outro skip');
    await set('outro','start','42:00');
    await set('outro','end','43:30');
    assert.match(await label('#vas-tail-match'), /固定区间/);
    await save();
    assert.deepEqual((await writes()).at(-1).rules.outro, {kind:'fixed',start:2520,end:2610,enabled:false});
    await page.reload();
    await ready();
    assert.deepEqual(await inputs('outro'), ['42:00','43:30']);
    assert.equal(await page.evaluate(() => document.querySelector('#vas-rule-outro').checked), false);
    return {fields:await inputs('outro'), summary:await label('#vas-tail-match')};
  });
  await page.goto(options.url + '?site=iyf');
  await ready();
  const switchToShorterSource = async () => {
    await click('#source-length', 'Switch to shorter video');
    await click('#vas-refresh', 'Read shorter player duration');
    await page.waitForFunction(() => document.querySelector('#vas-context').textContent.includes('19:16'), undefined, {timeout:5000});
    assert.deepEqual(await writes(), []);
    assert.equal(await page.evaluate(() => document.querySelector('#vas-save').disabled), true);
  };
  const openShorterSource = async rule => {
    await page.evaluate(outro => egoUiFixture.seedDefault({outro}), rule);
    await page.reload();
    await ready();
    assert.deepEqual(await inputs('outro'), ['19:15',rule.kind === 'tail' ? 'End' : '20:43']);
    await switchToShorterSource();
  };
  await check('inherited tail updates both fields on a shorter iYF duration', async () => {
    await openShorterSource({kind:'tail',seconds:88});
    const fields = await inputs('outro');
    const status = await label('#vas-tail-match');
    assert.deepEqual(fields, ['17:48','End']);
    assert.match(status, /当前视频 17:48–19:16.*自动计算.*来自作品规则/);
    assert.equal(await page.evaluate(() => document.querySelector('#vas-preview-outro').disabled), false);
    return {fields,status};
  });
  await check('matching an unavailable fixed default saves its length only after confirmation', async () => {
    const original = {kind:'fixed',start:1155,end:1243};
    await openShorterSource(original);
    assert.match(await label('#vas-match-outro-length'), /01:28/);
    await click('#vas-match-outro-length','Reuse saved outro length');
    assert.deepEqual(await inputs('outro'), ['17:48','End']);
    assert.match(await label('#vas-tail-match'), /手动设置.*倒数 01:28.*待保存/);
    assert.deepEqual(await writes(), []);
    assert.match(await save(), /当前集/);
    const record = await page.evaluate(() => egoUiFixture.read().value.series['iyf:ego-fixture']);
    assert.deepEqual(record, {defaults:{outro:original}, episodes:{'episode-200':{outro:{kind:'tail',seconds:88}}}});
    await page.reload();
    await ready();
    assert.deepEqual(await inputs('outro'), ['19:15','End']);
    assert.match(await label('#vas-tail-match'), /已保存.*倒数 01:28/);
    await switchToShorterSource();
    assert.deepEqual(await inputs('outro'), ['17:48','End']);
    return {fields:await inputs('outro'),record};
  });
  await check('out-of-bounds iYF default stays untouched when corrected for this episode', async () => {
    const original = {kind:'fixed',start:1155,end:1243};
    await openShorterSource(original);
    assert.deepEqual(await inputs('outro'), ['', '']);
    const source = await label('#vas-summary-outro');
    const status = await label('#vas-tail-match');
    assert.match(source, /作品默认 · 19:15–20:43（当前视频未采用）/);
    assert.match(status, /不会自动跳过/);
    assert.equal(await page.evaluate(() => document.querySelector('#vas-preview-outro').disabled), true);
    await set('outro','start','18:30');
    await set('outro','end','19:10');
    assert.match(await label('#vas-tail-match'), /当前视频 18:30–19:10.*待保存/);
    assert.match(await save(), /当前集/);
    const record = await page.evaluate(() => egoUiFixture.read().value.series['iyf:ego-fixture']);
    assert.deepEqual(record, {defaults:{outro:original}, episodes:{'episode-200':{outro:{kind:'fixed',start:1110,end:1150}}}});
    return {source,status,fields:await inputs('outro'),record};
  });
  report.screenshot = await page.screenshot({path:options.outputDirectory + '/ego-ui.png'});
  report.status = 'PASS';
} finally {
  report.status ??= 'FAIL';
  report.completedAt = new Date().toISOString();
  await writeFile(options.outputDirectory + '/ego-ui.json', JSON.stringify(report,null,2) + '\n');
  console.log(JSON.stringify({status:report.status, checks:report.checks, screenshot:report.screenshot}));
}
