# Cloud Control R1.1 执行控制合同 v0.2

云端只投递固定 Task 描述、规范化参数及已批准网站的 owned 目标。Browser Controller 通过原 Authority、runs/@slot、RunHost、Worker、Result、commandJournal 执行。草稿、USER_SCRIPT、Desktop Flow、远端源码、Shell、路径和 CDP 命令均不属于本协议。

请求身份为 providerId / executorId / assignmentId；本地 requestId=cloud:<assignmentId>，不包含 Host 注册或连接代次。领取前持久 claimId；请求内容摘要冻结固定版本、manifestHash/sourceHash、参数与目标。同键异内容冲突；空领取也缓存；租约到期不重新分配可能执行过的任务。

两阶段准入：可信可见 Host 准备 → 原 IDB 事务复核安装身份/授权代次/源码/参数，创建原 Run、占原槽并写云请求绑定 → 提供者持久登记同一 runRef → 签发 permit → 本地事务保存且重验 permit 与 Grant → 原目标创建/Worker 派发。任何准入提交失败均不能创建目标；无 Host 在提供者队列等待。

许可包含 providerId、assignmentId、permitId、runRef、leaseUntil。连接只通知；认证前不领取。原 Authority 每次实际 dispatch 复核安装授权、托管许可/租约及网站权限。停止托管持久禁用后建立运行取消栅栏，不假报资源已释放。

原 Result 终态与原退休证明独立。回执只由 Authority 对原 Result 投影，校验自身 revision/sourceHash、runId/resultId；退休 released 后上传。上传失败重读并补传原结果，不重新执行。撤回结果/安装/网站授权后不发送敏感值。重新启动原 Authority 保守暂停非终态，云请求标 OUTCOME_UNKNOWN；旧 owner/许可/回执不恢复执行权。

开发提供者仅绑定 127.0.0.1:43112；Browser 必须明确允许该固定 HTTP/WS 地址。其他提供者必须 HTTPS/WSS；长期凭据仅用于 HTTPS Authorization，短期一次票据在 WS 首帧认证，URL 不带凭据。配对与执行授权是两个独立动作。管理凭据与 Executor 凭据独立。

原始证据与四 Gate 见 docs/framework/workstreams/cloud-control-r1.md；组件或构建不代替真实 Chrome Gate。
