(() => {
  'use strict';
  const {root} = OpenDeskTool;
  const probe = globalThis.ImportClassicProbe;
  if (probe.order.join('>') !== 'mitt>second') throw Error('Classic dependency order mismatch');
  probe.order.push('main');
  const emitter = probe.create();
  let received, emits = 0;
  emitter.on('result', value => { received = value; emits++; });
  emitter.emit('result', 5);
  emitter.off('result');
  root.querySelector('#import-result').textContent = `Tool Classic mitt = ${received}`;
  root.querySelector('#import-order').textContent = `order = ${probe.order.join('>')}; emits = ${emits}`;
  const executions = Number(root.dataset.importExecutions || 0) + 1;
  root.dataset.importExecutions = String(executions);
  root.querySelector('#import-executions').textContent = `Executions in this iframe = ${executions}`;
  root.querySelector('#import-environment').textContent = `typeof chrome = ${typeof chrome}; typeof chrome.tabs = ${typeof globalThis.chrome?.tabs}; typeof page = ${typeof page}`;
})();
