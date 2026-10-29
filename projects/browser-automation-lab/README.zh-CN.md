# Automation Lab · 自动化环境实验室（方案草案 R1.0）

> 状态：**DESIGN_ONLY / NOT_TESTED**。2026-10-29 依据用户最新目录决策设立产品资料归属，不代表 React、浏览器扩展、独立网页、原生启动适配器或正式安装包已经实现。
>
> 产品 ID（建议）：`browser-automation-lab`。名称为专家建议，尚待 UI 评审确认。正式产品未来只在 `projects/<id>/` 维护业务源码，不向旧 `examples/programs/` 或 `examples/sidebar-tools/` 添加新产品。

## R1.1 优先决策：市场产品定位（2026-10-29）

**最新用户澄清优先于 R1.0 的狭义故障描述**：Cloudflare、Chrome for Testing 与自动化提示只是发现需求的例子，**不是必须解决的验收目标**。产品应面向一般 Chrome 用户、自动化开发者、QA/本地化测试人员，提供可独立使用的**真实特征检测 + 有界参数调整 + 差异验证**，再按需兼容 AI/Node 浏览器启动方式。

- **产品名称与唯一 ID**：仍建议 **Automation Lab / 自动化环境实验室**，`browser-automation-lab`。属于 OpenDesk 内的独立 Sidebar Tool；不要因为命名包含 Automation 就把它改成只能检测 Puppeteer 的工具。
- **市场参照**：User-Agent Switcher and Manager、Canvas Fingerprint Defender、Bullshield、Chameleon Fingerprint Shield、All Fingerprint Defender、Spoof Me 等 Chrome Web Store 产品，以及 Puppeteer Stealth / Rebrowser Patches / Camoufox / GoLogin。来源、商店规模和链接已保存在 [市场研究](docs/research/sources-2026-10-29.md#f-r11-市场竞品与自动化依赖包对比2026-10-29)；商家效果主张均非独立验证。
- **3 个主 Tab**：`检测`（网页层与已连接启动器信息；真实来源及状态）｜`配置`（可用字段、预设、应用、撤销；复用 Browser Fingerprint 的实际 SDK）｜`记录`（原始/期望/读回/恢复、差异、脱敏导出）。顶栏设置 Icon-only，辅助入口“打开独立检测网页”。首屏不能只显示一个抽象“风险总分”。
- **扩展自身即可完成的核心体验**：授权当前网站 → 检查网页环境 → 选择受控配置 → 对当前 Tab 应用 → 独立读回验证 → 撤销并核对恢复。仅展示可信 Host 已声明可实现的字段；不支持或未授权时清楚标明，不能仅展示一个会切换的模拟开关。
- **用户若使用 Node/AI 启动 Chrome**：明确当前 Side Panel 扩展是否存在于那个**具体的浏览器/Profile/Tab**。日常 Chrome 安装不自动复制到新创建的 Chrome for Testing Profile；需采用 Puppeteer 支持的扩展启用/安装接口，或在受支持的 Playwright/Chromium Persistent Context 加载，或连接已经安装的授权浏览器。发布前按版本实测，不保证所有发行版与 Headless 都支持。
- **可选启动器适配器（P1）**：只上报有证据的启动渠道（standard Chrome / CFT / Chromium）、运行模式、自动化框架和扩展实际加载状态。网页与普通 Sidebar Tool 无法凭空读取进程命令行、改变 Chrome 原生自动化信息栏或替换浏览器二进制。统一诊断结果标 `webpage-js` / `trusted-host` / `launcher-attested` / `server-echo` / `unknown`，不能混合来源做肯定判断。
- **不做承诺**：不能保证通过 Cloudflare、验证码或第三方访问控制；不提供任意 CDP/远程改写指令、不收集账号 Token/Cookie、不把 JS 覆盖称为原生系统修改。Chrome Web Store 发布须遵守最低权限与真实目的披露。
- **落地路径**：P0 最小场景 HTML 可交互预览 → 单一 React UI/检测网页 → 真实授权 Tab 受控配置与读回 → 停止恢复 → 定向 Node/浏览器验收。P1 才评估启动器适配、更多可验证指纹字段和独立 MV3 商店包装。当前 `DESIGN_ONLY / NOT_TESTED`，前次 Browser Fingerprint 测试成绩不能直接算成本工具通过。

**选择理由**：纯检测产品差异度低；纯随机 spoof 易产生字段冲突；直接做独立反检测浏览器超出 MV3 能力与既有 Host 范围。“OpenDesk Side Panel 主体 + 复用 SDK + 独立自检网页 + 可选 Launcher Bridge”在用户价值、研发成本和可验证性之间更均衡。具体竞争资料见上方研究文档。

## 1. 用户要解决的问题

AI、Node.js、Playwright、Puppeteer 等工具启动 Chrome 时，开发者需要区分三件事：

1. **进程层**：Chrome for Testing 是单独的 Chrome 测试发行版；浏览器原生“正由自动化软件控制”提示属于浏览器外壳，网页脚本或普通 Chrome 扩展不能直接读写它。
2. **网页层**：包括 `navigator.webdriver`、UA/UA-CH、语言、时区、视口、平台、图形环境等。网页能检测到的字段与浏览器启动器真实信息不一定相同；单一字段不代表“通过网站反自动化校验”。
3. **网络/服务端层**：IP/ASN、TLS/JA4、请求头、速率、会话与交互特征、目标站点 WAF/Bot Management 策略等。修改网页 JS 字段不能证明这些层已改变。

**目标**：识别 → 分类问题层级 → 对有合法授权和技术支持的测试字段进行配置 → 在独立检测网页验证 → 保存对比报告 → 恢复基线。用于本方 QA、兼容性测试、自动化环境诊断；**不承诺绕过 Cloudflare、验证码、登录或第三方访问控制**。

## 2. 产品类型与责任划分

- **业务类型**：OpenDesk Browser 内的独立 React Sidebar Tool。由现有宿主承载，不创建第二套 Chrome MV3 Side Panel、Service Worker、授权/安装器或可信 Host。
- **现成能力**：`browser.page.getContext`、`browser.page.readEnvironment` 和 `browser.fingerprint.apply/readback/restore` 已在当前 `examples/sidebar-tools/browser-fingerprint/` 产品及可信宿主接线中存在。复用前须按最新 SDK/版本/权限做实际能力查询，不能凭产品 README 宣称所有环境都已生效。
- **旧产品关系**：Browser Fingerprint 继续拥有 UA/UA-CH、语言、时区、视口的配置、执行、独立读回和恢复。Automation Lab 只新增“自动化专项检测、来源标记、诊断、跨层关联、测试报告”；需要修改字段时调用现有受控 SDK，不复制 CDP 原生命令或替代旧产品。
- **可选 Node/AI 浏览器启动信息**：只能由受信任的启动器主动上报浏览器渠道、执行模式、启动参数的安全摘要、独立 Profile ID 等。当前尚未证实统一公开 SDK 能取得这些字段，标为 `SDK_GAP_NOT_PROVEN`；不得让页面推断出可靠的 Chrome for Testing 进程身份，更不得让扩展偷偷修改其他进程启动参数。
- **独立网页**：建议 `projects/browser-automation-lab/diagnostics/` 未来提供可本地托管及可部署到自有 HTTPS 域名的只读检测页，独立执行网页 JS/可控测试服务端回显。对比与保存由用户显式操作；网页默认不上传完整 UA、IP、指纹或 Cookie 到第三方。

**2026-10-29 仓库核查**：公开 `main` 当时尚无 `projects/` 根目录；这是最新的目标源码归属，不代表旧产品已经迁移完成。此前创建的 `projects/` 中资料文件不应被解释成已完成迁移或发布。

## 3. 两种产品表面（一个产品，不是两套业务系统）

### A. OpenDesk 侧边栏（建议 320–520px）

- **检测**（默认）：当前 Tab 与检测来源；指标按“网页可观察 / 启动器上报 / 网络独立回显 / 不支持”归类；状态使用“观察到、存在差异、未知、无法访问”，不要用“反检测通过”。
- **配置**：只展示宿主声明支持的受控字段；原始/自定义预设、保存、应用到当前明确授权 Tab、停止并恢复，全部复用 Browser Fingerprint 的 Host 契约。若 `debugger` 原生权限或网站授权缺失，真实阻断，不显示伪造开关。
- **对比/记录**：前后读回差异、字段来源、时间、权限、Tab/Document 绑定和可信执行状态；网页值与网络值分列；导出时提示剔除隐私信息。
- 顶部仅标题与设置图标；底部提供一个“打开检测网页”入口。遵守现有 OpenDesk design tokens、React Root 和图标/间距规范。

### B. 独立检测网页（未来 `diagnostics/`）

- 面向本机 `localhost` 或自有受控 HTTPS 网站，可在**不安装本扩展**时查看浏览器网页层实际可观察属性。
- 网页最初只读取：`navigator.webdriver`、`navigator.userAgent`、`navigator.userAgentData`（若支持）、`navigator.languages`、`Intl.DateTimeFormat().resolvedOptions().timeZone`、视口/DPR、WebGL 信息及权限 API 的支持情况。字段可缺失、失败或被浏览器策略限制。
- 对网络请求头、TLS/JA4、真实 IP 与发行版/启动参数：只有受控服务端或受信启动器明确返回证据才能展示；否则为“网页无法独立判断”。
- 支持本地 JSON 导出与对比读回；默认不上报、不跨站追踪、不收集或展示 Cookie、Token 等账号数据。

## 4. 按场景拆分的功能树与验收

| 场景 | 核心功能 | 预期结果与失败路径 | 证据级别 |
| --- | --- | --- | --- |
| S01 普通 Chrome/自动化 Chrome 区分 | F01 网页层可观察信号与来源 | 真实 JS 值显示；无法可靠识别发行版时标未知 | A01 本地普通 Chrome 与受控测试 Profile 对比 |
| S02 浏览器外壳显示自动化提示 | F02 浏览器启动元数据（可选） | 没有受信启动器上报时明确提示“网页/扩展无法确认启动标志”，不臆测 | A02 启动器提供/缺失两种回执 |
| S03 调整当前授权网页环境 | F03 复用 Browser Fingerprint SDK | 应用回执和独立网页读回分别展示；不支持/无授权时拒绝 | A03 apply → readback → restore |
| S04 Cloudflare 挑战/拒绝 | F04 原因分层与合规诊断 | 分清网页层与站点策略/网络层；不提供破解、绕过承诺 | A04 自有测试站 WAF 日志/测试键对照 |
| S05 验证配置后效果 | F05 独立诊断网页与差异报告 | 比对前后同字段、同来源；不能验证的不标绿色“通过” | A05 同浏览器双次快照 |
| S06 权限撤销/切 Tab/导航 | F06 生命周期防护 | 失效后不复用旧文档回执，不重复不确定的副作用 | A06 权限撤销与文档变化定向测试 |

**P0**：F01 / F03（仅已有权限和接口）/ F05 / F06；先完成独立诊断网页与侧栏检测的最短真实闭环。

**P1**：F02 受信启动器信息；F04 站点自有测试通道和服务端网络回显，必须有证据与明确授权。

**不做**：关闭/隐藏 Chrome 原生自动化安全提示、伪造 Chrome for Testing 二进制身份、承诺绕过 Cloudflare/Turnstile、未经许可自动化访问第三方网站、静默持久化高敏跨站调试权限。

## 5. 技术、安全与结果合同

1. React 侧栏只能通过 OpenDesk Tool 既有 SDK/Authority/Host；网页读取必须标注读取世界（MAIN/ISOLATED）、来源和文档身份。
2. 浏览器进程与 Chrome UI 不属于网页信任域，任何“Chrome for Testing/自动化旗标”只能来自可追溯的启动器上报或被标注为猜测。
3. 不复制或扩展已有 `chrome.debugger` 白名单。Chrome 的 `debugger` 无法作为可选权限临时申请，新增使用前需原生安装/升级权限审阅。
4. 真实环境变更必须有清晰的用户动作、当前 Tab 与文档绑定、独立验证、可恢复与拒绝逻辑；恢复不等于仅仅 `detach` 成功。
5. `NOT_TESTED`、`BLOCKED`、`UNVERIFIABLE`、`VERIFIED_LIMITED` 等状态不得合并成成功。Cloudflare 是否允许访问属于目标站点策略结果，不是浏览器指纹检测“分数”。
6. 不向外部采集服务发送 Cookie、认证头、账号身份或未经用户同意的完整指纹。可公开技术字段清单，但提交日志/分享报告前做脱敏。
7. Chrome 136+ 默认个人 Profile 的远程调试限制必须保留；仅为经授权的测试使用隔离 Profile。
8. 沿用 OpenDesk 主分支、单源码归属、同源构建、UI 预览和分级验收流程；不要重建 Runtime 或创建平行 Mock UI。

## 6. 下一步实施顺序

1. 按当前 `main` 再核对已经完成的 `projects/` 迁移合同与 Browser Fingerprint R2.4 状态，明确可复用接口和是否需要独立产品安装 ID。
2. 制作**唯一可交互 HTML 预览**：320/360/400/440/520px 与 200% 缩放；三个侧栏视图及独立检测网页的真实读数/拒绝/未知/恢复状态。
3. 定稿后直接在本项目 `src/` 与 `diagnostics/` 实施最小 P0：读数 → 对比 → 经授权控制 → 独立读回 → 恢复。仅在已证实 SDK 缺口时提交平台 API 最小变更。
4. 最小 Node/React/网页/权限定向测试；本地真实 Mac Chrome 和目标站点合规验收另行记录，不用源代码或静态预览冒充 PASS。
5. 资料来源与结论见 [sources-2026-10-29.md](docs/research/sources-2026-10-29.md)，后续新增网络调研只更新该资料记录，不每轮复制一份产品总文档。

**当前已完成**：线上资料研究、原仓库能力核查、建议产品归属与需求方案记录。**当前未完成**：独立 HTML 预览、React SideBar、诊断网页、启动器上报接口、运行测试及正式安装包（全部 NOT_TESTED）。
