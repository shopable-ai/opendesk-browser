import {createWorkerPageProxy} from './page-proxy.js';
import {PageError} from '../../framework/control/value.js';
import {encodeResultFrames} from '../../framework/control/result-transfer.js';

// Bundle this entry as a fixed classic script, fetch that packaged bundle in
// the extension host, then instantiate it as a Blob Worker in the opaque realm.
// AsyncFunction is captured and used ONLY here, never in host, sandbox or SW.
// A single isolated Worker supports async function main() and prior body scripts.
export function controllerProgramBody(sourceUtf8) {
  if (typeof sourceUtf8 !== 'string') throw new TypeError('Controller source must be text');
  // Legacy scripts with a top-level return complete before the epilogue.
  // A declared main() receives page/params as lexical globals and its
  // returned value becomes the run result without a second execution engine.
  return `${sourceUtf8}\n; if (typeof main !== 'undefined') { if (typeof main !== 'function') throw new TypeError('main must be a function'); return await main(); }`;
}
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
    // One immutable capability facade in this owned Worker realm. Keep the
    // audited dynamic compiler signature and admitted source body unchanged.
    Object.defineProperty(scope, 'ctx', {value: proxy.scriptContext});
    let started = false;
    add('securitypolicyviolation', event => {
      if (event.isTrusted) send({kind: 'policy', runId: pin.runId, ownerEpoch: pin.ownerEpoch, directive: event.effectiveDirective, blockedURI: event.blockedURI, originalPolicy: event.originalPolicy});
    });
    addPort('message', ({data}) => {
      if (started || data?.kind !== 'execute' || data.runId !== pin.runId || data.ownerEpoch !== pin.ownerEpoch) return;
      started = true;
      function fail(error) {
        send({kind: 'error', runId: pin.runId, ownerEpoch: pin.ownerEpoch,
          error: {code: error?.code || 'E_CONTROL_EXECUTION', name: error?.name || 'Error', message: String(error?.message || error),
            ...(typeof error?.stack === 'string' ? {stack:error.stack.slice(0,4096)} : {})}});
      }
      try {
        data.body = controllerProgramBody(data.body);
        const body = new AsyncBody('page', 'params', 'axiosx', 'AppStorage', 'AppLocal', 'storage', data.body);
        const params = clone(data.params);
        then(NativePromise.resolve(apply(body, params, [proxy.page, params, proxy.services.axiosx, proxy.services.AppStorage, proxy.services.AppLocal, proxy.services.storage])), value => {
          try {
            // Large final values are transported in ordered, bounded private
            // frames. This does not change page.content() or normal RPC budgets.
            for (const frame of encodeResultFrames(value))
              send({runId:pin.runId,ownerEpoch:pin.ownerEpoch,...frame});
          } catch (error) { fail(error); }
        }, fail);
      } catch (error) { fail(error); }
    });
    start(); send({kind: 'bound', runId: pin.runId, ownerEpoch: pin.ownerEpoch, identity});
  }
  add('message', bind); ready({kind: 'worker-ready'});
}
