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



### R4.9 同候选 CI 结束回执（2026-10-15 UTC 16:20）

**GitHub Actions [38767521693](https://github.com/shopable-ai/opendesk-browser/actions/runs/38767521693)：COMPLETED / SUCCESS，精确提交 024975b47d7a9a5d337327e1b3e843f3bc526e8b。** 已读取该次原始 job steps 和日志（job 116534494543），以下结果全部来自此同一 checkout：

| 证据层 | 实际结论 |
| --- | --- |
| Extension Center + 原有 Page Authority 定向 Node 分组 | 66 tests / 66 PASS / 0 FAIL / 0 SKIP，包含 R4.9 取消应用启停与 Page 权限拒绝的新增 DOM/RPC 用例 |
| 原 Host / Cloud / Task 定向 Node 分组 | 153 tests / 153 PASS / 0 FAIL / 0 SKIP |
| npm run check | SUCCESS，语法和来源门禁检查 770 个源码/测试/构建文件 |
| npm run build | SUCCESS，production 标准包 Hash：3fbd045cf7c8d5b0b00a05fd3a1981bd4504e036126f96549889df8b24ce18c4，102 assets |
| Production CSS/package verification | SUCCESS，dist/production/ui/extension-center.css 非空，verify-package 通过 |
| npm run build:dev | SUCCESS，development 标准包 Hash：35f10860bafa61aadfb7df0bb954731fd41191eb38c170c242bc01e4884bf5df，140 assets |
| npm run verify | SUCCESS，双包验证与 development CSS 非空检查均完成 |

原段落里的 QUEUED 是首次查看的历史瞬时状态，应以此同一 SHA 的 COMPLETED / SUCCESS 终态为准。本结果证明 NODE_PASS、SOURCE_CHECK_PASS、BUILD_PASS、PACKAGE_VERIFY_PASS；**不代表**用户 Mac 当前实际加载的 dist/development watcher 包就是上述静态 development 候选，更不代表 Chrome/Native、用户手势、Page 真实注册、像素截图或专家 95+ 通过。

Chrome 验收身份待补：用户 Mac 实际 Chrome/Profile/扩展 ID、加载目录、构建 Hash、App/Page/候选的真实操作与 Host/Authority 状态读回、同候选截图及 computed style。上述场景一律继续 NATIVE_NOT_TESTED；因此产品 R4.9 仍为 PARTIAL，而非 FINAL_ACCEPTED。正常 main 仍可能存在其它 Agent 后续提交，复用本 CI 必须做相关输入差异分析，不将 024975b47 的包 Hash 冒充后续 HEAD。


## R5.0 · 真实生命周期读回、操作异常与并行合同检查（2026-10-16）

### 实际执行与文件边界

- 本轮通过已连接 GitHub 直接提交 `main`，未新建分支/Worktree/PR，没有强推或操作任何 Mac 的 watcher、Chrome Profile、Native 注册或 `dist/`。
- 本轮受控修复的独立源码与测试：`src/ui/extension-center.js`、`tests/environment/extension-center-r42-row-action.test.mjs`、`tests/environment/extension-center-r47-interaction.test.mjs`。主要提交依次为 `1f23b8e`、`183b885`、`9bd4a5f`、`a164591`、`1b18030`、`e71dfdb`、`a2b9b0a`、`1f0aef5`；采用逐文件最新 Blob SHA 检查，并正常提交到唯一 `main`。
- 修复 Host `toggleEnabled` 返回 `false` 的静默路径：用户草稿尚未确认时不报成功；返回 `true` 仍须通过本机持久化重读，确认原包身份和目标 enabled 状态。打开工具返回空或抛错也明确反馈，不报成功。
- Page 操作重用 `setInstalledPageProgramEnabled` / `Page Authority`：权限拒绝立即反馈并保留、状态读回核对；授权成功但原生注册仍待核对时区分成功与 pending。无第二套注册表、无模拟权限提升。
- 官方目录引入独立异步序号，旧响应不能覆盖新的候选；目录读取失败不保留未经当前加载确认的发行候选，正在查看的已过期候选详情安全返回。背景应用存储读取失败也不覆盖已有用户操作错误。
- 新增/调整 Node DOM/RPC 回归用例覆盖 Host false/真返回但未写入、打开失败、Page RPC ack 不等于状态变化、Page registered pending、目录陈旧响应守卫、操作错误在读取失败后仍保留；扩展真实点击、布局截图、原生配对未被这些双对象测试模拟为真实通过。

### 已认证 CI 与包身份（严格绑定候选）

- 原 R4.9 `024975b47` 对应 [Actions 38767521693](https://github.com/shopable-ai/opendesk-browser/actions/runs/38767521693)：历史 219 PASS、check/build/build:dev/verify PASS，作为**精确历史输入的旧 PASS**永久保留，不当成更新后的安装包。
- R5.0 直接源码候选 `e71dfdb16054afad5aa7f02569c945a409a71dba` 对应 [Actions 38774358044](https://github.com/shopable-ai/opendesk-browser/actions/runs/38774358044)：COMPLETED / SUCCESS。定向分组 **72/72 PASS**、Host/Cloud/Task 分组 **153/153 PASS**；`npm run check`、`npm run build`、生产 CSS/package verify、`npm run build:dev`、`npm run verify` 均通过。Production Standard Hash `75d5e7668a857caa96000a261377db397691904c5fe11599ffcf862cf6a6b2a0`（102 assets），Development Standard Hash `7639ad9fa83d462293365b6794b72e82889a5bca7c54688ba15068498d04c159`（140 assets）。**两 Hash 仅属于 e71dfdb 候选**。
- 后续 `a2b9b0a` / `1f0aef5` 增加“后台读取失败不得覆盖用户操作错误”与定向测试，其 CI 分别为 [38774918367](https://github.com/shopable-ai/opendesk-browser/actions/runs/38774918367)、[38774956234](https://github.com/shopable-ai/opendesk-browser/actions/runs/38774956234)：本条写入时尚无 COMPLETE / SUCCESS 回执，不能将 e71dfdb 的 PASS/Hash 自动升级。
- 本次记录前的远程 `main` 为 `617cc8216cc7b765c1d9e7847a85c3ec6f9cecdb`，已有其他 Agent 增量改变 `src/ui/extension-center.js`、`extension-center-model.js`、`tool.html`、`sidebar-tools.js` 及安装清理合同：默认“已安装”范围、明确“可安装 / 更新”范围、卸载清理恢复、安全阻断陈旧安装、旧详情退休。它们不是本轮 `e71dfdb` 的已认证输入，其专属 CI 新检查尚未有完整 PASS。
- 并行最新正式 HTML 的搜索 placeholder 与菜单范围文字已改变，**唯一正式预览** `prototypes/sidebar/extension-center-r47-frequency-first-preview.html` 尚未在本轮同步改变。该差异应由当前变更 Owner 核实是否为合法产品合同升级，按用户确认的预览/Host 规则收敛；不为使静态测试通过而盲改设计基准。本轮未覆盖该共享改动。

### P0 真正验收、UI 差异及评分门禁

- **九类真实 Chrome 产品场景**：已启用 App 打开、停用恢复、Page 注册撤销恢复、撤权/代际、未安装安装审阅、键盘、未保存草稿、并发/失败、搜索筛选语言市场与导航：本轮相关源码/定向 Node 有若干 SOURCE_WIRED / NODE_PASS，但**同一 Mac Profile + Extension ID + 包 Hash 的 Native 证据均 NOT_TESTED / BLOCKED**。
- **十一维**：高频效率、主操作语义、去重、信息架构、视觉交互、可访问性、真实生命周期、安全权限、异常恢复、预览正式一致性、真实 Chrome 体验均 **NOT_SCORED**，不打伪造的 ≥95 分；同源静态 DOM/CSS 检查不等于实安装 UI 截图 / computed styles / 用户输入。
- 预览/正式对照：此前五 Tab、工具栏、搜索、市场、全局菜单、行/详情结构有 R4.8–R4.9 静态合同证据；本轮代码未重做设计。但并行 `tool.html` 与筛选行为变化已造成**潜在设计基准偏移**，必须比对相同视口、真实数据、菜单与状态并修复有证据的偏差。真实截图/像素差异 **NOT_TESTED**。
- 当前 Linux/GitHub 会话无法访问 `/Users/shopme/Documents/workspace/opendesk-browser`，不知本地 `git status --short`、`npm run dev` watcher、Chrome Profile/版本、扩展 ID、Load Path、Native allowed_origins，因此不触碰日常 `dist/development`，不宣称安装产品已经更新或实现真实 Chrome P0。
- **下一最小行动**：①复核最新 main 的 Extension Center 专属 CI 与文件归属，关闭并行 `tool.html`/preview 的合同差异；②本地 Codex 对已加载 `dist/development` 的真实 ID/路径及 `opendesk browser doctor` 的 Native 配对进行只读检查；③在资源 Owner 允许的受控 CFT/Profile 冻结单一包与 Package Hash，完成上述九类真正点击/键盘/权限/草稿/Authority 读回/截图和 Computed Style；④逐维据同包真实证据评分，不达 95 不宣告 FINAL_ACCEPTED。

**证据门禁结论**：R5.0 有确实完成的源码修复与一个精确候选完整 CI PASS；并行 main 仍在前进，最终 Native Chrome 产品级验收 **BLOCKED / NOT_TESTED**；产品状态不是 FINAL_ACCEPTED。


### R5.0 并行预览同步回执（本轮记录之后）

在上文首次核验 `tool.html` 与旧预览出现文字/筛选范围差异之后，并行 Owner 已提交 [`0d8a73b`](https://github.com/shopable-ai/opendesk-browser/commit/0d8a73b747041bdc4443d081270fef730045130c)，直接更新**原有唯一** `prototypes/sidebar/extension-center-r47-frequency-first-preview.html`：现有已安装/发现双范围、Cookie Editor 卸载和审阅后重新安装均提供模拟状态。此前的「预览尚未同步」仅为记录时快照，**不能作为此提交后的当前缺陷**。该 HTML 仍明确标注 SIMULATED_PREVIEW / NOT_NATIVE_CHROME，且最新正式 / 预览同源、SDK 安全测试及 Mac Native 验收仍须绑定更新后的新 CI/包身份。未触碰当前 Owner 的并行文件，不凭静态 HTML 推断真正产品验收通过。


## R5.1 · GitHub 范围增量验收与 Mac 原生交接（2026-10-16）

### 当前执行范围与身份

- 本轮仅通过已连接 GitHub 对 `main` 做增量修改、Blob SHA 条件更新和正常提交；未创建分支/Worktree/PR、强推或改动本机 `dist`。本会话无法访问用户 Mac、日常 `npm run dev` watcher、已安装 Chrome/Profile/Native，因此本机 `git status --short`、真实 Extension ID/Load Path、Chrome 版本、Native `allowed_origins` 均 **BLOCKED / NOT_TESTED**，不能把 GitHub HEAD 当成已安装产品身份。
- 本轮源码修复 [`d9c4bcb4`](https://github.com/shopable-ai/opendesk-browser/commit/d9c4bcb4f12ae01095bea0a2247b4bb2c2cdcd67)：`src/ui/extension-center.js` 在打开详情时锁定固定 App 包或 Page `manifestHash/revision/sourceHash` 的 UI 身份；另一窗口以相同 ID 更换固定包/修订后，旧详情安全返回列表。启停、Page 同一修订代际变化不当成换包。该修复是**展示层退休栅栏**，不能取代真正 Host/Authority 重新核验。
- 对应测试 [`7c9ed68a`](https://github.com/shopable-ai/opendesk-browser/commit/7c9ed68aa67707af2885b63236078a0d79baa2bd)：`tests/environment/extension-center-r47-interaction.test.mjs` 增加同 ID/同版本不同包字节，以及 Page 修订替换时旧详情不得接管新身份的回归。
- 过期合同修正 [`ce964dfe`](https://github.com/shopable-ai/opendesk-browser/commit/ce964dfe69acdaa1093ff152160c3065cf31bd3e)：`tests/environment/extension-center-r47-menu.test.mjs` 更新原有可信 Host 的导出顺序断言，明确包含既有 `retryUninstallCleanup` 并断言该真实手势入口存在，未降低权限断言或重建清理框架。
- 真实 UI 过滤修复 [`e187d627`](https://github.com/shopable-ai/opendesk-browser/commit/e187d627461f237d92d8137cbaf97c8cf1235ec9)：官方 Catalog 离线时的 orphan cleanup 恢复入口必须遵守用户显式 `可安装 / 更新` 范围、当前 App/Page 类型和搜索词（支持 Cookie Editor 名称规范化）；不能出现在 Page-only 或无关搜索结果中。未改安装、卸载和任何权限授予。
- 对应 DOM 回归 [`95993194`](https://github.com/shopable-ai/opendesk-browser/commit/9599319499a37bfaa29f2a0aaebb6b761f986104)：原 `R5.0 catalog-offline cleanup` 场景补齐无关搜索隐藏、按名称重新找到、Page 类型隐藏、App 类型恢复清理以及原本已存在的持久清理读回条件；为 Node 双对象测试，不是实装 Chrome 操作。
- 源码核验仍由既有安装 Registry/卸载日志/预装标记负责：默认 `已安装` 仅呈现真实 Registry/Page Installed 身份；`可安装 / 更新` 由用户主动筛选、固定包审阅；卸载记录先撤销旧 epoch 再移除安装记录、清理失败留恢复日志；默认预装仅首次 `onInstalled('install')` 的持久计划恢复，遇卸载 epoch/清理记录不自动复活。以上为 **SOURCE_WIRED**，不是同一冻结包的 **NATIVE_PASS**。
- 唯一正式 HTML 仍为 `prototypes/sidebar/extension-center-r47-frequency-first-preview.html`。已核对共享 `design-tokens.css` / `design-system.css` / `tool-shell.css` / `extension-center.css`，五 Tab、工具栏/市场/全局菜单/双范围和行/详情模拟流程；其 `SIMULATED_PREVIEW / NOT_NATIVE_CHROME` 明示不做真实卸载。实际正式版有 Catalog 离线恢复清理节点 `#extension-center-cleanups`，需要在真实截图/原位预览对照时专项核验，不能以 Mock 自评一致率。

### GitHub Actions 与构建身份（按精确 SHA 分级）

| 验证对象 | 可证明的事实 | 不可越级认定 |
| --- | --- | --- |
| R4.9 `024975b47` | [38767521693](https://github.com/shopable-ai/opendesk-browser/actions/runs/38767521693) SUCCESS，历史 219 个定向 PASS，check/build/build:dev/verify PASS；production `3fbd045cf7c8d5b0b00a05fd3a1981bd4504e036126f96549889df8b24ce18c4`，development `35f10860bafa61aadfb7df0bb954731fd41191eb38c170c242bc01e4884bf5df` | 不属于 R5.1 |
| R5.0 `1f0aef5` | [38774956234](https://github.com/shopable-ai/opendesk-browser/actions/runs/38774956234) SUCCESS，73/73 Extension + 153/153 Host/Cloud/Task，check/build/build:dev/verify PASS；job `116560093784` 日志 production Standard Hash `67b1d2b7ee6e1faef24c682def893f43ba03d67102dd3bfec052afe979d121d8` (102 assets)，development Standard Hash `01eda3c7ed16aa1d1bb42d097d138762a20a33329a65a45828174c26cb43a2b3` (140 assets) | 不属于后续 main 安装包 |
| R5.0 后历史失败样本 | [38776039540](https://github.com/shopable-ai/opendesk-browser/actions/runs/38776039540) 在 Node step 失败：旧测试遗漏重新安装版本，Page 读取错误断言过期，以及 Host 新恢复接口引发旧静态导出正则失败。前两处已在并行 main 中另行修正，第三处由本轮修正 | 历史失败不得改称 PASS |
| 本轮最新触及源码/测试的候选 `95993194` | [38780489583](https://github.com/shopable-ai/opendesk-browser/actions/runs/38780489583) 对应提交的 Extension Center CI 在本条更新时 **QUEUED**；稍早 `ce964dfe` 对应 [38779716361](https://github.com/shopable-ai/opendesk-browser/actions/runs/38779716361) 亦为 QUEUED。当前未取得新产物 Hash 或 Node/BUILD/PACKAGE 回执 | **NODE/BUILD/PACKAGE NOT_TESTED**；必须读取此候选的精确终态和 job logs，不转用旧 Hash |

### 原生十类验收与专家门禁

- 已安装 App 打开、停用 App 恢复、Page Authority 注册/撤销/恢复、网站权限撤销/manifestHash/generation、固定包安装取消、键盘焦点、草稿保护、Host/Storage 异常、搜索筛选语言/导航、**预装卸载→重开/重启不复活→显式发现→可信审阅→重装**：代码/定向 Mock 覆盖情况不等于真实点击、Chrome 注册、Native/持久读回，**十类均 NATIVE_NOT_TESTED（本机环境 BLOCKED）**。
- 十一维：高频效率、主操作语义、组件去重、信息架构、视觉交互、可访问性、真实生命周期、安全权限、异常恢复、预览与正式一致性、真实 Chrome 体验：**全部 NOT_SCORED**，尚不能给出逐维 95+ 或真实产品完成百分比。
- Mac 本机继续只读核实 `git status --short`、远程/本地 HEAD、现有 watcher、Chrome `chrome://version` / `chrome://extensions` 的 Profile/ID/加载路径、Go Native doctor 的 extension ID/allowed origins。当前 `dist/development` 有 watcher 时禁止覆盖构建；在资源 Owner 允许的隔离 CFT/Profile 用冻结 production Standard 候选做同包 P0 原生证据、截图/computed style 和权限/持久读回。旧候选 PASS 不晋升；本轮还未完成 FINAL_ACCEPTED。


## R5.2 · GitHub CI 断言闭环与原生 Mac 交接（2026-10-16）

- **真实执行边界**：本轮从 GitHub 连接读取最新 `main`、源 Blob、原始 GitHub Actions job log，并在唯一 `main` 通过 GitHub API 安全提交一个过期测试合同修正。当前执行容器是 Linux，不能访问用户 Mac 的 `/Users/shopme/Documents/workspace/opendesk-browser`、既有 `npm run dev` watcher、`dist/development`、Chrome Profile、Extension ID 或 Native doctor；没有对日常环境或正式扩展实施任何实际用户点击/卸载/授权操作。
- **历史失败的实因**：[Extension Center 38781406764](https://github.com/shopable-ai/opendesk-browser/actions/runs/38781406764) 在 `79f48dbfbf69dd556edf3340687f396b3af8fe26` 为 COMPLETED/FAILURE，Node 第一分组 78/79 PASS，`tests/environment/extension-center-r47-menu.test.mjs:83` 仍断言候选直接 `if(!row.installed)actions.append(detailButton('审阅并安装'...))`，而正式源码已增加 `cleanupPending` 恢复清理分支。另两次 [38781978324](https://github.com/shopable-ai/opendesk-browser/actions/runs/38781978324) 和 [38782068364](https://github.com/shopable-ai/opendesk-browser/actions/runs/38782068364) 的原始 job logs 出现相同单项失败。它们的后续 check/build/verify 步骤均 SKIPPED，不能凭此判断构建失败。
- **确实写入的修复**：[5fa01dd1fb8237b18917c3bbb4595750fb36412e](https://github.com/shopable-ai/opendesk-browser/commit/5fa01dd1fb8237b18917c3bbb4595750fb36412e) 只修改 `tests/environment/extension-center-r47-menu.test.mjs`，以真实 `src/ui/extension-center.js` 审阅-清理分支替换过期的无清理分支正则，并增加「清理待完成必须恢复」「否则才审阅并安装」「候选只入详情而不直装」「不得恢复旧快捷直装」守卫。源 Blob `30977ece71d40bbaaa3d17d5726e1e471d9ba679`，测试新 Blob `ae027f300dfb3e030497428f06e73a5bc45d7c64`。提交前逐条匹配真实源字符串；这是 SOURCE_CONTRACT_CHECK，不是 Node PASS 或 Native PASS。保留正式清理保护，无 Host/SDK/安装器绕过。
- **精确新 CI**：[Extension Center 38788700860](https://github.com/shopable-ai/opendesk-browser/actions/runs/38788700860) 对应提交 `5fa01dd1fb8237b18917c3bbb4595750fb36412e`，首次读取为 QUEUED。尚未取得这个 SHA 的 Node/check/build/build:dev/verify 终态或 production package SHA256，不复用旧候选产物作为新候选。
- **原生 P0 / UI parity / 95+ 状态**：十类真实 Mac Chrome 操作均 NATIVE_NOT_TESTED（当前环境 BLOCKED）；未做实际 Chrome 重启后 Cookie Editor 卸载不复活、重装/更新 Hash 读回、Page 原生权限注册、安装身份、真键盘/截图/Computed Style。唯一预览保持 `prototypes/sidebar/extension-center-r47-frequency-first-preview.html`，没有第二预览或 Mock 冒充。十一维正式专家评分全部 NOT_SCORED，**不得宣告 FINAL_ACCEPTED**。
- **本机 Owner 下一个最小任务**：在已有 Mac 工作树先只读核对 `git status`、HEAD/remote、watcher/端口、实际 Chrome Version/Profile/Extension ID/Load Path 与 `opendesk browser doctor`；复用已有 watcher 并守护 `dist/development`；确认上述精准 CI 终态；然后在隔离 CFT/Profile 执行十类 Native P0、截图、Host/Authority/持久读回及唯一预览对照。遇可复现缺陷才修源码并冻结新同 SHA/hash 候选。

## R5.3 · 本地 Mac 实测（2026-10-16，IN_PROGRESS）

- Owner：Codex App 对话 `01a143ed-9f5c-7103-8b0e-6d4cc503026d`；仅 `main`。起始 HEAD `fd6167709ee58abae8c8a8204717048b7e9b4709`，核对无重叠后 fast-forward 至 `9522a6bdfc8aa3c2b5d0e4eb0760a4fc1837caec`；保留其他任务的 `src/ui/local-project.js`、对应测试和 API 文档未提交修改。
- 本轮写入范围：本记录；复现后再声明扩展中心源/回归的精确路径。子 Agent 仅只读查询 CI 与已有验收入口，不占有源码。原始证据使用 `artifacts/extension-center-r51-native/` 下本轮独立候选目录；不创建第二账本。
- 资源：复用已有 PID 1918 的 dev watcher、PID 1938 的 `127.0.0.1:43119`，不停止或覆盖 `dist/development`；日常 Chrome 只读身份检查。隔离 production 快照/Profile/端口待登记后启动；不使用其他任务的 schedule CFT Profile。Git fast-forward 事务已结束，当前不占用索引。
- 首次 doctor：真实应答 `extensionId=ccfcjegpkdlgbclopjmadlcjedelidmf`、`nativeConnected=true`；Native manifest 的 `allowed_origins` 为同 ID。此结果尚不证明加载路径和开发连接。
- 复用结论：历史 R5.2 只有组件/CI 交接，十类 Native 证据缺失；本轮补实际 Chrome，保留历史结果，不升级旧 Hash。当前 `gh` 不在 PATH，使用 GitHub 既有连接/官方 API 查询精确终态。
- 通过条件：真实安装身份、同候选 Chrome 用户操作/持久读回/截图、CI 与包校验分别记录；缺项保留 BLOCKED/NOT_TESTED，十一维原生不足则 NOT_SCORED。
- 真实新增缺陷与扩展写入范围：Cookie Editor 保存成功后 `render()` 清空列表时遗失隐藏编辑器，下一次 `setBusy` 对 null 设置 disabled，造成未处理 rejection 及保存中拦截返回。原始栈/截图保留在 `9522a6bdf-r53/native2`。本 Owner 协调 `examples/sidebar-tools/cookie-editor/src/main.js`、`tests/environment/cookie-editor-ui.test.mjs` 的定向修复/回归；主 Owner 负责必要版本元数据、唯一正式包及相关既有预览版本标记（实际修改前核对）。不改 Host/SDK/公共按钮规则。采用 sidebar-tool-dev 与 sidebar-tool-package Skill，先候选/测试再晋升。
- 独立构建资源：普通源码快照 `.runtime/extension-center-r53-01a143ed/candidate`，独立依赖副本与守卫 `43253`。production Standard 已构建/verify，Hash `05c0a02ad92b5e071332e2bf2226b616c7be7a084ce866d0e8671d6486d03c91`；CFT155 专属一次性 profile、扩展 ID `jpehbapcnemnkpamggjplenhahhkhoop`。日常 `ccfcjeg…` 不替换。driver 初次 stdin/重启协议错误的失败记录保留，非产品 PASS；实际原生操作从 `native3` 记录。
- 新增精确测试写入范围 `tests/environment/sidebar-tools.test.mjs`：Mac `/var` 临时目录经 `realpath` 为 `/private/var`，晋升器返回规范真实路径而旧测试比较别名字符串，需将期望同样规范化；不改变打包器/安全规则。曾误把末尾 tail 的退出码当成测试退出码，在此失败未解决时提前更新本地正式 JSON；尚未提交，该状态不认定 PACKAGE_PASS。保留原日志，修正后完整门禁重新执行并再次核对/晋升。其余精确元数据路径为 `tool.config.json`、`cookie-editor-r43-parity.test.mjs` 与既有唯一扩展预览中的版本标记。


### R5.3 新对话续接检查点（2026-10-16）

- 当前 HEAD `b47eac760725ab18692e048e7f015fa31a4d5487`；本任务尚未 commit/push。其他任务的 API 文档、local-project 工作记录和 site-access 测试差异保留，不纳入本任务提交。索引检查时为空，续接须再次核对。
- Cookie 保存后共享 editor 被列表重绘移出根节点，导致 setBusy 查询空节点并卡死；最小修复在重绘前将共享表单保留在原有 slot。回归夹具补真实父子归属以复现此缺陷。正式唯一包升级到 2.0.14，原始文件 SHA-256 `e19b002683847c771ace27bdbceb9f826dbaa00fd5d7fc8d9ad96a46fff6bd8f`。
- 已纠正前述晋升顺序问题：`fix/complete-package-gates.tap` 177/177、`fix/extension-regression.tap` 59/59，均零失败、零跳过；随后重新执行同候选 promote/check-project 成功。根证据目录 `artifacts/extension-center-r51-native/9522a6bdf-r53/`。
- 原生证据 native3/01 至 15：真实卸载、Sidebar 重开及整个 CFT 同 Profile 重启不复活、官方发现与审阅取消、重新安装、停用与启用不自启；本地文件合法更新 2.0.13→2.0.14；可信宿主确认创建及再次保存测试 Cookie 均恢复可用；返回列表时取消丢弃，草稿仍保留。以上绑定基线 production Host 加更新后的工具包，不能提升为尚未冻结的新全扩展候选 PASS。
- 本轮专属 CFT PID `15007`、Chrome `155.0.8059.39`，Profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-rl4cifry`、扩展 ID `jpehbapcnemnkpamggjplenhahhkhoop`；身份以 native3/launcher-extension-r53.json 及存活进程复核。当前停在标准 demo-form 页的 Cookie 设置/未保存 r53_unsaved 草稿，未决确认框已取消。浏览器保留供续接，不触碰其他 CFT。
- 尚未修复：本地包安装/更新审阅缺少 Hash。只读诊断已确认 chooseFile() 仅展示文件名，sidebarToolPackageHash() 为规范序列化 SHA；应明确区分其与官方发行原始字节 SHA。拟修改 src/ui/sidebar-tools.js、tests/environment/sidebar-tools-host.test.mjs，相关子 Agent 已停止且没有文件写入或测试结果。
- 未完成：日常 Chrome 的 serve 连接证明；最终提交及对应 CI；同最终候选 production 原生复验；Page 原生注册/撤权、旧实例请求拒绝、异常恢复等剩余场景；唯一预览对照截图/Computed Style；十一维均暂不宣称 95+。当前日常目录/ID/Native 配对正确，但 43119 已建立连接来自另一个旧 CFT，不能冒充日常 Chrome 已连接。

### R5.3 续接执行（2026-10-16）

- Owner：Codex App `01a14415-d4f0-7202-bcc9-fae459ded4f7`，承接原 Owner；恢复时 main/HEAD/origin/main 均为 `b47eac760725ab18692e048e7f015fa31a4d5487`，索引为空。保留 API/local-project/site-access 三处他人差异。
- 新增精确写入所有权：`src/ui/sidebar-tools.js`、`tests/environment/sidebar-tools-host.test.mjs` 与本记录；承接上节 Cookie 源码/版本/唯一包/测试/预览版本已有差异。子 Agent 仅只读 CI 并保存本轮 artifacts 原始回执，不写共享源码和记录。
- 通过条件：本地审阅展示候选及适用的当前包规范序列化 SHA-256，明确规范化语义，不误称文件字节 SHA（文件本身已规范化时两值可以相等）；官方发行 SHA 保留原始文件语义；异步 fileSelection/取消无副作用回归通过；同 production 候选经原生输入审阅复验。其余真实场景按实际可执行入口推进，缺证据逐项 NOT_TESTED。
- 资源复核：PID15007 的命令行/Profile/production 路径匹配本任务；PID1918/1938 watcher 保留。基线 production 不覆盖，冻结修复候选使用独立输出并明确记录模式切换。现有失败日志和提前晋升过程事实保留。

#### R5.3 本轮实现与原生复验

- Hash 最小修复沿用 `sidebarToolPackageHash()`：本地审阅同时展示候选与适用的当前包规范序列化 SHA-256；官方来源明确显示“原始文件 SHA-256”。计算期间保持 `fileSelection`、销毁和当前安装包身份检查，取消或被新选择取代的旧计算不恢复审阅。新增两项回归覆盖规范 Hash/取消无副作用及延迟计算被取消、被替代。
- Cookie 2.0.14 唯一正式包保持 `e19b002683847c771ace27bdbceb9f826dbaa00fd5d7fc8d9ad96a46fff6bd8f`；本轮 179 项包门禁 PASS 后再次 `--promote-from`、`--check-project` 返回 PROJECT_PACKAGE_MATCH、unchanged。前轮最初提前晋升的失败过程仍保留，不能改写为当时成功。
- 定向证据根目录仍为 `artifacts/extension-center-r51-native/9522a6bdf-r53/`：`fix/hash-review-host-final.tap` 91/91、`fix/hash-extension-regression.tap` 59/59、`fix/complete-current-gates.tap` 179/179，均零跳过。已有 Cookie/扩展中心证据继续保留。只读独立代码复核无可行动发现，四个变更 JS 文件语法检查通过。
- 独立 production 输出 `.runtime/extension-center-r53-01a14415/final/dist/production`，未覆盖 watcher。候选 A `079675874f5fc61c7fd62c737f33e5a61ce9827f6df275cad5a654d2ba7a60da` 的 Hash 文案存在绝对“不等于”表述，已修正并重建为候选 B `68aa0eab1ae2f3a18c74910a1a0156559ca7ec062c1e0c18c66922af3ad2695e`；原始构建、失败/观察均保留。B 的基线是 `2d87cabadf3b5c6932ddd6760913042e1f955c3a` 加本任务改动，尚不能冒充后续 main 提交包。
- 专属 CFT 155.0.8059.39，PID26651，Profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-8qms5jpf`，真实扩展 ID `jakakjeeabdicpeiniooccmdhooianmj`，加载上述隔离目录。旧 PID15007 已通过所属 Chrome 菜单退出。`final/native/launcher-extension-r53*.json` 保存配对身份，观察脚本每次核对进程/Profile/实际加载路径并读回真实状态。
- `final/native/06-final-hash-review.json`：真实本地 2.0.14 审阅展示当前/候选规范 Hash；相同包按钮禁用。`11-final-official-review.json` 显示官方原始 SHA 与候选规范 SHA，`12-final-reinstalled-no-autorun.json` 证明正式审阅安装后无工具 iframe 自启。原 2.0.13→2.0.14 同 ID 更新仍绑定 `native3/12–13` 的基线 Host，不提升为 B 的升级证明。
- B 的真实 Cookie 保存及再次编辑保存见 `08-final-cookie-saved.json`、`09-final-cookie-saved-again.json`；可信宿主确认后 Chrome Cookie 读回存在，按钮可继续操作。卸载确认明确说明删除工具本地数据/授权；确认卸载不另加可被动态工具否决的草稿确认，符合既有安全合同。取消离开保留 `r53_final_guard` 草稿见 `23-final-draft-cancel-kept.json`，之后明确丢弃这份验收草稿。
- 网站元数据权限通过可信设置授予再撤销，运行中列表清除并显示 E_SITE_GRANT_REQUIRED，见 `22-cookie-site-revoked.json`；恢复授权可重新显示 Cookie。授权切换期间观察到保守的“结果可能未知、勿自动重试”提示，未伪造成功回执。
- Page 经真实开发编辑器编写无副作用测试、Chrome 原生用户脚本开关、试运行、验证固定修订和安装。`16-page-permission-missing.json` 为缺权限拒绝；`17-page-installed.json`、`18-page-disabled.json`、`19-page-enabled.json` 对应真实 Chrome USER_SCRIPT 注册→空→恢复同 ID。测试程序 `my-script` r1，sourceHash `cb553cfeb47f8dd97516b3e4bc762629bf70861ce7454becd2a6123899306724`，限定 `http://127.0.0.1/*`；不是伪 API。
- 原生键盘 End、Home、Down、Escape、Tab 已实际操作，End 状态读回见 `13-menu-end.json`，Escape 后焦点回触发器；其余不扩大为完整可访问性 PASS。搜索 Cookie、Page 类型筛选、恢复默认及刷新已操作，见 `20-final-cookie-search.json`、`24-page-type-filter.json`；市场入口打开真实 marketplace.html，见 `26-market-open.json`。语言选择 English 可写回，扩展中心现有主体文案仍为中文，随后恢复中文；不宣称完整英文化，见 `25-language-english.json`。

#### R5.3 唯一预览与正式界面对照

- 同一正常 Chrome 窗口、相同 Cookie 搜索/已安装启用 2.0.14 状态；独立本机 43254 HTTP 服务加载既有唯一 HTML。`file:` 直接打开会被 CSSOM 同源限制拒绝，保留观察，不修改/放宽设计校验。
- `final/native/21-preview-cookie-comparison.json` 及两张同名前缀 PNG 保存正式 Side Panel 与预览截图、Computed Style。正式内容区域 360 CSS px，预览外壳边框导致内容 358 px；这是正常窗口实际读数，未做缩放、拖拽或宽度矩阵。
- 一致：工具条高 50、行高 72.3984、打开按钮 42×34、padding 4×8、gap 7、主要色值、列表边框及圆角。差异：预览外壳白底/正式页面浅灰、继承字体 13/19.5 与 9.75/14.1375、按钮行高 18 与 17.4、Cookie 示例标题/描述及真实状态提示、预览搜索出现双焦点轮廓。对照结论 PARTIAL，未重做设计，未声称像素一致。

#### R5.3 十类验收与评分边界（提交前）

| 类别 | 当前证据及仍缺项 |
|---|---|
| App 行/打开与实例 | 真实行入口可打开 Cookie，单 iframe 读回；重复入口全序列未完整留证，PARTIAL |
| 停用/恢复与旧实例 | B 停用、启用且不自启有读回；旧实例携带旧身份的实际请求拒绝 NOT_TESTED |
| Page 原生状态 | B 注册、停用、恢复匹配 Chrome USER_SCRIPT；撤销/卸载后恢复的全序列尚未正式关闭，PARTIAL |
| 网站权限/旧身份 | 缺权限、网站授权撤销及恢复真实验证；旧 manifestHash/generation 请求 NOT_TESTED |
| 安装/更新/取消 | 基线 Host 同 ID 2.0.13→2.0.14；B 官方安装、Hash 审阅及相同包拦截；最终提交包待绑定 |
| 键盘/焦点 | 菜单导航、Escape、Tab 已实际操作，完整焦点链仍 PARTIAL |
| 草稿保护 | 基线和 B 返回取消保留；明确卸载确认生效；打开/切换/启停全部组合 NOT_TESTED |
| 异常恢复 | Node Host false、存储错误、重复/过期结果等回归覆盖；无法通过合规产品入口注入的真实故障 NOT_TESTED |
| 搜索/筛选等 | B 搜索、Page 类型、默认恢复、刷新、市场、详情返回、语言选择；主体英文翻译非完整，PARTIAL |
| 卸载/不复活/清理 | 基线真实卸载、Side Panel/Chrome 重启不复活、重新发现安装；B 卸载重装；真实清理失败/损坏 fail-closed NOT_TESTED |

- 十一维（高频效率、主操作语义、组件去重、信息架构、视觉交互、可访问性、真实生命周期、安全权限、异常恢复、预览与正式一致性、真实 Chrome 体验）全部保持 **NOT_SCORED**；上述局部原生成功和 Node 数量都不能推出 ≥95，正式验收未通过。
- 日常 Chrome 实际 ID/Native 配对继续有效，但当前服务连接来源仍无法绑定到日常实例。调试入口位于 Side Panel「调试→本地开发服务」；日常本地项目草稿/执行属于其他会话，未重载、未切目录、未停服务，连接项 NOT_TESTED。其独立 43119 客户端不是日常连接证明。
- 主分支正常快进接入无重叠远端更新，保留三处他人差异。最终提交/CI/新 production 候选身份在下节追加，不复用旧包全体 PASS。
