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

## 用户要求续接的关键 checkpoint（2026-10-14）

最新范围：保留 R4 五 Tab「我的、扩展、工作流、开发、云控」。用户最新明确「不要考虑缩放」：后续不新增浏览器缩放测试、修复、评分或将其列为关闭缺口；既有原始记录保留。响应式继续验证实体侧栏宽度、长文本和溢出。不得从头开发计划功能、另写总 GOAL 或重复全量矩阵。

Git：生产修复已包含在 `1774b9dbf6ca9d690ecbf80f0411b4adb2023e3d`；`e008debfd33df660acfde7b4c46dfd3183c9d7c7` 恢复已验证 AX 菜单操作，撤回坐标和 mouseMoved 试验，仅测试文件变化。`99d3150aea92269a0df86408203aadd66de39d62` 正常 push main 成功（exit0），包含两者及 Cookie/StayFocus 并行提交。之后远端已观察到 `7a89024a68ce438fa7da7eeccd3c97830be26a1b` 推进，续接先核查最新 main，不冒充已经核验该整包。最后两次集成使用固定 parent/tree、空 index、前后 hash 守卫，23 个原有 dirty 文件字节均保留；审计在 `artifacts/extension-ui-r12-01a13a09/merge-final-working-bytes-audit.json`。本 checkpoint 追加未单独提交，保留供下一会话显式接续。

生产变更：计划草稿/管理返回/刷新焦点与滚动保持、按 FireId 保留展开历史、外部删除返回列表、历史失败可重试且不覆盖其他错误、最终页按钮消失焦点回历史标题、恢复操作消失焦点回 header Back；等价 Task 元数据保持 option 节点，真实 eligibility 变化仍更新且固定编辑身份不变。公共样式：Tab 焦点框不裁切、Cloud 复用标题、计划状态/历史 12px、扩展普通按钮34/coarse44px、名称/详情控件目标与授权文字12px、复用现有半径 token；包装脚本登记 extension-center.css。无第二 Runtime/Authority/RunHost，无 EC/Cookie/StayFocus 业务重写。

冻结候选9：`f1fe23d6e60b0e394e846c7e9a9c6eea8eb46e71`，普通 git archive 位于 `.runtime/extension-ui-r12-01a13a09/candidate9`，不是 worktree。Production hash `0b5bea011b48c124cbcd925505cb9f6052ab9679e957a397729ddd457e90ff9a`；development hash `bf840d2b7bf4bdc48ec13d55004e5aa25605f0d4157a5f3817ea73a6dd50c292`。check688、Node111、build/build:dev/verify、sourceDrift空，PASS。tool-shell 518416B < 原524288门槛，不依靠另一负责人提高预算。最新 main 合入其他包内容后不能把该整包 hash 改绑新 SHA，只按相关源码 hash 复用局部证据。

R19最终证据：`artifacts/extension-ui-r12-01a13a09/r19-final-candidate9/metrics.json`，Chrome155.0.8059.39，inputsStable=true，292静态布局 +110模拟计划界面 +10导航 +3键盘，PASS。宽度300/320/360/420/520、light/dark、空/20计划/120历史等，DOM几何和实际Chrome输入有断言；不提升为真实安装/权限/执行/物理宽度。EC detail/name/font另有 `r19-extension-detail` 78状态+10导航（含200/240）。原始失败和截图不覆盖。

真实R3证据：run https://github.com/shopable-ai/opendesk-browser/actions/runs/38560934811 ，f2e35833fc272d990d9172df49c19902e16613a5；38Node/1macOS native PASS，原包52cf63bf1286384681f0143402e913616a166d280c7d942563a4356485aa1a3a。完整 report 原字节已提取到 `artifacts/extension-ui-r12-01a13a09/r3-f2e-original-native-report.json`，ZIP digest与GitHub一致 `fb3115cfe4a081d93dfaf718398fc498af48e8dca6a2500cf65d0eec9a8670fa`。明确PASS：真实安装/空列表/创建/Alarm/Run/result/released、管理草稿/焦点/拦截覆盖、丢弃确认/JSON恢复、四种规则编辑、两计划删除隔离、20个真实暂停计划/最后详情返回/展开历史刷新。20计划五宽度几何明确CDP模拟，不是物理拖拽。不能将其改绑candidate9整包。

最新f1 CI：R19 run38566103264、R21 run38566103349 PASS；R3 run38566103101最后观察queued；其司机是后被撤回的坐标方案，必须读真实结果。e008/99恢复AX后的最新R3仍需核查，不删除断言。native9（CFT155.0.8059.79）FAIL_OR_BLOCKED，Task选择value未变，原记录在 `native-final9`；这未证明生产表单失败，不能制造新Runtime修复。100+真实原生历史、任务停用/卸载/撤权/UNKNOWN完整产品矩阵、五档实体侧栏宽度、最终同包完整R3仍需证据，不能宣称全面95+。

