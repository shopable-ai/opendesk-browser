import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Repository source-level guard. Rendered style equivalence is checked separately
// by scripts/tests/sidebar-r19-layout-visual.mjs in controlled Chrome.
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const html = read('src/ui/tool.html');
const shell = read('src/ui/tool-shell.css');
const components = read('src/ui/design-system.css');
const tokens = read('src/ui/design-tokens.css');
const workflow = read('src/ui/workflow/workflow-view.js');

function element(tab, tag, id) {
  const found = tab.match(new RegExp('<' + tag + '\\b[^>]*\\bid="' + id + '"[^>]*>', 'i'));
  assert.ok(found, 'Missing ' + tag + '#' + id);
  return found[0];
}
function section(start, end) {
  const begin = html.indexOf('<div id="' + start + '"');
  const finish = html.indexOf('<div id="' + end + '"');
  assert.ok(begin >= 0 && finish > begin, 'Tab boundary missing: ' + start);
  return html.slice(begin, finish);
}
function declarations(selector) {
  const escaped = selector.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
  const rule = shell.match(new RegExp('(^|\\n)' + escaped + '\\s*\\{([^}]*)\\}', 'm'));
  assert.ok(rule, 'Missing audited rule ' + selector);
  return rule[2];
}
const classes = tag => (tag.match(/\bclass="([^"]*)"/) || [,''])[1].split(/\s+/);
const has = (tag, className) => classes(tag).includes(className);

test('Workflow consent action remains icon-sized, accessible and explicitly authorized', () => {
  const plan = element(html, 'button', 'workflow-ai-plan');
  assert.ok(has(plan, 'od-icon-button') && has(plan, 'od-icon-button--primary'));
  assert.match(plan, /\baria-label="[^"]*同意数据发送/);
  assert.match(plan, /\btitle="同意并生成"/);
  assert.match(element(html, 'span', 'workflow-ai-plan-label'), /\bhidden\b/);
  assert.match(tokens, /--od-icon-size:\s*34px/);
  assert.match(components, /\.od-icon-button\{[^}]*width:var\(--od-icon-size\)[^}]*height:var\(--od-icon-size\)/);
  assert.doesNotMatch(shell, /\.workflow-composer\s+\.workflow-send-button\[data-first-use/);
  assert.doesNotMatch(shell, /\.workflow-send-label\{/);
  assert.match(workflow, /get\('workflow-ai-plan-label'\)\.hidden=true/);
  assert.match(workflow, /modelConsent\.approve\(frozen\.scope\)/);
  assert.match(workflow, /button\.dataset\.disclosureScope=scope\|\|''/);
  assert.match(workflow, /permission=api\.permissions\.request/);
});

test('Developer static controls all use shared roles; important IDs and ARIA links remain', () => {
  const dev = section('workbench-develop', 'workbench-debug');
  for (const [,attrs] of dev.matchAll(/<button\b([^>]*)>/g))
    assert.match(attrs, /\bod-button\b|\bod-icon-button\b/, 'Developer legacy button: ' + attrs);
  for (const [,name,attrs] of dev.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    if (name === 'input' && /\btype="(?:checkbox|radio|hidden|file|color)"/.test(attrs)) continue;
    assert.match(attrs, /\bod-field\b/, 'Developer legacy control: ' + attrs);
  }
  for (const id of [
    'local-project-mode', 'local-project-refresh', 'local-project-guide',
    'script-source', 'program-new-script', 'script-history-run', 'script-copy-result',
    'script-read-run', 'script-download', 'script-run', 'script-stop',
    'sdk-install', 'sdk-revoke', 'page-component-framework'
  ]) assert.match(html, new RegExp('\\bid="' + id + '"'));
  assert.match(element(dev, 'details', 'local-project-guide'), /\bod-disclosure--info\b/);
  assert.match(element(dev, 'details', 'developer-results-panel'), /\bod-disclosure\b/);
  assert.match(element(dev, 'textarea', 'script-source'), /\bod-field\b/);
  assert.match(dev, /<label\b[^>]*\bfor="script-source"/);
  assert.match(element(dev, 'section', 'local-install-review'), /\bhidden\b/);
  assert.match(element(dev, 'button', 'script-history-open'), /\bdisabled\b/);
});

