# GOAL：OpenDesk Browser Product Ecosystem R3

## 真实电商工作流优先、共享浏览器核心复用、UserScript 生态与条件性通用 Extension Factory

日期：2026-10-12。默认中文。

> **目标：直接继续修改真实项目，而不是只输出新方案。** 本文供新对话执行；用户复制本文件后即以当轮明确授权范围为准。R3 的优先任务是 **P0 → P1 → P2**；P3 完整产品工厂仅在实际有需求、消费者和测试能力时启动，不为了造一个能编译的产品而制造新的 Page QA。

### 一、仓库与安全写入规则

- GitHub：https://github.com/shopable-ai/opendesk-browser
- 用户 Mac 本地目录：`/Users/shopme/Documents/workspace/opendesk-browser`
- 唯一允许写入的分支：`main`。不得自行创建分支、Worktree、PR，不得 force push、破坏性 reset/clean、覆盖其他 Agent 的未提交文件或历史证据。
- 本 GOAL 要求在本轮具体授权覆盖修改/提交/推送、工作区与相关资源安全、必要测试完成后，**直接提交推送 main**。遇到并行冲突要保留未提交状态或只读报告，不允许偷换到其他分支/工作树。
- GitHub 远端状态**不能证明**用户 Mac 本地文件没有未提交修改，也不能替代真实 Mac Chrome/CFT 验收。
- 不得自动联系用户客户、登录卖家后台、读取真实 Cookie/私人订单、未经许可采集大量网页、办理付款或向商店提交正式发布。

### 二、先读权威材料，不从旧假设重建

启动时读取最新 `AGENTS.md`、`docs/framework/testing-guide.md`、实际 `main` HEAD、相关 workstream 与并行写入状态，并读取：

1. `docs/product/browser-extension-ecosystem/README.zh-CN.md`
2. `docs/product/browser-extension-ecosystem/product-ecosystem-r3-roadmap.zh-CN.md`（**本轮任务树唯一入口**）
3. `docs/framework/workstreams/product-ecosystem-r3.md`
4. `docs/product/browser-extension-ecosystem/extension-factory-architecture.zh-CN.md`
5. `docs/product/browser-extension-ecosystem/commercial-decision-ecommerce-20261012.zh-CN.md`
6. `docs/product/browser-extension-ecosystem/ecommerce-tool-universe.zh-CN.md`
7. `docs/product/browser-extension-ecosystem/opportunity-register.json`、`commercial-experiments.json`
8. `docs/framework/workstreams/extension-factory-r2.md`（仅历史资料）
9. `docs/framework/workstreams/browser-sdk-status.md`
10. `docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md`
11. `docs/product/browser-automation-feature-catalog-r8.zh-CN.md`、`browser-automation-r8-implementation-plan.zh-CN.md`

与其他正在运行的 Browser SDK、Cloud Control、时间复盘、Side Panel 等工作流做好文件和测试资源隔离。不要重复已经有确切候选与证据的测试，不另建第二个任务执行器、Page Registry 或 R8 能力账本。

### 三、必须继承的 Page QA 清理结果（P0）

- 源码清理提交：`6d71854b49fc2fcbace0047b8703b9c2c154211b`。
- 历史文档同步：`9122d8d8c29b5f15e417d0d4fab39bae645d5c0a`。
- Page QA：`DEPRECATED / NO_RELEASE / SOURCE_REMOVED_FROM_MAIN`。旧 `products/page-qa-inspector/`、`packages/features/page-qa/`、仅支持 QA 的 `packages/extension-factory/`、`scripts/product-build.mjs`、`scripts/product-pack.mjs`、`scripts/product-verify.mjs`、专用测试/CI 已删除；产品 npm scripts 已移除。
- **禁止重新创建 Page QA、恢复旧硬编码命令或拿失效的 Mac QA 验收 GOAL 充进度**；保留历史记录。
- 先比较 `main` 上实际文件和 package scripts，查找活跃消费者引用与构建入口，判断此清理对默认 OpenDesk 包的影响。对相关输入已变化或证据不完整的项目执行必要定向验证；未验证写 `NOT_TESTED`，不得断言全库 CI/Chrome 已通过。

**P0 退出条件：**默认 OpenDesk 构建/打包入口无漂移，删除路径不再被可执行测试/脚本引用，受影响的成功或阻断证据可按输入与提交追溯。

### 四、P1：建立真实共享能力与消费者映射

