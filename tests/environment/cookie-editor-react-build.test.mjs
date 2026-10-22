import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,copyFile,mkdir,mkdtemp,appendFile,rm,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {buildSidebarTool} from '../../scripts/build-sidebar-tool.mjs';

const repo=resolve('.');
const root=resolve(repo,'examples/sidebar-tools/cookie-editor');
const candidate=resolve(repo,'artifacts/sidebar-tools/cookie-editor/candidate.opendesk-tool.json');
const get=(path)=>readFile(resolve(root,path));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('canonical packer rejects Cookie source drift before writing a candidate',async()=>{
  const scratch=await mkdtemp(resolve(tmpdir(),'cookie-react-receipt-'));
  const project=resolve(scratch,'project'),out=resolve(scratch,'candidate.json');
  try{
    const ready=JSON.parse(await get('dist/build-ready.json'));
    for(const file of new Set(['tool.config.json','dist/build-ready.json',
      ...Object.keys(ready.sources),...Object.keys(ready.files)])){
      await mkdir(dirname(resolve(project,file)),{recursive:true});
      await copyFile(resolve(root,file),resolve(project,file));
    }
    await appendFile(resolve(project,'app/controller/cookie-controller.js'),'\n// changed after compilation\n');
    await assert.rejects(buildSidebarTool(project,{out}),/compiled UI source changed since the successful build/);
    await assert.rejects(access(out),{code:'ENOENT'});
  }finally{await rm(scratch,{recursive:true,force:true});}
});

test('built React JSX uses one classic chunk and pinned runtime, not bundled React',async()=>{
  const [js,css,ready]=await Promise.all([
    get('dist/tool.js'),get('dist/tool.css'),
    get('dist/build-ready.json').then(bytes=>JSON.parse(bytes.toString('utf8')))
  ]);
  assert.equal(ready.format,'opendesk.ui-build-ready.v1');
  assert.equal(ready.buildId,sha(Buffer.from(JSON.stringify({
    sources:ready.sources,files:ready.files
  }))),'identical sources and output must have a deterministic Build Ready ID');
  for(const [name,bytes] of [['tool.js',js],['tool.css',css]]){
    assert.equal(ready.files['dist/'+name].bytes,bytes.length);
    assert.equal(ready.files['dist/'+name].sha256,sha(bytes));
  }
  const script=js.toString('utf8');
  assert.match(script,/OpenDeskPageReact/);
  assert.match(script,/OpenDeskSidebarUI/);
  assert.match(script,/createRoot/);
  assert.doesNotMatch(script,/ReactCurrentDispatcher|react\.production\.js|SECRET_FIXTURE|secret_preview_never_real/);
  assert.ok(js.length<220000,'tool script exceeds official packer limit');
  assert.ok(css.length<120000,'compiled stylesheet exceeds official packer limit');
  assert.match(css.toString('utf8'),/^\/\* @opendesk-shared-design \*\//);
});

test('canonical packer emits the configured React release from current source',async()=>{
  const [config,bytes]=await Promise.all([
    get('tool.config.json').then(bytes=>JSON.parse(bytes.toString('utf8'))),
    readFile(candidate)
  ]);
  const output=JSON.parse(bytes.toString('utf8'));
  assert.equal(config.uiRuntime,'opendesk.react-ui.v1');
  assert.equal(config.files.js,'dist/tool.js');
  assert.equal(output.id,'cookie-editor');
  assert.equal(output.version,config.version);
  assert.equal(output.uiRuntime,'opendesk.react-ui.v1');
  assert.match(output.css,/^\/\* opendesk\.shared-design\.v1 sha256=[0-9a-f]{64}/);
  assert.match(output.css,/\.od-button\{/);
  assert.match(output.css,/\.od-icon-button\{/);
  assert.match(output.css,/:is\(input,select,textarea\)\.od-field\{/);
  assert.equal(output.js,(await get('dist/tool.js')).toString('utf8'));
  assert.doesNotMatch(output.js,/secret_preview_never_real|sess_demo_only_C18/);
  assert.ok(bytes.length>1000);
});

test('checked-in official React package matches the canonical source-built candidate',async()=>{
  const official=JSON.parse((await get('cookie-editor.opendesk-tool.json')).toString('utf8'));
  const candidatePkg=JSON.parse((await readFile(candidate)).toString('utf8'));
  for(const key of ['id','version','uiRuntime','html','css','js']){
    assert.equal(candidatePkg[key],official[key],
      'Official Cookie Editor release differs from source-built candidate: '+key);
  }
});
