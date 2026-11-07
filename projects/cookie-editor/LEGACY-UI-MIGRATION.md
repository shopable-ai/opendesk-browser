# Cookie Editor · 旧 UI 迁移与删除契约（R3.2）

> 以 `preview/cookie-editor.html` 为唯一认可设计基线，正式业务由 `app/CookieEditorApp.jsx` + 已有 Controller/SDK/Trusted 提供。此文档只约束行为和删除，不复制旧源码，也不代表测试通过。

## 归属与构建来源

- **旧表现层：** `src/index.html`、`src/main.js`、`src/style.css`。仍被历史回归与 CI 引用，不是正式 React 安装入口。
- **唯一产品 UI：** `app/CookieEditorApp.jsx`、`app/components/*`、`src/react.css`；`app/entries/official.jsx` 创建唯一 React root，入口 `src/root.html`。
- **业务与安全：** `app/controller/cookie-controller.js`、`app/adapters/browser-sdk.js`、`app/domain/*`、`trusted/account-service.js`、`trusted/account-vault.js`。UI 不直接使用 `chrome.cookies` 或自行实现 Host/加密栈。
- **同源预览：** `preview/react/src/App.jsx` 引入正式 App，`mock-sdk.js` 仅用于预览/测试；由 `preview/react/build-preview.mjs` 生成 `preview/react/index.html`，不可手改生成物。
- **版本：** `tool.config.json` 源码版本 2.0.40；原已提交安装 JSON 为 2.0.39。必须实际构建 Candidate、比对 build-ready 与来源后才可晋升安装包。

## 行为覆盖矩阵

状态含义：`SOURCE`=有正式实现及源码证据；`TEST_PENDING`=本轮未执行行为测试；并非 PASS。

| 行为（旧代码对应） | 正式 React / 业务归属与安全约束 | 测试入口 | 判定 |
| --- | --- | --- | --- |
| 列表、搜索、原位编辑与真实 Dirty（`main.js:renderBrowser,editorSnapshot,hasUnsavedChanges`） | `CookieEditorView`、`CookieInlineEditor`、`CookieEditorApp`；只对实际变化提示放弃草稿 | `cookie-editor-react-source.test.mjs`、`preview/react/chromium.mjs` | SOURCE / TEST_PENDING |
| 精确 CRUD、改名及覆盖冲突（`sameCookieScope,saveBrowserCookie`） | `cookie-model.js`、Controller；name/domain/path/store/partition 精确身份，可信写后回读；UNKNOWN 不重试 | `cookie-editor-react-controller.test.mjs`、`cookie-editor-write-intent.test.mjs` | SOURCE / TEST_PENDING |
| 敏感值读取、隐藏、擦除（`redactMetadata,revealBrowserValue,scrubEditors`） | Controller + 单独敏感授权 + React ref/DOM 清理；严禁将原值加入全局 state、日志、Mock 或持久化草稿 | `cookie-editor-react-source.test.mjs`、`cookie-editor-react-controller.test.mjs` | SOURCE / TEST_PENDING |
| Session、Expiration、DST（`originalExpiryInput`） | `cookie-expiration.js`、`CookieInlineEditor`；保留原始秒数，拒绝 DST 歧义与过期时间，Session 不设绝对时间 | `cookie-editor-react-domain.test.mjs`、`preview/react/chromium.mjs` | SOURCE / TEST_PENDING |
| 导入、跨站授权、部分结果（`inspectImport,confirmLiveImport`） | `CookieImport`、Controller + 单次 Host intent；预检、skip/denied/unknown 均需真实计数，不自动重放 | `cookie-editor-cross-site-import.test.mjs`、`cookie-editor-import-intent.test.mjs` | SOURCE / TEST_PENDING |
| 复制、导出、下载（`exportBrowserCookies`） | `CookieExport`、Controller；敏感导出授权和一次性可信回执，不能以触发动作替代交付证明 | `cookie-editor-react-controller.test.mjs`、`preview/react/chromium.mjs` | SOURCE / TEST_PENDING |
| 单项删除与本站批量清理（`deleteBrowserCookie,clearBrowserSite`） | Controller/SDK/Host；精确作用域、保护其他 Store/Partition、危险清理确认 | `cookie-editor-clear-intent.test.mjs`、`cookie-editor-react-controller.test.mjs` | SOURCE / TEST_PENDING |
| 切站、撤权、离线隔离、异步取消（`epoch,switchSite,passiveVisible`） | Controller invalidate/epoch、React 同步擦除 DOM 密钥；离线内容永不被当成真实 Cookie | `cookie-editor-react-controller.test.mjs`、`preview/react/chromium.mjs` | SOURCE / TEST_PENDING |
| 本机加密账号、锁/解锁、保存/更新/删除、切换 | `CookieAccounts` → Trusted account-service/vault；只让脱敏账号 metadata 进入 React；切换需写入与回读 | `cookie-editor-account-vault.test.mjs`、`cookie-editor-account-switch-host.test.mjs` | SOURCE / TEST_PENDING |
| URL 白名单自动切换 | `account-switch-url.js` + Trusted；仅批准站点根路径 Fragment、启用开关与白名单，禁止 Query 和假成功 | `cookie-editor-account-switch-url.test.mjs`、`cookie-editor-account-switch-host.test.mjs` | SOURCE / TEST_PENDING |
| 六 Tab、键盘、520px、Sheet、Popover、明暗色 | 正式 React + `src/react.css` + Shared UI tokens，附加 Tab 后端缺失时只展示未接入 | `cookie-editor-react-design.test.mjs`、`preview/react/chromium.mjs` | SOURCE / TEST_PENDING |

