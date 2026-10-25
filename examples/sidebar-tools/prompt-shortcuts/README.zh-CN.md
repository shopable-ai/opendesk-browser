# AI 提示词快捷按钮 · Prompt Shortcuts

## R1.1 功能所有权说明（2026-10-25）

**Prompt Shortcuts 只负责提示词**：保存、编辑、插入、快捷栏、OD 入口、图片及网站编辑器适配。可信页面 `trusted/page.js` 已移除滚动导航的 UI、长回复算法导入、按钮生命周期与回调。原五个 `scrollNavigation` 选项仍由 `trusted/model.js` 容错读取和保留旧设置数据，**但不再驱动网页滚动**；它们不再代表 Prompt Shortcuts 可单独提供导航。

新的独立源项目为 [AI 对话滚动导航](../../programs/chatgpt-jump-top/README.zh-CN.md)，保留其历史 Program ID。没有安装独立 Page Program 时，Prompt Shortcuts 安装后不再出现导航按钮；导航的安装、停用和 Origin 扩权均遵守独立的 Page Authority，而不是复用提示词权限。上方历史的「Prompt 集成滚动」文字、预览中旧导航演示均仅为旧版证据，不能替代当前正式产品。**目前尚无新的已验证 Page 安装包/真实 Chrome 验收：NOT_TESTED。**

当前 `tool.config.json` 源码版本为 1.1.19，仓库中唯一正式 `prompt-shortcuts.opendesk-tool.json` 仍为 1.1.18；本轮未重建或冒充已晋升的 Sidebar 正式包。可信页面属于宿主代码，不因重打 Sidebar JSON 就自动更新。

## 历史：旧版 Prompt Shortcuts 交付记录

# 提示词快捷按钮（Prompt Shortcuts）

独立工具 ID：`prompt-shortcuts`，正式可安装包版本 **1.1.18**。ChatGPT、DeepSeek、Gemini 对话页使用内置默认适配；源码、工具包与实际安装状态见下方证据，其他网站仍可建立自定义规则。

## R4.4 列表进入详情与悬浮操作（2026-10-24）

**原始产品目标**：点击提示词列表卡片进入完整只读详情（不是直接复制或自动发送）；右上角仅在 Hover、键盘焦点、操作展开或触屏场景显示浮动快捷按钮。操作浮层为绝对定位，不占正文网格列，不改变卡片文字列宽或两行截断。点击「更多」浮出已有编辑、启停、上下排序、复制与删除按钮；危险删除仍要求确认。

- 正式 UI：`src/index.html` 增加只读详情；`src/main.js` 复用既有 `start` 编辑、`copy` 用户手势和 `update/move/remove/commit` ETag 读回。Host 导航新增正常的 `detail` 页面状态，不修改 Browser SDK/Host/权限。进入详情不会读取或修改网页草稿，网页自身快捷栏点击仍采用原插入流程。
- 正式 CSS：`src/style.css` 的卡片正文只保留短标签和文本两列，操作区 `position:absolute`；菜单展开不在内容流追加按钮行。触屏不隐藏「更多」；支持 `:focus-within` 和 `prefers-reduced-motion`。
- 完整交互预览：`preview/index.html` 与上述列表行为同步，用于视觉评审；其中保存、复制、网站模拟均不等于真实 Host 安装和授权。
- 唯一正式包 `prompt-shortcuts.opendesk-tool.json` 已与本轮源码同步：**1.1.18 / 144,295 UTF-8 bytes / SHA-256 `7158d16bff8143bef8a6a4ebac54b0fecbf6dba364025ed192c27e397ed0d116`**，保留原 `prompt-shortcuts` ID、能力、固定 Classic 依赖与 `library` 首装数据。1.1.17、1.1.16、1.1.15 已审阅来源继续按固定原始摘要准入，禁止同版本换包假冒官方。
- 之前同业务源码的定向 Node 运行记录可复用；本轮 Chromium 新交互及 Mac 已安装版本是否通过，依实际 CI 和安装回执再确认。**Mac Chrome 安装升级与 production 验收：NOT_TESTED**，不可用预览 PASS 替代。

## 历史：R4.3 增量完善结果（2026-10-24）

旧库接近 8 KiB 时，新增导航默认值曾导致正常保存超限；现仅在读取时展开默认值，保存按真实持久化字节计算，显式关闭设置仍保留。可信网页导航增加完整矩形避让，并忽略自身 DOM 变动引发的重复布局；来源 pin 已同步已审阅的双 chevron SVG。8 KiB、CAS、来源、启停与 epoch 门禁保留。

唯一正式 JSON 已由原打包器从已验证候选显式晋升，并通过 `--check-project` 及包同源定向断言：**1.1.16 / 142,077 UTF-8 bytes / SHA-256 `f42d7acd013a727c8b3ab8b318d3cf77882686d468027b168647dcacf4df7787`**。ID、能力与 SDK 要求未增加。

真实 Mac Chrome 经原「审阅新版 → 确认更新」完成 1.1.15 → 上述 1.1.16；原三条记录保留，下载、新建保存、草稿返回、追加导入和关闭重开已有证据。本次只补未完成操作：右上设置打开原 Host，停用后界面关闭、恢复后五条数据完整，AI Dock 发送短消息并真实返回 `R43_AI_OK`，Scheduler 顶部入口打开原扩展运行页。未删除原三条或本轮新增两条。

