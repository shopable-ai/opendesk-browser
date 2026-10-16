# ChatGPT 思维导图 · 产品功能与预览设计需求

> **状态：PENDING_USER_CONFIRMATION**。本文是基于当前已核实源码建立的可测试设计候选，尚未被用户正式批准，不能冒充此前历史对话中的已确认原版。

- 日期：2026-10-15；Program ID：opendesk.chatgpt-mindmap；运行类型：OpenDesk Page Program（page-userscript）。
- 工作目录：examples/programs/chatgpt-mindmap/。
- 设计候选：preview/chatgpt.html（模拟 ChatGPT 的用户界面）。
- 技术实验台：preview/index.html（保留原始 XMind A/B/C/97 主题测试）。
- 正式程序 UI：src/answer-registry.js、src/chatgpt-adapter.js、src/view.js、assets/ui.css。
- 引擎与内容：src/xmind-adapter.js、src/xmind-convert.js、src/extract.js。
- 本文是**产品需求与设计基准候选**，不替代 docs/framework/workstreams/chatgpt-mindmap-r21.md 的技术证据。

## 1. 用户价值和产品范围

普通用户在 OpenDesk Browser 中安装并批准 chatgpt.com 网站权限一次后，打开真实 ChatGPT 对话；每条已完成的 AI 回复操作区域自动出现「思维导图」。点击该按钮，原文被暂时隐藏，当前回复内部显示来自同一套原始 XMind 引擎的可操作画布；点击「原文」后完整恢复当前回复，其他回复互不影响。

预览必须**模拟 ChatGPT 的布局，而不声称它是真实 chatgpt.com**。模拟页面不运行模型、不发送消息、不访问用户登录信息。真正的思维导图按钮由正式 createAnswerRegistry 自动注入，绝不手写固定的「思维导图」假按钮。

## 2. 页面和文件结构

| 文件 | 单一职责 | 绝对禁令 |
| --- | --- | --- |
| preview/chatgpt.html | 模拟真实聊天、用户提问、三条 AI 回复、原生操作栏与响应式外壳 | 不直接硬编码程序的思维导图按钮 |
| preview/chatgpt.css | 模拟 ChatGPT 外壳和桌面/移动主题 | 不复制正式产品画布 UI CSS |
| preview/chatgpt.js | 模拟外壳主题与复制/评价体验 | 不实现任何导图绘图和节点计算 |
| preview/app.js | 已有功能实验台驱动；引入正式回答注册器和真实 XMind Runtime | 不创建第二个 Renderer |
| preview/index.html | 保留原有引擎测试入口 | 不覆盖、不删除、不迁移原始 4 JS |
| preview/design.md | 本需求合同候选 | 不把 NOT_TESTED 宣告为 PASS |

**目录之外无额外新工具、Chrome Extension、SDK 或安装器。** 原始固定引擎 4,042,573 B 只复用 preview/ 中四份既有 JS，由 tests/xmind-provenance.json 核对原始字节。

## 3. UI 规格：模拟对话

1. **页面层**：桌面左栏展示模拟会话列表，右侧是白色为主的简洁聊天工作区；窄屏隐藏模拟侧栏，正文自适应，无横向整体滚动。
2. **会话层**：用户发言右对齐浅底气泡；AI 回答为自然文档流，不创建多余品牌标题、产品卡片或独立悬浮面板。
3. **按钮位置**：AI 回答的原生复制、喜欢、不喜欢操作栏**同一行**出现「思维导图」按钮；按钮位于操作区域相邻位置，不压住原生控件。真实站点 DOM 未验证前不得声称原生操作栏布局已获准。
4. **打开逻辑**：点击仅作用于该条回复；保留原始正文 DOM，临时隐藏后插入完整 XMind Viewer。画布初始高度约 440px，可缩放、适配、拖动、滚轮、折叠和展开。
5. **操作栏最小集**：原文 / 全屏 / 缩小 / 放大 / 适配 / 折叠或展开。刷新仅在内容变化后出现；失败时恢复原文并提示原因。
6. **视觉**：整体色彩中性、圆角克制、文字清晰，默认浅色；兼容深色，不单靠颜色区分状态。模拟壳的样式在 chatgpt.css，正式程序控件继续单独使用 assets/ui.css。
7. **响应式**：测试 320px 内容容器、狭窄工具栏精简且不溢出、长中文标题、包含代码和表格的回复；触屏按钮至少 44px 按现有 CSS 条件实现。
8. **开发控件必须隔离**：宽度切换、97 主题、DOM 重建、回复更新和 Stop 只能放在折叠的「预览实验台」，不进入正式安装版。

