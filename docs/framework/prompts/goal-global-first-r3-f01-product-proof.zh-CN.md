# GOAL：OpenDesk Browser Global First R3 — F01 可运行产品证据与首次成功体验
> 日期 2026-10-13；默认中文。**直接执行真实仓库源码/原生验收，禁止只再写规划或创建脱离真实产品的 HTML 原型。** 本 GOAL 只解决 F01，不抢 F02/F04、Browser SDK、Native、依赖、Cloud 等工作流的共享运行时所有权。

## 0. 唯一目标与完成标准

把 **Developer Edition 的 Chrome Side Panel → React JSX / Vue SFC → 网站真实交互 → 源码修改再次 Run → Stop 清理** 形成第三方能按相同步骤复现、并绑定具体来源与构建版本的**最短产品体验**。

最终至少交付：
- **现有 Side Panel 中的真实操作**，不是静态 UI 或另一套编译器。
- **可验证的开发版构建身份、安装/首次授权说明**，同时明确与 Standard 不同；正式对外 Release/CWS 仍须独立授权。
- **React + Vue 两套真实网页交互、改动、Stop 原生回执**；若失败则确定原因和最小修复范围。
- **一个有现实价值的演示**：优先沿用 `examples/tasks/demo-form.html`，展示表单检查或填写进度的小组件，而不是只录 0→1 计数按钮；新增示例须在允许的独立目录并通过真实产品执行链运行。
- **竞品最强反例清单**，以同任务能力和公开可用时间为依据，未测试标 `NOT_TESTED`。
- **两段话的对外定位**，其中任何绝对世界第一声明仍不得使用，除非 GF-001 审批通过。

完成标志是“**产品链路与证据闭环**”，不是“文档数量增加”或把已有 35/35 SDK、F3/ZIP 项目改成 PASS。

## 1. 先核查主线与唯一修改权限

目标 `https://github.com/shopable-ai/opendesk-browser`，Mac 本地 `/Users/shopme/Documents/workspace/opendesk-browser`，唯一可写分支 `main`。

开始先读：
- `AGENTS.md`、`docs/framework/parallel-development.md`、`docs/framework/testing-guide.md`
- `docs/product/browser-extension-ecosystem/global-first-r2-decision.zh-CN.md`
- `docs/framework/workstreams/global-first-r2-20261013.md`
- `docs/api/page-ui-frameworks.zh-CN.md`、`docs/architecture/browser-framework/browser-compiler-editions-r245.zh-CN.md`
- `docs/framework/workstreams/browser-compiler-editions-r245-20261012.md`
- `docs/framework/workstreams/page-framework-r244-final-20261012.md`

执行 `git status --short --branch`、`git branch --show-current`、`git rev-parse HEAD`、`git fetch origin main`、`git rev-parse origin/main`。保留全部未提交修改。查看并行 Agent 的 workstreams、共享文件是否有活跃写入及 CFT/profile/43111/dist/ZIP 资源拥有者。若确有冲突，**继续只读审计及独立演示素材，不重置、不创建分支/worktree/PR、不覆盖文件、不抢共享环境**；明确交接哪一个文件/资源需要串行执行。推送与发布必须遵循本任务实际授权、Git 保护和 `AGENTS.md`。

禁止新增第二套 Browser SDK、编译器、Scheduler、Runner、依赖管理器，不扩大 Chrome 权限，不重建侧栏，不恢复已废弃 Page QA。已有运行世界、Authority、RunHost 与用户主动 Run/Stop 的安全边界必须保持。

## 2. P0：先核对已实现与历史真 Chrome 证据，拒绝重复造轮子

真实入口：
- `src/ui/tool.html` / `src/ui/script-editor.js`（只能在无所有权冲突且确有缺陷时作最小修复）
- `src/ui/page-component-preparer.js` / `page-component-compiler-worker.js`（受信转换，不执行网页业务）
- `src/scripting/user-scripts/`、`src/libs/page-frameworks/`（原 USER_SCRIPT、固定框架）
- `examples/programs/page-ui-react/`、`page-ui-vue/`（可复用源）
- `tests/framework/page-browser-worker-r243-cft.mjs` 与 `tests/framework/page-browser-ui-r243-cycles.mjs`（现成真 Chrome 驱动）

