import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {loadPreviewRuntime} from './runtime.mjs';
import {compilePreviewRuntime} from './runtime-source.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('default runtime compiles canonical source, fingerprints actual inputs and executes pinned React', async () => {
  const {react, shared, provenance} = await loadPreviewRuntime();
  assert.equal(provenance.receiptStatus, 'SOURCE_COMPONENT_PREVIEW');
  assert.equal(provenance.wxtPassed, false);
  assert.equal(provenance.compiler.write, false);
  for (const name of ['src/entrypoints/sidebar-shared-ui.js', 'src/ui/react/components/ui/button.tsx',
    'src/ui/react/components/ui/switch.tsx', 'src/ui/react/components/ui/card.tsx',
    'src/ui/design-tokens.css', 'src/ui/design-system.css']) {
    assert.equal(provenance.inputs[name].sha256, sha(await readFile(new URL('../../../../' + name, import.meta.url))));
  }
  assert.equal(provenance.outputs.shared.sha256, sha(shared));
  assert.equal(provenance.outputs.react.sha256, sha(react));
  assert.equal(provenance.metafileSha256, sha(JSON.stringify(provenance.metafile)));
  assert.ok(Object.keys(provenance.metafile.inputs).some(name => name.includes('react-aria-components')));
  assert.ok(!Object.keys(provenance.metafile.inputs).some(name => /node_modules\/react\//.test(name)));
  const styles = [];
  const context = vm.createContext({console, setTimeout, clearTimeout,
    document: {addEventListener() {}, removeEventListener() {}, createElement: () => ({dataset: {}}), head: {append: node => styles.push(node)}}});
  vm.runInContext(react.toString(), context);
  try { vm.runInContext(shared.toString(), context); } catch (error) { throw new Error(error.message); }
  assert.equal(context.OpenDeskPageReact.version, '19.2.0');
  for (const key of ['Button', 'IconButton', 'Card', 'CardContent', 'Switch', 'SharedConversationFrame', 'SharedConversationDock', 'createConversationSession'])
    assert.equal(typeof context.OpenDeskSidebarUI[key], 'function');
  assert.equal(styles.length, 1);
  assert.ok(styles[0].textContent.includes('.od-icon-button{'));
});

test('source mode rejects modified pinned React bytes', async () => {
  await assert.rejects(compilePreviewRuntime({record: async path => {
    const bytes = await readFile(path);
    return path.endsWith('react-19.2.0.js') ? Buffer.concat([bytes, Buffer.from(' ')]) : bytes;
  }}), /fixed registry SHA/);
});

test('explicit evidence mode requires paired paths and never falls back to source', async () => {
  await assert.rejects(loadPreviewRuntime({runtimeDir: '/missing'}), /requires both/);
  await assert.rejects(loadPreviewRuntime({runtimeReceipt: '/missing'}), /requires both/);
  await assert.rejects(loadPreviewRuntime({runtimeDir: '/missing', runtimeReceipt: '/missing',
    record: async () => Buffer.from('{"status":"failed","sourceInputs":[]}')}), /requires a passed build/);
});

test('offline and HMR controls honor only current opaque-frame dirty/busy messages', async () => {
  const {previewControlsScript} = await import('./build-preview.mjs');
  const dev = await readFile(new URL('./dev.html', import.meta.url), 'utf8');
  for (const script of [previewControlsScript('<html>simulated</html>', 'success'),
    dev.match(/<script type="module">([\s\S]*?)<\/script>/)[1]]) {
    const nodes = new Map();
    const get = id => {
      if (!nodes.has(id)) nodes.set(id, {value: 'success', disabled: false, title: '',
        contentWindow: {}, addEventListener(type, callback) {this[type] = callback;}});
      return nodes.get(id);
    };
    const listeners = {};
    const context = vm.createContext({document: {getElementById: get},
      window: {addEventListener: (type, callback) => {listeners[type] = callback;}},
      TextDecoder, Uint8Array, atob});
    // This test isolates reset guards; the presentation bridge has separate checks.
    context.installPreviewConversationHeader=()=>{};
    vm.runInContext(script.replace(/^import .*;$/mg,''), context);
    const frame = get('opendesk-preview-frame'), picker = get('scrapyjs-preview-scenario'), reset = get('scrapyjs-preview-reset');
    const notify = (data, source = frame.contentWindow, origin = 'null') => listeners.message({data, source, origin});
    const state = {type: 'scrapyjs-preview-state', dirty: true, busy: false};
    notify(state, {});notify(state, frame.contentWindow, 'http://127.0.0.1:43127');
    notify({...state, dirty: 'true'});
    assert.equal(reset.disabled, false);
    notify(state);
    assert.equal(picker.disabled, true);assert.equal(reset.disabled, true);
    assert.match(reset.title, /未保存/);
    reset.click();picker.change({target: {value: 'empty'}});
    assert.equal(frame.src, undefined);assert.equal(frame.srcdoc, undefined);
    notify({...state, dirty: false, busy: true});assert.match(reset.title, /任务正在进行/);
    notify({...state, dirty: false});
    assert.equal(reset.disabled, false);assert.equal(reset.title, '');
    reset.click();assert.ok(frame.src || frame.srcdoc);
  }
});
