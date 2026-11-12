import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';

test('fixed ChatGPT Content admits reviewed app sources and excludes packaged Task sources',async()=>{
  const {metafile}=await build({entryPoints:['src/entrypoints/chatgpt-fixed-bridge.js'],
    bundle:true,write:false,metafile:true,format:'iife',platform:'browser',logLevel:'silent'});
  const inputs=Object.keys(metafile.inputs);
  // The build gate reviews dependency inputs, including tree-shaken modules.
  // Only the original SW installer may import these immutable package bytes.
  assert.deepEqual(inputs.filter(path=>path.startsWith('examples/tasks/')),[]);
  assert.ok(!inputs.includes('src/platform/tasks/builtin-releases.js'));
  const appInputs=inputs.filter(path=>path.startsWith('projects/'));
  assert.ok(appInputs.includes('projects/webflow/src/task-intent-contract.js'));
  const result=describeBundle({chunk:{fileName:'agents/chatgpt-fixed-bridge.js',
    modules:Object.fromEntries(appInputs.map(path=>[resolve(path),{
      renderedLength:1,originalLength:metafile.inputs[path].bytes
    }]))},lock:{packages:{}}});
  assert.ok(result.modules.every(row=>/^[0-9a-f]{40}$/.test(row.reviewedFirstPartyBlob)));
});
