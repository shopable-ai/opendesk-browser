# 本地 AI 开发与浏览器执行闭环 R1

状态：VERIFIED_R1（2026-10-10，Asia/Shanghai）；集成状态以关联 PR 为准。分支 `agent/local-ai-loop-r1-01a12158`；初始 main `b49dcc96`，集成基线 `838a1083`，真实验收候选 `db9c7fb3646ac60816380646c3afefefad64bcb1`。共享 main 工作区、历史 owner 和发布证据未改写。

目标：实际 Mac Codex 修改授权 JS 项目，经已有 stdio MCP / Native / Controller / RunHost 执行最新源码，返回真实持久结果和错误定位；复用现有 npm/HTTPS 锁解析，保持 Sidebar 三页签与发布边界。

已有能力：PR #37（MCP/本地 Resolver）、#38（npm 构建闭包）已合入；R10/R10.1 主干已有统一内存构建、锁缓存及命名 Native 实例。原 Chrome CI P0-P3 成功不提升为用户 Mac Codex PASS。相关证据先读 `local-dev-r22-c036.json`、`r101-resolver-01a120c0.md`、`r101-audit-01a120eb.json`。

```text
本地 AI 开发与浏览器执行闭环
  复用主干：#37、#38、#39/R10、R10.1 已合入；统一内存 builder，不重复实现
  最新目录源码与依赖：已实施；npm 解析候选变化回归通过；不隐式下载依赖
  Controller 原错误定位：已实施；冻结 source map；真实 src/extract.js:2:9；Page 保留原错误
  实际 Codex：101→102→真实异常→修复 103，四次 MCP 运行通过；旧结果冻结
  Sidebar 与生命周期：25 项真实 Mac CFT 场景通过；停止、超时、重开、导航、断连、UI 清理
  main 集成：只读审查 APPROVE，无阻断项；关联 PR/CI/merge 为权威记录
  Page 保存、安装、自动运行、停用、重启恢复：下一轮，未由本轮关闭
```

变更为 `native-agent/local-dev/{error-location,session,resolver,mcp}.mjs`、`local-dev-diagnostics.test.mjs`、npm 候选缓存回归，以及原 Native 验收驱动/CFT launcher/Codex CLI/lifecycle helper。只在原持久错误外侧附加诊断；npm 图重新解析；不改写 Result、不传 source map 给 Chrome。目录 attach 只传 path。选择性复用 R10.1 audit helper，未整支合并。Hilbert 对 `1e5c40df`、`db9c7fb3` 的只读审查均 APPROVE；静态审查不冒充原生证据。

通过条件：实际 Codex MCP 工具调用、两次不同源码 hash 与不同 runId/resultId、旧结果冻结；真实运行失败与定位；修复后真实成功；可信 Chrome 权限/Sidebar 操作和独立 launcher 清理。组件、Mac Native、实际 Codex、最终 F3/ZIP分别记录。

资源：独立 worktree `/Users/shopme/.codex/worktrees/local-ai-loop-r1/opendesk-browser`、自己的 dist、命名 Native `local-ai-r1-01a12158`、bundle `com.opendesk.localair1.a12158.chrome`、launcher 新建 profile、临时 loopback demo-form 端口。实际 CFT **156.0.8078.4**（早期误写 155，现更正）。native-05/06 均确认 Chrome/launcher 退出、profile 删除及命名 Native 清理。默认 Native、43111、其他 profile/dist/ZIP 未占用。

证据在仓库根 `evidence/local-ai-loop-r1-01a12158/`：

- `integrated-targeted.tap`：171 项受影响 Node 测试通过；check：205 文件、合同/CSP/MIT 通过。
- production 26 assets，packageHash `c85aebb89c5199f5e9ffac72a0837b10fb572435c0dba63c1c1ecc16370d4f06`；development 40 assets，`78b513d4cb30d2756a953c9e6d4e77ece2d614d85c42546ce07a134f4d9b82fd`。独立 build receipt 保留；旧全局 receipt 未覆写提交。
- `integrated-inputs.json`：197 个产品/Native/builder/fixture/观察器输入，SHA `9cc2f6cdf502c22812b729ef7e936f5f42c5856c913bc9060f0feb26b350a907`。后续文档提交不改变执行输入。
- `native-06/acceptance.json`：最终集成候选 25 场景 PASS；`codex-events.jsonl`、`codex-receipts.json` 是实际 Codex 0.144.5 MCP 回执，文字回答不算证据。
- `native-06/cua-native-permission.json`、`cua-project-input.json`：精确 bundle/PID 57130 的真实 Native Allow 与原生项目菜单输入，独立补充驱动的权限状态观察，不伪造 ACK。
- native-05：前一候选 `1e5c40df` 25 场景 PASS，不冒充当前候选。launcher-failure-01：实际 CFT 启动检查失败后的归属清理 PASS。

本机已注册 `opendesk-dev` stdio MCP，源码入口保留在已验证独立 worktree；只授权主工作区两个示例 `examples/programs/local-controller`、`local-page-ui`。在新 Codex 客户端生效，使用默认既有 Native；配置成功本身不算浏览器 PASS。不归档该 worktree。使用说明见 [本地 AI 开发 R1](../local-ai-loop-r1.zh-CN.md)。

失败与 NOT_TESTED：native-01/02 的自动 AppleScript 未识别权限表单；native-03/04 同名 CFT 的 AppleEvent 绑定错位，PID guard 保守拦截。原始本机证据保留，摘要/哈希在本工作流 JSON，不提升为自动驱动 PASS。native-05 未单独观察 Allow 输入，不借 native-06 回填历史；最终候选的真实 CUA Allow/菜单已通过。历史 R10.1 npm/HTTPS 原生回执仍按原候选与锁引用，本轮未另宣称最终候选完整 npm+HTTPS 混合原生矩阵 PASS。Page 正式安装/自动运行/停用/重启、完整撤权、603＋19、独立 B05、最终 F3、最终 ZIP 均不由本轮提升为 PASS；没有 release/publish。

复用须核对输入、加载包、Chrome/launcher、观察器和 document 身份。main 的 Sidebar/Page 输入变化后已从 native-05 推进一次最终 native-06；相同输入不因文档提交或新聊天再次全量执行。
