# ChatGPT 思维导图 · OpenDesk 网页增强

## 状态提示优化（2026-10-20）

回复更新后，刷新图标显示圆点，悬停或键盘聚焦提示 `Reply updated · Refresh mind map`；左下角不再常驻更新文字。更多菜单保留可读的 `Refresh mind map`。加载使用独立图标，下载及导出反馈使用简短英文；读屏状态区持续挂载，刷新后恢复操作焦点。回复仍在生成时保留当前导图并提示稍后重试，不自动重放。

当前已通过定向 Node 验证，以及使用真实界面源码、模拟画布的 Chromium 组件操作检查；该源码的已安装 ChatGPT 页面升级与 VoiceOver 朗读仍为 `NOT_TESTED`，不沿用下方旧版安装结论。

## 安装与日常使用（2026-10-18 修正）

**本项目是 Page USER_SCRIPT 网页增强。** 正式 Page 安装包的格式为 `opendesk.page-install.v1`，本机文件为 `artifacts/chatgpt-mindmap-page-install-20261018/chatgpt-mindmap.opendesk-page.json`。在 OpenDesk「扩展 → 导入」选择它，查看名称、身份 `opendesk.chatgpt-mindmap`、版本 `0.2.0 / r1`、网站 `https://chatgpt.com/*` 及读取和修改网页的权限，然后确认安装。只有返回有效安装授权和 Chrome 注册回执才显示安装完成；无需进入「开发」，也无需安装后再次通用启用。用户主动停用的版本仍保持停用。

安装完成后，打开或刷新 ChatGPT，在已有助手回复底部点击导图按钮显示真实 XMind。再次点击导图按钮，或点击「返回完整原文」，恢复完整正文；关闭后可以重新打开。**日常只需 Chrome、原 OpenDesk 扩展和 ChatGPT，无需本项目 CLI、Provider、VS Code 或到开发页 Run。** 本机当前使用仓库原 `dist/development` 和已有 `npm run dev` watcher；持续开发连接属于本机开发环境，不是 Page 安装包的一部分。

| 用途 | 文件 / 入口 | 持久安装 |
| --- | --- | --- |
| 普通安装 | `.opendesk-page.json`，从「扩展 → 导入」审阅并确认 | 复用原 Page Authority，按批准网站自动运行 |
| 源码编辑 | `opendesk.program-draft.v1/v2`，在「开发」导入 | 导入草稿不安装；可通过明确安装动作进入原机制 |
| 本地调试 | 「开发 → 本地项目」，连接项目 Provider 后运行 | 临时预览，不自动等于持久安装 |

`program.opendesk-draft.json` 是开发草稿，`artifact.json` 是构建回执，`program.js` 是源码；三者都不是供扩展直接安装的 Page 包。`.opendesk-tool.json` 属于 Sidebar 应用，不适用于本项目。安装包不包含 Provider 或 Native 授权。

从已验证的同一份编译草稿生成离线安装包：

```sh
node scripts/build-page-install-package.mjs \
  --input artifacts/chatgpt-mindmap-real-page-20261018/install-current/program.opendesk-draft.json \
  --out artifacts/chatgpt-mindmap-page-install-20261018/chatgpt-mindmap.opendesk-page.json \
  --revision 1 --title 'ChatGPT 思维导图'
```

本机包保持原 r1 源码 SHA-256 `226be2ccdc53a1990f3838e59766e69a06a98146bf0d41efebd05db50162e59e`，不重新生成身份或制造升级；范围仍为 ChatGPT 顶层 `USER_SCRIPT / document_idle`。资源仅用于本机验证，生产再分发许可限制见下方历史记录，不把本机可安装等同于公开发布。

本地项目预览需要已配对 Native 和该项目 CLI Provider：

```sh
opendesk browser dev --read-only /Users/shopme/Documents/workspace/opendesk-browser/examples/programs/chatgpt-mindmap
```

### 上一轮证据结论更正

原始 [`tests/mac-opendesk-basic-20261018.json`](tests/mac-opendesk-basic-20261018.json) 保持不变。它证明的是扩展读取开发草稿并跳转编辑器、既有 r1 自动注入，以及本地项目临时预览；**没有证明从扩展导入正式 Page 包并完成安装**。本节替代此前将草稿入口与安装体验混写的说明。原安装证据仍为 [`tests/mac-install-standalone-20261018.json`](tests/mac-install-standalone-20261018.json)。本轮新增安装链路和复用绘图证据的范围，分别记录于 [`tests/mac-page-package-install-20261018.json`](tests/mac-page-package-install-20261018.json)，不修改原始证据。

私人截图、回复正文和原日志只留本机忽略目录；不发送 ChatGPT 消息。本轮不测试导出、主题、全屏、缩放、尺寸、压力或对抗。Native 完全断开及 production 包不在本轮验证范围，标记 `NOT_TESTED`。

### 历史独立 MV3 记录（不属于当前交付入口）

以下保留此前候选和失败证据。当前需求使用 OpenDesk 网页增强；不继续独立包装开发、安装或验收。

新增薄包装复用 `src/answer-registry.js`、`src/view.js`、原 XMind 子帧协议及三格式导出。业务位于静态 `ISOLATED` content script；扩展 relay 只认证并转交私有 MessagePort；原绘图代码位于无扩展 API、无同源权限的 sandbox。四份原始资源仍先核对固定 SHA，输出记录唯一原有 timer guard 转换及产物 SHA；没有远程代码或开发服务器。

```sh
node examples/programs/chatgpt-mindmap/scripts/build-standalone.mjs --local-validation-only --out artifacts/chatgpt-mindmap-standalone/my-local-validation
```

输出目录必须是仓库已忽略的 `artifacts/` 下尚不存在的目录。通过 Chrome 支持的本机方式：打开 `chrome://extensions` → 开发者模式 → 加载未打包的扩展程序 → 选择生成目录；然后刷新 ChatGPT。当前已实际加载的候选目录为 `artifacts/chatgpt-mindmap-standalone/executor-validation-20261018-final/`，独立扩展 ID `kagejdafejipmdciobcmapdobmiohopf`，隔离 Chrome `155.0.8059.39`，其中未安装 OpenDesk。

上述目录及厂商资源仅供本机验证，不能作为允许分发的安装包。默认构建会以 `E_XMIND_LICENSE_BLOCKED` 拒绝；缺少 [`tests/xmind-license-review-r396.json`](tests/xmind-license-review-r396.json) 所列资源的有效生产再分发许可及原审阅链批准。未提交 vendor runtime，未修改批准标志或移除资源校验。获得许可后仍需完成发布打包准入和对应真实浏览器验证，不能把本机加载成功当作商店发布成功。