test('Shared components own normal visual appearance; business CSS retains only layout', () => {
  for (const role of ['od-button', 'od-button--secondary', 'od-button--danger',
    'od-icon-button', 'od-icon-button--primary', 'od-field-label',
    'od-field-help', 'od-surface', 'od-disclosure', 'od-disclosure--flat',
    'od-disclosure--info', 'od-alert--warning', 'od-result'])
    assert.ok(components.includes('.' + role), 'No public CSS role: ' + role);
  for (const property of ['--od-line', '--od-input-border', '--od-ink',
    '--od-sub', '--od-action-bg', '--od-warning-bg', '--od-negative-bg',
    '--space-2', '--space-3', '--radius-control', '--radius-surface'])
    assert.ok(tokens.includes(property + ':'), 'No source token: ' + property);
  for (const selector of ['.local-project-controls button',
    '.program-source-toolbar #program-new-script', '#script-source',
    '#program-source-info', '.workflow-card', '.workflow-icon-button']) {
    const body = declarations(selector);
    assert.doesNotMatch(body, /(?:^|;)\s*(?:background|border(?:-[\w-]+)?|color|padding(?:-[\w-]+)?):/,
      'Legacy appearance override still present in ' + selector);
    assert.doesNotMatch(body, /![ \t]*important/, 'Important appearance override: ' + selector);
  }
  assert.doesNotMatch(shell, /#workbench-develop\s+#local-project-guide>summary/);
  assert.doesNotMatch(shell, /#workbench-develop\s+\.developer-editor>details>summary/);
  assert.match(components, /\.od-disclosure--flat\{border:0/);
  assert.match(components, /\.od-alert--warning\{background:var\(--od-warning-bg\)/);
  assert.doesNotMatch(shell, /\.schedule-form \.schedule-source-row\{gap:var\(--space-1\)\}/,
    'Narrow scheduled-task actions must preserve the 8px shared gap');
});

test('Developer disclosure headers share the Run Result surface; nested diagnostics remain lightweight', () => {
  const dev = section('workbench-develop', 'workbench-debug');
  for (const id of [
    'developer-target-detail', 'manual-project-params-tools', 'developer-results-panel',
    'developer-run-technical', 'page-preview-tools', 'script-library-tools',
    'script-advanced', 'tool-diagnostics'
  ]) {
    const tag = element(dev, 'details', id);
    assert.ok(has(tag, 'od-disclosure'), 'Missing shared disclosure: ' + id);
    assert.ok(!has(tag, 'od-disclosure--flat'), 'Top-level disclosure must match Run Result: ' + id);
  }
  for (const id of [
    'page-dependency-panel', 'script-history-panel', 'page-preview-technical-panel',
    'task-package-dev', 'site-access'
  ])
    assert.ok(has(element(dev, 'details', id), 'od-disclosure--flat'),
      'Nested technical disclosure should not create another card: ' + id);
  const summary = components.match(/\.od-disclosure>summary\{([^}]*)\}/)?.[1] || '';
  for (const rule of [
    'display:flex', 'align-items:center', 'flex-wrap:wrap',
    'gap:var(--space-2)', 'min-height:40px',
    'padding:var(--space-2) var(--space-3)',
    'font-size:var(--od-body-size)', 'font-weight:650',
    'color:var(--od-ink)'
  ]) assert.ok(summary.includes(rule), 'Missing shared header rule: ' + rule);
  assert.match(components, /\.od-disclosure>summary::before\{[^}]*transform:rotate\(-45deg\)/);
  assert.match(components, /@media\(pointer:coarse\)\{\.od-disclosure>summary\{min-height:44px\}/);
  for (const obsolete of [
    '.developer-params summary', '.developer-results summary', '.result-history>summary',
    '#workbench-develop .result-history{', '#tool-diagnostics>summary',
    '.developer-page-summary::after'
  ]) assert.ok(!shell.includes(obsolete), 'Obsolete disclosure override: ' + obsolete);
  assert.ok(!/\.developer-results-body\{[^}]*padding-top/.test(shell), 'Result has double vertical inset');
  assert.ok(!/\.developer-history-content\{[^}]*padding-top/.test(shell), 'History has double inset');
  assert.doesNotMatch(shell, /\.developer-run-technical p\{[^}]*margin:/,
    'Run identity paragraphs must inherit shared horizontal body inset');
});

test('Other formal tabs reuse shared actions without restyling their unique filters', () => {
  for (const [id,variant] of [
    ['task-refresh','secondary'], ['task-uninstall','danger'],
    ['sidebar-tool-settings-allow','secondary'],
    ['sidebar-tool-settings-deny','danger'],
    ['task-install','primary'], ['task-catalog-refresh','secondary'],
    ['cloud-client-refresh','secondary'], ['workflow-ai-apply','primary'],
    ['sdk-install','primary'], ['script-save','secondary']
  ]) {
    const button = element(html, 'button', id);
    assert.ok(has(button, 'od-button'), 'Missing shared button: ' + id);
    if (variant !== 'primary') assert.ok(has(button, 'od-button--' + variant), 'Wrong role: ' + id);
  }
  assert.match(workflow, /'od-field'/);
  assert.match(workflow, /'od-button od-button--danger'/);
});
