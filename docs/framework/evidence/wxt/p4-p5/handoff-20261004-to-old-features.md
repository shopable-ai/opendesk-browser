# P4—P5 串行写权交接

交出聊天：`01a10590-e67c-7631-8254-0736c469d974`。接续聊天：`01a10654-4d29-7cc0-8cf3-e491cf07f9bf`。

已读取接续聊天中的人类执行指令和本次串行协调授权。停止新增产品写入、构建和测试；仅整理本交接与恢复索引。所有本聊天子代理均已关闭。受控浏览器测试均退出，profile 清理已记录；交接进程检查未发现本任务在途操作。唯一产品写权已释放给接续聊天登记，不再恢复本聊天旧 Goal。

当前产品输入 SHA：`a35612438d3362b2d6ffe5d363712b6c9245d44a0246d853b4cf6b8952faa71f`。
当前验证输入 SHA：`6462f703e8cabe8a2eac8bc385ad13b9434c1cb4e9b28c94c42ea4211cdc8576`。
生产包文件树 SHA：`99d6d07876c765701b4b2f4ee1470bc859588173151dc0f043f1bb9bdbafacbd`；开发包文件树 SHA：`ea1a596897d713aa861463938cb908f05ad1216695baef9069f6a60e8c51f676`。
生产 ZIP 字节 SHA：`abe7b4388c7407014c790f0e644eed32b3dc27ca81688d59f33e5e7e23bbdab4`；开发 ZIP 字节 SHA：`439f549fc5b432556e6fd8913377aed257b632c97a975769c745738ed0b3e323`。

当前验证输入 SHA 含尚未原生复验的 B05 测试修复；不能把较早验证输入的 PASS 自动绑定到它。完整实际输入清单及双包/ZIP 独立身份在本目录 `handoff-candidate-identity.json`。

## 已实现并验证的产品修复

- `src/platform/storage/repository.js`、`src/platform/host/controller-methods.js`：控制运行准入、script revision/hash 校验、run/lease/slot/pin 在原生同一事务中，删除或 hash 失配不违规准入。
- `src/platform/protocol.js`、`src/platform/host/sdk-broker.js`、`src/framework/sdk/transport.js`、`src/sw.js`、`src/agents/page-relay.js`：SDK 错误保留原调用 request/run/op/grant 引用；原 grant 匹配后只读查询，无二次准入和重放。
- `src/ui/tool.html` 与 editor：Cookie 只通过真实用户勾选请求权限。
- `src/platform/host/broker.js`、`src/sw.js`：SW 重启丢失内存 port 映射后，原生宿主 tab 消失事件仍查持久 host 和 `runtime.getContexts` 的精确文档不存在，回收该宿主运行。port 暂失但实际宿主仍存活时不伪造退役。
- 已知 userScripts 未启用的 lookup failure：只在无实际 effect 的精确错误类型上分类；通过真实 host retirement 释放 pin/slot，不伪造 Worker ACK。普通 dispatch 后拒绝仍保守记 effect_unknown。

组件总检查 413/413 通过；check、production/development 构建、打包、严格双包校验通过。日志：`host-recovery-all-components.log`、`host-recovery-check.log`、`host-recovery-build-*.log`、`host-recovery-pack-*.log`、`host-recovery-verify.log`。这些记录对应产品输入上述 SHA，不能代替原生验收。

## 最新实际原生结果

1. 控制 API 48/48 与双宿主竞争已在实际 Worker/目标文档通过：`docs/framework/evidence/f2-controller-product-native/native-2026-10-04T08-33-49.135Z-2b20d50d`。该轮同时保留撤权和无限 Worker 测试断言错误，不能标整轮 PASS。
2. 后续定向控制轮 6 PASS、0 FAIL、21 NOT_TESTED：`docs/framework/evidence/f2-controller-product-native/native-2026-10-04T08-56-54.232Z-6d76e22b`。撤权 pending fence、无限 Worker stop/deadline/host-close 已观察物理退役、CPU 停止、pin/slot 释放；借用目标保留。完整 27 项最终候选轮仍未执行。
3. 独立网页 SDK 整轮 **17 PASS、0 FAIL、0 NOT_TESTED**：`docs/framework/evidence/f2-sdk-native/native-2026-10-04T09-23-54.100Z-a9793184`。18 方法实际调用、真实 sender/grant、MAIN/ISOLATED、100 Promise、去重/冲突、撤权/导航/重注入、实际同 profile 整浏览器重启后持久保留/会话消失通过。该轮验证输入 SHA 为 `992d3ccc8f8dc0f3d5039d58e986de6b57c86b87d2f1a7219c66a3dee242f4ee`。同名旧 facade 及旧四公共服务仍需接续聊天按旧功能另行核对，勿把这里 18 方法的 PASS 解释为所有旧接口兼容。
4. 原生 IDB migration 组件（HTTP 加载实际产品模块，非可信 sender 扩展端到端）升级、abort、blocked、同 profile 重开通过：`docs/framework/evidence/k2-storage/k2-idb-2026-10-04T09-34-07-191Z-09c23da4/report.json`。cleanup 全部通过。
5. B05 首次定向原生轮 **3 PASS、7 FAIL、8 NOT_TESTED**：`b05-native-diagnostic-20261004-0935/report.json`。100 次真实 relay sendMessage 共一 admission/effect，以及 conflict 原生通过。四崩溃点未通过，必须保留全部 raw CDP/HTTP/IDB。诊断后本聊天仅修测试观察器，尚未复验。

