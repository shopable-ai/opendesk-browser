import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectHTML} from '../../scripts/verify-package.mjs';

const file = 'native-agent/settings.html';
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'od-settings-html-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, 'native-agent'));
  await mkdir(join(root, 'ui'));
  const html = await readFile('src/' + file, 'utf8');
  for (const asset of ['ui/design-tokens.css', 'native-agent/settings.css', 'native-agent/settings.js'])
    await writeFile(join(root, asset), '');
  await writeFile(join(root, file), html);
  return {root, html, write: value => writeFile(join(root, file), value)};
}

test('package HTML accepts only the remaining Settings navigation link', async t => {
  const {root} = await fixture(t);
  await inspectHTML(root, file);
});

test('Settings navigation rejects external, encoded and arbitrary local targets', async t => {
  const {root, html, write} = await fixture(t);
  for (const target of ['https://evil.invalid/', '//evil.invalid/x', 'javascript:alert(1)',
    'data:text/html,x', '../sidepanel.html', 'settings.html#other', '#other', 'settings.html#chatgpt-files',
    'settings.html?x=1#chatgpt-files', 'settings.html%23chatgpt-files',
    'settings.html&#35;chatgpt-files', 'settings.html\\#chatgpt-files']) {
    await write(html.replace('href="#chatgpt-images"', 'href="' + target + '"'));
    await assert.rejects(inspectHTML(root, file), /Unsafe HTML/);
  }
});

test('Settings navigation cannot lose isolation or become a resource consumer', async t => {
  const {root, html, write} = await fixture(t);
  for (const changed of [html.replace('rel="noopener"', 'rel="opener"'),
    html.replace('target="_blank"', 'target="_self"'),
    html.replace('href="#chatgpt-images"', 'href=#chatgpt-images'),
    html.replace('href="#chatgpt-images"', 'href="#chatgpt-images" download'),
    html.replace('<a href="#chatgpt-images"', '<link href="#chatgpt-images"'),
    html.replace('<a href="#chatgpt-images"', '<script src="#chatgpt-images"')]) {
    await write(changed);
    await assert.rejects(inspectHTML(root, file), /Unsafe HTML/);
  }
  await write(html + '<a href="#chatgpt-images" target="_blank" rel="noopener">extra</a>');
  await assert.rejects(inspectHTML(root, file), /Unapproved HTML navigation/);
});

test('Settings links do not admit executable, external stylesheet or inline resources', async t => {
  const {root, html, write} = await fixture(t);
  for (const changed of [html.replace('src="settings.js"', 'src="https://evil.invalid/x.js"'),
    html.replace('href="settings.css"', 'href="https://evil.invalid/x.css"'),
    html + '<script>void 0</script>', html + '<button onclick="run()">run</button>',
    html + '<pre style="white-space:pre-wrap">receipt</pre>']) {
    await write(changed);
    await assert.rejects(inspectHTML(root, file), /Unsafe HTML/);
  }
});
