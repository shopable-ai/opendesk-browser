// Plain website MAIN-world observations; no extension messages or configured values.
export const FIELDS = Object.freeze([
  ['userAgent', 'User-Agent', 'navigator.userAgent'],
  ['uaCH', 'UA Client Hints', 'navigator.userAgentData · 低熵'],
  ['platform', '兼容平台标识', 'navigator.platform · 旧接口'],
  ['language', '首选语言', 'navigator.language'],
  ['languages', '语言列表', 'navigator.languages · 完整有序数组'],
  ['timezone', '时区', 'Intl.DateTimeFormat'],
  ['viewport', '网页视口', 'innerWidth × innerHeight · CSS px'],
  ['screen', '屏幕读数', 'screen.width × screen.height · CSS px'],
  ['pixelRatio', '设备像素比', 'devicePixelRatio']
]);

function field(read) {
  try {
    const value = read();
    if (value === undefined || value === null) return {status:'unavailable', value:null};
    return {status:'available', value};
  } catch { return {status:'unavailable', value:null}; }
}

export function readEnvironment(win) {
  const nav = win.navigator;
  // Preserve this order: scalar-first exposes Chromium's stale languages-array cache.
  const language = field(() => nav.language);
  const languages = field(() => nav.languages == null ? null : [...nav.languages]);
  return {
    capturedAt:new Date().toISOString(),
    page:win.location.origin + win.location.pathname,
    fields:{
      userAgent:field(() => nav.userAgent),
      uaCH:field(() => nav.userAgentData ? {
        brands:nav.userAgentData.brands.map(({brand,version}) => ({brand,version})),
        mobile:nav.userAgentData.mobile, platform:nav.userAgentData.platform
      } : null),
      platform:field(() => nav.platform), language, languages,
      timezone:field(() => new win.Intl.DateTimeFormat().resolvedOptions().timeZone),
      viewport:field(() => ({width:win.innerWidth,height:win.innerHeight})),
      screen:field(() => ({width:win.screen.width,height:win.screen.height})),
      pixelRatio:field(() => win.devicePixelRatio)
    }
  };
}

export function comparison(current, baseline) {
  return FIELDS.map(([key,label,source]) => {
    const observed = current.fields[key], original = baseline.fields[key];
    const status = observed.status !== 'available' || original.status !== 'available'
      ? 'unavailable' : JSON.stringify(observed.value) === JSON.stringify(original.value)
        ? 'same' : 'changed';
    return {key,label,source,current:observed,baseline:original,status};
  });
}

export function languageCacheMismatch(snapshot) {
  const {language,languages} = snapshot.fields;
  return language.status === 'available' && languages.status === 'available' &&
    languages.value.length > 0 && language.value !== languages.value[0];
}