资源交接：用户授权 Mac验收会话 `01a13a66-89ab-7891-b06f-96ad2309ebcf`「完成扩展 UI R1.2 Mac 原生验收」现拥有桌面/CFT/Profile输入；已收到本会话释放和AX恢复信息，其f1独立构建包hash相同。续接先读它最新结果，不再同时启动GUI或重跑其成功项。其证据目录 `artifacts/extension-ui-r12-mac-final-01a13a66`。R1.3会话 `01a13a4b-5823-7461-9e07-c673054fb4fa`拥有 tool.html/Workflow、日常Chrome/Profile/Native；本会话不再写tool.html。watcher33560/33580拥有dist/development及43120，保留。43111 canonical fixture可核查复用。不要在根目录npm ci、不关闭其他Profile、不复制日常扩展。

独立评分：Zeno只读审阅（native agent01a13a28-8bf4-78a0-a0b9-c1d45fe6fedb）已指出本轮焦点/字体/EC详情测试缺口，现均有相应修复与定向回归；最终评分等待其最新结论，旧有限review不能冒充95+或最终接受。十项分别列证据、问题、复验、分数或NOT_SCORED；第5项按最新用户范围改为响应式与实体宽度，排除缩放。

Zeno续接前最后独立评分已收到（当前有限范围review，非95+正式关闭）：信息架构90、视觉布局91、列表/详情/表单91、文字可读性91、响应式/实体宽度NOT_SCORED、键盘无障碍89、功能失败恢复91、复用/低耦合91、权限/运行安全NOT_SCORED、证据完整度88。浏览器缩放已从本轮评分要求排除。后续先补同候选真实证据，再针对确认缺陷修复，不以扩大重构或任意提高分数代替产品验收。

### Mac owner 后续原始证据更新与输入文件交接

已只读核实 `artifacts/extension-ui-r12-mac-final-01a13a66/7a89024a68ce438fa7da7eeccd3c97830be26a1b/native-product/native-report.json`：status=PASS，Git7a89024a68ce438fa7da7eeccd3c97830be26a1b，production packageHash995ebbd4da7a63751bfb2d9f365628204f6b48f371dfca2510a4aadeae93a9c1，Chrome155.0.8059.39，extensionIdpcpdgbedagchjkpjcgobimnljocogbdk。FORM+PRODUCT核心全通过，包括20个真实暂停计划/最后详情返回、管理草稿焦点、四规则/历史、删除隔离、真实AlarmRunresultreleased；后续相关输入未变应直接复用，不再把该候选全部产品矩阵写为未测。旧native9失败仍保留其旧身份。

`native-physical4/native-report.json`总体PASS附明确limitations：请求300/320/420/520实际均360。只有360有真实几何；其余四档NOT_TESTED，不能将报告总体PASS提升为五档实体矩阵PASS，也不宣称Chrome最小宽度限制。`native-identity`与新physical前阶段FAIL_OR_BLOCKED停在schedule-kind interval输入，属于尚需诊断的原生选择适配，不代表已通过核心产品矩阵被推翻。缩放证据只保留历史，仍排除本轮后续要求。

已向授权Mac owner确认交接：`tests/framework/scheduled-tasks-r1-native-mac.test.mjs`的唯一落盘负责人现在是会话01a13a66-89ab-7891-b06f-96ad2309ebcf，允许范围仅select()原生输入适配，保留value deadline、全部场景、固定身份/权限及PID/前台/bundle/AX守卫。本会话及新续接者不得并发写该文件。生产源码不在本交接范围；共享time-review-native-input.swift如需修改须另外核查当前owner。GUI/CFT/Profile继续归Mac owner，本会话保持只读和自身记录更新。

### 后续资源状态（来源会话同步，非本会话实时占用证明）

Mac owner01a13a66随后明确已退出自己的全部活跃CFT/原生驱动、不再启动GUI，并在其workstream把native select输入适配交给续接01a13ac5-040a-7b52-b34f-20f8b1478d2a；共享Swift未交接。其他任务CFT PID13199和日常Chrome不在其释放范围。本会话同样不占Git/index/HEAD或GUI。

R1.3 owner01a13a4b最新同步：其当前无Git/index占用、不准备立即写入、暂停GUI等待R4.1释放日常Chrome；R4.1仍占日常Chrome并获用户watcher维护授权。其tool.html/workflow-view及本任务10文件仍由R1.3维护，不交接源码写入。新续接请求短Git窗口也须自行核查真实index/HEAD稳定、其他owner和原有dirty字节，不能用这些消息快照替代实际独占验证。本会话未替其他owner声明全局释放，未向新续接扩大跨会话消息授权。
