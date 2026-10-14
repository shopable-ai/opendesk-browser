# OpenDesk Browser · 书签管理工具 R1｜设计与交付工作流

> **已被 R1.2 替代的 UI 设计说明**：R1.1 把「文件夹」与「书签」拆开，用户反馈占行过多、概念重复。现以[统一书签文件树与功能宇宙 R1.2](../../docs/product/bookmark-manager-feature-universe-r12.zh-CN.md)和更新后的 [HTML 原型](bookmark-manager-preview.html) 为准。原 R1.1 说明保留作历史决策记录。


日期：2026-10-14。状态：R1.1 HTML 原型交互修订并完成受控 Chromium 模拟测试；真实 Chrome 书签模块仍未实现、未验收。
目标仓库：https://github.com/shopable-ai/opendesk-browser ，代码分支 main。

## 一、方案选型

- 一级导航不新增书签 Tab。入口是「工具 → 已安装工具 → 书签管理」，发现选项卡继续负责发现/市场。
- 书签管理包含工具内部「书签列表 → 书签详情 → 新建/编辑/移动/删除确认」；在独立窄 Side Panel 中均为同 Tab 子视图，返回后保留搜索、文件夹、滚动和焦点。设计预览画布可以将侧边栏和选中对象的上下文信息并排展示，但不能把右侧上下文画布当成真实 Chrome 侧栏能力。
- 官方第一方可信功能优先，业务模块独立于通用 Sidebar 宿主。使用现有权限与生命周期，不添加第二套 Installer、Host、Scheduler、Registry 或 Browser SDK。
- 书签源头是 Chrome bookmarks API；当前 SDK `browser.bookmarks.create/removeOwned` 不足以完成全量管理。完整树读写仅经审计可信路径，不能赋予任何动态包全量管理权限。
- `manifest.json` 已有 `optional_permissions: ["bookmarks", ...]`。按需用户手势请求，拒绝后展示明确操作，撤权后关闭写入/读请求，不误报空数据。

## 二、R1.1 产品界面约束（书签与其他工具通用）

- 独立工具和二级视图顶部默认只有 **返回 + 当前标题 + 必要操作**；不得紧跟固定描述、价值文案、重复面包屑。如「书签管理 / 整理你的 Chrome 书签」和「与 Chrome 书签保持同一份数据」应移出标题区。只有会改变用户行动的状态才在所属区域展示。
- **书签操作属于书签工具栏**：「收藏当前页」「添加书签」；**目录操作属于文件夹标题栏**：「文件夹」右侧永久可见「＋ 新建文件夹」。每个自定义目录行有可发现的 `···`，提供重命名/移动/删除，不靠隐藏右侧详情页才能找到。
- 新增/编辑/移动/危险删除的确认表单必须在宽度 320/360/420px 的侧栏自身可用；预览页面额外的「上下文区域」仅用于说明/独立展示，不能成为产品功能的唯一操作位置。
- 根目录、Chrome 管理策略只读目录和当前权限不足状态须禁用或不显示不合法操作；非空目录删除必须列出将受影响的书签和子目录并确认。

## 三、独立用户旅程

1. 工具索引：已安装工具中看到书签管理；需要启用时，点击后由可信宿主说明 Chrome bookmarks 权限；授权拒绝不强制安装或伪造数据。
2. 收藏当前页：在真实受控 tab 上主动收藏，重复 URL 给出定位现有书签或确认创建副本。
3. 浏览：动态读取根目录及子文件夹；书签栏、其他书签、可能存在的移动端文件夹以真实 ID 识别，不假设固定 ID。
4. 搜索：按标题/URL 搜索，按文件夹/最近新增/名称排序。搜索失败与结果为空区分显示。
5. 详情：点击某条书签，展示 URL、文件夹路径、日期、打开入口、编辑、移动、删除；返回维持列表上下文。
6. 编辑/移动：可信 Host 校验真实节点仍存在、未被管理策略锁定、目标目录有效；成功后通过 Chrome 事件或重新查询反映最新状态。
7. 删除：删除书签需二次确认，删除非空文件夹需独立说明子项数与级联后果。单条删除可设计会话级还原，但不得伪称 Chrome 原生永久回收站或恢复原 ID。
8. 变化/权限：其他 Chrome 窗口、浏览器同步改动和权限撤销应让当前工具刷新/禁用适当操作，不覆盖更新。

## 四、P0 / P1

P0：只读树/文件夹浏览、搜索、当前页收藏、创建书签、创建文件夹、编辑标题/URL、重命名文件夹、移动书签/文件夹、打开、删除确认、空态/加载/错误态、权限状态、事件更新、深浅主题和320/360/420px响应。

P1：批量多选、拖拽排序、重复检测与处理、失效链接扫描（必须明示网络副作用）、本地标签/备注、快捷收藏、智能分类（需要独立隐私设计）、导出/导入策略（优先复用 Chrome 原生能力，避免创建不必要的副本）。

## 五、建议代码所有权（实施前按最新 main 再核查）

- `src/bookmark-manager/`：`policy.js`（节点/URL/变更约束），`model.js`（UI/领域投影），`service.js`（可信 Chrome API 适配/事件），`trusted-ui.js`（静态审计 UI）、`host-controls.js`（权限/危险动作确认，复用现有控件）。文件名可按现有仓库范式调整，不为层次而增加空文件。
- `src/ui/sidebar-tools.js`：仅保留宿主通用挂载/索引/生命周期接线，避免夹带书签业务查询、搜索/排序算法。
- `src/ui/tool.html`、相应作用域样式：工具索引入口与对应详情视图最小接线。
- `manifest.json`：已有 optional bookmarks 许可，除非证实必要，不扩大权限。
- `tests/environment/bookmark-manager*.test.mjs`、`tests/framework/bookmark-manager-native*.test.mjs`：真实测试和负例。
- `prototypes/sidebar/bookmark-manager-preview.html`：已归档到仓库 main 的可交互独立 HTML 原型；内容为模拟数据，不具 Chrome 权限。
- 权威技能：`.agents/skills/opendesk-trusted-sidebar-feature/SKILL.md` 为可信功能主技能；`.agents/skills/opendesk-sidebar-tool-dev/SKILL.md` 为动态/可安装沙箱工具技能。不要为书签一个功能重复创建通用 Skill。

