# OpenDesk Browser · Skill 宇宙与创建准入（2026-10-14）

**定位：技能规划登记簿，不是另一个 SDK、Runner 或 UI Design System。** 实际规范继续由 `AGENTS.md`、`docs/api/`、`docs/architecture/`、`docs/framework/testing-guide.md` 等现有权威拥有。每次提出新 Skill 时，先在此表核对重复和已有实现，再决定 **新增 / 扩展已有 / 暂缓**。

## 一、为什么需要统一宇宙

已有的 4 个技能主要负责用户脚本、程序发布、可安装沙箱工具及第一方可信工具业务。缺口是两类**扩展维护者**的稳定工作流：

- **扩展内置界面开发**：创建/修改“我的、发现、工作流、开发、工具、云控”等既有 Tab 内的列表、详情、表单、折叠内容与返回，不应每次重新发明样式。
- **Chrome MV3 多世界工程**：分清 Background / Content Script / MAIN / Page USER_SCRIPT / Controller Worker / trusted Side Panel / Native Go，避免业务/权限/生命周期混写。

这是**技能触发与执行约束**问题，不是缺另一套规范。已存在 [R27](../../docs/architecture/ui-layout-conventions-r27.zh-CN.md)、[R28](../../docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md)、[R30](../../docs/architecture/sidebar-design-system-r20.zh-CN.md)；新技能**必须引用**，不得重复定义颜色或间距系统。

## 二、独立评分规则（创建价值，不是产品质量）

每个候选分别打分且留存决策，满分 100：

- `F`：跨项目复用频率，0–25；
- `I`：失败风险与用户影响，0–25；
- `B`：职责可区分、不与已有 Skill 重叠，0–20；
- `T`：能否形成明确步骤、实际测试和失败门槛，0–20；
- `C`：维护成本/长期简洁性，0–10。

分数 `F+I+B+T+C` 是**新增独立 Skill 的价值预评估**。它不代表该 Skill 文档质量、代码完工百分比、UI 专家评分或 Chrome 实测 PASS。

准入门槛：`≥95` 且边界清楚、有真实入口/测试、不会造第二套权威，允许本轮新增；`85–94` 先增强对应既有 Skill 或等待新的重复失败证据；`<85` 默认不新增。**门槛不是机械批准**：如果候选与已有核心 Skill 重复，即使 ≥95 也合并而非创建；已存在的 Skill 不再重复创建。新增后还要完成静态检查及后续真实变更的原生验收。

## 三、已存在的四项（维持并优化，不重复建）

| Skill | 主要用户意图 | 当前决策 |
| --- | --- | --- |
| `opendesk-script-authoring` | 开发 Tab 编写 JavaScript / React / Vue、Controller/Page 试运行 | 已存在，保留 |
| `opendesk-program-publish` | 本地项目、冻结 Candidate、安装/升级/发布及结果归属 | 已存在，保留 |
| `opendesk-sidebar-tool-dev` | 可安装 `opendesk.sidebar-tool.v1` 的 HTML/CSS/React/Vue 沙箱工具 | 已存在，保留 |
| `opendesk-trusted-sidebar-feature` | 随扩展发布的 Time Review/Stay Focus 等第一方可信业务与最小解耦 | 已存在，保留 |

## 四、待建/待合并候选宇宙（每项独立评分）

