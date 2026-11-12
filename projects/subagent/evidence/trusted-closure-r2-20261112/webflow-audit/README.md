# Subagent R2 · WebFlow / build-boundary evidence

任务：`OD-SUBAGENT-CHAT-A2B2A-R2-TRUSTED-CLOSURE`。
审查者：`/root/webflow_audit`，内部独立 Agent 审查，未有外部专家参加。

## 证据边界

本目录记录源码审查、Node 模拟测试和编译来源保护。没有在此执行完整 Browser build、安装、Chrome 操作或真实 ChatGPT A→B→A；不能据此登记 `CHROME_NATIVE` 或 `BUSINESS` PASS。

`prior-tool-run-summaries.json` 是四次原 `exec_command` 返回结果的诚实摘要，包含命令、工具 chunk ID、退出码及测试汇总：197/197、144/144、3/3、11/11。这四次运行当时没有将 stdout 保存到文件；当前接口不能按 chunk ID 找回原始字节。因此本目录不把摘要、人工转录或重建 TAP 冒称为原日志，也没有为补日志重新执行未变化的已通过项目。

`provenance-after-source-lock.tap` 则是此次实际运行直接捕获的完整原始 TAP；对应命令、开始/结束时间与退出码记录在 `provenance-after-source-lock-run.json`。

## 原构建失败与依赖修复

原失败来自已提交上游依赖：Settings 的 Images / Workspace 消费者经 `workspace-chatgpt.js` 引入 Task parser 和 route。Native Files 也经同一模块引入这些非本业务依赖。

在原实现上机械提取 `workspace-chatgpt-core.js`，原 `workspace-chatgpt.js` 保留兼容 export、WebFlow Task 读取验证和最终候选验证。四个 Settings / Native 非 Task 消费者改为引用 core；三个 trusted 文件仅改变 import 路径，并逐项更新真实 Git blob pin。没有修改冻结 Task、引入新的执行器或放宽 Native transport 的来源准入。

审查期间上游 `3e1a68431a71e2c449c9cbf29da2d9c405fe1f2f` 补充了 Settings 对两个精确 parser/route blob 的准入。该提交的所有 provenance 及测试 hunks 已保留；不能再把“Settings 缺少准入”描述为最新 main 尚未修复的问题。本轮拆分仍移除 Native transport 的不必要 Task 依赖，且实际 Settings / Native import graph 均不包含 Task wrapper、parser 或 route。

## AI Proxy 精确锁差量

先读取 `projects/ai-proxy/AGENTS.md` 和原来源审查记录。该项目没有专用的 source-lock 生成器；既有流程要求独立审阅真实输入并核对 Git blob，构建器不能自动批准当前源码。

只更新原 `projects/ai-proxy/trusted/source-lock.json` 的八个既有键，键集合仍为 63 项。每个新值由 `git hash-object` 实际计算，分别与本地已提交的 `HEAD:path` 和只读取得的远端 main `1521f9d1a90029a569e496f6d2d47193575f2cac` 对应 blob 相等；未知文件、业务源码、工具包、安装身份及准入目标均未改动。

- 原锁 blob：`d49b6da2b8b8dfc808c833557c11f74c56fc27a0`。
- 更新后锁 blob：`d4065a7461c4f173c695a03e1de1bee8d95ab9bf`。
- 八项旧/新 blob、对应上游提交与差量审查结论：`ai-proxy-source-lock-review.json`。
- 旧已锁定 blob 到当前已提交源码的完整可审阅差量：`ai-proxy-reviewed-source-diff.patch`。

## 唯一新增 provenance 运行

运行命令：

```sh
node --test --test-reporter=tap tests/environment/bundle-provenance.test.mjs
```

实际结果：**39 项，32 PASS，7 FAIL，退出码 1**。AI Proxy 两个来源保护测试、Subagent SW 精确准入、Settings / Native import graph、WebFlow parser/route 来源保护均通过。

七个失败保留在完整 TAP 中，没有放宽断言或隐藏失败：

1. Bookmark CSS 夹具仍使用已经迁移的 `examples/sidebar-tools/` 旧路径。
2. Bookmark model 精确准入测试仍使用旧 examples 路径。
3. Bookmark App 篡改夹具的旧路径导致预期错误类型过期。
4. Bookmark symlink 夹具的旧路径导致预期错误类型过期。
5. Time Review service 夹具仍使用旧 examples 路径。
6. Reading TOC 测试仍引用旧 overview 模块准入。
7. tab-repair 测试期望旧 blob，生产准入返回当前已锁定 blob。

这些未修改用例的完整失败是独立测试维护问题；本目录不声称完整 provenance 文件已通过。此次没有继续修改这些项目或重新执行整份测试。

## Subagent 固定 SW 投影

只允许三个精确 Subagent 输入进入 `sw.js`，其他 Content、Settings、Native transport、tool-shell、Sidebar Host 和 sandbox worker 目标均拒绝。任意修改字节、符号链接或同目录未审模块也拒绝。

完整 provenance 运行绑定的是当时 `page-task-result.js` blob `724c0973009d2d193d2824076dd915ebf7ecdd85`。随后 root 收紧可信 `authorize` 回调：返回 false 或 undefined 时拒绝；该最小差量已经只读复核，并将精确 pin 更新为实际 blob `16dda6e9a439dedb340e33874f1062bdfeaf8147`。此前 TAP 保持原样，不用后来的代码覆盖旧证据身份。

