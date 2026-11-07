'use strict';

const { prepareTaskSpec, validateTaskSpec, validateCandidate, assertAllowedUrl, parseJson, canonical, digest, deepFreeze, fault } = require('./TaskSpec');
const { inspectPage, identityOf } = require('./ConfigExecutor');
const { safeUsage } = require('./Provider');
const { BaseSpider } = require('../core/BaseSpider');
const ScopedDownloader = require('../middleware/ScopedDownloader');
const Request = require('../http/Request');
const Item = require('../item/Item');

function nodeOnly() {
  if (typeof process === 'undefined' || !process.versions?.node) throw fault('UNSUPPORTED_CAPABILITY', 'AI HTTP execution requires Node');
  if (typeof require('crypto').createHash !== 'function') throw fault('UNSUPPORTED_CAPABILITY', 'AI HTTP execution requires Node crypto');
}
function checkTime(deadline, signal) { if (Date.now() >= deadline) throw fault('TIME_BUDGET'); if (signal?.aborted) throw fault('ABORTED'); }
function budgetOptions(raw = {}) {
  const b = { maxModelCalls: 3, maxRepairs: 2, maxMs: 120000, modelTimeoutMs: 20000, maxInputBytes: 65536, maxResponseBytes: 16384, maxDownloadAttempts: 30, ...raw };
  for (const key of Object.keys(raw)) if (!['maxModelCalls', 'maxRepairs', 'maxMs', 'modelTimeoutMs', 'maxInputBytes', 'maxResponseBytes', 'maxDownloadAttempts'].includes(key)) throw fault('BUDGET_SCHEMA');
  for (const [key, value] of Object.entries(b)) if (!Number.isSafeInteger(value) || value < (key === 'maxRepairs' ? 0 : 1) || value > ({ maxModelCalls: 10, maxRepairs: 9, maxMs: 600000, modelTimeoutMs: 600000, maxInputBytes: 262144, maxResponseBytes: 65536, maxDownloadAttempts: 20000 }[key])) throw fault('BUDGET_SCHEMA');
  return b;
}
function ledgerFor(options) { return { limits: options, startedAt: Date.now(), modelAttempts: [], downloadAttempts: [], repairs: 0 }; }
function snapshot(ledger) { return deepFreeze(parseJson({ ...ledger, elapsedMs: Date.now() - ledger.startedAt }, 262144)); }
function isBudget(code) { return /BUDGET|TIMEOUT|ABORTED|PAGE_SIZE|JSON_SIZE/.test(code); }


function scrubEvidence(source, stage) {
  const $ = require('cheerio').load(source.html);
  $('script,style,input,textarea,meta').remove();
  $('*').each((_, node) => {
    for (const name of Object.keys(node.attribs || {})) if (/^(?:on|nonce$|value$|password$|token$)/i.test(name)) $(node).removeAttr(name);
    for (const name of ['href', 'src']) {
      const raw = $(node).attr(name); if (!raw) continue;
      try { const u = new URL(raw, source.url); for (const key of [...u.searchParams.keys()]) if (/key|token|auth|password|secret|session|credential/i.test(key)) u.searchParams.delete(key); $(node).attr(name, u.href); } catch { $(node).removeAttr(name); }
    }
  });
  const u = new URL(source.url); for (const key of [...u.searchParams.keys()]) if (/key|token|auth|password|secret|session|credential/i.test(key)) u.searchParams.delete(key);
  const html = new TextDecoder().decode(new TextEncoder().encode($.html()).slice(0, 16384));
  return { stage, source: { kind: 'http', url: u.href, status: source.status, html } };
}

