// Feed a const options = {spaceId, candidate, output, start, end, offscreen, replay, reload} into
// ego-browser nodejs before this file. Use only the task-owned episode tab.
const {readFile, writeFile} = await import('node:fs/promises');
const {createHash} = await import('node:crypto');
const assert = (await import('node:assert/strict')).default;
const task = await taskSpace(options.spaceId);
const page = task.page('p1');
const url = 'https://www.iyf.tv/play/O3MkOSlztbO?id=fanqXazJzVZ';
const selector = 'aa-videoplayer vg-player#main-player > video#video_player';
const toastSelector = '[data-opendesk-page-toast]';
const report = {url, options, observedAt: new Date().toISOString(), phases: []};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function verifyPageModule() {
  const bytes = await readFile(options.candidate);
  const {id, version, pageModule: {revision, sourceUtf8}} = JSON.parse(bytes);
  assert.equal(id, 'video-auto-skip');
  const body = sourceUtf8.split('// ==/UserScript==').at(-1).trim();
  assert.ok(body.includes('app.video-auto-skip'));
  report.candidate = {id, version, revision, sha256: createHash('sha256').update(bytes).digest('hex')};
  try {
    await page.events();
    await page.cdp('Debugger.enable', {});
    const events = await page.events();
    for (const {params: entry} of events.filter(e => e.method === 'Debugger.scriptParsed')) {
      if (entry.length < body.length || (entry.url && !entry.url.startsWith('chrome-extension://'))) continue;
      const {scriptSource} = await page.cdp('Debugger.getScriptSource', {scriptId: entry.scriptId});
      if (!scriptSource?.includes(body)) continue;
      report.running = {version, revision, verified: 'complete USER_SCRIPT body'};
      return;
    }
    throw Error('The page is not running the selected candidate USER_SCRIPT');
  } finally {
    await page.cdp('Debugger.disable', {});
  }
}

async function toastText() {
  const {root} = await page.cdp('DOM.getDocument', {depth: 0});
  const {nodeId} = await page.cdp('DOM.querySelector', {nodeId: root.nodeId, selector: toastSelector});
  if (!nodeId) return '';
  const {node} = await page.cdp('DOM.describeNode', {nodeId, depth: 6, pierce: true});
  const read = n => [n.nodeType === 3 ? n.nodeValue : '',
    ...(n.shadowRoots ?? []).flatMap(read), ...(n.children ?? []).flatMap(read)];
  return read(node).filter(s => s && s.length < 240).join(' ');
}

