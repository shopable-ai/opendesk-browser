# OpenDesk Browser R5.2 — 现代 Page API 可靠性修复与验收记录

日期：2026-10-08。正式仓库：`shopable-ai/opendesk-browser`，只在 `main` 提交，无开发分支或新 worktree。本轮经 GitHub 连接器提交真实源码，未声称访问用户 Mac 上的 Chrome/Profile 或本地目录。

## 基线与可复核源码身份

- 起点：`2f332b0316d50c103646d5dc8653e02837e038a9`（R5.1 / 后续 Sidebar main 基线）。
- 完成代码与测试的精确候选：[`60e0d38af08d8fb755e271d9e8f516393f245252`](https://github.com/shopable-ai/opendesk-browser/commit/60e0d38af08d8fb755e271d9e8f516393f245252)。此后只新增本工作记录；重新核对最终 `main` HEAD 和 CI。
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

## 当前判定（仅对已测试层有效）

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
