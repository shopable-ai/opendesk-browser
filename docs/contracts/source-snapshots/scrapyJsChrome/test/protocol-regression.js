#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

function extractFunction(source, functionName) {
  const asyncMarker = `async function ${functionName}`;
  const marker = `function ${functionName}`;
  let start = source.indexOf(asyncMarker);
  if (start < 0) {
    start = source.indexOf(marker);
  }
  if (start < 0) {
    throw new Error(`Function not found: ${functionName}`);
  }
  const paramsStart = source.indexOf("(", start);
  if (paramsStart < 0) {
    throw new Error(`No params start for function: ${functionName}`);
  }
  const paramsEnd = findMatchingParen(source, paramsStart);
  const braceStart = source.indexOf("{", paramsEnd);
  if (braceStart < 0) {
    throw new Error(`No body start for function: ${functionName}`);
  }
  const end = findMatchingBrace(source, braceStart);
  return source.slice(start, end + 1);
}

function findMatchingParen(source, parenStart) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let templateExprDepth = 0;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = parenStart; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === "/" && next === "/") {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i += 1;
        continue;
      }
    }

    if (inSingle) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    if (inBacktick) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === "$" && next === "{") {
        templateExprDepth += 1;
        i += 1;
        continue;
      }
      if (ch === "}" && templateExprDepth > 0) {
        templateExprDepth -= 1;
        continue;
      }
      if (ch === "`" && templateExprDepth === 0) {
        inBacktick = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "`") {
      inBacktick = true;
      templateExprDepth = 0;
      continue;
    }

    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
      continue;
    }
  }

  throw new Error("No matching parenthesis found");
}

function findMatchingBrace(source, braceStart) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let templateExprDepth = 0;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (ch === "/" && next === "/") {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i += 1;
        continue;
      }
    }

    if (inSingle) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    if (inBacktick) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === "$" && next === "{") {
        templateExprDepth += 1;
        i += 1;
        continue;
      }
      if (ch === "}" && templateExprDepth > 0) {
        templateExprDepth -= 1;
        continue;
      }
      if (ch === "`" && templateExprDepth === 0) {
        inBacktick = false;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "`") {
      inBacktick = true;
      templateExprDepth = 0;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
      continue;
    }
  }

  throw new Error("No matching brace found");
}

function loadFunctions(filePath, functionNames, extraContext = {}) {
  const source = fs.readFileSync(filePath, "utf8");
  const snippets = functionNames.map((name) => extractFunction(source, name));
  const context = {
    console,
    Date,
    Math,
    Number,
    Object,
    Promise,
    Error,
    String,
    JSON,
    setTimeout,
    clearTimeout,
    ...extraContext,
  };
  vm.createContext(context);
  vm.runInContext(snippets.join("\n\n"), context, { filename: filePath });
  return context;
}

function createChromeMock() {
  const state = {
    messages: [],
    nextResponse: { success: true, data: { ok: true } },
    nextLastError: null,
    skipCallback: false,
    responseDelayMs: 0,
  };

  const runtime = {
    lastError: null,
    sendMessage(message, callback) {
      state.messages.push(message);
      runtime.lastError = state.nextLastError;
      const response = state.nextResponse;
      if (state.skipCallback) {
        runtime.lastError = null;
        return;
      }
      if (typeof callback === "function") {
        if (state.responseDelayMs > 0) {
          setTimeout(() => callback(response), state.responseDelayMs);
        } else {
          callback(response);
        }
      }
      runtime.lastError = null;
    },
    onMessage: {
      addListener() {
        return undefined;
      },
    },
  };

  return {
    chrome: { runtime },
    state,
  };
}

