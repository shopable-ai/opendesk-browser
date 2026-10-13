/*! mitt 3.0.1 — MIT
MIT License

Copyright (c) 2021 Jason Miller

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
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