async function run(label, from) {
  const phase = {label, rows: [], notices: []};
  report.phases.push(phase);
  const endpoint = await page.evaluate(async ({url, selector, toastSelector, from, offscreen}) => {
    if (location.href !== url) throw Error('Unexpected episode URL');
    const video = document.querySelector(selector);
    if (!video || video.readyState < 2 || video.duration < from) throw Error('Episode media not ready');
    if (!document.querySelector('[data-opendesk-ui-owner][data-od-id="app.video-auto-skip"]'))
      throw Error('OpenDesk page module is not mounted');
    const measure = () => {
      const {x,y,top,bottom,left,right,width,height} = video.getBoundingClientRect();
      return {x,y,top,bottom,left,right,width,height,viewport:[innerWidth,innerHeight],
        offscreen: width > 0 && height > 0 && (bottom <= 0 || top >= innerHeight || right <= 0 || left >= innerWidth)};
    };
    if (measure().offscreen !== offscreen) throw Error('Unexpected video geometry: ' + JSON.stringify(measure()));
    if (!Array.from({length: video.seekable.length}, (_,i) => video.seekable.start(i) <= from && from < video.seekable.end(i)).some(Boolean))
      throw Error('Setup position is not currently seekable');
    window.__odIyfRegression?.stop();
    const reference = video.currentSrc, started = performance.now(), rows = [], notices = [];
    const read = (event, trusted) => ({ms: performance.now()-started, event, time: video.currentTime,
      duration: video.duration, trusted, paused: video.paused, seeking: video.seeking, ended: video.ended,
      rate: video.playbackRate, readyState: video.readyState, sameMedia: video.isConnected &&
        video.currentSrc === reference && document.querySelector(selector) === video, href: location.href,
      seekable: Array.from({length: video.seekable.length}, (_,i) => [video.seekable.start(i),video.seekable.end(i)])});
    const abort = new AbortController();
    for (const name of ['seeking','seeked','ended','play','playing','pause','timeupdate','durationchange','loadstart','waiting'])
      video.addEventListener(name, e => rows.push(read(name, e.isTrusted)), {signal:abort.signal});
    let rendered = false;
    const sampleToast = () => {
      const host = document.querySelector(toastSelector);
      const rect = host?.getBoundingClientRect();
      const visible = !!(rect?.width && rect.height && rect.bottom > 0 && rect.top < innerHeight &&
        rect.right > 0 && rect.left < innerWidth && getComputedStyle(host).visibility === 'visible');
      if (visible === rendered) return;
      rendered = visible;
      notices.push({...read(visible?'toast-visible':'toast-gone'), geometry: rect?.toJSON()});
    };
    const observer = new MutationObserver(sampleToast);
    observer.observe(document.documentElement, {childList:true, subtree:true});
    const timer = setInterval(() => { rows.push(read('sample')); sampleToast(); }, 70);
    window.__odIyfRegression = {read, rows, notices, measure, stop() {
      observer.disconnect(); clearInterval(timer); abort.abort();
    }, pauseOriginal() {
      if (location.href === url && read('cleanup').sameMedia) video.pause();
    }};
    rows.push(read('before-setup'));
    video.pause();
    const positioned = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Setup seek did not settle')), 8000);
      video.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, {once:true, signal:abort.signal});
    });
    video.currentTime = from;
    await positioned;
    rows.push(read('observation-start'));
    await video.play();
    return {now:read('started'), geometry:measure(), navigation:performance.getEntriesByType('navigation')[0]?.type};
  }, {url, selector, toastSelector, from, offscreen:options.offscreen});
  phase.start = endpoint;
  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(() => {
      const probe = window.__odIyfRegression;
      return {href:location.href, data:probe && {rows:probe.rows, notices:probe.notices,
        geometry:probe.measure(), now:probe.read('readback')}};
    });
    if (!snapshot.data) { phase.leftDocument = snapshot.href; break; }
    Object.assign(phase, snapshot.data);
    if (!phase.toastText && phase.notices.at(-1)?.event === 'toast-visible') phase.toastText = await toastText();
    if (snapshot.href !== url) break;
    if (!phase.now.sameMedia && !phase.notices.some(n => n.event === 'toast-visible' && n.sameMedia)) break;
    const gone = phase.notices.find(n => n.event === 'toast-gone');
    if (!options.replay || label === 'replay') {
      if (gone && phase.now.ms - gone.ms > 900 && (phase.now.ended || phase.now.time > options.end)) break;
      if (label === 'replay' && phase.now.time >= options.start + 2) break;
    } else if (gone && phase.now.ms - gone.ms > 400) break;
    if (!phase.notices.length && phase.now.ms > 11000 && phase.now.time > options.start + 4) break;
    await pause(140);
  }
  const first = phase.rows.findIndex(r => r.event === 'observation-start');
  assert.ok(first >= 0, 'Setup must settle before recording playback');
  const rows = phase.rows.slice(first);
  const attempts = rows.filter(r => r.event === 'seeking' && r.trusted);
  const settled = rows.filter(r => r.event === 'seeked' && r.trusted);
  phase.summary = {attempts, settled, ended:rows.filter(r => r.event === 'ended' && r.trusted)};
  const crossing = rows.find((r,i) => r.time >= options.start && r.time < options.end - 1 && !r.paused &&
    !r.seeking && r.rate === 1 && r.sameMedia && rows[i-1]?.time < options.start && r.time - rows[i-1].time < 1);
  const before = rows.findLast(r => r.time < options.start && r.time >= options.start - 1 &&
    !r.seeking && !r.paused && r.rate === 1 && r.sameMedia);
  phase.summary.crossing = crossing;
  phase.summary.before = before;
  assert.equal(phase.start.geometry.offscreen, options.offscreen, 'Unexpected media viewport state at playback start');
  if (label === 'replay') {
    assert.ok(crossing && phase.now.sameMedia && phase.now.href === url && phase.now.time >= options.start + 2,
      'Replay must naturally cross the rule again on the same media');
    assert.equal(attempts.length, 0, 'Rewatch must not start another automatic seek');
    assert.equal(phase.notices.length, 0, 'Rewatch must not show another toast');
    return;
  }
  assert.ok(crossing, 'No natural playback sample crossed the threshold before the seek');
  assert.equal(attempts.length, 1, 'Expected one trusted seek after setup');
  assert.ok(attempts[0].sameMedia && attempts[0].ms >= crossing.ms, 'Seek did not follow the natural crossing on the same media');
  assert.equal(settled.length, 1, 'Expected one trusted seeked after setup');
  assert.ok(settled[0].sameMedia && Math.abs(settled[0].time - options.end) <= 0.25, 'Seek did not land at the rule end');
  assert.deepEqual(phase.notices.map(n => n.event), ['toast-visible','toast-gone'], 'Expected one visible toast that disappears');
  assert.match(phase.toastText ?? '', /已跳过片尾/);
  assert.ok(phase.notices[0].sameMedia && phase.notices[0].href === url && phase.notices[0].ms >= settled[0].ms,
    'Toast must appear on this episode after confirming the seek');
  assert.ok(!phase.leftDocument && phase.notices[1].href === url, 'Navigation cannot count as toast dismissal');
  assert.ok(phase.notices[1].ms - phase.notices[0].ms >= 1000 &&
    phase.notices[1].ms - phase.notices[0].ms <= 3500, 'Toast did not disappear after a short interval');
}

