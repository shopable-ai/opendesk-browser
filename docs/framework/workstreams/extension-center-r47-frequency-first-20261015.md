# Extension Center R4.7 · 高频优先与 0–1 主操作（2026-10-15）

> 本文件记录 R4.7 **当前候选**的源码、实施边界与验收账本；必须按最新 main 和真实 CI 更新结论，不覆盖 R4.1/R4.2 历史验证。无同 SHA 的 Mac Chrome 原生回执不可标记 95+。

## 实施任务与边界

- 仓库：`shopable-ai/opendesk-browser`；仅 `main` 正常提交；初始只读基线 `1e223bdd080143bb60c06b83dd29768f33d452f3`。
- 写入所有权：`src/ui/extension-center.js` / `extension-center-model.js` / `extension-center.css`、`src/ui/sidebar-tools.js` 现有启停交互的最小复用、R4/R4.2/R4.7 测试、Extension Center 现有 CI、`docs/product/sidebar-ui-spec.zh-CN.md`、此记录和唯一 R4.7 HTML 原型。**不改** SDK、Worker、SW、安装器、Page Authority、公共 Token、`src/ui/tool.html`、原有 Preview Generator。
- 延续既有 R4.2 原生证据与静态基线；但历史“停用→设置主按钮”“Page→管理按钮”“候选→安装按钮”已由 R4.7 用户目标覆盖。App 主操作不因更新转变为安装新版。
- 页面：五 Tab `扩展` → 统一列表 → 详情 → 返回；行主区域保持完整两行布局，`⋮` 为可见且可键盘访问的**行级管理**；顶栏 `⋯` 只负责全局筛选/导入/刷新。
- 原生 CFT / Mac Chrome、用户共享工作目录、watcher、端口、dist、ZIP 未占用、未访问。现有 preview 是独立的可点击**视觉适配原型**，复用同仓库 3 个 CSS 文件，不是生产包或真实 Chrome 证据。

## 功能叶子、真实场景、实现与可执行证明

| ID | 使用场景 / 成功条件 / 失败行为 | 源码 | 当前证据 |
| --- | --- | --- | --- |
| F1.1/1.2 | 已启用且可信的应用显示 1 个“打开”；停用、Page、候选、状态未知显示 0；异常不冒充能力 | `extension-center-model.js:resolveExtensionPrimaryAction`, `extension-center.js:draw` | 模型测试/源码回归待 CI |
| F1.3/1.5 | 点击主区域/主按钮都走 `openRow`，保留可信 `openTool`；无按钮时只进入详情、不安装代码 | `extension-center.js:openRow` | 源码回归待 CI，原生未测 |
| F1.4 | 未安装候选只有在已有**真实安全预览能力**时才出现预览入口 | 现存可信预览仅为工具开发预览，**无已核实候选通用安全预览入口**；故不展示按钮 | NOT_SUPPORTED / 不虚构 |
| F2.1/2.5 | 已安装项通过一直可见 `⋮` 打开固定定位菜单；上下/Home/End/Escape/Tab/外部点击/滚动不会困住焦点或裁剪 | `extension-center.js:showRowMenu/closeRowMenu`, `extension-center.css` | 静态断言待 CI；真实键盘/视口未测 |
| F2.2 | 从行菜单启停应用，签发动作前检查受信用户事件；取消未保存草稿不改状态；成功持久化且撤销旧实例；失败不报成功 | `sidebar-tools.js:toggleEnabled`, `sidebar-tools/installation.js:setInstalledSidebarToolEnabled` | 重用原可信生命周期，候选集成测试/原生未测 |
| F2.3 | Page 启停走现有 Chrome 网站权限手势 + Installed Page Authority，manifestHash 和 generation 过期须拒绝 | `extension-center.js:togglePage`, `installed-page-tools.js` | 原有权限回归 + 新源码断言待 CI |
| F2.4 | App 设置、网站授权与可确认卸载进入既有可信设置；新版走可信固定包审阅；Page 编辑走原开发页面 | `extension-center.js:showRowMenu`, `sidebar-tools.js:openSettings` | 路由源码核对；真实卸载未测 |
| F3.1–3.4 | 不强制生成“管理/设置/安装”主按钮，不重复开关，保留分类文字、Hover/Focusing 和清晰状态 | `extension-center.js:draw/rowDescription`, `extension-center.css` | 静态 CSS/模型验证待 CI |
| F4.1–4.4 | 应用旧实例 epoch 安全撤销、Page 授权代际、草稿确认、异步忙状态与并发更新结果显式可辨 | 既有安装器、Page Authority + R4.7 展示调用 | 旧主干能力保留；新入口完整原生未测 |
| F5.1–5.4 | 浅色交互原型可查看按钮/菜单/停用/权限/未知/空/候选，使用正式 CSS；不调用原生 Host | `prototypes/sidebar/extension-center-r47-frequency-first-preview.html` | 代码存在；浏览器可视交互 NOT_TESTED；CHAT_ADAPTER_NOT_SOURCE_HTML |
| F6.1–6.5 | Node/CI 受影响回归、复核提交身份、反方审计、逐维评分、Chrome 证据、任务百分比 | `.github/workflows/extension-center-r4.yml` + 本记录 | 待 CI 与 Mac/Chrome |

