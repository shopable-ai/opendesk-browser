// Trusted harness. User AsyncFunction has the global scope, never this closure.
(() => {
  'use strict';
  const AsyncBody = Object.getPrototypeOf(async function () {}).constructor;
  const apply = Reflect.apply;
  const freeze = Object.freeze;
  const clone = structuredClone;
  const identity = freeze({url: self.location.href, name: self.name, origin: self.origin});
  const NativePromise = Promise;
  const then = Function.call.bind(Promise.prototype.then);
  const add = self.addEventListener.bind(self);
  const remove = self.removeEventListener.bind(self);
  const pending = new Map();
  const get = pending.get.bind(pending), put = pending.set.bind(pending), del = pending.delete.bind(pending);
  let port, send, sequence = 0, started = false;
  const ready = self.postMessage.bind(self);
  function bind(event) {
    if (port || event.data?.kind !== 'bind' || event.ports.length !== 1) return;
    port = event.ports[0];
    send = port.postMessage.bind(port);
    remove('message', bind);
    const runId = event.data.runId;
    function rpc(method, args) {
      const id = ++sequence;
      return new NativePromise((resolve, reject) => {
        put(id, {resolve, reject});
        send({kind: 'operation', runId, id, method, args: clone(args)});
      });
    }
    const page = freeze({
      goto: url => rpc('goto', [url]), title: () => rpc('title', []), url: () => rpc('url', []),
      type: (selector, text) => rpc('type', [selector, text]), click: selector => rpc('click', [selector]),
      waitForSelector: selector => rpc('waitForSelector', [selector]),
      text: selector => rpc('text', [selector]), mark: value => rpc('mark', [value])
    });
    add('securitypolicyviolation', event => {
      if (event.isTrusted) send({kind: 'policy', runId, directive: event.effectiveDirective,
        blockedURI: event.blockedURI, originalPolicy: event.originalPolicy});
    });
    port.addEventListener('message', event => {
      const data = event.data;
      if (data.runId !== runId) return;
      if (data.kind === 'reply') {
        const waiter = get(data.id);
        if (!waiter) return;
        del(data.id);
        if (data.error) waiter.reject(data.error); else waiter.resolve(data.value);
      }
      if (data.kind !== 'execute' || started) return;
      started = true;
      try {
        const user = new AsyncBody('page', 'params', '"use strict";\n' + data.body);
        // Calling the captured native then protects settlement from global patches.
        then(apply(user, undefined, [page, clone(data.params)]),
          value => {
            try { send({kind: 'result', runId, value: clone(value)}); }
            catch { send({kind: 'error', runId, error: {name: 'DataCloneError', message: 'Result cannot be serialized'}}); }
          },
          error => send({kind: 'error', runId, error: {name: error?.name || 'Error', message: error?.message || 'User function rejected'}}));
      } catch (error) {
        send({kind: 'error', runId, error: {name: error.name, message: error.message}});
      }
    });
    port.start();
    send({kind: 'bound', runId, identity});
  }
  add('message', bind);
  ready({kind: 'worker-ready'});
})();
