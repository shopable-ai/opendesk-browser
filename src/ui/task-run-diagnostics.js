import {USER_SCRIPTS_RECOVERY_GUIDE} from './user-scripts-access.js';

// Presentation-only helpers. The durable RunHost/Task result remains authoritative.
// Never infer native effects, source positions or retry safety from a UI error.
const MAX_RESULT_CHARS = 4096;
const MAX_ERROR_CHARS = 320;
const SECRET_FIELD = /(?:password|passwd|secret|token|cookie|authorization|api[_-]?key|credential|private[_-]?key)/i;
const EFFECT_UNCERTAIN = '网页操作是否生效尚未确认。请先检查目标网页和运行记录，不要直接重复执行。';

function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}\n…（内容已截断，请查看原始持久结果）` : text;
}

function redact(value) {
  return String(value ?? '')
    // An exception can contain a complete request URL; do not echo its query/fragment.
    .replace(/https?:\/\/[^\s"'<>]+/gi, match => {
      try {
        const url = new URL(match);
        return `${url.origin}${url.pathname}${url.search || url.hash ? '?[参数已隐藏]' : ''}`;
      } catch { return '[网址已隐藏]'; }
    })
    // Credentials can be space-separated (Basic) or contain semicolon-separated cookie values.
    // Consume the rest of the header line rather than leaking the second value.
    .replace(/\b(?:proxy[-_]?authorization|authorization|set-cookie|cookie)\s*[:=][^\r\n]*/gi,
      match => `${match.split(/[:=]/, 1)[0]}=[已隐藏]`)
    .replace(/\b(Bearer|Basic)\s+[^\s"'<>]+/gi, '$1 [已隐藏]')
    .replace(/\b(?:password|passwd|secret|token|api[_-]?key|authorization|cookie)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi,
      match => `${match.split(/[:=]/, 1)[0]}=[已隐藏]`);
}

export function formatTaskValue(value) {
  if (value === undefined) return 'undefined';
  try {
    const json = JSON.stringify(value, (key, child) => {
      if (key && SECRET_FIELD.test(key)) return '[已隐藏]';
      return typeof child === 'string' ? redact(child) : child;
    }, 2);
    return clip(json ?? '结果无法直接显示', MAX_RESULT_CHARS);
  } catch {
    return '结果已持久保存，但包含无法在此处安全显示的内容。';
  }
}

export function formatTaskError(error) {
  const rawCode = typeof error?.code === 'string' ? error.code : '';
  const code = /^E_[A-Z0-9_]{1,60}$/.test(rawCode) ? rawCode : 'E_TASK';
  if (code === 'E_USER_SCRIPTS_UNAVAILABLE')
    return `浏览器未开放用户脚本执行能力（${code}）。\n建议：${USER_SCRIPTS_RECOVERY_GUIDE}\n只读取元素文本时也可以使用 page.locator('选择器').textContent()，无需此能力。`;
  const message = clip(redact(error?.message || '未收到可读的错误详情'), MAX_ERROR_CHARS);
  let advice = '请检查当前网页和任务配置；需要进一步排查时，展开“运行记录 → 技术信息”。';
  if (code === 'E_PAGE_CONTENT_TOO_LARGE')
    advice = '当前文档超过 8 MiB HTML 快照限制。建议用 page.locator() 或 page.evaluate() 在页面端提取必要信息，不要直接传输超大整页 HTML。';
  else if (code === 'E_PAGE_CONTENT_BUSY' || code === 'E_PAGE_CONTENT_EXPIRED' || code === 'E_PAGE_CONTENT_SEQUENCE')
    advice = 'HTML 快照已过期、占用或读取顺序不符；请重新开始分块读取，勿复用旧快照。';
  else if (code === 'E_VALUE_SERIALIZATION' && /Wire byte budget exceeded/i.test(message))
    advice = '脚本最终返回值超出支持的结果传输预算；page.content() 可读取完整 HTML，但 return 的大型对象仍需遵守持久化大小限制。请返回必要字段或摘要。';
  else if (/^E_(?:PERMISSION|PERMISSION_DENIED|GRANT|ORIGIN)/.test(code))
    advice = '检查浏览器网站权限、当前网页地址和任务允许的网站，再重新授权。';
  else if (/^E_(?:DOCUMENT|TARGET|TAB_|OWNER|HOST_CLOSED)/.test(code))
    advice = '页面或执行环境可能已经变化；确认网页仍然打开，并在当前页面重新选择任务。已发出的操作先核实结果。';
  else if (/^E_(?:LOCATOR|ELEMENT|SELECTOR|ROLE)/.test(code))
    advice = '检查网页元素是否仍存在、可见且可操作；开发者可更新 Locator 或等待条件。';
  else if (code === 'E_TIMEOUT' || code === 'E_EFFECT_UNKNOWN' || code === 'E_REQUEST_CONFLICT')
    advice = EFFECT_UNCERTAIN;
  else if (code === 'E_CANCELLED')
    advice = '已收到停止或取消信号。此前操作是否已经生效，应以网页和持久结果为准。';
  else if (/^E_(?:HTTP|NETWORK|FETCH|REQUEST_FAILED)/.test(code))
    advice = '检查网络连接、网站响应和任务网络授权；不要在未确认结果前盲目重试写入操作。';
  else if (code === 'E_PARAMS' || code === 'E_SCHEMA')
    advice = '检查必填项、输入范围及任务参数格式后再次运行。';
  return `${code}：${message}\n建议：${advice}`;
}

export function formatTaskRunTechnical(run, result) {
  const revision = result?.revision || run?.revision || {};
  const sourceHash = result?.revision?.sourceHash || run?.revision?.sourceHash;
  const fields = [
    ['runId', run?.runId],
    ['resultId', result?.resultId],
    ['状态', run?.state],
    ['版本', revision.revision]
  ];
  if (/^[a-f0-9]{64}$/.test(sourceHash || '')) fields.push(['sourceHash', sourceHash]);
  const target = run?.target || {};
  const url = run?.startUrl || target.expectedUrl || target.url || target.allowedOrigin;
  if (url) {
    try { const address = new URL(url); fields.push(['目标网站', address.origin]); }
    catch { /* Do not invent or leak an untrusted URL. */ }
  }
  if (typeof target.documentId === 'string') fields.push(['documentId', target.documentId]);
  const code = result?.outcome?.error?.code;
  if (typeof code === 'string' && /^E_[A-Z0-9_]{1,60}$/.test(code)) fields.push(['原始错误码', code]);
  return fields.filter(([,value]) => value !== undefined && value !== null)
    .map(([key,value]) => `${key}：${clip(redact(value), 160)}`).join('\n');
}

export function unresolvedTaskRunMessage() {
  return `状态待确认：${EFFECT_UNCERTAIN}`;
}
