历史材料：本文件记录较早 Sidebar 候选的交接情况。当前实施以网页版已提交并整合到 main 的工作台与任务包方案为准；本文件不作为当前实施指令或最新验收结论。

# 框架任务与当前进度

更新：2026-10-08。本文记录当前背景与进度，不修改旧冻结账本，不按测试数量计算完成比例。

## 产品目标与当前阶段

总体目标是迁移和升级 src-bex 的浏览器自动化核心，保留明确的 Page/Element/Keyboard、网页 SDK、公共服务与资源语义，修复目标绑定、异步回程、停止、持久结果及生命周期，使实际消费者可用。

当前集中解决 Sidebar Controller 入口。它是框架的一个实际消费者，不是全部框架。安装目录、fixture、调试 barrier、WXT 和 ZIP 是工程手段，不是产品功能目标。Controller、网页内用户脚本、Page SDK 保持独立身份和运行语义。

## 整体任务

| 功能任务 | 已完成能力与证据 | 尚待完成或确认 |
|---|---|---|
| 操作明确网页 | ChromePage/context/driver 已接通；真 Side Panel 的 title/url/waitForSelector/type/click/snapshot 已操作 A，同 URL 的 B 不变 | evaluate/goto 有较早候选原生证据；其他 Page/Element/Keyboard 方法不能由这些案例推导全覆盖，按实际消费者处理缺口 |
| 保存与找回程序 | 复用 IndexedDB scriptHeads/scriptRevisions；不可变 revision/hash；参数与源码分开；已有脚本发现列表；Save 不运行；重开 Load 有较早候选证据 | 找回、历史版本加载、删除与结果下载尚未作为完整用户流程收尾 |
| 执行控制程序 | 既有 RunHost/Controller Authority/Worker 接通；Page/服务 facade 注入；真实 r1 在途 Save r2 后仍使用 r1 与原参数，下一次才运行 r2 | 按真实消费者修剩余缺口；这一条通过不代表所有旧框架功能完成 |
| 精确目标与权限 | 真 Side Panel 窗口识别；Current Page B/Running Target A；加载和导航开始不可运行；原生目标复验与准入事件栅栏已有 | 窄准入竞态等证据未全部收尾；长调试暂停样本无效；resolving 丢失 tabId 可能漏事件，仅静态提示，尚未确认用户故障 |
| 结果与生命周期 | durable run/result/sourceHash 已证明；throw、Stop、真侧栏关闭后 terminal/workerRetired/released/slot available 有较早候选原生证据 | 将运行、停止、关闭、重开、取回与下载连成当前开发入口可复验的流程 |
| SDK 与公共服务 | 独立 SDK 安装/授权链已有；明确授权 SDK、HTTP 和 AppStorage/AppLocal/storage 短调用有原生证据 | 当前入口的授权说明和限制收尾；整个服务/资源及旧 API 兼容范围不能由短调用推导完成 |
| 网页内用户脚本 | userScripts 页面计算机制已有；授权后 evaluate 真正修改 DOM 有证据 | 通用安装、启停、匹配、注入时机、每文档实例及卸载闭环未完成；保留框架待办，不混为 Worker Controller，不扩展成本轮完整油猴管理器 |
| 开发使用与后续交付 | MV3/WXT 构建和定向检查已有；生产目录曾在 CFT 138 真 Side Panel 使用；已有 ZIP 保留 | 下一轮从 dist/development 目录继续；发布包、全框架正式账本与独立最终验收属于后续阶段，未完成 |

## 下一步

1. 从开发插件目录建立稳定现场，保留同一受控 profile；检查现有修改，不重复实施已有能力。
2. 优先收尾程序找回/Load、持久结果读取/下载、Stop 与关闭恢复。发现真实用户缺口就修对应 owner。
3. 核实导航 candidate 与准入是否真的漏事件；仅在复现后最小修复现有 current-page-target/controller-methods。
4. 收尾 evaluate/goto、SDK/服务的正向能力、授权说明和限制。
5. 按实际消费者保留其他旧 API、资源及网页内用户脚本待办；不把 Sidebar 通过当成全框架完成，不重新做无差别迁移审计。

验证服务实现：无变更不重复构建；改哪个 owner 就验证受影响行为，稳定后一次必要集中检查。当前不以生产 ZIP 验收作为功能完成前置条件。不扩展采集/模板/分页、语音、可视化任务树、Native Messaging 或云端调度。

## 证据与交接

- 串行释放及候选背景：`docs/framework/evidence/sidebar-native-20261008-01a119ff/release.json`、`candidate.json`。
- 最近生产候选原生事实：同目录 `delivered-install/`。Demo A/B、r1/r2、Current B/Running A、导航不可用已有证据，S1–S7 全项未同一候选收尾，总体 PARTIAL。
- 较早候选的关闭、下载、计算、导航和服务证据：同目录 `final-install/` 及更早记录，只按原候选身份引用。
- 新鲜定向检查/构建日志：同目录 `validation/`；npm test 仅覆盖 environment。
- 静态未确认提示：同目录 `handoff-review.json`。

本轮无 commit/push/新建分支；受控浏览器、临时 profile、fixture、调试和只读助手已停止，writer 已释放。新 profile 不含旧 IndexedDB，旧 runId 只能按证据引用，不能假设可在新 profile 直接回查。
