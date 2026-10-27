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

## R1.8 第二轮实际 Host 构建失败及审核修复

- 运行 <https://github.com/shopable-ai/opendesk-browser/actions/runs/40558605822>，源提交 `ff4b61b2a0c3fbba35b2663a5b87ecb380f67cbb`：`discover` 与 `ci-contract` PASS，`app-validate` Host 构建 FAIL，Node/Chromium 后续步骤未运行。
- 第一处 Stay Focus 锁定失败已越过；新错误在 `scripts/bundle-provenance.mjs:445`：`Historical/user/vendor code cannot enter a privileged fixed bundle: examples/sidebar-tools/time-review/trusted/host.css`。
- 逐个核对固定 React Root 的六个静态 `?raw` CSS：time-review / bookmark-manager / cookie-editor / ai-vip-share / prompt-shortcuts / reading-toc，均为 app 自有展示样式，未见远程资源或脚本执行结构。
- 只为上述**六个精确路径**增加 `ui/tool-shell.js` 独占、SHA1 Git Blob 复核、符号链接拒绝的静态 Host CSS 准入；保留对其他 examples/vendor/installed 输入的构建硬拒绝，不引入目录通配、额外 Chrome 权限或安装包执行。
- 六个 CSS blob：`examples/sidebar-tools/time-review/trusted/host.css` = `fe6b0d09a19dc210cf61ce45a74ec5ddb7a183a6`；`examples/sidebar-tools/bookmark-manager/trusted/host.css` = `5bbe841558c86389994defd93f6077aa928a9cf9`；`examples/sidebar-tools/cookie-editor/trusted/host.css` = `b3d57a5df9a1f6089a3dfe97017ecdf73ea05a1f`；`examples/sidebar-tools/ai-vip-share/trusted/host.css` = `634786710c463671b9c24c424725bf6c7ff4ec8e`；`examples/sidebar-tools/prompt-shortcuts/trusted/host.css` = `aa08e38ebd56e34c49c1c07be5a1b6727426865b`；`examples/sidebar-tools/reading-toc/trusted/host.css` = `93db2443725c8fac84dd94585d08d933766c2040`。
- 该补丁是否 BUILD PASS / Chromium PASS 必须看此后同一提交 SHA 对应的 App CI，不提前宣称成功。

## R1.8 第三轮：正式构建/Node/同源 HTML PASS，Chromium Enter 测试契约失败

- CI <https://github.com/shopable-ai/opendesk-browser/actions/runs/40559808591>，提交 `d59d058a523fe38146ea08c71b48bb17db0d05ee`：
  - `discover`、`ci-contract` 与 Fingerprint 的 `Compile App and build a source-identical, unpromoted candidate` 步骤 **PASS**。正式开发 Host 构建回执 `status=passed`、源一致的 App 候选包 SHA256 `bf7fa4fcaa08940118047af7c920b3f239e8b80c52c878af8f45ad9b4dd343e6`。
  - Browser Fingerprint 的 Node/共享回归合计 **55/55 PASS**（本应用的既有 13 个用例包含其中）；`CANDIDATE_SOURCE_IDENTICAL` PASS。
  - 同源 HTML **实际生成**，`htmlSha256=c2e1357d9387f599b51d2448998dca00ed36b0811b750a7677d9c6acdc96f0c1`，`appSha256=3665ea564a1e1a37ad98a6962e7076c2661da24bc7e2f0439143e2fe5cac30c5`，`runtimeSha256=d1eec2e96ed42046ad543a10af7de992aee633ac06017f44f6b917e36451c758`，`sharedUiSha256=ee41ca4cee75d24aa7f1858f5193f0b7ba643e6f6a7fbaf6c0e54863141b48ab`。
  - Google Chrome for Testing **155.0.8059.39** 实际启动；脚本执行到 `chromium.mjs:176` 失败：`Timed out: keyboard Enter switched tab`；因此 **CHROMIUM FAIL**，宽度/深色等后续测试尚未执行，不能算 PASS。
