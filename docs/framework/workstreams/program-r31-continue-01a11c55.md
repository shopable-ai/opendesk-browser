# Program R3.1：独立分支收敛与证据复用

更新：2026-10-09。工作区 `/Users/shopme/.codex/worktrees/program-r31-continue/opendesk-browser`，分支 `agent/program-r31-continue-01a11c55`。从 PR #22 的 `0af5eae9bb43da279fb0536e1401bb66c902ec0d` 续接；旧工作区及回执保持只读。main 集成仍由现有获授权聊天串行处理。

```text
Program 源码与产物分离
  当前 main 接入：已三方合并；无文本冲突，async main 协议保留
  标准手工网页：已修复 fixture 位置冲突；真实手工入口仍为 demo-form.html
  组件验证：原定向 108/109，修复后受影响 20/20；新页面合同 11/11，校验器 13/13
  构建与包：生产/开发构建及包校验通过；当前候选 native 未执行
跨聊天证据入口
  历史归档：89/89 原始文件哈希核验，19 项引用身份核验
  复用工具：已实现只读检查；13 项正反向测试通过
  当前候选：权限、页面等输入已漂移，旧 PASS 保留原候选身份
后续验收
  保存版本、Installed Task、整浏览器重启：现有 R6.2 聊天负责；不能移用为本候选 PASS
  六项 baseline、完整框架合同、独立最终 F3、ZIP：NOT_TESTED，待正式冻结及资源交接
  旧 jQuery 版本/插件兼容：低优先级待办，本轮未扩展
```

## 合并及实际修复

PR #22 保持 OPEN/DRAFT；GitHub mergeable 本轮先为 true、后为 false，不能沿用历史观察决定集成。已将 main `c93ee36700171114ff38a5e705ce177fc55251df` 三方合入独立分支（`49d7f3d`），随后同步文档变化（`00050b3`）和标准页面/合同更新至 main `e35ded0c11c7b69991e4e4873cf55067f08c459c`（本地合并 `4c526427`）。本分支三方合并均无文本冲突。没有写 main 或旧分支，未重新设计执行器、存储、测试 UI 或添加依赖。

新 main 的 `basic-browser-page.test.mjs` 要求 `examples/tasks` 只有标准手工页面。旧 R3 新增的 `d1-userscript.html` 导致该检查失败。已经原字节移动到 `tests/fixtures/program/d1-userscript.html`（SHA-256 `68693f07b071b0f8c4a75173fe4a7dc5769c9ce4e77195e89d509644478b4045`），原生驱动的专用路由改读该位置；没有删除历史 fixture、回执或扩展兼容矩阵。旧索引路径保持原样，由只读旧档案解析。

## 本轮证据及边界

[统一入口](../program-evidence-reuse.zh-CN.md)给出可直接运行的哈希校验命令。历史源候选仍为 `30754f86938608163b0e2e6508d3f619dffbe517`，历史 CFT149 包为 `7f83330d5e45375ba9659de02ec35f9c14f283c8788c0f5cbf8b37fe3fe04118`。旧档案核验没有启动浏览器或重跑已成功的 native 用例。

本轮原始输出独占在忽略目录 `docs/framework/evidence/program-r31-continue-01a11c55/`。机器汇总见[本轮 JSON](program-r31-continue-01a11c55.json)，其中保留日志和报告哈希。当前候选变更及包身份的报告列出失效原因；保守输入映射不能替代逐用例消费者审查。

定向测试涵盖 Program 构建、项目、源码快照、Controller main、原 Sidebar 导入/运行/保存消费者及 main 权限/标准页面合同。初次 109 项中 108 项通过，唯一失败是重复手工页面；移动 fixture 后只复验受影响的标准页面和更新过的校验器，共 20/20。独立审查指出 Git mode/符号链接及成功结果标志缺口，修复后校验器 13/13；main 新增页面合同后该组 11/11。其它 89 项没有关联变化，保留首轮成功证据，合计 113 个当前独立用例已有对应通过证据。未重复旧 187 项全套或原生验收。`npm run check` 检查 142 个文件通过，原生驱动单独语法检查通过。

生产/开发构建及 `npm run verify` 通过，包指纹分别为 `a13c6143993fd4798957a8e538d5060cb28145000b23d94dc7141d41a3df20c3`、`51f24549b373ce0d041ef78a1218472eddb26877a4f6068b3004d2ec862794392`。后续 fixture、文档及离线校验器变化未改 bundle 消费的输入；保留构建时原始 checkpoint，明确其中 `scripts/check-program-evidence.mjs` 是后来改变的验证输入，不能冒充最终候选完整 sourceFingerprint。独占目录另存本轮 checkpoint，已恢复历史 tracked receipt 字节。当前候选 native 及冻结完整验收仍未执行。

## 其它聊天负责范围

只读观察到「完成 R6.2 本地验收闭环」已在其独立 `43220` 候选验证保存版本、补充 Installed Task、禁用 Native 后重跑，并正在进行完整重启。这些证据的源码、包和 origin 与本 R3.1 候选不同，不能关闭此候选的缺项。「完成 OpenDesk R6.3 原生验收与集成」负责 Native 准入及 main 集成，其固定站点资源仍有交接限制。另有 R6.2 原生、R5.2、R6.1 聊天活动，本轮未接管其浏览器、端口、数据库或 macOS 输入。

本轮未执行原生浏览器、安装、发布、最终 F3、ZIP 或 main 合并。候选以草稿 PR 供串行集成者审查；安装/重启等剩余项继续明确为 `NOT_TESTED`。
