import assert from 'node:assert/strict';
import test from 'node:test';
import {EMPTY, cleanRules, resolveInterval, resolveRules, saveScope, updateScope, validateRules} from '../src/rules.js';

const intro = {kind: 'fixed', start: 30, end: 90};
const outro = {kind: 'tail', seconds: 90};
const one = {seriesKey: 'local:series:season-1', episodeKey: '1'};
const two = {...one, episodeKey: '2'};

test('an episode can disable only intro, keeping future default changes and other episodes independent', () => {
  const defaults = {intro, outro, next: true};
  const data = updateScope(EMPTY, one, 'series', defaults);
  const overridden = updateScope(data, one, 'episode', {intro: null});
  assert.deepEqual(resolveRules(overridden, one), {...defaults, intro: null});
  assert.deepEqual(resolveRules(overridden, two), defaults);
  const newDefaults = updateScope(overridden, one, 'series', {...defaults, next: false});
  assert.deepEqual(resolveRules(newDefaults, one), {...defaults, intro: null, next: false});
  const inherited = updateScope(newDefaults, one, 'episode', {});
  assert.deepEqual(resolveRules(inherited, one), resolveRules(inherited, two));
  assert.deepEqual(resolveRules(data, one), defaults);
});

test('relative outro is recomputed for each source and cannot process an unknown duration', () => {
  assert.deepEqual(resolveInterval(outro, 45 * 60), {start: 43 * 60 + 30, end: 45 * 60});
  assert.deepEqual(resolveInterval(outro, 48 * 60), {start: 46 * 60 + 30, end: 48 * 60});
  for (const duration of [NaN, Infinity, 0, 90, 89]) assert.equal(resolveInterval(outro, duration), null);
  for (const duration of [2700, 2880]) {
    assert.deepEqual(resolveInterval({kind: 'fixed', start: 2510, end: 2610}, duration), {start: 2510, end: 2610});
  }
});

test('automatic scope keeps existing episode exceptions and does not extend unverified rules to the season', () => {
  const local = {...one, season: 'season-1'};
  const data = updateScope(EMPTY, local, 'episode', {next: false});
  assert.equal(saveScope(EMPTY, local), 'series');
  assert.equal(saveScope(data, local), 'episode');
  assert.equal(saveScope(data, {...two, season: local.season}), 'series');
  assert.equal(saveScope(EMPTY, one), 'episode');
  assert.equal(saveScope(EMPTY, {...local, seriesKey: 'iyf:unverified'}), 'episode');
});

test('a disabled saved interval still overrides inherited playback settings and keeps its editable times', () => {
  const disabled = {...outro, enabled: false};
  const defaults = updateScope(EMPTY, one, 'series', {outro});
  const data = cleanRules(updateScope(defaults, one, 'episode', {outro: disabled}));
  assert.deepEqual(resolveRules(data, one).outro, disabled);
  assert.equal(resolveInterval(resolveRules(data, one).outro, 2700), null);
  assert.deepEqual(resolveInterval(resolveRules(data, two).outro, 2700), {start: 2610, end: 2700});
  assert.equal(validateRules({outro: disabled}, 89), null);
  assert.ok(validateRules({outro: {...disabled, seconds: 0}}, 2700));
});

test('invalid, overlapping and whole-episode skips are rejected before they can be saved', () => {
  assert.equal(validateRules({intro, outro}, 200), null);
  assert.ok(validateRules({intro, outro}, 150));
  assert.ok(validateRules({intro: {kind: 'fixed', start: 0, end: 90}, outro}, 180));
  assert.ok(validateRules({intro: {kind: 'fixed', start: 90, end: 30}}, 200));
  assert.ok(validateRules({intro, outro}, Infinity));
  assert.equal(validateRules({next: false}, Infinity), null);
});

test('persisted data fails closed and property names cannot inherit or change prototypes', () => {
  const own = JSON.parse('{"series":{"constructor":{"defaults":{"next":true},"episodes":{"constructor":{"next":false}}}}}');
  const data = cleanRules(own);
  const inherited = {seriesKey: 'constructor', episodeKey: 'toString'};
  assert.deepEqual(resolveRules(data, inherited), {next: true});
  assert.deepEqual(resolveRules(data, {...inherited, episodeKey: 'constructor'}), {next: false});
  assert.deepEqual(resolveRules(EMPTY, inherited), {});
  assert.deepEqual(resolveRules(cleanRules(updateScope(EMPTY, inherited, 'episode', {next: false})), inherited), {next: false});
  assert.throws(() => cleanRules({series: {s: {defaults: {next: 'false'}, episodes: {}}}}));
  assert.throws(() => cleanRules(JSON.parse('{"series":{"__proto__":{"defaults":{},"episodes":{}}}}')));
  assert.throws(() => cleanRules({series: {s: {defaults: Object.create({next: true}), episodes: {}}}}));
  assert.equal(Object.getPrototypeOf(data.series), Object.prototype);
});
