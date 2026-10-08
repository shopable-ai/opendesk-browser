# OpenDesk Browser R6：AI Browser Agent 全球技术生态与架构 ADR（研究候选）

> 研究日期：2026-10-08；研究范围：模型 API、托管 Agent、现有 Chrome 扩展、Coding Agent CLI/SDK、浏览器执行框架、云浏览器、GUI Agent、AI RPA、WebMCP、评测。**状态：RESEARCH / PROPOSED，非原生产品验收、非源代码实施、非发布声明。** 当前公开远端 main 不一定包含本地 Mac/Codex 未同步改动。以进入实施阶段时实际本地 HEAD 为准。
>
> 证据级别：SOURCE_CONFIRMED（源码阅读）；OFFICIAL_DOC（厂商文档声称）；INFERENCE（架构推断）；NOT_VERIFIED（尚未实验）；DEPRECATED（官方已停用）。仓库没有改动浏览器运行源码。文档所含评分为主观预测，**不是测得的成功率或性能**。

## 0. 执行摘要与明确决策

**选择 E：保留 OpenDesk 已有 Browser Core/RunHost/唯一 Authority/Task Revision/Result，为其增加轻量语义观察接口与 Agent Tool Facade，按需外挂 CLI/MCP/模型厂商工具适配器，视觉定位作为困难页面的回退，最后把经验证的 JavaScript 保存为现有 Task。第一步只实施 B 的最小闭环，不同时开发所有 E 的可选能力。**

- 现在不以 Browser Use 或 Playwright MCP 完全替换 ChromePage；它们本身并不拥有 OpenDesk 的脚本资产、受信任务版本、用户安装与授权、收尾和结果合同。
- 暂不决定 Native Messaging、HTTP、WebSocket、CDP。第一阶段通过可观察的浏览器授权、同源、安全及当前浏览器接入实验决定通信载体。**MCP 是可选适配器，不是 Browser Core**。
- 优先完成固定候选的真实 Chrome Sidebar 验收。随后增加只读 observe 和受控 click + run/stop/result，沿现有 Authority；只在 POC 通过之后实现 Codex CLI/Skill 或 MCP 适配。
- 避免重复造模型、视觉识别、Playwright、CDP 传输、通用 RPA 引擎、第二 Controller、第二 Task DB 和第二存储。
- 需要保持普通用户安装任务→参数→Run→Result **完全离线于外部 AI 服务/Bridge**。

## 1. 方法、来源、查漏补缺

检索官方 API/产品页、GitHub 主干与源码、社区 issue、官方发布资料、Chrome WebMCP 文档；按真实会话持有者分组，交叉关注亚洲厂商、中国模型、闭源商业工具、桌面 GUI、用户原 Chrome、Coding Agent CLI、录制回放、已弃用。没有对所有项目做端到端复现，未查到的 API 不做肯定断言。链接为当期入口，产品成熟度遵循各自官方文档，版本、价格、地域需实施时重新检查。

## 2. 市场生态地图（超过 30 项代表性方案）

