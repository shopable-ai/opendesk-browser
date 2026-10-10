// Native OpenDesk scheduling contract. A rule describes WHERE/WHEN a program
// runs, never which privileged browser services it may use. No metadata is
// generated, evaluated or treated as a user approval in this module.
// Chrome * scheme matches HTTP and HTTPS. This is a scheduling default, not an API grant.
export const DEFAULT_PAGE_MATCH_PATTERN = '*://*/*';
const names = ['matches','excludeMatches','runAt','allFrames','world'];
const timings = new Set(['document_start','document_end','document_idle']);
const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Keep the accepted HTTP(S) subset consistent with the legacy import adapter.
// Chrome match patterns are scheduling patterns, NOT exact network origins.
export function isPageMatchPattern(value) {
  if (typeof value !== 'string' || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  const match = /^(https?|\*):\/\/([^/]+)(\/.*)$/.exec(value);
  if (!match) return false;
  const authority = /^(\[[^\]]+\]|[^:]+)(?::(\*|[0-9]+))?$/.exec(match[2]);
  if (!authority || (authority[2] !== undefined && authority[2] !== '*' && Number(authority[2]) > 65535)) return false;
  const host = authority[1];
  if (host === '*') return true;
  const actual = host.startsWith('*.') ? host.slice(2) : host;
  if (!actual || actual.includes('*') || /[@#?]/.test(actual) || (host.startsWith('*.') && actual.startsWith('['))) return false;
  try { return new URL(`https://${actual}/`).hostname === actual.toLowerCase(); }
  catch { return false; }
}
export function validatePageProgramRules(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).some(key => !names.includes(key)) || names.some(key => !Object.hasOwn(value,key)))
    fail('E_PAGE_CONTRACT','页面运行设置字段不完整或含未知字段');
  if (value.world !== 'USER_SCRIPT')
    fail('E_WORLD_NOT_APPROVED','当前页内程序驱动使用 Chrome 隔离执行环境；执行环境不是能力授权');
  if (!timings.has(value.runAt) || typeof value.allFrames !== 'boolean')
    fail('E_PAGE_RULES','页面程序运行时机或 frame 范围无效');
  for (const list of [value.matches, value.excludeMatches]) {
    if (!Array.isArray(list) || list.length > 128 || Array.from(list).some(rule =>
        typeof rule !== 'string' || rule.length > 4096 || !isPageMatchPattern(rule)))
      fail('E_PAGE_MATCH','页面运行范围须为明确的 HTTP(S) 匹配规则');
    if (new Set(list).size !== list.length)
      fail('E_PAGE_RULES','页面运行范围不能含重复项');
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 64 * 1024)
    fail('E_PAGE_MATCH','页面运行设置超过 64 KiB');
  if (!value.matches.length) fail('E_PAGE_MATCH','自动运行需要明确的网页范围；普通 JavaScript 无需添加 @match 注释');
  return Object.freeze({matches:Object.freeze([...value.matches]),
    excludeMatches:Object.freeze([...value.excludeMatches]),runAt:value.runAt,
    allFrames:value.allFrames,world:value.world});
}

// Compatibility metadata is an INPUT adapter. Explicit settings do not bypass
// the adapter's unsupported-grant checks, nor silently override legacy intent.
export function resolvePageProgramRules(parsed, admission, explicitRules) {
  const rules = validatePageProgramRules(explicitRules === undefined ? admission.nativeOptions : explicitRules);
  if (parsed.hasHeader) {
    const native = admission.nativeOptions;
    if ((parsed.matches.length && !same(rules.matches,native.matches)) ||
        !same(rules.excludeMatches,native.excludeMatches) ||
        rules.runAt !== native.runAt || rules.allFrames !== native.allFrames)
      fail('E_PAGE_METADATA_RULES','兼容脚本声明与页面运行设置冲突；请明确迁移，不能静默扩大范围');
  }
  return rules;
}
