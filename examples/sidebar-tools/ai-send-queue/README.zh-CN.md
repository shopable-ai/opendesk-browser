# AI 消息发送队列

**原始目标：** 用户在 ChatGPT 正在回复时预先编写多条消息，由唯一 Page USER_SCRIPT 内存队列依 FIFO 顺序在原生输入安全、原生消息入站确认后自动发送下一条；侧栏仅提供网页使用提示，不显示或读取队列数据。扩展中心要以一个独立应用完成 Page + Sidebar 的安装、打开、更新、停用、卸载，授权安全边界不合并。

唯一产品根目录：`examples/sidebar-tools/ai-send-queue/`。R5.7 提交 `607f708d` 已完成目录合并。禁止再次迁移原 `examples/programs/chatgpt-send-queue/`。

## 当前范围（2026-10-29 最新要求）

用户明确侧栏不需要显示队列数据，并要求收敛测试。Tool `0.1.16` 仅提示在 ChatGPT 网页输入框使用皇冠按钮；移除侧栏的消息列表、状态、逐条操作、读取请求和轮询。扩展中心沿用原有安装、更新、停用和卸载入口；网页 `0.1.13/r13`、单一 Page 内存队列和发送安全栅栏均未变更。

本次只验证侧栏源码、React 构建、安装包同源和精确来源准入，不再执行双端同步、关闭重开、FIFO、production、评分或完整测试矩阵。下方历史验收和待办不构成本轮执行清单。Tool 正式包已更新；系统 Chrome 的原联合安装入口已读回侧栏 `0.1.16` / 网页 `0.1.13/r13`，随后实际打开侧栏，隔离工具界面仅有两段使用提示、没有队列数据或操作控件（`native-r516-install-receipt.json`、`native-r516-instructions.json`）。没有追加发送测试消息。

此前在系统 Chrome 156 经现有联合安装入口，已真实安装 Tool `0.1.15` 与 Page `0.1.13/r13`。真实网页已入队两条暂停消息；旧版侧栏同队列读回、跨端暂停/恢复及关闭重开已观察到。收尾时实读到第一条测试消息已收到真实回复，第二条仍为暂停，随后已通过网页删除；原生输入框为空。完整双条 FIFO 真实回复为 **NOT_TESTED**。这些是旧版证据，不代表 `0.1.16` 已安装。原始记录保留在本地忽略的 `artifacts/ai-send-queue-r511/`。