环境为原扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`、仓库 `dist/development` 持续开发；复用现有 watcher 与有效定向测试，本次仅新增来源断言和晋升后的包同源断言，各 1/1 PASS。卸载及完整撤权原生验收、宽度矩阵、production 与评分仍未执行，不据旧清单恢复。具体证据和已复用测试边界见 [本轮增量记录](evidence/r43-native-incremental-20261024.json)。

## R4.4-CORE 历史包更新状态（2026-10-24，已由上方结果推进）

通过原 `npm run app:update -- prompt-shortcuts` 完成候选构建、定向门禁、显式晋升及 `--check-project`。唯一正式 JSON 与当前源码、`dist/development` 官方资源一致：版本 **1.1.16**，141,418 UTF-8 bytes，SHA-256 `90494dc67c32310d2db74195ed2812895c66c7c9de0f8db029115476a16f628d`；ID、能力及 SDK 要求未增加。本轮未修改产品业务源码。

**包就绪不等于已安装。** 本轮真实 Chrome 最后核对为官方来源 **1.1.15**、已启用、显示可更新；加载仓库 `dist/development`，实际扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，开发服务已连接。自动浏览器工具随后因 `chrome-extension://` URL 策略拒绝继续，尚未取得 1.1.16 安装回执、更新后布局、业务及数据保留证据；这些均为 `NOT_TESTED`，六维及综合评分为 `NOT_SCORED`。升级应通过原可信「审阅新版」流程，不先卸载。详见 [R4.4 工作记录](../../../docs/framework/workstreams/prompt-shortcuts-r44-core-20261024.md)。以下记录保留各自历史版本和证据边界。

## R4.2-LOCAL 历史 1.1.15 交付状态（2026-10-24 增量收尾）

唯一正式 JSON 已经由原打包器从通过定向门禁的候选晋升，并通过 `--check-project`；SHA-256 为 `4085c155d2d8dbac7b55cc5dcaea24229a3fb1d6cfb69431dad2ae5c0eb33ce0`。ID、capabilities、SDK 要求与右键菜单声明未变。

真实 Chromium 的原始完整预览、正式包 UI 和共享 React Host 回归已验证菜单、键盘与焦点、编辑保存、Emoji、导入导出及受控草稿插入；共享标题栏的 AI 按钮现与其他按钮一致，桌面 30px、粗指针 44px、间距 2px、图标 17px。窄视口换行后的更多菜单改为锚定整个标题栏。

真实 Mac Chrome 已从官方目录完成 **1.1.8 → 1.1.15 同 ID 升级**，无能力增减；升级前两条记录的所有原字段与升级后导出一致，v2 只补充文字外观默认字段。新建、多行中文与 Emoji、编辑保存、关闭重开、向已登录 ChatGPT 草稿追加全文且不发送、导出与同文件导入均已通过原生操作。单一紧凑标题栏可见，更多菜单的 Escape 焦点恢复、键盘进入设置及停用/恢复也已验证。原 ChatGPT 草稿已恢复，本轮测试条目保留并有本地导出备份。

当前为仓库 `dist/development` 持续开发环境，实际 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；调试页已显示 serve 连接成功，构建指纹 `76e6a9ee199f…`。上一轮 Computer Use 拒绝与 dev 资源阻塞属于历史状态。CI 原取消主 job 的实际原因是 16 分钟超时，重跑后主 job、四项 Chromium fixture 和下游包同步全部成功，包未变化；该 run 仍绑定旧提交，不冒充当前 main 的全量结果。

按用户最新“顶多增量测试”要求，本轮复用已有回归，未继续宽度、主题、真实 200% 缩放、触屏或 production 完整矩阵；七维与综合分保持 `NOT_SCORED`，不宣称完整 95+ 验收。新增 [Mac Chrome 增量记录](evidence/r42-native-incremental-20261024.json)；[上一轮 R4.2-LOCAL 记录](evidence/r42-local-20261023.json)和以下历史记录保持各自版本与环境边界。

## AI 会话核心功能（2026-10-23 开发收尾）

从「扩展」的官方可选目录安装本工具，打开原工具界面及现有 AI Dock，使用已配置的 Provider，即可用自然语言查找、创建和修改提示词，例如「创建一条日语翻译提示词」或「把法语提示词写得更简洁」。涉及私人正文时，先在可信宿主确认本次发送范围；删除和批量修改结果仍经过现有审阅，取消审阅不写入。

持续开发环境的真实 Mac Chrome 与 Native `local_codex` 已完成查找、创建（含禁用条目）、调整顺序、授权后修改正文，以及删除审阅取消后保留原数据、再次确认后仅删除指定记录；保存结果均有真实存储读回，原 opaque iframe 保留。核心流程已有可运行证据，本次不再逐条重测其他自然语言命令。

本轮可信适配器修复了恢复记录被旧操作误清除、缺失 ID 回退到文本误选记录，以及等待锁期间 Stop、撤权或关闭后仍可能写入的问题。恢复记录使用共享 Web Lock 和 intent 身份；真正写入前重新检查当前授权；回执未知时只读核对，不自动重放。原工具源码、唯一正式 JSON、安装身份和权限保持不变。

已有定向回归、受影响 Host 路径和独立复审通过，六个源码/测试文件的指纹在收尾时一致；独立快照的 `build:dev`、`build`、`verify` 通过。原始记录保存在本机 `artifacts/conversation-r17-mac-20261023/`，新增回归见 [恢复与取消](../../../tests/environment/opendesk-conversation-r17-prompt-recovery.test.mjs)和 [ID 精确匹配](../../../tests/environment/opendesk-conversation-r17-id-query.test.mjs)。

