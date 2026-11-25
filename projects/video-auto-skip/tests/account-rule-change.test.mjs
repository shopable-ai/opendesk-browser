import assert from 'node:assert/strict';
import test from 'node:test';
import {parseAccountRuleChange, projectAccountRuleChange} from '../src/account-rule-change.js';

const context = {seriesKey: 'iyf:synthetic-work', episodeKey: 'ep-A', title: 'Not cloud data', url: 'https://example.invalid/'};
const intro = {kind: 'fixed', start: 0, end: 45};
const outro = {kind: 'tail', seconds: 60, enabled: false};

test('only changed timing fields at the explicit save target leave the product adapter', () => {
  const change = projectAccountRuleChange({context, scope: 'episode', before: {intro, next: true},
    after: {intro: {...intro}, outro, next: false}});
  assert.deepEqual(change, {
    target: {scope: 'episode', seriesKey: context.seriesKey, episodeKey: context.episodeKey},
    changes: {outro: {op: 'set', rule: outro}},
  });
  assert.deepEqual(projectAccountRuleChange({context, scope: 'episode', before: {next: false}, after: {next: true}}), null);
});

test('explicitly disabled inheritance and removing an override remain distinct', () => {
  const change = projectAccountRuleChange({context, scope: 'episode', before: {intro, outro}, after: {intro: null}});
  assert.deepEqual(change.changes, {intro: {op: 'set', rule: null}, outro: {op: 'remove'}});

  const season = projectAccountRuleChange({context: {seriesKey: 'local:test-work:season-1', episodeKey: 'ep-a'},
    scope: 'series', before: {}, after: {outro}});
  assert.deepEqual(season.target, {scope: 'series', seriesKey: 'local:test-work:season-1'});
});

test('rejects non-product data, invalid timing, raw URLs and an iYF series default', () => {
  const target = {scope: 'episode', seriesKey: context.seriesKey, episodeKey: context.episodeKey};
  const data = {target, changes: {intro: {op: 'set', rule: intro}}};
  for (const outsideScope of [
    {...data, accountId: 'b'},
    {...data, target: {...target, seriesKey: context.url}},
    {...data, target: {scope: 'series', seriesKey: context.seriesKey}},
    {...data, changes: {...data.changes, next: {op: 'set', rule: false}}},
    {...data, changes: {intro: {op: 'set', rule: outro}}},
    {...data, changes: {intro: {op: 'set', rule: {...intro, cookie: 'synthetic'}}}},
  ]) assert.throws(() => parseAccountRuleChange(outsideScope), TypeError);
});
