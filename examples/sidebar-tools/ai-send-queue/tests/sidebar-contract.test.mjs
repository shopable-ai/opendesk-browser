import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const dir=new URL('../',import.meta.url);
const source=async path=>readFile(new URL(path,dir),'utf8');
test('React Tool is one root, calls Host only, and has no parallel sender',async()=>{
  const [entry,ui,manifest]=await Promise.all([
    source('src/sidebar/main.jsx'),source('src/sidebar/App.jsx'),source('tool.config.json')]);
  const tool=JSON.parse(manifest);
  assert.equal(tool.id,'ai-send-queue');
  assert.equal(tool.uiRuntime,'opendesk.react-ui.v1');
  assert.deepEqual(tool.capabilities,['currentPage.read']);
  assert.equal(entry.match(/createRoot\(/g)?.length,1);
  assert.match(ui,/request\('sendQueue.snapshot'/);
  assert.match(ui,/request\('sendQueue.command'/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|chrome\.storage|site\.prepare|site\.commit/);
});
