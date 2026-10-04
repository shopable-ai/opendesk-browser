#!/usr/bin/env node
"use strict";

/*
 * Offline contracts against the CURRENT checked-in bundle, not a replacement SDK.
 * node test/devflow-contract.cjs [--mode=required|diagnostic|strict] [--sdk=/absolute/candidate.js] [--json]
 * Exit: 0 selected contracts pass, 1 any observed defect/failure, 64 invalid CLI.
 * Known defects are NEVER PASS. --sdk checks a candidate, not the installed asset.
 *
 * VM executes the full SDK, ChromePage and popup scripts. The worker bootstrap
 * executes with other importScripts recorded, not loaded. Background functions
 * and its runtime listener are lifted verbatim from the current bundle to avoid
 * unrelated startup/network work. Chrome APIs, CSS DOM fixture, structured clone,
 * URL/download capabilities and clocks are doubles. This is NOT browser success,
 * full worker initialization, CSP validation or an upstream SDK build test.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const { inspectExtension } = require("../scripts/extension-check.cjs");

const ROOT = path.resolve(__dirname, "..");
const FILE = {
  worker: "background-sw.js", background: "background.js",
  sdk: "assets/js/plugins/scrapyJs.js", page: "assets/js/plugins/ChromePage.js",
  popup: "www/popup_crawl.js"
};
const sources = Object.fromEntries(Object.entries(FILE).map(([key, file]) =>
  [key, fs.readFileSync(path.join(ROOT, file), "utf8")]));
let sdkExecutionPath = path.join(ROOT, FILE.sdk);
const clone = (value) => structuredClone(value);
const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 32; i++) await Promise.resolve(); };

function evidence(key, needle) {
  return { key, needles: Array.isArray(needle) ? needle : [needle] };
}
function locate(ref, sdkFile) {
  if (typeof ref === "string") return ref;
  const source = sources[ref.key];
  const needle = ref.needles.find((candidate) => source.includes(candidate));
  assert.ok(needle, `evidence anchor missing: ${FILE[ref.key]} ${ref.needles.join(" OR ")}`);
  const file = ref.key === "sdk" ? sdkFile : FILE[ref.key];
  return `${file}:${source.slice(0, source.indexOf(needle)).split("\n").length}`;
}

// Compile incremental candidates rather than guessing balanced braces in strings.
// Fail closed if a named function disappears or cannot be extracted.
function lift(context, key, name) {
  const source = sources[key];
  const match = new RegExp(`(?:async )?function ${name}\\s*\\(`).exec(source);
  assert.ok(match, `function missing: ${FILE[key]} ${name}`);
  let end = source.indexOf("\n", match.index);
  while (end >= 0) {
    const candidate = source.slice(match.index, end);
    let valid = false;
    try { new vm.Script(`(${candidate})`); valid = true; } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    if (valid) {
      vm.runInContext(candidate, context, {
        filename: FILE[key], lineOffset: source.slice(0, match.index).split("\n").length - 1,
        timeout: 1000
      });
      return;
    }
    end = source.indexOf("\n", end + 1);
  }
  throw new Error(`cannot extract ${name}`);
}

function event() {
  const listeners = new Set();
  return {
    listeners,
    addListener(fn) { listeners.add(fn); },
    removeListener(fn) { listeners.delete(fn); },
    hasListener(fn) { return listeners.has(fn); },
    emit(...args) { return [...listeners].map((fn) => fn(...args)); }
  };
}

function clock() {
  let now = 0, serial = 0;
  const timers = new Map();
  const set = (fn, ms, interval, args) => {
    const id = ++serial;
    timers.set(id, { fn, due: now + Math.max(0, Number(ms) || 0), interval, args });
    return id;
  };
  const FakeDate = class extends Date {
    constructor(...args) { super(...(args.length ? args : [1700000000000 + now])); }
    static now() { return 1700000000000 + now; }
  };
  return {
    timers, Date: FakeDate,
    setTimeout: (fn, ms, ...args) => set(fn, ms, 0, args),
    setInterval: (fn, ms, ...args) => set(fn, ms, Math.max(1, Number(ms) || 1), args),
    clearTimeout: (id) => timers.delete(id), clearInterval: (id) => timers.delete(id),
    async advance(ms) {
      const until = now + ms;
      let iterations = 0;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.due <= until)
          .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (!next) break;
        assert.ok(++iterations < 1000, "fake clock runaway");
        const [id, timer] = next;
        now = timer.due;
        if (timer.interval) timer.due += timer.interval;
        else timers.delete(id);
        timer.fn(...timer.args);
        await flush();
      }
      now = until;
      await flush();
    }
  };
}

function sandbox(timer) {
  const logs = [];
  const quiet = Object.fromEntries(["log", "warn", "error", "info", "debug"].map((level) =>
    [level, (...args) => logs.push({ level, text: args.map(String).join(" ") })]));
  const context = vm.createContext({
    console: quiet, URL, Blob, TextEncoder, TextDecoder, AbortController, Date: timer.Date,
    setTimeout: timer.setTimeout, clearTimeout: timer.clearTimeout,
    setInterval: timer.setInterval, clearInterval: timer.clearInterval,
    fetch() { throw new Error("OFFLINE: fetch is forbidden"); }
  });
  return { context, logs };
}

class Element {
  constructor(tag = "div", text = "") {
    this.tagName = tag.toUpperCase(); this.textContent = text; this.innerText = text;
    this.children = []; this.style = {}; this.dataset = {}; this.attributes = {};
    this.handlers = new Map(); this.classList = { add() {}, remove() {}, contains() { return false; } };
    this.value = ""; this.disabled = false; this.scrollHeight = 100; this._html = "";
  }
  set innerHTML(value) { this._html = value; this.children = []; }
  get innerHTML() { return this._html; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; }
  addEventListener(type, fn) { this.handlers.set(type, fn); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, value) { this.attributes[name] = value; }
  async click() { return this.handlers.get("click")?.(); }
}

function pageFixture(rows) {
  const list = new Element();
  list.children = rows.map((row) => {
    const container = new Element("article");
    container.querySelectorAll = (selector) => {
      const key = selector === ".title" ? "title" : selector === ".price" ? "price" : null;
      return key && row[key] !== undefined ? [new Element("span", String(row[key]))] : [];
    };
    return container;
  });
  const body = new Element("body");
  body.innerHTML = "<div id='list'>offline CSS fixture</div>";
  return { body, readyState: "complete", querySelector: (selector) => selector === "#list" ? list : null };
}

function mockChrome(pageContext) {
  const onMessage = event(), onUpdated = event(), onChanged = event();
  const calls = { injections: [], downloads: [], removedTabs: [], messages: [] };
  const chrome = {
    runtime: { onMessage, getURL: (name) => `chrome-extension://offline/${name}`, lastError: null },
    tabs: {
      onUpdated, query(_query, cb) { cb([{ id: 7, url: "https://fixture.invalid/list" }]); },
      get(id, cb) { cb({ id, url: "https://fixture.invalid/list" }); },
      remove(id) { calls.removedTabs.push(id); }
    },
    storage: { onChanged, local: { get(_keys, cb) { cb({}); }, set(_value, cb) { cb?.(); }, remove(_keys, cb) { cb?.(); } } },
    webNavigation: { onCompleted: event(), onDOMContentLoaded: event() },
    webRequest: { onCompleted: event() },
    downloads: { download(options, cb) { calls.downloads.push(options); cb(1); } },
    scripting: { executeScript(options, cb) {
      calls.injections.push(options);
      // Run the actual injected FUNCTION in a separate VM with cloned args.
      // A VM permits code generation; this explicitly says nothing about CSP.
      try {
        pageContext.__injectionArgs = clone(options.args || []);
        const value = vm.runInContext(`(${options.func.toString()})(...__injectionArgs)`, pageContext, { timeout: 1000 });
        Promise.resolve(value).then((result) => cb([{ result: clone(result) }]), fail);
      } catch (error) { fail(error); }
      function fail(error) {
        chrome.runtime.lastError = { message: error.message || String(error) };
        try { cb([]); } finally { chrome.runtime.lastError = null; }
      }
    } }
  };
  return { chrome, calls };
}

function runtime(rows = [{ title: "A,\"B\"\nC", price: 0 }]) {
  const timer = clock();
  const pageVM = sandbox(timer).context;
  pageVM.document = pageFixture(rows);
  pageVM.window = { location: { href: "https://fixture.invalid/list" } };
  pageVM.Node = { ATTRIBUTE_NODE: 2 };
  const { chrome, calls } = mockChrome(pageVM);
  const { context, logs } = sandbox(timer);
  context.chrome = chrome;
  // Service worker URL/Blob exist; DOM, FileReader and object URLs do not.
  context.URL = class WorkerURL extends URL {
    static createObjectURL = undefined;
    static revokeObjectURL = undefined;
  };
  const imports = [];
  context.importScripts = (...urls) => {
    urls.forEach((url) => {
      const file = url.replace("chrome-extension://offline/", "");
      imports.push(file);
      if (file === FILE.page || file === FILE.sdk) vm.runInContext(file === FILE.sdk ? sources.sdk : sources.page, context, { filename: file === FILE.sdk ? sdkExecutionPath : file, timeout: 10000 });
    });
  };
  vm.runInContext(sources.worker, context, { filename: FILE.worker, timeout: 1000 });
  vm.runInContext("var activeScrapyTask = null;", context);
  ["createRequestId", "getRequestId", "mapErrorCode", "toSuccessResponse", "toErrorResponse",
    "isMessageEnvelopeLike", "normalizeDetail", "handleScrapyJsRun", "dispatchRuntimeMessage"].forEach((name) => lift(context, "background", name));
  const tableStart = sources.background.indexOf("  const RUNTIME_MESSAGE_HANDLERS = {");
  const tableEnd = sources.background.indexOf("  async function dispatchRuntimeMessage", tableStart);
  assert.ok(tableStart >= 0 && tableEnd > tableStart, "background dispatch table extraction failed");
  vm.runInContext(sources.background.slice(tableStart, tableEnd), context, { filename: FILE.background, lineOffset: sources.background.slice(0, tableStart).split("\n").length - 1 });
  const listenerStart = sources.background.indexOf("  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {");
  const listenerEnd = sources.background.indexOf("  // 示例：", listenerStart);
  assert.ok(listenerStart >= 0 && listenerEnd > listenerStart, "background listener extraction failed");
  vm.runInContext(sources.background.slice(listenerStart, listenerEnd), context, { filename: FILE.background, lineOffset: sources.background.slice(0, listenerStart).split("\n").length - 1 });
  chrome.runtime.sendMessage = (message, cb) => {
    calls.messages.push(clone(message));
    chrome.runtime.onMessage.emit(clone(message), { url: "chrome-extension://offline/www/popup_crawl.html" }, cb);
  };
  return { context, timer, chrome, calls, logs, imports, pageVM, page: context.page____ChromePage____Object };
}

function spiderConfig(extra = {}) {
  return { name: "offline_contract", start_urls: ["https://fixture.invalid/list"],
    itemConfig: { _listContainer: "#list", title: ".title", price: ".price" },
    puppeteerConfig: {}, ...extra };
}
function crawler(r, extra = {}, settings = {}) {
  const core = new r.context.Scrapy(settings);
  core.spider = new r.context.ChromeSpider(spiderConfig(extra));
  return core;
}
function task(r, extra = {}, settings = {}) {
  return r.context.handleScrapyJsRun({ detail: { spiderConfig: spiderConfig(extra), scrapySettings: settings } });
}
function active(r) { return vm.runInContext("activeScrapyTask !== null", r.context); }
function hasLog(r, text) { return r.logs.some((log) => log.text.includes(text)); }
function deferredMiddleware(waiting) {
  return { process_request: () => waiting, process_response: (_request, response) => response, process_exception() {} };
}

function popup({ chrome: sharedChrome, response } = {}) {
  const timer = clock();
  const { context, logs } = sandbox(timer);
  const domReady = [];
  const nodes = Object.fromEntries(["startButton", "configArea", "codeArea", "exportCsv", "exportJson"].map((id) => [id, new Element()]));
  nodes.startButton.textContent = "开始爬取";
  nodes.configArea.value = JSON.stringify({ _listContainer: "#list", title: ".title", price: ".price" });
  const table = new Element("tbody"), header = new Element("tr"), status = new Element();
  const downloads = [], urls = new Map(), revoked = [];
  let urlSerial = 0;
  const body = new Element("body");
  const document = {
    body,
    getElementById: (id) => nodes[id] || null,
    querySelector: (selector) => ({ ".data-table tbody": table, ".data-table thead tr": header, ".status-info": status })[selector] || null,
    querySelectorAll: (selector) => selector === ".data-table tbody tr" ? table.children : [],
    addEventListener(type, fn) { if (type === "DOMContentLoaded") domReady.push(fn); },
    createElement(tag) {
      const element = new Element(tag);
      if (tag === "a") element.click = () => downloads.push({ filename: element.download, url: element.href, blob: urls.get(element.href) });
      return element;
    }
  };
  context.document = document;
  context.window = context;
  context.URL = class PopupURL extends URL {
    static createObjectURL(blob) { const url = `blob:offline/${++urlSerial}`; urls.set(url, blob); return url; }
    static revokeObjectURL(url) { revoked.push(url); urls.delete(url); }
  };
  const chrome = sharedChrome || mockChrome(vm.createContext({})).chrome;
  if (!sharedChrome) chrome.runtime.sendMessage = (message, cb) => {
    if (message.type === "CHROME_PAGE_EXECUTE") cb({ success: true, requestId: message.requestId, data: "https://fixture.invalid/list" });
    else cb({ requestId: message.requestId, ...response });
  };
  context.chrome = chrome;
  vm.runInContext(sources.popup, context, { filename: FILE.popup, timeout: 1000 });
  vm.runInContext("nextPageSelector = '';", context);
  const handler = vm.runInContext("TableDataHandler", context);
  return {
    context, timer, logs, chrome, nodes, table, status, handler, downloads, urls, revoked,
    async initialize() { domReady.forEach((fn) => fn()); await flush(); },
    seed(rows) { handler.setTableData(rows, { title: ".title", price: ".price" }); },
    async exportBoth() { await nodes.exportCsv.click(); await nodes.exportJson.click(); return Promise.all(downloads.map((item) => item.blob.text())); }
  };
}

class KnownDefect extends Error {
  constructor(actual, expected) { super(`actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`); this.actual = actual; this.expected = expected; }
}
function desiredOrKnown(actual, desired, known) {
  try { assert.deepEqual(actual, desired); return; } catch (error) {
    if (!(error instanceof assert.AssertionError)) throw error;
  }
  // Only this exact observed failure is known. Harness errors and new regressions
  // fail normally; no blanket expected-failure catch or assertion inversion.
  assert.deepEqual(actual, known, "unexpected observation; known defect fingerprint changed");
  throw new KnownDefect(actual, desired);
}

const checks = [];
function check(id, refs, fn, knownDefect = null) { checks.push({ id, refs, fn, knownDefect }); }

check("artifact-loading-ownership", ["manifest.json:1", evidence("worker", "const BACKGROUND_SCRIPTS")], () => {
  // The required graph is manifest references + worker + crawler popup. The
  // additional options-page dependency graph is a separate diagnostic below;
  // default extension-check/--pack still fail closed on its missing resources.
  inspectExtension(ROOT, { inspectOptionsDependencies: false });
});
check("real-sdk-worker-shim-capabilities", [evidence("worker", "function bootstrapWorkerGlobals"), evidence("sdk", "globalThis.Scrapy =")], async () => {
  const r = runtime(); await flush();
  assert.equal(vm.runInContext("window === globalThis", r.context), true);
  assert.equal(typeof r.context.Scrapy, "function");
  assert.equal(typeof r.context.ChromeSpider, "function");
  assert.equal(typeof r.context.document, "undefined");
  assert.equal(typeof r.context.FileReader, "undefined");
  assert.equal(typeof r.context.URL.createObjectURL, "undefined");
  assert.equal(r.context.__EXT_ORIGINAL_OBJECT_URL_SUPPORT__.createObjectURL, null);
  assert.ok(r.imports.indexOf(FILE.page) < r.imports.indexOf(FILE.sdk));
  assert.equal(r.page.__implementation, "ChromePage");
});
check("core-start-array-and-caller-owned-tab", [evidence("sdk", ["return this.feedExport.data;", "return run.exporter.data.slice();"]), evidence("sdk", ["async release()", "release() {"])], async () => {
  const r = runtime(), core = crawler(r), listeners = r.chrome.runtime.onMessage.listeners.size;
  const data = await core.start();
  assert.ok(Array.isArray(data));
  assert.deepEqual(plain(data), [{ title: "A,\"B\"\nC", price: "0" }]);
  assert.equal(core.stats.get("itemCount"), 1);
  assert.equal(core.stats.get("pageCount"), 1);
  assert.ok(r.calls.injections.every((item) => item.target.tabId === 7 && item.world === "MAIN"));
  await core.release(); await core.release();
  assert.equal(data.length, 1, "release must not mutate the caller's returned array");
  assert.equal(core.scheduler.queue.length, 0);
  assert.equal(!!core.scheduler.isRunning, false);
  assert.equal(r.chrome.runtime.onMessage.listeners.size, listeners, "shared ChromePage listener belongs to worker lifetime");
  assert.deepEqual(r.calls.removedTabs, [], "active user tab is borrowed, not owned by the crawler");
});
check("core-rejects-missing-spider", [evidence("sdk", "Spider is not set.")], async () => {
  const r = runtime(); await assert.rejects(new r.context.Scrapy().start(), /Spider is not set/);
});
check("background-wraps-real-core-data-stats", [evidence("background", "return { data, stats };"), evidence("sdk", "class Scrapy {")], async () => {
  const r = runtime(), result = await task(r);
  assert.deepEqual(plain(result), { data: [{ title: "A,\"B\"\nC", price: "0" }], stats: { pageCount: 1, itemCount: 1 } });
  assert.equal(active(r), false);
  assert.deepEqual(r.calls.removedTabs, []);
});
check("background-zero-seeds-is-empty-array-with-zero-stats", [evidence("background", "return { data, stats };"), evidence("sdk", "start_requests()")], async () => {
  const r = runtime(), result = await task(r, { start_urls: [] });
  assert.deepEqual(plain(result), { data: [], stats: { pageCount: 0, itemCount: 0 } });
  assert.equal(active(r), false);
});
check("popup-real-sdk-runtime-envelope-roundtrip", [evidence("popup", "async function runScrapyTaskInBackground"), evidence("background", "chrome.runtime.onMessage.addListener((request")], async () => {
  const r = runtime(), p = popup({ chrome: r.chrome });
  const result = await p.context.runScrapyTaskInBackground(spiderConfig());
  assert.equal(result.data.length, 1); assert.equal(result.stats.itemCount, 1);
  const message = r.calls.messages[0];
  assert.equal(message.type, "SCRAPYJS_RUN");
  assert.equal(message.requestId, message.meta.requestId);
  assert.equal(p.timer.timers.size, 0);
});
check("background-exception-release-and-lock-reset", [evidence("background", "await scrapyInstance.release?.();")], async () => {
  const r = runtime(); let closes = 0;
  const settings = { middlewares: [{ close() { closes++; } }] };
  await assert.rejects(task(r, { start_urls: 42 }, settings), /map is not a function/);
  assert.equal(closes, 1); assert.equal(active(r), false);
  assert.equal((await task(r)).data.length, 1);
});
check("background-busy-task-is-explicit-error", [evidence("background", "if (activeScrapyTask)"), evidence("background", 'return "E_TASK_ALREADY_RUNNING";')], async () => {
  const r = runtime(); let finish;
  const waiting = new Promise((resolve) => { finish = resolve; });
  const first = task(r, {}, { middlewares: [deferredMiddleware(waiting)] });
  first.catch(() => {}); // Observe immediately even if constructor/start fails.
  try {
    await flush(); if (!active(r)) await first;
    assert.equal(active(r), true);
    await assert.rejects(task(r), (error) => r.context.toErrorResponse(error, "busy").errorCode === "E_TASK_ALREADY_RUNNING");
  } finally { finish({ body: "", url: "https://fixture.invalid/list" }); await first; }
  assert.equal(active(r), false);
});
check("popup-protocol-error-propagation", [evidence("popup", "async function runScrapyTaskInBackground")], async () => {
  const p = popup({ response: { success: false, errorCode: "E_FIXTURE", error: "injected failure" } });
  await assert.rejects(p.context.runScrapyTaskInBackground(spiderConfig()), (error) => error.errorCode === "E_FIXTURE" && error.message === "injected failure");
  assert.equal(p.timer.timers.size, 0);
});
check("popup-timeout-late-reply-cleanup", [evidence("popup", "Runtime message timeout after")], async () => {
  const p = popup(); let respond; let sends = 0;
  p.chrome.runtime.sendMessage = (_message, cb) => { sends++; respond = cb; };
  const promise = p.context.sendRuntimeMessageWithProtocol({ type: "SCRAPYJS_RUN", requestId: "timeout" }, { timeoutMs: 5 });
  const rejection = assert.rejects(promise, (error) => error.errorCode === "E_TIMEOUT" && error.requestId === "timeout");
  await p.timer.advance(5); await rejection;
  respond({ success: true, requestId: "timeout", data: ["late"] }); await flush();
  assert.equal(p.timer.timers.size, 0);
  assert.equal(sends, 1, "sender timeout sends no cancellation message");
});
check("timeout-is-sender-only-task-continues", [evidence("popup", "finish("), evidence("background", "activeScrapyTask = runTask();")], async () => {
  const r = runtime(), p = popup({ chrome: r.chrome }); let finish;
  const waiting = new Promise((resolve) => { finish = resolve; });
  const first = task(r, {}, { middlewares: [deferredMiddleware(waiting)] });
  first.catch(() => {});
  await flush();
  // Drop a sender response while a real background task is active; sender timeout
  // has no task cancellation channel. This is an observed limitation, not safety.
  p.chrome.runtime.sendMessage = () => {};
  const pending = p.context.sendRuntimeMessageWithProtocol({ requestId: "sender-only" }, { timeoutMs: 3 });
  const rejected = assert.rejects(pending, (error) => error.errorCode === "E_TIMEOUT");
  try { await p.timer.advance(3); await rejected; assert.equal(active(r), true); }
  finally { finish({ body: "", url: "https://fixture.invalid/list" }); await first; }
  assert.equal(active(r), false);
});
check("ChromePage-navigation-success-cleans-listeners", [evidence("page", "async waitForNavigation(options = {})")], async () => {
  const r = runtime(); r.pageVM.document.readyState = "loading";
  const pending = r.page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20 });
  await flush();
  assert.equal(r.chrome.webNavigation.onDOMContentLoaded.listeners.size, 1);
  r.chrome.webNavigation.onDOMContentLoaded.emit({ tabId: 99 }); await flush();
  assert.equal(r.chrome.webNavigation.onDOMContentLoaded.listeners.size, 1);
  r.chrome.webNavigation.onDOMContentLoaded.emit({ tabId: 7 }); await pending;
  assert.equal(r.chrome.webNavigation.onDOMContentLoaded.listeners.size, 0);
  assert.equal(r.timer.timers.size, 0);
});
check("ChromePage-navigation-timeout-cleans-listeners", [evidence("page", "const onTimeout = () => {")], async () => {
  const r = runtime(); r.pageVM.document.readyState = "loading";
  const pending = r.page.waitForNavigation({ waitUntil: "load", timeout: 5 });
  const rejected = assert.rejects(pending, /Navigation timeout exceeded/);
  await flush(); await r.timer.advance(5); await rejected;
  assert.equal(r.chrome.webNavigation.onCompleted.listeners.size, 0);
  assert.equal(r.chrome.webNavigation.onDOMContentLoaded.listeners.size, 0);
  assert.equal(r.chrome.webRequest.onCompleted.listeners.size, 0);
  assert.equal(r.timer.timers.size, 0);
});
check("ChromePage-pending-event-completion-cleans-map", [evidence("page", "async operationCompleted(eventId, result)")], async () => {
  const r = runtime(); let value;
  r.page.pendingEvents.set("event", { resolve: (data) => { value = data; }, reject: () => assert.fail("unexpected rejection") });
  await r.page.operationCompleted("event", JSON.stringify({ PageBrigeCode: 0, data: 42 }));
  assert.equal(value, 42); assert.equal(r.page.pendingEvents.size, 0);
});
check("popup-CSV-JSON-zero-values-and-empty-data", [evidence("popup", "static toCSV(formattedData)"), evidence("popup", "static toJSON(formattedData)")], () => {
  const p = popup(), rows = [{ title: 'A,"B"\nC', price: 0, flag: false, missing: null }];
  assert.equal(p.handler.toCSV(rows), '标题,价格,flag,missing\n"A,""B""\nC",0,false,');
  assert.deepEqual(JSON.parse(p.handler.toJSON(rows)), rows);
  assert.equal(p.handler.toCSV([]), ""); assert.equal(p.handler.toJSON([]), "[]");
});
check("popup-success-click-and-real-export-callbacks", [evidence("popup", "// Start button"), evidence("popup", "// Export CSV button")], async () => {
  const p = popup({ response: { success: true, data: { data: [{ title: "new", price: 0 }], stats: { pageCount: 1, itemCount: 1 } } } });
  await p.initialize(); await p.nodes.startButton.click();
  assert.ok(p.status.innerHTML.includes("爬取完成"));
  assert.ok(p.status.innerHTML.includes("Rows collected: 1"));
  assert.equal(p.nodes.startButton.disabled, false);
  assert.equal(p.nodes.startButton.textContent, "开始爬取");
  const [csv, json] = await p.exportBoth();
  assert.equal(csv, "标题,价格\nnew,0");
  assert.deepEqual(JSON.parse(json), [{ title: "new", price: 0 }]);
  assert.deepEqual(p.downloads.map((item) => item.filename), ["fixture.invalid.csv", "fixture.invalid.json"]);
  assert.ok([...p.timer.timers.values()].every((timer) => timer.interval === 0), "working interval must stop");
});
check("popup-empty-error-restores-button-and-timer", [evidence("popup", "No data crawled"), evidence("popup", "// 恢复按钮状态")], async () => {
  for (const response of [
    { success: true, data: { data: [], stats: { pageCount: 1, itemCount: 0 } } },
    { success: false, errorCode: "E_FIXTURE", error: "injected failure" }
  ]) {
    const p = popup({ response }); await p.initialize(); await p.nodes.startButton.click();
    assert.ok(p.status.innerHTML.includes("爬取失败"));
    assert.equal(p.nodes.startButton.disabled, false);
    assert.ok([...p.timer.timers.values()].every((timer) => timer.interval === 0));
  }
});
check("supported-export-revokes-owned-object-url", [evidence("sdk", "saveToFileBrowser(filename")], async () => {
  const r = runtime(), revoked = [], anchors = [];
  r.context.URL.createObjectURL = () => "blob:offline/owned";
  r.context.URL.revokeObjectURL = (url) => revoked.push(url);
  r.context.document = { createElement() { const anchor = { click() { anchors.push(anchor); }, style: {} }; return anchor; } };
  const core = crawler(r, { output: "data.json" }); await core.start();
  assert.equal(r.calls.downloads.length + anchors.length, 1);
  assert.equal(r.calls.downloads[0]?.filename || anchors[0]?.download, "data.json");
  assert.deepEqual(revoked, ["blob:offline/owned"]);
  await core.release();
});

check("D01-core-crawl-error-is-swallowed", [evidence("sdk", "class Scrapy {"), evidence("sdk", "async process_exception(request, exception)")], async () => {
  const r = runtime(); vm.runInContext("globalThis.page____ChromePage____Object = null;", r.context);
  let outcome;
  try { outcome = { status: "resolved", data: plain((await task(r)).data) }; }
  catch (error) {
    if (!/ChromePage bridge is not available/.test(error.message)) throw error;
    outcome = { status: "rejected" };
  }
  if (outcome.status === "resolved") assert.ok(hasLog(r, "ChromePage bridge is not available"), "missing bridge fault must reach real SDK logging");
  assert.equal(active(r), false);
  desiredOrKnown(outcome, { status: "rejected" }, { status: "resolved", data: [] });
}, "A real missing-bridge download error becomes a successful empty background result.");
check("D02-core-navigation-timeout-is-swallowed", [evidence("sdk", "await page.goto(targetUrl"), evidence("sdk", "class Scrapy {")], async () => {
  const r = runtime();
  const injectedTimeout = vm.runInContext('Object.assign(new Error("injected navigation timeout"), { errorCode: "E_TIMEOUT" })', r.context);
  const timeoutPage = {
    tabId: 7, url: async () => "https://fixture.invalid/old", content: async () => "",
    waitForNavigation: async () => {},
    async goto() { throw injectedTimeout; }
  };
  const middleware = new r.context.ChromeDownloaderMiddleware({ resolvePage: () => timeoutPage });
  const core = crawler(r, {}, { middlewares: [middleware] }); let outcome;
  try { outcome = { status: "resolved", data: plain(await core.start()) }; }
  catch (error) { outcome = { status: "rejected", errorCode: error.errorCode }; }
  await core.release(); assert.ok(hasLog(r, "injected navigation timeout"));
  desiredOrKnown(outcome, { status: "rejected", errorCode: "E_TIMEOUT" }, { status: "resolved", data: [] });
}, "The real downloader/core swallow an injected navigation E_TIMEOUT (navigation itself is a double).");
check("D03-page-limit-double-counts-one-page", [evidence("sdk", ["const limitedRequests = initialRequests.slice", "this.scrapyInstance.stats.inc('pageCount');"]), evidence("sdk", "class ChromeSpider")], async () => {
  const r = runtime(), result = await task(r, { custom_settings: { CLOSESPIDER_PAGECOUNT: 1 } });
  assert.equal(result.data.length, 1);
  desiredOrKnown(result.stats.pageCount, 1, 2);
}, "start() and ChromeSpider.parse() both increment pageCount for the same page.");
check("D04-worker-export-has-no-supported-transport", [evidence("sdk", ["Failed to export data: no supported download method available.", "No file sink is available in this runtime;"])], async () => {
  const r = runtime(); let status;
  try { await task(r, { output: "data.json" }); status = "resolved"; } catch (error) { status = "rejected"; }
  if (status === "resolved") assert.ok(hasLog(r, "no supported download method available"));
  desiredOrKnown({ status, downloads: r.calls.downloads.length }, { status: "rejected", downloads: 0 }, { status: "resolved", downloads: 0 });
}, "Worker URL/Blob shims provide neither object URLs, DOM nor FileReader; export logs failure yet reports completion.");
check("D05-download-callback-error-does-not-reject", [evidence("sdk", "saveToFileBrowser(filename")], async () => {
  if (!sources.sdk.includes("chrome.downloads.download(")) return { notApplicable: "This SDK has no chrome.downloads export path; its DOM sink is checked separately." };
  const r = runtime(), revoked = [];
  r.context.URL.createObjectURL = () => "blob:offline/failure";
  r.context.URL.revokeObjectURL = (url) => revoked.push(url);
  r.chrome.downloads.download = (_options, cb) => {
    r.chrome.runtime.lastError = { message: "injected download denial" };
    try { cb(); } finally { r.chrome.runtime.lastError = null; }
  };
  let status;
  try { await task(r, { output: "data.json" }); status = "resolved"; } catch (error) { status = "rejected"; }
  assert.ok(hasLog(r, "injected download denial"));
  assert.deepEqual(revoked, ["blob:offline/failure"]);
  desiredOrKnown(status, "rejected", "resolved");
}, "chrome.downloads lastError is logged, but start/background still resolve.");
for (const [id, response] of [
  ["D06-popup-empty-result-exports-stale-data", { success: true, data: { data: [], stats: { pageCount: 1, itemCount: 0 } } }],
  ["D07-popup-error-result-exports-stale-data", { success: false, errorCode: "E_FIXTURE", error: "injected failure" }]
]) check(id, [evidence("popup", "No data crawled"), evidence("popup", "static getFormattedData()")], async () => {
  const p = popup({ response }); await p.initialize(); p.seed([{ title: "old", price: 0 }]);
  await p.nodes.startButton.click(); assert.ok(p.status.innerHTML.includes("爬取失败"));
  const [csv, json] = await p.exportBoth();
  const actual = { data: JSON.parse(json), csv };
  desiredOrKnown(actual, { data: [], csv: "" }, { data: [{ title: "old", price: 0 }], csv: "标题,价格\nold,0" });
}, "The failed/empty crawl leaves prior preview data exportable as if it were the latest result.");
check("D08-popup-download-object-url-is-not-revoked", [evidence("popup", "function downloadFile(content")], async () => {
  const p = popup(); p.context.downloadFile("[]", "data.json", "application/json");
  assert.equal(p.downloads.length, 1);
  desiredOrKnown({ live: p.urls.size, revoked: p.revoked.length }, { live: 0, revoked: 1 }, { live: 1, revoked: 0 });
}, "Popup owns each blob URL but never revokes it.");
check("D09-ChromePage-goto-failure-leaks-navigation-wait", [evidence("page", "const navigationPromise = new Promise"), evidence("page", "await this.eval(code);")], async () => {
  const r = runtime();
  r.chrome.scripting.executeScript = (_options, cb) => {
    r.chrome.runtime.lastError = { message: "injected navigation trigger failure" };
    try { cb([]); } finally { r.chrome.runtime.lastError = null; }
  };
  await assert.rejects(r.page.goto("https://fixture.invalid/new", { timeout: 20 }), /injected navigation trigger failure/);
  const observed = { listeners: r.chrome.tabs.onUpdated.listeners.size, timers: r.timer.timers.size };
  // Complete the abandoned navigationPromise to avoid an artificial unhandled
  // rejection later; observe leakage BEFORE harness cleanup.
  r.chrome.tabs.onUpdated.emit(7, { status: "complete" }, { url: "https://fixture.invalid/new" });
  await flush(); assert.equal(r.timer.timers.size, 0);
  desiredOrKnown(observed, { listeners: 0, timers: 0 }, { listeners: 1, timers: 1 });
}, "When a mock Chrome API rejects the navigation trigger, real goto abandons its listener/timer.");
check("D10-ChromePage-lost-bridge-response-never-times-out", [evidence("page", "this.pendingEvents.set(eventId, { resolve, reject });")], async () => {
  const r = runtime(); r.chrome.scripting.executeScript = (_options, cb) => cb([]);
  let settled = false;
  const pending = r.page._execute("/* dropped operationCompleted message */", "lost").then(() => { settled = true; }, () => { settled = true; });
  await flush(); await r.timer.advance(120000);
  const observed = { settled, pendingEvents: r.page.pendingEvents.size };
  await r.page.operationCompleted("lost", JSON.stringify({ PageBrigeCode: 0, data: null })); await pending;
  desiredOrKnown(observed, { settled: true, pendingEvents: 0 }, { settled: false, pendingEvents: 1 });
}, "A successfully injected bridge operation with a lost completion message has no host timeout or pending-map cleanup.");
check("D11-core-pipeline-fault-is-swallowed", [evidence("sdk", "class Pipeline"), evidence("sdk", "class Scrapy {")], async () => {
  const r = runtime(), core = crawler(r); let outcome;
  core.addPipeline(function injectedFailure(_item) { throw new Error("injected pipeline failure"); });
  try { outcome = { status: "resolved", data: plain(await core.start()) }; }
  catch (error) {
    if (!error.message.includes("injected pipeline failure")) throw error;
    outcome = { status: "rejected" };
  }
  await core.release();
  if (outcome.status === "resolved") assert.ok(hasLog(r, "injected pipeline failure"));
  desiredOrKnown(outcome, { status: "rejected" }, { status: "resolved", data: [] });
}, "A thrown function pipeline is logged and filtered into an empty successful result. The pipeline is injected directly, not serialized through Chrome messaging.");
check("D12-packaging-options-page-references-missing-assets", ["www/index.html:19", "www/index.html:27", "www/index.html:28"], () => {
  let observed = [];
  try { inspectExtension(ROOT); } catch (error) {
    if (!error.details?.length) throw error;
    observed = error.details.map((detail) => {
      const match = /^www\/index\.html: (www\/[^:]+): .*ENOENT/.exec(detail);
      if (!match) throw error;
      return match[1];
    }).sort();
  }
  desiredOrKnown(observed, [], ["www/favicon.ico", "www/assets/index.8caa0178.js", "www/assets/index.10d52e1f.css"].sort());
}, "The options page references three absent local resources. Default static checking and packing are blocked; these files are not repaired by the harness.");

