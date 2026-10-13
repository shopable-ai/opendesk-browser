# Cloud Control R5.2 · AI-First 产品闭环、任务归属与原生证据

日期：2026-10-13。仓库 `shopable-ai/opendesk-browser`，唯一写入分支 `main`。
**此文件是事实工作流/安全合同，不是宣布产品已经原生 95+ 验收。**

## 最新一屏状态（2026-10-13，按固定源码候选审阅）

**当前不宣布 R5.2 完成**。用户目标是「AI 创建/获取 Task → 验证安装一次 → 本地批准网站与版本 → 外部指定浏览器安全重复调用 → 真实 Worker 执行 → 原 Result/receipt 可追溯」。

| 一眼看懂 | 当前可信事实 |
| --- | --- |
| **总目录** | **10 个领域、110 个可追溯功能/质量检查点**，其中 98 项产品/系统功能 + 12 项部署/质量；UI 39 项是交叉验收，不重复相加 |
| **源码覆盖** | **108 项 SOURCE_IMPLEMENTED / 2 项 NOT_IMPLEMENTED**。剩余：UI-08 请求详情与原始 Result 入口、OPS-05 获批准公网跨网原生端到端；**108/110 不是实际完成百分比** |
| **任务书** | [唯一手册](../cloud-control-r5.2-execution-manual.zh-CN.md)：**7 Gate / 30 包**，先 G0 同候选 CI/构建，再 G1 安全、G2 双 Task 真 Chrome、G3 UI、G4 可信远程、G5 故障、G6 评分 |
| **专家初评** | [专家评分账本](cloud-control-r5-02-expert-scorecard.json) 的方案静态初评 **86/100**；15 维正式 DESIGN / IMPLEMENTATION / VERIFICATION 仍 **NOT_VERIFIED**；任一 P0 缺证据不能宣称整体 ≥95 |
| **当前验证阻断** | 旧固定候选 [#38379208965](https://github.com/shopable-ai/opendesk-browser/actions/runs/38379208965) Cloud 45/45 PASS，但 Authority 105 后 OOM，整体 FAIL；Mock 修复已提交，**新候选须独立核对** |
| **最新 UI 源码** | UI-06 生产云控“批准前核对”已真实增加，选项/安装身份变化清除旧确认，云控 active Tab 恢复正确刷新周期；绑定源码 `c6e082e1ba5fdb17259b36fad9dbaf9bfd5fd7a8`，组件 [#38405840554](https://github.com/shopable-ai/opendesk-browser/actions/runs/38405840554) / 包 [#38405840990](https://github.com/shopable-ai/opendesk-browser/actions/runs/38405840990) 查询时仍 queued，**SOURCE_IMPLEMENTED / NOT_VERIFIED** |
| **真机与公网** | 两独立已安装 Task 原 Chrome Worker/Run/Result/retirement/receipt、300–520px 及 125%/200% 真 Side Panel 截图、获批准的公网 Provider 均缺，分别 **NATIVE_PENDING / REMOTE_NATIVE_PENDING** |

### 下一批优先级（不是另一个设计方案）

1. **G0**：固定候选核对云控 + Controller Authority OOM 修复的实际 CI、受影响文件输入 SHA；完成不提高 524288-byte 预算的 check / production+development build / verify，保存 PackageHash。
2. **G2**：在获独占的原生 Chrome 中真正安装两份不同 Task，分别提交表单与搜索；收集两套 Job/Assignment/Run/Result/sourceHash/released/Provider receipt，双 Executor 拒绝串单。
3. **G3**：在**唯一生产 Cloud Tab** 核验已实施的 UI-06/07，再补 UI-08 单请求详情/原结果入口；交互仍复用原 Host/History、无第二个 UI 产品；完成五档宽度、Zoom、键盘原生验收。
4. **G4/G5/G6**：若有明确部署许可，再做可信公网跨网络；否则保留 Pending；完成撤权/重启/未知副作用原生矩阵，按 15 维独立重新评分。

**文档已保存**：完整功能树、机器矩阵、接口身份合同、UI 39 项/唯一 HTML 预览、7 Gate/30 任务手册、用户 README、专家评分与本实际证据账本。它们是不同职责的单一资料，不要再新建重复架构。没有生成的原生收据、截图、包指纹只能保持空值，不创建模拟 PASS。


> R5.2.6 增量：UI-07 已授权 Task 详情和版本变化重批提示已接入现有任务卡（`src/ui/cloud-hosting.js`、`src/ui/tool-shell.css`）。对应源码提交 `574bffa459c2c0c88525cede733352b154a87246`，UI-07 后续组件 [CI #38406786768](https://github.com/shopable-ai/opendesk-browser/actions/runs/38406786768) / 包 [CI #38406786831](https://github.com/shopable-ai/opendesk-browser/actions/runs/38406786831) 查询时排队中，仍需当前 CI 与真实 Chrome 验收；静态专家初评 86/100 未因源码数量增加而自动提高。

## 用户要完成的事

AI 帮用户生成或选择一个 Controller Task → 用户验证、安装并批准其网站与参数权限 → 在现有 Side Panel「云控」选择一个或多个已安装固定版本 → 自己选择每个 Task 是否额外允许回传网页数据 → 可信外部系统针对**指定、已配对的浏览器**投递一个有闭合参数的 Task → Chrome 原 Worker 执行 → 本地原始 Run/Result 保留 → Provider 至少获得最小状态回执 → 用户可 Stop、停用安装或撤销配对。

**不允许**远程任意 JS、Shell、CDP、修改 Task 源码、跨浏览器串单、借回执泄露网页正文，或借 Provider 可达绕过本地已安装 Task/Chrome 网站授权。用户日常操作不要求 npm/命令行；管理可信服务本身的部署密钥是服务维护者工作。

### 真实使用流程（普通用户）

1. 在 Side Panel「我的」验证并安装 `sample.form-fill@1.0.0`、`sample.modern-search@1.0.0` 或自己的 AI Task，分别启用并批准网站范围。
2. 打开「云控」；首次未配对按「连接提供者」输入可信 HTTPS 地址、Provider ID 与单次配对码。127.0.0.1 HTTP 仅是需要额外勾选的开发演示。
3. 在「允许远程调用的任务」勾选所需版本；逐项核对展示的用途、网站 Origin、参数字段；默认**不勾选结果正文回传**。高级详情可查看 TaskId、双 SHA、InstallationId、Generation。
4. 明确确认后选择「批准并启用」，在当前 Chrome 可见 Host 内等候远端请求。状态回执默认仅发送 `visibility/status/retirementState`，结果正文不回传。
5. 「最近请求」检查等待/准备/运行/完成/取消/未知，历史由原 Cloud History Index 存储，不因刷新领取新 Job。
6. 「停止远程调用」停止当前授权并保持历史；「解除配对」还要在线通知 Provider 失效旧 credential，失败不删除本地凭据以免误报撤销。安装 Task 禁用/更新/重新安装及网站撤权依旧由原 Host/Authority 强制栅栏。
7. 关闭 Side Panel 后不承诺 24/7 挂机；此功能属历史 Cloud R4 Runner 工作流，R5.2 不重建 Runner。

### 安全场景 A–D

| 场景 | 最小可接受行为 | 证据 |
| --- | --- | --- |
| A · 两个独立 Task | 独立 Task package/sourceHash/params 与网页效果，各自产生原 Worker Run、Result、retirement 与 Provider receipt | Provider 双 Task 模拟已在 R5.1 CI 通过；**新的真实双 Task Chrome 证据仍 `NATIVE_PENDING`** |
| B · 禁止结果正文 | 允许本地运行，Provider 只获得 `{visibility:'status-only',state,retirementState:'released'}`；拒绝 URL、网页内容、Cookie、valueWire、错误正文 | R5.2 Browser/Provider 源码与专项测试已提交，CI/Native 状态分别登记 |
| C · 同 Task 多 Executor | Admin 新 Job 强制 `targetExecutorId`，同时绑定活跃 `pairingId`；其他浏览器不能 claim、permit、receipt、reconcile | R5.2 同 Task 双 Executor 拒绝性测试已提交；旧归属不明 Job 不投递 |
| D · 远端交付 | 外部 HTTPS/WSS 只访问 `/v1/*`，服务端生成独立、限定 Executor 的 client token；外部不能使用本机 `/admin/*` 或伪造 target | 单一 Provider 可选 TLS 监听和 scoped `/v1/submit` 已源码实施；隔离 TLS 测试已提交。公网与真实 Chrome 跨网验收 `REMOTE_NATIVE_PENDING` |

### Job 归属、授权与结果合同

- **唯一主体**：Provider UUID + 已配对 Executor UUID + 该 Executor 的 pairingId；不可仅按 TaskId、manifestHash/sourceHash 抢任务。
- **Job 不可变主体**：`targetExecutorId` + `targetPairingId` + `targetGrantId` + TaskId/version/manifestHash/sourceHash + 校验后参数/目标 Origin。配对撤销或重配不能继承旧 Job。Browser 连接认证后通过 `/v1/capabilities` 同步现行 `grantId` 与已批准 Task；任务入队强制绑定这次托管代际。Stop 后重新批准生成新的 grantId，旧授权排队 Job 取消且保留证据，不可在新授权下复活；Provider admission/renew 也验证当前 grantId。
- **请求幂等**：本机管理员请求按 Executor+pairingId+requestKey 分桶；HTTPS client 请求按 clientId+pairingId+requestKey 分桶。相同摘要复用原 JobId，变更参数或网站导致 `E_REQUEST_CONFLICT`；旧 `seed:requestKey` 保持历史不可重新指派。
- **旧 Job 迁移**：已分配 Job 保留原归属（找不到有效配对则不能继续执行），已完成 Run/Result/receipt 不重写；未分配、无归属老 Job 保留数据库但不得 claim。
- **Provider permit**：仍经原 /v1/claim → /v1/admission → 原 Task Resolver/Authority/RunHost/Worker。Admission 带明确 `resultAllowed`，Provider 禁止用无授权的 `full` receipt。
- **结果与状态**：`status-only` 只允许 `visibility`, `state`, `retirementState` 三字段，且有原终态 durable Result 与已释放 Run；`full` 必须有该项 Task 明确 resultAllowed 且固定 RunRef 一致。外部调用客户端默认只收到 JobId，不直接获得网页内容或历史 Result。公网可信 client 还受保守的持久化入队限制（同 client 最近 60 秒最多 60 项，最多 100 个待领取队列），同 requestKey 的幂等重试不消耗新队列配额；生产服务器另需边界层抗滥用限流。
- **失效**：Stop 停本地许可及当前执行，Unpair 先 Stop 后远端撤销；撤销后旧 credential/WSS ticket 不能新接入，相关 client grant 失效。断网时本地停用成功，但解除配对远端确认未完成，不准伪称成功。
- **未知副作用**：保留 `OUTCOME_UNKNOWN`，不在重连后猜测无副作用而再运行，不删除原 Run、Result、receipt。

## 实际修改与源码所有权

| 提交或文件 | 已实施行为 | 状态 |
| --- | --- | --- |
| `85173716d554ef9679639da8c2b6186fd046c451` · `scripts/cloud-control/provider.mjs`, `src/cloud-control/service.js`, `scripts/cloud-control/cli.mjs` | 目标 Executor/配对代际限制、最小状态回执与本地撤权 | `SOURCE_IMPLEMENTED` |
| `9b97c9b1ab754026b16281d9563ab48e26324eb1` · `tests/cloud-control/executor-isolation-r52.test.mjs` | 同 Task 双 Executor 隔离/跨号攻击/重新配对/旧队列拒绝 | `SOURCE_IMPLEMENTED` |
| `73744a865ebc45a1662dd125e022fb14e594c580` · `tests/cloud-control/status-only-privacy-r52.test.mjs` | Browser 原始 Result 与未授权正文回传拒绝 | `SOURCE_IMPLEMENTED` |
| `79c50e5c371c34ca8c0351f12f07e9a42a22ec0f` · durable outcome 测试 | 旧逻辑修正：终态 Result 在 `resultAllowed=false` 下可回传最小状态 | `SOURCE_IMPLEMENTED` |
| `274ba710ece5d026aff4bd69eff539566746377e`, `373f8b698222b54489d704041d8dddb8db761d1b`, `5961cce5f7d1cd995af606da107856536109656b`, `73c7ee45f62e59e9ae01493f8dd2d5ad2bef803a` | 真实 Side Panel 任务优先布局、首次引导、结果许可文案、高级身份折叠、R27 token 响应式样式 | `SOURCE_IMPLEMENTED` |
| `5dc467fbf401785d48cc0b904a1de8562465180a`, `dda54ec52d0f6e4f411b34328ec474b9bd66e45f`, `1318be2a85d6c26ab825c83d6634c5d99f83729c` | 同一 Provider 新增可选 HTTPS/WSS 监听、本地 Admin 与远端客户端硬隔离、按 Executor client grant/submit、CLI | `SOURCE_IMPLEMENTED` |
| `50847960556e77d32513d7ccd68cf52f1d77e964` · `tests/cloud-control/remote-https-r52.test.mjs` | 本机受控 TLS HTTPS+WSS、错误鉴权/非法范围、重启与 client revoke 测试 | `SOURCE_IMPLEMENTED` |
| `a31bc3ee454890c42c237e5a64991039425f4818`, `b1a5b51127d92a1943d7824fb35ede9fa6cf41c0`, `3d1284224b46c2c26ccb9c421b27d51ec4c7ee95` | Provider + Browser Cloud 授权 generation 精确绑定，旧队列按新的批准代际隔离 | `SOURCE_IMPLEMENTED` |
| `df8be0483b37d58c894b0e2aad0535eeebd978a6` · 多 Executor 测试 | 旧授权排队 Job 在重审批后无法执行，新 grant claim 可运行 | `SOURCE_IMPLEMENTED` |
| `80a00eeb75f5c0d19df74a842067ff81dd52b194` · Provider | 同 client 速率/待领取队列上限，不破坏同请求重试 | `SOURCE_IMPLEMENTED` |

新增代码复用原 Provider/Task Package/Installer/Resolver/Authority/RunHost/Worker/Result/receipt 与 Cloud History Index。未碰共享 `controller-methods.js`、`broker.js`、`schedule-repository.js`，未建第二套调度/执行或权限数据库。

## Provider 部署配置与操作（维护者，不是普通用户）

本机 Admin 必须继续绑定 `127.0.0.1`，默认端口 43112。仅在提供有效受信 TLS 证书和私钥且维护者明确配置时开启第二个**同一 Provider 的 HTTPS/WSS listener**；`--public-host 0.0.0.0` 是公开监听的显式配置，绝不可将 `/admin/*` 透传到公网。真实远端必须经过网络 ACL、证书自动轮换、secret manager、入站速率限制与正式认证审查，不因本机 TLS 测试就宣告已部署。

```bash
node scripts/cloud-control/cli.mjs provider --directory .local/cloud-control --port 43112 \
  --public-port 443 --public-host 0.0.0.0 --tls-key /secure/provider.key --tls-cert /secure/provider.crt
# 在本机可信管理终端中查看 Executor：
node scripts/cloud-control/cli.mjs executors --directory .local/cloud-control
# 为单个已配对浏览器授予外部调用专属 token；安全保存响应 credential：
node scripts/cloud-control/cli.mjs client:grant --executor EXECUTOR_UUID --directory .local/cloud-control
# 可信服务端保存凭据于仅自己可读的文件，通过 HTTPS 投递固定 Package：
node scripts/cloud-control/cli.mjs submit:remote --url https://provider.example/ \
  --token-file /secure/client-token --package examples/tasks/form-fill.v1.opendesk-task.json \
  --params '{"name":"Cloud User"}' --target http://127.0.0.1:43111/demo-form.html --key external-req-001
node scripts/cloud-control/cli.mjs client:revoke --client CLIENT_UUID --directory .local/cloud-control
```

`submit:remote` 只能指定已登记固定 Task 的受控参数和网站，不能上传 JS 源码。涉及的表单 URL 是**本机演示页面**；对于互联网 Provider/不同电脑，需改为已被该 Task 网站 Origin 许可的真实 HTTPS 站点。不能向无公网授权的账号自行部署服务或购买域名。

## 真实测试证据与阻断

### 既有候选（不可复用为本轮 PASS）
- R5.1 固定 SHA `93c78341271032cb3c641f2b818e9636fb6b88e9`，CI [#38351008157](https://github.com/shopable-ai/opendesk-browser/actions/runs/38351008157)：Cloud 30/30，Authority 113/113，其他 83/83，总计 226 PASS / 0 FAIL；check/build/build:dev/verify PASS。生产 PackageHash `9efaded0997d1182bdd0b058f017a6c025563aa1b7ac5162012957ada8faf839`，开发 `8cdbbf5663130d6b78c68c831ccee4650699d90f26efc8666ebaf8f4e0cd0e8e`。只证明旧组件/包，不是 R5.2，也非真实 Chrome。
- R5.2 **失败候选** `85173716d554ef9679639da8c2b6186fd046c451`，CI [#38357973403](https://github.com/shopable-ai/opendesk-browser/actions/runs/38357973403)：`durable-outcome.test` 仍预期禁用回传时不发送状态回执，组件 FAIL 1；随后已修改为 R5.2 语义。构建 `ui/tool-shell.js 527585 > 524288` 固定字节预算 FAIL；**禁止升高预算伪造通过**。
- R5.2 更新候选 [#38359650307](https://github.com/shopable-ai/opendesk-browser/actions/runs/38359650307) 覆盖新 TLS 测试，CI 结论需绑定该 SHA 实时核查，不得先填 PASS。

### 原生/远端身份证据：尚无
- 双独立 Task 原始 Chrome `RunId`：`[]`
- 原始 `ResultId/Result.revision.sourceHash`：`[]`
- Worker 网页副作用与退休 released：`[]`
- Provider `receiptId` 原生配对证据：`[]`
- Chrome 300/320/360/420/520 CSS px × 125%/200% 页面截图：`[]`
- 互联网实际跨公网 Provider + Chrome 独立终端链路：`[]`
- Mac Profile/端口 43111/43112 由其他对话并行占用，当前通过 GitHub connector 无法访问用户 `/Users/shopme/Documents/workspace/opendesk-browser`；不抢占共享 Chrome/Provider/IndexedDB/dist 资源。

**两个不同 Task 的真实 Chrome Worker + Provider receipt = `NATIVE_PENDING`。公网端到端 = `REMOTE_NATIVE_PENDING`。不创建长期挂机 Runner。** 文件中任何自动化测试引用的 Node 构造 RunRef，都不是原生 Chrome。

## 独立质量门禁（绝不平均、无真实证据不填 95）

每维分别判 `DESIGN_SCORE` / `IMPLEMENTATION_SCORE` / `VERIFICATION_SCORE`。以下是目标与缺口清单，不是第三方实测 95 分：

| 独立维度 | 目标 | 本轮证据不足时的结论 |
| --- | --- | --- |
| 产品定位与用户价值 | 95 | 原生安装复用链路未证实：`NOT_VERIFIED` |
| 用户完整流程 | 95 | 未证明独立安装→任务执行→Stop 完整循环：`NATIVE_PENDING` |
| 功能完整性 | 95 | 双 Task Provider HTTP 测试不等于双 Worker：`NATIVE_PENDING` |
| 云端可用性 | 95 | 源码可选可信 HTTPS/WSS，公网部署和账号环境未验收：`REMOTE_NATIVE_PENDING` |
| 多用户/Executor 隔离 | 95 | 源码与拒绝测试已提交，待对应新 SHA CI：`NOT_VERIFIED` |
| 权限安全 | 95 | 原 Resolver/Authority 复用，新入口需完整回归/原生：`NOT_VERIFIED` |
| 结果隐私 | 95 | 受限状态正文隔离已源码实现，待 CI+native：`NOT_VERIFIED` |
| UI 视觉设计 | 95 | 真实 Side Panel 源码修改；没有原生截图：`NOT_VERIFIED` |
| UI 信息与文案 | 95 | 真实组件待用户测试：`NOT_VERIFIED` |
| UI 操作效率 | 95 | Tab 内变更，尚无计时/点击实测：`NOT_VERIFIED` |
| 可访问性与响应式 | 95 | 已有 CSS 合同但 300–520/125–200% 未原生验证：`NATIVE_PENDING` |
| 运行可靠性 | 95 | Idempotency 源码/测试，未知副作用原生恢复未验收：`NOT_VERIFIED` |
| 框架复用与可维护性 | 95 | 单 Provider/Host/Worker，需 Code Review：`NOT_VERIFIED` |
| 自动化测试完整性 | 95 | CI 成功候选尚未证实，包含已知失败：`NOT_VERIFIED` |
| 真实 Chrome 验收可信度 | 95 | 所有原生身份数组为空：`NOT_VERIFIED` |

下一阶段必须针对最终候选运行 `npm run test:cloud`、Authority/Side Panel、`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`，修正固定工具包预算后才允许标 `BUILD_VERIFIED`。借隔离的 Mac Chrome 测试完成两个真实不同 Worker 任务的 Run/Result/retirement/receipt 证据后才能 `NATIVE_VERIFIED`；获得批准可信服务器后跨公网验收才能 `REMOTE_NATIVE_VERIFIED`。所有低于 95 的独立项必须补缺陷-源码-测试-重新评分，不准平均抵消。

## R5.2.1 · 限定客户端 Task 与结果权限 + 可查询执行状态（2026-10-13）

**本次新增真实代码**（复用同一 Provider/Task/Run/Result，没有第二套权限 DB）：

- `scripts/cloud-control/provider.mjs` 的 `/admin/client-grant` 必须提交非空不可变 Task pin 清单和独立 `allowResult`，绑定当前 `executorId + pairingId + grantId`。旧未限定 Task 的 Client 记录按缺少授权字段保守拒绝，不静默继承全部 Task。
- `/v1/submit` 除固定 Task Registry 和 Browser 当前 capabilities 外，额外验证本客户端自己的 Task pin；两个客户端分别以各自身份提交，重名 requestKey 不互相复用。新的 `/v1/job-status` 仅接收经过 HTTPS 认证、由本 Client 自己投递的 `jobId`，拒绝跨 Client、跨 Executor、跨配对身份查询。
- **双结果隐私许可**：Provider 端仅在 Browser admission `resultAllowed=true`、本客户端 grant `allowResult=true`，且有真正 `visibility=full` 回执时返回结果内容。其余请求仅提供最小化 `state` 与 `receiptConfirmed`；没有 RunId、网页 URL、参数、Credential、Cookie 或 Result body。原 Server Admin 状态权限不向 HTTPS 客户端开放。
- **保守恢复**：已经 admitted 且取消/租约过期但还没有 terminal receipt 的任务向外部返回 `OUTCOME_UNKNOWN`，不推断“没有网页副作用”，也不从 Status 查询启动第二次执行。新本地批准产生新的 grantId 后，旧 grant 写入 retired set，旧 WSS 延迟同步不能回滚 Provider 身份或复活旧 Job，旧客户端授权失效。
- `scripts/cloud-control/cli.mjs` 新增 `status:remote`，`client:grant` 要求 `--package` 或 `--packages`（固定 manifest pin）与 `--token-out`，凭据仅写入模式 0600 且不在标准输出打印。普通浏览器用户仍通过 Side Panel 安装/授权/Stop；CLI 只给可信服务维护者。

**实际 CI 成功证据**：
- [R5.2 专属合同 CI #38367293395](https://github.com/shopable-ai/opendesk-browser/actions/runs/38367293395) 绑定 `faf43e48954584a9df94a8fd58e059d01bd19138`：34 Cloud、113 Authority、10 Cloud UI，合计 **157 PASS / 0 FAIL**（不包括后续客户端新协议）。
- [含客户端固定 Task 授权、外部状态/结果读取、双客户端互相拒绝以及旧 Grant 重放拒绝的 CI #38368001891](https://github.com/shopable-ai/opendesk-browser/actions/runs/38368001891) 绑定 `24994880c48e70241174727d65c3165e4f0dc35d`：**34 Cloud + 113 Authority + 10 Cloud UI = 157 PASS / 0 FAIL**，是 R5.2 组件证据 `COMPONENT_TESTED`，不是最终 Package PASS。
- 中间候选 `58a3939b5e57b866921f9c2d9b3878980b01105b` 的旧 TLS 测试尚未提供新必需 Task 清单而失败；后续 `cfd7daa7139b8b0309723516d848035e2e974c2a` 已更新并独立 CI 成功。保留失败而不删除证据。

**明确的未达标部分**：当前无原生 Mac Chrome 两个已安装 Task 的独立 Worker/Run/Result/retirement/Provider receipt；没有真实 Side Panel 300–520px、125%/200% 截图及键盘验收；公网 Provider 未获部署许可；当前移动中的 `main` 没有同一候选完成 `check/build/build:dev/verify` 的新 PackageHash。以上分别保持 `NATIVE_PENDING` / `REMOTE_NATIVE_PENDING` / `NOT_VERIFIED`，不能借组件 157/157 宣称整体 95+。

**演示命令修订**：上文旧示例的 `client:grant --executor EXECUTOR_UUID` 已不合法，必须使用 `client:grant --executor EXECUTOR_UUID --package /secure/approved-task.opendesk-task.json --allow-result false --token-out /secure/client.token`。远端调用及 `status:remote` 的完整可运行步骤以 `examples/cloud-control/README.zh-CN.md` 最新 R5.2 小节为准，HTTPS 目标必须真的属于该 Package 的 `siteOrigins`。

## R5.2.2 · RunRef/Receipt P0 固定身份与原生验收准备

**源码修复已提交**：`59a7fc3d78fefea5345bb2fc726fc1c0f5130370` 修复了 Provider admission 仅校验 Task hash 而未绑定 Cloud Assignment/Grant、以及 receipt 允许用不同 receiptKey 覆盖原 Result 的安全风险。现在要求原 `RunId/ResultId` UUID、`requestId=cloud:assignmentId`、`runRef.grantId=Job.targetGrantId`、Task 双摘要完全一致；receiptKey 必须等于原 `runRef.resultId`，相同 Key 不同内容 `E_REQUEST_CONFLICT`，不同 Key `E_RECEIPT_KEY`。原 completed Result 与历史回执不得重写。

**拒绝性测试已更新**：`tests/cloud-control/provider.test.mjs` 拒绝错误 Assignment/Grant 与回执重写；`generic-delivery.test.mjs`、`executor-isolation-r52.test.mjs`、`remote-https-r52.test.mjs` 均改为用真实绑定的 grantId，不通过随意伪造的 UUID。旧 Grant 墓碑还覆盖 Provider 重启后的回滚拒绝。

**实际用户操作验证补充**：
- `tests/cloud-control/remote-cli-r52.test.mjs` 启动独立本机 TLS Provider，在真实 Node 子进程执行登记两份不同 Package、创建只允许指定 Task 的客户端、把 Token 写入 0600 文件、通过 HTTPS 投递两项 Job、读取各自未执行状态、最后撤销客户端。这个测试只验证协议与 CLI，**不会伪造 Chrome Run/Result**。
- `tests/cloud-control/r52-product-ui.test.mjs` 读取当前真实 Side Panel HTML/CSS/JS，并检查首次连接 CTA、任务审批优先于高级配置、默认结果隐私、未批准不领取、Stop/Unpair 的 UI 状态。它不是截图，不能证明 300–520 CSS px 和 125/200% Chrome 缩放已通过。
- `tests/cloud-control/remote-https-r52.test.mjs` 进一步覆盖浏览器允许结果但外部客户端拒绝读取、admitted 后取消而结果未知、重启后旧授权失效；已有 Run/Result/receipt 仍保存。

**证据门禁**：上面的源码和测试在候选 `9ad75dde80d2b79bcbd26b5276ebd2d606be2f47` 后进入新 CI：[Cloud R5.2 专项 #38370589040](https://github.com/shopable-ai/opendesk-browser/actions/runs/38370589040) 与 [构建 #38370588579](https://github.com/shopable-ai/opendesk-browser/actions/runs/38370588579)。最后查询时仍排队，故 `SOURCE_IMPLEMENTED`，**绝不把上一候选 157 PASS 冒充新候选 PASS 或 BUILD_VERIFIED**。本次 GitHub connector 没有访问用户 Mac 文件系统和已安装 Chrome/Profile 的权限；原生双 Task、真实响应式截图与跨公网端到端仍分别 `NATIVE_PENDING` / `REMOTE_NATIVE_PENDING`，十五项实施/验收评分尚不可填写 95。

## R5.2.2 · 用户可读请求历史、Stop 幂等与 Provider 高频状态可靠性

日期：2026-10-13。上述历史成功 CI 只对应旧候选，不是下述新源码的完成验收。

本轮直接落实的增量：
- `src/cloud-control/service.js` 的已认证 `cloudStatus` 请求记录只投影本地 Task Manifest 的 80 字以内标题 `taskTitle`；`src/ui/cloud-status-presentation.js` 只保留标题和固定中文状态，`src/ui/cloud-hosting.js` 在「最近请求」以 **任务名 · 状态 · Run 状态** 展示两种已安装 Task。绝不把 RunId、TaskId、目标 URL、参数、Credential 或网页结果正文传播到只读 Observer 或外部 Provider 查询。测试覆盖两个不同任务及敏感标识不泄漏。
- `tests/cloud-control/remote-cli-r52.test.mjs` 的 Provider 与 CLI 在同一 Node 测试进程运行，原先使用同步 `execFileSync` 会阻塞事件循环导致真正 HTTP/HTTPS 投递死锁；已改为有 10 秒边界的异步子进程。测试用真实 CLI 命令登记两包、给指定 Executor 颁发独立 0600 凭据、远端 TLS 投递、查询两个 Job、撤销并证明无法再查询；**这些 Node 回执不是 Chrome Worker 原生证明**。
- `scripts/cloud-control/provider.mjs` 的用户 Stop 以 `suspendedAt` 拒绝任何**新**本机 Admin/外部 HTTPS Job，同时不拒绝先前已经接受的完全相同 `requestKey` 回查：原 JobId/receipt 和未知副作用历史不因 Stop 丢失。对应两种接口均新增断言。
- `scripts/cloud-control/provider.mjs` 将真正的只读接口（`job-status/reconcile/cancellation` 及管理只读列表）从状态全量 clone 和 `state.json.tmp` fsync/rename 中排除，同时仍沿唯一串行队列读取；`seed/submit/claim/admission/receipt/stop` 等**写入端仍保留异常回滚和原子持久化**。新测试通过将 `state.json.tmp` 故意设为目录验证：读仍可用，写必须失败并回滚。

**最新候选与验收资格**：
- 更新源码提交包含 `d69045abed34453e2e6f38b2f236c6d8498738f6`、`11773011d5ae12e91000c6645e6da45384fc9949`、`b4225056170c3522f8796d5f6cda4f009763e6a0`、`70d02565cd645b74ef1ea028653e1528fc1fe4fc`、`e8e9ed5da7dfdc56060216f8681dec5a3fc38afe` 和相关测试提交。完整增量 SHA 在同名 JSON。
- [R5.2 新候选组件 CI #38373122306](https://github.com/shopable-ai/opendesk-browser/actions/runs/38373122306) 绑定 `9337d5a44af3acdd866c0e8578f737f8e34c5349`，查询时 **queued**，不得按旧 `24994880...` 的 157/157 PASS 自动填新候选结果。
- 最新的 `main` 仍与其他 Agent 并行发展，项目整体 `check/build/build:dev/verify` 需等固定候选的独立结果；不覆盖其他 Agent 共享构建相关修改，也不为了过预算放宽 512 KiB 限制。
- 真实 Mac Chrome 安装两个不同 Task、实际 Worker/Run/Result/retirement/Provider receipt、300–520 CSS px 及 125%/200% 截图、外部批准公网服务均未在本会话取得原生证据。**NATIVE_PENDING / REMOTE_NATIVE_PENDING；独立 95+ 整体未关闭**。这些结果不能以 Provider mock、真实 TLS Node CI 或静态 UI 代替。

## R5.2.3 · 真实 Side Panel 空状态与错误可理解性（2026-10-13）

- `src/ui/cloud-hosting.js` 原“前往「我的」安装任务”错误地指向不存在的 `#tab-tasks`；已修为真实主 Tab `#tab-my-tasks`，并在 `tests/cloud-control/r52-product-ui.test.mjs` 覆盖可点击的空状态 CTA 和单次导航。组件源码已提交 `fadff7695ebd7ca1adaa5406cbb906dcf17052a1`，测试提交 `8f944aebd0301f37d1b40cc325f4cf7953a80f01`。
- 云控本地“未核对任务身份 / 未选择任务 / 未再次同意回传结果正文”的明确授权错误，现在只按固定白名单显示可执行的中文提示；**不把来自远端 Provider 的任意 `error.message` 显示到受信 UI**，远端消息仍按已知 `E_* ` 代码脱敏。源码 `e2e3821b3397a5ac19293cc7d4387b08595c43b7`、对应拒绝性测试 `91cd8c39352b7fd705e3b987c8428ff98e3a7106`。
- [该 UI + Cloud 协议固定候选专项 CI #38373957070](https://github.com/shopable-ai/opendesk-browser/actions/runs/38373957070) 对应 SHA `91cd8c39352b7fd705e3b987c8428ff98e3a7106`，本次检查状态仍 **queued**；状态为 `SOURCE_IMPLEMENTED`，**不能提前记为 `COMPONENT_TESTED` 或 `BUILD_VERIFIED`**。
- 旧 [#38368001891](https://github.com/shopable-ai/opendesk-browser/actions/runs/38368001891) 的 157/157 成功仍是准确历史证据，但不等于此次 CLI 测试、只读优化和 UI 修复通过。真实 Mac Chrome 与可信公网部署也均未产生原生证据。


## R5.2.4 · 普通用户直接管理外部应用授权；真实 CI 门槛继续保留（2026-10-13）

**本节是实际写入 `main` 的代码增量，不是设计提案、第三套权限数据库或新 Runner。** 之前 R5.2.3 段落中的排队/成功判定只作为当时的历史快照；本次核对 R5.2.2 的专项 [CI #38370589040](https://github.com/shopable-ai/opendesk-browser/actions/runs/38370589040) 已 **completed/failure**，失败出现在 `remote-cli-r52.test.mjs` 的 `execFileSync` 阻塞导致 300 秒 `UND_ERR_HEADERS_TIMEOUT`。后续代码已改用异步子进程，必须以最新 SHA 重新测试，不得覆盖或美化历史失败。

### 本轮实际源码改动

- Provider 既有 `state.clients` 与 Executor bearer 授权中新增 `/v1/client-list`、`/v1/client-grant`、`/v1/client-revoke`。列表只读、限制分页，仅当前 **Executor + Pairing + Grant** 可见；颁发凭据必须具备 Provider 预登记、Chrome 已发布批准的 immutable Task pin，默认 `allowResult=false`；仅返回一次 256-bit token。保留原 `/admin/*` 的 127.0.0.1 管理隔离，不在浏览器引入管理员凭据。撤销和提交/状态读取共享序列化队列内二次验证旧 token 是否仍有效，避免先通过认证、排队后被撤销的并发重入。
- `src/cloud-control/service.js` 通过既有 `scoped(sender)` + 原 `resolveTask` 的固定 manifest/sourceHash/installationId/generation 身份，核查当前 `grantId` 以及 Task 和结果回传授权，再使用原 Provider `post` 颁发或撤销外部应用凭据。浏览器不保存外部应用的令牌，不引入新 Worker/Host/Authority。
- `src/platform/host/{authority,broker,client}.js` 仅在原 `requireCloudSidePanelSender` 安全门禁追加三个可信 Side Panel RPC；只读独立控制台与目标网页未获得颁发权限。
- `src/ui/{tool.html,cloud-hosting.js,tool-shell.css}` 在原云控页新增「外部应用授权」，用户可选择一个已批准 Task、单独决定结果读取、创建并**一次性复制**客户端凭据、刷新/分页查看有效授权以及二次确认撤销。Stop/解除配对/关闭详情/页面释放清理本地令牌显示；使用原 R27/R28 Design Tokens，窄宽 CSS 容错，长 Task 名与应用名文本截断/换行且无需新增弹窗。
- `tests/cloud-control/remote-https-r52.test.mjs` 新增真实 Node TLS 协议用例：当前 Executor 自助创建/撤销，不泄漏 token 于列表，其他外部客户端不能管理，Chrome B 不能读取/撤销 Chrome A 凭据，恶意 Task Pin/控制字符标签被拒绝，Stop 之后不允许再颁发新凭据；`tests/cloud-control/r52-product-ui.test.mjs` 覆盖真实 HTML/CSS/JS 元素与交互 Mock 的单 Task 授权、二次确认、令牌清空以及结果权限不扩大。**以上尚不代表真实 Chrome 运行。**

**可追溯源码提交**：
`996f305f35c1cdb9fbc45edc9653b4ef8b1dc0d3`、
`0cd96638b060932dbef1116230c004cba1f7ae27`、
`aa21f13cdf68c1efe115a517c4d2b31a01c9950e`、
`2c4692e406dd48872329cbfc31a1d6aeb732b2ea`、
`498fb0d4b7213376e292323bf6309cb0e1ea9567`、
`e7c099627b59992df2268f2e3be76d07e982360e`、
`7558ebac9f7e1f1ccd332829d60e67e3a2ba1619`、
`2120c2eeca71c44e2a6f18b4d53ba911f6ab3638`、
`af0727f1c7e5094e523a4ebff715d3eff151581a`、
`5e05bc43db78248d46ff46f46977043d33ff26d8`；
修复/追加测试为
`9da132b07d4cdfa8938ea379f20f3e78d8f01316`、
`861a79cb60c1a9ce0359ff7e48012b0871e1a2a2`、
`4cb1d7b6128a9d9be34c3c9fcc90abf37b68e487`、
`33c6e4a821830c4fa5db7b64c7f463cdc061c00d`、
`738fdc1e28c3a6758d853acea20011b295e56207`、
`7aff8bd27e258022cdf186019409dcc07fdee719`。所有提交在 `main`，不含强推、Worktree 或 PR；原始 Request/Run/Result/receipt 历史未修改。

### 最新 R5.2.4 候选验证状态

- **源代码候选 SHA** `7aff8bd27e258022cdf186019409dcc07fdee719`；对应 [R5.2 专项 CI #38379208965](https://github.com/shopable-ai/opendesk-browser/actions/runs/38379208965) 在观察时仍 **queued**；同一 SHA 的 [固定 512 KiB 构建 CI #38379209138](https://github.com/shopable-ai/opendesk-browser/actions/runs/38379209138) 为 **pending**。未得到执行日志，不填 `test:cloud` PASS 数、PackageHash 或 `BUILD_VERIFIED`。
- 状态严格为 **`SOURCE_IMPLEMENTED` / `COMPONENT_TESTED=NOT_VERIFIED` / `BUILD_VERIFIED=NOT_VERIFIED`**；仅此处新增外部客户端自助管理的实现，不能把旧 157/157 的成功迁移到新 SHA。
- 未接入用户 Mac 本机 Chrome Profile，未获取两个真实不同 Task 的网页副作用、RunId/ResultId/retirement/receiptId，也没有 300/320/360/420/520px、125%/200% 原生截图与键盘焦点审计。**`NATIVE_PENDING`**。
- 未获得用户授权的真实公网 Provider/SSL 域名、端到端跨公网 TLS/WSS Chrome/客户端调用链；**`REMOTE_NATIVE_PENDING`**。
- 十五项 **DESIGN_SCORE、IMPLEMENTATION_SCORE、VERIFICATION_SCORE** 仍独立 **`NOT_VERIFIED`**；不宣称总体 95+。构建预算保持生产固定条目 512 KiB；不得通过提高阈值伪造通过。

**当前唯一事实性后续阻断**：GitHub Actions 队列与无 Mac Chrome 原生资源。先确认最终同一 SHA `npm run test:cloud`、Authority/Side Panel、`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`；构建成功时记录当次真实 PackageHash。再在相互隔离的原生 Chrome A/B 上完成两个不同 Task Worker/Run/Result/receipt 及隐私/授权撤销/未知副作用；没有公网授权不标公网通过。

**CI 状态追加核查（同日，保留上方首次观察时间）：** 固定预算 CI [#38379209138](https://github.com/shopable-ai/opendesk-browser/actions/runs/38379209138) 已由 `pending` 转为 `completed/cancelled`（并行 `main` 提交期间被取消），因此 **不是 PASS 也不是实际构建失败**；当前候选无可用的生产/开发 PackageHash。R5.2 专项 [#38379208965](https://github.com/shopable-ai/opendesk-browser/actions/runs/38379208965) 仍在排队；两者均不能标记 `BUILD_VERIFIED` 或新 `COMPONENT_TESTED`。同名 JSON 已追加此状态，保留旧状态的历史快照。


## R5.2.4 · 唯一云控 UI 交互预览与 39 项功能树

日期：2026-10-13。本次用户优先要求**先完成可检查的 HTML 预览，再基于原有产品代码迁移**。本项只新增单一设计原型，不替换真实 Side Panel，不新建 Runner/Task Registry/权限系统，也不改写历史 R1–R5.1 事实。

- 唯一预览：[\`examples/ui/cloud-control-r5.2-preview.html\`](../../../examples/ui/cloud-control-r5.2-preview.html)。支持首次使用、已配对未授权、正常运行、执行中、离线重连及安装版本失效六种场景；各场景可切换 300/320/360/420/520 CSS px，交互模拟配对、固定 Task 多选、单任务正文回传、单次审阅、历史筛选/详情、Stop 和 Unpair。
- 完整 UI 设计合同：[云控 R5.2 UI 功能树 / 源码映射](../../architecture/browser-framework/cloud-control-r5.2-ui-preview-contract.zh-CN.md)；**6 类 39 项可追溯功能**：状态与导航 7、配对 5、Task 审批与权限 9、请求/结果历史 7、撤权及恢复 5、响应式/安全质量 6。每项区分真实源码能力、仅原型功能与原生待验收。
- 组件静态契约测试：\`tests/cloud-control/r52-ui-preview-contract.test.mjs\`，保证唯一离线 HTML、R27 Tokens、6 类状态/5 档宽度、双独立 Task 固定 sourceHash、逐任务隐私及 39 项文档未偏离。新增测试属于新候选，尚未凭旧 CI 推升为 \`COMPONENT_TESTED\`。
- 设计验证：独立容器 Chromium headless 对 HTML 执行真实 DOM/JS 交互，6 场景 × 5 CSS 宽度 = **30 个静态原型布局样本**，当前横向溢出 **0**、JS pageerror **0**；配对、审阅确认、正文许可、离线拒绝虚假解除、焦点保持的演示交互通过。这里的浏览器没有安装 OpenDesk 扩展，因此只表示 **HTML preview 可运行**，**不是 \`NATIVE_VERIFIED\`**。
- 当前生产 \`src/ui/{tool.html,cloud-hosting.js,tool-shell.css}\` 仍是原有云控产品代码。原型的 **Manage/Review/Request Detail** 二级视图需要根据上述合同迁移；Provider 客户端 Token 管理仍属于 Provider 权限域，不可为了 UI 制造第二套权限系统。
- 下一独立 Gate：设计评审确认单一信息架构 → 安全增量迁移生产 Side Panel → 源码专项测试及双构建 → 原生 Mac Chrome 300–520px、真正 125%/200% Zoom、键盘/焦点和真实双 Task Run/Result/receipt。**目前原生 UI 和双任务执行继续 \`NATIVE_PENDING\`，公网端到端仍 \`REMOTE_NATIVE_PENDING\`，不填虚假 95 分。**

该页面设计符合 R27/R28 的 token/信息层级与唯一 gutter 规则，但静态原型不会自动证明实际扩展布局、可访问性、原生 Worker 或平台授权。验收、分数与 PackageHash 必须绑到迁移后的真正源码候选。

## R5.2 产品功能树与唯一执行手册入库（2026-10-13 20:50+08）

本轮**不重新选架构、不把新文档当新源码 PASS**；已将之前分散的完整 Cloud Control 设计、产品任务和质量评审收敛为以下权威入口：

| 对象 | 文件 | 内容、状态 |
|---|---|---|
| **完整产品功能树** | [Cloud Control R5.2 完整功能树](../../architecture/browser-framework/cloud-control-r5.2-complete-function-tree.zh-CN.md) | **10 领域、110 项检查点 = 98 产品/运行能力 + 12 部署/质量事项**；按业务编号追溯，现有 39 UI 验收是叠加矩阵、不相加 |
| **机器可读功能矩阵** | [110 项 JSON](cloud-control-r5-02-function-matrix.json) | 每项所有者、实现状态、独立验证等级、通过条件及对应 Gate |
| **唯一接口安全合同** | [27 Provider HTTP / 10 Host RPC](../../architecture/browser-framework/cloud-control-r5.2-interface-security-contract.zh-CN.md) | 角色、身份、TaskPin/Executor/Pairing/Grant、状态机、Client Scope 与结果隐私 |
| **唯一实施手册** | [7 Gate / 30 工程任务包](../cloud-control-r5.2-execution-manual.zh-CN.md) | 先 CI、再安全、原生双 Task、正式 UI、远端、故障、最后独立质量签收；禁止每次重选架构 |
| **15 项独立专家评分** | [专家静态初评分账本](cloud-control-r5-02-expert-scorecard.json) | 静态解决方案约 **86/100**，是单次技术静态估计、不是正式第三方质量验收；各 `DESIGN_SCORE/IMPLEMENTATION_SCORE/VERIFICATION_SCORE` 依然 `NOT_VERIFIED` |
| **UI 已有设计** | [39 项 UI 预览合同](../../architecture/browser-framework/cloud-control-r5.2-ui-preview-contract.zh-CN.md) / [唯一 HTML](../../../examples/ui/cloud-control-r5.2-preview.html) | 39 项只是 UI 检查，预览并未完全迁至生产 Side Panel，不是两个 Chrome Task/公网验收 |

### 最新事实：R5.2.4 CI OOM 已定位，但新候选尚待验收

- 固定 SHA `7aff8bd27e258022cdf186019409dcc07fdee719` 的 [CI #38379208965](https://github.com/shopable-ai/opendesk-browser/actions/runs/38379208965) **completed/failure**。Cloud `npm run test:cloud` = **45 PASS / 0 FAIL**，随后 Controller Authority 已通过 **105 个子测试**，在约 4GB V8 堆内存处发生 OOM/SIGABRT；不是“45 项 Cloud 功能全通过就完成产品”。同 SHA [包 CI #38379209138](https://github.com/shopable-ai/opendesk-browser/actions/runs/38379209138) **cancelled**，没有 PackageHash。
- 原测试 `tests/framework/k3-controller-authority.test.mjs` 的 `fetch` 替身在模拟 admission 时对任意 URL 都重复调用 `cloudStop`；新版 Stop 向 Provider 发送 `/v1/suspend`，造成递归调用与内存膨胀。小范围修复提交 [`90e1651eeb2ad364e4ced4fc44e9d155ddcfc708`](https://github.com/shopable-ai/opendesk-browser/commit/90e1651eeb2ad364e4ced4fc44e9d155ddcfc708) 仅拆分模拟 admission 与 suspend，不篡改生产 Stop 行为或提高 heap/构建预算。云控 R5.2 workflow 已增加 Authority 文件触发；[新 CI #38401041303](https://github.com/shopable-ai/opendesk-browser/actions/runs/38401041303) 本次检查仍 queued，**不能提前记成功**。
- 真实 Chrome 中两份独立安装/授权的 Task A 和 B 的 `RunId/ResultId/retirement/receiptId` 原生证据仍为空。真实 UI 300–520 CSS px 和 125/200% Zoom 没有与当前候选绑定的已安装扩展截图。公网 Provider 没有获授权部署环境。维持 `NATIVE_PENDING` / `REMOTE_NATIVE_PENDING`，总体 95+ 不能宣布。

**下一实际工作优先级**：照 [唯一执行手册](../cloud-control-r5.2-execution-manual.zh-CN.md) Gate G0（新 SHA CI + 双构建）→ G1（安全拒绝测试）→ G2（A/B 真实双 Task）→ G3（生产 UI）→ G4（可信远程）→ G5（副作用与断线）→ G6（十五维各自 ≥95 的真实证据）。必须保留所有历史失败和旧收据。

## R5.3 · UI-08 已提交（源码完成不等于最终验收）

- [正式代码提交 21c5a0dacb7ae0dfea18ea85d414ac157b09b34a](https://github.com/shopable-ai/opendesk-browser/commit/21c5a0dacb7ae0dfea18ea85d414ac157b09b34a) 已合入唯一 `main`。原 Cloud Tab 增加请求详情、只读历史翻页、从经验证的原始 Run 指针跳转到已有 Controller 运行结果；保持 cloudObserve 对外无 ID/正文、原始 RunHost 与权限不变。
- 110 功能矩阵源码账目更新为 **109 SOURCE_IMPLEMENTED / 1 NOT_IMPLEMENTED（OPS-05）**。其中 UI-08 = `SOURCE_IMPLEMENTED` / `NOT_VERIFIED`，Node 测试、真 Chrome、构建都不计通过。
- [该代码 SHA 的 Cloud CI #38413468963](https://github.com/shopable-ai/opendesk-browser/actions/runs/38413468963) 本次观测为 **queued**，K3 旧 [#38379208965](https://github.com/shopable-ai/opendesk-browser/actions/runs/38379208965) 失败/OOM 继续保留且不可复用作 PASS；新生产/开发 PackageHash 暂无。
- 当前 7 Gate/30 工程包的唯一增量状态索引写在本文件 JSON 的 `masterPlan.r53GatesAndPackages`，以原实施手册为包定义，不新增重复任务书。全部 30 包还没有完整证据关闭；G3-02 本次仅源码入库，G2 A/B 原生、G3 生产缩放/键盘、G4 公网远端均保持 Pending。
- 本轮不能访问用户 Mac 独占 Chrome/Provider/工作区或经授权公网环境，不伪造 Task A/B 的 `RunId/ResultId/receiptId`，不填写尚不存在的截图与 PackageHash。
- [增量工作记录](cloud-control-r5-03-g3-ui08-incremental.md) 含变更文件 Blob SHA 和实际 CI 入口；静态设计旧评分 86 与独立十五维 `NOT_VERIFIED` 原样保留。

当前判断：**PARTIALLY_VERIFIED（已有源码及历史组件证据，但 G0/G2/G3/G4/G5/G6 的真实产品验收未闭环）**。

## R5.3.1 · 实际 CI 与原生阻断收敛（2026-10-13）

本轮直接修改现有 Cloud Provider、Browser Cloud Service、R3 UI/Task fixture 及测试，未创建第二套执行架构。已推送提交：`3a835ad`、`de321e9`、`7d4c7a1`、`1f0613a`、`ebfd075`、`7384485`，均由本轮 GitHub `main` 实际提交产生。

- **Cloud R5.2 完整组件成功**：固定 `ebfd0758aa7c7f6b813bc014209fc68bc01f9e43`、[Actions #38429276271](https://github.com/shopable-ai/opendesk-browser/actions/runs/38429276271)，Cloud Provider **71/71**、Controller Authority **120/120**、相关 Cloud UI **27/27**，合计 **218/218 PASS / 0 FAIL**；旧 K3 OOM 在该固定候选没有重现。
- **生产/开发包均真实通过**：同一固定源码 SHA `ebfd0758aa7c7f6b813bc014209fc68bc01f9e43` 的 [R3 包 Job #38429276214](https://github.com/shopable-ai/opendesk-browser/actions/runs/38429276214)：`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 全部 PASS；生产 PackageHash `9f82008047c92af9e6c9f5d1ced7ca710703d68e6ba7592c4a9c9a0343498e95`，开发 PackageHash `49f9364661d20d1341aa13b72c667f62f5310ad14e0a78132ed475dbd03e0407`。**该 R3 整体工作流仍 FAIL**，因为 Task 阅读器旧测试夹具缺少完整 Manifest 身份；修复提交 `7384485` 后需单独同 SHA 复验，不得把包 Job PASS 冒充整个工作流 PASS。
- **本次有组件级实证的矩阵项目**：`PAIR-04、DELIVERY-05、DELIVERY-07、RESULT-02、RESULT-03、RESULT-05、RESULT-07、UI-06、UI-08`，只更新为 `COMPONENT_TESTED`。其余 110 项按原验证状态保守保留；源码统计仍为 **109 SOURCE_IMPLEMENTED / 1 NOT_IMPLEMENTED (OPS-05)**。组件通过不等于 Mac 真实 Chrome 双 Task/Product UI 全闭环。
- **安全缺陷修复**：活动 Executor 无故重复配对被拒绝；Claim 允许且固定校验 Task version；原 Result 的 status-only 与 full 同意权限分离；原本已批准 full 的持久发送意图在撤权后不得自动降级上传；HTTP full receipt 接受可选正文/错误字段，不弱化 RunRef/revision 绑定；Side Panel 旧静态断言与实际正式 Cloud Tab 保持一致。
- **原生与公网仍受阻**：真实 Chrome Task A/B 独立 Worker/RunId/ResultId/sourceHash/released/ReceiptId、授权代际与网页副作用、五档宽度 × 两种 Zoom × 键盘截图均无可核查原始记录，保持 `NATIVE_PENDING`；未获用户批准的公网 Provider 继续 `REMOTE_NATIVE_PENDING`；15 项 DESIGN/IMPLEMENTATION/VERIFICATION 正式分数保留 `NOT_VERIFIED`，不可打 95+。

