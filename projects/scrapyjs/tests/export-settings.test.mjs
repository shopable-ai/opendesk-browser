import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {completeCsvOutput} from '../src/export-settings.js';

const context = vm.createContext({TextEncoder});
vm.runInContext(await readFile(new URL('../adapters/app-sdk.js', import.meta.url), 'utf8'), context);
function fixture() {
  const downloads = [];
  const sdk = context.ScrapyAppSdk.createSdk(async (operation, payload) => {
    assert.equal(operation, 'browser.downloads.text');
    downloads.push(payload);
    return {started: true};
  });
  return {sdk, downloads};
}

test('partial preferences preserve every detail, derived and later field in real SDK CSV', async () => {
  const snapshot = {result: {data: [
    {title: 'A,"book"', publication: 'raw', detail: {tags: ['one']}, author: 'Ada'},
    {title: 'B', price: 0, later: 'last\nline'}
  ]}};
  const preferences = {fieldOrder: ['price', 'title'], fieldNames: {title: '标题'}};
  const before = structuredClone({snapshot, preferences});
  const {output, warnings} = completeCsvOutput(snapshot, preferences);
  assert.deepEqual(output, {fieldOrder: ['price', 'title', 'publication', 'detail', 'author', 'later'], fieldNames: {title: '标题'}});
  assert.deepEqual(warnings, []);
  const {sdk, downloads} = fixture();
  await sdk.download(snapshot, 'csv', output);
  // Exact readback includes every cell, including quotes, nested JSON and newlines.
  assert.equal(downloads[0].text, '"price","标题","publication","detail","author","later"\r\n"","A,""book""","raw","{""tags"":[""one""]}","Ada",""\r\n"0","B","","","","last\nline"');
  output.fieldOrder.reverse();
  output.fieldNames.title = 'changed';
  warnings.push('changed');
  assert.deepEqual({snapshot, preferences}, before);
  assert.deepEqual(completeCsvOutput(snapshot, preferences).warnings, []);
});

test('matches result/value nullish fallback, first discovery order and top-level grammar', () => {
  const rows = [{z: {nested: 1}, title: 'A'}, {later: 2, z: null}];
  for (const snapshot of [{result: {data: rows}}, {value: {data: rows}}, {result: {data: null}, value: {data: rows}}])
    assert.deepEqual(completeCsvOutput(snapshot), {output: {fieldOrder: ['z', 'title', 'later']}, warnings: []});
  assert.deepEqual(completeCsvOutput({result: {data: []}, value: {data: rows}}).output.fieldOrder, []);
  for (const snapshot of [{data: rows}, {result: {data: {}}, value: {data: rows}}, {}, null])
    assert.throws(() => completeCsvOutput(snapshot));
});

test('unknown order and name preferences are filtered with actionable warnings', () => {
  const result = completeCsvOutput({value: {data: [{title: 'A', detail: 1}]}}, {
    fieldOrder: ['gone', 'title'], fieldNames: {gone: '旧列', missing: '缺失', title: '标题'}
  });
  assert.deepEqual(result.output, {fieldOrder: ['title', 'detail'], fieldNames: {title: '标题'}});
  assert.ok(result.warnings.some(warning => warning.includes('gone')));
  assert.ok(result.warnings.some(warning => warning.includes('missing')));
});

test('duplicate and malformed preferences are rejected rather than silently repaired', () => {
  const snapshot = {result: {data: [{a: 1, b: 2}]}};
  for (const preferences of [null, [], 'a', {fieldOrder: null}, {fieldOrder: 'a'},
    {fieldOrder: ['a', 'a']}, {fieldOrder: ['gone', 'gone']}, {fieldOrder: [1]},
    {fieldOrder: ['a', , 'b']}, {fieldOrder: ['']}, {fieldNames: []}, {fieldNames: null},
    {fieldNames: {a: 3}}, {fieldNames: {gone: {nested: true}}}])
    assert.throws(() => completeCsvOutput(snapshot, preferences));
});

test('real SDK retains formula protection for headers and all supplemented cells', async () => {
  const snapshot = {value: {data: [{title: '  =1+1', detail: '\tcommand', number: -2},
    {title: '+cmd', derived: '@SUM(A1)', later: '-cmd'}]}};
  const {output} = completeCsvOutput(snapshot, {fieldOrder: ['number'], fieldNames: {title: '=header'}});
  const {sdk, downloads} = fixture();
  await sdk.download(snapshot, 'csv', output);
  assert.equal(downloads[0].text, '"number","\'=header","detail","derived","later"\r\n"-2","\'  =1+1","\'\tcommand","",""\r\n"","\'+cmd","","\'@SUM(A1)","\'-cmd"');
  await sdk.download(snapshot, 'json', output);
  assert.equal(downloads[1].text, JSON.stringify(snapshot, null, 2));
});

test('invalid headers remain rejected and valid names retain original normalization', async () => {
  const snapshot = {result: {data: [{a: 1, b: 2}]}};
  const {sdk, downloads} = fixture();
  for (const fieldNames of [{a: 'x\n'}, {a: 'x'.repeat(81)}, {a: '😀'.repeat(61)},
    {a: 'b'}, {a: 'é', b: 'e\u0301'}]) {
    await assert.rejects(async () => sdk.download(snapshot, 'csv', completeCsvOutput(snapshot, {fieldNames}).output));
  }
  assert.equal(downloads.length, 0);
  await sdk.download(snapshot, 'csv', completeCsvOutput(snapshot, {fieldNames: {a: ' e\u0301 ', b: ' '}}).output);
  assert.equal(downloads[0].text, '"é","b"\r\n"1","2"');
});

test('completion cannot bypass downloader completeness, empty-field or UTF-8 limits', async () => {
  const {sdk, downloads} = fixture();
  const snapshot = {result: {data: [{a: 'x', later: '中'.repeat(50000)}]}};
  const {output} = completeCsvOutput(snapshot, {fieldOrder: ['a']});
  assert.deepEqual(output.fieldOrder, ['a', 'later']);
  await assert.rejects(sdk.download(snapshot, 'csv', output), /150000/);
  await assert.rejects(sdk.download(snapshot, 'csv', {fieldOrder: ['a']}), /CSV 列顺序无效/);
  await assert.rejects(sdk.download({result: {data: []}}, 'csv', completeCsvOutput({result: {data: []}}).output), /没有可导出的字段/);
  assert.equal(downloads.length, 0);
});