**目标：需求 → OpenDesk 真实入口 → SDK/Host/Authority → Chrome/页面权限 → 结果 → 测试证据；不以函数声明或 Schema 代替可调用功能。**

核查实际源码、入口、消费者、测试与权限世界：

- `src/framework/sdk/`、`src/platform/host/`、`src/platform/chrome/` 的接口、Broker/Authority 和获准 Chrome 调用；原有正式 API 与新增短 API 必须按最新同候选状态核对。
- `src/ui/sidebar-tools/`、`src/marketplace/`、现有安装/升级/卸载与存储责任，避免复制第二套安装中心。
- `src/scripting/user-scripts/installed-programs.js`、Page JS/React/Vue 编译与执行合同、运行于指定网站的 UserScript。
- `src/libs` 已预置默认 `_`、`dayjs` 与`OpenDeskLibs`及按需库的适用世界；Controller 多文件 ESM 推荐 `export default async function main()`，Side Panel 草稿使用 `async function main()`，由受控 Worker 词法访问 `page` / `params`；**不要求 main 接收能力参数，不把 Controller `page` 当网站全局变量，UserScript 没有 Controller `page`**。具体以当前规范为准。
- UI 需按 `docs/architecture/ui-layout-conventions-r27.zh-CN.md` 与 `src/ui/design-tokens.css`；不能做脱离现有 Side Panel/工具框架的独立 HTML 冒充实际交付。

每项输出：源文件、实际消费者、输入/输出、权限、运行环境、真实测试入口、现存缺口与是否需要新的功能。已完成的其他工作流不得仅因 R3 新对话重做。

**P1 退出条件：**两个电商场景均明确可复用的代码链、不可复用或缺失的真实原因和最小影响范围。

### 五、P2：两条电商用户任务的实际实现

**优先场景 A：EXP-005 卖家 Listing / SKU 工作流。**

用户在有合法访问权的商品编辑/管理页面主动点击工具或脚本，检查标题、必填属性、SKU/变体结构等，提供可定位的异常反馈；需要数据导出时先确认拥有权限、明确字段、仅在用户动作后导出。毛利估算只用用户输入或合法可信的费率，说明估算口径。

**优先场景 B：EXP-007 消费者实际到手价工作流。**

用户主动运行工具，读取合法可得的价格或手动提供商品价格、运费、优惠、税费等，解释价格组成、口径、币种及条件；无合法实时数据源时以“未提供”显示，不虚构价格历史、券有效性或外部接口结果。不静默操作联盟链接或 Cookie。

**执行要求：**

1. 优先尝试已有 A OpenDesk 工具或 C UserScript；只有有证据证明单一目的、分发和权限要求需要独立插件时才选择 B。外部实时数据/账号需 D 官方 API/SaaS 并先取得授权。
2. 使用已有工具目录和页面执行系统，禁止重建 Host/Task/Side Panel/Marketplace。写可运行实际源码、入口和必要的本地可审计 Fixture，不仅仅是组件空壳。
3. 至少一个场景必须完整实现“用户主动动作 → 页面或本地输入 → 业务逻辑 → UI/可读结果 → 异常提示 → 可复现测试”；另一个应尽可能实现安全基础版，确有来源/授权阻断时列明原因、入口与具体缺口。
4. 不自动发布商品、改价格、批量抓取卖家后台、提交订单/退款、发送营销消息或读取未授权数据。
5. 演示成功仅证明工程可用，不代表真实客户、转化、付费、留存或 CWS 审核完成。
6. 要求真实用例：缺少字段、重复 SKU、异常变体，优惠条件、费用缺失、币种不一致、撤销权限、导航/重新运行等；记录实际输入和预期/实际输出。

**P2 退出条件：**用户能说明打开哪个入口、点击什么、看到何结果、错误如何处理，并能使用本仓库演示与定向测试重复验证。

### 六、P3：由真实需求触发的通用 Extension Factory

**前置条件：**P2 的实际用户工作流明确需要脱离 OpenDesk 成为独立 Chrome 产品，且有足够差异化、合法数据与后续维护预算。条件不成立时将本阶段保留为 `CONDITIONAL / NOT_STARTED`，不要制造另一个商业价值未验证的“第一款扩展”。

满足前置条件后，按当前 `extension-factory-architecture.zh-CN.md` 实现：

