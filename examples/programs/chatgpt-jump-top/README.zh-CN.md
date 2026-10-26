# AI 对话滚动导航 · AI Chat Scroll Navigation

## R1.3.4 增量（2026-10-27）

- 当前正式可导入包为 **0.4.6 / revision 7**，保留独立 Program ID `opendesk.ai-scroll-navigation`。后续历史章节不能代替本候选证据。
- 首次使用 Page 网页增强时，需在 Chrome 的 OpenDesk Browser 扩展详情中允许用户脚本。安装后在批准的网站直接运行；不需要再到产品详情启用一次。`E_USER_SCRIPTS_UNAVAILABLE` 时先核对这一 Chrome 权限开关及其真实读回。
- 从「扩展 → 已安装 → AI 对话滚动导航 → 详情」填写精确 HTTP(S) Origin 和路径前缀，进入原 Installer 审阅。Chrome 网站授权可能覆盖整个主机；原生匹配路径、明确端口与可信 Host 仍约束程序执行。HTTP/HTTPS、localhost、127.0.0.1 和不同端口分别处理，禁止通配 Origin、查询或片段作为路径范围。
- 自定义网站候选由可信 Host 从当前不可变源码生成，使用 `1_000_000_000..2_147_483_647` 的保留 Revision 区间和 `+site.r…` 版本。相同输入生成相同身份，碰撞失败并保留旧安装；官方冻结包不得使用该区间。Revision 是不可变键，不以数值决定升级顺序。
- 新网站审阅成功后打开或刷新目标页面，点击「网站适配」，选取主区域与滚动容器，可选消息和锚点，分别测试顶部、底部，再保存并核对可信读回。配置与安装授权分离；并发冲突及未知保存需先主动重新读取。收缩授权保留休眠规则数据，不能借旧规则恢复执行权限。
- 扩权拒绝或原生注册失败保留原安装；旧确认、停用、撤权和未知状态不能显示成功或自动恢复。升级不扩权时复用合法安装授权；新增范围仍须原审阅和 Chrome 权限。
- **本阶段核心闭环已在 Mac 有窗口 Chrome 的隔离 Profile 跑通**：原安装器安装 r7 → 审阅并更新本地精确网站范围 → 可视选取对话区域和滚动容器 → 上下测试 → 可信保存并读回 → 刷新恢复双按钮及边界禁用态 → 正常停用清理和恢复。测试页面为 `http://127.0.0.1:43111/demo-form.html`；主区域选取结果 `main > div > div` 对应 `.lab-content`，滚动容器为 `html`，消息选择器为 `.unit`。恢复后配置值与 ETag 均保留。
- 定向 Node、真实 Builder、包哈希与本次原生核心证据分别记录在 [R134 增量台账](../../../docs/framework/workstreams/ai-scroll-navigation-r134-delta.json) 的 `coreContinuation`。复用已有 production 快照，未替换日常扩展，也未重测未变输入。本次网站扩权升级发生于首次规则保存前；保存后的升级保留沿用未变的定向保护测试，不新增原生通过声明。**三站真实长对话、完整发行验收仍未完成，官方目录继续 `publication=blocked`；边缘矩阵延期。**


## R1.3.2 配置增量（2026-10-26）

- 正式源码目标版本 **0.4.2 / revision 3**；仅已批准安装的独立 ID `opendesk.ai-scroll-navigation` 可读写本程序网站配置。原有 0.4.1/r2 不因源码变化而自动获得 `page.config` 权限，更新需在原 Installer 审阅能力差异。
- 以页面右下角「网站适配」入口选取对话区域及真实滚动容器；上下分别测试，保存使用原 Installed Page Broker 的身份、文档、原生注册和授权读回，并使用 CAS/ETag 与保存后重读。
- 规则作为惰性 CSS 字符串按 Program ID 持久保存，支持刷新后恢复、冲突报错、重复保存确认及升级保留；不能把规则或网站存储当作授权。
- **新增任意 Origin 的自动打包、扩权审阅与安装闭环仍未实现**：现阶段 UI 只能保存已通过冻结 pageRules 获批的网站规则。要支持新网站，先由原 Installer 完成包含该 Origin 的受审阅升级，不能靠新增规则或 `<all_urls>` 绕过。
- 本段记录源码设计和本轮变更范围，并非 Chrome/Mac 原生验收结论；应以对应提交的 CI 与包哈希结果为准。正式目录继续 `publication=blocked`。

