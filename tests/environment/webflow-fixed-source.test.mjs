import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';

const policy='projects/webflow/src/auto-grants.js',settings='projects/webflow/trusted/AutoSettings.tsx';
const chunk=(target,path)=>({fileName:target,modules:{[resolve(path)]:{renderedLength:1,originalLength:1}}});
test('Web Flow permits only its two exact reviewed inputs in their designated fixed bundles',()=>{
  for(const target of ['sw.js','agents/chatgpt-fixed-bridge.js','ui/tool-shell.js'])
    assert.ok(describeBundle({chunk:chunk(target,policy)}).modules[0].reviewedFirstPartyBlob);
  assert.ok(describeBundle({chunk:chunk('ui/tool-shell.js',settings)}).modules[0].reviewedFirstPartyBlob);
  for(const [target,path] of [['sw.js',settings],['agents/chatgpt-fixed-bridge.js',settings],
    ['agents/page-relay.js',policy],['ui/tool-shell.js','projects/webflow/src/ui/main.js']])
    assert.throws(()=>describeBundle({chunk:chunk(target,path)}),/cannot enter a privileged fixed bundle/);
});
test('changed trusted grant bytes are rejected without admitting arbitrary project code',async t=>{
  const root=await realpath(await mkdtemp(resolve(tmpdir(),'webflow-source-')));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(resolve(root,'projects/webflow/src'),{recursive:true});
  await writeFile(resolve(root,policy),(await readFile(policy,'utf8'))+'\n// unreviewed\n');
  assert.throws(()=>describeBundle({root,chunk:{fileName:'sw.js',modules:{[resolve(root,policy)]:{}}}}),/review and re-pin/);
});
