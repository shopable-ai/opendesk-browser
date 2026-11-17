# GreyDove · Chrome Web Store 上架文案及证据 R1

> 更新：2026-11-17。基线：5926662a802ea76babadf6b8d6837c872eb21448（写入前）。本文件为可复制的 **上架候选文案**，尚未获得同一 Standard 生产 ZIP 的真实 Chrome 验收，不得标记为已上架、VERIFIED 或 PUBLISHED。此次只收敛现有发布文件，没有建立第二份品牌任务树。

## 1. 产品定位和目标用户（搜索意图优先，功能证据兜底）

**用户的问题：** 经常在网页上反复点击、填写表单、读取页面信息，或者希望在常用网站中添加一个按钮、调整显示或自定义操作。

**GreyDove 的单一主要用途：** 帮助用户通过 JavaScript 脚本和经过安装/授权审阅的浏览器自动化任务，自定义网页功能、处理重复网页操作，并在一个 Chrome 侧边栏中管理相关脚本、任务和结果。

**一句话价值：** 把重复网页操作变成可审阅、可运行的脚本与任务，减少每个小功能都要开发独立浏览器扩展的负担。

**首批目标用户：** 在网页上进行重复操作的进阶用户、熟悉少量 JavaScript 的用户，以及需要自定义网站交互的开发者。一般用户可使用已有任务，但不暗示无需配置、无需脚本或自动理解任意网站。

**差异化：** GreyDove 同时有网页脚本与 Controller 自动化任务两种执行方式，加上 Side Panel 工具管理；它不是完整 Tampermonkey/GM API 兼容管理器，也不应与脚本猫的自动化能力做不实独家对比。此处说的是源码定位，仍须以最终 Standard 包真实 Chrome 验收决定宣传白名单。

## 2. 商品字段（直接复制候选）

### English product name / Chrome Manifest

GreyDove

### 中文品牌展示与本地化策略

用户可见中文名：灰鸽（GreyDove）。

**当前第一阶段的实际 Manifest 名称仍统一为 GreyDove**，不在中文版后台擅自填入另一个与 Manifest 不一致的标题。中文品牌可用于中文完整介绍、官网和截图。若需在 Chrome 内显示真正的中文扩展名称或在后台建立按语言切换的完整商店 Listing，必须按 Chrome i18n 官方机制新增 _locales/en 与 _locales/zh_CN、default_locale 和消息引用，并先改造 Standard/Developer 的“源 Manifest 名称派生”和包验证规则；本轮不冒险改造这条发行链。当前尚不视为已完成中文商店本地化。

### English short description (Manifest / listing, <=132 characters)

Reduce repeat clicks and form filling: customize websites with JavaScript and run browser automation tasks in one workspace.

### 中文短描述候选（同功能范围）

减少反复点击、填写表单等网页操作：编写 JavaScript 脚本定制网页，运行和管理浏览器自动化任务，并查看结果。

## 3. Detailed description — English (copy)

GreyDove helps you handle repetitive website tasks and customize the pages you use, using JavaScript scripts and browser automation in one Chrome Side Panel.

Do you repeat the same clicks, fill out forms, or read information from webpages? Or wish a website had a button or interaction that better suited your workflow? GreyDove brings the scripts and reviewed tasks for those jobs into one workspace.

What you can do:
- Customize websites with JavaScript. Write and test scripts to add buttons, adjust what a page displays, or create your own interactions.
- Run repetitive webpage steps. Use installed, reviewed automation tasks to click, fill forms, and read page information on approved websites.
- Manage scripts and results. Review installed scripts and enable or disable them. Check a task's target website, parameters, execution status, result, and errors. Open optional related web tools from the same Side Panel.

Getting started: Open the GreyDove Side Panel. Try JavaScript on the current page or select a task that has been installed. Review the website, parameters, and permissions before running.

GreyDove is for people who frequently work with websites and for developers who want more control over how pages behave. Some workflows require writing a script or installing a suitable task; GreyDove does not automatically understand every website.

Some user-script features require enabling "Allow User Scripts" in Chrome. GreyDove does not promise compatibility with all userscripts or GM APIs. Website access is required for scripting and browser automation; individual tools may also involve tabs, downloads, cookies, or proxy settings. Please review permissions and privacy disclosures before using these features.

## 4. 完整介绍 — 简体中文（复制）

经常在网页上反复点击、填写表单、查看页面信息？或者希望常用网站能多一个按钮、少几个手动步骤？

