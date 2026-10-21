# Dynamic App Runtime R1.4-LOCAL：真实运行记录

2026-10-22（Asia/Shanghai）；记录中的 ISO 时间使用 UTC。开发者现在可通过既有扩展中心导入带后台入口的 v2 应用，完成安装审阅、打开 UI、创建已确认的计划，关闭 Side Panel 后由 Chrome 自然到期调度隔离计算，再打开 UI 读取自己的结果。两个冻结后新应用已经在 Mac Chrome for Testing 156.0.8078.4 完成这条链路。**核心原生链已通过，R1.4 全部完成条件和六维 ≥95 尚未通过；不得将本记录作为正式发布批准。**

## 候选与来源

- 早期 B0：源码基线 `ef90fed0651e4f6f869faf71832f61265cf7de58`，冻结于 `2026-10-21T20:55:28.612Z`，106 文件。冻结后创建的 A/B、原生执行与生命周期证据保留；后续发现读取错误处理缺陷，B0 不再代表最终修复候选。
- B1：冻结于 `2026-10-21T21:59:43.735Z`，106 文件；包指纹 `75a09600c6aac985a8bdc7cd6f8f1126ee689a72b6f0429f5acaf64ba31fe93b`。所有冻结文件逐项 SHA-256 比较通过。
- B1 源码明确为**只读整合候选**：main 基线 `cf07b8765bc4aa056e308590288d07109b463e5e`，合入 `origin/main` `0f41698e7b957a7ffcc1467a84403333a3e87151` 的 tree `af4dda951ef2e4c70b76f062164eb3025bdedbde`，另含保留并行变更的 workflow-view 候选，SHA-256 `bea10d05bfa94275f4b670254e09233a8c523fb012d69fdadf89a7eef8488dc6`。
- 冻结时存在并行文件归属阻塞；其 owner 后续自行提交并完成常规 main 整合（`d9e5e5099`）。本轮没有替换或暂存他人的脏文件。最终核对 35 个相关 Runtime/SDK/Host/Scheduler/Sandbox 源文件与 B1 逐字节一致，workflow 文件也与已记录候选一致。B1 仍按冻结时的实际合成来源记录，不把后续无关 Native/UI 变更冒充同一构建；不因无关 main 更新重复构建。
- 实际 Extension ID：`nbalfekfkclmpomcldilmboamneidbpo`。使用本轮独立临时 Profile，Browser 重启前后 ID、Profile 一致；未修改日常 Chrome、`dist/development` 或其他会话 watcher。早期三套自有测试浏览器已核实 PID、Profile、加载目录后关闭；最终 B1 测试浏览器保留供查看。
- 构建、冻结目录与原始证据：仓库下 `artifacts/dynamic-app-r14-local/`，属于本机忽略产物。完整 B1 哈希与核心证据摘要见 [b1-summary.json](../../framework/evidence/dynamic-app-r14-local/b1-summary.json)。原始截图、Run/Result/Journal 和命令日志保留在上述目录，不把临时 Profile 当成交付安装包。

## 冻结后双应用

两者均在 `2026-10-21T21:59:43.774Z` 生成新随机 ID、源码 nonce、项目和安装包；逐文件扫描确认 ID 不存在于 B1。算法的期望结果使用独立实现计算并在安装/调度前绑定。

| 应用 | 正常链结果 | 正常链 RunId |
| --- | --- | --- |
| `app-primes-d50c3c971ed4` | 10000 内素数 1229 个，和 5736396，末项 9973 | `0e9492e9-e76c-45c8-b7a6-7047526006eb` |
| `app-words-648ac9d668db` | 144 词、13 个不同词，checksum `c2e63202`，完整词频与独立期望一致 | `f42b3965-5272-4bf6-8643-4f67e008835c` |

正式安装包和源码在各自 `examples/sidebar-tools/<id>/`。A 的首轮正常链使用 1.0.0，随后真实升级为 1.1.0；B 首轮为 1.0.0。截图复核后仅修正文案并把结果移到计划前方，最终交付 A 1.2.0、B 1.1.0，后台算法未因此改变。历史候选和各版本证据分别保留，不将旧 Package Hash 冒充新包。Package Hash、Code Hash、Generation、FireId、ResultId 均见摘要，不以版本号代替身份。

