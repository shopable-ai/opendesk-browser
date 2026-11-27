# 验收矩阵与证据

当前结果见 [R2.4 ChatGPT 核心验收清单](#r24-chatgpt-核心验收清单)。其余阶段记录保留为历史证据。

## R2.4 ChatGPT 核心验收清单

2026-11-27，已登录 Ego Lite 2.2.1 的共享 Default Profile，TaskSpace 37。使用专用 `OpenDesk R2.4 QA A/B` 和合成消息。当前为本地开发和真站核心实测；宿主加载路径、开发服务连接及 production 身份未核实。按下表顺序执行，前一轮同候选证据与本轮复测分别记录。

| ID | 判定条件 | 当前证据 |
|---|---|---|
| QA-01 | 在留存异常文档和正常对照文档比对安装启用状态、原生注册、生命周期节点、普通入口、A/B 标记行及其左右插槽。注册存在但生命周期与两个入口都没有时，先核对启动；生命周期在而行未挂载时，再核对行、插槽与 ID。只有查明实际缺口才修复。 | **未定位。** 上轮新导航后两个 QA 行仍在，两个入口同时消失，注册仍可读。本轮在留存首页实读 5 条标记行，A/B 的内外 ID 一致且右侧插槽存在；页面上项目与普通注入节点均为 0，也未观察到对应生命周期节点。真实悬停 B 时原生折叠、菜单及＋各自可命中。对照页已打开，首读时项目 DOM 尚未就绪；第二次采样前 Ego 再次交回用户控制。先查该文档的安装启动链，尚不能归因为选择器或宿主缺陷。 |
| QA-02 | A/B 各自默认不可见；真实悬停各只有一个新入口，移出且没有键盘焦点时隐藏。Tab 真实聚焦、Enter 激活。新增按钮与折叠、原生＋、菜单分别命中；逐个实点检查原有结果。重绘/刷新后仍每行一个，无覆盖。 | **部分（上轮 0.1.4）：** 两行隐藏/悬停/移出、原生＋点击及 B 的 Tab/Enter 已观察；菜单与折叠实际点击、异常页恢复后复验待测。 |
| QA-03 | A/B 各激活一次；比较标签集合，只增一页且 `window.opener === null`。新页与点击行 ID 相符，首次发送前无旧消息，不经普通或旧会话。分别检查编辑器为空；发送前读回精确合成文本，只发送一次；刷新后仍在原项目并只见一条该消息。 | **部分（上轮 0.1.4）：** A 开到正确项目及空编辑器，合成首发与刷新归属已有证据；B 由键盘打开正确项目，但站方恢复普通首页的合成草稿，未发送。从无草稿起点复测 B，补齐 A/B 标签集合与 opener 的逐项证据。 |
| QA-04 | 用本任务合成草稿开项目新页。源页 URL 与草稿原样保留。独立记录目标页无旧消息与是否恢复草稿；不得读取或清除用户草稿来满足空框预期。 | **源草稿保护已有证据（上轮 0.1.4）。** 原生项目＋也复现普通草稿恢复；这是 ChatGPT 行为，不计为空编辑器通过。 |
| QA-05 | 在源 QA 会话生成前定位好目标项目按钮。点前确认真实流式进行中；点后源 URL、文档与会话不变，输出继续增长并自然完成，无 Stop；同时检查独立目标页。 | **未测。** 上轮测试驱动点击 Home 改变源文档，该次实验无效。 |
| QA-06 | 普通新增入口只增加一个独立非项目首页，opener 为空；源 URL 与合成草稿不变，站方恢复草稿另记。 | **上轮 0.1.4 已观察** 单页、非项目首页及源 URL/草稿保持；本轮闭环与 opener 复验待完成。 |
| QA-07 | 在原「扩展」审阅链核对同候选的 ID、版本、修订和摘要，必要时先完成合法更新。通过原 UI 停用，确认原生注册与当前文档控件消失；恢复后注册与两个 QA 行的入口各只回一个，普通入口恢复，最终启用。 | **部分（上轮）：** 通过原审阅链更新至 0.1.4/r3，四站、顶层、`USER_SCRIPT`、`document_idle` 的注册已读回。停用与恢复、最终启用读回均待测。 |

复测先走已存在的真实页面与原「开发 → 本地项目」的 Page 试运行入口。临时 DOM 只能证明定位和交互；安装状态以原「扩展」审阅及同候选行为为准。异常也要保留在真站记录。Claude、DeepSeek、Gemini 专项、production 宿主及完整发布验收不属于本轮。

QA-01 复测定位：先按已打包源码的 `data-opendesk-new-chat-window` 分开计数 `project` 与 `ordinary`，再找由 `opendesk.ai-new-chat-window.lifecycle` 创建的隐藏受管节点。A/B 行以 `data-app-action-sidebar-project-row` 识别，并和外层 `data-sidebar-project-container-id` 比对；不以标题文字或按钮当前不可见判定脚本未启动。保留异常文档，先在第二个中性 QA 页面做对照。若安装面板显示等待用户脚本或激活未知，按原回执先读状态，不重复更新；若走本地 Page 试运行，分别记录预览目标文档和源码摘要，并在该轮结束后核对原 Stop 回执。

上轮实际安装的 Page 候选 `0.1.4/r3`，Program ID `opendesk.ai-new-chat-window`。上轮项目校验、Node 11/11、Chromium 合成 DOM 11 组及 Page 打包通过；本轮核对了现存包文件摘要，尚未重建。

~~~text
artifacts/programs/opendesk.ai-new-chat-window/0.1.4/r31-production/72749b1e0ac5f16f-fc5e41f3bdbf/ai-new-chat-window.opendesk-page.json
sourceHash  72749b1e0ac5f16f18d7cdd30ccefb35de5b5b51dbeb386a0fccfe61988663d5
packageHash 8238062fb4410fb51bcc570b194c7fe93ed739d0b439e6ec2edd435809b12ed6
file SHA256 0e6ec1f95f782f570005f52ac8f02429200d6b269efd7c6c68a30f8133522099
~~~

R1 只设计及模拟，所有真实 Chrome+登录 ChatGPT+安装候选的业务验收均 NOT_TESTED。验收区分源代码、Mock、真实网站、正式安装；任何一类不能替代下一类。基线源代码 commit bdb0f4089bb8310f2bb35d7240cf5c7caf216599。

## R2.2 现行验收解释

历史 R1 模拟结果保持不变。按 [DESIGN.md 第七节](DESIGN.md) 执行真实技术验证。T03/T04/T05/T16 等是 QA 后置证据，不要求扩展在运行时读取 B、建立跨标签回执或状态机；T14 只要求明确扩展错误可见、不伪报 window.open 的返回结果且不自动重试；T20 登录/权限/项目不存在由网站原生处理，QA 观察结果、不得误开普通或旧聊天；T15 用轻量同按钮短窗去重。tabId/documentId 可在现有测试环境可获得时用于辅助观测，不是产品功能。旧评分为 R1 历史自评，不代表当前已交付。保留其余相关测试，不重复设计研究。

## R2.3 当前交付范围

本轮只进行 ChatGPT 项目及普通新对话的真实实施和验收；T22 其他网站专项真实测试为 DEFERRED，不作为本轮 P0 前置。不得删除已有站点能力或修改其独有行为。共用代码如有变更，执行已有自动化定向回归，修复本次引入的问题；不扩展到其他站点的专项改造。其他 P0 仅以 ChatGPT 的相关真实证据判定，保留所有历史测试与证据。详见 DESIGN.md 7.5。

## R2.3 当前源码候选测试记录（2026-11-26）

基线 a122c9ac6edfa49bb517f466faf3e1973d4633b3；候选 0.1.1。真实 Chrome + 登录 ChatGPT + 安装候选依旧 **NOT_TESTED / BLOCKED**。以下是本轮新增的实际隔离测试，不覆盖或升级历史 R1 矩阵的真实证据级别。

| 测试 | 结果 | 证据边界 |
|---|---|---|
| Node 22.16.0，node --test projects/ai-new-chat-window/tests/*.test.mjs | 9/9 PASS | 真实执行候选路由、ID/冲突/同源、ChatGPT tab 请求参数、其他三站路由及默认 popup/显式 tab 回归；不打开真实站 |
| Chromium 144.0.7559.96，tests/browser-fixture.py，Python Playwright | 6 组 PASS | 合成 DOM，实际浏览器 hover/leave、键盘、trusted click/dblclick、原生控件替身、属性变化、重绘/清理；open 为记录参数替身，未创建目标真实 tab |
| Node 源码语法检查 src/buttons.js、src/destinations.js | PASS | 不等于正式构建 |
| 真站 DOM / composer / 归属 / 原页真实生成及草稿 | BLOCKED / NOT_TESTED | 浏览器读取 ChatGPT 被权限策略拒绝；Browser Core SSE 429；本地 Codex workspace 连接失败 |
| 正式 validate、build:program、用户本地授权安装、停用撤权 | NOT_RUN / NOT_TESTED | 完整仓库不在隔离环境且 GitHub DNS 解析失败，本地 workspace 不可达；未生成安装包、未安装、未上架 |
| 其他三站专项真实测试 | DEFERRED | 仅既有路由和 opener 定向自动化回归 PASS |

合成 Chromium 六组：①默认隐藏、悬停/移出、历史/冲突/未知项目不注入、普通与项目数量区分；②两个合成项目、双击仅一次 open 请求、普通目标、合成源页 URL/草稿不变；③原生 +、菜单、全局 New chat 替身与动态 + 共存；④pointerdown 后 ID 改变，点击读最新地址，href 冲突不打开，属性变化后重绑；⑤SPA 行替换、重复刷新不重复、键盘 Tab/Enter；⑥清理与重新安装 fixture 实例、无 pageerror。隔离浏览器用 set_content 加载本项目合成 HTML，并将源码模块 import 改为 data URL 以便无网络测试；未访问真实网站。可选复现：`CHROMIUM_EXECUTABLE=/usr/bin/chromium python projects/ai-new-chat-window/tests/browser-fixture.py`（需要 Python Playwright 和 Chromium；也可使用 Playwright 自带 Chromium）。

待真实验证：两个项目标题行/真实 slot，ID-only 结构是否实际存在，空白 composer、发送后历史归属，真实 tab 数量及 A 正在生成/草稿分别保持，真实 native 操作及窄屏/200%/语言/主题、明确错误可见反馈（当前冲突仅阻止打开，异常仍 console.warn）、已安装版本和撤权/性能。所有真实 P0 仍不能标 PASS；不以 mock 结果替代；不自动发布。

### R2.3 多视角自评（不是独立专家或放行分）

| 视角 | 设计 | 实现与证据 | 主要未完成项 |
|---|---:|---:|---|
| 产品需求 | 98 | 95 | 用户真实操作闭环待证 |
| 前端 DOM | 87 | 79 | 标题行和真实 action slot 未观测 |
| Chrome 扩展 | 94 | 76 | 真 tab、构建安装、授权运行未测 |
| 软件架构 | 98 | 97 | 沿用原 Page Program，未扩权 |
| 软件开发 | 96 | 92 | 9 项 Node 与合成 Chromium 通过，正式构建未运行 |
| UX 交互 | 91 | 82 | 真站布局、主题、错误反馈未验证 |
| 软件测试 | 95 | 74 | 真实 P0 与归属未测试 |
| 反方审计 | 89 | 83 | 路由、身份与源页任务的真实证据缺失 |
| 算术平均 | 93.50 | 84.75 | 目标 ≥95 未达到，不能放行 |

## R2.3-CLOSE 增量修复与验收记录（2026-11-26）

基线：58d18b06bd785fa99aa4f9ceb1d517c28092c2ad，候选 0.1.1。状态：**SOURCE_CANDIDATE / NODE_PASS_11 / SYNTHETIC_CHROMIUM_PASS_10 / REAL_CHROME_BLOCKED / BUILD_NOT_RUN / INSTALL_NOT_TESTED**。此前 R2.3 记录为历史证据，不重复设计研究。仅修改本项目路由、按钮及相关测试文档，不改 main.js、package.json、站点范围、权限、其他项目或平台代码。

| 验证项 | 结果 | 实际证据及边界 |
|---|---|---|
| node --test projects/ai-new-chat-window/tests/*.test.mjs | 11/11 PASS（Node 22.16.0） | 隔离副本，原基线源码/既有测试 blob 核对；新增非法 ID、纯 query/hash、非归一化目标拒绝，原四站路由和模式回归 |
| node --check src/buttons.js 与 src/destinations.js | PASS | 语法检查；不是正式构建 |
| CHROMIUM_EXECUTABLE=/usr/bin/chromium python projects/ai-new-chat-window/tests/browser-fixture.py | 10 组 PASS（Chromium 144.0.7559.96） | 合成 DOM，真实可信鼠标/键盘；多数 open 为参数替身，新增实际浏览器 about:blank 新页事件；toast 为调用记录替身 |
| 正式 validate-program-project.mjs / npm run build:program | NOT_RUN / BLOCKED | 隔离环境缺完整仓库且 git DNS 解析失败；CodexPro open_current_workspace 返回 UNAVAILABLE / Connection failed |
| 真实 ChatGPT 两个项目、直接 composer、首次发送归属、原页真实生成与草稿 | NOT_TESTED / BLOCKED | 无明确授权独立登录态 QA 环境；没有读取或操作用户真实工作标签、发送消息或尝试绕过访问限制 |
| 正式安装、Page Authority、sourceHash、撤权恢复 | NOT_TESTED | 未生成正式安装候选、未安装或发布 |
| Claude / DeepSeek / Gemini 专项真实测试 | DEFERRED | 已有 Node 路由与 opener 定向回归 PASS，不等于真实站验收 |

十组 Chromium 证据：①项目 hover/leave 与默认隐藏、历史/冲突/无效行排除、普通/项目数量区分；②两个合成项目与普通目标，双击一次请求，合成源页 URL/草稿不变；③原生 +、菜单及动态 + 共存；④点击时 ID 变化、冲突拒绝并记录 toast、属性重绑；⑤SPA 重绘、重复刷新、Tab/Enter；⑥点击时出现明确非法 href，不按 ID 误开；⑦无效 opener、同步异常记录持久 error toast，正常 noopener null 不报错；⑧真实浏览器 context new-page 事件（目标由测试替换为 about:blank），双击仅新增一个独立页，window.opener 为 null，源合成草稿不变；⑨失效的项目首页原生动作不打开新页；⑩清理、恢复且无 pageerror。

本轮实际测试所用 Git blob（提交前与上传 blob 比对一致）：

| 文件 | Git blob SHA |
|---|---|
| src/buttons.js | 61a4aba1c25440338fd1d814884c74aeb4290226 |
| src/destinations.js | 9693f5a7670f7afc7675a6b769b39d0674fc49ce |
| tests/destinations.test.mjs | f4779a594f6723c8f0f50364d5f7480676436097 |
| tests/browser-fixture.py | d89fc7ea3c7401223241967d4d077c25925bc67f |
| tests/fixtures/project-hover.html | eca6be7e0fd438d9da1b52c5aae85acf1db3dbbb |

T14 明确失败的业务代码与 toast 参数调用已通过合成故障注入，真实安装后 toast 是否显示仍 NOT_TESTED；不能将 noopener 的 null 当作阻止、不能自动重试。T03/T15 新页及双击机制有替代目标真实浏览器事件证据，但真实 ChatGPT URL 与归属仍 NOT_TESTED。T01/T02/T09/T10/T11/T18/T21 的真实标题行、右侧 action slot、窄屏、主题、原生菜单等仍待实证；T04/T05/T06/T13/T16/T17/T20/T23 等真实核心 P0 未验收。旧矩阵继续适用，不提升其真实证据等级。

### 本轮多视角自评（非独立专家、非放行分）

| 评审维度 | 技术方案 | 正式源码实现 | 验收证据 |
|---|---:|---:|---:|
| 产品需求完整性 | 98 | 95 | 70 |
| 技术原理正确性 | 91 | 92 | 64 |
| 正式业务代码质量 | 95 | 94 | 85 |
| UI/UX 交互质量 | 92 | 86 | 71 |
| Chrome 扩展兼容性 | 94 | 88 | 70 |
| 软件架构简洁性 | 98 | 97 | 91 |
| 测试及交付质量 | 96 | 92 | 75 |
| 反方审计 | 91 | 90 | 65 |
| 算术平均 | 94.38 | 91.75 | 73.88 |

三列等权汇总参考值 86.67/100，不替代各阶段分数与 P0 门禁。扣分集中在真实 DOM/布局未观测、项目直接路由/首次归属未证明、安装和实际流式/草稿未验证、正式 build 未运行；无独立专家参与。未达到 ≥95，不放行。

**剩余执行边界：** 保持同一候选和唯一 owner，下一步获取两个独立授权 QA 项目的脱敏 DOM、直达空 composer 与首发归属证据，基于实际差异修正标题定位；只补必要功能，运行正式 validate/build，按现有 Authority 安装并补真实 P0。无需重做需求、竞品或原型；尚未完成正式业务闭环，不生成最终本地 Codex 验收交接提示词。

## R2.4 真实验证与安装记录（2026-11-26）

基线 3f0fd7666091a849986f0ce31cf5ded3aa268e58；Program ID opendesk.ai-new-chat-window；候选 0.1.1、修订 1。业务源码与基线一致，复用 11 项 Node 和 10 组 Chromium 合成 DOM 测试，无新增源码或针对假定 DOM 的测试。

| 验证项 | 结果 | 实际证据与边界 |
|---|---|---|
| 本地工作区 | 可用 | 直接在完整仓库的 main 上校验、构建，不依赖上一阶段不可用的 CodexPro 连接或隔离容器 Git DNS |
| 项目校验、正式 Page 编译与安装包 | PASS | node scripts/validate-program-project.mjs projects/ai-new-chat-window、npm run build:program -- projects/ai-new-chat-window 和现有 build-page-install-package.mjs 成功；编译回执 BUILT_UNVERIFIED |
| Chrome 宿主 | 开发快照 PASS；production 未验收 | 校验通过的是从现有开发目录冻结的静态开发宿主，未改 watcher。现有 production 目录有额外 libs/manifest.json；独立 production 重建停在宿主 ui/tool-shell.js 体积门槛（3,245,465 > 3,145,728 字节） |
| K3 真 Chrome 导入和审阅 | PASS | 独立 QA Profile 的 Chrome for Testing 154.0.8037.92 加载静态开发宿主；真实 SIDE_PANEL「扩展 → 导入」展示“AI 对话新标签页”、0.1.1 和现有四站访问范围 |
| K3 确认、安装、Chrome 注册 | BLOCKED / 未安装 | 已从原侧栏审阅点击一次「确认安装」；结果提示需在 Chrome 扩展设置开启「允许运行用户脚本」。未开启该授权，未观察到 Page Authority 安装成功回执或 Chrome 注册 |
| K1 真实项目 DOM 与 K2 核心闭环 | BLOCKED / NOT_TESTED | 独立 QA Profile 打开 chatgpt.com 后停在「请稍候…」网站验证页，登录未验证，没有账号菜单或编辑器。未读取真实项目、未发送消息、未操作用户日常工作标签；QA 浏览器已正常关闭，租约已释放 |

本地包文件：

~~~text
artifacts/programs/opendesk.ai-new-chat-window/0.1.1/r31-production/d981066d7ade650c-992a9a810963/ai-new-chat-window.opendesk-page.json
sourceHash  d981066d7ade650caba519151e5529028577e339997e9e142d82099e17a4f7a8
packageHash 65183369595fef7145f0e5482d34694e3bd73c71b83c5218a1abc47a92410a8a
~~~

恢复条件：在隔离 QA Profile 经正常流程完成 ChatGPT 网站验证并登录，提供两个允许测试的项目，并按 Chrome 正常流程授权该实例运行用户脚本。安装和注册读回后，尚需核对两个真实项目的标题行与操作槽、悬停/离开与键盘、SPA 不重复、菜单与窄侧栏及两种主题；点击各项目后应只新增一个标签，打开正确项目的空白编辑器，首次授权发送合成消息及刷新后保持项目归属；并核实普通入口、双击、原页流式与草稿、错误反馈及停用恢复和资源清理。真实 P0 未关闭，当前候选不放行，不生成最终验收提示词。

### Ego 入口与独立 Chrome QA 复查（2026-11-26）

| 验证项 | 本轮实际结果 |
|---|---|
| Ego Lite 2.2.1，TaskSpace 35 | 实际为共享 Default Profile。同一浏览器上下文可见扩展 worker `ccfcjegpkdlgbclopjmadlcjedelidmf`，但扩展加载路径、开发服务连接及用户脚本能力未验证。另两个 Ego Profile 均有其他任务的空间，未确认可供本任务使用。只检查新任务空白页与扩展 target 元数据，未进入 ChatGPT、未安装或修改权限，已关闭 TaskSpace。 |
| Chrome for Testing 154.0.8037.92，独立 QA `test-chatgpt-02` | 重新启动本人租约下的无界面实例。登录 helper 无结果；随后直接读该实例的页面标题，ChatGPT 为「请稍候…」，可见网站验证 iframe。登录、项目 DOM、编辑器、发送、原页流式和草稿均 NOT_TESTED。未导入 Cookie、未绕过验证或使用其他任务的浏览器。 |
| 原宿主与权限 | 实际进程加载 `/private/tmp/od-ai-new-chat-r24.ZFY2Xy/static-host/development`，扩展 worker 回报 ID `ejhkmahaeofhjochpmjmaldppdpnaekj`、宿主 2.0.0；静态开发快照，未连接开发服务，非 production。只读查询时用户脚本 API 仍不可用；未重新点击确认、无安装或注册回执。该浏览器已正常退出，QA 租约已释放。 |
| 候选与回归 | 0.1.1 修订 1 的文件仍在，内嵌 sourceHash、packageHash 与上表一致；原文件 SHA-256 为 `a42f651f691b6ed45a1357fb08eeb0f8298222d8ec853640fa06ea8c2ea68ec5`。源码、测试和项目配置与已核验基线相同，复用 11 项 Node、10 组合成 Chromium 与已有 Page 构建证据，没有重跑或重建。 |

真实 P0 仍未验证。本轮只新增测试入口和阻塞证据，沿用下方八维评审，不据此上调分数。恢复时可以使用明确授权、已登录且可安装的独立 Ego Profile；若 Ego 无法完成原生安装合同，使用上述独立 Chrome QA 正常完成网站登录与用户脚本授权，再从原「扩展 → 导入」审阅读回安装及注册结果。

### Ego 真站定位与 0.1.2 修复候选（2026-11-26）

| 证据层 | 实际结果 |
|---|---|
| Ego Lite 2.2.1，已登录的任务空间 | 展开 ChatGPT 左侧导航，实际悬停两个项目标题；两行各出现官方菜单与新聊天，OpenDesk 图标均为 0。复核真实行 ID 为裸项目 ID，外层同一 ID 带 project: 前缀；标题是容器多层后代且本身为可交互行。右侧操作槽加入临时 20 px 无交互探针，行宽保持 268 px，探针在行内并可命中；已移除探针。另有一次直接访问精确项目地址打开空编辑器，仅证明落地页。 |
| 0.1.2 源码与回归 | 仅更改 ChatGPT 明确标记行的识别、ID 校验、已有右侧操作槽与新增按钮的键盘事件隔离；保留路由、opener、权限及其他站点。Node 11/11；Chrome for Testing 149 合成 DOM 11 组通过，包含真实形态的嵌套行、鼠标/键盘不触发标题、ID 不一致不挂载、操作槽重绘。合成开页为 about:blank。 |
| Page 构建 | 项目校验、正式 Page 编译和安装包生成成功。0.1.2、修订 1，编译回执 BUILT_UNVERIFIED。候选见下方。 |
| 安装与运行 | NOT_TESTED。Ego 登录的任务空间使用共享 Default；观察到扩展 worker 及空间外的侧栏 target，本空间无侧栏标签。CLI 未提供打开当前空间原生扩展侧栏或管理用户脚本开关的公开操作；未操作空间外侧栏或更改共享权限。没有候选的真实安装、注册回执和运行证据。旧独立 Chrome QA 静态开发宿主留下的两个阻塞仍未取得解除证据。 |
| 真站业务与 production | NOT_TESTED：点击新增按钮、两个真实项目独立空白标签且只开一个、首次发送与刷新归属、原页真实流式和草稿、普通新聊天，以及真实双击、键盘、菜单、窄栏、主题、错误反馈、停用与恢复。Page production 编译不证明正式五 Tab 宿主或其体积门槛。 |

~~~text
artifacts/programs/opendesk.ai-new-chat-window/0.1.2/r31-production/cec0ba81d58d579f-46a56e948d55/ai-new-chat-window.opendesk-page.json
sourceHash  cec0ba81d58d579f78408e14894f7aa7f6b896f175344a63a28b468ec4477f5f
packageHash b263a3df1f0737e4c71501658e67875ea470ef11e643e226090969dcc8b3ad97
file SHA256 a83bffd4f82831d8c64a788380526aa582d151c09502c01832b9570efb6a7de5
~~~

### Ego 正式安装审阅（2026-11-26）

- 通过 OpenDesk 本地目录的「打开 OpenDesk 侧栏」进入原生侧栏，由「扩展 → 筛选和管理扩展 → 导入扩展」选择上述候选。宿主显示版本 2.0.0；审阅面板核对了程序 ID `opendesk.ai-new-chat-window`、版本 0.1.2、固定修订 r1、本地安装包来源及与上述候选一致的源码和包 SHA-256。安装前查询未发现此程序的用户脚本注册。
- 审阅显示 ChatGPT、Claude、DeepSeek 和 Gemini 的站点访问和执行范围。程序将在批准的范围内自动运行，仅顶层文档，无侧栏或 Native 权限。本轮 QA 限 ChatGPT。未点击「确认安装」；安装回执、安装后注册及真实 UI 测试均为 `NOT_TESTED`。未发送测试消息。

### R2.4 Ego 实装与复测（2026-11-27）

| 项目 | 结果与证据 |
|---|---|
| 0.1.2 安装与注册 | Ego Lite 2.2.1 已登录的任务空间，从 OpenDesk 2.0.0 原生侧栏审阅并确认安装。面板回报「已安装『AI New Chat Window』」。按宿主的命名空间与 Program ID 计算出唯一注册 ID，原生 API 读回匹配的四站、顶层文档、`USER_SCRIPT`、`document_idle` 注册。宿主的开发服务连接与 production 身份未核实。 |
| 0.1.2 的 ChatGPT 普通入口 | PASS：真实点击新增按钮只打开一个 `chatgpt.com/` 标签，`window.opener` 为空且源页 URL、合成草稿不变。ChatGPT 在新首页恢复同一普通草稿，没有已有会话或项目。 |
| 0.1.2 的项目入口 | FAIL：五个真实项目标题行无项目按钮。ChatGPT 在右侧操作槽内用 `span` 重复同一项目标记；旧排除条件误认为嵌套项目。已创建两个专用 QA 项目，未在账号既有项目发送内容。 |
| 0.1.3 修复与打包 | PASS：仅在明确项目标题行的既有操作槽内允许同 ID 的 `span` 标记；不同 ID 或槽外标记继续拒绝。项目校验、Node 11/11、合成 Chromium 11 组及 Page 构建通过，原权限不变。 |
| 0.1.3 真实 UI | 待原生更新并读回后验证项目开合、原生控件、键盘、独立空白页、两条首次发送与刷新归属、草稿、流式、普通入口、停用与恢复。0.1.2 的安装或普通入口证据不能替代。 |

0.1.3／修订 r2 候选：

~~~text
artifacts/programs/opendesk.ai-new-chat-window/0.1.3/r31-production/47dde61926b83e74-4ff3ff695afa/ai-new-chat-window.opendesk-page.json
sourceHash  47dde61926b83e74ca871bad35a19e9f15a60235311e170b3dd0717404c3ae6e
packageHash e801daf9c4d55e02e6b7ad82188d1adab3bcac6d1b3e07a3a764f897b7213333
file SHA256 4bd0356fb3d5ec835b9be196544858ce6034b7735e74149b9231d0c823e90599
~~~

以下八维表为已有评审基线，分数不代表新候选的独立评审或真站验收。

### R2.4 多视角评审（安装审阅追加证据前）

两名 AI 子代理评审，非独立人类专家。各列取八维算术平均；以下分数对应 Page 候选构建后、真实 Chrome 导入审阅追加证据前，新增审阅证据不等同于安装或业务验收。

| 评审维度 | 技术方案 | 正式源码实现 | 实际验收证据 |
|---|---:|---:|---:|
| 产品需求完整性 | 95 | 82 | 64 |
| 核心技术原理正确性 | 89 | 80 | 59 |
| 正式业务代码质量 | 92 | 81 | 76 |
| UI/UX 交互质量 | 89 | 76 | 49 |
| Chrome 扩展兼容性 | 93 | 87 | 62 |
| 软件架构简洁性 | 96 | 86 | 79 |
| 软件测试与交付质量 | 92 | 86 | 64 |
| 反方审计 | 87 | 78 | 43 |
| 算术平均 | 91.63 | 82.00 | 62.00 |

三项均未达到 95 分。主要缺口为真实 ChatGPT 路由和项目归属、真实侧栏布局与输入触发、安装后运行及停用恢复；源码评审待核对项见 DESIGN.md 7.8。

## 测试矩阵
| ID | 级别 | 操作/可验证预期 | R1 HTML 本地模拟 |
|---|---|---|---|
| T01 | P0 | Hover 项目行只显示一个新增图标 | PASS |
| T02 | P0 | 离开且无键盘焦点恢复默认；行高/文字基线不跳 | 部分：默认隐藏与行高 PASS；移出/真实文字宽度未测 |
| T03 | P0 | 点击一次只新增一 tab，URL 与 project 身份正确 | PASS（虚拟 tab，非真实 URL） |
| T04 | P0 | A 正在流式，点击后 URL/文档/对话不变，不发 Stop；B 可用；记录 A 增长或自然完成 | PASS（运行标志/草稿保持，未模拟实际 token stream） |
| T05 | P0 | B 空 composer 且目标项目已确认，非旧 chat 或普通 chat | PASS（模拟） |
| T06 | P0 | 不同项目分别打开目标 B/C | PASS（模拟） |
| T07 | P0 | 同名项目按稳定 ID 区分，重命名不串线 | 部分：同名 ID PASS；重命名未测 |
| T08 | P0 | nav/SPA 重绘、href 原位变化、刷新/更多项目，只有一个对应按钮 | 部分：模拟 redraw 数量 PASS；其余未测 |
| T09 | P0 | 官方项目标题、折叠、pencil/+ 保持原生当前页行为 | 模拟功能具备，未在本轮自动断言 |
| T10 | P0 | 官方三点菜单可正常操作，无遮挡 | 模拟功能具备，未在本轮自动断言 |
| T11 | P0 | 明暗主题、中文英文、图标/可读性、缩放 | 部分：主题切换/英文 aria PASS；真实视觉未测 |
| T12 | P0 | 停用/撤权/升级清理，恢复仅一套；不关闭既有新页 | 部分：模拟启停/重绘按钮计数 PASS；真实监听清理未测 |
| T13 | P0 | A 未发送草稿不变；B 独立草稿、切回/切出保持 | PASS（模拟） |
| T14 | P0 | 失效/拒绝/拦截/未知提供明确反馈；不默默退回普通 | 部分：模拟失效/未知 PASS；明确 blocked 分支未自动断言 |
| T15 | P0 | 快速重复点击至多 1 tab；未知不重放；之后新意图可新建 | 部分：未知锁 PASS；实际快速双击未自动断言 |
| T16 | P0 | B 用户主动首次发送后出现在正确项目；刷新仍归属，不主动发送 | PASS（仅模拟历史） |
| T17 | P0 | 普通新聊天独立且无项目；不影响原生全局 New chat | 模拟功能具备，未自动断言 |
| T18 | P0 | Tab 可聚焦并 Enter/Space；hover/focus 不覆盖官方控件 | 部分：键盘 Tab 到新增按钮 PASS；激活/真实 touch 未测 |
| T19 | P0 | 同源/协议/credentials/跨站/无身份/旧 chat/恶意 href 负例全部 fail closed | 设计要求，真实与正式 Node 新测试未执行 |
| T20 | P0 | 登录失效、工作区变化、打开 B 后项目删除、路由重定向，停止或明确提示 | 模拟部分，真实未测 |
| T21 | P0 | 窄屏/200% zoom/长名及焦点可见；不得挤压原生操作 | 宽屏截图目检；窄屏/200% 及原站 baseline 未测 |
| T22 | P1 | Claude、DeepSeek、Gemini 保留已有行为；Grok 非本轮目标 | 未测 |
| T23 | P0 | 已审阅 Page 安装自动运行/撤权、sourceHash 对应候选；不增加权限 | 未测 |
| T24 | P0 | 源页 observer 不扫描流式正文，导航重绑无泄漏或重复 | 未测 |

## 实际 R1 模拟证据
本地隔离 Chromium + Playwright headless 对同一 HTML 字节调用 set_content（本容器 file:// 导航受管理员策略阻止，仅测试自己生成的无网络合成 HTML）。JS 语法通过；上述已标 PASS 的断言实际执行，无 pageerror。截图宽屏目检。HTML SHA-256 4ea5a71c6c5baedc795944553075a0badf397986f878184175300c659bd73ac1；Git blob e28ec6707dc71e97896f697cf1b1d05da5a5a8ea。模拟没有实际新 Chrome 标签、没有真实 AI token、没有任何真实发送、没有安装扩展。没有运行现有业务测试或产品 build，因为本轮业务源码未变化。

## 真实验收步骤与证据合同
在现有 QA Chrome Profile 中用经过授权的专用项目及合成任务；不操作原用户工作中标签。分别记录 A 有草稿、A 正在流式两条实验（不假定流式期间可编辑）。每次记录候选 SHA/sourceHash、安装 ID/版本、Chrome 版本、语言/主题、账户/工作区脱敏标识、A/B tabId/documentId、脱敏 projectId、before/after URL、composer 空状态与项目证据、tab 创建数量、A 未出现导航/刷新/Stop/写入、B 用户主动首条合成消息后的项目归属与刷新结果、时间及截图/日志路径。A 自然生成结束、限流或浏览器策略需单独分类；未知不能当成功或自动重发。只保存脱敏数据，不保存 Cookie、私有对话 ID/正文、真实项目名或草稿。官方菜单不展示已 pinned 的聊天时另用原生项目成员关系核验，不只看 Recents。相同名称测试必须两个真实不同 identity。已知打开失败可新手势重试；未知先核对实际 tabs。安装停用清理和其他站点回归单独记录。

## 多视角设计及证据成熟度自评（非真实独立专家）
| 维度 | 100 分制 | 主要扣分 |
|---|---:|---|
| 产品需求 | 97 | 真实入口待验证 |
| 多任务工作流 | 97 | A 流式实证缺失 |
| UI 视觉 | 93 | 真实主题/宽度基线未测 |
| UX 交互 | 95 | 窄屏与菜单 fallback 未证实 |
| Chrome 扩展 | 91 | 严格 tab/回执与 Page 边界待验证 |
| DOM/SPA | 90 | 新版项目 row/identity 选择器未观察 |
| 软件架构 | 97 | 条件式 B-only fallback 未证实 |
| 软件测试 | 96 | 真实 P0 未执行 |
| 安全隐私 | 98 | 真实 Authority/revocation 未测 |
| 反方审计 | 91 | 直达 composer 与最终归属未证实 |
| 算术平均 | 94.5 | 未达 95；不准用文档/Mock 抬分 |

没有 10 位外部专家或独立 agent 实际参与。目标 ≥95 且关键 P0 无阻断；当前不能正式放行。下一步优先真实路由/DOM/归属和源页隔离证据，不继续堆叠文档。