## 六、复用型标准工作流（建议 8 个环节）

1. **意图/类型分流**：判断第一方可信功能、用户安装动态工具，还是 Controller/Page；收集用户故事与隐私影响。
2. **当前仓库/契约核查**：读取 AGENTS、目标 Skill、R27/R28 和实际源码、最新 main 与并行写入；列出复用项及真实缺口。
3. **产品信息架构**：一屏内主对象、索引/详情/表单/确认、加载/错误/权限状态，明示不做事项。
4. **HTML 原型 + 上下文展示（强制）**：生成独立 HTML，使用示例数据、无副作用，并在当前对话的可视化区域直接呈现；支持至少 320/360/420 宽度与典型交互。
5. **设计评审与冻结**：逐项评分功能完整性、信息架构、交互、架构边界、安全、可测性；逐项 ≥95 才进入实现。未达标返回环节 3/4，不拿综合平均遮挡单项不足。
6. **最小源码实施**：按已审原型开发；可信业务代码独立；沿用官方 Host、单一权限体系和数据源；不装新依赖或重做框架。
7. **真实回归与安全负例**：Node/Build、权限拒绝、并行变更、长 URL、大数据、外部同步、跨工具权限、撤权/卸载和版本升级；保留原始失败。
8. **Chrome 产品验收与交付**：以当前候选真实 Chrome 的截图/日志/身份核验为准，标记 PASS/FAIL/BLOCKED/NOT_TESTED，附文件清单、评分及剩余问题；未经授权不推送 main。

注意：聊天中可交互 HTML 与 Workspace 中禁用 JS 的静态 HTML 不等价；`STAGED_NOT_INSTALLED` 与真实安装也不等价。预览不得调用有副作用的浏览器操作。

## 七、已同步到仓库的规范与 Skill

- 强制「需求/权限分流 → 代码事实审计 → 用户旅程/IA → 可交互 HTML → 分项 ≥95 评审 → 编码 → 测试 → 同候选原生验收」。
- `opendesk-sidebar-tool-dev` 补充明确“原型独立源、对话上下文内展示、模拟数据无真实权限、原型审核后才打包”；其当前本地只读 snapshot 是工程预览，不替代产品交互原型。
- `opendesk-trusted-sidebar-feature` 补充“因需要全部用户书签等敏感数据而采用可信第一方方案时，优先采用 optional permission、不可传给沙箱、后台事件正确解绑”；不要把适用于 Time Review 的强制安装身份检查机械地搬给系统内置非安装功能。
- 正式跨工具流程可放在 `docs/api/sidebar-tool-development.zh-CN.md` 或被两份 Skill 共同引用的一份薄文档，避免两份复制出不同规则。前提是当前源规则优先，不能创造新的授权体系。

## 八、设计检查评分目标（非真实通过结论）

- 信息架构与导航 ≥95 / 100；
- 书签 CRUD 与异常状态 ≥95 / 100；
- 独立数据/权限/信任边界 ≥95 / 100；
- UI 320/360/420 和可访问性 ≥95 / 100；
- HTML 预览与交付工作流 ≥95 / 100；
- 同候选真实 Chrome 验收 ≥95 / 100（当前 NOT_TESTED）。

HTML 附件仅用于设计评审，尚未连接 Chrome 书签，不宣称已安装或正式功能已完成。


## 九、本轮模拟测试范围（不等于 Chrome 原生书签验收）

- HTML 受控 Chromium 交互：纯标题、文件夹区显式新建、创建子文件夹、重命名、移动及禁止自我嵌套、添加书签到新目录、非空文件夹删除确认、系统根目录禁删、HTTP(S) 地址校验、层级筛选、320px 切换和重置，共 10 组交互断言已通过。
- 原型数据仅为内存示例；未运行扩展构建、Mac Chrome 真正 200% 缩放、权限撤销/同步/管理策略、真实书签读写。正式产品分项保持 NOT_TESTED。
- 不以测试数量推导「书签工具已完成百分比」，不得把受控 Chromium 的原型验证等同于 Chrome Extension 功能验收。

## 十、仓库已写入的公共规范（2026-10-14）

- `docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md`：单标题、按集合就近创建、菜单与 Side Panel 内部表单要求。
- `.agents/skills/opendesk-trusted-sidebar-feature/SKILL.md`：第一方组件执行上述 UI 约束，不向沙箱释放书签权限。
- `docs/api/sidebar-tool-development.zh-CN.md`：八阶段设计—HTML 对话预览—测试—真实 Chrome 工作流，区别产品模拟预览和 STAGED_NOT_INSTALLED。
- `.agents/skills/opendesk-sidebar-tool-dev/SKILL.md`：动态沙箱工具也要遵守设计预览和标题/集合按钮位置规则。
- `prototypes/sidebar/bookmark-manager-preview.html`：R1.1 可交互 HTML，模拟文件夹新建、重命名、移动、删除，默认无真实数据副作用。

以上均为文档/原型交付；正式书签管理源码与真实 Chrome 数据读写仍 NOT_IMPLEMENTED/NOT_TESTED。