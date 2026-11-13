# OpenDesk Browser · 独立 Controller Task 资产、内置脚本与跨扩展消费合同

> 状态：**R1 架构设计基线（2026-11-14）**。本文件不表示已经完成源码迁移、安装状态调整、发布或真实 Chrome 验收。任何实现必须以当次 main HEAD、真实消费者及测试结果为准。原 Host/Controller/RunHost/Installer/Authority/Task Catalog/Durable Result 是唯一可信执行体系，不在本方案中重建。
>
> 核心原则：**独立 Task 的源码和发行包不属于 WebFlow；「我的」管理 Task 的安装与运行，WebFlow/Subagent 等应用只在其被授权的边界内消费同一个安装。** 目录归属不授予权限，安装不等于运行，脚本包内置不等于用户同意网站操作。

## 1. 原始用户目标与当前源码事实

用户希望 WebFlow 作为独立工作流扩展，调用独立安装、版本固定的脚本；同时在「我的」统一管理脚本。用户希望百度和 Google 搜索成为方便上手的默认内置脚本，允许停用、卸载与重新安装；ChatGPT 新对话 Task 也应能被多个应用复用，而不是放在 WebFlow 私有 `src/tasks` 里。

截至 2026-11-14 的 main 只读核查：

- `projects/webflow/src/tasks/chatgpt-conversation-create-v0.2.2.js` 及同目录多个版本是 **ChatGPT 页面操作的 Controller Task**；对应冻结包在 `projects/webflow/tasks/`。这不是 WebFlow 编排内核。
- `src/platform/tasks/builtin-releases.js` 已登记默认内置 `baidu.search.top3@1.1.5`、`google.search.top3@1.0.3` 和 **历史默认** `chatgpt.conversation.create@0.2.0`；`0.2.1/0.2.2/0.3.0` 是额外受审发行资源，不因打包而自动升级已有安装。
- `src/platform/tasks/service.js#ensureBuiltinTasks` 首次无安装、无移除记录和历史候选时才自动预置默认发行；`uninstallTask` 写入 `task-removed-v1` 防止重新自动安装；`setInstalledTaskEnabled` 提供停用/启用。安装包本身只读随扩展发行，不因用户卸载而从扩展分发字节中删除。
- `src/ui/task-workbench.js`、「我的」Task Catalog 与共享 TaskRunSheet 已是安装/运行/撤权入口。WebFlow 正式 `tool.config.json` 仅声明百度和 Google 两个 `delegatedTasks` pin；`src/ui/main.js` 也只投影这两个固定任务。**这不证明 ChatGPT Task 已委托给 WebFlow Sidebar。**
- `projects/subagent/src/transport.js` 通过原 Page→Task 可信请求使用 `chatgpt.conversation.create`；其可信结果读取又经过 `src/native-agent/chatgpt-fixed-bridge-host.js` → `projects/webflow/trusted/chatgpt-result-adapter.js`。因此除了源码文件放置，**结果验证适配器也存在跨产品的路径耦合**。
- WebFlow R11 旧 A 原消息正文哈希对账为 UNKNOWN；任何 Task 迁移不得用另建 B、补发 A、替换正文或重放旧 Run 验证成功。历史状态以 `projects/webflow/README.md` 顶部与执行计划为准。

## 2. 文件所有权和最终目录（建议；尚未迁移）

```text
task-packs/                                  # 独立可安装 Controller Task 发行资产，不是新扩展/新 Runner
  chatgpt.conversation.create/
    src/                                     # 人类维护的源文件，按受审版本区分
    releases/                                # 冻结的 .opendesk-task.json；原内容和 SHA 不变
    contracts/                               # 纯 Task 输入/输出验证，不包含 WebFlow A 回填
    tests/                                   # 对应固定版本/结果边界的业务测试
    README.md
  baidu.search.top3/
    releases/
  google.search.top3/
    releases/
projects/webflow/                            # 仅工作流配方、步骤依赖、调用、结果投影/回填
projects/subagent/                           # Mini Chat 产品、UI 与其受信入口
src/platform/tasks/                          # 唯一通用 Task 安装、版本、撤权、执行服务
src/ui/task-workbench.js                     # 「我的」现有可信管理/运行入口
```

