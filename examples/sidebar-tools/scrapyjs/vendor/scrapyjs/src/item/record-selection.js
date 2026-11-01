'use strict';

// One record-set contract, shared by manual, HTTP-candidate and browser profiles.
// Backends execute this JSON plan; scope never becomes part of a saved selector.
function recordSelection(container, selector, relation) {
  for (const [key, value] of [['container', container], ['selector', selector]]) {
    if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
      throw Object.assign(new Error('Invalid record ' + key), {code:'E_RECORD_SELECTION'});
    }
  }
  const scoped = container !== undefined;
  const resolved = relation === undefined ? (scoped ? 'directChildren' : 'descendants') : relation;
  if (!['directChildren', 'descendants'].includes(resolved) || (!scoped && resolved === 'directChildren')) {
    throw Object.assign(new Error('directChildren requires an explicit scope'), {code:'E_RECORD_SELECTION'});
  }
  return {listSelector: scoped ? container.trim() : null, itemSelector: selector === undefined ? null : selector.trim(), relation: resolved};
}

// Query records once in document order, then test membership by node identity.
// No empty scope or zero-match fallback to the document is permitted.
function selectCheerioRecords($, plan) {
  const containers = plan.listSelector === null ? [] : $(plan.listSelector).toArray();
  const nodes = $(plan.itemSelector || '*').toArray();
  if (plan.listSelector === null) return $(nodes);
  const scopes = new Set(containers);
  return $(nodes.filter(node => {
    for (let parent = node.parent; parent; parent = plan.relation === 'directChildren' ? null : parent.parent) {
      if (scopes.has(parent)) return true;
    }
    return false;
  }));
}
module.exports = {recordSelection, selectCheerioRecords};
