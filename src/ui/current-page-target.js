import {EnvironmentError} from '../environment.js';

const unavailable = (reason, message, windowId = null) => Object.freeze({status: 'unavailable', reason, message, windowId});
const resolving = windowId => Object.freeze({status: 'resolving', windowId});

function pageUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new EnvironmentError('E_UNSUPPORTED_SCHEME', '当前页面地址无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new EnvironmentError('E_UNSUPPORTED_SCHEME', '当前页面不是可运行的 HTTP(S) 页面');
  return url;
}

function stale(message = '当前网页已变化，请重新点击 Run') {
  return new EnvironmentError('E_DOCUMENT_STALE', message);
}

export function createCurrentPageTarget({api = globalThis.chrome} = {}) {
  const observers = new Set(), removers = [];
  let disposed = false, windowId = null, sequence = 0, state = resolving(null);

  const emit = next => {
    state = Object.freeze(next);
    for (const observer of observers) {
      try { observer(state); } catch {}
    }
    return state;
  };
  const listen = (event, listener) => {
    if (!event?.addListener || !event?.removeListener) return;
    event.addListener(listener); removers.push(() => event.removeListener(listener));
  };

  async function observe(boundWindowId) {
    if (!Number.isSafeInteger(boundWindowId) || boundWindowId < 0)
      return unavailable('E_WINDOW_UNAVAILABLE', '无法确定 Sidebar 所属浏览器窗口', boundWindowId);
    const selected = await api.tabs.query({active: true, windowId: boundWindowId});
    if (!Array.isArray(selected) || selected.length !== 1)
      return unavailable('E_NO_ACTIVE_TAB', '当前窗口没有唯一活动网页', boundWindowId);
    const tab = selected[0];
    if (tab.windowId !== boundWindowId || tab.active !== true)
      return unavailable('E_NO_ACTIVE_TAB', '当前活动网页已变化', boundWindowId);
    if (tab.incognito) return unavailable('E_INCOGNITO', '不支持隐身窗口网页', boundWindowId);
    if (tab.status === 'loading' || tab.status === 'unloaded')
      return unavailable('E_DOCUMENT_UNRESOLVED', '当前网页尚未完成加载，请等待页面稳定', boundWindowId);
    let tabUrl;
    try { tabUrl = pageUrl(tab.url); }
    catch (error) { return unavailable(error.code, error.message, boundWindowId); }
    if (tab.pendingUrl)
      return unavailable('E_DOCUMENT_UNRESOLVED', '当前网页正在导航，请等待页面稳定', boundWindowId);

    const frames = await api.webNavigation.getAllFrames({tabId: tab.id});
    const root = frames?.find(frame => frame.frameId === 0);
    if (!root || root.errorOccurred || (root.documentLifecycle && root.documentLifecycle !== 'active') ||
        typeof root.documentId !== 'string' || !root.documentId)
      return unavailable('E_DOCUMENT_UNRESOLVED', '无法确认当前网页的活动主文档', boundWindowId);
    let rootUrl;
    try { rootUrl = pageUrl(root.url); }
    catch (error) { return unavailable(error.code, error.message, boundWindowId); }
    if (rootUrl.href !== tabUrl.href)
      return unavailable('E_DOCUMENT_UNRESOLVED', '标签页与主文档正在切换，未选择旧网页作为回退目标', boundWindowId);

    // Close the tabs.query -> webNavigation race: the exact same tab must still
    // be active in this Sidebar's window after the document observation.
    const confirmed = await api.tabs.query({active: true, windowId: boundWindowId});
    if (!Array.isArray(confirmed) || confirmed.length !== 1 || confirmed[0].id !== tab.id ||
        confirmed[0].windowId !== boundWindowId || confirmed[0].active !== true || confirmed[0].incognito ||
      confirmed[0].pendingUrl || ['loading', 'unloaded'].includes(confirmed[0].status) || confirmed[0].url !== tab.url)
      return unavailable('E_DOCUMENT_UNRESOLVED', '当前网页在识别过程中发生变化', boundWindowId);

    return Object.freeze({status: 'available', windowId: boundWindowId, tabId: tab.id, frameId: 0,
      documentId: root.documentId, url: rootUrl.href, origin: rootUrl.origin, title: tab.title || rootUrl.href});
  }

  async function refresh() {
    if (disposed) return state;
    const token = ++sequence;
    if (!disposed) emit(resolving(windowId));
    let next;
    try { next = await observe(windowId); }
    catch (error) { next = unavailable(error.code || 'E_DOCUMENT_UNRESOLVED', error.message || '无法识别当前网页', windowId); }
    if (!disposed && token === sequence) emit(next);
    return next;
  }

  function attach() {
    listen(api.tabs?.onActivated, info => { if (info?.windowId === windowId) void refresh(); });
    listen(api.tabs?.onUpdated, (tabId, change, tab) => {
      if (tab?.windowId !== windowId || (!tab.active && tabId !== state.tabId)) return;
      if (['url', 'pendingUrl', 'status', 'title'].some(key => Object.hasOwn(change || {}, key))) void refresh();
    });
    listen(api.tabs?.onRemoved, (tabId, info) => {
      if (info?.windowId === windowId || tabId === state.tabId) void refresh();
    });
    const navigation = details => { if (details?.frameId === 0 && details.tabId === state.tabId) void refresh(); };
    listen(api.webNavigation?.onBeforeNavigate, details => {
      if (details?.frameId !== 0 || details.tabId !== state.tabId) return;
      sequence++;
      emit({...unavailable('E_DOCUMENT_UNRESOLVED', '当前网页正在导航，请等待文档加载完成', windowId), tabId: details.tabId});
    });
    listen(api.webNavigation?.onCommitted, navigation);
    listen(api.webNavigation?.onErrorOccurred, navigation);
    listen(api.webNavigation?.onHistoryStateUpdated, navigation);
    listen(api.webNavigation?.onReferenceFragmentUpdated, navigation);
    listen(api.windows?.onRemoved, removedWindowId => {
      if (removedWindowId !== windowId) return;
      sequence++; emit(unavailable('E_WINDOW_UNAVAILABLE', 'Sidebar 所属浏览器窗口已关闭', windowId));
    });
  }

  const ready = (async () => {
    try {
      const current = await api.windows.getCurrent();
      if (disposed) return state;
      if (!Number.isSafeInteger(current?.id) || current.id < 0)
        return emit(unavailable('E_WINDOW_UNAVAILABLE', '无法确定 Sidebar 所属浏览器窗口'));
      if (current.incognito) return emit(unavailable('E_INCOGNITO', '不支持隐身窗口网页', current.id));
      windowId = current.id; attach();
      return await refresh();
    } catch (error) {
      return emit(unavailable(error.code || 'E_WINDOW_UNAVAILABLE', error.message || '无法初始化当前网页', windowId));
    }
  })();

  function capture() {
    if (disposed) throw new EnvironmentError('E_HOST_CLOSED', 'Sidebar 已关闭');
    if (state.status !== 'available')
      throw new EnvironmentError(state.reason || 'E_TARGET', state.message || '当前网页不可运行');
    return Object.freeze({...state, capturedAt: Date.now()});
  }

  async function revalidate(captured) {
    if (disposed) throw new EnvironmentError('E_HOST_CLOSED', 'Sidebar 已关闭');
    if (!captured || captured.status !== 'available' || captured.windowId !== windowId) throw stale();
    const token = ++sequence;
    let observed;
    try { observed = await observe(windowId); }
    catch { throw stale(); }
    if (disposed) throw new EnvironmentError('E_HOST_CLOSED', 'Sidebar 已关闭');
    if (token !== sequence) throw stale();
    emit(observed);
    if (observed.status !== 'available') throw stale(observed.message);
    for (const key of ['windowId', 'tabId', 'frameId', 'documentId', 'url', 'origin'])
      if (observed[key] !== captured[key]) throw stale();
    return observed;
  }

  return Object.freeze({ready, refresh, capture, revalidate,
    subscribe(observer) { observers.add(observer); observer(state); return () => observers.delete(observer); },
    get snapshot() { return state; }, get windowId() { return windowId; },
    resourceSnapshot: () => ({subscriptions: removers.length}),
    dispose() { if (disposed) return; disposed = true; sequence++; for (const remove of removers.splice(0)) remove(); observers.clear(); }
  });
}
