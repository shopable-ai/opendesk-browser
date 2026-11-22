import {cleanRules, RULES_KEY} from './rules.js';

export const WORK_INDEX_KEY = 'work-index.v1';
const keyPattern = /^[a-z0-9][a-z0-9._:-]{0,95}$/i;
const control = /[\u0000-\u001f\u007f]/;
const isRecord = value => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const hasOnly = (obj, keys) => isRecord(obj) && Object.keys(obj).every(key => keys.includes(key));
const invalid = () => new TypeError('作品名称索引格式不受支持。');
const sourceFor = key => key.startsWith('iyf:') ? {siteId: 'iyf', titleSource: 'iyf.video-detail'} :
  key.startsWith('local:') ? {siteId: 'local', titleSource: 'local.fixture'} : null;

// The index is intentionally independent of rules.v1. Names are never rule identities.
export function cleanWorkIndex(value) {
  if (value == null) return {works: {}};
  if (!hasOnly(value, ['works']) || !isRecord(value.works)) throw invalid();
  return {works: Object.fromEntries(Object.entries(value.works).map(([key, work]) => {
    const source = sourceFor(key);
    if (!keyPattern.test(key) || !source ||
        !hasOnly(work, ['seriesKey', 'displayTitle', 'siteId', 'titleSource', 'updatedAt']) ||
        Object.keys(work).length !== 5 || work.seriesKey !== key ||
        work.siteId !== source.siteId || work.titleSource !== source.titleSource ||
        typeof work.displayTitle !== 'string' || work.displayTitle !== work.displayTitle.trim() ||
        !work.displayTitle || work.displayTitle.length > 100 || control.test(work.displayTitle) ||
        !Number.isSafeInteger(work.updatedAt) || work.updatedAt < 0) throw invalid();
    return [key, {...work}];
  }))};
}

export function hasSavedWork(rules, seriesKey) {
  const work = rules?.series && Object.hasOwn(rules.series, seriesKey) ? rules.series[seriesKey] : null;
  return Boolean(work && (Object.keys(work.defaults).length ||
    Object.values(work.episodes).some(episode => Object.keys(episode).length)));
}

export function workIdentity(context, observedAt = Date.now()) {
  const key = context?.seriesKey;
  if (typeof key !== 'string' || !keyPattern.test(key) || !Number.isSafeInteger(observedAt) || observedAt < 0) return null;
  const source = sourceFor(key);
  const displayTitle = typeof context?.title === 'string' ? context.title.trim().normalize('NFC') : '';
  if (!source || !displayTitle || displayTitle.length > 100 || control.test(displayTitle)) return null;
  return {seriesKey: key, displayTitle, ...source, updatedAt: observedAt};
}

const sameTitle = (left, right) => Boolean(left && right && left.seriesKey === right.seriesKey &&
  left.displayTitle === right.displayTitle && left.siteId === right.siteId &&
  left.titleSource === right.titleSource);
const state = value => ({state: value});
const errorCode = error => typeof error?.code === 'string' ? error.code : '';
const quotaCodes = new Set(['E_HOST_STORAGE_QUOTA', 'E_TOOL_DATA_LIMIT', 'E_TOOL_LIMIT']);

// Keep the auxiliary index compact after the last rule is removed. This never
// deletes or changes rules.v1; a concurrent new save can safely backfill later.
async function removeOrphanTitle(storage, seriesKey) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const rules = cleanRules((await storage.get({key: RULES_KEY})).value);
      if (hasSavedWork(rules, seriesKey)) return state('unknown');
      const before = await storage.get({key: WORK_INDEX_KEY, withEtag: true});
      if (typeof before?.etag !== 'string') return state('unknown');
      const index = cleanWorkIndex(before.value);
      if (!Object.hasOwn(index.works, seriesKey)) return state('no-rules');
      const works = {...index.works};
      delete works[seriesKey];
      const verify = async () => {
        try {
          const after = cleanWorkIndex((await storage.get({key: WORK_INDEX_KEY})).value);
          return Object.hasOwn(after.works, seriesKey) ? state('unknown') : state('removed');
        } catch { return state('unknown'); }
      };
      try {
        const receipt = await storage.set({key: WORK_INDEX_KEY, value: {works}, ifMatch: before.etag});
        if (receipt?.state === 'conflict') continue;
        return await verify();
      } catch (error) {
        if (errorCode(error) === 'E_STORAGE_CONFLICT') continue;
        if (quotaCodes.has(errorCode(error))) return state('quota');
        return await verify();
      }
    } catch { return state('unknown'); }
  }
  return state('conflict');
}

// Best effort: the authority to save rules is independent of title metadata.
// A failed/unknown title write must NEVER overwrite or roll back rule data.
export async function ensureWorkTitle(storage, context, observedAt = Date.now()) {
  const candidate = workIdentity(context, observedAt);
  if (!candidate) return state('invalid-title');
  try {
    const savedRules = cleanRules((await storage.get({key: RULES_KEY})).value);
    if (!hasSavedWork(savedRules, candidate.seriesKey)) return removeOrphanTitle(storage, candidate.seriesKey);
  } catch { return state('unknown'); }

  const readback = async () => {
    try {
      const after = cleanWorkIndex((await storage.get({key: WORK_INDEX_KEY})).value);
      return sameTitle(after.works[candidate.seriesKey], candidate) ? state('saved') : state('unknown');
    } catch { return state('unknown'); }
  };

  // Only a confirmed CAS rejection may be retried. Unknown outcomes are read back,
  // never blindly replayed. Each conflict retry rechecks whether rules still exist.
  for (let attempt = 0; attempt < 2; attempt++) {
    let current;
    try {
      if (attempt) {
        const rules = cleanRules((await storage.get({key: RULES_KEY})).value);
        if (!hasSavedWork(rules, candidate.seriesKey)) return state('no-rules');
      }
      current = await storage.get({key: WORK_INDEX_KEY, withEtag: true});
      if (typeof current?.etag !== 'string') return state('unknown');
      const index = cleanWorkIndex(current.value);
      const old = index.works[candidate.seriesKey];
      if (sameTitle(old, candidate)) return state('saved');
      if (old && old.updatedAt > candidate.updatedAt) return state('newer-existing');
      const next = {works: {...index.works, [candidate.seriesKey]: candidate}};
      try {
        const receipt = await storage.set({key: WORK_INDEX_KEY, value: next, ifMatch: current.etag});
        if (receipt?.state === 'conflict') continue;
        if (receipt?.state === 'quota') return state('quota');
        return await readback();
      } catch (error) {
        if (errorCode(error) === 'E_STORAGE_CONFLICT') continue;
        if (quotaCodes.has(errorCode(error))) return state('quota');
        return await readback();
      }
    } catch { return state('unknown'); }
  }
  return state('conflict');
}
