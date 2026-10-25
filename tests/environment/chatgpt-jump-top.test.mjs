// Keep the new real Page program's DOM-adapter assertions in the repository
// environment suite. Browser installation and logged-in ChatGPT remain separate.
import '../../examples/programs/chatgpt-jump-top/tests/conversation.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('AI Chat Scroll Navigation Page manifest uses only explicit top-frame site rules', async () => {
  const p = JSON.parse(await readFile(
    'examples/programs/chatgpt-jump-top/package.json', 'utf8'));
  assert.equal(p.opendesk.runtimeKind, 'page-userscript');
  assert.equal(p.opendesk.sourceFormat, 'esm');
  assert.equal(p.opendesk.entry, 'src/main.js');
  assert.deepEqual(p.opendesk.pageRules.matches, [
    'https://chatgpt.com/*','https://chat.deepseek.com/*','https://gemini.google.com/*'
  ]);
  // Do not silently rewrite an installed Program identity.
  assert.equal(p.opendesk.id,'opendesk.chatgpt-jump-top');
  assert.match(p.description,/AI 对话滚动导航/);
  assert.equal(p.opendesk.pageRules.allFrames, false);
  assert.equal(p.opendesk.pageRules.world, 'USER_SCRIPT');
});
