import assert from 'node:assert/strict';
import test from 'node:test';
import {createNextReceipt} from '../src/page/next-receipt.js';

const token = '11111111-1111-4111-8111-111111111111';
const destination = {seriesKey: 'work:1', episodeKey: '2', line: 'primary'};
function setup(navigate) {
  let value, state = {site: 'preserved'}, version = 0, dispatched = 0, clock = 1000;
  const storage = {
    async get() { return {value, etag: String(version)}; },
    async set(input) {
      if (input.ifMatch !== String(version)) throw Object.assign(new Error('conflict'), {code: 'E_STORAGE_CONFLICT'});
      value = input.value; version++; return {saved: true};
    },
  };
  const from = {id: 'source', getState: () => state};
  const to = {id: 'destination'};
  const source = {
    navigate() { dispatched++; return navigate?.(); }, updateCurrentEntry({state: next}) { state = next; }, currentEntry: from,
  };
  const make = (arrivalType, previous = from, current = to) => createNextReceipt({storage,
    navigation: arrivalType ? {currentEntry: current, activation: {from: previous, entry: to, navigationType: 'push'}} : source,
    arrivalType, id: () => token, now: () => clock});
  return {make, dispatched: () => dispatched, siteState: () => state.site, from, advance: () => { clock += 60_001; }};
}

test('next arrival requires the right destination and a single private receipt', async () => {
  const {make, dispatched, siteState, from} = setup();
  const source = make();
  const prepared = await source.prepare(destination);
  assert.equal(dispatched(), 0);
  source.dispatch('http://127.0.0.1/ep-2', prepared);
  assert.equal(siteState(), 'preserved');
  const arrived = make('navigate');
  assert.equal(await arrived.arrive({...destination, line: 'backup'}, () => true), false);
  assert.equal(await arrived.arrive(destination, () => false), false);
  assert.equal(await make('reload').arrive(destination, () => true), false);
  assert.equal(await make('navigate', null).arrive(destination, () => true), false);
  assert.equal(await make('navigate', {...from, id: 'other-tab'}).arrive(destination, () => true), false);
  assert.equal(await make('navigate', from, {id: 'different-entry'}).arrive(destination, () => true), false);
  assert.equal(await arrived.arrive(destination, () => true), true);
  assert.equal(await make('navigate').arrive(destination, () => true), false);
  assert.deepEqual(arrived.snapshot(), {kind: 'next', state: 'arrived'});
  arrived.confirmPlaying();
  assert.deepEqual(arrived.snapshot(), {kind: 'next', state: 'playing'});
  assert.equal(dispatched(), 1);
});

test('a rejected navigation cannot claim a later manual visit to the same episode', async () => {
  const {make, siteState, dispatched} = setup(() => ({committed: Promise.reject(new DOMException('cancelled', 'AbortError'))}));
  const source = make();
  source.dispatch('http://127.0.0.1/ep-2', await source.prepare(destination));
  await Promise.resolve();
  assert.equal(await make('navigate').arrive(destination, () => true), false);
  assert.equal(siteState(), 'preserved');
  assert.equal(dispatched(), 1);
});

test('an expired receipt cannot claim arrival or navigate again', async () => {
  const {make, dispatched, advance} = setup();
  const source = make();
  source.dispatch('http://127.0.0.1/ep-2', await source.prepare(destination));
  advance();
  assert.equal(await make('navigate').arrive(destination, () => true), false);
  assert.equal(dispatched(), 1);
});
