# K2 page-port 传输与 R8 命名空间执行证据

角色：独占 executor。本证据是实现与本地测试记录；最终独立验收由其他审阅者完成。

结果：原失败用例 **1/1 PASS**，page-port 全集 **22/22 PASS**，foundation **121/121 PASS**（原 115 项 + 6 项新增回归），三个授权源码/测试文件语法检查 PASS。没有 skip/cancel。测试期间三个独占文件及记录的共享依赖 hash 均未变化。见 [verification.json](verification.json)、[原用例日志](original-ack.log)、[page-port 日志](page-port.log)、[foundation 日志](foundation.log)。

根因是 agent 在首帧之前串行等待整页 rawSignature 与首帧 digest 两次 WebCrypto Promise。真实追踪顺序为 ACK → hash1 begin → turn1 → hash1 end → hash2 begin → turn2 → hash2 end → PAGE_DATA；原用例在 turn2 读取到 undefined，随后遗留 ACK timer。见 [修复前失败](baseline.log) 与 [追踪记录](digest-chain-before.json)。

[src/agents/page-agent.js](/Users/shopme/Documents/workspace/opendesk-browser/src/agents/page-agent.js:91) 现在在所有帧获得 ACK 后计算 EOF 签名；短 ACK 仍同步返回。新增回归用真实异步 hash gate 验证首帧发送不依赖 EOF hash，并连接实际 agent 与 page-port，验证 durable staging → 原身份 FRAME_ACK → 完整 PAGE_END。

[src/platform/page-port/index.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/page-port/index.js:36) 的所有 commandJournal 命令访问使用 commandRecordKey；submit/raw/effect 使用 pageCommandKey。agent 命令与 ACK 也按原 runId + commandId 隔离。命令、帧、缓存身份必须精确匹配；当前 slot 必须指向该 run。缺 runId、旧 run、重写 revision 均拒绝，不补入 active run。保留既有已 dispatched 命令在 Stop 中至多提交一次的例外，原身份保持原样；读取与帧 ACK 无该例外。重复帧/效果保留原缓存，失败 submission 不重放。

共享接口：三个 page metadata 行顶层均为 identity + operationCommandId，不带顶层 commandId，因此不占用 [identity.runId, commandId] unique 索引；command/read-reservation 继续使用 commandId。公开 PAGE_DATA/PAGE_END/PAGE_EFFECT/PAGE_ERROR 的 commandId 保持原字段；PAGE_FRAME_ACK 必须传递原完整 identity。storage writer 的 repository/read-reservation/IDB 接线继续使用共享 journal helper。SDK router 按已约定的 PROTOCOL、SDK_HELLO/sdkVersion 1.0.0、SDK_REQUEST requestId/method/argsWire/deadlineAt 和共享 codec 接线。

写入范围为两个授权产品文件、授权 page-port-service 测试及本证据目录；原测试仅适配真实 journal key 与 ACK identity fixture。verify.py 校验删除新增回归后旧测试内容与该有界适配完全相等。[changes.diff](changes.diff) 保存完整差异，[source-before](source-before/) 保存三个修复前输入。

复跑：`python3 docs/framework/evidence/k2-page-port/executor-transport-r8-20261002T234002Z/verify.py`。此轮证据来自 Node foundation/DOM/传输 fixture，最终包的原生浏览器与 F3 验收由独立验收方执行。
