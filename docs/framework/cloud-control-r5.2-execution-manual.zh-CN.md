# OpenDesk Browser · Cloud Control R5.2 唯一实施手册

日期：2026-10-13。状态：**架构决策已收敛、开发与验收尚未关闭**。
目标仓库：https://github.com/shopable-ai/opendesk-browser；默认唯一可写分支 `main`。

## 0. 本手册为唯一可执行任务总纲

完整产品功能索引（**10 领域、110 项，其中 98 产品/运行能力 + 12 质量/部署检查**）：[`cloud-control-r5.2-complete-function-tree.zh-CN.md`](../architecture/browser-framework/cloud-control-r5.2-complete-function-tree.zh-CN.md)，逐项身份 JSON：[`cloud-control-r5-02-function-matrix.json`](workstreams/cloud-control-r5-02-function-matrix.json)。Side Panel 有 **6 组 39 项 UI 检查**，见 [UI 独立 39 项合同](../architecture/browser-framework/cloud-control-r5.2-ui-preview-contract.zh-CN.md)；UI 检查与完整产品目录存在交集，**不得简单相加当作功能数量**。

事实工作流：[`cloud-control-r5-02-product-closure.md`](workstreams/cloud-control-r5-02-product-closure.md) 与同名 JSON；15 维独立质量：[专家评分账本](workstreams/cloud-control-r5-02-expert-scorecard.json)；用户/管理员操作：[Cloud Control README](../../examples/cloud-control/README.zh-CN.md)。

**遵守原架构、禁止二次设计**：Verified Task Package → Installer / Resolver → 原安装授权与 Chrome Origin → Cloud Grant → 已配对 Executor / Provider 固定 Job → Controller Authority → 唯一 RunHost / Worker → 原 Run / Result / retirement → Provider receipt → Cloud History Index。允许开发期改正不合理 UI/参数，但不另造 Provider、Runner、Scheduler、Permission DB、Host 或安装系统，不接受远程任意 JavaScript/Shell/CDP。

## 1. 当前证据边界与首要缺陷

