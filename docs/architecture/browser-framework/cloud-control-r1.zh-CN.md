# Browser Cloud Control R1 — 浏览器端接入基线与实施状态

> 归档：2026-10-11。状态：**DESIGN_BASELINE / CLOUD_CONTROL_NOT_IMPLEMENTED**。本文件只拥有 Browser 端实施与证据边界，**不拥有多端统一协议和 Desktop/Mobile 总体架构**。  
> **必读上位总纲（OpenDesk 主仓库）**：[Execution Control R0.2 — Browser / Desktop / Mobile](https://github.com/shopable-ai/opendesk/blob/master/docs/architecture/execution-control-r02.zh-CN.md)。  
> **唯一跨端 HTML 原型**：[多端静态原型](https://github.com/shopable-ai/opendesk/blob/master/apps/opendesk/prototypes/cloud-control/index.html)；原型只有模拟界面，不执行任何服务器连接或业务动作。  
> 早前 R0.2 GOAL 和 Cloud Control R1 GOAL 多为对话中的目标方案；本文件写入仓库也**不能**被宣称云控源码已接线、Node 提供者已运行、构建或 Chrome 验收已通过。

## 1. 先确认平台范围，避免再次错误执行

- **Cloud Control 总体方案**横跨 Browser、Desktop、Mobile：共同的是配对、受限任务来源、请求/尝试身份、租约、取消、结果回执和对账。
- **Browser Cloud R1**只是第一个 Executor 适配。它**只能**运行已安装且已授权的 Browser Task v1（`opendesk.task-package.v1`），共享原 Authority/RunHost/Worker/ChromePage、Run/Result、commandJournal、IDB 和原单槽。
- Desktop 云适配由 `shopable-ai/opendesk` 的 Execution/Recipe/Flow/Runtime owner 单独实现；不复制 Browser Task v1 或 runId 语义。
- Mobile 是 Android/iOS 等手机 App 的预留第一类执行端；没有真机运行器/系统授权/后台生命周期证据前只能标记 PLANNED。
- 正式 Cool 后端、Desktop/Mobile 实施、多提供者、跨端 DAG、无人值守属于后续工作，不能混入 Browser R1 的必要闭环。

## 2. 现有源码事实（SOURCE_CONFIRMED ≠ 云控通过）

| 组件/位置 | 目前可复用的源码事实 |
| --- | --- |
| `src/platform/tasks/contract.js`、`service.js` | Task v1 固定包/参数校验、候选验证、安装授权、`resolveInstalledTask` 的安装身份与授权代次 |
| `src/platform/host/controller-methods.js` | 原 Host 复核、Controller Run IDB 事务准入、`runs/@slot` 占用、Target/Worker 副作用分发栅栏、结果结算与退休 |
| `src/platform/host/authority.js`、`broker.js`、`client.js` | 原 Authority、真实 Host sender、消息路由与 Host Client；不是云配对接口 |
| `src/run-host.js` | 原 Controller Worker 运行、结束、未知结果和资源结算 |
| `src/platform/storage/` | `frameworkKV`、`runs`、`results`、`commandJournal` 的持久数据结构与事务 |
| `src/sw.js` | MV3 Service Worker 和原 Broker 启动；不是已经具备云 WS owner |
| `src/ui/task-workbench.js`、`tool-shell.js`、`tool.html` | 「我的任务」本地运行与任务管理 UI；不是已交付云托管 UI |
| `examples/tasks/form-fill.v1.opendesk-task.json` / `demo-form.html` | 固定 Browser 真 Chrome 演示资产，禁止静默改动签名 Task/hash |

首次归档时当前 main 未发现正式 `src/cloud-control/`、`docs/contracts/execution-control/v0.2/`、`scripts/cloud-control/` 或完成的云控界面；实际开工必须重新核查 Git 最新 HEAD 和工作区，不能沿用此历史判断覆盖已有并行 Agent 新增内容。

## 3. 必须实施的功能树

- **连接与身份：待实现**
  - 用户在「我的任务」启用/停止托管，首次明确配对、批准固定 Task/目标/结果范围；高级设置选择默认或自定义提供者。
  - Browser 原生 WebSocket 通知/心跳、HTTPS 领取/许可/回执/对账；短期 WS 认证凭据，不把长期密钥放进 URL。
  - 稳定 `executorId`、单一已配对提供者和 SW 唯一连接 owner；重连/旧连接事件隔离；Chrome 138-compatible alarm 恢复。
- **持久请求与准入：待实现**
  - 远端只通知和提供固定受限 TaskRef，不接收/执行远程源码、draft、Shell、任意 CDP、远程安装。
  - `claimId` 重试幂等；请求键绑定可信 provider/pairing/requestId；参数用原 `validateTaskParams` 展开并以同一快照存储/摘要/执行。
  - 在原事务中完成请求关联、Host/Task 安装授权/源码复核、原 Run 创建、Revision pin 和原执行槽占用。
  - 网络事务外向提供者持久登记**同一个原 runId**、取得开始许可；许可之前不得调用 `createOwned` 或 Worker。
- **执行与安全：待实现**
  - 原 Authority 再次核验本机 Grant、安装代次、网站权限、目标、云租约/执行期限、取消栅栏。
  - 合法 Host 存活、目标唯一就绪才通过原 RunHost/Worker 执行；不创建隐藏 Host，不承诺 Side Panel 关闭后的无人值守。
  - 云任务与手动任务共用 `runs/@slot`；Result 终态不等于 Slot 可用，继续遵守原退休规则。
- **结果/恢复：待实现**
  - 经 Authority 受限投影授权字段，持久回执后服务端确认；撤权后旧缓存不得补传。
  - SW/提供者/Host 重启先对账再领取；Result 已在库里只补回报，`OUTCOME_UNKNOWN` 禁止自动重跑。
  - 取消、撤权、旧 assignment/epoch/WS 连接或回执不得恢复执行权。
- **提供者与验收：待实现**
  - `scripts/cloud-control/` 中最小持久 Node 回环测试提供者，使用同一公共合同；不将 Node/ws 打进普通 Browser 扩展。
  - 真实 Chrome 已安装授权的 `sample.form-fill@1.0.0`：provider → claim → 原 Run/permit → 原 Worker 页面填写提交 → Result/retirement → provider receipt。
  - 定向回归、真 IDB 提交/回滚与重启重读、构建体积/CSP、各类失败与过期许可验收。不能用 Mock 代替产品链。

## 4. 关键准入分段原则

当前 `controller-methods.js` 的 `prepareControllerRun` 在原 IDB 事务内完成绑定后，就会继续对 owned 目标调用 `createOwned`。因此云路径必须采用**原准入小范围分阶段接线**：

```text
真实 Host → 固定 Task 与授权验证 → 原 IDB 事务持久绑定请求与 Run/slot
→ HTTPS 提供者登记同一 runRef → 获得持久 startPermit
→ Authority 再次复核 → createOwned / Worker 执行
→ 原 Result/资源退休 → 经授权上传并持久确认 receipt
```

正常本地 `host.start` 不能回归；等待许可不能占用无限长 RPC 或靠悬空内存 Promise。网络请求不能放入 IDB 事务；许可响应丢失重取同一个 runRef，不创建第二个原 Run。

## 5. 最小 UI（**仅设计，没有接入**）

- 入口在 Side Panel「我的任务」，不新增独立云控工作台。
- 普通卡片：提供者身份、连接状态、启用/停止托管、已批准任务与范围、请求等待原因、当前 Run、Result/回执、取消处理中/未知状态。
- 高级设置：默认提供者（正式配置由发布版内置）或受控自定义基础 HTTPS 地址；固定回环开发例外、配对/解除配对、诊断。普通用户不需要分别填写 Socket URL、REST Path、心跳间隔和 token。
- 本地启用**不等于**自动批准扩权；正常重连不反复弹用户确认，扩大范围和换服务器需重批。
- 多端静态完整原型只放在上位 OpenDesk 主仓库，Browser 此处链接，不复制第二份维护。

## 6. 正式文档/合同及工作流未来落点

- 上位唯一总纲：`shopable-ai/opendesk/docs/architecture/execution-control-r02.zh-CN.md`（**已归档**）。
- 多端 HTML 原型：`shopable-ai/opendesk/apps/opendesk/prototypes/cloud-control/index.html`（**已归档，离线静态演示**）。
- Browser 接入说明：**本文件**。
- 公共 v0.2 JSON Schema / HTTP 描述 / 正负向向量：历史首期建议 `docs/contracts/execution-control/v0.2/`，**尚未创建为已发布正式合同**。开工时须先核查单一现存权威合同源，并决定跨仓库版本消费办法，禁止两个 repo 复制后各自演进。
- Browser 专属审计：建议 `docs/framework/workstreams/cloud-control-r1.md/json`，代码实施时生成真实状态/证据。
- 开发提供者说明：建议 `examples/cloud-control/README.zh-CN.md`，应在真实实现后与运行命令一起写入，不虚构不存在的启动参数。

## 7. 对下一次 Agent 的明确指令

1. 先读上位 R0.2 多端总纲与现有 Browser AGENTS.md、本文件；不得因为当前工作在 Browser repo 就“重新设计总体云控系统”。
2. 查真实源码和最新 Git 后才标识实施状态，设计归档或 HTML 原型不等于功能已完成。
3. 保留 Browser Task/Authority/RunHost，Desktop 用 OpenDesk 原 Runtime，Mobile 有自己的 OS 能力适配；三者只共享冻结协议语义。
4. 不要求普通用户安装 Desktop/Native/Node/AI 模型才能使用 Browser 托管。
5. 新增接口先检查路由、Schema、权限、事务、存储、SW 构建闭包；原实现没有证据时不得宣布能够“只填 Socket 地址直接连接并执行”。
6. 不把未测试项目报 PASS；每轮记录真实源码提交、构建包、runId/resultId、请求/回执链及阻断。
