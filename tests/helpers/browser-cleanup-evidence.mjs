import assert from 'node:assert/strict';
import {BROWSER_CLEANUP_INTERRUPTED,BROWSER_SHUTDOWN_MESSAGE,PASSIVE_BROWSER_CLEANUPS} from '../../src/platform/chrome/lifecycle-errors.js';

// A warning is evidence of interrupted teardown, never evidence of completed
// cleanup. Keep the raw event; accept it only within a proven normal exit.
export function assertBrowserCleanupEvidence(event,lifecycles,extensionId){
  assert.equal(event.type,'warning');assert.equal(event.args?.length,3);
  assert.equal(event.args[0].value,BROWSER_CLEANUP_INTERRUPTED);
  const phase=event.args[1].value,error=event.args[2];
  assert(PASSIVE_BROWSER_CLEANUPS.includes(phase),'known passive cleanup operation');
  assert.equal(error.subtype,'error');assert.equal(error.className,'Error');
  assert.equal(error.preview?.properties?.find(row=>row.name==='message')?.value,BROWSER_SHUTDOWN_MESSAGE);
  const path=phase==='context-menu-tab-removed'?'platform/context-menus.js':'sw.js';
  assert.equal(event.stackTrace?.callFrames?.[0]?.url,'chrome-extension://'+extensionId+'/'+path,
    'warning must originate in the actual fixed extension cleanup entry');
  const lifecycle=lifecycles.find(row=>row.generation===event.generation);
  assert(lifecycle?.normalExit,'cleanup interruption requires observed normal browser exit');
  assert.equal(lifecycle.exit?.code,0);assert.equal(lifecycle.exit?.signal,null);
  assert(Number.isFinite(lifecycle.closeRequestedAt)&&Number.isFinite(lifecycle.exitObservedAt));
  assert(lifecycle.exitObservedAt>=lifecycle.closeRequestedAt);
  assert(Number.isFinite(event.timestamp)&&event.timestamp>=lifecycle.closeRequestedAt&&
    event.timestamp<=lifecycle.exitObservedAt,'cleanup warning must be inside this actual Browser.close interval');
}