GreyDove（灰鸽）是一款 Chrome 浏览器自动化与 JavaScript 脚本工作台。它把网页脚本、自动化任务和相关网页工具集中在侧边栏，帮助你定制网站功能、处理重复操作，而不必为每个小需求单独开发浏览器扩展。

你可以用灰鸽做什么？

1. **按自己的习惯使用网页。** 编写、试运行 JavaScript 脚本，在网页中添加按钮、调整页面显示或实现自定义操作。
2. **减少重复点击和表单填写。** 使用已安装、经过授权审阅的浏览器自动化任务，在获准的网站执行点击、填写表单、读取页面信息等步骤。
3. **集中管理脚本和任务。** 查看已安装脚本并启用或停用；运行前确认目标网站与参数，运行后查看任务状态、执行结果和错误。需要时，也可从侧边栏打开相关网页小工具。

**适合谁？**
适合经常处理重复网页操作的用户，以及希望用 JavaScript 定制网站功能的开发者。你可以使用现有脚本与任务，也可以按自己的需要编写代码。

**如何开始？**
打开 GreyDove 侧边栏，在当前网页试运行一段 JavaScript，或者选择一个已经安装的自动化任务。确认目标网站、参数和权限后再执行。

**使用前请了解：**
灰鸽不是无需设置就能自动处理所有网站的工具。部分操作需要自行编写脚本或安装合适的任务；Chrome 网页用户脚本功能可能需要开启“允许用户脚本”。本产品不保证兼容全部油猴脚本或 GM API。

执行网页脚本和自动化任务需要相应的网站访问权限。个别工具还可能涉及标签页、下载、Cookie 或代理等浏览器能力，具体用途以实际功能及隐私披露为准。

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
| ScriptCat | 用户脚本、后台/定时脚本、社区；2026 年的 Agent 文档亦提供测试阶段的网页操作能力 | GreyDove Controller 与 ScriptCat Agent 存在自动化能力重叠，区别应落在 GreyDove 当前工作台与受审阅任务流程，不能声称独家或更强 |
| Greasemonkey | Firefox 的经典网页脚本管理生态 | Chrome 产品不应宣传 Firefox/GM 完整兼容 |

来源：Tampermonkey https://www.tampermonkey.net/；Violentmonkey https://violentmonkey.github.io/；ScriptCat https://docs.scriptcat.org/；Greasemonkey https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/

## 7. 关键词、真实场景和截图规划

关键词与用户意图（**仅为语义归类，没有搜索量、排名或转化统计**）：

| 用户可能搜索 | 期望完成的事情 | 对应首发真实能力 | 表述处理 |
| --- | --- | --- | --- |
| 浏览器自动化、网页自动操作、自动点击网页 | 减少重复网页操作 | Controller/已安装任务、执行回执 | 首要搜索意图，自然出现 |
| 自动填写表单、重复填写 | 减少重复录入 | 经授权任务在指定网页填写表单 | 只写“使用已安装任务”，不能承诺任意网站一键填写 |
| JavaScript 脚本、网页脚本、用户脚本 | 编写/运行脚本改变网页 | 脚本试运行、受限安装管理 | 保留准确技术词，但先解释用途 |
| 自定义网站、网页功能定制 | 添加按钮或改变页面交互 | Page USER_SCRIPT 网页定制 | 推荐“自定义网页功能”，不单独用难懂的“增强网页” |
| 脚本管理、任务运行结果 | 启停、审阅、排错 | 已安装程序与任务工作台 | 在功能点解释，不堆砌关键词 |

不使用“AI 自动帮我操作所有网站”“零代码一键自动化”“全套油猴兼容”“不限网站批量操作”等缺少交付证据或可能引发误解的词。搜索排名取决于实际商店索引与用户行为，不能单凭文案保证。

适合的用户场景：在当前网页试运行一段按钮增强 JS；用户审阅并启动表单自动化 Task；执行后查看结果与错误；在一个侧边栏打开可选工具。不要把隐式后台自动操作、跨站无限权限或批量注册作为默认能力。

建议截图（全部须来自真实、同候选 Chrome）：
1. 在当前网页编写/试运行 JavaScript：英文 “Customize a website with JavaScript”；中文“让网页按你的习惯工作”
2. 任务参数和网站授权：英文 “Review each task before running”；中文“执行前先确认网站和操作”
3. 点击/填写任务与执行结果：英文 “Automate steps and see the result”；中文“减少重复操作，查看执行结果”
4. 已安装网页脚本与启停管理：英文 “Manage your installed scripts”；中文“集中管理已安装脚本”
5. 侧边栏的相关网页工具：英文 “Web tools in one Side Panel”；中文“常用网页工具集中管理”

