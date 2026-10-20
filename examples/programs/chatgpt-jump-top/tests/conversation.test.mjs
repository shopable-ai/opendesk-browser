import test from 'node:test';
import assert from 'node:assert/strict';
import {findConversationScroller, jumpConversationTop, chooseConversationHeader,
  findHeaderAction} from '../src/conversation.js';

const rect = (width = 1000, top = 8, left = 0) =>
  ({width, height: 46, top, left, right: left + width, bottom: top + 46});
const display = () => ({display: 'flex', visibility: 'visible', overflowY: 'auto'});
const win = {innerHeight: 900, getComputedStyle: display};

function header({width = 900, top = 8, editor = false} = {}) {
  const editButton = {
    isConnected: true, closest: () => null,
    getBoundingClientRect: () => rect(34, top, 780),
    hasAttribute: () => false
  };
  return {
    isConnected: true, closest: () => null,
    getBoundingClientRect: () => rect(width, top),
    querySelectorAll: selector => selector.includes('Open editor')
      ? (editor ? [editButton] : [])
      : (selector === 'button' ? [editButton] : [])
  };
}

test('multiple headers: prefer the unique header with Open editor', () => {
  const a = header({width: 1100});
  const b = header({width: 700, editor: true});
  const doc = {querySelectorAll: selector => selector === 'header' ? [a, b] : []};
  const main = {contains: () => true, getBoundingClientRect: () => rect(1200)};
  assert.equal(chooseConversationHeader(doc, win, main), b);
  assert.ok(findHeaderAction(b, win));
});

test('ambiguous Open editor headers fail closed, not duplicated', () => {
  const a = header({editor: true});
  const b = header({editor: true});
  const doc = {querySelectorAll: () => [a, b]};
  const main = {contains: () => true, getBoundingClientRect: () => rect(1200)};
  assert.equal(chooseConversationHeader(doc, win, main), null);
});

test('prefer the conversation scroller, not a nested editor or page', () => {
  let called = null;
  const scroller = {
    scrollHeight: 2000, clientHeight: 480, scrollTop: 940,
    scrollTo: opts => {called = opts;},
    parentElement: null
  };
  const turn = {parentElement: scroller};
  const root = {scrollHeight: 3200, clientHeight: 900, scrollTop: 1200};
  const doc = {body: {}, documentElement: {}, scrollingElement: root};
  const main = {querySelector: () => turn};
  assert.equal(findConversationScroller(turn, doc, win), scroller);
  assert.equal(jumpConversationTop(main, doc, win), true);
  assert.deepEqual(called, {top: 0, behavior: 'instant'});
  assert.equal(root.scrollTop, 1200);
});

test('no conversation turns means no scroll', () => {
  const doc = {body: {}, documentElement: {}, scrollingElement: {}};
  assert.equal(jumpConversationTop({querySelector: () => null}, doc, win), false);
});
