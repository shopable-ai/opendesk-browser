import {SIDEBAR_TOOL_FIELDS, SIDEBAR_TOOL_LABELS} from './sidebar-tools-fields.js';

// Presentation state only. React supplies actual runtime nodes; the original
// controller continues to own installation, permissions and the sandbox.
export function createSidebarToolsView() {
  const fields = Object.fromEntries(Object.entries(SIDEBAR_TOOL_FIELDS).map(([key, initial]) => [key, {
    key, value: '', textContent: '', textSet: false, hidden: false, disabled: false,
    checked: false, readOnly: false, open: false, ...initial,
    data: {...initial.data}, attributes: {...initial.attributes},
    options: (initial.options || []).map(row => ({...row})), rows: [], emptyLabel: ''
  }]));
  const labels = {...SIDEBAR_TOOL_LABELS}, actions = Object.create(null);
  const subscribers = new Set(), rowActions = new Map(), effects = [];
  const runtime = Object.seal({frameRoot: null, trustedSettings: null, adblock: null, aiProxy: null, settingsControl: null});
  let snapshot = {fields: Object.fromEntries(Object.entries(fields).map(([key, state]) => [key, {...state}])),
    labels: {...labels}, effectVersion: 0};
  let disposed = false, queued = false, attachment = null, connection = null;

  function notify() {
    if (queued || disposed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!disposed) for (const subscriber of subscribers) subscriber();
    });
  }
  function field(key) {
    if (!fields[key]) throw new Error('E_SIDEBAR_TOOL_FIELD: ' + key);
    return fields[key];
  }
  function patch(key, values) {
    if (disposed) return;
    const state = field(key), next = {...values};
    if (Object.hasOwn(next, 'textContent')) next.textSet = true;
    if (state.type === 'file' && next.value === '') next.files = [];
    for (const name of ['data', 'attributes']) if (next[name]) next[name] = {...state[name], ...next[name]};
    if (next.options) next.options = next.options.map(row => ({...row}));
    if (next.rows) next.rows = next.rows.map(row => ({...row}));
    Object.assign(state, next);
    snapshot = {...snapshot, fields: {...snapshot.fields, [key]: {...state}}};
    notify();
  }
  function bind(key, type, handler) {
    field(key);
    if (disposed) return () => {};
    const handlers = actions[key] ||= Object.create(null);
    const listeners = handlers[type] ||= new Set();
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
      if (!listeners.size) delete handlers[type];
      if (!Object.keys(handlers).length && actions[key] === handlers) delete actions[key];
    };
  }
  function dispatch(key, type, event) {
    if (disposed || field(key).disabled) return;
    // Preserve the real event and synchronous trusted-click stack.
    for (const handler of [...(actions[key]?.[type] || [])]) handler(event);
  }
  function closeConnection(record) {
    if (!record || record.closed) return;
    record.closed = true;
    try { record.controller?.dispose(); }
    finally {
      record.reject(new Error('E_SIDEBAR_TOOL_VIEW_DISPOSED'));
      if (connection === record) connection = null;
      for (const key of Object.keys(actions)) delete actions[key];
      rowActions.clear(); effects.length = 0;
    }
  }
  function initialize() {
    const record = connection;
    if (!record || record.closed || record.controller || !attachment) return;
    try {
      const controller = record.factory();
      if (!controller || typeof controller.dispose !== 'function') throw new Error('E_SIDEBAR_TOOL_CONTROLLER');
      record.controller = controller;
      if (record.visible !== undefined) controller.setVisible(record.visible);
      Promise.resolve(controller.ready).then(() => {
        if (!record.closed) record.resolve();
      }, record.reject);
    } catch (error) {
      record.reject(error); closeConnection(record); throw error;
    }
  }
  function detachRuntime(nodes) {
    if (attachment !== nodes) return;
    try { closeConnection(connection); }
    finally {
      attachment = null;
      for (const key of Object.keys(runtime)) runtime[key] = null;
      effects.length = 0;
    }
  }
  return Object.freeze({
    fields, labels, actions, runtime, patch, bind, dispatch,
    getSnapshot: () => snapshot,
    subscribe(handler) {
      if (disposed) return () => {};
      subscribers.add(handler); return () => subscribers.delete(handler);
    },
    patchLabels(values) {
      if (disposed) return;
      for (const key of Object.keys(values)) if (!Object.hasOwn(labels, key)) throw new Error('E_SIDEBAR_TOOL_LABEL: ' + key);
      Object.assign(labels, values);
      snapshot = {...snapshot, labels: {...labels}}; notify();
    },
    setRows(key, rows, emptyLabel = '', handler) {
      if (disposed) return;
      field(key);
      if (handler) rowActions.set(key, handler); else rowActions.delete(key);
      patch(key, {rows, emptyLabel});
    },
    activateRow(key, id, event) {
      if (disposed) return;
      const state = field(key), row = state.rows.find(item => item.id === id);
      if (!state.disabled && row && !row.disabled) return rowActions.get(key)?.(id, event);
    },
    requestEffect(key, method, options) {
      if (!['focus', 'scrollIntoView'].includes(method)) throw new Error('E_TOOL_VIEW_EFFECT');
      field(key);
      if (disposed) return;
      effects.push({key, method, options});
      snapshot = {...snapshot, effectVersion: snapshot.effectVersion + 1}; notify();
    },
    takeEffects: () => effects.splice(0),
    attachRuntime(nodes) {
      if (disposed) throw new Error('E_SIDEBAR_TOOL_VIEW_DISPOSED');
      for (const key of Object.keys(runtime)) {
        if (nodes?.[key]?.nodeType !== 1 || !nodes[key].ownerDocument) throw new Error('E_SIDEBAR_TOOL_RUNTIME: ' + key);
      }
      if (attachment && attachment !== nodes) throw new Error('E_SIDEBAR_TOOL_RUNTIME_ATTACHED');
      attachment = nodes; Object.assign(runtime, nodes); initialize();
      return () => detachRuntime(nodes);
    },
    connect(factory) {
      if (disposed) throw new Error('E_SIDEBAR_TOOL_VIEW_DISPOSED');
      if (connection) throw new Error('E_SIDEBAR_TOOL_CONTROLLER_CONNECTED');
      const record = {factory, controller: null, closed: false};
      record.ready = new Promise((resolve, reject) => {record.resolve = resolve; record.reject = reject;});
      record.ready.catch(() => {});
      const facade = {ready: record.ready,
        setVisible(visible) {
          if (record.closed) return;
          record.visible = visible; return record.controller?.setVisible(visible);
        },
        dispose() {closeConnection(record);}
      };
      for (const key of ['openTool', 'openSettings', 'toggleEnabled', 'retryUninstallCleanup',
        'openOfficialReview', 'openImport', 'openReadOnlyPreview', 'openInTab', 'closeTool']) {
        facade[key] = (...args) => {
          if (record.closed) throw new Error('E_SIDEBAR_TOOL_VIEW_DISPOSED');
          // Never replay installation/permission gestures when refs arrive later.
          if (!record.controller) throw new Error('E_SIDEBAR_TOOL_RUNTIME_NOT_READY');
          return record.controller[key](...args);
        };
      }
      for (const key of ['isDirty', 'isPreviewActive', 'isPreviewDirty']) {
        facade[key] = (...args) => !record.closed && !!record.controller?.[key](...args);
      }
      connection = record; initialize(); return Object.freeze(facade);
    },
    resourceSnapshot: () => ({subscriptions: subscribers.size,
      bindings: Object.values(actions).reduce((sum, types) => sum + Object.values(types).reduce((n, handlers) => n + handlers.size, 0), 0),
      runtime: !!attachment, controllers: connection?.controller ? 1 : 0, effects: effects.length}),
    dispose() {
      if (disposed) return;
      if (attachment) detachRuntime(attachment); else closeConnection(connection);
      disposed = true; subscribers.clear();
      for (const key of Object.keys(actions)) delete actions[key];
      rowActions.clear(); effects.length = 0;
    }
  });
}

// Existing no-view callers retain their actual DOM path during migration.
export function patchToolField(view, field, values) {
  if (view) return view.patch(field.key, values);
  const {data, attributes, ...properties} = values;
  Object.assign(field, properties);
  if (data) Object.assign(field.dataset, data);
  for (const [name, value] of Object.entries(attributes || {}))
    setToolFieldAttribute(null, field, name, value);
}

export function setToolFieldAttribute(view, field, name, value) {
  if (view) return view.patch(field.key, {attributes: {[name]: value}});
  if (value == null) field.removeAttribute(name);
  else field.setAttribute(name, String(value));
}

export function requestToolFieldEffect(view, field, method, options) {
  if (!['focus', 'scrollIntoView'].includes(method))
    throw new Error('E_TOOL_VIEW_EFFECT');
  if (view) return view.requestEffect(field.key, method, options);
  return field[method]?.(options);
}
