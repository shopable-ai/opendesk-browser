"use strict";

(() => {
  const PROVIDER_ID = "9c4f182d-7a5f-403d-9b4d-c2144ef35e5b";
  const TASK_ID = "sample.form-fill";
  // This demo accepts the frozen package, not any source reusing its name/version.
  const PINS = [
    {version: "1.0.0", manifestHash: "57598844f11f75d7566c5adeab283a3aaed0614d151590a6f34124e7abf3632a",
      sourceHash: "1f72cf17aa04e8a8597ef43e554ae5507f9da58b73e46d731373cd318f6dcf63"},
    {version: "1.0.1", manifestHash: "8a39edc5ba519869ac5c74132b46830727d3ef8a8c2e4695bb2a0a995e1523c7",
      sourceHash: "9e74a9e089dda18fadc495e9c90b6851ad686eb20b40159d36547d5326c56153"},
  ];
  const PARAMS_SCHEMA = {
    type: "object", properties: { name: { type: "string", title: "姓名", description: "将输入到演示表单中",
      minLength: 1, maxLength: 40, default: "Alice" } }, required: ["name"], additionalProperties: false,
  };
  const canonical = (value) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
  const API_ROOT = "/app/operate/cloudcontrol/";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const $ = (id) => document.getElementById(id);
  let jwt = ""; // Memory only; never attach credentials to URLs, storage, or output.
  let user = null;
  let epoch = 0;
  let busy = "";
  let catalog = null;
  let current = null;
  let pendingChoice = null;

  const terminalStates = new Set(["completed", "finished", "succeeded", "success", "cancelled", "canceled", "failed", "stopped", "interrupted", "rejected"]);
  const activeStates = new Set(["registered", "pending", "queued", "waiting", "prepared", "assigned", "admitted", "permitted", "dispatched", "running", "active", "cancellation_pending", "cancel_requested"]);
  const normalized = (value) => String(value || "").toLowerCase().replaceAll("-", "_");
  const failure = (kind) => Object.assign(new Error(kind), { kind });
  const storageKey = () => `opendesk.mac24dev-demo.request.v1.${user.id}`;
  // Map only exact, documented business codes. Never display an error envelope.
  const businessMessages = {
    E_REQUEST: "当前账号未找到该原请求。请核对原键或读取历史；查不到不代表未执行，不要为重试重新提交。",
    E_JOB: "暂未查到原任务，结果仍未知。请保留原请求键，稍后查询，不要重新提交。",
    E_CONFLICT: "原请求键对应的内容不一致。请查询原请求或从历史恢复，不要修改原键重试。",
    E_BINDING_CHANGED: "设备绑定已变化，无法继续核对原请求。请维护者检查原绑定；不要将原请求转投其他设备。",
    E_DEVICE: "无法确认这是当前账号的本人设备。请刷新设备目录，并核对设备归属。",
    E_AUTH: "账号或设备的云控授权未通过。请核对账号状态及扩展端授权；重新登录不能代替云控授权。",
    E_SCOPE: "设备的任务授权范围与本演示不一致。请在扩展端核对固定任务与托管授权，再由维护者检查绑定。",
    E_NOT_CONNECTED: "设备尚未连接或绑定。请完成扩展端连接及维护者绑定，再刷新设备目录。",
    E_SCHEMA: "输入不符合固定任务要求。请核对原请求及姓名长度；已发送的请求不能修改后重试。",
    E_TASK: "任务版本与本演示不一致，已拒绝操作。请刷新目录并由维护者核对固定任务。",
    E_CONFIG: "云控服务配置暂不可用。请维护者检查设备绑定与连接配置，保留原请求键。",
    E_PROVIDER: "暂时无法确认任务服务的响应。请保留原请求键，稍后查询，不要重新提交。",
    E_CLOUD: "云控服务暂未完成操作。请保留原请求键并查询，仍失败时联系维护者。",
  };
  const businessMessage = (code) => typeof code === "string" && Object.hasOwn(businessMessages, code) ? businessMessages[code] : null;

  function clearHistory(message = "尚未读取。") {
    $("history").replaceChildren();
    text("history-note", message);
  }

  // Render only the business projection. Redact common credential fields and JWTs
  // even in a malformed result; never render a server error body or stack trace.
  function safeValue(value, depth = 0) {
    if (depth > 8) return "[内容过深，已省略]";
    if (typeof value === "string") {
      let text = value;
      if (jwt) text = text.split(jwt).join("[已隐藏凭据]");
      return text.replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[已隐藏凭据]").slice(0, 12000);
    }
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeValue(item, depth + 1));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
        safeValue(key, depth + 1),
        /token|password|passwd|authorization|secret|credential|cookie|pairing/i.test(key)
          ? "[已隐藏凭据]" : safeValue(item, depth + 1),
      ]));
    }
    return value;
  }

  function text(id, value) { $(id).textContent = String(safeValue(value ?? "—")); }
  function details(id, value) { $(id).textContent = JSON.stringify(safeValue(value), null, 2); }
  function notice(message, tone = "neutral") {
    text("notice", message);
    $("notice").dataset.tone = tone;
    $("notice").hidden = !message;
  }

  function logout(message = "已退出。原请求键仍按账号保留；退出不会取消任务。") {
    epoch += 1;
    jwt = "";
    user = null;
    busy = "";
    catalog = null;
    current = null;
    pendingChoice = null;
    $("login-form").reset();
    $("name").value = "";
    $("lookup-key").value = "";
    $("history").replaceChildren();
    $("device").replaceChildren(new Option("请选择设备", ""));
    text("history-note", "尚未读取。");
    text("task-label", "目录尚未读取。");
    text("catalog-details", "尚未读取。");
    text("person", "");
    $("cancel-confirm").hidden = true;
    $("switch-confirm").hidden = true;
    notice(message);
    render();
  }

  async function api(path, body, authenticated = true) {
    const started = epoch;
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (authenticated) {
      if (!jwt) throw failure("auth");
      headers.Authorization = jwt; // Contract: raw JWT, without a Bearer prefix.
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(path, {
        method: body === undefined ? "GET" : "POST", headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        mode: "same-origin", credentials: "omit", redirect: "error", cache: "no-store",
        signal: controller.signal,
      });
      if (started !== epoch) throw failure("stale");
      if (response.status === 401) {
        logout("登录失败或已失效，请重新登录。原请求键已保留，请查询原请求，不要重复发送。");
        throw failure("stale");
      }
      if (!response.ok) throw failure("service");
      const envelope = await response.json();
      if (started !== epoch) throw failure("stale");
      if (envelope?.code === 401) {
        logout("登录已失效，请重新登录后查询原请求。");
        throw failure("stale");
      }
      if (envelope?.code !== 1000) {
        const error = failure("service");
        // CoolCommException exposes its sanitized code in message, not code.
        if (path.startsWith(API_ROOT) && businessMessage(envelope?.message)) error.businessCode = envelope.message;
        throw error;
      }
      return envelope.data;
    } catch (error) {
      if (started !== epoch) throw failure("stale");
      if (error.kind) throw error;
      throw failure("network");
    } finally {
      clearTimeout(timer);
    }
  }

  async function action(kind, work) {
    if (busy) return;
    const started = epoch;
    busy = kind;
    notice("");
    render();
    try {
      await work();
    } catch (error) {
      if (error.kind === "stale" || started !== epoch) return;
      const messages = {
        contract: "接口数据与约定不一致，已停止当前操作。请由后端维护者核对接口投影。",
        storage: "无法保存请求键，请允许本站本地存储后再提交。当前没有发送任务。",
        random: "当前环境无法安全生成 UUID，未新建请求。请使用支持安全随机数的浏览器环境。",
        service: "业务接口未接受操作或暂不可用。",
        network: "连接失败、超时或响应不可读。",
        auth: "请先登录。",
      };
      if (["E_AUTH", "E_SCOPE", "E_DEVICE", "E_BINDING_CHANGED", "E_CONFIG"].includes(error.businessCode)) {
        if (current) current.row = null;
        catalog = null;
        clearHistory("当前授权或绑定未能确认，旧记录已隐藏；恢复后可重新读取。");
      }
      let message = businessMessage(error.businessCode) || messages[error.kind] || "操作未完成。";
      if ((kind === "submit" && current?.sent) || kind === "cancel") {
        message += " 请求是否已被登记尚不确定；请保留原请求键并查询，页面不会重试。";
      }
      if (kind === "login" && jwt) {
        logout("未能确认账号身份，请重新登录。未显示服务端错误内容。");
      } else {
        notice(message, "negative");
      }
    } finally {
      if (started === epoch) {
        busy = "";
        render();
        if (pendingChoice) $("switch-yes").focus();
      }
    }
  }

  function persistKey(key) {
    try { localStorage.setItem(storageKey(), key); }
    catch { throw failure("storage"); }
  }

  function readKey() {
    try {
      const key = localStorage.getItem(storageKey());
      return UUID.test(key || "") ? key : null;
    } catch {
      notice("无法读取本地请求键，可用历史记录或手工输入原键恢复。", "warning");
      return null;
    }
  }

  function projection(value, expectedKey, expectedDeviceId, expectedVersion) {
    if (!value || !UUID.test(value.requestKey || "") ||
        (expectedKey && value.requestKey !== expectedKey) ||
        !Number.isSafeInteger(value.deviceId) || value.deviceId <= 0 ||
        (expectedDeviceId !== undefined && value.deviceId !== expectedDeviceId) ||
        value.taskId !== TASK_ID || !PINS.some(pin => pin.version === value.version) ||
        (expectedVersion && value.version !== expectedVersion) || typeof value.state !== "string" ||
        typeof value.receiptConfirmed !== "boolean" || typeof value.cancelRequested !== "boolean") {
      throw failure("contract");
    }
    // Do not dump the response envelope or unexpected top-level fields.
    const fields = ["requestKey", "deviceId", "taskId", "version", "jobId", "state", "receiptConfirmed", "retirementState", "assignmentId", "trace", "result", "cancelRequested", "message", "createdAt"];
    return Object.fromEntries(fields.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
  }

  function stateInfo(row) {
    const state = normalized(row?.state);
    if (!state || state.includes("unknown")) return ["结果未知；请查询原请求，勿重新执行。", "warning"];
    if (state === "not_connected" || state === "disconnected") return ["设备未连接；这不代表原任务已取消。", "warning"];
    if (state === "not_authorized" || state === "unauthorized") return ["设备尚未授权；请在扩展端完成授权。", "warning"];
    if (["cancelled", "canceled"].includes(state)) return ["请求已取消；资源释放与回执仍须分别核对。", "neutral"];
    if (["completed", "finished", "succeeded", "success"].includes(state)) return ["执行报告完成；回执确认与资源释放分别见下方。", "positive"];
    if (terminalStates.has(state)) return ["执行已结束但未报告成功；请查看结果和释放事实。", "negative"];
    if (activeStates.has(state)) return [row.cancelRequested ? "取消已登记，仍需等待停止和释放事实。" : "请求进行中；刷新状态不会再次提交。", "neutral"];
    return ["尚未识别的状态，按 UNKNOWN 处理；保留原始状态供维护者核对。", "warning"];
  }

  function resolved() {
    const row = current?.row;
    return row && terminalStates.has(normalized(row.state)) && row.receiptConfirmed && normalized(row.retirementState) === "released";
  }

  function selectedDevice() {
    return catalog?.devices.find((device) => String(device.id) === $("device").value);
  }

  function catalogMatches() {
    return catalog?.providerId === PROVIDER_ID && catalog.task.taskId === TASK_ID &&
      PINS.some(pin => pin.version === catalog.task.version && pin.manifestHash === catalog.task.manifestHash &&
        pin.sourceHash === catalog.task.sourceHash) &&
      canonical(catalog.task.paramsSchema) === canonical(PARAMS_SCHEMA);
  }

  function render() {
    const loggedIn = Boolean(user && jwt);
    const locked = Boolean(busy);
    $("login-form").hidden = loggedIn;
    $("account").hidden = !loggedIn;
    $("workspace").hidden = !loggedIn;
    $("login").disabled = locked;
    $("username").disabled = locked;
    $("password").disabled = locked;
    for (const id of ["catalog-refresh", "history-refresh", "lookup", "lookup-key", "new-request", "switch-yes", "switch-no", "cancel-no"]) {
      $(id).disabled = !loggedIn || locked;
    }
    const draft = Boolean(current && !current.sent);
    $("device").disabled = !loggedIn || locked || !catalog || Boolean(current?.sent);
    $("name").disabled = !loggedIn || locked || !draft;
    $("submit").disabled = !loggedIn || locked || !draft || !catalogMatches() || selectedDevice()?.readiness !== "READY" || !validName();
    $("status-refresh").disabled = !loggedIn || locked || !current?.sent;
    const cancelDisabled = !loggedIn || locked || !current?.sent || !current.row || current.cancelAttempted || current.row.cancelRequested === true || terminalStates.has(normalized(current.row.state));
    $("cancel").disabled = cancelDisabled;
    $("cancel-yes").disabled = cancelDisabled;
    text("request-key", current?.key || "尚未新建");
    text("request-hint", !current ? "点击「新建请求」生成 UUID，再明确点击「提交一次」。" : draft
      ? "此键已按当前账号保存在本地，尚未提交。"
      : current.saved === false ? "当前查询键仅在本页，请复制保留；刷新后可从历史或手工输入恢复。"
      : "此键已锁定为原请求；刷新后重新登录可恢复查询，不会重新提交。");
    const row = current?.row;
    const [description, tone] = stateInfo(row);
    text("state", !current ? "尚未新建" : draft ? "尚未提交" : row?.state || "UNKNOWN");
    $("state").dataset.tone = row ? tone : current?.sent ? "warning" : "neutral";
    text("state-note", row ? description : current?.sent ? "尚未确认原请求状态。请查询原键，或读取历史恢复。" : "状态查询只读取事实，不会再次提交任务。");
    text("receipt", row ? row.receiptConfirmed ? "已确认（true）" : "未确认（false）" : "未查询");
    text("retirement", row?.retirementState || "未提供释放事实");
    text("cancel-state", row ? row.cancelRequested ? "已登记（true），不等于已停止或释放" : "未登记（false）" : "未查询");
    details("request-details", row || { requestKey: current?.key || null, state: current?.sent ? "UNKNOWN" : "尚未提交", submitted: Boolean(current?.sent) });
    renderDevice();
  }

  function renderDevice() {
    if (!catalog) { text("device-status", "设备目录尚未确认，请刷新设备。当前无法提交。"); return; }
    if (!catalogMatches()) { text("device-status", "固定任务的来源或参数约定不一致，无法提交。请维护者核对目录。"); return; }
    const device = selectedDevice();
    const descriptions = {
      NOT_CONNECTED: "设备未连接，请先在扩展端连接。",
      NOT_AUTHORIZED: "设备未授权，请在扩展端完成任务托管授权。",
      READY: "设备就绪，可以明确提交一次。",
      UNKNOWN: "就绪情况未知，暂不能提交。",
    };
    text("device-status", device ? `${device.readiness} · ${businessMessage(device.message) || descriptions[device.readiness] || descriptions.UNKNOWN}` : "请选择设备。只有 READY 设备可以提交。");
  }

  function validName() {
    // Match the frozen Task/BFF and native maxlength: UTF-16, without trimming.
    const length = $("name").value.length;
    return length >= 1 && length <= 40;
  }

  async function loadCatalog() {
    catalog = null; // A failed refresh must not leave a stale READY gate open.
    text("task-label", "正在读取目录；读取失败时不能提交。");
    text("catalog-details", "正在读取。");
    const data = await api(`${API_ROOT}catalog`, {});
    if (!data?.task || !Array.isArray(data.devices) || typeof data.providerId !== "string" ||
        typeof data.task.manifestHash !== "string" || typeof data.task.sourceHash !== "string" ||
        !data.task.paramsSchema || data.devices.some((device) => !Number.isSafeInteger(device.id) || typeof device.readiness !== "string")) {
      throw failure("contract");
    }
    catalog = data;
    if (current?.deviceId && (!catalogMatches() || !data.devices.some((device) =>
      device.id === current.deviceId && device.readiness !== "NOT_AUTHORIZED"))) {
      current.row = null;
      clearHistory("原请求的设备或授权已变化，旧记录已隐藏；请核对后按原键查询。");
    }
    const previous = $("device").value;
    $("device").replaceChildren(new Option("请选择设备", ""));
    for (const device of data.devices) {
      $("device").add(new Option(String(safeValue(`${device.nickname || "未命名设备"} (#${device.id}) · ${device.readiness}`)), String(device.id)));
    }
    $("device").value = data.devices.some((device) => String(device.id) === previous) ? previous : "";
    text("task-label", `${data.task.title || "表单任务"} · ${data.task.taskId}@${data.task.version}`);
    details("catalog-details", {
      providerId: data.providerId, taskId: data.task.taskId, version: data.task.version,
      manifestHash: data.task.manifestHash, sourceHash: data.task.sourceHash, paramsSchema: data.task.paramsSchema,
    });
    if (!catalogMatches()) notice("目录中的 Provider、固定任务摘要或参数约定与本演示不一致，已禁用提交。请维护者核对。", "negative");
    else if (!data.devices.length) notice("当前账号没有可用设备，请先完成设备绑定与扩展设置。", "warning");
  }

  async function refreshStatus() {
    const key = current.key;
    current.row = null; // A prior result is not fresh authorization to display it.
    render();
    const row = projection(await api(`${API_ROOT}status`, { requestKey: key }), key, current.deviceId, current.version);
    current.row = row;
    current.deviceId = row.deviceId;
    current.version = row.version;
    if (catalog?.devices.some((device) => device.id === row.deviceId)) $("device").value = String(row.deviceId);
    const reason = businessMessage(row.message);
    notice(reason || "已读取原请求状态，没有提交新任务。", reason ? "warning" : "neutral");
  }

  function prepareChoice(choice) {
    $("cancel-confirm").hidden = true;
    if (current?.sent && !resolved() && current.key !== choice.key) {
      pendingChoice = choice;
      text("switch-warning", `原请求 ${current.key} 的停止、回执或释放尚未全部确认。${choice.kind === "new" ? "新请求可能造成再次执行。" : "切换后仍可从历史或原键恢复。"} 此操作不会取消原请求。若只想恢复，请保留原键并查询。`);
      $("switch-confirm").hidden = false;
      return;
    }
    return applyChoice(choice);
  }

  async function applyChoice(choice) {
    pendingChoice = null;
    $("switch-confirm").hidden = true;
    if (choice.kind === "new") {
      if (!globalThis.crypto?.getRandomValues) throw failure("random");
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const key = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      persistKey(key);
      current = { key, sent: false, row: null, cancelAttempted: false };
      $("name").value = "";
      $("lookup-key").value = key;
      notice("已新建请求键，尚未提交。请选择 READY 设备并填写姓名。");
    } else {
      current = { key: choice.key, sent: true, row: null, cancelAttempted: false, saved: false };
      $("name").value = "";
      $("lookup-key").value = choice.key;
      await refreshStatus();
      // A read-only recovery remains usable even if local storage is unavailable.
      // Do not replace the saved original key with an unconfirmed lookup.
      try { persistKey(choice.key); current.saved = true; }
      catch { notice("已查询原请求，但无法保存此键；请复制保留，刷新后可从历史或手工输入恢复。", "warning"); }
    }
  }

  $("login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    const credentials = { username: $("username").value.trim(), password: $("password").value };
    $("password").value = "";
    void action("login", async () => {
      let data;
      try { data = await api("/app/user/login/loginSimple", credentials, false); }
      finally { credentials.password = ""; }
      if (typeof data?.token !== "string" || !data.token || /[\r\n]/.test(data.token)) throw failure("contract");
      jwt = data.token;
      const person = await api("/app/user/info/person");
      if (!person || !["number", "string"].includes(typeof person.id) || !String(person.id) || typeof person.username !== "string") throw failure("contract");
      user = { id: person.id };
      text("person", `${person.nickName || person.username}（${person.username}）`);
      const key = readKey();
      if (key) {
        current = { key, sent: true, row: null, cancelAttempted: false };
        $("lookup-key").value = key;
      }
      notice(key ? "已登录并恢复原请求键。请查询原请求确认状态。" : "已登录。请先选择设备，再新建请求。");
    }).then(() => { if (user && jwt) void action("catalog", loadCatalog); });
  });

  $("logout").addEventListener("click", () => logout());
  $("device").addEventListener("change", render);
  $("name").addEventListener("input", render);
  $("catalog-refresh").addEventListener("click", () => { void action("catalog", loadCatalog); });
  $("new-request").addEventListener("click", () => { void action("new", () => prepareChoice({ kind: "new" })); });
  $("switch-no").addEventListener("click", () => { pendingChoice = null; $("switch-confirm").hidden = true; });
  $("switch-yes").addEventListener("click", () => {
    if (pendingChoice) void action("switch", () => applyChoice(pendingChoice));
  });

  $("submit-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if ($("submit").disabled) return;
    void action("submit", async () => {
      persistKey(current.key); // Write before the only side effect; never rotate on failure.
      const body = {
        requestKey: current.key, deviceId: selectedDevice().id,
        taskId: TASK_ID, version: catalog.task.version, params: { name: $("name").value },
      };
      current.sent = true; // Freeze both inputs even if the response is lost.
      current.deviceId = body.deviceId;
      current.version = body.version;
      render();
      const row = projection(await api(`${API_ROOT}submit`, body), body.requestKey);
      if (row.deviceId !== body.deviceId || row.taskId !== body.taskId || row.version !== body.version) throw failure("contract");
      current.row = row;
      const reason = businessMessage(row.message);
      notice(reason || "已收到请求投影。提交不等于执行完成，请查询原请求状态。", reason ? "warning" : "neutral");
    });
  });

  $("status-refresh").addEventListener("click", () => { void action("status", refreshStatus); });
  $("lookup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const key = $("lookup-key").value.trim();
    if (!UUID.test(key)) { notice("请输入完整的原请求键 UUID。", "negative"); return; }
    void action("lookup", () => prepareChoice({ kind: "recover", key }));
  });
  $("cancel").addEventListener("click", () => {
    $("switch-confirm").hidden = true;
    pendingChoice = null;
    $("cancel-confirm").hidden = false;
    $("cancel-yes").focus();
  });
  $("cancel-no").addEventListener("click", () => { $("cancel-confirm").hidden = true; });
  $("cancel-yes").addEventListener("click", () => {
    if ($("cancel-yes").disabled) return;
    void action("cancel", async () => {
      $("cancel-confirm").hidden = true;
      const key = current.key;
      current.cancelAttempted = true;
      current.row = null;
      render();
      const row = projection(await api(`${API_ROOT}cancel`, { requestKey: key }), key, current.deviceId, current.version);
      current.row = row;
      notice(businessMessage(row.message) || "已收到取消接口的状态投影。取消登记不等于已停止或已释放，请继续查询原请求。", "warning");
    });
  });

  $("history-refresh").addEventListener("click", () => {
    void action("history", async () => {
      clearHistory("正在读取历史；读取失败时不保留旧记录。");
      const data = await api(`${API_ROOT}history`, {});
      if (!Array.isArray(data)) throw failure("contract");
      const rows = data.map((row) => projection(row));
      $("history").replaceChildren();
      text("history-note", rows.length ? `已读取 ${rows.length} 条请求。` : "当前账号暂无历史请求。");
      for (const row of rows) {
        const item = document.createElement("li");
        item.className = "stack";
        const key = document.createElement("code");
        key.textContent = row.requestKey;
        const summary = document.createElement("p");
        summary.textContent = String(safeValue(`${row.state} · 设备 #${row.deviceId} · ${row.taskId}@${row.version} · ${row.createdAt || "时间未提供"}`));
        const facts = document.createElement("p");
        facts.className = "muted";
        facts.textContent = String(safeValue(`回执：${row.receiptConfirmed ? "已确认" : "未确认"} / 释放：${row.retirementState || "未提供"} / 取消登记：${row.cancelRequested ? "是" : "否"}`));
        const recover = document.createElement("button");
        recover.type = "button";
        recover.textContent = "查看原请求";
        recover.addEventListener("click", () => { void action("lookup", () => prepareChoice({ kind: "recover", key: row.requestKey })); });
        item.append(key, summary, facts, recover);
        $("history").append(item);
      }
    });
  });

  render();
})();