async function fetchSources(spec, requests, ledger, deadline, signal) {
  if (!Array.isArray(requests) || !requests.length || requests.length > Math.min(spec.limits.maxRequests, 10)) throw fault('REPRESENTATIVE_LIMIT');
  const ids = new Set(); const urls = new Set(); const counts = { list: 0, detail: 0 };
  const planned = requests.map(request => {
    if (!request || Object.keys(request).some(k => !['url', 'id', 'stage'].includes(k)) || !/^[a-zA-Z0-9_-]{1,80}$/.test(request.id) || !['list', 'detail'].includes(request.stage) || ids.has(request.id)) throw fault('REPRESENTATIVE_SCHEMA');
    const url = assertAllowedUrl(request.url, spec); if (urls.has(url)) throw fault('DUPLICATE_PAGE');
    ids.add(request.id); urls.add(url); counts[request.stage]++;
    if (counts.list > spec.limits.maxListPages || counts.detail > (spec.limits.maxDetailPages || 0)) throw fault('REPRESENTATIVE_LIMIT');
    return { ...request, url };
  });
  const controller = new AbortController(); const forward = () => controller.abort();
  if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', forward, { once: true });
  const runDeadline = Math.min(deadline, Date.now() + spec.limits.maxMs);
  const timer = setTimeout(() => controller.abort(), Math.max(1, runDeadline - Date.now()));
  const downloader = new ScopedDownloader(spec, ledger, runDeadline, controller.signal); const pages = [];
  try {
    for (const request of planned) {
      checkTime(runDeadline, controller.signal);
      const response = await downloader.process_request(new Request(request.url, { retries: 0, timeout: spec.limits.requestTimeoutMs }), null);
      pages.push({ id: request.id, stage: request.stage, source: { kind: 'http', url: response.url, status: response.status, html: response.text } });
    }
    return pages;
  } catch (error) { error.pages = pages; throw error; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', forward); }
}
async function fetchRepresentativePages({ taskSpec, requests, budget, signal } = {}) {
  nodeOnly(); const ledger = ledgerFor(budgetOptions(budget));
  try {
    const prepared = prepareTaskSpec(taskSpec || {});
    if (prepared.status === 'needsInput') return { ...prepared, budget: snapshot(ledger) };
    const pages = await fetchSources(prepared.taskSpec, requests, ledger, ledger.startedAt + ledger.limits.maxMs, signal);
    return { status: 'ready', pages, diagnostics: [], budget: snapshot(ledger) };
  } catch (error) { return { status: isBudget(error.code || '') ? 'budgetExhausted' : 'rejected', pages: error.pages || [], diagnostics: [{ code: error.code || 'FETCH_FAILED' }], budget: snapshot(ledger) }; }
}

class ConfigSpider extends BaseSpider {
  constructor(spec, candidate, { ledger, deadline, signal, output = null, exportOptions = {} }) {
    super({ name: 'AIConfig', start_urls: spec.seedUrls, output, exportOptions });
    this.spec = spec; this.candidate = candidate; this.ledger = ledger; this.deadline = deadline; this.signal = signal;
    this.listPageCount = 0; this.detailPageCount = 0; this.itemCount = 0; this.seenIdentities = new Set(); this.requested = new Set(); this.stopReason = null; this.page = null;
  }
  request(url, stage) {
    checkTime(this.deadline, this.signal); url = assertAllowedUrl(url, this.spec);
    if (this.requested.has(url)) throw fault('DUPLICATE_PAGE');
    this.requested.add(url);
    return new Request(url, stage === 'list' ? this.parseList.bind(this) : this.parseDetail.bind(this), { retries: 0, timeout: this.spec.limits.requestTimeoutMs, meta: { stage } });
  }
  start_requests() { return [this.request(this.spec.seedUrls[0], 'list')]; }
  validateRun(runResult) {
    checkTime(this.deadline, this.signal);
    // After the scheduler drains, accepted items may still be pending file publication.
    acceptance({ runResult, stopReason: this.stopReason }, this.spec);
  }
  async inspect(response, context) {
    checkTime(this.deadline, this.signal);
    const loader = require('../item/ItemLoader');
    if (typeof loader.parseConfig !== 'function') throw fault('ITEMLOADER_HOOK_REQUIRED');
    const source = { kind: 'http', html: response.text, url: response.url, status: response.status };
    this.lastEvidence = scrubEvidence(source, context.stage);
    const result = await loader.parseConfig(source, this.candidate, this.spec, { ...context, deadline: this.deadline, signal: this.signal });
    if (result.errorCode) { const error = fault(result.errorCode); error.liveEvidence = this.lastEvidence; throw error; }
    return result;
  }
  async *parseList(response) {
    if (++this.listPageCount > this.spec.limits.maxListPages) throw fault('PAGE_BUDGET');
    const result = await this.inspect(response, { stage: 'list', seenIdentities: [...this.seenIdentities] });
    if (this.itemCount + result.records.length > this.spec.limits.maxItems) throw fault('ITEM_BUDGET');
    this.page = { records: result.records, next: result.next, resolved: [], detailIndex: 0 };
    if (this.spec.mode === 'list-detail' && result.records.length) {
      if (this.detailPageCount + result.records.length > this.spec.limits.maxDetailPages) throw fault('DETAIL_BUDGET');
      const urls = result.records.map(row => assertAllowedUrl(row[this.spec.detail.linkField], this.spec));
      if (new Set(urls).size !== urls.length || urls.some(url => this.requested.has(url))) throw fault('DUPLICATE_PAGE');
      yield this.request(urls[0], 'detail');
    } else { this.page.resolved = result.records; yield* this.finishPage(); }
  }
  async *parseDetail(response) {
    if (++this.detailPageCount > this.spec.limits.maxDetailPages) throw fault('DETAIL_BUDGET');
    const page = this.page; const row = page.records[page.detailIndex];
    const result = await this.inspect(response, { stage: 'detail', listRecord: row });
    if (result.records.length !== 1) throw fault('DETAIL_MISMATCH');
    page.resolved.push({ ...row, ...result.records[0] }); page.detailIndex++;
    if (page.detailIndex < page.records.length) yield this.request(page.records[page.detailIndex][this.spec.detail.linkField], 'detail');
    else yield* this.finishPage();
  }
  async *finishPage() {
    checkTime(this.deadline, this.signal);
    const page = this.page;
    for (const row of page.resolved) { this.seenIdentities.add(identityOf(row, this.spec)); this.itemCount++; yield new Item(row); }
    if (page.next.kind === 'href') {
      if (this.listPageCount >= this.spec.limits.maxListPages || this.itemCount >= this.spec.limits.maxItems) { this.stopReason = 'limit'; return; }
      yield this.request(page.next.url, 'list');
    } else this.stopReason = 'end';
  }
}

function engineFingerprint() {
  nodeOnly();
  return require('./EngineFingerprint')();
}

async function execute(spec, candidate, { ledger, deadline, signal, output = null, exportOptions = {} }) {
  nodeOnly(); const Scrapy = require('../core/Scrapy');
  const startAttempt = ledger.downloadAttempts.length;
  const controller = new AbortController(); const forward = () => controller.abort();
  if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', forward, { once: true });
  const runDeadline = Math.min(deadline, Date.now() + spec.limits.maxMs);
  if (exportOptions.beforePublish !== undefined && typeof exportOptions.beforePublish !== 'function') throw fault('EXPORT_OPTIONS');
  const guardedExportOptions = { ...exportOptions, beforePublish: async delivery => {
    checkTime(runDeadline, controller.signal);
    if (exportOptions.beforePublish) await exportOptions.beforePublish(delivery);
    checkTime(runDeadline, controller.signal);
  } };
  const timer = setTimeout(() => controller.abort(), Math.max(1, runDeadline - Date.now()));
  const spider = new ConfigSpider(spec, candidate, { ledger, deadline: runDeadline, signal: controller.signal, output, exportOptions: guardedExportOptions });
  const scrapy = new Scrapy({ CONCURRENT_REQUESTS: 1, CONCURRENT_REQUESTS_PER_DOMAIN: 1, RETRY_TIMES: 0, middlewares: [new ScopedDownloader(spec, ledger, runDeadline, controller.signal)] });
  scrapy.spider = spider;
  const stop = () => { scrapy.stop(); };
  controller.signal.addEventListener('abort', stop, { once: true });
  let error; let items = [];
  try { if (controller.signal.aborted) throw fault('ABORTED'); items = await scrapy.start(); }
  catch (caught) { error = caught; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', forward); controller.signal.removeEventListener('abort', stop); }
  const result = { items: parseJson(JSON.stringify(items), 10485760), runResult: scrapy.runResult, listPageCount: spider.listPageCount, detailPageCount: spider.detailPageCount, requestCount: ledger.downloadAttempts.length - startAttempt, stopReason: spider.stopReason || (controller.signal.aborted ? Date.now() >= runDeadline ? 'timeBudget' : 'aborted' : 'error') };
  Object.defineProperty(result, 'liveEvidence', { value: spider.lastEvidence });
  if (controller.signal.aborted && !error) error = fault(Date.now() >= runDeadline ? 'TIME_BUDGET' : 'ABORTED');
  if (error) { error.execution = result; throw error; }
  return result;
}
function acceptance(result, spec) {
  const count = result.runResult.counts;
  if (count.accepted !== count.committed + count.pending + count.deliveryUnknown || count.processingPending !== 0 || count.accepted < spec.acceptance.minItems || (spec.acceptance.exactItems !== undefined && count.accepted !== spec.acceptance.exactItems) || (spec.acceptance.requireNaturalEnd && result.stopReason !== 'end')) throw fault('ACCEPTANCE_FAILED');
}
function mergeCandidate(base, override) {
  const result = parseJson(base);
  for (const [key, value] of Object.entries(override)) result[key] = value && typeof value === 'object' && !Array.isArray(value) ? mergeCandidate(result[key] || {}, value) : value;
  return result;
}
function strictGold(cases, candidate, spec) {
  const failures = []; let passed = 0; let alternatePassed = 0;
  for (const page of cases) {
    const result = inspectPage(page.source, candidate, spec, { stage: page.stage, ...page.context });
    const view = { pageState: result.pageState, records: result.records, next: result.next, errorCode: result.errorCode };
    if (canonical(view) !== canonical(page.expected)) failures.push({ id: page.id, code: result.errorCode || 'GOLD_MISMATCH' }); else passed++;
    for (const alternate of page.candidateCases || []) {
      const bad = inspectPage(page.source, mergeCandidate(candidate, alternate.candidateOverride), spec, { stage: page.stage, ...page.context });
      const badView = { pageState: bad.pageState, records: bad.records, next: bad.next, errorCode: bad.errorCode };
      if (canonical(badView) !== canonical(alternate.expected)) failures.push({ id: alternate.id, code: bad.errorCode || 'GOLD_MISMATCH' }); else alternatePassed++;
    }
  }
  return { passed, total: cases.length, alternatePassed, failures };
}
function checkCorpora(train, holdout) {
  if (!Array.isArray(train) || !Array.isArray(holdout) || train.length < 2 || holdout.length < 2) throw fault('GOLD_REQUIRED');
  const training = new Set(); const ids = new Set();
  for (const [split, pages] of [['training', train], ['holdout', holdout]]) {
    for (const page of pages) {
      if (!page.source?.html || !page.expected || !page.id || !page.stage || ids.has(page.id)) throw fault('GOLD_SCHEMA');
      ids.add(page.id); const hash = digest(page.source.html);
      if (split === 'training') training.add(hash); else if (training.has(hash)) throw fault('HOLDOUT_LEAK');
    }
  }
}
async function modelAttempt(provider, input, ledger, deadline, signal) {
  checkTime(deadline, signal);
  if (ledger.modelAttempts.length >= ledger.limits.maxModelCalls) throw fault('MODEL_CALL_BUDGET');
  if (!provider || typeof provider.generate !== 'function') throw fault('PROVIDER_REQUIRED');
  if (new TextEncoder().encode(canonical(input)).length > ledger.limits.maxInputBytes) throw fault('INPUT_BUDGET');
  const controller = new AbortController(); const forward = () => controller.abort();
  signal?.addEventListener('abort', forward, { once: true });
  const attempt = { attempt: ledger.modelAttempts.length + 1, purpose: input.purpose, startedAt: Date.now(), outcome: 'running' };
  ledger.modelAttempts.push(attempt);
  const timeoutMs = Math.max(1, Math.min(ledger.limits.modelTimeoutMs, deadline - Date.now()));
  let timer;
  const aborted = new Promise((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(fault(signal?.aborted ? 'ABORTED' : Date.now() >= deadline ? 'TIME_BUDGET' : 'MODEL_TIMEOUT')), { once: true });
    timer = setTimeout(() => controller.abort(), timeoutMs);
  });
  try {
    const pending = Promise.resolve().then(() => provider.generate({ ...input, signal: controller.signal }));
    const result = await Promise.race([pending, aborted]);
    checkTime(deadline, signal);
    if (typeof result?.modelId === 'string') attempt.modelId = result.modelId.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 120);
    if (typeof result?.rawJson !== 'string') throw fault('PROVIDER_RESPONSE');
    const candidate = parseJson(result.rawJson, ledger.limits.maxResponseBytes);
    if (result.usage) attempt.usage = safeUsage(result.usage);
    attempt.outcome = 'ok'; return candidate;
  } catch (error) { attempt.outcome = error.code || 'MODEL_FAILED'; throw fault(attempt.outcome); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', forward); attempt.finishedAt = Date.now(); attempt.elapsedMs = attempt.finishedAt - attempt.startedAt; }
}
function taskView(spec) {
  const view = parseJson(spec);
  delete view.seedUrlsBySplit; delete view.purpose; delete view.expectedDelivery;
  for (const stage of ['list', 'detail']) if (view[stage]) {
    delete view[stage].container; delete view[stage].record;
    for (const field of Object.values(view[stage].fields)) for (const key of ['selector', 'read', 'attr']) delete field[key];
  }
  for (const key of ['ready', 'empty', 'login', 'error']) delete view.states[key];
  for (const key of ['selector', 'disabledSelector', 'endSelector']) delete view.pagination[key];
  return view;
}
async function specStage({ goalText, requirements, provider, signal }, ledger, deadline) {
  if (typeof goalText !== 'string' || !goalText.trim()) return { status: 'needsInput', missing: ['goalText'] };
  const authority = parseJson(requirements || {}, 65536);
  authority.goal = goalText.trim();
  const prepared = prepareTaskSpec(authority);
  if (prepared.status === 'needsInput') return prepared;
  const raw = await modelAttempt(provider, { purpose: 'task-spec', goalText, requirements: prepared.taskSpec, pages: [], feedback: [], limits: { timeoutMs: ledger.limits.modelTimeoutMs, maxResponseBytes: ledger.limits.maxResponseBytes, remainingCalls: ledger.limits.maxModelCalls - ledger.modelAttempts.length } }, ledger, deadline, signal);
  // The model may express the goal in words; all authoritative business/data facts must match.
  const facts = spec => { const value = parseJson(spec); delete value.goal; delete value.purpose; return value; };
  let taskSpec;
  try { taskSpec = validateTaskSpec(raw); } catch { throw fault('SPEC_AUTHORITY_MISMATCH'); }
  if (canonical(facts(taskSpec)) !== canonical(facts(prepared.taskSpec))) throw fault('SPEC_AUTHORITY_MISMATCH');
  return { status: 'ready', taskSpec };
}
async function generateTaskSpec({ goalText, requirements, provider, budget, signal } = {}) {
  nodeOnly(); const ledger = ledgerFor(budgetOptions(budget));
  try {
    const result = await specStage({ goalText, requirements, provider, signal }, ledger, ledger.startedAt + ledger.limits.maxMs);
    return { ...result, budget: snapshot(ledger) };
  } catch (error) { return { status: isBudget(error.code || '') ? 'budgetExhausted' : 'rejected', diagnostics: [{ code: error.code || 'SPEC_GENERATION_FAILED' }], budget: snapshot(ledger) }; }
}
async function discoverConfig({ taskSpec, goalText, requirements, trainCases, holdoutCases, representativeRequests, provider, trial, budget, signal } = {}) {
  nodeOnly();
  const options = budgetOptions(budget); const ledger = ledgerFor(options); const deadline = ledger.startedAt + options.maxMs;
  const reports = { trainingAttempts: [], holdoutAttempts: [], trialAttempts: [] }; let live;
  const reject = error => ({ status: isBudget(error.code || '') ? 'budgetExhausted' : 'rejected', diagnostics: [{ code: error.code || 'DISCOVERY_FAILED' }], reports, ...(live || error.execution ? { trial: live || error.execution } : {}), budget: snapshot(ledger) });
  try {
    const prepared = taskSpec ? prepareTaskSpec(taskSpec) : await specStage({ goalText, requirements, provider, signal }, ledger, deadline);
    if (prepared.status === 'needsInput') return { ...prepared, budget: snapshot(ledger) };
    const spec = prepared.taskSpec;
    checkCorpora(trainCases, holdoutCases);
    const pages = trainCases.map(page => ({ id: page.id, stage: page.stage, source: page.source }));
    if (representativeRequests) {
      const holdoutRoutes = new Set(holdoutCases.map(page => { const url = new URL(page.source.url); return url.pathname + url.search; }));
      for (const request of representativeRequests) { const url = new URL(assertAllowedUrl(request.url, spec)); if (holdoutRoutes.has(url.pathname + url.search)) throw fault('HOLDOUT_LEAK'); }
      const fetched = await fetchSources(spec, representativeRequests, ledger, deadline, signal);
      const holdoutHashes = new Set(holdoutCases.map(page => digest(page.source.html)));
      for (const page of fetched) {
        if (holdoutHashes.has(digest(page.source.html))) throw fault('HOLDOUT_LEAK');
        pages.push({ id: page.id, ...scrubEvidence(page.source, page.stage) });
      }
      reports.representativeCount = fetched.length;
    }
    if (new TextEncoder().encode(canonical(pages)).length > options.maxInputBytes) throw fault('INPUT_BUDGET');
    let candidate; let feedback = [];
    const repair = () => {
      checkTime(deadline, signal);
      if (ledger.repairs >= options.maxRepairs || ledger.modelAttempts.length >= options.maxModelCalls) throw fault('REPAIR_BUDGET');
      ledger.repairs++;
    };
    for (;;) {
      checkTime(deadline, signal);
      try {
        candidate = validateCandidate(await modelAttempt(provider, { purpose: 'candidate', taskView: taskView(spec), pages, feedback, limits: { timeoutMs: options.modelTimeoutMs, maxResponseBytes: options.maxResponseBytes, remainingCalls: options.maxModelCalls - ledger.modelAttempts.length } }, ledger, deadline, signal), spec);
        reports.training = strictGold(trainCases, candidate, spec); reports.trainingAttempts.push(reports.training);
      } catch (error) {
        if (isBudget(error.code || '')) throw error;
        feedback = [{ code: error.code || 'CANDIDATE_FAILED' }];
        repair(); continue;
      }
      if (reports.training.failures.length) { feedback = reports.training.failures; repair(); continue; }
      checkTime(deadline, signal);
      reports.holdout = strictGold(holdoutCases, candidate, spec); reports.holdoutAttempts.push(reports.holdout);
      if (reports.holdout.failures.length) throw fault('HOLDOUT_FAILED');
      if (!trial || !['synthetic-http', 'business-http'].includes(trial.evidenceKind)) throw fault('TRIAL_REQUIRED');
      if (trial.evidenceKind === 'synthetic-http' && !Array.isArray(trial.expectedRecords)) throw fault('TRIAL_GOLD_REQUIRED');
      const trialLimits = { ...spec.limits };
      const caps = { maxListPages: 3, maxDetailPages: 10, maxItems: 20, maxRequests: 15, maxMs: 30000 };
      for (const [name, cap] of Object.entries(caps)) {
        if (name === 'maxDetailPages' && spec.mode === 'list') { trialLimits[name] = 0; continue; }
        const requested = trial.limits?.[name] ?? Math.min(spec.limits[name] ?? cap, cap);
        if (!Number.isSafeInteger(requested) || requested < 1 || requested > cap || requested > (spec.limits[name] ?? cap)) throw fault('TRIAL_LIMIT');
        trialLimits[name] = requested;
      }
      if (trial.limits && Object.keys(trial.limits).some(key => !(key in caps))) throw fault('TRIAL_LIMIT');
      trialLimits.requestTimeoutMs = Math.min(trialLimits.requestTimeoutMs, trialLimits.maxMs);
      const trialAcceptance = trial.acceptance || { minItems: trial.expectedRecords?.length ?? Math.min(spec.acceptance.minItems, trialLimits.maxItems), ...(trial.expectedRecords ? { exactItems: trial.expectedRecords.length } : {}), requireNaturalEnd: false };
      const trialSpec = validateTaskSpec({ ...spec, limits: trialLimits, acceptance: trialAcceptance });
      try {
        live = await execute(trialSpec, candidate, { ledger, deadline, signal });
        acceptance(live, trialSpec);
        if (!live.requestCount) throw fault('TRIAL_REQUIRED');
        if (live.runResult.counts.pending || live.runResult.counts.deliveryUnknown || live.runResult.counts.accepted !== live.runResult.counts.committed) throw fault('TRIAL_DELIVERY');
        if (trial.expectedRecords && canonical(live.items) !== canonical(trial.expectedRecords)) throw fault('TRIAL_GOLD_MISMATCH');
        for (const [name, actual] of [['requestCount', live.requestCount], ['listPageCount', live.listPageCount], ['detailPageCount', live.detailPageCount]]) if (trial[name] !== undefined && trial[name] !== actual) throw fault('TRIAL_COUNT');
        reports.trialAttempts.push({ outcome: 'ok', requestCount: live.requestCount }); break;
      } catch (error) {
        live = error.execution || live;
        reports.trialAttempts.push({ outcome: error.code || 'TRIAL_FAILED', requestCount: live?.requestCount || 0 });
        const repairable = ['CONTAINER_CARDINALITY', 'FIELD_CARDINALITY', 'FIELD_REQUIRED', 'PAGE_NOT_READY', 'PAGE_EMPTY', 'ERROR_REGION_SELECTED', 'NEXT_MISSING', 'NEXT_CARDINALITY', 'NEXT_CONFLICT', 'TRIAL_GOLD_MISMATCH'].includes(error.code);
        const liveEvidence = error.liveEvidence || live?.liveEvidence;
        if (!repairable || !liveEvidence) throw error;
        feedback = [{ code: error.code, liveEvidence }];
        repair();
      }
    }
    checkTime(deadline, signal);
    const payload = { schemaVersion: 1, taskSpec: spec, candidate, engineFingerprint: engineFingerprint(), goldHash: digest({ train: trainCases.map(p => ({ source: p.source, expected: p.expected, context: p.context || null, candidateCases: p.candidateCases || [] })), holdout: holdoutCases.map(p => ({ source: p.source, expected: p.expected, context: p.context || null, candidateCases: p.candidateCases || [] })) }), evidence: { providerKind: provider.kind || 'injected', trialKind: trial.evidenceKind, modelVerified: false }, reports, trial: { listPageCount: live.listPageCount, detailPageCount: live.detailPageCount, requestCount: live.requestCount, itemCount: live.runResult.counts.accepted, stopReason: live.stopReason, ackLevel: live.runResult.delivery.ackLevel } };
    const version = deepFreeze({ ...parseJson(payload, 262144), versionId: digest(payload) });
    checkTime(deadline, signal);
    return { status: 'frozen', version, reports, trial: live, budget: snapshot(ledger) };
  } catch (error) { return reject(error); }
}
async function runFrozen({ version, output = null, exportOptions = {}, signal } = {}) {
  nodeOnly(); const copy = parseJson(version, 262144); const { versionId, ...payload } = copy;
  if (!versionId || digest(payload) !== versionId) throw fault('VERSION_HASH');
  if (canonical(payload.engineFingerprint) !== canonical(engineFingerprint())) throw fault('ENGINE_MISMATCH');
  if (!payload.trial || payload.trial.requestCount < 1 || !['synthetic-http', 'business-http'].includes(payload.evidence?.trialKind)) throw fault('TRIAL_REQUIRED');
  const spec = validateTaskSpec(payload.taskSpec); const candidate = validateCandidate(payload.candidate, spec);
  if (output && (!/\.(json|jsonl|csv)$/i.test(output) || !output.toLowerCase().endsWith('.' + spec.format))) throw fault('OUTPUT_FORMAT');
  const ledger = ledgerFor(budgetOptions({ maxMs: spec.limits.maxMs, maxDownloadAttempts: spec.limits.maxRequests }));
  let result;
  try {
    result = await execute(spec, candidate, { ledger, deadline: ledger.startedAt + spec.limits.maxMs, signal, output, exportOptions });
    acceptance(result, spec);
    return { ...result, versionId, evidence: payload.evidence, budget: snapshot(ledger) };
  } catch (error) { error.execution ||= result; error.budget = snapshot(ledger); throw error; }
}
module.exports = { generateTaskSpec, fetchRepresentativePages, discoverConfig, runFrozen, ConfigSpider, ScopedDownloader, strictGold };