- Product Registry：产品 ID 映射已审查配置，不在 CLI、测试或解析器硬编码某个产品。
- ProductConfig：identity、purpose、owner、version、UI 入口、功能、数据/存储、权限与构建预算。
- Feature Catalog / Resolver：静态依赖、依赖缺失/循环拒绝、权限最小集计算、选中功能与实际代码模块一致性。
- Product Build Planner：利用现有 WXT/Vite 能力，只打包选中功能，不复制整套 OpenDesk，保持默认 `npm run build` 和 `npm run pack` 语义不变。
- Manifest、独立存储、资源图、打包、来源哈希、产物预算和权限/CSP 校验；版本、撤权、升级回滚与发布流程独立于默认 OpenDesk。
- 对**至少两种配置不同的非商业测试 Fixture**，独立证明功能选择/权限差异/产物隔离与错误拒绝；Fixture 不等于可售插件。
- 经通用测试验证后方可引入 `npm run build:product -- --product <product-id>` 和 `npm run pack:product -- --product <product-id>`。不得为了证明 CLI 而复活 `page-qa-inspector`。

**P3 退出条件：**多个已审查配置可通过同一通用管线生成真正不同的 Manifest、模块资源图、权限与独立 ZIP；不能仅凭通用的配置名字或同一产品构建两次宣称完成。

### 七、P4：受影响测试、安全和产品验收

- 先读 `docs/framework/testing-guide.md` 与各既有 workstream；比较 `sourceCommit`、实际输入和哈希，区分 `REUSE_RECORDED_PASS`、`AFFECTED_INPUTS`、`EVIDENCE_INCOMPLETE`、`OWNED_ELSEWHERE`、`NOT_TESTED`。
- Node/Check/默认 OpenDesk 构建/包验证/实际脚本演示必须给出所运行命令、结果、代码身份；不能以阅读文件替代构建 PASS。
- UserScript 运行必须检验授权、撤销、导航、刷新/重启、执行世界、依赖来源。若以本地 Fixture 测试，明确该证据不等于合法真实商家平台支持。
- 独立产品 Factory 已实施时才进行 Manifest 最少权限、未知功能/过大权限拒绝、无闲置模块、Chrome 双扩展隔离、Zip 字节一致、升级/回滚及用户数据边界。
- Mac Chrome/CFT 原生操作、正式 CWS 审核和真实用户留存/付费**各为独立门**。缺证据标 `NOT_TESTED / BLOCKED`；不得以主观 95 分或 CI 代替原生、政策与商业验证。
- 不因无关源码或文档变化重新跑长时间全量集成；成功证据永久保留并受来源身份限制，失败记录不删除。

### 八、P5：文档、提交、工作流和下一轮交接

1. 任务树优先更新 `docs/product/browser-extension-ecosystem/product-ecosystem-r3-roadmap.zh-CN.md`；仅在现有 R8/OPP/EXP 台账记录权威能力/商机结果，不建立第二套 ID。
2. 实施过程与原始证据指针写入 `docs/framework/workstreams/product-ecosystem-r3.md`；其他已有专项 workstream 仍各自维护。
3. 仅在本任务拥有的文件与资源上修改；提交前重新确认 `main` HEAD 和目标路径是否被并行改动，允许 fast-forward，禁止强推。
4. 各阶段若发现更小的真实修复任务优先完成，不用报告或伪造 UI 代替代码。
5. 提交日志、受影响测试与后续技术前置条件都要明确；如果有阻断则交付能安全完成的部分。

### 九、最终输出（必须）

首先用普通中文说明 **“用户现在能用什么、在哪个真实页面或工具入口操作、结果是什么、哪些还不能用”**，然后提供 P0–P5 任务树和各节点：

- `SOURCE_IMPLEMENTED` / `COMPONENT_TESTED` / `BUILD_VERIFIED` / `CHROME_NATIVE_VERIFIED` / `CWS_APPROVED` / `PAID_VALIDATED` 的**独立结论与原始证据**。
- 修改的真实文件、功能入口与实际示例。
- 执行过的测试、PASS/FAIL/NOT_TESTED、关键包哈希和问题。
- 主分支实际提交/推送 SHA（若发生并行冲突，清楚写 BLOCKED 而不是声称已提交）。
- 保留待办、依赖、最小下轮 GOAL，不虚构全面完成度。

**不再把“批量产生插件”作为绩效。最终目标是有真实用户价值的工具、可验证安全边界、稳定复用的 OpenDesk 核心，以及由明确独立商业需求拉动的 Extension Factory。**