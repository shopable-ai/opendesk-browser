import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {compileWorkspaceStyle,inspectWorkspaceStyle} from '../../scripts/build-workspace-style.mjs';
import {buildWorkspaceDemo} from '../../scripts/build-workspace-demo.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('R22 production and development publish the same generated Tailwind CSS',async t=>{
  const dir=await mkdtemp(resolve(tmpdir(),'opendesk-workspace-style-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const generated=await compileWorkspaceStyle(dir);
  const css=await readFile(resolve(dir,'native-agent/workspace.css'),'utf8');
  assert.deepEqual(generated,{...inspectWorkspaceStyle(css),path:'native-agent/workspace.css'});
  for(const mode of ['production','development']){
    const packed=await readFile('dist/'+mode+'/native-agent/workspace.css');
    assert.equal(sha(packed),generated.sha256,'Unexpected '+mode+' CSS source');
  }
  for(const marker of ['.file-entry.selected','.connection.ready','data-view','.workspace-status.error'])
    assert.ok(css.includes(marker),'Missing state selector '+marker);
});

test('R22 workspace HTML retains critical controls and collapses secondary panels',async()=>{
  const html=await readFile('src/native-agent/workspace.html','utf8');
  assert.ok(html.includes('<details class="chat-edit-panel">'));
  assert.ok(html.includes('<details class="workspace-tool-preview"'));
  assert.ok(html.includes('<details class="file-rail" open'));
  for(const id of ['file-editor','file-list','save-file','discard-file-draft','save-as','edit-answer','edit-review',
    'conflict-panel','file-surface','app-surface','chat-request-path','chat-file-result-panel','edit-receipt-panel'])
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'Missing/duplicate '+id);
  assert.deepEqual([...html.matchAll(/data-view="([^"]+)" aria-pressed=/g)].map(m=>m[1]),['preview','source','split','app']);
});

test('R22 CSS scanner rejects uncompiled directives and missing design contract',()=>{
  assert.throws(()=>inspectWorkspaceStyle('x'.repeat(6000)+'@source "./workspace.html";'),/uncompiled/);
  assert.throws(()=>inspectWorkspaceStyle('x'.repeat(6000)),/missing expected contract/);
});

test('Workspace memory demo builds with the same compiled stylesheet after removal of source workspace.css',async t=>{
  const dir=await mkdtemp(resolve(tmpdir(),'opendesk-workspace-demo-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const result=await buildWorkspaceDemo({output:resolve(dir,'demo.html'),fixtureRoot:resolve(dir,'files')});
  const html=await readFile(result.demo,'utf8'),css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  assert.equal(inspectWorkspaceStyle(css).sha256,result.cssSha256);
  assert.equal(result.cssSha256,sha(await readFile('dist/production/native-agent/workspace.css')));
  assert.equal(result.backend,'memory-only');assert.equal(result.native,false);
  assert.ok(html.includes('内存演示'));assert.ok(html.includes('demo-banner'));
  assert.equal(await readFile(resolve(dir,'files/README.md'),'utf8'),(await import('../../src/native-agent/file-workspace-demo.js')).DEMO_FILES['README.md']);
});
