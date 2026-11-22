import assert from 'node:assert/strict';
import {setImmediate as drain} from 'node:timers/promises';
import test from 'node:test';
import {createPlayer} from '../src/page/player.js';

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

function setup(t, {rules = {}, media = new Media(), authorize, selectNext, navigate} = {}) {
  const statuses = [];
  let binding;
  let seq = 0;
  const player = createPlayer({getBinding: () => binding, authorize: input => authorize ? authorize(input) : rules,
    selectNext, navigate, onStatus: state => statuses.push(state)});
  t.after(() => player.dispose());
  const bind = (video, context = {}) => {
    binding = {id: 'document-' + ++seq, media: video,
      context: {seriesKey: 'show:1', episodeKey: 'ep:' + seq, title: 'Show', ...context}};
    player.bind(binding);
    return binding;
  };
  bind(media);
  return {player, media, rules, statuses, bind, binding: () => binding};
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
