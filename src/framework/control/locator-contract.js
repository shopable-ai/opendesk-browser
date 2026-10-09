import {PageError, requireValue, options, selector, duration} from './value.js';

// R5.1 deliberately exposes a documented Playwright-like subset, not selector engines.
export const PAGE_API_VERSION = '1.1.0-r13';
const roles = new Set(['button','link','textbox','searchbox','checkbox','radio','combobox','option','heading','dialog','form','region',
  'list','listitem','table','row','cell','columnheader','rowheader','img','article','navigation','main','banner','contentinfo','status','alert']);
const kinds = new Set(['css','role','label','text','testId','placeholder','title','alt']);
const textKinds = new Set(['label','text','placeholder','title','alt']);
const own = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(key => keys.includes(key));
function literal(value) {
  requireValue(typeof value === 'string' && value.length > 0 && value.length <= 1024, 'E_ARGUMENT_TYPE',
    'Expected nonempty string');
  return value;
}
function nativeCSS(value) {
  selector(value);
  requireValue(!/^\s*(?:xpath\s*=|text\s*=|role\s*=|\/\/|\/html\b)/i.test(value) &&
    !/(?:>>>|>>|\/deep\/|:has-text\s*\(|:text(?:-is|-matches)?\s*\(|:nth-match\s*\(|:visible\b|::-p-)/i.test(value),
  'E_SELECTOR_UNSUPPORTED', 'Native CSS only');
  return value;
}
function textOptions(value = {}) {
  options(value, ['exact']);
  requireValue(value.exact === undefined || typeof value.exact === 'boolean', 'E_ARGUMENT_TYPE');
  return value.exact === true;
}
function roleOptions(value = {}) {
  options(value, ['name', 'exact']);
  requireValue(value.name === undefined || typeof value.name === 'string' && value.name.length <= 1024, 'E_ARGUMENT_TYPE');
  return {name: value.name, exact: textOptions({exact: value.exact})};
}
export function createLocatorDescriptor(kind, value, opts = {}, parent = null) {
  requireValue(kinds.has(kind), 'E_SELECTOR_UNSUPPORTED');
  let entry;
  if (kind === 'css') { nativeCSS(value); options(opts, []); entry = {kind, value}; }
  else if (kind === 'role') {
    requireValue(typeof value === 'string' && roles.has(value), 'E_ROLE_UNSUPPORTED');
    const parsed = roleOptions(opts); entry = {kind, value, ...(parsed.name !== undefined ? {name:parsed.name} : {}), exact:parsed.exact};
  } else if (textKinds.has(kind)) {
    literal(value); entry = {kind, value, exact:textOptions(opts)};
  } else { literal(value); options(opts, []); entry = {kind, value}; }
  if (parent !== null) entry.parent = validateLocatorDescriptor(parent);
  return Object.freeze(entry);
}
export function validateLocatorDescriptor(input, depth = 0) {
  requireValue(depth < 8 && input && typeof input === 'object' && !Array.isArray(input) && kinds.has(input.kind), 'E_SELECTOR_UNSUPPORTED');
  requireValue(input.index === undefined || Number.isSafeInteger(input.index) &&
    Math.abs(input.index) <= 10000, 'E_ARGUMENT_TYPE');
  const keys = Object.keys(input);
  const expected = input.kind === 'role' ? ['kind','value','name','exact','parent','index'] :
    textKinds.has(input.kind) ? ['kind','value','exact','parent','index'] : ['kind','value','parent','index'];
  requireValue(keys.every(key => expected.includes(key)), 'E_OPTION_UNSUPPORTED');
  const opts = input.kind === 'role' ? {name:input.name, exact:input.exact} :
    textKinds.has(input.kind) ? {exact:input.exact} : {};
  const parent = input.parent === undefined ? null : validateLocatorDescriptor(input.parent, depth + 1);
  const descriptor = createLocatorDescriptor(input.kind, input.value, opts, parent);
  return input.index === undefined ? descriptor : Object.freeze({...descriptor, index:input.index});
}
export function withLocatorIndex(descriptor, index) {
  return validateLocatorDescriptor({...descriptor, index});
}
export function validateLocatorOperation(operation) {
  requireValue(own(operation, ['action','value','name','state','timeout']), 'E_ARGUMENT_TYPE');
  const {action} = operation;
  requireValue(['click','fill','check','uncheck','selectOption','count','textContent','innerText','inputValue','getAttribute','isVisible','isEnabled','isChecked','waitFor'].includes(action), 'E_OPERATION_UNSUPPORTED');
  if (action === 'fill' || action === 'selectOption') requireValue(typeof operation.value === 'string', 'E_ARGUMENT_TYPE');
  if (action === 'getAttribute') requireValue(typeof operation.name === 'string' && /^[^\s"'<>/=]+$/.test(operation.name), 'E_ARGUMENT_TYPE');
  if (action === 'waitFor') requireValue(['attached','detached','visible','hidden'].includes(operation.state), 'E_OPTION_UNSUPPORTED');
  if (operation.timeout !== undefined) { duration(operation.timeout); requireValue(operation.timeout <= 120000, 'E_ARGUMENT_TYPE'); }
  const expected = action === 'fill' || action === 'selectOption' ? ['action','value','timeout'] : action === 'getAttribute' ? ['action','name','timeout'] :
    action === 'waitFor' ? ['action','state','timeout'] : ['action','timeout'];
  requireValue(Object.keys(operation).every(key => expected.includes(key)), 'E_OPTION_UNSUPPORTED');
  return Object.freeze({...operation});
}
export function validateObservationOptions(input = {}) {
  options(input, ['root','maxDepth','maxNodes','maxChars']);
  const {root = 'body', maxDepth = 5, maxNodes = 80, maxChars = 10000} = input;
  nativeCSS(root);
  requireValue(Number.isInteger(maxDepth) && maxDepth >= 1 && maxDepth <= 8 &&
    Number.isInteger(maxNodes) && maxNodes >= 1 && maxNodes <= 200 &&
    Number.isInteger(maxChars) && maxChars >= 256 && maxChars <= 16000, 'E_ARGUMENT_TYPE');
  return Object.freeze({root,maxDepth,maxNodes,maxChars});
}
export const MODERN_PAGE_CAPABILITIES = Object.freeze({
  version:PAGE_API_VERSION, selectorEngine:'native-css-and-scoped-semantic-subset', input:'untrusted-isolated-dom',
  locator:['locator','getByRole','getByLabel','getByText','getByTestId','getByPlaceholder','getByTitle','getByAltText','first','last','nth'],
  actions:['click','fill','check','uncheck','selectOption'],
  reads:['count','textContent','innerText','inputValue','getAttribute','isVisible','isEnabled','isChecked','waitFor'],
  observation:'semantic-dom-summary',
  unsupported:['press','trusted-input','xpath','shadow-piercing']
});
