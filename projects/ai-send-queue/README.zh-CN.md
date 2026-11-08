# AI 消息发送队列

**原始目标：** 用户在 ChatGPT 正在回复时预先编写多条消息，由唯一 Page USER_SCRIPT 内存队列依 FIFO 顺序在原生输入安全、原生消息入站确认后自动发送下一条；侧栏仅提供网页使用提示，不显示或读取队列数据。扩展中心要以一个独立应用完成 Page + Sidebar 的安装、打开、更新、停用、卸载，授权安全边界不合并。

唯一产品根目录：`projects/ai-send-queue/`。R5.7 提交 `607f708d` 已完成目录合并。禁止再次迁移原 `examples/programs/chatgpt-send-queue/`。

**网页输入快捷键：** 在已支持的 ChatGPT 原生对话输入框按 `Ctrl + Enter`，等同点击皇冠按钮将当前草稿加入队列，即使队列原本为空也能使用。普通 `Enter` 保留网站正常行为及已有受限回退逻辑，`Shift + Enter` 保留换行。空草稿只给出提示，不允许通过快捷键意外提交网站消息；IME、其他输入框和不可信来源不触发队列动作。

## 当前目标与关键测试条件（2026-11-08）

**目标：** 修复系统 Chrome 中消息已入站、回复已完成但 Send Queue 仍显示「发送结果未知」的问题。保留原消息、回复和草稿，禁止重复发送；不能只删除警告或刷新页面就宣称修复完成。原生 Goal 已设置，当前为 **blocked**，等待原队列副本的不可撤销移除确认；目标未缩减、未完成。

**已证实的直接原因：** 原问题页执行记录的 r13 `sourceHash=2e33a179ff03ba02810827ce6bc56482a3ae90d4da9b93805870334b6962e8de` 与提交 `8f61cd02f` 中保留的 r13 包相同。该包的 `tick` 在 `unknown` 时直接返回，发生在读取原生消息之前，因此迟到的成功入站无法再解除警告；就绪期限检查也先于入站核对。现有 r15 将精确入站核对提前至 unknown 返回和期限判断之前。最初为何未在六秒内取得下一轮就绪检查，缺少现场计时证据，不能断言为网络故障。

关键条件及本轮证据：

- **迟到回执：** 超时后仅凭同会话、保留的历史节点和精确正文确认入站，确认后等待该轮回复完成；不再次点击发送。相关 Node 回归 PASS；真实断网恢复仍为 **NOT_TESTED**。
- **FIFO：** 同时入队的两条消息按「第一条 → 该轮回复完成 → 第二条 → 该轮回复完成」推进，各发送一次。系统 Chrome 专用临时对话中 B、C 同时入队后均完成，原生历史顺序正确、各出现一次、队列清空；测试页草稿为空。另有 A 单条排队实测通过。
- **草稿保护：** 只有能证明未点击发送、原编辑器、草稿和历史均未改变时，才允许取回；不同会话、历史替换、IME 或附件不得放行。相关 Node 回归 PASS；本轮共执行 38 项与超时、确认、FIFO 和草稿保护有关的定向测试，全部通过。
- **实际运行身份：** 候选为 `0.1.15/r15`，`sourceHash=61fdf8665b8ff557d345fed5325be211793abf6610698a85ef6a536daed5e5cb`。原安装已更新至 generation 4，enabled / authorization active / Native registered；测试页执行回执为 r15、同一安装、同一 sourceHash、completed / evaluated。注册成功不能替代原页面更新生效的证据。
- **旧实例收尾：** 安装器返回 `E_PAGE_INSTALL_PENDING`，`managedCleanup.state=unknown`。初次只读核对发现 128 条旧执行记录中 123 个文档已消失、5 个仍存活，且缺少原会话执行世界账本。逐页确认队列为空、无草稿且回复完成后，仅刷新「继续架构纠偏」「确认任务协议」「优化底部按钮布局」三页；原生回执确认三页均为同安装的 r15 / generation 4 / 精确 sourceHash / completed / evaluated。最新旧文档为 **126 个已消失、2 个仍存活**：原警告页及保留用户草稿的「阅读目录收起功能」。不得重建清理凭据或重放未知清理；两页均保持原样。**该条件尚未完成。**
- **原问题可见结果：** 已核实指定提示词在原对话中只发送一次，回复已完成；原页面仍运行旧实例并保留警告。未移除该内存队列项、未刷新原页、未重发原提示词。移除不可撤销的队列记录所需确认尚待用户答复，**原警告尚未解决**。

环境：沿用系统 Chrome 的 `ccfcjegpkdlgbclopjmadlcjedelidmf` 与本仓库 `dist/development`。这是开发产物；当前 serve 连接断开，未声称持续更新在线。本轮没有修改产品源码、重建 Browser、替换加载目录或更改 Native 配对；通过现有安装审阅更新 Page，并仅刷新上述三张确认空闲的用户页面。专用临时测试页及本次诊断窗口已关闭，原问题页已恢复前台。观察摘要保存在本地忽略目录 `projects/ai-send-queue/artifacts/system-chrome-20261108/observations.json`；它不是原始 AX 归档。production、公开发行、完整验收与评分仍延期。

## 上次修复：网络异常恢复（2026-11-02，历史观察）

