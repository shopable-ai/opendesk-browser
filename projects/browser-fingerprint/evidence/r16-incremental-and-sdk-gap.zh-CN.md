# Browser Fingerprint R1.6 · 实际增量与平台阻断（2026-10-28）

## 原始目标、正式范围
A 只读：真实目标网页检测 → 来源标记 → 保存 A/B → 逐字段对比 → 历史恢复 → JSON 证据。B（修改 UA/语言/时区/定位）、C（代理/IP/Profile/多账号）继续 NO_GO。本应用不是反检测浏览器，禁止将 Side Panel 自身 `navigator` 数据冒充目标网页。

## 本轮直接提交的业务源码
- `src/App.jsx`：切换检测/对比/历史不再丢失持久化回执；同步操作锁防快速重复点击；具有 documentRef 的检测在返回前进行二次身份校验；过期读数失效；无稳定文档引用不允许保存。
- `src/model.js`：严格限制可持久化字段、来源及附加属性；拒绝注入 URL 查询参数、假目标 JS 或高敏指纹；冻结 A 级快照，仍只允许 Host 页面上下文。
- `src/history.js`：读回后验证并冻结历史；复用原 ETag CAS、8 KiB 限制、写后读回和 UNKNOWN 语义，保持 `fingerprint.a.history.v1` 与 A 级 Schema 兼容。
- `tests/model.test.mjs`、`tests/history.test.mjs`、`tests/flow.test.mjs`：覆盖来源篡改、身份变化、读回、冲突、单项容量和模拟的 A→B→比较→恢复→JSON 报告。测试替身不能证明目标网页真实采集。

## 现有 SDK 审计与缺口
R1.5 已有审计记录 `r15-source-audit.zh-CN.md`；2026-10-28 复核 `src/framework/sdk/browser-contract.js` Git Blob `341d2bad3bfa8f4cc007e7eef064617ec18f3ac0` 和 `browser-schemas.js` Git Blob `f4f919b7ad7ff1013d4342b3fdfafec5b1dd745c`，均与 R1.5 相同。唯一可用的 `browser.page.getContext` 不提供真实目标网页 JS 环境字段。UA、语言、时区、viewport、screen、DPR 因此仍为 `not_exposed`，完整 A 检测 BLOCKED。

**最小公共能力提议，仅供平台产品/安全评审，未获准、未实现、不得直接调用：**
- 建议新只读操作 `browser.page.readEnvironment`：只接受严格字段白名单 `userAgent/languages/timeZone/viewport/screen/devicePixelRatio` 和可能的 `expectedDocumentRef`，不接收脚本、URL、JS 函数或任意选择器。
- 可信 Host 验证应用安装身份、站点用户授权、tabId/documentId 与 HTTP(S) 页面；不授予工具通用 `chrome.scripting` 能力；执行世界需显式标记（页面 MAIN 与 ISOLATED 可能不同，不能冒充彼此）。
- 每字段返回 `status/value/source/capturedAt`，连同文档标识绑定；数据有界（例如总结果 ≤2 KiB）、固定超时及有限错误码。导航、撤权、卸载或身份不匹配应使旧回执失效，不自动重复。
- 不包含 Cookie、认证凭据、地理位置、IP 探测、UA-CH 高熵、HTTP Accept-Language 嗅探或额外网络请求。
- 获审后才可能修改平台 `browser-contract.js`、`browser-schemas.js`、可信 Dispatcher，再接 `src/adapter.js`、`src/model.js`；本轮没有私自修改 Host、权限、Manifest、Catalog。

## 真实证据范围
1. 先将 R1.5 原 `src/model.js`、`src/history.js`、`tests/model.test.mjs`、`tests/history.test.mjs` 在隔离 Node 22 工作区还原，`git hash-object` 与当时 main 的 4 个 Git Blob 完全一致；基线 `node --test tests/*.test.mjs` **8/8 PASS**。
2. 同一工作区对新增代码和用例运行 `node --test tests/*.test.mjs` **13/13 PASS**。本地修改文件的 Git Blob 应与正式提交 SHA 核对；这是模拟 Host 的 Node 单元/逻辑链路，**不是**真实 Chrome/NATIVE_PASS。
3. 当前工具环境无法读取用户 Mac 工作树，也无仓库根 `node_modules/vite`，故正式 Vite 构建、Shared UI 产物、React 同源 HTML 生成、Mac Chrome 真实安装、站点授权和视觉/键盘回归都 **NOT_TESTED/BLOCKED**。没有 `BUILD_PASS`，更没有 `NATIVE_PASS`。
4. R1.4 原始 HTML 未按预期 SHA256 `60d2f83068bc34b4bda322ad036eeb065022a7a982009cbad3e901db59828389` 核实原始字节，精确视觉一致性 **NOT_VERIFIED**；R1.3–R1.4 的 22 个历史离线 PASS 只作继承，不重复记入本轮。

## 下一步准入
先在真实 Mac 最新 main、安装依赖的仓库上运行：
```bash
node --test examples/sidebar-tools/browser-fingerprint/tests/*.test.mjs
npm --prefix examples/sidebar-tools/browser-fingerprint run build
npm --prefix examples/sidebar-tools/browser-fingerprint run preview:build
npm --prefix examples/sidebar-tools/browser-fingerprint run preview:check
```
核对 `dist/build-ready.json`、编译 JS/CSS 与 `preview/react/index.html` 源码/产物哈希，再做同源预览交互、320/360/400/440/520px、深浅色和键盘回归。

平台 SDK 获审补齐真实采集并使 Node/正式构建/同源预览门禁通过后，才生成本地 Codex 的原生 Mac Chrome 安装验收任务；在此之前不得发正式候选或宣称完整 A 已完成。