## 4. 关键交互与状态

| 场景 | 正确表现 |
| --- | --- |
| 页面加载 | 三条已完成的模拟 AI 回复自动出现独立按钮 |
| 相同标题的 A/B 回复 | 控制器、缩放、折叠、节点身份完全独立 |
| 点击 A 按钮 | A 打开真实 XMind；B/C 不受影响 |
| 点击「原文」 | A 的原始 HTML 无损恢复；B/C 状态不变 |
| 无标题、表格、代码、引用 | 保留原始可见文本语义，不转换成虚假 Markdown 标题 |
| 内容流式中 | 不在不稳定内容上创建快照；完成后再允许交互 |
| 回复内容更新 | 标记该导图过期并允许按该条刷新 |
| 页面切换和操作栏重建 | 不重复按钮、不误绑定其他回复 |
| 全屏、Escape | 退出后回到同一回复；键盘操作与焦点可恢复 |
| 深浅色切换 | 模拟页面与已创建的正式导图同步主题 |
| 禁用、撤权、卸载 | **正式产品待实现/验收**：必须停止继续执行，并清理旧页面实例 |

## 5. 安全、性能与真实性

- 禁止向 ChatGPT MAIN 世界插入原始 Snowbrush，禁止 CDN 动态下载，禁止 Mock Canvas/SVG 假绘图。
- preview/ 的原始 XMind JS 已通过历史 CI 校验；公开 Git 跟踪**不代表整个 Snowbrush、GSAP 3.5.1 及传递依赖获得生产分发授权**。
- 已发现 Snowbrush 全局 style#snowbrush_style 残留：预览环境可能仍有此样式；不能把调用 controller.close() 当作生产隔离验收通过。
- Page Program 正式 Runtime 仍存在 E_XMIND_RUNTIME_UNAVAILABLE；不能把独立模拟页运行成功等同于真实自动安装。
- 开发测试应记录运行截图、实际 .topic 节点数量、控制器结果、异常、未预期网络请求、关闭后的 DOM/全局样式状态。
- 不上传聊天内容，不创建独立安装权限系统，不直接扩大 512KiB 限制以装入 4MB 引擎。

## 6. 来源、状态与验收合同

- **设计来源**：当前功能源码、原始 XMind 预览和用户明确描述的「模拟 ChatGPT，对每条 AI 回复插入按钮并原位生成导图」。本 chatgpt.html 为**本轮提案**，尚不能声称恢复了某份历史获批 UI。
- **设计状态**：PENDING_USER_CONFIRMATION。用户确认后才可更改为 APPROVED，并锁定 Git SHA/文件 Hash。更改设计必须更新本文件、预览和 UI 合同测试。
- **测试状态**以当前真实结果填写，推荐字段：HTML_GIT_TRACKED、DESIGN_GIT_TRACKED、FIXED_ENGINE_HASH、MOCK_CHATGPT_BUTTON_AUTO、ORIGINAL_XMIND_RENDER、ANSWER_ISOLATION、RESTORE_ORIGINAL、RESPONSIVE_320、DARK_MODE、GLOBAL_STYLE_ISOLATION、NATIVE_INSTALLED、CHATGPT_REAL_PAGE。
- **验收目标**：功能完整性、视觉一致性、信息保真、可操作性、响应式、稳定性、性能、安全和生命周期逐维 95/100 以上；未拿到真实 Chrome/真实产品证据的维度应标记 NOT_TESTED，不给虚假分数。
- **工程门槛**：完成设计预览 Git 归位、浏览器真实交互验证并由用户确认后，才能把它作为正式 UI 的视觉合同；随后继续可信 Runtime、许可证和原生安装，不因本阶段视觉预览完成提前宣称正式产品已可安装。

