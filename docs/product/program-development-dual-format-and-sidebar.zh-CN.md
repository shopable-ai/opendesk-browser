# OpenDesk Browser：单文件即时运行 + 多文件项目开发（Sidebar R6 保持合同）

> 决策状态：采用；日期：2026-10-08。**这是今后给 AI/Codex 阅读的产品与操作入口**，不是新的 Sidebar 设计稿，也不是新的自动执行引擎。技术实施细节见 [多文件项目架构](../architecture/browser-framework/program-project-authoring-r1.zh-CN.md) 和 [依赖架构 D1](../architecture/browser-framework/userscript-dependencies-d1-adr.zh-CN.md)。

2026-10-09 用户范围修正：旧 jQuery 版本及插件适配属于低优先级边缘问题，由程序优先处理；不扩展当前框架实施或原生验收。具体触发条件记在[旧 jQuery 兼容待办](../framework/backlog/legacy-jquery-compatibility.md)。

## 1. 一句话说明

**复杂程序优先在本地用 ESM 多文件项目开发；简单 JavaScript 仍在原 Sidebar 编辑器中直接输入并运行。** 两者最终使用同一套既有运行与权限底座。不要把两种源码形态称为相互竞争的两个产品版本。

| 维度 | 单文件即时脚本 | 多文件 ESM 项目 |
| --- | --- | --- |
| 面向 | 临时任务、个人简单脚本、传统油猴脚本 | AI/Codex、复杂项目、多人或长期维护 |
| 源码 | Sidebar 文本编辑器或 .js 草稿 | 一个项目目录，package.json 中声明 opendesk，src/*.js 等 |
| 第三方库 | UserScript 的 @require 需先审核锁定 | 本地静态 import + npm/package-lock；在受信构建阶段打包 |
| 必须保存/安装吗 | **不必**，点击即可尝试本次运行 | **不必**，构建后导入 program.opendesk-draft.json 即可作为草稿试运行 |
| 正式安装 | 单次运行不等于安装 | Controller 可生成待验证 Task v1 JSON；Page 正式安装仍待完善 |

**源码形态与执行环境是两个独立维度**：页面 JS（document/DOM）由 USER_SCRIPT 执行，自动化 JS（page/ChromePage）由已有 Controller/RunHost 执行。任何一种源码形态都不能绕过相应运行环境的授权与验证。

## 2. Sidebar 原版本必须保留（不可被示意图替代）

**真实 UI 基线：2026-10-08 已合并 Sidebar R6，提交 `797d402286616b402b65201a09e0ff80f6a63319`**。它继承 R5 极简布局、R4 工作流并补充 R6 的焦点/可访问性。此前对话里的分块图、按钮示意仅是概念说明，不是已经采用或授权覆盖的产品 HTML。

| 原有一级页签 | 保留的职责 |
| --- | --- |
| **我的任务** | 已安装任务、参数、适用网站、运行/停止、结果与历史、启停及管理 |
| **发现** | **已安装任务**的本地查找和筛选；「导入」打开独立完整任务目录，不将它改成联网市场 |
| **开发** | 现有 JavaScript 编辑器、运行草稿/保存版本、可选参数、历史、页面用户脚本与 @require、目标和权限、保存/候选功能 |

三个页签、真实 DOM/监听器、Owner 与 RunHost 都要保留。**本轮恢复了 R6 原有的「运行草稿／保存版本／停止」底栏，以及「网页用户脚本 · 依赖与试运行」折叠区**；前一次为了说明多文件项目而额外插入的底栏双按钮和快捷文件控件已撤回。**这些撤回不是删除已有功能**，运行网页脚本仍通过原折叠区入口完成。

原设计与历史文件也保持：
- [Sidebar R5 视觉与信息架构 SPEC](sidebar-ui-spec.zh-CN.md)
- `examples/ui/sidebar-r3-light-preview.html`、`examples/ui/sidebar-r4-installed-discovery-preview.html`、`examples/ui/sidebar-r5-compact-preview.html`（历史原型，**不是**真实 Chrome 执行证据）。
- 正式运行页面：`src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/script-editor.js`；不能用独立 HTML 原型覆盖现行代码。

## 3. 直接在 Sidebar 运行单文件：无需 package.json

**A. 浏览器自动化脚本：** 打开普通 HTTP(S) 网页 → 打开 Sidebar「开发」→ 把下面代码贴到原 JavaScript 编辑器 → 点击底部 **「运行草稿」**。这走原 Controller/RunHost，保存版本独立、不必事先保存。

~~~javascript
async function main() {
  return {title: await page.title(), url: await page.url()};
}
~~~

对表单、按钮和动态页面的**新自动化任务**，不要继续把旧 `page.type()` 当作首选填写方式；使用 `page.getByLabel(...).fill(...)`、`page.getByRole(...).click()`、`page.getByText(...).waitFor(...)`，并在需要时先用 `page.observe()` 提取有限语义摘要。明确的接口、类型和错误语义见 [R5.1 接口 / R5.2 可靠性文档](../framework/modern-page-api.zh-CN.md)。这套 Locator 只属于受控 Controller 环境，**不**自动注入下面的 USER_SCRIPT 页面运行方式。

**B. 网页 DOM 用户脚本：** 同一个编辑器改为下面代码 → 展开 **「网页用户脚本 · 依赖与试运行」** → 入口选 `OpenDesk · async function main()` → 点击 **「在当前网页试运行 DOM 脚本」**。需要 Chrome 用户脚本开关和网站权限；不能把 DOM 脚本当成 Controller 的 page API 脚本。

~~~javascript
async function main() {
  return document.title;
}
~~~

**C. 传统油猴单文件：** 同样在这个折叠区选 `经典用户脚本 · 顶层 / IIFE`，可粘贴带 @match、@require 的普通 .user.js。若包含 @require，应先按界面审核实际来源、SHA-256 和不可变依赖锁；目前并不声称完整实现 GM_*/@resource/MAIN。classic 的一次回执不保证异步 IIFE/监听器全部完成，也不能自动停止这些监听器。

