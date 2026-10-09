OpenDesk Browser R10.1 开发环境接续记录（2026-10-10）

本轮在独立工作树、`agent/r101-development-01a12159` 分支完成产品修复、真实 Mac/CFT 定向验证及证据整理。集成快照为 main `77a8cdff9c85201d98952720a25466a371e0b5e1`；被验证的实现提交为 `2e9e3ea6cebd84adac685b5feade78a7b4bf35f3`。后续文档提交不改变已验证的产品或驱动输入。没有写主工作区或 main，没有执行生产安装、ZIP 或发布。

产品缺口是 Native Host 收到 SIGTERM/SIGINT 后遗留私有 socket，阻止新的 Native handshake。`native-agent/native-host.mjs` 的可执行入口现在复用既有 `close()`，释放按 inode/dev 确认归属的 socket 并关闭 stdin。新增真实子进程回归先观察到失败，修复后通过；原生端口断连后只读查询恢复，不重放业务。目录 attach 的 MCP 说明、Source Map CI 覆盖及 R10.1 驱动接续了上一分支尚未提交到远端的修复。

没有增加依赖、Runtime、Native Host 或构建器。`O_NOFOLLOW` 与目录身份检查仍不承诺防御恶意同 UID 文件系统操作者。迟到 ACK 验证通过调试器暂停真实 Host 的原有回包、终止已核对 executable/Chrome parent/socket PID 的自有 Native 进程、再恢复真实回包完成；没有伪造 sender、dispatch、pending 状态或 ACK。

开发包为 `13c6fb622b75008cdca5edbf31c21ffbcddb2c6d46050ec512276f0fad082996`，40 个文件，CFT `156.0.8078.4`。相对已有开发 Codex 包 `4f6f3005dfde10f0d85d89e1d45a96e66ffcf6daf954720c02f8edb11e1363fa`，构建输入差异仅有七个 `src/ui/` 文件；MCP/resolver/provider、run-host、Controller 方法和 Native adapter/service-worker/transport 的相关源码 SHA-256 均一致。Native Host 的信号清理变化单独验证。因此复用旧开发包的实际 Codex 101→102、HTTPS 42→43、npm+HTTPS 六项 42、Stop/deadline 和锁/离线证据；没有声称实际 Codex 已在新包重跑。

```text
R10.1 开发环境接续
  Native 连接恢复：已修复；真实子进程、Mac IPC、CFT 端口恢复证据；无业务重放
  Sidebar 项目输入：真实 AX 菜单选择通过；自动菜单驱动稳定性仍未证明
    Controller 项目绑定和重开：当前开发包真实运行通过
    Page 项目与 MCP 断连：当前开发包真实预览、原生点击、Stop 通过
  Native 授权：真实 nativeMessaging 撤权/重新授权、拒绝旧连接、恢复查询通过
  Controller 导航：真实运行中主动导航通过；外部导航以 E_DOCUMENT_REPLACED 隔离旧文档
  迟到 Native 回包：真实旧 ACK 到达，旧 pending 已不存在，同外部只读请求 ID 可重新查询
  提交与评审：独立分支提交/PR；main 由获授权集成者处理
  正式框架 F3：未关闭；生产安装/ZIP/发布按用户要求暂缓
```

| 证据层级 | 结果及适用范围 |
| --- | --- |
| Node/组件 | 新 Native 定向 13/13、最新 main UI 90/90；之前 UI 快照 42/42 保留。源码检查 202 文件通过。 |
| 历史 Node 复用 | 82/82、MCP 33/33、Source Map/resolver 34/34、安全 47/47 等原始结果保留，存在交叉覆盖，不能相加计算产品完成度；变更 UI 由新 90/90 覆盖。 |
| 构建/静态包 | 开发构建及包完整指纹检查通过；跨工作树依赖符号链接曾被来源校验拒绝，失败保留，随后用已有锁定依赖的独立副本构建。 |
| Mac Native IPC | 3/3，真实临时安装、wrapper、私有 AF_UNIX socket 和 CLI IPC；Chrome 字节流为模拟，不能升级为 Chrome E2E。 |
| 真实 Chrome/Mac Native | `sidebar-main-77a8` 为 `PASS_R101_SIDEBAR_TARGETED`，`lifecycle-06` 为 `PASS_R101_NATIVE_LIFECYCLE_TARGETED`；撤权、端口、导航分别取自先前失败整轮内已完成的独立 PASS case。 |
| 实际 Codex CLI | 已核实另一对话的 `development-sidebar-03` 原始 MCP 事件、结果自身 revision/sourceHash、两次源码执行及冻结旧结果，按输入复用。`native-14` 是旧生产包证据，未用于升级本轮层级。 |
| CI | 新 PR 状态见专属 workstream JSON；旧 PR #45 的成功 receipt 不提升为新分支 CI。 |
| 独立评审/F3 | 独立只读评审对信号清理、真实迟到 ACK 及冲突消除无阻断意见；未运行全量验收，不是正式最终 F3。 |