核对历史 CI：
- [38225425847](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847) 对应 `9cdb3bf98fe410b88c456801855e2635f6b1a7b0`，无 Native 侧栏 JSX/SFC→Run→指针交互→Stop。
- [38247467657](https://github.com/shopable-ai/opendesk-browser/actions/runs/38247467657) 对应 `176bb1916006ad98bb3d1b10c1b2f2d93a06d122`，Standard/Developer 双版、错误恢复与 Stop。

逐项检查最新 main 受影响源码/测试/构建包身份与旧版差异。历史 CI 成功不等于今日 main PASS；**仅同一输入/候选环境可复用的切片**允许标 `REUSE_RECORDED_PASS`，否则对应最新候选仍是 `NOT_TESTED`。

## 3. P1：构建和真实用户操作，一次打穿

先确认无人占用构建目录。依既有 `package.json` 和工作流运行定向 Node 回归，不修改版本预算：
```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node --test tests/environment/browser-editions-r245.test.mjs tests/environment/page-component-preparer-r243.test.mjs tests/environment/page-component-browser-linker-r243.test.mjs
npm run build:developer
npm run verify:developer
npm run pack:developer
```
npm 安装仅在允许修改依赖目录和锁/缓存归属时运行；如果其他 Agent 占用 dist 或生成目录，不抢锁。

**必须真实受控 Mac Chrome for Testing + 新独立 Profile**；若只能通过已有 CI 运行，则保存其完整固定 SHA/packageHash/真实 input 证据。参考 `.github/workflows/page-browser-ui-r243-cft.yml` / `.github/workflows/browser-compiler-editions-r245.yml`，其现有指令使用 `OPENDESK_R243_BROWSER_FULL_UI=1`、`OPENDESK_DEV_PACKAGE_DIR=dist/production-developer`、`OPENDESK_DEV_EVIDENCE`、`CHROME_FOR_TESTING_BIN` 及受控 CFT launcher。**没有 Chrome binary 或运行所有权时，明确 NOT_TESTED；不得用 Node fixture、伪造鼠标/DOM 事件替代。**

单个真实用户流程必须覆盖：

| 步骤 | 观察到的实际行为 | 必须记录 |
| --- | --- | --- |
| 首次安装与网站许可 | 明示 Developer/Standard 差异，Chrome Allow User Scripts、Site Access、受限页错误可理解 | 实际扩展 ID、版本、manifest、权限、截图 |
| React 源码 Run | 当前网页真实 React Hooks 组件可见且指针点击更新 | sourceHash、previewId、documentId、DOM/真实操作 |
| 改 React 再 Run | 实际结果来自新源码，没有旧效果残留 | 新/旧 sourceHash、原回执不重标 |
| Vue SFC Run | ref 交互与 scoped CSS 生效，语法错误拒绝后修复可重跑 | scoped CSS、真实点击、错误+恢复回执 |
| Stop 与范围 | managed-ui-only 元素、样式和自有监听器正确回收 | Stop receipt、DOM 清理前后、撤权/导航约束 |

有环境条件且相关输入发生变更时，使用现成 `OPENDESK_R243_BROWSER_STRESS=1` 驱动 React/Vue 各 20 次真实编辑→Run→点击→Stop，不直接执行仅导出 helper 的 `page-framework-r243-loop-native.mjs`。保留每次失败、未知效果、权限撤销、导航等原始证据，不将 unsupported 当做通过。

## 4. P2：最小用户体验修复与可理解 Demo

先核对产品是否已自然呈现以下信息；只有存在缺陷且**文件未被其他 Agent 正在写入**才改动：
- 代码类型选择和 Developer 限定、每个选择的基础示例/可运行提示；
- Run 之前缺少的 Chrome 权限如何恢复；
- Run/编译/Stop/错误的准确可见状态（不要仅成功弹窗）；
- 源码已变更但旧结果仍显示时应如何区分；
- 窄栏、暗色、键盘可操作和 200% 缩放可理解的最短路径。

演示优先基于已有 `demo-form.html` 和真实源代码，开发能解决可见网页问题的小组件：React 表单检查卡，Vue 表单完成进度。若有共享样例被另一对话编辑，改为本任务独立新样例目录；新代码仍走真正的 Side Panel、USER_SCRIPT 和原 Host，并进行对应 Chrome 真实验收。

**不能通过改 UI 静态文案假装后端能力已实现；不能自动触发用户网页修改。**

## 5. P3：最强反例与面向用户的差异化证据

审查 ScriptCat Stable 与 Beta、Tampermonkey/Editors、Violentmonkey、Web Dev Kit、vite-plugin-monkey + Tampermonkey/ScriptCat。逐一记录产品渠道、发布日期、版本、必要安装前提、是否能完成 F01 完整任务：原始 React/Vue 源码在浏览器内编辑、对当前网页真实交互、修改再 Run、停止受管资源。不得因对手需要 Vite 就将其判 FAIL，也不得将“导出 JSX”当作已证明“可在真实网页 Run+Stop”。

只对完成真实测试的对象写 PASS/FAIL/UNSUPPORTED；证据不明用 `NOT_TESTED`。世界首创需首次公开可用日期和等价反例历史核查；否则拒绝 GF-001 升级。**别让营销调查阻碍先完成 F01 原生体验**。

## 6. 最终交付格式与质量审查

回写权威事实到既有 `competitor-timeline.json`、`first-claims-ledger.json`，更新 `global-first-r2-decision.zh-CN.md` 的 F01 状态和本任务工作流/独立证据目录；不得增第二份 GF 或竞品机器总账。不复制旧完整日志、不改其原始回执。重要原生证据应含 commit SHA、packageHash、ZIP SHA、Chrome version、extension ID、launcher/profile、真实 sourceHash/previewId/documentId、图像/视频/逐项结果。

输出给用户**一屏就能读完的报告**：A 当前能否安装并用？B React/Vue 真网页闭环是否通过？C 距离可信领先仍差哪些可执行步骤？D 本轮真实修改文件/测试/提交？E 下一轮唯一 P0 是什么？先回答再链接底层文件。

质量独立要求：
- 产品首次成功体验、真实 Chrome 功能、安全/清理、发行身份、竞争公平性、营销准确性、文档可读性 **逐维度目标 ≥95/100**；实际未进行独立评分的项统一 `NOT_SCORED`。
- 必须无证据夸大：没有对外发布/全球第一/CWS 证明就不能自称通过。安全、权限和未被授权的发布为硬门槛，不被其他得分抵消。

**允许安全情况下的必要小修与独占 Demo 源码实施及定向测试；是否 commit/push 按当前任务用户授权与 AGENTS 规则，禁止默认自行 Release/CWS。** 若需要共享 R24.5/SDK/Native 源码变动且已有并行负责人，先交接，继续完成其余不冲突任务。
