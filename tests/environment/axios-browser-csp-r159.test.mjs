// R15.9 pinned Axios 1.20.0 browser source normalization.
// Only reviewed upstream source shapes may change; no scanner/CSP weakening.
import test from 'node:test';
import assert from 'node:assert/strict';
import {transformPinnedAxiosBrowserSource} from '../../scripts/axios-browser-csp.mjs';

const headersSource=`class AxiosHeaders {
  set(header) { return header instanceof this.constructor; }
  concat(...targets) { return this.constructor.concat(this, ...targets); }
}`;
const probeSource=`function isBuffer(val) {
  return (
    val !== null &&
    !isUndefined(val) &&
    val.constructor !== null &&
    !isUndefined(val.constructor) &&
    isFunction(val.constructor.isBuffer) &&
    val.constructor.isBuffer(val)
  );
}`;

test('pinned AxiosHeaders browser wrapper does not read dynamic constructors',()=>{
  const source=headersSource.replace('return header instanceof this.constructor;', 'if (header instanceof this.constructor) return true;');
  const output=transformPinnedAxiosBrowserSource(source,'/repo/node_modules/axios/lib/core/AxiosHeaders.js');
  assert.equal(typeof output,'string');
  assert.match(output,/header instanceof AxiosHeaders/);
  assert.match(output,/return AxiosHeaders\.concat\(this, \.\.\.targets\)/);
  assert.doesNotMatch(output,/this\.constructor/);
  assert.throws(()=>transformPinnedAxiosBrowserSource(source.replace('return this.constructor.concat(this, ...targets);','return this.constructor.concat(this, ...unsafeTargets);'),'/repo/node_modules/axios/lib/core/AxiosHeaders.js'),/drift/);
  assert.throws(()=>transformPinnedAxiosBrowserSource('class AxiosHeaders {}','/repo/node_modules/axios/lib/core/AxiosHeaders.js'),/drift/);
});

test('pinned Browser Buffer reflection is disabled, and no unrelated module is touched',()=>{
  const output=transformPinnedAxiosBrowserSource(probeSource,'/repo/node_modules/axios/lib/utils.js');
  assert.match(output,/function isBuffer\(val\) \{ return false; \}/);
  assert.doesNotMatch(output,/val\.constructor/);
  assert.throws(()=>transformPinnedAxiosBrowserSource(probeSource.replace('val.constructor !== null','val.constructor != null'),'/repo/node_modules/axios/lib/utils.js'),/drift/);
  assert.equal(transformPinnedAxiosBrowserSource(headersSource,'/repo/node_modules/other/core/AxiosHeaders.js'),null);
  assert.equal(transformPinnedAxiosBrowserSource(probeSource,'/repo/node_modules/other/utils.js'),null);
});

test('pinned Axios Page worker probe is stripped instead of permitting importScripts',()=>{
  const workerProbe="const hasStandardBrowserWebWorkerEnv = (() => {\n  return (\n    typeof WorkerGlobalScope !== 'undefined' &&\n    // eslint-disable-next-line no-undef\n    self instanceof WorkerGlobalScope &&\n    typeof self.importScripts === 'function'\n  );\n})();";
  const source='const hasBrowserEnv=true;\\n'+workerProbe+'\\nexport {hasStandardBrowserWebWorkerEnv};';
  const output=transformPinnedAxiosBrowserSource(source,'/repo/node_modules/axios/lib/platform/common/utils.js');
  assert.match(output,/hasStandardBrowserWebWorkerEnv = false/);
  assert.doesNotMatch(output,/importScripts/);
  assert.throws(()=>transformPinnedAxiosBrowserSource(source.replace('self.importScripts','self["importScripts"]'),'/repo/node_modules/axios/lib/platform/common/utils.js'),/drift/);
  assert.equal(transformPinnedAxiosBrowserSource(source,'/repo/node_modules/another/lib/platform/common/utils.js'),null);
});
