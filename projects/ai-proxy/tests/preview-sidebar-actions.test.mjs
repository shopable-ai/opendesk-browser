import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {managementActionsPreview} from '../preview/management-actions.mjs';

const baseline = await readFile(new URL('../preview/baseline/QuickPanel.tsx', import.meta.url), 'utf8');
const count = (body, needle) => body.split(needle).length - 1;

test('R17 sidebar removes only redundant always-visible footer controls', () => {
  const output = managementActionsPreview(baseline);
  assert.equal(count(baseline, 'className="r86Bottom"'), 1);
  assert.equal(count(output, 'className="r86Bottom"'), 0);
  assert.equal(count(output, "openOptions('subscriptions',false,'new')"), 1,
    'first-run subscription entry remains available');
  assert.match(output, /id="quick-manage-profiles" icon="profile"/);
  assert.match(output, /id="quick-manage-rules" icon="rules"/);
  assert.equal(count(output, 'data-r86-section="modes"'), count(baseline, 'data-r86-section="modes"'));
  assert.equal(count(output, 'data-r86-section="proxies"'), count(baseline, 'data-r86-section="proxies"'));
  assert.equal(count(output, 'data-r86-section="site"'), count(baseline, 'data-r86-section="site"'));
});

test('runtime diagnostics appears conditionally and only navigates', () => {
  const output = managementActionsPreview(baseline);
  assert.match(output, /blocked \|\| state\.runtime\.proxyError \|\| state\.runtime\.statusErrorCode \|\| state\.runtime\.outcomeUnknown/);
  assert.equal(count(output, 'className="apDiagnosticEntry"'), 1);
  assert.equal(count(output, "openOptions('diagnostic')"), 1);
  for (const needle of ["act({type:'APPLY'", "act({type:'STOP'", "act({type:'PROBE'"]) {
    assert.equal(count(output, needle), count(baseline, needle), needle + ' must not be added');
  }
});

test('frozen sidebar drift fails closed', () => {
  assert.throws(
    () => managementActionsPreview(baseline.replace('className="r86Bottom"', 'className="changedBottom"')),
    /Frozen sidebar preview input changed/
  );
});
