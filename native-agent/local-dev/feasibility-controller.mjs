// Fixed Controller input for LocalDevResolver; never imported as executable Node code.
async function main() {
  const policy = params.policy;
  if (policy?.version !== 'opendesk.feasibility.policy.v1') throw new Error('E_POLICY');
  if (await page.url() !== policy.url) throw new Error('E_DOCUMENT_STALE');
  if (params.operation === 'probe') return {title: await page.title()};
  if (params.operation !== 'write_field' || policy.allowWriteField !== true ||
      typeof params.text !== 'string' || Array.from(params.text).length > 100) throw new Error('E_SCHEMA');
  // One synchronous document operation: no selector interpolation, eval, form
  // submission, focus or navigation. Existing Page Authority owns this RPC.
  return page.evaluate((scope, text) => {
    if (location.href !== scope.url) throw new Error('E_DOCUMENT_STALE');
    const fields = document.querySelectorAll(scope.selector);
    if (fields.length !== 1) throw new Error('E_FIELD_SCOPE');
    const field = fields[0];
    const editable = () => {
      const input = field instanceof HTMLInputElement;
      const textarea = field instanceof HTMLTextAreaElement;
      if (!input && !textarea) return false;
      const autocomplete = (field.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/);
      return field.isConnected && (textarea || input && ['text', 'search'].includes(field.type)) &&
        !field.disabled && !field.readOnly && !field.matches(':disabled') &&
        !field.closest('[hidden], [inert]') && field.getClientRects().length > 0 &&
        !['hidden', 'collapse'].includes(getComputedStyle(field).visibility) &&
        !autocomplete.some(token => /^(?:current-password|new-password|one-time-code|cc-.+|transaction-.+)$/.test(token));
    };
    if (!editable()) throw new Error('E_FIELD_UNSAFE');
    const prototype = field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, text);
    field.dispatchEvent(new Event('input', {bubbles: true}));
    // A page handler may replace, hide, disable or repurpose the element. Never
    // read back a replacement or a field that has become sensitive.
    const unchanged = () => location.href === scope.url && editable() &&
      document.querySelectorAll(scope.selector).length === 1 && document.querySelector(scope.selector) === field;
    if (!unchanged()) throw new Error('E_FIELD_CHANGED');
    field.dispatchEvent(new Event('change', {bubbles: true}));
    if (!unchanged()) throw new Error('E_FIELD_CHANGED');
    const actual = Object.getOwnPropertyDescriptor(prototype, 'value').get.call(field);
    return {value: actual, matched: actual === text};
  }, policy, params.text);
}
