import {resolveInterval} from '../rules.js';

const timedKinds = ['intro', 'outro'];
const nextStopReasons = new Set(['next-site-handling', 'next-list-incomplete', 'next-list-end', 'next-list-gap', 'next-line-unavailable']);
const contextFields = ['seriesKey', 'episodeKey', 'title', 'season', 'episode', 'line'];
const close = (a, b) => Math.abs(a - b) <= 0.25;
const durationOf = media => Number.isFinite(media.duration) && media.duration > 0 ? media.duration : null;
const timeOf = media => Number.isFinite(media.currentTime) && media.currentTime >= 0 ? media.currentTime : null;
const inside = (time, range) => range && Number.isFinite(time) && time >= range.start && time < range.end;
const publicValue = value => typeof value === 'number' && Number.isFinite(value) ||
  typeof value === 'string' && value.length > 0 && value.length <= 512 &&
  !/(?:[a-z][a-z0-9+.-]*:\/\/|\b(?:blob|data|file):|^\/|[\u0000-\u001f\u007f])/i.test(value);

function sharesSeekableSpan(media, from, to) {
  const ranges = media.seekable;
  const first = Math.min(from, to), last = Math.max(from, to);
  if (!ranges || from === null || to === null) return false;
  try {
    for (let i = 0; i < ranges.length; i++) {
      if (ranges.start(i) <= first && last <= ranges.end(i)) return true;
    }
  } catch { /* A changing range is not evidence that the seek is safe. */ }
  return false;
}

/**
 * A trusted adapter owns identity, rule resolution and the bridge. Bindings have a unique
 * opaque id (or token), context and media. Rebind with a new object on document, episode,
 * player or source changes. Authorization must recheck the bridge on every call.
 * Navigation is dispatched once; its adapter reconciles it to arrived/playing/failed/unknown.
 */