## 7. R3.3 可供用户逐屏确认的交互合同（2026-10-16）

**确认状态继续为 `PENDING_USER_CONFIRMATION`，不是 `APPROVED`。** 本轮只维护已归档的 `chatgpt.html` / `chatgpt.css` / `chatgpt.js`、已有真实实验台与正式程序模块，不分叉页面、引擎或设计目录。

### 7.1 自然对话中的使用路径

1. 打开 `REAL_XMIND_CHATGPT_PREVIEW`，自然显示右侧用户提问、三条已完成的 AI 答复及每条答复自己的复制/评价操作区域；不会出现固定的“思维导图”假按钮。
2. 正式 `createAnswerRegistry` 根据 `[data-message-author-role="assistant"]` 和唯一复制按钮确定回答的正文及操作栏；仅在结构明确、可读取时注入一枚 Shadow DOM 中的“思维导图”按钮。
3. 点击 A 的“思维导图”时，原文 DOM **不克隆、不卸载、不重写**：暂时隐藏，插入真正 `_SB_.createWorkbookEditor()` 视图；A 可单独缩放、折叠、拖动、滚动。
4. 点击 B：B 与 A 同时保持打开。即使 A/B 同为“功能实施计划”，也只按回答 DOM 身份（不是标题文本）管理控制器。A 恢复原文不关闭 B。
5. C 是特意保留的无标题回复，包含自然段落、表格、原代码、引用和外链；其可见文本映射为真实主题/附注，关闭后原始 DOM/HTML 完整保留。受限节点明确提示截断，**不把复杂文本伪装成 Markdown 标题**。
6. 全屏只移动本条 viewer 到固定层；关闭、退出全屏或按 Escape 均回到原回答位置，焦点回到可操作的触发按钮。模拟输入区不连接服务器也不产生 AI 回复。

### 7.2 页面尺寸、位置与视觉

| 界面元素 | 设计约束 | 产品/预览来源 |
| --- | --- | --- |
| 左侧会话栏 | 桌面宽约 250px，浅色中性底；≤800px 隐藏 | 仅 `chatgpt.css` |
| 顶部 ChatGPT 导航 | 高约 64px（移动约 56px），右侧保留“本地模拟 · 非官方网站”显著声明和主题开关 | 仅 `chatgpt.html/css/js` |
| 用户消息 | 右对齐、中性浅底圆角气泡、可换行，不盖住正文 | 仅模拟外壳 |
| AI 回复 | 自然文档流，无额外预览宣传卡、独立管理页面或大标题 | 模拟 `.markdown` 测试内容 |
| 原生操作栏 | 复制/好评/差评采用 18px 线框图标，34px 点击高度；替换 DOM 后仍保留委派的模拟交互 | 模拟外壳；不在本地写死“思维导图” |
| 导图按钮 | 视觉与原生操作栏协调，最少 34px；触屏 ≥44px，真实注册器注入到相应操作栏后 | `src/answer-registry.js`、`assets/ui.css` |
| 导图面板 | 原位显示；通常高约 440px，最小高 250px；画布自适应视口，桌面单行轻量图标工具栏；窄容器使用更多菜单，不侵占其它回复 | `src/view.js`、`src/xmind-adapter.js`、`assets/ui.css` |
| 页面输入区 | 靠近视口底部、不覆盖答案；只作本地外观模拟，保留模拟标识 | `chatgpt.html/css` |
| 实验台 | 折叠在页面底部；显示宽度、大图、替换操作栏、更新答案、Stop，绝不进入正式程序 | `preview/app.js` |
| 320px | 真正 320px 内容容器以及 320px **整个浏览器窗口**两种验收，不产生页面级水平滚动；表格单元格允许折行，代码块内部滚动 | `chatgpt.css` / `assets/ui.css` |

