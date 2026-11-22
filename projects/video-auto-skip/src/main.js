import {EMPTY, canInheritDefaults, cleanRules, isEnabled, resolveInterval, resolveRules, readScope, RULES_KEY, saveScope, updateScope, validateRuleChange, validateRules} from './rules.js';
import {blankTiming, buildTimeEditor, changeEndpoint, clearTimeIntent, endpointsFor, formatTime as time, outroInterval, recommendedSpan, tailMatchStatus, timeIssue, VIEWPORT_STOPS} from './editor.js';
import {bindI18n, localizeIssue, t, translateStatic} from './i18n.js';

const KEYS = ['intro', 'outro', 'next'];
const NAMES = {intro: 'introRule', outro: 'outroRule', next: 'nextRule'};
const present = Number.isFinite;
const configured = rule => rule?.kind === 'tail' ? rule.seconds !== undefined : rule?.end !== undefined ||
  (rule?.start !== undefined && rule.start !== 0);
const durationOf = snap => present(snap?.media?.duration) && snap.media.duration > 0 ? snap.media.duration : undefined;
const ready = snap => snap?.state === 'ready' && snap.binding != null &&
  typeof snap.context?.seriesKey === 'string' && Boolean(snap.context.seriesKey) &&
  typeof snap.context?.episodeKey === 'string' && Boolean(snap.context.episodeKey);
const bindingId = binding => typeof binding === 'object' ? binding?.id : binding;
const sameTarget = (a, b) => ready(a) && ready(b) && bindingId(a.binding) != null &&
  bindingId(a.binding) === bindingId(b.binding) && a.context.seriesKey === b.context.seriesKey &&
  a.context.episodeKey === b.context.episodeKey && a.context.line === b.context.line;
const sameDraftTarget = (a, b) => sameTarget(a, b) || ready(a) && ready(b) &&
  typeof a.draftTarget === 'string' && Boolean(a.draftTarget) && a.draftTarget === b.draftTarget &&
  a.context.seriesKey === b.context.seriesKey && a.context.episodeKey === b.context.episodeKey && a.context.line === b.context.line;
const sameMedia = (a, b) => sameTarget(a, b) && a.media?.revision === b.media?.revision && durationOf(a) === durationOf(b);
const sameTiming = (a, b) => a === b || Boolean(a && b && a.kind === b.kind &&
  a.start === b.start && a.end === b.end && a.seconds === b.seconds);
const sameRule = (a, b) => sameTiming(a, b) && a?.enabled === b?.enabled;
const code = error => typeof error?.code === 'string' ? error.code : '';
const safeText = value => typeof value === 'string' ? value.replace(/(?:[a-z]+:\/\/|(?:data|blob):|\/\/)[^\s]+/gi, '').trim().slice(0, 120) : '';

