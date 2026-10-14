# Extension Center R4.1 · Mac 原生验收

- 负责人：Codex 对话 `01a13a66-a012-7070-928d-6457ac5fc758`；状态 ACTIVE。
- 开始：2026-10-14；本地 main `48f28291`；已读取远端 main `6f5e7ff3`。两者分叉，先安全合并，保留本地修复与远端书签保护。
- 目标：正式五 Tab 的真实 Mac Chrome 产品验收，实际失败修复、回归、双构建与包校验、独立十维评分、安全提交。
- 当前缺口：历史 R4 组件/CI 不能替代本候选的真实 Side Panel 安装及完整用户操作、响应式/无障碍证据。
- 写入范围：本工作流、`docs/framework/evidence/extension-center-r41-01a13a66/`（原始记录）、必要的新专属验收驱动。发现源码缺陷后逐个扩充明确路径。合并涉及文件按 Git 实际冲突单独记录。
- 并行边界：已有 Cookie Editor、Workflow、`src/ui/tool.html` 等修改全部保留；本轮不接管这些写入。子 Agent Gauss 只读梳理历史证据与最小回归。
- 资源：`.runtime/extension-center-r41-01a13a66/` 独立固定源码快照、构建输出及 CFT；不改日常扩展加载目录/ID，不停止现有 `npm run dev` PID 33560，不占其他 Profile。沿用 43111 demo-form 只读测试页面，先核对服务。
- 通过条件：十个用户流程及指定视觉/键盘矩阵有当前候选原始证据；R4/Sidebar/Task/Page 回归、check、生产/开发构建和校验通过；独立十维每项 >=95。缺失项标记 NOT_TESTED，失败保留。
- 验证身份：快照固定源码与未提交差异分别绑定；快照构建 PASS 不自动提升为含并行变化的最新 main PASS。最终核对相关漂移，仅补受影响项。
- Git：仅 main；不创建分支/worktree/PR。当前任务授权安全提交；共享索引/HEAD 串行操作，暂存仅本任务路径。无 release/publish。
## 2026-10-14 原生操作进展与窄范围修复

- 实际候选：30586c0457d04503becf73103dcf99d33d2e6e67；生产包 eac0d67dc08a9c1675c5aad99b0f76a915066b6eba930dffaef16b4c7a224805。独立 CFT PID 13199 / Chrome 155.0.8059.39 / ID mldjeihjkmpfkdekkkinfppihccmmfkf。所有输入来自 cua 原生 UI，观察器只读。
- 已操作：五 Tab、默认混合列表、搜索/空状态/清空/筛选/Escape、官方市场审阅安装 Markdown 工作台并打开/启停、开发 Page 试运行/保存/验证/安装/新文档自动运行/禁用、原安装器本地包导入知识收件箱、真实 Chrome 书签权限/收藏/返回焦点。
- Task：官方包先保持待验证；同源码运行 d860497f-b095-4ef8-bb78-03bd0e0305b6 经持久结果与原生回执核对后正式安装；“我的”参数运行 R41 Installed、历史结果、搜索/清空通过。暂停保存并恢复真实计划 R41 Native Schedule，等待 21:29 Alarm。
- 原始观察和正式截图：docs/framework/evidence/extension-center-r41-01a13a66/，不覆盖已有文件。旧候选证据不提升为当前 main 整包 PASS。
- 实际视觉缺陷：搜索 SVG 继承默认 fill:black 且无 stroke，放大镜成为黑点。扩充写入范围仅 src/ui/extension-center.css 的 .ec-search svg。当前此文件无未提交修改；R1.2 负责人已完成并提交公共样式收尾（99d3150a），该最新规则全部保留。本任务接管此窄修复，不修改其计划代码和测试。
- 修复计划：复用现有线性图标属性 fill:none / stroke:currentColor / stroke-width 与圆角；不改布局、运行时或授权。先保留正式截图失败，再构建新候选复验可见放大镜。
- 实体宽度：Chrome AX Decrement 无尺寸变化；坐标拖动得到 windowNotFoundAtPosition，保留为观察方式失败。不得将静态/CDP 模拟宽度冒充实体宽度。

