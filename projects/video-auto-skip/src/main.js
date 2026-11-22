import {EMPTY, cleanRules, resolveRules, readScope, RULES_KEY, updateScope, validateRules} from './rules.js';

const KEYS = ['intro', 'outro', 'next'];
const NAMES = {intro: '跳过片头', outro: '跳过片尾', next: '自动下一集'};
const WINDOW_SECONDS = 300;
const present = Number.isFinite;
const durationOf = snap => present(snap?.media?.duration) && snap.media.duration > 0 ? snap.media.duration : undefined;
const time = seconds => {
  if (!present(seconds) || seconds < 0) return '—';
  const whole = Math.floor(seconds);
  return String(Math.floor(whole / 60)).padStart(2, '0') + ':' + String(whole % 60).padStart(2, '0');
};
const parseTime = raw => {
  const s = raw.trim();
  if (!/^\d+(?::[0-5]\d)?$/.test(s)) return NaN;
  const [a, b] = s.split(':').map(Number);
  const result = b === undefined ? a : a * 60 + b;
  return Number.isSafeInteger(result) ? result : NaN;
};
const ready = snap => snap?.state === 'ready' && snap.binding != null &&
  typeof snap.context?.seriesKey === 'string' && Boolean(snap.context.seriesKey) &&
  typeof snap.context?.episodeKey === 'string' && Boolean(snap.context.episodeKey);
const bindingId = binding => typeof binding === 'object' ? binding?.id : binding;
const sameTarget = (a, b) => ready(a) && ready(b) && bindingId(a.binding) != null &&
  bindingId(a.binding) === bindingId(b.binding) && a.context.seriesKey === b.context.seriesKey &&
  a.context.episodeKey === b.context.episodeKey && a.context.line === b.context.line;
const sameMedia = (a, b) => sameTarget(a, b) && a.media?.revision === b.media?.revision && durationOf(a) === durationOf(b);
const sameRule = (a, b) => a === b || Boolean(a && b && a.kind === b.kind &&
  a.start === b.start && a.end === b.end && a.seconds === b.seconds);
