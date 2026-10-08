import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const catalogUrl = new URL('../../docs/product/browser-automation-feature-catalog-r8.zh-CN.md', import.meta.url);
const planUrl = new URL('../../docs/product/browser-automation-r8-implementation-plan.zh-CN.md', import.meta.url);
const identifiers = text => [...text.matchAll(/\b[A-Z]+-\d{3}\b/g)].map(match => match[0]);
const unique = items => [...new Set(items)];
const duplicates = items => unique(items.filter((id,index) => items.indexOf(id) !== index));

// Traceability only. Passing here does NOT certify any runtime feature or native Chrome acceptance.
function examine(catalog,plan) {
  const catalogIds = [...catalog.matchAll(/^\|\s*([A-Z]+-\d{3})\s*\|/gm)].map(match => match[1]);
  const taskSection = /^## 五、[^\n]*\n([\s\S]*?)^## 六、/m.exec(plan)?.[1] ?? '';
  const taskRows = [...taskSection.matchAll(/^\|\s*\*\*E(\d{2})\b[^|\n]*\|\s*([^|\n]+)\|/gm)];
  const taskIds = taskRows.map(row => 'E' + row[1]);
  if (/^### 全程 E40\b/m.test(taskSection)) taskIds.push('E40');
  const mappedIds = taskRows.flatMap(row => identifiers(row[2]));
  mappedIds.push(...identifiers(/^功能 ID：([^\n；]+)/m.exec(taskSection)?.[1] ?? ''));
  const supplement = [...taskSection.matchAll(/^\|\s*(E\d{2}(?:\s*,\s*E\d{2})*)\s*\|\s*([A-Z]+-\d{3}(?:\s*,\s*[A-Z]+-\d{3})*)\s*\|\s*(保留回归|延期评估|不实现)\s*\|/gm)];
  const supplementIds = supplement.flatMap(row => identifiers(row[2]));
  mappedIds.push(...supplementIds);
  const taskSet = new Set(taskIds),catalogSet = new Set(catalogIds),mappedSet = new Set(mappedIds);
  return {
    catalogIds,taskIds,supplementIds,
    catalogDuplicates:duplicates(catalogIds),taskDuplicates:duplicates(taskIds),
    missing:catalogIds.filter(id => !mappedSet.has(id)),
    unknown:unique(mappedIds.filter(id => !catalogSet.has(id))),
    unknownOwners:unique(supplement.flatMap(row => row[1].split(/\s*,\s*/)).filter(id => !taskSet.has(id))),
    dispositions:unique(supplement.map(row => row[3])),
    phaseHeadings:unique([...taskSection.matchAll(/^### R8\.([0-6])\b/gm)].map(row => 'R8.' + row[1])),
  };
}

const [catalog,plan] = await Promise.all([readFile(catalogUrl,'utf8'),readFile(planUrl,'utf8')]);

test('R8 catalog 188 unique IDs map to all E01–E40 work packages or explicit dispositions', () => {
  const x = examine(catalog,plan);
  assert.equal(x.catalogIds.length,188);
  assert.deepEqual(x.catalogDuplicates,[]);
  assert.deepEqual(x.taskIds,Array.from({length:40},(_,i)=>'E' + String(i+1).padStart(2,'0')));
  assert.deepEqual(x.taskDuplicates,[]);
  assert.deepEqual(x.phaseHeadings,Array.from({length:7},(_,i)=>'R8.' + i));
  assert.equal(x.supplementIds.length,35,'appendix accounts for 35 formerly unmapped IDs');
  assert.deepEqual(x.missing,[]);
  assert.deepEqual(x.unknown,[]);
  assert.deepEqual(x.unknownOwners,[]);
  assert.deepEqual(x.dispositions.sort(),['保留回归','延期评估','不实现'].sort());
});

test('omitted deferred capability cannot silently pass the coverage gate', () => {
  assert.match(plan,/GM-020,GM-021/);
  const x = examine(catalog,plan.replace('GM-020,GM-021','GM-021'));
  assert.deepEqual(x.missing,['GM-020']);
});

test('invalid work owner and duplicate feature ID are caught', () => {
  assert.match(plan,/\| E27,E39 \| ECO-006/);
  const badOwner = examine(catalog,plan.replace('| E27,E39 | ECO-006','| E99 | ECO-006'));
  assert.deepEqual(badOwner.unknownOwners,['E99']);
  const duplicated = examine(catalog.replace('| INS-003 |','| INS-001 |'),plan);
  assert.ok(duplicated.catalogDuplicates.includes('INS-001'));
});