Page 已生成 `0.1.15/r15` 正式可安装候选，Tool 仍为 `0.1.16`。修复超时后永久停止核对入站的问题：网络恢复后继续只读核对原会话、历史节点和精确正文，确认入站后移除对应队列项，并等待该轮回复完成才继续 FIFO，不重复点击发送。仅能证明尚未点击发送、原输入框和草稿均未变化时，允许显式「取回输入框编辑」；保留网页原草稿，不重新写入或发送。

本轮在系统 Chrome 观察到三条「继续」，首条为结果未知；未删除、刷新或重放这些消息。随后前台切换到另一个 Profile，存在并行操作，故未替换原页面正在运行的脚本。**新版 Chrome 安装及真实断网恢复为 NOT_TESTED**；升级前须处理旧版仅内存队列的保留问题，不能以刷新迁移队列。

212 项定向测试通过，Page 包、精确来源 pin 和官方资源准备链匹配；权限及匹配范围未扩展。两项既有非本轮问题单独排除：预览示例按钮文案断言陈旧、Sidebar 本地构建输出与既有正式包不同源；未将它们报告为通过，也未重新生成侧栏包。Page 公开发行仍为 blocked，未提交或推送本轮改动。

## 上次范围（2026-10-29，历史观察）

用户明确侧栏不需要显示队列数据，并要求收敛测试；随后选择「仅继续网页队列的 FIFO 验证」。Tool `0.1.16` 仅提示在 ChatGPT 网页输入框使用皇冠按钮；移除侧栏的消息列表、状态、逐条操作、读取请求和轮询。扩展中心沿用原有安装、更新、停用和卸载入口；网页 `0.1.13/r13`、单一 Page 内存队列和发送安全栅栏均未变更。

侧栏改动已完成源码、React 构建、安装包同源及精确来源准入检查；后续仅补网页 FIFO 实测。不再执行双端同步、关闭重开、production、评分或完整测试矩阵。下方历史验收和待办不构成本轮执行清单。Tool 正式包已更新；系统 Chrome 的原联合安装入口已读回侧栏 `0.1.16` / 网页 `0.1.13/r13`，随后实际打开侧栏，隔离工具界面仅有两段使用提示、没有队列数据或操作控件（`native-r516-install-receipt.json`、`native-r516-instructions.json`）。没有追加发送测试消息。

此前在系统 Chrome 156 经现有联合安装入口，已真实安装 Tool `0.1.15` 与 Page `0.1.13/r13`。真实网页已入队两条暂停消息；旧版侧栏同队列读回、跨端暂停/恢复及关闭重开已观察到。收尾时实读到第一条测试消息已收到真实回复，第二条仍为暂停，随后已通过网页删除；原生输入框为空。当时完整双条 FIFO 真实回复为 **NOT_TESTED**。这些是旧版证据；`0.1.16` 的安装和后续网页 FIFO 结果分别见上文与下节。原始记录保留在本地忽略的 `artifacts/ai-send-queue-r511/`。

日常扩展仍使用既有持续开发 `dist/development`，真实 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`。本轮没有重建整个 Browser、覆盖共享输出或切换 Profile。Tool 来自唯一正式 JSON，精确 SHA-256 由既有打包器生成后同步至 `src/platform/host/send-queue-admission.js`，未放宽身份或权限校验。Page 公开发行继续为 **blocked**。

## 网页 FIFO 实测（2026-10-29 14:27，Asia/Shanghai）

**PASS，仅网页范围。** 在系统 Chrome 的独立测试窗口、[本轮测试对话](https://chatgpt.com/c/6ae2e5c0-f4b8-83ee-b92a-1a1e9840e1f5) 中，使用已安装的 Page `0.1.13/r13`，通过网页皇冠将 A、B 两条精确消息入队并暂停，读回两条的顺序，再依次恢复。准备发生在原回复结束后。随后由 Page 自动发送，原生对话实际顺序为：`FIFO_WEB_1029_A` → `A_FIFO_1029_OK` → `FIFO_WEB_1029_B` → `B_FIFO_1029_OK`；两条用户消息和两条回复分别只出现一次。收尾确认队列、原生输入框均为空，回复已结束。

原始 AX 界面快照及其 SHA-256 汇总保存在本地 `artifacts/ai-send-queue-r511/native-fifo-result.json`。本次无需修复产品源码、重新打包或重跑 Node 测试；侧栏继续只有使用提示。原测试页新增草稿已保留，测试未触及其他 Profile；原生 UI 锁已释放。此结果仅完成用户确认的网页 FIFO 核心验证，Page 公开发行仍为 blocked，production 和完整验收继续延期。

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
node --test projects/ai-send-queue/tests/*.test.mjs
node scripts/validate-program-project.mjs projects/ai-send-queue
npm run --prefix projects/ai-send-queue build
npm run build:program -- projects/ai-send-queue
npm run build:dev
```

仅在 `main` 上提交，不创建分支、Worktree 或 PR；不交付 ZIP；明确区分已通过的源码测试、模拟 Chrome、正式原生安装与 Mac ChatGPT 发送证据。

两份候选分别经过既有安装/权限流程。已完成的安装证据按准确输入复用；后续从真实 ChatGPT 会话继续，避免重复重建或用预览假数据替代联调。
