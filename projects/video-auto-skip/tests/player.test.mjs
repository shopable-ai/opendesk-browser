import assert from 'node:assert/strict';
import {setImmediate as drain} from 'node:timers/promises';
import test from 'node:test';
import {createPlayer} from '../src/page/player.js';
import {isIyfBufferNudge} from '../src/page/iyf-player.js';

const fixed = (start, end) => ({kind: 'fixed', start, end});
const tail = seconds => ({kind: 'tail', seconds});
const deferred = () => Promise.withResolvers();

class Media {
  listeners = new Map();
  writes = [];
  duration = 240;
  paused = true;
  playbackRate = 1;
  ended = false;
  seeking = false;
  ranges = [[0, 240]];
  time = 0;
  get currentTime() { return this.time; }
  set currentTime(value) {
    this.writes.push(value);
    if (this.ignoreSetter) return;
    this.time = value;
    this.seeking = true;
  }
  get seekable() {
    return {length: this.ranges.length, start: i => this.ranges[i][0], end: i => this.ranges[i][1]};
  }
  get buffered() {
    const ranges = this.bufferedRanges ?? [];
    return {length: ranges.length, start: i => ranges[i][0], end: i => ranges[i][1]};
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, isTrusted = true) {
    for (const listener of this.listeners.get(type) ?? []) listener({isTrusted});
  }
  play(trusted = true) { this.paused = false; this.ended = false; this.emit('play', trusted); }
  pause() { this.paused = true; this.emit('pause'); }
  tick(time) { this.time = time; this.emit('timeupdate'); }
  land(time = this.time) {
    this.emit('seeking');
    this.time = time;
    this.seeking = false;
    this.emit('seeked');
  }
  drag(time) {
    this.seeking = true;
    this.time = time;
    this.land();
  }
  end(trusted = true) {
    this.time = this.duration;
    this.ended = true;
    this.paused = true;
    this.emit('timeupdate', trusted);
    this.emit('pause', trusted);
    this.emit('ended', trusted);
  }
}

function setup(t, {rules = {}, media = new Media(), authorize, selectNext, navigate, iyf = false, onOutroDecision} = {}) {
  const statuses = [];
  const root = new Media();
  let binding;
  let seq = 0;
  const player = createPlayer({getBinding: () => binding, authorize: input => authorize ? authorize(input) : rules,
    selectNext, navigate, onOutroDecision, acceptBufferNudge: iyf ? isIyfBufferNudge : undefined, onStatus: state => statuses.push(state)});
  t.after(() => player.dispose());
  const bind = (video, context = {}) => {
    binding = {id: 'document-' + ++seq, media: video, root,
      context: {seriesKey: 'show:1', episodeKey: 'ep:' + seq, title: 'Show', ...context}};
    player.bind(binding);
    return binding;
  };
  bind(media);
  return {player, media, rules, statuses, bind, root, binding: () => binding};
}

const expectedMedia = player => {
  const {media} = player.snapshot();
  return {duration: media?.duration, mediaRevision: media?.revision, requestId: 'test-seek'};
};
const previewAt = (player, binding, seconds, intent) => player.preview(binding, {...expectedMedia(player), seconds, intent});
const undoSkip = (player, binding, actionId = player.snapshot().action?.id) =>
  player.undo(binding, {...expectedMedia(player), actionId});

async function tick(media, time) { media.tick(time); await drain(); }
async function play(media) { media.play(); await drain(); }

async function endNaturally(media) {
  await play(media);
  await tick(media, media.duration - 0.4);
  media.end();
  await drain();
}

test('a zero-start intro waits briefly for a seekable range', async t => {
  const media = new Media();
  media.ranges = [];
  setup(t, {media, rules: {intro: fixed(0, 60)}});
  await play(media);
  assert.deepEqual(media.writes, []);
  media.ranges = [[0, 240]];
  await tick(media, 0.5);
  assert.deepEqual(media.writes, [60]);
  media.land();
});

test('saving invalidates an ended event waiting for rules', async t => {
  const pending = deferred();
  let read = () => ({next: false});
  let navigations = 0;
  const {player, media} = setup(t, {authorize: () => read(), selectNext: () => ({target: {}}),
    navigate: () => { navigations++; return 'playing'; }});
  await play(media);
  await tick(media, 239.7);
  read = () => pending.promise;
  media.end();
  await drain();
  player.refresh();
  pending.resolve({next: true});
  await drain();
  assert.equal(navigations, 0);
});

