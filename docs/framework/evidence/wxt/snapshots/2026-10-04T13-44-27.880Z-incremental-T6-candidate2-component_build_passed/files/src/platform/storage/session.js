import {invariant, canonical} from '../protocol.js';
import {encodeValue, decodeValue} from '../page-port/codec.js';
import {chromeCall} from '../chrome/tabs.js';

// The namespace/session are issued by the shared authority. Only values live in
// Chrome session storage; admission, receipts and results remain in the one IDB.
const adapters = new WeakMap();
export function createSessionTyped({api}) {
  const area = api?.storage?.session;
  invariant(area, 'E_RESOURCE_UNAVAILABLE', 'Native storage.session unavailable');
  if (adapters.has(area)) return adapters.get(area);
  const adapter = Object.freeze({async executeSdk(method, args, context) {
    invariant(['APPLOCAL_GETITEM', 'APPLOCAL_SETITEM', 'APPLOCAL_REMOVEITEM'].includes(method),
      'E_CAPABILITY', 'Unsupported session storage method');
    invariant(context?.namespace && context.browserSessionIncarnation &&
      typeof context.recordNativeReceipt === 'function' && typeof context.recordEffect === 'function',
    'E_OWNER', 'Session storage requires the original authority context');
    const key = `framework-session:${canonical([context.browserSessionIncarnation, context.namespace, args.key])}`;
    // Encode before admission so serialization failure cannot dispatch an effect.
    const wire = method === 'APPLOCAL_SETITEM' ? encodeValue(args.value) : undefined;
    await context.authorize({capability:'storage.session', phase:'pre'});
    context.assertDispatch?.();
    let value;
    if (method === 'APPLOCAL_GETITEM') {
      const result = await chromeCall(api, area, 'get', key);
      value = Object.hasOwn(result, key) ? decodeValue(result[key]) : undefined;
    } else if (method === 'APPLOCAL_SETITEM') await chromeCall(api, area, 'set', {[key]:wire});
    else await chromeCall(api, area, 'remove', key);
    await context.recordNativeReceipt({method, value});
    // Preserve the completed effect even if delivery is subsequently fenced.
    await context.recordEffect(value);
    await context.authorize({capability:'storage.session', phase:'post'});
    return value;
  }});
  adapters.set(area, adapter);
  return adapter;
}