以上是加载仓库 `dist/development` 的核心开发证据。历史版本升级、完整安装矩阵和新 production 候选真实运行仍为 `NOT_TESTED`；本轮不开展完整正式验收或评分。

## 输入框与容器识别（2026-10-22）

ChatGPT 内置识别使用编辑器 ID、`data-testid` 或 `data-composer-markdown` / `role`，包括未登录页在 `main` 外的 `footer textarea#mobile-composer-prompt`。DeepSeek、Gemini 内置规则不依赖翻译文案；匹配仍保留可见、可编辑、作用域与唯一性校验，只追加草稿，不发送。

自动拾取不再生成依赖 `placeholder` / `aria-label` 的选择器，改用机器属性、编辑语义或唯一容器关系。DeepSeek 源码中的配置建议复用内置 `#root` / `#root textarea`，移除旧生成式 class；Perplexity 建议移除英文 placeholder。用户已保存的自定义规则保持原样，建议仍须通过原网页检查，不能自动取得权限。

本轮 48 项定向 Node 检查通过，覆盖中英文属性切换、多行草稿、隐藏/歧义/失效节点、安全回退及异步规则变更。真实未登录 ChatGPT 的 footer DOM 已核对，但站点脚本/样式返回 403，本轮完整点击插入为 `NOT_TESTED`；已登录真实会话、安装升级及 production 验收也未执行。现有 watcher 已更新 `dist/development/agents/page-relay.js`；日常 Chrome 的加载路径、ID 和 serve 连接未验证。本轮只交付源码，未晋升正式 JSON，已安装 JSON 中的配置建议仍待后续包更新。

## 文字与图片快捷按钮（历史 1.1.9 验收，2026-10-22）

新建或编辑提示词时，正文仍是唯一必填项。在默认展开的「按钮设置」中选择文字或图片；图片可使用本地 PNG/JPEG/WebP，或 HTTPS 图片网址。本地原图上限为 2 MiB，保存前由现有工具压缩至最多 64 KiB，并经原 Trusted Host 存入独立资源库；8 KiB 文本库只保存资源引用。再次编辑可预览、更换或移除图片。文字和图片条目共存，网页点击均插入完整正文、保留原草稿，不自动发送。

当时修复了源码已有图片功能、正式 JSON 仍为旧内容的交付缺口，升至 `1.1.9`，身份和申请能力不变。真实 Mac Chrome 的独立 Profile 已通过原安装器安装该包，并在 Gemini 验证文字和图片点击、完整正文及草稿保留；本地 PNG 的预览、保存和重开恢复也已通过真实 Host。日常已登录 Chrome 的文字操作单独通过，日常 Profile 的 `1.1.9` 升级未完成验证。同日续测已通过独立 Profile 的原生图片选择与取消、取消后继续输入、已保存图片取消保护、保存后重开及图片来源切换的未保存提醒；安装版仍与正式 JSON 字节一致。本轮未发现需修改业务源码的缺陷。JPEG/WebP 文件选择、拖放、IME/Undo 和 production 验收仍为 `NOT_TESTED`。证据及候选边界见 [安装版核心功能记录](evidence/installed-image-core-20261022.json)。

以上 `1.1.9` 记录仅为历史证据，不证明当前 `1.1.15` 已完成安装升级或原生验收。

## 当前任务：内置默认网站适配（2026-10-20）

DeepSeek、Gemini 对话页与 ChatGPT 一样使用扩展代码中的固定默认适配，无需逐页选择容器、输入框或保存网站规则。DeepSeek 默认范围为首页与 `/a/chat/s/<id>`，Gemini 为 `/app` 与其单段会话路径；其他网站仍可手动建立自定义规则。所有路径继续检查精确 Origin、唯一可见编辑器、工具安装及停用状态，点击仅插入、不发送。

自定义规则按最长匹配路径优先；匹配到已停用规则时保持停用，不回退启用默认规则。删除自定义规则会恢复该页面的代码默认值。默认规则只在内存中解析，不改写已有提示词、草稿或规则。

本轮源码、定向测试、工具包与真实网页证据的状态见 [默认适配开发证据](evidence/default-sites-core-20261020.json)。此前 1.1.7 的安装升级及已配置规则下的 DeepSeek/Gemini 插入、DeepSeek 长回复回顶证据保留于 [多网站核心流程记录](evidence/multisite-core-20261020.json)，不能替代新默认策略的无自定义规则安装证据。Gemini 登录后长回复、真实 IME/Undo、Chrome optional 权限撤销及 production 验收仍为 NOT_TESTED。

## 使用流程

1. 在 OpenDesk Browser「扩展」找到「提示词快捷按钮」，从官方可选目录审阅并安装，再打开管理界面。
2. 点击右上角的「新建」图标，**只输入完整提示词正文**即可保存。短标签和显示名称默认取最前两个可见 Unicode 字素；均可留空，按钮外形统一为圆角方形。
3. 已安装且启用、Chrome 网站访问权限有效时，ChatGPT、DeepSeek、Gemini 受支持对话页直接显示快捷入口，无需保存网站规则。点击网页按钮只尝试插入当前草稿，不自动发送；失败时尝试直接复制，复制仍不可用才显示明确失败反馈。
4. 选中文字后快速创建属于**可选**的 Chrome 原生右键功能：可在工具详情的受信任「设置」中启用，只有这一功能可能需要原生菜单许可；选区预填新建表单后仍需**显式保存**。
5. 列表第一视觉层级为提示词正文；点击正文直接复制，不弹出额外复制窗口。每条仅常显「更多」图标，展开后用六个 SVG 操作图标完成编辑、启停、排序、复制与确认删除。关闭 Side Panel 后，已安装且启用的网页按钮独立运行。

