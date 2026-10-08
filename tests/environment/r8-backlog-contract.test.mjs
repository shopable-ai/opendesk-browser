import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const catalogUrl = new URL('../../docs/product/browser-automation-feature-catalog-r8.zh-CN.md', import.meta.url);
const planUrl = new URL('../../docs/product/browser-automation-r8-implementation-plan.zh-CN.md', import.meta.url);
const identifiers = text => [...text.matchAll(/\b[A-Z]+-\d{3}\b/g)].map(match => match[0]);
const unique = items => [...new Set(items)];
const duplicates = items => unique(items.filter((id,index) => items.indexOf(id) !== index));
const requiredFields = ['功能映射','用户价值 / 契合度','优先级/阶段/复杂度/风险','源码与实际证据',
  '复用 / 必改范围','API / 数据 / 生命周期','前置','独立验收','本地 Chrome / Codex','阻断 / 下一步'];

// Traceability only. A complete plan does NOT certify runtime or Chrome acceptance.
// Read one primary-owner line per task card, not every mention or a historical appendix.
function examine(catalog,plan) {
  const catalogIds = [...catalog.matchAll(/^\|\s*([A-Z]+-\d{3})\s*\|/gm)].map(match => match[1]);
  const cards = [...plan.matchAll(/^### (E\d{2}) · ([^\n]+)\n([\s\S]*?)(?=^#{1,3} |$(?![\s\S]))/gm)]
    .map(([,id,title,body]) => {
      const mappings = [...body.matchAll(/^- \*\*功能映射\*\*：([^\n]*)/gm)];
      const prerequisite = /^- \*\*前置\*\*：([^\n]*)/m.exec(body)?.[1] ?? '';
      const phaseLine = /\*\*优先级\/阶段\/复杂度\/风险\*\*：([^\n]*)/.exec(body)?.[1] ?? '';
      return {id,title,body,mappings,features:mappings.flatMap(row=>identifiers(row[1])),
        phases:[...phaseLine.matchAll(/R8\.(\d+)/g)].map(row=>Number(row[1])),
        prerequisiteOwners:unique([...prerequisite.matchAll(/\b(E\d{2})(?:\.\d+)?\b/g)].map(row=>row[1])),
        // E08.1 is a scoped slice; only whole-task prerequisites define the task DAG.
        dependencies:unique([...prerequisite.matchAll(/\bE\d{2}\b(?!\.\d)/g)].map(row=>row[0]))};
    });
  const taskIds = cards.map(card=>card.id), taskSet = new Set(taskIds);
  const mappedIds = cards.flatMap(card=>card.features), mappedSet = new Set(mappedIds);
  const catalogSet = new Set(catalogIds), byId = new Map(cards.map(card=>[card.id,card]));
  const visited = new Set(), active = new Set(), cycles = [];
  function visit(id) {
    if (active.has(id)) {cycles.push(id);return;}
    if (visited.has(id) || !byId.has(id)) return;
    active.add(id);
    for (const dependency of byId.get(id).dependencies) visit(dependency);
    active.delete(id);visited.add(id);
  }
  for (const id of taskIds) visit(id);
  return {catalogIds,taskIds,mappedIds,
    catalogDuplicates:duplicates(catalogIds),taskDuplicates:duplicates(taskIds),
    duplicateOwners:duplicates(mappedIds),
    missing:catalogIds.filter(id=>!mappedSet.has(id)),
    unknown:unique(mappedIds.filter(id=>!catalogSet.has(id))),
    unknownPrerequisites:unique(cards.flatMap(card=>card.prerequisiteOwners).filter(id=>!taskSet.has(id))),
    cycles:unique(cycles),
    invalidCards:cards.filter(card=>card.mappings.length!==1 || !card.features.length ||
      !card.phases.length || card.phases.some(phase=>phase<0 || phase>6) ||
      requiredFields.some(field=>!card.body.includes('**'+field+'**')) ||
      !/\bC=[1-5](?!\d)/.test(card.body) || !/\bR=[1-5](?!\d)/.test(card.body) ||
      [...card.body.matchAll(/\b[CR]=(\d+)/g)].some(row=>Number(row[1])<1 || Number(row[1])>5)).map(card=>card.id),
    phases:unique([...plan.matchAll(/^\|\s*(R8\.[0-6])\b/gm)].map(row=>row[1]))};
}

const [catalog,plan] = await Promise.all([readFile(catalogUrl,'utf8'),readFile(planUrl,'utf8')]);

test('R8 catalog has 188 single-owner capabilities, 40 complete tasks and an acyclic phased plan', () => {
  const x = examine(catalog,plan);
  assert.equal(x.catalogIds.length,188);
  assert.deepEqual(x.catalogDuplicates,[]);
  assert.deepEqual(x.taskIds,Array.from({length:40},(_,i)=>'E'+String(i+1).padStart(2,'0')));
  assert.deepEqual(x.taskDuplicates,[]);
  assert.equal(x.mappedIds.length,188);
  assert.deepEqual(x.duplicateOwners,[]);
  assert.deepEqual(x.missing,[]);
  assert.deepEqual(x.unknown,[]);
  assert.deepEqual(x.unknownPrerequisites,[]);
  assert.deepEqual(x.cycles,[]);
  assert.deepEqual(x.invalidCards,[]);
  assert.deepEqual(x.phases,Array.from({length:7},(_,i)=>'R8.'+i));
});

test('omitted deferred capability, duplicate primary ownership and invented capability fail the coverage gate', () => {
  const omitted = plan.replace(/(^- \*\*功能映射\*\*：[^\n]*)\bGM-020\b/gm,'$1');
  assert.notEqual(omitted,plan);
  assert.deepEqual(examine(catalog,omitted).missing,['GM-020']);
  const duplicate = plan.replace(/(^- \*\*功能映射\*\*：)/m,'$1AUTO-001、');
  assert.deepEqual(examine(catalog,duplicate).duplicateOwners,['AUTO-001']);
  const invented = plan.replace(/(^- \*\*功能映射\*\*：)/m,'$1GM-999、');
  assert.deepEqual(examine(catalog,invented).unknown,['GM-999']);
});

test('invalid prerequisite, circular work ordering and duplicate catalog identity are rejected', () => {
  assert.match(plan,/- \*\*前置\*\*：无。/);
  const badOwner = plan.replace('- **前置**：无。','- **前置**：E99。');
  assert.deepEqual(examine(catalog,badOwner).unknownPrerequisites,['E99']);
  const badSliceOwner = plan.replace('- **前置**：无。','- **前置**：E99.1。');
  assert.deepEqual(examine(catalog,badSliceOwner).unknownPrerequisites,['E99']);
  const circular = plan.replace('- **前置**：无。','- **前置**：E02。');
  assert.ok(examine(catalog,circular).cycles.length>0);
  const duplicated = examine(catalog.replace('| INS-003 |','| INS-001 |'),plan);
  assert.ok(duplicated.catalogDuplicates.includes('INS-001'));
  const badRisk = plan.replace('C=2，R=3。','C=6，R=3。');
  assert.deepEqual(examine(catalog,badRisk).invalidCards,['E01']);
  const badPhase = plan.replace('A；R8.0，持续更新','A；R8.9，持续更新');
  assert.notEqual(badPhase,plan);
  assert.deepEqual(examine(catalog,badPhase).invalidCards,['E01']);
  const missingContract = plan.replace('**API / 数据 / 生命周期**','**合同未填写**');
  assert.deepEqual(examine(catalog,missingContract).invalidCards,['E01']);
});
