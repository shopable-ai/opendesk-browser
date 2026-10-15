# GOAL：OpenDesk Browser UI R32.3 — DOCUMENT-DRIVEN PLATFORM UI & REVISABLE CAPACITY

## 接续已保存方案：书签 Tree/选择器原型、现在评估 React 组件化、合理调整预算、每阶段回写文档

日期：2026-10-15。默认中文。普通 ChatGPT 网页对话，不假设能访问用户 Mac。

仓库：https://github.com/shopable-ai/opendesk-browser

Mac 路径：`/Users/shopme/Documents/workspace/opendesk-browser`，仅供后续本地运行。

唯一允许写入、提交和正常推送的分支：`main`。不创建分支/worktree/PR，不强推、reset/clean、覆盖并行工作或正式发布。

**这是 R32/R32.1/R32.2 的增量修订，不从零开始。** 保留源码分析、预览、测试和开发进度；容量政策冲突以用户本次修订为准。不要重新进行七套完整应用或大规模选型调研。

## 一、先读取已有决策，给出语义清楚的计划

先读 `AGENTS.md`、`docs/framework/parallel-development.md` 和 `docs/framework/testing-guide.md`，再读：

- `docs/architecture/browser-ui-r23.zh-CN.md`：R32.3 平台方向、候选状态、容量政策的现行架构入口。
- `docs/framework/workstreams/ui-platform-r32-20261015.md`：保存进度、来源证据和未完成事项。
- `.agents/skills/opendesk-ui-preview/SKILL.md`。
- `.agents/skills/opendesk-sidebar-tool-dev/SKILL.md`。
- `.agents/skills/opendesk-sidebar-tool-package/SKILL.md`。
- 现行工具开发/API 文档：`docs/api/sidebar-tool-development.zh-CN.md`、`docs/api/sidebar-tools.zh-CN.md`。

R20/R27/R28 继续拥有视觉、跨界面与信息架构，不创建第二套 Token 或平行 CSS 规范。重新读取最新 main 和目标差异，不把旧 SHA 当新基线。

首条说明“复用什么、先解决什么、给用户看什么、写回哪里”，不要只列编号或测试数量。随后直接执行，不只交付另一份 GOAL。

## 二、已经确认的目标

OpenDesk 尚未正式上线，是用户/AI 创建小应用的平台。组件化的目的不只美化宿主，而是避免每个应用重复开发树、下拉、菜单、焦点、ARIA 和主题。

优先**现在**验证复杂独立工具的 React 组件化，不笼统推迟到未来。简单应用保留原生路径；不把五个宿主 Tab 全量迁移当试点前置。

一个 Design System 下逐步形成：已有 Tokens/公共视觉、轻量 UI Core、待完善 UI React、Templates/Skill/Preview。它们是职责层，不是四个新框架或已经实现的同名 npm API。

React + React Aria Components 是优先研究候选，React + Radix Primitives + 明确 Tree 实现是强候选，原生实现是对照。库尚未封版，先前聊天 80/93/96 等预评分不是验收或排名依据。

平台提供丰富组件，不等于应用全量载入。按需构建，测量未用代码是否剔除；懒加载不等于不占安装空间。不同 iframe 不共享可变 React 实例。

## 三、第一交付：可操作的书签 Tree、选择器和菜单

源码：`examples/sidebar-tools/bookmark-manager/`。先核对 `examples/sidebar-tools/react-starter/`、`vue-starter/` 及既有 Vite/IIFE、工具打包合同，不重新建立安装器。

P0：Tree、Select/Combobox、Dropdown Menu；其次 Dialog/Confirm、List Item/Action Row、表单校验和状态。不要为展示组件增加正式第六个 Tab。

使用同一模拟数据，比较当前原生基线和两个 React 候选的最小核心组件；不要求三套完整应用市场。核对官方组件目录和版本，不能把 Radix 菜单当 Tree、普通 Select 当可搜索 Combobox。其他候选只在确切缺口需要时补比较。

原型覆盖：文件夹/书签混排、展开/关闭、方向键、Home/End、Enter/Space、Escape、焦点恢复、搜索定位、选中状态、长名称、整行 Hover 和可发现菜单。模拟创建/编辑/移动/删除，保护只读根、Managed 节点、未保存草稿、外部刷新和错误恢复。

UI 业务仍归独立工具，不迁回宿主。**UI 模拟保存成功不等于真实写入成功。** 分别检查表单、SDK、Host 权限与写回回执，不能声称换 React 自动修复保存失败。

先完成普通场景和核心功能，再逐步验证 500/1000/2000+ 节点、生命周期与安装。不要在核心组件不可用时反复全仓测试。

## 四、预览必须真实，沿用已有入口