### 7.3 工具栏及状态切换

- “原文”：移除当前查看器，准确恢复本条原来 DOM，包括表格、代码块、引用、链接；绝不影响其它回答。
- “全屏/退出全屏”：同一查看器移动到 `body` 固定层再恢复；Escape 为键盘退出路径；不得误把这个功能做成独立站点或新窗口。
- “缩小/放大/适配”：使用原始 XMind SDK 的 zoom 与真实渲染主题位置，画布变化可观测；不存在 fake SVG/Canvas。
- “折叠/展开”：使用原始 Workbook 分支状态重新装载，不是把 HTML 列表简单 display:none；相邻回答折叠状态不互相影响。
- “刷新”：当前回复的内容更新后，仅当前导图标记过期；必须等稳定窗口结束后重新读取，不默默覆盖用户正在查看的原始内容。
- “浅色/深色”：**不能仅切换模拟外壳和 Shadow 样式**。已经打开的 Workbook 必须通过相同真实 SDK 重载对应 skin，串行操作，尽可能保留原缩放/滚动/折叠，不影响其它回复；`data-skin-ready` 是实际重新渲染完成后用于调试的状态，不作为“原生安装验收”证明。

### 7.4 稳定性、生命周期与安全

- 回复流式生成与内容变更：遇到 `data-is-streaming`、`aria-busy` 等标志或发生 DOM 变更后 700ms 内，触发按钮不可操作，不创建不稳定快照。
- 使用 WeakMap 按真实回答根 DOM 身份绑定，Set 管理活动控制器；操作栏重建后**搬动同一按钮**而非重插第二个按钮；路由跳转、卸载、Stop 均移除拥有的 UI 并清理 SDK controller。
- 最大遍历 120 条回复；单条内容的生成有节点、深度、笔记及总字数上限；恢复原文不受限制。内部实际限制以 `src/extract.js` 为准。
- 按钮、工具栏和折叠实验台支持键盘焦点、可见焦点环及辅助标签；状态提示使用 `role=status/alert`。进入和退出全屏后应测试焦点还原，不能仅依赖鼠标。
- 拒绝未预期外部请求；不动态加载 CDN；不把原始 XMind 第三方资源注入登录 ChatGPT 的 MAIN 世界。预览加载的真实四份已跟踪 JS 只在本地独立模拟 document 里运行。
- **已知生产阻塞**：Snowbrush 的 `#snowbrush_style` 全局样式残留；正式可信 Runtime 尚未接通；第三方组件分发与依赖许可证未审计；真实 chatgpt.com 登录网站、原生安装/撤权未验收。调试页不能通过删除全局 style 或伪造按钮改变这些结论。

## 8. UI 与正式源码的单向映射

| 被用户看到的效果 | 正式逻辑归属 | 预览仅提供 |
| --- | --- | --- |
| 三条回答识别、按钮自动出现、防重复 | `src/chatgpt-adapter.js` + `src/answer-registry.js` | 三段模拟对话和原生样式动作栏 |
| 答案内容/结构提取、截断提示 | `src/extract.js` + `src/xmind-convert.js` | 固定的 A/B/C 文本、C 的表格代码和引用 |
| 原位查看器、原文恢复、全屏与键盘交互 | `src/view.js` + `src/answer-registry.js` | 接近 ChatGPT 的对话外壳 |
| 实际绘图、缩放、适配、折叠与皮肤切换 | `src/xmind-adapter.js` + **原始四份 JS** | 由本地同源服务器按已验 Hash 加载 |
| 产品按钮/工具栏的正式视觉 | `assets/ui.css` | `chatgpt.css` 严禁复制这部分正式样式 |
| 复制、点赞、主题开关 | 真实 ChatGPT 拥有真实站点动作；本地无后端 | `chatgpt.js` 仅模拟这些外壳动作 |
| 开发诊断/切换窄容器/97 主题/Stop | 不进入安装包 | `preview/app.js` 在折叠实验台执行 |

