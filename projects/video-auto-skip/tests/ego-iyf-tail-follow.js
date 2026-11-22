// Pipe const options = {spaceId, output, version, revision, seconds, nativeEvidence}
// and this file into ego-browser nodejs. Verify the installed version and Page revision,
// the existing enabled work End rule, and no episode overrides. Close the native sidebar.
// options: {spaceId, output, version, revision, seconds, nativeEvidence}; keep p2 on episode 200.
const assert = (await import('node:assert/strict')).default;
const {writeFile} = await import('node:fs/promises');
const task = await taskSpace(options.spaceId);
const page = task.page('p2');
const series = 'https://www.iyf.tv/play/O3MkOSlztbO';
const original = series + '?id=nWwHoSxqG04';
const next = series + '?id=fanqXazJzVZ';
const selector = 'aa-videoplayer vg-player#main-player > video#video_player';
const prefix = '[连播助手][片尾]';
const fields = new Set(['decision', 'episode', 'time', 'duration', 'start', 'end', 'id', 'from', 'to', 'reason', 'source', 'ruleKind', 'entry', 'previous', 'landed']);
const report = {original, next, version: options.version, revision: options.revision, seconds: options.seconds, nativeEvidence: options.nativeEvidence, observedAt: new Date().toISOString(), decisions: [], media: []};
let runtimeEnabled = false, probeInstalled = false;

async function collectDecisions() {
  for (const {method, params} of await page.events()) {
    if (method !== 'Runtime.consoleAPICalled' || params.args?.[0]?.value !== prefix) continue;
    const detail = params.args[1];
    if (typeof detail?.value === 'string') {
      report.decisions.push({...JSON.parse(detail.value), at: params.timestamp});
      continue;
    }
    let fieldsInLog = {};
    if (detail?.objectId) {
      try {
        const {result} = await page.cdp('Runtime.getProperties', {objectId: detail.objectId, ownProperties: true});
        fieldsInLog = Object.fromEntries(result.filter(p => fields.has(p.name) && p.value?.value !== undefined)
          .map(p => [p.name, p.value.value]));
      } catch { /* Navigation may have disposed the context; keep the event preview below. */ }
    }
    const preview = Object.fromEntries((detail?.preview?.properties ?? []).filter(p => fields.has(p.name))
      .map(p => [p.name, p.type === 'number' ? Number(p.value) : p.value]));
    report.decisions.push({...preview, ...fieldsInLog, at: params.timestamp});
  }
}

