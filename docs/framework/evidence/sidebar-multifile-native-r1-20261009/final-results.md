# 多文件 Sidebar 验收 · 最终结果

后续从[续测与复用入口](../../workstreams/sidebar-multifile-native-r1-20261009.md#resume)继续；该入口列出可复用的输入身份、每个原生缺口的通过条件及重测触发条件。不要从头重跑 R1 全量流程。

已验证的局部修复通过 [PR #29](https://github.com/shopable-ai/opendesk-browser/pull/29) 合入 main：`c11acf1658b45b6d75f1b2e14c27011b9544dcae`。合并树与验证过的 PR head `6fa0ed859661ade021a11486f5ab9e80c921cf16` 完全一致；双构建全部 sourceInputs 无差异。原工作区 60 项变更已完整备份、保留，只使用一个任务分支。

| 测试 | 真实结果 |
| --- | --- |
| 受影响 Node 回归 | **89/89 PASS**；修复 BOM 字节身份、Page 版本、实际 JSON 预算及 CSS URL/字符串过滤 |
| JSON 文件导入组件 | **PASS**：冻结快照校验、同窗口转交、篡改拒绝、不授权不执行；等待 handler 完成 |
| Page / Controller / 资源 Demo | **BUILD PASS**：三份 JS 实际 SHA 等于 artifact.sourceHash；draft 校验 PASS；不代表安装 |
| CSS / JSON / PNG 安全拒绝 | **PASS**：远程/转义/坏字符串/越界引用、非法编码/JSON/签名、单项/总量预算及 Controller 资源拒绝 |
| 扩展 production / development 与包校验 | **PASS**；最终 sourceInputs 与合并后代码匹配 |
| 远端 R3 / Sidebar / site-access / bridge-components | **四项 PASS**；bridge 环境集合 303 项：298 PASS、5 SKIP，不提升为原生证据 |
| 本地完整环境测试（记录的 c5fe462 候选） | **292 PASS / 1 FAIL**：Native CLI 握手超时，Options 仍关闭、Host 未连接 |
| macOS arm / Intel 原生 CI | **各 0 PASS / 2 FAIL**：裸 Chrome/CDP 基线先失败，Mach 端口权限错误/超时；最新主干基线同样失败 |
| 受控 CFT / 标准网页身份 | **启动/字节身份 PASS**：Chrome 155、新 profile、真实响应 HTML SHA 对齐；不等于程序执行 |
| Sidebar 原生 JSON 文件导入 | **NOT_COMPLETED**：文件选择器被 Mac 锁定打断，自动解锁失败 |
| 原生多文件只读展示 | **NOT_TESTED** |
| Page 标记、重复运行、目标限制与真实 document/执行回执 | **NOT_TESTED** |
| Controller 表单、每次一次提交、持久 runId/resultId | **NOT_TESTED** |
| 旧 JS 兼容、Stop、撤权、导航、关闭、重启 | **NOT_TESTED** |
| CSS 生效 / JSON 使用 / PNG 显示与运行期边界 | **NOT_TESTED** |
| 整个源码目录直接导入编译 | **NOT_IMPLEMENTED** |
| CODEX_E2E / 最终 F3 / ZIP 安装 | **NOT_TESTED** |

原 R1 的 `E_PROJECT_ASSET_BUILD` 负向门槛在旧基线确实拒绝，原始日志保留。当前 main 已实现有界 Page 资源打包，Controller 仍拒绝资源；这项合同差异已显式记录，没有将旧拒绝冒充当前通过。

完整失败、修复、哈希、命令及证据说明见[工作流记录](../../workstreams/sidebar-multifile-native-r1-20261009.md)，最终合入与复用证明见[final-integration.json](final-integration.json)。首轮 CI 的两个导入观察竞态已修复；失败日志和主干原生 CI 基线日志均保留。

剩余关键问题：手动解锁 Mac 后，继续同一 worktree 的真实 Sidebar 文件导入、只读源码展示、Page/Controller 执行回执及生命周期。Native CLI 握手和 macOS CI 前置环境问题仍未解决。原生验收保持开放，未达到整体 ≥95 分质量门槛。自有 CFT profile 与 43111 服务已释放，不占用其他会话资源。
