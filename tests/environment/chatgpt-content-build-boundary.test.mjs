import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {resolve} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';

async function fixedContentGraph(entry){
  const result=await build({configFile:false,publicDir:false,logLevel:'silent',
    resolve:{alias:{'@opendesk/ui':resolve('src/scripting/user-scripts/page-ui.js')}},
    build:{write:false,minify:false,target:'es2022',lib:{
      entry:resolve('src/entrypoints',entry+'.js'),formats:['iife'],name:'TestFixedContent'}}});
  const chunk=result[0].output.find(row=>row.type==='chunk');
  return Object.fromEntries(Object.entries(chunk.modules).filter(([path])=>path.startsWith(process.cwd()+'/')));
}

test('fixed ChatGPT Content admits reviewed app sources and excludes packaged Task sources',async()=>{
  const modules=await fixedContentGraph('chatgpt-fixed-bridge');
  const inputs=Object.keys(modules);
  // Only the original SW installer may bundle these immutable package bytes.
  assert.ok(!inputs.some(path=>path.includes('/examples/tasks/')||path.includes('/task-packs/')));
  assert.ok(!inputs.includes(resolve('src/platform/tasks/builtin-releases.js')));
  const appInputs=inputs.filter(path=>path.startsWith(resolve('projects')+'/'));
  assert.ok(appInputs.includes(resolve('projects/webflow/src/task-intent-contract.js')));
  const result=describeBundle({chunk:{fileName:'agents/chatgpt-fixed-bridge.js',
    modules:Object.fromEntries(appInputs.map(path=>[path,modules[path]]))},lock:{packages:{}}});
  assert.ok(result.modules.every(row=>/^[0-9a-f]{40}$/.test(row.reviewedFirstPartyBlob)));
});

test('Gemini fixed Content admits only the reviewed queue runtime and assets',async()=>{
  const target='agents/gemini-fixed-send-queue.js';
  const modules=await fixedContentGraph('gemini-fixed-send-queue');
  const inputs=Object.keys(modules);
  assert.ok(inputs.includes(resolve('projects/ai-send-queue/trusted/fixed-page.js')));
  assert.ok(inputs.includes(resolve('projects/ai-send-queue/src/page/site.js')));
  const appInputs=inputs.filter(path=>path.startsWith(resolve('projects')+'/'));
  assert.ok(appInputs.every(path=>path.startsWith(resolve('projects/ai-send-queue')+'/')));
  assert.ok(!inputs.some(path=>path.startsWith(resolve('src/native-agent')+'/')));
  const describe=(fileName,paths)=>describeBundle({root:process.cwd(),chunk:{fileName,
    modules:Object.fromEntries(paths.map(path=>[resolve(path),modules[path]??{renderedLength:1,originalLength:1}]))},lock:{packages:{}}});
  assert.ok(describe(target,appInputs).modules.every(row=>/^[0-9a-f]{40}$/.test(row.reviewedFirstPartyBlob)));
  assert.throws(()=>describe(target,['projects/ai-send-queue/src/sidebar/App.jsx']),/cannot enter a privileged fixed bundle/);
  assert.throws(()=>describe('ui/tool-shell.js',['projects/ai-send-queue/src/page/site.js']),/cannot enter a privileged fixed bundle/);
});