try {
  assert.equal(task.ownership, 'agent', 'Wait for the user to return control after confirming the update');
  assert.equal(await page.url(), original, 'p2 must be on episode 200');
  assert.ok(options.version && Number.isInteger(options.revision) && options.nativeEvidence &&
    Number.isFinite(options.seconds) && options.seconds > 0, 'Provide native evidence and the saved work tail length');
  await page.cdp('egoAutomated.disable');
  await page.cdp('Runtime.enable');
  runtimeEnabled = true;
  await page.events(); // Exclude entries buffered before this run.
  // iYF restores scroll on reload; the floating layout may leave the main player unbound.
  await page.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'}));
  await page.reload({timeout: 20000});
  async function observeEpisode(url, episode, expectedDuration, expectTransition) {
    await page.waitForFunction(({selector, url, expectedDuration}) => {
      const video = document.querySelector(selector);
      return location.href === url && video?.readyState >= 2 && Math.abs(video.duration - expectedDuration) < 2;
    }, {selector, url, expectedDuration}, {timeout: 25000});
    probeInstalled = true;
    const setup = await page.evaluate(async ({selector, original, seconds, expectedDuration}) => {
    const video = document.querySelector(selector);
    if (location.href !== original || video?.readyState < 2 || !Number.isFinite(video?.duration) ||
        Math.abs(video.duration - expectedDuration) > 2 || video.playbackRate !== 1) throw Error('Expected episode media is not ready at 1×');
    const duration = video.duration, start = duration - seconds, from = start - 4;
    if (!Array.from({length:video.seekable.length}, (_,i) =>
      video.seekable.start(i) <= from && from < video.seekable.end(i)).some(Boolean)) throw Error('Setup position is not seekable');
    video.pause();
    window.__odTailFollowProbe?.stop();
    const controller = new AbortController(), rows = [];
    const read = (event, trusted) => ({event, trusted, at:Date.now(), time:video.currentTime, duration:video.duration,
      href:location.href, paused:video.paused, seeking:video.seeking, ended:video.ended});
    window.__odTailFollowProbe = {rows, stop() { controller.abort(); }};
    for (const type of ['timeupdate', 'seeking', 'seeked', 'ended', 'waiting']) {
      video.addEventListener(type, e => rows.push(read(type, e.isTrusted)), {signal:controller.signal});
    }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Setup seek did not settle')), 8000);
      video.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, {once:true, signal:controller.signal});
      video.currentTime = from;
    });
    if (Math.abs(video.currentTime - from) > 0.25 || video.currentTime >= start) throw Error('Setup landed outside the pre-roll');
    rows.push(read('observation-start'));
    void video.play().catch(e => rows.push(read('play-error:' + e.name)));
    return {duration, start, from, actual:video.currentTime};
    }, {selector, original: url, seconds: options.seconds, expectedDuration});
    const run = {episode, setup, firstMediaIndex: report.media.length};
    (report.episodes ??= []).push(run);
    const deadline = Date.now() + 25000;
    let terminalAt;
    while (Date.now() < deadline) {
      const sample = await page.evaluate(selector => {
        const video = document.querySelector(selector);
        return {href: location.href, rows: window.__odTailFollowProbe?.rows.splice(0) ?? [],
          time: video?.currentTime, duration: video?.duration, paused: video?.paused, ready: video?.readyState, ended: video?.ended};
      }, selector);
      report.media.push(...sample.rows);
      await collectDecisions();
      if (expectTransition && sample.href === next && sample.ready >= 2 && !sample.paused &&
          Math.abs(sample.duration - 1244) <= 2 && sample.time > 0 && sample.time < 1244 - options.seconds) {
        report.nextPlayback ??= {first: sample.time, duration: sample.duration};
        if (sample.time >= report.nextPlayback.first + 0.25) {
          report.nextPlayback.last = sample.time;
          run.terminal = {...sample, rows: undefined};
          break;
        }
      }
      if (!expectTransition && (sample.href !== url || sample.ended)) {
        terminalAt ??= Date.now();
        run.terminal = {...sample, rows: undefined};
        if (Date.now() - terminalAt >= 1000) break;
      }
      await new Promise(resolve => setTimeout(resolve, 120));
    }

    const decisions = report.decisions.filter(e => String(e.episode) === episode);
    const triggers = decisions.filter(e => e.decision === 'triggered');
    assert.equal(triggers.length, 1, 'Expected one automatic dispatch on episode ' + episode);
    const [action] = triggers;
    run.action = action;
    assert.equal(action.source, 'series');
    assert.equal(action.ruleKind, 'tail');
    assert.equal(action.entry, 'natural-crossing');
    assert.ok(Number.isFinite(action.id) && action.previous < action.start && action.from >= action.start && action.from < action.start + 1);
    assert.ok(Math.abs(action.duration - setup.duration) <= 0.05 && Math.abs(action.start - setup.start) <= 0.05 &&
      Math.abs(action.end - action.start - options.seconds) < 0.001 && action.to === action.end);
    assert.ok(decisions.some(e => e.decision === 'before-start' && e.source === 'series' && e.time < action.start && e.at <= action.at));
    const observed = report.media.slice(run.firstMediaIndex);
    const startIndex = observed.findIndex(e => e.event === 'observation-start');
    assert.ok(startIndex >= 0, 'Expected media events from the settled pre-roll');
    const seeks = observed.slice(startIndex + 1).filter(e => e.event === 'seeking' && e.trusted && e.href === url);
    assert.ok(seeks.length >= 1 && seeks.length <= 2, 'Expected one seek, optionally followed by iYF buffer correction');
    assert.ok(Math.abs(seeks[0].time - action.to) <= 0.25);
    const outcomes = decisions.filter(e => e.id === action.id && ['confirmed', 'unconfirmed'].includes(e.decision));
    assert.deepEqual(outcomes.map(e => e.decision), ['confirmed']);
    const [outcome] = outcomes;
    run.outcome = outcome;
    assert.equal(outcome.source, 'series');
    assert.equal(outcome.to, action.to);
    assert.ok(observed.some(e => e.event === 'seeked' && e.trusted && e.href === url &&
      Math.abs(e.time - outcome.landed) <= 0.10), 'The same action must have a real seeked event at its logged landing');
    if (expectTransition) assert.ok(Number.isFinite(report.nextPlayback?.last), 'Episode 201 must start and continue playing');
    else assert.ok(run.terminal?.ended || (run.terminal?.href && run.terminal.href !== url), 'Expected native end or transition on episode 201');
    return run;
  }
  const first = await observeEpisode(original, '200', 1156, true);
  const second = await observeEpisode(next, '201', 1244, false);
  assert.notEqual(first.action.start, second.action.start);
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';
  report.error = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  if (probeInstalled) await page.evaluate(() => {
    window.__odTailFollowProbe?.stop();
    delete window.__odTailFollowProbe;
  }).catch(() => {});
  if (runtimeEnabled) await page.cdp('Runtime.disable').catch(() => {});
  await writeFile(options.output, JSON.stringify(report, null, 2));
  console.log({result:report.result, error:report.error, episodes:report.episodes,
    decisions:report.decisions, nextPlayback:report.nextPlayback, output:options.output});
}
