# React R37 · 正式入口与本地交付记录

状态：**PARTIAL / RELEASE_NOT_VERIFIED**。已验冻结双候选的本地核心链通过；当前工作树出现并行输入漂移，外部链与正式验收未关闭。基线 `dea31e91d6005915f6705cdfec93249e90b7e7e9`，仅 main，未创建分支、worktree 或 PR，未提交、推送。

本页末尾的“本地最终候选与当前边界”是最新状态。下列基线记录保留历史，历史 PID、端口、加载路径及“尚未产生候选”不代表当前现场。

## 依赖审计与清理计划

| 分类 | 消费者 | 处理 |
|---|---|---|
| MIGRATE | Manifest、prepare-public、构建白名单、包校验、可信文档识别及内部导航 | 统一根目录 sidepanel.html，严格保持原身份及参数校验 |
| REACT | App Shell 导航、五 Tab、目录、Dock、Debug | 空挂载节点直接渲染；保留现有页面及 Controller |
| KEEP | 原 Controller、RunHost、Authority、SDK、Sandbox、编辑器和工具 iframe 容器 | 保持业务权威；React 仅创建容器并负责其 UI 生命周期 |
| DELETE | tool.html、prepareSidebarAppShell、静态导航/Dock 接管、scaffold、Debug 旧节点 Portal | 行为锁定后删除，不建立旧路径别名 |
| REACT / DELETE | MyControl、DevelopField、ToolField 及 View | 按真实消费者核实，保留显式呈现状态和事件边界，删除 DOM 模拟及重复监听 |

顺序：锁定行为 → 空根启动 → 正式入口/路径切换 → 清理过渡实现 → 定向回归 → 独立候选构建 → Mac Chrome 与五视角审查。测试覆盖真实渲染、输入、动作、状态读回和卸载；安全夹具验证错误路径及旧模板会被拒绝。

## 基线及并行写入

