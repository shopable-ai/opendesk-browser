export const OFFICIAL_HOSTS = Object.freeze([
  'chatgpt.com',
  'platform.openai.com',
  'one.google.com',
  'aistudio.google.com',
  'admin.google.com'
]);

const hostSet = new Set(OFFICIAL_HOSTS);

export function assertOfficialUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new TypeError('Invalid URL');
  }

  if (url.protocol !== 'https:') throw new TypeError('Only HTTPS URLs are allowed');
  if (!hostSet.has(url.hostname)) throw new TypeError('Host is not on the official allowlist');
  if (url.username || url.password) throw new TypeError('URL credentials are not allowed');
  if (url.port && url.port !== '443') throw new TypeError('Non-standard ports are not allowed');

  return url.href;
}
