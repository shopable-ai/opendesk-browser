# Browser Fingerprint R1.8 · 增量构建、同源预览与 SDK 准入证据

## 范围与证据边界

A 只读：目标网页环境检测 → 来源标记 → 保存 A/B → 逐字段比较 → 历史恢复 → JSON 复制/导出。B 环境修改和 C 代理/Profile/多账号仍为 NO_GO。本文件记录 R1.8 的可核查增量，不复制 R1.5–R1.7 报告；证据以对应 Git SHA 的实际 CI 回执为准。

## P0 / P1：审查完成，构建需由 CI 验证

- 读取 main（修复前）：`9e8071056b6eb1f41094f3345b17629026d07ff1`；R1.7 四个历史提交已在祖先中，不重新实现。
- 历史失败 CI：<https://github.com/shopable-ai/opendesk-browser/actions/runs/40554158624>，源提交 `241f68466a610752a7c5175be1358c57e213f30d`；`discover`、`ci-contract` PASS；`app-validate (browser-fingerprint)` Host `tool-shell` 构建失败，Node/Chromium 步骤跳过。
- 日志错误：`scripts/bundle-provenance.mjs:274` 的 `reviewedCompiledStayFocus` 因可信源码 blob 不匹配而拒绝构建。这是有效安全失败，不得禁用。
- 旧锁定 `2c304e19e6a8f9b74d5fc2de19554c21b8ab3932`；当前 Stay Focus TSX blob `2e490028e19fbb048c2b9aa49073e7ee94100daf`。核查旧/新完整文件，**唯一差异**是 `time-review-trusted-actions` → `od-trusted-settings-actions` 与 `time-review-inline-clear-review` → `od-trusted-settings-review`。
- 正式样式 `src/ui/react/components/trusted-settings.css`（blob `edd884c613a49df293476bf4a2327826972005da`）同时定义两个新选择器及 `[hidden]` 规则；`src/ui/react/main.tsx`（blob `49061ec3cedb4de042d969cb808bd9dafb768f1f`）在唯一可信 React 根导入并注入该 CSS。
- 安全审计：动作回调、权限、网络、执行世界、危险操作确认语义无代码变化。只替换 `scripts/bundle-provenance.mjs` 中该一个精确 Git Blob 锁定值；强制不匹配失败保留。锁定修复提交：`49c853a4c4600bf82be6eb92da819b55e17eafa6`。
- **状态**：P1 源码审查 DONE，最新 Host BUILD / App CI **NOT_TESTED**（必须关联包含该修复的具体 CI SHA）。

## P2–P4：已有实现，等待真实门禁

- 已有 Node 测试：`tests/model.test.mjs`、`history.test.mjs`、`flow.test.mjs`。R1.6 曾有模拟 Host 的 13/13 PASS，但不能换算成当前提交的 Node PASS。
- 正式构建：`npm --prefix examples/sidebar-tools/browser-fingerprint run build`，必须验证 `dist/tool.js`、`dist/tool.css`、`dist/build-ready.json`。
- 唯一同源 HTML：`preview/react/index.html`，只由 `preview/react/build-preview.mjs` 从正式 JS/CSS、固定 React Runtime、Shared UI 构建；预览 SDK 是明确隔离的替身。运行 `preview:build`、`preview:check`，核对 SHA256。
- 已有 `preview/react/chromium.mjs`：浏览器交互、异步保存去重、历史对比、键盘、响应宽度等；新增测试前先核对已有覆盖。Chromium 同源 Fixture PASS 不等于真实网页采集 / Mac Chrome 安装。
- **状态**：本证据文件创建时 BUILD / NODE / PREVIEW / CHROMIUM / NATIVE 均未获得新提交对应的完成回执；不得宣称 PASS。

## P5：真实网页环境 SDK，仍 BLOCKED

- `src/framework/sdk/browser-contract.js` blob `341d2bad3bfa8f4cc007e7eef064617ec18f3ac0`。
- `src/framework/sdk/browser-schemas.js` blob `f4f919b7ad7ff1013d4342b3fdfafec5b1dd745c`。
- SDK 只支持 `browser.page.getContext` 的当前页上下文，不提供经过审批的目标网页 JS 环境白名单采集接口。User-Agent、languages、timeZone、viewport、screen、DPR 继续标记 `not_exposed`；禁止从 Side Panel 的 navigator/screen 伪造目标数据。
- R1.6 的最小提案保留于 `evidence/r16-incremental-and-sdk-gap.zh-CN.md`，不再重复扩权讨论或私自增加 `chrome.scripting` 权限。
- **GO / NO_GO**：仅能验证部分 A，完整 A 因 SDK 未获批准而 **NO_GO**。

## 下一步最小操作

观察由此文件变更触发的 Browser Fingerprint App CI：核对 `discover` → `ci-contract` → `app-validate` 的 Host 构建、Node、预览及 Chromium 回执。CI 若失败，以第一条真实错误为准修复，勿刷新无关锁。仅在拿到真实产物 SHA 和浏览器证据后更新相应结论；不提交伪造 PASS。