## ChatGPT 长内容回到开头

回顶箭头属于本工具的网页功能，**无需另外安装或手动运行 ChatGPT Jump Page 脚本**。工具已安装、启用且「网页按钮」开关打开时，进入或刷新 ChatGPT 页面会经现有固定 Page Relay 自动启动；关闭 Side Panel 不影响它。

- 长用户消息的箭头位于“复制消息 / 编辑消息”原生操作组旁，长助手回复的箭头位于对应回复操作组旁。
- writing block 的箭头位于“打开编辑器”工具栏；进入独立查看器后，在含“关闭查看器”的工具栏显示对应箭头。
- 点击一次到达对应内容的真实起点，并避开固定或粘性工具栏；不会无条件把整页滚到 0，也不会写入正文、草稿或选区。操作组或目标不唯一时退出。
- 只在精确 `https://chatgpt.com` 运行。停用、卸载或关闭「网页按钮」会清理箭头；页面离开、BFCache 恢复、SPA 导航和根节点替换沿用现有工具生命周期。点击前还会重新读取工具安装、启用和网页按钮状态。

实现由 `trusted/page.js` 持有安装与生命周期，静态复用 [`conversation.js`](../../programs/chatgpt-jump-top/src/conversation.js) 的唯一滚动算法；该独立项目保留为诊断与算法测试入口，不是日常自动运行入口。代码固定编入浏览器扩展的 `agents/page-relay.js`，不从导入的工具包动态执行 JavaScript；现有 v2 工具身份、包文件和权限保持不变。

2026-10-20 已在真实已登录 Chrome 验证刷新与新进入页面自动显示箭头，并点击安装版 writing 箭头；[脱敏集成证据](evidence/chatgpt-jump-integration-20261020.json) 区分这些结果、生命周期定向测试与尚未完成的 production 验收。 本次页面适配器验证分两组不重复执行，共 78 项通过；固定来源检查 3 项通过，现有工具包同源检查通过。

## 手动安装 JSON 与页面验证

**AI Dock 须从官方目录安装并通过可信来源核验。** 准入继续由当前构建中的官方发行规则检查包版本及摘要、可信官方来源记录、启用状态与安装代际；不能只凭版本号推定可用。手动导入本地 JSON 即使 ID、版本和字节相同，也不等同于官方目录安装，不能据此获得 AI Dock 准入；需要 AI 对话时请使用「扩展」中的官方可选目录，经原安装器审阅确认。下列手动导入仅用于工具包与网页功能验证，不代表 AI Dock 已可用或 R1.7 原生验收通过。

1. 先更新 OpenDesk Browser 扩展代码，使它包含本次可信 `page-relay` 适配器。日常开发加载本仓库 `dist/development`，复用已有 `npm run dev`。**只向旧版扩展导入 JSON 不会更新这个静态适配器。**
2. 在侧栏「扩展」点击「筛选和管理扩展」（省略号图标），选择「导入本地工具包」。在「导入扩展」中选择本目录唯一正式包 `prompt-shortcuts.opendesk-tool.json`，核对身份 `prompt-shortcuts`、版本 `1.1.16` 及权限后「确认安装」或「确认更新」。不要选独立 `chatgpt-jump-top` Page 包。
3. 已安装同身份同版本时保留现有数据，直接核对状态即可，不要为了测试卸载重装。新安装后默认可用；如果此前主动停用，在工具行的「管理」菜单选择「启用应用」，或在「工具设置」恢复「启用工具」，并恢复「网页快捷按钮」。
4. 进入或刷新 `https://chatgpt.com`，无需去「开发」点击 Run。已有文档在扩展更新后应先刷新；先保存重要草稿，勿刷新其他会话页面。确认提示词入口只有一个，支持的长内容操作组旁出现回顶箭头。
5. 点击长用户消息、长助手回复、Writing 或文档查看器中实际出现的箭头，观察对应内容起点是否可见、是否被工具栏遮挡，并确认正文和输入草稿不变。未出现某种内容时，该类型记为未验证，不用其他类型代替。
6. 在「工具设置」停用、恢复本工具，确认控件消失后自动恢复且数据保留；再次进入或刷新后入口不重复。关闭侧栏后仍应可使用网页按钮。

2026-10-20 的继续验证已走过真实导入界面、现有安装的刷新、Writing 点击及停用/恢复；新进入 ChatGPT 首页自动显示一个提示词入口。最终候选新标签页加载原长对话时，网站返回「无法加载此 ChatGPT 对话」，该页面的长内容点击未验证。没有卸载重装，也没有将同版本重复导入算作新安装。当前记录见[安装版核心流程证据](evidence/chatgpt-installed-core-20261020.json)。Writing 点击后的可见区域变化已观察，精确首字符位置、所有内容类型和全新安装/升级仍未验证。

开发热重载的旧上下文现已增加 `runtime.id` 失效清理，并容忍已失效 Chrome listener API 的移除异常；定向回归已通过，真实重载分支尚未单独验证。修改前已遗留的重复入口仍须刷新该文档清除。

## 存储和安全边界

