# 本地 AI 开发与浏览器执行闭环 R1

最新 main 补验：VERIFIED_R1_LATEST_MAIN_REAL_MAC，2026-10-10。PR #51 已合入605920ac，PR #52 合入2b2dca89，PR #53 已于2026-10-09T18:12:22Z 合入 **9ebd95360d7d3e334b5db684e3951664901cbf16**。本次直接使用该 main 的源码构建，无额外产品、测试驱动或 WXT 改动；旧 native-11 原身份保留。补充证据在独立分支 `agent/local-ai-r1-main-proof-01a12158`，CI/merge 仍以对应 PR 为权威。

**native-12：25项真实 Mac Chrome PASS**，含实际 Codex CLI0.144.5四轮101→102→真实异常→修复103、Controller Stop/deadline、原生 Allow/项目菜单、Sidebar 重开/断线与 Page 受管清理。错误实际定位 src/extract.js:2:9，原始 error/持久 Result 保留；runId/resultId/结果自身 sourceHash/documentId/retirement released 见 `native-12/codex-receipts.json`，真实工具调用见 `codex-events.jsonl`。原生输入见 `cua-input.json`，观察到「我的/发现/开发/工具」。结束于2026-10-09T18:23:59.977Z；Chrome/launcher退出、profile删除、命名 Native 清理，资源 released。

178项定向测试、215文件 source check、双构建及 verify PASS。production26 assets，`feaf5ca1bbc01c07057fd9c7495322fbcf50ff031f4637536c00fbcdb9293456`；development40 assets，`a19b857dd6443c7df01ab5177480b23fffbf392ff532d299670aa8738765f2f8`。该生产包哈希与 R12 既有包一致，本次独立验证实际 Mac Codex/Sidebar，不提升 R12 CI 为用户 Mac PASS。`native-12-inputs.json` 保存203项输入，SHA `de27b03db3b74dc32d6de51e2813aa426da6ba0ff970ccc6a4aef76a4fb2591b`，文档提交后输入无变化。源码/构建/输入及原始收据见工作流 JSON 的 currentNative/currentChecks/receipts。

R1 实现、驱动与使用说明已随 #51/#53 集成；此次只补最新 main 证据。未关闭：新的完整 npm+HTTPS 混合原生矩阵、Page 正式保存/安装/自动运行/停用/重启、整体框架603＋19/B05/F3/ZIP；历史依赖证据保持原候选/锁，无 release/publish。Page 生命周期是 R1 正式结束后的下一轮。

## native-11 及更早记录（原身份保留）

