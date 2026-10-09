# OpenDesk Browser R5.2 — 现代 Page API 可靠性修复与验收记录

上轮记录日期：2026-10-08。正式仓库：`shopable-ai/opendesk-browser`。下文至「质量反方判断」保留上轮 GitHub 连接器环境的历史结果；2026-10-09 本机真实 Chrome 最终候选记录见本文后半部分，旧 NOT_TESTED 和旧 CI 不代表新的候选。

## 基线与可复核源码身份

- 起点：`2f332b0316d50c103646d5dc8653e02837e038a9`（R5.1 / 后续 Sidebar main 基线）。
- 完成代码与测试的精确候选：[`60e0d38af08d8fb755e271d9e8f516393f245252`](https://github.com/shopable-ai/opendesk-browser/commit/60e0d38af08d8fb755e271d9e8f516393f245252)。这份 PASS 只对应所列源码候选和相应 CI；后续 `main` 可能合入独立的 R7 演示页/UI 更新，必须以最新 HEAD 和对应 CI 再验证，不能把旧候选回执直接当作新产品验收。
- 主要修复文件：
  `src/framework/control/native-driver.js`、`src/scripting/packaged/locator-dom.js`、
  `src/scripting/packaged/page-session.js`、`src/platform/host/controller-methods.js`；
  单纯缩减重复源码常量：`src/platform/target/index.js`。
- 定向测试：`tests/framework/r5-modern-page-api.test.mjs`，工作流：`.github/workflows/sidebar-r1-p0.yml`。
- 契约类型和开发说明：`types/opendesk-page.d.ts`、`docs/framework/modern-page-api.zh-CN.md`。
- 未改变 `PAGE_API_VERSION=1.0.0-r5.1`；这是 R5.2 的兼容可靠性修复，不声明新的完整 Playwright API 或引入第二个 Runtime。

## 实际发现与代码修复

| 问题 | 定向修复与边界 |
| --- | --- |
| 单次 Locator timeout 无法限制原生 RPC 回调停滞 | Driver 在第一次 Authority/Target RPC **前**启动单次绝对截止时间，等待期间连接独立局部 AbortController；对比原运行 deadline 取早者；超时无须终止整轮 Worker。已派出 commit 但不确定结果时保留 `commitIntent` 和未知效果路径，不重复网页提交。 |
| DOM 重绘/短动画、ARIA 禁用、样式遮挡 | prepare 在两个帧边界核对同一个节点和几何矩形；检查 `disabled/aria-disabled`、`readOnly/aria-readonly`、`inert`、`pointer-events:none`、命中遮挡；无 focus/scroll/page event 的 prepare，commit 前再校验。不承诺可靠作用于所有 React/Vue、复杂自定义输入或 trusted input。 |
| observe 大型 SPA 计算无界且同名建议不稳定 | 限制遍历节点（`maxVisited` 最高 3000）与实际 Locator 校验（`maxLocatorChecks=40`），高节点文档避免昂贵的无作用域全局语义检索；可用唯一 id 的 form/dialog 提供 **再经实际 locate() 验证** 的 scoped 建议。返回明确预算计数和 `truncated`，跳过隐藏子树，不输出普通表单当前输入值。 |
| 长期重复 read/prepare 形成无限请求记录和回执膨胀 | 只读 Page Session RPC 结束后清理 replay 缓存；写操作 `locatorCommit` 和已有可能产生副作用请求仍保留去重记录。Driver 省略 Locator 轮询产生的重复只读 native stage 回执，Controller 以 `commitIntent/commitNoEffect` 证明最新提交的保守状态。 |
| 旧测试精确依赖 `pageSession.snapshot()` 结构 | 保留原有 snapshot 结构，不向其增加请求计数字段；改用重复读取后 DOM 实际变化来验证只读缓存释放。 |
| Service Worker 预算极紧导致第一次生产构建失败 | 原候选输出为 328939/327680 字节，保持预算和固定 IIFE/CSP 条款不变；恢复失败的实验性 minifier 选项，通过重复常量去重与回执路径收敛，最新验收候选输出 **327149/327680 字节**。 |

特别说明：权限核验和真实网页副作用不是一个原子事务。停止、撤权或回调失联发生在提交之后时，后续不可自动重放；在没有原生确认时也不能保证已经成功提交。

## 真正执行的检查（源码候选 `60e0d38`）

- [Sidebar R1 P0 / R5.2 + K3 CI 37791975302](https://github.com/shopable-ai/opendesk-browser/actions/runs/37791975302)：**PASS**，129 项原有 Sidebar/Controller/草稿/授权/恢复测试、15 项现代 Locator 组件测试、34 项 K3 Native Driver 和 Worker Context 测试全部通过，合计 178 项；含旧 Page Session snapshot 契约。
- [R3 package / 构建 CI 37791975341](https://github.com/shopable-ai/opendesk-browser/actions/runs/37791975341)：**PASS**，依赖/UI 115 项测试，`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 全部通过；生产 `sw.js=327149` 字节，固定包体限制未改；在该次 CI 上通过生产与开发双包核验。
- 这些是 GitHub Linux Actions 对真实仓库模块的**模拟 DOM/Chrome 回调组件和打包回归**。它们不是独立 Chrome 页面操作、原生扩展真实 sender、Sidebar→Native Driver→持久结果的运行身份证据。

## 现有接口范围与普通任务入口

现代 Locator：`locator`（原生 CSS）、`getByRole`（受限 role/name）、`getByLabel`、`getByText`、`getByTestId`，`count/textContent/getAttribute/waitFor/click/fill`；`page.observe()` 输出限额语义摘要及可回放验证建议。单文件 `async function main()` 中继续由获准的 Worker 注入 `page/params`；复用已有 Controller 多文件 ESM 构建产物与 RunHost，不修改已有 sourceHash 及旧包。

旧 `page.click/page.type/evaluate/goto/snapshot` 等保留；`page.type` 追加与现代 `fill` 覆盖仍是明确不同的契约。页面 USER_SCRIPT DOM 代码与 Controller 自动化 API 并非相同运行能力。Shadow DOM、完整 ARIA/AX Tree、自动滚动、`press()`、trusted input、完整 Playwright 协议仍不支持。

## 尚未执行的真实 Chrome / AI 验收

在当前 GitHub 连接器执行环境中，**没有可复用的 Mac Chrome Profile、正在运行的本地 Sidebar 扩展、Native Agent 会话，也没有可核对的真实 `runId/resultId`**。因此如下流程仍为 **NOT_TESTED**，不是 PASS：

`Sidebar 开发草稿 → Worker/Controller/Authority → Native Driver → ISOLATED Page Session → 真实网页 DOM → Durable Result → 相同源码重跑`。

下一次在用户本地 Codex/已受控 Chrome 中最小接续步骤：

1. 在现有仓库 `main` 核对 HEAD、工作区未提交变更和既有 Profile/授权，不新建目录或无故重装扩展。执行 `npm ci --ignore-scripts`、`npm run build:dev`（保持源文件身份与本轮 CI 一致）。
2. 复用既有 Chrome 扩展环境，启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 `http://127.0.0.1:43111/demo-form.html`。
3. Sidebar「开发」直接运行 `examples/tasks/modern-search-draft.js`，参数 `{"keyword":"OpenDesk"}`。验证预填值覆盖、同文档按钮 DOM 替换后仍只提交一次、等待 `搜索完成`、`result=`结果：OpenDesk``，并记录真实 `runId`、请求/提交阶段、`resultId`、revision/sourceHash、持久结果。
4. 不修改源脚本重跑一次，证明每轮仅一次提交且 Durable Result 分别准确。单独做真实停止/撤权/回调丢失/文档更换验证，尤其检查 `effect_unknown` 禁止自动重放。外部 Playwright/CDP 可操作 Sidebar 验证 UI，但**不能代替 OpenDesk 的网页 fill/click**。
5. 如果要声明 AI E2E PASS，需额外保留 Agent 使用 `observe()` 提示、生成脚本、真实运行及普通用户再次运行的证据；本次没有。

## 上轮历史判定（仅对当时已测试层有效）

```text
REPOSITORY_CHANGES_APPLIED=YES
MODERN_PAGE_API_CORE=PARTIAL
REAL_CHROME_TASK_FLOW=NOT_TESTED
SEMANTIC_LOCATOR_RELIABILITY=PASS (组件范围，真实 Chrome NOT_TESTED)
OBSERVATION_BUDGET_AND_MATCHING=PASS (组件范围)
TIMEOUT_AND_EFFECT_FENCING=PASS (组件范围，真实停止/撤权 E2E NOT_TESTED)
DURABLE_RESULT_AND_RERUN=NOT_TESTED
AI_END_TO_END=NOT_TESTED
COMPONENT_TESTS=PASS
PRODUCTION_BUILD=PASS
DEVELOPMENT_BUILD=PASS
INPUT_PROFILE=ISOLATED_DOM_SYNTHETIC_UNTRUSTED (真实 Chrome 未执行)
FULL_PLAYWRIGHT_COMPATIBILITY=NOT_CLAIMED
FINAL_FRAMEWORK_ACCEPTED=NO
```

质量反方判断：API 明确、Locator/观察基础回归和超时保护具组件证据；普通用户闭环与真实 Chrome 安全生命周期仍有 P0 未验收，不以自评 95 分替代事实。

## 2026-10-09 本机最终候选：结果与身份

真实 Sidebar 草稿→Worker→Controller/Authority→Native Driver→ISOLATED Page Session→网页→Durable Result 已完成。实际发现并修复一个 Locator 缺陷；最终候选的本轮定位、观察与生命周期用例均取得证据，包括最后补齐的**同文档纯权限撤销**。完整框架正式账本/F3/ZIP 不在本次结果中宣布接受。

- 初始 HEAD 为 `704dd8cac140cf2ff9d7c2959ca041f9102848da`。验收期间其他会话正常推进 main；最终测试基线为 `fa8e3fba80ca6f86a2f8160c08d19c6f925ce670` 加本轮未提交的 Locator 修复及类型声明，未回退、创建分支、worktree 或提交/发布。
- [源码绑定](../evidence/r52-final-20261009-01a11c0d/source-binding.json)：`sourceFingerprint=c90e90daed6df0b53b7f6bf07aa655068a0dddfd747518546de83869d61b51fc`。候选从该 HEAD 的已跟踪文件复制到独立构建产物目录，叠加本轮两个文件；并行未提交的 `src/ui/script-editor.js`、`tests/environment/script-editor.test.mjs` 保留在工作区，未纳入该候选。
- 生产 `packageHash=2fe3483e2d0deb85bd33190d649f20e8412bfa169437f9615cdb57d911df4ca3`；开发 `packageHash=5e3a567b0ae54ac7d6b82d5f69e85cf7d3c567c4c71c0e3cec9cc96a0f098897`。Hash 均由现有 verify-package 对文件字节排序计算；生产 sw.js 为 327149 字节，原 327680 字节预算、CSP 和扫描策略未放宽。
- Chrome for Testing `155.0.8059.39`，macOS arm64，有头模式，扩展 MV3 0.1.0；扩展 ID `lghbfbpiijdmndfkllfinobnhkifiemj`，实际 SIDE_PANEL hostInstanceId `f87b132c-6e31-4538-80ee-d950a4a6017d`。[浏览器身份](../evidence/r52-final-20261009-01a11c0d/browser-session.json)、[受控 launcher 验证](../evidence/r52-final-20261009-01a11c0d/launcher-main-verified.json)。复用仓库 CFT launcher 与 CDP 观察器，未争用另一会话的 CFT 138。
- 最终实际入口为 Sidebar「开发」运行草稿，目标 `http://127.0.0.1:43112/demo-form.html`。既有 43111 服务指向历史快照，保留它并使用空闲端口服务当前 `examples/tasks`。HTML SHA-256 `18ccd79c9f35ca9db9b96dcca567c3ed00c7c896637d3d4a9d234911acfca005`；未恢复旧 HTML。原生滚动将搜索表单带入视区后运行；先前离屏超时记录保留，不能算 PASS。

[统一证据索引](../evidence/r52-final-20261009-01a11c0d/acceptance.json)包含所有精确 runId/resultId/sourceHash、结果自己的 revision、操作阶段、计数和原始 capture SHA-256。生产/开发构建控制台用 JSON 字符串原样封装，保留空白与原始文件哈希。每个 case 文件是**原始记录的逐值提取**，不是重写或补造的 receipt；完整数据库/页面 capture 保存在仓库 `artifacts/r52-final-20261008-01a11c0d/main-native/`，提取文件记录其路径和哈希。旧候选、无效注入和失败观察全部保留，分别标注，不计入最终 PASS。

## 两轮同源码与已有能力

源码直接来自 `examples/tasks/modern-search-draft.js`，两轮未经过 AI 重写；参数均为 `{"keyword":"OpenDesk"}`。共同 sourceHash：`1618934805a4104191be8e2005a608d0537a51ca65c1e291c8a8fb042ed34b2d`。

| 轮次 | runId | resultId | 网页提交数 / 持久结果 |
| --- | --- | --- | --- |
| 第一轮 | `1d4905f1-1729-4fd4-b975-96931088e09b` | `72ed09d5-b807-4c2d-83e4-c09ea82d4068` | 0→1；`{"result":"结果：OpenDesk"}` |
| 第二轮 | `b899484b-ea8a-41c7-a7fc-f6fc2b99a1ce` | `52b039d0-4169-429d-8381-3b47ac0d5bf7` | 1→2；`{"result":"结果：OpenDesk"}` |

两轮均为 controller-result/completed，run 与自身结果身份一致，workerRetired=true、retirementState=released。两次真实 locatorAction 各有 `locator.commitIntent → tabs.sendMessage → result` 阶段；wait/read 也有独立持久操作记录。第一轮观察到预填覆盖、真实 input/change、按钮节点替换且 disabled=true→false、一次 click 和一次 submit，再等待异步「搜索完成」。第二轮相同值的 fill 不再发送变更事件，随后仍只提交一次，这是已有 fill「仅在值变化时发事件」的契约。

另一次真实 `page.observe({root:'#search-form'})` 返回当前表单语义摘要及预算，run `7853579f-4ec3-4e28-8a18-25e858642695` / result `bf2417fb-7d4f-4c16-b00c-746534302b5d`。主流程、严格查询、覆盖/清空、同文档重绘、异步等待、持久结果和重复请求去重均已有实现，无需重写 Runtime/Sidebar/Authority。

## 实际缺陷与最小修复

真实受控 DOM 中连续 CSS 动画按钮以约 40px/s 移动，旧 prepare 每帧容忍 1px，亚像素移动仍被视为稳定，实际出现一次不应有的点击。原始 run `af6d81cc-e3e7-410a-a059-8454b96cc67e` / result `5c76d3b4-5060-4d6b-a536-47e3b0d85c62`，见[修复前原生记录](../evidence/r52-final-20261009-01a11c0d/animation-before-native.json)。新增 0.25px/帧组件回归在修复前也失败，见[失败输出](../evidence/r52-final-20261009-01a11c0d/animation-before.log)。

`src/scripting/packaged/locator-dom.js` 改为两轮矩形坐标完全相等才准备成功，持续亚像素移动继续等待；不增加第二套 Locator。`tests/framework/r5-modern-page-api.test.mjs` 增加对应回归。修复后同一原生矩阵 21/21 通过，动画按钮在期限内未点击，禁用/只读/遮挡负例也零副作用。

最终原生矩阵 run `71ac9937-6f80-49e5-b9b4-5befc4344742` / result `c43c1923-62be-4720-9e20-d9da8445cfde`，见[完整记录](../evidence/r52-final-20261009-01a11c0d/locator.json)：原生 label、aria-label/labelledby、严格同名匹配、form/dialog/container 范围、disabled/readOnly/ARIA 状态、pointer-events、遮挡、动画、重绘及 input/textarea 替换/清空均通过。路径不依赖 data-testid。observe 实际 visited=3000、truncated=true、locatorChecks=24≤40，24 个建议全部重新唯一定位；密码值及无必要的输入值不在观察输出中。预算限制是遍历/建议验证计数，不宣称浏览器 CPU 或堆内存的硬实时上限。

## 最终候选的生命周期证据

故障仅注入独立验收浏览器的测试 driver：真实 Chrome 调用照常执行，测试暂扣其**实际**回调、发送原样重复 envelope 或延迟回调；不生成原生 ack、不替代网页 fill/click。CDP inspector 保持测试 SW 存活，避免早期注入因 SW 休眠消失；无效早期注入未计入通过项。

| 情景 | 实际结果与证据 |
| --- | --- |
| RPC 挂起 / 单次 timeout | [stalled-prepare](../evidence/r52-final-20261009-01a11c0d/stalled-prepare.json)：真实 ready 回调被暂扣；500ms 在 517ms 报 E_TIMEOUT，无 commitIntent；随后只读仍可使用。 |
| prepare 重试不重计时 | 持续动画、禁用和遮挡负例在各自局部期限结束；组件还验证首次 Authority RPC 前计时与 prepare 重试。 |
| 运行期限更严 | [run-deadline](../evidence/r52-final-20261009-01a11c0d/run-deadline.json)：waitFor(60000) 被 30000ms run deadline 截断；持久结果约 30005ms，E_TIMEOUT/stopped/released，后续点击未执行。 |
| 相同 requestId | [duplicate-commit](../evidence/r52-final-20261009-01a11c0d/duplicate-commit.json)：同一真实 locatorCommit envelope 再发，两次真实响应一致，网页 dialog 点击计数 1→2，增加一次。 |
| 提交回执丢失 / 未知效果 | [drop-commit](../evidence/r52-final-20261009-01a11c0d/drop-commit.json)：网页 2→3，实际 committed 回调未交付 Controller；operation 保留 commitIntent、effect_unknown、submissionCount=1、deliveryState=fenced；顶层 Durable Result 是 E_TIMEOUT/failed/released，没有重放。 |
| stop 与迟到回执 | [stopped-late-receipt](../evidence/r52-final-20261009-01a11c0d/stopped-late-receipt.json)：Sidebar 原生停止后再释放暂扣的真实 prepare 回调，仍 E_CANCELLED/stopped/released，网页无点击，运行未恢复。 |
| 文档替换 | [replace-document](../evidence/r52-final-20261009-01a11c0d/replace-document.json)：prepare 后真实 reload，E_DOCUMENT_REPLACED/stopped/released，新文档计数为空；保守账本无自动重试动作。 |
| 重叠写入 | [overlap-writes](../evidence/r52-final-20261009-01a11c0d/overlap-writes.json)：延迟真实 commit 回调 150ms，同时发两个 click，一项成功、一项 E_WRITE_CONFLICT；只点击一次。 |
| 只读等待与缓存 | [readonly-wait](../evidence/r52-final-20261009-01a11c0d/readonly-wait.json)：1200ms 只读等待期间点击在 55ms 完成，等待 1216ms 超时，locatorWait Journal 仅最终阶段；30s 等待也只产生一条操作记录。Page Session 请求缓存回收另外由组件验证，没有声称做过原生堆计数测量。 |
| prepare 后纯撤权 | **最终候选 PASS**：[site-access-withheld](../evidence/r52-final-20261009-01a11c0d/site-access-withheld.json)：暂扣真实 ready 回调后，原生 Chrome 菜单关闭站点访问。containsOrigin/containsAll 由 true→false，origins 变为空，主文档 `874991C2321485645036903393050488` 未变化；Controller 先以 E_PERMISSION/stopped/released 持久化，再释放迟到回调，网页计数为空，无 commitIntent。 |

此前生产 hash `9f7d287ba6824d9146bea1cfc7488de663459a5fc804bb5178b5aa4657cd622c` 的 optional-host 环境，真实移除站点权限后未点击，见[独立历史证据](../evidence/r52-final-20261009-01a11c0d/prior-optional-host-revocation.json)。该候选与最终候选的四个核心 Locator/Driver/Session/Controller 文件相同，但 manifest 权限不同，**不转移为最终候选 PASS**。本轮没有改动 manifest、权限或扫描政策去促成测试。

最终纯撤权在同一生产包 `2fe3483e…` 的第二个自有 CFT 会话执行，两会话未同时占用浏览器资源；hostInstanceId `6a0ab473-1970-40fb-a126-298d62eab9ef`，[独立 launcher 身份](../evidence/r52-final-20261009-01a11c0d/revocation-launcher-verified.json)。run `fd6ecf10-ddef-4597-b2f4-508caeb813fe` / result `de6c9733-8bc8-41c1-8083-306e9c0d928d`。早先 [permissions.remove 失败](../evidence/r52-final-20261009-01a11c0d/revoke-prepare.json) 和 [界面尝试超时](../evidence/r52-final-20261009-01a11c0d/revoke-ui-attempt.json)仍保留，未改写为 PASS；后续直接查询真实授权证实：虽然 Chrome 提示重载，权限检查已立即变更，不能把该提示当作纯撤权无法验证的结论。

## 文档、类型、验证与剩余任务

本轮修改文件：`src/scripting/packaged/locator-dom.js`、`tests/framework/r5-modern-page-api.test.mjs`、`types/opendesk-page.d.ts`、`docs/framework/modern-page-api.zh-CN.md`、`examples/tasks/README.zh-CN.md`、本文及本机证据目录。类型将空 options 改为 `Record<string,never>`，并补齐已存在的 title/content/url/goto/reload/click/type/keyboard 常用声明；没有增加运行时 API。正式 API 文档同步稳定性、参数/返回/错误、Controller 与 USER_SCRIPT、权限/停止/未知结果和观察边界；示例说明当前 HTML 的视区前提与服务文件身份。两份单/多文件使用指南已有正确 Controller/USER_SCRIPT 区分，使用方式未改变，无需修改。

最终只读复核纠正了新增 keyboard 注释：实际 key 允许 `Enter` 等非空名称，仅拒绝含 `+` 的多字符组合键，单独 `+` 允许；类型签名未变。此注释在原生验收后修正，`.d.ts` 不参与扩展运行产物，未修改已测试候选/旧 receipt。最终交付文档、类型及测试文件另见[交付文件绑定](../evidence/r52-final-20261009-01a11c0d/delivery-binding.json)，不要把构建时类型注释的旧字节当作最终文档。

- [定向组件输出](../evidence/r52-final-20261009-01a11c0d/component-delivery.log)：五个指定文件，123 tests / 123 pass，0 fail/skip；未默认运行全量框架回归。
- [源码检查](../evidence/r52-final-20261009-01a11c0d/check-delivery.log)：npm run check PASS，138 source/test/build 文件、固定入口、CSP、原 MIT；git diff --check PASS。
- [生产构建](../evidence/r52-final-20261009-01a11c0d/build-main-production.json)、[开发构建](../evidence/r52-final-20261009-01a11c0d/build-main-development.json)、[双包 verify](../evidence/r52-final-20261009-01a11c0d/verify-main.log) 均 PASS，最终身份如上。独立快照首次 check 缺少测试/许可证输入，补齐同 HEAD 输入后重跑通过；不是源码失败。声明使用 Node stripTypeScriptTypes 解析通过，环境无完整 tsc，未安装依赖，不能声称做过完整类型检查。
- 首次生产构建误在主目录执行，更新了生产产物及原有构建记录；后续构建均在独立产物目录。没有覆盖并行源码、恢复主目录产物或伪造旧 receipt；已有脏 build 记录与历史任务包原样保留。未发布扩展、制作安装 ZIP 或提交 main。

```text
现代 Page API 真实验收
  搜索闭环：已实施 / 最终候选两轮原生证据 / 无剩余动作
  Locator 与观察：已修复亚像素动画 / 21 项原生证据及组件回归 / 无已复现未修复问题
  生命周期：超时、去重、未知效果、停止、同文档撤权、文档替换及写锁已有原生证据 / 无本轮剩余用例
  API/类型/示例：已同步 / 语法与契约核对 / 完整 tsc 未执行
  最终框架接受：未关闭 / 未执行正式账本、独立 F3 与 ZIP 安装验收
```

下一阶段由集成者核对并行编辑后的精确主线候选，补完整 tsc 检查并执行既定正式账本、独立最终 F3/ZIP 合同；如需 AI_END_TO_END PASS，再保留 AI 制作、首次运行和普通用户重跑的独立证据。本次不扩大为 R5.3 或重建执行器。

## 跨对话续接与复用（2026-10-09）

按 [测试指南的统一入口与失效规则](../testing-guide.md) 先查后测。本轮 15 项真实运行、两轮固定源码结果、123/123 定向组件和双构建/verify 已有原始记录，后续引用本文件和 `acceptance.json`，无需因开新聊天重复执行。源码/包身份、环境及证据级别仍绑定上文的原候选，不能把历史 PASS 改成新候选 PASS。

[本次离线核对](../evidence/r52-final-20261009-01a11c0d/reuse-review.json)记录原证据文件哈希、当前输入差异、复用范围和后续责任。当前共享工作区的 `script-editor.js`、`task-workbench.js`、`tool-shell.css` 是并行改动；`opendesk-page.d.ts` 的差异为已记录的注释修正。原生测试包来自独立产物快照，旧绑定和回执保留。本次不验证并行 UI 候选，也不替 R6.2 的续接对话执行 Native/AI→Task；正式集成者核对新候选后安排受影响入口验证。

本次新增复用规则只修改文档，未再次运行组件、构建或浏览器。`delivery-binding.json` 是此前交付文档快照；本节后续文档哈希另存在 `reuse-review.json`，不改写原生源码绑定或历史 receipt。

```text
REPOSITORY_CHANGES_APPLIED=YES
API_DOCUMENTATION_SYNC=PASS
REAL_CHROME_TASK_FLOW=PASS
SEMANTIC_LOCATOR_RELIABILITY=PASS
OBSERVATION_BUDGET_AND_MATCHING=PASS
TIMEOUT_AND_EFFECT_FENCING=PASS
DURABLE_RESULT_AND_RERUN=PASS
AI_END_TO_END=NOT_TESTED
COMPONENT_TESTS=PASS
PRODUCTION_BUILD=PASS
DEVELOPMENT_BUILD=PASS
FULL_PLAYWRIGHT_COMPATIBILITY=NOT_CLAIMED
FINAL_FRAMEWORK_ACCEPTED=NO
```

上表用例均有单独原生结果；Page Session 缓存回收另外有组件证据，没有原生堆测量声明。网页 fill/click 的事件仍为 untrusted；浏览器默认生成的 submit 事件 isTrusted=true 不代表可信键鼠。AI 制作端到端未执行，不能用手工固定草稿的成功替代。