- 使用现有 `OpenDeskTool.request('storage.get'/'storage.set')` 隔离存储。全部提示词存入 `library` 单一 JSON 项，现有上限 **8192 UTF-8 字节**，按完整 JSON 计算。正文不会自动截断；超限时拒绝保存并保留草稿。
- 升级读取时补全导航默认值，但不会自动改写旧数据；正常保存只持久化关闭的导航项，避免默认设置额外占用旧库容量。新增非默认设置仍计入原上限，超限时保留原数据并拒绝写入。
- ETag / ifMatch 在同一工具锁下保护并发编辑。工具停用、版本变动、卸载与页面切换都必须经过可信运行时验证。
- 网页适配器：`trusted/page.js`；精确站点 Origin/路径与工具安装/启用检查：`trusted/policy.js`。工具的 Sandbox JS 不能直接获取 ChatGPT DOM；网页插入不读取聊天历史、不上传提示词、不触发发送按钮。
- 共享 Unicode 数据模型：`trusted/model.js`，既以固定摘要依赖打进独立工具包，也受现有构建源码来源白名单限定进入固定页面模块。不能将此目录的任意脚本动态注入网页。
- **原生菜单**由现有 Browser SDK v2 的 `browser.contextMenu`、`browser.launch.consume()` 和既有 Chrome 菜单 Host 提供；不维护第二个菜单服务。
- 工具停用与卸载会停止网页按钮。保留全局网页按钮开关供用户自行关闭；卸载会清理本工具的数据及旧版授权记录，重要内容请先手动备份。

## 范围、验收与后续

当前仅 `https://chatgpt.com` 有已验证的内置适配器。DeepSeek、Gemini 已有真实插入证据，但仍依赖网站规则；内置默认策略是当前未完成任务。其他普通 HTTP(S) 网站的自定义规则能力保留；Claude 等仍是候选，不能宣称为已验证预设。不得扩大授权或凭 DOM 猜测自动兼容。下方历史记录中的手动配置路径不取代本页最新默认适配要求。

运行不修改正式 build 输出的定向测试：

```sh
node --test tests/environment/prompt-shortcuts-r14*.test.mjs
```

对应 CI：`.github/workflows/prompt-shortcuts-r14.yml`。该 CI 覆盖工具包、存储、授权、构建来源边界以及模拟网页生命周期/草稿插入（[R1.4 9/9 PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38738460330)），仍不能代替生产构建、真实 Chrome 安装、实时 ChatGPT 富文本输入、Undo 与中文输入法验收。实际候选及交接记录见 `docs/framework/workstreams/prompt-shortcuts-r12-ui-handoff.zh-CN.md`。

### R1.5 安全插入补充

- 原生点击插入前再次检查安装、工具启停、适用网站、按钮和草稿；IME 组合期间拒绝触碰输入框；同一轮异步验证只处理一次点击。
- 富文本段落不能仅用 `textContent` 或“忽略全部空白后包含正文”确认成功。当前可信 ChatGPT 模块会核对原有正文、顺序及完整多行内容。结果不明确则提示检查并手动复制，绝不自动重试或发送。
- R1.5 已有独立 Chromium **模拟编辑器** 的多行与撤销实验，仍需在安装的 Chrome 和**真实 ChatGPT** 富文本编辑器中验收；可持续查看同一 [交接文档](../../../docs/framework/workstreams/prompt-shortcuts-r12-ui-handoff.zh-CN.md) 的状态。

## 仓库内正式可安装工具包与本地测试