- 第二个确认缺陷：已安装应用详情仅有「来源以原安装事务和权限记录为准」占位说明。扩充独占写入 src/ui/extension-center.js、src/ui/extension-center-model.js、tests/environment/extension-center-r41-source.test.mjs；当前这两个产品文件无并行未提交变更。复用 MARKET_PROVENANCE_STORE 和 sidebarToolPackageHash，展示真实固定包来源及摘要，不增加数据库/权限/安装器。回归先行：source-regression-before.log 因缺失来源函数而 FAIL，后续需测试及真实包复验。

## 2026-10-14 开发方式核对与新对话交接

- 用户要求说明当前模式、纠正后续开发方式并提供新对话提示词；本段为交接，不代表最终验收完成。
- 本轮新增写入声明：`AGENTS.md` 的日常开发条款、`docs/framework/extension-development-r131.zh-CN.md` 的模式说明、`docs/framework/prompts/continue-extension-center-r41-dev-native-20261014.zh-CN.txt`、本工作流及专属证据。写入前这两个既有文档均无未提交差异；不修改其他 Agent 的 Cookie/Workflow/tool.html 等内容。
- 实际验收运行的是独立 CFT 的静态 production 包，没有调试 Tab 或开发连接。日常仓库 watcher PID 33580（npm 父进程 33560）仍持有 `.wxt/public` 和 `dist/development`；本轮未停止它，也未改日常 Chrome 的扩展路径/ID。
- 源码合同：`src/entrypoints/tool-shell.js` 使用 `MODE==='development'` 显示调试，使用 `COMMAND==='serve'` 安装自动更新客户端。因此 `build:dev` 有调试但无持续更新；是否有调试不能单独证明热更新正常。当前 dev 默认 Developer edition，与 production/development 构建模式是两个维度。
- 本轮修复提交：`6b15d3f4`（放大镜线条）；`3727bc01`（复用原市场 provenance 与固定包 SHA 展示安装来源）。194 项定向回归 PASS；candidate3 check 检查 689 文件 PASS，production/development build 与 verify PASS；全部仅限该快照，不覆盖其他并行未提交变更。
- candidate3 production：`7e80bd981a0f9059dc2972a7b100fa60f044065c2d717f479ca631a9de58e044`；development：`3875c0ae10f27ad24b1f8cc572be40aef5e0c0d981697e5be1228ca1001041aa`。
- 旧 production 原始字节保存在 `.runtime/extension-center-r41-01a13a66/candidate/dist-30586-frozen/production`，旧原始证据未重写。在同一验收路径停用扩展后，已将 candidate3 的 dist 复制到原加载路径并重新启用，保持 ID `mldjeihjkmpfkdekkkinfppihccmmfkf`。只读 `handoff-after-package-replacement.json` 确认实际目录为新 hash、BACKGROUND 已启动；尚未重新打开 Side Panel，不能认定两项修复已有新包原生确认。
- 原包完成真实一次性定时运行：run `fd324f7a-35bd-4004-a7a4-e582489e2f79` / result `896a5e02-a017-4bc5-810b-d3a68b6d71c0`，completed、retirement released，原始证据 `alarm-native-success.json`。手动安装任务运行 `5e6b8044-3a39-4f15-bed2-c0619b22612b` / result `124e3c74-cad5-411c-90f4-6f1668faa45e`。旧包核心证据不能提升为新包整体通过。
- 独立只读 reviewer 结论 PARTIAL；十维旧包限定分依次为 88/90/86/92/90/94/88/75/93/85，均未达到全项 95。评分不代表最新 main 或 candidate3 的正式分数；其关于当前 HEAD 的观察是当时 3727bc01，续接必须重新读取。
- 未完成：新包两项缺陷复验；300/320/420/520 实体 Side Panel 宽度；125/150/200 对 Side Panel 的真实缩放行为（125% 只观测到业务页缩放，面板仍 360px）；完整键盘/屏幕阅读器；大量记录/长内容矩阵；“我的”任务停止等剩余场景；同一最终候选的验收与十维独立评分。全部维持 NOT_TESTED/PARTIAL，不宣称 95+。
- 续接先用已有持续开发环境修复与定向验证；需要交接日常浏览器/资源时先核对实际 owner。收敛后只冻结并构建正式候选，再回到验收专属 Profile 做受影响复验。不要继续以反复复制 production 包作为日常修复循环。