不得用 HTML 预览、概念设计或 Node 模拟截图冒充正式产品截图。


### R2：文案质量评审与证据限制（2026-11-17）

先按用户场景组织语言，再保留真实的产品类型与搜索词；不是简单删除技术词，也不能依赖未经核验的“高流量关键词”。

| 模拟独立专业审阅视角 | 文案质量分（100） | 判定依据 |
| --- | ---: | --- |
| 用户理解与任务价值 | 97 | 首屏先说重复点击/表单、自定义网页，且不承诺无需配置 |
| 搜索意图和关键词自然性 | 96 | 保留“浏览器自动化、JavaScript、脚本”等准确词；缺少真实搜索量数据 |
| 竞品差异化 | 96 | 主打脚本 + 审阅后运行的任务 + 侧栏管理，避免声称独占能力 |
| 与源码证据一致性 | 95 | 有实现和组件测试路径，但功能仍需最终生产包 Chrome 验收 |
| 商店文本政策与中英文一致性 | 97 | 概览 + 3 个用户功能点 + 使用说明，避免关键词堆砌；权限披露仍待独立合规审计 |
| **等权算术平均** | **96.2** | **仅代表文字方案的内部模拟审查，不等于真实专家访谈、流量 A/B 或可上架认证** |

**硬门槛（与分数无关）：** 当前无同源 Standard ZIP 的真实 Chrome 功能验收、最终图标/截图与隐私合规结论；因此即使文案内部评分超过 95，整款产品仍是 **NOT READY TO SUBMIT**。此评分不得替换此前的发布准备度评分或测试证据。

官方来源：[Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing)、[Chrome Web Store discovery](https://developer.chrome.com/docs/webstore/discovery/)、[Listing requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)、[2026 policy update](https://developer.chrome.com/blog/cws-policy-updates-2026)。

## 8. 发布限制、权限与验收门禁

- Manifest 英文 name 和 short_name 使用 GreyDove；Developer 通过现有 scripts/browser-editions-r245.mjs 派生 GreyDove Developer。不要添加独立 Developer 商品。
- Manifest name 长度须符合 Chrome Web Store 现行 75 字符限制（2024 年已从 45 调整）；short_name 遵守仓库 12 字符限制；description <=132 字符。Chrome Web Store 完整描述在后台单独录入；“副标题”不作为确定存在的后台字段。
- 当前 Manifest 有 `<all_urls>`、`debugger`、`userScripts`、`cookies`、`proxy`、`downloads` 等必需权限。请按真实源码调用点评估必要性、用途和隐私披露；文案不能代替权限合规。
- Chrome 138+ 的 User Scripts 需要用户在扩展详情页开启 “Allow User Scripts”；只声明 userScripts 权限不代表用户已经启用。
- 暂缺同一 Standard ZIP 的构建/包哈希/真实 Chrome 功能及撤权测试、正式图标及真实截图、对外隐私政策 URL 和商店账号审核结果。所有项独立记录在 RELEASE-CHECKLIST.zh-CN.md / RELEASE-RECORD.md。
- **2026-07-01 政策更新、2026-08-01 生效：** 数据收集必须严格服务披露的单一主要用途，并且向用户显著披露；产品如含 AI 网站自动化，不得以绕过第三方 AI 服务安全防护或用量限制为卖点或实现目的。项目中可选的 Cookie、代理、广告过滤等工具与主用途的关系、相应敏感权限和网络传输应逐项核查，不得因工具均处于侧栏就推定满足“单一主要用途”。
- 官方参考：https://developer.chrome.com/blog/cws-policy-updates-2026；https://developer.chrome.com/docs/extensions/whats-new；https://developer.chrome.com/docs/webstore/program-policies/listing-requirements；https://developer.chrome.com/docs/webstore/program-policies/policies；https://developer.chrome.com/docs/webstore/cws-dashboard-listing；https://developer.chrome.com/docs/extensions/reference/api/userScripts；https://developer.chrome.com/docs/extensions/reference/api/i18n；https://docs.scriptcat.org/en/docs/dev/agent/ 。

**交付状态：文案候选已收敛，NOT READY TO SUBMIT。** 任何正式提交前，都要将正文动词逐条对照真实 Standard 发行包，去掉未通过的能力并补齐必要的披露。