test('ordinary playback crosses the intro once; seeking back and resuming preserve the inspected interval', async t => {
  const {player, media} = setup(t, {rules: {intro: fixed(30, 90)}});
  await play(media);
  await tick(media, 29);
  assert.deepEqual(media.writes, []);
  await tick(media, 30.2);
  assert.deepEqual(media.writes, [90]);
  assert.deepEqual(player.snapshot().action, {id: 1, kind: 'intro', state: 'pending', from: 30.2, to: 90});
  media.land();
  assert.equal(player.snapshot().action.state, 'confirmed');
  assert.equal(media.paused, false);
  media.drag(35);
  media.pause();
  await play(media);
  await tick(media, 36);
  assert.deepEqual(media.writes, [90]);
  assert.equal(media.time, 36);
});

test('after a fresh load, seeking into the intro skips once even if playback was already running', async t => {
  const media = new Media();
  media.paused = false;
  media.time = 120;
  const {player} = setup(t, {media, rules: {intro: fixed(0, 60)}});
  media.drag(25);
  await drain();
  assert.deepEqual(media.writes, [60]);
  media.land();
  assert.equal(player.snapshot().action.state, 'confirmed');

  media.drag(25);
  await tick(media, 26);
  assert.deepEqual(media.writes, [60], 'a second drag into the skipped interval is a deliberate rewatch');
});

test('seeking into an unskipped tail while paused waits for play and a seekable endpoint', async t => {
  const {media} = setup(t, {rules: {outro: fixed(190, 210)}});
  media.ranges = [[0, 200]];
  media.drag(195);
  await drain();
  assert.deepEqual(media.writes, []);
  assert.equal(media.paused, true);
  await play(media);
  assert.deepEqual(media.writes, []);
  media.ranges = [[0, 240]];
  await tick(media, 196);
  assert.deepEqual(media.writes, [210]);
  media.land();
  assert.equal(media.paused, false);
});

test('saving clears a pending first skip without cancelling a rewatch of the same interval', async t => {
  const {player, media, rules} = setup(t, {rules: {intro: fixed(30, 90)}});
  await play(media);
  media.drag(35);
  player.refresh();
  await tick(media, 36);
  assert.deepEqual(media.writes, []);
  media.drag(35);
  await drain();
  assert.deepEqual(media.writes, [90]);
  media.land();

  media.pause();
  media.drag(35);
  player.refresh();
  await play(media);
  assert.deepEqual(media.writes, [90]);

  rules.intro = fixed(30, 95);
  player.refresh();
  media.drag(35);
  await drain();
  assert.deepEqual(media.writes, [90, 95], 'a new endpoint is eligible on the next drag');
  media.land();
});

test('save and attaching to a running interval are inert until exit or a genuine play edge', async t => {
  const media = new Media();
  media.paused = false;
  media.time = 34;
  const {player, rules} = setup(t, {media, rules: {intro: fixed(30, 90)}});
  await tick(media, 35);
  rules.intro = fixed(32, 92);
  player.refresh();
  await tick(media, 36);
  media.emit('play', false);
  media.emit('play'); // No transition out of pause.
  await drain();
  assert.deepEqual(media.writes, []);
  media.pause();
  await play(media);
  assert.deepEqual(media.writes, [92]);
  media.land();
});

test('a new rule observed inside an already running interval does not fire without refresh', async t => {
  const {media, rules} = setup(t);
  await play(media);
  await tick(media, 29);
  rules.intro = fixed(30, 90);
  await tick(media, 31);
  await tick(media, 35);
  assert.deepEqual(media.writes, []);
  media.drag(20);
  await tick(media, 31);
  assert.deepEqual(media.writes, [90]);
  media.land();
});

test('saving while outside a new interval still allows the next ordinary crossing', async t => {
  const {player, media, rules} = setup(t);
  await play(media);
  await tick(media, 29);
  rules.intro = fixed(30, 90);
  player.refresh();
  assert.deepEqual(media.writes, []);
  await tick(media, 31);
  assert.deepEqual(media.writes, [90]);
  media.land();
});

