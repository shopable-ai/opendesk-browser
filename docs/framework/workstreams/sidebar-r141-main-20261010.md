# OpenDesk Browser Sidebar R14.1 — main 定向收敛与证据说明

> 日期：2026-10-10（Asia/Shanghai）；执行方式：GitHub 连接直接写入现有 `main`，未创建分支、Worktree、PR，未生成生产 ZIP。报告以标明的各提交 SHA / CI run 为准；其他并发提交的存在不提升其验收等级。

## 1. 修复前核对

- 初始审计时 `main` 为 `6801674e884e85d1ca07406b8b2eae0357f98b9d`。历史 `sw.js` 327,796 / 327,680（超 116 字节）已不能代表最新 P0 原因；初始最新 WXT CI 真实错误为 `Non-classic IIFE output in sw.js`。
- R13 并发 Agent 持续修改 `wxt.config.mjs` / `scripts/verify-package.mjs` 并修复构建。R14.1 本次**没有修改**这些所有权有冲突的文件、没有提高 SW 大小上限、没有放宽经典 IIFE 或 CSP 验证。
- 根据 `AGENTS.md` / `docs/framework/testing-guide.md` 和 `docs/framework/workstreams/sidebar-tools-r1-mac-01a11fa4.md`，旧候选曾有精确身份的真实 CFT 155 自定义工具证据，但不能视为本次新 R14.1 源码/包的原生 PASS；历史 320px Side Panel 原生观察亦未关闭。
- Mac 本地仓库 `/Users/shopme/Documents/workspace/opendesk-browser` 在本次容器不可访问；远端 API 可读写。不声称已核对该 Mac 目录的 `git status` 或占用该机器的 Chrome/profile/43111/dist。

## 2. main 直接提交和行为变更

