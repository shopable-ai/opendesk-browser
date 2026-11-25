import {EMPTY, updateScope, readScope} from './rules.js';

const timingFields = ['intro', 'outro'];
const iyfWork = /^iyf:[a-zA-Z0-9_-]{1,48}$/;
const iyfEpisode = /^[a-zA-Z0-9_-]{1,48}$/;
const localId = '[a-z0-9][a-z0-9_-]{0,30}';
const localWork = new RegExp('^local:' + localId + ':' + localId + '$');
const localEpisode = new RegExp('^' + localId + '$');
const only = (value, keys) => value !== null && typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Object.keys(value).every(key => keys.includes(key));
const invalid = () => new TypeError('无效的账号片头片尾规则改动。');

// Business data only. The trusted caller must supply a verified media binding,
// explicit save intent and a current account session before sending anything.
export function projectAccountRuleChange({context, scope, before, after}) {
  const {seriesKey, episodeKey} = context;
  const target = scope === 'episode' ? {scope, seriesKey, episodeKey} : {scope, seriesKey};
  const changes = {};
  for (const field of timingFields) {
    const previous = Object.hasOwn(before, field) ? before[field] : undefined;
    const next = Object.hasOwn(after, field) ? after[field] : undefined;
    if (previous === next || previous && next && previous.kind === next.kind &&
        previous.start === next.start && previous.end === next.end &&
        previous.seconds === next.seconds && previous.enabled === next.enabled) continue;
    changes[field] = next === undefined ? {op: 'remove'} : {op: 'set', rule: next};
  }
  return Object.keys(changes).length ? parseAccountRuleChange({target, changes}) : null;
}

// Validate the wire value without accepting arbitrary tool-storage keys,
// extra metadata, or an account supplied by the caller.
export function parseAccountRuleChange(input) {
  if (!only(input, ['target', 'changes']) || !Object.hasOwn(input, 'target') ||
      !Object.hasOwn(input, 'changes')) throw invalid();
  const {target, changes} = input;
  if (!only(target, ['scope', 'seriesKey', 'episodeKey']) || !Object.hasOwn(target, 'scope') ||
      !Object.hasOwn(target, 'seriesKey') || typeof target.seriesKey !== 'string') throw invalid();
  const {scope, seriesKey} = target;
  const hasEpisode = Object.hasOwn(target, 'episodeKey');
  const episodeKey = hasEpisode ? target.episodeKey : undefined;
  const local = localWork.test(seriesKey);
  if (scope === 'episode') {
    if (typeof episodeKey !== 'string' || !(local ? localEpisode.test(episodeKey) :
      iyfWork.test(seriesKey) && iyfEpisode.test(episodeKey))) throw invalid();
  } else if (scope !== 'series' || !local || hasEpisode) throw invalid();
  if (!only(changes, timingFields) || !Object.keys(changes).length) throw invalid();

  const rules = {}, parsed = {};
  for (const [field, change] of Object.entries(changes)) {
    if (!only(change, ['op', 'rule']) || !Object.hasOwn(change, 'op')) throw invalid();
    const hasRule = Object.hasOwn(change, 'rule');
    if (change.op === 'set' && hasRule) rules[field] = change.rule;
    else if (change.op !== 'remove' || hasRule) throw invalid();
  }
  // Reuse the existing timing shape (fixed, tail, disabled and null).
  // Player duration and binding are still checked in the current save path.
  const context = {seriesKey, episodeKey: episodeKey ?? 'unused'};
  const clean = readScope(updateScope(EMPTY, context, scope, rules), context, scope);
  for (const field of Object.keys(changes)) {
    parsed[field] = Object.hasOwn(clean, field) ? {op: 'set', rule: clean[field]} : {op: 'remove'};
  }
  return {target: scope === 'episode' ? {scope, seriesKey, episodeKey} : {scope, seriesKey}, changes: parsed};
}
