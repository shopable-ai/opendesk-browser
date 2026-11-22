async function main() {
  const fixture = document.querySelector('main[data-fixture="video-auto-skip-r1"]');
  if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1' ||
      location.pathname !== '/fixture.html' || window !== window.top || !fixture) {
    return { status: 'BLOCKED', reason: '仅允许在本机测试片段上运行' };
  }
  const report = fixture.querySelector('#report');
  if (report.dataset.stage !== 'idle') return { status: 'BLOCKED', reason: '本测试文档已运行' };
  const scope = new AbortController();
  const page = location.href;
  const evidence = { observed: [], T01: {}, T02: {}, T03: {}, seeks: [] };
  const render = (stage) => {
    report.textContent = JSON.stringify(evidence, null, 2);
    report.dataset.stage = stage;
  };
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const check = (ok, step) => { if (!ok) throw new Error(step); };
  const wait = async (test, step, ms = 3000) => {
    const end = performance.now() + ms;
    do {
      check(!scope.signal.aborted, '文档已离开');
      const value = test();
      if (value) return value;
      await pause(40);
    } while (performance.now() < end);
    throw new Error(step);
  };
  const read = (v) => Math.round(v.currentTime * 1000) / 1000;
  const closeTo = (a, b) => Math.abs(a - b) <= 0.35;
  const seekableFrom = (v, from, to) => {
    const ranges = v.seekable;
    for (let i = 0; i < ranges.length; i++) {
      if (Math.min(from, to) >= ranges.start(i) && Math.max(from, to) <= ranges.end(i)) return true;
    }
    return false;
  };
  const pick = () => {
    const players = fixture.querySelectorAll('video#feature');
    return players.length === 1 && players[0] instanceof HTMLVideoElement ? players[0] : null;
  };
  const range = (duration, rule) => {
    if (!Number.isFinite(duration) || duration <= 0) return null;
    const [start, end] = rule.lastSeconds === undefined
      ? [rule.start, rule.end] : [duration - rule.lastSeconds, duration];
    return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && start < end &&
      end <= duration && end - start < duration ? [start, end] : null;
  };
  const video = pick();
  if (!video) return { status: 'BLOCKED', reason: '测试主播放器缺失或不唯一' };
  const actions = evidence.seeks;
  const identity = () => ['work', 'season', 'episode', 'line', 'version'].map((key) => fixture.dataset[key]).join('/');
  let binding;
  let source = 'clip-a.webm';
  let ownsPlayback = false;
  let unresolved;
  const disarm = (reason) => {
    if (binding?.pending) {
      const action = binding.pending;
      Object.assign(action, { outcome: 'UNKNOWN', reason });
      unresolved = action;
    }
    binding = null;
  };
  const ownsVideo = () => !scope.signal.aborted && location.href === page && fixture.isConnected &&
    pick() === video && video.getAttribute('src') === source && video.currentSrc === new URL(source, page).href;
  const requireVideo = () => check(ownsVideo(), '文档、播放器或素材已变化');
  const arm = (name, rule) => {
    requireVideo();
    check(!unresolved && !binding?.pending && !video.seeking, '上一次定位尚未核清');
    binding = { name, rule, source, identity: identity(), duration: video.duration, attempted: false, manual: false };
  };
  const owns = (b) => b && ownsVideo() && b.source === source && b.identity === identity() && b.duration === video.duration;
  const current = () => {
    if (binding && !owns(binding)) disarm('BINDING_CHANGED');
    return binding;
  };
  const stopPlayback = () => {
    if (ownsPlayback && ownsVideo() && !unresolved && !binding?.pending) video.pause();
    ownsPlayback = false;
  };
  const seekSetup = async (to) => {
    requireVideo();
    check(!unresolved && !binding?.pending && !video.seeking, '上一次定位尚未核清');
    stopPlayback();
    check(video.paused && seekableFrom(video, to, to), '测试定位要求暂停且落点可定位');
    disarm('SETUP');
    video.currentTime = to;
    await wait(() => ownsVideo() && !video.seeking && closeTo(read(video), to), '未完成测试定位');
  };
  const recordEvent = (event) => {
    const row = evidence.observed.find((item) => item.type === event.type);
    if (row) row.count++;
    else evidence.observed.push({ type: event.type, count: 1, firstTime: read(video), trusted: event.isTrusted });
  };

  render('running');
  window.addEventListener('pagehide', () => {
    disarm('DOCUMENT_LEFT');
    scope.abort();
  }, { signal: scope.signal });
  for (const type of ['play', 'pause', 'timeupdate', 'seeking', 'seeked', 'ended', 'durationchange']) {
    video.addEventListener(type, recordEvent, { signal: scope.signal });
  }
  for (const type of ['emptied', 'loadstart', 'durationchange', 'error']) {
    video.addEventListener(type, () => disarm('MEDIA_LIFECYCLE_CHANGED'), { signal: scope.signal });
  }
  const userInput = (event) => {
    if (!event.isTrusted || !current()) return;
    if (binding.pending) disarm('USER_INPUT_DURING_SEEK');
    else {
      binding.manual = true;
      delete binding.outside;
    }
  };
  video.addEventListener('pointerdown', userInput, { capture: true, signal: scope.signal });
  video.addEventListener('keydown', userInput, { capture: true, signal: scope.signal });
  video.addEventListener('seeking', (event) => {
    if (!event.isTrusted || !current()) return;
    if (binding.pending) {
      if (++binding.pending.seekingEvents !== 1 || !closeTo(read(video), binding.pending.requested)) {
        disarm('COMPETING_SEEK');
      }
    } else {
      binding.manual = true;
      delete binding.outside;
    }
  }, { signal: scope.signal });
  video.addEventListener('seeked', (event) => {
    if (!event.isTrusted || !current()?.pending) return;
    const action = binding.pending;
    const actual = read(video);
    if (!action.seekingAfterWrite || action.seekingEvents !== 1 || video.seeking || !closeTo(actual, action.requested)) {
      action.observedTime = actual;
      disarm('UNCONFIRMED_LANDING');
      return;
    }
    action.landed = actual;
    action.outcome = 'CONFIRMED';
    binding.pending = null;
  }, { signal: scope.signal });
  video.addEventListener('timeupdate', (event) => {
    if (!event.isTrusted || !current() || unresolved || video.paused || video.seeking || video.ended || binding.attempted) return;
    const bounds = range(video.duration, binding.rule);
    if (!bounds) return;
    const [start, end] = bounds;
    const before = video.currentTime;
    if (!Number.isFinite(before)) return;
    if (before < start || before >= end) {
      binding.outside = read(video);
      binding.manual = false;
      return;
    }
    if (binding.manual || (start > 0 && !(binding.outside < start)) || !seekableFrom(video, before, end)) return;
    binding.attempted = true;
    const action = { name: binding.name, outside: binding.outside, before: read(video), requested: end,
      seekingEvents: 0, outcome: 'PENDING' };
    binding.pending = action;
    actions.push(action);
    try {
      video.currentTime = end;
      action.seekingAfterWrite = video.seeking;
      if (!action.seekingAfterWrite) disarm('SETTER_NOT_OBSERVED');
    } catch { disarm('SETTER_THROWN'); }
  }, { signal: scope.signal });

  const play = async () => {
    requireVideo();
    ownsPlayback = true;
    const started = await Promise.race([video.play().then(() => true), pause(2500).then(() => false)]);
    check(started && ownsVideo() && !video.paused, '测试片段播放未确认');
  };
  const land = async (name) => {
    const action = await wait(() => actions.find((item) => item.name === name), '未触发: ' + name);
    try {
      await wait(() => {
        current();
        return action.outcome !== 'PENDING';
      }, 'seek 完成未知: ' + name);
    } catch (error) {
      disarm('RECEIPT_TIMEOUT');
      throw error;
    }
    check(action.outcome === 'CONFIRMED' && owns(binding), 'seek 完成未知: ' + name);
    return { ...action };
  };

  try {
    await wait(() => video.readyState >= 2 && video.seekable.length > 0 && Number.isFinite(video.duration), '素材未就绪');
    await seekSetup(30);
    const duplicate = video.cloneNode();
    duplicate.removeAttribute('src');
    fixture.append(duplicate);
    const ambiguousRejected = pick() === null;
    duplicate.remove();
    evidence.T01 = {
      fixtureIdentity: Object.fromEntries(['work', 'season', 'episode', 'line', 'version'].map((key) => [key, fixture.dataset[key]])),
      selected: video.id, currentTime: read(video), duration: video.duration,
      seekable: Array.from({ length: video.seekable.length }, (_, i) => [video.seekable.start(i), video.seekable.end(i)]),
      topLevelVideos: document.querySelectorAll('video').length,
      frames: [...fixture.querySelectorAll('iframe')].map((f) => ({ sandboxed: f.hasAttribute('sandbox'), readable: !!f.contentDocument,
        videos: f.contentDocument?.querySelectorAll('video').length ?? null })), ambiguousRejected,
    };
    check(ambiguousRejected && evidence.T01.topLevelVideos === 2 && evidence.T01.frames[0]?.videos === 1 &&
      evidence.T01.frames[1]?.readable === false, '播放器或框架边界与夹具不符');
    const firstDuration = video.duration;
    evidence.T03.firstBounds = range(firstDuration, { lastSeconds: 90 });

    arm('intro', { start: 0, end: 90 });
    await pause(350);
    evidence.T02.pausedSave = { time: read(video), paused: video.paused, attempts: actions.length };
    check(video.paused && read(video) === 30 && actions.length === 0, '暂停保存改变了播放状态');
    await play();
    evidence.T02.intro = await land('intro');
    check(evidence.T02.intro.before >= 30 && evidence.T02.intro.before < 31.5, '非预期片头触发点');
    const scrub = fixture.querySelector('#scrub');
    const introBinding = binding;
    let drag;
    let trustedDrag;
    const opts = { signal: scope.signal };
    scrub.addEventListener('pointerdown', (event) => {
      const box = scrub.getBoundingClientRect();
      if (!event.isTrusted || event.button !== 0 || report.dataset.stage !== 'manual-drag' ||
          box.right - event.clientX > 24 || !owns(introBinding) || video.paused || video.seeking) return;
      scrub.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, x: event.clientX, moved: false };
    }, opts);
    scrub.addEventListener('pointermove', (event) => {
      if (event.isTrusted && drag?.id === event.pointerId && (event.buttons & 1) && Math.abs(drag.x - event.clientX) >= 8) drag.moved = true;
    }, opts);
    scrub.addEventListener('pointercancel', () => { drag = null; }, opts);
    scrub.addEventListener('pointerup', (event) => {
      const completed = drag?.id === event.pointerId && drag.moved &&
        drag.x - event.clientX >= 8 && event.clientX - scrub.getBoundingClientRect().left <= 24;
      drag = null;
      if (report.dataset.stage !== 'manual-drag' || !event.isTrusted || !completed ||
          binding !== introBinding || !owns(binding) || video.paused || video.seeking ||
          unresolved || !seekableFrom(video, video.currentTime, 30)) return;
      report.dataset.stage = 'running';
      const before = read(video);
      try { video.currentTime = 30; trustedDrag = { before, requested: 30 }; }
      catch { /* No automatic replay of an unconfirmed seek. */ }
    }, opts);
    render('manual-drag');
    await wait(() => trustedDrag && owns(introBinding) && !video.seeking && closeTo(read(video), 30), '未收到真实回拖或落点未确认', 14000);
    const returned = read(video);
    await wait(() => owns(introBinding) && !video.paused && !video.seeking && read(video) >= returned + 0.45,
      '回拖后播放未推进');
    evidence.T02.manual = { ...trustedDrag, trustedDrag: true, returned, continuedAt: read(video), paused: video.paused, attempts: actions.length };
    check(!video.paused && read(video) > returned && read(video) < 33 && actions.length === 1, '回拖后没有继续播放或发生重复跳过');
    await seekSetup(95);
    arm('past-intro', { start: 0, end: 90 });
    await play();
    await pause(420);
    evidence.T02.pastEnd = { start: 95, at: read(video), attempts: actions.length };
    check(owns(binding) && !video.paused && read(video) > 95.1 && actions.length === 1, '超过片头结束点后未继续播放或发生倒退');

    // No spent-intro latch here: simulate a site control seeking into a fresh rule.
    video.currentTime = 30;
    await wait(() => owns(binding) && !video.paused && !video.seeking && read(video) >= 30.45 && read(video) < 33,
      '未观察到新规则下主动回拖后的播放');
    evidence.T02.freshRuleManual = { advancedTo: read(video), attempts: actions.length, suppressed: binding.manual };
    check(binding.manual && actions.length === 1, '主动进入新规则时触发了重复跳过');

    const partialStart = firstDuration - 18;
    const partialEnd = firstDuration - 8;
    await seekSetup(partialStart - 0.9);
    arm('partial-tail', { start: partialStart, end: partialEnd });
    await play();
    evidence.T03.partial = await land('partial-tail');
    await wait(() => owns(binding) && !video.seeking && read(video) > partialEnd + 0.35, '跳过指定片尾后未播放余下内容');
    Object.assign(evidence.T03.partial, { continuedAt: read(video), paused: video.paused, ended: video.ended, sameDocument: location.href === page });
    check(evidence.T03.partial.outside < partialStart && evidence.T03.partial.before >= partialStart &&
      !video.paused && !video.ended && location.href === page, '未观察到自然进入片尾或片尾播放状态不符');

    const prior = binding;
    requireVideo();
    stopPlayback();
    source = 'clip-b.webm';
    video.src = source;
    video.load();
    evidence.T03.unknown = { durationIsNaN: Number.isNaN(video.duration),
      bounds: range(video.duration, { lastSeconds: 90 }), oldBindingRejected: !owns(prior), attempts: actions.length };
    check(evidence.T03.unknown.durationIsNaN && evidence.T03.unknown.bounds === null && !owns(prior), '换源未知时长未暂停片尾动作');
    await wait(() => video.readyState >= 2 && video.seekable.length > 0 && Number.isFinite(video.duration) && video.duration !== firstDuration, '未读到换源时长');
    check(actions.length === evidence.T03.unknown.attempts, '媒体未就绪期间发出了定位');
    evidence.T01.versionAfterSourceChange = 'B (测试素材)';
    evidence.T03.changed = { duration: video.duration, bounds: range(video.duration, { lastSeconds: 90 }), oldBindingRejected: !owns(prior) };
    check(evidence.T03.changed.oldBindingRejected && evidence.T03.changed.bounds?.[0] === video.duration - 90, '换源后未按新时长计算');
    await seekSetup(evidence.T03.changed.bounds[0] - 0.9);
    arm('last-90', { lastSeconds: 90 });
    await play();
    evidence.T03.last90 = await land('last-90');
    await wait(() => video.ended && evidence.observed.some((row) => row.type === 'ended'), '未观察到真实播放结束');
    evidence.T03.last90.ended = video.ended;
    evidence.T03.last90.sameDocument = location.href === page;
    check(evidence.T03.last90.outside < evidence.T03.changed.bounds[0] &&
      location.href === page && actions.length === 3, '未自然进入最后90秒或发生意外动作');

    // A player can retain its node, URL, source and duration when episode metadata changes.
    await seekSetup(30);
    arm('stale-identity', { start: 0, end: 90 });
    const oldEpisode = fixture.dataset.episode;
    fixture.dataset.episode = '4';
    await play();
    const advanced = await wait(() => ownsVideo() && !video.seeking && read(video) >= 30.4 && read(video) < 33 && read(video),
      '身份切换后的原媒体未按预期继续播放');
    evidence.T01.sameMediaNewEpisode = { continuedAt: advanced, oldBindingDisarmed: !binding, attempts: actions.length };
    check(!binding && actions.length === 3, '剧集身份变化后旧绑定仍可定位');
    stopPlayback();
    fixture.dataset.episode = oldEpisode;

    // This listener simulates a page script independently moving the local fixture during our seek.
    await seekSetup(30);
    arm('overlap', { start: 0, end: 90 });
    const overlapBinding = binding;
    video.addEventListener('seeking', () => { video.currentTime = 45; }, { once: true, signal: scope.signal });
    await play();
    const overlap = await wait(() => unresolved?.name === 'overlap' && unresolved, '重叠定位未被标为未知');
    await wait(() => ownsVideo() && !video.seeking && read(video) >= 45.4 && read(video) < 48, '重叠后未观察到夹具读数');
    const beforeRearm = actions.length;
    let rearmRejected = false;
    try { arm('replay', { start: 0, end: 90 }); } catch { rearmRejected = true; }
    evidence.seekConflict = { outcome: overlap.outcome, reason: overlap.reason, observedAt: read(video),
      attempts: beforeRearm, rearmRejected };
    check(rearmRejected && actions.length === 4 && overlap.landed === undefined, '重叠定位被确认或重放');

    // Isolate fixture teardown from the expected unknown; no playback mutation after the collision.
    check(owns(overlapBinding), '替换前必须仍是同一测试媒体');
    const replacement = video.cloneNode();
    replacement.removeAttribute('src');
    video.replaceWith(replacement);
    evidence.T01.replacement = { reboundByDetector: pick() === replacement, staleBindingRejected: !owns(overlapBinding) };
    check(evidence.T01.replacement.reboundByDetector && evidence.T01.replacement.staleBindingRejected, '旧播放器绑定仍被接受');
    check(['play', 'pause', 'timeupdate', 'ended', 'durationchange', 'seeking', 'seeked']
      .every((type) => evidence.observed.some((row) => row.type === type && row.trusted)), '缺少真实 HTMLMediaElement 事件');
    evidence.status = 'PASS';
    render('done');
  } catch (error) {
    if (binding?.pending) disarm('RUN_INTERRUPTED');
    evidence.status = 'FAIL';
    evidence.failure = error instanceof Error && error.name === 'Error' ? error.message : error.name;
    render('failed');
  } finally {
    stopPlayback();
    scope.abort();
  }
  return { status: evidence.status, fixture: 'video-auto-skip-r1', attempts: actions.length, failure: evidence.failure };
}
