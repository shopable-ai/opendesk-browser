import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';

const policy='projects/webflow/src/auto-grants.js';
const controls=['AutoSettings.tsx','CurrentTask.tsx','RuntimePanel.tsx'].map(name=>'projects/webflow/trusted/'+name);
const chunk=(target,path)=>({fileName:target,modules:{[resolve(path)]:{renderedLength:1,originalLength:1}}});
test('Web Flow permits its exact policy and three reviewed UI sources only in their designated fixed bundles',()=>{
  for(const target of ['sw.js','agents/chatgpt-fixed-bridge.js','ui/tool-shell.js'])
    assert.ok(describeBundle({chunk:chunk(target,policy)}).modules[0].reviewedFirstPartyBlob);
  for(const source of controls){
    assert.ok(describeBundle({chunk:chunk('ui/tool-shell.js',source)}).modules[0].reviewedFirstPartyBlob);
    for(const target of ['sw.js','agents/chatgpt-fixed-bridge.js','ui/sidebar-tool-host.js','sidebar-tools/bridge.js'])
      assert.throws(()=>describeBundle({chunk:chunk(target,source)}),/cannot enter a privileged fixed bundle/);
  }
  for(const [target,path] of [['agents/page-relay.js',policy],['ui/tool-shell.js','projects/webflow/src/ui/main.js'],
    ['ui/tool-shell.js','projects/webflow/trusted/unreviewed.tsx']])
    assert.throws(()=>describeBundle({chunk:chunk(target,path)}),/cannot enter a privileged fixed bundle/);
});
test('every trusted Web Flow UI source rejects changed bytes and symlinks',async t=>{
  const root=await realpath(await mkdtemp(resolve(tmpdir(),'webflow-ui-source-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(resolve(root,'projects/webflow/trusted'),{recursive:true});
  for(const path of controls){
    const file=resolve(root,path),chunk={fileName:'ui/tool-shell.js',modules:{[file]:{}}};
    await writeFile(file,(await readFile(path,'utf8'))+'\n// unreviewed\n');
    assert.throws(()=>describeBundle({root,chunk}),/review and re-pin/);
    await rm(file);await symlink(resolve(path),file);
    assert.throws(()=>describeBundle({root,chunk}),/must not be a symlink/);
  }
});
test('changed trusted grant bytes are rejected without admitting arbitrary project code',async t=>{
  const root=await realpath(await mkdtemp(resolve(tmpdir(),'webflow-source-')));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(resolve(root,'projects/webflow/src'),{recursive:true});
  await writeFile(resolve(root,policy),(await readFile(policy,'utf8'))+'\n// unreviewed\n');
  assert.throws(()=>describeBundle({root,chunk:{fileName:'sw.js',modules:{[resolve(root,policy)]:{}}}}),/review and re-pin/);
});
