export const RULES_KEY = 'rules.v1';
const entries = ['intro', 'outro', 'next'];
const keyPattern = /^[a-z0-9][a-z0-9._:-]{0,95}$/i;
export const EMPTY = Object.freeze({series: Object.freeze({})});

const isRecord = value => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const validKey = value => typeof value === 'string' && keyPattern.test(value);
const hasOnly = (obj, keys) => isRecord(obj) && Object.keys(obj).every(key => keys.includes(key));
const validTime = t => Number.isFinite(t) && t >= 0 && t <= Number.MAX_SAFE_INTEGER;
const invalid = () => new TypeError('已保存的连播规则格式不受支持。');

function cleanScope(rules) {
  if (!hasOnly(rules, entries)) throw invalid();
  const result = {};
  for (const key of entries) {
    if (!Object.hasOwn(rules, key)) continue;
    const rule = rules[key];
    if (key === 'next') {
      if (typeof rule !== 'boolean') throw invalid();
      result[key] = rule;
    } else if (rule === null) result[key] = null;
    else if (rule?.kind === 'fixed' && hasOnly(rule, ['kind', 'start', 'end']) &&
      validTime(rule.start) && validTime(rule.end) && rule.start < rule.end) {
      result[key] = {kind: 'fixed', start: rule.start, end: rule.end};
    } else if (key === 'outro' && rule?.kind === 'tail' && hasOnly(rule, ['kind', 'seconds']) &&
      validTime(rule.seconds) && rule.seconds > 0) result[key] = {kind: 'tail', seconds: rule.seconds};
    else throw invalid();
  }
  return result;
}

export function cleanRules(value) {
  if (value == null) return EMPTY;
  if (!hasOnly(value, ['series']) || !Object.hasOwn(value, 'series') || !isRecord(value.series)) throw invalid();
  const series = Object.entries(value.series).map(([key, work]) => {
    if (!validKey(key) || !hasOnly(work, ['defaults', 'episodes']) || !isRecord(work.episodes)) throw invalid();
    const episodes = Object.fromEntries(Object.entries(work.episodes).map(([episode, rules]) => {
      if (!validKey(episode)) throw invalid();
      return [episode, cleanScope(rules)];
    }));
    return [key, {defaults: cleanScope(work.defaults), episodes}];
  });
  return {series: Object.fromEntries(series)};
}

function own(obj, key) { return Object.hasOwn(obj, key) ? obj[key] : undefined; }
function workAt(data, loc) {
  return own(data.series, loc.seriesKey) ?? {defaults: {}, episodes: {}};
}

export function readScope(data, loc, scope) {
  const work = workAt(data, loc);
  if (scope === 'series') return work.defaults;
  if (scope === 'episode') return own(work.episodes, loc.episodeKey) ?? {};
  throw new TypeError('无效规则范围。');
}

export function resolveRules(data, loc) {
  return {...readScope(data, loc, 'series'), ...readScope(data, loc, 'episode')};
}

export function updateScope(data, loc, scope, rules) {
  if (!validKey(loc?.seriesKey) || !validKey(loc?.episodeKey)) throw new TypeError('无法确定当前作品与剧集。');
  const target = cleanScope(rules);
  const old = workAt(data, loc);
  const work = {defaults: old.defaults, episodes: {...old.episodes}};
  if (scope === 'series') work.defaults = target;
  else if (scope !== 'episode') throw new TypeError('无效规则范围。');
  else if (Object.keys(target).length) work.episodes = {...work.episodes, [loc.episodeKey]: target};
  else delete work.episodes[loc.episodeKey];
  const series = {...data.series, [loc.seriesKey]: work};
  if (!Object.keys(work.defaults).length && !Object.keys(work.episodes).length) delete series[loc.seriesKey];
  return {series};
}

export function resolveInterval(rule, duration) {
  if (!rule || !Number.isFinite(duration) || duration <= 0) return null;
  let start, end;
  if (rule.kind === 'fixed') ({start, end} = rule);
  else if (rule.kind === 'tail') { start = duration - rule.seconds; end = duration; }
  if (!validTime(start) || !validTime(end) || end > duration || start >= end || (start === 0 && end === duration)) return null;
  return {start, end};
}

export function validateRules(rules, duration) {
  try { cleanScope(rules); } catch { return '请输入有效的时间，开始必须早于结束。'; }
  const labels = {intro: '片头', outro: '片尾'};
  const intervals = [];
  for (const key of ['intro', 'outro']) {
    const rule = rules[key];
    if (!rule) continue;
    if (!Number.isFinite(duration) || duration <= 0) return '本集时长未知，暂不能启用时间规则。';
    const interval = resolveInterval(rule, duration);
    if (!interval) return labels[key] + '时间超出本集时长，或覆盖了整集。';
    intervals.push(interval);
  }
  const [a, b] = intervals;
  if (b && a.start < b.end && b.start < a.end) return '片头和片尾的区间不能重叠。';
  if (b && Math.min(a.start, b.start) === 0 && Math.max(a.end, b.end) === duration &&
      (a.end === b.start || b.end === a.start)) return '片头和片尾合计会跳过整集。';
  return null;
}