## 尚未复验的测试改动与明确下一步

`tests/framework/b05-product-acceptance-20261003.mjs` 当前未复验的补丁：

- 100 并发显式断言 admissions=1、controllerRuns=0；conflict 要求其前置 case PASS。
- stopWorker 保留缺失 Target.targetDestroyed 为 null；依靠 stop 请求后同一原生 version/scriptURL 的 stopped 事件和精确旧 target 消失共同证明物理终止，关闭旧 CDP client 后才真实 Hello/reconnect。没有合成销毁事件。需原生复验。
- CP3 的 pageReplay 在原请求仍有效时实际执行并留存，避免后续公共引用检查因 30 秒 deadline 已过而假失败。

**未修改、未完成**：

- CP1 selector 当前仍选择 CallExpression 起点 217019，CDP 不提供该精确位置，故 NOT_TESTED。只读审查确认冻结 CP1 合同没有要求这一语法位置；可改为唯一同一 runs.put AST 的 callee.property `put`（当前 217021），要求原生 breakpoint type=call 且不允许 relocation。不得硬编码 offset/随便选邻近位置。原 tx workDone=false、ended=false、实际 pending IDBRequest 与完整原子回滚检查应保持。审查正文见 `handoff-cp1-review.txt`。
- F2-K2-SDK-018 的恢复期 KV tracer 当前在 replacement Hello 之后才安装，有观察空窗。应在停止旧 SW 前启用 `Target.setAutoAttach(waitForDebuggerOnStart:true,flatten:true)`，仅筛选 service_worker；在新 SW 执行前安装精确 native KV 观察点，再 Runtime.runIfWaitingForDebugger，并保留原请求/结果身份。启动观察器方案见 `handoff-b05-recovery-review.txt`。必须留真实 CDP 原始证据，不改产品逻辑以替代观察。
- 撤权后的旧 request 重试若原 deadline 已过，正确 E_DEADLINE 不能解释为 E_GRANT_REVOKED 失败；需在真实有效时间窗内快速原生重授权或明确记录 missed window，不修改既有 request deadline。
- 四服务 log/getTime/bexUrl/requestResource 及必要资源没有在本聊天实施。按接续人类指令优先补齐，再旧普通 JS/独立 SDK/原合同同包 F3。

原生测试全部串行，用全局不可变受控 launcher；不能启动个人 Chrome、绕过 CSP、抢其他窗口或广泛 kill。新源码变更后重建实际包，刷新 checkpoint/preflight；测试输入变更也刷新 verification SHA。不要复用旧 preflight receipt 去启动新身份。

## 历史原始失败与边界

- `p4-native-slot-leak-diagnostic.json`、`p4-slot-leak-native-idb.json`：历史 full 控制轮真实 slot/pin 泄漏；产品已补精确宿主消失回收，后续无限 Worker host-close 原生通过。原始证据未删除。
- `p4-native-core-diagnostic.json`：撤权 origin 错写带端口，以及 infinite source 从每字符 HTTP 事件读取不完整 JSON。两者测试原因已修，后续定向原生通过。
- `docs/framework/evidence/f2-sdk-native/native-2026-10-04T09-07-10.495Z-d3734cc5`：15 PASS/2 FAIL。测试错误把 APPSTORAGE 缺失值断言 undefined，冻结合同实际 null；另一重启选择等待超时。已修 null 断言，后续 SDK 17/17 全通过。失败目录保留。
- B05 原始文件由 OS temp 原样复制到本目录 diagnostic，profile/PID 终止和 serverClosed 均为 true；未删除历史结果。
- P1—P3 accepted ZIP 保持不变；原 603+19、完整 P4/P5、最终 F3 没有关闭；P6/P7 未执行。未初始化 Git、提交、推送或部署。

进程与清理证据：`handoff-process-check.json`，SDK 两个实际 browser PID 3142/13702、IDB 16336/16646、B05 18690 均已退出；本任务无受控浏览器或测试在途。后续只有接续聊天登记为唯一 writer 后执行。