| 类别 | 候选/官方入口 | 主要执行/感知方式与会话归属 | 可信状态/相关性 |
|---|---|---|---|
| Model API | [OpenAI Responses Computer Use](https://developers.openai.com/api/docs/guides/tools-computer-use) | 模型产出 Playwright/桌面代码或 computer 动作，开发者执行 | OFFICIAL_DOC；适配工具形状 |
| 托管 Agent API | [OpenAI Agents computer_use](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use) | OpenAI-hosted browser+session/events，网站批准 | OFFICIAL_DOC；不复用本地 Chrome |
| 用户 Agent | [ChatGPT agent](https://openai.com/index/introducing-chatgpt-agent/) | 厂商整合 Operator 功能的托管任务体验 | OFFICIAL_DOC；产品 UX |
| 已停用 | [OpenAI Atlas 转型说明](https://help.openai.com/en/articles/20001371-evolving-atlas-into-chatgpt-for-browser-based-agentic-work) | 旧独立浏览器产品向其他功能整合 | DEPRECATED；不可依赖 |
| Model API | [Anthropic browser_toolset](https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool) | 结构树/元素 ref/截图的 31 个工具；开发者执行自己的浏览器 | OFFICIAL_DOC；最强参考 |
| Model API | [Anthropic computer use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) | 桌面截图与坐标；调用者执行 | OFFICIAL_DOC；桌面回退 |
| 产品扩展 | [Claude in Chrome](https://code.claude.com/docs/en/chrome) | 扩展接现有用户 Chrome 与登录站点 | OFFICIAL_DOC；会话 UX |
| Model API | [Gemini Computer Use](https://ai.google.dev/gemini-api/docs/computer-use) | 浏览器/移动/桌面工具动作；开发者执行 | OFFICIAL_DOC |
| 产品 | [Gemini/Chrome Spark](https://blog.google/innovation-and-ai/products/gemini-app/gemini-spark-updates-july-2026/) | Chrome 用户界面的 Agent 浏览任务 | OFFICIAL_DOC；地区/资格限制 |
| 原型 | [Project Mariner](https://deepmind.google/models/project-mariner/) | 早期 Google 网页 Agent 研究 | 实验/历史 |
| 产品 | [Edge Browse with Copilot](https://support.microsoft.com/en-us/microsoft-copilot/browse-with-copilot) | 用户现有 Edge 标签页与登录状态 | OFFICIAL_DOC |
| 服务 | [Copilot Studio Computer Use](https://learn.microsoft.com/en-us/microsoft-copilot-studio/computer-use) | 桌面鼠标键盘与 UI 自动化 | OFFICIAL_DOC |
| RPA | [Power Automate Desktop](https://learn.microsoft.com/en-us/power-automate/desktop-flows/automation-web) | UI selector、录制、现有浏览器附着 | 正式产品；Task 借鉴 |
| Model/SDK | [Amazon Nova Act](https://nova.amazon.com/act) | 任务规划+浏览器 Agent SDK | OFFICIAL_DOC |
| 云 Browser | [AWS AgentCore Browser](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-quickstart-nova-act.html) | 托管浏览器 CDP WebSocket，live view | 正式开发者服务 |
| VLM / GUI | [UI-TARS Desktop/Agent TARS](https://github.com/bytedance/UI-TARS-desktop) | 截图视觉定位→本地/远程鼠标操作、CLI | 开源；视觉回退 |
| Model | [Qwen3-VL](https://github.com/QwenLM/Qwen3-VL) | 视觉 grounding 等模型能力；无自动浏览器运行证明 | 开源模型，非托管浏览器 |
| Model | [GLM-V](https://github.com/zai-org/GLM-V) | 多模态 GUI grounding 研究与示例 | 开源模型，非自动执行平台 |
| 产品扩展 | [Manus Browser Operator](https://manus.im/) | 浏览器扩展借用现有登录会话 | OFFICIAL_DOC；需逐区域验 |
| 产品扩展 | [Nanobrowser](https://github.com/nanobrowser/nanobrowser) | MV3 扩展内 Agent+LLM，对现有 Chrome 导航操作 | SOURCE_CONFIRMED |
| 产品/独立浏览器 | [BrowserOS neo](https://github.com/browseros-ai/BrowserOS) | 专用 Chromium 浏览器，CLI/MCP 与会话回放，区别于正在运行的普通 Chrome | 源码与产品文档 |
| 扩展工具 | [BrowserMCP](https://github.com/BrowserMCP/mcp) | 扩展+MCP 对现有 Chrome 操作 | 开源；版本/连接再验 |
| Agent SDK | [Browser Use](https://github.com/browser-use/browser-use) | Python Agent + CDP browser session，DOM/工具与循环 | 源码验证 |
| Agent SDK | [Stagehand v4](https://docs.stagehand.dev/v4/first-steps/introduction) | CDP-backed page+AI act/observe/extract | 源码验证 |
| Agent SDK | [Midscene.js](https://github.com/web-infra-dev/midscene) | 视觉+DOM，Puppeteer/Playwright/Chrome Bridge，YAML/报告 | 源码验证 |
| Agent SDK | [Skyvern](https://github.com/Skyvern-AI/skyvern) | AI 视觉工作流 + 代码/Playwright 自动化 | 文档/源码入口 |
| Coding CLI | [Vercel agent-browser](https://github.com/vercel-labs/agent-browser) | CLI + snapshot refs + 浏览器驱动 | 源码/README |
| Coding MCP | [Playwright MCP](https://github.com/microsoft/playwright-mcp) | MCP 工具→Playwright，支持扩展连接已登录 Chrome | SOURCE_CONFIRMED |
| Coding MCP | [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) | CDP 检查 DOM/网络/控制台/性能 | 开源，诊断优先 |
| Runtime | [Playwright](https://playwright.dev/), [Puppeteer](https://pptr.dev/), [Selenium](https://www.selenium.dev/) | 确定性 DOM/CDP/WebDriver；不负责 AI 或发布任务 | 正式稳定 |
| Browser cloud | [Browserbase](https://www.browserbase.com/) | 远端托管浏览器/会话/调试 + Stagehand | 商用云，独立会话 |
| Browser cloud | [Browserless](https://www.browserless.io/) | Remote CDP/Puppeteer/Playwright、会话/录屏 | 商用云，独立会话 |
| Browser cloud | [Steel Browser](https://steel.dev/) | 远端浏览器与会话管理、profile | 商用云，独立会话 |
| Browser cloud | [Hyperbrowser](https://www.hyperbrowser.ai/) | 云浏览器基础设施/自动化 SDK | 商用云 |
| Sandbox cloud | [E2B](https://e2b.dev/) | Agent 计算/桌面隔离环境；不是自动浏览器理解层 | 商用环境 |
| 产品浏览器 | [Comet](https://www.perplexity.ai/comet) | 用户侧 AI 浏览器任务体验 | 商用封闭 |
| 产品浏览器 | [Opera Neon](https://www.opera.com/neon) | Agent 浏览器，含外部 MCP 连接进展 | 商用封闭 |
| AI RPA | [UiPath Delegate Routines](https://docs.uipath.com/delegate/standalone/latest/user-guide/routines) | 录制/执行→参数化可复用 SKILL.md routine | 2026 预览/发布持续演进 |
| AI RPA | [UiPath ScreenPlay](https://docs.uipath.com/) | 视觉 UI Agent 与企业流程 | 商业组件 |
| AI RPA | [Automation Anywhere](https://www.automationanywhere.com/) | 企业 Bot/Agent 与过程编排 | 商业成熟产品 |
| 原生网站 Agent API | [Chrome WebMCP](https://developer.chrome.com/blog/ai-webmcp-origin-trial) | 页面网站自声明 semantic tools，Chrome 149 Origin Trial | 实验技术；非后台 Browser MCP |
| 评测 | [BrowserGym](https://github.com/ServiceNow/BrowserGym), [AgentLab](https://github.com/ServiceNow/AgentLab) | MiniWoB/WebArena/WorkArena 等评测组件 | 用于日后对比，不替代本地 native 验收 |

补充原则：模型提供 grounding 不意味着提供可连接登录 Chrome 的产品/SDK；Browserbase/Steel 是环境，不等于每一步自动决策；BrowserOS neo 的 **独立浏览器** 不等于用户当前已经打开的 Chrome；UiPath SKILL.md/Routine 不等于可脱离 AI 持续可靠运行的 JS Task。

## 3. 源码级深度验证与可复用结论

### 3.1 Anthropic 官方浏览器工具集（OFFICIAL_DOC）

browser_toolset_20260801：单一声明默认展开 27 项、可额外开启 4 项（JS/上传/console/network），浏览器在调用者本地/服务端由调用者提供；模型给 tool_use，SDK/开发者按顺序执行并返回 tool_result。read_page 包含 a11y/ref；截图与 coordinate 作为补充；独立 desktop computer 工具是不同坐标空间。声明默认工具约增加 6600 token，适合作为 **Op Interface schema 的参考，不适合要求每次都加载全量**。API 限制：非 Claude Managed Agents 的内置云浏览器，不要混为一谈。来源：[browser use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool)、[SDK toolsets](https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-sdk)。

### 3.2 Playwright MCP 官方既有 Chrome Extension（SOURCE_CONFIRMED）

- 外部 Agent 用 Playwright MCP 的 --extension 连接 **已运行 Chrome/Edge**，保留正在使用的标签页和登录 Session；独立 persistent profile (--user-data-dir) 是不同模式。
- 真实源：[manifest.json](https://github.com/microsoft/playwright/blob/main/packages/extension/manifest.json) 需要 chrome.debugger、tabs、activeTab、tabGroups 和 all_urls；[background.ts](https://github.com/microsoft/playwright/blob/main/packages/extension/src/background.ts) 接收连接请求、选择 tab 和连接状态，含 MV3 SW keepalive；[pendingConnection.ts](https://github.com/microsoft/playwright/blob/main/packages/extension/src/pendingConnection.ts) 用户按 Allow 后才打开到本地 Relay 的 WebSocket；[relayConnection.ts](https://github.com/microsoft/playwright/blob/main/packages/extension/src/relayConnection.ts) 将 allowlisted debugger attach/detach/sendCommand 与 tab 事件映射到 CDP Relay。
- 真实取舍：不是 Native Messaging；但 **debugger 影响权限信任模型**。OpenDesk manifest 当前没有 debugger，不应只为模仿 Playwright 增加 all_urls+debugger。借鉴用户连接确认/断线管理/精简快照工具，而不是整套替换。

### 3.3 Midscene Chrome Bridge（SOURCE_CONFIRMED）

[io-server.ts](https://github.com/web-infra-dev/midscene/blob/main/packages/web-integration/src/bridge-mode/io-server.ts) 使用 localhost HTTP/Socket.IO Server、检查 Origin 以防跨站 WebSocket 劫持；[io-client.ts](https://github.com/web-infra-dev/midscene/blob/main/packages/web-integration/src/bridge-mode/io-client.ts) 扩展进程主动 WebSocket 连接；[page-browser-side.ts](https://github.com/web-infra-dev/midscene/blob/main/packages/web-integration/src/bridge-mode/page-browser-side.ts) 对外调用前有 explicit onConnectionRequest 用户确认；Bridge 模式支持用户已有浏览器 Cookie/扩展；另有 CDP mode 与独立 Playwright/Puppeteer 执行模式；YAML 可重复运行，但不等于 OpenDesk 的冻结 JS 版本与 native effect receipt。

结论：**不以 Native Messaging 为必选**。localhost WS 也需抗 DNS rebinding/CSWSH/任意本地进程、挑战配对、单调用者租约、撤销、失联保护；无法由 Origin 单独证明本地调用者可信。来源：[YAML bridge/CDP 文档](https://github.com/web-infra-dev/midscene/blob/main/apps/site/docs/en/yaml-script-runner.mdx)。

### 3.4 Stagehand / Browser Use / BrowserOS / Nanobrowser（SOURCE_CONFIRMED）

- [Stagehand stagehand.ts](https://github.com/browserbase/stagehand/blob/main/packages/sdk-ts/src/stagehand.ts)：JSON-RPC client/CDP 接 act、observe、extract，页面 [page.ts](https://github.com/browserbase/stagehand/blob/main/packages/sdk-ts/src/page.ts) 将导航、点击、截图、滚动、WebMCP 工具组合。AI 语义决策与确定性页面操作分层合理，OpenDesk 不应照搬全部 SDK 依赖。
- [Browser Use agent/service.py](https://github.com/browser-use/browser-use/blob/main/browser_use/agent/service.py)：Agent<Tools/BrowserSession> 规划循环；[browser/session.py](https://github.com/browser-use/browser-use/blob/main/browser_use/browser/session.py)：cdp_use CDPClient 与 browser profiles/session/watchdogs。其 controller 只是工具注册别名，与 OpenDesk unique Authority 完全不同。
- [BrowserOS Agent snapshot.ts](https://github.com/browseros-ai/BrowserOS-agent/blob/main/apps/server/src/tools/snapshot.ts)：take_snapshot、take_enhanced_snapshot、get_page_content、take_screenshot、evaluate_script；[CLI 官方 README](https://github.com/browseros-ai/BrowserOS/blob/main/packages/browseros-agent/apps/cli/README.md)：CLI JSON-RPC 2.0 / Streamable HTTP 连 BrowserOS MCP server，要求显式 page id。
- [Nanobrowser background/index.ts](https://github.com/nanobrowser/nanobrowser/blob/main/src/background/index.ts)：BrowserContext、LLM provider、Executor/事件机制在 MV3 后台驱动用户已安装 Chrome；不是已经实现 OpenDesk 版本化任务交付。
- [Vercel agent-browser](https://github.com/vercel-labs/agent-browser)：Agent CLI + 可压缩的 snapshot references 值得借鉴，不能默认拥有用户已登录的普通 Chrome profile。
- [UiPath Routines](https://docs.uipath.com/delegate/standalone/latest/user-guide/routines)：流程录制→可参数化复用步骤，SKILL.md（非 JS）持久化；适合作为任务模板/生成器交互参考，不等于确定性脚本。

### 3.5 模型厂商、云与 WebMCP 的取舍（OFFICIAL_DOC）

- OpenAI Responses computer tool/代码执行属于 **你提供执行器**；OpenAI Agents API computer_use 则是 **OpenAI-hosted browser**。两者适用场景不同；托管浏览器不是原 Chrome 登录上下文迁移。
- AWS Nova Act 是 browser agent SDK/模型，AgentCore Browser 是独立会话基础设施，支持 CDP WS/会话查看；不是一个层次。
- WebMCP Chrome 149 起 Origin Trial，网站主动声明工具供 Agent 调用；不能代替在任意网页上执行 click/getByRole 的 Browser Core；OpenDesk minimum_chrome_version 138，因此 **只做 feature detection/渐进增强**。
- Qwen/GLM/UI-TARS 是 grounding 或 Agent 层，可为难定位页面服务，不应该强迫全部操作走 screenshot/model。

## 4. OpenDesk 现状、证据、差距、优先级

远端最新主干已按实际文件只读核对：[framework README](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/architecture/browser-framework/README.md)、[implementation status](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/architecture/browser-framework/implementation-status.md)、[AGENTS](https://github.com/shopable-ai/opendesk-browser/blob/main/AGENTS.md)。

| 市场能力/使用场景 | main 源码/已有证据 | 实际缺口 | 推荐/优先级 |
|---|---|---|---|
| 用户 Task 无 AI 运行 | src/platform/tasks/{contract,service}.js、ui/task-workbench.js、run-host.js、Authority；Task Candidate/Verified/Available/Installed 代码存在 | 最新固定候选真实 Chrome Side Panel→Stop→close→重开→历史、ZIP 一致性未最终 PASS | **P0** 完整 native closure |
| 精确浏览器驱动 | ChromePage.js / context.js / native-driver.js：title/url/goto/wait/CSS/click/type/screenshot/evaluate，严格 tab/frame/document pin | 不等于 Playwright 全量 Locator/DOM/性能能力；不同 method native 证据不全 | P1 收敛合同；不得静默变更旧 Puppeteer-like API |
| AI 页面理解 | ChromePage.js snapshot(s)(css) 和 screenshot | 无统一 accessibility semantic snapshot、role locator 和短期元素 ref | **P1** 最小可访问性状态与观察返回 |
| Coding Agent 外部调用 | broker.js/control methods/run-host；无 production Agent admission API/CLI/MCP | Agent caller 身份、目标租约、WebSocket/Native 安全和撤权 | **P2** 可选小 Bridge，同一 Authority |
| AI→任务资产 | async function main() + immutable Revision + Task v1 native receipt | 缺 AI 实时探索→可回放 JS→验证→安装完整 UX/算法 | **P4** 单站点参数化脚本 |
| 多来源用户脚本依赖 | user-scripts/dependency-manager.js / preview.js；已支持 source lock/preview 设计与模块测试 | 实际 Chrome Allow User Scripts/MAIN 引用仍 NOT_TESTED；长期注册匹配链未建立 | 独立 D1 验收；不混 B/A |
| 浏览器关闭恢复 | Authority fences、RunHost settlement、durable results | 需要严格同 candidate native 断开/恢复证据 | P0 |
| 视觉/desktop 非 DOM | 只有页面 screenshot，driver 不是桌面坐标驱动 | VLM fallback/iframe/canvas/跨 app 不能普遍完成 | P5 可选 Midscene/toolset；安全门限 |
| WebMCP / cloud | 现有 Chrome MV3 browser-first | WebMCP Chrome149+、远程 Browser profile 隔离 | P6 可选 |

证据边界：[D1 2026-10-08](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/workstreams/2026-10-08-d1-native-environment-evidence.zh-CN.md) 记录 Linux CFT 启动前 AF_UNIX socket EPERM，环境 BLOCKED；未加载扩展、未授权、没有 userScripts receipt。不能将此描述成浏览器源码失败，也不能用旧 native candidate 充当前 PASS。旧 [sidebar current status](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/sidebar-current-status.zh-CN.md) 明确属于历史局部证据。

另外，[manifest.json](https://github.com/shopable-ai/opendesk-browser/blob/main/manifest.json) 当前 minimum_chrome_version 138、侧栏、userScripts、webNavigation/activeTab 等权限，但**没有 debugger/nativeMessaging 权限**。未来只因实际选型需要且用户知情时才允许变更。

## 5. 六层技术边界与产品三场景

| 层 | 职责 | OpenDesk 取向 |
|---|---|---|
| 模型 LLM/VLM | 规划与理解意图 | 外置、多厂商、可禁用 |
| 感知 screenshot/DOM/A11y | 输出当前页面有界状态、引用 | 新增小 semantic observer，VLM 回退 |
| 操作 API/Tools | Typed tool/function/MCP/CLI/BrowserToolset | 操作语义先定义，不依赖协议 |
| 通信 | loopback WS/HTTP、stdio、Native Messaging、CDP | PoC 比安全与运维后选，多适配器可共享 |
| 执行 | ChromePage+Native Driver+userScripts+RunHost+Authority | 复用现有可信边界，不旁路 |
| 产品资产 | Candidate、Revision、Task、Permission、Run、Result、Install | 复用现有 store 和 Sidebar，无 AI 依赖 |

- **A 普通用户**：Sidebar Installed Task → params → exact target → RunHost/Authority/Worker/ChromePage/NativeDriver → durable result。无需 AI 或外部服务。
- **B AI 实时浏览**：Codex / Claude Code → CLI/Toolset Adapter → local Bridge (user consent, scoped lease) → allowlisted Agent Facade → existing Authority admission → exact document → observation/operation/result。未知执行效果暂停，禁盲重试。
- **C AI 生成长期任务**：自然语言→AI 探索（允许视觉辅助）→提出 JS async function main()（page/params 是执行上下文中的词法变量）→测试页或受控真 Chrome 验证→冻结 sourceHash + Revision→Candidate→本机真实运行 effect receipt→Verified→Available→用户确认安装→日后 A 通道运行。**一次成功点击 / 录屏 / SKILL.md 不等于完整 C**。

数据流：

    Codex / Claude Code / 其他 Coding Agent
          ↓ CLI/Skill | MCP Adapter | Model Vendor Tool Adapter（按需）
    optional Local Agent Bridge（用户授权/配对/撤销/lease）
          ↓ Typed Agent Operation Facade（allowlist）
    EXISTING Broker + unique Controller Authority
          ↓ admission: scriptId / revision / target / runId
    EXISTING RunHost → Worker → PageProxy/ChromePage
          ↓ Native Driver / chrome.userScripts / tabs
    exact Chrome tabId/frameId/documentId → receipt → Durable Result
          ↑ observation(A11y/DOM; visual fallback on demand)
    同时：
    Sidebar Installed Task → RunHost (same Core) → Result
    AI Draft → Revision → Candidate → native verification → Available → Installed → Sidebar

对于 B 的直接工具动作，需先设计**可信 Agent 操作身份/会话**如何复用 Broker/Controller admission，不能把外部 WebSocket JSON 冒充内部 scriptRun 或把 UI 自报 isTrusted 当权限。可以通过受控临时 Revision/Controller 实现首版原型，但必须明确生命周期、sourceHash 和权限，且不可悄悄导入 Task 正式安装目录。

### Agent 操作可靠性与安全合同

- 页面来自网络，不可信；DOM/截图文案不得成为修改权限的指令；Agent 需明确用户确认范围、domain allowlist、上传/下载/付款/发消息风险操作二次门控。
- 每次操作携带 runId、requestId、revision/sourceHash、target tab/frame/document、snapshot/ref epoch；ref 在导航/重载/documentId 替换后失效，不能默认 active tab；Stop 和权限撤销立即阻止新动作。
- Bridge 默认关闭，连接必须由扩展 UI 用户可见确认；loopback 监听不可对局域网公开；检查 Origin + Host + 令牌/nonce 防止 DNS rebinding / CSWSH / 跨进程误连；token 不等于 Chrome 授权。高权 API 如 debugger 需要额外审批与威胁评审。
- 按目标操作分级：observe/read 首阶段；click/type 第二阶段；evaluate、上传下载、跨站导航、cookies 和不可逆动作延后审批。外部 Agent 不得直接 sendMessage 伪造 Controller sender。
- 失败保留持久 state/status/error；native effect unknown 不自动重放，取消需 Worker retirement / released 真证据；恢复先查真实结果、再决定继续。
- 缩减 token：优先小型 interactive-role snapshot，不默认截图；Page 状态 fingerprint、只增量更新；不把全 DOM/大截图无限发送；执行后用最短成功/失败观测确认，而非模型长链重跑。

## 6. 技术比较与专家加权评分（预测，不是验收指标）

维度与满分：兼容 20、操作/AI 效率 20、安全 20、可靠/生命周期 15、用户体验 10、开发维护成本 10、扩展性 5。每行 7 个整数之和即总分，依据以 **OpenDesk 当前已有资产为评价对象**，不是各公司商业产品总体评级。

| OpenDesk 集成方案 | 兼容 | 效率 | 安全 | 可靠 | UX | 成本 | 扩展 | 总分 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A1 直接替换为 Browser Use | 7 | 17 | 7 | 10 | 4 | 6 | 4 | **55** |
| A2 直接换成 Playwright MCP 主执行链 | 10 | 15 | 9 | 11 | 5 | 8 | 5 | **63** |
| B 保留 Browser Core + 小型 Agent Facade | 19 | 14 | 18 | 13 | 9 | 9 | 4 | **86** |
| C 直接以某厂 Computer Use API 为 Core | 9 | 18 | 7 | 9 | 5 | 7 | 3 | **58** |
| D 独立云 Browser Broker 取代本地会话 | 9 | 17 | 13 | 11 | 4 | 5 | 4 | **63** |
| **E 混合本地 Core + 语义快照 + 选配 Bridge/VLM + 可复用 Task** | **18** | **19** | **18** | **13** | **9** | **7** | **5** | **89** |

反方解释：E 目前没有真实端到端样本，因此不能自称 ≥95；E 的架构优势为按需组合，但比 B 维护成本高。B 近期工程收益最高；先 B 的原型、条件满足后迭代 E。A1/A2 解决外部模型操作，但替换将产生 Controller 身份、runId/sourceHash、durable settlement 重构；C 型云会失去原 Chrome。D 对企业远程并发有用，却与个人浏览器使用体验偏离。Playwright MCP --extension 是**备选外部适配实验**，不是无条件替换。

代表性**可借鉴项目**拟合分（同权重模型，含集成边界和维护成本，不等于产品质量）：

| 项目 | 七维分项（按上述顺序） | 总分 | 主要限制 |
|---|---|---:|---|
| Claude Browser Toolset | 14/18/12/10/8/6/5 | 73 | 需自己执行工具+Agent vendor，不能天然托管本地 |
| Playwright MCP --extension | 13/17/11/11/7/8/4 | 71 | debugger/all_urls 权限与 existing Authority 冲突 |
| Stagehand v4 | 13/18/10/11/7/6/5 | 70 | CDP/后端栈不等于 MV3 Worker |
| Vercel agent-browser | 13/17/10/11/7/8/4 | 70 | CLI/session 概念需适配现有 Chrome |
| BrowserOS neo | 10/17/14/12/6/5/5 | 69 | 专用 Chromium 而非普通 Chrome 扩展 |
| Midscene | 13/18/9/11/6/7/5 | 69 | screenshot/model 费用与扩展 Bridge 信任 |
| Browser Use | 9/18/9/12/6/7/5 | 66 | Python Agent 与现有 JS Runtime/Authority 双轨 |
| OpenAI developer Computer Use | 13/18/8/10/6/7/4 | 66 | 只能提供模型意图，还要实现 driver/permission |
| UiPath Delegate | 8/17/16/13/4/3/4 | 65 | 商业平台/文件与安装生态不匹配 |

评分仅对设计阶段的**条件预测**，没有声称实测成功率；要用真实 Chrome + 测试矩阵重标可靠性与 UX。

## 7. 分阶段可实施路线与验收闸门

1. **P0 真 Chrome Sidebar 验收**：核对真实本地 HEAD、分支、dist、独立 profile；真实用户 click 的 Save/Run/Stop，A/B 同 URL 不串页，r1 运行中 Save r2 不污染已运行版本，关闭 Side Panel/reopen，持久 Result/retirement、撤权、安全、ZIP same-input。每项 PASS/FAIL/NOT_TESTED。注意 Docker/Linux socket EPERM 是受限环境不能冒充产品失败。此阶段不开发 AI。
2. **P1 Browser Core/感知合同**：补统一小型 A11y semantic snapshot/role locator + bounded refs，冻结 CSS/Puppeteer 兼容行为；先只读，无第二权限中心。Page Script 安装启用长期匹配链作为独立 D1 工作流，而非 Agent 前置大工程。
3. **P2 AI 最小操作**：单个外部 Codex 从受信用户启动 Bridge，observe 当前确切 document→ click 明确目标→ read结果→ Stop；比较 localhost WS/HTTP vs Native Messaging 的实际安装体验和安全，先最少依赖选一个，不增加 debugger 直连除非有明确收益与权限审查。
4. **P3 Agent adapters**：先 CLI/Skill，再按证据决定 MCP/Claude Toolset/OpenAI tool adapter，只有一条 shared Agent Operation Schema；原 SidePanel 无需启动它。
5. **P4 AI 生成可复用 Task**：一条真实业务样本，自动辅助写 async function main()，参数化、调试、冻结 revision、Candidate→本机 Verified→Available→Install→无 AI 重复执行；用 exact sourceHash/native receipt，拒绝重复不可逆副作用。
6. **P5 视觉回退**：复杂 Shadow DOM/canvas/不可见 ARIA 仅按需交给 Midscene或VLM，坐标视口归一/权限/回滚策略，报告误点击/费用/耗时。
7. **P6 远程/站点 Agent API**：Chrome149+ WebMCP feature detection、远程 Browserbase/AgentCore 可选独立 profile、不得把云 cookies 视作本地用户会话。

测试策略：定向场景按 URL、文档迁移、授权撤销、停止、未知原生副作用、浏览器关闭和任务复用跨导航；比较 AI 首次成功率与 **保存脚本后多次无模型运行成功率**，分别记录 latency/token 和错误分类。每次变更仅测受影响 owner，不能把 Node mocks 当原生 PASS。指标阈值由第一阶段 baseline 实测后制定，不预设 95% 真实质量。

## 8. 反方审计与待验证事项

- **为什么还要 Controller？** 已承载文档 pin、唯一权限、不可变 revision、Stop、unknown-effect fence、durable result；Browser Use/Playwright MCP 不会自动继承。需证明这条已有链在真实浏览器可用。
- **为什么不直接 Playwright MCP？** 它优秀且可借鉴，包括官方已支持现有 Chrome extension；然而 debugger+all_urls 信任面与 OpenDesk manifest 不同，替换会大幅迁移任务协议。可以把它作为外部对照方案，不是主 Core。
- **为什么不直接 Anthropic/OpenAI/Gemini CUA？** 模型工具有帮助，但模型意图不是执行 runtime；产品仍要实现权限/目标/版本/持久结果与普通用户复用。
- **是否一定要 Native Messaging？** 不一定：Playwright 扩展 WS+debugger，Midscene loopback Socket.IO 都是验证路径；Native Messaging 适合特定本机安装、Host 身份与 OS 管道场景，但安装/更新/跨平台更重。选择前做逐风险实验。
- **是否需要 AI 每次执行？** 不。一次探索编译为 JS Task 是产品差异化；AI 只负责变化检测与恢复或用户主动调用，降低 token/成本。
- **未知**：本地未推送 Codex 工作区、当前发布构建、真实 native 全证据、模型工具每分钟价格、VLM 真实成功率、正式 WebMCP Chrome 客户端范围、不同厂商区域可用性。以上不能写成 VERIFIED。

下一阶段实施提示词建议：**只开始 P0**，读取 AGENTS/真实工作区，确认最新候选，修最小实错并一次闭合 Sidebar native acceptance；不在同一 Goal 添加 MCP/Native/云/VLM。

## 9. 本轮研究交付证据

- 官方/社区引用见上方每项实际链接；涉及真实源代码的文件路径已明确，便于逐项复核。
- 只读核查 OpenDesk GitHub main（可能落后本机）；本次无 GitHub Actions/原生 Chrome 测试、无 npm build、无新 Agent 运行代码。
- 文档作为候选架构决策，不代表合并到 main；合并须按 [parallel-development.md](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/parallel-development.md) 串行集成并经用户/集成者审阅。

## R6.2 从研究进入实施：2026-10-08 增量核实（PR #11 候选）

> 研究之后源码已更新。本节不覆盖历史研究判断。核查的 main HEAD：704dd8cac140cf2ff9d7c2959ca041f9102848da；PR #11 已通过 CI 的基线 HEAD：8ab0ada6f619d8c0f08637bce0f5352cd1059b5f。后续提交须重新验证。

- **现代 Page API 已实现受限 Locator 子集**：src/framework/ChromePage.js、src/framework/locator.js、src/framework/control/locator-contract.js、src/scripting/packaged/locator-dom.js 已包含 getByRole/getByLabel/getByText/locator、fill/click/waitFor/observe。详情以 [现代 Page API](../../framework/modern-page-api.zh-CN.md) 为准；不是完整 Playwright 的可信键鼠或 AX Tree。不要按原研究缺口重复开发。
- **保留 Native Messaging 候选，不另建 Browser MCP**：PR #11 已实现 Native Host/CLI、固定包内 SW transport、六项受控方法和同一 Authority/RunHost，仍需真实 Chrome/Codex 验收。没有实证证明替代方案更好前，不将其替换成 HTTP/WebSocket。
- **构建阻断最新已解决**：[Native CI 37793448204](https://github.com/shopable-ai/opendesk-browser/actions/runs/37793448204) 在基线 8ab0ada6 完成 Node、生产/开发 WXT、verify。生产 sw.js 精确 324759 bytes，低于原 327680 bytes；固定 13 个 WXT 入口，未提高预算。新 R6.2 提交仍需要同 HEAD 的 CI，不能借旧绿色结果。
- **本轮真正新增内容**：在现有 Bridge 中收紧 runId 的 Host 归属和 ACK 存储失败的 OUTCOME_UNKNOWN；使用 [唯一 Agent → Task R1 合同](agent-to-task-contract-r1.zh-CN.md) 串联只读观察草稿、现代 JS、不可变 Candidate、正式 Verified/Available/Installed 和脱离 AI 的重复运行。
- **未完成门槛**：截至本次源代码核查，NATIVE_CHROME_VERIFIED、AI_AGENT_E2E_VERIFIED、REUSABLE_TASK_VERIFIED 为 NOT_TESTED，FINAL_FRAMEWORK_ACCEPTED=NO。PR #11 继续 Draft，达到原生验收和协作门槛后才可合并 main。

R6.2 未更改 Modern Page API 的公开方法和旧接口兼容性，因此不额外修改其合同；Sidebar 三页签和单文件/多文件开发边界亦保持不变。

## 10. R6.2 实施状态同步（2026-10-08，非补做市场研究）

本节晚于第 4/7/9 节的研究快照；研究阶段“缺少现代 Locator / 语义观察 / 外部 Agent Bridge”的判断**不可当作目前仍缺失**。

- 现代 Page API 已在 main 提供 `locator/getByRole/getByLabel/getByText/fill/click/waitFor/observe`，R5.2 已补动作期限与有界 observe；源码 `src/framework/{ChromePage.js,locator.js}`、`src/scripting/packaged/locator-dom.js`，测试 `tests/framework/r5-modern-page-api.test.mjs`。非 Playwright 完整键鼠。
- Sidebar R6/R6.1 三页签、草稿直跑、已保存 Revision、Task Candidate→Verified→Available→Installed、多文件 ESM 构建入口均已存在；保留普通用户在 **没有 Native Agent 时运行** 的正式路径。
- 可选 Native Messaging 候选复用相同 RunHost/Authority；PR #11 仍为 Draft，已提交 Native Host、CLI、严格 WXT 包内 Transport 与 requestId 未知效果栅栏。历史 SW 超预算已修复；在 PR 头部 `8ab0ada6f619` 的 CI，生产 `sw.js` 为 324759 B，低于固定 327680 B；该 CI 含 macOS Host/Unix IPC **使用模拟 Chrome 帧**，不等于真实 Chrome/Codex。PR 后续提交必须重新按各 HEAD 核验。
- R6.2 直接在 main 增加 **复用现有 modern-search-draft.js 的冻结 Candidate JSON**、只读 `page.observe` 草稿、唯一 [Agent → Task 合同](agent-to-task-contract-r1.zh-CN.md) 与组件契约测试。示例不新增 Executor、Schema、权限、自动发布能力，也不抢改正在 PR #20 中推进的 `demo-form.html`/README。
- 真实 Chrome Native 端到端、用户授权、Codex 调用及 Installed 无 AI 重播尚未完成，保留 PR #11 和 PR #20 的独立验收/合并门槛。记录：`docs/framework/workstreams/r6-2-agent-to-task-20261008.json`。

近期取舍保持**先使已存在 Native 方案闭环**；除非原生实验证明不可行，不以新的 HTTP/WS/MCP 替换它。以上是源码/组件与最新 CI 的分层状态更新，不宣称已完成原生验收。
