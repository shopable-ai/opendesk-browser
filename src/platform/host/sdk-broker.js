import {FoundationError, invariant} from '../protocol.js';
import {decodeValue, encodeValue} from '../page-port/codec.js';
import {fields, validateSdkRequest} from '../../framework/sdk/registry.js';
import {legacyResult} from '../../framework/sdk/bridge.js';
import {createSdkService} from '../../framework/sdk/service.js';
import {createNetworkService} from '../chrome/network.js';
import {createNotificationService} from '../chrome/notifications.js';
import {createBackgroundServices} from '../chrome/background-services.js';

// This is a delegate of the unique broker. Identity, admission and receipts belong
// to its authority and storage; the page can supply neither context nor namespace.
export function createSdkBroker({authority, storage, api, fetchImpl = globalThis.fetch,
  clock = {now:()=>Date.now()}, logger = console, setTimer = setTimeout, clearTimer = clearTimeout}) {
  const pending = new Map();
  const authorize = (request, context) => context.authorize(request);
  const network = createNetworkService({fetchImpl, authorize, clock, networkInfoEnabled:false});
  const notifications = createNotificationService({api, authorize, iconUrl:api.runtime.getURL('icons/notification.png')});
  const background = createBackgroundServices({api, clock, fetchImpl, logger});
  const service = createSdkService({network, notifications, storage, background,
    device:{getAppId:context => storage.getAppId(context)}});
  function ready() {
    invariant(typeof storage.executeSdk === 'function' && typeof storage.getAppId === 'function',
      'E_RESOURCE_UNAVAILABLE', 'Shared SDK storage is unavailable');
  }
  async function execute(admission, request) {
    const {context} = admission;
    try {
      const result = await service.execute(request.method, request.args, context);
      invariant(result?.PageBrigeCode === 0 && Object.hasOwn(result, 'data'), 'E_SCHEMA', 'Invalid driver result');
      // Drivers commit storage effects and receipts atomically. Native drivers may
      // record a fact before post-authorization; final API value is recorded here.
      return await context.recordEffect(result.data);
    } catch (error) {
      await authority.failSdk(context, error);
      throw error;
    }
  }
  async function requestSdk(payload, sender) {
    ready();
    fields(payload, ['requestId','method','argsWire','deadlineAt'], ['requestId','method','argsWire','deadlineAt']);
    const request = validateSdkRequest({requestId:payload.requestId, method:payload.method,
      args:decodeValue(payload.argsWire), deadlineAt:payload.deadlineAt});
    const admission = await authority.admitSdk(request, sender);
    const {operation, context} = admission;
    let receipt = admission.receipt;
    if (!receipt) {
      invariant(operation.state !== 'effect_unknown' && operation.state !== 'dispatched' || pending.has(operation.opKey),
        'E_EFFECT_UNKNOWN', 'Dispatched SDK effect has no durable result; it cannot be repeated');
      if (operation.state === 'failed') throw new FoundationError(operation.deliveryError?.code || 'E_EFFECT_UNKNOWN',
        operation.deliveryError?.message || 'SDK request failed');
      let execution = pending.get(operation.opKey);
      if (!execution) {
        invariant(pending.size < 100, 'E_LIMIT', 'SDK short service concurrency limit');
        let timer;
        const timeout = Math.max(0,context.deadlineAt - clock.now());
        execution = Promise.race([execute(admission, request),new Promise((_,reject) => {
          timer = setTimer(() => reject(new FoundationError('E_DEADLINE','SDK hard service deadline exceeded')),timeout);
        })]).catch(async error => { await authority.failSdk(context,error); throw error; })
          .finally(() => clearTimer(timer));
        pending.set(operation.opKey, execution);
        execution.finally(() => { if (pending.get(operation.opKey) === execution) pending.delete(operation.opKey); }).catch(() => {});
      }
      receipt = await execution;
    }
    // A stored success is an effect fact, never an authority to deliver after a
    // grant/document fence or the original service deadline.
    try {
      await context.authorize();
      const response = {valueWire:encodeValue(legacyResult(decodeValue(receipt.valueWire)))};
      await authority.settleSdkDelivery(context);
      context.assertDispatch();
      return response;
    } catch (error) {
      await authority.settleSdkDelivery(context,error); throw error;
    }
  }
  return Object.freeze({
    async hello(payload, sender) { ready(); return authority.helloSdk(payload, sender); },
    request:requestSdk,
    dispose:() => notifications.dispose(),
    diagnostics:() => ({pending:pending.size,notifications:notifications.diagnostics()})
  });
}
