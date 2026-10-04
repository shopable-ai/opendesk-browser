import {normalizeMethod, fail} from './registry.js';
import {legacyResult} from './bridge.js';

// Called only after the unique broker has authenticated/admitted/journaled the request.
// The injected context and storage service belong to that broker, never the page payload.
export function createSdkService({network, notifications, storage, device} = {}) {
  return Object.freeze({async execute(method, args, context) {
    args = normalizeMethod(method, args);
    let value;
    const httpMethod = {AXIOS_GET: 'GET', AXIOS_POST: 'POST', AXIOS_PUT: 'PUT', AXIOS_DELETE: 'DELETE'}[method];
    if (httpMethod) {
      if (!network) throw fail('E_RESOURCE_UNAVAILABLE');
      value = await network.request({method: httpMethod, ...args}, context);
    } else if (method.startsWith('APPSTORAGE_') || method.startsWith('APPLOCAL_') || method.startsWith('CHROME_LOCAL_')) {
      if (!storage?.executeSdk) throw fail('E_RESOURCE_UNAVAILABLE', 'Shared SDK storage adapter missing');
      value = await storage.executeSdk(method, args, context);
    } else if (method === 'CREATE_NOTIFY') {
      if (!notifications) throw fail('E_RESOURCE_UNAVAILABLE');
      value = await notifications.create(args, context);
    } else if (method === 'SERVER_CHECK') {
      if (!network) throw fail('E_RESOURCE_UNAVAILABLE');
      value = await network.checkServer(args, context);
    } else if (method === 'NETWORK_INFO_GET') {
      if (!network) throw fail('E_RESOURCE_UNAVAILABLE');
      value = await network.getIpInfo(args, context);
    } else if (method === 'DEVICE_GET_APP_ID') {
      if (!device?.getAppId) throw fail('E_RESOURCE_UNAVAILABLE', 'Shared atomic device namespace adapter missing');
      value = await device.getAppId(context);
    }
    return legacyResult(value);
  }});
}
