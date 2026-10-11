import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Layout regression is a source-level contract; native Chrome remains a separate acceptance step.
const [html, css, editor] = await Promise.all([
  readFile('src/ui/tool.html', 'utf8'),
  readFile('src/ui/tool-shell.css', 'utf8'),
  readFile('src/ui/script-editor.js', 'utf8')
]);
const dev = html.slice(html.indexOf('id="workbench-develop"'), html.indexOf('id="tool-diagnostics"'));

test('Dev has one live run-status row and moves technical identity below results', () => {
  assert.match(dev, /id="developer-run-feedback"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(dev, /id="script-status"[^>]*>正在连接公共运行入口/);
  assert.match(dev, /id="script-task-status"[^>]*hidden/);
  assert.doesNotMatch(dev, /id="script-task-status"[^>]*role="status"/);
  assert.ok(dev.indexOf('id="developer-results-panel"') < dev.indexOf('id="developer-run-technical"'));
  assert.match(editor, /display\('results', focused \? '任务状态：' : '已读取持久结果'\)/);
  assert.match(editor, /taskStatus\.hidden = state !== 'results' \|\| !taskStatus\.textContent/);
});

test('Dev code editor is about one third shorter while staying user-resizable', () => {
  assert.match(dev, /id="script-source" rows="6"/);
  assert.match(css, /#script-source\{min-height:174px;height:min\(30vh,254px\);max-height:70vh/);
  assert.match(css, /#script-source\{[^}]*resize:vertical|textarea\{[^}]*resize:vertical/);
});

test('Dev spacing and font normalization are scoped to the developer panel', () => {
  assert.match(css, /#workbench-develop \.developer-editor details>:not\(summary\)\{margin-block:8px 0\}/);
  assert.match(css, /#workbench-develop \.developer-editor details>label\+:is\(input,select,textarea\)\{margin-block-start:4px\}/);
  assert.match(css, /#workbench-develop \.developer-editor label\{font-size:12px;line-height:1\.5;font-weight:400/);
  assert.match(css, /#workbench-develop \.developer-editor>details>summary\{font-weight:600\}/);
  assert.match(css, /\.developer-run-feedback\{display:flex;align-items:baseline;flex-wrap:wrap/);
});
