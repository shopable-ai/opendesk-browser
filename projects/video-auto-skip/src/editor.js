import {mountTimeTrack, ENDPOINTS} from './time-track.js';
import {isEnabled} from './rules.js';

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

export function tailMatchStatus({rule, saved, duration, changed, reusable, inherited}) {
  const waiting = text => ({state: 'waiting', text});
  if (!duration) return waiting('等待当前视频时长，暂无法换算。');
  if (!rule || rule.kind === 'tail' && rule.seconds === undefined) return waiting(reusable
    ? '先设置片尾开始时间，保存后跨集复用。' : '先设置片尾开始时间，保存到当前集。');
  if (timeIssue(rule, duration)) return {state: 'error', text: '片尾区间有误，请核对时间。'};
  if (rule.kind === 'fixed') return {state: 'interval', text: (changed ? '待保存 · ' : '') + '指定区间，不跟随视频结尾。'};
  const offset = '按倒数 ' + formatTime(rule.seconds) + ' 换算';
  if (changed) return waiting('待保存 · 将' + offset + '。');
  if (saved?.kind !== 'tail') return waiting('设置片尾开始时间后可保存。');
  return {state: 'matched', text: '已保存 · ' + (isEnabled(saved) ? '' : '跳过已关闭 · ') + offset +
    (reusable ? '，适用各集。' : inherited ? '，沿用作品默认。' : '，仅本集。')};
}

export function buildTimeEditor({el, button, row, template, calibrationHost, key, name, canEdit, onEdit, onClear, onMark, onPreview}) {
  const hint = el('span', 'vas-sr');
  hint.id = 'vas-window-' + key;
  row.querySelector('.vas-row-head').append(hint);
  const trackHost = el('div', 'vas-track-host');
  const track = mountTimeTrack(template, trackHost, {key, name, format: formatTime,
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
    input.setAttribute('aria-label', name + title.textContent + '时间');
    input.setAttribute('aria-describedby', error.id + (key === 'outro' && part === 'end' ? ' vas-tail-help' : ''));
    const clear = button('×');
    clear.id = 'vas-clear-' + key + '-' + part;
    clear.className = 'vas-clear-time';
    const resetLabel = key === 'intro' && part === 'start' ? '恢复片头开始为 00:00' :
      key === 'outro' && part === 'end' ? '恢复片尾结束跟随视频结尾' : '清空' + name + title.textContent + '时间';
    clear.setAttribute('aria-label', resetLabel);
    clear.title = resetLabel;
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
    input.addEventListener('input', () => edit(part, parse(part, input.value), input.value));
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
  const disclosure = el('summary', '', name + '位置校准');
  disclosure.id = 'vas-calibrate-' + key;
  details.append(disclosure, actions);
  takeStart.addEventListener('click', () => onMark('start'));
  takeEnd.addEventListener('click', () => onMark('end'));
  preview.addEventListener('click', onPreview);
  const endHint = key === 'outro' ? el('p', 'vas-end-hint') : null;
  row.append(trackHost, fields);
  if (endHint) row.append(endHint);
  row.append(error);
  const tailStatus = key === 'outro' ? el('span', 'vas-match-text') : null;
  if (tailStatus) {
    const help = el('p', 'vas-sr', 'End 跟随当前视频的实际结束位置，换集自动重算片尾开始；填入具体结束时间可保留后面的内容。');
    help.id = 'vas-tail-help';
    tailStatus.id = 'vas-tail-match';
    const matchPanel = el('p', 'vas-tail-match');
    matchPanel.setAttribute('role', 'status');
    matchPanel.append(el('strong', 'vas-match-label', '跨集匹配'), tailStatus);
    row.append(help, matchPanel);
  }
  calibrationHost.append(details);

  function suggestion(part) {
    const d = current.lastSecond;
    if (d <= 10) return undefined;
    if (key === 'intro' && part === 'end') return Math.min(300, Math.floor(d / 4));
    if (key === 'outro' && part === 'start' && current.rule.kind === 'tail') return d - Math.min(90, Math.floor(d / 4));
  }

  function render(options) {
    current = options;
    const {rule, lastSecond: d, allowed, issue, canMark, canPreview, span, match} = options;
    const points = endpointsFor(rule, d);
    const known = ENDPOINTS.filter(part => !Object.hasOwn(raw, part)).map(part => points[part])
      .filter(value => present(value) && value >= 0 && value <= d);
    const reach = key === 'intro' ? Math.max(0, ...known) : d - Math.min(d, ...known);
    const width = Math.min(d, Math.max(span, Math.ceil(reach / 60) * 60));
    const range = !d ? [0, 1] : key === 'intro' ? [0, width] : [d - width, d];
    hint.textContent = d ? (key === 'intro' ? '前 ' : '末 ') + formatTime(width) : key === 'intro' ? '前 ' + formatTime(span) : '时长待获取';
    const locked = !allowed || !d;
    const anchor = key === 'intro' && points.start === 0 ? 'start' : key === 'outro' && rule.kind === 'tail' ? 'end' : null;
    const suggestions = Object.fromEntries(ENDPOINTS.filter(part => points[part] === undefined)
      .map(part => [part, suggestion(part)]));
    track.update({range, ...points, suggestions, anchor, locked, invalid: Boolean(issue)});
    if (tailStatus && match) {
      if (tailStatus.textContent !== match.text) tailStatus.textContent = match.text;
      tailStatus.parentElement.dataset.state = issue ? 'error' : match.state;
    }
    if (error.textContent !== issue) error.textContent = issue;
    error.hidden = !issue;
    if (endHint) {
      endHint.hidden = rule.kind !== 'tail';
      endHint.textContent = d ? 'End = 本集结尾 ' + formatTime(d) + ' · 换集自动适配' :
        'End 会在获取视频时长后跟随结尾';
    }
    for (const part of ENDPOINTS) {
      const input = inputs[part];
      input.disabled = locked;
      input.setAttribute('aria-invalid', String(Boolean(issue)));
      const value = raw[part] ?? (part !== 'end' || anchor !== 'end' ?
        d && present(points[part]) && points[part] >= 0 ? formatTime(points[part]) : '' : '');
      if (input.value !== value) input.value = value;
      const suggested = suggestions[part];
      input.placeholder = part === 'end' && anchor === 'end' ? 'End' : present(suggested) ? formatTime(suggested) : '分:秒';
      input.parentElement.dataset.endpointState = part === anchor ? 'bound-' + part : present(suggested) ? 'suggested' : '';
      const resetAvailable = !(key === 'intro' && part === 'start' && rule.kind === 'fixed' &&
        points.start === 0 && !Object.hasOwn(raw, part));
      clears[part].disabled = locked;
      clears[part].hidden = locked || !value.trim() || !resetAvailable;
    }
    takeStart.disabled = takeEnd.disabled = locked || !canMark;
    preview.disabled = locked || !canPreview;
  }
  return {render, dispose: track.dispose, reset() { raw = {}; details.open = false; }, clear(part) { delete raw[part]; }};
}
