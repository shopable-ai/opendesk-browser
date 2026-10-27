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