安装、计划审阅、文件选择及 UI SDK 按钮使用原生输入；未用 JS 调用产品写入 RPC、直接回调或伪造结果替代核心链。关闭真实 SIDE_PANEL 与管理 TAB 后等待自然到期，Cloud disabled、无 HTTP(S) 页、无 scheduledRunner 专用 TAB。重新打开实际 Side Panel 后从 UI 读回，另以只读 IndexedDB 关联本次 scheduleRef → Fire → completed Run → successful Result → durable SDK journal，并确认 Worker 退役。A 首次严格读回的测试断言曾误解 journal 格式，修正驱动后针对同一既有 Run 复核，没有重放计划。

Chrome 原生 Alarm 的实际创建、时间、自然到期及执行链均有证据。专用 `onAlarm` 与启动/定期 reconcile 共用到期恢复逻辑；现有持久记录不区分这两种触发来源，不能将观察结果扩大成“每次均由某一专用 handler 唯一触发”的证明。

最终 A 1.2.0 已重新通过严格普通链，Run `8918f722-b3c5-4914-aeb5-2e4d8e327c11`；最终 B 1.1.0 在明确新建的计划中成功，Run `c06a9aa2-ae24-4d78-82c1-f1c1a732f005`。两者均在 B 的先前未知结果之后运行；不是重放未知请求，也没有把旧 journal 改记成功。原故障 Run 最终为 failed/E_OUTCOME_UNKNOWN，Worker 已退役且槽已 released，原 SDK 操作仍为 effect_unknown；后续明确新建的不同计划可正常执行。最终包身份与对应 Run 见摘要 `finalApplications`。

## Gate 状态

| Gate | 状态 | 证据／边界 |
| --- | --- | --- |
| 0 本地基线与入口 | PASS | main 与远端已由原 owner 安全整合；本轮相关35源文件和 workflow 与 B1 一致，CFT/加载路径/ID已核对 |
| 1 真实机制 | PASS | 原产品 RunHost / Sandbox Worker 运行，实际 Chrome Alarm 与共享 Offscreen；临时 MV3 诊断仅作早期机制补证 |
| 2 单应用闭环 | PASS | 正式 UI 导入、审阅、调度、关闭、SDK owned storage、重开读回 |
| 3 冻结后双新应用 | PASS | 真实双应用与最终包普通运行、106文件哈希一致；冻结合成来源及后续主线映射明确，不冒称最终HEAD全量构建 |
| 4 隔离、生命周期、回归 | NOT_VERIFIED | 已有原生通过子集；未测项见下表，不冒称完整矩阵通过 |
| 5 收尾、解耦、发布政策 | NOT_VERIFIED | 残留清单与政策核对已完成；95+、解耦迁移及商店审核未完成，推送以最终 Git 核对为准 |

## 实现与安全边界

仍使用原 SW、共享 Offscreen、`createRunHost`、Sandbox Controller/Worker、Browser Registry/Host、Installer、Authority、Scheduler、Run/Result/Journal、Stop/Settlement 和单执行槽。没有新建第二套 App Host、SDK、调度器或执行平台。

`app-service` 是原 RunHost 的明确无网页上下文，不构造假 Tab/Document/Page；旧 Controller/Page 身份要求和 Task v1 service 禁令继续保留。v2 的可选 `background.kind=opendesk.app-service.v1`、独立 JS 和 SHA 沿用原打包、序列化及大小限制；旧包保持兼容。原 Installer 绑定包、代码、安装代次和来源，每次 SDK 实际效果前由可信 Host 重新检查安装、启停、代次、Run 状态及权限。Worker 不能选择 owner、namespace 或运行身份。

后台仅开放既有 `browser.storage.local.get/set/getQuota`、`browser.capabilities.list/getStatus`。UI 使用原 `OpenDeskTool.request`，计划仍通过原 Scheduler 审阅。`local-reviewed` 是本地明确审阅语义；SHA 不是发布者签名，不能当成发行者认证。

源码在原 opaque Sandbox 创建的 Blob Worker 执行，未进入 SW、Offscreen 顶层或可信 React UI。A/B 实测 origin 为 null、无直接 Chrome runtime，七个身份字段覆盖、跨 owner 写入与非法存储 key 被拒绝，网页能力不可用。fetch、importScripts、动态 import、WebSocket 均有 Worker 实际 CSP 违规事件，对应 connect-src/script-src；并非仅凭 `.invalid` 网络错误判安全。

修复了一项实际缺陷：未派发效果的 SDK 读取超限被误记为未知副作用。现在保存确定错误回执，应用捕获 `E_LIMIT` 后可继续 SDK 写入并成功完成；实际派发写入后的未知结果仍保持对账、撤权和禁止盲重放。B1 两个新应用均原生执行了该回归场景。

