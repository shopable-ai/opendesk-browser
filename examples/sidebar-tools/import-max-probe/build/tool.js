/*! d3-array v3.2.4 — ISC
Copyright 2010-2023 Mike Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
*/
(() => {
  // examples/sidebar-tools/import-max-probe/vendor/d3-array-3.2.4/max.js
  function max(values, valueof) {
    let max2;
    if (valueof === void 0) {
      for (const value of values) {
        if (value != null && (max2 < value || max2 === void 0 && value >= value)) {
          max2 = value;
        }
      }
    } else {
      let index = -1;
      for (let value of values) {
        if ((value = valueof(value, ++index, values)) != null && (max2 < value || max2 === void 0 && value >= value)) {
          max2 = value;
        }
      }
    }
    return max2;
  }

  // examples/sidebar-tools/import-max-probe/src/main.js
  var { root } = globalThis.OpenDeskTool;
  var executions = Number(root.dataset.importExecutions || 0) + 1;
  root.dataset.importExecutions = String(executions);
  root.querySelector("#import-result").textContent = `Tool D3 max = ${max([1, 5, 3])}`;
  root.querySelector("#import-environment").textContent = `typeof chrome = ${typeof chrome}; typeof chrome.tabs = ${typeof globalThis.chrome?.tabs}; typeof page = ${typeof page}`;
  root.querySelector("#import-executions").textContent = `Executions in this iframe = ${executions}`;
})();