1. 2026-10-13 的 R5.2.4 固定候选 `7aff8bd27e258022cdf186019409dcc07fdee719`，[专项 CI #38379208965](https://github.com/shopable-ai/opendesk-browser/actions/runs/38379208965)：**Cloud 45/45 PASS**，Authority 先通过 105 项，随后 Node 在约 4GB 堆处 OOM，整个工作流失败；[同候选构建 #38379209138](https://github.com/shopable-ai/opendesk-browser/actions/runs/38379209138) 为 **CANCELLED**，不提供可复用 PackageHash。
2. OOM 初步根因已定位：`tests/framework/k3-controller-authority.test.mjs` 的旧 `fetch` mock 捕获所有 URL 并重复执行 `cloudStop`，新 `cloudStop` 调用 `/v1/suspend` 导致递归。修复提交 `90e1651eeb2ad364e4ced4fc44e9d155ddcfc708` 只区分 admission/suspend 的测试应答；**需要新 SHA 的真实 CI 才能确认修复通过**。`.github/workflows/cloud-control-r52-contract.yml` 已增加 Authority 文件触发范围，后续按真实回执更新账本。
3. 最新 R5.2 仍缺两个不同 Task 的原生 Chrome Worker 与网页副作用、原始 `RunId` / `ResultId` / `Result.revision.sourceHash` / `retirement released` / `Provider receiptId`。身份数组为空；保持 `NATIVE_PENDING`。
4. R5.2.4 的 39 项 HTML UI 预览已在隔离 Chromium 测过 6 场景 × 5 宽度，**但并未自动迁入生产全部 Index/Manage/Review/History 二级视图**；生产扩展截图与真实 125/200% Zoom 仍 `NATIVE_PENDING`。
5. Provider 具备 HTTPS/WSS 可选协议，本机 TLS 组件测试不等于用户授权的公网端到端。无公网部署权限仍记 `REMOTE_NATIVE_PENDING`。

## 2. 用户验收的四条主旅程

**A · 双独立 Task**：安装 Task A `sample.form-fill@1.0.0`（姓名/填写并提交）与 Task B `sample.modern-search@1.0.0`（关键词/搜索与结果），不同 sourceHash、参数、网页效果，各自保存原始 Worker、Run/Result/retirement、Provider receipt。

**B · 不允许正文**：用户允许执行但不允许回传网页内容，Provider 可确认三字段最小任务状态，却不获得 Cookie、URL、网页正文、`valueWire` 或敏感错误。Client 是否可读取正文是第二个独立同意开关。

**C · 两个浏览器同 Task**：Executor A 的 Job 只归 A；B 即使安装完全相同 Task，也不能 claim/permit/receipt/读取结果。撤销、重配及旧 Job 迁移均须保守。

**D · 可信外部远端**：公开入口只有已认证 HTTPS/WSS 的受限协议；Admin 只绑定本机 loopback。真实公网服务/账号未经批准不得建立。缺环境时完成可靠的受控 TLS 协议测试，标记远端原生待验收。

## 3. 7 个 Gate / 30 个工程任务包：严格依赖顺序

每个任务包必须绑定真实源码、通过条件及原始测试证据；**下表是工作量与执行顺序，不是任务已完成数量**。

### G0｜固定候选、恢复 CI 与包预算（4 包；P0）

**目标**：先让同一源码候选获得可靠、可重复的专项组件与生产构建结果。

| 任务号和需要做的事 | 源码 / 测试入口 | 通过条件与证据 |
|---|---|---|
| **G0-01** 只读核查 main/target file SHA、工作目录状态和其他 Agent 写入边界 | `AGENTS.md / docs/framework/parallel-development.md` | 记录 main HEAD、Cloud 相关 blob SHA、是否有未提交冲突与资源占用；**通过：无关 HEAD 变动不导致重做全量测试** |
| **G0-02** 关闭 K3 Authority 测试中的 Stop→suspend fetch Mock 递归 | `tests/framework/k3-controller-authority.test.mjs` | 对照 #38379208965 的 45 Cloud PASS + Authority OOM；核查提交 90e1651e... 的端点区分并定向执行故障测试；**通过：不靠提高 Node 内存；不改生产 Stop 语义；专项用例有限时完成且原安全断言保持** |
| **G0-03** 按固定 SHA 运行 Cloud、Authority、UI 合同 | `npm run test:cloud; node --test tests/framework/k3-controller-authority.test.mjs; node --test tests/environment/cloud-hosting-r3.test.mjs; tests/cloud-control/r52-product-ui.test.mjs` | 输出完整 TAP（PASS/FAIL/SKIP/耗时/相关模块 SHA）和 Actions run ID；**通过：任何 OOM、取消、其他 SHA 不能宣布组件通过** |
| **G0-04** 同候选 check + production/development 双构建和 verify | `npm run check; npm run build; npm run build:dev; npm run verify` | 产物 WXT 入口、PackageHash、构建日志和预算数值；**通过：固定 ui/tool-shell.js 524288 字节上限；不得提高预算或复用旧 packageHash** |

### G1｜多主体授权、Client 与结果隐私（4 包；P0）

**目标**：禁止串单、越权回传、旧授权复活和重复副作用。

| 任务号和需要做的事 | 源码 / 测试入口 | 通过条件与证据 |
|---|---|---|
| **G1-01** 同 Task 多 Executor 真实协议隔离 | `scripts/cloud-control/provider.mjs; tests/cloud-control/executor-isolation-r52.test.mjs` | Node TLS/WS 下 A/B 同固定 Task，A Job 的 B claim/admission/receipt/reconcile 全拒绝；**通过：绑定 Provider + Executor + Pairing + Grant + Task Pin + requestKey** |
| **G1-02** Browser Task 授权不被云端改写 | `src/cloud-control/service.js; src/platform/tasks/service.js; tests/cloud-control/approval-pin-contract.test.mjs` | 固定 Version/SHA/InstallationId/Generation/Origin/权限变更必须拒绝；**通过：不得新建第二套 Task Installer、Authority、Worker 或数据库** |
| **G1-03** 外部 Client 自助授权/撤销与凭据保密 | `src/ui/cloud-hosting.js; src/cloud-control/service.js; scripts/cloud-control/provider.mjs` | 仅受信 Side Panel 为当前 grant 颁发 token、逐 Task 白名单、单次展示、受限分页、撤权二次确认；**通过：Token 不保存到 Browser KV/日志；认证后排队撤权仍须拒绝** |
| **G1-04** status-only 与 full 结果分级及回执身份 | `src/cloud-control/service.js; scripts/cloud-control/provider.mjs; tests/cloud-control/{status-only-privacy-r52,remote-https-r52}.test.mjs` | 无结果正文许可时只发 visibility/state/retirementState；full 需 Browser 和 Client 双重许可，ResultId 作为 receiptKey；**通过：不能回传 Cookie、URL、网页正文、原始错误，不能换 Key 覆盖已确认回执** |

### G2｜两个独立已安装 Task 的真实 Chrome 闭环（5 包；P0）

**目标**：证明“安装一次、授权后重复调用”真的在真实 Worker 中发生。

| 任务号和需要做的事 | 源码 / 测试入口 | 通过条件与证据 |
|---|---|---|
| **G2-01** 取得独占浏览器测试资源并固定包身份 | `tests/framework/k5-sdk-native-launcher.mjs; examples/tasks/demo-form.html` | 独占 CFT Profile/Provider 状态/端口；保存 Chrome 版本、PID/Profile、HEAD/PackageHash、证据目录；**通过：不可抢占其他 Agent profile、43111/43112 或 dist；不以合成 Sender 替代** |
| **G2-02** 通过真实产品入口验证并安装 Task A 与 B | `examples/tasks/form-fill.v1.opendesk-task.json; examples/tasks/modern-search.v1.opendesk-task.json; src/platform/tasks/service.js` | 对两个不同源代码的包分别记录 taskId/version/manifestHash/sourceHash/installationId/generation/siteOrigins；**通过：候选 Candidate 或 Provider register 不等于用户已安装** |
| **G2-03** Task A：真实网页填写并提交 | `原 Controller Authority→RunHost→Worker; tests/cloud-control/` | Provider Job/Assignment/Permit→原 Worker 表单副作用→RunId/ResultId/sourceHash→released→receiptId 的原始证据；**通过：不得使用 Node 自造 runRef/receipt 代替** |
| **G2-04** Task B：真实网页搜索并取得内容 | `原 Controller Authority→RunHost→Worker; tests/cloud-control/` | B 使用不同 TaskId/sourceHash/参数及不同网页效果，独立 Run/Result/retirement/receipt；**通过：不能只换名称或复用 A 的代码** |
| **G2-05** 双浏览器安装同 Task 的指定接收者隔离 | `两个独占 Chrome Profile + 原 Provider 配对机制` | A 的 Job B 不能见/领/回执；B 的 requestKey 不覆盖 A，错误 Executor 不能伪造 permit；**通过：必须带真实 Executor 和 Provider 身份、日志与失败拒绝收据** |

### G3｜生产 Side Panel 的产品级交互（5 包；P1）

**目标**：把已确认 HTML 信息架构增量映射到真正的既有 Cloud Tab。

| 任务号和需要做的事 | 源码 / 测试入口 | 通过条件与证据 |
|---|---|---|
| **G3-01** 核对唯一 39 项 UI 设计合同及源码映射 | `docs/architecture/browser-framework/cloud-control-r5.2-ui-preview-contract.zh-CN.md; examples/ui/cloud-control-r5.2-preview.html` | 逐 UI A01–F06 对照真实 tool.html / cloud-hosting.js，记录生产差距；**通过：HTML preview 只是方案，不能直接升级为 Native PASS** |
| **G3-02** 在单一 Cloud Tab 内实施 Index/Connect/Manage/Review/History | `src/ui/tool.html; src/ui/cloud-hosting.js; src/ui/tool-shell.css` | 任务/状态首屏优先，危险动作二次确认，Task ID/SHA 仅高级详情；不新建 Tab/RunHost；**通过：Review/Task Detail/Request Detail 原型缺项标为 NOT_IMPLEMENTED 直至完成** |
| **G3-03** 新手、空任务、升级失效和离线/Unknown 操作闭环 | `src/ui/cloud-hosting.js; src/ui/cloud-status-presentation.js` | 用户能直接理解为什么不可执行，能前往「我的」，能区分 Stop vs Unpair；**通过：状态刷新严格只读，不自动领取 Job** |
| **G3-04** 真实 Side Panel 响应式及键盘/ARIA 原生矩阵 | `300/320/360/420/520 CSS px × 125%/200% × light/dark 与长中文/Origin` | 每状态截图、滚动测量、焦点顺序、AX、键盘 Tab/Shift+Tab/Enter/Space/Escape；**通过：静态 Chromium 原型 30 样本仅 PREVIEW 测试，不能算安装扩展** |
| **G3-05** Client 授权 UI 真实安全操作 | `原 Cloud Side Panel + /v1/client-{list,grant,revoke} 经受信 Host` | 创建 Token 仅显示一次、复制关闭清空、Client 分页与撤销真实生效；**通过：不能在网页或 observer 控制台暴露管理员凭据** |

### G4｜可信远端 HTTPS/WSS 调用链（3 包；P0-External）

**目标**：复用同一 Provider，验证安全远端协议，不谎称已部署公网。

| 任务号和需要做的事 | 源码 / 测试入口 | 通过条件与证据 |
|---|---|---|
| **G4-01** 本机独立 TLS 端到端协议与客户端 | `scripts/cloud-control/provider.mjs; scripts/cloud-control/cli.mjs; tests/cloud-control/remote-{https,cli}-r52.test.mjs` | 自签证书测试只在隔离 loopback；WSS/HTTPS Admin 隔离，固定 Task 下发、状态查询、token 失效；**通过：不把本机 TLS 宣称公网 Native** |
| **G4-02** 跨机/跨网络服务配置与安全审查 | `受信 TLS/证书/密钥管理、服务器 ACL/速率、端口路由` | 只有获得明确批准的服务与账号，才执行真实跨网 Browser→Provider→外部 Client；**通过：未经批准不部署/不购买服务器、域名** |
| **G4-03** 真实公网 Browser+Client+Provider 闭环 | `独立外部 Client + 真实 Chrome Executor + HTTPS/WSS Provider` | 记录三端时间戳、证书、Executor 身份、Job/Run/Result/receipt、撤权与断线表现；**通过：无环境时严格 REMOTE_NATIVE_PENDING，不能拿 localhost 伪造** |

### G5｜生命周期与故障矩阵（5 包；P0）

**目标**：不重复未知网页副作用、不丢失已确认结果，撤权后不恢复旧权限。

| 任务号和需要做的事 | 源码 / 测试入口 | 通过条件与证据 |
|---|---|---|
| **G5-01** 投递准入成功后丢失响应/重启恢复 | `Provider seed/submit/claim/admission 与原 RunHost` | 重试相同 requestKey 返回原 Job；不同内容冲突；禁重复副作用；**通过：原 Job 历史和 Idempotency 不删** |
| **G5-02** 原始 Result durable 后回执响应丢失 | `Provider /v1/receipt + Browser reconcile` | 只补回执不重跑 Worker，原 ResultId/receiptKey 不变；**通过：同 ResultId 不允许二次覆盖不同完成状态** |
| **G5-03** Stop、suspend ACK、离线 Unpair 和撤权竞态 | `src/cloud-control/service.js; scripts/cloud-control/provider.mjs` | 本地停止立即 fence，Provider 待确认与已确认分别显示；失联不丢失撤权恢复信息；**通过：已完成 Result 不因迟到取消而变未知** |
| **G5-04** Task 升级/禁用/卸载/网站授权撤销 | `Task Service + Cloud Grant + Chrome Permission` | 执行前、进行中及准备回传时分别撤权，所有旧许可拒绝继续；**通过：保持历史与原副作用不重放** |
| **G5-05** Service Worker、WSS、Provider、Browser 重启 | `src/cloud-control/connection.js; tests/cloud-control/connection.test.mjs` | 断线重连必须先原 Assignment/Result 对账、再允许有效新 Job；未知效果保持 UNKNOWN；**通过：不自行实现长期托管 Runner** |

### G6｜冻结最终候选、专家评分与正式关闭（4 包；P0-Final）

**目标**：15 个独立项目均有实际候选的证据并超过 95 才算完成。

| 任务号和需要做的事 | 源码 / 测试入口 | 通过条件与证据 |
|---|---|---|
| **G6-01** 冻结所有相关输入与归档实际 SHA/PackageHash | `Git HEAD + Cloud/Host/Task/Side Panel 相关 SHA + WXT dist` | 记录源码、测试、浏览器与构建输入无漂移；失败保留；**通过：无关目录变更可复用未变输入的旧成功测试** |
| **G6-02** 按 15 维分别评 DESIGN/IMPLEMENTATION/VERIFICATION | `docs/framework/workstreams/cloud-control-r5-02-expert-scorecard.json` | 每个维度缺陷/文件/证据/分数；任一 P0 未修，不能到 95；**通过：静态设计 86 不能冒充产品质量分** |
| **G6-03** 整合身份与原始报告 | `docs/framework/workstreams/cloud-control-r5-02-product-closure.{md,json}` | 存两个 Task 的 manifest/source/installation/generation/Job/Run/Result/retirement/receipt 和截图索引；**通过：不能合成截图、杜撰 RunId、把 Node 协议 PASS 当原生** |
| **G6-04** 安全提交 main 与最终用户报告 | `AGENTS.md; docs/framework/parallel-development.md` | 核对最新 main HEAD/目标 SHA/工作区、无同文件冲突并仅按授权提交；**通过：不创建非 main 分支/Worktree/PR、不强推/重置；没有独占资源就标 Pending** |


## 4. 先完成依赖，再决定是否重新运行大型 CI

默认最小测试路径（按实际变更选）：

```bash
npm run test:cloud
node --test tests/framework/k3-controller-authority.test.mjs
node --test tests/environment/cloud-hosting-r3.test.mjs
node --test tests/environment/cloud-control-sidebar-r28.test.mjs
node --test tests/cloud-control/r52-product-ui.test.mjs
node --test tests/cloud-control/r52-ui-preview-contract.test.mjs

# 仅在最终受控候选及独立构建资源可用时：
npm run check
npm run build
npm run build:dev
npm run verify
```

- 禁止通过提高 `tool-shell.js` 的固定 **524288 bytes** 上限、放宽 CSP、修改失败分母或跳过安全测试换取绿色状态。
- 保留已确认的不受本轮输入影响的旧候选成功 CI；如果 Host/Cloud/Task/UI 相关输入变化，只补受影响回归，最后仍要有最终同候选的真实固定包证据。
- 每次更新 `docs/framework/workstreams/cloud-control-r5-02-product-closure.json` 的状态前，附 `gitSha`、CI URL、具体通过/失败数量、生产/开发 `PackageHash`、Chrome 版本与原始收据链接；静态原型和 Node 模拟必须另列。

## 5. 生产 UI 与设计文档如何衔接

设计合同决定视觉、层级和用户可理解性：`docs/architecture/ui-layout-conventions-r27.zh-CN.md`、`sidebar-multi-section-tab-contract-r28.zh-CN.md`、`src/ui/design-tokens.css`。**UI 预览不具备 API 权限，也不是第二个 Cloud 产品**。迁移时只修改已有 `#workbench-cloud`、`src/ui/cloud-hosting.js` 和其明确消费者，复用原 UI 事件、Host、Authority 和未改变的 Task 权限。

未与用户完成正式产品审阅前，`PREVIEW_ONLY` 的 Review/Task Detail/Request Detail 不可填为 `SOURCE_IMPLEMENTED`，预览 Chromium 的布局 PASS 不可写为真实 Chrome 200% Zoom PASS。UI 的 39 项检查是最低矩阵，不是拿 39 计数来表示 95 分。

## 6. 资源所有权与 Git 集成规则

遵循当前 `AGENTS.md` 和 `docs/framework/parallel-development.md`：不同文件、契约兼容且独立资源的源码编辑可并行；**同一文件和 Git index/HEAD 操作串行**。默认只写 `main`，无额外授权不创建其他分支/Worktree/PR、不强推、不破坏性 reset/clean，不覆盖其他 Agent 的未提交改动或旧原生验收收据。

所有 CFT Profile/Provider 端口/IndexedDB/dist/ZIP 测试应有独占记录。当前工具无法直接使用用户 Mac `/Users/shopme/Documents/workspace/opendesk-browser`，所以任何需要真实 Mac Chrome 的步骤不能通过 GitHub API 代做；标 `NATIVE_PENDING`。无用户授权云账号时不得部署公网 Provider。

## 7. 每轮报告必须包含什么

先用普通用户语言回答：「能安装和批准哪些任务？能让哪台浏览器执行？能看到哪些结果？怎样 Stop/撤权/Unpair？远程公网是否实际可用？」

随后按同一张状态表给出：
- Gate / 任务编号、源码 SHA 与清单、工作区/并行边界、所做变更。
- `NOT_IMPLEMENTED` / `SOURCE_IMPLEMENTED` / `COMPONENT_TESTED` / `BUILD_VERIFIED` / `NATIVE_PENDING` / `NATIVE_VERIFIED` / `REMOTE_NATIVE_PENDING` / `REMOTE_NATIVE_VERIFIED` / `BLOCKED` 状态，并区分 `NOT_VERIFIED` 的独立评分。
- 每个 Task 真实 `TaskId/Version/ManifestHash/SourceHash/InstallationId/Generation/JobId/AssignmentId/RunId/ResultId/retirement/receiptId`；隐私拒绝与原生网页效果。
- GitHub Actions、构建 PackageHash、浏览器 PID/Profile、截图与异常结果。失败不删除，未知副作用不能重试。
- 十五个质量维度逐项 `DESIGN_SCORE`、`IMPLEMENTATION_SCORE`、`VERIFICATION_SCORE`；任一 P0 或未验证项不得填 95+。
- 余留阻断、下一 Gate、对真实资源持有者的具体交接要求。

**完成定义**：不是“有完整文档”、也不是“157 个组件测试通过”。只有用户可在已安装 Chrome 中让两个不同 Task 安全完成独立网页效果、原始持久 Run/Result/receipt 可追踪、A/B 浏览器完全隔离、结果隐私正确、Stop/Unknown 恢复可靠、真实 UI 达标、同候选构建稳定，且相关独立评分达到 95 以上，才能宣布本轮闭环。公网验收没有批准环境，保持单独 `REMOTE_NATIVE_PENDING`。