正式程序的 `src/` 与 `assets/ui.css` 是**单一业务真相**；模拟站点不得实现第二套注册器、第二套绘图、额外安装器或多余授权机制。

## 9. 截图、浏览器证据与逐维评分协议

**先运行现有测试，再发布证据；未产生最新证据时下列状态默认为 `NOT_TESTED`。** 任何人不得把过去通过的引擎 A/B/C 测试直接算成 R3.3 全项通过。

| 目标维度 | 95+ 验收的可观察证据 | 现阶段设计状态 |
| --- | --- | --- |
| 功能完整性 | 3 按钮自动注入；A/B 同开；C 表格/代码/引用；全屏；原文无损恢复 | PENDING_CI |
| 视觉一致性 | `chatgpt-before.png`、A/B 原位 XMind 画面；审核无假悬浮按钮和信息噪声 | PENDING_USER_CONFIRMATION |
| 交互流畅性 | 每条可独立缩放折叠；工具栏/正文自然转换，无锁死/双重按钮 | PENDING_CI |
| 内容保真度 | 记录原 HTML 前后精确一致，C 不丢表格/代码/引用 | PENDING_CI |
| 真实 XMind 体验 | Playwright 在真实 Chromium 中检查原始 SDK `.topic`；非 Mock Canvas | PENDING_CI |
| 响应式 | 320px 内容和整窗双场景；无 body 横向滚动，工具栏可换行 | PENDING_CI |
| 无障碍/键盘 | 可见 focus ring、Escape 全屏退出、焦点恢复；再做人工读屏核验 | PARTIAL_CI_AND_MANUAL |
| 性能 | 97 节点、20 次切换、缩放与滚轮、无明显卡顿，实测时长/内存待记录 | PENDING_CI |
| 稳定性 | 操作栏重建仅 3 个按钮、内容更新提示、20 次开关无孤儿节点 | PENDING_CI |
| 生命周期与安全 | Stop 自身 UI 归零、无外部请求；生产 style/运行时/许可证另外封关 | PRODUCTION_BLOCKED |

### 9.1 Chromium 输出文件合同

- `tests/framework/chatgpt-mindmap-chatgpt-probe.mjs` 输出 `chatgpt-before.png`、`chatgpt-xmind.png`（原名称兼容）、`chatgpt-answer-A-light.png`、`chatgpt-answer-B-light.png`、`chatgpt-original-restored.png`、`chatgpt-fullscreen.png`、`chatgpt-answer-B-dark.png`、`chatgpt-answer-C-structured.png`、`chatgpt-narrow-320.png`、`chatgpt-mobile-320.png` 和 `chatgpt-result.json`。
- `.github/workflows/chatgpt-mindmap-preview.yml` 负责无外部静态资源的 Node 测试、CJK 字体及真实 Chromium 演练，将截图和 JSON 作为短期 Actions artifact 保存；截图保存**不等于已人工批准**。
- `node examples/programs/chatgpt-mindmap/preview/verify-assets.mjs`；`node examples/programs/chatgpt-mindmap/preview/serve.mjs --no-open`；`node --test tests/environment/chatgpt-mindmap-preview.test.mjs`；`node --test tests/environment/chatgpt-mindmap-r1.test.mjs`；`npm run check` 是本地最小检验入口。
- 评分只能在**逐项记录实测值/截图、实际 UI 人工审阅**后填写 0–100，所有维度目标 ≥95；未测试显示 `NOT_TESTED`，失败显示 `FAIL/BLOCKED`，绝不虚构 95+。本轮的真实 ChatGPT 登录页及原生安装另设验收门槛。
## 10. R3.3 截图复查后的视觉修正规则

