(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const root = byId('od-preview-app');
  const names = {intro: '跳过片头', outro: '跳过片尾', autoNext: '自动下一集'};
  const times = {start: '开始', end: '结束'};
  const timeTracks = {};
  const fmt = n => Number.isSafeInteger(n) && n >= 0 ? String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0') : '';
  const parseTime = text => {
    const input = text.trim();
    if (!input) return null;
    const match = /^([0-9]{1,4}):([0-5][0-9])$/.exec(input);
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  };
  const keys = Object.keys(names);
  const stateButtons = [...byId('preview-state').querySelectorAll('[data-state]')];
  const theme = byId('od-design-theme');
  const stateNotes = {
    error: '读取失败。请在下方切回「已授权」重试。已保存规则保留。',
    denied: '模拟未授权，暂不可查看设置。请在下方切回「已授权」。',
    revoked: '模拟授权撤销，编辑已停止。请在下方切回「已授权」。',
    busy: '模拟处理中。请在下方切回「已授权」恢复操作。',
  };
  let normal = new PreviewRules(), empty = new PreviewRules(), model = normal;
  let opened = null, raw = {}, scene = 'ready', pending = null;
  const dialog = byId('vas-confirm');
  const status = message => {
    byId('vas-status').textContent = message;
    byId('vas-status').hidden = !message;
  };
  const title = key => 'vas-title-' + key;
  const id = (kind, key, field) => ['vas', kind, key, field].filter(Boolean).join('-');
  const endpoint = (key, field) => model.endpoint(key, field, model.draft, model.reference(key).duration);
  const range = key => [endpoint(key, 'start'), endpoint(key, 'end')];
  const closeEditor = () => { opened = null; };
  const setText = (element, value) => { if (element.textContent !== value) element.textContent = value; };

  function summary(key, issue) {
    const rule = model.draft[key];
    if (key === 'autoNext') return rule ? '本集播完后，再尝试切换' : '播完后停在本集';
    const [a, b] = range(key);
    const {duration} = model.reference(key);
    if (duration === null && rule.mode === 'tail' && rule.tail > 0) return '最后 ' + fmt(rule.tail) + ' · 待确认时长';
    if (issue || !fmt(a) || !fmt(b) || a >= b || (duration !== null && b > duration)) {
      return a === null || b === null ? '未设置时间' : '请检查时间';
    }
    const after = key === 'outro' && rule.mode === 'interval' ? duration === null ? '' : b === duration ? ' · 跳到本集结束' : ' · 保留后续' : '';
    return fmt(a) + '–' + fmt(b) + after + (!rule.enabled ? ' · 已关闭' : '');
  }

  function row(key) {
    const hasTime = key !== 'autoNext';
    return '<li class="od-collection-row od-surface--padded"><div class="preview-row">' +
      '<span><strong class="od-title" id="' + title(key) + '">' + names[key] + '</strong><br>' +
      '<span class="od-note" id="' + id('summary', key) + '"></span></span><div class="preview-actions">' +
      (hasTime ? '<button class="od-button od-button--quiet" type="button" data-edit="' + key + '" id="' + id('edit', key) + '" aria-controls="' + id('editor', key) + '" aria-expanded="false">设置</button>' : '') +
      '<button class="od-button od-button--quiet" type="button" role="switch" data-toggle="' + key + '" id="' + id('toggle', key) + '" aria-checked="false" aria-labelledby="' + title(key) + '">' +
      '已关闭</button></div></div>' +
      '<div class="preview-row" id="' + id('source-row', key) + '" hidden><span class="od-note" id="' + id('source', key) + '"></span>' +
      '<button class="od-button od-button--quiet" type="button" data-restore="' + key + '" aria-label="恢复继承：' + names[key] + '" hidden>恢复继承</button></div>' +
      (hasTime ? '<div id="' + id('editor', key) + '" hidden></div><p id="' + id('error', key) + '" class="od-field-error" aria-live="polite" hidden></p>' : '') + '</li>';
  }
  byId('vas-rules').innerHTML = keys.map(row).join('');

  function fieldsFor(key) {
    const mode = model.draft[key].mode;
    return mode === 'start' ? ['end'] : mode === 'tail' ? ['start'] : ['start', 'end'];
  }

  function sliderLimits(key, field, previous) {
    const value = endpoint(key, field);
    const {duration} = model.reference(key);
    if (duration === null) return [0, 1, 0];
    const tail = key === 'outro';
    // Keep second-level pointer precision near the end in use. Text can enter any valid time.
    const size = 180;
    const fallback = tail ? Math.max(0, duration - (field === 'end' ? 0 : 30)) : (field === 'start' ? 0 : 30);
    const floor = field === 'end' ? 1 : 0;
    const ceiling = field === 'start' ? duration - 1 : duration;
    const valid = Number.isSafeInteger(value) && value >= 0 && value <= duration;
    const point = Math.max(floor, Math.min(ceiling, valid ? value : previous ?? fallback));
    const min = Math.max(floor, Math.min(tail ? duration - size : 0, point - 30));
    const max = Math.min(ceiling, Math.max(tail ? duration : size, point + 30));
    return [min, max, point];
  }

  function updateNativeSlider(key, field) {
    const slider = byId(id('slider', key, field));
    if (!slider) return;
    const [min, max, point] = sliderLimits(key, field, Number(slider.value));
    slider.min = min; slider.max = max; slider.value = point;
  }

  function writeEditor(key) {
    const editor = byId(id('editor', key));
    const error = byId(id('error', key));
    if (editor.contains(error)) editor.after(error);
    delete timeTracks[key];
    editor.hidden = key !== opened;
    editor.innerHTML = '';
    if (key !== opened) return;
    const mode = model.draft[key].mode;
    const first = key === 'intro' ? '从开头' : '到本集结束';
    const standard = key === 'intro' ? 'start' : 'tail';
    const interval = mode === 'interval';
    const description = interval ? '拖动「始」「终」微调，或输入分:秒调整任意时间。' : mode === 'start' ? '起点固定在 00:00。' : '终点跟随本集时长；换集后距片尾的长度不变。';
    const reference = model.reference(key);
    const example = reference.episode === model.episode ? '' : '本集另有设置，此处以第 ' + String(reference.episode).padStart(2, '0') + ' 集为例。';
    const disabled = model.duration === null ? ' disabled' : '';
    editor.innerHTML = '<div class="od-stack"><div class="od-form-field"><label for="' + id('mode', key) + '" class="od-field-label">时间模式</label>' +
      '<select id="' + id('mode', key) + '" class="od-field" data-mode="' + key + '"' + disabled + '><option value="' + standard + '">' + first + '</option><option value="interval">指定开始和结束</option></select></div>' +
      '<div class="od-field-help" id="' + id('time-help', key) + '">' + (disabled ? '时长未知，原设置保留；请更正集数后再编辑。' : example + description) + '</div>' +
      fieldsFor(key).map(field => {
        const input = id('time', key, field), slider = id('slider', key, field);
        const [min, max, fallback] = sliderLimits(key, field);
        const described = id('time-help', key);
        return '<div class="od-form-field"><label class="od-field-label" for="' + input + '">' + times[field] + '时间</label>' +
          '<input id="' + input + '" class="od-field" type="text" maxlength="7" placeholder="分:秒" autocomplete="off" spellcheck="false" data-time="' + key + '" data-field="' + field + '" aria-describedby="' + described + '"' + disabled + '>' +
          (interval ? '' : '<label class="visually-hidden" for="' + slider + '">拖动微调' + names[key].slice(2) + times[field] + '时间</label>' +
          '<input id="' + slider + '" class="od-field" type="range" data-slider="' + key + '" data-field="' + field + '" min="' + min + '" max="' + max + '" value="' + fallback + '" aria-describedby="' + id('limit', key, field) + ' ' + described + '"' + disabled + '>' +
          '<span id="' + id('limit', key, field) + '" class="od-field-help"' + (disabled ? ' hidden' : '') + '></span>') + '</div>';
      }).join('') + '<span data-time-error-anchor hidden></span>' + (interval && !disabled ? '<div class="od-form-field"><div id="' + id('track', key) + '"></div>' +
        '<div class="od-note" id="' + id('track-window', key) + '"></div><div class="od-note" id="' + id('track-suggestion', key) + '" hidden></div></div>' : '') +
      (disabled ? '' : '<div class="preview-actions"><button class="od-button od-button--quiet" type="button" data-finish="' + key + '">收起时间编辑</button></div>') + '</div>';
    editor.querySelector('[data-time-error-anchor]').replaceWith(error);
    byId(id('mode', key)).value = mode;
    for (const field of fieldsFor(key)) byId(id('time', key, field)).value = raw[id('time', key, field)] ?? fmt(endpoint(key, field));
    if (interval && !disabled) timeTracks[key] = new PreviewTimeTrack(byId(id('track', key)), {
      key, name:names[key].slice(2), duration:reference.duration, format:fmt,
      commit: (field, value) => setSliderTime(key, field, value),
    });
  }

  function sync(reframeTrack) {
    const errors = model.validate();
    const blocked = Object.hasOwn(stateNotes, scene);
    const unknown = model.duration === null;
    const episodeLabel = String(model.episode).padStart(2, '0');
    byId('vas-work').textContent = scene === 'long' ? '星海航线：地平线之外与失落航标的远征故事' : '星海航线';
    byId('vas-episode-summary').textContent = '第 1 季 · 第 ' + episodeLabel + ' 集 · ' + (fmt(model.duration) || '时长未知');
    byId('vas-episode').value = String(model.episode);
    byId('vas-scope').value = model.scope;
    byId('vas-scope-help').textContent = model.scope === 'work' ? '用于当前季，已保存的各集例外会保留。' : '只影响第 ' + episodeLabel + ' 集，未设例外的项目继承作品设置。';
    const save = byId('vas-save');
    save.textContent = model.scope === 'work' ? '保存当前季设置' : '仅保存本集';
    save.disabled = blocked || !model.dirty || Object.keys(errors).length > 0;
    save.classList.toggle('od-button--primary', !save.disabled);
    save.classList.toggle('od-button--secondary', save.disabled);
    byId('vas-cancel').hidden = !model.dirty;
    byId('vas-draft-state').hidden = !model.dirty;
    const warning = byId('vas-warning');
    warning.textContent = stateNotes[scene] || (unknown ? '时长未知，已保存的时间保留。确认时长后可调整时间或开启跳过。' : '');
    warning.hidden = !warning.textContent;
    byId('vas-rules-section').hidden = blocked;
    byId('vas-scope-section').hidden = blocked;
    byId('vas-save-section').hidden = blocked;
    for (const button of stateButtons) {
      button.setAttribute('aria-pressed', String(scene === button.dataset.state));
      button.classList.toggle('od-button--secondary', scene !== button.dataset.state);
      button.disabled = model.dirty;
    }
    byId('reset-items').disabled = model.dirty;
    theme.disabled = model.dirty;
    for (const key of keys) {
      const toggle = byId(id('toggle', key));
      const enabled = key === 'autoNext' ? model.draft[key] : model.draft[key].enabled;
      toggle.setAttribute('aria-checked', String(enabled));
      toggle.classList.toggle('od-button--secondary', enabled);
      toggle.classList.toggle('od-button--quiet', !enabled);
      setText(toggle, enabled ? '已开启' : '已关闭');
      toggle.disabled = key !== 'autoNext' && unknown && !enabled && !model.base[key].enabled;
      const source = model.source(key);
      const reference = key === 'autoNext' ? model.episode : model.reference(key).episode;
      const seasonLabel = model.scope === 'work' && source
        ? '当前季默认' + (reference === model.episode ? '' : '（第 ' + String(reference).padStart(2, '0') + ' 集示例）') + ' · '
        : '';
      setText(byId(id('summary', key)), summary(key, errors[key]));
      byId(id('source-row', key)).hidden = !source;
      setText(byId(id('source', key)), seasonLabel + source);
      const restore = root.querySelector('[data-restore="' + key + '"]');
      restore.hidden = source !== '本集例外';
      restore.disabled = key !== 'autoNext' && unknown && model.work[key].enabled;
      if (key === 'autoNext') continue;
      const edit = byId(id('edit', key));
      edit.setAttribute('aria-expanded', String(opened === key));
      edit.textContent = opened === key ? '收起' : range(key).every(value => fmt(value)) ? '调整' : '设置';
      edit.setAttribute('aria-label', edit.textContent + names[key].slice(2) + '时间');
      const error = byId(id('error', key));
      setText(error, errors[key]?.message || '');
      error.hidden = !errors[key];
      const track = timeTracks[key];
      if (track) {
        const suggestions = track.update(range(key), errors[key], key === reframeTrack);
        setText(byId(id('track-window', key)), '微调范围 ' + track.window.map(fmt).join('–'));
        const hint = byId(id('track-suggestion', key));
        const reasons = Object.entries(suggestions).map(([field, reason]) => times[field] + '时间' + reason);
        setText(hint, reasons.length ? '虚线柄为建议位置：' + reasons.join('，') + '。' : '');
        hint.hidden = !reasons.length;
      }
      for (const field of fieldsFor(key)) {
        const input = byId(id('time', key, field)), slider = byId(id('slider', key, field));
        if (!input) continue;
        const value = endpoint(key, field);
        const invalid = errors[key]?.fields.includes(field);
        if (invalid) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
        input.setAttribute('aria-describedby', id('time-help', key) + (invalid ? ' ' + error.id : ''));
        if (!slider || track) continue;
        const position = Number(slider.value);
        const suggestion = !unknown && position !== value ? times[field] + '时间' + previewTimeSuggestion(value) : '';
        setText(byId(id('limit', key, field)), '拖动范围 ' + fmt(Number(slider.min)) + '–' + fmt(Number(slider.max)) +
          (suggestion ? '。滑块为建议位置：' + suggestion + '。' : ''));
        slider.setAttribute('aria-describedby', [id('limit', key, field), id('time-help', key), ...(invalid ? [error.id] : [])].join(' '));
        slider.setAttribute('aria-valuetext', unknown ? '时长未知' : fmt(position) + (suggestion ? '，建议位置，' + suggestion : ''));
      }
    }
    const saveWarning = byId('vas-save-warning');
    const closedError = Object.keys(errors).find(key => key in names && key !== opened);
    const offerEpisode = errors.crossEpisode && model.episodeAlternative();
    byId('vas-use-episode').hidden = !offerEpisode;
    const crossEpisode = errors.crossEpisode && (errors.crossEpisode + (offerEpisode ? ' 可调整时间，或将这次修改带入本集草稿。' : ' 请调整当前季的设置。'));
    const message = errors.general || crossEpisode || (closedError ? names[closedError] + '：' + errors[closedError].message : '') || model.warning();
    if (saveWarning.textContent !== message) saveWarning.textContent = message;
    saveWarning.hidden = !message;
  }

  function render() { for (const key of ['intro', 'outro']) writeEditor(key); sync(); }
  function clearDraft() { model.load(); raw = {}; closeEditor(); status(''); render(); }
  function protect(origin, detail, run) {
    if (!model.dirty) { run(); return; }
    pending = {origin, run};
    byId('vas-confirm-detail').textContent = detail;
    dialog.showModal();
  }
  function reject() {
    const origin = pending?.origin;
    pending = null; dialog.close(); origin?.focus();
  }
  byId('vas-stay').addEventListener('click', reject);
  dialog.addEventListener('cancel', event => { event.preventDefault(); reject(); });
  byId('vas-discard').addEventListener('click', () => {
    const action = pending;
    pending = null; dialog.close(); clearDraft(); action?.run();
  });
  const contextToggle = byId('vas-context-toggle'), context = byId('vas-context');
  function setContext(open) {
    context.hidden = !open;
    contextToggle.setAttribute('aria-expanded', String(open));
    contextToggle.textContent = open ? '收起集数' : '更正集数';
  }
  contextToggle.addEventListener('click', () => setContext(context.hidden));
  byId('vas-episode').addEventListener('change', event => {
    const select = event.target, episode = Number(select.value);
    select.value = String(model.episode);
    protect(select, '切换集数会放弃本次修改，已保存的设置会保留。', () => {
      model.episode = episode; clearDraft(); setContext(false); contextToggle.focus();
    });
  });
  byId('vas-scope').addEventListener('change', event => {
    const select = event.target, scope = select.value;
    select.value = model.scope;
    protect(select, '切换保存范围会放弃本次修改，已保存的设置会保留。', () => {
      model.scope = scope; clearDraft(); select.focus();
    });
  });
  byId('vas-use-episode').addEventListener('click', () => {
    if (!model.useEpisodeDraft()) return;
    render();
    status('已带入本集，当前季设置未更改。请核对后保存。');
    byId('vas-save').focus();
  });
  const back = byId('sidebar-tool-back');
  back.addEventListener('opendesk-preview-back', event => {
    if (!model.dirty) return;
    event.preventDefault();
    protect(back, '返回工具列表会放弃本次修改，已保存的设置会保留。', () => back.click());
  });

  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const {edit, toggle, restore, finish} = button.dataset;
    if (edit) { opened = opened === edit ? null : edit; render(); }
    if (finish) {
      closeEditor(); render();
      const save = byId('vas-save'), message = byId('vas-save-warning');
      (save.disabled ? message.hidden ? byId(id('edit', finish)) : message : save).focus();
    }
    if (toggle) {
      model.edit(toggle, toggle === 'autoNext' ? !model.draft[toggle] : {enabled: !model.draft[toggle].enabled});
      if (toggle !== 'autoNext' && model.draft[toggle].enabled && model.validate()[toggle] && model.duration !== null) {
        opened = toggle; writeEditor(toggle === 'intro' ? 'outro' : 'intro'); writeEditor(toggle);
      }
      status(''); sync();
    }
    if (restore) {
      const issue = model.restoreIssue(restore);
      if (issue) {
        status('无法恢复继承：' + issue + ' 已保留本集设置。');
        byId('vas-status').focus();
        return;
      }
      model.restore(restore);
      for (const field of Object.keys(times)) delete raw[id('time', restore, field)];
      render(); byId(id('toggle', restore)).focus(); status('保存后恢复继承。');
    }
  });
  function setSliderTime(key, field, seconds) {
    const peer = byId(id('time', key, field));
    model.time(key, field, seconds);
    delete raw[peer.id]; peer.value = fmt(seconds);
    status(''); sync();
  }
  root.addEventListener('input', event => {
    if (event.isComposing) return;
    const input = event.target, {time, slider, field} = input.dataset;
    if (!time && !slider) return;
    if (time) {
      raw[input.id] = input.value;
      model.time(time, field, parseTime(input.value));
      if (model.draft[time].mode !== 'interval') updateNativeSlider(time, field);
      status(''); sync(time);
    } else {
      setSliderTime(slider, field, Number(input.value));
    }
  });
  root.addEventListener('change', event => {
    const {mode} = event.target.dataset;
    if (!mode) return;
    model.mode(mode, event.target.value);
    for (const field of Object.keys(times)) delete raw[id('time', mode, field)];
    writeEditor(mode); sync(); status(''); byId(id('mode', mode)).focus();
  });
  byId('vas-save').addEventListener('click', () => {
    if (!model.save()) return;
    raw = {}; closeEditor(); render();
    status(model.scope === 'work' ? '已保存当前季的默认设置。' : '已保存第 ' + String(model.episode).padStart(2, '0') + ' 集设置。');
    byId('vas-status').focus();
  });
  byId('vas-cancel').addEventListener('click', () => {
    clearDraft(); status('已取消修改，保留原设置。'); byId('vas-status').focus();
  });

  function reset() {
    normal = new PreviewRules(); empty = new PreviewRules(); model = normal; scene = 'ready';
    root.dataset.previewTheme = 'light'; theme.value = 'light';
    setContext(false); clearDraft();
  }
  theme.addEventListener('change', event => { root.dataset.previewTheme = event.target.value; });
  byId('reset-items').addEventListener('click', () => { reset(); status('已重置本页示例。'); });
  byId('od-preview-accept-uninstall').addEventListener('click', reset);
  root.addEventListener('opendesk-preview-reset', reset);
  for (const button of stateButtons) button.addEventListener('click', () => {
    scene = button.dataset.state;
    model = scene === 'empty' ? empty : normal;
    closeEditor(); raw = {}; status(''); render();
  });
  reset();
})();