export function mountVideoSidebar(tool) {
  const {root} = tool;
  const find = id => root.querySelector('#vas-' + id);
  const page = (operation, payload = {}) => tool.request('page.request', {operation, payload});
  const el = (tag, className, content) => {
    const node = root.ownerDocument.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  };
  const button = caption => {
    const node = el('button', '', caption);
    node.type = 'button';
    return node;
  };
  let snapshot, lastLinked, storage, busy = false, disposed = false, generation = 0, readVersion = 0;
  let scope = 'episode', baseline = {}, draft = {}, storageError = false, viewport, wasSaved = false;
  let conflict = false, pendingWrite, uncertainAction, queuedRead = false, autoRead = true, reading = false;
  let returnPoint, seekInProgress, publishedState, draftOwner;
  const editors = {};
  const dirty = () => KEYS.some(key => !sameRule(draft[key], baseline[key]));
  const editingAllowed = () => !busy && !conflict && !pendingWrite && ready(snapshot) && Boolean(storage);
  const canSeek = () => ready(snapshot) && !uncertainAction && Boolean(durationOf(snapshot)) &&
    !['pending', 'unknown'].includes(snapshot?.action?.state);
  let feedbackView = {message: () => '', error: false};
  const paintFeedback = (focus = false) => {
    const node = find('feedback');
    const message = feedbackView.message();
    if (node.textContent !== message) node.textContent = message;
    node.dataset.tone = feedbackView.error ? 'error' : 'info';
    node.hidden = !message;
    if (message && focus) node.focus();
  };
  const feedback = (message, error = false, focus = false) => {
    feedbackView = {message: typeof message === 'function' ? message : () => String(message ?? ''), error};
    paintFeedback(focus);
  };
  let unbindLocale = () => {};

  async function readStorage() {
    const result = await tool.request('storage.get', {key: RULES_KEY, withEtag: true});
    if (typeof result?.etag !== 'string') throw new Error('Missing storage version');
    return {data: cleanRules(result.value ?? EMPTY), etag: result.etag};
  }

  const lastSecond = (snap = snapshot) => Math.floor(durationOf(snap) ?? 0);
  const legacyDefault = key => storage && lastLinked ? readScope(storage.data, lastLinked.context, 'series')[key] : undefined;
  const storedDefault = key => lastLinked && canInheritDefaults(lastLinked.context) ? legacyDefault(key) : undefined;
  // For R10's explicit "match original outro length" action, keep an old iYF
  // default as a *reference*, never as an automatically enabled rule.
  const archivedOutro = () => scope === 'episode' && ready(snapshot) &&
    !canInheritDefaults(snapshot.context) && !Object.hasOwn(draft, 'outro') ? legacyDefault('outro') : undefined;
  const selected = key => scope === 'episode' && !Object.hasOwn(draft, key) ? storedDefault(key) : draft[key];
  const original = key => scope === 'episode' && !Object.hasOwn(baseline, key) ? storedDefault(key) : baseline[key];
  const timing = key => selected(key) ?? blankTiming(key);
  const unusableSavedOutro = () => {
    if (archivedOutro()?.kind === 'fixed') return true;
    const rule = selected('outro'), d = durationOf(lastLinked);
    return Boolean(d && rule && (sameTiming(rule, original('outro')) ||
      scope === 'episode' && !Object.hasOwn(draft, 'outro')) && !outroInterval(rule, d));
  };
  const editorTiming = key => key === 'outro' && unusableSavedOutro() ? blankTiming(key) : timing(key);
  const reusableOutro = () => {
    const rule = archivedOutro() ?? selected('outro');
    if (!ready(snapshot) || rule?.kind !== 'fixed' || !unusableSavedOutro()) return;
    const tail = {kind: 'tail', seconds: rule.end - rule.start, ...(rule.enabled === false ? {enabled: false} : {})};
    if (!timeIssue(tail, lastSecond())) return tail;
  };
  // An unset interval is ready to configure; only a valid saved interval can run.
  const timingOn = rule => rule === undefined || isEnabled(rule);
  const iyfNext = () => snapshot?.context?.seriesKey?.startsWith('iyf:');

  const rows = Object.fromEntries(KEYS.map(key => {
    const row = el('section', 'vas-row');
    row.dataset.rule = key;
    const head = el('div', 'vas-row-head');
    const toggle = el('input');
    toggle.type = 'checkbox';
    toggle.id = 'vas-rule-' + key;
    const title = el('label', 'vas-rule-title', key === 'next' ? t(NAMES[key]) : t(key === 'intro' ? 'introName' : 'outroName'));
    title.id = 'vas-rule-title-' + key;
    title.htmlFor = toggle.id;
    toggle.setAttribute('role', 'switch');
    const summary = el('p', 'vas-note');
    summary.id = 'vas-summary-' + key;
    toggle.setAttribute('aria-describedby', key === 'outro' ? 'vas-tail-match' : summary.id);
    const restore = button(t('restoreInherited'));
    restore.id = 'vas-restore-' + key;
    restore.setAttribute('aria-label', t('restoreRuleAria', {rule: t(NAMES[key])}));
    const source = el('div', 'vas-source');
    source.append(summary, restore);
    head.append(title);
    const autoLabel = key === 'next' ? null : el('label', 'vas-toggle-label');
    if (autoLabel) {
      autoLabel.id = 'vas-toggle-label-' + key;
      autoLabel.htmlFor = toggle.id;
      head.append(autoLabel);
    }
    toggle.setAttribute('aria-labelledby', autoLabel ? title.id + ' ' + autoLabel.id : title.id);
    head.append(toggle);
    row.append(head);
    if (key !== 'next') editors[key] = buildTimeEditor({row, el, button, key,
      template: find('time-track'), calibrationHost: find('calibrations'), canEdit: () => editingAllowed() && lastSecond() > 0,
      onEdit: (part, value) => setTime(key, part, value),
      onClear: part => clearTime(key, part),
      onMatch: () => {
        if (!editingAllowed()) return;
        const rule = reusableOutro();
        if (!rule) return;
        draft.outro = rule;
        render();
      },
      onMark: part => void mark(key, part), onPreview: () => void previewRule(key)});
    row.append(source);
    toggle.addEventListener('change', () => {
      if (!editingAllowed() || key === 'next' && iyfNext()) return;
      if (key === 'next') draft.next = toggle.checked;
      else {
        const {enabled, ...rule} = timing(key);
        if (configured(rule)) draft[key] = toggle.checked ? rule : {...rule, enabled: false};
        else if (toggle.checked && (scope !== 'episode' || timingOn(storedDefault(key)))) delete draft[key];
        else draft[key] = toggle.checked ? rule : null;
      }
      render();
    });
    restore.addEventListener('click', () => {
      if (!editingAllowed() || scope !== 'episode' || key === 'next' && iyfNext()) return;
      delete draft[key];
      resetEditor(key);
      render();
      toggle.focus();
    });
    find('rules').append(row);
    return [key, {toggle, summary, restore, title, autoLabel}];
  }));

  function resetEditor(key) {
    if (!editors[key]) return;
    editors[key].reset();
  }

  // Only inputs and explicit position markers call this. Neither changes the player or storage.
  function setTime(key, part, value) {
    const d = lastSecond(), old = editorTiming(key);
    if (!d) return;
    const wantEndBinding = key === 'outro' && part === 'end' && (value === d || value === undefined);
    if (value === endpointsFor(old, d)[part] && !(wantEndBinding && old.kind !== 'tail')) {
      render();
      return;
    }
    const rule = changeEndpoint(key, old, part, value, d);
    const on = timingOn(selected(key));
    const blank = !configured(rule) && (rule.kind === 'tail' || key === 'intro' && rule.start === 0);
    if (blank && !configured(original(key))) {
      const inherited = scope === 'episode' ? storedDefault(key) : undefined;
      if (timingOn(inherited) === on) delete draft[key];
      else draft[key] = on ? rule : null;
    } else draft[key] = on ? rule : {...rule, enabled: false};
    render();
  }

  function clearTime(key, part) {
    if (!editingAllowed() || !lastSecond()) return;
    const intent = clearTimeIntent(key, part);
    if (intent.kind === 'endpoint') {
      setTime(key, part, intent.value);
      return;
    }
    if (key !== 'outro' && scope === 'episode' && storedDefault(key) !== undefined) draft[key] = null;
    else delete draft[key];
    render();
  }

  function editorIssue(key, snap = snapshot) {
    const rule = draft[key];
    if (!rule || sameRule(rule, baseline[key])) return '';
    // A previously saved interval can be turned off even after the source gets shorter.
    if (!isEnabled(rule) && sameRule({...rule, enabled: undefined}, {...original(key), enabled: undefined})) return '';
    return timeIssue(rule, lastSecond(snap));
  }

  function effectiveRules() {
    if (!storage || !ready(snapshot)) return {};
    return scope === 'episode' ? {...(canInheritDefaults(snapshot.context) ? readScope(storage.data, snapshot.context, 'series') : {}), ...draft} : draft;
  }

  function validate(snap = snapshot, data = storage?.data) {
    if (!data || !ready(snap)) return t('unknownMedia');
    const d = durationOf(snap);
    const oldScope = readScope(data, snap.context, scope);
    const changed = ['intro', 'outro'].filter(key => !sameRule(draft[key], oldScope[key]));
    const fieldIssue = changed.map(key => editorIssue(key, snap)).find(Boolean);
    if (fieldIssue) return fieldIssue;
    let candidate;
    try { candidate = updateScope(data, snap.context, scope, draft); }
    catch { return t('invalidTime'); }
    return validateRuleChange(data, candidate, snap.context, scope, d);
  }

  function caption(rule, key) {
    if (rule === undefined) return t('summaryUnset');
    if (rule === null || rule === false) return t('summaryDisabled');
    if (key === 'next') return t('summaryNextOn');
    if (rule.kind === 'tail') {
      if (!present(rule.seconds)) return t('summaryTimeMissing');
      return t('summaryLastSeconds', {seconds: rule.seconds, interval: ''});
    }
    return present(rule.start) && present(rule.end) ? time(rule.start) + '–' + time(rule.end) : t('summaryTimeMissing');
  }

  const reasons = {
    'no-current-media': 'reasonNoMedia',
    'authorization-unavailable': 'reasonAuth',
    'duration-unavailable': 'videoDurationUnknown',
    'navigation-unconfirmed': 'reasonNavigation',
    'next-site-handling': 'reasonSiteNext',
    'next-list-incomplete': 'reasonListIncomplete',
    'next-list-end': 'reasonListEnd',
    'next-list-gap': 'reasonListGap',
    'next-line-unavailable': 'reasonLine',
    'next-not-confirmed': 'reasonNextUnconfirmed',
    'position-not-seekable': 'reasonNotSeekable',
    'seek-unconfirmed': 'reasonSeekUnconfirmed',
    'duration-changed': 'reasonDurationChanged',
    '无法唯一确认 iYF 的作品、选集和播放器。': 'reasonNoMedia',
    'iYF 的网页、选集和播放器剧集尚未一致。': 'reasonNoMedia',
    'iYF 正片正在加载，或播放器当前无法唯一确认。': 'reasonNoMedia',
    'iYF 正在切换播放内容，等待剧集身份确认。': 'statusLoading',
    '无法唯一确认当前作品与剧集。': 'reasonNoMedia',
    '页面和播放器的剧集或线路标识不一致。': 'reasonNoMedia',
    '无法唯一确认当前正片播放器。': 'reasonNoMedia',
    '正片正在加载。': 'statusLoading',
    '正片正在换源。': 'statusLoading',
    '网页模块已停止。': 'statusDisconnected',
  };
  function actionText(snap) {
    const a = snap?.action;
    const reason = reasons[snap?.reason];
    if (reason && a?.state !== 'unknown') return t(reason);
    if (!a) return '';
    if (a.state === 'pending') return t(a.kind === 'next' ? 'actionNextPending' : 'actionSeekPending');
    if (a.state === 'unknown') return t(a.kind === 'next' ? 'reasonNavigation' : 'actionSeekUnknown');
    if (a.kind === 'next') {
      if (a.state === 'started' || a.state === 'playing') return t('actionNextPlaying');
      if (a.state === 'arrived') return t('actionNextArrived');
      if (a.state === 'failed' || a.state === 'unavailable' || a.state === 'blocked') return t('actionNextBlocked');
    }
    if (a.state === 'unavailable') return t('actionSeekUnavailable');
    if (a.state !== 'confirmed' || !present(a.to)) return '';
    if (a.kind === 'preview') return t('actionPreviewed', {time: time(a.to)});
    if (a.kind === 'undo') return t('actionReturned', {time: time(a.to)});
    if (a.kind === 'intro' || a.kind === 'outro')
      return t('actionSkipped', {rule: t(NAMES[a.kind]), from: time(a.from), to: time(a.to)});
    return '';
  }

  function pageStatus() {
    if (ready(snapshot)) return t(snapshot.offscreen ? 'statusOffscreen' : 'statusConnected');
    if (!snapshot) return t('connecting');
    switch (snapshot.state) {
      case 'unsupported': return t('statusUnsupported');
      case 'connecting': return t('statusLoading');
      case 'starting': return t('statusStarting');
      case 'reload-required': return t('statusReload');
      case 'activation-required': return t('statusActivation');
      case 'permission': return t('statusPermission');
      case 'disconnected': return t('statusDisconnected');
      default: return [t('statusWaiting'), Object.hasOwn(reasons, snapshot.reason) ? t(reasons[snapshot.reason]) : safeText(snapshot.reason)].filter(Boolean).join(' ');
    }
  }

  function render() {
    const bound = ready(snapshot);
    const c = lastLinked?.context ?? {};
    const iyf = c.seriesKey?.startsWith('iyf:');
    const player = bound ? snapshot.media : undefined;
    const d = durationOf(lastLinked);
    const hasEdits = dirty();
    const allowed = editingAllowed();
    const validation = allowed && hasEdits ? validate() : null;
    const dSeconds = lastSecond(lastLinked);
    const span = viewport ?? recommendedSpan(dSeconds);
    const windowRange = find('window-range');
    const stop = Math.max(0, VIEWPORT_STOPS.findIndex(value => value >= span));
    const windowLabel = t('windowMinutes', {minutes: VIEWPORT_STOPS[stop] / 60});
    windowRange.value = stop;
    windowRange.setAttribute('aria-valuetext',
      t(viewport === undefined ? 'windowAutoAria' : 'windowManualAria', {range: windowLabel}));
    find('window-value').textContent = windowLabel;
    find('window-auto').hidden = viewport !== undefined;
    find('window-reset').hidden = viewport === undefined;
    find('work').textContent = safeText(c.title) || t('toolTitle');
    find('context').textContent = lastLinked ? [
      c.season != null && (typeof c.season === 'number' ? t('seasonLabel', {season: c.season}) :
        iyf && c.season === '季号未提供' ? t('seasonUnknown') : safeText(c.season)),
      c.episode != null && (iyf || typeof c.episode === 'number' ?
        t('episodeLabel', {episode: String(c.episode).padStart(2, '0')}) : safeText(c.episode)),
      iyf && c.line === '线路未标识' ? t('lineUnknown') : safeText(c.line), d && t('lengthLabel', {time: time(d)}),
    ].filter(Boolean).join(' · ') : '';
    const statusText = pageStatus();
    if (find('page-status').textContent !== statusText) find('page-status').textContent = statusText;
    find('page-status').classList.toggle('vas-sr', bound && !snapshot.offscreen);
    find('refresh').disabled = busy;
    find('scope-help').textContent = !lastLinked ? '' : t(scope === 'series' ? 'scopeSeriesHelp' : 'scopeEpisodeHelp');
    find('scope-help').classList.toggle('vas-sr', !hasEdits && !(iyf && storage && Object.keys(readScope(storage.data, c, 'series')).length));
    const active = lastLinked && storage ? resolveRules(storage.data, c) : {};
    const hasEpisodeOutro = Boolean(lastLinked && storage && Object.hasOwn(readScope(storage.data, c, 'episode'), 'outro'));
    for (const key of KEYS) {
      const {toggle, summary, restore} = rows[key];
      restore.textContent = t('restoreInherited');
      restore.setAttribute('aria-label', t('restoreRuleAria', {rule: t(NAMES[key])}));
      const raw = draft[key], effective = selected(key), siteHandlesNext = key === 'next' && iyf;
      toggle.checked = !siteHandlesNext && (key === 'next' ? isEnabled(effective) : timingOn(effective));
      toggle.disabled = !allowed || siteHandlesNext;
      const unusable = key === 'outro' && unusableSavedOutro();
      const reusable = unusable ? reusableOutro() : undefined;
      const archived = scope === 'episode' && iyf && raw === undefined && legacyDefault(key) !== undefined;
      const source = scope === 'episode' ? (raw === undefined ?
        (archived ? '' : unusable ? t('tailDefault') + ' · ' : canInheritDefaults(c) ? t('summaryInherited') : '') :
        t('summaryOverride')) : '';
      const proposed = source + (lastLinked ? caption(archived ? legacyDefault(key) : effective, key) : t('summaryPendingWork')) +
        (unusable || archived ? t('tailNotApplied') : '');
      const changed = !sameRule(raw, baseline[key]);
      const activeOutroUnavailable = key === 'outro' && bound && d && isEnabled(active[key]) && !outroInterval(active[key], d);
      const message = siteHandlesNext ? t('summaryIyfNext') : changed
        ? t('summaryUnsaved', {proposed, status: t(bound && !activeOutroUnavailable ? 'summaryActive' : 'savedShort'),
          saved: caption(active[key], key) + (activeOutroUnavailable ? t('tailNotApplied') : '')}) : proposed;
      if (summary.textContent !== message) summary.textContent = message;
      // Keep the effective rule available to assistive technology. Show source details when
      // there is an exception, a site restriction, or a draft differs from a saved rule.
      summary.classList.toggle('vas-sr', key === 'outro' ? !unusable && !changed && !archived :
        !siteHandlesNext && !(scope === 'episode' && (raw !== undefined || effective !== undefined)) && !(changed && active[key] !== undefined));
      restore.hidden = siteHandlesNext || scope !== 'episode' || raw === undefined;
      restore.disabled = !allowed;
      editors[key]?.render({rule: editorTiming(key), lastSecond: dSeconds, allowed, span,
        issue: editorIssue(key, lastLinked), canMark: present(player?.time), canPreview: canSeek() && previewPosition(key, snapshot).valid, reusable,
        match: key === 'outro' ? tailMatchStatus({rule: effective, duration: durationOf(snapshot), changed, scope,
          inherited: scope === 'episode' && raw === undefined, overridden: scope === 'series' && hasEpisodeOutro,
          connected: bound && Boolean(storage), reusable, archived}) : undefined});
    }
    find('save').disabled = !allowed || !hasEdits || Boolean(validation);
    find('save').textContent = busy && pendingWrite ? t('saving') :
      wasSaved && !hasEdits && !conflict ? t('savedShort') : t('saveSettings');
    find('unsaved').hidden = find('cancel').hidden = !hasEdits && !conflict;
    find('cancel').disabled = busy || Boolean(pendingWrite) || !storage;
    const editStatus = validation ? localizeIssue(validation) : (pendingWrite ? t('editWriteUnknown') : conflict
      ? t('editConflict') : hasEdits
      ? bound ? '' : t('editOldDraft')
      : storageError ? t('editReadFailed') : '');
    if (find('edit-status').textContent !== editStatus) find('edit-status').textContent = editStatus;
    find('player').hidden = !bound && !snapshot?.action && !uncertainAction;
    find('playback').hidden = !bound;
    find('media').textContent = bound ? t('mediaCurrent', {current: time(player?.time), duration: time(d),
      state: player?.paused === true ? t('mediaPaused') : player?.paused === false ? t('mediaPlaying') : ''}) : '';
    const actionStatus = uncertainAction ? t('seekUnknownLong') :
      actionText(snapshot) || (bound && !d ? t('videoDurationUnknown') : '');
    const status = [snapshot?.nextArrival && actionText({action: snapshot.nextArrival}), actionStatus].filter(Boolean).join(' ');
    if (find('action').textContent !== status) find('action').textContent = status;
    const a = snapshot?.action;
    const undo = find('undo');
    undo.hidden = !bound || !returnPoint && !(a?.state === 'confirmed' && ['intro', 'outro'].includes(a.kind) && present(a.from));
    undo.textContent = t(returnPoint ? 'returnOriginal' : 'undoSkip');
    undo.disabled = busy || !canSeek();
    const state = {dirty: hasEdits || conflict || Boolean(pendingWrite), busy};
    if (state.dirty !== publishedState?.dirty || state.busy !== publishedState?.busy) {
      publishedState = state;
      tool.setState?.(state);
    }
  }

  function reset() {
    scope = storage && ready(snapshot) ? saveScope(storage.data, snapshot.context) : 'episode';
    wasSaved = false;
    draftOwner = ready(snapshot) ? snapshot : undefined;
    baseline = storage && ready(snapshot) ? {...readScope(storage.data, snapshot.context, scope)} : {};
    draft = {...baseline};
    conflict = false;
    for (const key of ['intro', 'outro']) resetEditor(key);
  }

  function acceptSnapshot(next) {
    const previous = snapshot;
    const changed = !sameTarget(previous, next) && (ready(previous) || ready(next));
    snapshot = next;
    if (ready(next)) lastLinked = next;
    if (changed) {
      generation++;
      returnPoint = undefined;
      if (seekInProgress) uncertainAction = seekInProgress;
      if (ready(next) && !sameDraftTarget(draftOwner, next)) {
        const hadDraft = dirty();
        reset();
        if (hadDraft) feedback(() => t('feedbackDraftLost'), true);
      }
    } else if (returnPoint && !sameMedia(previous, next)) {
      returnPoint = undefined;
    }
    if (uncertainAction && sameMedia(next, uncertainAction.target) && next?.action?.state === 'confirmed' && next.action.id === uncertainAction.requestId &&
      next.action.kind === uncertainAction.kind && Math.abs(next.action.to - uncertainAction.to) < 0.5) {
      applyManualReceipt(uncertainAction, next.action);
      uncertainAction = undefined;
      feedback(() => t('feedbackPositionVerified'));
    }
  }

  function pageFailure(error) {
    const state = {
      E_APP_PAGE_RELOAD_REQUIRED: 'reload-required', E_APP_PAGE_ACTIVATION_REQUIRED: 'activation-required',
      E_PERMISSION: 'permission', E_PAGE_AUTHORIZATION: 'starting', E_APP_PAGE_NOT_READY: 'starting',
      E_DOCUMENT_UNRESOLVED: 'connecting', E_DOCUMENT_STALE: 'connecting', E_TARGET: 'connecting',
      E_NO_ACTIVE_TAB: 'unsupported', E_UNSUPPORTED_SCHEME: 'unsupported', E_INCOGNITO: 'unsupported',
    }[code(error)] ?? 'disconnected';
    // A late document or module can recover without a click. Only observe status;
    // never repeat a save, seek, or reload the browser tab from the tool.
    autoRead = state === 'starting' || state === 'connecting';
    acceptSnapshot({state});
  }

  async function readPage() {
    if (disposed || busy || reading) { if (!disposed) queuedRead = true; return; }
    reading = true;
    queuedRead = false;
    const version = ++readVersion;
    try {
      const next = await page('video.snapshot');
      if (!disposed && version === readVersion) acceptSnapshot(next);
    } catch (error) {
      if (!disposed && version === readVersion) pageFailure(error);
    } finally {
      reading = false;
      if (!disposed) {
        render();
        if (queuedRead && !busy) void readPage();
      }
    }
  }

  async function exclusive(run) {
    if (busy || disposed) return;
    busy = true;
    ++readVersion;
    const ticket = generation;
    render();
    try { await run(() => !disposed && ticket === generation); }
    finally {
      busy = false;
      if (!disposed) {
        render();
        if (queuedRead) void readPage();
      }
    }
  }

  const savedRange = targetScope => t(targetScope === 'series' ? 'scopeSeries' : 'scopeEpisode');

  function saved(makeMessage) {
    wasSaved = true;
    feedback(makeMessage, false, true);
    tool.ui?.notify?.({message: makeMessage(), type: 'success'});
  }

  async function reconcileWrite(isCurrent) {
    const attempt = pendingWrite;
    try { storage = await readStorage(); storageError = false; }
    catch {
      storageError = true;
      feedback(() => t('feedbackReconcileFailed'), true, true);
      return;
    }
    pendingWrite = undefined;
    const observed = readScope(storage.data, attempt.context, attempt.scope);
    const matched = attempt.changed.every(key => sameRule(observed[key], attempt.rules[key]));
    if (!isCurrent() || !sameTarget(snapshot, attempt.target)) {
      if (ready(snapshot)) reset();
      feedback(() => t(matched ? 'feedbackPriorSaved' : 'feedbackPreviousUncertain'), !matched, true);
    } else if (matched) {
      reset(attempt.scope);
      saved(() => t('feedbackSaved', {scope: savedRange(attempt.scope)}));
    } else {
      conflict = true;
      feedback(() => t('feedbackReadDifferent'), true, true);
    }
  }

  async function save() {
    if (!editingAllowed() || !dirty() || validate()) return;
    const target = snapshot;
    const wasScope = scope;
    const rules = {...draft};
    const token = storage.etag;
    const changed = KEYS.filter(key => !sameRule(rules[key], baseline[key]));
    if (!changed.length) return;
    await exclusive(async isCurrent => {
      let checked;
      try { checked = await page('video.snapshot'); }
      catch (error) { if (isCurrent()) pageFailure(error); return; }
      if (!isCurrent()) return;
      if (!sameTarget(target, checked)) {
        acceptSnapshot(checked);
        feedback(() => t('feedbackDraftLost'), true, true);
        return;
      }
      acceptSnapshot(checked);
      const problem = validate(checked);
      if (problem) { feedback(() => localizeIssue(problem), true, true); return; }
      pendingWrite = {context: checked.context, target, scope: wasScope, rules, changed};
      let result;
      try {
        result = await page('video.save', {binding: checked.binding, scope: wasScope, rules, ifMatch: token});
      } catch { /* The companion may have committed before the response was lost. Read back only. */ }
      if (disposed) return;
      if (result?.state === 'conflict') {
          pendingWrite = undefined;
          try { storage = await readStorage(); storageError = false; }
          catch { storage = undefined; storageError = true; }
          if (!disposed && isCurrent()) {
            conflict = true;
            feedback(() => t(storageError ? 'editReadFailed' : 'feedbackConflictPreserved'), true, true);
          }
          return;
      }
      const rejected = {
        quota: 'feedbackQuota',
        'binding-changed': 'feedbackDraftLost',
        invalid: 'feedbackInvalidated',
        rejected: 'feedbackSaveRejected',
      }[result?.state];
      if (rejected) {
        pendingWrite = undefined;
        if (isCurrent()) { queuedRead = true; feedback(() => t(rejected), true, true); }
        return;
      }
      if (result?.saved === true) {
        try { storage = await readStorage(); }
        catch {
          storageError = true;
          feedback(() => t('feedbackReceiptUnverified'), true, true);
          return;
        }
        if (disposed) return;
        const observed = readScope(storage.data, checked.context, wasScope);
        pendingWrite = undefined;
        storageError = false;
        if (!changed.every(key => sameRule(observed[key], rules[key]))) {
          if (isCurrent()) conflict = true;
          feedback(() => t('feedbackVersionChanged'), true, true);
          return;
        }
        if (isCurrent()) {
          reset(wasScope);
          if (result.workIndex && !['saved', 'removed', 'no-rules', 'newer-existing'].includes(result.workIndex)) {
            wasSaved = true;
            feedback(() => t('workTitlePending'), true, true);
          } else saved(() => t('feedbackSaved', {scope: savedRange(wasScope)}));
        } else feedback(() => t('feedbackPriorSaved'));
      } else {
        await reconcileWrite(isCurrent);
      }
    });
  }

  function previewPosition(key, snap) {
    const rules = effectiveRules();
    const rule = rules[key];
    const d = durationOf(snap);
    const interval = rule && !validateRules(rules, d) ? resolveInterval({...rule, enabled: undefined}, d) : null;
    const seconds = key === 'intro' ? interval?.end : interval?.start;
    return {valid: present(seconds), seconds};
  }

  async function mark(key, field) {
    if (!editingAllowed()) return;
    const target = snapshot;
    await exclusive(async isCurrent => {
      let checked;
      try { checked = await page('video.snapshot'); }
      catch (error) { if (isCurrent()) pageFailure(error); return; }
      if (!isCurrent()) return;
      acceptSnapshot(checked);
      if (!sameMedia(target, checked)) {
        feedback(() => t('feedbackSeekTargetChanged'), true);
        return;
      }
      const d = durationOf(checked);
      const at = checked.media?.time;
      if (!present(at) || at < 0 || Math.floor(d ?? 0) < 1) {
        feedback(() => t('feedbackCannotReadPosition'), true);
        return;
      }
      editors[key].clear(field);
      setTime(key, field, Math.floor(at));
      feedback(() => t('feedbackMarkedDraft'));
    });
  }

  function applyManualReceipt(operation, action) {
    if (operation.intent === 'return') {
      returnPoint = undefined;
    } else if (operation.intent === 'preview' && !returnPoint && present(action.from) &&
      (action.from !== action.to || operation.key === 'outro')) {
      returnPoint = {seconds: action.from};
    }
  }

  async function seek(intent, seconds, key) {
    if (!ready(snapshot) || !canSeek()) return;
    const target = snapshot;
    await exclusive(async isCurrent => {
      let checked;
      try { checked = await page('video.snapshot'); }
      catch (error) { if (isCurrent()) pageFailure(error); return; }
      if (!isCurrent()) return;
      acceptSnapshot(checked);
      if (!sameMedia(target, checked)) {
        feedback(() => t('feedbackSeekTargetChanged'), true);
        return;
      }
      if (!canSeek()) return;
      let to = seconds;
      if (intent === 'preview') to = previewPosition(key, checked).seconds;
      if (intent === 'return') to = returnPoint?.seconds;
      if (intent === 'undo') {
        if (checked.action?.state !== 'confirmed' || !['intro', 'outro'].includes(checked.action.kind) ||
          checked.action.id !== target.action?.id) {
          feedback(() => t('feedbackUndoChanged'), true);
          return;
        }
        to = checked.action.from;
      }
      if (!present(to) || to < 0 || to > durationOf(checked)) return;
      const kind = intent === 'undo' ? 'undo' : 'preview';
      const requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      const operation = {intent, kind, key, to, target: checked, requestId};
      let result;
      seekInProgress = operation;
      try { result = await page('video.' + kind, {binding: checked.binding, requestId,
        mediaRevision: checked.media.revision, duration: durationOf(checked), ...(kind === 'preview'
          ? {seconds: to, ...(intent === 'return' ? {intent} : key === 'outro' ? {intent: key} : {})}
          : {actionId: checked.action.id})}); }
      catch {
        if (isCurrent()) {
          uncertainAction = operation;
          queuedRead = true;
          feedback(() => t('feedbackSeekReceiptLost'), true, true);
        }
        return;
      } finally { seekInProgress = undefined; }
      if (!isCurrent()) return;
      acceptSnapshot(result);
      if (!sameMedia(checked, result)) {
        uncertainAction = operation;
        feedback(() => t('feedbackSeekChanged'), true, true);
        return;
      }
      const a = result.action;
      if (a?.id === requestId && a.kind === kind && a.state === 'confirmed' && Math.abs(a.to - to) < 0.5) {
        applyManualReceipt(operation, a);
        feedback(() => t(intent === 'preview' ? 'actionPreviewed' : 'actionReturned', {time: time(a.to)}));
      } else if (a?.id === requestId && ['unknown', 'pending'].includes(a.state)) {
        uncertainAction = operation;
        queuedRead = true;
        feedback(() => t('feedbackSeekPending'), true);
      } else {
        feedback(() => t('feedbackNoSeek'), true);
      }
    });
  }

  async function previewRule(key) {
    if (editingAllowed()) await seek('preview', undefined, key);
  }

  async function reload() {
    await exclusive(async isCurrent => {
      autoRead = true;
      if (pendingWrite) await reconcileWrite(isCurrent);
      if (!isCurrent()) return;
      if (!storage || storageError) {
        try {
          storage = await readStorage();
          storageError = false;
          if (!dirty() && !conflict) reset();
        } catch { storageError = true; }
      }
      if (!isCurrent()) return;
      const target = snapshot;
      try {
        const next = target?.binding && !uncertainAction
          ? await page('video.refresh', {binding: target.binding}) : await page('video.snapshot');
        if (isCurrent()) acceptSnapshot(next);
      } catch (error) { if (isCurrent()) pageFailure(error); }
    });
  }

  function handlePageChange() {
    const hasEdits = dirty();
    generation++;
    ++readVersion;
    autoRead = true;
    snapshot = lastLinked = undefined;
    returnPoint = undefined;
    if (seekInProgress) uncertainAction = seekInProgress;
    reset();
    feedback(() => pendingWrite ? t('feedbackPageChangedPending') : hasEdits ? t('feedbackDraftLost') : '', Boolean(pendingWrite) || hasEdits);
    render();
    void readPage();
  }

  find('window-range').addEventListener('input', event => {
    viewport = VIEWPORT_STOPS[Number(event.target.value)];
    render();
  });
  find('window-reset').addEventListener('click', () => {
    viewport = undefined;
    render();
    find('window-range').focus();
  });
  find('cancel').addEventListener('click', () => {
    if (busy || pendingWrite || !storage) return;
    reset();
    feedback(() => t('feedbackDiscarded'), false, true);
    render();
  });
  find('save').addEventListener('click', () => void save());
  find('refresh').addEventListener('click', () => void reload());
  find('undo').addEventListener('click', () => void seek(returnPoint ? 'return' : 'undo'));
  root.addEventListener('opendesk-page-changed', handlePageChange);
  const win = root.ownerDocument.defaultView;
  const poll = win.setInterval(() => { if (autoRead && !busy && !reading && !root.ownerDocument.hidden) void readPage(); }, 2500);
  function dispose() {
    disposed = true;
    for (const editor of Object.values(editors)) editor.dispose();
    generation++;
    ++readVersion;
    win.clearInterval(poll);
    unbindLocale();
    win.removeEventListener('pagehide', dispose);
    root.removeEventListener('opendesk-page-changed', handlePageChange);
  }
  win.addEventListener('pagehide', dispose, {once: true});
  reset();
  unbindLocale = bindI18n(tool, () => {
    translateStatic(root);
    for (const [key, nodes] of Object.entries(rows)) {
      nodes.title.textContent = t(key === 'next' ? 'nextRule' : key === 'intro' ? 'introName' : 'outroName');
      nodes.restore.textContent = t('restoreInherited');
      nodes.restore.setAttribute('aria-label', t('restoreRuleAria', {rule: t(NAMES[key])}));
      if (nodes.autoLabel) nodes.autoLabel.textContent = t(key === 'outro' ? 'enableRule' : 'autoSkip');
    }
    paintFeedback(); // No new request, save, seek, video refresh, or focus movement.
    render(); // Display-only DOM updates preserve the input draft and playback position.
  });
  void reload();
  return dispose;
}

if (globalThis.OpenDeskTool?.root?.querySelector('#vas-settings')) mountVideoSidebar(globalThis.OpenDeskTool);
