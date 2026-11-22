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

function sameSeekDuration(media, pending) {
  const duration = durationOf(media);
  if (duration === pending.duration) return true;
  // Some players refine the end timestamp when fetching the final segment.
  // Keep the original target; this alone is not evidence that the seek landed.
  return pending.kind === 'outro' && pending.duration - pending.to <= 1 &&
    duration > pending.duration && close(duration, pending.duration) &&
    sharesSeekableSpan(media, pending.to, pending.to);
}

/**
 * A trusted adapter owns identity, rule resolution and the bridge. Bindings have a unique
 * opaque id (or token), context and media. Rebind with a new object on document, episode,
 * player or source changes. Authorization must recheck the bridge on every call.
 * Navigation is dispatched once; its adapter reconciles it to arrived/playing/failed/unknown.
 */
export function createPlayer({getBinding, authorize, selectNext, navigate, onStatus, onOutroDecision, acceptBufferNudge} = {}) {
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

  function reportOutro(scope, decision, range, receipt) {
    if (!onOutroDecision) return;
    const {start, end} = range ?? {};
    const signature = [decision, start, end, durationOf(scope.media), scope.outroSource, scope.outroKind, receipt?.id].join(':');
    if (scope.outroDecision === signature) return;
    scope.outroDecision = signature;
    try {
      onOutroDecision({decision, episode: scope.binding.context?.episode, time: timeOf(scope.media),
        duration: durationOf(scope.media), source: scope.outroSource, ruleKind: scope.outroKind, ...(range && {start, end}), ...receipt});
    } catch { /* Diagnostics cannot affect playback. */ }
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
    const {id, kind, from, to, intent, interval} = pending;
    scope.action = {id, kind, state: checked ? 'confirmed' : 'unknown', from, to};
    scope.reason = reason;
    if (!checked) uncertainSeek = {action: scope.action, reason};
    scope.previous = timeOf(scope.media);
    if (checked && timedKinds.includes(kind)) {
      scope.skipped[kind] = interval;
      scope.undo = {id, from};
    }
    if (checked && (kind === 'preview' || kind === 'undo')) holdAt(scope, scope.previous);
    if (checked && intent === 'outro') scope.inspection = to;
    if (checked && intent === 'return') scope.inspection = null;
    if (kind === 'outro') reportOutro(scope, checked ? 'confirmed' : 'unconfirmed', pending.range, {id, from, to, reason, landed: checked ? scope.previous : undefined});
    pending.resolve(publish());
  }

  function startSeek(scope, kind, from, to, duration, intent, id = ++seekSequence, range) {
    invalidate(scope);
    scope.natural = false;
    scope.terminal = to === duration;
    scope.landing = null;
    scope.undo = null;
    scope.reason = undefined;
    scope.action = {id, kind, state: 'pending', from, to};
    return new Promise(resolve => {
      const pending = {id, kind, from, to, duration, intent, range, interval: scope.intervals[kind], resolve, seekingEvents: 0};
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
    if (!rules || blocked(scope) || media.seeking) {
      if (fenced(scope, revision) && scope.denied) reportOutro(scope, 'rules-unavailable');
      return;
    }
    scope.outroSource = rules.outroSource;
    scope.outroKind = rules.outro?.kind;
    if (signal.ended) {
      await maybeNavigate(scope, revision, rules);
      return;
    }
    if (media.paused || media.ended) return;
    const time = timeOf(media), duration = durationOf(media);
    if (duration === null || time === null) {
      reportOutro(scope, duration === null ? 'duration-unavailable' : 'position-unavailable');
      return;
    }
    const ranges = Object.fromEntries(timedKinds.map(kind => [kind, resolveInterval(rules[kind], duration)]));
    const {intro, outro} = ranges;
    if (intro && outro && (intro.start < outro.end && outro.start < intro.end ||
        Math.min(intro.start, outro.start) === 0 && Math.max(intro.end, outro.end) === duration &&
        (intro.end === outro.start || outro.end === intro.start))) {
      reportOutro(scope, 'conflicting-intervals', outro);
      return;
    }
    const landedIn = range => inside(time, range) && inside(scope.landing?.time, range);
    if (!Object.values(ranges).some(landedIn)) scope.landing = null;
    for (const kind of timedKinds) {
      const range = ranges[kind];
      const signature = rules[kind]?.kind === 'tail' ? 'tail:' + rules[kind].seconds :
        range ? range.start + ':' + range.end : null;
      const initial = !Object.hasOwn(scope.intervals, kind);
      const changed = !initial && scope.intervals[kind] !== signature;
      scope.intervals[kind] = signature;
      const held = inside(time, range) && inside(scope.hold[kind], range);
      if (!held) scope.hold[kind] = null;
      const diagnose = decision => { if (kind === 'outro') reportOutro(scope, decision, range); };
      if (!inside(time, range) || held) {
        diagnose(held ? 'held-for-review' : range ? (time < range.start ? 'before-start' : 'past-end') :
          rules.outro === null || rules.outro?.enabled === false ? 'disabled' : rules.outro ? 'invalid-interval' : 'no-active-rule');
        continue;
      }
      // A browser seek is a rewatch only after this same interval has already skipped.
      const landedHere = landedIn(range);
      if (scope.skipped[kind] === signature && (kind === 'outro' || landedHere)) {
        diagnose('already-skipped');
        continue;
      }
      const crossing = !changed && signal.previous !== null && signal.previous < range.start && time > signal.previous;
      const startup = kind === 'intro' && range.start === 0 && scope.startup && time < 3;
      const firstLanding = landedHere && scope.landing.pending;
      if (!(signal.play || crossing || startup || firstLanding)) {
        diagnose('waiting-for-entry');
        continue;
      }
      if (!sharesSeekableSpan(media, time, range.end)) {
        diagnose('target-not-seekable');
        continue;
      }
      // No await between the final ownership check and the seek.
      if (fenced(scope, revision) && !media.paused && !media.seeking && !media.ended) {
        scope.startup = false;
        const id = ++seekSequence;
        if (kind === 'outro') reportOutro(scope, 'triggered', range, {id, from: time, to: range.end, entry: crossing ? 'natural-crossing' : firstLanding ? 'seek-entry' : 'play', previous: signal.previous});
        void startSeek(scope, kind, time, range.end, duration, undefined, id, range);
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
    function on(type, fn, target = media, capture = false) {
      const listener = event => { if (event.isTrusted && active(scope)) fn(); };
      target.addEventListener(type, listener, capture);
      listeners.push(() => target.removeEventListener(type, listener, capture));
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
        if (duration !== null && now < duration && (!scope.terminal || !close(now, duration))) {
          scope.terminal = false;
          scope.natural = true;
          scope.lastMotion = now;
        }
      }
      queue(scope, {previous});
    });
    on('seeking', () => {
      invalidate(scope);
      scope.landing = null;
      scope.startup = false;
      scope.natural = false;
      const pending = scope.pending;
      if (pending) {
        const position = timeOf(media);
        const count = ++pending.seekingEvents;
        if (count === 1 && close(position ?? Infinity, pending.to)) {
          pending.firstPosition = position;
        } else if (count === 2 && timedKinds.includes(pending.kind) && media.seeking &&
            Math.abs(pending.firstPosition - pending.to) <= 0.01 && sameSeekDuration(media, pending) &&
            acceptBufferNudge?.(media, pending.to, position)) {
          pending.correctedPosition = position;
        } else {
          settleSeek(scope, false, 'competing-seek');
        }
      } else {
        scope.undo = null;
        if (scope.action?.state === 'confirmed' && timedKinds.includes(scope.action.kind)) scope.action = null;
        scope.previous = null;
      }
    });
    on('seeked', () => {
      const pending = scope.pending;
      const landed = timeOf(media);
      if (pending) {
        const confirmed = !media.seeking && sameSeekDuration(media, pending) && landed !== null &&
          (pending.seekingEvents === 1 && close(landed, pending.to) ||
            pending.correctedPosition !== undefined && Math.abs(landed - pending.correctedPosition) <= 0.05 &&
            acceptBufferNudge(media, pending.to, landed));
        settleSeek(scope, confirmed, confirmed ? undefined : 'seek-unconfirmed');
      } else {
        invalidate(scope);
        scope.previous = landed;
        scope.natural = false;
        scope.landing = {time: landed, pending: true};
        if (landed !== null && scope.inspection !== null && landed < scope.inspection) scope.inspection = null;
        if (landed !== null && landed === durationOf(media)) scope.terminal = true;
        if (!media.paused && !media.seeking && !media.ended) queue(scope, {previous: landed});
      }
    });
    for (const type of ['pointerdown', 'keydown']) on(type, () => {
      if (scope.pending) settleSeek(scope, false, 'user-input-during-seek');
      if (media.ended) invalidate(scope);
    }, acceptBufferNudge ? scope.binding.root : media, Boolean(acceptBufferNudge));
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
      if (scope.pending && !sameSeekDuration(media, scope.pending)) settleSeek(scope, false, 'duration-changed');
      else if (scope.action?.state === 'confirmed') scope.action = null;
    });
    for (const type of ['emptied', 'loadstart', 'abort', 'error']) {
      on(type, () => { retire(scope); publish(); });
    }
  }

  function retire(scope) {
    scope.retired = true;
    invalidate(scope);
    for (const remove of scope.listeners.splice(0)) remove();
    if (scope.pending) settleSeek(scope, false, 'media-binding-changed');
  }

  function bind(binding) {
    if (disposed || (binding && current?.binding === binding)) return snapshot();
    if (current) retire(current);
    current = null;
    if (binding?.media && getBinding?.() === binding) {
      const media = binding.media;
      current = {
        binding, media, listeners: [], revision: 0, mediaRevision: 0, previous: timeOf(media),
        wasPaused: media.paused, startup: !media.paused && timeOf(media) !== null && timeOf(media) < 0.75,
        intervals: {}, skipped: {}, hold: {intro: null, outro: null}, landing: null, denied: false, inspection: null,
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
      if (current.landing) current.landing.pending = false;
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
