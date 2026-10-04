import {fail, httpUrl, fields} from '../../framework/sdk/registry.js';
import {chromeCall} from './tabs.js';

export function extractDomainFromUrl(url) {
  if (typeof url !== 'string') throw fail('E_SCHEMA');
  return new URL(httpUrl(/^https?:\/\//i.test(url) ? url : `http://${url}`)).hostname;
}
export function createCookieService({api = globalThis.chrome, authorize} = {}) {
  const permission = async (url, method, phase, context) => {
    if (!authorize) throw fail('E_PERMISSION');
    await authorize({capability: 'cookies', url: httpUrl(url), method, phase}, context);
  };
  async function getCookies(url, context) {
    url = httpUrl(url); await permission(url, 'get', 'pre', context);
    const cookies = await chromeCall(api, api.cookies, 'getAll', {url});
    if (!Array.isArray(cookies)) throw fail('E_CHROME', 'Missing native cookie read receipt');
    await permission(url, 'get', 'post', context);
    return cookies;
  }
  async function deleteCookiesByUrl(url, context) {
    const cookies = await getCookies(url, context);
    for (const cookie of cookies) {
      const cookieUrl = new URL(url); cookieUrl.pathname = cookie.path; cookieUrl.search = ''; cookieUrl.hash = '';
      await permission(cookieUrl.href, 'remove', 'pre', context);
      await chromeCall(api, api.cookies, 'remove', {url: cookieUrl.href, name: cookie.name, ...(cookie.storeId ? {storeId: cookie.storeId} : {})});
      await permission(cookieUrl.href, 'remove', 'post', context);
    }
  }
  async function setCookies(cookies, context) {
    if (!Array.isArray(cookies) || cookies.length > 100) throw fail('E_SCHEMA');
    // Validate the whole batch before producing any cookie side effect.
    const details = cookies.map(cookie => {
      fields(cookie, ['url', 'name', 'value', 'domain', 'path', 'secure', 'httpOnly', 'sameSite', 'expirationDate', 'session', 'storeId', 'hostOnly']);
      if (typeof cookie.name !== 'string' || typeof cookie.value !== 'string') throw fail('E_SCHEMA');
      const url = httpUrl(cookie.url ?? `${cookie.secure ? 'https' : 'http'}://${String(cookie.domain ?? '').replace(/^\./, '')}${cookie.path ?? '/'}`);
      const host = new URL(url).hostname;
      const domain = cookie.domain?.replace(/^\./, '');
      if (domain !== undefined && domain !== host) throw fail('E_SCHEMA', 'Cookie may not broaden authorized hostname');
      const item = {url, name: cookie.name, value: cookie.value};
      for (const name of ['path', 'secure', 'httpOnly', 'sameSite', 'storeId']) if (cookie[name] !== undefined) item[name] = cookie[name];
      if (cookie.domain !== undefined && cookie.hostOnly !== true) item.domain = cookie.domain;
      if (cookie.expirationDate !== undefined && cookie.session !== true) {
        if (!Number.isFinite(cookie.expirationDate)) throw fail('E_SCHEMA'); item.expirationDate = cookie.expirationDate;
      }
      if (cookie.name.startsWith('__Host-')) {
        if (new URL(url).protocol !== 'https:') throw fail('E_SCHEMA', '__Host- cookies require HTTPS');
        delete item.domain; item.path = '/'; item.secure = true;
      }
      return item;
    });
    for (const item of details) await permission(item.url, 'set', 'pre', context);
    for (const item of details) {
      await permission(item.url, 'set', 'pre', context);
      const receipt = await chromeCall(api, api.cookies, 'set', item);
      if (!receipt) throw fail('E_CHROME', 'Missing native cookie write receipt');
      await permission(item.url, 'set', 'post', context);
    }
  }
  return Object.freeze({getCookies, setCookies, deleteCookiesByUrl, extractDomainFromUrl});
}
