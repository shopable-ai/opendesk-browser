import assert from 'node:assert/strict';
import test from 'node:test';
import {EMPTY, RULES_KEY, cleanRules, resolveRules, updateScope} from '../src/rules.js';
import {WORK_INDEX_KEY, cleanWorkIndex, ensureWorkTitle, hasSavedWork, workIdentity} from '../src/work-index.js';

function storageHarness(initialRules = EMPTY, options = {}) {
  const entries = new Map([[RULES_KEY, structuredClone(initialRules)]]);
  const revs = new Map([[RULES_KEY, 1]]);
  let nextSetEffect = null;
  const api = {
    async get({key, withEtag}) {
      const value = entries.has(key) ? structuredClone(entries.get(key)) : undefined;
      return {value, ...(withEtag ? {etag: `${revs.get(key) || 0}`} : {})};
    },
    async set({key, value, ifMatch}) {
      if (`${revs.get(key) || 0}` !== ifMatch) return {state: 'conflict'};
      const effect = nextSetEffect;
      nextSetEffect = null;
      if (effect?.kind === 'quota') throw Object.assign(new Error('out of space'), {code: 'E_TOOL_DATA_LIMIT'});
      if (effect?.kind === 'conflict') {
        entries.set(WORK_INDEX_KEY, structuredClone(effect.other));
        revs.set(WORK_INDEX_KEY, (revs.get(WORK_INDEX_KEY) || 0) + 1);
        return {state: 'conflict'};
      }
      entries.set(key, structuredClone(value));
      revs.set(key, (revs.get(key) || 0) + 1);
      if (effect?.kind === 'unknown') throw Object.assign(new Error('lost response'), {code: 'E_OUTCOME_UNKNOWN'});
      return {saved: true};
    },
  };
  return {api, entries, inject: effect => {nextSetEffect = effect;}};
}

const iyf = {seriesKey: 'iyf:O3MkOSlztbO', episodeKey: 'nWwHoSxqG04', title: '凡人修仙传'};
const iyfOther = {seriesKey: 'iyf:different-work', episodeKey: '1', title: '凡人修仙传'};
const intro = {kind: 'fixed', start: 0, end: 140};
const outro = {kind: 'tail', seconds: 88};
const legacy = updateScope(EMPTY, iyf, 'series', {intro, outro, next: true});

// Protect every historical byte-level rule value via structural comparison.
test('R13 adds a separately readable title without mutating rules.v1', async () => {
  const h = storageHarness(legacy);
  const before = structuredClone(h.entries.get(RULES_KEY));
  assert.deepEqual(await ensureWorkTitle(h.api, iyf, 100), {state: 'saved'});
  assert.deepEqual(h.entries.get(RULES_KEY), before);
  assert.deepEqual(cleanWorkIndex(h.entries.get(WORK_INDEX_KEY)).works[iyf.seriesKey], {
    seriesKey: iyf.seriesKey, displayTitle: '凡人修仙传', siteId: 'iyf',
    titleSource: 'iyf.video-detail', updatedAt: 100,
  });
  assert.deepEqual(await ensureWorkTitle(h.api, iyf, 200), {state: 'saved'});
  assert.equal(h.entries.get(WORK_INDEX_KEY).works[iyf.seriesKey].updatedAt, 100);
});

test('backfill requires a saved rule; a merely visited work is not indexed', async () => {
  const h = storageHarness();
  assert.equal(hasSavedWork(EMPTY, iyf.seriesKey), false);
  assert.deepEqual(await ensureWorkTitle(h.api, iyf), {state: 'no-rules'});
  assert.equal(h.entries.has(WORK_INDEX_KEY), false);
  h.entries.set(RULES_KEY, updateScope(EMPTY, iyf, 'episode', {intro}));
  assert.deepEqual(await ensureWorkTitle(h.api, iyf), {state: 'saved'});
});

test('removing the final rule prunes only its name metadata', async () => {
  const data = updateScope(legacy, iyfOther, 'episode', {outro});
  const h = storageHarness(data);
  await ensureWorkTitle(h.api, iyf, 1);
  await ensureWorkTitle(h.api, iyfOther, 1);
  h.entries.set(RULES_KEY, updateScope(data, iyf, 'series', {}));
  assert.deepEqual(await ensureWorkTitle(h.api, iyf, 2), {state: 'removed'});
  assert.equal(Object.hasOwn(h.entries.get(WORK_INDEX_KEY).works, iyf.seriesKey), false);
  assert.equal(Object.hasOwn(h.entries.get(WORK_INDEX_KEY).works, iyfOther.seriesKey), true);
});

