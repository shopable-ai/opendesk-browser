# Cookie Editor R2.7 · CI 安全与测试差量（2026-10-27）

- 原始目标：现有 Cookie Editor React 产品上的安全 Cookie 管理、加密多账号、可信切换、URL 规则、受控分享/市场设计。
- 当前 owner：Cookie Editor R2.7 本轮 GitHub Connector 差量修复；仅以下声明文件，无跨任务独占整个目录。
- 只读基线：main 911f2767c9b3be906cbfa3a49fd8db0061e894eb；R5.38 CI 40385841964、R5.12 CI 40385843248、R3.3 CI 40385842917。
- 写入范围：`src/platform/chrome/context-menus.js`（仅 Cookie 用户授权的官方身份验证条件）、`tests/environment/cookie-editor-r50-trusted-pilot.test.mjs`（新增 CookieSiteBar 后更新单根 React import 合同）、本工作流账本。
- 现存负面断言：`tests/environment/browser-sdk-r9-installed-host.test.mjs` 的冒名安装包不能使用 `cookieCapability: all` 进行 Cookie 权限整体开启，期望 `E_SCHEMA`。不改动此安全负面断言。
- 安全边界：普通 Cookie 工具仍使用单项 capability 审核；正式单击整组授权必须通过现有 catalog/provenance/官方包字节验证。不增加 SDK、Host、权限范围或隐式授权。
- 已知不属于本次最小写入：Browser SDK 的 siteBudget 注册表差异；正式配置 2.0.40 与已提交安装包 2.0.39；预览 index.html 的最新 Vite 同源重构建。应由对应所有者及正式候选晋升流程处理，不改写压缩 JS/JSON。
- 验证：上述两文件写入后需以新 commit SHA 在 CI 中复核；无本机仓库、无真实 Mac Chrome 的结果记 NOT_TESTED；不以源码修补声称发行成功。

## 本轮提交及针对性 CI 回读

