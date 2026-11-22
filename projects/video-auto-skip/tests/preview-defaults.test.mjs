import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const preview = readFileSync(new URL('../preview/index.html', import.meta.url), 'utf8');
const css = [...preview.matchAll(/<style[^>]*>([\\s\\S]*?)<\\/style>/g)].map(match => match[1]).join('\\n');
const script = preview.slice(preview.indexOf('<script>') + 8, preview.indexOf('</script>'));
const modelSource = script.slice(0, script.indexOf('(function(){'));

test('preview retains solid intro/outro rails in every compatibility state', () => {
  assert.match(css, /\.od-dual-line\{[^}]*background:#e0e7f1/);
  assert.doesNotMatch(css, /data-compatibility="[^"]+"\]\s+\.od-dual-line/);
  assert.doesNotMatch(css, /repeating-linear-gradient\(/);
  assert.match(css, /\.od-time-field\.od-suggested\{[^}]*border-style:solid/);
  assert.doesNotMatch(css, /\.od-time-field\.od-suggested\{[^}]*border-style:dashed/);
});

test('preview uses existing default anchors without pending badges or extra End settings', () => {
  assert.match(script, /function followsVideoStart\(key,part\)/);
  assert.match(script, /function followsVideoEnd\(key,part\)/);
  assert.match(script, /if\(followsVideoEnd\(key,part\)\)return 'End'/);
  assert.match(script, /part==='start'&&r\.mode==='start'\?0/);
  assert.doesNotMatch(preview, /od-end-binding-caption|od-unset-badge/);
  assert.doesNotMatch(preview, /End = 本集结尾/);
});

test('preview still constrains both handles to a valid interval', () => {
  assert.match(script, /if\(part==='start'&&Number\.isFinite\(other\)\)hi=Math\.min\(hi,other-1\)/);
  assert.match(script, /if\(part==='end'&&Number\.isFinite\(other\)\)lo=Math\.max\(lo,other\+1\)/);
  assert.match(script, /key==='outro'&&part==='end'&&Number\.isFinite\(d\)&&intended===d&&n===d/);
});

test('existing relative outro rule follows duration without rewriting saved offset', () => {
  const ContinuityModel = runInNewContext(modelSource + '\nContinuityModel;', {}, {timeout: 2000});
  const model = new ContinuityModel();
  assert.equal(model.r10LoadFixture('normal03'), true);
  assert.equal(model.s.draft.outro.mode, 'tail');
  assert.equal(model.s.draft.outro.tail, 90);
  assert.equal(model.range('outro')[0], 2610);
  assert.equal(model.range('outro')[1], 2700);
  assert.equal(model.setDuration(2880), true);
  assert.equal(model.range('outro')[0], 2790);
  assert.equal(model.range('outro')[1], 2880);
  assert.equal(model.s.draft.outro.tail, 90);
});
