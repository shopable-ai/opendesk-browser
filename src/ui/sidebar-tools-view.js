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
    market: {pending: [], review: null, error: ''}, toast: null, toasts: [], labels: {...labels}, effectVersion: 0, legacyAdblockVisible:false, trustedSettings:{timeReview:null,stayFocus:null,aiAccess:null}};
  let nextToastId = 0, nextToastRevision = 0;
  let marketInstallActions = null;
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
      if (record.visible !== undefined) controller.setVisible(record.visible, record.destination);
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

  // One owner-bound presentation store serves legacy, ordinary tools and
  // handle-based progress. The sandbox never receives this trusted view object.
  const priority=row=>({info:0,success:1,warning:2,error:3}[row.type]??0)+
    (row.timeout===0?0.5:0);
  function putToast(message,options={},owner=null,existingId=null){
    if(disposed||typeof message!=='string'||!message.trim())return null;
    const type=['info','success','warning','error'].includes(options?.type)?options.type:'info';
    const position=['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right']
      .includes(options?.position)?options.position:'top-center';
    const caption=typeof options?.caption==='string'?options.caption:'';
    const timeout=Number.isSafeInteger(options?.timeout)&&
      (options.timeout===0||options.timeout>=1000&&options.timeout<=15000)?options.timeout:5000;
    const groupKey=existingId===null&&options?.group!==false?
      JSON.stringify([owner,message,caption,type,position]):null;
    const list=snapshot.toasts||[];
    const previous=existingId!==null?
      list.find(row=>row.id===existingId&&row.owner===owner):
      groupKey?list.find(row=>row.groupKey===groupKey):null;
    if(existingId!==null&&!previous)return null;
    let toasts=list.filter(row=>row.id!==previous?.id);
    const row={id:previous?.id||++nextToastId,message,caption,type,position,timeout,owner,
      groupKey,count:existingId!==null?1:previous?Math.min(previous.count+1,99):1,
      revision:++nextToastRevision};
    if(!previous&&toasts.length>=3){
      // A normal info/success cannot evict a more important warning/error.
      // Persistent entries outrank ordinary entries of the same severity.
      const victims=toasts.map((item,index)=>({item,index}))
        .filter(({item})=>priority(item)<=priority(row))
        .sort((a,b)=>priority(a.item)-priority(b.item)||a.index-b.index);
      if(!victims.length)return null; // drop the incoming notice; no unbounded queue
      toasts=toasts.filter(item=>item.id!==victims[0].item.id);
    }
    toasts.push(row);
    snapshot={...snapshot,toasts,toast:row};notify();
    return row.id;
  }
  return Object.freeze({
    fields, labels, actions, runtime, patch, bind, dispatch, trustedSettings, trustedSettingsActions,
    showToast(message,options={}) {
      putToast(message,options); // preserve the legacy undefined return
    },
    addToolToast(message,options,owner) {
      if(typeof owner!=='string'||!owner)return null;
      return putToast(message,{...options,group:false},owner);
    },
    updateToolToast(id,message,options,owner) {
      if(typeof owner!=='string'||!owner)return false;
      return putToast(message,{...options,group:false},owner,id)===id;
    },
    hasToast(id,owner) {
      return !disposed&&(snapshot.toasts||[]).some(row=>row.id===id&&row.owner===owner);
    },
    clearToastsByOwner(owner) {
      if(disposed||typeof owner!=='string'||!owner)return;
      const list=snapshot.toasts||[];
      const toasts=list.filter(row=>row.owner!==owner);
      if(toasts.length===list.length)return;
      snapshot={...snapshot,toasts,toast:toasts.at(-1)||null};notify();
    },
    dismissToast(id) {
      if (disposed || !(snapshot.toasts||[]).some(item=>item.id===id)) return;
      const toasts=snapshot.toasts.filter(item=>item.id!==id);
      snapshot={...snapshot,toasts,toast:toasts.at(-1)||null};notify();
    },
    get marketInstallActions() {return marketInstallActions;},
    setMarketInstall(patch) {
      if (disposed) return;
      snapshot = {...snapshot, market: {...snapshot.market, ...patch}}; notify();
    },
    connectMarketInstall(actions) {
      if (!disposed) marketInstallActions = actions;
    },
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
        setVisible(visible, destination = null) {
          if (record.closed) return;
          record.visible = visible; record.destination = destination;
          return record.controller?.setVisible(visible, destination);
        },
        dispose() {closeConnection(record);}
      };
      for (const key of ['openTool', 'openSettings', 'toggleEnabled', 'uninstallFromList', 'retryUninstallCleanup',
        'openOfficialReview', 'openOfficialPageReview', 'openPagePackageReview', 'openImport', 'openImportFiles', 'openReadOnlyPreview', 'stopReadOnlyPreview', 'openInTab', 'closeTool']) {
        facade[key] = (...args) => {
          if (record.closed) throw new Error('E_SIDEBAR_TOOL_VIEW_DISPOSED');
          // Never replay installation/permission gestures when refs arrive later.
          if (!record.controller) throw new Error('E_SIDEBAR_TOOL_RUNTIME_NOT_READY');
          return record.controller[key](...args);
        };
      }
      facade.assertCanInstallMarketTool=(...args)=>{
        if(!record.controller)throw new Error('工具工作台尚未就绪，请稍后重试。');
        return record.controller.assertCanInstallMarketTool(...args);
      };
      for (const key of ['canPresentMarketReview', 'hasInstallReview', 'isDirty', 'isPreviewActive', 'isPreviewDirty', 'isPreviewEditing']) {
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
        marketInstallActions = null;
        snapshot={...snapshot,toast:null,toasts:[],trustedSettings:{timeReview:null,stayFocus:null,aiAccess:null}};
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
