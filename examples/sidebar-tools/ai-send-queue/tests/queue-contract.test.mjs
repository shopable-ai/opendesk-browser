import test from 'node:test';
import assert from 'node:assert/strict';
import {QUEUE_PROTOCOL,QUEUE_COMMANDS,QUEUE_READ,QUEUE_WRITE,QUEUE_MEMORY_ONLY} from '../src/shared/queue-contract.js';
test('Page and React import one public, readonly contract without granting privileges',()=>{
  assert.equal(QUEUE_PROTOCOL,'opendesk.ai-send-queue.control.v1');
  assert.deepEqual(QUEUE_COMMANDS,['pause','resume','now','edit','remove','move']);
  assert.ok(Object.isFrozen(QUEUE_COMMANDS));
  assert.equal(QUEUE_READ,'sendQueue.snapshot');
  assert.equal(QUEUE_WRITE,'sendQueue.command');
  assert.equal(QUEUE_MEMORY_ONLY,true);
  assert.equal(QUEUE_COMMANDS.includes('script'),false);
});
