import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';
import zhTW from './locales/zh-TW.json';

export const supportedLocales = ['zh-CN', 'en', 'zh-TW'] as const;
export type SupportedLocale = typeof supportedLocales[number];
export type UiLocalePreference = SupportedLocale | 'auto';
export type TranslationKey = keyof typeof zhCN;
export type TranslationParameters = Record<string, string | number>;
const catalogs: Record<SupportedLocale, Record<TranslationKey, string>> = {
  'zh-CN': zhCN, 'en': en, 'zh-TW': zhTW
};
export function detectUiLocale(browserLanguage: string): SupportedLocale {
  const language = browserLanguage.trim().replace(/_/g, '-').toLowerCase();
  if (/^zh(-|$)/.test(language)) {
    return /^(zh-(tw|hk|mo|hant))(\b|-)/.test(language) ? 'zh-TW' : 'zh-CN';
  }
  return /^en(\b|-)/.test(language) ? 'en' : 'zh-CN';
}
export function isUiLocalePreference(value: unknown): value is UiLocalePreference {
  return value === 'auto' || supportedLocales.includes(value as SupportedLocale);
}
export function resolveUiLocale(preference: UiLocalePreference, browserLanguage: string): SupportedLocale {
  return preference === 'auto' ? detectUiLocale(browserLanguage) : preference;
}
export function translate(
  language: SupportedLocale,
  key: TranslationKey,
  params: TranslationParameters = {}
): string {
  const template = catalogs[language][key] ?? zhCN[key] ?? key;
  return template.replace(/\{([a-z][a-zA-Z0-9]*)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder);
}
export function formatLocaleNumber(language: SupportedLocale, value: number): string {
  return new Intl.NumberFormat(language).format(value);
}
export function formatLocaleDate(language: SupportedLocale, timestamp: number): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}
