// Prevent falsely shifting a competitor's public feature date when marketing for "world first".
// Static source review only. Passing this test cannot verify product ranking or a real Chrome run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const readJson=path=>JSON.parse(readFileSync(new URL('../../'+path,import.meta.url),'utf8'));
const readMd=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');

test('Anthropic recorded Chrome workflows were documented by Dec 18, 2025—not the unrelated July 24, 2026 model release',()=>{
  const timeline=readJson('docs/product/browser-extension-ecosystem/competitor-timeline.json');
  const claude=timeline.competitors.find(x=>x.id==='claude-in-chrome');
  assert.ok(claude);
  assert.equal(claude.firstReleasedAt,null,'earliest overall release remains unknown');
  assert.equal(claude.latestPreviewAt,null,'latest version not inferred from historical feature notes');
  assert.equal(claude.r5FeatureProof.date,'2025-12-18');
  assert.equal(claude.r5FeatureProof.dateSemantics,'EARLIEST_DATED_OFFICIAL_EVIDENCE_VERIFIED_HERE_NOT_ABSOLUTE_FEATURE_FIRST');
  assert.equal(claude.r5FeatureTimeline.find(x=>x.feature.startsWith('Scheduled'))?.documentedAt,'2025-11-24');
  assert.equal(claude.r5FeatureTimeline.find(x=>x.feature.startsWith('Record'))?.documentedAt,'2025-12-18');
  assert.ok(claude.verifiedSources.includes('https://support.claude.com/en/articles/12138966-release-notes'));
  assert.equal(claude.r5AgainstGF007.modelFreeRerun,'UNKNOWN_NOT_MEASURED');
});

test('GF and public strategy never claim historical novelty based on a misdated Chrome competitor',()=>{
  const ledger=readJson('docs/product/browser-extension-ecosystem/first-claims-ledger.json');
  const gf=ledger.claims.find(x=>x.id==='GF-007');
  assert.equal(gf.publicUseAllowed,false);
  assert.ok(gf.counterexamples.some(x=>x.includes('December 18, 2025')));
  assert.equal(gf.r5CriticalCounterexample.correctedClaudeEvidence.officialRecordingDocumented,'2025-12-18');
  assert.equal(gf.r5CriticalCounterexample.correctedClaudeEvidence.earlierBrowserSchedulingAndPlanApproval,'2025-11-24');
  assert.deepEqual(ledger.approvedClaimIds,[]);
  assert.match(readMd('docs/product/browser-extension-ecosystem/global-first-r5-portfolio.zh-CN.md'),/Claude.+2025-12-18/);
});

test('research source and pre-registered benchmark distinguish historical beta evidence from latest stable availability',()=>{
  const source=readJson('docs/framework/workstreams/evidence/global-first-r5-20261013/source-index.json');
  const row=source.sourceEvidence.find(x=>x.id==='claude-in-chrome');
  assert.equal(row.eventDate,'2025-12-18');
  assert.equal(row.firstPublicFeatureClaim,false,'dated documentation is not proof of historical first');
  assert.equal(row.firstFeatureHistoricalCompleteness,'UNKNOWN');
  const benchmark=readJson('docs/framework/workstreams/evidence/global-first-r5-20261013/benchmark-contract.json');
  const candidate=benchmark.comparatorWorkflows.find(x=>x.id==='claude-in-chrome');
  assert.match(candidate.channel,/2025-12-18/);
  assert.equal(candidate.firstReleaseClaimAllowed,false);
  assert.deepEqual(benchmark.actualCompetitorTrials,[]);
});
