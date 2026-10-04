// Fixed opaque sandbox entry. Only the creating extension host transfers a port.
(() => {
  'use strict';
  const NativeWorker = Worker, Channel = MessageChannel;
  const createURL = URL.createObjectURL.bind(URL), revokeURL = URL.revokeObjectURL.bind(URL);
  const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
  const extensionOrigin = 'chrome-extension://' + location.host;
  const urls = new Set(), probes = new Set(); let host, current;
  const parentWindow = parent;
  let parentAccess = false; try { void parentWindow.document; parentAccess = true; } catch {}
  parentWindow.postMessage({kind: 'sandbox-ready', origin: self.origin, extensionAPI: !!globalThis.chrome?.runtime?.id, parentAccess}, '*');
  function loadURL(url) {
    return new Promise(resolve => {
      const started = performance.now(); let worker, timer;
      function finish(value) {
        clearTimeout(timer); if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); probes.delete(worker); }
        resolve({...value, url, creatingOrigin: self.origin, startedMonoMs: started, observedMonoMs: performance.now()});
      }
      try {
        worker = new NativeWorker(url, {name: 'OpenDesk-resource-observation'}); probes.add(worker);
        timer = setTimeout(() => finish({loaded: false, timeout: true}), 2000);
        worker.onmessage = ({data}) => finish({loaded: data?.kind === 'worker-ready', message: data});
        worker.onerror = event => { event.preventDefault(); finish({loaded: false, error: event.message || 'Cannot load revoked URL'}); };
      } catch (error) { finish({loaded: false, error: error.message}); }
    });
  }
  async function cleanup(reason) {
    const owner = current; if (!owner) return; current = undefined;
    owner.worker.onmessage = null; owner.worker.onerror = null; owner.channel.port1.onmessage = null;
    const terminateMonoMs = performance.now(), terminateAt = Date.now(); owner.terminate();
    owner.channel.port1.close(); owner.channel.port2.close(); revokeURL(owner.url); urls.delete(owner.url);
    const revokedMonoMs = performance.now(); let resources;
    if (owner.observeResources) resources = {positive: owner.positive, negative: await loadURL(owner.url), revokedMonoMs};
    host.postMessage({kind: 'retired', runId: owner.identity.runId, ownerEpoch: owner.identity.ownerEpoch, reason, url: owner.url,
      terminateAt, terminateMonoMs, retiredAt: Date.now(), resources, baseline: {workers: current ? 1 : 0, ports: current ? 2 : 0, blobURLs: urls.size, probeWorkers: probes.size}});
  }
  function bind(event) {
    if (host || event.source !== parentWindow || event.origin !== extensionOrigin || event.data?.kind !== 'bind-host' || event.ports.length !== 1) return;
    remove('message', bind); host = event.ports[0];
    host.onmessage = async ({data}) => {
      if (data.kind === 'retire') { if (current?.identity.runId === data.runId && current.identity.ownerEpoch === data.ownerEpoch) void cleanup(data.reason); return; }
      if (data.kind === 'reply') {
        if (current?.identity.runId === data.runId && current.identity.ownerEpoch === data.ownerEpoch) current.channel.port1.postMessage(data); return;
      }
      if (data.kind === 'execute') {
        if (current?.identity.runId === data.runId && current.identity.ownerEpoch === data.ownerEpoch && !current.executed) {
          current.executed = true; current.channel.port1.postMessage(data);
        } return;
      }
      if (data.kind === 'observe-resource') {
        const owner = current;
        if (owner?.identity.runId === data.runId && owner.identity.ownerEpoch === data.ownerEpoch && owner.observeResources && !owner.positive) {
          owner.positive = await loadURL(owner.url);
          host.postMessage({kind: 'resource-positive', runId: owner.identity.runId, ownerEpoch: owner.identity.ownerEpoch, url: owner.url, positive: owner.positive});
        } return;
      }
      if (data.kind !== 'start' || current || typeof data.workerSource !== 'string') return;
      const identity = Object.freeze(structuredClone(data.identity));
      const url = createURL(new Blob([data.workerSource], {type: 'text/javascript'})); urls.add(url);
      const worker = new NativeWorker(url, {name: 'OpenDesk-Control-' + identity.runId});
      const channel = new Channel(), owner = current = {identity, url, worker, channel, terminate: worker.terminate.bind(worker), observeResources: !!data.observeResources, executed: false};
      host.postMessage({kind: 'worker-created', runId: identity.runId, ownerEpoch: identity.ownerEpoch, url, name: 'OpenDesk-Control-' + identity.runId, origin: self.origin});
      worker.onerror = event => { event.preventDefault(); host.postMessage({kind: 'error', runId: identity.runId, ownerEpoch: identity.ownerEpoch,
        error: {code: 'E_CONTROL_EXECUTION', name: 'WorkerError', message: event.message}}); void cleanup('worker-error'); };
      worker.onmessage = ({data: message}) => {
        if (message?.kind !== 'worker-ready') { host.postMessage({kind: 'rejected-global', runId: identity.runId, ownerEpoch: identity.ownerEpoch}); return; }
        worker.onmessage = () => host.postMessage({kind: 'rejected-global', runId: identity.runId, ownerEpoch: identity.ownerEpoch});
        channel.port1.onmessage = ({data: message}) => {
          if (current !== owner || message?.runId !== identity.runId || message?.ownerEpoch !== identity.ownerEpoch) return;
          if (message.kind === 'bound' && (message.identity?.url !== url || message.identity?.name !== 'OpenDesk-Control-' + identity.runId || message.identity?.origin !== 'null')) { void cleanup('identity-mismatch'); return; }
          host.postMessage(message);
        };
        channel.port1.start(); worker.postMessage({kind: 'bind', identity, revision: data.revision, target: data.target}, [channel.port2]);
      };
    };
    host.start(); host.postMessage({kind: 'host-bound'});
  }
  add('message', bind);
})();
