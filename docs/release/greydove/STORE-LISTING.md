# GreyDove · Chrome Web Store 上架文案及证据 R1

> 更新：2026-11-17。基线：5926662a802ea76babadf6b8d6837c872eb21448（写入前）。本文件为可复制的 **上架候选文案**，尚未获得同一 Standard 生产 ZIP 的真实 Chrome 验收，不得标记为已上架、VERIFIED 或 PUBLISHED。此次只收敛现有发布文件，没有建立第二份品牌任务树。

## 1. 产品定位和目标用户

**单一主要用途：** 在一个 Chrome 工作台中编写/试运行 JavaScript 网页增强代码，并运行和管理经过审阅的浏览器自动化任务。

**用户价值：** 无需为每个小型网页增强或重复网页操作都制作独立扩展，使用 GreyDove 的 Side Panel 管理脚本、任务和相关工具。

**首批目标用户：** 经常定制网页、重复操作网站的高级浏览器用户，以及会写少量 JavaScript 的开发者。对完全不会写脚本的普通用户，应优先解释“使用已有且受审阅的任务”，不得承诺自动理解任意网站。

**差异化限于已找到的源码方向：** GreyDove 同时提供 Page USER_SCRIPT 和 Controller/Task 两种有不同权限边界的执行流程，并有 Side Panel 工具工作台；这不是 Tampermonkey 兼容替代品。

## 2. 商品字段（直接复制候选）

### English product name / Chrome Manifest

GreyDove

### 中文品牌展示与本地化策略

用户可见中文名：灰鸽（GreyDove）。

**当前第一阶段的实际 Manifest 名称仍统一为 GreyDove**，不在中文版后台擅自填入另一个与 Manifest 不一致的标题。中文品牌可用于中文完整介绍、官网和截图。若需在 Chrome 内显示真正的中文扩展名称或在后台建立按语言切换的完整商店 Listing，必须按 Chrome i18n 官方机制新增 _locales/en 与 _locales/zh_CN、default_locale 和消息引用，并先改造 Standard/Developer 的“源 Manifest 名称派生”和包验证规则；本轮不冒险改造这条发行链。当前尚不视为已完成中文商店本地化。

### English short description (Manifest / listing, <=132 characters)

Write JavaScript to customize web pages and run browser automation tasks in one workspace.

### 中文短描述候选（同功能范围）

编写 JavaScript 增强网页，并在一个工作台中运行和管理浏览器自动化任务。

## 3. Detailed description — English (copy)

GreyDove is a workspace for JavaScript webpage customization and browser automation.

Write and test JavaScript to adjust how a web page looks or behaves. Work with reviewed browser automation tasks for actions such as navigating pages, filling forms, and reading page content. Inspect task parameters, execution status, results, and errors.

Use the Side Panel to develop scripts, work with installed tasks, and access optional browser tools. GreyDove brings these related workflows into one extension instead of requiring a separate Chrome extension for each small web customization.

Getting started: Open the GreyDove Side Panel, try a small JavaScript change on a webpage, or select an installed automation task. Review its target website and parameters before running it. To use page user scripts, you may need to enable "Allow User Scripts" in Chrome's extension details.

Website access is requested for scripting and browser automation. Depending on the feature, browser capabilities such as tabs, downloads, cookies, proxy settings, and other permissions may be involved. Review the relevant permissions and privacy information before using a feature.

GreyDove does not claim compatibility with every userscript or GM API. Some features depend on website permissions, Chrome settings, and the installed release version.

## 4. 完整介绍 — 简体中文（复制）

灰鸽（GreyDove）是一款用于 JavaScript 网页增强与浏览器自动化的工作台。

你可以编写和试运行 JavaScript，让网页呈现或执行自己需要的功能；也可以使用经过安装与授权审阅的浏览器自动化任务，完成页面跳转、表单填写、网页内容读取等操作，并查看任务参数、执行状态、结果和错误。

通过侧边栏，可以在同一个地方处理脚本开发、已安装任务与按需使用的网页小工具。对于小型网页定制需求，不必每次都单独开发和打包一个 Chrome 扩展。