async function run(mode = "diagnostic", sdkCandidate = null) {
  assert.ok(["required", "diagnostic", "strict"].includes(mode), "invalid mode");
  if (sdkCandidate) assert.ok(path.isAbsolute(sdkCandidate), "candidate SDK path must be absolute");
  const sdkFile = sdkCandidate || path.join(ROOT, FILE.sdk);
  sdkExecutionPath = sdkFile;
  for (const [key, file] of Object.entries(FILE)) sources[key] = fs.readFileSync(key === "sdk" ? sdkFile : path.join(ROOT, file), "utf8");
  const inputHashes = Object.fromEntries(Object.entries(sources).map(([key, source]) => [key, createHash("sha256").update(source).digest("hex")]));
  const results = [];
  for (const item of checks) {
    if (mode === "required" && item.knownDefect) continue;
    let refs = [];
    try {
      refs = item.refs.map((ref) => locate(ref, sdkFile));
      const result = await bounded(item.fn(), item.id);
      results.push({ id: item.id, status: result?.notApplicable ? "NOT_APPLICABLE" : item.knownDefect ? "RESOLVED" : "PASS", refs,
        ...(result?.notApplicable ? { detail: result.notApplicable } : {}) });
    } catch (error) {
      const known = error instanceof KnownDefect && !!item.knownDefect;
      results.push({ id: item.id, status: known ? "KNOWN_DEFECT" : "FAIL", refs,
        detail: error.message, ...(known ? { diagnosis: item.knownDefect } : {}) });
    }
  }
  for (const [key, file] of Object.entries(FILE)) {
    const currentHash = createHash("sha256").update(fs.readFileSync(key === "sdk" ? sdkFile : path.join(ROOT, file))).digest("hex");
    if (currentHash !== inputHashes[key]) results.push({ id: `source-changed-during-run-${key}`, status: "FAIL", refs: [], detail: "Source changed while checks ran; rerun against a stable snapshot." });
  }
  const failures = results.filter((item) => item.status === "FAIL").length;
  const knownDefects = results.filter((item) => item.status === "KNOWN_DEFECT").length;
  const exitCode = failures || knownDefects ? 1 : 0;
  return {
    mode, exitCode, node: process.version, sdk: { path: sdkFile, candidate: !!sdkCandidate, sha256: inputHashes.sdk }, inputHashes,
    scope: "offline VM / mock Chrome; no browser success asserted",
    passed: results.filter((item) => item.status === "PASS").length,
    resolved: results.filter((item) => item.status === "RESOLVED").length,
    notApplicable: results.filter((item) => item.status === "NOT_APPLICABLE").length,
    failures, knownDefects, skippedKnownDefects: mode === "required" ? checks.filter((item) => item.knownDefect).length : 0,
    results,
    gaps: [
      "Only ChromePage and scrapyJs imports execute during worker bootstrap; other imports are recorded.",
      "Background dispatch functions/listener are source extracts; unrelated startup and full worker lifetime are untested.",
      "Injected CSS fixture DOM and Chrome calls are mocks; XPath, real navigation, CSP and downloads require Chrome verification.",
      "Required ownership covers manifest references, worker and crawler popup; diagnostic mode additionally checks missing options-page dependencies.",
      "Sender E_TIMEOUT is not cancellation. The background task continues; worker suspension/restart and popup close are untested.",
      "No upstream SDK source build, dependency install, network, commit or publication was performed."
    ]
  };
}
function bounded(promise, id) {
  let timer;
  const deadline = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`HARNESS_TIMEOUT ${id}`)), 2000); });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const modeArg = args.find((arg) => arg.startsWith("--mode="));
  const sdkArg = args.find((arg) => arg.startsWith("--sdk="));
  const mode = modeArg ? modeArg.slice(7) : "diagnostic";
  if (args.some((arg) => arg !== "--json" && arg !== modeArg && arg !== sdkArg) || !["required", "diagnostic", "strict"].includes(mode) || (sdkArg && !path.isAbsolute(sdkArg.slice(6)))) {
    console.error("Usage: node test/devflow-contract.cjs [--mode=required|diagnostic|strict] [--sdk=/absolute/candidate.js] [--json]");
    process.exitCode = 64;
  } else run(mode, sdkArg?.slice(6)).then((report) => {
    if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(report.scope);
      console.log(`SDK ${report.sdk.path} sha256=${report.sdk.sha256} candidate=${report.sdk.candidate}`);
      for (const result of report.results) console.log(`${result.status} ${result.id} (${result.refs.join(", ")})${result.detail ? `: ${result.detail}` : ""}`);
      console.log(`SUMMARY mode=${mode} passed=${report.passed} resolved=${report.resolved} notApplicable=${report.notApplicable} failures=${report.failures} knownDefects=${report.knownDefects} skippedKnownDefects=${report.skippedKnownDefects} exit=${report.exitCode}`);
      report.gaps.forEach((gap) => console.log(`GAP ${gap}`));
    }
    process.exitCode = report.exitCode;
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { run };