test('preview and return confirm the exact binding, preserve pause and hold the inspected rule', async t => {
  const {player, media, binding} = setup(t, {rules: {intro: fixed(10, 40)}});
  media.drag(15);
  await previewAt(player, 'stale-token', 66);
  assert.deepEqual(media.writes, []);
  const preview = previewAt(player, binding().id, 55);
  await drain();
  media.land();
  assert.deepEqual((await preview).action, {id: 'test-seek', kind: 'preview', state: 'confirmed', from: 15, to: 55});
  const back = previewAt(player, binding(), 15, 'return');
  await drain();
  media.land();
  assert.deepEqual((await back).action, {id: 'test-seek', kind: 'preview', state: 'confirmed', from: 55, to: 15});
  await undoSkip(player, binding());
  assert.equal(media.paused, true);
  await play(media);
  await tick(media, 16);
  assert.deepEqual(media.writes, [55, 15]);
});

test('undo only reverses the exact visible automatic skip and cannot immediately skip again', async t => {
  const {player, media, binding} = setup(t, {rules: {intro: fixed(30, 90)}});
  media.drag(29);
  await play(media);
  await tick(media, 31);
  media.land();
  const id = player.snapshot().action.id;
  await undoSkip(player, binding(), id + 1);
  assert.deepEqual(media.writes, [90]);
  media.pause();
  const result = undoSkip(player, binding(), id);
  await drain();
  media.land();
  assert.equal((await result).action.kind, 'undo');
  assert.equal(media.paused, true);
  await play(media);
  await tick(media, 32);
  assert.deepEqual(media.writes, [90, 31]);
});

test('a preview from an earlier media revision cannot seek even if the duration returns to the same value', async t => {
  const {player, media, binding} = setup(t);
  const view = expectedMedia(player);
  media.duration = 200;
  media.emit('durationchange');
  media.duration = view.duration;
  media.emit('durationchange');
  await player.preview(binding(), {...view, seconds: 50});
  assert.deepEqual(media.writes, []);
});

test('a seek cannot cross disconnected seekable spans or run with unknown duration', async t => {
  const {player, media, binding} = setup(t, {rules: {intro: fixed(0, 90)}});
  media.ranges = [[0, 40], [60, 240]];
  await play(media);
  assert.deepEqual(media.writes, []);
  assert.equal((await previewAt(player, binding(), 90)).reason, 'position-not-seekable');
  media.duration = Infinity;
  media.emit('durationchange');
  assert.equal((await previewAt(player, binding(), 20)).reason, 'duration-unavailable');
  assert.equal(player.snapshot().media.duration, null);
  assert.deepEqual(media.writes, []);
});

test('fixed partial outro preserves the remainder; terminal tail recalculates after a source replacement', async t => {
  let nav = 0;
  const {player, media, rules, bind} = setup(t, {rules: {outro: fixed(70, 100), next: true},
    selectNext: () => ({}), navigate: () => { nav++; return 'playing'; }});
  await play(media);
  await tick(media, 60);
  await tick(media, 72);
  media.land();
  assert.deepEqual(media.writes, [100]);
  await tick(media, 112);
  assert.equal(media.ended, false);
  assert.equal(nav, 0);
  media.emit('emptied');
  assert.equal(player.snapshot().state, 'unavailable');
  rules.outro = tail(90);
  media.time = 0;
  media.duration = 300;
  media.ranges = [[0, 300]];
  bind(media);
  await tick(media, 201);
  assert.deepEqual(media.writes, [100]);
  await tick(media, 211);
  media.land();
  assert.deepEqual(media.writes, [100, 300]);
  media.end();
  await drain();
  assert.equal(nav, 0, 'End caused by a terminal seek cannot dispatch next');
});