复用 Preview Skill、`scripts/sidebar-preview-kit.mjs`、`scripts/preview/shared-tool-design.mjs`、`scripts/preview/build-preview.mjs`。现有生产同源适配若只支持 quick-notes，先补最小书签 SDK Mock 边界或明确为设计稿，不假报已有支持。

当前对话能渲染交互 HTML 时直接展示；不能渲染时明确说明并生成完整可打开的离线 HTML，不以截图或代码块冒充交互。真正 React 方案使用实际本地构建的库；只能等效模拟时标注，不给库性能/键盘支持打实测分。

支持深浅色、窄屏、长文本、空/错/忙状态；预览宽度不冒充真实 Chrome Zoom。只使用模拟数据，不调用真实权限、RunHost 或私人存储。公共视觉来自同一权威源码，不把宿主完整 CSS/JS 注入动态工具 iframe。

## 五、旧容量可以调整，不再决定平台能做什么

用户明确允许重评和修改早期 AI 设置的容量。首版提交 `59153b6460c453cd2f548cc23586d91a5c2959ef` 的 R1 文档也已经说明：容量是 R1 预算，扩大须复核消息与存储链。

**取消旧提示词中“不能提高容量、超出就淘汰 React”的绝对前提。** 当前代码仍执行旧校验，修改前如实报告拒绝，但它不是不可变平台限制。具体数值缺少量化依据，不必等待全部历史推理找回才继续开发，也不得臆造原作者理由。

先分类浏览器/外部真实限制、仓库产品预算、必须保留的身份安全保证。功能、开发体验、无障碍、初始加载、内存和储存成本共同决定新预算。此前 gzip 30 KB/解压 150 KB 等建议也不是硬门槛。

在具体获授权的容量实施范围，允许直接合理修改，不必仅因跨过旧 AI 数字再次申请同类批准。必须同步源读取、构建/编码、导入、Host、消息/预览/stage、存储、Sandbox Bridge、升级及边界测试；不能只改一个常量或测试。

以代表性构建和目标设备决定工作预算。数据不足可设明确标注的暂定预算，记录依据、适用范围、风险和复核节点，继续核心开发；随后实测收敛，不创造新的任意永久大数。保留有限资源和异常拒绝，不将授权扩大成关闭 CSP、沙箱、来源/哈希、权限或安装身份验证。

分别报告 JS UTF-16 长度、UTF-8 字节、minified、CSS、scripts/内联资源、最终 JSON、gzip/Brotli、ZIP、初始加载与内存；检查中文/emoji/转义、临界内/恰等于/超限、坏哈希、无权限、取消恢复和旧包兼容。Native Messaging、扩展消息和工具包大小不能混算。较大包体可以是合理取舍，不应凭大小先淘汰高质量方案。

## 六、每个阶段完成立即保存，不只留在聊天中

本轮明确授权所需架构文档、Skill、工作流和本 GOAL 的增量修改、提交与正常 main 推送。原型/构建使用不干扰现有 watcher 的资源。不擅自全量迁移宿主、正式发布或操作真实用户数据；已有授权源码开发无冲突时继续，不因新文档要求回到 Phase 0。

每阶段回写状态、决定、可审阅理由、证据、替代方案、风险、版本/文件/产物身份和下一步：

- 平台分层、库选择与容量政策：更新 `docs/architecture/browser-ui-r23.zh-CN.md`。
- 真实工具用法/API/打包合同改变：同步现有开发/API 文档与相关 Skill，不另立规范。
- 原型、实验、失败、未测与进度：延续 `docs/framework/workstreams/ui-platform-r32-20261015.md`，保存原始证据。
- 执行步骤改变：更新本 GOAL 受影响部分，不再复制一份相互矛盾的总 GOAL。

区分“方向确认 / 候选待测 / 已实施 / 已验证”。保存工程论据，不要求保存私有内部推理。没有对应测试不写 95+；没有源码扩容不声称新预算生效。相关输入未变复用证据，相关变化只补受影响验证。

## 七、本轮最终交付

先给用户操作原型，再报告候选对比、容量方案和保存结果。逐维评价交互、视觉、信息架构、可访问性、AI 开发体验、维护、资源、隔离和迁移影响；未测 NOT_TESTED、失败 FAIL，不预定漂亮分数。

后续实施接续已经明确的选型和容量方案，不再重开整体架构，也不由旧阈值阻断。普通网页版无法访问 Mac 时继续源码、预览、文档与可用测试，精确留下原生缺口。

输出实际保存路径、提交 SHA、推送结果、证据等级、未完成项和下一步。**先形成可靠产品体验，再用证据调整限制；每个关键结论都要写入仓库，不能只生成下一份提示词。**