- 已在 CI 的真实截图中发现：320px 时原来的“把全图塞进窄框”会让中文变成无法阅读的小字，即使布局不溢出也不能达到 95+。正式 XMind 适配器现在在小于 420px 的画布设置 **至少 100% 的阅读缩放**，优先展示中心主题及临近分支，允许通过原始 SDK 拖动/滚轮浏览其它分支。用户主动点“适配”也不能再次退化成无法阅读的小字。
- 全屏样式 class 可以先于引擎 fit 完成，因此 Chromium 截图与交互必须等待真实 `data-layout-ready="fullscreen"`，退出后等待 `data-layout-ready="inline"`，不可把过渡瞬间的半幅导图标记为最终效果。全屏 B 的 6 个真实主题应全部落入画布横向范围（容许 16px 测量差异），否则验收 FAIL。
- 调整转换后的 XMind **中心主题配色**为 `#1D75C1` 背景、`#FFFFFF` 文字；正常文本对比度约 4.8:1。它是正式 `xmind-convert.js` 中的 Skin 参数，不修改或重新打包原始四份引擎 JS。
- 响应式证据增加 `chatgpt-answer-B-narrow-320.png` 局部截图，以及 B 中心 XMind 主题的真实渲染宽度（至少 115px），不能仅凭“无水平滚动”评高分。新截图在等待临时评价 Toast 消失后采集，确保是稳定的用户交互状态。
- UI 逐维分数仍需用户确认截图；真实原生安装、沙箱 style/许可问题仍为 BLOCKED。上述三项属于 R3.3 视觉修复增量，不改变预览文件目录、程序 ID 或引擎来源。


## 11. R3.5 · Icon 工具栏及构建事实（2026-10-16）

**状态：PENDING_USER_CONFIRMATION；VISUAL_PASS 与 NATIVE_PASS 均不得仅凭源码/CI 宣告。**

- 唯一正式控件仍来自 `src/view.js`、`src/answer-registry.js`、`assets/ui.css`；模拟 `preview/chatgpt.html` 不持有任何导图控件代码。
- 桌面常驻：原文（file-text）、缩小 / 放大（zoom-out / zoom-in）、适配（maximize）、折叠或展开（同一动态按钮）、全屏或退出（同一动态按钮）；刷新只在数据过期时可见。全部为本地线框 SVG、36px 按钮、18px 图标。
- ≤390px **工具栏容器宽度**使用容器查询：原文、缩小、放大、适配、全屏、更多；折叠/展开和按需刷新移入菜单。小屏与粗指针区域至少 44px，禁止页面级水平溢出。所有按钮带中文 aria-label/title，具有键盘焦点、loading/disabled 状态；菜单维护 aria-expanded / Esc 焦点恢复。
- 打开导图后**隐藏本条操作栏的原触发按钮**，仅在导图内部保留“恢复本条回复原文”。原 DOM 未删除，关闭后恢复触发按钮及键盘焦点；其它条回复互不影响。
- XMind 画布使用实际 `.topic` 几何边界与 SDK zoom 计算适配；桌面优先完整可读，小屏限制不可读的过度缩小，优先锚定根主题，允许原生滚动查看分支；真实渲染之外不绘制替代 Canvas/SVG。用户手动缩放或拖动后，ResizeObserver、主题/折叠/全屏切换不应擅自重置视口。
- Chromium 截图必须等待 `data-ready=true` 和全屏 `data-layout-ready`，新增 `screenshot-evidence.json` 记录 Git SHA、Chromium、真实主题数量、视口、截图路径、PNG SHA-256、异常与 CI 关联；保存截图只是证据生成，不代表逐张人工视觉审查。截图并非本机 Chrome Native 安装证据。
- Program 类型为 `page-userscript`。其构建候选应由 `npm run build:program -- examples/programs/chatgpt-mindmap` 生成，`artifacts/programs/opendesk.chatgpt-mindmap/` 中的 `program.js`、`program.opendesk-draft.json` 和 `artifact.json` 才是构建证据。Builder 声明 `BUILT_UNVERIFIED / installable:false`，只有核验当前产物才能填写实际 Hash；它不是宿主 `dist/development` 或 Chrome Installed。
- 当前仍有 `E_XMIND_RUNTIME_UNAVAILABLE`、固定 4,042,573 B 原始资源的分发许可证/可信准入、Snowbrush 全局 style 残留、USER_SCRIPT 安全隔离及真实 Native 撤权生命周期待完成。**严禁假装 installed**。
- 项目代码通过 GitHub Connector 更新；本轮运行环境无法访问 `/Users/shopme/...` Mac 工作树或本机 Chrome，因此本地构建与本机已安装状态需标 `NOT_TESTED`，不是“未安装”的断言。截图未经逐张图像审阅前必须标 `SCREENSHOT_NOT_VERIFIED`，视觉评分 `NOT_TESTED`。

