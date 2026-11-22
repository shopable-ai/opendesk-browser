// Sidebar Tool localization is display-only. The Host owns locale preference and catalogs.
let translate = () => '';
const ISSUE_KEYS = Object.freeze({
  '请输入有效的时间，开始必须早于结束。': 'invalidTime',
  '本集时长未知，暂不能修改时间规则。': 'timeUnknownEdit',
  '请输入秒数或分:秒，例如 01:30。': 'timeFormat',
  '请填入开始和结束时间。': 'timeMissing',
  '时间不能超出本集时长。': 'timeOutside',
  '开始必须早于结束。': 'timeOrder',
  '该设置会跳过整集，请缩小范围。': 'timeWhole',
  '本集时长未知，暂不能启用时间规则。': 'validationDuration',
  '片头和片尾的区间不能重叠。': 'validationOverlap',
  '片头和片尾合计会跳过整集。': 'validationEntire',
});

export function createTranslator(catalog, locale) {
  const messages = catalog?.messages ?? {};
  const source = catalog?.sourceLocale ?? 'zh-CN';
  const names = Object.keys(messages);
  let selected = names.includes(locale) ? locale : source;
  if (!names.includes(locale)) {
    try {
      const language = new Intl.Locale(locale).language;
      const exact = names.find(name => name === language);
      const candidates = names.filter(name => new Intl.Locale(name).language === language);
      if (exact) selected = exact;
      else if (candidates.length === 1) selected = candidates[0];
    } catch { /* Unsupported locale: fall back to source. */ }
  }
  return (key, params = {}) => {
    const template = messages[selected]?.[key] ?? messages[source]?.[key] ?? '';
    if (typeof template !== 'string') return '';
    return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
      (_, name) => String(params[name] ?? '').slice(0, 180));
  };
}

export const t = (key, params) => translate(key, params);

export function localizeIssue(message) {
  if (!message) return '';
  const key = ISSUE_KEYS[message];
  if (key) return t(key) || message;
  const match = /^(片头|片尾)时间超出本集时长，或覆盖了整集。$/.exec(message);
  return match ? t('validationOutside', {name: t(match[1] === '片头' ? 'introName' : 'outroName')}) || message : message;
}

export function translateStatic(root) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-minutes]'))
    node.textContent = t('windowMinutes', {minutes: node.dataset.i18nMinutes});
  for (const [dataName, attribute] of [
    ['i18nAriaLabel', 'aria-label'], ['i18nAriaDescription', 'aria-description'],
    ['i18nPlaceholder', 'placeholder'], ['i18nTitle', 'title'],
  ]) {
    for (const node of root.querySelectorAll('[data-' + dataName.replace(/[A-Z]/g, value => '-' + value.toLowerCase()) + ']')) {
      node.setAttribute(attribute, t(node.dataset[dataName]));
    }
  }
}

export function bindI18n(tool, repaint) {
  // Exactly one offline-catalog marker; the existing official builder replaces it.
  let embedded;
  try { embedded = __OPENDESK_TOOL_MESSAGES__; } catch { embedded = null; } // Node tests have no build token.
  let active = true;
  const refresh = locale => {
    if (!active) return;
    const live = tool?.messages?.messages ? tool.messages : embedded;
    translate = createTranslator(live, locale ?? tool?.locale ?? live?.sourceLocale ?? 'zh-CN');
    repaint();
  };
  refresh(tool?.locale);
  const unsubscribe = tool?.onLocaleChange?.(refresh);
  return () => {
    active = false;
    if (typeof unsubscribe === 'function') unsubscribe();
  };
}
