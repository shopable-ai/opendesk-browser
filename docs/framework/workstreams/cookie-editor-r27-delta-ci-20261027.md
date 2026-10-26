# Cookie Editor R2.7 · CI 安全与测试差量（2026-10-27）

- 原始目标：现有 Cookie Editor React 产品上的安全 Cookie 管理、加密多账号、可信切换、URL 规则、受控分享/市场设计。
- 当前 owner：Cookie Editor R2.7 本轮 GitHub Connector 差量修复；仅以下声明文件，无跨任务独占整个目录。
- 只读基线：main 911f2767c9b3be906cbfa3a49fd8db0061e894eb；R5.38 CI 40385841964、R5.12 CI 40385843248、R3.3 CI 40385842917。
- 写入范围：`src/platform/chrome/context-menus.js`（仅 Cookie 用户授权的官方身份验证条件）、`tests/environment/cookie-editor-r50-trusted-pilot.test.mjs`（新增 CookieSiteBar 后更新单根 React import 合同）、本工作流账本。
- 现存负面断言：`tests/environment/browser-sdk-r9-installed-host.test.mjs` 的冒名安装包不能使用 `cookieCapability: all` 进行 Cookie 权限整体开启，期望 `E_SCHEMA`。不改动此安全负面断言。
- 安全边界：普通 Cookie 工具仍使用单项 capability 审核；正式单击整组授权必须通过现有 catalog/provenance/官方包字节验证。不增加 SDK、Host、权限范围或隐式授权。
- 已知不属于本次最小写入：Browser SDK 的 siteBudget 注册表差异；正式配置 2.0.40 与已提交安装包 2.0.39；预览 index.html 的最新 Vite 同源重构建。应由对应所有者及正式候选晋升流程处理，不改写压缩 JS/JSON。
- 验证：上述两文件写入后需以新 commit SHA 在 CI 中复核；无本机仓库、无真实 Mac Chrome 的结果记 NOT_TESTED；不以源码修补声称发行成功。
