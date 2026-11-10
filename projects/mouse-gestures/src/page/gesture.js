// Only same-document, trusted right-button gestures. No Chrome/Tab APIs here.
export const GESTURE_LIMITS = Object.freeze({activatePx: 56, maxVerticalPx: 28, menuGuardMs: 600});

const EXCLUDED_TARGETS = 'input,textarea,select,option,button,a,[contenteditable],[role="textbox"],[role="slider"],[draggable="true"],canvas,video';

function excluded(event, win) {
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return true;
  if (win.getSelection?.()?.isCollapsed === false) return true;
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  return path.some(node => typeof node?.closest === 'function' && node.closest(EXCLUDED_TARGETS));
}

function isBackGesture(state, x, y) {
  const dx = x - state.x;
  const dy = y - state.y;
  return dx <= -GESTURE_LIMITS.activatePx && Math.abs(dy) <= GESTURE_LIMITS.maxVerticalPx &&
    state.maxVertical <= GESTURE_LIMITS.maxVerticalPx;
}

export function mountBackGesture({ui, doc = globalThis.document, win = doc.defaultView,
  navigateBack = () => win.history.back()} = {}) {
  if (!ui?.on || !ui?.onDispose || !doc?.createElementNS || !win)
    throw new Error('E_GESTURE_CONTEXT: managed Page UI and document required');

  let state = null;
  let disposed = false;
  let menuGuardUntil = 0;

  // The only page resource is owned by createPageUI; never intercept pointer input.
  const host = ui.host;
  for (const [name, value] of Object.entries({position:'fixed',inset:'0',width:'100vw',height:'100vh',
    maxWidth:'none',zIndex:'2147483646',pointerEvents:'none',display:'none'}))
    host.style.setProperty(name.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), value, 'important');
  const trace = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  trace.setAttribute('aria-hidden', 'true');
  trace.setAttribute('width', '100%');
  trace.setAttribute('height', '100%');
  trace.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:visible';
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('stroke', '#2586ef');
  path.setAttribute('stroke-width', '4');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('fill', 'none');
  trace.append(path);
  ui.content.append(trace);

  const hide = () => {
    host.style.setProperty('display', 'none', 'important');
    path.setAttribute('d', '');
  };
  const cancel = () => { state = null; hide(); };
  const draw = (gesture, x, y) => {
    if (gesture.points.length >= 80) gesture.points.shift();
    gesture.points.push([x, y]);
    path.setAttribute('d', gesture.points.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`).join(' '));
  };
  const alive = () => !disposed && ui.active();

  ui.on(doc, 'mousedown', event => {
    if (event.button !== 2) return;
    menuGuardUntil = 0; // A new normal right-click must always retain its menu.
    cancel();
    if (!alive() || event.isTrusted !== true || excluded(event, win)) return;
    state = {x:event.clientX, y:event.clientY, maxVertical:0,
      engaged:false, points:[[event.clientX, event.clientY]]};
  }, true);
  ui.on(doc, 'mousemove', event => {
    if (!state) return;
    if (!alive() || event.isTrusted !== true || (event.buttons & 2) === 0) return cancel();
    state.maxVertical = Math.max(state.maxVertical, Math.abs(event.clientY - state.y));
    if (!state.engaged && isBackGesture(state, event.clientX, event.clientY)) {
      state.engaged = true;
      host.style.setProperty('display', 'block', 'important');
    }
    if (state.engaged) draw(state, event.clientX, event.clientY);
  }, true);
  ui.on(doc, 'mouseup', event => {
    if (!state || event.button !== 2) return;
    const completed = alive() && event.isTrusted === true &&
      isBackGesture(state, event.clientX, event.clientY);
    const engaged = state.engaged;
    cancel();
    if (!engaged) return;
    menuGuardUntil = Date.now() + GESTURE_LIMITS.menuGuardMs;
    event.preventDefault();
    if (completed && win.history?.length > 1) navigateBack();
  }, true);
  ui.on(doc, 'contextmenu', event => {
    if (event.isTrusted === true && (state?.engaged || Date.now() < menuGuardUntil)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  ui.on(doc, 'keydown', event => {
    if (event.key !== 'Escape' || !state) return;
    const engaged = state.engaged;
    cancel();
    if (engaged) {
      menuGuardUntil = Date.now() + GESTURE_LIMITS.menuGuardMs;
      event.preventDefault();
    }
  }, true);
  ui.on(win, 'blur', cancel);
  ui.on(doc, 'visibilitychange', () => { if (doc.visibilityState === 'hidden') cancel(); });
  ui.onDispose(() => { disposed = true; menuGuardUntil = 0; cancel(); });
  return Object.freeze({isActive: alive});
}
