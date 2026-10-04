import {fail} from './sdk/registry.js';
export const CustomChromeEvt = 'chromeCustomEvt';
export const CHROME_PAGE_EXECUTE = 'CHROME_PAGE_EXECUTE';
export const CHROME_BRIDGE_INTERFACE = 'CHROME_BRIDGE_INTERFACE';
export const EVENT_OPERATE = Object.freeze({SCRIPT_RUN: 'SCRIPT_RUN', SCRIPT_STOP: 'SCRIPT_STOP',
  SCRIPT_RUN_BY_API: 'SCRIPT_RUN_BY_API', SCRIPT_STOP_BY_API: 'SCRIPT_STOP_BY_API',
  DEVICE_USER_INFO: 'OPERATE_DEVICE_USER_INFO', DEVICE_USER_INFO_UNBIND: 'OPERATE_DEVICE_USER_INFO_UNBIND', DEVICE_INFO: 'OPERATE_DEVICE_INFO'});
export function dispatchFrameworkEvent(event, payload, runHost) {
  if ([EVENT_OPERATE.DEVICE_USER_INFO, EVENT_OPERATE.DEVICE_USER_INFO_UNBIND, EVENT_OPERATE.DEVICE_INFO, CustomChromeEvt].includes(event))
    throw fail('E_SERVICE_UNSUPPORTED', 'Device/business event is outside the framework service registry');
  if (!runHost) throw fail('E_CAPABILITY', 'Script lifecycle requires RunHost');
  if ([EVENT_OPERATE.SCRIPT_RUN, EVENT_OPERATE.SCRIPT_RUN_BY_API].includes(event)) return runHost.start(payload);
  if ([EVENT_OPERATE.SCRIPT_STOP, EVENT_OPERATE.SCRIPT_STOP_BY_API].includes(event)) return runHost.stop(payload);
  throw fail('E_SERVICE_UNSUPPORTED');
}
