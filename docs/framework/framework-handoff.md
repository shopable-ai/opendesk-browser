# OpenDesk Browser 通用框架迁移 Goal：F1 暂停交接

本任务创建了新的 native Goal，完成只读交接、同 hash 独立 Critic 终审、来源/API 证据冻结和一次真实 Chrome EX08 原型。根据用户的条件停止指令及独立原型终审，当前在 F1 暂停。F2/F3 没有启动，框架功能迁移没有完成。此文档及 framework-handoff.json 不是完成证书。

Round3 设计 manifest SHA256 为 `acca60edf9031aafb4ecb740f5f0f33777a3694d23499f28ce37af63b38f592f`。有效独立 Architect APPROVE 97 与本次独立 Critic APPROVE 98 均绑定该 hash。仅本开发任务的 execution-gates.json 记录 designApproved、boundedPrototypeResearchAllowed 为 true；旧审计 approval 及旧 paused Goal 未修改或恢复。

原型候选 SHA256 为 `5cab9686da1ab1fbea307650bb419d7481e21d3292327d9d77b198e43826c815`，8 个实际文件经过独立 hash/bytes 复核。Chrome for Testing 149.0.7827.55 实测结果：opaque sandbox、固定包内正对照和 classic Blob 的固定握手/RPC 取得证据；sandbox 包内 classic/module 构造均抛出 SecurityError；module Blob 在握手前报错。classic Blob 取得局部可行性证据，不能据其他三分支失败断言整个后端不可行。

独立原型终审为 PARTIAL_PROOF。Worker 有效 CSP 与网络拒绝归因、敌对通道/重放/global patch、用户 async-body 与 await 语义、完整终止及资源基线、userScripts 精确文档/开关/结果和最低/稳定版矩阵尚未证明。必需前提缺失触发本 Goal 的暂停条件；失败变体停止，完整 F1 门保持关闭。本任务没有制造替代后端、放宽 sandbox、进行特权 eval/new Function 或推进产品代码。

backendPrototypePassed、fullImplementationReleased、frameworkFunctionalMigrationComplete 均为 false。真实工作台 r1/r2、pin/tombstone、typed durable return/throw、关闭重开 fence、无采集导航输入点击读取、实际下载终态与文件 hash，以及全部 F3 必选用例均未执行。截图显示原型报告，不是产品工作台完成证据。

72 个来源实际 row、48 个 API 实际 item 和 observation 的 160 个实际对象/4 个额外消费者均已读取。保留历史 153 same / 7 drift 与 4 extra 的区别；只复核 7 漂移加 4 extra，附加非原子 generation `handoff-freshness-2026-10-02-01`：6 个新漂移、5 个一致，不重审其余 153 个当前来源。R1–R8 和历史 17 个失败已逐条映射未来任务，关闭数为 0，未复跑或跳过。

新增文件限于 docs/framework 与 tests/prototypes/execution。37 个产品/构建/依赖文件与原型前 hash 一致，无新依赖、无发布、无采集/优化/验收启动。隔离 Chrome context、HTTP server 已关闭，独立评审子代理已关闭。源、旧审计和旧实施任务保持只读。

模型请求与本地 turn_context 对应 openai/gpt-6.1-sol、xhigh；原生子代理使用 default 加完整已安装角色提示及 gpt-6.1-sol、xhigh。没有修改全局模型配置；无法独立核实服务端 resolved runtime。

证据入口：execution-gates.json、framework-handoff.json、prototypes/ex08/independent-review.json、prototypes/ex08/report.json、prototypes/ex08/reproduction.md、source-compatibility-ledger.json、historical-failure-mapping.json。暂停后不自动继续当前分支、扩大研究或启动下游工作。