`task-packs/` 是**源码和发行资源的建议位置**，不是安装数据目录；运行时安装身份仍由现有 Task Catalog/Authority 持久化。不能让 `task-packs/` 自带 Host、数据库、执行引擎或越权注册。具体最终路径要在实施前对照现存构建规则、固定 provenance allowlist 和项目规范定向审查，不能仅凭设计把移动后源码声明为已受审。

真正共享的部分是 **Task package + 受审的输入输出契约**；WebFlow 的 A 交付、配方编排和授权业务语义仍归 WebFlow。拆分 `chatgpt-result-adapter.js` 时需区分 Task 通用结果验证与 WebFlow 专属的原 A 交付证明，**不得整文件无差别移动**。暂时保留旧受信桥路径作为兼容入口，确认消费者后再收敛。

## 3. 内置发行政策（两种意义必须分开）

| 资源 | 随安装包提供 | 首次自动预置到「我的」 | 首次自动运行 | 原则 |
| --- | --- | --- | --- | --- |
| 百度搜索前三条 `1.1.5` | 是，现状 | 是，现状 | **否** | 便于上手；验证码/安全页要如实报阻断 |
| Google 搜索前三条 `1.0.3` | 是，现状 | 是，现状 | **否** | 便于上手；地区/DOM 变化不能当引擎失败 |
| ChatGPT 新对话 `0.2.2` | 是，现状（额外受审资源） | **建议改为用户显式安装** | **否** | `send:true` 有网站副作用，单次审批；不自动覆盖旧版本 |
| 历史 ChatGPT `0.1/0.2.0/0.2.1/0.3.0` | 维持精确受审兼容资产 | **新用户不应默认安装 0.2.0**（需单独安全迁移） | **否** | 原已安装/授权/Run/Result 必须保留，旧版本可被明确审阅恢复 |
| 本地自测 Task（将来） | 建议作为稳定测试候选 | 可选，只读 | **否** | 用受控测试页面校验 Task/Run/Result，不依赖搜索站点可达性 |

“默认内置”至少包括三个独立状态：`packaged`（构建随包发行）、`available`（可审阅/安装）、`installed`（该 Profile 已安装）；另有 `enabled`、`delegated`、`run-approved`、`completed`、`business-confirmed`。不能把任意两个状态当作同义词。

从现有 `BUILTIN_TASK_RELEASES` 移出 ChatGPT `0.2.0` 会改变初次初始化行为和多个测试，**不是本轮目录迁移的一部分**。需先独立设计“随包可选”目录发现和兼容测试，再改变新安装策略；旧安装和用户主动卸载记录不可被重置。

## 4. 「我的」与 WebFlow 的关系

```text
独立 Task 发行包（单一受审身份：taskId + version + manifestHash + sourceHash）
  └─ 原可信 Task Catalog / Installer / Authority
       ├─ 「我的」：内置/可安装/已安装、审核来源、停启、升级、卸载、参数/运行/历史
       ├─ WebFlow：受审配方或声明的委托 pin → 原 Host 重新核验安装及授权 → 调用
       ├─ Subagent：其独立 Page→Task 审批请求 → 原 Host → 同一个安装
       └─ 其他独立应用：只能通过其真实已获准的通用委托入口消费
            └─ 唯一 Controller/RunHost/Run/Result/UNKNOWN 恢复
```

- **「我的」是权威管理视图**，不是源码 owner：推荐显示「已安装」「内置可安装」「导入/开发」，对可安装项区分内置、用户导入及版本变化。安装/停启/卸载和原 TaskRunSheet 复用已有实现。
- **WebFlow「脚本」是消费视图**：P0 继续明确展示已声明的两个固定 pin 与实际状态；运行 ▶ 复用共享可信 TaskRunSheet，不复制一个新的参数表单/执行器。未被 WebFlow 准入的「我的」任务不能显示为“WebFlow 可运行”。
- P1 若支持「从我的已安装任务中选择并关联」，必须先发现或补足**通用可信选择/委托能力**：Host 显示 Task Picker、冻结 taskId/version/manifestHash/sourceHash/installationId/generation、明确 appId/可调用操作/站点范围，并保存可撤销的独立委托批准。不能让 WebFlow 沙箱自行枚举/执行任意已安装 Task，也不能把 AI 文本、任务名或普通配置视为授权。
- **Task 安装与应用关联分别撤销**。卸载 WebFlow 不应删除用户安装的脚本；卸载 Task 会让 WebFlow/Subagent 后续调用 fail closed；撤销某个应用委托不影响其他获准消费者。挂起 Run/UNKNOWN 只对账原记录，禁止重跑。
- **“卸载”≠ 删除发行包**：内置资源不可从用户安装的扩展包中物理删字节；可卸载该 Profile 的安装并保留 tombstone，仍可在「内置可安装」选择恢复。用户导入草稿的永久删除是独立敏感操作，历史 Run/Result 和不可变已安装源码不能被误删。