**直接使用本目录的正式文件：** [`prompt-shortcuts.opendesk-tool.json`](./prompt-shortcuts.opendesk-tool.json)。
这是随 `main` 提交的 **Sidebar Tool v2** 可移植 JSON 包，不需要下载 CI ZIP，也不是独立 Chrome Extension。
首次入库提交：[`ddd386ba2`](https://github.com/shopable-ai/opendesk-browser/commit/ddd386ba220213192bc7b0bf3a4ea8d8bbcc77a1)；当时大小 35,083 bytes，SHA-256
`1f09804545c2a654cccab76c1a863c29453b1239b7e387e0d6e4225df3bed412`。

本地更新源码后，在仓库根目录按统一门禁执行（**未通过测试时不覆盖本目录的旧正式包**）：

```sh
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/prompt-shortcuts \
  --out artifacts/sidebar-tools/prompt-shortcuts/candidate.opendesk-tool.json

node --test tests/environment/prompt-shortcuts-r14*.test.mjs

node scripts/build-sidebar-tool.mjs examples/sidebar-tools/prompt-shortcuts \
  --promote-from artifacts/sidebar-tools/prompt-shortcuts/candidate.opendesk-tool.json

node scripts/build-sidebar-tool.mjs examples/sidebar-tools/prompt-shortcuts --check-project
git diff -- examples/sidebar-tools/prompt-shortcuts/
```

现有打包器负责全部 `tool.config.json`/HTML/CSS/JS 的确定性编译，`--promote-from` 只接受与当前源码逐字节一致的已测试候选；不同版本的临时包保存在忽略的 artifacts 目录即可，工具根只保留 `prompt-shortcuts.opendesk-tool.json`。自动测试通过代表 `PACKAGE_PASS`，真实 ChatGPT/IME、安装、停用与卸载仍需原生验收。常规打包不再自动刷新根目录文件；不要使用 `--out` 直接写正式路径。

本地真实安装：先确认日常 OpenDesk 浏览器仍加载标准 `dist/development` 与现有唯一 `npm run dev` watcher；在 OpenDesk「扩展」的已有工具导入入口选择上述 **JSON 文件**，完成原有权限/来源审阅后安装并打开。若同 ID/版本的正式官方工具已经安装，先核对当前包身份与原有数据，禁止绕过版本、授权或更新审核硬替换。需要 AI Dock 时，必须使用已有「官方可选工具」入口安装并通过可信来源核验；本地导入不等同于该官方来源准入。两条路径沿用同一工具 ID 与原安装器，不创建第二个工具身份。

**R1.5 CI 证据：** [Run 38743743798](https://github.com/shopable-ai/opendesk-browser/actions/runs/38743743798) 为 **11/11 Node PASS、语法 PASS、可移植 v2 PACKAGE_PASS**；[Run 38747308859](https://github.com/shopable-ai/opendesk-browser/actions/runs/38747308859) 验证并提交了本目录的同字节工具包。它们仍不代表完整 production WXT 构建、真实 Chrome、ChatGPT 富文本、Mac 中文 IME、原生右键或卸载/重装已经通过；原始证据和缺口记录在唯一 [交接文档](../../../docs/framework/workstreams/prompt-shortcuts-r12-ui-handoff.zh-CN.md)。

### R1.7 双预览映射与正式工具更新

- `preview/index.html` 和 `preview/mock.html` 是用户确认过的原版设计基准，**没有重建或覆盖**。正式管理 UI 对齐卡片、原位删除、两个独立开关、内容优先表单、最终短标签/形状预览与 8192 B 配额。
- 网页可信按钮栏紧凑化，修复窄内容区折叠类名，完整长文本 Tooltip 可滚动，针对快速双击增加重复抑制。真实草稿仍采用原生插入、完整读回、撤权及中文输入法组合保护。
- 工具更新候选版本为 **1.0.1**：通过已有 OpenDesk 扩展安装器审阅和升级，**不能将新字节强行覆盖已安装同版本 1.0.0**；正式包的版本/摘要改变后需要在工具详情重新确认 chatgpt.com 网站授权。
- 在管理工具沙箱内，无法权威读取网页授权状态时明确要求去宿主工具详情确认，不能根据右键菜单许可推断网站授权。
- 当前远端开发环境不可访问用户 Mac 的 `dist/development` watcher、真实 Extension ID、Native 配对或已登录 ChatGPT。Node/CI 不等于原生安装、Cmd+Z 或 Mac 中文 IME 验收；详情见唯一主交接文档。

### R1.13 免重复授权与紧凑设置（候选验收）

- `preview/index.html`：删除独立网站授权模拟页；新增可交互的宿主设置视图，仅保留工具启停、适用网站说明和可选的原生右键功能。
- `src/index.html` / `src/style.css` / `src/main.js`：列表正文优先、单击直接复制、编辑表单默认三行且滚动、按钮设置为紧凑的 Label/Input 行，统一圆角正方形。
- `trusted/page.js` / `trusted/policy.js`：安装启用后仅在 `https://chatgpt.com` 原点运行，仍保留安装身份、用户开关、可信点击、IME 与不自动发送的校验；不把旧逐站授权当成额外的阻塞条件。
- `src/ui/sidebar-tools.js` / `src/ui/tool.html` / `src/ui/tool-shell.css`：对本工具隐藏重复的网站授权按钮与清单；Chrome 原生右键功能在受信任的宿主设置内独立管理，不影响其他工具的权限体系。
- 正式候选包为同 ID `1.0.2`，更新必须通过正常审核/版本升级。当前版本的 CI、正式 Chrome 安装、真实网页富文本编辑器与 Mac IME 验收应查看最新 GitHub Actions 回执，不能用旧版历史 PASS 代替。

### R2.0 网站适配扩展（1.1.0）

正式工具现支持在「适用网站」中为非 ChatGPT 的 HTTP(S) 网站手动设置两项：**按钮容器**和**目标输入框**。打开网站后选择、测试并保存，网页再次打开或刷新将按精确 Origin 和路径作用域显示快捷按钮。列表、提示词正文和原生右键不受影响。规则保存到本工具独立 `sites` 数据项，支持编辑、启停与删除，错误恢复遵循与提示词库相同的 ETag 并发规则。

安全边界：未配置网站不生效，不会自动发送；登录、密码、支付或含糊的输入框不应被强行填入。复杂富文本编辑器必须通过真实网站验证后才能宣称兼容。Claude、Gemini 等目前仅属待验收目标，不能以模拟页面通过代替真实网站通过。

## R1.17 正式图标交互

- 列表卡片默认只有一个 40px「更多」图标；展开后为编辑、启停、上移、下移、复制、删除六个无文字 SVG 操作。每个按钮保留 title / aria-label、键盘焦点、Esc 关闭及删除前的文字确认；禁用的提示词也可以通过展开工具栏复制完整正文。
- 新建采用工具内右上角 Plus 图标；宿主仍负责自己的标题与通用安装设置，不新增宿主 Action Slot 或第二套 Header。
- 新建／编辑表单隐藏无价值的固定字节提示和占位预览，接近 8 KiB 时才显示存储计数；新增「保存并继续」，成功的 Host 持久回执后才清空并聚焦新建正文，异常保留草稿。
- 内置 ChatGPT／多网站双选择器、原生右键、权限与可信 Host 未变。Chromium 模拟 Host 验证不等于已安装的 Mac Chrome 验收。

### R1.17 已核验构建与 Chromium 证据（2026-10-16）

- R1.17 正式 UI 已在 `main` 落地：列表默认仅一个 More 图标，展开后编辑 / 启停 / 上移 / 下移 / 复制 / 删除为六个独立纯 SVG 图标（无按钮可见文字），保留 `title` / `aria-label`、40px 目标、Esc、禁用与删除文字确认；新建 Plus 图标及条件存储计数、保存并继续均使用正式工具源码。
- [专项 CI Run 38892514805](https://github.com/shopable-ai/opendesk-browser/actions/runs/38892514805)：`prompt-shortcuts-scope` 与 `sync-project-package` 两项 SUCCESS；Prompt Node **76/76** PASS；共享 Sidebar Node **6/6** PASS；正式 HTML/CSS/JS 语法与打包一致性检查 PASS。
- 正式包真实 Chromium / **受控 Mock Host**：320/360/400/440px 六操作 SVG-only/无横向溢出、40px hit target、ARIA、Esc 关闭恢复焦点、连续保存并继续、重开读回等 PASS，`consoleExceptions=[]`。预览 Chromium 与 R2.1 网页 DOM 双选择器 Chromium Fixture 均 PASS；这些不是已安装的原生扩展测试。
- 唯一正式可安装 JSON：`prompt-shortcuts.opendesk-tool.json`，版本 **1.1.1**，**71,146 UTF-8 bytes**，SHA-256 **`d8194d106eaa4c171203c5ad3f131bbdb4b65864e8036d5cb7460abff4a4ffc5`**；自动同步提交 [2f4ddbc](https://github.com/shopable-ai/opendesk-browser/commit/2f4ddbc749badfcddc0412442dfdf1e15c5b0b36)；`--check-project` = **PROJECT_PACKAGE_MATCH**。
- 尚未取得 Mac 本地 `dist/development` 同 ID 安装升级、真实 Host 存储事务、已登录 chatgpt.com/第三方网站实际编辑器插入、撤权、中文 IME/Undo 的原生证据：分别为 **NOT_TESTED**。九维专家 95+ 是后续正式产品验收门槛，不得把模拟 CI 当成已满足。

### R1.18 网站规则保存与选区竞态修复（候选 1.1.2）

- 网站规则保存期间禁止取消、切换与二次提交；期间新输入留在当前表单，已保存版本收到 Host 有效回执后绑定原规则，要求重新测试选择器，避免重复创建。
- 规则写入回执丢失或不完整时，只有完整预期规则 + 有效 ETag 的读回才算成功；读回未知时锁住网站规则写入，保留草稿并要求重开核对。
- 延迟到达的右键选区不会覆盖已开始编辑的用户草稿。新增 Node deferred Host 回归测试，保持共享 SDK/Host、权限和可信页面适配器不变。
- 正式包 1.1.2 已经专项 CI 验证并同步唯一 JSON；详见下方 R2.3 验收记录。实际 Mac Chrome 安装升级、已登录 ChatGPT / 其他网站、IME/Undo/撤权在取得真实证据前仍为 NOT_TESTED。


### R2.3 双选择器同区域安全与正式 1.1.2 发行（2026-10-16）

- 配置第三方网站时，**按钮容器应选择包含目标编辑器的上层内容区域**。必须唯一匹配，且所选编辑器位于容器内部；若网页 SPA 使编辑器漂移到其他区域，按钮隐藏而不是猜测写入。写入前再次核验 DOM 连接、焦点和当前目标，失效时保留旧草稿并尝试复制提示词。
- [Prompt Shortcuts R2.3 CI Run 38910587019](https://github.com/shopable-ai/opendesk-browser/actions/runs/38910587019) 整体 SUCCESS，**Node 84/84、共享工具 6/6、语法、来源门禁、候选打包、正式 UI 模拟 Host Chromium、网页真实 DOM Fixture Chromium 均通过**；CI Fixture 仍不是安装到用户 Chrome 的真实网站实测。
- 官方单一 JSON 版本 **1.1.2**，GitHub 同源发行 [4bdbbd3](https://github.com/shopable-ai/opendesk-browser/commit/4bdbbd332c237be3cbc77ad5de6028a2378b0bc8)；**73,205 字节**，SHA-256 `36277a82becc4a200b5ac5ccfb5875e11054bcf6d6d2ac378be30c08bda9b02f`，`--check-project=PROJECT_PACKAGE_MATCH`。Chrome 固定可信适配器升级仍需浏览器加载新版构建，不能只导入 JSON 来更新。
- Claude / Gemini / ChatGPT 已登录真实编辑器、Mac Chrome 实装身份、中文 IME、Cmd+Z、SPA/撤权仍为 **NOT_TESTED**；不得因为模拟回归通过就给出 95+ 实机产品评分。详见唯一 [交接文档](../../../docs/framework/workstreams/prompt-shortcuts-r12-ui-handoff.zh-CN.md)。

### R2.7 JSON 导入导出、网页提示生命周期与即时同步（源码候选 1.1.5）

- **正式 Sandbox 导出**：在新建按钮右侧选择「导出 JSON」，使用已批准的 `user.export` 和 `browser.downloads.text`。受信任 Host 需真实确认一次下载；收到 `started:true` 只代表 Chrome 接受，不代表文件已经落盘。导出只读取已保存的 `library`，不包含 `sites`、网站选择器或授权。
- **备份契约**：`format: "opendesk.prompt-shortcuts"`、`version: 1`、`exportedAt`（ISO 8601）、`items`。保留正文、短标签、名称、自动标记、形状、启停和排序；备份 ID 在导入时全部重新生成，防止冲突。文件上限 256 KiB、最多 80 条；**真正的持久化约束是整个 library 数据项序列化后不超过 8192 UTF-8 bytes**，不能误认为每条正文各 8 KiB。
- **导入预览**：用户选取文件→检查 JSON/字段/版本/字素/总容量→默认追加并按 Unicode NFC、换行标准化及去首尾空白去重→显示可追加与跳过数量→按 ETag 重新读取并提交。替换须二次点击确认；整个库一次 `storage.set({key:'library',ifMatch:etag})` 提交、再次 `storage.get(...withEtag:true)` 回读比较。无论追加还是替换均保留 `settings` 和单独存储的 `sites`。无效文件、选择取消、预览取消不写入；冲突重新预览；未知提交结果不自动重复写入。
- **网页反馈**：确认插入成功时不显示视觉 Toast，只通过屏幕阅读器实时区域提示「已插入草稿，未发送」；插入失败但剪贴板复制成功显示「已复制，请粘贴」约 3 秒；都失败时显示可用 Esc 清除的错误提示约 5 秒。连续操作定时器防串扰，SPA、停用、卸载与销毁清理反馈和临时 DOM。原草稿、IME、Undo、真实 DOM 读回和不自动发送逻辑保持不变。
- **即时同步**：新增/编辑/排序/删除/导入/单条或全局启停均经 Host 存储提交后触发现有 `chrome.storage.onChanged`；可信网页适配器停止并刷新，不需页面刷新，不追加展开收起按钮。
- **验收等级**：新增了真实经典脚本的 Node 模拟 Host 回归测试和可信页面提示生命周期测试，但只有实际 CI 结果才能称为 Node/Chromium PASS。版本 1.1.5 正式 JSON 应由仓库 `prompt-shortcuts-r14.yml` 的验证候选自动同步；同步前原始 1.1.4 包不等于新源码。真实 Mac Chrome 安装升级/已登录 ChatGPT 中文 IME/Undo 若没有对应本版证据须标记 NOT_TESTED。禁止将过往版本的证据继承为 1.1.5 PASS。


### R2.8 跨站候选定位（源码候选 1.1.6）

- 「管理网站」→「配置当前网站」：Claude、Gemini、DeepSeek、Perplexity、Grok 的精确 Origin 会尝试固定源码中的语义 CSS 候选（`data-testid`、富文本编辑器、`#chat-input`）。现有可信 `prompt.page.check` 检查当前真实网页的唯一可见容器、唯一可编辑输入框、容器包含关系和 Origin。通过后只预填表单，用户主动保存后才启用。
- Grok 的 `x.com` 规则仅限 `/i/grok`，不会作用于 X 的普通帖子编辑器。Cursor Web（`cursor.com/agents`）暂缺可核实的 DOM 选择器，继续使用网页点选，不把网址本身当作可验证支持。
- 自动定位失败保留原有双目标点选；异步 Host 回执不能覆盖用户修改后的草稿；检测不写入存储，也不自动发送。
- **定位通过不代表实际插入通过**。需要在安装的 Mac Chrome 真网站账号会话中验收富文本、多行、中文 IME、Cmd+Z、SPA、权限撤销。没有创建第二套 Host，也没有扩大站点权限。
- 参考：Playwright Locators、danslabs/Claude.ai-CSS-fixes、afumu/openteam Gemini site adapter、ops120/grok-brain。

### R4.1 顶部操作栏（2026-10-23，正式候选 1.1.15）

- 经官方完整性验证的已安装工具，标题、新建和「导入与导出」同处宿主右上角，34px 透明图标按钮、4px 间距；无常驻彩色方形背景，Hover/聚焦有反馈。正常列表中不再另占一行导入导出按钮。
- 导入、导出菜单及文件选择器仍在沙箱里，必须由用户直接点击菜单项才能执行，保留原有安全校验和失败回执。不是新增授权，也不触发文件的自动读写。
- 未取得官方导航验证时继续显示工具内按钮，避免旁加载/预览因缺少宿主入口而不可操作。交互模拟参见 `preview/index.html` R4.1；真实 Chrome 验收需单独执行。

### R4.2 标题栏密度、首页精简与旧包同步状态（2026-10-23）

- 正式 React Host 源码移除重复且未闭合的设置 `ToolField`；现有设置和次级入口各保留一个唯一节点。此项是源码缺陷修复，不能在未实际编译时宣称 BUILD_PASS。
- 已安装且获得原官方导航准入的工具，单一宿主标题栏直接显示返回、标题、新建、导入导出、共享 AI 对话入口及「更多」。桌面按钮区域按当前源码为 30×30px、图标 17px、gap 2px；粗指针区域为 44×44px；设置/卸载等低频操作收进可信「更多」，危险卸载仍使用原确认。普通未核准工具保留沙箱操作入口。
- Prompt Shortcuts 首页取消可见的「N 个 · M 个启用」与内置示例提示行，不保留占位高度；`ps-count` 仍为屏幕阅读器状态，业务数量未删。关闭导入菜单时焦点恢复到可见操作。纯文字条目隐藏图片尺寸选项，图文混合时仍可调整。
- [R4.2 完整交互预览](preview/index.html) 延续原有模拟及数据场景，增加顶部更多、共享 AI 入口位置和窄宽度按钮密度。该页不发送 AI 请求，不代表 Mac Chrome 安装/权限实测。
- **本轮已完成包同步**：`tool.config.json` 与唯一 `prompt-shortcuts.opendesk-tool.json` 均为 `1.1.15`，已通过现有打包器的候选→测试→`--promote-from`→`--check-project`。这证明源码与包同源；实际安装版本、数据升级及原生验收仍须单独取证。
