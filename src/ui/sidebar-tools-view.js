import {SIDEBAR_TOOL_FIELDS, SIDEBAR_TOOL_LABELS} from './sidebar-tools-fields.js';

// Presentation state only. React supplies actual runtime nodes; the original
// controller continues to own installation, permissions and the sandbox.
export function createSidebarToolsView() {
  const fields = Object.fromEntries(Object.entries(SIDEBAR_TOOL_FIELDS).map(([key, initial]) => {
    // Language choices belong to JSX; there are no checkbox/radio controls or
    // synthetic FileLists in this host's presentation state.
    const {options, ...state} = initial;
    return [key, {key, value: '', textContent: '', textSet: false, hidden: false, disabled: false,
      open: false, ...state, data: {...state.data}, attributes: {...state.attributes}, rows: [], emptyLabel: ''}];
  }));
  const labels = {...SIDEBAR_TOOL_LABELS}, actions = Object.create(null);
  const subscribers = new Set(), rowActions = new Map(), effects = [];
  const runtime = Object.seal({frameRoot: null, settingsControl: null});
  const trustedSettingsActions=Object.create(null);
  let snapshot = {fields: Object.fromEntries(Object.entries(fields).map(([key, state]) => [key, {...state}])),
    labels: {...labels}, effectVersion: 0, legacyAdblockVisible:false, trustedSettings:{timeReview:null,stayFocus:null,aiAccess:null}};
  let disposed = false, queued = false, attachment = null, connection = null;
  const trustedSettings=Object.freeze(Object.fromEntries(Object.keys(snapshot.trustedSettings).map(key=>[key,Object.freeze({
    render(model){
      if(disposed)return;
      snapshot={...snapshot,trustedSettings:{...snapshot.trustedSettings,[key]:model}};notify();
    },
    connect(next){
      if(disposed)return;
      if(next)trustedSettingsActions[key]=next;else delete trustedSettingsActions[key];
    }
  })])));

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
    for (const name of ['data', 'attributes']) if (next[name]) next[name] = {...state[name], ...next[name]};
    if (next.rows) next.rows = next.rows.map(row => ({...row}));
    Object.assign(state, next);
    snapshot = {...snapshot, fields: {...snapshot.fields, [key]: {...state}}};
    notify();
  }
  function bind(key, type, handler) {
    field(key);
    if (disposed) return () => {};
    const handlers = actions[key] ||= Object.create(null);
    // Each control has one business owner; React does not need an EventTarget.
    if (handlers[type]) throw new Error('E_SIDEBAR_TOOL_ACTION_OWNER: ' + key + '.' + type);
    handlers[type] = handler;
    return () => {
      if (handlers[type] === handler) delete handlers[type];
      if (!Object.keys(handlers).length && actions[key] === handlers) delete actions[key];
    };
  }
  function dispatch(key, type, event) {
    if (disposed || field(key).disabled) return;
    // Preserve the real event and synchronous trusted-click stack.
    return actions[key]?.[type]?.(event);
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
      record.reject(error);
      try { closeConnection(record); } catch { /* Preserve the initialization failure. */ }
      throw error;
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
    fields, labels, actions, runtime, patch, bind, dispatch, trustedSettings, trustedSettingsActions,
    setLegacyAdblockVisible(visible){
      if(disposed||snapshot.legacyAdblockVisible===visible)return;
      snapshot={...snapshot,legacyAdblockVisible:Boolean(visible)};notify();
    },
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
      attachment = nodes; Object.assign(runtime, nodes);
      try { initialize(); }
      catch (error) {
        try { detachRuntime(nodes); } finally { throw error; }
      }
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
      for (const key of ['openTool', 'openSettings', 'toggleEnabled', 'uninstallFromList', 'retryUninstallCleanup',
        'openOfficialReview', 'openOfficialPageReview', 'openPagePackageReview', 'openImport', 'openImportFiles', 'openReadOnlyPreview', 'openInTab', 'closeTool']) {
        facade[key] = (...args) => {
          if (record.closed) throw new Error('E_SIDEBAR_TOOL_VIEW_DISPOSED');
          // Never replay installation/permission gestures when refs arrive later.
          if (!record.controller) throw new Error('E_SIDEBAR_TOOL_RUNTIME_NOT_READY');
          return record.controller[key](...args);
        };
      }
      for (const key of ['isDirty', 'isPreviewActive', 'isPreviewDirty', 'isPreviewEditing']) {
        facade[key] = (...args) => !record.closed && !!record.controller?.[key](...args);
      }
      connection = record; initialize(); return Object.freeze(facade);
    },
    resourceSnapshot: () => ({subscriptions: subscribers.size,
      bindings: Object.values(actions).reduce((sum, types) => sum + Object.keys(types).length, 0),
      runtime: !!attachment, controllers: connection?.controller ? 1 : 0, effects: effects.length}),
    dispose() {
      if (disposed) return;
      disposed = true;
      try { if (attachment) detachRuntime(attachment); else closeConnection(connection); }
      finally {
        subscribers.clear();
        snapshot={...snapshot,trustedSettings:{timeReview:null,stayFocus:null,aiAccess:null}};
        for(const key of Object.keys(trustedSettingsActions))delete trustedSettingsActions[key];
        for (const key of Object.keys(actions)) delete actions[key];
        rowActions.clear(); effects.length = 0;
      }
    }
  });
}

// Controller writes presentation state and requests effects; React owns the DOM.
export function patchToolField(view, field, values) {
  return view.patch(field.key, values);
}
export function setToolFieldAttribute(view, field, name, value) {
  return view.patch(field.key, {attributes: {[name]: value}});
}
export function requestToolFieldEffect(view, field, method, options) {
  return view.requestEffect(field.key, method, options);
}