## 生命周期与异常证据

以下状态将随本轮最后的原生步骤补齐；未执行项目保持 NOT_TESTED，不将 B0 结果自动提升为 B1 PASS。

| 行为 | B1 状态与证据 |
| --- | --- |
| 运行中停用、恢复 | PASS；`disable-active-1792620465985/proof.json`，旧 Worker stopped/E_TOOL_CHANGED；可信 UI 恢复后新计划绑定新代次 |
| 运行中升级 | PASS；`upgrade-active-1792620626998/proof.json`，旧 Worker 无延迟写入；1.1.0 后续同到期运行成功 |
| SW 停止、双 App 同到期 | PASS；`lifecycle/b1-post-sw-proof.json`；实际 stopWorker 后 detach，自然到期，两者均完成、身份匹配、UI 读回正确 |
| 完整 Browser 重启 | PASS；`lifecycle/b1-browser-restart-proof.json`，PID 47049 → 53719，同 Profile/ID，预建计划完成 |
| 共享 Offscreen 释放 | PASS（已观察范围）；Cloud disabled 下应用正常使用；重启实验读回时实际 contexts 无 OFFSCREEN_DOCUMENT。Cloud 正运行中切换关闭、跨 Cloud Provider 并发未测 |
| Worker 超时及排队 | PASS；`lifecycle/b1-timeout-queue/proof.json`，A E_TIMEOUT/stopped/retired 后 B 完成 |
| 运行中卸载 A、B 继续运行 | PASS；`uninstall-active-1792621507956/proof.json` 及 `lifecycle/b1-after-uninstall-proof.json`，A 安装和 owned storage 清理，B 后续 Alarm 成功 |
| 写成功、回执丢失后对账 | B1 FAULT_SCENARIO_OBSERVED；`fault-b1-ack-lost/report.json`，实际 native set 成功后丢失回执，原对账完成；临时注入已恢复 |
| 写成功、回执与读回都丢失 | B1 FAULT_SCENARIO_OBSERVED；`fault-b1-unknown/report.json`，native commit 1 次，记录未知结果，不自动重放，临时注入已恢复 |
| 伪造 SDK/Sender | B1 源码自身七字段和跨应用探针 PASS；B0 有 24 项真实拒绝；所有私有 Port、旧 document epoch 及不同市场发布者完整原生矩阵 NOT_TESTED |
| 有界队列超额、长期公平性 | 单槽双应用和超时排队 PASS；超额及长期饥饿场景 NOT_TESTED |
| 原 Controller/Page/Cloud/官方应用 | 受影响权限与边界定向 Node 测试通过；同 B1 完整原生回归矩阵 NOT_TESTED |

30 秒执行期限、原存储/响应预算继续生效。无 OS 级 Worker 强制内存隔离、任意副作用 exactly-once、精确秒级 Alarm、浏览器关闭后继续执行或商店审核承诺。临时故障注入明确与普通无 debugger 的正常链分开，恢复后才离开场景。

## 验证与交付边界

- 定向测试：Controller 权限 135 项、app-service Host/context 19 项、包合同 17 项通过；早期相关 Scheduler、Cloud/SDK、CSP 来源门禁证据保留，不声称全仓 CI 全通过。
- 正式 production 构建通过，原 opaque Worker 动态执行位置受既有静态验证约束；特权页面 CSP 没有放宽。
- 原生驱动：[tests/native/dynamic-app-r14.mjs](../../../tests/native/dynamic-app-r14.mjs)、helper 与 README。精确 Alarm、成功终态、身份、完整 payload、CSP 事件及 journal 均有断言。两次独立审查发现并纠正旧驱动假 PASS 风险，后续审查确认四项修复。
- 只提交本轮文件与两份正式包；工作区其他会话的书签、Native、开发/工作流 UI、构建证据等改动保留。main 远端整合已由原 owner 完成；本轮产品、示例包和精简证据已本地提交，普通推送及远端 SHA 以最终 Git 核对为准。

## G-DECOUPLING：仍未完成

