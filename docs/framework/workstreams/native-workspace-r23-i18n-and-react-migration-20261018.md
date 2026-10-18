# OpenDesk Browser · Native Workspace R23 工程记录（2026-10-18）

状态：**PARTIAL / GOAL NOT COMPLETE**。此记录只描述已提交的真实代码与可验证证据，不代表完成 React 迁移、Mac Native 写盘或 AI 审阅验收。

## 已实施（代码而非 Mock）

- 可信页面公共 `src/i18n/index.js`：四语言、区域回退、显式选择、持久化、Intl、字符串与命名占位符完整性审计；使用 `src/i18n/locales/{en,zh-CN,zh-TW,ja}.js`。每包含 188 个一致的语义 Key。
- 原 Workspace 和 Native Agent 设置页增加语言选择，选择列表由唯一注册表 `SUPPORTED_LOCALES/LOCALE_NAMES` 生成；设置页、部分 Workspace 状态可即时切换，不触碰用户文件内容。
- `src/native-agent/settings.js` 仍为唯一正式 Native 设置/Workspace 固定入口；保留 `workspace.js`、`workspace-chat-edit-ui.js` 及既有 Bridge、会话、授权、SHA、保存后读回、冲突、AI 审阅原算法。未增加第二 Native Host、文件保存器或远程 JS。
- 现有 `workspace.html` **仍为静态主视图**。目前没有 Workspace React Root、完整 JSX 组件、React Store/Actions 合同或 Shared UI Workspace 消费者。不得将本次 i18n 交付宣传为 React 19 已迁移。
- 原 `src/ui/react/main.tsx`、`tool.html`、`tool-shell.js`、公共组件均未由本轮改动，R35 并行边界保留。

## 真实验证及局限

- 现有原 Workspace 集成/对话/文件树测试与 R23 四语言测试由 `.github/workflows/native-workspace-r23.yml` 执行；其第一版双任务候选成功记录：[39139340615](https://github.com/shopable-ai/opendesk-browser/actions/runs/39139340615)。
- `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 已在上述同 SHA 的 CI PASS；后续 main 并行 R35 源码/测试仍可能变化，必须重跑最新候选，不能复用旧 PASS。
- 新增 `scripts/tests/native-workspace-r23-chrome.mjs` 用实际打包扩展在 Chrome 检验按键切换语言、跨页面持久化、离线危险操作禁用，并保存截图与 JSON 回执；仅是 Chrome UI 证据，**不是 Native 真盘读写测试**。
- 曾在 R35 并行变更的 `tests/environment/react-sidebar-r333.test.mjs` 第 29 行发现字面 `\\n` 导致全局 `npm run check` SyntaxError，记录于 [39139932722](https://github.com/shopable-ai/opendesk-browser/actions/runs/39139932722)；属于其他并行维护范围，本轮不跨任务修改。后续工作流允许其失败后继续运行 R23 浏览器证据，最终总状态仍会如实 FAIL。

## R23 未完成的必备任务

1. **React 完整接管：** 为 `workspace.html` 建立一个受信 React 19 Root，迁移全部操作、文件树、预览与 AI 面板为独立组件；仅在完整真实回归后删除旧 DOM owner。不可用长期 Portals/隐藏旧页面冒充 React 化。
2. **业务解耦：** 将 `workspace.js` 和 `workspace-chat-edit-ui.js` 的真实控制器从 DOM 读写分离为 `getSnapshot/subscribe/actions` 或等价契约，保持全部 Native authority/session/lease 和 AI binding 校验；React 只消费状态与动作。
3. **完整动态 i18n：** 迁移全部错误码、操作反馈、权限说明、ChatGPT AI 引导至语义 Key，禁止翻译协议体、文件内容、路径及签名。当前只有主要静态文案及部分动态状态覆盖。
4. **真正复用 Shared UI：** 仅引用 `src/ui/react/components/ui/` 与现有 Tokens，React Workspace 代码不得复制组件、建立新 Runtime 或重写 Host。涉及 R35 共用文件时核查 Git 状态及归属。
5. **真实验收：** 最新候选 `npm run check/build/build:dev/verify`，Chrome 320/360/400/桌面 i18n、键盘/焦点、Native 文件保存/冲突/离线/重连/读回及 ChatGPT 手工审阅。Mac Native 真盘及 AI 真对话验证未在此云环境执行，必须标记 NOT_TESTED 并在本地执行。

## 新增语言的最小改动

在 `src/i18n/locales/<locale>.js` 提供与英文包相同的全部 Key 和占位符；在 `src/i18n/index.js` 注册 import、`SUPPORTED_LOCALES`、`LOCALE_NAMES`、`CATALOGS` 以及 `normalizeLocale` 对应区域回退。两个 HTML 页面的下拉选项会自动来自注册表，**无需修改页面组件**。运行定向测试与正式包验证，绝不复制一套新 i18n。
