# Browser Fingerprint R2.5 — 德国恢复归因与最小修复

2026-10-29；产品版本维持 0.2.2；正式安装 JSON 仍为 0.2.1，未晋升。

## 当前证据与原因

- 基线 `d69aa8ff2e9f0b35d08e409a37554dfa6ab79d02`；后续 main `37f3c3b5915371093faf0ee255cdba583134c6f5` 已修正 React 报告等待条件，无须重做安装、React 或美国预设。
- [原 R2.4](https://github.com/shopable-ai/opendesk-browser/actions/runs/40897606912) 和 [等待报告后的 R2.4](https://github.com/shopable-ai/opendesk-browser/actions/runs/40899487111) 均失败于德国恢复。后者的稳定报告已挂载，语言行的 baseline / expected / observed 为 `en-US / en-US / de-DE`，status=mismatch，source=page-runtime；UA、UA-CH、时区和 viewport 一致。HTTP Accept-Language 无可信网络采集，地理位置未支持，公网 IP 不在范围内。
- 原独立观察器只读取 `navigator.language`，显示 `en-US`；生产 Host 读取 `navigator.languages`，仍为 `['de-DE']`。本机 macOS / CFT 155.0.8059.39 以相同生产驱动、MAIN 读回和“先 scalar、后 array”顺序复现；相反顺序会掩盖问题。故为真实缓存残留，而非产品应该忽略的字段或 React 假阴性。
- Chromium 的 [language 缓存实现](https://github.com/chromium/chromium/blob/f043649a0ef1fd96e48d56ddbfc8a4a99aa2ca37/third_party/blink/renderer/core/frame/navigator_language.cc#L39-L97) 与 [CachedAttribute](https://github.com/chromium/chromium/blob/f043649a0ef1fd96e48d56ddbfc8a4a99aa2ca37/third_party/blink/renderer/core/frame/navigator_language.idl#L7-L9) 解释了 scalar 读回更新 dirty 标记但 JS array 仍旧的路径。仅清空 UA override 后再 detach 的实验仍失败。
- `App.jsx` 在同步分类后写记录、随后挂载字段报告；旧证据中的 `NO_INDEPENDENT_READBACK` 是过早读取报告，37f 已处理。分类不依赖记录写入结果，不能用记录错误解释 language mismatch。
- 记录写入存在独立的键顺序误报：Chrome storage 可能重排对象键，而工具用原始 JSON 字符串比较。改为递归排序对象键，数组顺序、内容、CAS 和未知写入不重放仍保留。

## 修改与定向验证

- `src/platform/chrome/browser-fingerprint.js`：只有确实尝试语言覆盖的 Session，在 detach 前以原始非空 UA / languages 设置覆盖，使用生产 MAIN reader 刷新语言数组，然后 detach。重置或读回失败仍返回 unknown；不会重试原生操作，不注入 navigator 属性补丁。
- `src/presets.js`：存储提交后按对象内容核对，修复对象键重排误报。
- `tests/r21.test.mjs`、`tests/r22.test.mjs`：整合 main 后 24 项通过；包括重排对象键、真实值改变、数组顺序、ack 丢失不重放、语言缓存和重置失败仍解除 debugger。保留远端显式 UA / locale 清空，在清空前刷新原始语言数组。
- `tests/native-r23-driver.mjs`：在真实 macOS CFT 155 增加 scalar-first 独立数组回读，美国与德国两 Session 均 PASS；属于 **CHROMIUM_NATIVE_DRIVER**，不是正式安装或 MAC_CHROME 全链验收。
- `tests/installed-r24.mjs`：正式安装验收的独立观察器也读取并断言完整 languages 数组，继承 37f 的稳定报告等待。
- React/Vite 同源构建与 0.2.2 临时候选构建通过；候选 88673 bytes。未覆盖正式 JSON。

## 提交与最终状态

- 修复提交 `f50f2d2bc`；与远端同功能修复安全整合 `2a0ddf84e`；同步并推送 main 的候选提交 `5325ab134617a08bf912bee65b0e48f92758ee7f`。未覆盖其他任务的未提交改动。
- [定向安装 CI 40902874829](https://github.com/shopable-ai/opendesk-browser/actions/runs/40902874829) **PASS**。美国、德国为独立 Session，正式审阅安装、可信 X11 原生点击、React / SDK / Host / CDP、MAIN 独立读回、停止恢复及 debugger detach 均通过。原始与恢复后的 `navigator.language=en-US`、`navigator.languages=['en-US']` 一致；产品为 `restored_limited`，无记录写入未知提示。
- [指纹核心 CI 40902874862](https://github.com/shopable-ai/opendesk-browser/actions/runs/40902874862) **PASS**：App Node、React 构建、权限/SDK 门禁和真实 CFT 原生驱动。
- [通用 App CI 40902874837](https://github.com/shopable-ai/opendesk-browser/actions/runs/40902874837) **FAIL / discovery**：`React App requires an explicit browser test profile`，在任何 App validate 之前终止；只读核对冻结源码，`scrapyjs` 使用 React runtime 而缺少 `app.ci.json`。不能将此轮通用 CI 记为 PASS；未据此重开指纹产品开发。
- 本机同源 React preview **PASS_FIXTURE_ONLY**，production Standard Browser 冻结构建 **PASS**（静态包，不连接 dev server）；Host packageHash `7ec4b59200db23791ea6fc068a34d8109100a94c74d9ebc47e68d66cb8111b16`。未覆盖日常 `dist/development` 或停止其 watcher。
- Mac GUI 能力实际可用：独立 CFT 155 应用 / Profile 加载上述 production，真实 Side Panel 显示五 Tab，进入扩展中心和原生文件选择框；但 CFT 抛出 `NSInternalInconsistencyException: -enableWindowReuse was called despite window reuse having already been explicitly enabled.` 后 exit 133。尚未完成安装审阅，**MAC_CHROME = NOT_TESTED（环境阻断）**，不是指纹恢复 FAIL，也不是 Mac 安装 PASS。不再自动重试；该进程已退出，Profile / crash 保留。
- P3 剩余原生生命周期按用户指定顺序等待 P2；本轮未执行。P4 未晋升；唯一正式 JSON 仍为 0.2.1。HTTP Accept-Language **UNVERIFIABLE**，Geolocation **UNSUPPORTED**。

精简、可审查证据见 [r25-evidence.json](r25-evidence.json)。完整 CI artifact ID `12909799119`，ZIP SHA256 `993cf11f79a65029095e6ebb948b4aaf813a84324457b09edab63654e162d868`；候选 SHA256 `b0d48d86f35eec9edc53d3d308737f496e58bb91013af11138fd1f76e5e5ee19`。本机原始证据保留在忽略目录 `artifacts/fingerprint-r25/`，包括 `installed-pass/`、`react-preview/`、`mac-evidence.json`、`mac-cft-crash.ips`；生产驱动最终证据为 `artifacts/sidebar-tools/browser-fingerprint/chrome-native-r23/evidence.json`。未把 Linux Xvfb、隔离驱动或 preview 等同 Mac 正式安装验收。