## 旧代码独有行为与删除门槛

1. **不得只比较函数名。** 核对实际草稿撤销、显式清空红acted值、改名后旧身份删除、导入批次去重与敏感字段清理；如发现旧功能独有，先在 Controller/React 增加等价实现与自动测试。
2. **已认可 HTML 是视觉参考，不是权限依据。** 旧 HTML 企业/账号/会员数据为演示；生产不得虚构配额、授权、发票、邀请 Token、写入或切换成功。
3. **安全退化零容忍。** 未得到 Host 可信回执、结果未知、撤权、跨站与分区不一致均保留阻止自动重试/敏感数据泄露的保护。
4. **删除需四证齐备：** 无生产/测试/CI 引用；业务行为映射且没有独有缺口；替代测试真实 PASS；构建 Candidate 与正式来源一致。任一缺失即 `DELETE_DEFERRED`。

| 文件 | 决策及理由 |
| --- | --- |
| `src/main.js` | **DELETE_DEFERRED**：`tests/environment/cookie-editor-ui.test.mjs` 仍直接运行旧 DOM 模拟测试；需先迁移覆盖。 |
| `src/index.html`、`src/style.css` | **DELETE_DEFERRED**：旧 UI 测试、`cookie-editor-r43-parity.test.mjs` 与 `.github/workflows/cookie-editor-r56-react-candidate.yml` 仍引用。 |
| `app/CookieEditorApp.jsx`、`CookieEditorView.jsx`、`CookieAccounts.jsx`、`src/react.css` | **KEEP / REPLACE_UI**：正式代码，不得删除。 |
| `CookieBusinessPanels.jsx`、`CookieAccountExperiences.jsx` | **KEEP / NEEDS_AUDIT**：六 Tab 与推荐/分享/市场仍引用，业务退出未确认；不得借清理删除。 |
| `preview/cookie-editor.html` | **KEEP**：唯一认可视觉基线。 |
| `preview/react/index.html` | **GENERATED**：只能由已有构建链输出。 |

保留旧源码由 Git 历史负责，无须复制一份 archive。版本、buildId、Hash、CI、Mac Chrome 均以真实构建和测试产物为准，未执行即 `NOT_TESTED`。