| 应用 | 应用私有业务 | 应留可信通用 Driver | SDK 可复用及缺口 | 残留与迁移要求 |
| --- | --- | --- | --- | --- |
| Stay Focus | 额度、白名单、专注会话、提醒和拦截原因 | 站点预算、DNR 写入/回读、前台观测 | 已有 siteBudget；具体后台事件、规则作用域须按既有 Authority 审批，不假设 App 后台首版已开放 | SW 静态 service、安装 stop/cleanup、Host 分流仍在；先迁业务/模型，保持独立 Driver 授权与规则归属 |
| AdBlock | 订阅、过滤语法/编译、计数和产品偏好 | managed content blocking、DNR、能力审阅 | 已有受管策略能力；订阅更新/网络与 DNR 生命周期仍需明确最小授权，不授予任意规则代理 | SW 静态 service、专用 Host、安装清理和 Content 仍耦合；固定原策略来源及范围做定向迁移 |
| AI VIP Share | 站点方案、账号/共享会话、登录态业务 | Cookie/网络/Native 等受控特权 Driver | 已有 Cookie/网络基础；敏感凭据及站点工作流不能由本轮 storage-only 后台自动获得 | SW 静态 service、专用 Host/Content、清理逻辑仍耦合；需独立数据与权限合同，不能直接移进无审计动态 Worker |

本轮只记录残留，没有宣称三项正式迁移完成；完整本机源码线索在 `artifacts/dynamic-app-r14-local/decoupling-review.md`，开始于较早基线，后续修改需重新核查行号。

## MV3 与 Chrome Web Store

已重新核对 [Offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen)、[Alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)、[CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)、[商店政策](https://developer.chrome.com/docs/webstore/program-policies/policies) 和 [MV3 附加要求](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)。单 Profile 仅一个 Offscreen，使用打包静态 HTML；应用代码保持在隔绝扩展 API 的 Sandbox。Chrome 150+ 的 Alarm 跨会话属性不免除本系统持久计划启动对账。

隔离上下文中的远程逻辑例外仍要求功能可审查和数据政策合规。该文档不是对本产品动态应用及 SDK 桥接范围的商店认可；尚未提交商店，也没有审核结论：`RELEASE_POLICY_NOT_VERIFIED`。

## 独立六维阶段评分

| 维度 | 分数 | ≥95 |
| --- | ---: | --- |
| 真实 Chrome 可行性 | 93 | 否 |
| Runtime 架构唯一性与精简性 | 88 | 否 |
| SDK 身份、权限与安全隔离 | 92 | 否 |
| 生命周期与运行可靠性 | 89 | 否 |
| 编译后双应用独立性 | 93 | 否 |
| MV3 与发布合规 | 78 | 否 |

| 维度 | 真实证据 | 风险与未测 | 最小下一步 |
| --- | --- | --- | --- |
| Chrome | B1 双应用、SW 停止与完整浏览器重启 | 专用 Alarm handler 与 reconcile 来源不可区分；原能力全原生回归未测 | 补触发来源证据和受影响原生回归，保持无 debugger 普通链 |
| Runtime | 原 RunHost、五方法 SDK Host、Scheduler、单槽复用 | Cloud/App 并发共享资源、跨存储中间态完整矩阵未测 | 使用既有资源管理验证两个消费者及释放，不建立新 Host |
| SDK | owned storage、七字段拒绝、代次停用/升级栅栏、实际 CSP | 私有 Port、旧 document epoch、不同市场发布者完整原生攻击未测 | 用真实通道补负向身份用例，保留本地审阅与发布者身份的区别 |
| 生命周期 | 运行中停用/升级、SW/Browser 重启、timeout 后 queued B | 超额队列、长时公平性、未知结果人工恢复及旧代次延迟回执未全测 | 完成当前候选异常回执与恢复，再做原有限额下的有界场景 |
| 双应用独立性 | 冻结后39ms开始生成随机双 ID/代码，106文件哈希一致 | 冻结时曾待整合，后续已由 owner 合入；仍需保留候选与后续无关 main 变更的区别 | 保持已核对的35文件及完整哈希映射，补齐余下正式验收 |
| MV3/发布 | 官方文档、实际 opaque Worker 与 CSP，特权 CSP 未放宽 | 商店可审查性和 SDK 桥接政策未获得审核确认 | 准备固定候选的政策审查材料；不自动发布 |

评分是独立子审查的阶段结论；评审时的主线整合阻塞随后已解除，新增重启、超时和最终包证据不自动上调分数。逐维实证、风险、未测和最小动作保留在 `artifacts/dynamic-app-r14-local/expert-six-dimensions.md`。main 已安全整合，普通推送按用户授权完成；最小剩余顺序是补齐当前候选身份/队列及原生回归门槛，再完成固定候选发布政策审查。G-DYNAMIC 全条件验收、G-DECOUPLING 和商店合规分别判断，均不能因两个算法成功就一并标完成。
