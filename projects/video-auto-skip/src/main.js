import {EMPTY, cleanRules, isEnabled, resolveInterval, resolveRules, readScope, RULES_KEY, saveScope, updateScope, validateRules} from './rules.js';
import {blankTiming, buildTimeEditor, changeEndpoint, clearTimeIntent, endpointsFor, formatTime as time, recommendedSpan, tailMatchStatus, timeIssue, VIEWPORT_STOPS} from './editor.js';

const KEYS = ['intro', 'outro', 'next'];
const NAMES = {intro: '跳过片头', outro: '跳过片尾', next: '自动下一集'};
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
const sameRule = (a, b) => a === b || Boolean(a && b && a.kind === b.kind &&
  a.start === b.start && a.end === b.end && a.seconds === b.seconds && a.enabled === b.enabled);
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
  const feedback = (message, error = false, focus = false) => {
    const node = find('feedback');
    node.textContent = message;
    node.dataset.tone = error ? 'error' : 'info';
    node.hidden = !message;
    if (message && focus) node.focus();
  };

  async function readStorage() {
    const result = await tool.request('storage.get', {key: RULES_KEY, withEtag: true});
    if (typeof result?.etag !== 'string') throw new Error('Missing storage version');
    return {data: cleanRules(result.value ?? EMPTY), etag: result.etag};
  }

  const lastSecond = (snap = snapshot) => Math.floor(durationOf(snap) ?? 0);
  const storedDefault = key => storage && lastLinked ? readScope(storage.data, lastLinked.context, 'series')[key] : undefined;
  const selected = key => scope === 'episode' && !Object.hasOwn(draft, key) ? storedDefault(key) : draft[key];
  const original = key => scope === 'episode' && !Object.hasOwn(baseline, key) ? storedDefault(key) : baseline[key];
  const timing = key => selected(key) ?? blankTiming(key);
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
    const title = el('label', 'vas-rule-title', key === 'next' ? NAMES[key] : NAMES[key].slice(2));
    title.htmlFor = toggle.id;
    toggle.setAttribute('aria-label', NAMES[key]);
    toggle.setAttribute('role', 'switch');
    const unset = el('span', 'vas-unset', '待设置');
    const summary = el('p', 'vas-note');
    summary.id = 'vas-summary-' + key;
    toggle.setAttribute('aria-describedby', summary.id);
    const restore = button('恢复继承');
    restore.id = 'vas-restore-' + key;
    restore.setAttribute('aria-label', '恢复继承：' + NAMES[key]);
    const source = el('div', 'vas-source');
    source.append(summary, restore);
    head.append(title);
    if (key !== 'next') head.append(unset, el('label', 'vas-toggle-label', '自动跳过'));
    if (key !== 'next') head.lastElementChild.htmlFor = toggle.id;
    head.append(toggle);
    row.append(head);
    if (key !== 'next') editors[key] = buildTimeEditor({row, el, button, key, name: NAMES[key].slice(2),
      template: find('time-track'), calibrationHost: find('calibrations'), canEdit: () => editingAllowed() && lastSecond() > 0,
      onEdit: (part, value) => setTime(key, part, value),
      onClear: part => clearTime(key, part),
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
    return [key, {toggle, summary, restore, unset}];
  }));

  function resetEditor(key) {
    if (!editors[key]) return;
    editors[key].reset();
  }

  // Only inputs and explicit position markers call this. Neither changes the player or storage.
  function setTime(key, part, value) {
    const d = lastSecond(), old = timing(key);
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

  // Clear is an explicit draft action; keyboard text deletion may be temporary while retyping.
  // Removing an editable boundary unsets that rule. An inherited season rule needs an
  // explicit local null override, otherwise clearing it would silently restore inheritance.
  function clearTime(key, part) {
    if (!editingAllowed() || !lastSecond()) return;
    const intent = clearTimeIntent(key, part);
    if (intent.kind === 'endpoint') {
      setTime(key, part, intent.value);
      return;
    }
    if (scope === 'episode' && storedDefault(key) !== undefined) draft[key] = null;
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
    return scope === 'episode' ? {...readScope(storage.data, snapshot.context, 'series'), ...draft} : draft;
  }

  function validate(snap = snapshot, data = storage?.data) {
    if (!data || !ready(snap)) return '尚未识别当前播放器。';
    const d = durationOf(snap);
    const before = resolveRules(data, snap.context);
    const oldScope = readScope(data, snap.context, scope);
    const changed = ['intro', 'outro'].filter(key => !sameRule(draft[key], oldScope[key]));
    const fieldIssue = changed.map(key => editorIssue(key, snap)).find(Boolean);
    if (fieldIssue) return fieldIssue;
    if (scope === 'series' && changed.some(key => draft[key])) {
      const problem = validateRules(draft, d);
      if (problem) return problem;
    }
    let candidate;
    try { candidate = updateScope(data, snap.context, scope, draft); }
    catch { return '请输入有效的时间，开始必须早于结束。'; }
    const effective = resolveRules(candidate, snap.context);
    return changed.some(key => effective[key] && !sameRule(effective[key], before[key]))
      ? validateRules(effective, d) : null;
  }

  function caption(rule, key, d) {
    if (rule === undefined) return '未设置';
    if (rule === null || rule === false) return '已关闭';
    if (key === 'next') return '已开启 · 正常播完后按集序继续';
    if (rule.kind === 'tail') {
      if (!present(rule.seconds)) return '尚未填入时间';
      const interval = d && rule.seconds > 0 && rule.seconds < d ? ' · ' + time(d - rule.seconds) + '–End (' + time(d) + ')' : '';
      return '最后 ' + rule.seconds + ' 秒' + interval;
    }
    return present(rule.start) && present(rule.end) ? time(rule.start) + '–' + time(rule.end) : '尚未填入时间';
  }

  const reasons = {
    'no-current-media': '尚未识别到唯一正片播放器。',
    'authorization-unavailable': '当前网页未授权或访问已失效。请检查扩展权限。',
    'duration-unavailable': '播放器时长未知。',
    'navigation-unconfirmed': '切集结果未确认，已停止重复切集。',
    'next-site-handling': '网站正在处理连播，连播助手不会重复切集。',
    'next-list-incomplete': '选集尚未加载完整，暂不切集。',
    'next-list-end': '当前选集没有列出后续剧集。',
    'next-list-gap': '当前选集中找不到下一集，暂不跳到更后的剧集。',
    'next-line-unavailable': '下一集在当前线路没有可播放的入口。',
    'next-not-confirmed': '无法唯一确认下一集，暂不切集。',
    'position-not-seekable': '当前位置或目标时间暂不能定位。',
    'seek-unconfirmed': '定位结果未确认，已暂停新的定位操作。',
    'duration-changed': '播放器时长已变化，旧位置已经失效。',
  };
  function actionText(snap) {
    const a = snap?.action;
    const reason = reasons[snap?.reason];
    if (reason && a?.state !== 'unknown') return reason;
    if (!a) return '';
    if (a.state === 'pending') return a.kind === 'next' ? '正在确认下一集…' : '正在确认播放器位置…';
    if (a.state === 'unknown') return a.kind === 'next' ? '切集结果未确认，已停止重复切集。' : '定位结果未确认。请在播放器核对；需要恢复时，请手动刷新网页并重开侧栏。';
    if (a.kind === 'next') {
      if (a.state === 'started' || a.state === 'playing') return '下一集已经开始播放。';
      if (a.state === 'arrived') return '已进入下一集，尚未确认起播。';
      if (a.state === 'failed' || a.state === 'unavailable' || a.state === 'blocked') return '暂不能继续到下一集。';
    }
    if (a.state === 'unavailable') return '播放器暂不能执行这次定位。';
    if (a.state !== 'confirmed' || !present(a.to)) return '';
    if (a.kind === 'preview') return '已定位至 ' + time(a.to) + '。';
    if (a.kind === 'undo') return '已返回 ' + time(a.to) + '。';
    if (a.kind === 'intro' || a.kind === 'outro') return NAMES[a.kind] + '：' + time(a.from) + ' → ' + time(a.to) + '。';
    return '';
  }

  function pageStatus() {
    if (ready(snapshot)) return snapshot.offscreen ? '播放器已连接 · 视频在屏幕外' : '播放器已连接';
    if (!snapshot) return '正在连接当前网页…';
    switch (snapshot.state) {
      case 'unsupported': return '请在当前标签页打开支持的播放页。';
      case 'connecting': return '正在等待当前网页加载…';
      case 'starting': return '网页功能尚未连接。若已打开支持的播放页，首次安装或更新后请刷新当前播放页一次；仍未连接时请检查网站访问权限。';
      case 'reload-required': return '网页功能需要重新加载。请保存网页内容，等当前操作结束后刷新当前播放页。';
      case 'activation-required': return '请在「扩展 → 网页功能帮助」检查网页功能，再重新识别。';
      case 'permission': return '无法访问当前网页。请检查连播助手的网站访问权限。';
      case 'disconnected': return '暂时无法连接当前网页。请在播放页重新识别。';
      default: return ['等待正片识别。', reasons[snapshot.reason] ?? safeText(snapshot.reason)].filter(Boolean).join(' ');
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
    const windowLabel = VIEWPORT_STOPS[stop] / 60 + '分钟';
    windowRange.value = stop;
    windowRange.setAttribute('aria-valuetext', windowLabel + (viewport === undefined ? '，自动推荐' : '，手动设置'));
    find('window-value').textContent = windowLabel;
    find('window-auto').hidden = viewport !== undefined;
    find('window-reset').hidden = viewport === undefined;
    find('work').textContent = safeText(c.title) || '连播助手';
    find('context').textContent = lastLinked ? [
      c.season != null && (typeof c.season === 'number' ? '第' + c.season + '季' : safeText(c.season)),
      c.episode != null && (iyf || typeof c.episode === 'number' ? '第' + String(c.episode).padStart(2, '0') + '集' : safeText(c.episode)),
      safeText(c.line), d && '全长' + time(d),
    ].filter(Boolean).join(' · ') : '';
    const statusText = pageStatus();
    if (find('page-status').textContent !== statusText) find('page-status').textContent = statusText;
    find('page-status').classList.toggle('vas-sr', bound && !snapshot.offscreen);
    find('refresh').disabled = busy;
    find('scope-help').textContent = !lastLinked ? '' : scope === 'series' ? '保存至本作品当前季；已有本集例外继续优先。' :
      '保存至当前集；未修改的项目继续沿用已保存规则。';
    find('scope-help').classList.toggle('vas-sr', !hasEdits);
    const active = lastLinked && storage ? resolveRules(storage.data, c) : {};
    for (const key of KEYS) {
      const {toggle, summary, restore, unset} = rows[key];
      const raw = draft[key], effective = selected(key), siteHandlesNext = key === 'next' && iyf;
      toggle.checked = !siteHandlesNext && (key === 'next' ? isEnabled(effective) : timingOn(effective));
      toggle.disabled = !allowed || siteHandlesNext;
      const source = scope === 'episode' ? (raw === undefined ? '沿用作品默认 · ' : '本集例外 · ') : '';
      const proposed = source + (lastLinked ? caption(effective, key, d) : '等待识别作品');
      const changed = !sameRule(raw, baseline[key]);
      const message = siteHandlesNext ? '由 iYF 处理下一集，助手不会重复切集。' : changed
        ? '未保存：' + proposed + (bound ? ' · 当前生效：' : ' · 已保存：') + caption(active[key], key, d) : proposed;
      if (summary.textContent !== message) summary.textContent = message;
      unset.hidden = !lastLinked || (key === 'outro' ? present(effective?.seconds) || present(effective?.start) : present(effective?.end));
      // Keep the effective rule available to assistive technology. Show source details when
      // there is an exception, a site restriction, or a draft differs from a saved rule.
      summary.classList.toggle('vas-sr', !siteHandlesNext && !(scope === 'episode' && (raw !== undefined || effective !== undefined)) &&
        !(changed && active[key] !== undefined));
      restore.hidden = siteHandlesNext || scope !== 'episode' || raw === undefined;
      restore.disabled = !allowed;
      editors[key]?.render({rule: timing(key), lastSecond: dSeconds, allowed, span,
        issue: editorIssue(key, lastLinked), canMark: present(player?.time), canPreview: canSeek() && previewPosition(key, snapshot).valid,
        match: key === 'outro' ? tailMatchStatus({rule: timing(key), saved: scope === 'episode' ? active[key] : baseline[key],
          duration: lastSecond(), changed, reusable: scope === 'series', inherited: scope === 'episode' && raw === undefined}) : undefined});
    }
    find('save').disabled = !allowed || !hasEdits || Boolean(validation);
    find('save').textContent = busy && pendingWrite ? '正在保存…' : wasSaved && !hasEdits && !conflict ? '已保存' : '保存设置';
    find('unsaved').hidden = find('cancel').hidden = !hasEdits && !conflict;
    find('cancel').disabled = busy || Boolean(pendingWrite) || !storage;
    const editStatus = validation ?? (pendingWrite ? '保存结果未确认。请重新识别以核对已存设置。' : conflict
      ? '已读到其他窗口保存的版本。放弃修改后可基于最新设置重新编辑。' : hasEdits
      ? bound ? '' : '已保留旧播放器的草稿。只在确认是原播放器后恢复编辑。'
      : storageError ? '无法读取已存设置。请重新识别。' : '');
    if (find('edit-status').textContent !== editStatus) find('edit-status').textContent = editStatus;
    find('player').hidden = !bound && !snapshot?.action && !uncertainAction;
    find('playback').hidden = !bound;
    find('media').textContent = bound ? '当前 ' + time(player?.time) + ' / ' + time(d) + (player?.paused === true ? ' · 已暂停' : player?.paused === false ? ' · 播放中' : '') : '';
    const actionStatus = uncertainAction ? '定位结果未确认。重新识别只核对状态；若仍无法确认，请检查播放器后手动刷新网页并重开侧栏。' :
      actionText(snapshot) || (bound && !d ? '本集时长未知，暂不执行时间规则。' : '');
    const status = [snapshot?.nextArrival && actionText({action: snapshot.nextArrival}), actionStatus].filter(Boolean).join(' ');
    if (find('action').textContent !== status) find('action').textContent = status;
    const a = snapshot?.action;
    const undo = find('undo');
    undo.hidden = !bound || !returnPoint && !(a?.state === 'confirmed' && ['intro', 'outro'].includes(a.kind) && present(a.from));
    undo.textContent = returnPoint ? '返回原位置' : '撤销自动跳过';
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
        if (hadDraft) feedback('播放器或集数已变化，旧草稿未保存。', true);
      }
    } else if (returnPoint && !sameMedia(previous, next)) {
      returnPoint = undefined;
    }
    if (uncertainAction && sameMedia(next, uncertainAction.target) && next?.action?.state === 'confirmed' && next.action.id === uncertainAction.requestId &&
      next.action.kind === uncertainAction.kind && Math.abs(next.action.to - uncertainAction.to) < 0.5) {
      applyManualReceipt(uncertainAction, next.action);
      uncertainAction = undefined;
      feedback('已核对播放器位置。');
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

  const savedRange = targetScope => targetScope === 'series' ? '本作品当前季' : '当前集';

  function saved(message) {
    wasSaved = true;
    feedback(message, false, true);
    tool.ui?.notify?.({message, type: 'success'});
  }

  async function reconcileWrite(isCurrent) {
    const attempt = pendingWrite;
    try { storage = await readStorage(); storageError = false; }
    catch {
      storageError = true;
      feedback('仍无法核对保存结果。请重新识别；不会自动重试保存。', true, true);
      return;
    }
    pendingWrite = undefined;
    const observed = readScope(storage.data, attempt.context, attempt.scope);
    const matched = attempt.changed.every(key => sameRule(observed[key], attempt.rules[key]));
    if (!isCurrent() || !sameTarget(snapshot, attempt.target)) {
      if (ready(snapshot)) reset();
      feedback(matched ? '已核对上一播放器的设置，修改已保存。' : '无法确认上一播放器的保存；未再次写入。', !matched, true);
    } else if (matched) {
      reset();
      saved('已读回并确认设置已保存至' + savedRange(attempt.scope) + '。');
    } else {
      conflict = true;
      feedback('已读回的设置与本次修改不一致，无法确认本次保存。请核对后重新编辑。', true, true);
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
        feedback('播放器已变化，未保存旧草稿。', true, true);
        return;
      }
      acceptSnapshot(checked);
      const problem = validate(checked);
      if (problem) { feedback(problem, true, true); return; }
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
            feedback(storageError ? '设置已在其他窗口变化，但暂不能读取。请重新识别。' : '设置已在其他窗口变化，未覆盖新版本。', true, true);
          }
          return;
      }
      const rejected = {
        quota: '工具的本地存储空间不足，未保存修改。',
        'binding-changed': '播放器已变化，未保存旧草稿。',
        invalid: '当前播放器时长或规则已变化，未保存修改。',
        rejected: '当前设置暂不能保存，请重新识别后核对。',
      }[result?.state];
      if (rejected) {
        pendingWrite = undefined;
        if (isCurrent()) { queuedRead = true; feedback(rejected, true, true); }
        return;
      }
      if (result?.saved === true) {
        try { storage = await readStorage(); }
        catch {
          storageError = true;
          feedback('收到写入回执，但暂不能核对已存设置。请重新识别。', true, true);
          return;
        }
        if (disposed) return;
        const observed = readScope(storage.data, checked.context, wasScope);
        pendingWrite = undefined;
        storageError = false;
        if (!changed.every(key => sameRule(observed[key], rules[key]))) {
          if (isCurrent()) conflict = true;
          feedback('写入后设置又发生变化，请核对最新版本。', true, true);
          return;
        }
        if (isCurrent()) {
          reset();
          saved('设置已保存至' + savedRange(wasScope) + '。');
        } else feedback('上一播放器的设置已保存。');
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
        feedback('当前播放器时长已变化，请核对后重新标记。', true);
        return;
      }
      const d = durationOf(checked);
      const at = checked.media?.time;
      if (!present(at) || at < 0 || Math.floor(d ?? 0) < 1) {
        feedback('暂不能读取此标记所需的播放时间。', true);
        return;
      }
      editors[key].clear(field);
      setTime(key, field, Math.floor(at));
      feedback('已将当前时间填入草稿，播放器位置和已存设置不变。');
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
        feedback('当前播放器或时长已变化，请核对后重新操作。', true);
        return;
      }
      if (!canSeek()) return;
      let to = seconds;
      if (intent === 'preview') to = previewPosition(key, checked).seconds;
      if (intent === 'return') to = returnPoint?.seconds;
      if (intent === 'undo') {
        if (checked.action?.state !== 'confirmed' || !['intro', 'outro'].includes(checked.action.kind) ||
          checked.action.id !== target.action?.id) {
          feedback('原来的跳过记录已变化，未撤销。', true);
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
          feedback('定位回执未返回。将核对播放器状态，不会自动重试。', true, true);
        }
        return;
      } finally { seekInProgress = undefined; }
      if (!isCurrent()) return;
      acceptSnapshot(result);
      if (!sameMedia(checked, result)) {
        uncertainAction = operation;
        feedback('播放器已变化，无法确认该定位。', true, true);
        return;
      }
      const a = result.action;
      if (a?.id === requestId && a.kind === kind && a.state === 'confirmed' && Math.abs(a.to - to) < 0.5) {
        applyManualReceipt(operation, a);
        feedback(intent === 'preview' ? '已查看 ' + time(a.to) + '。' : '已返回 ' + time(a.to) + '。');
      } else if (a?.id === requestId && ['unknown', 'pending'].includes(a.state)) {
        uncertainAction = operation;
        queuedRead = true;
        feedback('定位结果尚未确认，将核对状态。', true);
      } else {
        feedback('没有确认新的定位。请查看播放器当前状态。', true);
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
    feedback(pendingWrite ? '网页已变化，正在核对旧网页的保存结果。' : hasEdits ? '网页已变化，旧草稿未保存。' : '', Boolean(pendingWrite) || hasEdits);
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
    feedback('已放弃修改，保留已保存的设置。', false, true);
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
    win.removeEventListener('pagehide', dispose);
    root.removeEventListener('opendesk-page-changed', handlePageChange);
  }
  win.addEventListener('pagehide', dispose, {once: true});
  reset();
  render();
  void reload();
  return dispose;
}

if (globalThis.OpenDeskTool?.root?.querySelector('#vas-settings')) mountVideoSidebar(globalThis.OpenDeskTool);