1. [`041948bc7184eff9b05fd3053391d23ac2e861ed`](https://github.com/shopable-ai/opendesk-browser/commit/041948bc7184eff9b05fd3053391d23ac2e861ed)：
   - `src/ui/sidebar-tools.js`：初次异步读取带 catalog epoch，较旧读取不能回滚 storage.onChanged 的新状态；全新同 ID 安装先清除因中断卸载而留下的孤儿私有存储，正常更新仍保留数据；列表更新、安装、返回和卸载后恢复合理键盘焦点。
   - `tests/environment/sidebar-tools-host.test.mjs`：新增跨窗口通知和旧读取竞态、遗留数据隔离、焦点恢复的定向回归。
   - `docs/architecture/sidebar-product-contract.zh-CN.md`：保存行为/证据边界。
2. [`10ed3aa87fbd0e2a5c8cd53c6b3445c03fccdbd4`](https://github.com/shopable-ai/opendesk-browser/commit/10ed3aa87fbd0e2a5c8cd53c6b3445c03fccdbd4)：`.github/workflows/sidebar-tools-r1.yml` 正式覆盖五个定向测试文件（sidebar-tools、sidebar-tools-host、sidebar-product-contract、sidebar-ui-preview、task-workbench），并保持 source check / 双包 build / verify。
3. [`353e5dc5e0a9012679a2558d6b2f1bdd610dc361`](https://github.com/shopable-ai/opendesk-browser/commit/353e5dc5e0a9012679a2558d6b2f1bdd610dc361)：
   - `src/ui/task-workbench.js`：当 Task v1 的 RunHost 已认领运行但 `start()` 尚未返回准确 runId，暂不将其视作 Developer 草稿所有者，避免暴露错误的跨视图 Stop 控件；返回准确 runId 后仍由原任务 stop。
   - `tests/environment/task-workbench.test.mjs`：新增延迟 task admission → 工具视图 → runId 到达 → 完成的断言。
   - 架构合同补充相关说明。

没有新建执行器、状态管理框架或第二套导航；未修改 ChromePage/Locator/R13 自动化 API。保存的 JSON/字符串/数字/数组/布尔/null/undefined/错误等动态运行结果呈现合同继续保留，不改为固定业务表格。

## 3. 实际组件、构建、验证证据

| 精确 SHA / GitHub Actions | 真实结果 | 证据等级 |
| --- | --- | --- |
| `041948bc`，[run 37967468540](https://github.com/shopable-ai/opendesk-browser/actions/runs/37967468540) | 29/29 自定义工具与产品合同测试 PASS；源码检查、工具包 JSON、WXT production/development、`npm run verify` PASS。生产 `sw.js` 约 327.63 kB，低于固定 320 KiB 上限；未调高预算。 | CI_COMPONENT_AND_BUILD_PASS |
| `10ed3aa`，[run 37967770418](https://github.com/shopable-ai/opendesk-browser/actions/runs/37967770418) | 已扩大为五个定向测试文件；五件套测试步骤、双包构建和 verify 步骤 PASS。 | CI_COMPONENT_AND_BUILD_PASS |
| `353e5dc`，[run 37968357242](https://github.com/shopable-ai/opendesk-browser/actions/runs/37968357242) | **68/68 tests PASS，0 fail，0 skip**；新的 task admission 测试 `ok 68`。源码检查、安装工具构建、生产/开发 WXT 构建及包 verify 全部成功。生产 packageHash `b46b306491aee0d01785df18e75d042ee459474ac371725a926af9f25051b1c3`；development packageHash `b5e164cd361f34dca6b53b194f7714cf39b1c6aa41689d12f77949a837192472`。 | CI_COMPONENT_AND_BUILD_PASS |

`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 是 **GitHub Actions 在以上准确提交**执行，而非本次容器本机执行；这足以证明该提交 CI 层的构建结果，不证明原生安装、真实 Side Panel 或最终验收。

## 4. 六维反方质量检查（非虚构的 95+ 成绩单）

| 维度 | 本轮证据及专家阶段评估 | 尚未关闭 |
| --- | --- | --- |
| 信息架构/导航 | **组件/静态评估：93/100**。四个一级页签与工具列表/单实例 iframe 合同、全页 catalog 互斥均有源码及定向测试。 | 真正窗口和认知可用性仍需观察 |
| 视觉/响应式 | **NOT_TESTED**（本轮 R14.1 精确候选无原生 320/360/480px 截图）。 | 水平溢出、长名称、200% 缩放、真实宿主最小宽度 |
| 交互效率 | **组件阶段评估：92/100**。显式工具打开、列表卸载、审批、焦点恢复、跨视图 Stop 有回归。 | 真实人工点击效率和键盘实测 |
| 导入与权限安全 | **组件阶段评估：94/100**。孤儿数据隔离、Web Lock、安装基线再校验、iframe 消息匹配和撤权现有测试未放宽。 | 真实跨窗口时序、已进入 Chrome I/O 的卸载竞态 |
| 可访问性 | **组件/源码评估：90/100**。导航键/ARIA 相关合同存在；本轮增加焦点恢复。 | 屏幕阅读器、真实键盘、焦点可见视觉原生实测 |
| 真实 Chrome 兼容性 | **NOT_TESTED**（新候选的原生 Side Panel；历史 CFT 155 不自动继承）。 | 实际加载扩展、权限 UI、运行 owner/Stop、Sandbox、关闭和打开生命周期 |

上述四项数字仅用于指引人工复查的**暂估**，不等于可审计 Native PASS。**综合 95+ = NOT_VERIFIED；不计算总体通过分。** 无原始 Chrome 截图、准确宽度/浏览器版本/source/package 与 runId 证据，不能写产品完整验收通过。

## 5. 遗留风险与后续原生验收

- **原生验收 NOT_TESTED**：本次执行环境未安装/运行这个 main 候选的 Chrome Side Panel，也没有生成当前候选实际截图；不可用 Node DOM mock 或静态 HTML 代替。
- Mac/Codex 原生负责人取得独占真实 Chrome/CFT profile、测试端口后，以同一明确 main SHA 拉取，`npm ci`、`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`；开发模式目录为 `dist/development`，真实扩展与绑定的生产/开发包需明确区分。
- 根据 `AGENTS.md` 使用 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks` 并测试 `http://127.0.0.1:43111/demo-form.html`。分别保存真实 320、360、480px 视口能否设置（Chrome 强制最小宽时记录不支持而非伪造），四页签、空/多工具列表、导入和权限审查、同版本修改/回退/新增能力、打开/返回/卸载和键盘焦点、两个真实窗口异步竞态、任务已运行时切工具及原始 runId 的 Stop、SidePanel 关闭、iframe 断权/复用攻击的截图与原始观测。
- `sidebar-tools-native-probes.mjs` 的旧 `#sidebar-tool-tabs` 选择器属于 R1 历史入口，不能在 R14 当前页面上虚构通过；重建原生测试驱动必须使用真实四页签和可信 Chrome Input。
- 部分 Chrome storage 分阶段操作不构成跨 key 原子事务；卸载目录成功而删除数据失败可能留存孤儿数据。本轮同 ID 全新安装有清除保护，但**原生跨窗口与写入 I/O 竞态仍应验证**。
- 只在原生证据收集后讨论是否达到单项 ≥90、整体 ≥95 的验收目标。旧的 F3、603+19、ZIP 正式合同不是本轮关闭的内容，亦未制作 ZIP。

## 6. Git 状态与并行写入

报告写入前查看最新 remote main 为 `605920ac9b8419cfb90722be7a595a490ec2a117`；本轮上述三个代码/CI 提交已在 main 历史中。独立外部 Agent 的其他提交仍可能随后到达；不能把本轮历史 CI 当作任意未来 HEAD 的完整当前包证明。

- 报告写入前剩余远端分支：`main`。
- 报告写入前未合并 PR：无。
- 不修改其他 Agent 的编译配置、PR、分支、真实 Chrome 资源，也不假定访问了本地未提交工作。

