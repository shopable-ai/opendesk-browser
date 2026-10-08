import {PageError, requireValue, selector, duration, options, VALUE_LIMITS} from '../../framework/control/value.js';
import {createLocatorDOM} from './locator-dom.js';

// This registry runs only in the broker-selected ISOLATED document agent. It is
// fixed packaged code; function source from a caller is never evaluated here.
export function createPackagedPageSession({document: doc = document, window: win = window, signal, guard = () => {}, packageURLs = []} = {}) {
  const waits = new Set(), uploads = new Map(), nodes = new Set(), resources = new Set();
  const allowed = new Set(packageURLs); let disposed = false;
  const cancelCode = () => typeof signal?.reason?.code === 'string' ? signal.reason.code : 'E_CANCELLED';
  function check() {
    requireValue(!disposed && !signal?.aborted, cancelCode()); guard();
  }
  const locatorDOM = createLocatorDOM({document:doc, window:win, check});
  function element(css) {
    check(); selector(css); let found;
    try { found = doc.querySelector(css); } catch (cause) { throw new PageError('E_SELECTOR_INVALID', cause.message); }
    requireValue(found, 'E_SELECTOR_NOT_FOUND'); return found;
  }
  function editable(el) {
    requireValue((el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text', 'search', 'email', 'url', 'tel', 'password'].includes(el.type))) && !el.disabled && !el.readOnly, 'E_INPUT_TARGET_UNSUPPORTED');
  }
  function event(el, value) { check(); el.dispatchEvent(value); }
  function delay(ms) {
    check(); duration(ms);
    return new Promise((resolve, reject) => {
      const wait = {cancel: reason => finish(reason || new PageError('E_CANCELLED'))};
      const abort = () => wait.cancel(new PageError(cancelCode()));
      let timer;
      function finish(error) { clearTimeout(timer); waits.delete(wait); signal?.removeEventListener('abort', abort); if (error) reject(error); else { try { check(); resolve(); } catch (cause) { reject(cause); } } }
      waits.add(wait); signal?.addEventListener('abort', abort, {once: true}); timer = setTimeout(() => finish(), ms);
      if (signal?.aborted) abort();
    });
  }
  async function selectWait(css, value) {
    selector(css); options(value, ['visible', 'hidden', 'timeout']);
    const {visible = false, hidden = false, timeout = 30000} = value;
    requireValue(typeof visible === 'boolean' && typeof hidden === 'boolean' && !(visible && hidden), 'E_ARGUMENT_TYPE'); duration(timeout);
    const started = performance.now();
    for (;;) {
      check(); let el; try { el = doc.querySelector(css); } catch (cause) { throw new PageError('E_SELECTOR_INVALID', cause.message); }
      if (el) {
        const style = win.getComputedStyle(el), isHidden = style.display === 'none' || style.visibility === 'hidden';
        if ((!visible && !hidden) || (visible && !isHidden) || (hidden && isHidden)) return true;
      }
      if (timeout !== 0 && performance.now() - started >= timeout) throw new PageError('E_TIMEOUT', 'Selector wait timed out');
      await delay(timeout === 0 ? 25 : Math.min(25, Math.max(0, timeout - (performance.now() - started))));
    }
  }
  async function click(css, value) {
    const el = element(css); options(value, ['button', 'clickCount', 'delay']);
    const {button = 'left', clickCount = 1, delay: ms = 0} = value;
    requireValue(['left', 'right', 'middle'].includes(button) && Number.isInteger(clickCount) && clickCount >= 1 && clickCount <= 100, 'E_ARGUMENT_TYPE'); duration(ms);
    const init = {bubbles: true, cancelable: true, detail: clickCount};
    for (let i = 0; i < clickCount; i++) {
      event(el, new win.MouseEvent('mousedown', init)); await delay(ms);
      event(el, new win.MouseEvent('mouseup', init));
      event(el, new win.MouseEvent(button === 'right' ? 'contextmenu' : button === 'middle' ? 'mouseup' : 'click', init));
    }
    return 'clicked';
  }
  async function type(css, text, value) {
    const el = element(css); editable(el); requireValue(typeof text === 'string', 'E_ARGUMENT_TYPE'); options(value, ['delay']);
    const ms = duration(value.delay ?? 0); check(); el.focus();
    for (const char of text) {
      const init = {key: char, char, code: 'Key' + char.toUpperCase(), bubbles: true, cancelable: true};
      event(el, new win.KeyboardEvent('keydown', init)); check(); editable(el); el.value += char;
      let input;
      if (typeof win.InputEvent === 'function') input = new win.InputEvent('input', {data: char, inputType: 'insertText', bubbles: true});
      else input = new win.Event('input', {bubbles: true});
      event(el, input); event(el, new win.KeyboardEvent('keypress', init)); event(el, new win.KeyboardEvent('keyup', init));
      if (ms > 0) await delay(ms);
    }
    return 'Typed';
  }
  function keyboard(action, key) {
    requireValue(['press', 'down', 'up'].includes(action) && typeof key === 'string' && key, 'E_ARGUMENT_TYPE');
    requireValue(key.length === 1 || !key.includes('+'), 'E_KEY_UNSUPPORTED');
    const events = action === 'press' ? ['keydown', 'keypress', 'keyup'] : [action === 'down' ? 'keydown' : 'keyup'];
    for (const type of events) event(doc, new win.KeyboardEvent(type, {key}));
    // Preserve the old document-event behavior, including Backspace value unchanged.
    return undefined;
  }
  function uploadChunk(id, offset, total, base64) {
    requireValue(typeof id === 'string' && Number.isSafeInteger(total) && total >= 0 && total <= VALUE_LIMITS.uploadBytes && Number.isSafeInteger(offset) && offset >= 0 && typeof base64 === 'string', 'E_UPLOAD_FORMAT');
    requireValue(/^[A-Za-z0-9+/]*={0,2}$/.test(base64) && base64.length % 4 === 0, 'E_UPLOAD_FORMAT');
    let binary; try { binary = atob(base64); } catch { throw new PageError('E_UPLOAD_FORMAT'); }
    requireValue(binary.length > 0 && binary.length <= VALUE_LIMITS.chunkBytes && offset + binary.length <= total, 'E_UPLOAD_FORMAT');
    let upload = uploads.get(id);
    if (!upload) { requireValue(offset === 0 && uploads.size === 0, 'E_UPLOAD_FORMAT'); upload = {total, offset: 0, bytes: new Uint8Array(total)}; uploads.set(id, upload); }
    requireValue(upload.total === total && upload.offset === offset, 'E_UPLOAD_FORMAT');
    upload.bytes.set(Uint8Array.from(binary, c => c.charCodeAt(0)), offset); upload.offset += binary.length; return undefined;
  }
  function uploadCommit(css, id, total) {
    const upload = uploads.get(id); uploads.delete(id);
    requireValue((total === 0 && !upload) || (upload && upload.total === total && upload.offset === total), 'E_UPLOAD_FORMAT');
    const el = element(css); requireValue(el.tagName === 'INPUT' && el.type === 'file' && !el.disabled && !el.multiple && !el.webkitdirectory, 'E_INPUT_TARGET_UNSUPPORTED');
    const transfer = new win.DataTransfer(); transfer.items.add(new win.File([upload?.bytes || new Uint8Array()], 'filename.jpg', {type: 'image/jpeg'}));
    check(); el.files = transfer.files; event(el, new win.Event('change', {bubbles: true})); return undefined;
  }
  async function addTag(method, value) {
    const isScript = method === 'addScriptTag'; options(value, isScript ? ['url', 'type'] : ['url', 'content']);
    check(); const parent = isScript ? doc.body : doc.head; requireValue(parent, 'E_PAGE_NOT_READY');
    requireValue(isScript ? typeof value.url === 'string' : (typeof value.url === 'string') !== (typeof value.content === 'string'), 'E_ARGUMENT_TYPE');
    if (value.url !== undefined) requireValue(allowed.has(value.url), 'E_RESOURCE_URL_UNSUPPORTED', 'Resource must be in the packaged allowlist');
    if (!isScript && value.content !== undefined) requireValue(typeof value.content === 'string' && !/@import\b|url\s*\(/i.test(value.content), 'E_STYLE_URL_UNSUPPORTED');
    const node = doc.createElement(isScript ? 'script' : value.url ? 'link' : 'style'); nodes.add(node);
    if (value.url) {
      if (isScript) { node.src = value.url; if (value.type !== undefined) { requireValue(value.type === 'text/javascript', 'E_OPTION_UNSUPPORTED'); node.type = value.type; } }
      else { node.rel = 'stylesheet'; node.href = value.url; }
      await new Promise((resolve, reject) => {
        const resource = {cancel: () => finish(new PageError('E_CANCELLED'))};
        function finish(error) { node.onload = null; node.onerror = null; clearTimeout(timer); resources.delete(resource); if (error) { node.remove(); nodes.delete(node); reject(error); } else resolve(); }
        const timer = setTimeout(() => finish(new PageError('E_TIMEOUT')), 30000);
        node.onload = () => finish(); node.onerror = () => finish(new PageError('E_RESOURCE_UNAVAILABLE'));
        resources.add(resource); check(); parent.append(node);
      });
    } else { node.textContent = value.content; check(); parent.append(node); }
    check(); return undefined;
  }
  async function execute(method, args, documentPin = {}) {
    check(); requireValue(Array.isArray(args), 'E_ARGUMENT_TYPE');
    switch (method) {
      case 'locatorRead': return locatorDOM.read(...args);
      case 'locatorPrepare': return locatorDOM.prepare(...args);
      case 'locatorCommit': return locatorDOM.commit(...args);
      case 'locatorObserve': return locatorDOM.observe(args[0], documentPin);
      case 'title': return doc.title;
      case 'content': requireValue(doc.body, 'E_PAGE_NOT_READY'); return doc.body.innerHTML;
      case 'url': return win.location.href;
      case 'snapshot': { selector(args[0]); let el; try { el = doc.querySelector(args[0]); } catch (cause) { throw new PageError('E_SELECTOR_INVALID', cause.message); } return el ? {outerHTML: el.outerHTML} : null; }
      case 'snapshots': { selector(args[0]); try { return Array.from(doc.querySelectorAll(args[0]), el => ({outerHTML: el.outerHTML})); } catch (cause) { throw new PageError('E_SELECTOR_INVALID', cause.message); } }
      case 'click': return click(...args);
      case 'type': return type(...args);
      case 'keyboard': return keyboard(...args);
      case 'waitForTimeout': await delay(args[0]); return undefined;
      case 'waitForSelector': return selectWait(...args);
      case 'uploadChunk': return uploadChunk(...args);
      case 'uploadCommit': return uploadCommit(...args);
      case 'addScriptTag': case 'addStyleTag': return addTag(method, args[0]);
      default: throw new PageError('E_OPERATION_UNSUPPORTED', `Not a packaged DOM operation: ${method}`);
    }
  }
  function dispose() {
    if (disposed) return; disposed = true;
    for (const wait of [...waits]) wait.cancel(new PageError(cancelCode()));
    for (const resource of [...resources]) resource.cancel();
    for (const node of nodes) node.remove(); nodes.clear(); uploads.clear(); locatorDOM.clear();
    signal?.removeEventListener('abort', dispose);
  }
  signal?.addEventListener('abort', dispose, {once: true}); if (signal?.aborted) dispose();
  return Object.freeze({execute, dispose, snapshot: () => ({waits: waits.size, uploads: uploads.size, nodes: nodes.size, resources: resources.size})});
}
