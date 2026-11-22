import {createPageUI} from '@opendesk/ui';
import {cleanRules, readScope, resolveRules, RULES_KEY, updateScope, validateRules} from '../rules.js';
import {createIyfReader, isIyfPage, iyfMediaSelector, nextIyfEpisode} from './iyf-player.js';
import {identifyLocalPlayer, nextLocalEpisode} from './local-player.js';
import {createNextReceipt} from './next-receipt.js';
import {createPlayer} from './player.js';

const sameBinding = (a, b) => a && b.state === 'ready' && a.media === b.media && a.root === b.root &&
  a.source === b.source && a.href === b.href && a.context.seriesKey === b.context.seriesKey &&
  a.context.episodeKey === b.context.episodeKey && a.context.line === b.context.line &&
  a.context.title === b.context.title && a.context.episode === b.context.episode;

export default function main({assets} = {}) {
  const bridge = globalThis.OpenDeskAppPage;
  if (window.top !== window || !bridge) return {state: 'skipped'};
  const owner = createPageUI({id: 'app.video-auto-skip', assets, baseStyles: false});
  owner.host.hidden = true;
  owner.host.style.setProperty('display', 'none', 'important');

  let closed = false, binding = null, stopRequests, cancelNavigation, writingRules = false;
  let stopArrival;
  const nextReceipt = createNextReceipt({storage: bridge.storage, navigation: window.navigation,
    arrivalType: performance.getEntriesByType('navigation')[0]?.type});
  const loading = new WeakSet();
  const iyf = isIyfPage(location.href);
  const readIyf = iyf && createIyfReader(document);
  const readPlayer = () => iyf ? readIyf(location.href) : identifyLocalPlayer(document, location.href);
  const isCurrent = own => !closed && own && !loading.has(own.media) && sameBinding(own, readPlayer());
  const selectNext = iyf ? nextIyfEpisode : nextLocalEpisode;
  const player = createPlayer({
    getBinding: () => isCurrent(binding) ? binding : null,
    async authorize(own) {
      if (writingRules || !isCurrent(own)) return null;
      // The app bridge checks the live installation, permission and precise document on each read.
      const {value} = await bridge.storage.get({key: RULES_KEY});
      return !writingRules && binding === own && isCurrent(own) ? resolveRules(cleanRules(value), own.context) : null;
    },
    selectNext,
    async navigate(own, target, canDispatch) {
      if (iyf) return 'failed'; // This site still owns its native episode transition.
      let token;
      try { token = await nextReceipt.prepare(target); }
      catch { return 'failed'; } // No navigation was dispatched.
      if (!token || !await canDispatch()) return 'failed';
      const selected = isCurrent(own) && selectNext(own).target;
      if (!selected || selected.href !== target.href || selected.episodeKey !== target.episodeKey ||
          selected.seriesKey !== target.seriesKey || selected.line !== target.line) return 'failed';
      return new Promise(resolve => {
        const finish = (result = 'unknown') => {
          clearTimeout(timer);
          cancelNavigation = undefined;
          resolve(result);
        };
        const timer = setTimeout(finish, 7000);
        cancelNavigation = finish;
        try { if (!nextReceipt.dispatch(target.href, token)) finish('failed'); } catch { finish(); }
      });
    },
  });

  function observeArrival(own) {
    const media = own.media;
    let previous = null;
    const stillCurrent = () => binding === own && isCurrent(own);
    const reset = () => { previous = null; };
    const onTime = event => {
      if (!event.isTrusted || !stillCurrent() || media.paused || media.seeking || media.readyState < 2) { reset(); return; }
      const time = media.currentTime;
      if (!Number.isFinite(time)) { reset(); return; }
      if (previous === null || time < previous) { previous = time; return; }
      if (time - previous >= 0.15) {
        nextReceipt.confirmPlaying();
        stopArrival?.();
      }
    };
    const stop = () => {
      for (const type of ['seeking', 'pause']) media.removeEventListener(type, reset);
      media.removeEventListener('timeupdate', onTime);
      if (stopArrival === stop) stopArrival = undefined;
    };
    stopArrival = stop;
    void nextReceipt.arrive(own.context, stillCurrent).then(arrived => {
      if (!arrived || !stillCurrent()) { stop(); return; }
      for (const type of ['seeking', 'pause']) media.addEventListener(type, reset);
      media.addEventListener('timeupdate', onTime);
    }, stop);
  }

  async function saveRules(own, {scope, rules, ifMatch}) {
    if (writingRules || !['series', 'episode'].includes(scope) || typeof ifMatch !== 'string') return {state: 'rejected'};
    writingRules = true;
    player.refresh(); // A save cannot authorize events queued under the previous rules.
    try {
      const before = await bridge.storage.get({key: RULES_KEY, withEtag: true});
      if (binding !== own || !isCurrent(own)) return {state: 'binding-changed'};
      if (before.etag !== ifMatch) return {state: 'conflict'};
      const saved = cleanRules(before.value);
      let next;
      try { next = updateScope(saved, own.context, scope, rules); }
      catch { return {state: 'invalid'}; }
      const existing = readScope(saved, own.context, scope);
      const updated = readScope(next, own.context, scope);
      const oldEffective = resolveRules(saved, own.context);
      const effective = resolveRules(next, own.context);
      const timed = ['intro', 'outro'];
      const changed = (a, b, key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]);
      if ((scope === 'series' && timed.some(key => updated[key] && changed(existing, updated, key)) && validateRules(updated, own.media.duration)) ||
          (timed.some(key => effective[key] && changed(oldEffective, effective, key)) && validateRules(effective, own.media.duration))) {
        return {state: 'invalid'};
      }
      return await bridge.storage.set({key: RULES_KEY, value: next, ifMatch});
    } catch (error) {
      if (error?.code === 'E_STORAGE_CONFLICT') return {state: 'conflict'};
      if (['E_HOST_STORAGE_QUOTA', 'E_TOOL_DATA_LIMIT', 'E_TOOL_LIMIT'].includes(error?.code)) return {state: 'quota'};
      return {state: 'unknown'};
    } finally {
      player.refresh();
      writingRules = false;
    }
  }

  function sync() {
    if (closed) return {state: 'unavailable', reason: '网页模块已停止。'};
    const observed = readPlayer();
    const ready = observed.state === 'ready' && !loading.has(observed.media);
    if (!ready || !sameBinding(binding, observed)) {
      const next = ready ? {...observed, id: crypto.randomUUID()} : null;
      if (next !== binding) {
        stopArrival?.();
        nextReceipt.clear();
        binding = next;
        player.bind(next);
        if (next && !iyf) observeArrival(next);
      }
    }
    const snapshot = player.snapshot();
    const arrival = nextReceipt.snapshot();
    if (arrival) snapshot.nextArrival = arrival;
    return ready ? snapshot : {...snapshot, state: observed.state === 'ready' ? 'unavailable' : observed.state,
      reason: observed.reason ?? '正片正在换源。'};
  }

  function mediaLifecycle(event) {
    const media = event.target;
    if (!event.isTrusted || !(media instanceof HTMLVideoElement) ||
        (!media.matches(iyf ? iyfMediaSelector : 'video[data-od-feature]') && media !== binding?.media)) return;
    if (event.type === 'loadedmetadata') loading.delete(media);
    else loading.add(media);
    sync();
  }

  const observer = new MutationObserver(sync);
  const mediaEvents = ['emptied', 'loadstart', 'loadedmetadata', 'abort', 'error'];
  const pageEvents = ['popstate', 'hashchange'];
  const observeIyfMotion = event => {
    if (event.isTrusted && event.target === binding?.media && !loading.has(event.target)) readPlayer();
  };
  function dispose() {
    if (closed) return;
    closed = true;
    player.dispose();
    stopArrival?.();
    cancelNavigation?.();
    binding = null;
    stopRequests?.();
    observer.disconnect();
    for (const event of mediaEvents) document.removeEventListener(event, mediaLifecycle, true);
    for (const event of pageEvents) window.removeEventListener(event, sync);
    if (iyf) {
      document.removeEventListener('timeupdate', observeIyfMotion, true);
      window.navigation?.removeEventListener('currententrychange', sync);
    }
    window.removeEventListener('pagehide', dispose);
  }
  owner.onDispose(dispose);
  try {
    observer.observe(document.documentElement, {subtree: true, childList: true, attributes: true, characterData: iyf,
      attributeFilter: ['src', 'hidden', 'inert', 'aria-hidden', 'class', 'style', 'data-od-feature',
        'data-od-title', 'data-od-series', 'data-od-season', 'data-od-episode', 'data-od-order', 'data-od-line',
        ...(iyf ? ['href', 'title', 'id', 'target', 'download', 'aria-disabled'] : [])]});
    for (const event of mediaEvents) document.addEventListener(event, mediaLifecycle, true);
    for (const event of pageEvents) window.addEventListener(event, sync);
    if (iyf) {
      document.addEventListener('timeupdate', observeIyfMotion, true);
      window.navigation?.addEventListener('currententrychange', sync);
    }
    window.addEventListener('pagehide', dispose, {once: true});
    stopRequests = bridge.onRequest(({operation, payload}) => {
      const snapshot = sync();
      if (operation === 'video.snapshot') return snapshot;
      const active = snapshot.state === 'ready' && snapshot.binding === payload?.binding;
      if (operation === 'video.save') return active ? saveRules(binding, payload) : {state: 'binding-changed'};
      if (operation === 'video.refresh') return snapshot.binding && snapshot.binding === payload?.binding ? player.refresh() : snapshot;
      if (operation === 'video.preview' || operation === 'video.undo') {
        if (!active || typeof payload.requestId !== 'string' || !/^[0-9a-f]{32}$/.test(payload.requestId)) return snapshot;
        const expected = {requestId: payload.requestId, mediaRevision: payload.mediaRevision, duration: payload.duration};
        if (operation === 'video.undo') return player.undo(payload.binding, {...expected, actionId: payload.actionId});
        const intent = ['outro', 'return'].includes(payload.intent) ? payload.intent : undefined;
        return player.preview(payload.binding, {...expected, seconds: payload.seconds, intent});
      }
      throw new Error('Unsupported video operation');
    });
    return {state: sync().state};
  } catch (error) {
    owner.destroy();
    throw error;
  }
}
