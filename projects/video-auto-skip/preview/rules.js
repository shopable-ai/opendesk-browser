// Rules for the offline settings demo. Playback lives in the separate demo.
const durations = {3: 2700, 4: 2880, 5: null};
const timedRules = ['intro', 'outro'];
class PreviewRules {
  constructor() {
    this.episode = 3;
    this.scope = 'work';
    this.work = {
      intro: { enabled: false, mode: 'start', start: 0, end: null },
      outro: { enabled: false, mode: 'tail', tail: null, start: null, end: null },
      autoNext: false,
    };
    this.exceptions = new Map();
    this.load();
  }

  get duration() { return durations[this.episode]; }
  get exceptionsHere() { return this.exceptions.get(this.episode) || {}; }
  get dirty() { return this.changed.size > 0; }

  load() {
    this.base = this.scope === 'work' ? this.work : {...this.work, ...this.exceptionsHere};
    this.draft = structuredClone(this.base);
    this.changed = new Set();
    this.restored = new Set();
  }

  source(key) {
    if (this.scope === 'work') return Object.hasOwn(this.exceptionsHere, key) ? '本集另有设置' : '';
    if (this.willInherit(key)) return '保存后继承';
    if (Object.hasOwn(this.exceptionsHere, key)) return '本集例外';
    return this.changed.has(key) ? '保存为本集例外' : '继承当前季默认';
  }

  same(key, a, b) {
    if (key === 'autoNext') return a === b;
    return a.enabled === b.enabled && this.sameTime(a, b);
  }

  sameTime(a, b) {
    if (a.mode !== b.mode) return false;
    const fields = a.mode === 'start' ? ['end'] : a.mode === 'tail' ? ['tail'] : ['start', 'end'];
    return fields.every(field => Object.is(a[field], b[field]));
  }

  willInherit(key) { return this.restored.has(key) && this.same(key, this.draft[key], this.work[key]); }

  edit(key, patch) {
    const current = this.draft[key];
    const next = key === 'autoNext' ? patch : {...current, ...patch};
    if (this.same(key, current, next)) return;
    this.draft[key] = next;
    if (this.same(key, this.base[key], next) && !this.willInherit(key)) this.changed.delete(key); else this.changed.add(key);
  }

  restore(key) {
    if (this.scope !== 'episode' || !Object.hasOwn(this.exceptionsHere, key)) return;
    this.draft[key] = structuredClone(this.work[key]);
    this.restored.add(key);
    this.changed.add(key);
  }

  restoreIssue(key) {
    if (key === 'autoNext') return '';
    const issues = this.errors({...this.draft, [key]:this.work[key]});
    return issues[key]?.message || issues.general || '';
  }

  endpoint(key, field, rules = this.draft, duration = this.duration) {
    const row = rules[key];
    if (row.mode !== 'tail') return row[field];
    if (duration === null) return null;
    if (field === 'end') return duration;
    return row.tail === null ? null : duration - row.tail;
  }

  reference(key) {
    if (this.scope === 'work' && this.duration !== null && Object.hasOwn(this.exceptionsHere, key)) {
      const other = Object.entries(durations).find(([episode, duration]) => duration !== null && !Object.hasOwn(this.exceptions.get(Number(episode)) || {}, key));
      if (other) return {episode: Number(other[0]), duration: other[1]};
    }
    return {episode: this.episode, duration: this.duration};
  }

  time(key, field, seconds) {
    if (this.draft[key].mode === 'tail') {
      if (this.duration === null || field !== 'start') return;
      this.edit(key, {tail: seconds === null ? null : this.reference(key).duration - seconds});
    } else this.edit(key, {[field]: seconds});
  }

  mode(key, mode) {
    if (this.duration === null) return;
    const {duration} = this.reference(key);
    if (key === 'intro') this.edit(key, {mode, start: mode === 'start' ? 0 : this.draft.intro.start ?? 0});
    else if (mode === 'interval') this.edit(key, {mode, start: this.endpoint(key, 'start', this.draft, duration), end: duration});
    else this.edit(key, {mode, tail: this.draft.outro.start === null ? null : duration - this.draft.outro.start, start: null, end: null});
  }

  errors(rules = this.draft, duration = this.duration, includeDisabled = timedRules) {
    const errors = {}, active = [];
    for (const key of timedRules) {
      const row = rules[key];
      if ((!includeDisabled.includes(key) && !row.enabled) || (duration === null && row.mode === 'tail')) continue;
      const start = this.endpoint(key, 'start', rules, duration), end = this.endpoint(key, 'end', rules, duration);
      const fields = predicate => Object.entries({start, end}).filter(([, value]) => predicate(value)).map(([field]) => field);
      const invalid = fields(n => n !== null && (!Number.isSafeInteger(n) || n < 0));
      const outside = duration === null ? [] : fields(n => n > duration);
      const missing = fields(n => n === null);
      const issue = (message, at = ['start', 'end']) => { errors[key] = {message, fields: at}; };
      if (invalid.length) issue('请输入有效的非负时间，例如 01:30。', invalid);
      else if (outside.length) issue('时间不能超过本集时长。', outside);
      else if (row.enabled && missing.length) issue('开启跳过前，请设定时间。', missing);
      else if (start !== null && end !== null) {
        if (start >= end) issue('开始必须早于结束。');
        else if (row.enabled && start === 0 && end === duration) issue('该区间会跳过整集，请缩小范围。');
        else if (row.enabled) active.push({key, start, end});
      }
    }
    const [a, b] = active;
    if (b && a.start < b.end && b.start < a.end) errors.intro = errors.outro = {message:'片头与片尾区间重叠，请调整。', fields:['start','end']};
    else if (b && duration !== null && a.end - a.start + b.end - b.start >= duration) errors.general = '两段设置合计会跳过整集。';
    return errors;
  }