test('same title and different works stay distinct, rename never changes rule identity', async () => {
  const data = updateScope(updateScope(EMPTY, iyf, 'episode', {intro}), iyfOther, 'episode', {outro});
  const h = storageHarness(data);
  await ensureWorkTitle(h.api, iyf, 1);
  await ensureWorkTitle(h.api, iyfOther, 2);
  assert.equal(Object.keys(h.entries.get(WORK_INDEX_KEY).works).length, 2);
  assert.deepEqual(await ensureWorkTitle(h.api, {...iyf, title: 'A Record of a Mortal’s Journey'}, 3), {state: 'saved'});
  assert.equal(h.entries.get(WORK_INDEX_KEY).works[iyfOther.seriesKey].displayTitle, '凡人修仙传');
  assert.equal(h.entries.get(WORK_INDEX_KEY).works[iyf.seriesKey].displayTitle, 'A Record of a Mortal’s Journey');
  assert.deepEqual(h.entries.get(RULES_KEY), data);
});

test('older title observation cannot overwrite newer metadata', async () => {
  const h = storageHarness(legacy);
  await ensureWorkTitle(h.api, {...iyf, title: '新名称'}, 200);
  assert.deepEqual(await ensureWorkTitle(h.api, iyf, 100), {state: 'newer-existing'});
  assert.equal(h.entries.get(WORK_INDEX_KEY).works[iyf.seriesKey].displayTitle, '新名称');
});

test('CAS conflict reloads and merges a concurrent title for another work', async () => {
  const data = updateScope(legacy, iyfOther, 'episode', {outro});
  const h = storageHarness(data);
  const other = workIdentity(iyfOther, 50);
  h.inject({kind: 'conflict', other: {works: {[other.seriesKey]: other}}});
  assert.deepEqual(await ensureWorkTitle(h.api, iyf, 100), {state: 'saved'});
  assert.equal(Object.keys(h.entries.get(WORK_INDEX_KEY).works).length, 2);
});

test('an unknown write result is READ BACK, never blindly replayed', async () => {
  const h = storageHarness(legacy);
  h.inject({kind: 'unknown'});
  assert.deepEqual(await ensureWorkTitle(h.api, iyf, 100), {state: 'saved'});
  assert.equal(h.entries.get(WORK_INDEX_KEY).works[iyf.seriesKey].updatedAt, 100);
});

test('quota preserves all old rule content and does not create an index', async () => {
  const h = storageHarness(legacy);
  const old = structuredClone(h.entries.get(RULES_KEY));
  h.inject({kind: 'quota'});
  assert.deepEqual(await ensureWorkTitle(h.api, iyf), {state: 'quota'});
  assert.deepEqual(h.entries.get(RULES_KEY), old);
  assert.equal(h.entries.has(WORK_INDEX_KEY), false);
});

test('invalid metadata remains untouched and malicious titles are not accepted', async () => {
  const h = storageHarness(legacy);
  h.entries.set(WORK_INDEX_KEY, {works: {x: {displayTitle: 'bad'}}});
  assert.deepEqual(await ensureWorkTitle(h.api, iyf), {state: 'unknown'});
  assert.equal(h.entries.get(WORK_INDEX_KEY).works.x.displayTitle, 'bad');
  assert.equal(workIdentity({...iyf, title: 'bad\nline'}), null);
  assert.equal(workIdentity({...iyf, title: 'x'.repeat(101)}), null);
  assert.throws(() => cleanWorkIndex(JSON.parse('{"works":{"__proto__":{}}}')));
});

test('unverified iYF historical defaults are retained but cannot auto-apply to other episodes', () => {
  const fromDisk = cleanRules(legacy);
  assert.deepEqual(fromDisk, legacy);
  assert.deepEqual(resolveRules(fromDisk, {...iyf, episodeKey: 'different'}), {});
  const withEpisode = updateScope(fromDisk, iyf, 'episode', {intro: {kind: 'fixed', start: 0, end: 90}});
  assert.deepEqual(resolveRules(withEpisode, iyf), {intro: {kind: 'fixed', start: 0, end: 90}});
  assert.deepEqual(resolveRules(withEpisode, {...iyf, episodeKey: 'different'}), {});
  assert.deepEqual(withEpisode.series[iyf.seriesKey].defaults, legacy.series[iyf.seriesKey].defaults);
});

test('trusted local adapter retains its existing series-default and episode override semantics', () => {
  const one = {seriesKey: 'local:series:season-1', episodeKey: '1'};
  const two = {...one, episodeKey: '2'};
  const base = updateScope(EMPTY, one, 'series', {intro, outro});
  assert.deepEqual(resolveRules(base, two), {intro, outro});
  assert.deepEqual(resolveRules(updateScope(base, one, 'episode', {intro: null}), one), {intro: null, outro});
});