### 反方验证矩阵（不得以平均分抵消 P0 FAIL）

| 反例 | 风险 | 防护/实际实现 | 证据 |
| --- | --- | --- | --- |
| 停用后没有“打开”，难以恢复 | 恢复入口被埋 | 常显 `⋮ → 启用应用`，成功不自动启动 | 静态已设计；原生 NOT_TESTED |
| 整行与按钮行为不同 | 误安装或误运行 | 两者同一 `openRow`，无主动作只 `openDetail` | 源码待 CI |
| Page 只有自动运行能力却显示“管理”主按钮 | 高频入口虚假 | 无核实 Page UI 不显示主按钮；菜单内可启停 | 模型待 CI |
| 未安装直接点击出现预览/安装 | 绕过固定包审核 | 无已验证 candidate preview 一律只看详情；安装进入 `openOfficialReview` | 源码待 CI |
| 最后一行菜单超出列表或 Side Panel | 用户无法点到操作 | 菜单脱离 clipped `ul`，按视口 fixed 定位并随滚动关闭 | 真实像素 NOT_TESTED |
| 旧草稿与启停竞争 | 数据损坏或丢失 | 有草稿时原 `canLeave(apply)`，操作前重新核对包/会话/启停；不同应用不丢当前草稿 | 新入口原生 NOT_TESTED |
| 读记录失败被视为正常启用 | 不受控启动 | 显式 `stateKnown=false`，应用不出现“打开”；Page 不显示启停 | 模型待 CI |
| 停用伪造本地 enabled | 已停用仍运行 | 委托原 package lock/epoch/Authority；UI 不直接写数据 | 源码待 CI |

## 评分与进度门禁

**评分分级：** UX 设计预评审、源码接线、CI 单元、打包、真实 Chrome 需分别记载。没有实际测试不能给 95 分或 PASS。逐维目标：高频使用效率、主操作语义准确性、组件去重、信息架构、视觉交互、可访问性、真实生命周期、安全权限、异常恢复、预览与正式一致性、实际 Chrome 均 ≥95；当前**正式得分尚未评定**（NOT_TESTED / SOURCE_PENDING_CI）。

**完成率方法**：按 P0 功能叶子逐个绑定 `使用场景 → 成功/失败 → 源码 → 测试证据`；已连线不等于验收完成；无法认证真实 95+ 时正式验收完成率仍是 PARTIAL，必须分别报告“源码实施覆盖”和“正式产品验收”，不得用测试数量或任意等权任务树计算假精度。

**下一轮 P0**：在稳定提交候选上检查 CI 测试与 build/verify；实际 Mac Chrome 验证菜单边界、键盘、应用及 Page 真实启停、异常恢复、权限提示、安装审阅、原生用户草稿；正式 HTML 原型视觉与正式运行 UI 作同来源对比；对有真实入口的 Page 用户 UI/候选安全预览逐项调查，不创建伪能力注册表。

状态：`SOURCE_PREPARED / CI_PENDING / NATIVE_CHROME_NOT_TESTED / PRODUCT_95_NOT_CLAIMED`；提交 SHA 与 CI 运行链接待提交后补记。


## 2026-10-15 R4.7 后续修复与验证（增量，只绑定明确提交）

