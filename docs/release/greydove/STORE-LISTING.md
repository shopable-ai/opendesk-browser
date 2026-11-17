# GrayDove · Chrome Web Store 上架文案及证据 R1

> 更新：2026-11-17。基线：5926662a802ea76babadf6b8d6837c872eb21448（写入前）。本文件为可复制的 **上架候选文案**，尚未获得同一 Standard 生产 ZIP 的真实 Chrome 验收，不得标记为已上架、VERIFIED 或 PUBLISHED。此次只收敛现有发布文件，没有建立第二份品牌任务树。

## 1. 产品定位和目标用户（搜索意图优先，功能证据兜底）

**主要用途：** 在一个 Chrome 侧边栏中编写/运行 JavaScript 网页脚本，并执行已安装、经过审阅的浏览器自动化任务。

**用户要解决的问题：** 经常重复点击或填表，希望让常用网站更符合自己的使用习惯。

**首发用户：** 需要脚本定制或重复网页操作的进阶用户与开发者。自动化需先有合适的已安装任务；不是输入一句话就能操作任意网站。

**首发差异化：** 网页脚本（Page USER_SCRIPT）和 Controller 自动化任务的统一工作台与执行反馈，而不是油猴全兼容、AI 无人值守或多个互不相关产品的集合。

**发布优先原则：** 商店正文只用简明用户语言呈现这三点；源码证据、权限矩阵、竞品研究保留在下面的内部审核章节，不直接复制到开发者后台。

## 2. 商品字段（直接复制候选）

### English product name / Chrome Manifest

GrayDove

### 中文品牌展示与本地化策略

用户可见中文名：灰鸽（GrayDove）。

**当前发行候选的 Manifest 暂用 GrayDove（待商标确认）**，不在中文版后台擅自填入另一个与 Manifest 不一致的标题。中文品牌可用于中文完整介绍、官网和截图。若需在 Chrome 内显示真正的中文扩展名称或在后台建立按语言切换的完整商店 Listing，必须按 Chrome i18n 官方机制新增 _locales/en 与 _locales/zh_CN、default_locale 和消息引用，并先改造 Standard/Developer 的“源 Manifest 名称派生”和包验证规则；本轮不冒险改造这条发行链。当前尚不视为已完成中文商店本地化。

### English short description (Manifest / listing, <=132 characters)

Reduce repetitive web work with installed browser automation tasks, and customize websites with JavaScript.

### 中文短描述候选（同功能范围）

减少反复点击、填写表单等操作：运行已安装的浏览器自动化任务，也可用 JavaScript 自定义网页功能。

## 3. Detailed description — English (copy)

GrayDove helps you customize websites and run repeatable browser tasks from one Chrome Side Panel.

If you often repeat clicks or fill in forms, GrayDove lets you run browser automation tasks you have installed and reviewed. You can also write and test JavaScript to add buttons, adjust page display, or create custom interactions.

What you can do:
- Write and test JavaScript on the current web page.
- Run installed automation tasks on approved websites to click, fill forms, or read page information.
- Review task parameters, execution status, results, and errors; enable or disable installed page scripts.
- Access related optional tools in the Side Panel.

Getting started: Open GrayDove to test JavaScript on a page or choose an installed task. Review the target website, parameters, and permissions before running.

Some actions require writing a script or installing a suitable task; GrayDove does not automatically operate every website. Chrome may require enabling "Allow User Scripts" for page scripts. Full compatibility with all userscripts or GM APIs is not provided.

GrayDove requests website access for scripts and automation. Optional features may also use tab, download, cookie, or proxy permissions. Check permission details and the privacy policy before use.

## 4. 完整介绍 — 简体中文（复制）

经常在网页上重复点击、填写表单，或者希望常用网站多一个按钮、少一些手动操作？

GrayDove（灰鸽）是一款 Chrome 浏览器脚本与自动化工作台。你可以通过 JavaScript 定制网页功能，也可以运行已安装、经过授权审阅的自动化任务，减少重复操作。

**主要功能**

1. **自定义网页：** 编写并试运行 JavaScript，在网页中添加按钮、调整显示或实现自己的交互。
2. **执行重复操作：** 运行已安装的浏览器自动化任务，在获准网站完成点击、填写表单、读取页面信息等步骤。
3. **管理脚本与任务：** 查看已安装的脚本并启停，执行前核对网站和参数，执行后查看状态、结果和错误。相关可选网页工具也可以从侧边栏打开。