## R3.6 · 实测闭环（2026-10-16）

**设计状态：PENDING_USER_CONFIRMATION。** 并未获得用户对截图的最终批准；原生安装、真实登录 ChatGPT 与生产 Snowbrush 隔离依旧是 BLOCKED/NOT_TESTED。不能将通过 CI 等同于正式可安装或视觉 95+。

1. **真实代码唯一来源**：`examples/programs/chatgpt-mindmap/src/{view.js,answer-registry.js,xmind-adapter.js,xmind-convert.js}` 和 `examples/programs/chatgpt-mindmap/assets/ui.css`。根目录 `src/` 是浏览器宿主，仅承载通用运行时，本轮未修改。已新增架构审计：`docs/framework/workstreams/chatgpt-mindmap-r36-architecture-audit.md`。
2. **已修复实际源码/UI**：修复旧测试误要求 `renderer.reflow()` 而源码合法地使用 `renderer?.reflow()`；把容器查询锚点从 `.odmm-toolbar` 移到其外层 `.odmm-shell`；新增 More 菜单键盘 ArrowUp/Down、Home、End、Escape、Enter、焦点恢复，并确保 320px 下菜单项为 158×44px 可点击整行。
3. **XMind 不替换**：四份 Git-tracked JS 原字节、SDK Workbook 均不更换；修正 `.topic` 稳定几何轮询与滚动容器定位，防止尚有异步布局或多次 ResizeObserver 时过早标记 Fit 完成。320px 不把全图压缩成不可读文字，显示根节点并提供「左右拖动查看分支」轻提示，横向滚动可继续访问其余分支。
4. **真实 Chromium 实测**：`https://github.com/shopable-ai/opendesk-browser/actions/runs/38865072908` 的两 Job SUCCESS；真实 320px 画布 318px、根节点宽 180px / 可见 180px；菜单宽 170px、每项 158×44px；测试通过横向滚动值 176→411；A/B/C 真正主题数量 10/6/10，20 次开关、全屏 Escape、暗色、状态去重、Stop、375/390/768/1440 响应式均获自动化验证。Chrome 标识、逐图路径、SHA-256 见 Actions 图片 Artifact 内 `screenshot-evidence.json`。
5. **已人工打开的部分 CI PNG 观察**：桌面 A 浅色、B 深色、C 结构化、全屏、320px 整窗、320px 菜单、水平滑动后截图。A/B/C 内容可读、原始 XMind 节点真实；320px 只能一次展示根节点及部分分支，需要用户左右拖动。更宽内容仍不能在一屏完整阅读。不能因此给视觉/移动端无条件 95 分；未完整验收的截图继续 `SCREENSHOT_NOT_VERIFIED`，不宣称全视觉通过。
6. **可核验构建但不可安装**：本轮 CI 真实生成 `program.js`、`program.opendesk-draft.json`、`artifact.json`，精确结果参照对应 CI 的 `r35-program-build-audit.json`（Artifact 命名迁移至 R3.6 后使用 `r36-program-build-audit.json`）。`status:BUILT_UNVERIFIED`、`installable:false`、`E_XMIND_RUNTIME_UNAVAILABLE` 均保留。

### R3.6 专家逐维实测分数（仅预览范围）

