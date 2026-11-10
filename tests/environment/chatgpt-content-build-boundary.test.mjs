import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

test('fixed ChatGPT Content dependency graph excludes packaged Task sources',async()=>{
  const {metafile}=await build({entryPoints:['src/entrypoints/chatgpt-fixed-bridge.js'],
    bundle:true,write:false,metafile:true,format:'iife',platform:'browser',logLevel:'silent'});
  const inputs=Object.keys(metafile.inputs);
  // The build gate reviews dependency inputs, including tree-shaken modules.
  // Only the original SW installer may import these immutable package bytes.
  assert.deepEqual(inputs.filter(path=>path.startsWith('examples/tasks/')),[]);
  assert.ok(!inputs.includes('src/platform/tasks/builtin-releases.js'));
});
