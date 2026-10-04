import {fail, fields, SDK_FILES} from '../../framework/sdk/registry.js';

export function checkLastError(api = globalThis.chrome) {
  const error = api?.runtime?.lastError;
  if (error) throw fail('E_CHROME', error.message);
}
export function chromeCall(api, owner, method, ...args) {
  if (typeof owner?.[method] !== 'function') return Promise.reject(fail('E_CAPABILITY', `Chrome ${method} unavailable`));
  return new Promise((resolve, reject) => {
    try { owner[method](...args, value => { try { checkLastError(api); resolve(value); } catch (error) { reject(error); } }); }
    catch (error) { reject(error.code ? error : fail('E_CHROME', error.message)); }
  });
}
// Fixed resource driver; target/permission ownership remains with the existing PagePort.
export function createTabsService({api = globalThis.chrome, authorize} = {}) {
  return Object.freeze({async injectFixed({target, file, world}, context) {
    if (!authorize) throw fail('E_PERMISSION');
    fields(target, ['tabId', 'documentIds'], ['tabId', 'documentIds']);
    if (!target || !Number.isInteger(target.tabId) || target.tabId < 0 || !Array.isArray(target.documentIds) ||
      target.documentIds.length !== 1 || typeof target.documentIds[0] !== 'string' ||
      !((file === SDK_FILES.relay && world === 'ISOLATED') || (file === SDK_FILES.main && world === 'MAIN')))
      throw fail('E_SCHEMA', 'Exact document and fixed world/resource required');
    await authorize({capability: 'sdk.inject', target, file, world, phase: 'pre'}, context);
    const result = await chromeCall(api, api.scripting, 'executeScript', {target, world, files: [file]});
    await authorize({capability: 'sdk.inject', target, file, world, phase: 'post'}, context);
    return result;
  }});
}