function toHostValue(value) {
  if (value === null || typeof value === "undefined") {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const root = path.resolve(__dirname, "..");
const popupPath = path.join(root, "www", "popup_crawl.js");
const tbPath = path.join(root, "assets", "js", "core", "tb-bridge.js");
const bgPath = path.join(root, "background.js");
const commonPath = path.join(root, "assets", "js", "core", "common.js");
const customEventPath = path.join(root, "assets", "js", "core", "custom_event.js");
const bridgePath = path.join(root, "assets", "js", "core", "bridge.js");

// Popup protocol tests
{
  const { chrome, state } = createChromeMock();
  const popup = loadFunctions(
    popupPath,
    [
      "createRequestId",
      "buildRequestMeta",
      "createProtocolError",
      "sendRuntimeMessageWithProtocol",
      "unwrapRuntimeResponse",
      "executeInPage",
      "runScrapyTaskInBackground",
    ],
    { chrome }
  );

  test("popup executeInPage attaches requestId and meta", async () => {
    state.nextResponse = { success: true, data: { value: 1 } };
    await popup.executeInPage({ pageAction: "getUrl", args: [] });
    const sent = state.messages.at(-1);
    assert.strictEqual(sent.type, "CHROME_PAGE_EXECUTE");
    assert.ok(typeof sent.requestId === "string" && sent.requestId.startsWith("popup_exec_"));
    assert.strictEqual(sent.meta.requestId, sent.requestId);
    assert.strictEqual(sent.meta.source, "popup");
    assert.strictEqual(sent.meta.protocolVersion, "1.0");
  });

  test("popup executeInPage normalizes non-array args", async () => {
    state.nextResponse = { success: true, data: { value: 1 } };
    await popup.executeInPage({ selectorAction: "next", args: "not-array" });
    const sent = state.messages.at(-1);
    assert.deepStrictEqual(toHostValue(sent.detail.args), ["not-array"]);
  });

  test("popup executeInPage string command becomes detail.script", async () => {
    state.nextResponse = { success: true, data: "ok" };
    await popup.executeInPage("return 1 + 1;");
    const sent = state.messages.at(-1);
    assert.strictEqual(sent.detail.script, "return 1 + 1;");
  });

  test("popup executeInPage rejects with runtime.lastError", async () => {
    state.nextLastError = { message: "boom" };
    state.nextResponse = null;
    await assert.rejects(() => popup.executeInPage({ pageAction: "getTitle" }), /boom/);
    state.nextLastError = null;
  });

  test("popup protocol sender rejects with timeout errorCode", async () => {
    state.skipCallback = true;
    await assert.rejects(
      () => popup.sendRuntimeMessageWithProtocol({ type: "X", requestId: "rid-timeout-popup" }, { timeoutMs: 5 }),
      (error) => error && error.errorCode === "E_TIMEOUT" && error.requestId === "rid-timeout-popup"
    );
    state.skipCallback = false;
  });

  test("popup protocol sender rejects on requestId mismatch", async () => {
    state.nextResponse = { success: true, requestId: "rid-other", data: { ok: true } };
    await assert.rejects(
      () => popup.sendRuntimeMessageWithProtocol({ type: "X", requestId: "rid-popup" }, { timeoutMs: 20 }),
      (error) => error && error.errorCode === "E_REQUEST_ID_MISMATCH" && error.requestId === "rid-popup"
    );
    state.nextResponse = { success: true, data: { ok: true } };
  });

  test("popup unwrapRuntimeResponse handles envelope success", () => {
    const out = popup.unwrapRuntimeResponse({ success: true, data: { k: 1 } });
    assert.strictEqual(out.success, true);
    assert.deepStrictEqual(toHostValue(out.value), { k: 1 });
  });

  test("popup unwrapRuntimeResponse handles success false", () => {
    const out = popup.unwrapRuntimeResponse({ success: false, error: "failed" });
    assert.strictEqual(out.success, false);
    assert.strictEqual(out.error, "failed");
  });

  test("popup runScrapyTaskInBackground sends requestId/meta", async () => {
    state.nextResponse = { success: true, data: { data: [], stats: {} } };
    await popup.runScrapyTaskInBackground({ name: "s", start_urls: [] }, {});
    const sent = state.messages.at(-1);
    assert.strictEqual(sent.type, "SCRAPYJS_RUN");
    assert.ok(typeof sent.requestId === "string" && sent.requestId.startsWith("popup_scrapy_"));
    assert.strictEqual(sent.meta.requestId, sent.requestId);
    assert.strictEqual(sent.meta.source, "popup");
  });

  test("popup executeInPage exposes protocol errorCode on rejection", async () => {
    state.nextResponse = { success: false, error: "No active tab", errorCode: "E_TAB_NOT_FOUND" };
    await assert.rejects(
      () => popup.executeInPage({ pageAction: "getUrl" }),
      (error) =>
        error &&
        error.errorCode === "E_TAB_NOT_FOUND" &&
        typeof error.requestId === "string" &&
        error.requestId.startsWith("popup_exec_")
    );
  });
}

// TB bridge protocol tests
{
  const { chrome, state } = createChromeMock();
  const tb = loadFunctions(
    tbPath,
    [
      "createRequestId",
      "buildRequestMeta",
      "createProtocolError",
      "sendRuntimeMessageWithProtocol",
      "unwrapRuntimeResponse",
      "executeInPage",
    ],
    { chrome }
  );

  test("tb executeInPage attaches requestId/meta", async () => {
    state.nextResponse = { success: true, data: { a: 1 } };
    await tb.executeInPage({ pageAction: "getUrl", args: [] });
    const sent = state.messages.at(-1);
    assert.strictEqual(sent.type, "CHROME_PAGE_EXECUTE");
    assert.ok(typeof sent.requestId === "string" && sent.requestId.startsWith("tb_exec_"));
    assert.strictEqual(sent.meta.requestId, sent.requestId);
    assert.strictEqual(sent.meta.source, "tb-bridge");
  });

  test("tb executeInPage normalizes args", async () => {
    state.nextResponse = { success: true, data: { a: 1 } };
    await tb.executeInPage({ selectorAction: "state", args: 1 });
    const sent = state.messages.at(-1);
    assert.deepStrictEqual(toHostValue(sent.detail.args), [1]);
  });

  test("tb executeInPage handles nested testMonkeyFramework envelope", async () => {
    state.nextResponse = {
      success: true,
      data: {
        type: "testMonkeyFramework",
        success: true,
        data: { nested: true },
      },
    };
    const out = await tb.executeInPage({ pageAction: "x", args: [] });
    assert.deepStrictEqual(toHostValue(out), { nested: true });
  });

  test("tb executeInPage exposes protocol errorCode on rejection", async () => {
    state.nextResponse = { success: false, error: "No active tab", errorCode: "E_TAB_NOT_FOUND" };
    await assert.rejects(
      () => tb.executeInPage({ pageAction: "getUrl", args: [] }),
      (error) =>
        error &&
        error.errorCode === "E_TAB_NOT_FOUND" &&
        typeof error.requestId === "string" &&
        error.requestId.startsWith("tb_exec_")
    );
  });

  test("tb protocol sender rejects with timeout errorCode", async () => {
    state.skipCallback = true;
    await assert.rejects(
      () => tb.sendRuntimeMessageWithProtocol({ type: "X", requestId: "rid-timeout-tb" }, { timeoutMs: 5 }),
      (error) => error && error.errorCode === "E_TIMEOUT" && error.requestId === "rid-timeout-tb"
    );
    state.skipCallback = false;
  });

  test("tb protocol sender rejects on requestId mismatch", async () => {
    state.nextResponse = { success: true, requestId: "rid-other-tb", data: { ok: true } };
    await assert.rejects(
      () => tb.sendRuntimeMessageWithProtocol({ type: "X", requestId: "rid-tb" }, { timeoutMs: 20 }),
      (error) => error && error.errorCode === "E_REQUEST_ID_MISMATCH" && error.requestId === "rid-tb"
    );
    state.nextResponse = { success: true, data: { ok: true } };
  });
}

// Common bridge protocol tests
{
  const commonEvents = [];
  const ChromeBridgeEvents = new Map();
  function CustomEventMock(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
  const common = loadFunctions(
    commonPath,
    [
      "createBridgeProtocolError",
      "createBridgeRequestId",
      "buildBridgeRequestMeta",
      "buildBridgeEventDetail",
      "callChromeBridgeInterface",
    ],
    {
      ChromeBridgeEvents,
      CustomEvent: CustomEventMock,
      generateEventId: () => "evt-fixed",
      window: {
        dispatchEvent(event) {
          commonEvents.push(event);
        },
      },
    }
  );

  test("common bridge attaches requestId/meta and preserves BridgeEventId", async () => {
    commonEvents.length = 0;
    const pending = common.callChromeBridgeInterface("APPLOCAL_GETITEM", { key: "foo", timeoutMs: 50 }, "CHROME_BRIDGE_INTERFACE");
    const event = commonEvents.at(-1);
    assert.strictEqual(event.type, "CHROME_BRIDGE_INTERFACE");
    const detail = toHostValue(event.detail);
    assert.strictEqual(detail.BridgeEventName, "APPLOCAL_GETITEM");
    assert.strictEqual(detail.BridgeEventId, "evt-fixed");
    assert.ok(typeof detail.requestId === "string" && detail.requestId.startsWith("bridge_interface_"));
    assert.strictEqual(detail.meta.requestId, detail.requestId);
    assert.strictEqual(detail.meta.source, "page-bridge");
    ChromeBridgeEvents.get("evt-fixed").resolve("ok");
    assert.strictEqual(await pending, "ok");
    assert.strictEqual(ChromeBridgeEvents.size, 0);
  });

  test("common bridge timeout rejects and cleans pending map", async () => {
    ChromeBridgeEvents.clear();
    const pending = common.callChromeBridgeInterface("APPLOCAL_GETITEM", { key: "foo", timeoutMs: 5 }, "CHROME_BRIDGE_INTERFACE");
    await assert.rejects(
      () => pending,
      (error) => error && error.errorCode === "E_BRIDGE_TIMEOUT" && typeof error.requestId === "string"
    );
    assert.strictEqual(ChromeBridgeEvents.size, 0);
  });
}

// Custom event bridge tests
{
  const customEvent = loadFunctions(
    customEventPath,
    [
      "createCustomEventRequestId",
      "buildCustomEventMeta",
      "buildRuntimeMessageFromCustomEvent",
    ],
    {
      CHROME_BRIDGE_POPUP: "CHROME_BRIDGE_POPUP",
      document: { title: "Doc" },
      window: { location: { href: "https://example.com/page" } },
    }
  );

  test("custom event bridge lifts requestId/meta to top level for object detail", () => {
    const out = customEvent.buildRuntimeMessageFromCustomEvent({
      type: "CHROME_BRIDGE_INTERFACE",
      detail: { BridgeEventName: "APPLOCAL_GETITEM", BridgeEventId: "evt-1" },
    });
    assert.strictEqual(out.type, "hid_CHROME_BRIDGE_INTERFACE");
    assert.ok(typeof out.requestId === "string");
    assert.strictEqual(out.meta.requestId, out.requestId);
    assert.strictEqual(out.detail.requestId, out.requestId);
    assert.strictEqual(out.detail.meta.requestId, out.requestId);
    assert.strictEqual(out.meta.source, "custom-event");
  });

  test("custom event bridge preserves primitive detail while adding top-level protocol fields", () => {
    const out = customEvent.buildRuntimeMessageFromCustomEvent({
      type: "CHROME_PAGE_EXECUTE",
      detail: "return 1 + 1;",
    });
    assert.strictEqual(out.detail, "return 1 + 1;");
    assert.ok(typeof out.requestId === "string" && out.requestId.startsWith("evt_"));
    assert.strictEqual(out.meta.requestId, out.requestId);
  });
}

// Legacy bridge callback tests
{
  const ChromeBridgeEvents = new Map();
  const bridge = loadFunctions(
    bridgePath,
    [
      "createLegacyBridgeError",
      "ChromeBridgeOperationCompleted",
    ],
    {
      ChromeBridgeEvents,
      decodeBase64: (value) => Buffer.from(value, "base64").toString("utf8"),
      Buffer,
    }
  );

  test("legacy bridge resolves canonical success envelope", async () => {
    const pending = new Promise((resolve, reject) => {
      ChromeBridgeEvents.set("evt-success", { resolve, reject, requestId: "rid-success" });
    });
    bridge.ChromeBridgeOperationCompleted(
      "evt-success",
      { success: true, requestId: "rid-success", errorCode: null, data: { ok: true } },
      false
    );
    assert.deepStrictEqual(toHostValue(await pending), { ok: true });
    assert.strictEqual(ChromeBridgeEvents.size, 0);
  });

  test("legacy bridge rejects canonical error envelope", async () => {
    const pending = new Promise((resolve, reject) => {
      ChromeBridgeEvents.set("evt-error", { resolve, reject, requestId: "rid-error" });
    });
    bridge.ChromeBridgeOperationCompleted(
      "evt-error",
      { success: false, requestId: "rid-error", errorCode: "E_FAIL", error: "boom" },
      false
    );
    await assert.rejects(
      () => pending,
      (error) => error && error.errorCode === "E_FAIL" && error.requestId === "rid-error"
    );
    assert.strictEqual(ChromeBridgeEvents.size, 0);
  });

  test("legacy bridge unwraps canonical payload nested in PageBrigeCode wrapper", async () => {
    const pending = new Promise((resolve, reject) => {
      ChromeBridgeEvents.set("evt-nested", { resolve, reject, requestId: "rid-nested" });
    });
    bridge.ChromeBridgeOperationCompleted(
      "evt-nested",
      { PageBrigeCode: 0, message: "", data: { success: true, requestId: "rid-nested", errorCode: null, data: { nested: true } } },
      false
    );
    assert.deepStrictEqual(toHostValue(await pending), { nested: true });
    assert.strictEqual(ChromeBridgeEvents.size, 0);
  });
}

// Background CHROME_BRIDGE_INTERFACE tests
{
  const callbackCalls = [];
  const bgBridge = loadFunctions(
    bgPath,
    [
      "createRequestId",
      "getRequestId",
      "mapErrorCode",
      "toSuccessResponse",
      "toErrorResponse",
      "isMessageEnvelopeLike",
      "normalizeDetail",
      "handleChromeBridgeInterface",
    ],
    {
      BASE_URL: "https://base.example",
      axios: {
        get: async () => ({ data: "noop" }),
        post: async () => ({ data: "noop" }),
        put: async () => ({ data: "noop" }),
        delete: async () => ({ data: "noop" }),
      },
      localStorage: {
        token: "token-value",
        setItem() {},
        getItem() { return null; },
        removeItem() { return null; },
        clear() { return null; },
      },
      createNotify(title, options) {
        if (title === "throw") {
          const error = new Error("notify failed");
          error.errorCode = "E_NOTIFY";
          throw error;
        }
        return options;
      },
      ChromeBridgeCallBack(eventId, payload) {
        callbackCalls.push({ eventId, payload: toHostValue(payload) });
      },
      cachedValue: "value-from-global",
    }
  );

  test("background bridge interface returns value and callback payload on success", async () => {
    callbackCalls.length = 0;
    const out = await bgBridge.handleChromeBridgeInterface({
      requestId: "rid-bridge-success",
      detail: {
        BridgeEventName: "APPLOCAL_GETITEM",
        BridgeEventId: "evt-bridge-success",
        key: "cachedValue",
      },
    });
    assert.strictEqual(out, "value-from-global");
    assert.strictEqual(callbackCalls.length, 1);
    assert.strictEqual(callbackCalls[0].eventId, "evt-bridge-success");
    assert.deepStrictEqual(callbackCalls[0].payload, {
      success: true,
      requestId: "rid-bridge-success",
      errorCode: null,
      data: "value-from-global",
    });
  });

  test("background bridge interface callback returns canonical error payload on failure", async () => {
    callbackCalls.length = 0;
    await assert.rejects(
      () => bgBridge.handleChromeBridgeInterface({
        requestId: "rid-bridge-error",
        detail: {
          BridgeEventName: "CREATE_NOTIFY",
          BridgeEventId: "evt-bridge-error",
          title: "throw",
          content: "x",
        },
      }),
      (error) => error && error.errorCode === "E_NOTIFY"
    );
    assert.strictEqual(callbackCalls.length, 1);
    assert.strictEqual(callbackCalls[0].eventId, "evt-bridge-error");
    assert.strictEqual(callbackCalls[0].payload.success, false);
    assert.strictEqual(callbackCalls[0].payload.requestId, "rid-bridge-error");
    assert.strictEqual(callbackCalls[0].payload.errorCode, "E_NOTIFY");
  });
}

// Background protocol helper tests
{
  const bridgeCalls = [];
  const TB = {
    bridge: {
      async send(module, action, detail) {
        bridgeCalls.push({ module, action, detail });
        return { ok: true, module, action };
      },
    },
  };
  const bg = loadFunctions(
    bgPath,
    [
      "createRequestId",
      "getRequestId",
      "mapErrorCode",
      "toSuccessResponse",
      "toErrorResponse",
      "isMessageEnvelopeLike",
      "normalizeDetail",
      "normalizeArgs",
      "handleChromeBridgePopup",
    ],
    { TB }
  );

  test("background getRequestId prefers meta.requestId", () => {
    const id = bg.getRequestId({ meta: { requestId: "meta-1" } });
    assert.strictEqual(id, "meta-1");
  });

  test("background getRequestId rejects conflicting meta and top-level requestId", () => {
    assert.throws(
      () => bg.getRequestId({ meta: { requestId: "meta-2" }, requestId: "req-2" }),
      (error) => error && error.errorCode === "E_REQUEST_ID_MISMATCH" && error.requestId === "meta-2"
    );
  });

  test("background mapErrorCode maps tab errors", () => {
    const code = bg.mapErrorCode(new Error("No active tab"), "E_INTERNAL");
    assert.strictEqual(code, "E_TAB_NOT_FOUND");
  });

  test("background mapErrorCode maps bridge readiness errors", () => {
    const code = bg.mapErrorCode(new Error("TB.bridge.send is not available"), "E_INTERNAL");
    assert.strictEqual(code, "E_BRIDGE_NOT_READY");
  });

  test("background toSuccessResponse wraps generic success", () => {
    const out = bg.toSuccessResponse({ ok: true }, "rid-1");
    assert.deepStrictEqual(toHostValue(out), {
      success: true,
      requestId: "rid-1",
      errorCode: null,
      data: { ok: true },
    });
  });

  test("background toSuccessResponse keeps testMonkeyFramework and injects requestId/errorCode", () => {
    const out = bg.toSuccessResponse({ type: "testMonkeyFramework", success: false, error: "script bad" }, "rid-2");
    assert.strictEqual(out.type, "testMonkeyFramework");
    assert.strictEqual(out.requestId, "rid-2");
    assert.strictEqual(out.errorCode, "E_SCRIPT_EXEC_FAIL");
  });

  test("background toErrorResponse includes mapped errorCode", () => {
    const out = bg.toErrorResponse(new Error("Invalid BridgeEventName: x"), "rid-3");
    assert.strictEqual(out.success, false);
    assert.strictEqual(out.requestId, "rid-3");
    assert.strictEqual(out.errorCode, "E_MSG_INVALID");
    assert.match(out.error, /Invalid BridgeEventName/);
  });

  test("background normalizeDetail supports request.detail object", () => {
    const detail = bg.normalizeDetail({ detail: { pageAction: "getUrl", args: [] } });
    assert.deepStrictEqual(toHostValue(detail), { pageAction: "getUrl", args: [] });
  });

  test("background normalizeDetail supports request.data object", () => {
    const detail = bg.normalizeDetail({ data: { selectorAction: "next", args: [1] } });
    assert.deepStrictEqual(toHostValue(detail), { selectorAction: "next", args: [1] });
  });

  test("background normalizeDetail keeps raw payload object for legacy calls", () => {
    const detail = bg.normalizeDetail({ spiderConfig: { name: "legacy" }, pipelines: [] }, { coercePrimitiveToScript: false });
    assert.deepStrictEqual(toHostValue(detail), { spiderConfig: { name: "legacy" }, pipelines: [] });
  });

  test("background normalizeDetail coerces primitive to script for page execute path", () => {
    const detail = bg.normalizeDetail({ detail: "return 1 + 1;" });
    assert.deepStrictEqual(toHostValue(detail), { script: "return 1 + 1;" });
  });

  test("background normalizeDetail supports direct array request", () => {
    const detail = bg.normalizeDetail([1, 2, 3]);
    assert.deepStrictEqual(toHostValue(detail), { args: [1, 2, 3] });
  });

  test("background normalizeArgs converts primitive and null values", () => {
    assert.deepStrictEqual(toHostValue(bg.normalizeArgs(1)), [1]);
    assert.deepStrictEqual(toHostValue(bg.normalizeArgs(null)), []);
  });

  test("background handleChromeBridgePopup validates BridgeEventName", async () => {
    await assert.rejects(
      () => bg.handleChromeBridgePopup({ detail: { foo: 1 } }),
      /missing BridgeEventName/
    );
  });

  test("background handleChromeBridgePopup forwards module/action/detail to TB.bridge.send", async () => {
    bridgeCalls.length = 0;
    const out = await bg.handleChromeBridgePopup({
      detail: { BridgeEventName: "ScrapyJs.selected_nextPageBtn", selector: ".next" },
    });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(bridgeCalls.length, 1);
    assert.strictEqual(bridgeCalls[0].module, "ScrapyJs");
    assert.strictEqual(bridgeCalls[0].action, "selected_nextPageBtn");
    assert.deepStrictEqual(toHostValue(bridgeCalls[0].detail), {
      BridgeEventName: "ScrapyJs.selected_nextPageBtn",
      selector: ".next",
    });
  });
}

async function run() {
  let passed = 0;
  const started = Date.now();
  for (const tc of tests) {
    try {
      await tc.fn();
      passed += 1;
      console.log(`PASS ${tc.name}`);
    } catch (error) {
      console.error(`FAIL ${tc.name}`);
      console.error(error && error.stack ? error.stack : error);
      process.exitCode = 1;
      break;
    }
  }

  const elapsed = Date.now() - started;
  if (process.exitCode !== 1) {
    console.log(`\nProtocol regression tests passed: ${passed}/${tests.length} in ${elapsed}ms`);
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
