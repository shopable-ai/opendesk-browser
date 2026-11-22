import {mountTimeTrack, ENDPOINTS} from './time-track.js';
import {resolveInterval} from './rules.js';
import {t, localizeIssue} from './i18n.js';

export const VIEWPORT_STOPS = [60, 120, 180, 300, 600];
const present = Number.isFinite;
export function recommendedSpan(duration) {
  if (!duration) return 300;
  if (duration <= 300) return duration;
  if (duration <= 1800) return 180;
  return duration <= 7200 ? 300 : 600;
}
export const formatTime = seconds => {
  if (!present(seconds) || seconds < 0) return '—';
  const whole = Math.floor(seconds);
  return String(Math.floor(whole / 60)).padStart(2, '0') + ':' + String(whole % 60).padStart(2, '0');
};
function parseTime(raw) {
  const s = raw.trim();
  if (!s) return undefined;
  if (!/^\d+(?::[0-5]\d)?$/.test(s)) return NaN;
  const [a, b] = s.split(':').map(Number);
  const result = b === undefined ? a : a * 60 + b;
  return Number.isSafeInteger(result) ? result : NaN;
}

export function blankTiming(key) {
  return key === 'intro' ? {kind: 'fixed', start: 0} : {kind: 'tail'};
}
export function endpointsFor(rule, lastSecond) {
  if (rule.kind === 'tail') return {
    start: lastSecond && rule.seconds !== undefined ? lastSecond - rule.seconds : undefined,
    end: lastSecond || undefined,
  };
  return {start: rule.start, end: rule.end};
}
export function changeEndpoint(key, rule, part, value, lastSecond) {
  const next = key === 'intro' && part === 'start' && value === undefined ? 0 : value;
  const points = {...endpointsFor(rule, lastSecond), [part]: next};
  // The last displayable second means "follow the end", even if the duration is fractional.
  return key === 'outro' && (part === 'end' ? value === undefined || value === lastSecond : rule.kind === 'tail')
    ? {kind: 'tail', seconds: points.start === undefined ? undefined : lastSecond - points.start}
    : {kind: 'fixed', ...points};
}
export function clearTimeIntent(key, part) {
  if (key === 'intro' && part === 'start') return {kind: 'endpoint', value: 0};
  if (key === 'outro' && part === 'end') return {kind: 'endpoint', value: undefined};
  return {kind: 'unset-rule'};
}

export function timeIssue(rule, lastSecond) {
  if (!lastSecond) return '本集时长未知，暂不能修改时间规则。';
  const {start, end} = endpointsFor(rule, lastSecond);
  if (Number.isNaN(start) || Number.isNaN(end)) return '请输入秒数或分:秒，例如 01:30。';
  if (!present(start) || !present(end)) return '请填入开始和结束时间。';
  if (start < 0 || end > lastSecond) return '时间不能超出本集时长。';
  if (start >= end) return '开始必须早于结束。';
  if (start === 0 && end === lastSecond) return '该设置会跳过整集，请缩小范围。';
  return '';
}

export const outroInterval = (rule, duration) => rule?.kind &&
  resolveInterval({...rule, enabled: undefined}, duration);

export function tailMatchStatus({rule, duration, changed, scope, inherited, reusable, connected = true, overridden, archived}) {
  const source = t(scope === 'episode' && !inherited ? 'scopeEpisode' : 'tailDefault');
  const pending = changed ? t('unsaved') + ' · ' : '';
  const waiting = text => ({state: 'waiting', text});
  if (rule === null || rule?.enabled === false) return waiting(pending + t('tailOff', {source}) +
    (overridden ? ' · ' + t('summaryOverride').replace(/ · $/, '') : ''));
  if (!connected) return waiting(t('unknownMedia'));
  if (archived) return waiting(duration ? t('tailDefault') + t('tailNotApplied') : t('tailWaitingDuration'));
  if (!rule || rule.kind === 'tail' && rule.seconds === undefined) return waiting(
    pending + t('tailUnset'));
  if (!duration) return waiting(t('tailWaitingDuration'));
  const interval = outroInterval(rule, duration);
  if (!interval) return {state: 'error', text: pending + t('tailBadRange') +
    (changed || !reusable ? ' ' + t('invalidTime') : '')};
  const method = rule.kind === 'tail' ? t('tailRelativeMethod', {time: formatTime(rule.seconds)}) : t('tailFixedMethod');
  const calculated = rule.kind === 'tail' && (!changed || inherited);
  const status = overridden ? t('summaryOverride').replace(/ · $/, '') : t(changed ? 'unsaved' : 'summaryActive');
  return {state: changed || overridden ? 'waiting' : calculated ? 'matched' : 'interval', interval, calculated,
    text: t('tailVideo', {range: formatTime(interval.start) + '–' + formatTime(interval.end), source, method, status}) +
      (inherited && changed ? ' · ' + t('restoreInherited') : '')};
}

