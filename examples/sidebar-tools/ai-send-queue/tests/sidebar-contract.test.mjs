import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const dir=new URL('../',import.meta.url);
const source=async path=>readFile(new URL(path,dir),'utf8');
test('React Tool is one root, calls Host only, and has no parallel sender',async()=>{
  const [entry,ui,manifest,page,shared]=await Promise.all([
    source('src/sidebar/main.jsx'),source('src/sidebar/App.jsx'),source('tool.config.json'),
    source('src/page/remote.js'),source('src/shared/queue-contract.js')]);
  const tool=JSON.parse(manifest);
  assert.equal(tool.id,'ai-send-queue');
  assert.equal(tool.uiRuntime,'opendesk.react-ui.v1');
  assert.deepEqual(tool.capabilities,['currentPage.read']);
  assert.equal(entry.match(/createRoot\(/g)?.length,1);
  assert.match(ui,/request\(QUEUE_READ,/);
  assert.match(ui,/request\(QUEUE_WRITE,/);
  assert.match(ui,/QUEUE_COMMANDS\.includes\(name\)/);
  assert.match(page,/import \{QUEUE_COMMANDS,QUEUE_MEMORY_ONLY\} from '\.\.\/shared\/queue-contract\.js'/);
  assert.match(shared,/sendQueue\.snapshot/);
  assert.match(shared,/sendQueue\.command/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|chrome\.storage|site\.prepare|site\.commit/);
});

test('compact Sidebar uses real shared tokens and preserves keyboard per-row actions',async()=>{
  const [css,tokens,ui]=await Promise.all([
    source('src/sidebar/style.css'),
    readFile(new URL('../../../src/ui/design-tokens.css',dir),'utf8'),
    source('src/sidebar/App.jsx')
  ]);
  const names=[...new Set(Array.from(css.matchAll(/var\((--[a-z0-9-]+)/gi),match=>match[1]))];
  assert.ok(names.length>=5,'production theme variables must be present');
  for(const name of names)assert.ok(tokens.includes(name),'undefined OpenDesk theme token: '+name);
  assert.match(css,/max-width:\s*360px/);
  assert.match(css,/max-width:\s*260px/);
  assert.match(ui,/aria-expanded=\{expanded\}/);
  assert.match(ui,/event\.key==='Escape'/);
  for(const action of ['pause','resume','now','edit','move','remove'])
    assert.ok(ui.includes(action),'missing per-item action '+action);
  assert.doesNotMatch(ui,/队列已暂停 · 不会自动发送/);
});