- 已有未提交修改涉及 my-controls、my-sections、tasks、scheduled-task-workbench、tool.html 及对应测试；保留其任务/计划行为改进。
- 已有 `node scripts/dev.mjs` watcher（PID 41022）；不停止或启动第二 writer。
- 真实 Mac Chrome 已打开日常扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`，文档仍为 `ui/tool.html?hostInstanceId=…`。已执行“开发 → 我的”，任务参数及既有结果可见。
- 正式候选尚未产生；旧文档和既有测试结果均不能证明 R37 交付。

## 验证与未完成项

实施后追加精确命令、候选指纹、真实用户操作、五视角发现及未消除风险。未执行的 Mac/安装/权限动作保持 NOT_TESTED；不得据源码或 SSR 评为 95+。

## 本地最终候选与当前边界（2026-10-19）

已验冻结候选的真实操作：五 Tab 导航与输入保留、Controller Run/Stop、工具详情/沙箱/设置和 Panel 重开；Tools 停用/启用读回及独立工具页；Task 从导入开始的安装、运行、暂停计划、编辑、Runner 与删除；Developer Debug、React/Vue 准备、保存、计数器交互、Stop 状态及精确 retirement receipt；Page 验证、安装、更多/详情、停用、启用同一注册及卸载。各项证据分层列于下表，不以组件测试替代原生操作。

当前不能宣布源码/正式发布完成：收尾复核期间 `src/ui/script-editor.js` 与 `tests/environment/script-editor.test.mjs` 发生并行编辑。首次核对时现行验证输入 10/10 与索引相符；随后产品输入和对应测试不再相符。已验包与回执未变，**包证据继续有效，当前工作树不再等同已验源码**。保留新增改动，不覆盖这两份文件，不把未冻结的并行编辑自动装入已验包；该部分等待 owner 冻结后按实际影响补验。其余文档与审计收尾继续。

### 冻结输入与构建入口

- 普通源码快照：`/private/tmp/opendesk-r37-candidate`（`/tmp/opendesk-r37-candidate` 为同一路径），保留其 node_modules；不是 Git worktree。冻结清单见 [final-product-inputs.json](../../artifacts/r37-current-freeze-20261019/final-product-inputs.json)，共 1,668 项同步输入；每份真实 build receipt 另记录 618 项实际构建输入。
- 所有构建均在快照 cwd 串行执行。最终 Page 卸载修复这一轮使用独立 evidence 目录 `artifacts/r37-build-page-uninstall-fixed-20261019`，保留此前 `artifacts/r37-build` 和旧候选记录。
- 命令沿用现有 `scripts/build.mjs`，仅 evidence 目录区分尝试：

```sh
OPENDESK_OUTPUT_GUARD_PORT=43129 OPENDESK_BUILD_EVIDENCE_DIR=artifacts/r37-build-page-uninstall-fixed-20261019 node scripts/build.mjs production
OPENDESK_OUTPUT_GUARD_PORT=43129 OPENDESK_BUILD_EVIDENCE_DIR=artifacts/r37-build-page-uninstall-fixed-20261019 OPENDESK_BROWSER_EDITION=developer node scripts/build.mjs development
```

| 项目 | production / Standard | development / Developer |
| --- | --- | --- |
| 快照输出目录 | `dist/production` | `dist/development-developer` |
| packageHash | `fc60cf538f50eaaaf451041dd9bfcf65965f9473e8537ee536db820baddf33d0` | `531b5236c833be8423832868240c222bf56f38a45a25aac06991c1b2ff5b5a38` |
| 资源数 | 104 | 153 |
| attemptId | `829fad2b-99de-40c9-81c6-e347c2ede593` | `73cc706a-db4f-4f0d-8062-1ccaacbaaeab` |
| build receipt SHA256 | `c9d8c0836ab987a948e68c6d11ec3f4ee5be32e23158bb7b658284b6870de0bc` | `1e34ba845d5a84650a8b6cf1e2bf01e231612bcc3ae72782780e427248850b3d` |
| sourceDriftDuringBuild | `[]` | `[]` |
| 原生扩展 ID | `chkhaljgenbmndkknjhcmohlgjdbpnkk` | `mhpfgdfhjnopjmahggjbbgajlkbjjcib` |

构建日志、原始 receipt、独立 profile/CDP 与原生 documentId、驱动源码哈希和报告路径统一见 [evidence-index.json](../../artifacts/r37-final-local-20261019/evidence-index.json)。收尾时直接调用现有 `verifyPackage` 再读两包，实物哈希仍与上表相同；没有重复构建。浏览器驱动须使用快照 cwd、对应 edition 和真实 receipt，不能用仓库默认构建配置替代。日常 `dist/development`、他人 watcher、个人 Chrome、Cloud 配对及 Native 配置未改。

### 真实操作与证据分层

以下路径以 `artifacts/r37-final-local-20261019/` 为根；截图及日志与各报告同目录。

| 用户操作 / 证据层 | Standard | Developer | 实际范围 |
| --- | --- | --- | --- |
| 已安装扩展标签页与目录入口 | `production/installed/report.json`：PASS | `developer/installed/report.json`：PASS | 新 profile；真实包、extension ID 和 build receipt |
| 原生 Mac Side Panel 核心 | `production/native/report.json`：PASS_CORE_WITH_EXTERNAL_NOT_TESTED | `developer/native/report.json`：同状态 | 五 Tab、草稿保留、Controller Run/Stop、Quicknotes、设置、迟到结果拒绝、关闭重开 |
| Tools 首次真实运行 | `production/tools/report.json`：PASS | `developer/tools/report.json`：PASS | 启停 storage/UI 读回；独立工具标签页单 Root、所属 iframe；不是离线预览 |
| 完整 Task 默认链 | `production/task/report.json`：PASS_TASK_AND_PAUSED_SCHEDULE | `developer/task/report.json`：同状态 | 导入→草稿执行→审阅安装→已安装执行→创建暂停计划→Runner→编辑→删除确认；Runner 为“等待计划”，不宣称定时触发执行或历史压力矩阵 |
| Developer 组件与 Debug | 不适用 | `developer/compat/report.json`：PASS_NATIVE_CORE_WITH_PREVIEW_REFERENCE_ONLY | Debug 刷新；React JSX/Vue 准备保存、列表读回；真实页面计数器 0→1；Stop 后可见组件状态及用户展开的真实回执 |
| Page 管理与卸载修复 | 未单独执行该补充链 | `developer/page-management/report.json`：PASS | localhost 固定范围，验证→安装→更多/详情→停用→启用同一注册→卸载；实际原生注册清空，不代表既有网页副作用自动回滚 |
| 已保存作者源码精确读回 | 不适用 | `developer/source-readback/` | 补充定向观察；最终状态见本目录报告与索引，不与 Run/Stop 计数相加 |
| 离线 UI Preview | 不作新候选 PASS | `compat` 中 REFERENCE_ONLY | 仅引用旧 freeze/generation/browser 日志原字节哈希；`inputClosureVerified=false`、`frozenCandidateVerified=false`、`previewExecuted=false` |

### 本次发现、修复与继承边界

1. **真实产品缺陷：Page 库卸载遗漏 installationId。** `src/ui/page-program-library.js` 现在从已安装记录捕获 installationId/generation，身份不完整本地拒绝；真实确认后通过原请求发送精确安装身份。Authority/schema 未放宽。定向先红后绿见 `page-uninstall-red.log` / `page-uninstall-green.log`：绿灯 11 PASS、3 SKIP，跳过不折算通过。修复进入上表双候选，Developer 原生卸载链通过。
2. **观察错误：Stop 错把隐藏共享字段当用户入口。** Developer 驱动改核对可见组件状态、真实点击展开技术回执，并保留 previewId、编译后 sourceHash、receipt.ok、managed-ui-only 及投影深相等断言。没有为迁就驱动改业务 UI。首次失败留在 `artifacts/r37-current-20261019/developer/compat/`。
3. **观察中间态：Page 启停注册收敛。** 初次观察与修正后 E_SCHEMA 均保留在 `artifacts/r37-current-20261019/developer/page-management*/`。最终链等待 Authority 与原生注册均收敛，不凭点击或中间 ACK 判通过。
4. **继承修复与证据。** 空根/唯一入口、React Shell/五页、Develop/Tools fallback 退出、设置、Page 菜单身份、Focus epoch、三项生命周期、正式 HTML 门禁、Stop 投影及离线预览修复继续以现有源码/四审计/三份独立审查为证据。Stop 的 [212 PASS 日志](../../artifacts/r37-component-stop-fixed.log)与旧独立复核只绑定其中记录的 `script-editor.js` SHA `4281d9be060bbde8c0c020c34af2d05a7f6175cb0d9dd778d87b752fcd49bbc4`，不能覆盖收尾期间的新编辑。

本次收尾没有重新迁移或设计可信 UI，没有恢复旧模板/renderer/DOM 搬运，没有新增 Host、Authority 或 Sandbox。必要命令式边界仍是既有编辑器、工具 iframe、页面组件预览、浏览器/Native 控制器与生命周期；动态 iframe 代码保持原信任级别。继承的广泛未提交改动与本次文档/验证产物分开核对，未撤销并行工作。

### G1–G10 行为映射

**原编号表未找到，按本轮明确完成条件重建映射。** 依据既有 [R37 续接提示词第 207–218 行](../framework/prompts/continue-opendesk-browser-react-r37-20261019.txt)；不是找回原表。恢复原表时按语义对齐，保留全部具体要求。下述“候选”均指上表精确双包，当前工作树的漂移不折算通过。

| 项 | 行为 → 当前实现 / 验证 | 证据 / 结论与缺口 |
| --- | --- | --- |
| G1 | 唯一正式 `sidepanel.html`、旧 `tool.html` 退出输出 | 双包 verifier/receipt PASS；原 `sidepanel-path-r37` 与构建审计保留 |
| G2 | 源 body 空挂载；`src/ui/react/` 单 React Root | HTML 正反门禁、installed/native/独立工具与 Runner 单 Root 证据；不恢复 scaffold |
| G3 | 五 Tab、导航、Dock、必要对话框、development Debug | 双候选原生导航与重开、Task 删除确认、Developer Debug PASS；并非所有对话框穷举 |
| G4 | React 状态/事件，旧 renderer 退出 | 既有架构/测试审计与同候选 UI 动作；未用 DOM fallback 补测试 |
| G5 | 合法命令式边界、停止/卸载/撤权生命周期 | 原生命周期日志、Controller/组件 Stop、Page 卸载；当前编辑器输入漂移待重新冻结，Native 外部效果未测 |
| G6 | 原功能及 JS/JSX/Vue、独立工具兼容 | 双候选核心与 Developer compat/源码读回补充；Native 本地项目动态预览未测，不称所有旧工具全矩阵通过 |
| G7 | 安装身份、权限、CSP、撤权及未知效果保护 | 安全审计/独立复核、卸载安装身份回归、真实 Page 注册链；未伪造授权/回执，不外推 native idle/DNR/AI |
| G8 | 隔离构建、mode/edition、精确 provenance | 双 receipt/cwd/attemptId/hash/sourceDrift 均对应实物；当前 main 后续漂移单列，未覆盖共享输出 |
| G9 | 同候选原生 Panel、独立 Tool、Preview、Catalog、Runner | 已执行层分别列证据；离线预览仅引用；Native 动态 Preview 和外部链 NOT_TESTED，因此 PARTIAL |
| G10 | 证据闭环、五视角和交付结论 | 现有文档/四审计/三旧独立报告与最新限定核阅关联；未完成正式 F3、ZIP 或独立评分，因此 RELEASE_NOT_VERIFIED |

### 独立范围与七维评价

原有三个 native subagent 的限定审查覆盖 React 架构、Chrome 安全、构建发布、产品交互、测试可靠性五个视角，**不等于五位专家签字**。三份原报告为 [React](../../artifacts/r37-react-independent-review.md)、[安全](../../artifacts/r37-security-independent-review.md)、[构建/产品](../../artifacts/r37-build-product-independent-review.md)。各报告的作者切片排除、运行范围与历史时点继续有效；本次只读子任务对最终报告、Page 卸载及 Stop 观察更正另作限定核阅，不接管旧作者独立性，也不冒充实际运行者。

| 维度 | 证据范围与未关闭项 | 评分 |
| --- | --- | --- |
| React 架构 | 空根/单 Root、五页 owner、旧路径门禁及已有独立审查；当前编辑器改动不在冻结审查内 | NOT_SCORED |
| 功能兼容 | 两版核心、Tools/Task 与 Developer 组件；Native 项目和外部生成链未测 | NOT_SCORED |
| 生命周期 | Stop 精确回执、迟到结果拒绝、重开与 Page 注销；未知外部效果不外推 | NOT_SCORED |
| Chrome 安全 | sender/CSP/身份、真实站点范围及固定注册；非全部能力原生矩阵 | NOT_SCORED |
| 构建交付 | 双候选实物/receipt一致；production tool-shell 1,032,007 / 1,048,576 字节，余 16,569，保留 critical 软告警；未做 ZIP/F3 | NOT_SCORED |
| 测试可靠性 | 既有定向日志、真实驱动断言、失败证据及观察修正；不把 skip 或旧候选累计成新 PASS | NOT_SCORED |
| 产品交互 | 正常窗口下原生导航/编辑/工具/任务/组件操作；未独立定量评分，宽度与缩放专项 OUT_OF_SCOPE | NOT_SCORED |

以上不是数值自评或独立专家 95+；没有以总分掩盖缺口。

### 剩余条件

- **当前源码交付阻塞：** 编辑器与测试有并行变化，先明确 owner 冻结点，再只对实际受影响行为补验/重建；当前原始快照与候选保留，未覆写。
- **AI 外部生成链：NOT_TESTED。** 独立 CFT 未配对 Native/Codex/provider，不能证明真实新生成源码经审阅、安装和无模型重复执行。
- **Cloud：NOT_TESTED。** 缺少本候选的 provider 配对、远端授权及明确批准范围。仅验证了未配对状态页。
- **Native / 动态 Preview：NOT_TESTED。** 缺少授权的独立 Native pairing、Workspace/本地项目与实际动态 Tool Preview 条件；native idle、DNR、AI 外部效果亦未验证。未修改个人配置来补条件。
- **正式关闭：NOT_TESTED / NOT_SCORED。** 最新全范围独立七维评价、F3、ZIP 安装一致性未执行。候选本地通过不提升为正式 RELEASE_PASS。