## 已登录真实页面续修（2026-10-18）

当前 Mac Chrome 155.0.8059.84 的已登录页面已改用搜索单元、助手标题标记和 DIL 正文，旧消息 role 属性不存在。适配器现在识别这一路结构，只绑定当前 turn 的直接助手操作栏，排除嵌套用户操作栏；正文或操作栏有歧义时不挂载。搜索消息身份与 turn 完成状态继续接入原 registry 的更新和清理。

真实回复底部原操作栏最右侧的导图图标可打开本条回复的原 XMind；区域顶部保留原工具栏。「返回完整原文」后可由同一图标再次打开。默认暗色，用户主动选择的明暗主题在关闭/重新打开和新文档中保留，独立于网页主题。两条不同已有回复已实际下载 PNG 1x、XMind 和 Markdown 大纲；ZIP CRC、36/32 个节点、14/12 份备注、大纲内容及 PNG 完整画布检查通过。较长回复 A 的导出对应当前有上限的导图，原文保持完整。

上述结果来自原目录 CLI 的当前源码开发运行，源码 SHA-256 `226be2ccdc53a1990f3838e59766e69a06a98146bf0d41efebd05db50162e59e`；不是下节历史 r2 安装指纹。当前源码正式安装/升级 **NOT_TESTED**，Markdown 原文仍因缺少可信来源 **BLOCKED**。没有修改资源许可、VIP 或生产准入。证据索引见 [`tests/mac-real-chatgpt-20261018.json`](tests/mac-real-chatgpt-20261018.json)；私人对话截图和下载原文件只保存在本机忽略目录 `artifacts/chatgpt-mindmap-real-page-20261018/`。

本机另发现全局旧 Native 仍按 516 KiB 拒绝约 4 MB 固定资源源码；经原 `browser update` 更新到已有维护版本后，原扩展 ID 与配对保持一致，目录运行成功。一次打开导图状态下的换版清理超时已保留失败证据；按回执结束旧文档并重连原侧栏后恢复，没有重放未知动作。该清理异常未作为正式生命周期 PASS。

## 历史隔离 CFT 的 Page Authority 安装（2026-10-18，旧源码）

原业务目录经现有 `build:program`、草稿包导入与 Candidate → Verification → Available → Installed，正式安装为 `opendesk.chatgpt-mindmap:r2`。安装 ID `4faafc60-cfab-4c97-b547-418b61c9af7f`，授权 generation 4，Chrome 注册为 registered；「扩展 → 网页增强」可检索。范围仅 `https://chatgpt.com/*`，顶层 `USER_SCRIPT`、`document_idle`，网站访问已满足。升级验证期间主动暂时停用 r1，安装 r2 后恢复原自动运行状态。

本轮已安装 r2 的源码与 `program.js` SHA-256：`87df82aed270f60e02fdcb82fba14998bb681335b9a13dca230c9d7fe499f969`；`artifact.json` SHA-256：`9d3d4abacc8b8fe35462aae727084893962282d3ca78982b64c6e9f8f71644f9`。固定 XMind 资源 SHA-256：`2c852069020e732a23be82c161ddcc3df6543b1c493368fb813bf75f862a2df0`。构建器本身的 BUILT_UNVERIFIED 状态未被改写；正式安装证据来自真实 Authority 和 Chrome。详细原始证据保留在本机 `artifacts/chatgpt-mindmap-installed-r396-20261018/installation-evidence.json`，工作记录保留在本机 `docs/framework/workstreams/chatgpt-mindmap-installed-r396-20261018-01a14a9e.md`；两者按仓库忽略规则不随本次提交分发。上述原生证据仅对应所列 r2 指纹，后续合入的独立浅色/深色导图主题改动不在该原生证据范围。

本任务目录 CLI 退出后，在 **OpenDesk MindMap R396 CFT** 的两个新 ChatGPT 文档中自动激活。两轮均原生点击入口，显示真正中文 XMind 与层级，再点击「返回完整原文」恢复全部正文和列表；打开前与恢复后的可访问正文逐项一致，两次资源均已 retired。私人会话地址、原始可访问正文和截图仅保留在上述本机证据目录。窗口保留；Native 最终 doctor 为 connected=true。

最小修复：恢复返回按钮文案；通用验证器补受管资源生命周期，同文档 History 路由变化继续核对真实 Document、同源及当前批准 URL。业务定向测试 19+7、运行时受影响测试 52 均通过。最终 r2 采用新文档验证；旧会话刷新恢复、登录会话、重启、远端/生产发布、全量回归及高级矩阵均 `NOT_TESTED`。下文旧阶段阻塞和历史证据保留，不代表本次安装状态，也不据此改变资源许可或远端发布准入。

## 原目录 + opendesk-dev 最小验证（2026-10-17）

当前原目录已声明公开 `pageFrames` 的 `xmind-runtime`。在仓库既有依赖已安装的环境，先执行一次：

```bash
cd examples/programs/chatgpt-mindmap
npm run prepare:local
opendesk browser dev "$PWD"
```

`prepare:local` 只用已有 esbuild 生成本机固定资源，不生成供手工粘贴的 program.js；原始参考资源和批准/安装状态不变。生成的 `assets/xmind-runtime.js` 与 `.opendesk-local/` 不提交。修改子帧源码或固定资源后需要重跑准备；普通父页面 UI 源码保存交给目录 Provider 自动准备，仍须在工作台明确点击运行。

**2026-10-17 续修：真实原目录流程两轮通过。** Resolver 现按公开 Page 合同冻结固定资源（最多 4 项、单项 5 MiB、合计 6 MiB），复用原 builder 包装；普通源码仍用 384 KiB 输入预算。真实资源为 4,067,627 字节，首轮包装源码约 4.22 MB。Node 与 Go 维护源码的固定源码合同均已对齐现行 Page 包装上限 38,281,216 字节；仍使用原分块、SHA、冻结复核与身份绑定。更正旧判断：64 KiB 输出分支仅限 Controller，既有 builder 本就支持 `pageFrames`。

本轮使用仓库既有打包器生成的当前 CLI，保持目录连接；官方脚本构建并更新 `mindmap-local-01a14949` 隔离 Native，原 CFT 隔离扩展也已更新传输合同。全局旧 CLI 和日常扩展未替换。Native 曾在打开文稿目录时阻塞；重启当前用户授权服务、重载本任务扩展后，目录已登记且真实工作台准备、主动 Run 均成功。此系统恢复操作不是正常开发的必需步骤。