日常扩展仍使用既有持续开发 `dist/development`，真实 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`。本轮没有重建整个 Browser、覆盖共享输出或切换 Profile。Tool 来自唯一正式 JSON，精确 SHA-256 由既有打包器生成后同步至 `src/platform/host/send-queue-admission.js`，未放宽身份或权限校验。Page 公开发行继续为 **blocked**。

## 不可漂移的合同

- Page ID：`opendesk.ai-send-queue`，唯一队列与发送状态机：`src/page/engine.js`；ChatGPT DOM：`src/page/site.js`；远端协议：`src/page/remote.js`。
- Sidebar Tool ID：`ai-send-queue`；`src/sidebar/App.jsx` 和 `style.css` 为唯一正式 React UI；页面既有消息合同：`src/shared/queue-contract.js`。侧栏仅展示使用提示，不请求队列数据；不创建第二份队列、第二个 React Root 或第二套 Host。
- Page 皇冠和队列采用已批准的 R5.4 CSS 和 `crown-premium.webp`，不改皇冠偏移、旋转、尺寸、不叠新图层。
- 编辑为取回 ChatGPT 原生输入框；FIFO、草稿、IME、附件、会话身份和 unknown-effect 不重发是强制安全栅栏。
- `preview/index.html` 保留唯一 R5.4 设计，并接入正式 React 构建及明确标识的模拟 Owner；**预览与 CI 编译不等于真实发送**。

## R5.10 历史实现（侧栏数据展示已被最新要求取代）

- `cdbfd2a`：正式 React 消息行收敛成紧凑正文/状态、暂停或恢复、提前发送，以及有键盘 Esc/焦点的更多菜单（编辑取回、上移、下移、删除）。保留 Host 协议及版本 CAS。
- `eed0f76`、`42b6589`：380px 优先布局、窄屏自适应、共用深浅色设计变量；清理了不存在的主题和圆角 Token，统一至 `--od-ink`、`--od-paper`、`--radius-surface`。
- `19f7369`：`scripts/ci-installed-chromium.mjs` 增加真实 Page + Sidebar 双候选安装和 Page Authority 原生注册读回，不再仅测 Sidebar；无 ChatGPT 实际对话时依旧明确返回 unavailable。
- `b673adb`：新增 CSS Token 与操作可达性回归断言；这是静态回归，不能替代视觉截图。
- CI 工作流导出候选包的规范 SHA-256 和唯一历史 HTML 供审计，不自动发布。

## 远端交接时的证据与阻断（历史观察）

以下为远端交接记录；当前安装、候选与下一条操作以上述本地进度及验收记录为准，不重复执行已有有效证据。

- 一次既有 GitHub Actions `40729363693`：队列 193 个 Node 用例通过，React 候选构建、Page r12 编译、安装包身份和 SHA 校验成功；**不是**双端实时联调。
- 同一次运行在共享 Host provenance 验证失败：`examples/programs/chatgpt-jump-top/src/conversation.js` 的 Prompt Shortcuts 固定来源变更未审核重锁。此为跨产品安全门禁，`build:dev` 与 Chrome 安装阶段被跳过；不得通过关闭门禁解决。
- `official-pages/sources.json` 中 `0.1.13/r12` 仍为 `publication: blocked`；`official-tools/catalog.json` 未提供本产品正式 Tool 发行，所以扩展中心还没有经证明的联合一键安装。
- 新 React UI 必须重新打包并用**实际候选包的** SHA-256 更新 `src/platform/host/send-queue-admission.js` 精确 pin，更新前不可声称 Sidebar 命令已被 Host 准入。任何 hash 更新都应取自构建/代码审计结果，不得放宽校验。
- `scripts/ci-installed-chromium.mjs` 联合安装新增代码仍待成功的实际 Chrome 运行证据；Page DOM 真实发送、macOS 已登录 ChatGPT、Side Panel 关闭重开后的真实同步，均 **NOT_TESTED**。
- `preview/index.html` 尚未由正式 React 构建驱动双端联动；不得把旧 Page 离线预览当作已完成的 React 页面。

## 历史待办（本轮不执行）

以下保留远端待办，不作为当前核心链的前置清单；完整验收、评分、production 发布及全量 CI 继续延期。

1. 从最新 main 复核运行记录与新增 CI 脚本；修复本产品测试缺陷，跨产品 provenance 由对应所有者按原始审核流程修复。
2. 使用正式 Vite + Tool packer 构建精确候选、核对 SHA-256，审计后更新唯一 Host pin，再以真实 MV3 Chromium 验证 **两份**安装回执和受信 RPC。
3. 在现有 `preview/index.html` 中接入**实际 React 构建产物**和可标记模拟的数据桥；保留原有皇冠，不建立并行手写 Mock。需证明交互可点击、可加载。
4. 解决官方 Tool 与 Page 两个独立候选的**统一用户安装流程**；未完成真实 Mac 发送验收前保持 Page blocked，不向用户冒称整个产品安装成功。
5. Mac Chrome 已登录 ChatGPT：两条排队消息按序入站，单条暂停/恢复、提前发送、取回编辑、删除、排序、IME/附件、unknown-effect 不重发；保留带时间和版本的真实截图/日志。实测后才允许审批发布。

## 本地命令参考

以下为按改动选择的本地命令参考，不是本轮必须顺次执行的清单：

```bash
node --test examples/sidebar-tools/ai-send-queue/tests/*.test.mjs
node scripts/validate-program-project.mjs examples/sidebar-tools/ai-send-queue
npm run --prefix examples/sidebar-tools/ai-send-queue build
npm run build:program -- examples/sidebar-tools/ai-send-queue
npm run build:dev
```

仅在 `main` 上提交，不创建分支、Worktree 或 PR；不交付 ZIP；明确区分已通过的源码测试、模拟 Chrome、正式原生安装与 Mac ChatGPT 发送证据。

两份候选分别经过既有安装/权限流程。已完成的安装证据按准确输入复用；后续从真实 ChatGPT 会话继续，避免重复重建或用预览假数据替代联调。
