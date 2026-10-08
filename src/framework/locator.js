import {requireValue, options} from './control/value.js';
import {createLocatorDescriptor, validateLocatorOperation} from './control/locator-contract.js';

// Each Locator is a zero-RPC, immutable description tied to one admitted document.
// Runtime transport/identity never appear as public instance properties.
const bindings = new WeakMap();
function captured(locator) {
  const binding = bindings.get(locator);
  requireValue(binding, 'E_PAGE_CONTEXT_REQUIRED');
  binding.context.guard(binding.target);
  return binding;
}
function spawn(binding, kind, value, opts = {}, parent = null) {
  binding.context.guard(binding.target);
  const item = Object.create(Locator.prototype);
  bindings.set(item, {...binding, descriptor:createLocatorDescriptor(kind, value, opts, parent)});
  return Object.freeze(item);
}
function scoped(locator, kind, value, opts = {}) {
  const binding = captured(locator);
  return spawn(binding, kind, value, opts, binding.descriptor);
}
function timeoutOptions(opts = {}) {
  options(opts, ['timeout']);
  return opts.timeout === undefined ? {} : {timeout:opts.timeout};
}
function run(locator, method, operation) {
  const {context, descriptor, target} = captured(locator);
  return context.request(method, [descriptor, validateLocatorOperation(operation)], {target});
}
export function createLocator(context, kind, value, opts = {}) {
  return spawn({context, target:context.capture()}, kind, value, opts);
}
export class Locator {
  locator(css) { return scoped(this, 'css', css); }
  getByRole(role, opts = {}) { return scoped(this, 'role', role, opts); }
  getByLabel(text, opts = {}) { return scoped(this, 'label', text, opts); }
  getByText(text, opts = {}) { return scoped(this, 'text', text, opts); }
  getByTestId(id) { return scoped(this, 'testId', id); }
  async click(opts = {}) { await run(this, 'locatorAction', {action:'click', ...timeoutOptions(opts)}); }
  async fill(value, opts = {}) { await run(this, 'locatorAction', {action:'fill', value, ...timeoutOptions(opts)}); }
  count() { return run(this, 'locatorRead', {action:'count'}); }
  textContent(opts = {}) { options(opts, []); return run(this, 'locatorRead', {action:'textContent'}); }
  getAttribute(name, opts = {}) { options(opts, []); return run(this, 'locatorRead', {action:'getAttribute', name}); }
  async waitFor(opts = {}) {
    options(opts, ['state','timeout']);
    const {state = 'visible', timeout = 30000} = opts;
    await run(this, 'locatorWait', {action:'waitFor', state, timeout});
  }
}
Object.freeze(Locator.prototype);