第一轮真实运行 Hash `e5ea038e66c93aabe6df451630aa1f4d60b426c5896a68dea8d3a029a1c951ea`。随后仅将关闭按钮改为“返回完整原文”；保存后第二轮 Run 复用自动准备产物（构建 0 次），最新 Hash `234efec852ffdc4cda270c71b1e6b521476ddc2902c7a04d7fc1ac346507ca51`，真实界面已显示新文案。两轮均原生点击最新中文公园计划下方的“思维导图”，显示真正 XMind，关闭后完整原文恢复；49 项原生 AX 正文、标题、列表标记与运行前一致。Node 定向测试 50 项、业务定向测试 17 项及 Go 维护源码 Source/Frozen 测试通过。详细身份、截图和必要运行条件见[续修记录](../../../docs/framework/workstreams/chatgpt-mindmap-local-project-capacity-20261017-01a14969.md)。仅为本地开发主流程验证，正式安装、production/F3/ZIP 等仍为 `NOT_TESTED`。

前轮曾生成中文计划但未进入目录业务运行，原记录保留于[前轮工作记录](../../../docs/framework/workstreams/chatgpt-mindmap-local-project-20261017-01a14949.md)。下方手工构建流程及成功截图属于历史路径，不能替代本轮目录流程证据。

## R3.9.6 · 最新状态与续接（2026-10-17）

本地独立 Mac CFT 的真实 ChatGPT 回复已通过真实 OpenDesk 开发工作台和既有固定资源通道显示真正 XMind，并原生进入导图全屏。当前图有 18 个 topic，中文可见；这仅证明实际绘制及进入全屏，不代表核心功能完成。原文同一 DOM 节点的完整 HTML/text 仍保留但被隐藏，不能据此宣称关闭恢复通过。

**最新用户反馈优先处理：按钮应放入本条回复的官方操作组；现在关闭后无法再次打开。** 下一轮将清楚可见的“思维导图”文字开关放入 `[data-assistant-message-actions][data-message-actions][role="group"]`，与官方复制等按钮同一位置。依据稳定 data 属性及回复作用域定位，不依赖混淆 class 或会随语言变化的 `aria-label="回复操作"`。先修复普通和全屏状态下的“打开→关闭→再次打开→再次关闭”，同步开关状态并恢复同一回复的完整原文及可见性。随后修复真实三级列表被合并成长节点的问题，再验证折叠展开、缩放与全屏切换。

先完成核心使用闭环，允许在开发环境测试，不新增生产候选、生产验收、许可搜索或边缘安全矩阵。现有静态扩展仅用于本地调试，正式 Program 仍 `BUILT_UNVERIFIED/installable:false`；不发布。下一轮直接复用当前有效资源通道，避免为业务 UI/解析问题重建扩展。

可直接复制的完整续接提示词：[NEXT-CHAT-R3.9.6.zh-CN.txt](NEXT-CHAT-R3.9.6.zh-CN.txt)。本地最新证据在 `artifacts/chatgpt-mindmap-r396-local-frame-20261017/` 的 `handoff-core-state.json`、`handoff-source-state.json` 和 `handoff-actual-xmind-window.png`；以下保留按钮阶段历史，不覆盖原始结果。

## 本轮实际开发方式（2026-10-17）

本轮采用 **本地预编译 → 手工导入 `program.js` → Page 当前网页试运行**。没有开启工作台的「本地项目」，也没有启动 `opendesk browser dev` / `opendesk-dev` 关联业务目录。粘贴后出现「已编译程序 · 无项目源码快照」及 SHA-256、普通输入框隐藏，属于已有只读产物展示；修改仍在本地 `src/` 完成。