for (const [mode, rule, from, to] of [
  ['fixed', fixed(1155, 1243), 1155.17, 1243],
  ['last 88 seconds', tail(88), 1155.7, 1243.563],
]) test(mode + ': natural outro confirms once when the same media extends slightly during the seek', async t => {
  const media = new Media();
  media.duration = 1243.563;
  media.ranges = [[0, media.duration]];
  const {player, statuses} = setup(t, {media, rules: {outro: rule, next: true},
    selectNext: () => ({}), navigate: () => assert.fail('A skip is not a next-episode request')});
  await play(media);
  await tick(media, 1154.9);
  assert.deepEqual(media.writes, []);
  await tick(media, from);
  assert.deepEqual(media.writes, [to]);
  media.emit('seeking');
  media.duration = 1243.714667;
  media.ranges = [[0, media.duration]];
  media.emit('durationchange');
  assert.equal(player.snapshot().action.state, 'pending');
  media.seeking = false;
  media.emit('seeked');
  assert.deepEqual(player.snapshot().action, {id: 1, kind: 'outro', state: 'confirmed', from, to});
  if (mode !== 'fixed') {
    await tick(media, 1243.65);
    media.end();
    await drain();
    media.play();
  }
  media.drag(1156);
  await tick(media, 1157);
  media.drag(1154);
  await tick(media, 1156);
  assert.deepEqual(media.writes, [to], 'rewatching from inside or just before the outro cannot skip again');
  assert.equal(statuses.filter(s => s.action?.state === 'confirmed' && s.action.kind === 'outro').length, 1);
});

test('outro diagnostics distinguish an invalid saved rule from a confirmed natural skip', async t => {
  const entries = [];
  const media = new Media();
  media.duration = 1156.011;
  media.ranges = [[0, media.duration]];
  const {rules, player} = setup(t, {media, rules: {outro: fixed(1155, 1243)},
    onOutroDecision: entry => entries.push(entry)});
  media.time = 1067;
  await play(media);
  await tick(media, 1067.4);
  assert.deepEqual(entries.map(e => e.decision), ['invalid-interval']);
  assert.deepEqual(media.writes, []);
  rules.outro = tail(88);
  rules.outroSource = 'series';
  player.refresh();
  await tick(media, 1067.9);
  await tick(media, 1068.167);
  assert.deepEqual(media.writes, [1156.011]);
  media.land();
  assert.deepEqual(entries.map(e => e.decision), ['invalid-interval', 'before-start', 'triggered', 'confirmed']);
  assert.equal(entries[2].from, 1068.167);
  assert.equal(entries[2].start, 1068.011);
  assert.equal(entries[2].to, 1156.011);
  assert.equal(entries[2].id, entries[3].id);
  assert.equal(entries[2].entry, 'natural-crossing');
  assert.equal(entries[2].source, 'series');
  assert.equal(entries[3].landed, 1156.011);
});

test('without an applicable outro, playback ends without a seek or skip feedback and next can still run', async t => {
  for (const [label, outro] of [['no outro', undefined], ['explicitly disabled', null], ['outro beyond the media duration', fixed(230, 250)]]) {
    await t.test(label, async t => {
      const target = {episodeKey: 'next'};
      const calls = [];
      const {player, media, statuses} = setup(t, {rules: {outro, next: true},
        selectNext: () => target, navigate: (_binding, next) => { calls.push(next); return 'playing'; }});
      await play(media);
      await tick(media, 229.8);
      await tick(media, 230.2);
      await tick(media, 239.6);
      assert.equal(player.snapshot().action, undefined);
      assert.deepEqual(calls, []);
      media.end();
      await drain();
      assert.deepEqual(media.writes, []);
      assert.equal(statuses.some(({action}) => action?.kind === 'intro' || action?.kind === 'outro'), false);
      assert.deepEqual(calls, [target]);
      assert.deepEqual(player.snapshot().action, {kind: 'next', state: 'playing'});
    });
  }
});

test('a duration correction is not proof of landing or permission to accept a larger change', async t => {
  for (const [revisedDuration, landed, reason] of [[240.15, 235, 'seek-unconfirmed'], [241, 240, 'duration-changed']]) {
    const {player, media, statuses} = setup(t, {rules: {outro: tail(10)}});
    await play(media);
    await tick(media, 229);
    await tick(media, 231);
    media.emit('seeking');
    media.duration = revisedDuration;
    media.ranges = [[0, revisedDuration]];
    media.emit('durationchange');
    media.time = landed;
    media.seeking = false;
    media.emit('seeked');
    assert.equal(player.snapshot().action.state, 'unknown');
    assert.equal(player.snapshot().reason, reason);
    assert.equal(statuses.some(s => s.action?.state === 'confirmed'), false);
  }
});

