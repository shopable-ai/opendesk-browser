import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {nativeFailureOutcome} from './k5-controller-product-native-outcome.mjs';

// Scheduling/evidence only. Every effect is performed by the existing native
// product runner's trusted UI/Worker/CDP helpers in its one owned browser.
export const CONTROLLER_CAMPAIGNS = Object.freeze({mixed: 1000, reconnect: 10, pluginDisabled: 2});
export const RESOURCE_KEYS = Object.freeze(['pending', 'timers', 'subscriptions', 'ports', 'workers', 'blobs']);
const kinds = ['success', 'error', 'timeout', 'cancel', 'navigation'];
const expectedByKind = Object.freeze({success: 'completed unique marker', error: 'failed unique throw',
  timeout: 'E_TIMEOUT at original product deadline', cancel: 'E_CANCELLED after actual UI stop',
  navigation: 'E_DOCUMENT_REPLACED after exact native navigation',
  host: 'actual host close/reopen, durable original and fresh successful Worker',
  sw: 'exact native SW stop/destruction/recovery, durable original and fresh successful Worker',
  'plugin-disabled': 'template unregistered, successful ordinary JS and standalone SDK original Promise'});

export function requireResourceCounts(observation) {
  if (!observation || !RESOURCE_KEYS.every(key => Number.isInteger(observation.counts?.[key]) && observation.counts[key] >= 0)) {
    throw Object.assign(new Error('Actual six-count product lifecycle observation is absent/incomplete'),
      {code: 'E_CAMPAIGN_OBSERVATION_MISSING', actual: observation});
  }
  return Object.fromEntries(RESOURCE_KEYS.map(key => [key, observation.counts[key]]));
}

export async function runControllerCampaigns({sessionId, environmentId, bindings, preconditions,
  observeResources, execute, saveRound, saveManifest, keepAlive, log}) {
  const manifest = {sessionId, environmentId, requested: {...CONTROLLER_CAMPAIGNS},
    campaigns: {mixed: [], reconnect: [], pluginDisabled: []}, rounds: [], records: [],
    status: 'RUNNING', nativePass: false};
  await saveManifest(manifest);
  for (const [campaign, count] of Object.entries(CONTROLLER_CAMPAIGNS)) {
    for (let index = 0; index < count; index++) {
      const kind = campaign === 'mixed' ? kinds[index % kinds.length] : campaign === 'reconnect' ? index % 2 ? 'sw' : 'host' : 'plugin-disabled';
      const id = `CAMPAIGN-${campaign.toUpperCase()}-${String(index + 1).padStart(4, '0')}`;
      const round = {id, campaign, index: index + 1, kind, roundId: randomUUID(), sessionId,
        environmentId, startedAt: Date.now(), startMs: performance.now(), status: 'RUNNING',
        input: {campaign, kind, index: index + 1}, expected: expectedByKind[kind], preconditions,
        actual: null, cleanup: null, bindings};
      manifest.campaigns[campaign].push(id);
      // Persist the occurrence before any admission. Interrupted execution can
      // never be mistaken for a completed round or silently retried as PASS.
      await saveRound(round);
      try {
        keepAlive();
        round.resourcesBefore = await observeResources();
        const before = requireResourceCounts(round.resourcesBefore);
        if (!manifest.baseline) manifest.baseline = before;
        assert.deepEqual(before, manifest.baseline, 'Resource counts cannot creep between rounds or recovery boundaries');
        round.actual = await execute({kind, roundId: round.roundId, index: index + 1, campaign,
          async checkpoint(actual) { round.actual = actual; if (actual?.input) round.input = {...round.input, ...actual.input}; await saveRound(round); }});
        round.resourcesAfter = await observeResources();
        const after = requireResourceCounts(round.resourcesAfter);
        round.cleanup = {before, after};
        assert.deepEqual(after, before, 'Actual pending/timers/subscriptions/ports/workers/blobs must return to baseline');
        keepAlive(); round.status = 'PASS';
      } catch (error) {
        Object.assign(round, nativeFailureOutcome(error));
        round.error = {code: error.code, name: error.name, message: error.message, stack: error.stack, actual: error.actual};
      }
      round.endMs = performance.now(); round.finishedAt = Date.now();
      const evidence = await saveRound(round);
      const observation = {environmentId, pass: round.status === 'PASS', preconditions: {...preconditions, baseline: manifest.baseline}, input: round.input,
        expected: round.expected, actual: round.actual, cleanup: round.cleanup, evidence: [evidence],
        occurrence: {roundId: round.roundId, sessionId, resultId: id, evidence,
          pointer: '/round', startMs: round.startMs, endMs: round.endMs}};
      manifest.records.push({id, kind, layer: 'native-product', pass: observation.pass,
        productPackageSha256: bindings.packageHash, packageDrift: null, sourceDrift: null,
        observations: [observation]});
      manifest.rounds.push({id, kind, status: round.status, occurrence: observation.occurrence, evidence});
      log({state: 'campaign-round', campaign, id, kind, status: round.status});
      await saveManifest(manifest);
      if (round.status !== 'PASS') {
        manifest.status = round.status; manifest.stoppedAt = id;
        manifest.remainingNotTested = Object.fromEntries(Object.entries(CONTROLLER_CAMPAIGNS)
          .map(([name, total]) => [name, total - manifest.campaigns[name].length]));
        await saveManifest(manifest); return manifest;
      }
    }
  }
  manifest.status = 'PASS'; manifest.nativePass = true;
  await saveManifest(manifest); return manifest;
}
