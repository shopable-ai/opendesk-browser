import assert from 'node:assert/strict';

// These checks consume read-only Chrome context/target observations. They do
// not open a panel, grant permissions, or turn a catalog tab into a Sidebar.
export function selectControllerSidebar({contexts, targets, extensionId}) {
  assert.match(extensionId, /^[a-p]{32}$/);
  assert(Array.isArray(contexts) && Array.isArray(targets));
  const entries = contexts.filter(context => {
    if (context.contextType !== 'SIDE_PANEL' || context.incognito !== false) return false;
    let url;
    try {url = new URL(context.documentUrl);} catch {return false;}
    return url.protocol === 'chrome-extension:' && url.hostname === extensionId &&
      url.pathname === '/ui/tool.html' && !!url.searchParams.get('hostInstanceId');
  });
  assert(entries.length <= 1, 'Ambiguous native Sidebar contexts');
  if (!entries.length) return null;
  const context = entries[0];
  assert.equal(context.tabId, -1, 'Sidebar must not be a catalog tab');
  // Chrome may report -1 for a Sidebar context even while its native panel is
  // visible. Keep that observation; the owned process/document/target binding
  // and trusted UI witness still identify this exact entry.
  assert(Number.isSafeInteger(context.windowId) && context.windowId >= -1);
  assert(typeof context.documentId === 'string' && context.documentId.trim());
  assert(typeof context.contextId === 'string' && context.contextId.trim());
  const matches = targets.filter(target => target.url === context.documentUrl &&
    ['page','other'].includes(target.type));
  assert(matches.length <= 1, 'Ambiguous debugger target for native Sidebar');
  if (!matches.length) return null;
  assert(typeof matches[0].targetId === 'string' && matches[0].targetId.trim());
  return {context, target:matches[0]};
}

export function validateControllerSidebarAck(ack, request, entry) {
  assert.equal(ack.requestId, request.requestId);
  assert.equal(ack.pid, request.pid);
  assert.equal(ack.extensionId, request.extensionId);
  assert.equal(ack.targetId, entry.target.targetId);
  assert.equal(ack.documentId, entry.context.documentId);
  assert.equal(ack.windowId, entry.context.windowId);
  assert.equal(ack.nativeSidebarOpened, true);
  assert.equal(ack.noDomAssignment, true);
  assert.equal(ack.noSyntheticEvent, true);
  return entry;
}