test('replacing a binding or saving while authorization is pending fences the old action', async t => {
  let answer = deferred();
  const {player, media, bind} = setup(t, {authorize: () => answer.promise});
  media.play();
  assert.equal(player.refresh().state, 'ready');
  answer.resolve({intro: fixed(0, 60)});
  await drain();
  assert.deepEqual(media.writes, []);
  answer = deferred();
  const pending = previewAt(player, player.snapshot().binding, 25);
  const other = new Media();
  bind(other);
  answer.resolve({});
  assert.equal((await pending).binding, 'document-2');
  await drain();
  assert.deepEqual(media.writes, []);
  assert.deepEqual(other.writes, []);
  assert.equal([...media.listeners.values()].every(set => !set.size), true);
});

test('rewind or competing seek during a pending operation never retries an unknown result', async t => {
  const {player, media, binding} = setup(t, {rules: {intro: fixed(0, 60)}});
  await play(media);
  media.emit('seeking');
  media.time = 47;
  media.emit('seeking');
  media.land(47);
  assert.equal(player.snapshot().action.state, 'unknown');
  assert.equal(player.snapshot().reason, 'competing-seek');
  media.pause();
  await play(media);
  await tick(media, 50);
  await previewAt(player, binding(), 52);
  await undoSkip(player, binding());
  assert.deepEqual(media.writes, [60]);
});

test('iYF confirms one buffer correction and can still skip the last 90 seconds naturally', async t => {
  const media = new Media();
  media.duration = 1243.563;
  media.ranges = [[0, media.duration]];
  media.time = 50.204667;
  const {player} = setup(t, {media, iyf: true, rules: {intro: fixed(0, 140), outro: tail(90)}});
  await play(media);
  assert.deepEqual(media.writes, [140]);
  media.emit('seeking');
  media.bufferedRanges = [[50.154667, 65], [140.154667, 151]];
  media.time = 140.204667;
  media.emit('seeking');
  assert.equal(player.snapshot().action.state, 'pending');
  media.seeking = false;
  media.emit('seeked');
  assert.equal(player.snapshot().action.state, 'confirmed');
  media.drag(1149.563);
  await tick(media, 1153.519065);
  await tick(media, 1153.591349);
  assert.deepEqual(media.writes, [140, 1243.563]);
  media.land();
  assert.deepEqual(player.snapshot().action,
    {id: 2, kind: 'outro', state: 'confirmed', from: 1153.591349, to: 1243.563});
});

test('iYF keeps unknown results fenced when a repeat seek is not a confirmed buffer correction', async t => {
  for (const [label, ranges, extra, landed = 140.204667] of [
    ['target already buffered', [[139, 150]]],
    ['redirect into unbuffered content', [[140.22, 150]]],
    ['third seek', [[140.154667, 151]], 'seeking'],
    ['different landing', [[140.154667, 151]], null, 141],
    ['player control input', [[140.154667, 151]], 'pointerdown'],
  ]) await t.test(label, async t => {
    const {player, media, root} = setup(t, {iyf: true, rules: {intro: fixed(0, 140)}});
    await play(media);
    media.emit('seeking');
    media.bufferedRanges = ranges;
    media.time = 140.204667;
    media.emit('seeking');
    if (extra === 'pointerdown') root.emit(extra);
    else if (extra) media.emit(extra);
    media.time = landed;
    media.seeking = false;
    media.emit('seeked');
    assert.equal(player.snapshot().action.state, 'unknown');
    assert.deepEqual(media.writes, [140]);
  });
});

test('a seek without confirmation fences new sources on the same document', async t => {
  const {player, media, binding, bind} = setup(t, {rules: {intro: fixed(0, 60)}});
  media.ignoreSetter = true;
  assert.equal((await previewAt(player, binding(), 34)).action.state, 'unknown');
  assert.equal((await previewAt(player, binding(), 38)).action.state, 'unknown');
  assert.deepEqual(media.writes, [34]);
  const replacement = new Media();
  bind(replacement);
  await play(replacement);
  assert.equal((await previewAt(player, binding(), 38)).action.state, 'unknown');
  assert.deepEqual(replacement.writes, []);
});

test('authorization denial stops further actions on the live binding', async t => {
  let reads = 0;
  const {player, media, binding} = setup(t, {authorize: () => { reads++; return null; }});
  assert.equal((await previewAt(player, binding(), 34)).reason, 'authorization-unavailable');
  await play(media);
  await tick(media, 30);
  assert.equal((await previewAt(player, binding(), 38)).reason, 'authorization-unavailable');
  assert.equal(reads, 1);
  assert.deepEqual(media.writes, []);
});

