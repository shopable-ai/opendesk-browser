import test from 'node:test';
import assert from 'node:assert/strict';
import {sidebarToolRequestTimeout} from '../../src/sidebar-tools/bridge.js';

test('R2–R3 browser operations awaiting visible user approval retain a 120s sandbox lifetime',()=>{
 for(const operation of ['browser.tabs.create','browser.tabs.activateOwned','browser.tabs.pinOwned','browser.tabs.reloadOwned','browser.tabs.navigateOwned','browser.sidePanel.openSelf',
  'browser.network.request','browser.network.observe.start','browser.network.observe.export',
  'browser.screenshot.captureVisible'])
  assert.equal(sidebarToolRequestTimeout(operation,'browser-probe'),120000,operation);
});
test('installed Bookmarks and Scheduler approval survives reading the trusted Chrome prompt',()=>{
 for(const operation of ['browser.bookmarks.create','browser.bookmarks.removeOwned','browser.scheduler.create'])
  assert.equal(sidebarToolRequestTimeout(operation,'browser-probe'),120000,operation);
 for(const operation of ['browser.scheduler.listOwn','browser.scheduler.cancelOwn'])
  assert.equal(sidebarToolRequestTimeout(operation,'browser-probe'),8000,operation);
});
test('read-only Browser operations and unrelated tool requests keep the short timeout',()=>{
 for(const operation of ['browser.capabilities.list','browser.events.read','browser.events.close',
  'browser.operations.getStatus','browser.operations.cancel',
  'storage.get','page.toc'])
  assert.equal(sidebarToolRequestTimeout(operation,'browser-probe'),8000,operation);
 assert.equal(sidebarToolRequestTimeout('time.start','time-review'),120000);
 assert.equal(sidebarToolRequestTimeout('time.clear','time-review'),120000);
 assert.equal(sidebarToolRequestTimeout('time.start','browser-probe'),8000);
});