**如何使用？** 打开 GrayDove 侧边栏，选择编写 JavaScript 或运行已经安装的任务。执行前请确认目标网站、参数和授权范围。

**使用限制：** 部分功能需要自行编写脚本或安装适合的任务，并非所有网站都能自动操作。Chrome 可能要求开启“允许用户脚本”；不承诺兼容全部油猴脚本或 GM API。

为执行网页脚本和自动化任务，扩展需要相应的网站访问权限。某些可选功能还可能涉及标签页、下载、Cookie 或代理等权限，请结合隐私政策及权限说明使用。

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

| 竞品 | 公开定位与已公开能力 | GrayDove 的正确边界 |
| --- | --- | --- |
| Tampermonkey | 成熟 userscript 管理、编辑、运行、更新、发现及同步 | 不能宣传 GrayDove 具备完整 GM API、脚本迁移兼容或云同步 |
| Violentmonkey | 开源用户脚本管理、网页定制、外部编辑及同步 | GrayDove 重点是另一种 Controller 任务工作台，而非脚本生态更成熟 |
| ScriptCat | 用户脚本、后台/定时脚本、社区；2026 年的 Agent 文档亦提供测试阶段的网页操作能力 | GrayDove Controller 与 ScriptCat Agent 存在自动化能力重叠，区别应落在 GrayDove 当前工作台与受审阅任务流程，不能声称独家或更强 |
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

首发审核采用上方的**简短、准确、可验证**版本；之前自评的 96.2 分仅属于历史文案练习，不能说明上架条件已齐备。此轮不继续调整 SEO 分数，也不将完整技术研究、竞品评分或所有内置工具罗列到公开商店介绍。

**实际发布条件优先于任何评分：** Standard ZIP 必须来自同一 commit、打包校验通过，正式品牌图标与真实截图到位，隐私政策及敏感权限说明可公开核对，核心脚本/任务在真实 Chrome 可操作。缺少其中任一项应保留为待补，不要声称已经达到审核通过标准。

## 8. 发布限制、权限与验收门禁

- Manifest 英文 name 和 short_name 使用 GrayDove；Developer 通过现有 scripts/browser-editions-r245.mjs 派生 GrayDove Developer。不要添加独立 Developer 商品。
- Manifest name 长度须符合 Chrome Web Store 现行 75 字符限制（2024 年已从 45 调整）；short_name 遵守仓库 12 字符限制；description <=132 字符。Chrome Web Store 完整描述在后台单独录入；“副标题”不作为确定存在的后台字段。
- 当前 Manifest 有 `<all_urls>`、`debugger`、`userScripts`、`cookies`、`proxy`、`downloads` 等必需权限。请按真实源码调用点评估必要性、用途和隐私披露；文案不能代替权限合规。
- Chrome 138+ 的 User Scripts 需要用户在扩展详情页开启 “Allow User Scripts”；只声明 userScripts 权限不代表用户已经启用。
- 暂缺同一 Standard ZIP 的构建/包哈希/真实 Chrome 功能及撤权测试、正式图标及真实截图、对外隐私政策 URL 和商店账号审核结果。所有项独立记录在 RELEASE-CHECKLIST.zh-CN.md / RELEASE-RECORD.md。
- **2026-07-01 政策更新、2026-08-01 生效：** 数据收集必须严格服务披露的单一主要用途，并且向用户显著披露；产品如含 AI 网站自动化，不得以绕过第三方 AI 服务安全防护或用量限制为卖点或实现目的。项目中可选的 Cookie、代理、广告过滤等工具与主用途的关系、相应敏感权限和网络传输应逐项核查，不得因工具均处于侧栏就推定满足“单一主要用途”。
- 官方参考：https://developer.chrome.com/blog/cws-policy-updates-2026；https://developer.chrome.com/docs/extensions/whats-new；https://developer.chrome.com/docs/webstore/program-policies/listing-requirements；https://developer.chrome.com/docs/webstore/program-policies/policies；https://developer.chrome.com/docs/webstore/cws-dashboard-listing；https://developer.chrome.com/docs/extensions/reference/api/userScripts；https://developer.chrome.com/docs/extensions/reference/api/i18n；https://docs.scriptcat.org/en/docs/dev/agent/ 。

**交付状态：首发文案已收敛，可复制到商店 Draft；生产包、图标/截图、隐私、权限和真实 Chrome 证据未全部齐备前，NOT READY TO SUBMIT。** 任何正式提交前，都要将正文动词逐条对照真实 Standard 发行包，去掉未通过的能力并补齐必要的披露。