  validate() {
    const changes = timedRules.filter(key => this.changed.has(key));
    if (this.duration === null && changes.some(key => this.draft[key].enabled)) {
      return {general:'本集时长未知，暂不能启用或恢复跳过规则。'};
    }
    if (this.scope === 'episode') return this.errors();
    if (!changes.length) return {};
    // An override may mask a season rule, but must never mask an invalid draft value.
    for (const key of changes) {
      const rule = this.draft[key];
      const entries = rule.mode === 'tail' ? [['start', rule.tail]] : [['start', rule.start], ['end', rule.end]];
      const invalid = entries.filter(([, value]) => value !== null && (!Number.isSafeInteger(value) || (rule.mode !== 'tail' && value < 0))).map(([field]) => field);
      if (invalid.length) return {[key]:{message:'请输入有效的非负时间，例如 01:30。', fields:invalid}};
      const missing = entries.filter(([, value]) => value === null).map(([field]) => field);
      if (rule.enabled && missing.length) return {[key]:{message:'开启跳过前，请设定时间。', fields:missing}};
      if (rule.mode === 'tail' ? rule.tail !== null && rule.tail <= 0 : rule.end !== null && rule.start !== null && rule.start >= rule.end) {
        return {[key]:{message:rule.mode === 'tail' && rule.tail < 0 ? '时间不能超过本集时长。' : '开始必须早于结束。', fields:entries.map(([field]) => field)}};
      }
    }
    const episodes = Object.keys(durations).map(Number);
    const unverifiable = changes.find(key => (this.draft[key].enabled || !this.sameTime(this.draft[key], this.work[key])) && !episodes.some(episode =>
      durations[episode] !== null && !Object.hasOwn(this.exceptions.get(episode) || {}, key)));
    if (unverifiable) {
      const label = unverifiable === 'intro' ? '片头' : '片尾';
      return {general:'无法验证整季' + label + '时间：继承这项设置的集数时长未知。请确认时长，或取消这次时间修改。'};
    }
    for (const episode of [this.episode, ...episodes.filter(value => value !== this.episode)]) {
      const duration = durations[episode];
      const overrides = this.exceptions.get(episode) || {};
      // Even without a duration, two fixed ranges can overlap in the effective rules.
      const issues = this.errors({...this.draft, ...overrides}, duration, changes.filter(key => !Object.hasOwn(overrides, key)));
      const fields = Object.keys(issues);
      if (!fields.length) continue;
      if (episode === this.episode && fields.every(key => !Object.hasOwn(overrides, key))) return issues;
      const detail = issues.general || issues.intro?.message || issues.outro.message;
      // A season editor may display this other episode's duration. Preserve the
      // field feedback when the error belongs to the example the user is editing.
      const referenceIssues = Object.fromEntries(changes.filter(key => issues[key] && this.reference(key).episode === episode && !Object.hasOwn(overrides, key))
        .map(key => [key, issues[key]]));
      return {...referenceIssues, crossEpisode:'第 ' + String(episode).padStart(2, '0') + ' 集：' + detail};
    }
    return {};
  }

  episodeAlternative() {
    if (!this.validate().crossEpisode || [...this.changed].some(key => Object.hasOwn(this.exceptionsHere, key))) return null;
    const draft = {...this.work, ...this.exceptionsHere, ...Object.fromEntries([...this.changed].map(key => [key, this.draft[key]]))};
    return Object.keys(this.errors(draft)).length ? null : draft;
  }

  useEpisodeDraft() {
    const draft = this.episodeAlternative();
    if (!draft) return false;
    const changed = [...this.changed];
    this.scope = 'episode';
    this.load();
    for (const key of changed) this.edit(key, draft[key]);
    return true;
  }

  warning() {
    if (this.duration === null || Object.keys(this.validate()).length) return '';
    const covered = (rules, duration) => ['intro', 'outro'].reduce((sum, key) => rules[key].enabled ?
      sum + this.endpoint(key, 'end', rules, duration) - this.endpoint(key, 'start', rules, duration) : sum, 0);
    const affected = this.scope === 'work' ? Object.entries(durations).filter(([, duration]) => duration !== null) : [[String(this.episode), this.duration]];
    const [episode, percent] = affected.map(([episode, duration]) => [episode, covered(this.scope === 'work' ?
      {...this.draft, ...this.exceptions.get(Number(episode))} : this.draft, duration) / duration * 100]).sort((a, b) => b[1] - a[1])[0];
    if (percent < 80) return '';
    const amount = percent > 99 ? '超过 99%' : '约 ' + Math.round(percent) + '%';
    return '跳过范围占第 ' + episode.padStart(2, '0') + ' 集的' + amount + '。保存前请确认正片范围。';
  }

  save() {
    if (!this.dirty || Object.keys(this.validate()).length) return false;
    if (this.scope === 'work') this.work = structuredClone(this.draft);
    else {
      const overrides = {...this.exceptionsHere};
      for (const key of this.changed) {
        if (this.willInherit(key)) delete overrides[key];
        else overrides[key] = structuredClone(this.draft[key]);
      }
      if (Object.keys(overrides).length) this.exceptions.set(this.episode, overrides);
      else this.exceptions.delete(this.episode);
    }
    this.load();
    return true;
  }
}