这是为本轮固定 XMind 资源调试采用的临时路径，复用原有编译器和 Page UI 固定资源通道。日常开发仍推荐「本地项目 + 目录 CLI」，完整对比见 [本地项目开发指南](../../../docs/api/sidebar-local-projects.zh-CN.md#本地项目与手工导入编译产物的区别)。

本轮 builder 为 [scripts/build-local-preview.mjs](scripts/build-local-preview.mjs)。从仓库根目录执行以下命令，`--out` 必须是尚不存在的新目录；`--compiler-root` 指向已有完整编译器目录，本机本轮复用的路径如下：

```bash
node examples/programs/chatgpt-mindmap/scripts/build-local-preview.mjs \
  --out artifacts/chatgpt-mindmap-r396-local-frame-20261017/business-local-next \
  --compiler-root artifacts/chatgpt-mindmap-r396-mac-20261017/loader/build-snapshot
```

该快照是本轮本机已有资源，不是其他项目的前置要求。builder 复制业务源码到输出目录的临时项目，声明 `xmind-runtime` 固定资源，输出 `build/program.js`、`build/artifact.json`、`build/program.opendesk-draft.json` 和 `local-preview.json`。原始参考资源保持原样，产物继续标记 `BUILT_UNVERIFIED/installable:false`。

修改后须重新构建，再将**新的完整** `build/program.js` 导入/粘贴到「开发 → 直接编辑」，核对当前网页为测试 ChatGPT 会话，明确点击「在当前网页试运行」。这条路径不会监听源码并自动替换已导入程序；仅把当前业务目录接入本地项目，也不会自动添加 builder 在临时项目中声明的 XMind 固定资源。

扩展宿主与业务程序分别处理：本轮已记录的宿主沿用独立静态目录 `artifacts/chatgpt-mindmap-r396-local-frame-20261017/build-snapshot/dist/production`，用于本地调试；这不代表已进入生产验收。日常扩展 `dist/development` 和已有 watcher 未替换。业务 UI、解析与关闭问题应先沿用有效资源通道修复，不因此重建扩展或开展生产环节。

## R3.9.6 · 按钮阶段历史结果（2026-10-17）

[本轮按钮原生证据](tests/mac-button-r396-20261017.json)：独立 Mac CFT 155.0.8059.39、mock keychain、真实 OpenDesk 扩展，在新建 ChatGPT 匿名测试会话的真实回复中插入并原生点击“思维导图”。回复含准备/路线/活动/收尾四个二级标题、实际三级列表、中文、English、数字与链接；每条回复只有一个按钮，位于原操作栏旁。当前 ChatGPT 使用 `li[data-message-role="assistant"]` 与 `[data-assistant-markdown-root]`，已补充这些实际选择器及流式完成状态。

点击进入真实 Page UI 流程，返回 `E_FRAME_UNAVAILABLE`，明确显示“当前预览没有已授权的 XMind 固定资源入口，暂无法生成导图，原文已恢复。”原回复为同一 DOM 节点且完整 HTML 不变，没有残留查看器。**真实按钮/点击的开发预览验证通过；真实 XMind 转换仍 BLOCKED；正式安装、自动运行和撤权未获本轮原生验证。** 原始记录和截图位于 `artifacts/chatgpt-mindmap-r396-mac-20261017/button-native/`，结果范围不可提升为安装成功。

本次无厂商资源构建为 59,828 字节，sourceHash `1b63ecc6852b00d720a60b20d815b3f724dc6e9843fea5ef2f6dd8c92633661d`；原生复制到开发入口时仅移除末尾 LF，实际预览为 59,827 字节，sourceHash `6d38b46880a370fd18055eb5baf36cf0daf14dff1b46ac56791be4a45e6e7d78`，已与真实预览回执逐字节绑定。Program 仍为 `opendesk.chatgpt-mindmap / 0.2.0 / BUILT_UNVERIFIED / installable:false`。

以下 [前序 R3.9.6 验收记录](ACCEPTANCE-R3.9.6.zh-CN.md) 与 [前序机器索引](tests/mac-acceptance-r396.json) 保留原始候选和失败，不覆盖为本次结果。
[许可证据](tests/xmind-license-review-r396.json) 增至 22 份：polyfill 与 `babel-polyfill@6.26.0` 的完整 dist 逐字节相同；Snowbrush 与官方 CDN 的固定原文件相同，但精确构建和再分发授权仍缺失。SDK、历史 GSAP 条款、嵌入 Pako 及 NOTICE 闭包继续阻塞。原 provenance 批准字段未改，完整性检查不等于法律批准。

通用固定资源容器与公开 `createPageUI().createFrame({resourceId,data})` 已实现，复用原 Broker/Authority 和受管清理；本次沿用已冻结扩展包，不重建该能力。厂商资源许可闭包仍缺失，未加入生产厂商资源。前序停用时的 messaging 失败保留；修复源码已包含在该扩展候选，但本轮未复验停用，不能登记原生 PASS。

R395 的 19 个任务文件已安全保存在本地提交 `1fbba04d42e55574f88f20a9069308b2b835cacf`；未推送。

## R3.9.5 · 历史结果（2026-10-17）

[许可证据清单](tests/xmind-license-review-r395.json) 现在包含 16 份可离线校验的参考材料，
其中独立 JSZip 与上游 3.10.1 dist 逐字节一致。GSAP 仅有头部匹配，Pako 仅有文件级许可参考；
Snowbrush、SDK 精确构建及完整依赖/NOTICE 仍未闭合。审计校验证据完整性，不能批准再分发；
`--require-approved` 继续拒绝，原 provenance 的批准字段保持不变。

现有正式 Page 父执行槽补强了安装 ID、授权代数、Program/Revision 与执行记录的事务内核对。
这只是生产子帧加载的安全前置工作；公开 SDK 仍没有获批准的固定子帧资源加载及撤权合同。
程序仍为 `BUILT_UNVERIFIED / installable:false`。

本轮在独立 Mac CFT 的真实 ChatGPT 匿名会话发送测试提示词，收到含中文、英文、数字、链接及
三级列表的回复。该观察没有执行 Mind Map，也没有正式安装；真实 ChatGPT 产品验收仍为
`REAL_CHATGPT_NOT_TESTED`。已有 R3.9.4 真实 XMind fixture 证据按相同业务源码哈希复用。
完整范围、独立状态与阻塞见 [R3.9.5 验收报告](ACCEPTANCE-R3.9.5.zh-CN.md)。

## R3.9.4 · 当前边界（2026-10-17）

父页面继续使用原回复提取、registry 和工具栏；新增 `xmind-frame.js` 的私有 MessagePort 代理，
`xmind-frame-child.js` 只承载原真实 XMind renderer。每次打开绑定 session / 回复实例 / revision；
过期回复、未知请求和销毁后的消息不能改变新实例。全屏使用保留状态的 DOM 移动，避免 iframe
重新加载；旧实例的迟到失败也不能关闭替代实例。

**这是不发行的模块注入接缝，不是公开 Broker 加载 API。** 默认 `main()` 仍在修改回复前抛出
`E_XMIND_RUNTIME_UNAVAILABLE`，不从网页全局发现 loader，不把厂商资源放进 production。
正式 Program 保持 `BUILT_UNVERIFIED / installable:false`。

Mac CFT 156 已验证未修改的 Browser production 包，以及父页面 A/B/C → 独立 opaque iframe
真实导图、全屏文档连续性、主题回执、20 次开关、原文恢复和直接业务 Stop 清理。
这些 fixture 结果不等于正式 Program 安装、Broker 撤权或已登录 ChatGPT 验收。
旧 R38/R393 对新候选只记录固定资源/隔离和正式入口拒绝；实际业务绘图由
`tests/framework/chatgpt-mindmap-r394-business-frame-probe.mjs` 单独验证并接入原 CI。

[许可参考审查](tests/xmind-license-review-r394.json) 保存八份上游版本化许可证原文与 SHA；
Snowbrush 精确产物的授权、GSAP 3.5.1 适用条款及完整传递依赖/NOTICE 仍未闭合，许可继续 `BLOCKED`。
正式固定资源加载、Broker 安装及安装后生命周期继续阻塞；真实 ChatGPT 为 `REAL_CHATGPT_NOT_TESTED`。
完整结果、失败记录与独立评分见 [Mac 实施与验收报告](ACCEPTANCE-R3.9.4.zh-CN.md)。

程序 ID：`opendesk.chatgpt-mindmap`；显示名称：**ChatGPT 思维导图**；版本 `0.2.0`。
运行目标仅为 `https://chatgpt.com/*` 顶层 `USER_SCRIPT`。

**真实 XMind 已在独立 Linux Chromium 的本地 DOM fixture 运行。R2 尚不能作为普通用户正式安装版使用。**
现有宿主没有经过审核的 XMind 固定资源准入；入口会在修改网页前报
`E_XMIND_RUNTIME_UNAVAILABLE`。构建的 `BUILT_UNVERIFIED / installable:false` 不是安装成功。
没有 SVG 替代、MAIN 世界加载、CDN、第二扩展或权限放宽。

## 独立真实 XMind HTML 预览（R2.1）

新增 [preview/index.html](preview/index.html) 与 [预览运行说明](preview/README.md)：它与正式程序**共享** `src/answer-registry.js`、`src/xmind-adapter.js`、`src/xmind-convert.js` 和 `assets/ui.css`，不会另造绘图器或复制一份可能漂移的业务源码。开发者检出最新 `main` 即可运行，四份真实 JS 已直接位于 `preview/` 并由 Git 跟踪，不再需要旧仓库绝对路径：

```sh
node examples/programs/chatgpt-mindmap/preview/serve.mjs
node examples/programs/chatgpt-mindmap/preview/verify-assets.mjs
node --test tests/environment/chatgpt-mindmap-preview.test.mjs
```

预览服务首先验证四个原始文件的 SHA-256、Git blob、大小和加载顺序，缺失立即失败；仅绑定本地回环地址，不使用 CDN。可以独立验证 A/B/C、320px、折叠/缩放、操作栏重建、流式后快照与 Stop 的全局样式残留。**预览页正向运行不代表生产 USER_SCRIPT 已安装、原 ChatGPT 已测试或分发许可已批准。** R2.1 的实现与下一环节在 [工作流记录](../../../docs/framework/workstreams/chatgpt-mindmap-r21.md)。

## 实际实现

单条 Answer DOM → HTML 语义 → MindNode → 原 Workbook / Topic / Dumper / JSZip →
原 `_SB_.createWorkbookEditor()` → 真实 XMind 只读画布。

- `xmind-convert.js` 移植原 `xmind/convert.ts` 的 Workbook 构造、备注、路径身份和 branch 状态，并合并原 `skin.ts` 的真实主题。补充根备注；删除按重复标题回退的状态；HTML 可见文字不再经过 Markdown 或任务标题重写。
- `xmind-adapter.js` 提取原 `xmind-renderer.ts` 的创建、staging mount、控制器替换、缩放/滚动恢复、原生折叠区域和 `close()`。不迁移 React、Next.js、编辑命令、账号、数据库和持久化。
- 该 SDK 没有原参考适配器尝试调用的 `fitMap/fit/center`。本版测量 SDK 实际节点，用 SDK `zoom()` 及其滚动容器适配；视觉定位仍未达验收标准。
- 该 SDK 的 `collapseBranch/extendBranch` 作用于选区。全分支工具栏还使用原转换器的 Workbook `branch` 状态重建，避免按钮切换而内容不折叠。真实 fixture 已观测 8 个可见主题折叠为 2 个并恢复。
- 每条回复独立创建控制器；同文同标题不共享状态。关闭和 Stop 等待初始化/命令队列，并关闭迟到的控制器。
- 正文始终保留原 DOM；只临时隐藏 `display` / `aria-hidden`，失败、关闭、导航和 Stop 恢复。
- 提取器保留开头裸文本、标题、段落、嵌套列表、表格、引用、代码及链接/加粗的可见文字；修复列表内表格和备注额度/emoji 截断。

## 文件审查与清理

| 文件 | 处理 |
| --- | --- |
| `src/main.js` | 保留受管 Page UI，增加缺少真实 SDK 时的失败门槛 |
| `src/chatgpt-adapter.js` | 保留；当前真实登录 ChatGPT 选择器未验证 |
| `src/answer-registry.js` | 保留并修复异步清理、迟到实例、复用 DOM 的消息身份及流式属性观察 |
| `src/extract.js` | 保留并修复 HTML 语义及额度 |
| `src/view.js` | 重构为唯一 XMind 入口，去掉品牌标题、重复说明及旧 SVG 操作 |
| `assets/ui.css` | 精简为按钮/工具栏/容器样式，删除旧节点/连线样式 |
| `src/mindmap-renderer.js` | 删除 |
| `src/mindbank-xmind-theme.js` | 删除；真实 Workbook 主题归入转换器 |
| `tests/layout.test.mjs`、`tests/xmind-theme.test.mjs` | 删除 SVG 布局/仿主题测试 |
| `tests/extract.test.mjs` | 保留并补充语义回归 |
| `src/xmind-convert.js`、`src/xmind-adapter.js` | 新增真实引擎最小适配 |

原算法来源为 `shopable-ai/shopable-station@b76abf4b95e34c1234a33927051ea13165d92715`；模块头部及
[`tests/xmind-provenance.json`](tests/xmind-provenance.json) 记录实际文件、Git blob、资源字节和 SHA-256。
这份 JSON 是审计/测试输入清单，不是第二份生产库注册表。

## 固定资源与实际阻塞

原资源目录：`apps/web/public/lib/xmind/`。四份原始字节均已读取并核对 Git blob 与 SHA-256：

| 资源 | 字节 |
| --- | ---: |
| `jszip.min.js` | 97,630 |
| `polyfill-45b9836beb.min.js` | 104,563 |
| `xmind-sdk.bundle.js` | 401,113 |
| `snowbrush-2c2b5d62b5.js` | 3,439,267 |
| 合计 | 4,042,573 |

**四份 vendor 字节已提交在本项目公开仓库的 `preview/` 中，但尚未纳入正式扩展的受信生产资源封装。公开存在不等于取得其完整生产再分发许可。** 以下缺口尚未关闭：

1. **许可/来源闭包**：参考目录没有附带完整许可证和可复现版本锁。JSZip 头部声明 MIT/GPL；XMind 官方 SDK、viewer 包装项目的 MIT 不能直接证明这个 Snowbrush 合并产物和其中全部第三方资源的再分发许可。Snowbrush 内含多个第三方许可头，需要将其与固定字节对应。没有证据宣称它禁止分发，也没有证据宣称已审核通过。
2. **现有资源合同装不下**：普通 Program builder 输出上限 100,000 B；linked Page 资源/compiled source 512 KiB；可选本地库单项 512 KiB，React/Vue 专用资源 256 KiB。Page assets 仅 CSS/JSON/图片，不能把 3.44 MB JS 冒充 JSON/CSS。未修改这些合同或以远端锁绕过。
3. **隔离与生命周期**：真实探针确认 Snowbrush 向文档插入全局样式；控制器全关后仍保留共享样式。直接把它载入 USER_SCRIPT 仍共享网页 DOM，Shadow DOM 不能解决 SDK 全局资源所有权。必须验证复用现有运行边界的最小可信本地资源/绘图隔离方案，再实施公共合同；本轮没有新建 iframe/RPC 框架。
4. **视觉及原生证据**：Linux 截图有字体缺失与画布定位/裁剪问题；不能声称与原 Mindbank 页面一致。暗色、真实 200%、触控板/拖动/备注、BFCache、内存、真实登录 ChatGPT、撤权/卸载即时清理和自动运行均未完成验收。

源码里的 `new Function` / `eval` 字样并不等于此只读路径一定失败：真实 Node 转换在禁止字符串代码生成时通过；独立 Chromium 使用 `script-src 'self'`（没有 unsafe-eval）渲染和操作通过。
**这不等于 Chrome USER_SCRIPT 或扩展 CSP 已验证。** 没有把原 SDK 注入 ChatGPT MAIN；探针仅在专属本地测试页面加载固定资源。

## 复现与证据等级

```sh
node scripts/validate-program-project.mjs examples/programs/chatgpt-mindmap
node --test tests/environment/chatgpt-mindmap-r1.test.mjs
npm run build:program -- examples/programs/chatgpt-mindmap
npm run check
```

保留历史 `r1` 测试命令作为 CI 入口，但不再导入 SVG 测试。
真实 SDK Node 测试需提供已经取得的固定资源目录（缺失时明确 SKIP，不能计为 SDK PASS）：

```sh
XMIND_REFERENCE_DIR=/absolute/audited/xmind node --test tests/environment/chatgpt-mindmap-r1.test.mjs
```

浏览器探针只用于开发者复现，不是普通安装者的额外安装步骤：

```sh
node tests/framework/chatgpt-mindmap-xmind-probe.mjs \
  --assets /absolute/audited/xmind \
  --browser /absolute/chromium \
  --playwright /absolute/playwright/index.mjs \
  --out /absolute/isolated-evidence
```

它校验固定 SHA、用独立 loopback 端口和临时浏览器加载真实四份库，记录实际节点、缩放、折叠、6 回复、同文隔离、全屏、操作栏重建、内容刷新、20 次切换、迟到控制器、SPA/Stop、网络请求和截图。
只读断言与 fixture 驱动不能代替真实 ChatGPT、原生权限或安装验证。

**正式状态：Source → Build 已完成；Candidate / Verification / Available / Installed 未完成。**
源码或远端提交不代表用户 Mac 的日常 `dist/development`、Chrome 扩展身份或安装状态发生变化。
下一步首先补齐固定资源的许可/隔离准入，再沿原 Page Authority 完成同候选验证与安装；不恢复 SVG。

## R3 原生安装链新增核查（2026-10-15）

现有 Page Program 宿主已具备真实 Candidate / Verified / Available / Install / Disable，
但 R2.4 原生安装尚缺正式 XMind Runtime 准入。R3 增加通用 Page Program
`uninstallPageProgram`：受宿主身份、安装版本和授权代数 CAS 约束，先撤销持久自动
运行授权、旋转引导 token，再等待 Chrome `userScripts.unregister` 和
`getScripts` 对账，成功才删除安装记录；失败保留禁用的可重试记录。
工具管理页同时增加需显式确认的「卸载程序」。这不等于思维导图已经可安装。

**特别注意：** 禁用和卸载尚不能可靠销毁已注入且仍然打开的文档中的
USER_SCRIPT 全部回调，也未解决 Snowbrush 全局样式残留。UI 会明确提示刷新原网页。
卸载接口的组件测试只是 Native 模拟测试，必须进一步由真实 Chrome
验收撤销、刷新、BFCache 和权限移除。许可证和可信绘图文档没有审批前，
本程序仍须保持不可安装，不能把通用卸载功能视为 XMind Runtime 接线完成。

### 本轮专项 CI 证据

[GitHub Actions #38756274935](https://github.com/shopable-ai/opendesk-browser/actions/runs/38756274935)：
新增原生安装管理回归 `41/41 PASS`，原 XMind 源码回归
`17/17 PASS`；Chromium 原始 HTML 绘图 Job 通过。
但整次 RUN 因并行 SDK `browser-schemas.js:56` 语法损坏导致
`npm run check` 失败。不能据此认定本轮产品安装完成或主仓 CI 全绿。

**R3 最新 CI：** [#38757685815](https://github.com/shopable-ai/opendesk-browser/actions/runs/38757685815) 在并行 SDK 修复后两项 Job SUCCESS（原生管理 41/41、XMind 源码 17/17、Build 和 `npm run check` PASS）。这是独立 HTML 引擎与通用安装链的验证，不等于 ChatGPT 自动运行版正式通过。

## R3.2 · ChatGPT 模拟预览与产品设计要求

新增 [preview/chatgpt.html](preview/chatgpt.html) 和 [preview/design.md](preview/design.md)；分别承载模拟 ChatGPT 用户界面与正式设计合同候选。chatgpt.css / chatgpt.js 只实现模拟网站壳，真正的「思维导图」按钮依旧由正式 createAnswerRegistry 自动注入，点击调用原始 XMind 引擎。

本地运行 node examples/programs/chatgpt-mindmap/preview/serve.mjs --no-open，打开输出的 REAL_XMIND_CHATGPT_PREVIEW URL。原有 preview/index.html 与四份固定 JS 完整保留，不创建第二份引擎。设计状态为 **PENDING_USER_CONFIRMATION**，必须先由用户核对按钮位置和导图交互，再允许锁定为产品正式 UI 基准。

本阶段的模拟页面通过不代表真实登录 ChatGPT、正式隔离运行时、许可批准或 Native 安装已经可用。


## R3.5 · Icon 工具栏 / 编译产物真实性（2026-10-16）

共享正式源码的 `src/view.js` / `assets/ui.css` 使用本地线框 SVG 分组 Icon 工具栏；窄容器采用 44px 更多菜单，折叠、全屏和刷新具有真实状态。打开导图后该条 ChatGPT 操作栏不再出现重复“原文”，关闭后原触发器恢复；XMind 只读渲染器仍使用相同四份原始 JS，没有替代画布或 CDN。

`src/xmind-adapter.js` 使用实际 `.topic` 几何测量及可滚动节点进行定位；只在真实容器尺寸变化且用户未手动操作视口时自动适配。320px 下保护根节点可读性；完整桌面裁剪验收须以新 Chromium 实测截图/几何报告为准。

**构建候选审计命令（在仓库根目录执行）：**

```sh
node examples/programs/chatgpt-mindmap/preview/verify-assets.mjs
node --test tests/environment/chatgpt-mindmap-preview.test.mjs
node --test tests/environment/chatgpt-mindmap-r1.test.mjs
node scripts/validate-program-project.mjs examples/programs/chatgpt-mindmap
npm run build:program -- examples/programs/chatgpt-mindmap
node examples/programs/chatgpt-mindmap/scripts/audit-build.mjs
npm run check
```

审计器只有在构建 SHA-256、Draft 和 **当前源码**一致时才接受候选。候选目录格式：

`artifacts/programs/opendesk.chatgpt-mindmap/0.2.0/r31-production/<sourceHash16>-<authoringHash12>/`

其中存在 `program.js` / `program.opendesk-draft.json` / `artifact.json`，**状态只能是 `BUILT_UNVERIFIED` 与 `installable:false`**。它与 Browser 宿主 MV3 `dist/development`、`dist/production`、Chrome 已安装 Page Program 是不同层级，互不等同。

专项 CI 生成两个独立的短期 Artifact：`r35-program-build-candidate`（三文件与来源审计）及 `r35-chatgpt-icon-toolbar-proof`（真实 Chromium PNG、`chatgpt-result.json`、`screenshot-evidence.json`）。两者都不是本机已安装证明。截图证据由真实页面生成；没有逐张打开审阅前必须标为 `SCREENSHOT_NOT_VERIFIED`，不评 95+。

本轮 GitHub 操作无法读取用户 Mac `/Users/shopme/...` 下的构建目录、已安装 Chrome profile 或并行 Agent 的未提交工作树；这些项目目前 `NOT_TESTED`。正式资源准入、许可、Snowbrush 全局 CSS 隔离、用户脚本生命周期及原生授权/撤权仍未通过。预览设计仍 `PENDING_USER_CONFIRMATION`。

## R3.6 · 完成的源码修复、真实 CI 与仍未关闭的生产约束（2026-10-16）

独立 Program 唯一业务根目录：`examples/programs/chatgpt-mindmap/`；它内部的 `src/` 不是浏览器宿主的 `opendesk-browser/src/`。本轮从未修改宿主业务代码。完整源码调用链、打包模块清单与 SDK 边界见 [R3.6 架构审计](../../../docs/framework/workstreams/chatgpt-mindmap-r36-architecture-audit.md)。

已用真实 CI 修复 `reflow` 的 optional chaining 合法断言、容器查询祖先、More 菜单点击宽度/方向键焦点、动态 XMind topic 布局尚未稳定时过早标记 Fit 完成等问题。320px 时保留可读根节点，提供「左右拖动查看分支」提示；**不会**把所有子分支挤到 320px 一屏，因此要以实际横向滚动和真实主题可见范围判断 UX。

已通过的专项 CI 示例：[`#38865072908`](https://github.com/shopable-ai/opendesk-browser/actions/runs/38865072908)，离线源码/构建 Job 与真实 Linux Chromium 原始 XMind/ChatGPT 模拟页面 Job 均为 SUCCESS。该运行 A/B/C 真实主题 10/6/10、20 次开关、桌面及 320/375/390/768/1440 响应、横向浏览与菜单交互、截图 PNG SHA-256 校验通过。图片证据由独立 `r36-chatgpt-icon-toolbar-proof` Artifact 提供；构建候选由独立 `r36-program-build-candidate` Artifact 提供；旧 CI 的 `r35-*` 仅代表旧版运行。

**四个不同状态严禁混淆**：独立源码已验证；Program 构建候选已审计但 `BUILT_UNVERIFIED/installable:false`；Browser MV3 `dist/development` / `dist/production` 包含状态 **NOT_TESTED**；本机 Mac Chrome 真实 `userScripts` 注册/授权/卸载 **NOT_TESTED**。生产必需的固定原始 XMind JS 分发许可、可信 USER_SCRIPT 准入、`E_XMIND_RUNTIME_UNAVAILABLE` 与 Snowbrush `snowbrush_style` 全局残留是 **BLOCKED**。别在宿主 `src/` 添加思维导图特例，也不得把 `installable` 改为 `true` 冒充安装通过。设计仍 `PENDING_USER_CONFIRMATION`。

---
## R3.7 · 真实 Chromium 移动端、构建与生产边界（2026-10-16）

**当前状态：独立预览 `PREVIEW_PASS`；真实 Chromium fixture `PASS`；Program 源码同源构建 `BUILD_PASS`；截图已人工抽检但 JSON 的 `visualReview` 仍为 `SCREENSHOT_NOT_VERIFIED`；生产安装 `BLOCKED`。** 设计仍为 `PENDING_USER_CONFIRMATION`。不可把成功的本地模拟页称为登录 ChatGPT 的 Chrome 原生安装。

- 已通过的同源 CI：[Actions #38867300512](https://github.com/shopable-ai/opendesk-browser/actions/runs/38867300512)，提交 `aaccbf608b0b2c98d13074158f4404cae73bd598`；离线环境 21/21、通用原生管理组件 41/41、真正 XMind 浏览器探针和 ChatGPT 模拟页浏览器探针成功，附 PNG/JSON 与 Program 构建候选 Artifact。新增的「320px 水平滚动后重新适配」断言在 `862eef6c24c6af3046cec8792c7c0fc0d69d1071`，已由 [Actions #38867753856](https://github.com/shopable-ai/opendesk-browser/actions/runs/38867753856) 两个 Job 实测通过：根节点重新完整可见，真实 `.workbook-item.scrollLeft` 从 411px 恢复到 176px。验收文档同步提交 [#38868394764](https://github.com/shopable-ai/opendesk-browser/actions/runs/38868394764) 也已两个 Job 通过。
- 320px **内容容器**：真实根节点 180px 中可见 180px（旧失败时仅 31px），画布 318px、主题 6 个、实际滚动容器 `scrollWidth=2021`、`scrollLeft=660`。320px **浏览器整窗**：内容宽 296px、画布 294px、真实横向滚动由 176 增至 411；网页自身没有水平溢出。
- 已按实际容器宽度检查 375/390/400/440/768/1220/1440px 的 ToolBar、根节点和页面滚动；真实 A/B 独立、C 表格/代码/引用、20 次开关、全屏、折叠、暗色、原文恢复、Stop 和移动端更多菜单键盘交互均在专项探针中。测试补充文件仅位于 `tests/framework/chatgpt-mindmap-chatgpt-probe.mjs`；本轮不改浏览器宿主根 `src/`。
- 最新已通过的源码构建 Hash：`e17e473394c6b8269277ff1373c831346706d03f6bbfb912c759767194f25799`；`sourceBytes=53841`，`status=BUILT_UNVERIFIED`、`installable=false`。正式四份 XMind vendor JS 总计 4,042,573 B **仅用于预览**，受信 Runtime/第三方许可/资源准入/全局 `snowbrush_style` 隔离尚未通过。Mac `dist`、登录 ChatGPT、`chrome.userScripts` 真实注册、撤权、卸载、BFCache 均为 `NOT_TESTED` 或 `BLOCKED`。

详见 [R3.7 验收审计](../../../docs/framework/workstreams/chatgpt-mindmap-r37-acceptance.md)；不要依据本文对生产安装或用户满意度自行填写 95 分。

## R3.8 · 真实 Browser Extension 原生技术验证（2026-10-16）

正式产品现状仍为 **NO / BLOCKED**：该 Program 的四个 XMind 厂商 JS 仍仅用于离线预览，未获生产许可/固定资源审核，也未通过实际 Page Program 安装、登录 ChatGPT 或 Mac 生命周期 E2E；`BUILT_UNVERIFIED / installable:false` 和 `E_XMIND_RUNTIME_UNAVAILABLE` 不得伪装成已完成。

新增 `tests/framework/chatgpt-mindmap-r38-native-probe.mjs` 与专项 Actions 的 `native-user-script-xmind-feasibility` Job：使用**真正 WXT 包和原始编译 Program**，仅在 **CI 一次性测试副本**内载入 Git 已跟踪的四份 SHA 校验 XMind 资源，尝试由真正的 Chrome `chrome.userScripts` 在独立 `USER_SCRIPT` 世界执行。它**没有使用** OpenDesk 的 Verified → Available → Installed Broker，故即使通过也仅能证明 Chrome/XMind 技术可行性，不能称为正式安装。失败保留 JSON 且退出非零；只上传 JSON 和截图，不上传 vendor JS。

更新正式 Page Program 安装管理 UI：把网站授权与 Chrome 原生注册拆分显示，原生注册失败不再出现成功提示，并告知 Chrome 138+ 用户开启「允许用户脚本」。回归测试覆盖这两个状态。完整安全门禁、CI 结果解读和后续阻塞见 [R3.8 原生集成审计](../../../docs/framework/workstreams/chatgpt-mindmap-r38-native-integration.md)。R3.7 Icon 工具栏/移动端产品代码不更换。设计状态继续为 **PENDING_USER_CONFIRMATION**。

## R3.9.2 · 固定文件可行性已验证，正式生产继续阻塞（2026-10-16）

- **技术可行性 PASS（仅临时扩展）**：原生 CI [#38909275915](https://github.com/shopable-ai/opendesk-browser/actions/runs/38909275915) 三个 Job 均 SUCCESS。在复制正式 WXT 构建的**一次性临时扩展**中按 SHA 固定四份原始 XMind 文件，`chrome.userScripts.register({js:[{file},…]})` 在新文档 USER_SCRIPT 世界自动运行真实 XMind；`unregister` 后新页面不再运行。该流程**未走**正式 Broker、Verified→Available→Installed，也不构成生产资源许可。
- **正式生产仍 BLOCKED**：四份 JS 共 4,042,573 B（其中 Snowbrush 3,439,267 B）仅位于 `preview/`。精确构建物及传递依赖的 LICENSE/NOTICE 与再分发许可尚未审清。现有安装器只注册受信 bootstrap，后续由 Broker 在当前文档经安装授权执行源码；不能将实验中的固定文件直接拼到 bootstrap 以绕过权限/版本检查。保持 `BUILT_UNVERIFIED`、`installable:false`、`E_XMIND_RUNTIME_UNAVAILABLE`。
- **独立清理修复**：[提交 b02b611](https://github.com/shopable-ai/opendesk-browser/commit/b02b61133ddb92202dc08bb2604f058f963e81d2) 修复 SDK `close()` 抛错时仍移除画布挂载元素，并新增折叠/展开仅保留一个活动 mount 的原生回归断言。**没有**宣称修复 `style#snowbrush_style` 全局污染；仍须独立绘图文档隔离、所有权及撤权清理证明。
- **本轮提交的独立 CI**：[Actions #38911648247](https://github.com/shopable-ai/opendesk-browser/actions/runs/38911648247)：`offline-source-contract` 和 `real-local-xmind-html` SUCCESS，`native-user-script-xmind-feasibility` FAILED，**未运行至原生探针**。原因为 `scripts/verify-package.mjs` 对并行 React Side Panel 产物 `ui/tool-shell.js` 中的 `y.constructor=b` 报 `Unapproved dynamic constructor reference`。此为与 Mind Map 无关的生产包验收阻塞；不能关闭安全扫描或冒充原生 E2E PASS。应由 React/安全验收工作流修复后重新执行本轮 native CI。
- **后续顺序**：①精确字节许可证闭包；②原有授权后执行链的固定资源绑定与哈希/版本检查（最小通用能力，不能绕过 Broker）；③ Snowbrush 独立文档 CSS 隔离；④正式原生安装/自动执行/升级/停用/撤权/卸载；⑤已登录 ChatGPT A/B/C、缩放、折叠、全屏、原文恢复、重启和 SPA。本阶段正式安装 `BLOCKED`，真实登录网站 `REAL_CHATGPT_NOT_TESTED`，质量评分不得填满 95。

## R3.9.3 · 原生 iframe 隔离和资源许可闭包进展（2026-10-16）

- **真实隔离可行性已通过，但不是正式安装**：新增 `tests/framework/chatgpt-mindmap-r393-sandbox-probe.mjs`，直接用真实 Chromium `chrome.userScripts.execute({target:{tabId,frameIds:[...]}})` 将四份精确哈希 XMind JS 与实际编译 Program 运行于 `sandbox="allow-scripts"` 的不透明源子文档；临时测试扩展在运行结束后销毁。原生 [CI #38918166443](https://github.com/shopable-ai/opendesk-browser/actions/runs/38918166443) 的独立 `native-r393-sandbox-feasibility` Job SUCCESS，证据 `R393_REAL_XMIND_OPAQUE_FRAME_PASS`；`childOrigin="null"`、子文档 `style#snowbrush_style=1`、主文档 `=0`。这证明独立文档隔离方向成立，**不证明已经实现正式 Program 业务 iframe、安全内容通信或 Broker 安装**。后续 A/B/C、折叠、全屏、逐条恢复的扩展验收应以对应 CI 回执为准。
- **许可证仍为 BLOCKED**：`scripts/audit-runtime-license.mjs` 复用唯一 `tests/xmind-provenance.json` 的四份 SHA-256、Git blob、精确大小，禁止把公开可见等同于再分发许可。[CI #38917680501](https://github.com/shopable-ai/opendesk-browser/actions/runs/38917680501) `offline-source-contract` PASS，产生 `r393-xmind-license-blocked-audit`，结论 `R393_LICENSE_BLOCKED_WITH_EXACT_BYTES_PASS`；4,042,573 B 字节完整不代表 LICENSE/NOTICE、准确版本、Snowbrush 传递依赖、商业再分发权利审核完成。
- **生产准入保持关闭**：正式 Program 继续 `BUILT_UNVERIFIED / installable:false`，绝不可把临时实验中的四份 JS 放入正式 `dist/production`、预加载到未获 Broker 授权的页面或绕过 `Verified → Available → Installed`。正式 Mac Chrome/已登录 ChatGPT、撤权/卸载/重启仍为 `NOT_TESTED`。生产构建受并行 React 源码安全兼容检查影响时，保持安全门禁并单独运行独立 Mind Map 源码、许可和真实 iframe 探针。
