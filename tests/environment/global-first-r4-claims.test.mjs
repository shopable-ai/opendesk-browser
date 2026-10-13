import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const base = path.join(root, 'docs/product/browser-extension-ecosystem');
const evidencePath = path.join(root, 'docs/framework/workstreams/evidence/global-first-r4-20261013/research-evidence.json');
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const ledger = json(path.join(base, 'first-claims-ledger.json'));
const timeline = json(path.join(base, 'competitor-timeline.json'));
const evidence = json(evidencePath);

test('R4 reuses the authoritative single GF ledger and does not approve disproved claims', () => {
  assert.equal(ledger.schemaVersion, 'opendesk.first-claims.v1');
  assert.equal(new Set(ledger.claims.map(row => row.id)).size, ledger.claims.length);
  for (const id of ['GF-013','GF-014']) {
    const row = ledger.claims.find(item => item.id === id);
    assert.ok(row);
    assert.equal(row.status, 'DISPROVED_BY_EXISTING_COMPETITORS');
    assert.equal(row.publicUseAllowed, false);
    assert.ok(!ledger.approvedClaimIds.includes(id));
  }
  for (const id of ledger.approvedClaimIds) {
    const row = ledger.claims.find(item => item.id === id);
    assert.ok(row, 'approved id must exist: ' + id);
    assert.equal(row.status, 'CLAIM_APPROVED');
    assert.equal(row.publicUseAllowed, true);
    assert.ok(row.productEvidence?.length > 0, 'approved claim requires evidence');
  }
  assert.equal(evidence.authoritativeClaimsLedger, 'docs/product/browser-extension-ecosystem/first-claims-ledger.json');
});

test('R4 TOP5 are strategic candidates, not untested world rankings', () => {
  const items = ledger.r4AiFirst?.topFive;
  assert.equal(items?.length, 5);
  assert.deepEqual(items.map(item => item.order), [1,2,3,4,5]);
  assert.deepEqual(items[0].ids, ['GF-007']);
  assert.ok(items.every(item => item.strongestCounterexample && item.remainingGap));
  for (const row of items) {
    assert.ok(row.score === 'NOT_SCORED' || row.rankVerified === true);
    assert.ok(row.rankVerified !== true || row.competitorBenchmarkEvidence?.length > 0);
  }
});

test('R4 competitor timeline maintains unique names, separate release channels and primary sources', () => {
  assert.ok(timeline.competitors.length >= 30);
  assert.equal(new Set(timeline.competitors.map(row => row.id)).size, timeline.competitors.length);
  const scriptcat = timeline.competitors.find(row => row.id === 'scriptcat');
  const violentmonkey = timeline.competitors.find(row => row.id === 'violentmonkey');
  const uipath = timeline.competitors.find(row => row.id === 'uipath-delegate');
  const browseros = timeline.competitors.find(row => row.id === 'browseros-neo');
  assert.ok(scriptcat?.r4FeatureTimeline?.some(row => row.firstPublicFeatureAt === '2026-08-06' && row.channel === 'BETA'));
  assert.ok(violentmonkey?.r4FeatureTimeline?.some(row => row.firstPublicFeatureAt === '2026-10-10' && row.channel === 'BETA'));
  assert.equal(uipath?.latestPreviewAt, '2026-08-25');
  assert.equal(uipath?.latestStableAt, null);
  assert.equal(uipath?.generallyAvailableSince,'2026-09-22',
    'August preview cannot obscure official September GA');
  assert.ok(uipath.verifiedSources.some(url=>url.endsWith('/september-2026')));
  const claude=timeline.competitors.find(row=>row.id==='claude-in-chrome');
  assert.equal(claude?.generallyAvailableSince,'2026-08-26');
  assert.ok(scriptcat.r4FeatureTimeline.some(row=>row.channel==='BETA' &&
    row.feature.includes('full-screen code viewer')));
  assert.equal(browseros?.latestStableAt, null); // BrowserClaw component != full browser release
  assert.ok(timeline.competitors.every(row => row.verifiedSources?.length > 0));
});

test('R4 SEO pages exist with honest availability limits and unrun search evidence', () => {
  assert.ok(evidence.dualTripleFactorOpportunityCount >= 20);
  assert.ok(evidence.seoQueries.length >= 20);
  const names = [
    'ai-to-reusable-browser-task',
    'reviewable-versioned-browser-tools',
    'ai-created-page-tools-and-tasks',
    'ai-edited-multifile-browser-workflow',
    'seller-browser-workflow-assistant'
  ];
  for (const slug of names) {
    const file = path.join(base, 'seo', slug + '.zh-CN.md');
    assert.equal(existsSync(file), true, 'missing user evidence page: ' + slug);
    const text = readFileSync(file,'utf8');
    assert.ok(text.includes('NOT_TESTED') && text.includes('English') && text.includes('用户'));
  }
  for (const q of evidence.seoQueries) {
    assert.ok(q.query && q.language && q.region);
    assert.ok(['NOT_TESTED', 'TESTED'].includes(q.google));
    assert.ok(['NOT_TESTED', 'TESTED'].includes(q.bing));
  }
});

test('R4 never promotes a candidate or previous model result to a Chrome installation receipt', () => {
  assert.ok(evidence.demo.existingTask.endsWith('.opendesk-task.json'));
  assert.match(evidence.demo.candidateSourceHash, /^[0-9a-f]{64}$/);
  assert.match(evidence.demo.candidateManifestHash, /^[0-9a-f]{64}$/);
  if (evidence.demo.rawNativeRuns.length === 0) assert.match(evidence.demo.status, /NOT_TESTED/);
  assert.equal(evidence.localMacStatus, 'LOCAL_NOT_INSPECTED');
});
