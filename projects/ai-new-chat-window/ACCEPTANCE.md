# R1 验收矩阵与证据

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
