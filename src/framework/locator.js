import {requireValue, options} from './control/value.js';
import {createLocatorDescriptor, withLocatorIndex, validateLocatorOperation} from './control/locator-contract.js';

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
function indexed(locator, index) {
  const binding = captured(locator);
  const item = Object.create(Locator.prototype);
  bindings.set(item, {...binding, descriptor:withLocatorIndex(binding.descriptor, index)});
  return Object.freeze(item);
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
  getByTestId(id) { return scoped(this, 'testId', id); }
  first() { return indexed(this, 0); }
  last() { return indexed(this, -1); }
  nth(index) { return indexed(this, index); }
  async click(opts = {}) { await run(this, 'locatorAction', {action:'click', ...timeoutOptions(opts)}); }
  async fill(value, opts = {}) { await run(this, 'locatorAction', {action:'fill', value, ...timeoutOptions(opts)}); }
  async check(opts = {}) { await run(this, 'locatorAction', {action:'check', ...timeoutOptions(opts)}); }
  async uncheck(opts = {}) { await run(this, 'locatorAction', {action:'uncheck', ...timeoutOptions(opts)}); }
  async selectOption(value, opts = {}) { await run(this, 'locatorAction', {action:'selectOption', value, ...timeoutOptions(opts)}); }
  count() { return run(this, 'locatorRead', {action:'count'}); }
  textContent(opts = {}) { options(opts, []); return run(this, 'locatorRead', {action:'textContent'}); }
  getAttribute(name, opts = {}) { options(opts, []); return run(this, 'locatorRead', {action:'getAttribute', name}); }
  async waitFor(opts = {}) {
    options(opts, ['state','timeout']);
    const {state = 'visible', timeout = 30000} = opts;
    await run(this, 'locatorWait', {action:'waitFor', state, timeout});
  }
}
for (const [method, kind] of [['getByRole','role'],['getByLabel','label'],['getByText','text'],
  ['getByPlaceholder','placeholder'],['getByTitle','title'],['getByAltText','alt']]) {
  Object.defineProperty(Locator.prototype, method, {
    value: function(value, opts = {}) { return scoped(this, kind, value, opts); }
  });
}
for (const action of ['innerText','inputValue','isVisible','isEnabled','isChecked']) {
  Object.defineProperty(Locator.prototype, action, {
    value: function() { return run(this, 'locatorRead', {action}); }
  });
}
Object.freeze(Locator.prototype);
