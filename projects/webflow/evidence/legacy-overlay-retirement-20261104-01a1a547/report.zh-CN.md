# 旧 ChatGPT 浮层退役：本机差量验收记录

任务：`WF-LEGACY-CHATGPT-OVERLAY-RETIREMENT-ACCEPTANCE`。日期：2026-11-04（Asia/Shanghai）。执行 owner：`01a1a547-87d1-7432-9ea2-7ad0b7016f09`。

**本机仍有旧浮层出现的真实证据；Web Flow 当前完整任务闭环尚未通过本轮验证。整体不能登记 PRODUCT_DONE。**

## 基线与复用

- 本地 `main`：`a0f40d4eec5413faf553df7d60169e750dd2988b`。远端 main 只读观察为 `2bcaf9372295df7d42f3016095d7f149cb25b489`。
- 两个指定提交 `9dd521e33…`、`2bcaf937…` 均为 HEAD 祖先。未 pull、cherry-pick、重复搬迁或创建分支、worktree、PR。
- 复用已提交的 Web Flow 业务归属、兼容导出、默认隐藏、精确可信源码准入。用户提供的 [CI 41696130272](https://github.com/shopable-ai/opendesk-browser/actions/runs/41696130272) 的 93 项与生产构建保留为原候选历史结果，不提升为当前 dirty 或本机 Chrome 证据。
- 日常目录 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`；Chrome Secure Preferences 中该路径对应 `ccfcjegpkdlgbclopjmadlcjedelidmf`。这只是配置证据，本轮没有操作原生界面确认 live 加载/Native 配对/serve 客户端。
- 磁盘发布 revision `09b5eb092fa30e3caf222df68ce55be9c2fd6e9af55168186f63522ebae046fa`，其 Bridge SHA 与磁盘一致，但包含迁移前旧实现。不能用版本 `0.1.0` 或磁盘 marker 代替 Chrome 实际加载证明。

## 实际观察与状态

| 用户行为或边界 | 状态 | 证据及限制 |
| --- | --- | --- |
| 源码默认不挂载旧浮层，兼容旧导出 | SOURCE_IMPLEMENTED / COMPONENT_TESTED | 默认 `showLegacyPanel=false`；指定测试及兼容 exports 引用一致性检查 |
| 真实 ChatGPT 不出现旧浮层 | BLOCKED | 已目视并行 owner 的真实截图，旧面板仍显示；仅证明截图当时。磁盘 source map 的旧实现第 268 行直接挂载，缺少项目新 adapter |
| 首次、历史、新建、刷新、关闭重开五场景 | NOT_TESTED | 自有 Profile03 停在挑战页，不能把零旧节点当通过 |
| 新获准自然语言任务执行、持久结果、释放、单次回传、AI 续答 | NOT_TESTED | 本聊天零消息、零任务；无新 requestId/runId/resultId，不伪造运行身份 |
| 历史、重复、引用、流式、越范围、撤权、身份与 UNKNOWN 保护 | COMPONENT_TESTED；Chrome NOT_TESTED | 指定测试通过；没有实际触发危险任务或更换 ID 重放 |
| 关闭侧栏继续执行并交付 | BLOCKED | 独立后台迁移 owner 正在处理；本轮不建 Runner/调度器 |
| 同文档独立 bundle 求值去重 | BLOCKED | 最小组件探针确认两次独立模块求值产生两套 runtime listener 和 interval。0 挂载、0 任务，不推断实际任务重放；目标源码同文件有并行 owner |

真实失败截图为 `artifacts/webflow/background-migration-20261104/first-context-invalidated.png`，归后台迁移 owner `01a1a2b9-3b15-7a83-9c14-661dee32475d`。其 SHA、时间和范围记于 [stale-output.json](stale-output.json)，不复制或改写历史文件。页面显示 `E_BRIDGE: Extension context invalidated; 未自动重试`；可见 candidateId 为 `wf-084e05c5-0230-44fc-9ecb-4f94cea6e759`，脚本为 `baidu.search.top3`。未取得该候选的 Run/Result，保留原身份对账，禁止换 ID 补跑。

自有 Chrome/154.0.8037.92 使用已登记空闲 Profile03，PID49961，严格绑定独立 CDP endpoint 和 target；只做入口检查。挑战出现后无交互、无 Cookie 导入、无消息或任务。已正常关闭并释放 Profile，未动全局 UI 锁或其他浏览器。见 [chrome-entry.json](chrome-entry.json) 与截图。

## 本轮唯一修复与验证

产品源码未修改。`tests/environment/chatgpt-bridge-site-r13.test.mjs` 的旧源码断言在迁移后仍要求兼容 shim 直接 import 站点 adapter，实际单项复现 19/20（1 失败）。修复后检查真实项目 owner 的导入边界，且兼容模块与 owner 的导出集合、函数引用完全一致，保留不允许 examples/programs 进入的约束；20/20 通过。

- 用户指定五文件：91/91，通过日志 [node-tests.tap](node-tests.tap)。Bridge/来源清单相对历史 CI 有变化，所以补跑；没有重复历史全部 93 项。
- 相关 site-r13：修复前 19/20，修复后 20/20；保留 before/after 日志。
- 独立模块初始化探针：[duplicate-initialization.json](duplicate-initialization.json)，可用同目录 `.mjs` 重现，仅组件对象，不连接网站。
- `git diff --check` 限本轮测试修改通过；新 JSON 逐项解析通过。测试文件修改不影响运行产物，无需启动产品构建。
- 原始失败 TAP 的 Node 错误格式包含两个仅有空格的空行；完整 staged whitespace 检查据此返回 2，原始日志保持不变。可编辑测试与文档/JSON/探针的定向 whitespace 检查单独核对，不把原始输出重新格式化成新证据。
- 评审期间并行 owner 继续修改 `bundle-provenance.mjs`；先前 91 项只属于运行时输入，不声称覆盖后续漂移。Bridge 与旧面板本轮观察指纹保持不变。

## 并行边界与唯一下一步

`chatgpt-bridge-page.js`、`bundle-provenance.mjs` 和 `docs/execution-plan.zh-CN.md` 已有并行修改；本轮未覆盖、暂存或提交这些文件。原生 UI、日常浏览器和共享输出仍被后台迁移流程使用。开发锁 PID35137 已不存活，未证明当前 serve 连接；死亡 PID 不构成资源移交。本轮未启动第二个 writer、重装/重载扩展或覆盖共享 dist。

**下一步只有一个：由当前日常输出 owner 将已合并源码经唯一开发 writer 发布到原 `dist/development`，在原未知候选完成对账后安全刷新 ChatGPT，检查旧节点为零。** 当前阻塞是共享输出/浏览器尚未移交及本地产物陈旧；不要重新实现迁移，不重放未知候选。待该操作取得一致候选后，再按原任务继续未完成的真实验收。

执行计划原文件同一 owner 正在写入，本轮按同文件保护规则未追加。待其 owner 合入原有相关工作节的差量为：本机旧浮层尚未退役；当前产物仍含旧挂载实现；指定组件91/91及兼容修复20/20；独立求值重复初始化已在组件复现、待同文件owner修复；真实五场景/任务回传/侧栏关闭未过；本目录为证据入口。此记录是验收差量，不建立第二份总计划。

## 独立评审与交付

七个互不读取对方评分的原生子 agent 分别评审。最终分数及算术平均见 [scores.json](scores.json)，每个 `review-*.md` 保存其评分、证据、扣分和未解决事项；架构原记录与最终差量复核分别保留。

原评审正文按原样保留。安全评审中的 `src/page-events/workspace-chatgpt.js` 是路径笔误，实际读取器 owner 为 `src/native-agent/workspace-chatgpt.js`；该笔误不作为新的产品缺陷或原生通过证据。

安全、架构、真实验收均未达到95分，整体未通过。本聊天原生 goal 保持 active：这是第一次阻塞审计，不满足原生工具连续三轮后才能标 blocked 的条件，也未获暂停要求，不能冒称 complete。

本轮提交仅应包含上述测试修复及本目录证据；不推送、不混入其他 owner 的 dirty。提交 SHA 由最终回复和后续只读 receipt 记录。
