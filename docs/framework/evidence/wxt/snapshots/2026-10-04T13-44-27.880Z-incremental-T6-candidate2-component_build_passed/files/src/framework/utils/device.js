import {fail} from '../sdk/registry.js';
import {getFingerprint} from '../sdk/utils.js';
export const DeviceType = Object.freeze({BROWSER: 0, DESKTOP: 1, APP_H5: 2, ANDROID: 3, IOS: 4});
export const isElectron = (context = globalThis) => Boolean(context.process?.type);
export const isChromeExtension = (context = globalThis) => Boolean(context.chrome?.runtime?.id);
export function createDeviceUtils({call, navigator = globalThis.navigator, context = globalThis, extensionId = null, random = Math.random} = {}) {
  const getInfo = () => {
    if (isElectron(context)) throw fail('E_CAPABILITY', 'Native device information is unavailable');
    return {userAgent: navigator?.userAgent ?? '', platform: navigator?.platform ?? '', language: navigator?.language ?? '', online: navigator?.onLine ?? false};
  };
  const getBrowserInfo = userAgent => {
    if (typeof userAgent !== 'string') throw fail('E_SCHEMA');
    const browsers = [['Chrome Canary', /Chrome\/(\S+).*\s+Edg\//], ['Edge', /Edg\/(\S+)/],
      ['Chrome', /Chrome\/(\S+).*\s+Safari\//], ['Firefox', /Firefox\/(\S+)/], ['Safari', /Safari\/(\S+)/], ['IE', /MSIE (\S+);/]];
    for (const [name, regex] of browsers) { const match = userAgent.match(regex); if (match) return `${name} ${match[1]}`; }
    return userAgent;
  };
  const generateRandomString = length => {
    if (!Number.isInteger(length) || length < 0 || length > 4096) throw fail('E_SCHEMA');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({length}, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
  };
  const getAppId = async () => {
    if (!call) throw fail('E_CAPABILITY', 'Device namespace requires admitted transport');
    return call('DEVICE_GET_APP_ID', {});
  };
  return Object.freeze({getInfo, getBrowserInfo, getInfoStr: () => getBrowserInfo(getInfo().userAgent), generateRandomString,
    getAppId, getFingerprint, async getAppIdInfo() {
      // The optional extension ID is supplied only by the trusted packaged consumer.
      if (!extensionId) return {};
      const fingerId = await getFingerprint();
      return {type: DeviceType.BROWSER, chromeId: extensionId, appDeviceId: await getAppId(), fingerId};
    }});
}
export const UtilDevice = createDeviceUtils();
export default UtilDevice;
