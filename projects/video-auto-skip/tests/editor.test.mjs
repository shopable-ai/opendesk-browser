import assert from 'node:assert/strict';
import test from 'node:test';
import {blankTiming, changeEndpoint, clearTimeIntent, endpointsFor, timeIssue} from '../src/editor.js';
import {resolveInterval} from '../src/rules.js';

test('all four time fields have distinct, explicit clear semantics', () => {
  assert.deepEqual(clearTimeIntent('intro', 'start'), {kind: 'endpoint', value: 0});
  assert.deepEqual(clearTimeIntent('intro', 'end'), {kind: 'unset-rule'});
  assert.deepEqual(clearTimeIntent('outro', 'start'), {kind: 'unset-rule'});
  assert.deepEqual(clearTimeIntent('outro', 'end'), {kind: 'endpoint', value: undefined});
});

test('clearing an edited intro starting point rebinds it to 00:00', () => {
  const rule = {kind: 'fixed', start: 15, end: 90};
  assert.deepEqual(changeEndpoint('intro', rule, 'start', undefined, 2700),
    {kind: 'fixed', start: 0, end: 90});
  assert.equal(timeIssue(changeEndpoint('intro', rule, 'start', 0, 2700), 2700), '');
  assert.deepEqual(blankTiming('intro'), {kind: 'fixed', start: 0});
});

test('clearing the custom outro ending point binds End and preserves the chosen start', () => {
  const original = {kind: 'fixed', start: 2550, end: 2610};
  const cleared = changeEndpoint('outro', original, 'end', undefined, 2700);
  assert.deepEqual(cleared, {kind: 'tail', seconds: 150});
  assert.deepEqual(resolveInterval(cleared, 2700), {start: 2550, end: 2700});
  assert.deepEqual(resolveInterval(cleared, 2880), {start: 2730, end: 2880});
  assert.deepEqual(resolveInterval(original, 2880), {start: 2550, end: 2610});
});

test('a 90-second relative outro always follows the actual video end', () => {
  const rule = {kind: 'tail', seconds: 90};
  assert.deepEqual(endpointsFor(rule, 2700), {start: 2610, end: 2700});
  assert.deepEqual(endpointsFor(rule, 2880), {start: 2790, end: 2880});
  assert.deepEqual(endpointsFor(rule, 3600), {start: 3510, end: 3600});
  assert.deepEqual(rule, {kind: 'tail', seconds: 90}, 'switching video must not rewrite the saved rule');
  assert.equal(resolveInterval(rule, NaN), null);
  assert.equal(resolveInterval(rule, 89), null);
});

test('entering a concrete outro end switches to a fixed interval', () => {
  const tail = {kind: 'tail', seconds: 90};
  const manual = changeEndpoint('outro', tail, 'end', 2680, 2700);
  assert.deepEqual(manual, {kind: 'fixed', start: 2610, end: 2680});
  assert.deepEqual(resolveInterval(manual, 2880), {start: 2610, end: 2680});
  assert.deepEqual(changeEndpoint('outro', manual, 'end', 2700, 2700), tail);
  assert.equal(timeIssue({kind: 'fixed', start: 200, end: 200}, 2700), '开始必须早于结束。');
});
