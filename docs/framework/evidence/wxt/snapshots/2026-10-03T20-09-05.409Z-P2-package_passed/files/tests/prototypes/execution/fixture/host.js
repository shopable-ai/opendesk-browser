const report = {startedAt: new Date().toISOString(), cases: [], sandbox: null};
const render = () => { document.querySelector('#report').textContent = JSON.stringify(report, null, 2); };
const add = (id, status, details = {}) => { report.cases.push({id, status, ...details}); render(); };
const frame = document.querySelector('#sandbox');
let port;
const handshake = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('sandbox handshake timeout')), 10000);
  window.addEventListener('message', function receive(event) {
    if (event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.kind !== 'sandbox-ready') return;
    window.removeEventListener('message', receive);
    clearTimeout(timer);
    const channel = new MessageChannel();
    port = channel.port1;
    resolve(event.data);
    frame.contentWindow.postMessage({kind: 'bind-host', token: crypto.randomUUID()}, '*', [channel.port2]);
  });
});
async function positiveControl() {
  const worker = new Worker('worker-classic.js');
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('control Worker timeout')), 5000);
      worker.onmessage = event => { if (event.data.kind === 'worker-ready') { clearTimeout(timer); resolve(); } };
      worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
    });
    add('FIX-control-packaged-classic', 'PASS', {fixedResourceLoaded: true});
  } finally { worker.terminate(); }
}
(async () => {
  try {
    await positiveControl();
    const source = await (await fetch('worker-classic.js')).text();
    const baseURL = chrome.runtime.getURL('');
    frame.src = 'sandbox.html';
    report.sandbox = await handshake;
    add('EX08-opaque-sandbox', report.sandbox.extensionAPI === false && report.sandbox.parentAccess === false ? 'PASS' : 'FAIL', report.sandbox);
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('sandbox probe deadline')), 30000);
      port.onmessage = ({data}) => { if (data.kind === 'complete') { clearTimeout(timer); resolve(data); } };
      port.start();
      port.postMessage({kind: 'probe', source, baseURL, networkURL: new URLSearchParams(location.search).get('network')});
    });
    report.cases.push(...result.cases);
    report.sandbox.resourcesAfter = result.resourcesAfter;
    report.sandbox.cspViolations = result.cspViolations;
    port.close();
    frame.remove();
    add('EX08-host-resource-cleanup', 'PASS', {portClosed: true, frameRemoved: true});
  } catch (error) {
    add('FIX-unexpected-fixture-error', 'FAIL', {name: error.name, message: error.message, stack: error.stack});
    port?.close(); frame.remove();
  }
  report.finishedAt = new Date().toISOString();
  report.backendPrototypePassed = ['classic-package', 'module-package', 'classic-blob', 'module-blob'].every(id => report.cases.some(c => c.id === `EX08-${id}` && c.status === 'PASS'));
  render();
  window.__prototypeReport = report;
})();