后续 production projector 的 false / post-read revocation 行为测试由 root 直接记录在 `../subagent-integrated.tap`；本 Agent 没有为该变化重跑旧 reader 的 11 项测试。最终构建、提交和业务状态以 root 同一候选的实际结果为准。

## 后续 tool-shell 构建来源差量

root 的实际 Browser production 构建继续到 tool-shell 后，被 AI Scroll 的旧精确 pin 阻断。本次先从真实 `src/entrypoints/tool-shell.js` 做只读静态 import graph，并对全部本地模块逐一调用原 `describeBundle` 来源门禁，未通过全量构建反复试错。最初 390 个模块中，116 个受审输入通过，发现 3 个已提交 AI Scroll blob 漂移，以及原安装器使用的 Prompt asset identity 缺少 tool-shell 目标；没有其他未解析的本地 import。

三份旧已锁 blob 到当前已提交源码的完整差量保存在 `tool-shell-reviewed-source-diff.patch`。新内容仅涉及严格显式请求的 turnPaging/showTurnCount 配置字段、四语言标签、按已安装版支持隐藏开关及数字默认关闭；原可信事件、CAS、读回、授权及 UNKNOWN 围栏保持。只读核验远端 main `156f686c503f5d97ab8afb79ef7f0c71d1f7c054` 的对应文件后，确认源 blob 与本地相同而旧 pin 尚未更新。AI Scroll 与 Prompt Shortcuts 业务源码均没有本轮修改。

Prompt 的 `asset-contract.js` blob 未改变。它是无 import、Chrome、Host、DOM、network 或 storage 效应的固定常量及纯 data URL 校验模块；原安装器只取 `PROMPT_ASSET_STORE`，卸载清理仍须原 pending journal、确认没有同 ID 安装、Scheduler 退役确认及 tool→catalog 锁。本次只把 `ui/tool-shell.js` 加入这一个精确 blob 的目标集合，asset-host、Page、model、未知文件和其他执行世界仍拒绝。`/root/closure_audit` 另行只读核验后没有发现这项单一目标修改的权限否决点；没有外部专家参加。

root 明确批准后仅修改原 provenance 与其定向测试。**一次定向测试 2/2 PASS，exit 0**；完整原始 stdout 直接写入 `tool-shell-provenance-targeted.tap`，覆盖新 pins、不同目标拒绝、改字节及符号链接拒绝。后续同图核验为 **390 个本地模块、120 个受审输入、0 failure、0 unresolved**，结果保存在 `tool-shell-after-review.json`；`tool-shell-before-review.json` 保留最初工具返回的原 JSON。复现脚本是 `audit-tool-shell-graph.mjs`，只检查语法及来源，不执行产品模块或生成 bundle。

`tool-shell-source-review.json` 记录旧/新 blob、上游提交、精确 scope、独立审查、测试命令和证据 hash。静态图是保守可达性核验，不能冒称实际 Rollup graph、Browser build、安装或原生业务 PASS。此前完整 provenance 的 39/32/7 原始失败仍保留；本次 2/2 不替代整份测试。源码已冻结交还 root，根任务负责唯一正式 Browser 构建和后续交付。

## 后续实际体积门禁与无行为数据减量

随后 root 的实际 Browser 构建已通过上述来源门禁，但 `ui/tool-shell.js` 为 3,150,219 B，超过原 3,145,728 B 预算 4,491 B。实际 Rollup graph 没有第二份 React 运行时或本轮 TaskWorkbench 实现；ChatGPT helper 的机械拆分也只有约 103 B 的独立内存 minify 差额，不足以解释或解决这一超限。

root 明确批准最小构建范围后，在原 `wxt.config.mjs` transform 接入 `scripts/pinned-public-suffix-raw.mjs`，对应测试为 `tests/environment/pinned-public-suffix-raw.test.mjs`。仅精确 `ui/tool-shell.js` 的原 PSL `?raw` 导入会被处理；原 vendor 和原 `domain.ts` 消费者分别锁定真实 Git blob，漂移和 symlink 均拒绝。Acorn 只接受一个默认字符串 export，值必须等于完整已锁源码，不执行输入代码。

原消费者本就忽略空行与 `//`。构建辅助只删除这些无效数据，保留全部 10,336 条有效规则的原顺序、完整 MPL/source/version/commit/使用通知头、任何版权或许可等通知的整个注释块，以及 ICANN/PRIVATE 界标。完整 vendor 文件、业务源码、来源锁、预算、入口和权限没有这一步的新修改，也没有第二份规则快照。

**一次定向 Node 5/5 PASS，exit 0**，原始 stdout 为 `pinned-public-suffix-raw.tap`。逐项比较全部规则 token、exact/wildcard/exception 类别和 IDNA 形式；另由原 `domain.ts` 实现分别消费两份数据，对所有规则派生的 host、Unicode URL 和已知拒绝例进行行为对照。错误目标/模块不转换，表达式、额外代码、替代字符串、原始输入/消费者漂移及 symlink 拒绝均已验证。

raw 模块从 352,176 B 减至 156,527 B，静态减少 195,649 B；这不直接声明最终 Browser 包大小。`/root/closure_audit` 独立只读核验未发现执行、权限、规则或许可通知方面的否决点，但未参与运行测试或构建。完整差量与审查见 `pinned-public-suffix-build-diff.patch` 和 `pinned-public-suffix-review.json`。三个构建输入已冻结释放，最终 Browser 构建仍由 root 执行。