## 5. 分阶段最小迁移与边界

**R1 — 仅迁移 Task 资源 owner，不改变运行语义。** 在当前 main 核对所有真实引用及并行改动后，选 ChatGPT `0.2.2` 作为首个试点；对受审原 JS 和 Task package 做字节级迁移，检查 `src/platform/tasks/builtin-releases.js` 的 `sourcePath`、`scripts/packaged-task-resources.mjs`、打包来源限制、R11 Result adapter、Subagent、现有定向测试及构建消费者。移动前后 `taskId/version/manifestHash/sourceHash/sourceUtf8` 不得变，版本不提升，不重签或强行重算 SHA，不更改已安装数据库、运行 ID 或许可。所有实际引用更新并通过验证后才删除旧源码路径，不保留两份活跃 owner。

**R2 — 解开跨应用结果适配耦合。** 把 ChatGPT Task 本身的纯结果 Schema/已审阅 pin 校验提为单一可受审业务模块；WebFlow 原 A 交付、workflowId/deliveryKey/消息回执与 Subagent Mini Chat 投影仍各自管理。受信宿主只通过固定编译白名单接线，不导入沙箱动态来源作为可信代码。旧接口可受控兼容，禁止静默放宽审查。

**R3 — 内置策略和关联 UX。** 保留已有百度/Google 默认预置及卸载防重装；为 ChatGPT 创建适合新用户的**可选显式安装**策略（旧 0.2.0 兼容单独验收）。「我的」提供统一状态/恢复；WebFlow 先用原固定声明运行，通用可信 Task Picker 的真实缺口和安全合同确认后再实施动态关联。不要让 R3 阻塞 R1 目录归属修复。

## 6. 必要验收与禁止事项

- **源码/发行**：移动前后固定文件字节及所有哈希一致；原 sourcePath、打包路径、allowlist、symlink 防护及 tests 不断链；原 Build/verify 可以构建相同 Task 资源。不得用更改 SHA 消除 provenance 失败。
- **安装**：百度/Google 首次预置仅一次；停用保持停用；卸载产生 removal tombstone，重启、扩展升级后不自动复活；用户主动恢复经原权限/安装审阅；不同 Profile 不互相串状态。
- **调用**：「我的」单次手动 Run、WebFlow 固定委托、Subagent Page→Task 走同一原 RunHost/Run/Result；版本/站点/安装代际不符均拒绝；WebFlow 没有委托的脚本不可运行；禁用/卸载/撤销后不可用。
- **业务**：ChatGPT A→唯一 B→原 A 的送达证明、完整回复、消息身份和 UNKNOWN 不重放不得因目录迁移产生第二次发送；百度/Google 验收区别引擎成功和站点阻断。暂停中的 R11 UNKNOWN 不触发新请求。
- **证据分层**：DESIGN/SOURCE/NODE/PACKAGE/CHROMIUM/CHROME_NATIVE/INSTALL/BUSINESS 分开记录，未测为 NOT_TESTED。没有本机/浏览器证据不能宣称真实运行闭环或专家 ≥95 评审通过。
- **红线**：不新建第二套 Task Catalog、Installer、Runner、Authority、任务数据库或假 SDK；不把 ChatGPT/搜索 DOM 逻辑写进 WebFlow 内核；不为目录调整改变用户已批准的版本/授权；不处理 GitHub Issue 或其它历史业务作为本任务的一部分。

## 7. 接续时优先核查

按 `AGENTS.md` 与 `docs/architecture/extension-project-layout.zh-CN.md` 先确认 main/并行修改。只读比对 `projects/webflow/src/tasks/`、`projects/webflow/tasks/`、`examples/tasks/`、`src/platform/tasks/builtin-releases.js`、`src/platform/tasks/service.js`、`src/ui/task-workbench.js`、`projects/webflow/tool.config.json`、`projects/subagent/` 和受信结果适配器。再执行 R1 的**一项非破坏性试点迁移**；不要在同一轮同时切换默认安装策略、开放动态委托和改动 R11 交付恢复。