const sameScope = (a, b) => KEYS.every(key => sameRule(a?.[key], b?.[key]));
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
  const option = (value, caption) => {
    const node = el('option', '', caption);
    node.value = value;
    return node;
  };

  let snapshot, storage, busy = false, disposed = false, generation = 0, readVersion = 0;
  let scope = 'series', baseline = {}, draft = {}, opened, storageError = false;
  let conflict = false, pendingWrite, uncertainAction, queuedRead = false, autoRead = true, reading = false;
  let returnPoint, seekInProgress, publishedState, draftOwner;
  const editors = {};
  const dirty = () => KEYS.some(key => editors[key]?.invalid || !sameRule(draft[key], baseline[key]));
  const editingAllowed = () => !busy && !conflict && !pendingWrite && ready(snapshot) && Boolean(storage);
  const canSeek = () => !uncertainAction && Boolean(durationOf(snapshot)) &&
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

  function buildEditor(key, row) {
    const panel = el('div', 'vas-editor');
    panel.id = 'vas-editor-' + key;
    const modeLabel = el('label', 'vas-field');
    const mode = el('select');
    mode.id = 'vas-mode-' + key;
    modeLabel.append(el('span', '', key === 'intro' ? '片头范围' : '片尾范围'), mode);
    mode.append(option('common', key === 'intro' ? '从 00:00 开始' : '最后 N 秒'), option('fixed', '指定区间'));
    const help = el('p', 'vas-note');
    help.id = 'vas-time-help-' + key;
    const endpoints = el('div', 'vas-endpoints');
    const actions = el('div', 'vas-actions');
    const takeStart = button('用当前时间标记起点');
    const takeEnd = button('用当前时间标记终点');
    const preview = button(key === 'intro' ? '查看片头结束位置' : '查看片尾开始位置');
    takeStart.id = 'vas-mark-' + key + '-start';
    takeEnd.id = 'vas-mark-' + key + '-end';
    preview.id = 'vas-preview-' + key;
    actions.append(takeStart, takeEnd, preview);
    panel.append(modeLabel, help, endpoints, actions);
    row.append(panel);
    const state = {panel, mode, help, endpoints, takeStart, takeEnd, preview, fields: {}, invalid: false};
    editors[key] = state;
    mode.addEventListener('change', () => {
      if (!editingAllowed()) return;
      const before = state.previousMode;
      const old = draft[key];
      const d = durationOf(snapshot);
      let rule;
      if (key === 'intro') {
        rule = {kind: 'fixed', start: mode.value === 'common' || before === 'common' ? 0 : old?.start, end: old?.end};
      } else if (mode.value === 'common') {
        rule = {kind: 'tail', seconds: d && present(old?.start) ? Math.floor(d - old.start) : undefined};
      } else {
        rule = {kind: 'fixed', start: d && present(old?.seconds) ? Math.floor(d - old.seconds) : undefined, end: d ? Math.floor(d) : undefined};
      }
      draft[key] = rule;
      populateEditor(key, rule, mode.value);
      render();
    });
    takeStart.addEventListener('click', () => void mark(key, state.mode.value === 'common' && key === 'outro' ? 'seconds' : 'start'));
    takeEnd.addEventListener('click', () => void mark(key, 'end'));
    preview.addEventListener('click', () => void previewRule(key));
    return state;
  }

  const rows = Object.fromEntries(KEYS.map(key => {
    const row = el('section', 'vas-row');
    const title = el('strong', '', NAMES[key]);
    const summary = el('p', 'vas-note');
    summary.id = 'vas-summary-' + key;
    const desc = el('div');
    desc.append(title, summary);
    const choice = el('select');
    choice.id = 'vas-rule-' + key;
    choice.setAttribute('aria-label', NAMES[key] + '规则');
    choice.setAttribute('aria-describedby', summary.id);
    choice.append(option('inherit', '未设置'), option('on', '开启'), option('off', '关闭'));
    row.append(desc);
    let edit;
    if (key !== 'next') {
      edit = button('调整时间');
      edit.setAttribute('aria-label', '调整' + NAMES[key].slice(2) + '时间');
      edit.setAttribute('aria-controls', 'vas-editor-' + key);
      edit.addEventListener('click', () => {
        if (!editingAllowed() || draft[key] == null) return;
        opened = opened === key ? undefined : key;
        render();
      });
      row.append(edit);
    }
    row.append(choice);
    if (edit) buildEditor(key, row);
    choice.addEventListener('change', () => {
      if (!editingAllowed()) return;
      if (choice.value === 'inherit') {
        delete draft[key];
      } else if (key === 'next') {
        draft[key] = choice.value === 'on';
      } else if (choice.value === 'off') {
        draft[key] = null;
      } else {
        const inherited = effectiveRules()?.[key];
        draft[key] = inherited ?? baseline[key] ?? (key === 'intro' ? {kind: 'fixed', start: 0} : {kind: 'tail'});
        opened = key;
      }
      if (edit) {
        if (draft[key] == null && opened === key) opened = undefined;
        populateEditor(key, draft[key]);
      }
      render();
    });
    find('rules').append(row);
    return [key, {choice, summary, edit}];
  }));

  function populateEditor(key, rule, explicitMode) {
    const editor = editors[key];
    const common = explicitMode ? explicitMode === 'common' : key === 'intro' ? rule?.start === 0 || !rule : rule?.kind !== 'fixed';
    const fields = common ? key === 'intro' ? ['end'] : ['seconds'] : ['start', 'end'];
    editor.mode.value = editor.previousMode = common ? 'common' : 'fixed';
    editor.help.textContent = common
      ? key === 'intro' ? '起点固定为 00:00。' : '终点跟随本集时长。请确认片尾没有要保留的剧情。'
      : '分别输入起点和终点，或用滑块微调。';
    editor.takeStart.hidden = common && key === 'intro';
    editor.takeStart.textContent = common && key === 'outro' ? '用当前时间标记片尾开始' : '用当前时间标记起点';
    editor.takeEnd.hidden = common && key === 'outro';
    editor.endpoints.replaceChildren();
    editor.fields = {};
    editor.invalid = false;
    for (const field of fields) {
      const entry = find('time-field').content.firstElementChild.cloneNode(true);
      const [label, rangeLabel] = entry.querySelectorAll('span');
      const [input, slider] = entry.querySelectorAll('input');
      const [error, limits] = entry.querySelectorAll('small');
      const name = NAMES[key].slice(2) + ({start: '起点', end: '终点', seconds: '剩余时长'})[field];
      const prefix = 'vas-' + key + '-' + field;
      label.textContent = name;
      rangeLabel.textContent = '微调' + name;
      input.id = prefix;
      slider.id = prefix + '-slider';
      limits.id = prefix + '-limits';
      error.id = prefix + '-error';
      input.setAttribute('aria-describedby', editor.help.id + ' ' + error.id);
      slider.setAttribute('aria-describedby', limits.id);
      input.value = present(rule?.[field]) ? time(rule[field]) : '';
      const endpoint = editor.fields[field] = {input, slider, limits, error, dragging: false};
      input.addEventListener('input', () => editTime(key));
      input.addEventListener('change', () => {
        if (!editingAllowed()) return;
        if (present(parseTime(input.value))) input.value = time(parseTime(input.value));
        updateSliders(key);
      });
      input.addEventListener('keydown', event => {
        if (!editingAllowed() || !['ArrowUp', 'ArrowDown'].includes(event.key) || !present(parseTime(input.value))) return;
        event.preventDefault();
        input.value = time(Math.max(0, parseTime(input.value) + (event.key === 'ArrowUp' ? 1 : -1)));
        editTime(key);
      });
      slider.addEventListener('input', () => {
        if (!editingAllowed()) return;
        const peer = ruleFromFields(key);
        let value = Number(slider.value);
        if (field === 'start' && present(peer.end)) value = Math.min(value, peer.end - 1);
        if (field === 'end' && present(peer.start)) value = Math.max(value, peer.start + 1);
        if (value < Number(slider.min) || value > Number(slider.max)) return;
        input.value = time(value);
        editTime(key, field);
      });
      slider.addEventListener('pointerdown', () => { endpoint.dragging = true; });
      for (const event of ['pointerup', 'pointercancel', 'blur']) {
        slider.addEventListener(event, () => { endpoint.dragging = false; updateSliders(key); });
      }
      slider.addEventListener('change', () => updateSliders(key));
      editor.endpoints.append(entry);
    }
    editor.preview.textContent = key === 'intro' ? '查看片头结束位置' : '查看片尾开始位置';
  }

  function ruleFromFields(key) {
    const {fields, mode} = editors[key];
    const number = field => parseTime(fields[field]?.input.value ?? '');
    if (fields.seconds) return {kind: 'tail', seconds: number('seconds')};
    return {kind: 'fixed', start: key === 'intro' && mode.value === 'common' ? 0 : number('start'), end: number('end')};
  }

  function editTime(key, keepWindow) {
    if (!editingAllowed() || draft[key] == null) return;
    const editor = editors[key];
    draft[key] = ruleFromFields(key);
    editor.invalid = Object.keys(editor.fields).some(field => !present(draft[key][field]));
    render(keepWindow && {key, field: keepWindow});
  }

  function updateSliders(key, keepWindow) {
    const duration = durationOf(snapshot) ?? 0;
    const d = Math.floor(duration);
    const rule = draft[key];
    for (const [field, {slider, limits, input, error, dragging}] of Object.entries(editors[key].fields)) {
      const value = rule?.[field];
      const exclusive = field === 'seconds' || field === 'start';
      const upper = exclusive ? Math.max(0, Math.ceil(duration) - 1) : d;
      const defaultStart = key === 'outro' && field !== 'seconds' ? Math.max(0, upper - WINDOW_SECONDS) : 0;
      if (keepWindow !== field && !dragging) {
        const a = rule?.start, b = rule?.end;
        const shared = key === 'outro' || editors[key].mode.value === 'fixed';
        const near = shared && present(a) && present(b) && b >= a && b - a <= WINDOW_SECONDS;
        const center = near ? (a + b) / 2 : value;
        const outside = near ? a < defaultStart || b > defaultStart + WINDOW_SECONDS
          : center < defaultStart || center > defaultStart + WINDOW_SECONDS;
        const localStart = present(center) && outside
          ? Math.max(0, Math.min(upper - WINDOW_SECONDS, Math.round(center - WINDOW_SECONDS / 2))) : defaultStart;
        slider.min = localStart;
        slider.max = Math.min(upper, localStart + WINDOW_SECONDS);
      }
      const position = present(value) ? Math.min(Number(slider.max), Math.max(Number(slider.min), value)) : Number(slider.min);
      slider.value = position;
      slider.setAttribute('aria-valuetext', present(value) && position === value ? time(value) : time(position) + '，滑块位置');
      slider.disabled = d <= 1 || Number(slider.min) >= Number(slider.max);
      limits.textContent = d > 0 ? '微调 ' + time(Number(slider.min)) + '–' + time(Number(slider.max)) : '时长未知，无法微调';
      const reversed = present(rule?.start) && present(rule?.end) && rule.start >= rule.end;
      const problem = input.value && !present(value) ? '请输入秒数或分:秒。'
        : duration > 0 && (exclusive ? value >= duration : value > duration) ? field === 'seconds' ? '剩余时长必须小于本集时长。' : '时间超出可用范围。'
        : field === 'seconds' && value === 0 ? '剩余时长必须大于 0。'
        : reversed ? field === 'start' ? '起点必须早于终点。' : '终点必须晚于起点。' : '';
      input.setAttribute('aria-invalid', String(Boolean(problem)));
      if (error.textContent !== problem) error.textContent = problem;
      error.hidden = !problem;
    }
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
    if (changed.some(key => editors[key].invalid)) return '请输入有效的时间，例如 01:30。';
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

  function caption(rule, key) {
    if (rule === undefined) return '未设置';
    if (rule === null || rule === false) return '已关闭';
    if (key === 'next') return '已开启 · 正常播完后按集序继续';
    if (rule.kind === 'tail') {
      if (!present(rule.seconds)) return '尚未填入时间';
      const d = durationOf(snapshot);
      const interval = d && rule.seconds > 0 && rule.seconds < d ? ' · ' + time(d - rule.seconds) + '–' + time(d) : '';
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

  function render(keep) {
    const bound = ready(snapshot);
    const c = bound ? snapshot.context : {};
    const iyf = c.seriesKey?.startsWith('iyf:');
    const player = snapshot?.media;
    const d = durationOf(snapshot);
    const hasEdits = dirty();
    const allowed = editingAllowed();
    const validation = allowed && hasEdits ? validate() : null;
    const scopeSelect = find('scope');
    find('work').textContent = safeText(c.title) || '连播助手';
    find('context').textContent = bound ? [
      c.season != null && (typeof c.season === 'number' ? '第 ' + c.season + ' 季' : safeText(c.season)),
      c.episode != null && (iyf || typeof c.episode === 'number' ? '第 ' + c.episode + ' 集' : safeText(c.episode)),
      safeText(c.line),
    ].filter(Boolean).join(' · ') || '已识别当前作品和集数' :
      reasons[snapshot?.reason] ?? (snapshot?.state === 'unsupported' ? '当前网页不支持连播助手。' : snapshot ? '尚未确认当前正片。' : '正在识别当前播放器…');
    find('refresh').disabled = busy;
    find('settings').hidden = !bound;
    scopeSelect.value = scope;
    scopeSelect.disabled = !allowed;
    find('scope-help').textContent = scope === 'series' ? (iyf ? 'iYF 此作品默认使用这组规则。本集独立设置优先。' :
      '同一季默认使用这组规则。本集独立设置优先。') : '只覆盖此集单独设置的项目，其余沿用作品默认。';
    const effective = effectiveRules();
    const active = bound && storage ? resolveRules(storage.data, c) : {};
    for (const key of KEYS) {
      const {choice, edit, summary} = rows[key];
      const raw = draft[key];
      const enabled = raw != null && raw !== false;
      choice.options[0].textContent = scope === 'episode' ? '沿用作品默认' : '未设置';
      choice.value = raw === undefined ? 'inherit' : enabled ? 'on' : 'off';
      choice.disabled = !allowed;
      if (key === 'next' && iyf) {
        choice.value = 'off';
        choice.disabled = true;
        summary.textContent = '由 iYF 处理下一集，助手不会重复切集。';
        continue;
      }
      const proposed = (raw === undefined && scope === 'episode' ? '沿用作品默认 · ' : '') + caption(effective[key], key);
      summary.textContent = editors[key]?.invalid || !sameRule(raw, baseline[key])
        ? '未保存：' + proposed + ' · 当前生效：' + caption(active[key], key) : proposed;
      if (!edit) continue;
      const editor = editors[key];
      const isOpen = opened === key && enabled;
      edit.hidden = !enabled;
      edit.disabled = !allowed;
      edit.textContent = isOpen ? '收起时间编辑' : '调整时间';
      edit.setAttribute('aria-label', isOpen ? '收起' + NAMES[key].slice(2) + '时间编辑' : '调整' + NAMES[key].slice(2) + '时间');
      edit.setAttribute('aria-expanded', String(isOpen));
      editor.panel.hidden = !isOpen;
      editor.mode.disabled = !allowed;
      updateSliders(key, keep?.key === key ? keep.field : undefined);
      for (const {input, slider} of Object.values(editor.fields)) {
        input.disabled = !allowed;
        if (!allowed) slider.disabled = true;
      }
      editor.takeStart.disabled = editor.takeEnd.disabled = !allowed || !present(player?.time);
      editor.preview.disabled = !allowed || !canSeek() || !previewPosition(key, snapshot).valid;
    }
    find('settings').disabled = !bound;
    find('save').textContent = scope === 'series' ? '保存本作品设置' : '仅保存本集';
    find('save').disabled = !allowed || !hasEdits || Boolean(validation);
    find('cancel').hidden = !hasEdits && !conflict;
    find('cancel').disabled = busy || Boolean(pendingWrite) || !storage;
    const editStatus = validation ?? (pendingWrite ? '保存结果未确认。请重新识别以核对已存设置。' : conflict
      ? '已读到其他窗口保存的版本。取消修改后可基于最新设置重新编辑。' : hasEdits
      ? bound ? '有未保存的修改。要切换范围，请先保存或取消。' : '已保留旧播放器的草稿。只在确认是原播放器后恢复编辑。'
      : storageError ? '无法读取已存设置。请重新识别。' : '');
    if (find('edit-status').textContent !== editStatus) find('edit-status').textContent = editStatus;
    find('player').hidden = !bound && !snapshot?.action;
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

  function reset(nextScope = scope) {
    scope = nextScope;
    draftOwner = ready(snapshot) ? snapshot : undefined;
    baseline = storage && ready(snapshot) ? {...readScope(storage.data, snapshot.context, scope)} : {};
    draft = {...baseline};
    opened = undefined;
    conflict = false;
    for (const key of ['intro', 'outro']) populateEditor(key, draft[key]);
  }

  function acceptSnapshot(next) {
    const previous = snapshot;
    const changed = !sameTarget(previous, next) && (ready(previous) || ready(next));
    snapshot = next;
    if (changed) {
      generation++;
      returnPoint = undefined;
      if (seekInProgress) uncertainAction = seekInProgress;
      if (ready(next) && !sameTarget(draftOwner, next)) {
        const hadDraft = dirty();
        reset(storage && KEYS.some(key => Object.hasOwn(readScope(storage.data, next.context, 'episode'), key)) ? 'episode' : 'series');
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
    autoRead = false;
    acceptSnapshot({state: 'unavailable'});
    feedback(code(error) === 'E_APP_PAGE_RELOAD_REQUIRED' ? '请让当前播放操作结束后刷新网页，再重新识别。'
      : '无法连接当前网页中的连播助手。请确认页面已打开且扩展拥有访问权限。', true);
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

  function saved(message) {
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
      saved('已读回并确认设置已保存。');
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
        if (isCurrent()) reset();
        saved(wasScope === 'series' ? '已保存本作品当前季的设置。' : '已保存本集设置。');
      } else {
        await reconcileWrite(isCurrent);
      }
    });
  }

  function previewPosition(key, snap) {
    const rule = draft[key];
    const d = durationOf(snap);
    const valid = rule && !validateRules(effectiveRules(), d);
    const seconds = valid ? (key === 'intro' ? rule.end : rule.kind === 'tail' ? d - rule.seconds : rule.start) : undefined;
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
      if (!present(at) || at < 0 || field === 'seconds' && !d) {
        feedback('暂不能读取此标记所需的播放时间。', true);
        return;
      }
      const value = Math.floor(field === 'seconds' ? d - at : at);
      const input = editors[key].fields[field]?.input;
      if (!input || value < 0) return;
      input.value = time(value);
      const state = editors[key];
      draft[key] = ruleFromFields(key);
      state.invalid = Object.keys(state.fields).some(name => !present(draft[key][name]));
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
    snapshot = undefined;
    returnPoint = undefined;
    if (seekInProgress) uncertainAction = seekInProgress;
    reset('series');
    feedback(pendingWrite ? '网页已变化，正在核对旧网页的保存结果。' : hasEdits ? '网页已变化，旧草稿未保存。' : '', Boolean(pendingWrite) || hasEdits);
    render();
    void readPage();
  }

  find('scope').addEventListener('change', event => {
    if (!editingAllowed() || dirty()) {
      event.target.value = scope;
      if (dirty()) feedback('请先保存或取消修改，再切换范围。', true, true);
      return;
    }
    reset(event.target.value);
    feedback('');
    render();
  });
  find('cancel').addEventListener('click', () => {
    if (busy || pendingWrite || !storage) return;
    reset();
    feedback('已取消修改，保留已保存的设置。', false, true);
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
