import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, canStartHandoff, createHandoffRecord, recoverHandoff, transitionHandoff, statusLabel } from '../lib/state.js';

const sample = () => createHandoffRecord({
  id: 'test-id', channelId: 'chatgpt-personal', actionId: 'purchase',
  accountLabel: '本人账号（本地标签）', url: 'https://chatgpt.com/', now: '2026-11-27T00:00:00.000Z'
});

test('blocks duplicate handoff while opening or awaiting official confirmation', () => {
  const opening = sample();
  assert.equal(canStartHandoff(opening), false);
  const opened = transitionHandoff(opening, STATUS.OFFICIAL_PAGE_OPENED_UNVERIFIED);
  assert.equal(canStartHandoff(opened), false);
});

test('interrupted OPENING state recovers to unknown and does not retry', () => {
  const recovered = recoverHandoff(sample(), '2026-11-27T01:00:00.000Z');
  assert.equal(recovered.status, STATUS.HANDOFF_UNKNOWN);
  assert.equal(canStartHandoff(recovered), false);
});

test('user-reported completion is explicitly unverified, never success', () => {
  const opened = transitionHandoff(sample(), STATUS.OFFICIAL_PAGE_OPENED_UNVERIFIED);
  const reported = transitionHandoff(opened, STATUS.USER_REPORTED_COMPLETION_UNVERIFIED);
  assert.match(statusLabel(reported.status), /未经过官方核验|未经官方核验/);
  assert.equal(Object.values(STATUS).includes('SUCCESS'), false);
  assert.equal(canStartHandoff(reported), false);
});

test('manual review only closes the local blocker and does not assert verified success', () => {
  const opened = transitionHandoff(sample(), STATUS.OFFICIAL_PAGE_OPENED_UNVERIFIED);
  const reviewed = transitionHandoff(opened, STATUS.USER_REVIEWED_UNVERIFIED);
  assert.equal(canStartHandoff(reviewed), true);
  assert.match(statusLabel(reviewed.status), /扩展未验证/);
});

test('invalid state transitions are rejected', () => {
  assert.throws(() => transitionHandoff(sample(), STATUS.USER_REVIEWED_UNVERIFIED));
});

test('user-reported cancellation remains unverified and blocks another handoff', () => {
  const opened = transitionHandoff(sample(), STATUS.OFFICIAL_PAGE_OPENED_UNVERIFIED);
  const cancelled = transitionHandoff(opened, STATUS.USER_REPORTED_CANCELLED_UNVERIFIED);
  assert.match(statusLabel(cancelled.status), /官方结果未知/);
  assert.equal(canStartHandoff(cancelled), false);
});
