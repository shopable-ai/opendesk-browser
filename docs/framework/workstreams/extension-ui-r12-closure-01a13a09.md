# Extension UI R1.2 产品闭环 · 2026-10-14

状态：ACTIVE。负责人：Codex 会话 `01a13a09-3d6b-70b0-ac41-745a99a8d6ce`，main。

起始本地 HEAD：`a851ee5ec0adcde72eb0d922f6b314cb339b0d78`；首次远端核查：`000c8aca43476a9926cb96dda2ac46782dace268`。仅 main，不创建分支/worktree/PR。

负责路径：`src/ui/scheduled-task-workbench.js`、`src/ui/tool-shell.css`、`src/ui/design-system.css`、必要时 `src/ui/tool.html`；测试 `tests/environment/scheduled-task-ui-r1.test.mjs`、`tests/environment/sidebar-component-contract.test.mjs`、`tests/framework/scheduled-tasks-r1-native-mac.test.mjs`；本记录。扩展前核查 diff。Cookie Editor/Workflow/Stay Focus/书签业务由其他负责人维护，不覆盖其文件。

导航：我的 → 定时计划列表 → 单个详情 → 创建/编辑 → 来源详情或列表；任务管理独立子视图；运行页复用 `tool.html?scheduledRunner=1`。验证草稿、轮询、历史与返回焦点，不增加 Runtime/Authority。

通过条件：定向 Node 证明实际修复；构建与包校验；新增 Chrome 断言绑定真实输入/几何/截图。R3/R19/R21/R2.3 先核对输入，旧包结果保持原身份；评分缺证据保持 NOT_SCORED/NOT_TESTED。

资源：已有 npm dev PID 33560 独占 `dist/development` 和 `.wxt/public`；保留 watcher，不绕过构建锁。原生使用本轮输出 `artifacts/extension-ui-r12-01a13a09/` 与现有驱动临时 CFT Profile；不占个人 Chrome、不改 Native 配对。Git index/HEAD 写入在最终集成窗口串行。

只读子 Agent：已有证据/CI影响核查、六 Tab 缺陷审查；共享源码由本负责人落盘。初始目标文件无未提交改动。

P0 基线 74/74 PASS；新增组件回归先复现 3 个 FAIL（详情技术展开/焦点丢失、管理返回焦点/滚动、外部删除留空），最小源码修复后 78/78 PASS。120 条模拟历史分页与 20 条模拟计划隔离通过，仅 NODE_COMPONENT。

P1 范围确认：导航栏裁切外向焦点框（六 Tab 消费者）及云控页首未复用 od-page-title（只改标题，不改云控行为）。新增验证写入现有 `scripts/tests/sidebar-r19-layout-visual.mjs` 和 R3 workflow；共享 runtime、SDK、动态工具信任边界无修改。

本地双构建由开发锁阻止（PID 33580 / 43120），不绕过 guard 或停 watcher；使用 GitHub Actions 构建当前提交包。R3 原候选26/26 + 原生1/1经连接器日志核实，保留其原SHA/包身份；本轮受影响项单独验证。

集成窗口：远端 `68badfe4` 已含另一轮计划保存成功/刷新失败区分及晚到轮询保护，属于兼容的已提交变化。FF 因本轮两个目标文件有本地改动而安全拒绝，未覆盖任何文件。先提交本轮已通过组件验证的独立补丁，再在 main 合并最新远端并保留双方测试/修复；只处理明确冲突的 import 行，不 stash 其他工作。

源修复提交 `7a633ccb`，兼容合并 `5a1797e6`，定向101/101。R19六Tab静态Chrome272样本PASS（独立profile已关闭）；随后由独立子Agent增强同一驱动，不覆盖生产源码。

本地 npm check 在其他负责人未提交的 `tests/environment/native-agent-chrome-real.test.mjs:302` 遇到重复 extensionId 声明，保留原失败 `/tmp/ui-r12-check.log`，不编辑该文件。为验证已提交输入，使用 main 的 git archive 普通只读源码导出到独立 `.runtime/extension-ui-r12-01a13a09/candidate/`（非Git工作树，不在导出目录改源码），共享 node_modules 只读链接，独立 `.wxt/public` / dist / 输出守护端口43220；日常watcher继续运行。