try {
  const tab = (await task.tabs()).find(entry => entry.label === 'p1');
  assert.equal(tab?.openedBy, 'agent', 'Only an agent-opened test tab may be used');
  assert.equal(await page.url(), url, 'The task tab must already be on episode 201');
  assert.ok(Number.isFinite(options.start) && options.start > 4 && options.end > options.start,
    'Supply the effective start and end in seconds');
  if (options.reload) await page.reload({timeout:15000});
  await page.waitForFunction(({selector}) => {
    const video = document.querySelector(selector);
    return video?.readyState >= 2 && video.duration > 1200 &&
      document.querySelector('[data-opendesk-ui-owner][data-od-id="app.video-auto-skip"]');
  }, {selector}, {timeout:25000});
  await verifyPageModule();
  await run('natural', options.start - 4);
  if (options.replay) assert.ok(report.phases[0].now.sameMedia, 'The site switched before a same-media replay was possible');
  if (options.replay) await run('replay', options.start - 3);
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';
  report.error = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  const last = await page.evaluate(() => {
    const probe = window.__odIyfRegression;
    if (!probe) return null;
    const state = {rows:probe.rows, notices:probe.notices, geometry:probe.measure(), now:probe.read('final')};
    probe.stop();
    probe.pauseOriginal();
    delete window.__odIyfRegression;
    return state;
  }).catch(() => null);
  if (last && report.result === 'FAIL' && report.phases.length) Object.assign(report.phases.at(-1), last);
  await writeFile(options.output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({result:report.result, error:report.error, running:report.running, output:options.output,
    phases:report.phases.map(({label, start, now, summary, notices, toastText, leftDocument}) =>
      ({label, start, now, summary, notices, toastText, leftDocument}))}));
}