开始使用：打开灰鸽侧边栏，在当前网页尝试一段 JavaScript，或选择一个已安装的自动化任务；执行前核对目标网站、参数与权限。网页用户脚本可能还需要在 Chrome 的扩展详情页开启“允许用户脚本”。

为实现网页脚本和自动化功能，扩展会请求网站访问权限。特定功能还可能涉及标签页、下载、Cookie、代理设置等浏览器能力。使用前请核对相应授权和隐私说明。

灰鸽不承诺兼容所有油猴脚本或全部 GM API；某些功能受网站权限、Chrome 设置和实际安装版本限制。

## 5. 功能证据白名单（未完成同包 Chrome 验收，暂不提升为 VERIFIED）

| 用户功能 | 用户价值 | 源码路径 | 自动化测试证据（代码存在，当前未重新执行） | 同一 Standard 生产包真实 Chrome | 状态 / 上架处理 |
| --- | --- | --- | --- | --- | --- |
| JavaScript 编写与网页试运行 | 自定义网页 | src/ui/develop-view.js；src/scripting/user-scripts/preview.js | tests/environment/user-scripts-access.test.mjs；tests/environment/user-script-dependency-flow.test.mjs | NOT_TESTED | IMPLEMENTED_NOT_VERIFIED：只作待核候选 |
| 已安装网页脚本管理、启停 | 站点增强及后续管理 | src/scripting/user-scripts/installed-programs.js；src/ui/installed-page-tools.js | tests/environment/page-installed-programs.test.mjs（Chrome API 模拟）；tests/environment/installed-page-tools-r251.test.mjs | NOT_TESTED | IMPLEMENTED_NOT_VERIFIED：不得承诺完整兼容和自动更新 |
| Controller 浏览器自动化任务 | 运行已审阅任务 | src/ui/task-workbench.js；src/platform/tasks/ | tests/environment/task-workbench.test.mjs；tests/environment/controller-main-entry.test.mjs | NOT_TESTED | IMPLEMENTED_NOT_VERIFIED |
| 执行状态、结果和停止 | 知道任务是否成功与如何继续 | src/ui/task-workbench.js；src/ui/task-run-diagnostics.js | tests/environment/task-workbench.test.mjs；tests/environment/controller-result-reload-wait.test.mjs | NOT_TESTED | IMPLEMENTED_NOT_VERIFIED |
| Side Panel 与工具目录 | 用同一扩展管理网页小工具 | src/ui/sidepanel.html；src/ui/extension-center.js；official-tools/catalog.json | tests/environment/app-ci.test.mjs；tests/environment/app-market-r5.test.mjs | NOT_TESTED | IMPLEMENTED_NOT_VERIFIED；工具必须按实际预装/选装状态解释 |
| 多文件项目构建 | 更复杂的 JS 项目 | scripts/build-program-project.mjs；src/ui/local-project.js | tests/environment/app-page-programs.test.mjs | NOT_TESTED | PARTIAL：Standard 不包含 Developer 浏览器内专属编译资源，勿作无条件卖点 |
| 完整 GM API 兼容 / 在线脚本商店 / 云同步或 AI 全自动执行 | — | docs/architecture/browser-framework/userscript-compatibility-matrix-r8.zh-CN.md；docs/release/greydove/COMMERCIALIZATION-ROADMAP.zh-CN.md | 没有该发行候选的完整验收 | NOT_TESTED | UNSUPPORTED 或 PLANNED：不写进当前商店正文 |

证据状态语义：VERIFIED 必须绑定最终发行候选同源 ZIP 与真实 Chrome 记录；IMPLEMENTED_NOT_VERIFIED 仅表示源码可定位；PARTIAL/PLANNED/UNSUPPORTED 不能当成已交付功能。引用的测试文件名不是本轮实测 PASS 记录。

### 首发最值得向用户解释的 3 项能力（均待 Chrome 验收后发布）