- 键盘失败属于 CDP 事件构造差异，而非 React tab 的业务处理：真实 `<button>` 正常用 `onClick`，测试此前只发 `keyDown` / `keyUp`，不发 CDP `char`。使用隔离的 Chromium 按键最小复现验证：Tab 正确聚焦“对比”；仅 keyDown/up 未触发点击；发送 `char` 回车字符后才触发原生按钮 click。
- 仅在原有 `preview/react/chromium.mjs` 的 Enter 段增加 CDP `char` 事件，保持真实键盘驱动及生产 React 源码不变；**此修改自身的 Chromium PASS 尚待新 CI 重新验证**。
- 注意：CI 同次其他 App 的测试失败不自动归责指纹应用；SDK `not_exposed` 不变，Native 未测试。

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

## R1.8 最终已验证 · 同源正式构建与 Chromium（SDK 仍阻断完整 A）

- **真实 CI PASS**：<https://github.com/shopable-ai/opendesk-browser/actions/runs/40561525645>，`sourceCommit=c5190198bd3c3b6df5aabcc304449bcf5fa913d1`。该运行 `discover`、`ci-contract`、`app-validate(browser-fingerprint)` 全部成功；`native-macos-chrome` 为 **skipped**，不得宣称已安装。
- **Node PASS 55/55**：含本 App 既有 13 条模型/历史/流程测试及共享 Host 回归；`CANDIDATE_SOURCE_IDENTICAL` PASS。正式候选包版本 `0.1.0`、SHA256 `bf7fa4fcaa08940118047af7c920b3f239e8b80c52c878af8f45ad9b4dd343e6`。
- **BUILD PASS**：`examples/sidebar-tools/browser-fingerprint/dist/build-ready.json`：`buildId=48a31ab3355bceb514018435c6eb3e3a81ea1ebae5f523d0bed43cbac50d1f3d`；`dist/tool.js` 19672 B、SHA256 `3665ea564a1e1a37ad98a6962e7076c2661da24bc7e2f0439143e2fe5cac30c5`；`dist/tool.css` 4048 B、SHA256 `ebfb78ea0048ac52b963f351be87a203fe5275e37a27ec7fb401c3a6001819d5`。
- **PREVIEW BUILD PASS**：`preview/react/build-preview.mjs` 使用上述正式 JS/CSS 和固定 React 19 Runtime / Shared UI 构建单文件 HTML；`htmlSha256=c2e1357d9387f599b51d2448998dca00ed36b0811b750a7677d9c6acdc96f0c1`，`runtimeSha256=d1eec2e96ed42046ad543a10af7de992aee633ac06017f44f6b917e36451c758`，`sharedUiSha256=ee41ca4cee75d24aa7f1858f5193f0b7ba643e6f6a7fbaf6c0e54863141b48ab`。从实际 CI artifact 的 `artifacts/app-ci/browser-fingerprint/preview.html` 提取，重新独立核对文件 SHA256 完全一致；仓库内 `preview/react/index.html` 依然是构建前源码引用版，需要在本地运行 `preview:build` 才生成这一份同源单文件。
- **CHROMIUM PASS（离线模拟 SDK）**：Chrome for Testing `155.0.8059.39` 在 Linux xvfb 实际运行；`PASS_SIMULATED_HOST_CHROMIUM`，无 JS 异常，测试证据位于 CI artifact 的 `artifacts/app-ci/browser-fingerprint/chrome/fingerprint-r16-chromium-evidence.json`。已通过单 React Root / 三 Tab、目标身份失效拒写、保存中切换 Tab 与双击去重、A/B 比较、刷新历史读回、CDP Tab/Enter/Esc、320/360/400/440/520px 无水平溢出和深色截图。400px 截图 SHA256 `37f9207636e957e890b9edd668c6c5705b337d2ab50b9b03e410308f2e7681d8`。
- **证据限制**：CI 视图中中文字体为缺字方框，虽然容器和溢出自动检查 PASS，但不能据此认定中文视觉细节达到最终标准。真正的 macOS Chrome 安装、用户站点授权、200% 原生缩放、OS 剪贴板/文件实际落盘、目标网页 UA/languages/timeZone/viewport/screen/DPR 均未获真实完成回执。`preview:check` 独立命令尚未单独执行；同源编译/Hash 已由生成器和 Chromium 启动校验。
- **GO/NO_GO**：本轮可完成开发层面的部分 A 构建与离线交互验证；平台缺少经审批的真实环境采集 SDK，完整 A 功能仍 **NO_GO**，B/C 无权进入开发。本证据不把模拟页面或 Host 的 URL/title 当真实目标网页指纹。

