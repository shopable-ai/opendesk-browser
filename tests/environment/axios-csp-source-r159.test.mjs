import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformPinnedAxiosBrowserSource as transform} from '../../scripts/axios-browser-csp.mjs';

test('pinned Axios browser-only Node Buffer reflection and class checks are removed before WXT, without verifier exceptions',async()=>{
  const utilPath='node_modules/axios/lib/utils.js';
  const headPath='node_modules/axios/lib/core/AxiosHeaders.js';
  const [utils,headers]=await Promise.all([readFile(utilPath,'utf8'),readFile(headPath,'utf8')]);
  const hardenedUtil=transform(utils,'/tmp/'+utilPath);
  const hardenedHeaders=transform(headers,'/tmp/'+headPath);
  assert(hardenedUtil.includes('function isBuffer(val) { return false; }'));
  assert(!hardenedUtil.includes('val.constructor'));
  assert(hardenedHeaders.includes('header instanceof AxiosHeaders'));
  assert(!hardenedHeaders.includes('header instanceof this.constructor'));
  assert.equal(transform(utils,'/tmp/node_modules/other/lib/utils.js'),null);
  assert.throws(()=>transform(utils.replace('val.constructor.isBuffer(val)','false'),'/tmp/'+utilPath),
    /probe drift/);
  assert.throws(()=>transform(headers.replace('header instanceof this.constructor','header instanceof Object'),'/tmp/'+headPath),
    /instance check drift/);
});