## 历史：R1.3.1 安装与状态（2026-10-26）

- **正式包与入口**：[ai-scroll-navigation.opendesk-page.json](ai-scroll-navigation.opendesk-page.json)，ID `opendesk.ai-scroll-navigation`，版本 **0.4.0 / revision 1**。在 OpenDesk「扩展 → 导入」选择此文件，审阅身份、版本及 ChatGPT、DeepSeek、Gemini 三站范围后安装；安装后归「网页增强」，由原 Page Authority 管理。
- **独立使用**：无需安装 Prompt Shortcuts。旧 `opendesk.chatgpt-jump-top` 与新 ID 分别管理，旧安装和网站授权不会自动转移；可在原管理入口主动停用或卸载旧安装。
- **已有证据**：指定冻结 Browser 候选已通过真实 Chrome 安装、范围审阅、注册读回、停用/恢复、更新、撤权清理、新旧 ID 独立安装与卸载；完整浏览器重启后仍保留同一 installationId 和停用状态。候选身份与原始证据见[四产品工作记录](../../../docs/framework/workstreams/ai-four-products-r125-local-20261026.md)，不代表当前 main 整包验收。
- **本轮内容操作**：同一冻结 Browser 候选、原 0.4.0/r1 在已登录 ChatGPT 的既有长回复中显示导航；实际点击后分别看见当前内容区域的首节和末段。此证据限于该区域的两个方向，不代表整段对话、全部内容类型或三站完整验收；与本机 Mind Map 新身份的两轮开关共用同一页面。
- **当前剩余**：DeepSeek、Gemini 的真实长对话导航仍为 `BLOCKED_CONTENT / NOT_TESTED`。官方目录继续 `publication=blocked`，暂不开放目录安装；上述原包导入入口不等于官方发行已批准。

下方 R1.2.1 及更早章节保留当时的源码与验收状态；其中“新包待构建”“安装未验证”等结论已由本节和工作记录中的增量证据更新。

## 历史：R1.2.1 业务源码（2026-10-25；当时新身份未正式安装验收）