R3现有原生驱动增补 PRODUCT_MATRIX：真实UI创建19个暂停计划，20计划/长文本/最后详情/返回焦点与滚动、编辑任务管理草稿、技术详情刷新；只用既有可信输入与真实存储，不seed Fire/Run。120历史仍为组件/源码布局模拟，不提升为原生。物理宽度与真实zoom分别记录。

追加写入范围：`scripts/prepare-public.mjs`、`scripts/verify-package.mjs` 的单一现有资产合同。远端 `cd56a564` 在 `tool.html` 引入 `extension-center.css`，两个包装脚本尚未登记，导致新样式无法打包且 HTML 引用校验必失败；只接入静态 CSS 和校验，不修改并行扩展中心业务。实际审阅修复：局部历史错误成功重试清除、最终分页按钮焦点回到历史标题、权限恢复按钮轮询焦点、失败说明12px；原生矩阵改用现有可见 header Back。物理候选4真实Alarm/Run/Result/released通过，360实测；其他宽度未达，原生矩阵随后因旧隐藏Back失败，原始失败保留。

## 2026-10-14 用户导航授权与原生选择复验

用户明确保留 R4 五个正式 Tab：我的、扩展、工作流、开发、云控；现有 R19 精确标签与往返焦点验证改按该契约，历史六 Tab 证据不改写。最新 candidate5 原生失败停在重开表单的任务下拉占位项，真实箭头输入无效；改用现有 PID/前台/AX 约束下的精确可见菜单项 press 并保留实际 value deadline 校验，不写 DOM value、不发 synthetic events。组件返回测试改用用户可见共享 header Back。candidate5 npm verify 已 PASS；新输入驱动需要复验。

R4 五 Tab 复验扩展范围：仅 src/ui/extension-center.css 普通图标/触摸目标样式和现有 tests/environment/extension-center-r4.test.mjs、scripts/tests/sidebar-r19-layout-visual.mjs 源布局场景。该 CSS 当前 main 无未提交修改；不触碰扩展中心 JS、安装/卸载/Authority，也不覆盖 Cookie/Stay Focus 并行修改。现有发现功能在 我的→查找本机任务，R19 应映射到当前 section。

并行分工：native executor 子 Agent 独占 src/ui/scheduled-task-workbench.js 与 tests/environment/scheduled-task-ui-r1.test.mjs 进行等价任务 option 节点保持修复和回归；leader 不同时编辑这两文件，负责 CSS/R19/native driver/Git 集成。此为组件可复现的元数据更新风险，不宣称已证明 AX 原生失败因果。

文件交接：收到R1.3会话01a13a4b-5823-7461-9e07-c673054fb4fa记录后，leader确认本轮tool.html公共标题改动已提交（当前仅R1.3 diff），本轮不再写tool.html，交还该文件给R1.3。保留workflow-observation-scope/revoke和AI许可新文案。R1.2验收包使用明确提交的git archive；不混入未提交R1.3源码。无日常Chrome/profile占用；独立CFT/43220/output仅R1.2受控测试。Git写入需明确串行窗口。

最终复审补修：帮助恢复按钮消失时焦点回共享header Back（先组件FAIL再修）；EC详情/名称按钮和授权范围字号加入现有R19静态fixture目标与字体验证，保留现有窄宽度R4结构。追加测试辅助scope tests/framework/time-review-native-input.swift，仅click-at先真实mouseMoved再click，PID/bundle/AX/窗口/前台守卫保留，不改任何生产Native命令；原生sourceBinding加入该Swift源码，Profile独立编译，不影响已启动其他CFT。candidate8源码check PASS、Node109/110仅R4旧23px pattern失败（现更新34px），R19全量292静态+110source UI+10nav矩阵PASS；native8已观察真实AXMenuItem坐标但value未变，整体FAIL，不提升为产品PASS。

最终候选9=f1fe23d6：111 Node、688语法、R19 292静态/110模拟UI/10导航、production/development/verify及运行页真实Tab缩放均PASS。生产包0b5bea01…、development bf840d2b…；tool-shell518416B低于原524288门槛。native9真实坐标+mouseMoved仍无法选中Task，失败保留。已读取R3 run38560934811原始日志：f2e35833产品矩阵开启、38Node/1macOS原生PASS、生产包52cf63bf…、Alarm/Run/result/released真实。恢复这一已验证AX菜单press并撤回本机未证明的鼠标试验；不改生产功能，也不删除选值deadline。当前原生复验缺口保持FAIL/NOT_TESTED。