以上三个操作都是**用户明确点击触发的单次运行**。不能把「已编译」或「运行成功」解释为「后台自动安装」。

## 4. 多文件作为主开发路径：AI/Codex 写项目，Sidebar 运行编译结果

推荐目录：

~~~text
my-program/
  package.json       # name/version + opendesk 运行类型、入口、站点规则
  package-lock.json  # 使用 npm dependencies 时
  src/main.js
  src/dom.js
  README.md
~~~

项目源码采用标准本地 ESM `import { helper } from './dom.js'`，不通过浏览器运行时的远程 URL import 作为默认依赖方案。项目 JSON 的 `opendesk.project.v1` 是**源码合同**；不要另外手工维护重复的 opendesk.json。最终执行字节单独冻结 SHA-256，`package-lock.json` 不等于执行资产锁。

**页面增强程序：**

~~~sh
npm ci --ignore-scripts
npm run build:program -- examples/programs/page-heading
~~~

构建命令给出实际 `outputDirectory`，位于本地被 Git 忽略的 `artifacts/programs/...`。该目录包含 `program.js`（固定执行产物）、`artifact.json`（构建来源/哈希/BUILT_UNVERIFIED）和 `program.opendesk-draft.json`（源文件快照 + 完整执行字节）。R3.1 输出目录同时绑定运行字节与源码图身份，保留旧不可变产物。

日常推荐操作：保持同窗口 Sidebar 开启 →「发现 → 导入」进入已有独立完整任务目录 → 在文件导入处选择 **program.opendesk-draft.json** → 返回「开发」。界面展示项目 ID、版本、入口、真实源文件快照和构建模式/大小/哈希；编译产物只在「高级诊断」折叠区显示。快照只读，在本地修改 `src/*.js` 后重新构建并导入，浏览器不会自行编译 ESM 或把快照当作执行字节。选择源文件仅切换查看内容。

Page 在原「网页用户脚本 · 依赖与试运行」折叠区明确点击试运行；Controller 使用原底栏「运行草稿」。这两种操作仍先验证权限和冻结目标。构建或导入不会保存、运行、授权或安装。

兼容入口：仍可导入/粘贴旧 `program.js`。无源文件快照时明确显示「已编译程序」，产物默认折叠，提示回本地修改；不假装恢复项目。加载旧保存版本和从已安装任务复制草稿也使用同样的展示方式。点击「新建单文件草稿」恢复普通可编辑 JavaScript。

调试构建：`npm run build:program -- examples/programs/page-heading --mode development`。Controller 同理。开发产物可读，额外输出本地 `program.js.map`；生产默认仍压缩且不包含映射。Source Map 不随草稿包导入扩展，也不进入生产安装包。构建错误给出项目、阶段、错误码与实际存在的源位置；运行错误保留原始生成堆栈，不在没有映射时编造 `src/main.js` 行号。

**Controller 自动化程序：**

~~~sh
npm run build:program -- examples/programs/controller-title
~~~