- 已正常 fast-forward 提交并推送 `b162cb49fe2310ee68b0702a6742090bc255a579`；代码/负面测试/本记录三文件，GitHub HEAD、commit 文件列表与内容均已读回。
- [R5.38 同 SHA](https://github.com/shopable-ai/opendesk-browser/actions/runs/40387559855)：`buildCookieEditorReact`、正式源码约束与临时候选打包、Vault/URL Host 19 项、R5.24 grant 5 项、`browser-sdk-r9-installed-host` 10 项、React preview/controller 23 项、React compiled package 4 项均 PASS。原越权回归不再失败，不能把这等同 Mac native PASS。
- R5.38 的最新 **EXTERNAL_BLOCKER**：`npm run build:dev` 的固定 SW provenance 明确报 `Trusted Stay Focus source changed; review and re-pin before fixed build: examples/sidebar-tools/stay-focus/trusted/service.js`，来源为 `scripts/bundle-provenance.mjs:270`；责任为 Stay Focus trusted/固定 SW provenance 所有者。此处不能为了 Cookie CI 自动更新钉住的安全散列，也不能跳过该构建门禁假冒发行通过。该失败导致其后的 Chromium、完整 Preview build、项目包一致性及 main 晋升全部 SKIPPED。
- [R5.12 同 SHA](https://github.com/shopable-ai/opendesk-browser/actions/runs/40387559654)：原过时 `CookieEditorView,CookieIconButton` JSX 导入断言已消失；剩余 3 项失败都来自 **尚未晋升的 2.0.39 正式包**与当前 2.0.40 源码/打包字节不一致。无需重复改 React 导入、不可直接改安装 JSON 版本伪造通过。
- [R3.3 上一候选](https://github.com/shopable-ai/opendesk-browser/actions/runs/40385842917)：Browser SDK `siteBudget.getStatus/setPolicy` 注册表/矩阵差异属于 Browser SDK owner，当前 Cookie 主流程未触及，不因本轮修正 Host grant 而改 SDK 注册表。
- [R5.38 保留临时候选](https://github.com/shopable-ai/opendesk-browser/actions/runs/40387559855/artifacts/12680168714) 可追溯来源，但只属于未通过完整 release gates 的 CI 测试产物，不是已晋升的可安装正式版本，也不是新的同源可打开 HTML 预览。
- R2.2 原始 Library HTML 已阅读源码（网站栏约 46px、下划线 Tab 41px、账号行 61px）；尚无同尺寸同主题截图对照，**VISUAL NOT_TESTED**。
- Preview 正式同源 HTML `preview/react/index.html` 尚未由本次 R5.38 的 Vite 阶段重新生成，**PREVIEW NOT_TESTED**；Mac 本地隔离 Chrome 安装/升级/真实 Cookie 回读、账号与自动切换均 **NOT_TESTED**。
- 下一最短正确依赖链：Stay Focus owner 审计并修复其固定来源 pin → 在新 main 候选运行现有 R5.38 所有安全门禁 → Chromium 截图/交互 PASS 后由 CI 原位晋升现有单一 package 与 React preview → 复跑版本/字节一致性 CI → Mac 本地 Codex 同候选隔离 Chrome 验收。

## 本机核心增量验证（用户最新调整，2026-10-27）

- 状态：`IN_PROGRESS`；owner `01a17be7-87b3-7ac1-be44-b1708474b0af`。最新指令为“优先测试核心部分功能，增量测试”；完整发行/尺寸矩阵/八维评分延期，不恢复旧全量清单。
- 本轮写入仅限此账本、现有 React 预览生成 HTML，以及真实核心缺陷涉及的 Cookie 文件；保留其他 Agent 的未提交内容。
- 资源：预览 `examples/sidebar-tools/cookie-editor/preview/react`；独立证据 `artifacts/cookie-editor-r27-core-20261027-01a17be7/`；隔离 headless 浏览器 Context；共享 `dist/development` 只读，不构建 WXT、不使用日常 Profile。
- 首个实测阻塞：现有 `npm run check --prefix examples/sidebar-tools/cookie-editor/preview/react` 因 `E_PREVIEW_SOURCE_DRIFT: .../build-preview.mjs` 退出 1。先经原 Vite/build-preview 重建同源预览，再仅验核心交互；不手改生成 JS/JSON。

### 本轮结果与资源释放

- 状态：`CORE_DELTA_PASS / RELEASE_EXTERNAL_BLOCKER`；浏览器 Context/进程已关闭，预览写入已结束，资源 `released`。本轮未创建 Codex Goal，也未将原始产品正式验收标为完成。
- 失败现象 → 根因 → 修复：旧 `npm run check` 退出 1，预览收据仍绑定旧 `build-preview.mjs`；原有 `npm run build --prefix examples/sidebar-tools/cookie-editor/preview/react` 重建当前正式 App、固定 React、既有 Shared UI 和 Preview Adapter，仅更新原有 `preview/react/index.html`。源码功能未发现待修缺陷，不改业务。重建后 `npm run check` 退出 0。
- HTML SHA-256：`c11bbd56d7b9fe0979bd8be80e12bffd50af821a587d4249a7f41454a81390a0`；编译 App：`b289864342c1e4a7daa1ef7ee775956f33eb7ca0abd5294f8f0717499ef1dda4`；复用 Shared UI：`ac19e06f606c73aa956c004b6c725756f9bd6bb2cd33d846c757bf115a61e070`。所有已编译输入及摘要保留于本地 `resources.json`；共享 WXT 输出未写入。
- 浏览器核心增量：本机 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，`149.0.7827.55`，Darwin，隔离 headless 临时 Profile/Context，380×880。真实产品 React 配合虚构 transport，6/6 组通过：Cookie Session 新建/编辑/回读/删除；持久 Expiration/Session 切换/过期拒绝与 Partition 身份；保存失败/未知结果保留草稿；Vault 锁定/解锁/错误口令及账号 CRUD；可信回执后更新当前账号、切换失败/未知不冒称成功；URL opt-in、白名单、跨源拒绝和返回焦点。pageerror 0，HTTP(S) 请求 0。
- 之前 CI 因 WXT 阻塞而跳过的增量 Expiration 专项，本轮执行 `node --test tests/environment/cookie-editor-react-expiration.test.mjs`，6/6 PASS（本地时区/DST、精确秒数、Session 不带过期时间、排序及 Controller 回读）。
- 去重：对照 `b162cb49fe2310ee68b0702a6742090bc255a579`，Cookie `app/`、`trusted/`、Host 授权修复及相关 Host/Vault 测试输入无差异，复用已有 CI 成功步骤，未重跑这些旧测试，未手动触发整套发行 CI。
- `EXTERNAL_BLOCKER` 仍存在：Stay Focus `trusted/service.js` 的当前/HEAD/origin blob 为 `b1dc68d94740b704706766ebf3f99c05cec9ad09`，固定 pin 为 `98c2db8cbc9602fa7eb9ac23fc6b50362c2cca74`（`scripts/bundle-provenance.mjs:253`）。只读 `describeBundle()` 可复现原来源拒绝；变化来自 `55e33dcef` 的 marketplace 入口来源扩展。责任归 Stay Focus 可信功能/构建 provenance owner；具体人员未知。未更新 pin、未跳过门禁、未使用旧扩展冒充新候选。
- 正式包仍为 2.0.39，配置为 2.0.40；未晋升。真实扩展 Cookie SDK、Chrome 网站/工具权限、安装/升级/撤销、原生加密仓库及真实 URL 自动切换均 `NOT_TESTED`。本轮浏览器测试是同源 React 预览，不是原生 Cookie PASS；模拟 Vault 不是加密证明。
- 原始日志与可重放本地 driver：`artifacts/cookie-editor-r27-core-20261027-01a17be7/{preview-build.log,core-smoke.mjs,core-smoke.log,core-report.json,expiration.tap,resources.json}`；截图：`cookie-readback.png`、`cookie-unknown.png`、`account-switched.png`、`account-unknown.png`。这些机器本地证据不加入 Git，不生成额外正式包。
- 当前阶段已完成核心增量验证；按最新要求，完整尺寸/主题/200% 矩阵、分享/市场全面验收、八维评分及正式发行延期。后续仅在来源 owner 修复并有合法新候选后补受阻的原生核心验证；不自动恢复全量验收。
