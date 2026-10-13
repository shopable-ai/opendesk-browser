import max from '../vendor/d3-array-3.2.4/max.js';

const {root} = globalThis.OpenDeskTool;
const executions = Number(root.dataset.importExecutions || 0) + 1;
root.dataset.importExecutions = String(executions);
root.querySelector('#import-result').textContent = `Tool D3 max = ${max([1, 5, 3])}`;
root.querySelector('#import-environment').textContent = `typeof chrome = ${typeof chrome}; typeof chrome.tabs = ${typeof globalThis.chrome?.tabs}; typeof page = ${typeof page}`;
root.querySelector('#import-executions').textContent = `Executions in this iframe = ${executions}`;
