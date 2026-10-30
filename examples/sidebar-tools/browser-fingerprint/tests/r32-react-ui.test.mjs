import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {transformWithEsbuild} from 'vite';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const load=async file=>readFile(resolve(project,file),'utf8');
const [app,css,storage,session]=await Promise.all([
  load('src/App.jsx'),load('src/style.css'),load('src/presets.js'),load('src/run-session.js')
]);

test('R3.2 formal React JSX and CSS are transformable (not a screenshot/Host PASS)',async()=>{
  const jsx=await transformWithEsbuild(app,'App.jsx',{loader:'jsx',jsx:'automatic'});
  assert.ok(jsx.code.length>1000);
  const styles=await transformWithEsbuild(css,'style.css',{loader:'css'});
  assert.ok(styles.code.length>1000);
});

test('configuration is the default and the only top-level panels are the three approved tabs',()=>{
  assert.match(app,/useState\('config'\)/);
  for(const pattern of [/\['config','配置'\]/,/\['profiles','我的环境'\]/,
    /\['detect','检测'\]/,/id="fp-panel-config"/,/id="fp-panel-profiles"/,/id="fp-panel-detect"/])
    assert.match(app,pattern);
  assert.doesNotMatch(app,/id="fp-panel-history"/);
  assert.doesNotMatch(app,/aria-label="选择环境预设"/);
});

test('form reset never calls a Host operation and cannot be confused with stopping the tab',()=>{
  const reset=app.slice(app.indexOf('function resetForm(){'),app.indexOf('async function saveCurrent(){'));
  assert.match(reset,/setConfig\(copyConfig\(ORIGINAL_CONFIG\)\)/);
  assert.doesNotMatch(reset,/adapter\.request|restoreEnvironment|applyEnvironment/);
  assert.match(app,/canRestore=\{canRestore\} onRestore/);
  assert.match(app,/restoreEnvironment\(adapter,active\)/);
  assert.match(app,/verifyEnvironment\(adapter,active,/);
  assert.match(app,/\['unknown','invalidated','restore_unknown'\]/);
});

test('profile CRUD preserves the existing CAS storage identity and never implies a page mutation',()=>{
  assert.match(storage,/fingerprint\.r21\.presets\.v1/);
  assert.match(storage,/items\.length>=20/);
  assert.match(storage,/ifMatch:etag/);
  assert.match(app,/readPresets\(adapter\.request\)/);
  assert.match(app,/savePreset\(adapter\.request,/);
  assert.match(app,/deletePreset\(adapter\.request,id\)/);
  assert.match(app,/setSelected\('custom'\);setDirty\(true\)/);
  assert.match(app,/discardGuard\(\(\)=>assignPreset\(item\.id\)\)/);
  assert.match(session,/sessionActions\(status,session\)/);
});

test('diagnostics and professional referrals remain bounded and transparent',()=>{
  assert.match(app,/ReadOnlyDiagnostics adapter=\{adapter\} preview=\{preview\} coreOnly/);
  assert.match(app,/自动化状态信号/);
  assert.match(app,/未采集 · 不推断/);
  assert.match(app,/http:\/\/127\.0\.0\.1:43111\/browser-fingerprint\.html/);
  assert.match(app,/https:\/\/gologin\.com\//);
  assert.match(app,/https:\/\/www\.adspower\.com\//);
  assert.doesNotMatch(app,/affiliate_id=|utm_|候补申请.*<input/);
});