当前结果：VERIFIED_R1，2026-10-10；跟进 [PR #53](https://github.com/shopable-ai/opendesk-browser/pull/53) 的当前 SHA CI/merge 为集成权威，本文记录本地验收，不预先宣称 CI 或合入。PR #51 已于 2026-10-09T17:44:44Z 合入 main（merge `605920ac`）。当前分支 `agent/local-ai-r1-final-01a12158` 的真实验收候选为 `ed2e4e3fc72b2b2d1296d5ce8c3e1262837e2675`；产品源码与 WXT 完整复用 main605920ac，仅补回原验收驱动的受控 launcher、R1 Codex 入口和顺序 Provider。保留 main 的分段、网络观察与包校验。后续 main `f14b97f0` 只新增另一工作流文档；201项执行输入离线核对无变化，不重复浏览器测试。

`native-11` 新包25项真实 Mac Chrome 场景全部 PASS，含实际 Codex CLI 0.144.5 的 101→102→真实异常→修复103四次 MCP 运行、Controller Stop/deadline、Sidebar 项目菜单、重新打开、断线与 Page 受管清理。真实异常定位 `src/extract.js:2:9`；各次 runId/resultId/sourceHash 与原 document 身份在原始回执，旧结果保持冻结。原生 Allow 与 project/page-project 选择见 `native-11/cua-input.json`，观察到四页签。2026-10-09T17:59:13.904Z 结束，Chrome/launcher 已退出、profile 删除、命名 Native 清理；不再占用测试资源。

定向组件155项、source check212文件、双构建及包校验 PASS。production26 assets，packageHash `624efb6a17c2ed32ed21fcf2fb8cc0176a3cbd0d2d7c381239dbcddb8cb6027e`；development40 assets，`f790844e5a4669d0c3b7de90a3a25cb85455ca1b727fb27fcd252ccb87fdf581`。收据为 `followup-builds/`、`followup-targeted.tap`、`followup-check.log`。`native-11-inputs.json` 记录201输入，SHA `99daa30f35f4218cab181c75695d164c1deb64f79e3eb22c069c6e576f8db963`；`native-11/acceptance.json`、`codex-receipts.json` 与 `codex-events.jsonl` 分别保存浏览器终态、持久结果和真实工具调用。不能以 CLI 文字回答代替工具回执。

native-10 的25项真实场景与实际 CLI 四轮 PASS，只绑定候选562abac3和原包0497f7af。native-08 因驱动先占用唯一 Provider 失败，零网页运行；驱动顺序已修复。native-09 因用户中断终止，零网页运行，保留 INTERRUPTED 和归属清理证据。native-06/07 及全部旧回执保留原身份；旧“核心输入未变”结论不适用于后来产品变化，本次由新包 native-11 独立验收。

目标：实际 Mac Codex 修改授权 JS 项目，经已有 stdio MCP / Native / Controller / RunHost 执行最新源码，返回真实持久结果和错误定位；复用现有 npm/HTTPS 锁解析与发布边界。用户已在本轮明确接受并行 main 的四页签；R1 不改导航。

已有能力：PR #37（MCP/本地 Resolver）、#38（npm 构建闭包）已合入；R10/R10.1 主干已有统一内存构建、锁缓存及命名 Native 实例。原 Chrome CI P0-P3 成功不提升为用户 Mac Codex PASS。相关证据先读 `local-dev-r22-c036.json`、`r101-resolver-01a120c0.md`、`r101-audit-01a120eb.json`。

```text
本地 AI 开发与浏览器执行闭环
  复用主干：#37、#38、#39/R10、R10.1 已合入；统一内存 builder，不重复实现
  最新目录源码与依赖：已实施；npm 解析候选变化回归通过；不隐式下载依赖
  Controller 原错误定位：已实施；冻结 source map；真实 src/extract.js:2:9；Page 保留原错误
  实际 Codex：101→102→真实异常→修复 103，四次 MCP 运行通过；旧结果冻结
  Sidebar 与生命周期：native-11 新包25项真实场景通过；清理 released
  main 集成：PR #51 已合入；跟进驱动只读审查 APPROVE；PR #53 当前 SHA 的 CI/merge 为集成权威
  Page 保存、安装、自动运行、停用、重启恢复：下一轮，未由本轮关闭
```

变更为 `native-agent/local-dev/{error-location,session,resolver,mcp}.mjs`、`local-dev-diagnostics.test.mjs`、npm 候选缓存回归，以及原 Native 验收驱动/CFT launcher/Codex CLI/lifecycle helper。只在原持久错误外侧附加诊断；npm 图重新解析；不改写 Result、不传 source map 给 Chrome。目录 attach 只传 path。选择性复用 R10.1 audit helper，未整支合并。Hilbert 对 `1e5c40df`、`db9c7fb3` 的只读审查均 APPROVE；静态审查不冒充原生证据。

通过条件：实际 Codex MCP 工具调用、两次不同源码 hash 与不同 runId/resultId、旧结果冻结；真实运行失败与定位；修复后真实成功；可信 Chrome 权限/Sidebar 操作和独立 launcher 清理。组件、Mac Native、实际 Codex、最终 F3/ZIP分别记录。

资源：独立 worktree `/Users/shopme/.codex/worktrees/local-ai-loop-r1/opendesk-browser`、自己的 dist、命名 Native `local-ai-r1-01a12158`、bundle `com.opendesk.localair1.a12158.chrome`、launcher 新建 profile、临时 loopback demo-form 端口。实际 CFT **156.0.8078.4**（早期误写 155，现更正）。native-05/06/07/10/11 均确认 Chrome/launcher 退出、profile 删除及命名 Native 清理。默认 Native、43111、其他 profile/dist/ZIP 未占用。

## 历史证据（原候选，不提升为当前新包）

以下原记录保留追溯。原初始 main b49dcc96、集成基线78cd5381、旧分支 agent/local-ai-loop-r1-01a12158；native-06候选db9c7fb3、native-07候选3d41a3a，各自只代表原包。当前结果使用上方 native-11。

证据在仓库根 `evidence/local-ai-loop-r1-01a12158/`：

- `integrated-targeted.tap`：171 项受影响 Node 测试通过；check：205 文件、合同/CSP/MIT 通过。
- production 26 assets，packageHash `c85aebb89c5199f5e9ffac72a0837b10fb572435c0dba63c1c1ecc16370d4f06`；development 40 assets，`78b513d4cb30d2756a953c9e6d4e77ece2d614d85c42546ce07a134f4d9b82fd`。独立 build receipt 保留；旧全局 receipt 未覆写提交。
- `integrated-inputs.json`：197 个产品/Native/builder/fixture/观察器输入，SHA `9cc2f6cdf502c22812b729ef7e936f5f42c5856c913bc9060f0feb26b350a907`。后续文档提交不改变执行输入。
- `native-06/acceptance.json`：最终集成候选 25 场景 PASS；`codex-events.jsonl`、`codex-receipts.json` 是实际 Codex 0.144.5 MCP 回执，文字回答不算证据。
- `native-06/cua-native-permission.json`、`cua-project-input.json`：精确 bundle/PID 57130 的真实 Native Allow 与原生项目菜单输入，独立补充驱动的权限状态观察，不伪造 ACK。
- native-05：前一候选 `1e5c40df` 25 场景 PASS，不冒充当前候选。launcher-failure-01：实际 CFT 启动检查失败后的归属清理 PASS。

四页签集成补验：`final-targeted.tap` 190 项通过，final check/build 通过；production packageHash `379464753fd9c2b985e614ef3454be0529277d9ae38289ae0312572052fc08da`、development `0c95cf8dd54f974ce9d26df7a7bbc80d1e2018e8fe9d22a0cec490f73a50dc75`。`native-07/acceptance.json` 的22项真实场景通过，`cua-input.json` 记录实际 Allow 与 project/page-project 输入，观察到「我的/发现/开发/工具」。未重复 CLI 四轮和 stop/deadline：比较当前与 native-06 的 Native/Controller/Page 核心输入未变，Pascal 对 `3d41a3a` vs main78cd5381 的只读审查 APPROVE；原25项仍绑定 db9c7fb3，不冒充新包25项 PASS。

早期 PR CI 失败原始日志为 `initial-ci-0.log`（macOS Local Dev 缺本机专属 launcher，run37961929707）、`initial-ci-1.log`（Intel macOS AX inspect 35秒超时，run37961929607）。CI 现在显式使用仓库受控 Python launcher，本机默认仍为 skill launcher；新入口拒绝个人 Chrome/调用者 profile/地址/keychain 参数，校验真实 argv/父进程并清理独立 profile。`ci-launcher-real-01/result.json` 为实际 CFT 启动与清理 PASS，`ci-launcher-boundary.json` 只是组件拒绝检查。Native AX 初始化沿用既有 helper 的 AXEnhancedUserInterface，窗口候选收窄为实际 permission/sheet，不遍历普通渲染页。该方法已随 PR #51 合入；当前跟进 PR 仍核对其自身 SHA 的 CI，旧失败不删除；外部 CUA 浏览器证据不提升为自动 AX PASS。

本机已注册 `opendesk-dev` stdio MCP，源码入口保留在已验证独立 worktree；只授权主工作区两个示例 `examples/programs/local-controller`、`local-page-ui`。在新 Codex 客户端生效，使用默认既有 Native；配置成功本身不算浏览器 PASS。不归档该 worktree。使用说明见 [本地 AI 开发 R1](../local-ai-loop-r1.zh-CN.md)。

失败与 NOT_TESTED：native-01/02 的自动 AppleScript 未识别权限表单；native-03/04 同名 CFT 的 AppleEvent 绑定错位，PID guard 保守拦截。原始本机证据保留，摘要/哈希在本工作流 JSON，不提升为自动驱动 PASS。native-05 未单独观察 Allow 输入，不借 native-06 回填历史；最终候选的真实 CUA Allow/菜单已通过。历史 R10.1 npm/HTTPS 原生回执仍按原候选与锁引用，本轮未另宣称最终候选完整 npm+HTTPS 混合原生矩阵 PASS。Page 正式安装/自动运行/停用/重启、完整撤权、603＋19、独立 B05、最终 F3、最终 ZIP 均不由本轮提升为 PASS；没有 release/publish。

复用须核对输入、加载包、Chrome/launcher、观察器和 document 身份。main 的 Sidebar/Page 输入变化后做 native-06；后续用户接受四页签后只补其受影响的 native-07。产品输入未变的 CLI/lifecycle 不重复，相同输入不因文档提交或新聊天再次全量执行。

跟进复用核对：main605920ac 合并了新 Sidebar/Controller 传输与构建修复，因此重新运行 native-11；主干 f14b97f0 仅文档变化，完整201输入及包未变化。Hubble 对 ed2e4e3f vs main605920ac 的只读驱动审查 APPROVE；不将静态 review 提升为原生结果。原 minifier/budget 失败日志保留；最终 WXT 采用主干实现，未提高预算或放宽 classic IIFE/MV3 检查。
