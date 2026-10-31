import {getEnvironment} from '../environment';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isUiLocalePreference, resolveUiLocale, translate, type SupportedLocale, type UiLocalePreference, type TranslationKey, type TranslationParameters } from './locale';

type I18nContextType = {
  locale: SupportedLocale;
  preference: UiLocalePreference;
  setPreference: (value: UiLocalePreference) => Promise<void>;
  t: (key: TranslationKey, params?: TranslationParameters) => string;
};
const Context = createContext<I18nContextType | null>(null);
const STORAGE_KEY = 'uiLocale';

export function LocaleProvider({ children, titleKey = 'manifestTitle' }: { children: ReactNode; titleKey?: TranslationKey }) {
  const [preference, setSavedPreference] = useState<UiLocalePreference>('auto');
  const [hydrated, setHydrated] = useState(false);
  const environment = getEnvironment();
  const browserLanguage = environment.locale;
  const locale = resolveUiLocale(preference, browserLanguage);
  useEffect(() => {
    let mounted = true;
    // Only the independent UI preference is read. The proxy configuration is untouched.
    void environment.storage.local.get(STORAGE_KEY).then(items => {
      if (!mounted) return;
      setSavedPreference(isUiLocalePreference(items[STORAGE_KEY]) ? items[STORAGE_KEY] : 'auto');
    }).catch(() => {}).finally(() => { if (mounted) setHydrated(true); });
    const changed = (changes: { [key: string]: any }, area: string) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      const next = changes[STORAGE_KEY].newValue;
      setSavedPreference(isUiLocalePreference(next) ? next : 'auto');
    };
    environment.storage.onChanged.addListener(changed);
    return () => { mounted = false; environment.storage.onChanged.removeListener(changed); };
  }, [environment]);
  useEffect(() => { if (!environment.trusted) { document.documentElement.lang = locale; document.title = translate(locale, titleKey); } }, [environment, locale, titleKey]);
  const setPreference = useCallback(async (value: UiLocalePreference) => {
    await environment.storage.local.set({ [STORAGE_KEY]: value });
    setSavedPreference(value);
  }, [environment]);
  const t = useCallback((key: TranslationKey, params?: TranslationParameters) =>
    translate(locale, key, params), [locale]);
  const context = useMemo(() => ({ locale, preference, setPreference, t }), [locale, preference, setPreference, t]);
  if (!hydrated) return null;
  return <Context.Provider value={context}>{children}</Context.Provider>;
}
export function useI18n(): I18nContextType {
  const value = useContext(Context);
  if (!value) throw new Error('LocaleProvider is missing');
  return value;
}
