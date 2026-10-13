import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Layout regression is a source-level contract; native Chrome remains a separate acceptance step.
const [html, css, editor, design] = await Promise.all([
  readFile('src/ui/tool.html', 'utf8'),
  readFile('src/ui/tool-shell.css', 'utf8'),
  readFile('src/ui/script-editor.js', 'utf8'),
  readFile('src/ui/design-system.css', 'utf8')
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

test('Dev code editor preserves R29 readable minimum while staying user-resizable', () => {
  assert.match(dev, /id="script-source" rows="6"/);
  assert.match(css, /#script-source\{[^}]*min-height:216px;height:clamp\(216px,32vh,320px\);max-height:max\(216px,70vh\)/);
  assert.match(css, /#script-source\{[^}]*resize:vertical|textarea\{[^}]*resize:vertical/);
});

test('Dev disclosure typography and content inset inherit the shared component', () => {
  assert.match(dev, /id="developer-results-panel" class="developer-results od-disclosure"/);
  assert.match(design, /\.od-disclosure>summary\{[^}]*font-weight:650/);
  assert.match(design, /\.od-disclosure>:not\(summary\)\{[^}]*max-width:calc\(100% - var\(--space-3\) - var\(--space-3\)\);margin:var\(--space-2\) var\(--space-3\) 0/);
  assert.doesNotMatch(css, /#workbench-develop \.developer-editor>details>summary\{/);
  assert.match(css, /\.developer-run-feedback\{display:flex;align-items:baseline;flex-wrap:wrap/);
});