1. 在侧边栏编写并试运行 JavaScript，按需要调整网页。
2. 使用已安装、已授权的浏览器自动化任务，并查看执行回执。
3. 在一个扩展中管理与上述核心用途相关的可选网页工具。

## 6. 竞品边界（不用于堆砌商店关键词）

| 竞品 | 公开定位与已公开能力 | GreyDove 的正确边界 |
| --- | --- | --- |
| Tampermonkey | 成熟 userscript 管理、编辑、运行、更新、发现及同步 | 不能宣传 GreyDove 具备完整 GM API、脚本迁移兼容或云同步 |
| Violentmonkey | 开源用户脚本管理、网页定制、外部编辑及同步 | GreyDove 重点是另一种 Controller 任务工作台，而非脚本生态更成熟 |
| ScriptCat | 用户脚本、后台和定时脚本、兼容层与脚本社区 | GreyDove 的 Controller 任务不等于 ScriptCat @background/@crontab |
| Greasemonkey | Firefox 的经典网页脚本管理生态 | Chrome 产品不应宣传 Firefox/GM 完整兼容 |

来源：Tampermonkey https://www.tampermonkey.net/；Violentmonkey https://violentmonkey.github.io/；ScriptCat https://docs.scriptcat.org/；Greasemonkey https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/

## 7. 关键词、真实场景和截图规划

关键词（自然融入正文，不堆砌）：JavaScript, webpage customization, browser automation, task runner, user scripts, script workspace；网页增强、浏览器自动化、脚本工作台、自动填写表单、任务运行结果。

适合的用户场景：在当前网页试运行一段按钮增强 JS；用户审阅并启动表单自动化 Task；执行后查看结果与错误；在一个侧边栏打开可选工具。不要把隐式后台自动操作、跨站无限权限或批量注册作为默认能力。

建议截图（全部须来自真实、同候选 Chrome）：
1. Side Panel 的脚本工作区：英文 “Customize pages with JavaScript”；中文“用 JavaScript 定制网页”
2. 任务参数与运行授权：英文 “Review before you run”；中文“审阅任务后再运行”
3. 执行状态/结果/错误：英文 “Know what happened”；中文“执行状态与结果清晰可见”
4. 已安装的脚本/任务管理：英文 “Keep scripts and tasks organized”；中文“集中管理脚本与任务”
5. 可选网页工具入口：英文 “Tools in one workspace”；中文“相关网页工具统一管理”

不得用 HTML 预览、概念设计或 Node 模拟截图冒充正式产品截图。

## 8. 发布限制、权限与验收门禁

- Manifest 英文 name 和 short_name 使用 GreyDove；Developer 通过现有 scripts/browser-editions-r245.mjs 派生 GreyDove Developer。不要添加独立 Developer 商品。
- Manifest description 长度须 <=132；Chrome Web Store 完整描述在后台单独录入；“副标题”不作为确定存在的后台字段。
- 当前 Manifest 有 <all_urls>、debugger、userScripts、cookies、proxy、downloads 等必需权限。请按真实源码调用点评估必要性、用途和隐私披露；文案不能代替权限合规。
- Chrome 138+ 的 User Scripts 需要用户在扩展详情页开启 “Allow User Scripts”；只声明 userScripts 权限不代表用户已经启用。
- 暂缺同一 Standard ZIP 的构建/包哈希/真实 Chrome 功能及撤权测试、正式图标及真实截图、对外隐私政策 URL 和商店账号审核结果。所有项独立记录在 RELEASE-CHECKLIST.zh-CN.md / RELEASE-RECORD.md。
- 官方参考：https://developer.chrome.com/docs/webstore/program-policies/listing-requirements；https://developer.chrome.com/docs/webstore/program-policies/policies；https://developer.chrome.com/docs/webstore/cws-dashboard-listing；https://developer.chrome.com/docs/extensions/reference/api/userScripts；https://developer.chrome.com/docs/extensions/reference/api/i18n 。

**交付状态：文案候选已收敛，NOT READY TO SUBMIT。** 任何正式提交前，都要将正文动词逐条对照真实 Standard 发行包，去掉未通过的能力并补齐必要的披露。
