import {createWorkerPageProxy} from './page-proxy.js';
import {encodeValue, PageError} from '../../framework/control/value.js';

// Bundle this entry as a fixed classic script, fetch that packaged bundle in
// the extension host, then instantiate it as a Blob Worker in the opaque realm.
// AsyncFunction is captured and used ONLY here, never in host, sandbox or SW.
export function installControlWorker(scope) {
  'use strict';
  const AsyncBody = Object.getPrototypeOf(async function () {}).constructor;
  const apply = Reflect.apply, clone = structuredClone, freeze = Object.freeze;
  const NativePromise = Promise, then = Function.call.bind(Promise.prototype.then);
  const add = scope.addEventListener.bind(scope), remove = scope.removeEventListener.bind(scope);
  const ready = scope.postMessage.bind(scope), identity = freeze({url: scope.location.href, name: scope.name, origin: scope.origin});
  let bound = false;
  function bind(event) {
    if (bound || event.data?.kind !== 'bind' || event.ports.length !== 1) return;
    bound = true; remove('message', bind);
    const port = event.ports[0], send = port.postMessage.bind(port), start = port.start.bind(port);
    const addPort = port.addEventListener.bind(port), pin = freeze(clone(event.data.identity));
    const proxy = createWorkerPageProxy({port, identity: pin, revision: event.data.revision, target: event.data.target});
    let started = false;
    add('securitypolicyviolation', event => {
      if (event.isTrusted) send({kind: 'policy', runId: pin.runId, ownerEpoch: pin.ownerEpoch, directive: event.effectiveDirective, blockedURI: event.blockedURI, originalPolicy: event.originalPolicy});
    });
    addPort('message', ({data}) => {
      if (started || data?.kind !== 'execute' || data.runId !== pin.runId || data.ownerEpoch !== pin.ownerEpoch) return;
      started = true;
      function fail(error) {
        send({kind: 'error', runId: pin.runId, ownerEpoch: pin.ownerEpoch,
          error: {code: error?.code || 'E_CONTROL_EXECUTION', name: error?.name || 'Error', message: String(error?.message || error)}});
      }
      try {
        const body = new AsyncBody('page', 'params', 'axiosx', 'AppStorage', 'AppLocal', 'storage', data.body);
        const params = clone(data.params);
        then(NativePromise.resolve(apply(body, params, [proxy.page, params, proxy.services.axiosx, proxy.services.AppStorage, proxy.services.AppLocal, proxy.services.storage])), value => {
          try { send({kind: 'result', runId: pin.runId, ownerEpoch: pin.ownerEpoch, value: encodeValue(value)}); }
          catch (error) { fail(new PageError('E_VALUE_SERIALIZATION', error.message)); }
        }, fail);
      } catch (error) { fail(error); }
    });
    start(); send({kind: 'bound', runId: pin.runId, ownerEpoch: pin.ownerEpoch, identity});
  }
  add('message', bind); ready({kind: 'worker-ready'});
}

