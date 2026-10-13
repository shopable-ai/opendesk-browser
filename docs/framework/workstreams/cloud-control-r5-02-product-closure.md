# Cloud Control R5.2 · AI-First 产品闭环、任务归属与原生证据

日期：2026-10-13。仓库 `shopable-ai/opendesk-browser`，唯一写入分支 `main`。
**此文件是事实工作流/安全合同，不是宣布产品已经原生 95+ 验收。**

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
- **Job 不可变主体**：`targetExecutorId` + `targetPairingId` + TaskId/version/manifestHash/sourceHash + 校验后参数/目标 Origin。配对撤销或重配不能继承旧 Job。
- **请求幂等**：本机管理员请求按 Executor+pairingId+requestKey 分桶；HTTPS client 请求按 clientId+pairingId+requestKey 分桶。相同摘要复用原 JobId，变更参数或网站导致 `E_REQUEST_CONFLICT`；旧 `seed:requestKey` 保持历史不可重新指派。
- **旧 Job 迁移**：已分配 Job 保留原归属（找不到有效配对则不能继续执行），已完成 Run/Result/receipt 不重写；未分配、无归属老 Job 保留数据库但不得 claim。
- **Provider permit**：仍经原 /v1/claim → /v1/admission → 原 Task Resolver/Authority/RunHost/Worker。Admission 带明确 `resultAllowed`，Provider 禁止用无授权的 `full` receipt。
- **结果与状态**：`status-only` 只允许 `visibility`, `state`, `retirementState` 三字段，且有原终态 durable Result 与已释放 Run；`full` 必须有该项 Task 明确 resultAllowed 且固定 RunRef 一致。外部调用客户端默认只收到 JobId，不直接获得网页内容或历史 Result。
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