- **独立 Page Program**：代码自带滚动导航；不再要求 Prompt Shortcuts 安装、启用或提供运行时。安装来源仍为 `examples/programs/chatgpt-jump-top/`，避免破坏现有路径引用。
- **新 Program 身份（源码）**：`src/main.js` 与 `package.json` 现一致为 `opendesk.ai-scroll-navigation`，项目版本 `0.4.0`。旧 `opendesk.chatgpt-jump-top` 不是同 ID 升级，原 `0.2.0` 正式包仅是历史安装制品。已查阅原 Page 安装合同，跨 ID 没有已证实的授权迁移；必须由用户在「扩展」审阅旧安装并明确停用/卸载，再经独立的网站权限审阅安装新 ID。**任何旧授权都不自动转移，新包仍待同源构建及核验。**
- **按站点单独适配**：ChatGPT 沿用原长内容识别及共享回复操作组；DeepSeek 只在经过固定路径和操作栏绑定规则的对话中提供长回复操作；Gemini 仅尝试在确定对话滚动容器后提供整段对话顶部/底部导航，**不接管未验证的单条回复工具栏**。未识别结构安全隐藏。
- **五项行为**：`regionTop`、`regionBottom` 为同一长内容两方向；`conversationTop`、`conversationBottom` 为整段对话；`floatingTop` 与 `conversationTop` 复用一枚顶部浮动按钮，不能创建第二枚。默认无需另加配置开关。
- **新旧脚本共存防护**：旧冻结包具有 `[data-opendesk-ui-owner][data-od-id="opendesk.chatgpt-jump-top.lifecycle"]` 生命周期宿主，改名后的源码识别它及旧回复导航的活动 ShadowRoot，在存在旧活动导航时**主动退出**；同一新身份的多个代码实例采用活体 DOM owner 仲裁，并在点击时重检。保留旧 `data-opendesk-chatgpt-jump-top` 回复标记供既有 Mind Map 寻址，新 `data-opendesk-ai-scroll-navigation="reply"` 明确标识现代实例。仅承担页面级兼容，不改变旧安装注册/撤权/用户授权。
- **权限**：Page `pageRules` 仅为 `chatgpt.com`、`chat.deepseek.com`、`gemini.google.com` 三个明确 Origin 的顶层 `USER_SCRIPT`。从旧版新增 Origin 属于扩权，必须走现有 Page Authority 与用户审阅；代码不会替安装器授予权限。
- **真实交付状态**：新 ID 只是**已提交的业务源码**；当前环境没有用户 Mac 工作区，也不能运行项目校验器或 Node 单测。目录历史 `chatgpt-jump-top.opendesk-page.json` 仍为 **0.2.0 / revision 2 / ChatGPT-only / 旧 ID**，绝不视作 0.4.0 可安装包。需由原有 `build:program`、`scripts/build-page-install-package.mjs --title "AI 对话滚动导航"` 与完整哈希校验生成**不同的新正式包**，经过原有独立安装确认与三站权限审阅，核验停用、撤权、旧 ID 退出与 Mind Map 共存。新旧安装迁移状态 `MIGRATION_REQUIRED`，上述真实 Chrome 项目一律 `NOT_TESTED`；不得虚构新包 sourceHash、授权转移或 `MULTI_SITE_VERIFIED`。
- **扩展中心搜索**：新包安装时的正式标题应明确使用「AI 对话滚动导航」。现有已安装 Page 的搜索读取 title、programId 和由 pageRules 映射的网站字符串；**npm description 不会自动成为已安装 Page 的搜索内容**。故在 Extension Center owner 修改投影前，「回顶」「长回复」等别名搜索仍有缺口。本轮不冒险重写另一 owner 的通用扩展列表。

## 历史：ChatGPT Jump Top 的原始单站证据

# ChatGPT 长内容回顶 · OpenDesk Page 增强