test('a change of duration cannot turn two individually valid rules into an automatic whole episode skip', async t => {
  const {media} = setup(t, {rules: {intro: fixed(0, 100), outro: tail(140)}});
  await play(media);
  await tick(media, 101);
  assert.deepEqual(media.writes, []);
});

test('checking the tail can play to the end without navigating; returning to watch can rearm next', async t => {
  const calls = [];
  const {player, media, binding} = setup(t, {rules: {next: true}, selectNext: () => ({target: {}}),
    navigate: () => { calls.push('next'); return 'playing'; }});
  const seek = previewAt(player, binding(), 230, 'outro');
  await drain();
  media.land();
  assert.equal((await seek).action.state, 'confirmed');
  await endNaturally(media);
  assert.deepEqual(calls, []);
  const restore = previewAt(player, binding(), 20, 'return');
  await drain();
  media.land();
  await restore;
  await endNaturally(media);
  assert.deepEqual(calls, ['next']);
});

test('confirmed natural end dispatches a unique adapter target once and distinguishes arrival from playing', async t => {
  const receipt = deferred();
  const calls = [];
  const target = {privateRoute: 'https://example.test/media?private=abc'};
  const {player, media, rules, bind, binding} = setup(t, {rules: {next: false},
    selectNext: () => target, navigate: (own, next) => { calls.push([own, next]); return receipt.promise; }});
  await endNaturally(media);
  assert.deepEqual(calls, []);
  rules.next = true;
  player.refresh();
  media.emit('ended');
  await drain();
  assert.deepEqual(calls, [], 'Saving after an end cannot replay that event');
  media.drag(200);
  const original = binding();
  await endNaturally(media);
  media.emit('ended');
  assert.deepEqual(calls, [[original, target]]);
  assert.deepEqual(player.snapshot().action, {kind: 'next', state: 'pending'});
  bind(new Media(), {line: 'https://example.test/media?private=abc'});
  receipt.resolve({state: 'arrived'});
  await drain();
  assert.deepEqual(player.snapshot().action, {kind: 'next', state: 'arrived'});
  assert.equal(player.snapshot().binding, 'document-2');
  assert.doesNotMatch(JSON.stringify(player.snapshot()), /example.test|private/);
});

test('synthetic ended and stale authorization cannot cut over; unknown navigation locks subsequent generations', async t => {
  let read = () => ({next: true});
  let calls = 0;
  const {player, media, bind} = setup(t, {authorize: () => read(), selectNext: () => ({}),
    navigate: () => { calls++; throw Error('receipt unavailable'); }});
  await play(media);
  await tick(media, 239.6);
  media.end(false);
  await drain();
  assert.equal(calls, 0);
  media.drag(210);
  await play(media);
  await tick(media, 239.6);
  const pending = deferred();
  read = () => pending.promise;
  media.end();
  player.refresh();
  pending.resolve({next: true});
  await drain();
  assert.equal(calls, 0);
  read = () => ({next: true});
  const newMedia = new Media();
  bind(newMedia);
  await endNaturally(newMedia);
  assert.equal(calls, 1);
  assert.equal(player.snapshot().action.state, 'unknown');
  const finalMedia = new Media();
  bind(finalMedia);
  await endNaturally(finalMedia);
  assert.equal(calls, 1);
  assert.equal(player.snapshot().reason, 'navigation-unconfirmed');
});

test('missing or contested target never navigates or claims the series is complete', async t => {
  const {player, media} = setup(t, {rules: {next: true}, selectNext: () => ({reason: 'playlist ambiguous'}),
    navigate: () => assert.fail('Ambiguous target must not dispatch')});
  await endNaturally(media);
  assert.equal(player.snapshot().action.state, 'unavailable');
  assert.equal(player.snapshot().reason, 'next-not-confirmed');
});

test('navigation reports playing only when the adapter confirms playing', async t => {
  const target = Object.freeze({episodeKey: 'second'});
  const {player, media} = setup(t, {rules: {next: true}, selectNext: () => ({target}),
    navigate: (_binding, next) => { assert.equal(next, target); return {state: 'playing'}; }});
  await endNaturally(media);
  assert.deepEqual(player.snapshot().action, {kind: 'next', state: 'playing'});
});