export function createPlayer({getBinding, authorize, selectNext, navigate, onStatus} = {}) {
  let current = null, disposed = false, navigation = null, uncertainSeek = null, seekSequence = 0;
  const active = scope => Boolean(scope && !disposed && current === scope && !scope.retired &&
    getBinding?.() === scope.binding);
  const fenced = (scope, revision) => active(scope) && scope.revision === revision;
  const bindingId = binding => binding.id ?? binding.token;
  const matches = (scope, binding) => active(scope) && (scope.binding === binding ||
    (publicValue(bindingId(scope.binding)) && bindingId(scope.binding) === binding));

  function snapshot() {
    const scope = current;
    const nextAction = navigation?.action;
    const result = active(scope) ? {
      state: scope.denied ? 'unavailable' : 'ready',
      ...(scope.reason && {reason: scope.reason}),
      ...(scope.denied && {reason: 'authorization-unavailable'}),
      ...(publicValue(bindingId(scope.binding)) && {binding: bindingId(scope.binding)}),
      context: Object.fromEntries(contextFields.flatMap(field => {
        const value = (scope.binding.context ?? scope.binding)[field];
        return publicValue(value) ? [[field, value]] : [];
      })),
      media: {time: timeOf(scope.media), duration: durationOf(scope.media), paused: scope.media.paused, revision: scope.mediaRevision},
    } : {state: 'unavailable', reason: disposed ? 'disposed' : 'no-current-media'};
    const action = scope?.action ?? nextAction;
    if (uncertainSeek) {
      result.action = {...uncertainSeek.action};
      result.reason = uncertainSeek.reason;
    } else if (navigation?.locked || navigation?.action.state === 'pending') result.action = {...nextAction};
    else if (action) result.action = {...action};
    if (navigation?.locked) result.reason = 'navigation-unconfirmed';
    return result;
  }

  function publish() {
    const value = snapshot();
    try { onStatus?.(value); } catch { /* Observers do not own player actions. */ }
    return value;
  }

  function invalidate(scope) {
    scope.revision++;
    scope.queued = null;
  }

  async function readRules(scope, revision) {
    let rules;
    try { rules = await authorize?.(scope.binding); } catch { /* Treat a rejected read as unavailable. */ }
    if (!fenced(scope, revision)) return null;
    const denied = !rules || typeof rules !== 'object' || Array.isArray(rules);
    if (scope.denied !== denied) {
      scope.denied = denied;
      publish();
    }
    return !denied && fenced(scope, revision) ? rules : null;
  }

  function settleSeek(scope, checked, reason) {
    const pending = scope.pending;
    if (!pending) return;
    clearTimeout(pending.timer);
    scope.pending = null;
    const {id, kind, from, to, intent} = pending;
    scope.action = {id, kind, state: checked ? 'confirmed' : 'unknown', from, to};
    scope.reason = reason;
    if (!checked) uncertainSeek = {action: scope.action, reason};
    scope.previous = timeOf(scope.media);
    if (checked && timedKinds.includes(kind)) scope.undo = {id, from};
    if (checked && (kind === 'preview' || kind === 'undo')) holdAt(scope, scope.previous);
    if (checked && intent === 'outro') scope.inspection = to;
    if (checked && intent === 'return') scope.inspection = null;
    pending.resolve(publish());
  }

  function startSeek(scope, kind, from, to, duration, intent, id = ++seekSequence) {
    invalidate(scope);
    scope.natural = false;
    scope.terminal = to === duration;
    scope.undo = null;
    scope.reason = undefined;
    scope.action = {id, kind, state: 'pending', from, to};
    return new Promise(resolve => {
      const pending = {id, kind, from, to, duration, intent, resolve, seekingEvents: 0};
      scope.pending = pending;
      pending.timer = setTimeout(() => settleSeek(scope, false, 'seek-unconfirmed'), 5000);
      try {
        scope.media.currentTime = to;
        if (scope.pending === pending && !scope.media.seeking) {
          settleSeek(scope, false, 'seek-not-observed');
        } else if (scope.pending === pending) publish();
      } catch {
        settleSeek(scope, false, 'seek-dispatch-unknown');
      }
    });
  }

  function holdAt(scope, time) {
    for (const kind of timedKinds) scope.hold[kind] = time;
  }

  const blocked = scope => uncertainSeek || scope.pending || scope.manual || scope.denied ||
    navigation?.locked || navigation?.action.state === 'pending';

  async function maybeNavigate(scope, revision, rules) {
    const {media, binding} = scope;
    const ended = () => fenced(scope, revision) && media.ended && !media.seeking && !scope.terminal &&
      scope.inspection === null && !blocked(scope);
    if (!ended() || rules.next !== true || scope.nextDispatched) return;
    const identity = binding.context ?? binding;
    if (!publicValue(identity.seriesKey) || !publicValue(identity.episodeKey) || !selectNext || !navigate) return;
    let selected;
    try { selected = selectNext(binding); } catch { /* An ambiguous target cannot be used. */ }
    const target = selected && (Object.hasOwn(selected, 'target') ? selected.target :
      Object.hasOwn(selected, 'reason') ? null : selected);
    if (!ended()) return;
    if (!target || typeof target.then === 'function') {
      scope.action = {kind: 'next', state: 'unavailable'};
      scope.reason = nextStopReasons.has(selected?.reason) ? selected.reason : 'next-not-confirmed';
      publish();
      return;
    }
    scope.nextDispatched = true;
    scope.reason = undefined;
    scope.action = null;
    const receipt = {action: {kind: 'next', state: 'pending'}, locked: false};
    navigation = receipt;
    let outcome;
    try {
      const stillCurrent = () => fenced(scope, revision) && navigation === receipt && scope.media.ended && !scope.media.seeking;
      const dispatched = navigate(binding, target, async () => {
        if (!stillCurrent()) return false;
        const latest = await readRules(scope, revision);
        return stillCurrent() && latest?.next === true;
      });
      publish();
      outcome = await dispatched;
    } catch { /* Dispatch may have had an effect before throwing. */ }
    if (disposed || navigation !== receipt) return;
    const state = typeof outcome === 'string' ? outcome : outcome?.state;
    receipt.action = {kind: 'next', state: ['playing', 'arrived', 'failed'].includes(state) ? state : 'unknown'};
    receipt.locked = receipt.action.state === 'unknown';
    publish();
  }

  async function evaluate(scope, signal) {
    const {media} = scope, revision = scope.revision;
    if (blocked(scope) || media.seeking) return;
    const rules = await readRules(scope, revision);
    if (!rules || blocked(scope) || media.seeking) return;
    if (signal.ended) {
      await maybeNavigate(scope, revision, rules);
      return;
    }
    if (media.paused || media.ended) return;
    const time = timeOf(media), duration = durationOf(media);
    if (duration === null || time === null) return;
    const ranges = Object.fromEntries(timedKinds.map(kind => [kind, resolveInterval(rules[kind], duration)]));
    const {intro, outro} = ranges;
    if (intro && outro && (intro.start < outro.end && outro.start < intro.end ||
        Math.min(intro.start, outro.start) === 0 && Math.max(intro.end, outro.end) === duration &&
        (intro.end === outro.start || outro.end === intro.start))) return;
    for (const kind of timedKinds) {
      const range = ranges[kind];
      const signature = range ? range.start + ':' + range.end : null;
      const initial = !Object.hasOwn(scope.intervals, kind);
      const changed = !initial && scope.intervals[kind] !== signature;
      scope.intervals[kind] = signature;
      const held = inside(time, range) && inside(scope.hold[kind], range);
      if (!held) scope.hold[kind] = null;
      if (!inside(time, range) || held) continue;
      const crossing = !changed && signal.previous !== null && signal.previous < range.start && time > signal.previous;
      const startup = kind === 'intro' && range.start === 0 && scope.startup && time < 3;
      if (!(signal.play || crossing || startup) || !sharesSeekableSpan(media, time, range.end)) continue;
      // No await between the final ownership check and the seek.
      if (fenced(scope, revision) && !media.paused && !media.seeking && !media.ended) {
        scope.startup = false;
        void startSeek(scope, kind, time, range.end, duration);
      }
      return;
    }
  }

  function queue(scope, signal) {
    if (scope.queued && !signal.ended) {
      if (scope.queued.ended) return;
      signal.play ||= scope.queued.play;
      signal.previous = scope.queued.previous;
    }
    scope.queued = signal;
    if (scope.running) return;
    scope.running = true;
    void (async () => {
      try {
        while (active(scope) && scope.queued) {
          const next = scope.queued;
          scope.queued = null;
          await evaluate(scope, next);
        }
      } finally { scope.running = false; }
    })();
  }

  function listen(scope) {
    const {media, listeners} = scope;
    function on(type, fn) {
      const listener = event => { if (event.isTrusted && active(scope)) fn(); };
      listeners.set(type, listener);
      media.addEventListener(type, listener);
    }
    on('play', () => {
      if (!scope.wasPaused || media.paused || media.seeking || media.ended) return;
      scope.wasPaused = false;
      scope.startup = timeOf(media) !== null && timeOf(media) < 0.75;
      invalidate(scope);
      queue(scope, {play: true, previous: timeOf(media)});
    });
    on('pause', () => {
      if (!media.paused) return;
      scope.wasPaused = true;
      scope.startup = false;
      if (media.ended) return; // The UA may dispatch pause immediately before a real ended.
      scope.natural = false;
      invalidate(scope);
    });
    on('timeupdate', () => {
      if (scope.pending || media.seeking) return;
      const previous = scope.previous, now = timeOf(media);
      scope.previous = now;
      if (now >= 3) scope.startup = false;
      if (media.paused || media.ended) return;
      if (previous !== null && now !== null && now > previous) {
        const duration = durationOf(media);
        if (duration !== null && now < duration) {
          scope.terminal = false;
          scope.natural = true;
          scope.lastMotion = now;
        }
      }
      queue(scope, {previous});
    });
    on('seeking', () => {
      invalidate(scope);
      scope.startup = false;
      scope.natural = false;
      const pending = scope.pending;
      if (pending) {
        if (++pending.seekingEvents !== 1 || !close(timeOf(media) ?? Infinity, pending.to)) {
          settleSeek(scope, false, 'competing-seek');
        }
      } else {
        scope.undo = null;
        if (scope.action?.state === 'confirmed' && timedKinds.includes(scope.action.kind)) scope.action = null;
        scope.previous = null;
        holdAt(scope, timeOf(media));
      }
    });
    on('seeked', () => {
      const pending = scope.pending;
      const landed = timeOf(media);
      if (pending) {
        const confirmed = pending.seekingEvents === 1 && !media.seeking && durationOf(media) === pending.duration &&
          landed !== null && close(landed, pending.to);
        settleSeek(scope, confirmed, confirmed ? undefined : 'seek-unconfirmed');
      } else {
        invalidate(scope);
        scope.previous = landed;
        scope.natural = false;
        holdAt(scope, landed);
        if (landed !== null && scope.inspection !== null && landed < scope.inspection) scope.inspection = null;
        if (landed !== null && landed === durationOf(media)) scope.terminal = true;
      }
    });
    for (const type of ['pointerdown', 'keydown']) on(type, () => {
      if (scope.pending) settleSeek(scope, false, 'user-input-during-seek');
      if (media.ended) invalidate(scope);
    });
    on('ended', () => {
      const duration = durationOf(media), now = timeOf(media);
      const endWindow = Math.max(1, (media.playbackRate || 1) * 2);
      if (!media.ended || !scope.natural || scope.terminal || blocked(scope) || media.seeking ||
          duration === null || now === null || now < duration || duration - scope.lastMotion > endWindow) return;
      scope.wasPaused = true;
      scope.natural = false;
      invalidate(scope);
      queue(scope, {ended: true});
    });
    on('durationchange', () => {
      scope.mediaRevision++;
      invalidate(scope);
      scope.natural = false;
      scope.previous = timeOf(media);
      scope.undo = null;
      if (scope.pending) settleSeek(scope, false, 'duration-changed');
      else if (scope.action?.state === 'confirmed') scope.action = null;
    });
    for (const type of ['emptied', 'loadstart', 'abort', 'error']) {
      on(type, () => { retire(scope); publish(); });
    }
  }

  function retire(scope) {
    scope.retired = true;
    invalidate(scope);
    for (const [type, listener] of scope.listeners) scope.media.removeEventListener(type, listener);
    scope.listeners.clear();
    if (scope.pending) settleSeek(scope, false, 'media-binding-changed');
  }

  function bind(binding) {
    if (disposed || (binding && current?.binding === binding)) return snapshot();
    if (current) retire(current);
    current = null;
    if (binding?.media && getBinding?.() === binding) {
      const media = binding.media;
      current = {
        binding, media, listeners: new Map(), revision: 0, mediaRevision: 0, previous: timeOf(media),
        wasPaused: media.paused, startup: !media.paused && timeOf(media) !== null && timeOf(media) < 0.75,
        intervals: {}, hold: {intro: null, outro: null}, denied: false, inspection: null,
      };
      listen(current);
    }
    return publish();
  }

  function refresh() {
    if (active(current)) {
      invalidate(current);
      current.startup = false;
      current.denied = false;
      current.previous = timeOf(current.media);
      current.intervals = {};
    }
    return publish();
  }

  async function manualSeek(binding, kind, {seconds, intent, requestId, mediaRevision, duration: expectedDuration, actionId} = {}) {
    const scope = current;
    if (!matches(scope, binding) || blocked(scope) || scope.media.seeking) return snapshot();
    const {media} = scope;
    const undo = scope.undo;
    const sameMedia = () => scope.mediaRevision === mediaRevision && durationOf(media) === expectedDuration;
    if (!sameMedia() || (kind === 'undo' && (!undo || undo.id !== actionId))) return snapshot();
    const to = kind === 'undo' ? undo?.from : seconds;
    if (!Number.isFinite(to) || to < 0) return snapshot();
    invalidate(scope);
    const revision = scope.revision;
    scope.manual = true;
    try {
      const rules = await readRules(scope, revision);
      if (!rules || !fenced(scope, revision) || !sameMedia() || uncertainSeek || scope.pending || media.seeking ||
          navigation?.locked || navigation?.action.state === 'pending') return snapshot();
      const duration = durationOf(media), from = timeOf(media);
      let reason;
      if (duration === null || from === null) reason = 'duration-unavailable';
      else if (to > duration || !sharesSeekableSpan(media, from, to)) reason = 'position-not-seekable';
      if (reason) {
        scope.action = {id: requestId, kind, state: 'unavailable', ...(from !== null && {from}), to};
        scope.reason = reason;
        return publish();
      }
      if (from === to) {
        holdAt(scope, to);
        if (intent === 'outro') scope.inspection = to;
        if (intent === 'return') scope.inspection = null;
        scope.undo = null;
        scope.action = {id: requestId, kind, state: 'confirmed', from, to};
        scope.reason = undefined;
        return publish();
      }
      return await startSeek(scope, kind, from, to, duration, intent, requestId);
    } finally { scope.manual = false; }
  }

  return {
    bind, refresh, snapshot,
    preview: (binding, options) => manualSeek(binding, 'preview', options),
    undo: (binding, options) => manualSeek(binding, 'undo', options),
    dispose() {
      disposed = true;
      if (current) retire(current);
      current = null;
    },
  };
}
