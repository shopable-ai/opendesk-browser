import {PageError, requireValue} from '../../framework/control/value.js';
import {validateLocatorDescriptor, validateLocatorOperation, validateObservationOptions,
  createLocatorDescriptor} from '../../framework/control/locator-contract.js';

// Semantic DOM approximation in the selected ISOLATED document. It is not the
// browser's Accessibility Tree; all exposed locators use precisely these rules.
const VALID_ROLES = new Set(['button','link','textbox','searchbox','checkbox','radio','combobox','option','heading','dialog','form','region',
  'list','listitem','table','row','cell','columnheader','rowheader','img','article','navigation','main','banner','contentinfo','status','alert']);
const space = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const matches = (actual, value, exact = false) => exact ? space(actual) === space(value) :
  space(actual).toLocaleLowerCase().includes(space(value).toLocaleLowerCase());
const tag = el => el.tagName?.toLowerCase() || '';
function implicitRole(el) {
  const name = tag(el), type = String(el.type || '').toLowerCase();
  if (name === 'button') return 'button';
  if ((name === 'a' || name === 'area') && el.hasAttribute('href')) return 'link';
  if (name === 'input') {
    if (['button','submit','reset','image'].includes(type)) return 'button';
    if (type === 'search') return 'searchbox';
    if (type === 'checkbox' || type === 'radio') return type;
    if (['text','email','tel','url','password',''].includes(type)) return 'textbox';
    return null;
  }
  if (name === 'textarea') return 'textbox';
  if (name === 'select') return !el.multiple && (!el.size || el.size === 1) ? 'combobox' : null;
  if (name === 'option') return 'option';
  if (/^h[1-6]$/.test(name)) return 'heading';
  return ({dialog:'dialog',form:'form',section:'region',ul:'list',ol:'list',li:'listitem',table:'table',
    tr:'row',td:'cell',th:'columnheader',img:'img',article:'article',nav:'navigation',main:'main',
    header:'banner',footer:'contentinfo',output:'status'})[name] || null;
}
export function semanticRole(el) {
  const declared = space(el.getAttribute?.('role')).split(' ').find(role => VALID_ROLES.has(role));
  if (declared) return declared;
  const implicit = implicitRole(el);
  // Landmark form/region is exposed by browsers only when it is named.
  if (['form','region'].includes(implicit) && !el.hasAttribute('aria-label') &&
      !el.hasAttribute('aria-labelledby') && !el.hasAttribute('title')) return null;
  return implicit;
}
function labelText(el, doc) {
  const labelledby = space(el.getAttribute('aria-labelledby'));
  if (labelledby) {
    const names = labelledby.split(' ').map(id => doc.getElementById(id)).filter(Boolean);
    if (names.length) return space(names.map(node => node.textContent).join(' '));
  }
  const aria = el.getAttribute('aria-label');
  if (aria !== null) return space(aria);
  const labels = Array.from(el.labels || []);
  // .labels is standard on labelable HTML elements. Fallback supports simple
  // fixtures while keeping the same browser behavior for wrapped labels.
  if (!labels.length && el.id) {
    for (const label of doc.querySelectorAll('label[for]')) if (label.htmlFor === el.id) labels.push(label);
  }
  if (!labels.length) {
    const ancestor = el.closest?.('label');
    if (ancestor) labels.push(ancestor);
  }
  return space(labels.map(label => label.textContent).join(' '));
}
export function accessibleName(el, doc) {
  const label = labelText(el, doc);
  if (label) return label;
  if (tag(el) === 'img' || tag(el) === 'input' && String(el.type).toLowerCase() === 'image')
    return space(el.getAttribute('alt'));
  if (tag(el) === 'input' && ['button','submit','reset'].includes(String(el.type).toLowerCase()))
    return space(el.value || el.getAttribute('value') || (el.type === 'submit' ? 'Submit' : el.type === 'reset' ? 'Reset' : ''));
  return space(el.textContent || el.getAttribute('title'));
}
function ariaHidden(el) {
  for (let current = el; current?.nodeType === 1; current = current.parentElement)
    if (current.getAttribute('aria-hidden') === 'true' || current.hasAttribute('hidden')) return true;
  return false;
}
function visible(el, win) {
  if (!el?.isConnected) return false;
  for (let current = el; current?.nodeType === 1; current = current.parentElement) {
    if (current.hasAttribute('hidden')) return false;
    const style = win.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
function candidates(scope) { return Array.from(scope.querySelectorAll('*')); }
function nativeQuery(scope, value) {
  try { return Array.from(scope.querySelectorAll(value)); }
  catch (cause) { throw new PageError('E_SELECTOR_INVALID', cause.message); }
}
export function locate(doc, descriptor) {
  const path = validateLocatorDescriptor(descriptor);
  function search(item) {
    const parents = item.parent ? search(item.parent) : [doc];
    if (item.parent && parents.length > 1) throw new PageError('E_STRICT_MODE_VIOLATION', 'Scope matched multiple elements');
    const root = parents[0];
    if (!root) return [];
    let found;
    if (item.kind === 'css') found = nativeQuery(root, item.value);
    else {
      const all = candidates(root);
      if (item.kind === 'testId') found = all.filter(el => el.getAttribute('data-testid') === item.value);
      else if (item.kind === 'role') found = all.filter(el => !ariaHidden(el) && semanticRole(el) === item.value &&
        (item.name === undefined || matches(accessibleName(el, doc), item.name, item.exact)));
      else if (item.kind === 'label') found = all.filter(el => ['input','textarea','select','button'].includes(tag(el)) &&
        matches(labelText(el, doc), item.value, item.exact));
      else if (['placeholder','title','alt'].includes(item.kind)) {
        const attr = item.kind === 'placeholder' ? 'placeholder' : item.kind === 'alt' ? 'alt' : 'title';
        found = all.filter(el => (item.kind !== 'alt' || tag(el) === 'img' || tag(el) === 'input' && el.type === 'image') &&
          el.hasAttribute(attr) && matches(el.getAttribute(attr), item.value, item.exact));
      } else {
        // Deepest matching text avoids ancestor/body duplication.
        found = all.filter(el => matches(el.textContent, item.value, item.exact) &&
          !Array.from(el.children).some(child => matches(child.textContent, item.value, item.exact)));
      }
    }
    if (item.index === undefined) return found;
    const index = item.index < 0 ? found.length + item.index : item.index;
    return index >= 0 && index < found.length ? [found[index]] : [];
  }
  return search(path);
}
function unique(nodes) {
  requireValue(nodes.length <= 1, 'E_STRICT_MODE_VIOLATION', 'Locator matched multiple elements');
  requireValue(nodes.length === 1, 'E_SELECTOR_NOT_FOUND', 'Locator matched no element');
  return nodes[0];
}
function rectOf(el) {
  const r = el.getBoundingClientRect();
  return {left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom};
}
function disabled(el) {
  return Boolean(el.matches?.(':disabled') || el.disabled || el.inert || el.closest?.('[inert]') ||
    el.closest?.('fieldset[disabled]') || el.closest?.('[aria-disabled="true"]'));
}
function actionability(el, op, doc, win) {
  const action = op.action;
  if (!visible(el, win)) return 'E_ELEMENT_NOT_VISIBLE';
  if (disabled(el)) return 'E_ELEMENT_DISABLED';
  if (win.getComputedStyle(el).pointerEvents === 'none') return 'E_ELEMENT_OBSCURED';
  if (action === 'fill') {
    if (!(tag(el) === 'textarea' || tag(el) === 'input' && ['text','search','email','url','tel','password'].includes(el.type)))
      throw new PageError('E_INPUT_TARGET_UNSUPPORTED');
    if (el.readOnly || el.getAttribute('aria-readonly') === 'true') return 'E_INPUT_READONLY';
  }
  if (action === 'check' || action === 'uncheck') {
    if (tag(el) !== 'input' || !['checkbox','radio'].includes(el.type) || action === 'uncheck' && el.type === 'radio')
      throw new PageError('E_INPUT_TARGET_UNSUPPORTED', 'Only native checkbox or radio check() is supported');
  }
  if (action === 'selectOption') {
    if (tag(el) !== 'select' || el.multiple) throw new PageError('E_INPUT_TARGET_UNSUPPORTED', 'Only single-select is supported');
    const choice = Array.from(el.options).find(option => option.value === op.value);
    if (!choice) return 'E_SELECT_OPTION_NOT_FOUND';
    if (choice.disabled) return 'E_ELEMENT_DISABLED';
  }
  const rect = rectOf(el), x = (Math.max(0, rect.left) + Math.min(rect.right, win.innerWidth)) / 2,
    y = (Math.max(0, rect.top) + Math.min(rect.bottom, win.innerHeight)) / 2;
  if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= win.innerWidth || rect.top >= win.innerHeight ||
      x >= win.innerWidth || y >= win.innerHeight) return 'E_ELEMENT_OUTSIDE_VIEWPORT';
  if (typeof doc.elementFromPoint === 'function') {
    const hit = doc.elementFromPoint(x, y);
    if (!hit || hit !== el && !el.contains(hit)) return 'E_ELEMENT_OBSCURED';
  }
  return null;
}
function inputValue(el, value, win) {
  // Native setter avoids custom element property shims. All events remain
  // untrusted DOM events in ISOLATED world; never claim trusted keyboard input.
  const prototype = tag(el) === 'textarea' ? win.HTMLTextAreaElement?.prototype : win.HTMLInputElement?.prototype;
  const setter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;
}
export function createLocatorDOM({document:doc, window:win, check = () => {}}) {
  const tokens = new Map(); let sequence = 0;
  function clear() { tokens.clear(); }
  function probe(descriptor, state) {
    check();
    const nodes = locate(doc, descriptor);
    if (nodes.length > 1) throw new PageError('E_STRICT_MODE_VIOLATION');
    const found = nodes[0], shown = found && visible(found, win);
    return {ready:state === 'attached' ? Boolean(found) : state === 'detached' ? !found :
      state === 'visible' ? Boolean(shown) : !shown, count:nodes.length};
  }
  function read(descriptor, operation) {
    check(); const op = validateLocatorOperation(operation);
    requireValue(['count','textContent','innerText','inputValue','getAttribute','isVisible','isEnabled','isChecked','waitFor'].includes(op.action), 'E_OPERATION_UNSUPPORTED');
    if (op.action === 'waitFor') return probe(descriptor, op.state);
    const nodes = locate(doc, descriptor);
    if (op.action === 'count') return nodes.length;
    if (op.action === 'isVisible' && nodes.length === 0) return false;
    const el = unique(nodes);
    if (op.action === 'textContent') return el.textContent;
    if (op.action === 'getAttribute') return el.getAttribute(op.name);
    if (op.action === 'innerText') return el.innerText ?? el.textContent ?? '';
    if (op.action === 'inputValue') {
      if (!['input','textarea','select'].includes(tag(el))) throw new PageError('E_INPUT_TARGET_UNSUPPORTED');
      return el.value;
    }
    if (op.action === 'isVisible') return visible(el, win);
    if (op.action === 'isEnabled') return !disabled(el);
    if (op.action === 'isChecked') {
      if (tag(el) === 'input' && ['checkbox','radio'].includes(el.type)) return Boolean(el.checked);
      if (['checkbox','radio'].includes(semanticRole(el)) && ['true','false'].includes(el.getAttribute('aria-checked')))
        return el.getAttribute('aria-checked') === 'true';
      throw new PageError('E_INPUT_TARGET_UNSUPPORTED');
    }
    throw new PageError('E_OPERATION_UNSUPPORTED');
  }
  async function prepare(descriptor, operation) {
    check(); const op = validateLocatorOperation(operation);
    requireValue(['click','fill','check','uncheck','selectOption'].includes(op.action), 'E_OPERATION_UNSUPPORTED');
    const nodes = locate(doc, descriptor);
    if (nodes.length > 1) throw new PageError('E_STRICT_MODE_VIOLATION');
    if (!nodes.length) return {ready:false, reason:'E_SELECTOR_NOT_FOUND'};
    const el = nodes[0], why = actionability(el, op, doc, win);
    if (why) return {ready:false, reason:why};
    // Validate geometry and identity at *two* frame boundaries; prepare
    // remains read-only (no scrolling, focus, setter, or page event).
    let before = rectOf(el);
    for (let frame = 0; frame < 2; frame++) {
      await new Promise(resolve => {
        let finished = false;
        const done = () => { if (finished) return; finished = true; clearTimeout(timer); resolve(); };
        const timer = setTimeout(done, 65);
        if (typeof win.requestAnimationFrame === 'function' && doc.visibilityState !== 'hidden') win.requestAnimationFrame(done);
      });
      check();
      const found = locate(doc, descriptor);
      if (!el.isConnected || found.length !== 1 || found[0] !== el)
        return {ready:false,reason:'E_ELEMENT_DETACHED'};
      const after = rectOf(el);
      // Subpixel motion is still motion; a per-frame tolerance would admit
      // continuously moving targets on high-refresh-rate displays.
      if (Object.keys(before).some(key => before[key] !== after[key]))
        return {ready:false,reason:'E_ELEMENT_UNSTABLE'};
      before = after;
    }
    const again = actionability(el, op, doc, win);
    if (again) return {ready:false,reason:again};
    for (const [key, value] of tokens) if (Date.now() - value.created > 5000) tokens.delete(key);
    if (tokens.size >= 16) tokens.delete(tokens.keys().next().value);
    const token = String(++sequence);
    tokens.set(token, {el, fingerprint:JSON.stringify([descriptor,op]), created:Date.now()});
    return {ready:true, token};
  }
  function commit(descriptor, operation, token) {
    check(); const op = validateLocatorOperation(operation);
    requireValue(['click','fill','check','uncheck','selectOption'].includes(op.action), 'E_OPERATION_UNSUPPORTED');
    const saved = tokens.get(token); tokens.delete(token);
    if (!saved || Date.now() - saved.created > 5000 ||
        saved.fingerprint !== JSON.stringify([descriptor, op])) return {committed:false,reason:'E_ELEMENT_DETACHED'};
    const nodes = locate(doc, descriptor);
    if (nodes.length !== 1 || nodes[0] !== saved.el) return {committed:false,reason:'E_ELEMENT_DETACHED'};
    const el = saved.el, why = actionability(el, op, doc, win);
    if (why) return {committed:false,reason:why};
    check(); // Last read-only fence. focus/setter/click below may have page effects.
    if (op.action === 'click') { el.click(); return {committed:true}; }
    if (op.action === 'check' || op.action === 'uncheck') {
      const desired = op.action === 'check';
      if (Boolean(el.checked) !== desired) el.click(); // Untrusted DOM activation, not physical input.
      return {committed:true, stateReached:Boolean(el.checked) === desired};
    }
    if (op.action === 'selectOption') {
      if (el.value !== op.value) {
        el.value = op.value;
        el.dispatchEvent(new win.Event('input', {bubbles:true}));
        el.dispatchEvent(new win.Event('change', {bubbles:true}));
      }
      return {committed:true, stateReached:el.value === op.value};
    }
    el.focus();
    if (el.value !== op.value) {
      inputValue(el, op.value, win);
      const data = op.value ? op.value : null;
      const change = typeof win.InputEvent === 'function' ?
        new win.InputEvent('input', {bubbles:true, inputType:op.value ? 'insertReplacementText' : 'deleteContentBackward', data}) :
        new win.Event('input', {bubbles:true});
      el.dispatchEvent(change);
      el.dispatchEvent(new win.Event('change', {bubbles:true}));
    }
    return {committed:true};
  }
  function observe(input, documentPin = {}) {
    check(); const opts = validateObservationOptions(input);
    const roots = nativeQuery(doc, opts.root);
    const root = unique(roots), rows = [];
    // Bound semantic validation work even if the selected root is a small
    // subsection of a very large SPA. All emitted descriptors still pass locate().
    const semanticSafe = doc.querySelectorAll('*').length <= 1200;
    const maxLocatorChecks = 40, maxVisited = Math.min(3000, Math.max(400, opts.maxNodes * 30));
    let truncated = false, used = 0, visited = 0, locatorChecks = 0;
    function suggestion(el, role, name, label, text) {
      const scope = el.closest?.('form,dialog,[role="dialog"]');
      const parent = scope?.id ? createLocatorDescriptor('css','[id=' + JSON.stringify(scope.id) + ']') : null;
      const test = candidate => {
        if (locatorChecks >= maxLocatorChecks ||
            !semanticSafe && !candidate.parent && candidate.kind !== 'css' && candidate.kind !== 'testId') return null;
        locatorChecks++;
        try {
          const found = locate(doc, candidate);
          return found.length === 1 && found[0] === el ? candidate : null;
        } catch { return null; }
      };
      const scoped = (kind, value, options = {}) => {
        const global = test(createLocatorDescriptor(kind, value, options));
        return global || (parent ? test(createLocatorDescriptor(kind, value, options, parent)) : null);
      };
      if (role && name) {
        const found = scoped('role',role,{name,exact:true}); if (found) return found;
      }
      if (label) {
        const found = scoped('label',label,{exact:true}); if (found) return found;
      }
      if (el.id) {
        const found = test(createLocatorDescriptor('css','[id=' + JSON.stringify(el.id) + ']')); if (found) return found;
      }
      const id = el.getAttribute('data-testid');
      if (id) {
        const found = scoped('testId',id); if (found) return found;
      }
      if (text && text.length <= 80) return scoped('text',text,{exact:true});
      return null;
    }
    function walk(el, depth) {
      if (truncated) return;
      if (++visited > maxVisited) { truncated = true; return; }
      if ((visited & 63) === 0) check();
      if (depth > opts.maxDepth) { truncated = true; return; }
      if (rows.length >= opts.maxNodes) { truncated = true; return; }
      if (ariaHidden(el)) return;
      const role = semanticRole(el), name = role ? accessibleName(el, doc) : '',
        label = ['input','select','textarea'].includes(tag(el)) ? labelText(el,doc) : '',
        text = ['input','textarea','select'].includes(tag(el)) ? '' : space(el.textContent).slice(0,120);
      // Ignore purely structural unnamed containers; still traverse children.
      const noteworthy = Boolean(role || label || el.id || el.hasAttribute('data-testid'));
      if (noteworthy) {
        const scope = el.closest?.('form,dialog,[role="dialog"]');
        const row = {role:role || null, name:name.slice(0,120), text,
          state:{visible:visible(el,win),disabled:Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true' ||
              el.closest?.('[aria-disabled="true"]')),readOnly:Boolean(el.readOnly || el.getAttribute('aria-readonly') === 'true'),
            ...(el.hasAttribute('aria-expanded') ? {expanded:el.getAttribute('aria-expanded')} : {}),
            ...(typeof el.checked === 'boolean' ? {checked:String(el.checked)} :
              el.hasAttribute('aria-checked') ? {checked:el.getAttribute('aria-checked')} : {}),
            ...(typeof el.selected === 'boolean' ? {selected:el.selected} : {})},
          scope:scope && scope !== el ? {tag:tag(scope),id:scope.id || null} : null,
          locator:suggestion(el,role,name,label,text)};
        const length = JSON.stringify(row).length;
        if (used + length > opts.maxChars) { truncated = true; return; }
        rows.push(row); used += length;
      }
      for (const child of el.children) walk(child,depth+1);
    }
    walk(root,0);
    return {kind:'semantic-dom-summary',version:'1.1.0-r13',
      document:{documentId:documentPin.documentId || null,targetVersion:documentPin.targetVersion ?? null,
        url:doc.location?.href || null},
      root:opts.root,nodes:rows,truncated,budget:{maxDepth:opts.maxDepth,maxNodes:opts.maxNodes,maxChars:opts.maxChars,
        maxVisited,visited:Math.min(visited,maxVisited),locatorChecks,maxLocatorChecks}};
  }
  return Object.freeze({read,probe,prepare,commit,observe,clear});
}