export function buildTimeEditor({el, button, row, template, calibrationHost, key, canEdit, onEdit, onClear, onMatch, onMark, onPreview}) {
  const name = () => t(key === 'intro' ? 'introName' : 'outroName');
  const hint = el('span', 'vas-sr');
  hint.id = 'vas-window-' + key;
  row.querySelector('.vas-row-head').append(hint);
  const trackHost = el('div', 'vas-track-host');
  const track = mountTimeTrack(template, trackHost, {key, format: formatTime,
    commit: (part, value) => edit(part, value), refresh: () => render(current)});
  const fields = el('div', 'vas-endpoints');
  const error = el('p', 'vas-field-error');
  error.id = 'vas-error-' + key;
  error.setAttribute('aria-live', 'polite');
  let raw = {}, current;
  const parse = (part, value) => key === 'outro' && part === 'end' && /^(end|结束|结尾)$/i.test(value.trim())
    ? undefined : parseTime(value);
  function edit(part, value, text) {
    if (!canEdit()) return;
    if (text === undefined) delete raw[part];
    else raw[part] = text;
    onEdit(part, value);
  }
  const clears = {};
  const inputs = Object.fromEntries(ENDPOINTS.map(part => {
    const field = el('div', 'vas-field');
    const title = el('label', '', part === 'start' ? '开始' : '结束');
    const input = el('input');
    input.id = 'vas-' + key + '-' + part;
    title.htmlFor = input.id;
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = '分:秒';
    input.setAttribute('aria-label', t('inputAria', {name: name(), boundary: title.textContent}));
    input.setAttribute('aria-describedby', error.id + (key === 'outro' ? ' vas-tail-match' + (part === 'end' ? ' vas-tail-help' : '') : ''));
    const clear = button('×');
    clear.id = 'vas-clear-' + key + '-' + part;
    clear.className = 'vas-clear-time';
    const labelReset = () => key === 'intro' && part === 'start' ? t('resetIntroStart') :
      key === 'outro' && part === 'end' ? t('resetOutroEnd') : t('clearTime',
        {name: name(), boundary: t(part === 'start' ? 'timeStart' : 'timeEnd')});
    clear.setAttribute('aria-label', labelReset());
    clear.title = labelReset();
    clear.addEventListener('click', () => {
      if (!canEdit()) return;
      // A cleared editable boundary removes the whole interval draft, so discard
      // both raw strings; otherwise stale text could reappear after reset.
      if (clearTimeIntent(key, part).kind === 'unset-rule') raw = {};
      else delete raw[part];
      onClear(part);
      input.focus({preventScroll: true});
    });
    clears[part] = clear;
    field.append(title, input, clear);
    fields.append(field);
    const normalize = () => {
      if (Number.isNaN(parse(part, input.value))) return;
      delete raw[part];
      render(current);
    };
    input.addEventListener('input', () => {
      if (key === 'outro' && part === 'start' && !input.value.trim() && canEdit()) {
        raw = {[part]: input.value};
        onClear(part);
      } else edit(part, parse(part, input.value), input.value);
    });
    input.addEventListener('blur', normalize);
    input.addEventListener('keydown', event => {
      if (!canEdit() || event.isComposing) return;
      if (event.key === 'Enter') { event.preventDefault(); normalize(); return; }
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const value = parse(part, input.value) ?? endpointsFor(current.rule, current.lastSecond)[part] ?? suggestion(part);
      if (!present(value)) return;
      event.preventDefault();
      edit(part, Math.min(current.lastSecond, Math.max(0, value + (event.key === 'ArrowUp' ? 1 : -1))));
    });
    return [part, input];
  }));
  const details = el('details', 'vas-calibration');
  const actions = el('div', 'vas-actions');
  const takeStart = button('用当前时间标记起点');
  const takeEnd = button('用当前时间标记终点');
  const preview = button(key === 'intro' ? '查看片头结束位置' : '查看片尾开始位置');
  takeStart.id = 'vas-mark-' + key + '-start';
  takeEnd.id = 'vas-mark-' + key + '-end';
  preview.id = 'vas-preview-' + key;
  actions.append(takeStart, takeEnd, preview);
  const disclosure = el('summary', '', t('positionCalibration', {name: name()}));
  disclosure.id = 'vas-calibrate-' + key;
  details.append(disclosure, actions);
  takeStart.addEventListener('click', () => onMark('start'));
  takeEnd.addEventListener('click', () => onMark('end'));
  preview.addEventListener('click', onPreview);
  row.append(trackHost, fields, error);
  const tailStatus = key === 'outro' ? el('span', 'vas-match-text') : null;
  const matchLength = tailStatus ? button('') : null;
  if (tailStatus) {
    const help = el('p', 'vas-sr', t('tailHelp'));
    help.id = 'vas-tail-help';
    tailStatus.id = 'vas-tail-match';
    const matchPanel = el('p', 'vas-tail-match');
    matchPanel.setAttribute('role', 'status');
    matchPanel.append(el('strong', 'vas-match-label'), tailStatus);
    matchLength.id = 'vas-match-outro-length';
    matchLength.className = 'vas-match-length';
    matchLength.hidden = true;
    matchLength.addEventListener('click', () => {
      if (!canEdit() || !current?.reusable) return;
      raw = {};
      onMatch();
      inputs.start.focus({preventScroll: true});
    });
    row.append(help, matchPanel, matchLength);
  }
  calibrationHost.append(details);

  function suggestion(part) {
    const d = current.lastSecond;
    if (d <= 10) return undefined;
    if (key === 'intro' && part === 'end') return Math.min(300, Math.floor(d / 4));
    if (key === 'outro' && part === 'start') return d - Math.min(90, Math.floor(d / 4));
  }

  function render(options) {
    current = options;
    const {rule, lastSecond: d, allowed, issue, canMark, canPreview, span, match, reusable} = options;
    const points = endpointsFor(rule, d);
    const known = ENDPOINTS.filter(part => !Object.hasOwn(raw, part)).map(part => points[part])
      .filter(value => present(value) && value >= 0 && value <= d);
    const reach = key === 'intro' ? Math.max(0, ...known) : d - Math.min(d, ...known);
    const width = Math.min(d, Math.max(span, Math.ceil(reach / 60) * 60));
    const range = !d ? [0, 1] : key === 'intro' ? [0, width] : [d - width, d];
    hint.textContent = d ? t(key === 'intro' ? 'frontWindow' : 'endWindow', {time: formatTime(width)}) :
      key === 'intro' ? t('frontWindow', {time: formatTime(span)}) : t('durationPendingShort');
    const locked = !allowed || !d;
    const anchor = key === 'intro' && points.start === 0 ? 'start' : key === 'outro' && rule.kind === 'tail' ? 'end' : null;
    const suggestions = Object.fromEntries(ENDPOINTS.filter(part => points[part] === undefined)
      .map(part => [part, suggestion(part)]));
    track.update({range, ...points, suggestions, anchor, locked, invalid: Boolean(issue)});
    if (tailStatus && match) {
      if (tailStatus.textContent !== match.text) tailStatus.textContent = match.text;
      tailStatus.parentElement.dataset.state = issue ? 'error' : match.state;
      matchLength.hidden = !reusable;
      matchLength.disabled = locked;
      const label = reusable ? t('tailMatchLength', {time: formatTime(reusable.seconds)}) : '';
      if (matchLength.textContent !== label) matchLength.textContent = label;
    }
    const localized = localizeIssue(issue);
    if (error.textContent !== localized) error.textContent = localized;
    error.hidden = !issue;
    for (const part of ENDPOINTS) {
      const input = inputs[part];
      input.disabled = locked;
      input.setAttribute('aria-invalid', String(Boolean(issue)));
      const point = match?.interval?.[part] ?? (part === 'end' && anchor === 'end' ? undefined : points[part]);
      const value = raw[part] ?? (d && present(point) && point >= 0 ? (part === anchor && anchor === 'end' ? 'End' : formatTime(point)) : '');
      if (input.value !== value) input.value = value;
      const suggested = suggestions[part];
      input.placeholder = part === 'end' && anchor === 'end' ? 'End' : present(suggested) ? formatTime(suggested) : t('timePlaceholder');
      input.parentElement.dataset.endpointState = part === 'start' && match?.calculated && !Object.hasOwn(raw, part)
        ? 'calculated' : part === anchor ? 'bound-' + part : present(suggested) ? 'suggested' : '';
      const resetAvailable = !(key === 'intro' && part === 'start' && rule.kind === 'fixed' &&
        points.start === 0 && !Object.hasOwn(raw, part));
      clears[part].disabled = locked;
      clears[part].hidden = locked || !value.trim() || !resetAvailable || part === 'end' && anchor === 'end' && value === 'End';
    }
    for (const part of ENDPOINTS) {
      const label = inputs[part].previousElementSibling;
      const boundary = t(part === 'start' ? 'timeStart' : 'timeEnd');
      label.textContent = boundary;
      inputs[part].setAttribute('aria-label', t('inputAria', {name: name(), boundary}));
      const clear = clears[part];
      const clearLabel = key === 'intro' && part === 'start' ? t('resetIntroStart') :
        key === 'outro' && part === 'end' ? t('resetOutroEnd') : t('clearTime', {name: name(), boundary});
      clear.title = clearLabel;
      clear.setAttribute('aria-label', clearLabel);
    }
    takeStart.textContent = t('markCurrentStart');
    takeEnd.textContent = t('markCurrentEnd');
    preview.textContent = t(key === 'intro' ? 'previewIntroEnd' : 'previewOutroStart');
    disclosure.textContent = t('positionCalibration', {name: name()});
    if (tailStatus) {
      row.querySelector('#vas-tail-help').textContent = t('tailHelp');
      row.querySelector('.vas-match-label').textContent = t('tailStatusLabel');
    }
    takeStart.disabled = takeEnd.disabled = locked || !canMark;
    preview.disabled = locked || !canPreview;
  }
  return {render, dispose: track.dispose, reset() { raw = {}; details.open = false; }, clear(part) { delete raw[part]; }};
}
