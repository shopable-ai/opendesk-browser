// Only the extension's exact sender/document can request this fixed policy.
// It is not a web-page grant, and never authorizes storage, GM or browser APIs.
export function automaticSdkTargetOrigins(urlText, frameId) {
  let url;
  try { url = new URL(urlText); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  return frameId === 0 && url.protocol === 'http:' && url.hostname === '127.0.0.1' &&
    ['43111','43112'].includes(url.port) && url.pathname === '/demo-form.html'
    ? ['https://httpbingo.org','https://api.ipify.org'] : [];
}