| 候选 Skill / 能力域 | F/25 | I/25 | B/20 | T/20 | C/10 | 独立得分 | 结论 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `opendesk-extension-ui`：内置 Tab/列表/详情/表单/排版 | 25 | 25 | 20 | 19 | 9 | **98** | **本轮新增**，最高优先级 |
| `opendesk-extension-runtime`：MV3 多世界、WXT/Host/Authority | 25 | 25 | 19 | 18 | 9 | **96** | **本轮新增**，与 UI 分开 |
| `opendesk-ui-visual-acceptance`：缩放/主题/键盘/截图 | 24 | 25 | 15 | 20 | 8 | **92** | **融合到 extension-ui**，先不增独立技能 |
| `opendesk-browser-sdk-contracts`：官方 API/SDK 清理 | 23 | 24 | 17 | 18 | 8 | **90** | 待 R10.x API 稳定再评估；本轮融合 runtime |
| `opendesk-ui-accessibility`：焦点、ARIA、键盘与 WCAG | 24 | 25 | 13 | 20 | 8 | **90** | 融合到 extension-ui 验收，不造第三套 UI 规范 |
| `opendesk-extension-release`：WXT 构建/签名/包验证/商店 | 22 | 23 | 16 | 19 | 8 | **88** | 融合 runtime+testing-guide；有独立发行工作流时复评 |
| `opendesk-extension-test-debug`：CI/原生 Chrome 故障闭环 | 23 | 23 | 15 | 20 | 7 | **88** | 使用 `testing-guide.md` 与 runtime/UI 内测试流程 |
| `opendesk-extension-security`：权限/CSP/跨域/撤权 | 24 | 25 | 12 | 18 | 7 | **86** | 融合 runtime 和 trusted-feature；独立审计职责成熟后复评 |
| `opendesk-tab-navigation`：Tab → Index/Detail/Form 状态机 | 25 | 24 | 8 | 20 | 8 | **85** | 融合 extension-ui/R28；拒绝重复“导航 Skill” |
| `opendesk-marketplace-page`：发现/应用市场列表、详情 | 22 | 22 | 15 | 17 | 8 | **84** | 复用 extension-ui；安装/分发仍属现有 Market 合同 |
| `opendesk-schedule-plan-ui`：我的 → 定时计划专用 UI | 24 | 25 | 6 | 19 | 9 | **83** | 作为 extension-ui 首个验收案例，不新建 |
| `opendesk-design-token-css`：统一样式、Tailwind/间距 | 25 | 24 | 6 | 19 | 8 | **82** | R27/R30 唯一权威，extension-ui 负责执行 |
| `opendesk-native-mcp`：Go/Node Local Dev 配对/文件 | 22 | 24 | 9 | 18 | 8 | **81** | 先扩充 program-publish/runtime，不建第二套入口 |
| `opendesk-options-settings`：扩展 Settings/配置页面 | 23 | 22 | 8 | 19 | 8 | **80** | 复用 extension-ui 的按界面分类规则 |
| `opendesk-form-controls`：表单字段/折叠/错误提示 | 23 | 23 | 7 | 19 | 8 | **80** | 复用 extension-ui/R27；不独立定义 CSS |
| `opendesk-scheduler-runtime`：定时执行/Alarms/Stop | 22 | 23 | 9 | 18 | 7 | **79** | 先复用现有 Task/RunHost/runtime 规范 |
| `opendesk-stay-focus`：单功能专用技能 | 23 | 24 | 5 | 18 | 8 | **78** | 复用 trusted-sidebar-feature，不按产品无限拆分 |
| `opendesk-react-only`：React 单独代码技能 | 23 | 21 | 4 | 18 | 8 | **74** | 由 script-authoring / sidebar-tool-dev 按运行环境路由 |
| `opendesk-vue-only`：Vue 单独代码技能 | 23 | 21 | 4 | 18 | 8 | **74** | 同上，不建 |

分数是在**当前仓库和已知实际反复问题下的专家预测**，不声称经过独立用户访谈或量化生产事故统计。主要价值是能解释“为什么建/为什么不建”，未来新证据允许逐项调整评分与结论，不整体修改其它候选的分数。

## 五、首个约束实例：我的 → 定时计划

当前 `src/ui/tool.html` 已有 `#workbench-tasks` / `#scheduled-panel`、计划 Index、Form、Manager、独立 runner；`src/ui/scheduled-task-workbench.js` 中 `show(view)` 切换子视图。当前 `renderPlans()` 仍在**每张列表卡**内渲染运行历史、技术版本、更多操作、删除确认。它有信息密度和独立详情缺口，**但不能说“没有任何列表/表单分离”**。

本轮新增 UI Skill 的验收起点：

1. 按 R28/R30 先绘制真实导航：`我的 Tab → 定时计划 Index → （必要时）单计划 Detail → 编辑/创建 Form → 返回`，不能新建一层全局 Tab。
2. Index 以“计划名称、下次执行时间、频率、状态、1–2 个高频操作”为主；历史/完整版本/删除确认移往合法的 Detail/辅助入口，保留原 `scheduleId/generation`、Host/Stop 与撤权。
3. 头部优先 `od-page-head/title/actions`，折叠标题用 `od-disclosure`；以 `src/ui/design-tokens.css` 为唯一 token，不为“计划”重定义一组间距、颜色或按钮。
4. 测试空/一/二十条、20+ 历史、计划修改未保存、暂停/恢复/删除、无 Host/UNKNOWN、320px/200% zoom、深色、真实键盘和焦点。实际 Chrome 身份与测试证据独立记录。

**状态：这是后续产品 UI 修改的验收要求；本 Skill 宇宙提交不意味着以上产品代码已经被修复或真实测试通过。**

## 六、防止 Skill 目录无限膨胀

- 每个技能必须：非重叠触发、真实源码入口、引用唯一权威、至少一个失败/验证场景、维护人或归属范围；
- 一次新需求先查本目录“已存在”和候选评分，能补原技能即不增新技能；
- 创建新 Skill 时同步 `.agents/skills/README.md`、本宇宙及对应专属工作流；
- 自动化测试核对目录 slug/frontmatter、README 路由、宇宙登记及新 Skill 的关键引用；这只是 `DOC_STATIC_PASS`；
- 每次真实产品 UI 变更才执行相关源码测试、构建和原生 Chrome 视觉/行为验收。`95` 作为实际质量门槛不能靠 Skill 自评或静态检查代替。