**日常产品入口已接入[提示词快捷按钮](../../sidebar-tools/prompt-shortcuts/README.zh-CN.md#chatgpt-长内容回到开头)**：安装并启用该工具、打开「网页按钮」后，由浏览器扩展固定适配器在进入或刷新 ChatGPT 时自动运行，无需另装或手动 Run 本项目。本目录继续保存唯一滚动算法、独立诊断入口及历史 Page 包；下文七次点击属于此前独立 USER_SCRIPT 开发证据，扩展自动运行的新增结果见[集成记录](../../sidebar-tools/prompt-shortcuts/evidence/chatgpt-jump-integration-20261020.json)。

仅面向 `https://chatgpt.com/*` 的顶层 Page USER_SCRIPT，复用 `@opendesk/ui` 和现有 Page Authority。2026-10-20 已在真实已登录 ChatGPT 页面通过七条核心点击操作；正式安装、升级和 production 扩展验收仍为 `NOT_TESTED`，独立 95+ 评分为 `NOT_SCORED`。

## 按钮在哪里

- 长用户消息：在原生“复制消息 / 编辑消息”操作组旁显示回到开头箭头。
- 长助手回复：在对应回复的原生“评价回复 / 复制 / 重新生成回复”操作组旁显示箭头。正文与操作栏可以是独立兄弟节点，绑定不能跨到第二条助手回复。
- writing block：在原生 `header` 中，紧邻 `Open editor / 打开编辑器`。点击原生“打开编辑器”进入独立查看器后，箭头位于含 `Close viewer / 关闭查看器` 的工具栏；原生打开、关闭功能保持原样。
- 其他可明确关联的长内容：优先使用原生按钮的唯一 `aria-controls`；否则只接受同一局部容器里唯一的内容节点与唯一工具栏。候选包括 `pre`、消息正文、可编辑区域和确实自身滚动的 `textarea`。没有打开编辑器按钮时，使用同栏最后一个原生操作按钮作为插入位置。

按钮为 34 × 34px，继承页面颜色，使用原生 `button`、中文 aria-label/title 和可见键盘焦点。插入位置与滚动目标分别保存，保留原生 span/tooltip 包装节点的所有权；不依赖 CSS 类名、SVG 内容或资源哈希。新增消息操作栏识别依赖精确中文 aria-label，其他语言或网站 DOM 变化可能不显示按钮。

各独立长内容最多一枚按钮。目标或操作组缺失、关联歧义、隐藏、inert、弹窗、没有有效滚动距离的区域均退出。普通 `aside` 仍排除；仅允许包含唯一直接 `header`、唯一编辑区域、唯一“关闭查看器”操作，且具有 aside 内部纵向滚动容器的 writing viewer。其 header 不作为全局对话工具栏。

全局回退仅用于可明确识别的对话顶部工具栏，目标为第一条对话消息。含“打开编辑器”却无法解析目标的工具栏不会被当成全局工具栏。此回退有组件测试，本次七条真实点击未单独验收它。

## 点击后到哪里

目标为绑定内容的真实布局起点，工具栏的吸顶视觉位置不能作为正文起点。普通内容滚动最近的实际纵向滚动容器；自然高度的 `contenteditable` writing block 或 viewer 正文滚动其合格祖先。确实自身滚动的编辑器只滚自身；溢出但不可滚动、被裁剪的编辑器及不能确认自身滚动的 `textarea` 拒绝执行。

普通内容先以 `目标矩形.top − 滚动口.top + scrollTop − 12px` 计算绝对落点，并限制在有效范围。随后读取落点处 Sticky/Fixed 元素的真实矩形，按横向交集、首行高度和实际遮挡最多做一次同步补偿。不会预测下方尚未吸顶的工具栏，也不会将其他栏位的工具栏算成遮挡。两次操作均为 `instant`，由一次点击完成。

目标本身为滚动容器时只将它的 `scrollTop` 设为 0。实际查看器为内部 div 滚动，内容起点滚到局部工具栏下方；不会无条件将整页滚到 0。保留其他容器与横向滚动值，不写入正文、输入、草稿、光标、选区或编辑状态，不采集或上传对话内容。

## 动态页面与清理

React 替换工具栏、内容、整个 `main`，或仅移除注入按钮时，重新建立绑定。点击时再次核对身份，旧按钮不能操作新内容。观察相关 DOM/ID、原生操作 aria-label、消息身份属性变化，以 120ms 合并刷新；忽略自身插入和无关侧栏变化，无滚动事件扫描。存在显式 ID 关联时，每轮只建立一次 ID 索引；没有关联时不扫描全页 ID。

同模块重装先清理旧实例。事件、Observer、延时和宿主沿用受管生命周期；Stop 清理保留组件级证据。真实 Authority 停用、撤权及卸载仍为 `NOT_TESTED`。本次未另做真实切换对话、React 重绘矩阵或关闭 viewer 后重新挂载箭头检查。

## 开发与现有安装包

从仓库根目录执行定向校验；环境测试入口已导入业务单测，使用一个入口即可：

```bash
node --check examples/programs/chatgpt-jump-top/src/conversation.js
node --test tests/environment/chatgpt-jump-top.test.mjs
node scripts/validate-program-project.mjs examples/programs/chatgpt-jump-top
```

需要新的脚本候选时使用原编译器 `npm run build:program -- examples/programs/chatgpt-jump-top`，不必为文档收尾重建。已验证候选的 sourceHash/buildHash 为 `b0495ecffa05106cc93b942ad4d4b649890fd03e025b5af00be629ff31c6a303`，编译状态为 `BUILT_UNVERIFIED`、`installable:false`；`buildMode:production` 仅指业务脚本静态编译，不代表 production 扩展验收。

本地项目入口仍为 `opendesk browser dev "$PWD/examples/programs/chatgpt-jump-top"`，随后通过界面明确 Run。本次真实操作使用「开发 → 直接编辑 → JavaScript → Page·当前网页 DOM → 运行」执行最终候选，并获得 Page `active` 返回。界面未提供该次 Page 的精确 `previewId/sourceHash/documentId`，不能用旧 Controller 的 runId/SHA 补作收据。

现有离线包 [`chatgpt-jump-top.opendesk-page.json`](chatgpt-jump-top.opendesk-page.json) 保持身份 `opendesk.chatgpt-jump-top`、版本 `0.2.0`、revision `2`，sourceHash 为 `2f8c1667e0047e4c6a7152b5da121f0d1438abdfa470b139db9cc30c911cc791`。**旧包不含本次修复，本轮未晋升安装包。** 它由原 `build-page-install-package.mjs` 生成，不携带安装授权或运行证明；后续安装/升级仍走「扩展 → 导入」及原有审阅/Authority 流程，提交源码不会自动升级浏览器。

## 真实核心操作证据

[`evidence/development-20261020.json`](evidence/development-20261020.json) 保存最终候选与源码摘要、七份原始 JSON 的脱敏数值与文件摘要、操作方法、开发环境身份及限制。以下 scrollTop 均属于对应滚动容器，单位 CSS px：

| 操作位置 | 点击前 → 点击后 scrollTop | 内容顶部 | 首字符 top..bottom | 遮挡底边 |
| --- | --- | --- | --- | --- |
| 长用户消息 | 390 → 72 | 64 | 76..104 | 52 |
| 第一条长助手回复 | 5614 → 716 | 64 | 67..86 | 52 |
| 最后一条长助手回复 | 16832 → 2973.5 | 64 | 67..86 | 52 |
| writing 中部 | 10953 → 5142 | 115 | 117..145 | 115 |
| writing 底部 | 16023.5 → 5142 | 115 | 117..145 | 115 |
| viewer 中部 | 5945 → 0 | 64 | 66..94 | 52 |
| viewer 底部 | 10947.5 → 0 | 64 | 66..94 | 52 |

七次均使用 AXPress，事件报告 `trusted:true`。独立 DOM Range 测首字符，`elementFromPoint` 确认它可见且属于目标；输入、DOM 选择区、横向和其他真实滚动容器基线均未变化。测试页签 composer 当时为空，没有专设非空草稿或非折叠选区测试；原有非空草稿页签保持未触及。

中间候选曾一次报告 `otherScrollsUnchanged:false`，未捕获具体 delta，后续 detail 为 `[]/true`，根因未定位。最终诊断将基线限定为真实滚动容器并在 pointerdown 立即采集，最终两个 viewer 场景均通过；不据此声称已查明或修复该异常根因。

既有定向验证为 **55 PASS、0 fail**，项目校验为 `AUTHORING_VALID_NOT_PACKAGED`；本次收尾核对原输出与候选哈希，没有源码新变化时不重复运行。真实环境使用日常 `dist/development`，watcher/serve 客户端连接未验证；没有扩展全量构建、重装或改动其他会话输出。

[`evidence/r02.json`](evidence/r02.json) 与 [`evidence/r02-browser-layout.json`](evidence/r02-browser-layout.json) 保留旧 revision 2 及 Chromium 155 合成页面的历史范围。`tests/browser-checks.mjs` 由调用方提供专用 `about:blank` Playwright 页面，不证明登录态 ChatGPT 或 Authority 安装通过。历史 Apple event JavaScript 错误 12、测试 Chrome 未登录与 `E_NATIVE_NOT_READY` 不再代表本次七条真实点击未执行。

正式安装、升级、停用、恢复、撤权、卸载、重启与 production 扩展验收延期，均 `NOT_TESTED`；主题与专门键盘验收未测，宽度/缩放专项为 `OUT_OF_SCOPE`，独立 95+ 评分为 `NOT_SCORED`。