| 项目 | 分数/状态 | 依据与余项 |
| --- | --- | --- |
| 视觉一致性 | 91/100 | 已打开 A/B/C/全屏/窄屏样本；截图未获用户正式批准，非 VISUAL_PASS |
| 预览功能完整性 | 96/100 | 真实 Chromium 的 27 项产品检查 + 原始 XMind 引擎探针；不包含原生生产运行 |
| 桌面 XMind 可读性 | 93/100 | 桌面 10 / 6 / 10 主题、实际 `.topic` 范围与全屏位置测量 |
| 移动端体验 | 88/100 | 320px 根节点完整可见、44px 控件、真实横向滚动；完整分支需左右探索 |
| 键盘/无障碍 | 93/100 | 方向键、Enter、Escape、焦点归还、全行点击区域；真实读屏器 NOT_TESTED |
| 稳定性 | 96/100 | 20 次开关、Stop 后独立 UI 归零、无 JS 异常；生产 BFCache NOT_TESTED |
| 性能 | NOT_TESTED | 缺少 FPS、95p 延迟与内存测量；不得主观评分 |
| Program 架构隔离 | 96/100 | 七个独立业务模块，宿主根 src 未修改；全局样式安全闭环仍 BLOCKED |
| 构建可信性 | 98/100 | 审计器对三份文件 SHA、源码新鲜度与产物签名逐项一致 |
| 生产 Runtime、许可、安全生命周期 | BLOCKED | 缺乏合规 JS 准入、style 隔离、原生授权与已安装运行证明 |

**综合目标未达到逐维 ≥95，仍有明确阻塞；不做伪造放行。** 后续应优先修复全局 style 隔离与可信 XMind 资源准入，在 Mac 原生运行后另行评定安全和性能。

---
## R3.7 · 交互预览和真实截图证据（2026-10-16）

**设计审批状态保持 `PENDING_USER_CONFIRMATION`，不得通过 CI 自动变更为 `APPROVED`。**

- 测试仍在 `preview/chatgpt.html` 使用原始四份 Git 跟踪 XMind JS 以及正式 `src/answer-registry.js`、`src/view.js`、`src/xmind-adapter.js`；未替换为假的绘图器，没有 CDN、MAIN-world 或第二套 Renderer。
- 失败 [#38864663581](https://github.com/shopable-ai/opendesk-browser/actions/runs/38864663581) 的 320px 根节点仅露出 31/180px；通过 [#38867300512](https://github.com/shopable-ai/opendesk-browser/actions/runs/38867300512) 的根节点露出 180/180px，支持手动横向滚动且页面无整体横向溢出。额外「滚动后适配返回根节点」新断言已由 [Actions #38867753856](https://github.com/shopable-ai/opendesk-browser/actions/runs/38867753856) 实测通过：`.workbook-item.scrollLeft` 从 411px 返回 176px，真实 180px 根节点重新充分可见；并由 [#38868394764](https://github.com/shopable-ai/opendesk-browser/actions/runs/38868394764) 在文档版本再次复验成功。
- 窄容器更多菜单由真实 CSS `@container` 决定；验证 ArrowDown/ArrowUp/Home/End/Enter/Space/Escape、外部点击、焦点恢复和 44px 行高。400px 页面自然内容容器为 376px（精简菜单）；440px 页面内容容器为 406px（桌面工具栏），不得错误将浏览器窗口宽度直接当成 `@container` 宽度。
- 自动收集的 `screenshot-evidence.json` 对每张 PNG 写入 Git SHA、浏览器、URL、视口、各回复实际 Topic 数、内容宽、根节点可见宽、真实滚动范围、工具栏宽、时间、PNG SHA-256 和 CI Run ID。每张机器 JSON 的视觉标志仍为 `SCREENSHOT_NOT_VERIFIED`；只能在逐张真人复审、获得用户设计确认后更新相应验收结论。
- 产品正式运行 `E_XMIND_RUNTIME_UNAVAILABLE`、产物 `installable:false` 和 Snowbrush `BLOCKED_GLOBAL_STYLE_RESIDUE` 未解决。原生安装、权限撤销、用户 Mac 的 Chromium 和真实登录 ChatGPT 与本预览明确隔离。

完整事实、复验命令和待关闭项目见 `docs/framework/workstreams/chatgpt-mindmap-r37-acceptance.md`。