除了 program.js / artifact.json，生成 `program.opendesk-task.json`。可将 program.js 按同样的 JS 草稿导入链放进「开发」，选择「运行草稿」；也可以在原完整任务目录导入 program.opendesk-task.json 成为 **Candidate（待验证）**，随后由已有 Task v1 流程核对**同源码、同网站、真实 Controller runId 和效果回执**，成为 Available 才能显式安装。导入文件不自动执行、授权或安装。

## 5. 如何让 Codex / AI 持续复用规则

仓库已提供 [`opendesk-program-publish` Skill](../../.agents/skills/opendesk-program-publish/SKILL.md)，下次不必从零重复完整架构提示词。可直接让 Codex 执行：

> 阅读 docs/product/program-development-dual-format-and-sidebar.zh-CN.md 与 .agents/skills/opendesk-program-publish/SKILL.md。按既有 Sidebar R6 和 Controller / USER_SCRIPT 运行边界开发我的脚本：复杂任务采用多文件 ESM，简单任务保留直接粘贴运行；执行静态校验与构建，不新建 Sidebar 页签，不替换 R6 布局，不将未验证 Candidate 冒充已安装程序。输出实际文件和证据等级。

机器入口：`scripts/validate-program-project.mjs`、`scripts/build-program-project.mjs`；示例项目在 `examples/programs/`。Skill 只是 AI 的工作指南，是否可执行取决于机器校验、可信 Broker/Authority 和真实浏览器验收。

## 6. 验收现状与下轮边界

| 事项 | 当前可证明的范围 |
| --- | --- |
| 原 R6 Sidebar 三页签/主要交互 | 源码与回归测试；R3/R4/R5 历史原型未删 |
| 单文件 Controller 草稿和页面 USER_SCRIPT 预览 | 已有源码消费者及组件测试；仍需真实 Chrome 全流程验收 |
| 多文件 ESM 静态校验/构建，Controller Candidate JSON | 已实现、CI 通过；输出 `BUILT_UNVERIFIED` |
| CSS/JSON/图片打包与完整外部 npm 生态 | R1 小型 Page CSS/JSON/图片 SOURCE_IMPLEMENTED（[UI API](../framework/ui-api.zh-CN.md)），Chrome NOT_TESTED；不是通用资源/npm 发布器，未实现类型仍拒绝 |
| Page Program 自动匹配安装、重启与撤权对账 | 尚未完成，不将编译器或页面预览冒充正式安装 |

下一步应先验证：**同一程序构建 → 原 R6 独立目录导入 .js → Sidebar 原编辑器 → 明确用户点击 → Chrome 原生返回 → 断网重用、换页/撤权失败关闭**。再完善 Page 类型正式安装，不为了这条路径大改 Sidebar。

**以后所有 Sidebar UI 调整都以 R6 为比较基线**，逐项保留既有 DOM 控件、三页签和运行/停止所有权；任何新方案应先说明必要性并进行真实视觉预览，不得直接用示意 UI 替代现行产品。

## 7. UI、React/Vue 与 Tailwind 的开发边界（2026-10-09）

详见 [UI 开发与样式隔离 R1](../architecture/browser-framework/ui-development-and-style-isolation-r1.zh-CN.md)。当前已有插件自身界面和 `paramsSchema` 原生参数表单；页面脚本可使用 DOM API。**这不等于当前已提供 React/Vue/Tailwind 的正式多文件 UI 开发闭环。**

- 不使用框架仍是正式路径。简单任务继续使用现成参数表单，复杂网页小工具才需要自定义 UI。
- React/Vue 属于项目的渲染选择；Tailwind 是可选的构建期样式工具，可以与原生、React、Vue 分别组合。
- 基础 CSS 按 UI 容器启用，网页内 UI 优先独立 ShadowRoot。选择启用不等于已经隔离；不得向网站全局注入完整 Tailwind reset。
- 当前入口只直接处理 `.js/.mjs`；R1 已支持 Page 项目显式声明的小型 CSS/JSON/图片固定打包，JSX/TSX/Vue 单文件组件仍无正式编译适配。现有文件选择器也不等于目录导入入口。
- 用户任意 UI 代码不能直接作为特权 Sidebar 组件运行；简单表单继续由宿主渲染，复杂侧栏应用另行实现独立展示文档。
- R1 原生 UI 容器、受管资源、Demo 已有源码实现，真实 Chrome/CSP 验收仍待本地完成；之后才在同一链路接 React/Vue/Tailwind。无需因该需求等待完整 UserCSS 管理器，也不扩展 Sidebar 一级页签。

公共接口参见 [R1 Page UI API](../framework/ui-api.zh-CN.md)；真实 Chrome 支持状态仍以同一候选的实际运行证据为准。
