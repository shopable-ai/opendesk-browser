"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const pins = [
    { version: "1.0.0", manifestHash: "57598844f11f75d7566c5adeab283a3aaed0614d151590a6f34124e7abf3632a",
      sourceHash: "1f72cf17aa04e8a8597ef43e554ae5507f9da58b73e46d731373cd318f6dcf63" },
    { version: "1.0.1", manifestHash: "8a39edc5ba519869ac5c74132b46830727d3ef8a8c2e4695bb2a0a995e1523c7",
      sourceHash: "9e74a9e089dda18fadc495e9c90b6851ad686eb20b40159d36547d5326c56153" },
    { version: "1.0.2", manifestHash: "121561a42069c201658511e3dc8227e962c671d5149d3c50731f4fea5e99b05c",
      sourceHash: "9e74a9e089dda18fadc495e9c90b6851ad686eb20b40159d36547d5326c56153" },
  ];
  let busy = false;
  let generation = 0;
  const clear = () => {
    $("proof-result").hidden = true;
    $("proof-documents").replaceChildren();
    $("proof-identity").textContent = "";
    $("proof-session").textContent = "";
    $("proof-summary").textContent = "";
  };
  const line = (tag, value) => {
    const element = document.createElement(tag);
    element.textContent = String(value);
    return element;
  };
  document.defaultView.addEventListener("pagehide", () => {
    generation += 1;
    clear();
    $("proof-status").textContent = "已离开观察页，请重新查询。";
  });
  $("proof-name").addEventListener("input", () => {
    generation += 1;
    clear();
    $("proof-status").textContent = "姓名已变化，请重新查询。";
  });
  $("proof-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const name = $("proof-name").value;
    if (name.length < 1 || name.length > 40) {
      $("proof-status").textContent = "请输入本次任务原样发送的 1–40 字符姓名。";
      return;
    }
    busy = true;
    const started = ++generation;
    $("proof-query").disabled = true;
    clear();
    $("proof-status").textContent = "正在读取原观察记录。";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch("/__opendesk_cloud_proof/query", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }), mode: "same-origin", credentials: "omit",
        redirect: "error", cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) throw Error("unavailable");
      const proof = await response.json();
      if (started !== generation) return;
      if (proof?.proofLevel !== "PASSIVE_ONLY" || proof.nativeIdentity !== "NOT_OBSERVED" ||
          typeof proof.sessionId !== "string" || proof.task?.taskId !== "sample.form-fill" ||
          !pins.some(pin => pin.version === proof.task.version &&
            pin.manifestHash === proof.task.manifestHash && pin.sourceHash === proof.task.sourceHash) ||
          !Array.isArray(proof.documents)) throw Error("contract");
      $("proof-session").textContent = `观察会话：${proof.sessionId}`;
      $("proof-identity").textContent = JSON.stringify({ sessionId: proof.sessionId,
        task: { taskId: proof.task.taskId, version: proof.task.version,
          manifestHash: proof.task.manifestHash, sourceHash: proof.task.sourceHash },
        proofLevel: proof.proofLevel, nativeIdentity: proof.nativeIdentity }, null, 2);
      $("proof-summary").textContent = proof.documents.length
        ? `当前会话有 ${proof.documents.length} 份原文档包含此姓名；请逐项核对提交次数和完成文字。`
        : "当前观察会话没有匹配记录。查不到不代表未执行；旧会话、缺事件或姓名不同均可能导致缺证，不要重新提交。";
      for (const doc of proof.documents) {
        const item = document.createElement("li");
        item.className = "stack";
        item.append(line("code", doc.documentInstance),
          line("p", `全部提交：${doc.submitCount} 次；此姓名提交：${doc.matchingSubmitCount} 次；事件序列：${doc.sequenceContinuous ? "连续" : "不完整，不能据此确认唯一执行"}`),
          line("p", `原 HTML SHA-256：${doc.htmlSha256}`));
        for (const entry of doc.events) {
          item.append(line("p", `#${entry.eventSeq} / 接收 #${entry.receiveSeq} · ${entry.type} · 页面 ${entry.at} · 接收 ${entry.receivedAt}`));
          if (entry.completionRedacted) item.append(line("p", "完成文字与查询姓名不一致，已隐藏；不能据此确认本次效果。"));
          if (entry.matchesName === true && !entry.completionRedacted && typeof entry.done === "string") item.append(line("p", entry.done));
        }
        $("proof-documents").append(item);
      }
      $("proof-result").hidden = false;
      $("proof-status").textContent = "已读取页面观察事实；没有运行、重放或取消任务。原生执行身份仍须单独关联。";
    } catch {
      if (started !== generation) return;
      clear();
      $("proof-status").textContent = "观察服务不可用或记录格式未知，未能确认网页效果。请保留原请求键查询，不要重新提交。";
    } finally {
      clearTimeout(timer);
      busy = false;
      $("proof-query").disabled = false;
    }
  });
  $("proof-query").disabled = false;
})();