当前开发包 Sidebar 由现有验收驱动搭配本轮 CUA 原生 AX 输入完成。原生下拉菜单真实选择 Controller `project` 与 Page `page-project`，驱动只读观察 selectedIndex/value 后继续；最新 main 的模式开关、绑定恢复、旧/新 Host 文档身份、Page 文档变化、断连后 Run 禁用和 Stop 可用均取得实际结果。完整 NetLog 观察到远程 JavaScript 请求为 0，测试前后包字节未变，自有 Chrome、Native 和临时服务均已释放。原始截图、权限弹窗、Codex 配置及完整 NetLog 仅保留在本地；提交的公开 JSON 采用字段白名单和原始文件摘要，不含这些原始材料。

| 场景 | runId / previewId | resultId | 结果 |
| --- | --- | --- | --- |
| 当前 Sidebar Controller 3 | `8b262b8c-09ea-4482-9e31-fef8cc295ee7` | `b1f6c06f-898a-4aa0-b484-cf91e67070f7` | 完成、released |
| 当前 Sidebar 重开 Controller 4 | `5beb2d58-39ab-4c4a-b8ff-35209a6058e6` | `745bc2aa-a959-4923-98e8-5c7ad891e27e` | 完成、released，新 Host 文档 |
| 当前 Page 6 | `7ce07e50-2b5e-4628-8657-4f5a97a1a0b5` | 不适用，非持久 Controller 结果 | 预览后真实点击显示 6，新目标文档、断连后 Stop |
| Native 撤权/恢复 | `d46e3369-4b86-4011-bda1-2e29291fd03f` | `e8a6a304-f9c5-42fa-bc6b-9ca48e88477e` | 断连时拒绝只读调用；授权后取原 E_TIMEOUT，released |
| Native 端口终止/恢复 | `4b631834-7da7-47f9-9b87-e2b36c9b8d5a` | `16d41e34-de1a-4178-9c6d-8836a3eb5dd7` | 恢复原 E_TIMEOUT，released，重放 0 |
| Controller 主动导航 | `7058d1c6-eb02-4763-bd8a-124067c5ce7c` | `f8fa2f9c-c3fc-4c70-8d2c-5c2444fc5bc1` | 返回 demo-form 标题和实际新 URL，released |
| 外部导航旧身份隔离 | `3bdf0a76-4bca-4b43-ac0b-6615eba42ebc` | `33cff38c-8b95-418b-8a2d-5b7ad41b179d` | E_DOCUMENT_REPLACED，released，8.5 秒后原结果稳定 |
| 真实迟到 Native ACK | `4c6fdb15-e48c-4b9b-817a-7b0c95ed8854` | `7580fb85-c62b-4837-8037-b19ed01e769f` | 旧 dispatch `04d8d16d-5ab3-4d77-90ec-b840df91b7a6` 的 ACK 到达但 pending 不存在；新只读查询成功，重放 0 |
| 实际开发 Codex 101（复用） | `fb6f91f1-7221-4d6b-969b-219fec4e4551` | `6661be3f-9514-4e2e-862f-c3a4b1bbcf42` | 返回标题/101，旧结果冻结 |
| 实际开发 Codex 102（复用） | `f1955ea8-2578-4d23-b7df-a7abced5c1cf` | `ef5f1082-f20a-43f6-99d4-17f9208add5a` | 授权源码编辑后返回标题/102，released |

完整 sourceHash/documentId、实际结果 revision、Chrome PID、安装包及 Native 输入哈希见 `docs/framework/evidence/r101-development-01a12159/`。`campaigns.json` 保留每轮原状态：development-01/02 各 24 个独立 PASS 仍是整轮 FAIL；lifecycle-01 至 05 也保留 FAIL 和对应观察器缺口。不能把这些独立 case 拼成同一候选完整验收 PASS。撤权只证明 nativeMessaging 权限，不证明网站 origin 权限撤销矩阵；迟到回包是 Native ACK，不证明未知网页 native effect 可安全重放。

六维重新评分为 **93/100**，是基于证据的工程判断，不是测试分母或功能完成百分比。

| 维度 | 得分/权重 | 仍影响评分的缺口 |
| --- | --- | --- |
| 安全 | 24/25 | 未覆盖所有 OS/Chrome 安全组合 |
| ESM | 19/20 | 真实 Chrome 的 Source Map 错误定位矩阵未补 |
| 用户/Codex | 18/20 | 当前包 CLI 按输入复用；菜单仍需 CUA 辅助 |
| 锁/离线 | 14/15 | 现有拒绝与断网证据不能推广为任意网络故障 |
| 真实 Chrome | 13/15 | 分项通过，没有同包完整整轮和多版本矩阵 |
| 简洁/兼容 | 5/5 | 复用清理路径，无新增依赖或平行体系 |

剩余工作是自动原生菜单驱动稳定性、在确有相关输入变化时补新包实际 Codex、按正式合同安排完整框架验收与独立 F3。开发分支可供集成评审；未宣称正式框架关闭或生产交付。