- 原始 R4.7 主操作/管理菜单实现：[`2819cf98`](https://github.com/shopable-ai/opendesk-browser/commit/2819cf98c89ea7035c28de98a5c3d703570e0f2e)。DOM/RPC 桩、处理中提示与单事务防重复：[`bcceea5b`](https://github.com/shopable-ai/opendesk-browser/commit/bcceea5b817d09d9d0605f25e3ff7454fd5e3eef)。焦点按主区域/管理菜单真实来源恢复：`74ba1995`。诊断：`fc5d6738`；Locale 变更导致的旧 Host 夹具 HTML 根节点缺失修复：`bac9cdd0`；现有 Extension Center CI 关联 Host 生命周期路径：`e0e46d68`。
- 新增并发 UX 修复：[`7aa26bd1`](https://github.com/shopable-ai/opendesk-browser/commit/7aa26bd1b592c265fd50a93e352e8188f99e6301)：启停过程中，**全部列表行操作同步禁用**，而不是“其他行看似可点却被 Handler 忽略”；列表标注 `aria-busy`，处理中项目本身说明继续显示“处理中”，完成后才恢复操作。相关 DOM/RPC 双桩验证已添加到现有 R4.7 交互测试。
- **同一 SHA 的最新可复核证据**：`7aa26bd1` → [Extension Center CI 38749668719](https://github.com/shopable-ai/opendesk-browser/actions/runs/38749668719)。第一个 Node 分组 **58/58 PASS**，第二分组 **153/153 PASS**，合计 211/211 PASS；`npm run check` 检查 **753** 文件 PASS。此为 **DOM_COMPONENT_DOUBLE + UNIT_INTEGRATION + SOURCE_CHECK**，绝不是已安装 Chrome 或最终 F3。
- **构建 FAIL，未绕过安全门禁**：在 `npm run build` 的 `opendesk-fixed-page-relay` 资源来源检查中，`examples/sidebar-tools/reading-toc/locales.json` 被视为未许可的 `examples/` 资源进入特权 fixed bundle 而拒绝。属于 Reading TOC 本地化/固定 Host 输入归属问题，**本 R4.7 不修改该包、不放宽 `scripts/bundle-provenance.mjs`、不擅自重锁摘要**。`npm run build:dev`、`npm run verify` 因上游 build FAIL 而 SKIPPED；所有指标必须保持原状，不将其写作 PASS。
- 仍有并行 AdBlock `host-controls.js` 已审阅 Blob 与固定 Bundle Pin 的漂移风险；若之后 build 越过 Reading TOC 阶段，再按当时实际 CI 观察下一阻断，不擅自替其他工作流更改签名/放行边界。
- HTML 演示：`prototypes/sidebar/extension-center-r47-frequency-first-preview.html`。展示 0/1 主动作、停用、无独立 UI 的 Page、候选、权限受限、状态未知及处理中、菜单和 Escape；使用本仓库正式 Token/Design System/Extension Center CSS，但**交互仍是内存 Demo，绝非生产 HTML 或原生 Chrome 行为**，相同来源视觉/计算样式比对尚未完成。

### 反方审计补充（按实际修复后的证据分级）

| 对抗性用例 | 真实风险 | 当前处理与可核验证据 | 结果 |
| --- | --- | --- | --- |
| 停用工具变为“设置”主按钮 | 低频动作占用高频入口 | `resolveExtensionPrimaryAction=null`，DOM 用例及页面文案通过 | SOURCE_PASS / CHROME_NOT_TESTED |
| 网页增强误判为必有“管理”/“打开”按钮 | 执行未经验证的 Page UI | 无经 Host 核实的 Page UI 保守保持 0 主按钮；菜单使用独立 Page Authority | SOURCE_PASS / 高价值 Page UI 探索待做 |
| 主区域与显式主按钮不一致 | 误启动/误安装 | 两者都调用 `openRow`；无主动作只去详情；DOM 桩已覆盖 | SOURCE_PASS |
| 菜单及详情返回丢失焦点 | 键盘使用受阻 | 按 `main`/`more` 来源返回；DOM 桩检测两类入口 | COMPONENT_PASS / SCREEN_READER_NOT_TESTED |
| 一个项目启停，其他行仍可点击却静默忽略 | 操作不可预测、并发误判 | `7aa26bd1` 统一 disable + `aria-busy`；待办事务后恢复 | COMPONENT_PASS / NATIVE_NOT_TESTED |
| Page 授权缺失或代际变化 | 未授权启动 | 仍调用原 Chrome 权限检查及 `expectedGeneration`；失败不提交，已覆盖双桩用例 | COMPONENT_PASS / REAL_PERMISSION_NOT_TESTED |
| 草稿未保存/身份变更后启停 | 丢数据或旧 iframe 仍活跃 | `sidebarTools.toggleEnabled` 复用原 `canLeave`、包身份/锁/撤销代际；Host 定向回归通过 | COMPONENT_PASS / MAC_NOT_TESTED |
| 菜单超出 Side Panel 或被裁剪 | 隐藏关键管理入口 | fixed 定位、边界估算、滚动关闭；DOM/CSS 桩有范围检查 | SOURCE_PASS / REAL_LAYOUT_NOT_TESTED |
| 原型“预览”被当作真实工具功能 | 用户授权/安装误判 | 候选无真实预览不显示按钮；HTML 明示模拟且不操作 Chrome | SOURCE_PASS / PARITY_NOT_TESTED |
| 生产构建失败却通过评分 | 发布不可追溯或绕安全 | 保留 Reading TOC Bundle Provenance 拒绝，不修改跨领域许可 | BUILD_FAIL / RELEASE_BLOCKED |

### 逐维独立评分门禁（禁止用源码通过替代 95 分）

| 维度 | 本轮已具备的最低证据 | 正式独立 0–100 评分 |
| --- | --- | --- |
| 高频使用效率 | 0/1 真实已安装 App 主动作、行点击同路由，Node/DOM 通过 | NOT_SCORED — Mac Chrome 操作效率未量化 |
| 主操作语义准确性 | 已安装/停用/Page/候选/状态未知模型与 DOM 状态矩阵通过 | NOT_SCORED — 同候选原生未测 |
| 组件去重 | 不再强制“设置/管理/安装”主按钮，CSS 静态合同通过 | NOT_SCORED — 实装视觉未量化 |
| 信息架构 | 行级菜单、全局筛选与详情路由已接线 | NOT_SCORED — 详情重复操作仍需真实产品评估 |
| 视觉交互 | 原始正式 CSS 与浅色 Demo 复用；无固定渲染截图 | NOT_SCORED — Chrome computed style 未测 |
| 可访问性 | DOM 键盘、Esc、焦点恢复、aria-busy 通过 | NOT_SCORED — 真键盘/VoiceOver 未测 |
| 真实生命周期 | 原 Sidebar Host + Page Authority 组件定向测试通过 | NOT_SCORED — 已安装同版本 Chrome 未测 |
| 安全与权限 | 原包哈希、权限、撤销代际与草稿 Guard 未被绕过 | NOT_SCORED — 原生授权/撤权 E2E 未测 |
| 异常与恢复 | 状态未知、并发单事务及 Page 权限失败双桩通过 | NOT_SCORED — 异常 Chrome 真实路径未测 |
| 预览与正式一致性 | 同仓库 CSS，Demo 明确模拟 | NOT_SCORED — 无同候选像素/真实流程证据 |
| 实际 Chrome 产品验收 | 无本次同 SHA 用户 Mac Chrome 安装证据 | NOT_TESTED |

独立专家的 95+ 结论**尚未取得**。功能树可报告为：**F1/F2/F3/F4 已有源码/定向组件覆盖，但 F1.4 真实候选预览与用户 Page UI 仍缺能力级证据；F5 为演示原型非正式界面复验；F6 的构建和 Chrome 门禁未关闭。** “源码接线”“组件通过”“最终产品验收”分别计算，不能凭 211 个测试总数计算产品完成百分比；同 SHA 的原生 P0 用户路径目前 **0 项完成最终实证**，正式闭环完成率不得据此宣称 95%。

### 下一位本机 Codex / Chrome 验收负责人执行序列

1. **只用 main，不开分支/Worktree/PR**：先 `git status --short`、`git log -1 --format='%H %s'`，对照本记录 SHA 和最新并行 diff；保留用户本地未提交内容。仅在具体文件写入权明确时修复。
2. 构建前让 Reading TOC/固定资源 Owner 按真实审计修复 `locales.json` 与 `page-relay` 的归属；**不可添加 `examples/**` 全局许可、关闭 Source Pin 或虚构 SHA**。再复检与 AdBlock Pin 的实际独立问题。完整顺序：`npm ci --ignore-scripts --no-audit --no-fund` → `npm run check` → `node --test tests/environment/extension-center-r4.test.mjs tests/environment/extension-center-r42-row-action.test.mjs tests/environment/extension-center-r47-menu.test.mjs tests/environment/extension-center-r47-interaction.test.mjs tests/environment/sidebar-tools-host.test.mjs tests/environment/installed-page-tools-r251.test.mjs` → `npm run build` → `npm run build:dev` → `npm run verify`。仅同提交成功结果可记 PASS。
3. 固定候选并在用户 Mac 已安装 Chrome 扩展中验证：启用 App 的整行和“打开”进入同一应用；停用 App 只有“⋮→启用”且启用不自启动；自动运行 Page 无伪主按钮、菜单启停确实注册/撤销；候选行仅打开详情及安装审阅；缺网站权限/撤权/过期 manifest 与未保存草稿真实拒绝；并发单事务与异常恢复；菜单底部不被剪裁，Tab/↑↓/Home/End/Escape/焦点往返；与浅色 Demo 同一场景的正式 CSS 截图/计算样式逐项对比。
4. 每条原生用户路径绑定候选 Commit SHA、固定构建 Hash、Chrome 版本与 Profile、真实用户点击方式、真实状态读回、截图/日志、PASS/FAIL。无证据保持 NOT_TESTED。对失败的路径做最小源代码修复后只复验受影响项，再给十一维**真正独立的**定量评分。所有维度实证 ≥95 才可关闭 R4.7。


## R4.8：既有浅色预览到正式产品的最小差异修复（2026-10-15）

- 用户新目标：对照现有 `prototypes/sidebar/extension-center-r47-frequency-first-preview.html`，**直接修改浏览器扩展的正式 `src/ui/` 界面**，避免仅改善 HTML Mock。专用续接 GOAL 已保存到 `docs/framework/prompts/goal-extension-center-r48-preview-to-real-chrome-20261015.zh-CN.md`。
- 本轮确认的差异：正式已启用 App 的详情多出冗余「打开应用」（列表已经有相同主动作），与当前预览不一致；正式详情的首段说明也未复用列表已停用/权限/未知状态语义。修复只涉及 `extension-center.js` 展示层，保留原 Host/Open/授权/安装审阅逻辑，并在现有 DOM 组件测试增加详情差异回归。
- 顶栏预览的模拟「＋」「↻」和正式产品的真实市场/筛选/语言/刷新在**功能意义上并不等价**；后续应以真实功能与原版设计规范为准审计差异，不为了像素匹配直接替换正式菜单或静默丢掉任何功能。
- 现有 211/211 定向通过及 build 阻断为历史候选证据，不是本轮新候选的测试结果；当前修复尚待同候选 CI。Mac 原生 Chrome **NOT_TESTED**；无权威截图/计算样式时「预览与正式一致性 ≥95」仍 **NOT_SCORED**。
- 文件归属仅为本轮具体改动：`src/ui/extension-center.js`、`tests/environment/extension-center-r47-interaction.test.mjs`、上述新 GOAL 与本段记录。保留其它并行 Agent 对本文件之前的新增内容。

## R4.8 · 正式 UI 源码与预览同源修复记录（2026-10-15）

**实施方式与权限：** 本轮通过已连接的 GitHub API 在唯一 `main` 修改现有文件；每次写入按最新文件 Blob SHA 守护，未建立分支/PR/Worktree，未强推。当前执行容器无法访问用户 Mac 路径 `/Users/shopme/Documents/workspace/opendesk-browser`、Chrome 已安装 Profile 或 `npm run dev` watcher。因此下列远程代码检查、GitHub CI、静态预览和 Mac 原生 Chrome 严格分级。

### 本轮已实际落地的修改

- [`50749db3`](https://github.com/shopable-ai/opendesk-browser/commit/50749db330713d1c6051073c5c6b4140fc2d3379) · `src/ui/extension-center.js`：首次读取时展示真实 loading，不将未返回的目录误报为空；异步菜单刷新恢复行级键盘焦点，记录被删除时返回焦点落在搜索框；详情低频操作复用 `od-button od-button--secondary`，处理中禁止重复触发。
- [`e1785ed1`](https://github.com/shopable-ai/opendesk-browser/commit/e1785ed18a2d1d3e2742ffd58d010d1a62c801ca) · `src/ui/extension-center.css`：移除详情按钮自行实现的背景/边框/圆角，交给正式 Design System。
- [`c9c23975`](https://github.com/shopable-ai/opendesk-browser/commit/c9c23975a029ea76122f280cb5b0a9afab4a26ff) · `tests/environment/extension-center-r47-interaction.test.mjs`：增加 loading、后台刷新焦点、已移除 Page 的详情返回、共用按钮的 DOM 回归。
- [`9e0a4126`](https://github.com/shopable-ai/opendesk-browser/commit/9e0a4126eec2457a85fbb2755b0dcc920d1126b4) · **原位置** `prototypes/sidebar/extension-center-r47-frequency-first-preview.html`：引入正式 `tool-shell.css` 与 `workbench-nav/workspace-content/workbench-tools` 容器，顶部市场+全局菜单结构直接摘取最新 `src/ui/tool.html`，独立 Mock 支持筛选、语言反馈、导入说明、刷新和 Escape；保留 `SIMULATED_PREVIEW / NOT_NATIVE_CHROME`。
- [`df3d7f8f`](https://github.com/shopable-ai/opendesk-browser/commit/df3d7f8f0810cba5512371f96ecbc257188ca276) · 正式/预览工具栏结构逐字同步的自动合同，避免预览退回“模拟 +/↻”而生产失去真实菜单的老问题。

### 独立证据与功能验收

| 用户路径或质量项 | 当前阶段 | 可复核证据 / 限制 |
| --- | --- | --- |
| 启用 App 的主按钮/整行进入同一宿主 | SOURCE_WIRED · NATIVE_NOT_TESTED | 原 R4.7 源码+既有 DOM 双桩；尚无本次 Chrome 实际启动 |
| 停用 App 经行菜单启用且不自运行 | SOURCE_WIRED · NATIVE_NOT_TESTED | 保留 Sidebar Host `toggleEnabled` 与原包撤销栅栏；未以 Mock 代替 |
| Page 网站授权/注册/撤权与 generation | SOURCE_WIRED · NATIVE_NOT_TESTED | 不修改原 `installed-page-tools.js` 与权限流程；本机实装验证未做 |
| 未安装候选点击与固定包审阅 | SOURCE_WIRED · NATIVE_NOT_TESTED | 行无“安装”主按钮，进入详情后走既有可信 review |
| loading/状态未知/菜单异步刷新/焦点兜底 | SOURCE_CHANGED · NODE_CI_PENDING | 新增 R4.8 DOM 回归；不可等价为真人键盘/VoiceOver |
| 正式五 Tab、市场、菜单、类型/范围、语言、刷新 | SOURCE_PARITY_CHECK · NATIVE_NOT_TESTED | GitHub 读取同一主干文件并执行 JS 字符串逐字对照，顶部正式 DOM 与 Mock 顶栏结构一致；页面 UI 仍需真实 Chrome computed style |
| R4.7 原始 preview Mock | SIMULATED_ONLY | HTML 内仅使用内存数据，不修改 Chrome、真实工具或本机权限；真实 Page 用户入口无核实通用 API 时保持 0 主按钮 |
| 本次产品逐维 95+、最终功能完成率 | NOT_SCORED / PARTIAL | 缺少同候选 Mac Chrome、权限拒绝与故障恢复的原始证据，不能声称达标 |

**静态检查：** 使用当前 GitHub 源文件直接比较 formal/preview toolbar（仅将 `preview-` ID 规范化），结果 EQUAL；正式 JS 与预览内联 Mock JS 均做了解析检查 `PARSE_PASS_ONLY`，不代表 Node 测试、真实 DOM 截图或原生 Chrome。

**本轮对应 CI：** [Extension Center R4，run 38755856469](https://github.com/shopable-ai/opendesk-browser/actions/runs/38755856469)，绑定 `df3d7f8f`；记录时为 `QUEUED`，完成前不得写 PASS。此前 Reading TOC `locales.json` 与特权 page-relay 的资源出处、以及 AdBlock 摘要 Pin 风险属于各 Owner；本轮未放宽安全 provenance、未修改这些对象。

**Mac 同候选最终门禁（未执行）：** 在实际加载的 `dist/development` watcher 修复态确认扩展 ID 与本地源码一致；在隔离的 production 候选/Profile 验收同一 Commit + 包 SHA + Chrome 版本：App/网页增强真启停和读回、拒绝权限/撤权、候选安装审阅、未保存草稿、并发失败、行菜单键盘与底部定位、市场/筛选/语言/刷新、原型/正式截图及 computed-style。每一项留原始截图/日志并标 PASS/FAIL，缺证据一律 NOT_TESTED；在这些关闭前不宣称 Extension Center R4.8 正式验收完成。

### R4.8 CI 失败归因与最小补丁（2026-10-15 UTC 15:07）

- [CI 38755856469](https://github.com/shopable-ai/opendesk-browser/actions/runs/38755856469) 对 `df3d7f8f` 的核心组 50 PASS / 2 FAIL：原 R4.3 对比度测试仍引用旧详情选择器（本轮负责），另有并行 SDK 模块语法错误（非 Extension Center 所有权）。build/check/verify 被跳过，不可标 PASS。
- 已修复本轮对比度：[`2286832d`](https://github.com/shopable-ai/opendesk-browser/commit/2286832d0b2ff8bb06a065f23a3097598b41ea73) 保留次级按钮共享背景、边框与尺寸，仅以正式 `--od-accent-ink` 确保小字号文本可读；按当前 Tokens 对实际 `--od-action-bg` 计算，浅色 **5.19:1**，深色 **7.60:1**，均超过 4.5:1；[`e0b8b5bb`](https://github.com/shopable-ai/opendesk-browser/commit/e0b8b5bb69937d03f54aee8f2c67feb3ec1f4b6d)、[`cd1f18d4`](https://github.com/shopable-ai/opendesk-browser/commit/cd1f18d4918a98737bf56065ee9718cbc4723a99) 同步更新既有与新增的可读性测试，未放宽阈值。
- [CI 38757140564](https://github.com/shopable-ai/opendesk-browser/actions/runs/38757140564)（`cd1f18d4`）**51 PASS / 1 FAIL**；原对比度断言恢复通过，唯一失败是 `src/framework/sdk/browser-schemas.js:56` 的 `SyntaxError: Invalid or unexpected token`，导致 `extension-center-r47-interaction.test.mjs` 模块初始化失败、R4.8 新增 DOM 测试全部未执行。其最近所属 SDK 提交 [`5d630f7a`](https://github.com/shopable-ai/opendesk-browser/commit/5d630f7a0f6dacd9ff0b96b54d5349e368e41d23)；应由 SDK Owner 修复，Extension Center 不越权改 SDK、schema 或放宽检查。其他后续构建步骤仍 SKIPPED。
- [`66cce077`](https://github.com/shopable-ai/opendesk-browser/commit/66cce077772d14e93e9c5084748bc2fb5d1821ff) 给原有 `.github/workflows/extension-center-r4.yml` 添加 **R4.7 唯一预览 HTML** 的 push path，确保仅改预览也会重新执行正式/预览同源测试。没有创建第二个工作流。
- **当前真实交付级别：SOURCE_CHANGED / DIRECT_SOURCE_PARSE_PASS / TOOLBAR_STRUCTURE_EQUAL / CI_BLOCKED_BY_SDK / BUILD_NOT_EXECUTED / MAC_CHROME_NOT_TESTED / PRODUCT_NOT_ACCEPTED**。R4.8 所有原生 P0 尚无同候选真实 Mac Chrome 证据，不对十一维打 95+，也不提交虚假的百分比。


## R4.9 · 正式反馈与预览忙状态一致性（2026-10-15 UTC）

实施提交：[024975b47](https://github.com/shopable-ai/opendesk-browser/commit/024975b47d7a9a5d337327e1b3e843f3bc526e8b)，父提交 ac6d8b6a522f5f3071459486861c15c241db4722。通过已连接 GitHub API、原文件 Blob SHA 守卫及非强推原子提交直接更新唯一 main，未创建分支、Worktree、PR。Mac 用户工作目录、Chrome 已安装扩展、dist/development watcher 与 Native Profile 不可访问，本轮没有占用/清理这些资源。

### 已落实的最小增量

- 正式 src/ui/extension-center.js：将 UI 消息来源区分为 action/read/catalog/loading，正常目录读回不再清空启停取消、失败或 Page 授权拒绝信息；手动刷新报告读取中，保留原可信生命周期、安全权限、Package Hash、Page Authority 和安装审阅。
- 唯一原版 prototypes/sidebar/extension-center-r47-frequency-first-preview.html：处理中场景保留所有行与既有高频按钮并统一禁用；模拟刷新保留搜索、筛选、详情和模拟启停状态；继续共享正式 CSS/五 Tab，并保留 SIMULATED_PREVIEW / NOT_NATIVE_CHROME 标识。
- tests/environment/extension-center-r47-interaction.test.mjs：新增应用取消启用、Page 权限被拒后提示经背景刷新仍持续可见的两个 DOM/RPC 用例；静态合同防止预览再次隐藏 busy 其他行、主按钮或重置筛选。合成 isTrusted 不是真实 Chrome 事件。

### 当前证据级别

| 范围 | 结果 / 身份 |
| --- | --- |
| 更早的独立 CI 基线 | [CI #38764000125](https://github.com/shopable-ai/opendesk-browser/actions/runs/38764000125)，44376af3b40e615a378877bc32beb8cbfc29f70a，定向 Node/check/build/build:dev/verify 步骤成功。不是当前提交的结果 |
| R4.9 直接源码 | JS 解析检查 PASS_ONLY，正式状态反馈已修改；不得冒充 Node 或浏览器执行 |
| R4.9 CI | [CI #38767521693](https://github.com/shopable-ai/opendesk-browser/actions/runs/38767521693) 绑定 024975b47，首次查询时 QUEUED；完成前 NODE_PASS/BUILD_PASS/verify 均 NOT_TESTED |
| 用户 Mac Chrome | 无实际版本/Profile、扩展 ID、包 Hash、安装动作/状态读回、截图或日志；原生 P0 一律 NOT_TESTED |
| 相关额外构建输入 | 早期成功基线后的共享 scripts/bundle-provenance.mjs 已有并行修改；不得继承旧包 PASS，也不得放宽安全校验 |

### 正式 UI 与预览差异判据

| 对象 | R4.8 遗留偏差 | R4.9 修改 | Chrome 证据 |
| --- | --- | --- | --- |
| 应用启停失败反馈 | 自动 readback 错误地清掉失败信息 | 保留 action 错误直到新的相关反馈，增回归用例 | NOT_TESTED |
| Page 网站授权拒绝 | 无关读取可能覆盖拒绝信息 | 拒绝信息持续可辨，无新增授权路径 | NOT_TESTED |
| 处理中 | 预览隐藏其他行及高频按钮，与正式页面不一致 | 预览保留按钮，统一禁用所有行 | NOT_TESTED |
| 刷新 | 预览清空用户查询与筛选，正式 UI 不清空 | 预览保留状态，只模拟读取 | NOT_TESTED |
| 五 Tab/可信市场/安装审阅/生命周期 | 保留正式 R4.8 模型 | 未重建 Host/SDK/安装器和第二套预览 | NOT_TESTED |

功能树分层：R4.9 修改部分 SOURCE_WIRED；定向测试和构建等待新 CI；真实用户 E2E 的 NATIVE_PASS 全部 NOT_TESTED；Mac 环境 BLOCKED。十一维：高频效率、主操作语义、组件去重、信息架构、视觉交互、可访问性、生命周期、安全权限、异常恢复、预览正式一致性均 NOT_SCORED；真实 Chrome 产品体验 NOT_TESTED。没有同候选原生事实时不宣称 95/100 或产品完成百分比。下一最小行动：核查上述同提交 CI；然后在 Mac 已加载的日常扩展和隔离生产候选验收 App 启停、Page 权限代际、候选安装审核、键盘焦点、草稿取消、异常恢复、市场/搜索/筛选/语言与截图/computed style，逐项绑定 Commit、包 Hash、原生操作和 Host 回读。

