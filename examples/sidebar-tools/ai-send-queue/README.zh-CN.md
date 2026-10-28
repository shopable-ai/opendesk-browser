# AI 消息发送队列 · R5.10 交接与真实验收边界

**原始目标：** 用户在 ChatGPT 正在回复时预先编写多条消息，由唯一 Page USER_SCRIPT 内存队列依 FIFO 顺序在原生输入安全、原生消息入站确认后自动发送下一条；正式 React Sidebar 只通过可信 Host 对该队列读取和逐条操作。扩展中心要以一个独立应用完成 Page + Sidebar 的安装、打开、更新、停用、卸载，授权安全边界不合并。

唯一产品根目录：`examples/sidebar-tools/ai-send-queue/`。R5.7 提交 `607f708d` 已完成目录合并。禁止再次迁移原 `examples/programs/chatgpt-send-queue/`。

## 当前阶段与下一条操作（2026-10-29）

R5.11 已在本任务独占的 Mac Chrome for Testing 156 中，经「扩展 → AI 消息发送队列 → 联合安装 / 更新审阅」一次确认安装 Tool `0.1.15` 与 Page `0.1.13/r13`，原入口返回两份安装记录已读回；重新进入已安装详情确认「侧栏：已启用；网页能力：已注册」。Tool 固定包 SHA-256 为 `ef5a8d512783b99dd96e6eba0eda24aadbe9f3f3842cf716e1782f2657de9fea`；Page sourceHash 为 `2e33a179ff03ba02810827ce6bc56482a3ae90d4da9b93805870334b6962e8de`，packageHash 为 `c63d0b0321826eabf5340f06a96d435a6983fc982371e2bede440941c9a30720`。

首次隔离安装明确因 Chrome 未允许用户脚本而停止，没有继续安装侧栏；通过 Chrome 原生「允许运行用户脚本」后，在独立 Profile 完成上述安装。清理状态未知和失败原生回执都不能放行后续安装或显示完成；旧 `0.1.13` Tool 可审阅精确候选联合升级，但不因此获得当前队列管理权。随后复核修复了联合审阅准备和失败异步读回期间的重复提交窗口，新增延迟回归，联合安装 18 项、Page 导入与队列产品管理 64 项定向测试通过；这两项时序修复尚无更新后原生复验。

本次复用既有 `npm run dev` 的 `dist/development`，扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`；未覆盖共享输出、重配 Native 或使用旧静态包。该运行证据属于持续开发，不能替代冻结 production 验收。独占 `test-chatgpt-02` 的 ChatGPT 当前停在 Cloudflare 真人验证，尚未取得可用会话；真实两条消息入队、网页/侧栏同步、FIFO 发送均为 **NOT_TESTED**。实际侧栏保持不可用状态，没有伪造队列或自动发送。

用户随后明确允许使用系统 Chrome；已创建本任务独立 ChatGPT 测试标签页，但浏览器 DOM、截图和准确路径的原生窗口读取持续超时，仅能读取标签元数据，未取得可操作页面。此为当前测试连接阻塞，不能据此判定队列产品故障。未重启或关闭用户 Chrome，未提取个人 Profile Cookie；本任务隔离 CFT 已正常退出。

Tool 已加入内置候选目录，Page 公开发行仍为 **blocked**，审阅候选不代表公开上架。[R5.10 验收记录](ACCEPTANCE-R5.10.zh-CN.md) 保留历史范围，不代表本次候选。下一条尚未完成的操作是在用户已授权的系统 Chrome 取得可操作测试页后，核对网页入队与侧栏同步，再验证安全 FIFO；不重跑已通过的引擎测试代替这项证据。

本轮优先真实核心链：Page 入队 → Sidebar 同步 → 跨端暂停/恢复 → FIFO 发送与真实回复确认。先修复实际失败，再选择相关检查；完整验收、评分、宽度/缩放矩阵、production 发布和全量 CI 延期。

## 不可漂移的合同

- Page ID：`opendesk.ai-send-queue`，唯一队列与发送状态机：`src/page/engine.js`；ChatGPT DOM：`src/page/site.js`；远端协议：`src/page/remote.js`。
- Sidebar Tool ID：`ai-send-queue`；`src/sidebar/App.jsx` 和 `style.css` 为唯一正式 React UI；消息合同：`src/shared/queue-contract.js`。不创建第二份队列、第二个 React Root 或第二套 Host。
- Page 皇冠和队列采用已批准的 R5.4 CSS 和 `crown-premium.webp`，不改皇冠偏移、旋转、尺寸、不叠新图层。
- 编辑为取回 ChatGPT 原生输入框；FIFO、草稿、IME、附件、会话身份和 unknown-effect 不重发是强制安全栅栏。
- `preview/index.html` 保留唯一 R5.4 设计，并接入正式 React 构建及明确标识的模拟 Owner；**预览与 CI 编译不等于真实发送**。

## R5.10 本轮落地的真实代码

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

## 后续待办（按当前阶段选择）

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
