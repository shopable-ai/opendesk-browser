# AI 消息发送队列 UI 验证

## 2026-11-27 · ChatGPT 空队列皇冠直发 · 本轮实站回归

**实站通过，本候选未复现反馈中的故障。** 复用已连接开发服务的 Ego Lite TaskSpace 58，仅使用本任务的 ChatGPT 专用标签。两次发送前均读回了合成正文，确认皇冠和原生发送均可点击、队列 0 项、没有应等待的回复；发送后均观察到回复开始并完成、队列 0 项、草稿为空、未出现 Info。以下时间为 UTC+8，计数依次为皇冠可信点击 / 原生发送点击 / 精确用户入站 / 原生停止点击。

| 真实 ChatGPT 场景 | 合成标记、时间与结果 | 同次证据 |
| --- | --- | --- |
| 已有专用会话 | `OD-EQ-27NOV-K4E` · 10:44:29–10:44:44 · **1 / 1 / 1 / 0**。原草稿先被队列安全接管，原生点击前逐字恢复到编辑器；站点收下后队列排空。 | [点击前](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/existing-before.png) · [点击后](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/existing-after.png) · [事件](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/existing.json) |
| 普通新聊天首页 | `OD-EQ-27NOV-J8H` · 10:45:35–10:45:47 · **1 / 1 / 1 / 0**。先走原生提交，草稿安全清空，首页切入 `/c/` 后只收到一条，无重放。 | [点击前](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/home-before.png) · [点击后](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/home-after.png) · [事件](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/home.json) |
| 已有会话快速连点 | `OD-EQ-27NOV-M2Q` · 10:46:42–10:46:53 · **2 / 1 / 1 / 0**。两次可信点击相隔 **12 ms**，第二次点击时同一草稿仍在。回复完成，队列和草稿归空。 | [原始事件](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/rapid-double-trusted.json) · [独立只读核验](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/rapid-double-verified.json) |
| 已有会话空输入 | 探针标识 `OD-EQ-27NOV-Z0N`（未输入、未提交）· 10:46:13–10:46:17 · **1 / 0 / 0 / 0**。输入框和队列持续为空。 | [事件](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/empty-composer.json) |

截图展示同候选的输入区与站点回复，防重依据是精确正文计数及点击事件。快速连点原始探针还要求页面同时挂载的用户行总数增加 1，但站点虚拟列表同时卸载了旧行，导致探针标为 `INCOMPLETE`；随后只读查得该合成正文恰好一条且有完整回复，没有补点或重发。新聊天后图右上角的「阅读目录 · 暂无章节」来自另一个网页增强，与本次发送及恢复通知无关。

| 候选身份 | 读回值 |
| --- | --- |
| 开发扩展 | `dist/development`；扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；开发服务已连接，复用 watcher PID 8131 |
| 实际应用的开发 revision | `5d97d51f51500dce04837f339fde6dc3a3690d0be13368be5d561d090b3ef393` |
| 实站固定 ISOLATED 网页桥 SHA-256 | `826ea0b94faa8ec8dd04c435a51ee0dd5ae26e92b4b4daa7e53f76e2d243beb0`，从实际发送标签读回脚本并校对开发目录 |
| 本地唯一正式 Sidebar JSON SHA-256 | `557c8200804ec7618d67b91fa701129ec74d379f37fa791a607c9e9b37b01301`（1.0.4/r64，独立核对，本轮未重新安装） |

**Chromium 源码夹具。** [皇冠与回复门控](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/source-empty-crown.txt)覆盖空输入、首页单发、暂停、上一答完成后按顺序发送及零误停。[恢复界面证据](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/source-recovery-info.json)覆盖正常无 Info、人工恢复仅一枚带无障碍名称的 Info、通知和显式确认位于队列外、查看或复制不解锁、显式确认本身零提交，以及 320/380/700 CSS px 和剪贴板拒绝保留原文。 [恢复图](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/fixture/notify-open-320-dark.png) · [手动备份图](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/fixture/notify-manual-320-dark.png)。

**定向 Node 回归 382/382。** `admission`、`dispatch-guard`、`engine`、`main-recovery`、`site`、`page-status`、`view` 通过，包含原生发送未就绪时等待或保留草稿、未知结果保留队列且不自动重试、等待上条回复和草稿保护。原生不可用及回执未知未在实站故意制造。未修改发送队列源码、固定桥或 Sidebar JSON。

**仍为 NOT_TESTED。** 正式包安装/升级、production、Gemini/DeepSeek 实站发送、冻结或丢弃标签；上轮共享安装检查的 22 项失败仍未独立归因，本轮未重跑。

**右上角界面反馈。** 发送队列的普通网页短提示已使用框架的 Page UI Toast；Sidebar 的 `ui.notify` 属于侧栏宿主。需要复制、查看草稿或明确确认的恢复界面继续由队列保留。截图右上角是阅读目录的「暂无章节」空卡片。仅在本任务的专用标签试摆现有边缘折叠入口：卡片由约 254×91 CSS px 收成 38×46 CSS px，不再盖住用户消息，编辑器边界不变。[原样](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/toc-empty-before.png) · [折叠预览](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/toc-empty-compact-preview.png) · [测量](../../artifacts/sidebar-tools/ai-send-queue/empty-queue-live-20261127/toc-empty-preview.json)。预览已在试验后还原，未改设置或并行中的阅读目录 1.1.20 安装包；自动折叠规则尚未交付。

## 2026-11-27 · 1.0.4/r64 持续开发验收 · 100/100

复用现有 `dist/development` 和已连接的开发服务。在 Ego Lite TaskSpace 53 的专用 ChatGPT 标签使用合成标记 `OD-Q64-27NOV-T7D-{FIRST,A,B,DRAFT}`。以下分别记录真实站点、源码夹具和 Node 回归；原始证据存于本机 `artifacts/sidebar-tools/ai-send-queue/recovery-info-evidence/`。

| 验收项 | 得分 | 证据 |
| --- | ---: | --- |
| 默认界面与备份 | 25/25 | Chromium 源码夹具：正常空队列及有待发项时均无 Info；待人工恢复时原队列仅一枚带无障碍名称的 Info，鼠标实点打开队列外通知。复制成功仍锁定；剪贴板拒绝时在通知内逐字显示只读原文。关闭重开仍可取回同一备份，其他会话不显示该备份；明确确认后才解除草稿恢复锁，夹具零发送。 |
| 键盘与窄屏 | 15/15 | Enter、Space 打开，Esc 关闭并恢复 Info 焦点。在 700、380、320 CSS px 下通知在队列外，队列和编辑器边界不变。320 CSS px 深色粗指针下 Info 实测 44×44 CSS px。 |
| 真实发送与回复门控 | 30/30 | 真实 ChatGPT 首页实点皇冠，FIRST 在前台入站。回复仍在生成时实点皇冠加入 A、B，切换前队列读回 A → B、输入框为空。切到第二个标签后，页面真实 `document.visibilityState` 为 `hidden`；A、B 的原生发送点击及各自首次站点入站都记录于这一隐藏区间。每次发送前，站点已将上条回复标为 `complete`，且原生停止按钮未出现。B 的回复也在返回前完成。 |
| 草稿及防重 | 25/25 | FIRST、A、B 的原生发送点击和站点用户消息均各一次；未点击停止，回到前台队列为空，历史无新增。独立合成草稿在再次切换前后逐字一致，未发送。定向回归覆盖暂停、错误会话、原草稿恢复及未知结果不自动重放。早期 J6P 合成试验也保留了未知 A，历史实读仅有 FIRST；未重发。 |
| 候选身份 | 5/5 | 实站试验前后应用 revision 一致；从实际发送标签的调试器读回固定桥脚本，与开发目录同字节；唯一正式 JSON 同源校验通过，与开发目录副本同 SHA-256。 |

**复查实站证据。** [事件日志](../../artifacts/sidebar-tools/ai-send-queue/recovery-info-evidence/live-fifo-t7d.json)由[探针](../../artifacts/sidebar-tools/ai-send-queue/recovery-info-evidence/live-chatgpt-r64-t7d.js)在网页中记录。第二个标签获选后未读回 ChatGPT 标签，切回后才读取事件，避免调试读取暂时改变可见性。核对 `before`、连续 `hidden` 区间内的点击和首次入站、`background`、`after` 与 `final`。日志只保留合成标记、时间、计数及状态。夹具结果见 [Chromium 回执](../../artifacts/sidebar-tools/ai-send-queue/recovery-info-evidence/recovery-info-chromium.json)和[正常关闭](../../artifacts/sidebar-tools/ai-send-queue/recovery-info-evidence/notify-closed.png)、[320 深色通知](../../artifacts/sidebar-tools/ai-send-queue/recovery-info-evidence/notify-open-320-dark.png)、[剪贴板拒绝](../../artifacts/sidebar-tools/ai-send-queue/recovery-info-evidence/notify-manual-320-dark.png)截图。

- 扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；开发 revision `5d97d51f51500dce04837f339fde6dc3a3690d0be13368be5d561d090b3ef393`。
- [实测固定桥](../../artifacts/sidebar-tools/ai-send-queue/recovery-info-evidence/live-t7d-identity.json) SHA-256 `826ea0b94faa8ec8dd04c435a51ee0dd5ae26e92b4b4daa7e53f76e2d243beb0`。
- [正式 JSON](ai-send-queue.opendesk-tool.json) 164877 字节，SHA-256 `557c8200804ec7618d67b91fa701129ec74d379f37fa791a607c9e9b37b01301`；Page 来源 SHA-256 `0e184bcac5fd9a387585f503c4c7258fece490f8e01fc086182ad9b6c8dc4b00`。原打包器返回 `PROJECT_PACKAGE_MATCH`。

**验证范围。** 队列项目 587 项定向 Node 检查通过。扩大测试时，共享 `send-queue-product-installation.test.mjs` 有 22 项失败，多数卡在扩展中心菜单夹具查找 `detail`；未做独立基线归因，本轮不据此判定正式安装。Gemini、DeepSeek 实站、冻结或丢弃的标签、正式安装升级和 production 均为 `NOT_TESTED`。

## 2026-11-26 · 从旧会话点「新聊天」后用皇冠首发（1.0.3/r63）

在已登录的真实 `chatgpt.com` 上使用 Ego Lite TaskSpace 31 的专用标签和合成草稿。对照组实点原生发送，首条消息出现并从 `/` 进入 `/c/…`。旧版 1.0.2/r62 从旧会话点「新聊天」后，原生发送按钮可用，皇冠却提示「请先确认原生发送按钮可用，并处理附件或输入法；草稿已保留」；没有发送。ChatGPT 保留了无可见布局的旧消息区，队列误把它当作新聊天历史。

| 新版操作 | 真实页面回执 |
| --- | --- |
| 从旧会话点「新聊天」，填草稿后双击皇冠 | 旧消息区仍留在 DOM，原生发送可用。网页进入新 `/c/…` 会话，只有一条对应用户消息，并出现回复。 |
| 回复生成中用皇冠加入 A、B；清空后点皇冠 | 待发列表按 A、B 排列。空框点击保留待发项并等待回复结束；此后 A、B 各发送一次，顺序正确，队列排空。 |
| 队列排空后再点空框皇冠 | 显示「发送队列为空」，当前会话和消息未变，编辑器保持为空。 |
| 用临时附件标记触发拒绝，再点「复制错误信息」 | 显示「当前草稿包含附件或富内容；草稿已保留」与回执「已复制错误信息」。在专用页回粘逐字核对，剪贴板只含错误原文；草稿原样，无发送。试验标记已移除。 |

复用原 `dist/development` 和现有开发服务。旧版 applied revision `e6f29d6094cfb2edbcfb8099e65322b7e032b09f9c77c5b6dd1ecd6026b8f692`，网页固定脚本 SHA-256 `1d5711a4eed0182d1cdec52241d3b8024032d96e76b227103de52e8c086b015c`。新版 applied revision `cd3ecaf1adb9e4f915952cb04add2f38dbcbdd2a55f14731520c00d57af3b34c`，从实测网页读回固定脚本 SHA-256 `5607581847af0f9bdd4bc9cba496d2b9201e5f6822fb524055bef3627cfe3100`，与该开发构建一致。

真实截图：[皇冠首发与回复](../../artifacts/sidebar-tools/ai-send-queue/chatgpt-r63/first-send.png) · [错误复制回执和保留的草稿](../../artifacts/sidebar-tools/ai-send-queue/chatgpt-r63/error-copy.png)。截图与包保存在本机 `artifacts/`。

342 项定向测试通过，覆盖站点判断、页面交互、快捷入口、失败恢复及固定入口和包来源。同源 [1.0.3/r63 候选包](../../artifacts/sidebar-tools/ai-send-queue/candidate.opendesk-tool.json) 已逐字节重建核对，SHA-256 `f13181c343baaef7916247b8592e42486854a8579dce2df869701f54e0cfc6c1`，Page 源 SHA-256 `233219ec74f3bed29e4230bd3b80098866036fa3224b37e899348b6d5bec809d`。本轮交付候选，用户原标签、Gemini、DeepSeek、正式安装升级和 production 未验证。

## 2026-11-26 · 真实 ChatGPT 新对话首条发送（1.0.2/r62）

在 Ego Lite TaskSpace 29 的专用标签打开已登录的 `https://chatgpt.com/`，只用合成草稿。旧固定脚本下，实点皇冠显示「当前对话暂不能加入队列」，草稿保留，仍在首页，原生发送点击数为 0。切换到已应用的新开发构建并刷新测试标签后：

| 条件 | 实际网页结果 |
| --- | --- |
| 首页填写草稿并双击皇冠 | 收到两次真实皇冠点击，只触发一次原生发送。进入新 `/c/…` 会话，网页只显示一条对应的首条用户消息。 |
| 在新会话中依次用皇冠提交 A、B | A 入站后，A 回复仍在生成时，B 已在队列，站点只有首条和 A。A 回复结束后自动发送 B，站点显示 B 与其回复。总计三次原生发送，未用原生停止。 |
| 队列排空后，空框点击皇冠 | 网页显示「发送队列为空」。无新增原生点击或用户消息。 |

开发服务已连接并报告应用 revision `e6f29d6094cfb2edbcfb8099e65322b7e032b09f9c77c5b6dd1ecd6026b8f692`。测试前后从网页调试器读回固定脚本 SHA-256 `1d5711a4eed0182d1cdec52241d3b8024032d96e76b227103de52e8c086b015c`，与 `dist/development` 一致。正式 JSON 已通过同源检查，开发目录中的副本字节一致；本轮使用已安装的开发扩展，没有重新安装或升级工具。真实页面截图附在本次 Codex 对话。用户原标签、正式版安装/发布、Gemini 和 DeepSeek 本轮未验证。

## 2026-11-26 · 空输入框点击皇冠

本轮目标：空输入框点击皇冠能启动当前对话的常规发送检查；无待发消息时显示空队列提示。普通草稿、暂停状态、会话归属、回复完成和防重规则保持原样。

Ego Lite 在本地 Chromium 的 [ChatGPT 模拟页面](tests/fixtures/empty-crown.html)复现旧版新聊天空框点击误报「当前对话暂不能加入队列」。修复后，[关键 UI 测试](tests/empty-crown-ego.js)实际点击网页上的皇冠，观察到：

- 新聊天且无待发消息时提示「发送队列为空」，未发送；已有首条草稿仍由原生按钮建立会话。
- 只有暂停项时提示先恢复，条目保持暂停；在已有对话生成回复时点击不阻断回复，也不发送。
- 回复完成后空框点击先启动稳定空闲检查；重复点击仍按顺序提交「队列第一条」和「队列第二条」各一次。第二条等第一条回复完成后提交，最终队列为空，原生停止按钮点击数为零。

项目 Node 测试 571 项通过；两处固定网页入口的独立 Vite 编译及来源校验通过。1.0.1/r61 安装包已通过同源核对。公共工具测试 7 通过、1 失败：R14 要求标题区最小高度为 48px，当前提交本就为 53px。

本地页面使用真实队列源码，站点、授权、计时和入站回执由夹具模拟。Chrome 实际安装、当前扩展或原标签页是否已更新、三个真实站点发送均为 **NOT_TESTED**；未向真实对话发送消息。

## 区域截图验收门槛

在 Ego Lite 打开已登录的真实站点，用任务专用页面和合成草稿。开始前核对已审阅的安装版本、开发服务已应用的 revision，以及两站页面实际运行的固定脚本 SHA-256；结束时再次核对，避免把不同版本的证据拼成一次通过。桌面统一用 1280 CSS px，Gemini 窄窗用 390 CSS px。

每个关键帧保存原始区域 PNG：从队列上缘截到输入框和原生工具栏的下缘，左右保留输入区完整边界；有提示、遮挡或溢出时把它一并截入。对照帧保持相同视口、缩放和取景范围，允许为多行输入增加截图高度。逐张打开并判定；截图用例、操作步骤和运行身份与同一份尺寸、命中及回执记录互相链接。

| 必测用例 | 必留区域截图与目视通过条件 | 同次操作证据 |
| --- | --- | --- |
| D1 · DeepSeek 新对话，首条之前 | 拍空输入，以及填入合成草稿并点皇冠后。空输入时一处空队列、一枚皇冠，原生控件完整；点击后仍能看到原草稿和「先用原生发送」提示。 | 首页未提交会话，草稿逐字一致，零入队、零站点提交。 |
| D2 · DeepSeek 首条与会话交接 | 拍原生首条提交且会话就绪后、Shift+皇冠暂停入队后、点恢复并排空后。每次仅一处队列和一枚皇冠；暂停行和恢复按钮清楚可见，排空后无残留行。 | 原生首条与恢复项各入站一次；同一文档提交到合法会话 UUID；暂停期间零入站。 |
| D3 · DeepSeek 返回新对话 | 在已有会话放一条单独的暂停测试项，拍切换前和返回新对话后。新对话恢复空态，看不到旧条目。 | 暂停项没有入站；返回原测试会话时仍处于暂停，只清理本次测试项。 |
| G1 · Gemini 短草稿，桌面与窄窗 | 两种宽度各拍新聊天中可发送的短草稿，并拍一次加入暂停项后的输入区。原生发送与皇冠同在原输入工具栏内并列，两枚按钮轮廓完整，无重叠、裁切或覆盖输入。 | 两个按钮中心各自命中；在已提交的测试会话 Shift+皇冠只加一条暂停项。另用合成草稿点原生发送，站点只收到一次，原暂停项零入站。 |
| G2 · Gemini 多行长草稿，桌面与窄窗 | 同一视口拍短草稿、足以触发换行的长草稿和恢复短草稿。输入区可纵向增长，不能横溢；皇冠与原生发送仍在原工具栏中并列，轮廓完整，互不遮挡。 | 每个状态记录两个按钮的边界和命中。实点 Shift+皇冠，只暂停入队同一份长草稿，逐字一致、零入站；用另一份多行合成草稿实点原生发送，只入站一次，暂停项不变。 |

**判定：** 截图和对应操作都通过才记 `PASS`。截图中缺按钮、重复挂载、按钮覆盖或裁切，即使能通过 DOM 找到也记 `FAIL`。缺图、未安装当前候选或缺操作回执时记 `NOT_TESTED`；发布无法进行时记 `BLOCKED`。历史版本、临时注入或本地夹具的截图只能定位问题。旧审阅、撤权、草稿隔离和防重仍须保留定向回归，并单列真站未测项。

## 2026-11-24 · 长草稿宽度与底部发送

在既有 Ego Lite 窗口的 TaskSpace 158 运行真实扩展。Gemini 载入长草稿后，皇冠占用原生工具栏空间；修复后跨行草稿的皇冠放到队列上方，给原生输入区和发送按钮留出空间。恢复短草稿后，空间足够时皇冠回到工具栏。

| 条件 | 真实网页结果 |
| --- | --- |
| 窄窗和桌面 | ChatGPT 280、Gemini 390、DeepSeek 320 CSS px，以及三站各 1280 CSS px。每个视口检查短草稿、6,399 字符普通长文、1,400 个连续字符和回到短草稿。24/24 逐字一致、无页面横向溢出、皇冠仅一枚，两枚按钮各自可命中且无重叠。见 [尺寸记录](artifacts/long-draft-width-20261124/runtime-layout.json)。 |
| Gemini 390 CSS px，等待布局稳定 | 四个状态的编辑区均为 310 px。原生发送按钮的左边界是 274 → 314 → 314 → 274 px，皇冠相应在工具栏内 → 队列上方 → 队列上方 → 工具栏内。见 [普通长文](artifacts/long-draft-width-20261124/runtime-p2-390-settled-long.png)、[连续长文](artifacts/long-draft-width-20261124/runtime-p2-390-settled-unbroken.png)、[恢复短草稿](artifacts/long-draft-width-20261124/runtime-p2-390-settled-recovered.png)。 |
| Gemini 底部原生发送与皇冠 | 点击原生发送，站点仅收到一条合成短消息，编辑区清空，队列仍为空。长草稿的原生发送只验证了按钮命中；受信任的 Shift＋皇冠实际把原样长文加入一条暂停队列，站点未收到长文。仅移除本次暂停项，最后仍是空草稿、零队列项。见 [点击回执](artifacts/long-draft-width-20261124/runtime-actions.json)与[暂停项截图](artifacts/long-draft-width-20261124/runtime-p2-390-paused-long.png)。 |

**运行与产物：** 实测固定网页脚本报告 **0.1.57**；其运行哈希与本机 `dist/development` 一致。开发目录最新读回 revision 为 `a7e7925d387ae69b6d00f37d1a659a3bc987f442f34aafa07560e673dbe47169`，目录中的正式工具资源已是 **0.1.58/r57**，三个测试页的固定脚本字节仍与实测 0.1.57 相同。侧栏「本地开发服务」状态未读回。唯一正式 [Tool JSON](ai-send-queue.opendesk-tool.json) 已晋升并通过 `--check-project`；SHA-256：`f1578421a6a318ab2879e67369c713aac1972993f6041400c8031a2d16b92af1`。包、布局、站点适配和快捷键定向验证 148 项通过。0.1.58 的安装审阅、固定脚本升版与 production 验收未实测。

## 2026-11-24 · DeepSeek 首页与 Gemini 双入口（0.1.56/r55）

**开发运行态：** Ego Lite 2.2.1、TaskSpace 155、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，原加载目录 `dist/development`。本轮采样时实际运行的是之前持续开发发布的 **0.1.55/r54**。Gemini 两个通过用例均由浏览器调试器读回固定脚本 SHA-256 `09d0a50c70855964586e3649ba4efd1aa8df6e1781194d0873c694dab54c0af5`，与磁盘一致；开发目录中的 Tool JSON SHA-256 为 `1ac74008ca6085ec276dff2ea0b260da9797b3b39658066c91e694a14f7a2097`。最后一次开发构建失败退出，未发布新的 `development-update.json`，r55 未应用、未安装。

| 用例 | Ego Lite 结果 |
| --- | --- |
| DeepSeek 登录后的精确首页，空输入；网站原生输入仍可用，首条前应有且只有一处空队列和一个皇冠 | **r54 复现 FAIL**：1728 CSS px，已就绪输入框存在，队列 0、皇冠 0。[首页复现](artifacts/composer-ui-20261124/r55-ego-155-deepseek-baseline.json)。r55 真站 **BLOCKED**。 |
| DeepSeek 首页填草稿、点皇冠：提示先原生发送，草稿原文保留、零入队、零提交；原生首条一次入站，提交 UUID 后交给唯一队列 | r55 定向 Node 检查通过；安装审阅和真站交接 **NOT_TESTED**。须在新固定脚本及范围审阅都生效后，从首页重新走一遍。 |
| DeepSeek 提交会话后：Shift+皇冠一条暂停项、零入站；显式恢复后恰好一次入站、队列排空；返回首页不显示或重发旧会话条目 | r55 真站 **NOT_TESTED**；下节为 r54 既有会话的独立历史证据。 |
| Gemini 桌面 1716 CSS px，新聊天 | **PASS（r54）**：原生发送与皇冠在同一个 `.input-buttons-wrapper-bottom` 内，矩形无交叠，中心各自命中。皇冠收一次可信点击，原生零点击，原文保留且零提交。随后原生按钮收一次可信点击，皇冠计数不变；输入清空，站点提交新会话，测试消息精确匹配一次并收到回复。[点击](artifacts/composer-ui-20261124/r55-ego-155-gemini-desktop.json) · [会话最终回读](artifacts/composer-ui-20261124/r55-ego-155-gemini-desktop-settled.json)。 |
| Gemini 390 CSS px，已有测试会话 | **PASS（r54）**：同一原工具栏内两个按钮无交叠且各自命中。Shift+皇冠收一次可信点击，仅加入一条暂停项，原生零点击、该项零入站；换一条合成草稿点原生发送，只增加一次原生点击，站点收到一条及对应回复，暂停项仍零入站。精确删除本次暂停项后队列空。[窄窗操作](artifacts/composer-ui-20261124/r55-ego-155-gemini-narrow-existing.json)。窄窗新聊天只测了同工具栏、矩形和中心命中；后续输入已存在的非测试草稿未操作。 |

**新版源码和包通过：** r55 仅为新审阅范围增加 DeepSeek 精确首页，路径不含查询参数。首页以站点原生编辑器和控件挂载，暂不绑定会话队列；路由提交后走原文档和队列授权。229 项定向 Node 检查通过，覆盖旧审阅不扩权、首页草稿不丢且不发送、会话绑定与暂停隔离，以及撤权和结果未知不重发。原打包器晋升唯一正式 Tool JSON，并用 `--check-project` 核对同源。包 SHA-256 `5fd61201f7e3d07a03cd059cb385f131716dc5c246dcac5d095374385303c7af`；Page 源 SHA-256 `c000baafdf284696685090ff76c5b9e1fef2dfa6b08a5cc63c14f7d0d69ed3f5`。Gemini 本轮实测未出现覆盖或误触，没有为此修改它的布局逻辑。

**构建阻塞及剩余验证：** `npm run dev` 已通过本工具的可信来源检查，随后在 `tool-shell` 拒绝另一扩展 `projects/ai-scroll-navigation/trusted/host-localization.js` 与已审阅哈希不符的版本（本机日志 `/tmp/od-sq-r55-development.log`）。源码经该项目审阅并与校验对齐后，复用同一开发目录和原扩展审阅入口，先读回实际生效的 r55 再补上表的 DeepSeek 首条和交接。r55 同候选 Gemini 实站、真站主动撤权、回执丢失、用户原标签页和 production 均 **NOT_TESTED**。

**后续候选：** 并行的 Gemini 长文本布局改动已合入本地 **0.1.57/r56** 候选。该项目先前触及的 131072 字节源码上限已解除，原打包器对 0.1.57 返回 `PROJECT_PACKAGE_MATCH`，SHA-256 `4811d6a5775041f71189ac7edbc296fae5a33a33f9bd1d380ccc22d659ee3791`；发送队列的 `view.js` 也已与固定入口的来源 pin 对齐。最新 [开发构建](artifacts/long-draft-width-20261124/dev.log) 通过发送队列的固定入口，在 `tool-shell` 再次被滚动导航的 `host-localization.js` 来源校验挡住；另一个 `react-controls.tsx` 也与已审阅哈希不符。服务退出，`dist/development` 保留 0.1.55，未发布新 revision。以实际安装并运行的新版本补验 DeepSeek；Gemini 上表只对应 r54 的操作和运行字节，组合版本须重新核对短文本双入口及长文本不遮挡。

## 2026-11-24 · DeepSeek 关键 UI 实测（0.1.55/r54）

**实际运行：** 已登录 DeepSeek 专用 Ego TaskSpace 148，原 main 和 `dist/development`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。首页至首条验证的开发 revision 为 `47c30cd726988e88fc3368d4bd9292b98f38d385694fa819c999b9c999f345fd`；后续操作为 `645ffb88c28ffabcca6ec7339caef5d63685738fc38977ffdfe344c24076ea83`。两次由浏览器调试器读回的固定脚本 SHA-256 均为 `79083d9f6733e0facb7385c9b7c451b07f912ec0f208861bed994d1c7abbf0d9`，与开发输出一致；正式 JSON 与开发目录副本均为 `1ac74008ca6085ec276dff2ea0b260da9797b3b39658066c91e694a14f7a2097`。

| 操作 | 可见结果及证据 |
| --- | --- |
| 新聊天 | 首页无队列；实点原生发送，首条在网站历史恰出现一次。同一 `performance.timeOrigin` 下新会话已有一处队列和一个皇冠。见[首条操作原始记录](artifacts/deepseek-core-20261124/r54-first.json)和[历史回执](artifacts/deepseek-core-20261124/r54-history-receipts.json)。 |
| 1280 / 390 CSS px | 各只有一处队列，无横向溢出。实点输入聚焦、Shift+皇冠暂停入队；再用原生发送生成独立回复，并实点停止。停止后原生发送恢复，暂停项依旧暂停且零入站。见 [1280 实点](artifacts/deepseek-core-20261124/r54-width1280.json)、[390 实点](artifacts/deepseek-core-20261124/r54-width390.json)和 [390 暂停截图](artifacts/deepseek-core-20261124/r54-crown-390.png)。 |
| 两条按序续发 | 两次 Shift+皇冠点击后的首次稳定读回分别在 331 ms、1272 ms，均已清空原草稿并显示暂停行。逐条恢复后，A 在 3.695 s 入站，4.637 s 看到对应回复完成且 B 未入站；B 在 8.432 s 入站，10.740 s 两个过程结束且队列已空。站点历史各只有一条。见[时序](artifacts/deepseek-core-20261124/r54-fifo2.json)和[最终历史核对](artifacts/deepseek-core-20261124/r54-history-receipts.json)。 |
| 无刷新切换 | 经真实站点历史侧栏切到第二个专用对话，旧行未出现；新草稿逐字读回且保持原文。返回时同一文档恢复原暂停项，未转为未知；后续等待约 4.5 s 仍无误发。见[切换记录](artifacts/deepseek-core-20261124/r54-spa.json)、[另一对话草稿](artifacts/deepseek-core-20261124/r54-spa-other-draft.png)和[返回原对话](artifacts/deepseek-core-20261124/r54-spa-return.png)。 |

原始探针有两处误判：首条的回复完成选择器找错父节点；续发 B 入站后，站点虚拟列表卸载了 A 的用户节点，要求两者同时留在 DOM 的断言超时。历史核对重新读到完整样本并交叉验证了运行脚本、顺序、各一次和队列排空，未重发已提交样本。0.1.54/r53 的[切换失败记录](artifacts/deepseek-core-20261124/r53-spa.json)继续保留。

后续迭代先在已有站点会话用最短操作链复现。只改工具侧栏时走「开发 → 本地项目 → 在侧栏调试」；改固定网页脚本时，先做定向适配与来源检查，再让原 watcher 发布同一开发目录，用浏览器读回确认后连测。这些证据不涵盖其他站点的同候选实站回归、正式安装、production、全量矩阵或评分。

## 2026-11-24 · 输入框上方队列与双发送入口

让队列区贴合聊天输入框的实际可见宽度，垂直间距为 **0 CSS px**。网站的「发送」和 OpenDesk 的「加入发送队列」（皇冠）是两个独立入口：原生动作直接发送，皇冠沿用原队列规则。改动限于本项目的站点适配；暂停状态沿用原 UI，只用恢复图标和原有样式表示，不显示「已暂停」文字。保留「结果未知」等原有反馈。

### 当前阶段：正常网页，1280 CSS px

#### 0.1.54/r53 · Gemini 原生 Stop 后恢复队列（独立接续）

**PASS：** 在 Ego Lite TaskSpace 137 的新建任务对话 `/app/a343c9934a14a6c7`，实际视口为 1280 CSS px。合成样本 N4 用网站原生按钮发送且未入队；实点原生 Stop，网站在同一末尾回合 `e4423d54dc2c3852` 内显示 `You stopped this response`。Shift+皇冠将编辑器里的新草稿 Q4 逐字移入暂停队列项 `q1`；四次采样均为零提交，原恢复图标可点，无「已暂停」文字。点该项恢复后，事件链只记录一次队列触发的原生发送点击；Gemini 接收了唯一一条逐字匹配的用户消息（新回合 `0455b3333d01a0d8`），队列清除了对应项。五次续测仍只有这条消息、无重复点击、队列及编辑器为空。发送前逐字读回草稿，暂停项和站点回执均匹配。见[原生发送及 Stop](artifacts/composer-ui-20261124/v54-gemini-stop-1280-137-native.json)和[暂停、恢复、回执及续测](artifacts/composer-ui-20261124/v54-gemini-stop-1280-137-resume.json)。

**旧版 0.1.53/r52：FAIL，已独立复现。** 任务对话 `/app/473cbdc8afe98930` 的回合 `7f9f9d5c017d2ab2` 有非空部分回复；网站在 `model-response` 内、正文外的 `div.response-footer.gap.complete > response-info-line[role=status]` 显示同一停止状态。该回合没有原判据所需的 Copy，正文一度残留 `aria-busy=true`。暂停零提交；点击恢复后等约 10 秒仍零提交并显示「等待当前回复结束」。本次旧样本最终状态未确认，保留旧页；更早的结果未知页及条目未操作。见[旧候选同回合诊断](artifacts/composer-ui-20261124/v53-gemini-stop-1280-137-native-existing.json)和[旧候选恢复失败](artifacts/composer-ui-20261124/v53-gemini-stop-1280-137-resume.json)。

Gemini 适配仅在唯一、已获站点回合 ID 的末尾用户/回复对中接受这个可见、正文外的精确网站状态；仅忽略该回复正文自身残留的 busy 属性。Stop 消失、发送按钮恢复、时间经过均不单独放行；原生 Stop 可见、其他流式标记或身份不确定时仍等待。通用原生发送、暂停 UI、草稿、权限、IME、防重和结果未知保护沿用原路径。235 项定向 Node 检查通过，包括缺失、隐藏、正文仿冒、其他回合和重复回合 ID 的拒绝，以及草稿和未知结果保护；正式 JSON 经原打包器候选、门禁、晋升和同源检查。

**实际运行身份：** 现有 `main`，原 watcher PID `90643`，`dist/development`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。正式 JSON 与开发目录副本 SHA-256 均为 `8d59a2538344851d3ebf1f2ae684834b576201ba433aa563039282d7a5bca288`；Page 源 SHA-256 为 `14e6cabcca21bf916fd8e1101c7bdfd70ed97fbb3978eedb8205a86a1a1d3c0c`。[开发服务已连接及已应用 revision](artifacts/composer-ui-20261124/v54-ego-development-status-137.json)为 `4b3674139bbbd18c4d6629b2edef39cc8090e84c00e33b2540c5b0ec06dc39be`，核心操作页的调试器读回字节与清单、磁盘相同。三站复验时共用 watcher 的全局 revision 变为 `9ea4f86b416d3d198eedcc059ca03e12c7b4e6db06c71bff1e2b33206d9fd438`；原任务页确认无草稿和在途操作后安全刷新，其队列脚本字节与核心候选相同：Gemini/DeepSeek `acf08ffc0ff960aeb280bbee202a86be35b4d68b4638c1775751b226276c7823`，ChatGPT `3e915c9e51aff3b3eda512bfa310d33a0103f8e3a3fe02b1e8f53e461d033ad8`。每站证据均保存实际读回值及测量前后 revision。

| 1280 CSS px 浅色会话 | 单队列、左右及接缝、溢出及遮挡 | 双入口命中、Tab 焦点 | 证据 |
| --- | --- | --- | --- |
| ChatGPT | PASS：一处队列，三处误差均为 0 CSS px，无溢出或重叠 | PASS：各三点独立命中，两个按钮均有可见焦点 | [数值](artifacts/composer-ui-20261124/v54-chatgpt-desktop-1280-137-reattached.json) · [皇冠](artifacts/composer-ui-20261124/v54-chatgpt-desktop-1280-137-reattached-focus-crown-controls.png) · [原生](artifacts/composer-ui-20261124/v54-chatgpt-desktop-1280-137-reattached-focus-native-controls.png) |
| Gemini | PASS：一处队列，三处误差均为 0 CSS px，无溢出或重叠 | PASS：各三点独立命中，两个按钮均有可见焦点 | [数值](artifacts/composer-ui-20261124/v54-gemini-desktop-1280-137-reattached.json) · [皇冠](artifacts/composer-ui-20261124/v54-gemini-desktop-1280-137-reattached-focus-crown-controls.png) · [原生](artifacts/composer-ui-20261124/v54-gemini-desktop-1280-137-reattached-focus-native-controls.png) |
| DeepSeek | PASS：一处队列，三处误差均为 0 CSS px，无溢出或重叠 | PASS：各三点独立命中；原生按钮焦点环可见于截图 | [数值](artifacts/composer-ui-20261124/v54-deepseek-desktop-1280-137-reattached.json) · [皇冠](artifacts/composer-ui-20261124/v54-deepseek-desktop-1280-137-reattached-focus-crown-controls.png) · [原生](artifacts/composer-ui-20261124/v54-deepseek-desktop-1280-137-reattached-focus-native-controls.png) |

三站布局复验的合成草稿均未提交，结束时已清除。**NOT_TESTED：** Gemini 非英语停止提示、真实 IME 和正式安装/权限矩阵；ChatGPT/DeepSeek 的发送代码未受本次适配影响，未在新版复点发送。响应式、深色、完整正式矩阵、独立评分及发布仍延期。

TaskSpace 137 已释放，仅保留旧复现页 p1；未重发或删除状态未确认的条目。更早的旧未知标签及并行 Space 120 未操作。原 watcher 继续运行。

#### 0.1.53/r52 · 桌面历史证据

**桌面正常路径 PASS，三站均通过。** 样本为 1280 CSS px 的浅色普通网页，输入区无遮挡。输入合成草稿后，输入框上方只有一个队列；按原生外壳可见上沿的直边测量，左右误差和垂直接缝均为 **0 CSS px**。队列及页面无横向滚动，两个按钮无重叠，各有三个内部命中点；从编辑器按 Tab 分别聚焦两个按钮，截图中均有可见焦点。布局测试使用的草稿逐字读回并于测试后清除。此关另已实点验证原生发送、停止，以及已完成回复后的皇冠入队和恢复；停止后直接接续队列的异常见下方。

持续开发候选为 **0.1.53/r52**。唯一正式 JSON、`dist/development` 中副本同源，包 SHA-256 为 `c87eb23a560b5aec1d03c6f85a4783b73f2bb0065a846c5302b267a2553bed03`；开发 revision 为 `b02b157661b2deb651d4507e230b94ef564d8eb10e2a0e1a5a4ec5c11feef1c9`。每站在此次实际文档中从调试器读取网页模块源码，计算的 SHA-256 与开发目录脚本匹配；证据中同时记录前后磁盘 revision。沿用原 watcher 和原包，桌面复测未发现需要修改源码的故障。

| 站点 | 1280 CSS px 的样本与结果 | 证据 |
| --- | --- | --- |
| ChatGPT | **PASS**。任务专用已有对话，空队列；皇冠、原生发送依次可聚焦。 | [数值及命中](artifacts/composer-ui-20261124/v53-chatgpt-desktop-1280.json) · [完整输入区](artifacts/composer-ui-20261124/v53-chatgpt-desktop-1280-draft-composer.png) · [皇冠焦点](artifacts/composer-ui-20261124/v53-chatgpt-desktop-1280-focus-crown-controls.png) · [发送焦点](artifacts/composer-ui-20261124/v53-chatgpt-desktop-1280-focus-native-controls.png) |
| Gemini | **PASS**。新聊天空队列，网站抽屉关闭；原生发送、皇冠依次可聚焦。已有专用对话也通过贴合、命中和 Tab，原暂停项与结果未知项均保留。 | [数值及命中](artifacts/composer-ui-20261124/v53-gemini-desktop-1280-clean.json) · [动画结束后的完整输入区](artifacts/composer-ui-20261124/v53-gemini-desktop-1280-paint-pointer-away.png) · [皇冠焦点](artifacts/composer-ui-20261124/v53-gemini-desktop-1280-clean-focus-crown-controls.png) · [发送焦点](artifacts/composer-ui-20261124/v53-gemini-desktop-1280-clean-focus-native-controls.png) · [已有对话复测](artifacts/composer-ui-20261124/v53-gemini-desktop-1280-light-pointer.json) |
| DeepSeek | **PASS**。已挂载的专用已有对话，有一条历史合成待发；皇冠、原生发送依次可聚焦。两个蓝色箭头形状近似，皇冠装饰仍可区分；视觉层级待后续评审。 | [数值及命中](artifacts/composer-ui-20261124/v53-deepseek-desktop-1280.json) · [完整输入区](artifacts/composer-ui-20261124/v53-deepseek-desktop-1280-draft-composer.png) · [皇冠焦点](artifacts/composer-ui-20261124/v53-deepseek-desktop-1280-focus-crown-controls.png) · [发送焦点](artifacts/composer-ui-20261124/v53-deepseek-desktop-1280-focus-native-controls.png) |

Gemini 曾在输入后短时看不到原生发送。实际节点的站点祖先 `send-button-container` 处于 `ng-animating`，计算透明度为 0；动画结束变为 1，移开鼠标后仍可见。原生按钮的命中层在[隐藏 OpenDesk 控件的对照](artifacts/composer-ui-20261124/v53-gemini-desktop-1280-hit-diagnosis.json)中不变；[动画及稳态数据](artifacts/composer-ui-20261124/v53-gemini-desktop-1280-paint.json)显示未复现皇冠遮挡。旧会话仅作补充，桌面正常截图取无结果未知提示的新聊天。

桌面实点使用替代的 Ego Lite TaskSpace 135（130 已关闭），在各专用已有对话复核调试器脚本与同一开发候选的字节一致。三站原生发送均恰有一次站点消息、无对应队列项，均实点原生 Stop，Stop 退出后草稿态恢复原生发送。Shift + 皇冠各加入一条暂停样本，暂停观察期提交数均为 0，接缝和左右误差仍为 0 CSS px；恢复图标三个命中点均有效，无「已暂停」文字。下表所列正常恢复样本，各确认一条站点消息、队列移除对应条目、草稿为空。

| 站点 | 1280 原生发送与 Stop | 1280 皇冠入队、暂停、恢复 |
| --- | --- | --- |
| ChatGPT | [PASS · 事件与回执](artifacts/composer-ui-20261124/v53-chatgpt-desktop-1280-native-135.json) | [PASS · 事件与回执](artifacts/composer-ui-20261124/v53-chatgpt-desktop-1280-queue-135.json) · [暂停截图](artifacts/composer-ui-20261124/v53-chatgpt-desktop-1280-queue-135-paused.png) |
| Gemini | [PASS · 动画结束后用新样本](artifacts/composer-ui-20261124/v53-gemini-desktop-1280-native-135b.json) | [PASS · 上一条回复自然完成](artifacts/composer-ui-20261124/v53-gemini-desktop-1280-queue-135e.json) · [暂停截图](artifacts/composer-ui-20261124/v53-gemini-desktop-1280-queue-135e-paused.png) |
| DeepSeek | [PASS · 事件与回执](artifacts/composer-ui-20261124/v53-deepseek-desktop-1280-native-135.json) | [PASS · 事件与回执](artifacts/composer-ui-20261124/v53-deepseek-desktop-1280-queue-135.json) · [暂停截图](artifacts/composer-ui-20261124/v53-deepseek-desktop-1280-queue-135-paused.png) |

**Gemini 桌面状态切换 FAIL。** 停止原生回复后，另一条合成队列项可从暂停切为待发送，但仍[等待当前回复结束，提交数为 0](artifacts/composer-ui-20261124/v53-gemini-desktop-1280-queue-135-followup.json)。将该样本重新暂停后，下一条原生基线消息自然完成时，原队列样本[转为「结果未知」，历史中未找到该样本](artifacts/composer-ui-20261124/v53-gemini-desktop-1280-queue-135d.json)。原条目保留，未重试或删除；正常路径的 PASS 来自独立干净标签中的新样本。另有一次早期原生点击未捕获到按钮事件，[草稿仍完整、消息计数为零](artifacts/composer-ui-20261124/v53-gemini-desktop-1280-native-135-diagnosis.json)，未重新提交该样本。

[1280 下只读对照原生回合](artifacts/composer-ui-20261124/v53-gemini-desktop-1280-completion-markers-135.json)：原生 Stop 留下同一回合的非空回复，但没有回复操作区或复制按钮；自然完成的原生回合和正常队列回合都各有一个可用的复制按钮。Gemini 适配器将此按钮作为回复完成的必要证据之一；当停止的回合仍是最后一轮时，仅原生发送恢复不足以让队列继续。这与当时等待且零提交的回执一致。该对照没有新增发送。下一步若继续验收该状态，用新样本查找网站明确的停止完成信号、核对前后回合身份；禁止以「Stop 消失」单独放行，也不重试旧结果未知条目。本轮未修改完成判定或发送保护。

**后续范围：** 当前交付只确认 1280 CSS px 的普通网页。窄屏、宽度往返、整站深色及完整状态矩阵未验收。已有只读预查在 [Gemini](artifacts/composer-ui-20261124/v53-gemini-narrow-timing-135.json) 和 [DeepSeek](artifacts/composer-ui-20261124/v53-deepseek-narrow-timing-135.json) 录到宽度切换后队列短时未贴合，部分样本在 Tab 聚焦时仍未对齐，稳定后才恢复；不计作通过，也未据此修改响应式布局。此前 0.1.53 的独立完整矩阵评分为 **92 / 91 / 89 / 89，FAIL**，含窄窗、状态切换和深色扣分；与桌面正常路径的通过判定分开。完整三站目标仍未结项。

**0.1.52/r51 历史诊断。** 225 项定向检查与 2 项包检查通过；[三站网页脚本](artifacts/composer-ui-20261124/v52-runtime-identity.json)与开发输出一致。两条暂停样本仍在时，Gemini 从 1280 缩至 390/320，观察到两个队列控件 `display:none`，皇冠仍留在原工具栏，[没有观察到独立移位](artifacts/composer-ui-20261124/v52-gemini-detached-diagnosis.json)。当时未确认是哪一处守卫或分支。0.1.53 在[抽屉关闭并稳定后](artifacts/composer-ui-20261124/v53-gemini-closed-drawer-resize.json)观察到 320 下 `site.inspect()` 可用、原工具栏放置被拒后同一皇冠移到独立位置，宽度和接缝均无误差；抽屉过渡期仍需单独复验。此段不计入桌面第一关。

### 完整验收合同（桌面第一关之后）

| 优先级 | 关键 UI 测试条件 | 通过标准 |
| --- | --- | --- |
| P0 | 必须先定位原生按钮「看不见」的原因 | 用同状态的原生页面作对照。在症状现场检查原生发送节点是否存在、是否被网站切换成停止或语音控件、计算样式和可见矩形是否正常、祖先是否裁切，以及按钮中心和内部两侧实际命中的元素。若是遮挡，保存遮挡元素、堆叠上下文和可逆的临时样式验证；若未复现，记录具体场景，不推断为重叠。 |
| P0 | 宽度与垂直贴合 | 队列只有一处。以原生输入框外壳的可见上沿为基准，圆角时取可对接的直边；左右边各相差 ≤1 CSS px，输入框上沿减去队列下沿为 0 CSS px（测量允许 ≤1 CSS px 子像素差）。没有可见空隙、内容重叠或横向滚动；原生输入框外壳不会被挤窄。队列从空态到多条长文本时仍满足。 |
| P0 | 两个入口都可见、可用 | 在网站本应显示发送按钮的状态，以可发送草稿验证原生「发送」和皇冠各恰好一个，可见区域无重叠，按钮中心和内部两侧各自命中，Tab 可独立聚焦且焦点可见。窄窗需要换位时两个入口仍可达；不能靠隐藏任意一个通过。原生改为「停止」时，停止和皇冠均可操作；生成结束后自然恢复原生发送入口。 |
| P0 | 动作实际分流且保留草稿 | 专用测试对话实点原生发送：恰好一次，且不建立队列条目；已有对话中实点皇冠：走原入队逻辑，生成中不提前发送。测试暂停入队时，提交次数为零、条目可见、恢复图标可操作、无「已暂停」文字；原生首条建会话前按既有站点规则，皇冠不代发、不丢草稿。保持原生停答、IME 与现有发送保护。只用合成测试消息。 |
| P0 | 响应式与输入状态 | 真站至少核对 ChatGPT、Gemini；DeepSeek 在当前候选已有挂载的正式对话路由也核对，并单列无登录或未挂载的结果。覆盖 1280/390 CSS px、桌面到窄窗再返回、空队列、有待发、可发送草稿、生成中及结束后；现有支持 320px 的场景另复核挤压和命中。新聊天、已有对话按各站实际支持范围取样。 |
| P0 | 独立 UI 视觉专家终评 | 由非实现者看同一候选的真实页面截图和交互证据，按「宽度、贴合及圆角」「双入口识别与视觉层级」「窄窗及状态切换稳定性」「焦点、对比与可读性」四项各打 100 分，逐项 **≥95/100**。证据需同时展示整块输入区及局部，包含桌面与窄窗、空态和待发状态；候选支持浅深主题时各给样本。任何核心实站用例 FAIL 或 NOT_TESTED，即使分数达标也不结项。 |

证据绑定实际运行的网页模块版本和候选，标注站点、视口、草稿及回复状态；保存测量、命中结果、操作回执和专家扣分意见。先复现并验证临时布局调整，再做最小源码修复、复测和终评。旧版截图、离线夹具或实现者自评可以诊断，不能抵作终评。

预查记录（不计入候选验收）：ChatGPT 空草稿时显示原生语音入口；输入合成草稿后，原生发送和皇冠均出现，在 1280、390、320 CSS px 的各三个内部采样点分别命中。没有复现皇冠遮挡原生发送。Gemini 旧布局桌面实测垂直间距为 6 CSS px；一次缩窄时，按钮仍存在，拦截点击的是 Gemini 自己的抽屉遮罩，临时隐藏 OpenDesk 控件后拦截仍在。关闭抽屉后，两个按钮分别命中；在 390 CSS px 临时调整队列宽度和间距后，左右边与垂直间距的误差均为 0 CSS px。正式候选仍须重新验证。下文旧轮次与整包验收属于各自候选，不作为本轮视觉证据。

**持续开发候选 0.1.51/r50。** 正式 JSON 与开发目录包 SHA-256 均为 `6e34998db7bb141b1628dc7bb1d58cd80687b0c9b34029af97237ec8f9199090`；51 项视图、Gemini 站点与发送保护检查及 2 项包检查通过。三站专用对话的固定脚本经浏览器调试器读回，均与 [开发输出哈希](artifacts/composer-ui-20261124/v51-runtime-identity.json) 逐字匹配。此证据不代表普通标签已刷新、候选已单独安装或生产已验收。

| 实测 | 0.1.51 结果 |
| --- | --- |
| 有草稿，390 CSS px | [ChatGPT](artifacts/composer-ui-20261124/v51-chatgpt-controls-390.json)、[Gemini](artifacts/composer-ui-20261124/v51-gemini-controls-390.json)、[DeepSeek](artifacts/composer-ui-20261124/v51-deepseek-controls-390.json) 的左右直边及垂直误差均 0 CSS px，两个按钮相距 6 CSS px、各三点独立命中，Tab 均有独立可见焦点，队列无横向溢出。 |
| Gemini 原暂停 UI | [窄窗](artifacts/composer-ui-20261124/v51-gemini-390-light-paused.png)与[桌面](artifacts/composer-ui-20261124/v51-gemini-1280-light-paused.png)均无暂停标签，恢复图标与保护状态保留，暂停消息提交数 0；实测接缝与左右差值均为 0 CSS px。深色媒体 emulation 只确认队列配色，Gemini 原生页面仍为浅色。 |
| 原生发送及停止 | [Gemini 当前候选](artifacts/composer-ui-20261124/v51-gemini-native-verified.json)实点原生发送，合成消息在站点历史中出现一次；点击前队列有原暂停条目，本次未捕获到可点击停止的证据。更早候选的停止实点不能计入本轮。 |

320 CSS px、切换和停止的历史样本用于诊断；未把旧版、Gemini 抽屉遮罩、ChatGPT 的空草稿原生语音态或「结果未知」记录算作本候选的暂停/双发送通过样本。

**独立视觉评审：未达逐项 95 分。** 宽度贴合及圆角 **97**、双入口识别与视觉层级 **90**、窄窗与状态切换 **90**、焦点、对比与可读性 **91**。DeepSeek 两个蓝色上箭头不易一眼区分；同候选的连续缩放、生成中停止操作和焦点、整站深色仍缺证据。评审后另验证了本候选 Gemini 原生单发一次（见上表），不据此提高专家评分。保留原图标和暂停交互，本轮不重画。

## 当前候选接续预检：0.1.37 / r36（2026-11-22 01:05，中国标准时间）

- **磁盘身份已核对。** `main` HEAD 为 `13936b528`，原 watcher PID 79176 同时监听 43119（开发服务）和 43120（输出守卫）。工作树唯一正式包与 `dist/development/official-tools` 中的预装副本逐字节一致：应用 `ai-send-queue` 0.1.37，网页模块 `app.ai-send-queue` r36，包 SHA-256 `4970d71603648bde9d0e850ecf17010a21c226824e94e0f6230ce11f7275b282`。磁盘更新清单 revision 为 `96f250d6f5c904c3738a965393cf5ffaa002f68e083df5cdc15a3ce5d01faf0c`；Chrome 的实际 applied revision、新版安装审阅身份和固定桥均待实读。以上标识须在正式采样前重查。
- **运行验收尚未开始。** Ego Lite TaskSpace 14 仍为 `agentDelegatedToUser`；专用对话的归档目标哈希为 `99db9372c7f7`。本次只读取空间归属，未接管、查看其他标签、触碰文件框，或改变安装、站点权限、草稿及队列。上次观察到的文件框归属和另外两张 ChatGPT 标签的草稿、待发及流式状态仍待用户处理或确认；2026-11-22 的旧安装登录、侧栏与权限读回记录保留在下节，不能计入新版。
- **刷新：NOT_TESTED。** 计划 20 次，执行 0 次，有效样本 0，通过 0/20，通过率 NOT_TESTED；尚无挂载慢、缺挂载或重复实例样本。**入队、暂停、草稿、流式、安装路径、停用与撤权：NOT_TESTED。真实 FIFO 发送：NOT_TESTED，0 条。独立专家评分：NOT_TESTED。**

01:07 追加包同源检查：原打包器 `--check-project` 返回 `PROJECT_PACKAGE_MATCH`（142651 字节；SHA-256 同上，`installed: false`）。原 watcher 仍在运行，磁盘清单已更新为 `51b21da95538c06068d4860a6c309ed06cc41e02a087854f1a4b31bb2bd1c398`；这次磁盘更新也没有 Chrome applied revision 读回。

## Ego Lite 登录接续（2026-11-22）

**PASS（登录、旧安装实体侧栏就绪）；NOT_TESTED（0.1.36 正式轮）。** 改回用户已有的 Ego 登录入口，TaskSpace 14 的网页能看到账号菜单，并从历史 FIFO 实测回执打开原专用测试对话（脱敏目标 `99db9372c7f7`）。可操作输入框、单皇冠、单生命周期、单队列，空草稿、零条目，无流式回复。Ego 与其他空间共用 Profile；没有导入 Cookie 或改账号。实体侧栏「扩展 → AI 消息发送队列 → 重新检查」实读应用仍为 0.1.34，并显示「队列已就绪」。扩展实际 applied revision 与当时 watcher 磁盘产物一致；实读 `chrome.userScripts` 不可用、ChatGPT 网站权限已授予。旧侧栏未读回网页固定桥的精确模块版本。详见[脱敏预检回执](artifacts/refresh-20-ego-20261122/ego-preflight.json)。

使用旧安装实做 **1 次校准刷新**，零发送。导航后约 1.781 秒观察到单实例和可操作控件；该次读取时 URL 恰逢页面过渡，稍后读回原专用对话。刷新过程中同一 watcher 从 `4480f8410eb4` 发布到 `1ec78bc88ae5`，且当时没有该新文档的实体侧栏就绪及模块版本联合证据。该次保留为诊断，不计正式轮：[校准回执](artifacts/refresh-20-ego-20261122/old-install-refresh-calibration.json)。

**正式轮：计划 20，执行 0，有效样本 0，成功率 NOT_TESTED，真实发送 0 条。** 下方 CFT 验证页仅为历史分流记录，Ego 登录无需重新验证。

**当前候选升级预检（00:31，中国标准时间）：NOT_TESTED。** 仍使用原 watcher PID 79176、端口 43119/43120、原 dist/development。Ego 已登录；扩展存储实读旧安装 0.1.34/r33，Chrome 网站授权正常、「允许运行用户脚本」关闭。候选 0.1.36/r35 的包 SHA-256 未变化；当时磁盘 revision 为 fb3ad58ca7d6756f35b1f5e32a8263a498a3b4b3b2c4f9bb9caf036276f45af9，新版实际 applied revision 和网页桥未取得。Chrome 在共享 Profile 中查到本任务专用标签 1 张、其他 ChatGPT 标签 2 张；只记录计数，未导航、刷新、修改或发送到这些标签。

在同一测试标签的实体侧栏进入「扩展 → 筛选和管理扩展 → 导入扩展… → 选择安装包」。文件选择器实际路径读回后出现预期外输入，停止在文件选择器，未导入、未提交安装、停用或站点撤权。共享 Profile 上的升级、停用和网站访问更改会影响其他标签上的队列，其他标签是否有待发内容尚未核实。[脱敏预检回执](artifacts/refresh-20-ego-20261122/candidate-upgrade-precheck.json)

**登录运行态复核：PASS（Ego 登录、开发 revision、Chrome 站点访问）；NOT_TESTED（候选应用）。** 专用对话在 Ego Lite / Chromium 156.0.8078.96 中仍有账号菜单、可见且为空的输入框，并识别出 8 个会话轮次节点；无附件或流式停止控件。Chrome 实读运行中扩展已应用 revision `fb3ad58ca7d6756f35b1f5e32a8263a498a3b4b3b2c4f9bb9caf036276f45af9`，与原 watcher 磁盘清单一致；ChatGPT 站点访问允许，`chrome.userScripts` 不可用，但同一 Profile 的应用仍是 **0.1.34**。此次专用旧文档未观测到皇冠、队列或生命周期，桥版本不可读；这是旧安装只读观察，不计新版刷新失败或缺挂载。实体文件选择器在切回专用标签后仍占据前台，不能确认归属，未选择文件或提交安装；扩展报告的实体侧栏上下文也不能唯一归到专用窗口。另两张同站标签都未被丢弃，只读了标签状态计数，未核对草稿、队列或回复。正式轮仍为 **0/20 已执行、0 个有效样本、成功率 NOT_TESTED、真实发送 0 条**。[脱敏运行态复核回执](artifacts/refresh-20-ego-20261122/ego-runtime-recheck.json)

**旧安装授权复核：PASS（旧授权记录和站点权限）；未观测到本次旧文档挂载。** 在同一个已登录专用标签，Chrome 实读活动顶层文档与目标精确匹配；站点访问获准，`chrome.userScripts` 不可用。已安装应用为 `ai-send-queue` 0.1.34，网页模块 `app.ai-send-queue` r33。持久化网页授权已审阅、`active`、启用、原生状态记录为 `registered`、无错误码；来源与现有安装一致且在固定桥已审阅范围内，父安装 epoch 匹配；未发现独立旧队列安装记录。该次文档皇冠、生命周期、队列均为 0，网页桥版本未读到。因此授权记录、过往侧栏就绪和当前网页实际可用仍须分别判断，这次观察不计新版刷新失败。前台原生「打开」选择框仍在，显示的目录为 `webflow`，无法绑定到本任务导入；未操作该窗口，未提交 0.1.36 升级，未改权限。[脱敏旧安装授权回执](artifacts/refresh-20-ego-20261122/ego-old-install-authority-recheck.json)

再次只读核对同一脱敏文档 `537dcee595e0`：登录态和专用目标未变，可见编辑器为空、无附件和流式回复；页面仍无队列或生命周期，无法从界面读回条目数，故没有执行额外诊断刷新。

**续跑检查（中国标准时间 11 月 22 日）：** 原唯一 watcher（PID `79176`，端口 `43119/43120`）仍在运行，磁盘已发布 revision `de94cc6d3253c4d3958d4eafe747d5731e4b01f0b1aaf1279a050c4352b7670a`，清单 155/155 文件哈希匹配。0.1.36 包与项目正式包逐字节一致（SHA-256 `1ec95a60090cdf098a5bc8e81883170abe86ff033b9230ba5a01e341bf536105`），固定桥产物哈希仍为 `85b4401c23f45fe6f2b0a46ffbe223e13b0fe8d8ff6c54cb7cbdd65fb3ed6a0b`。这是磁盘证据；最新 revision 的运行中应用与网页桥仍未读回。原生文件选择框仍停在 `webflow`，Ego TaskSpace 14 仍交由用户操作。未接管窗口、未修改安装或权限、未刷新或发送。

| 当前登录验收 | 状态 |
| --- | --- |
| 同候选安装、applied revision、网页桥、权限联合读回 | NOT_TESTED |
| 连续 20 次刷新：两秒就绪、挂载、单实例、控件、侧栏和错误码 | NOT_TESTED（0/20 已执行；无有效样本） |
| 点击、Ctrl+Enter、Shift+点击、暂停及恢复、流式与草稿保护 | NOT_TESTED |
| 两条同对话 FIFO、各一次及回执后移除 | NOT_TESTED（真实发送 0 条） |
| 应用停用、Chrome 撤权、草稿与恢复后单实例 | NOT_TESTED |
| 默认预装、合法旧安装直接使用、手动新装、升级 | 旧安装的侧栏就绪 PASS；其余新版登录项目及旧安装发送均 NOT_TESTED |

## 20 次登录刷新验收：当前开发版（2026-11-21）

**登录刷新：NOT_TESTED。** 计划 20 次，实做 **0 次**，有效样本 **0 个**。通过次数、成功率、逐次耗时、缺挂载、晚挂载和重复挂载均未测。真实发送 **0 条**。访客证据不计入登录刷新轮。

**本对话接续预检（23:54，中国标准时间）：当前登录 NOT_VERIFIED。** 复用了 `main` 上原唯一 watcher（PID `79176`，服务 `43119`、输出守卫 `43120`），磁盘 155/155 个文件匹配发布清单，发布包与项目正式包逐字节一致。重新领取空闲的 `test-chatgpt-02`，用有界面的 Chrome for Testing `154.0.8037.92` 从原 `dist/development` 启动。扩展后台实读 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，`chrome.userScripts` 不可用、ChatGPT host 权限查询为 `true`。可见首页截图确认 Cloudflare「请验证您是真人」，页面没有账号菜单或会话输入框；Chrome 未打开实体侧栏，登录候选的安装身份、applied revision、实际网页桥及同文档权限仍为 **NOT_TESTED**。[接续预检回执](artifacts/refresh-20-cft-20261121/continuation-login-preflight.json) · [真人验证截图](artifacts/refresh-20-cft-20261121/continuation-login-gate.png)

Ego 打开了普通首页，但 TaskSpace 共用 Profile，未建立独立登录或 Chrome 专项证据，空间已释放。11 月 13 日的 5/5 来自 Ego 与旧 `0.1.26/r25`，且以输入框出现为计时起点；旧 CFT 临时 Profile 目录不在，均不能用于本轮。未导入 Cookie、未打开其他对话、未触发刷新样本或发送。专用 CFT 窗口保留供用户正常验证／登录，自动化 UI 锁已释放。

**刷新探针预检：PASS（仅计数和目标保护）。** 探针在每次刷新前后校验候选 revision 与目标权限，分别记录尝试、已确认刷新、有效样本以及晚挂载、20 秒未观测挂载和重复；中断轮次保留实际结果，不发布 20 次通过率。语法和空样本、部分样本、完整轮次、候选漂移的汇总检查通过。再次只读绑定同一 CFT 标签时仍为真人验证首页；探针拒绝把首页当作测试对话，前后文档一致。登录页面校准和真实计时仍是 **NOT_TESTED**。[目标保护及复查回执](artifacts/refresh-20-cft-20261121/continuation-target-guard.json)

**登录门槛第 3 次确认（11 月 21 日 23:59，中国标准时间）：** 同一运行中的专用 CFT、同一标签与上一轮同一文档仍为真人验证首页，无账号菜单、输入框或专用测试对话。真实登录验收阻塞在人工验证和测试对话就绪，20 次正式采样未启动。[阻塞回执](artifacts/refresh-20-cft-20261121/continuation-login-blocked.json)

**来源对话预检（23:34，中国标准时间）：** 来源对话在隔离 CFT `154.0.8037.92`（专用槽 `test-chatgpt-02`）确认 Cloudflare「请验证您是真人」，随后归还槽位。初次预检读回扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、用户脚本不可用和 ChatGPT 站点访问已授予；只读复查只确认了验证页及磁盘 revision。未进入独立登录测试对话，未开始刷新计时。[真人验证截图](artifacts/refresh-20-cft-20261121/login-human-verification.png) · [初次预检回执](artifacts/refresh-20-cft-20261121/login-preflight.json) · [来源只读重查](artifacts/refresh-20-cft-20261121/login-gate-recheck.json)

**开发发布已恢复：PASS（磁盘），登录文档实际生效 NOT_TESTED。** 原 watcher PID 76260 退出后，由实际 owner 在 `main` 使用原 `npm run dev` 恢复唯一 watcher（PID 79176）；只读确认开发服务 43119 和输出守卫 43120 均由它监听。原 `dist/development` 发布 revision `3c83d8144d48aea6fe7b7cc752644426bc551efde75b10e73d406bc85fb8a6aa`，155 个文件的 SHA-256 全部匹配。固定桥 SHA-256 为 `85b4401c23f45fe6f2b0a46ffbe223e13b0fe8d8ff6c54cb7cbdd65fb3ed6a0b`，发布的 0.1.36 包与唯一正式包逐字节相同。下文的实体侧栏 applied revision 属于各自的访客实测。[恢复及发布回执](artifacts/refresh-20-cft-20261121/watcher-restored.json)

**固定桥发布与版本一致性：PASS（访客新文档，复测）**。已和改动 Reading TOC 生成文件的 owner 核对：原文案与生成物一致，审查 pin 与实际 Git blob 均为 `eaff0dfa2f57a2a1b6344963d7599037995786df`。原 watcher（PID 76260）在同一进程重启构建服务并发布；155 个清单文件逐一核对相符，验证前后清单相同。实体侧栏显示已应用 revision `a9fa85b0d640c4b7fd6cbcbaaef230a1d6f730e325a136b5318a1519f65d4f12`，默认预装 `ai-send-queue` 0.1.36 已启用。唯一正式包的网页模块 `app.ai-send-queue` 为 r35，发布副本与正式包逐字节相同。独立访客 CFT 154.0.8037.92、用户脚本关闭、ChatGPT 站点授权有效。真实点击「重新检查」后，目标和 loader 不变，网页桥实读 **0.1.36**，单 lifecycle。访客没有受支持的输入框或皇冠，侧栏显示「输入框暂不可用」，没有 `E_USER_SCRIPTS_UNAVAILABLE`。[侧栏安装](artifacts/refresh-20-cft-20261121/guest-republished-install.png) · [新版网页桥读回](artifacts/refresh-20-cft-20261121/guest-republished-recheck.png) · [机器回执](artifacts/refresh-20-cft-20261121/guest-republished.json) · [发布核对](artifacts/refresh-20-cft-20261121/publication-republished.json)

重发后的首次访客探测在[重查按钮过渡状态](artifacts/refresh-20-cft-20261121/guest-republished-button-race.json)中断，未取得真实点击或桥读回。定向 Node 检查 6 项通过：用户脚本关闭时固定模块的精确文档绑定、Chrome 站点阻止、拒绝接管旧实例与未审阅身份、合法旧安装和普通模块的分类、授权前草稿保留。Node 结果不覆盖登录 UI 项目。

环境：现有 `npm run dev` watcher（PID 76260）和 `dist/development`。Chrome for Testing 154.0.8037.92，独立访客 Profile，Chrome 实体 `SIDE_PANEL`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；`chrome.userScripts` 不可用，Chrome 已授予 ChatGPT 站点访问。此次未重读 Chrome 网站访问枚举；下方上一轮记录中的 `ON_ALL_SITES` 仅属该轮。Ego TaskSpace 共用 Profile，不能提供此专用登录与 Chrome 权限证据。

| 项目 | 本轮结果 |
| --- | --- |
| 默认预装、实体侧栏 | **PASS（访客）**：默认预装 `ai-send-queue` 实读 0.1.36、已启用。正式包内 `app.ai-send-queue` 修订为 r35，磁盘发布副本与正式包逐字节相同。[安装截图](artifacts/refresh-20-cft-20261121/default-installed.png) |
| 同一访客标签重查 | **PASS（访客降级提示）**：新访客文档中，经「扩展 → AI 消息发送队列 → 重新检查」捕获真实点击，目标文档 loader 未变，点击后观测到 1 个队列生命周期标记、没有皇冠或受支持的输入框，侧栏显示「输入框暂不可用」。诊断未显示 `E_USER_SCRIPTS_UNAVAILABLE`。[重查截图](artifacts/refresh-20-cft-20261121/guest-recheck.png) · [机器回执](artifacts/refresh-20-cft-20261121/guest.json) |
| 发布与新文档版本一致性 | **PASS（访客，新 revision，见上方）**。**保留旧发布 FAIL**：实体侧栏已应用 revision `7ec5e7f98c9774b3f64b924bfe44909287017026d5226e5d3ca278428e969d06`，访客新文档仍报告 **0.1.35**。随后磁盘发布 revision `b96ac0d64ff1655b294a69df8e6480ca44e349f296f1deae0b603dc047b8a21b` 的 155 个文件全部匹配清单，固定桥 SHA-256 仍为原 0.1.35 的 `2e83984f8c64fc81758cb65f09f64d85584a0ab4a46c786da6eda8c07f66be19`。磁盘 revision 未在 Chrome 再读回。[磁盘及来源回执](artifacts/refresh-20-cft-20261121/publication.json) |
| 刷新、挂载与就绪 | **NOT_TESTED（登录）**：同一独立测试对话连续刷新 20 次，每次从导航开始计时，2 秒内单皇冠、单实例、控件可操作、侧栏「队列已就绪」、无 `E_USER_SCRIPTS_UNAVAILABLE`。超 2 秒记失败；记录晚挂载与等 20 秒仍未挂载的区别，不补刷抵消。无逐次数据。 |
| 入队和等待 | **NOT_TESTED（登录）**：点击、Ctrl+Enter、Shift+点击暂停入队，暂停期间零发送及显式恢复，流式回复期间等待，普通及纯空白草稿逐字保留和等待原因。 |
| 真实发送和回执 | **NOT_TESTED（登录）**：两条不同的无害文本按 FIFO 各出现一次，收到同一对话回执后才移除对应行。逐次提交前读回目标和准确文本，未知回执只读核对。 |
| 停用、Chrome 网站撤权与恢复 | **NOT_TESTED（新版登录）**：用暂停项验证旧文档不能再入队或发送、侧栏不误报就绪、草稿保留，以及恢复后新文档只有一个实例。 |
| 手动审阅文案 | **PASS（访客实体侧栏）**：已验证 0.1.36 固定队列包与普通「自由复制」包都走原导入审阅。固定队列只写 Chrome 网站访问条件；普通模块仍说明「允许用户脚本」。Chrome 用户脚本关闭，ChatGPT host 权限已授予。设置页已确认默认预装为 0.1.36。侧栏实读本次文案候选 applied revision `eae789f85d9c6101aeb9247dab7a5aa71918ad137e20807827890da5fe3e81b5`。[队列审阅截图](artifacts/refresh-20-cft-20261121/guest-review-queue.png) · [普通模块截图](artifacts/refresh-20-cft-20261121/guest-review-ordinary.png) · [机器回执](artifacts/refresh-20-cft-20261121/guest-review-copy.json)。 |
| 合法旧安装直接使用 | **NOT_TESTED（新版登录）**：保留历史访客证据；不能用旧访客环境替代当前登录验收。 |
| 手动升级 0.1.34 → 0.1.36 | **PASS（访客原审阅及版本读回）**：先在本轮访客 Profile 内通过原「恢复卸载清理」完成清理，重新审阅并确认 0.1.34 安装；版本读回后，再审阅本地包升级。升级页显示当前与新版本、权限无变化以及 Chrome 网站访问条件；可信点击确认后读回 0.1.36。[升级审阅](artifacts/refresh-20-cft-20261121/guest-review-upgrade.png) · [升级后设置](artifacts/refresh-20-cft-20261121/guest-review-updated.png) · [旧包安装与显式清理回执](artifacts/refresh-20-cft-20261121/guest-old-install-and-cleanup.json)。登录验收 **NOT_TESTED**。 |
| 手动新装 0.1.36 | **PASS（访客原审阅及版本读回）**：从该访客 Profile 的无队列安装状态导入唯一正式包，核对新装审阅和 Chrome 网站访问条件；可信点击后读回 0.1.36。[新装审阅](artifacts/refresh-20-cft-20261121/guest-review-new.png) · [新装后设置](artifacts/refresh-20-cft-20261121/guest-review-new-installed.png) · [新装和升级回执](artifacts/refresh-20-cft-20261121/guest-manual-verified.json)。登录验收 **NOT_TESTED**。 |

两次早先的访客诊断未取得点击回执，分别保留[控件定位中断](artifacts/refresh-20-cft-20261121/guest-attempt-before-stable-target.json)和[等待超时](artifacts/refresh-20-cft-20261121/guest-attempt-during-dev-update.json)；两次均不计登录刷新样本。

审阅显示仅复用现有固定来源判定；未改确认、站点权限请求或事务。[12 项定向 Node 检查](artifacts/refresh-20-cft-20261121/review-targeted-node.txt)通过，包括精确文档、Chrome 网站撤权、未审阅身份拒绝、权限拒绝、伪造点击、来源散列和并行变更后作废审阅；不计登录样本。

**审阅修复后的同一开发候选再核对固定桥：PASS（仅访客）。** 实体侧栏已应用 revision `eae789f85d9c6101aeb9247dab7a5aa71918ad137e20807827890da5fe3e81b5`，与手动新装和升级一致；本轮复测前后发布清单相同。在独立访客新文档可信点击「重新检查」，侧栏读回网页模块 0.1.36、同一 loader、单生命周期、无 `E_USER_SCRIPTS_UNAVAILABLE`；访客没有受支持的输入框，显示「输入框暂不可用」。[网页桥回执](artifacts/refresh-20-cft-20261121/guest-current-bridge.json) · [截图](artifacts/refresh-20-cft-20261121/guest-current-bridge.png)。

下一步：在已保留的专用 Chrome for Testing 窗口由用户完成真人验证（必要时正常登录），并打开一个空闲、无遗留草稿或暂停条目的独立测试对话。随后在同一候选的登录新文档重新核对安装、applied revision、固定桥、用户脚本关闭及正常站点权限，再开始 20 次正式采样。未接管 watcher、未更改其他 Profile。

## 当前开发版：真实侧栏与访客网页复测（2026-11-21）

**登录验收未完成。** 新 Profile 装的是 0.1.36 / r35，但 ChatGPT 新文档实际回报网页模块 0.1.35。本轮发送 **0 条**。

环境：Chrome for Testing 154.0.8037.92，全新隔离访客 Profile，Chrome 实体 SIDE_PANEL。从仓库现有 `dist/development` 加载扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`。Chrome「允许运行用户脚本」关闭（`chrome.userScripts` 为 `undefined`），初始网站访问 `ON_ALL_SITES`，ChatGPT Host 权限已授予。应用 ID `ai-send-queue`，网页模块 ID `app.ai-send-queue`。

| 操作 | 结果与证据 |
| --- | --- |
| 默认预装与真实重查 | **PASS（访客侧栏）**：从「扩展 → AI 消息发送队列」实读已安装 0.1.36，点击「重新检查」后显示「输入框暂不可用」和登录／打开对话提示。[安装版本](artifacts/handoff-cft-20261121/default-installed.png) · [重查截图](artifacts/handoff-cft-20261121/guest-recheck.png) |
| 网页模块挂载及版本 | **PASS（0.1.35 访客挂载）**：新文档有一个队列生命周期标记，没有支持的会话输入框或皇冠。**FAIL（当前开发版运行一致性）**：侧栏诊断明确报告 0.1.35，未执行 0.1.36 网页模块；独立新 Profile 已排除只是旧标签未刷新。[Chrome、安装、网页和磁盘回执](artifacts/handoff-cft-20261121/current-guest.json) |
| 旧安装直接使用 | **PASS（0.1.34 安装、访客范围）**：仅在测试 Profile 卸载默认预装，使用提交 `570a196c9` 的原始 0.1.34 包走手动审阅后安装。保留该安装、不升级，在用户脚本关闭时新开文档仍挂载一个队列模块，真实侧栏重查显示「输入框暂不可用」。Ego 共用 Profile 也实读为 0.1.34，本轮未改动其安装；Ego 的重查采样仍在连接中。[安装版本](artifacts/handoff-cft-20261121/guest-old-installed.png) · [访客重查](artifacts/handoff-cft-20261121/guest-old-installed-recheck.png) · [Ego 回执](artifacts/handoff-cft-20261121/ego-readback.json) |
| 手动选择正式包并更新 | **PASS（手动更新）**：从「扩展 → 导入扩展」选择唯一正式包，审阅由 0.1.34 到 0.1.36、权限未变化，点击「确认更新」后设置实读 0.1.36。**FAIL（审阅提示）**：审阅仍错误要求开启「允许用户脚本」。此次手动操作是升级；0.1.36 无旧包的手动新装 **NOT_TESTED**。[审阅截图](artifacts/handoff-cft-20261121/guest-local-update-review.png) · [更新后版本](artifacts/handoff-cft-20261121/guest-local-update-installed.png) · [手动回执](artifacts/handoff-cft-20261121/guest-manual.json) |
| 应用停用、恢复与重查 | **PASS（访客生命周期）**：停用后同文档实例 1→0，列表显示「已停用」。启用后重查原文档恢复为 1，刷新后的新文档也只有 1 个实例。刚刷新后一次重查显示「暂时无法确认网页」，按提示切回同一标签后重查恢复为「输入框暂不可用」。未取得该次瞬态错误码。[停用截图](artifacts/handoff-cft-20261121/guest-disabled.png) · [暂时无法确认](artifacts/handoff-cft-20261121/guest-restored.png) · [恢复回执](artifacts/handoff-cft-20261121/guest-lifecycle.json) |
| Chrome 网站撤权和恢复 | **PASS（访客生命周期）**：Chrome 禁止扩展访问 `https://chatgpt.com` 后，旧文档实例 1→0，侧栏显示「暂时无法连接网页」。移除阻止规则并刷新，新文档只有一个实例；重查显示「输入框暂不可用」。本轮访客无可用草稿框，也没有暂停队列条目，未验证草稿与发送围栏。[撤权截图](artifacts/handoff-cft-20261121/guest-revoked.png) · [恢复截图](artifacts/handoff-cft-20261121/guest-permission-restored.png) · [权限回执](artifacts/handoff-cft-20261121/guest-permission.json) |
| 登录网页的皇冠与就绪 | **NOT_TESTED**：用户脚本关闭时仅一个皇冠、侧栏「队列已就绪」、登录路径无 `E_USER_SCRIPTS_UNAVAILABLE`。 |
| 入队、暂停与恢复 | **NOT_TESTED**：点击、Ctrl+Enter、Shift+点击暂停入队，暂停期间零发送，显式恢复。 |
| 真实发送、草稿与防重 | **NOT_TESTED**：流式回复期间等待，普通／纯空白草稿逐字保留并提示原因，两条消息按 FIFO 各到达一次、仅收到对应回执后退队，以及有暂停条目时停用／撤权阻止旧文档继续入队或发送。 |

开发服务已连接，实体侧栏实读应用 revision `5b47b77c2aac994096e9fc652ec0d7a5b1423d263a1020a760b0f4acfcdfe402`。清单 155 个文件的 SHA-256 均与磁盘一致。Catalog 中唯一正式包 SHA-256 为 `1ec95a60090cdf098a5bc8e81883170abe86ff033b9230ba5a01e341bf536105`，固定网页桥仍为 `2e83984f8c64fc81758cb65f09f64d85584a0ab4a46c786da6eda8c07f66be19`。现有 watcher 日志记录过队列源文件与固定构建校验不一致；复查队列三处变更文件已匹配当前校验记录。最近失败还涉及并行的 Reading TOC `projects/reading-toc/trusted/locales.generated.js`（实际 Git blob `eaff0dfa2f57a2a1b6344963d7599037995786df`，校验要求 `e494a458a006adeb90697aca8dd8957bc90e2ef3`），尚无新网页桥发布证据。审阅提示缺陷位于 `src/ui/sidebar-tools.js` 的并行改动段，修复应复用现有 `usesFixedSendQueue` 判定并保留普通网页模块的要求及原审阅链；本轮未改该段、来源校验或 watcher。

三个登记的专用登录槽均有其他任务租约，虽然无运行 PID。没有接管、导入 Cookie 或打开用户原对话。Ego 任务空间及本轮访客 CFT 已释放。后续需由原 owner 释放一个合法登录槽，并让现有 watcher 发布可验证的新网页桥，才可完成同候选登录链和独立评分；本轮未评分。

## 侧栏正确入口与文案复测（2026-11-21）

正式入口是「扩展 → AI 消息发送队列」，应用 ID 为 `ai-send-queue`，网页模块 ID 为 `app.ai-send-queue`。历史提交 `fe285287a` 合并了网页皇冠与侧栏的发行，`5cb7745c0` 移除侧栏里重复的队列管理，`6dcaa9c30` 给同一侧栏增加只读检查。仓库和 Catalog 各只有这一正式应用入口；网页仍是唯一可以管理队列的地方。

| 操作 | 结果和证据 |
| --- | --- |
| 从实际扩展列表打开旧安装 | **PASS（定位并复现）**：Ego Lite 0.6.3.14 共用 Profile，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；列表一个「应用」入口，设置实读 0.1.34。在任务专属非 HTTP(S) 页，状态区显示「未找到当前网页」「重新检查」和宿主 HTTP(S) 错误；独立的常驻说明区显示「在 ChatGPT 网页中使用」和皇冠快捷键说明。没有复现连在一起的「之前扩」。[回执](artifacts/sidebar-ego-20261121/installed-before.json) · [截图](artifacts/sidebar-ego-20261121/installed-before.png) |
| 0.1.36 侧栏界面 | **PASS（ego 同源候选预览）**：使用候选包内 HTML/CSS/JS 和开发版共享 React，宿主只读响应为模拟。非 HTTP(S) 和其他站点均只显示「请打开 ChatGPT」，没有重查按钮、重复说明或宿主错误；导航未完成单独提示等待；访问失败和无输入框仍可重查；点击后可恢复就绪，切走后立刻清除旧就绪。7 个场景通过。[回执](artifacts/sidebar-ego-20261121/candidate-ui.json) · [默认态](artifacts/sidebar-ego-20261121/candidate-non-web.png) · [就绪态](artifacts/sidebar-ego-20261121/candidate-ready.png) |
| 正式包同源及权限 | **PASS**：[唯一正式包](ai-send-queue.opendesk-tool.json)已晋升到 0.1.36 / r35；SHA-256 `1ec95a60090cdf098a5bc8e81883170abe86ff033b9230ba5a01e341bf536105`。45 项定向回归及 `--check-project` 通过；新旧 0.1.36 候选的完整 Page 模块一致，未增加权限或第二个发送器。 |
| Ego 共用 Profile 的新版生效 | **NOT_TESTED**：再次从真实「扩展」入口实读仍装 0.1.34。列表的 1 项待更新属于 Cookie Editor；开发面板没有已授权本地项目。未改共用安装。 |
| 0.1.36 默认预装与真实侧栏 | **PASS（Chrome SIDE_PANEL，非网页及 ChatGPT 访客页）**：从实际「扩展 → AI 消息发送队列」打开，设置实读 0.1.36。非 HTTP(S) 标签页只显示「请打开 ChatGPT」，没有原说明区、HTTP(S) 错误或重查；切到 ChatGPT 访客页，显示「输入框暂不可用」和「重新检查」，点击后再次收到真实网页回执。[非网页截图](artifacts/sidebar-ego-20261121/installed-cft-queue-full.png) · [访客重查截图](artifacts/sidebar-ego-20261121/installed-cft-chatgpt-full.png) · [已安装版本](artifacts/sidebar-ego-20261121/installed-cft-settings-full.png) · [脱敏回执](artifacts/sidebar-ego-20261121/installed-cft-visible.json)。 |
| 0.1.36 网页运行、手动审阅及真实发送 | **NOT_TESTED**：访客页实际运行固定网页模块 0.1.35，模块实例 1、皇冠 0。未验证新版网页模块、手动更新、已有合法旧安装直接生效、登录页、入队及发送；0 条真实发送。 |

本轮 Chrome 专项使用全新未登录的独立 CFT Profile（无界面模式中的 Chrome 原生 `SIDE_PANEL` 上下文），不动 Ego 共用 Profile。Chrome `154.0.8037.92` 从 `dist/development` 加载未打包扩展，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。「允许运行用户脚本」关闭、API 为 `undefined`，Chrome 网站权限为 `ON_ALL_SITES` 且 ChatGPT 权限查询为 true。「调试 → 本地开发服务」已连接，实读已应用 revision `5b47b77c2aac994096e9fc652ec0d7a5b1423d263a1020a760b0f4acfcdfe402`。此 revision 的 Catalog 包 SHA-256 与上表唯一正式包相同，而固定 ChatGPT 网页桥 SHA-256 仍为 `2e83984f8c64fc81758cb65f09f64d85584a0ab4a46c786da6eda8c07f66be19`；分别记录侧栏应用和网页运行结果。

## 当前完成情况与 95 分验收门槛（2026-11-21）

**登录验收未完成，独立评分未出。** 0.1.35 / r34 已在真实 Chrome 访客页验证挂载、停用和撤权后的退出与恢复，发送消息数为 0。0.1.36 / r35 侧栏已在隔离 Chrome 以默认预装复测；网页仍运行 0.1.35。新版手动安装审阅及同候选登录链仍待实测。

| 用户操作 | 当前证据 | 还要证明什么 |
| --- | --- | --- |
| 网页挂载、侧栏重查和就绪 | **PASS（0.1.35 访客挂载与诊断）** | **NOT_TESTED**：关闭用户脚本开关，在登录的独立对话显示一个皇冠和「队列已就绪」；新版候选显示正确的导航／重查提示。 |
| 入队、暂停和恢复 | **NOT_TESTED（当前候选登录链）** | 点击、Ctrl+Enter、Shift+点击分别生效；暂停时零发送，显式恢复才继续。 |
| FIFO、防重和草稿保护 | **NOT_TESTED（当前候选登录链）** | 两条合成消息按序各到达一次，确认入站后对应队列行消失；流式回复和用户草稿阻止提前发送，普通与空白草稿逐字保留，有可理解的等待原因。 |
| 停用、网站撤权和恢复 | **PASS（0.1.35 访客旧文档）** | **NOT_TESTED**：用已挂载皇冠且带暂停条目的旧文档证明不能再入队或发送，恢复后新文档只有一个实例。 |
| 更新审阅的开关提示 | **FAIL（0.1.35 宿主审阅 0.1.36）**：[实读回执](artifacts/guest-cft-20261121-d4b949de99fa/guest-final.json)仍要求开启用户脚本。 | 固定队列和需要 Chrome 用户脚本的普通网页模块应分别给出准确提示；共享审阅文案所在行有并行改动，保留原文件待协调。 |
| 安装身份及运行一致性 | **PASS（0.1.35 默认预装身份）** | **NOT_TESTED**：保留合法旧安装并核对其直接生效；分别留存 0.1.36 手动审阅、实际安装身份和同一候选的 applied revision。 |

**继续的前置条件：** 由原 owner 正常释放一个专用登录槽；开发 watcher 重新加载已审阅的来源校验记录，实际发布 0.1.36 固定网页桥，并在 Chrome 侧栏确认已应用。手动安装的提示缺陷另需共享审阅代码 owner 协调修复。发送仅用于专用 Profile 的独立测试对话，不需要提供个人浏览器、对话或 Cookie。

复测完成后，按[历史独立评审的五项维度](ACCEPTANCE-CTRL-ENTER.zh-CN.md#独立评分与收尾)重新评同一候选：输入交互、FIFO 与防重、草稿与异常保护、源码与回归、安装与运行一致性。每项列出证据和扣分；五项算术平均须至少 95/100，且上表的核心真实用例不得留有 FAIL 或 NOT_TESTED。历史的 82.2 分来自旧候选，不计入本次评分。

独立架构预审 **WATCH，未评分**：复算了 0.1.36 候选和 Page 的 SHA-256，并复跑 47 项定向 Node 检查，通过；复核了开发发布清单，仍只有 `sw.js` 与文件不符，磁盘固定网页桥仍是 0.1.35。下一次 Chrome 回执应分开记安装包版本／身份、网页模块实际报告的版本，以及实体侧栏的 applied revision。保留合法旧安装时，安装包的版本与 Browser 编译的网页版本可以不同。

### 0.1.36 / r35：目标切换修复与候选读回

- **PASS（定向 Node / 包身份）**：订阅现有的 `opendesk-page-changed` 事件，目标变化立即让旧的「队列已就绪」失效。进行中的旧请求结束后检查最新目标，旧回执不能覆盖它；没有新增轮询或修改发送权限。定向回归先复现为 `ready` 残留，修复后随身份、正式格式、侧栏契约及状态检查共 **40/40** 通过。独立代码预审曾给出 **REQUEST CHANGES**；目标切换问题已在新版候选处理，尚无对新候选的独立终评。
- **PASS（历史候选，未晋升）**：[旧候选包](../../artifacts/sidebar-tools/ai-send-queue/candidate-page-change.opendesk-tool.json)，应用 `ai-send-queue`，版本 `0.1.36`，网页模块 `r35`，整包 SHA-256 `51e3a39150fa52c75c9180323ae2a668c23b5a6ba2f524695afcfe022ed6297f`，Page packageHash `e5f4fcb967d03bf767ab65d3455e04cdeb836b2c68b85bd08c688fc29dc6dc17`。正式包以本报告开头已晋升的侧栏修订为准。
- **FAIL（0.1.36 固定网页桥的开发发布）**：原 watcher 已再次写入清单；revision `7979256b4a9e4d3f7047fd539a6315e31428c96ee4bb4c46694da1fb7e053a6d` 的 **155/155** 个文件哈希一致，但其中 `agents/chatgpt-fixed-bridge.js` 仍带 `0.1.35`，SHA-256 仍是 `2e83984f8c64fc81758cb65f09f64d85584a0ab4a46c786da6eda8c07f66be19`。以内容不变的队列入口保存事件触发原 watcher 重编此桥，日志仍报 `Trusted Send Queue source changed; review and re-pin before fixed build: projects/ai-send-queue/src/page/main.js`；磁盘源码 Git blob 与磁盘 pin 同为 `9ab01594feb43b23b624e5766b08e40b290889b2`，运行中的开发 hooks 仍有旧校验记录。未停止或替换原 watcher，也未把磁盘清单写成 Chrome 已应用回执。见[构建核对回执](artifacts/dev-candidate-20261121/fixed-bridge-publication.json)。
- **NOT_TESTED（运行）**：新版包手动安装、Chrome 已应用 revision、登录页皇冠与侧栏就绪、入队、真实发送及带暂停队列的撤权。复查三个已登记的专用登录槽仍有其他任务租约，虽然没有浏览器 PID；没有接管租约、导入 Cookie 或发送消息。共享审阅文案仍有并行改动，实际误报保留为上表 FAIL。

## 当前开发版续验：0.1.35 / r34，同一 Chrome 候选（2026-11-21）

**访客模块的挂载、停用、网站撤权及恢复已复验；已登录对话的入队和发送仍未验收。** 三个专用登录 Profile 都登记在其他 owner 名下。使用全新、未登录的隔离 Profile，没有导入 Cookie、打开用户对话或发送消息。访客页只有 `#mobile-composer-prompt`，不能证明桌面会话输入框或皇冠可用。

环境：有界面 Chrome for Testing `154.0.8037.92`，未打包扩展从 `dist/development` 加载，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。ego(lite) 共用 Profile；本次为核对独立 Profile 的 Chrome 开关、实体 `SIDE_PANEL` 和已应用 revision，沿专项合同使用 CFT。Chrome 扩展详情实读「允许运行用户脚本」关闭，SW 中 `chrome.userScripts` 为 `undefined`。网站访问初始为 `ON_ALL_SITES`；撤权单项由 Chrome 网站权限页对 `https://chatgpt.com` 增删禁止规则。

复用原 `npm` run dev；实体侧栏显示开发服务已连接。此段所有标为 PASS 的交互绑定到 **applied revision `d4b949de99fad7c4c1a0ab04cd65442fdc1c8a25ddf215ed558bd926419f8a68**`。SW SHA-256 `a7af0c1dedbd100d6a8b7172e4f9246d9b6a99e466f7c888250dbcac1f578989`；固定网页桥 SHA-256 `2e83984f8c64fc81758cb65f09f64d85584a0ab4a46c786da6eda8c07f66be19`。此 Profile 的 0.1.35 / r34 由产品默认预装，Page 安装 ID `64915a58-2412-410e-8bae-320917ede4e4`，授权代数 `1`，Page sourceHash `2fd4ed6f63d1c09a73050733725f46e5a8419f024e48d8139cf2010fb2813126`，正式 JSON SHA-256 `1881078c97bb1fb68c8481aa66c19244f5f5e41bce55989df130ae5d4bee148b`。

| 验收项 | 结果与实际回执 |
| --- | --- |
| 固定模块与实体侧栏 | **PASS（访客模块）**：「扩展 → AI 消息发送队列 → 重新检查」实读「输入框暂不可用」「网页模块版本：0.1.35」，模块实例 1，无 `E_USER_SCRIPTS_UNAVAILABLE`。见[环境](artifacts/guest-cft-20261121-d4b949de99fa/initial.json)及[挂载](artifacts/guest-cft-20261121-d4b949de99fa/guest-allowed.json)。 |
| 应用停用、再启用 | **PASS（访客旧文档）**：停用后列表显示「已停用」，同一网页实例 1→0，测试草稿逐字保留，用户消息 0。恢复后列表通知「应用已恢复使用；可按需打开界面。」原文档尚未挂载时，**在同一个 Chrome 侧栏打开队列应用**即可再次得到模块诊断；随后点「重新检查」也成功。无需关闭实体侧栏。见[停用](artifacts/guest-cft-20261121-d4b949de99fa/guest-disabled.json)和[恢复](artifacts/guest-cft-20261121-d4b949de99fa/guest-reenabled.json)。 |
| Chrome 网站撤权、解除禁止 | **PASS（访客旧文档）**：加禁止规则后，原侧栏重查显示 `E_PERMISSION`；原文档未刷新，模块实例 1→0，测试草稿不变、用户消息 0。移除规则后，侧栏重查返回 0.1.35，实例为 1、草稿仍在。见[撤权](artifacts/guest-cft-20261121-d4b949de99fa/guest-revoked.json)和[解除禁止](artifacts/guest-cft-20261121-d4b949de99fa/guest-unblocked.json)。 |
| 新文档导航期间的状态提示 | **FAIL（标题）**：自有新标签先开 `about:blank` 作对照，再在 3.2 秒网络延时内实际导航到 ChatGPT。不可运行的空白页与导航中的标签均显示「未找到当前网页」，后者正文实际为「当前网页正在导航，请等待页面稳定」；提交后重查正常收到访客模块诊断，实例为 1。本轮没有复现旧记录中的裸 `E_TARGET`。见[导航回执](artifacts/guest-cft-20261121-d4b949de99fa/guest-navigation.json)。 |
| 合法旧版安装直接生效；手动安装或更新 | **NOT_TESTED**：只有 0.1.35 默认预装证据。0.1.36 可在正常入口打开「当前 v0.1.35 → 新 v0.1.36」更新审阅，显示权限未变化；未在旧 revision 点击确认。审阅仍沿用通用网页模块文案，称需开启用户脚本，此处未改公用安装器。 |
| 已登录对话的「队列已就绪」、单皇冠及入队 | **NOT_TESTED**：没有可用的专用登录槽，未实测皇冠点击、Ctrl+Enter 或 Shift+点击。 |
| 暂停零发送、显式恢复、流式等待、普通及空白草稿 | **NOT_TESTED**：访客草稿保护仅覆盖停用和撤权，无待发送条目，不能证明兼容普通与空白草稿的发送围栏和等待提示。 |
| 两条真实消息 FIFO、防重及入站核对后移除队列行 | **NOT_TESTED**：未提交消息；缺专用登录态及独立测试对话。 |
| 已挂载皇冠且有暂停条目的旧文档，停用／撤权后不能入队或发送 | **NOT_TESTED**：访客页没有皇冠和队列条目，不能把模块退出当作实际发送围栏通过。 |

**0.1.36 / r35 提示修复：候选构建、定向 Node PASS，Chrome 运行 NOT_TESTED。** 对宿主的 `E_DOCUMENT_UNRESOLVED` 显示「暂时无法确认当前网页」并保留宿主的具体说明；已稳定但无可用输入框时给访客登录、打开对话、重新检查的指引。网页模块相对 0.1.35 的打包源码仅有两处版本标记变化；精确登记 Page SHA-256 `7f08a09d7022a6bd03b9b3a162b998f7f39aaa7c802208a32c99803811609591`，并更新固定编译的原源码 pin，保持原站点、能力、发送和授权逻辑。临时[候选包](../../artifacts/sidebar-tools/ai-send-queue/candidate.opendesk-tool.json) SHA-256 `36d95a28f240128c99f919effdecc6cdbec27b0f10c3a9b944826b50a8da23e2`。旧 watcher 先拒绝本次版本标记变化对应的旧 pin；磁盘 pin 更新后仍未发布新 revision，其间 watcher 同时报并行阅读目录 locale 来源校验失败。未重启 watcher、未晋升该候选或把代码与旧浏览器回执合并计分。下一次应先核对稳定的 watcher 产物与 Chrome applied revision，再走原确认链和独立登录用例。

收尾：Chrome 禁止规则已移除；两个自有访客页均实读草稿为空、用户消息为 0；未确认的更新审阅已取消。隔离浏览器正常退出，UI 锁已释放。见[最终状态](artifacts/guest-cft-20261121-d4b949de99fa/guest-final.json)。以上回执位于本地忽略目录，保留脱敏状态及合成草稿，不含账号资料。

18:51 CST 续查：三个受管登录槽仍登记给其他 owner，没有申请或使用。现有 watcher 仍运行，最近一次工具壳编译因并行修改的 `projects/reading-toc/trusted/locales.generated.js` 未通过来源校验而失败。发布清单仍是上面的 `d4b949de…`；对清单的 155 个文件逐一计算 SHA-256，154 个一致，只有 `sw.js` 不一致（清单 `a7af0c1d…`，磁盘 `4a4923c6…`）。这份目录不能用于建立同一候选的 Chrome 证据；未用它启动浏览器、确认安装或替换已发布的清单。0.1.36 的登录与安装后运行继续标为 **NOT_TESTED**。

## 固定网页入口：当前开发版 0.1.35 / r34（2026-11-21）

**真实 Chrome 已验证访客页上的固定模块诊断、停用与网站撤权。登录后的皇冠、入队和发送尚未验收。** 本轮没有可复用的专用登录 Profile：现有槽位归其他任务，本轮使用全新、未登录的隔离 Profile，没有导入私人资料或发送消息。访客首页只有 `#mobile-composer-prompt`，没有此版本支持的会话输入框。

环境：有界面的 Chrome for Testing `154.0.8037.92`；未打包扩展从仓库 `dist/development` 实际加载，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。ego 使用共享 Profile，本次需要独立验证 Chrome 网站开关和实体 Side Panel，改用专项 CFT 测试环境。复用现有 `npm run dev`；修复前 Side Panel「本地开发服务」实读已连接，applied revision 为 `1e17c8ac0fbeaa657383794ebb12bc13f02b90316b95b787dd6629024637fcaa`。热更新后，该隔离 Profile 中未打包扩展因 Chrome 开发者模式关闭被停用；在 Chrome 原设置恢复开发者模式，确认「允许运行用户脚本」始终关闭。复测从 Chrome `SIDE_PANEL` 上下文点击原「扩展 → AI 消息发送队列 → 重新检查」，SW 实读 applied revision 为 `8bcf291f11889e7b2368aaa67931d48a2f09c74275c5a29dfa9b7c971412cf57`，与 watcher 产物一致。

该 Profile 启动时由产品默认预装，实际安装与正式包内容一致，为 `0.1.35/r34`、已启用；正式包 SHA-256 `1881078c97bb1fb68c8481aa66c19244f5f5e41bce55989df130ae5d4bee148b`，实读 Page sourceHash `2fd4ed6f63d1c09a73050733725f46e5a8419f024e48d8139cf2010fb2813126`。修复后 SW SHA-256 `a7af0c1dedbd100d6a8b7172e4f9246d9b6a99e466f7c888250dbcac1f578989`，固定 Content SHA-256 `2e83984f8c64fc81758cb65f09f64d85584a0ab4a46c786da6eda8c07f66be19`。

| 验收项 | 结果与可观察回执 |
| --- | --- |
| 关闭「允许运行用户脚本」，Chrome 允许访问 ChatGPT | **PASS（访客模块）**：原侧栏返回「输入框暂不可用」「网页模块版本：0.1.35」「原生输入框不存在或不唯一」，网页生命周期标记为 1；未出现 `E_USER_SCRIPTS_UNAVAILABLE`。 |
| 应用停用、启用与重查 | **PASS（访客模块）**：原菜单「停用」后列表显示「已停用」，原文档生命周期 1→0，草稿原样，用户消息 0。重新启用后旧文档未立即自行恢复；重开侧栏并重查，原文档恢复为 1，草稿仍在。**NOT_TESTED**：已挂载皇冠的旧文档能否被阻止新入队、发送。 |
| Chrome 禁止在 ChatGPT 使用扩展、原文档不刷新 | **修复前 FAIL，修复后 PASS（权限与访客模块）**：原 Chrome 网站权限 UI 添加 `https://chatgpt.com` 至禁止列表。修复前 `permissions.contains` 仍为 true，对同一 Chrome 文档的无副作用探针报 `Blocked`，但原侧栏仍收到旧模块的输入框诊断，生命周期仍为 1。修复后相同 Chrome 条件下，侧栏诊断返回 `E_PERMISSION`；原文档未刷新，生命周期 1→0，测试草稿逐字保留，用户消息 0。**NOT_TESTED**：有可操作皇冠或真实待发送条目的旧文档。 |
| 从 Chrome 移除禁止规则并重查 | **PASS（访客模块）**：旧文档可再次诊断；新访客页首次检查曾返回 `E_TARGET`（当前网页不可运行），就绪后再次手动检查返回 0.1.35。新文档仅一个模块实例。没有正式输入框，未验证皇冠唯一性。 |
| 已有合法旧版安装直接使用、新版通过手动安装审阅 | **NOT_TESTED**：本次只有产品在新 Profile 的默认预装证据。 |
| 已登录对话：侧栏「队列已就绪」及网页仅一个皇冠 | **NOT_TESTED**：缺专用测试登录态及独立测试对话。 |
| 真实点击、Ctrl+Enter、Shift+点击暂停及显式恢复 | **NOT_TESTED**：访客页无可操作皇冠，未模拟输入框。 |
| 流式回复期间不提前发送、普通和空白草稿阻止发送并显示等待原因 | **NOT_TESTED**：停用和撤权时保留访客草稿，不能证明有条目时的发送围栏。 |
| 两条真实消息按 FIFO 各发送一次，确认入站后才移除对应行 | **NOT_TESTED**：未提交任何消息；没有使用用户对话、旧队列或恢复副本。 |

修复限于固定队列的原后台授权。已有安装与网站范围检查通过后，用 Chrome 的 `scripting.executeScript` 对当前顶层文档做一次只返回 `true` 的隔离世界检查。没有来自该文档的成功回执就拒绝授权；侧栏派发及交付状态前也检查，避免把网站阻止误报为需要刷新或接受过期就绪结果。未改变动态 Page 的授权、包或 Manifest 权限。定向 Node 回归 20/20；新增回归在旧代码上确认失败，覆盖 Chrome 网站级阻止且原网站授权仍在、拒绝初始化和续权、拒绝状态派发与迟到回执，以及解除阻止恢复。

脱敏真实回执（本机忽略目录）：[修复前撤权](artifacts/ui-acceptance-20261121/revoke-guest.json)、[修复后允许](artifacts/ui-acceptance-20261121/fixed-allowed.json)、[修复后阻止](artifacts/ui-acceptance-20261121/fixed-blocked.json)、[解除限制](artifacts/ui-acceptance-20261121/fixed-restored.json)、[最终运行身份与清理](artifacts/ui-acceptance-20261121/fixed-final.json)。已移除 Chrome 中本次添加的禁止规则，清理四个测试标签里的本次草稿，关闭隔离 CFT、释放本任务 UI 锁；现有 watcher 继续运行。未做 production、完整矩阵或评分。

## 刷新后增强 UI 延迟目标（2026-11-13）

本轮继续处理原生 ChatGPT 输入区已可用、队列增强长时间不显示的问题。**安全恢复后，同一稳定候选的单页 5 次均 ≤2 秒，三页并发全部出现且 ≤8 秒；本轮没有再出现 20 秒缺失。** 原三页并发 ≤3 秒仍有两页 FAIL，历史缺失失败全部保留；不保证长期不复发。当前核心开发恢复与验证完成，未进入 production 或完整验收。来源对话 `01a1d0d8-ab7b-7572-8261-cfef6f806159` 移交时 goal 为 blocked，更早来源 goal 上次观察为用户主动 paused、此次未跨对话复核；本接管聊天 get_goal 为 null，未恢复、迁移或完成这些目标。

原因与后续规避统一记录在[扩展持续开发文档：网页增强启动延迟与不挂载](../../docs/framework/extension-development-r131.zh-CN.md#page-startup-delay-20261113)。其中区分已确认的全表读取冗余、过期请求准备和串行排队，以及存储关闭、开发更新和资源故障；存储关闭的最初诱因与长期可靠性仍未知。本报告保留真实时序、运行身份和全部历史失败，不能将一次恢复记为所有缺失原因均已根治。

### 本轮恢复与最终实测（2026-11-13）

原 ego TaskSpace 101 已不存在；获用户明确允许后，创建唯一替代 TaskSpace 119「AI 消息队列 UI 验证 20261113 续接」。用户又确认所有窗口空闲、草稿已保存，并允许一次整扩展重载。执行前新只读检查确认无活动 Controller、Native ledger 为空、8 项历史 Controller unknown 的资源已有精确退役回执，残留队列 preview 原文档已消失；于 `2026-11-13T08:59:25.604Z` 调用一次原 `chrome.runtime.reload()`。没有直写 slot、清除 unknown、伪造宿主 ACK 或重放业务；旧 preview 随原启动恢复流程释放。

环境仍是 `dist/development` 持续开发、原扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。并行「修复扩展更换安装包失败」任务负责 `src/platform/storage/{index,idb}.js` 的连接恢复并恢复 writer PID 19215；本任务未修改这些文件、启停服务或覆盖输出。新磁盘 141 项 SHA-256 全部匹配；实际 applied revision 为 `002532190cf3f368767e11019a6272ad85d6758821aecaca293400e28214ef3b`、SW `eb2fa28a255dbd01de84662e593beb15207a739c569be25d2199036eaad0aace`、BACKGROUND context `f8aabe81-9431-4018-90b2-d11557383e3c`。三项原 Page 注册均已包含新增诊断，矩阵前后及最终交互后身份一致。

| 当前候选的用户操作 | 实测与结论 |
| --- | --- |
| 单页真实刷新 5 次，每次 ≤2 秒 | 1.001 / 1.221 / 1.034 / 1.058 / 1.123 秒，5/5 PASS；均为可见文档，生命周期、队列区、皇冠各 1 |
| 三页并发，原 ≤3 秒 / 开发 ≤8 秒 | 1.173 / 3.473 / 4.691 秒；原门槛 1/3 PASS、开发门槛 3/3 PASS。页面开始导航的 timeOrigin 最大相差约 3.38 秒；第一页面记录 visible→hidden→visible，不能声称三页全程前台或同毫秒开始 |
| 皇冠及 Ctrl+Enter | 空草稿下分别实际操作，首条保护反馈可见，URL 保持首页、用户消息 0、草稿空，控件各 1；本轮未发送消息，未把空草稿操作冒充新的草稿保留/FIFO 验收 |
| 正常测试会话的三种增强 | 自动出现且生命周期各 1、回复入口无重复。队列距输入框约 0.357 秒；思维导图约 2.031 秒、滚动导航约 2.540 秒；后二者距原生回复操作栏分别约 1.230 / 1.739 秒 |
| 其他增强的实际操作 | 思维导图展开真实 XMind 画布，返回后 viewer=0、原文恢复；回复开头/末尾按钮均产生 isTrusted=true 点击和滚动位置变化，草稿空 |
| 当前文档执行回执 | 四个本任务文档中的三种 Page 共 12 条 completed，sourceHash 与原安装一致。队列仍为 r25 / 0.1.26，未升级并行 owner 的业务包 |

刷新窗口的新诊断记录过 `E_DOCUMENT_STALE`，当前目标文档均完成执行；没有为过期派发重试。最终只读状态的 8 项 Controller unknown 仍保留，Native ledger 为空；此时并行任务已安装鼠标手势并持有自己的 preview，本任务未操作它。TOC 的授权代数也由并行操作改变，不纳入本任务修改或验收。存储连接关闭的最初诱因仍未知，不能从本轮恢复推断永久根治。

复用原源码定向 Node 232/232 及诊断 150/150 证据，未因续接重复执行。此次新增脚本语法、定向 diff 检查与上述真实 UI 证据。自然冷启动、系统 Chrome、production、长期压力和正式评分均 NOT_TESTED。本轮证据为忽略目录下 `pre-recovery-idle-119.json`、`manual-reload-intent-119.json`、`post-recovery-runtime-119.json`、`recovery-ui-119.json`、`recovery-matrix-119.json`、`recovery-multi-119.json`、`recovery-interactions-119.json`、`recovery-final-identity-119.json` 及两张 `recovery-*-119.png`；截图含账户 UI，不提交。确认四个测试网页均空草稿、无回复进行中后，已通过原 `TaskSpace.finish({keep:[]})` 关闭本任务空间 119，回执成功，未关闭其他空间、writer 或 preview。具体 owner 与历史恢复断点见[续接工作记录](../../docs/framework/workstreams/page-startup-reliability-20261113.md)。

### 恢复前历史证据（保留原始失败）

计时从唯一可见且可编辑的原生输入框出现，到可见队列区域和可命中皇冠均出现；生命周期、区域、皇冠须各为一个。20 秒缺失判 FAIL。原生输入框未就绪、探针丢失和驱动异常单列；原始失败始终保留。样本记录 visibilityState，hidden→visible 不能当作纯前台证据。其他增强按自身真实功能条件检查：空白聊天不应显示思维导图或回复滚动按钮。

| 用户操作 / 条件 | 当前结果与边界 |
| --- | --- |
| 连续单页真实 reload，5 次均 ≤2 秒 | 基线 3/5 等待 20 秒无队列；第一候选 1.051 / 1.356 / 1.213 / 1.598 / 1.433 秒，第二候选 1.629 / 0.659 / 1.042 / 1.051 / 1.002 秒，各自 5/5 PASS。续接的三个正常会话样本为 1.454 / 1.737 / 1.610 秒，单实例 |
| 原三页并发，每页 ≤3 秒 | FAIL。基线 3.76 / 11.18 / 5.00 秒；第一候选 3.658 / 5.254 / 6.792 秒；第二候选 2.713 / 3.794 / 6.897 秒。保留原门槛与全部失败 |
| 并发开发门槛评估 | 暂以每页 ≤8 秒评估三页负载：三个已启用 Page 在三页触发九个共享串行启动，前两轮最大约 6.9 秒。只调整并发开发预算，单页 2 秒、20 秒缺失失败及安全约束不变；不声称原 3 秒目标达成。最新窗口结果见下文 |
| 皇冠及 Ctrl+Enter | 当前安装版均真实操作通过：首页首条保护反馈可见，测试草稿逐字保留，零消息发送；随后通过原输入框清除。截图中原生输入区、发送按钮与皇冠无重叠。不是仓库新版中性文案的安装证明 |
| 思维导图与滚动导航 | 三个正常会话样本均自动出现。思维导图真实点击后渲染 XMind 画布，返回后原文恢复、viewer 为 0；滚动导航真实按钮使滚动位置变化，底部按钮事件 isTrusted=true；草稿保持空。三种 Page 生命周期各为 1，每个回复操作栏无重复入口 |
| 原管理 UI 停用 / 恢复 / 新文档 | 实体 SIDE_PANEL 操作已完成。停用时遇旧代活文档清理 unknown，控件未能即时移除，恢复被 E_PAGE_CLEANUP_PENDING 正确拒绝。关闭本任务无草稿页后剩两张其他任务页面；获用户明确允许，逐页核对空草稿、零待发送、回复已结束后刷新。旧 UUID 均精确查询为 null，原观察入口自动转 retired；再从原侧栏恢复成功，新文档自动单实例挂载。未清 unknown、未重放清理、未直写安装记录 |
| 后台自然停止后唤醒 | NOT_TESTED；未观察到自然停止，不把开发重载或普通刷新冒充冷启动，不强杀 Worker 或停用他人服务 |
| 系统 Chrome / production / 完整矩阵 / 评分 | NOT_TESTED；本轮仅 ego 共享 Profile 的持续开发证据 |

历史实测运行环境为 ego TaskSpace 101，固定加载 `dist/development`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。原 watcher pid 35698 及恢复进程 80828 均已退出；后续只在确认无 writer 后通过原 `npm run dev` 恢复，pid 88367 曾初次编译完整成功并 RUNNING，此后已退出，没有第二 writer、独立全量构建或路径/ID/Native 配对替换。上述 UI 样本的运行 SW SHA-256 为 `3a011f20456d852c14e7ebe9bd6ff78ffdf22cda9213a92d6f4d5a2c13994fc5`。applied 与磁盘曾多次一致；并行可信 UI 更新会改变总 revision 并安全重载 Worker，即使 SW 字节未变，也必须区分运行窗口。诊断新源码已编译，但截至下述存储诊断时仍未加载，不把磁盘新产物当作运行证明。

| 实际安装 Page | revision | sourceHash | 本轮状态 |
| --- | --- | --- | --- |
| app.ai-send-queue | 25（0.1.26） | ab795b7ab732faf6e597c2050ad941772413d9f4349377df17c32102e650175b | 原 UI 恢复后 enabled / active / registered；正式安装同步生成新 installationId，未替换业务版本 |
| opendesk.ai-reply-mindmap | 5 | 1e82bb337f5f9ffec776b8752e2af5e2487586d176e97c970ae69bf2788a14a4 | enabled / active / registered |
| opendesk.ai-scroll-navigation | 20261112（历史 0.4.14） | 7992b0f3bbc98df0bcdbee9903c13978363b816a289db49f3b9ee91d1f553aa2 | enabled / active / registered；按实际回复顶部/底部按钮测试，不冒称仓库新版 Dock 已安装 |

Reading TOC 原本停用且清理 unknown，本轮未启用或更改。可信 Prompt Shortcuts 在真实页面出现唯一工具栏；这项存在证据不替代其完整功能验收。未更新并行 owner 的队列业务源码、正式 JSON 或版本。

三个正常会话样本中，思维导图相对原生输入框为 3.340 / 4.017 / 3.699 秒，相对原生回复操作栏可用约 2.572 / 3.175 / 2.790 秒；滚动导航分别为 3.799 / 4.587 / 4.226 秒及 3.031 / 3.745 / 3.316 秒。不能把队列输入框起点和 2 秒门槛套给等待实际回复、操作栏及稳定正文的增强。思维导图每条回复一个按钮，不要求全页只有一个。

失败分类：`ui-multi-enhancement.json` 第 4、5 个样本保留原始 UI_DEADLINE；后续实际页面显示“无法加载此 ChatGPT 对话”，原输入框消失，三种隐藏生命周期已存在且执行 completed/evaluated，因此单列为网站会话加载失败，不凑成 5 个有效增强成功样本。p17 的 Page.getFrameTree 无响应单列 renderer/驱动异常。

一个恢复窗口中三页均挂载，延迟为 2.199 / 4.441 / 5.842 秒，生命周期、区域、皇冠各为 1；原 3 秒门槛仍有两页 FAIL。原报告写入遇 ENOSPC，随后从同一文档探针恢复数据至 `ui-concurrent-window.json`，未重新测试；前置指纹未保存，因此不声称该轮前后 Worker 身份相同。磁盘余量在约 160 MiB 附近波动，ENOSPC 原失败保留。

随后 `ui-concurrent-final.json` 记录到更明确的失败：前后 applied revision、SW 哈希及 BACKGROUND contextId 均相同，三个原生输入框正常，但三页均等待 20 秒无队列。原生只读探针确认三页的九个安装引导标记均存在，注册 token 与安装身份匹配（`stable-missing-markers.json`）。这不能归因于整个 Worker 被替换，暂定 8 秒预算也不能把缺失判为通过；仍须定位派发前拒绝。已补充 bootstrap 的失败响应码日志，不重试或重新执行。对应 Node 首轮 141/150 PASS、9 项因 ENOSPC 无法写 fixture；清理可重新下载的 npm 内容缓存后原命令 150/150 PASS。开发服务已退出，确认无 writer 后通过原入口恢复，诊断运行证据待补。

最新原侧栏实际报 `Storage connection closed`，开发状态显示自动刷新延后。`runtime-storage-diagnosis.json` 证明同一原 v2 数据库可由新只读连接读取：当前 Controller run 为 null、Native ledger 为空；八个历史 Controller unknown 均有终态 stopped、workerRetired/released 及 releaseCount=1 的精确 retirement 回执，记录未更改。残留 preview 属本任务 p29 旧队列文档 `03C4B517422A393E02C69F9C604AF66F`，原生精确查询为 null；不是其他任务活跃执行。原 `recoverExecutions` 可在后台重新启动时保留 outcome-unknown 并仅按原文档消失释放预约，本轮未直写 slot。旧 broker 的 storage 引用一旦关闭就持续拒绝新事务；连接关闭由何事触发尚未知，ENOSPC 只是候选诱因。独立架构只读审查支持先保留现场，不将其扩大成自动重连或失败事务重放补丁。整个扩展的恢复会影响其他活工具宿主，另行请求用户授权并继续保护草稿；两张业务网页的刷新授权不扩展到该操作。

续跑核对：pid 80828 又因 V8 heap out of memory 退出，原进程回执 exit 134，日志保留。确认 writer 不存在且本机内存充足后，仅对新进程临时设 `NODE_OPTIONS=--max-old-space-size=8192`，通过原入口启动 pid 85910；未修改全局配置。该次编译未再遇 OOM，但在 tool-shell 触发 `Trusted AI Proxy source changed; review and re-pin: projects/ai-proxy/src/ui/ProxyEntry.tsx`，exit 1 并正常释放服务。原始回执在 `dev-diagnostic-recovery.log` 与 `dev-diagnostic-recovery-8g.log`。失败后的磁盘输出未用作新候选；本轮未覆盖并行 owner 的源码或 source-lock，也未放宽来源检查。

随后该 owner 的来源记录更新，原只读 `verifyTrustedAIProxySources` 核验 PASS。构建依据变化后，用同一临时 8 GiB 参数从原入口重试，pid 88367 曾完整编译成功、当时进程仍在，此后已退出；日志为 `dev-diagnostic-recovery-8g-retry.log`，尾部后来出现 `ProxyEditor.tsx` 来源 pin 失败。初次成功产物 revision 为 `44cc653eef1a500df91fcbe4f68d6d15df36b6630c11e873c8717586324bf9ea`，磁盘 SW SHA-256 为 `9e4a4871bb66629f123451459336469b8c3cc8e02e6ae37956b2ccbd850f44d4`。这只证明当次编译及当时服务存活，不证明长期内存问题已修复。浏览器最后实读仍为上述旧 SW/context，三项注册均未包含新增诊断；整扩展安全重载授权仍待答复，最新磁盘候选见顶部接管核对，尚无新运行证据。

另外两轮并发组出现 3 张、2 张原生输入框正常但 20 秒无队列，仍保留真实增强缺失 FAIL。同期诊断扩展页被关闭，前后后台 contextId 与 applied revision 改变，SW 哈希相同；这证明测试窗口有扩展重载，不能宣称同一稳定运行窗口全通过，也不能仅凭源码推断每条失败必为 E_DEV_RELOADING。`src/sw.js` 在开发更新 held 期间明确拒绝自动派发，现有开发合同要求固定脚本重载后刷新原网页；本轮未放宽或自动重放该栅栏。

源码修复沿用原 Page Authority：以既有主键前缀游标只读 installed/execution 元数据，避免克隆整个 frameworkKV 冻结源码；过期文档先拒绝，再读取源码和探测原生执行世界。保留授权、安装身份、配额、三项原生探测、unknown 与清理保护。只读诊断表明剩余并发延迟主要发生在共享串行启动准备，未以并发化执行或跨启动缓存换取测试通过。已有最终定向 Node 232/232 PASS，未改对应源码后不重复执行；新 UI 证据另列，不累加测试数量。

本机忽略目录 `artifacts/ai-send-queue/startup-20261113/` 保留两组候选、原始执行计时、`ui-multi-enhancement.json`、`interaction-current.json/png`、`representative-mindmap.png`、`representative-scroll.json`、`disable-cleanup-diagnosis.json`、`final-identity.json`、各轮 `ui-concurrent-*.json`、`stable-missing-markers.json` 及 `runtime-storage-diagnosis.json`。截图含账户界面，不提交。测量仅观察 DOM，不临时注入产品实现或发送消息。磁盘曾仅约 162 MiB 可用；清理约 336 MiB npm 内容缓存后约 450 MiB，保留 ENOSPC 原失败，不删除其他任务产物。

## 0.1.26 已安装 UI 与核心发送闭环

本轮解决「装好后侧栏只有两段说明，无法判断网页模块是否运行」的问题，补上公开 `page.request` / `OpenDeskAppPage.onRequest` 的只读 `queue.status`。业务仍由唯一 Page 队列执行；没有源码临时挂载、测试 UI owner 或第二个发送器。目标与使用方式见 [README 当前记录](README.zh-CN.md)。

| 最终身份 | 实际值 |
| --- | --- |
| 唯一正式文件 | `ai-send-queue.opendesk-tool.json` |
| Tool / Page 版本、修订 | `0.1.26` / `0.1.26`，revision `25` |
| Tool / Page ID | `ai-send-queue` / `app.ai-send-queue` |
| 字节数 | 136624 |
| 文件 SHA-256 | `bbf37b93aaf10d721436bbb60f3a22543386e227f2f1e0d0568d31aedef8c7a7` |
| Page sourceHash | `ab795b7ab732faf6e597c2050ad941772413d9f4349377df17c32102e650175b` |
| 安装与当前运行 | 安装完整对象与正式 JSON 深比较相同；enabled / authorization active / nativeState registered；最终回执 completed / managed lifecycle evaluated，revision/sourceHash 匹配 |

环境为 ego TaskSpace 66，既有扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。使用原实体 Side Panel 的安装、管理及真实沙箱 UI；面板视口为便于操作设为 420×900，未改变产品源码或执行世界。TaskSpace 共用 Profile，不能作为 Cookie 或权限隔离证明。没有启动/重建 Browser，没有替换日常加载目录或 Native 配对，也没有操作其他任务的 watcher。普通队列和项目队列测试均使用本任务新建的测试会话。

| 实际用户操作 | 最终结果与证据边界 |
| --- | --- |
| 原安装审阅更新单包 | PASS；`0.1.25 → 0.1.26`、权限未变化。清理未知后先核对旧文档，再使用同包「核对并恢复网页模块」；成功反馈可见，没有直写存储冒充安装 |
| `/`、`/c/<id>`、项目首页、带项目 slug 的 `/g/g-p-…/c/<id>` | PASS；最终包四类真实入口各只有一个生命周期、皇冠、队列区域；有/无会话的空状态正确 |
| 首页与项目首页的首条保护 | PASS；最终包分别通过 Ctrl+Enter 和皇冠测试，原草稿逐字保留、零队列项。首条真实原生发送并进入新对话另外在 0.1.25 完成，未将其冒充最终版本的新首条发送 |
| 项目首页点击本任务对话链接 | PASS；timeOrigin 保持相同，是真实 SPA 切换；新输入框和按钮出现后仍只有一套队列控件 |
| 皇冠与 Ctrl+Enter | PASS；0.1.25 的普通对话分别真实入队/入站一次；最终包 Ctrl+Enter 首条保护和皇冠双条入队再次验证，快捷键处理未改 |
| 最终包两条同时排队、暂停/恢复、FIFO | PASS；A26/B26 都先显示为暂停行；恢复后先 A26，再等 A26 回复 complete 后提交 B26。两条用户消息各一次，B26 回复 complete 后无 stop、无草稿、无队列行、无 unknown |
| 侧栏手动检查与切页后重新检查 | PASS；最终安装 UI 分别显示「当前目标不可用」「当前目标不支持」「请先发送首条消息」「网页队列已就绪」；后两者显示 Page 0.1.26。无自动轮询、无消息正文、无逐条操作 |
| 主动停用应用 | PASS；原管理菜单反馈已停用；当前页生命周期、皇冠与队列区域均为零，草稿为空；未通过快捷键尝试原生发送 |
| 恢复应用并进入新文档 | PASS；原管理入口恢复后，新文档单实例重新运行，侧栏返回 ready / 0.1.26，当前执行 completed/evaluated |
| 恢复后的旧文档即时重挂 | NOT_CONFIRMED；旧页未即时重挂，一次刷新后也未拿到新执行回执；切到另一新文档后正常。未将注册标记直接算作当前页运行成功，未扩大修复框架 |
| 系统中文 IME、休眠/压力、完整撤权/卸载矩阵、production、评分 | NOT_TESTED；当前开发阶段之外，历史证据不升级为本候选正式验收 |

最终 FIFO trace（UTC，2026-11-10）：A26 入站 `15:44:57.268`，其回复 complete `15:45:00.418`；B26 原文准备 `15:45:02.994`，入站 `15:45:03.762`，回复 complete `15:45:09.351`。采样没有替代网站回执，只记录真实可见 DOM；各精确正文在本轮测试对话计数为 1。最终包没有复现 0.1.21 的末项 unknown；历史精确节点保护保持原样，不能据此声称所有虚拟化情况已解决。

安装阻塞处理：最初发现旧 r20 的 18 个文档中仅空间 53 指定项目首页仍存活；用户明确允许检查、空闲后刷新。检查确认无草稿、队列缓存或正在回复后才刷新并交还控制。0.1.26 更新时只刷新本任务无草稿/缓存/回复的旧测试文档，确认 r24 活文档为零后使用原恢复入口。所有 unknown 都按原栅栏核对，没有自动重试发送或伪造清理凭据。

定向检查：`page-status`、`sidebar-status`、`sidebar-contract`、`view` 共 68 PASS；最终候选 `package` / `identity` 共 10 PASS。此前 main 恢复/快捷键组合的 145 PASS 证据用于未变行为，不累计成新的全测分数。独立复审发现检查异常被误报输入框未就绪，已改成固定 `E_QUEUE_STATUS_INSPECT` / `E_QUEUE_STATUS_LAYOUT` 错误，补了两个不泄露异常正文的回归。React 预编译、语法、diff、候选晋升及正式包 `--check-project` 通过；未运行全仓测试。

本机忽略目录 `artifacts/installed-ui-20261110/` 保留 `final-routes.json`、`final-fifo.json`、`final-sidebar-states.json`、`final-fifo-two.png`、`final-fifo-result.png` 和 `final-sidebar-ready.png`。无 `final-` 前缀的文件包含中间 0.1.25 诊断，不混写为最终候选。原截图可能含账户 UI，不提交。菜单最初被驱动的延迟 scroll 事件收起，先修正驱动滚动后正常操作；未为此修改有效产品行为。

## 0.1.24 新聊天与项目入口（历史）

本轮只修复新聊天区域发现与状态展示，不实现首条自动发送或临时会话队列。目标与关键条件以 [README 对应章节](README.zh-CN.md#新聊天与项目入口2026-11-10) 为准。普通已有对话及项目已有对话继续以 `c/<id>` 绑定；首条前区域可见，皇冠与 Ctrl + Enter 提示先原生发送并保留草稿。

| 检查 | 结果与限制 |
| --- | --- |
| Site + main/Site/Engine 组合 | 163 PASS；四类入口、项目 slug、身份未建立时拒绝写入/发送/确认、首条后状态切换及旧队列不跨聊天 |
| Engine + View | 149 PASS；FIFO/unknown/草稿保护、重复挂载、空区域状态、旧队列切新页隐藏并返回恢复、替换输入框、布局及销毁 |
| main 恢复/生命周期 | 76 PASS；原轮询、异常与停止保护保持 |
| 候选包、安装身份与缓存 | 24 PASS；最终版本元数据另经相同包/身份 9 项检查；没有将重复执行累加到 412 项总数 |
| 普通新聊天真实 DOM 源码挂载 | PASS；区域 716×20、皇冠 34×34，重复 place 成功且只有两处视图 host；点击反馈正确，原生输入保持空 |
| 项目新聊天真实 DOM 源码挂载 | PASS；区域 580×20、皇冠 34×34，连续三次 place 均成功；真实点击后「队列显示检查（不发送）」草稿逐字保留，截图无输入/原生按钮遮挡 |
| 当前新版安装与 USER_SCRIPT 运行 | NOT_TESTED；原生界面控制启动超时，没有更新安装对象或绕过原安装审阅 |
| 真实首条发送后的排队、完整撤权、production、评分 | NOT_TESTED；没有向 ChatGPT 发送测试消息，本轮不扩展这些验收 |

真实网页诊断使用 ego TaskSpace 62、新建标签页和真实 ChatGPT DOM，运行原 Site/View/Engine 源码及测试 UI owner；它不是已安装的 SDK owner/USER_SCRIPT。诊断没有驱动引擎 tick、清空原生草稿或点击发送；自有测试草稿经普通编辑清除，临时 host 已销毁，TaskSpace 62 已关闭。截图和采样保存在本机忽略目录 `artifacts/routes-20261110/`；普通/项目新页各有 `*-source.json` 与 composer 局部 PNG。已有项目页也只读观察到旧安装的区域正常显示，没有读取或操作原聊天内容。

最终单包为 **0.1.24 / 内嵌修订 23**，129564 字节，SHA-256 `400cdfc9648cc31beed5287e6e2d95da8492cc77ec2c68238cd994ec581135c6`，Page sourceHash `de15927a4dc2e29fc1fdd126482feba9b9762d8f9cd2616ed11fc68211e6cd56`。由原打包器从最终源码生成候选，包/身份检查后晋升并完成逐字节 `--check-project`；没有重编 Browser、替换加载目录、变更权限或配对。状态 **PACKAGE_READY_INSTALL_NOT_TESTED**。

以下为 **0.1.21 历史记录**，不作为 0.1.24 或 0.1.26 的安装、发送或完整闭环证据。

本轮为开发阶段验证。业务、资源、测试和唯一正式 JSON 继续归本目录；未修改 Browser 固定源码、启动第二个 watcher、全量构建 Browser 或更换 Native 配对。测试使用 ego 既有扩展及 TaskSpace 55，只在本轮新建的 ChatGPT 测试会话操作。

## 正式交付身份

| 项目 | 本轮结果 |
| --- | --- |
| 唯一安装文件 | `ai-send-queue.opendesk-tool.json` |
| 产品版本 | Tool 与内嵌 Page 均为 `0.1.21` |
| 内部修订号 | `20`，不是第二个产品版本或独立安装目标 |
| Tool / Page ID | `ai-send-queue` / `app.ai-send-queue` |
| 字节数 | 128826 |
| 文件 SHA-256 | `d440d27d821990faae598ab16cee398a6f4114f1a9b2671681373ae20c0c9c49` |
| Page sourceHash | `3ae29003f6530f9271d70fb1f3535a3f222eb467d8a764a0f13e9945a9d8d65d` |

安装通过「扩展 → 导入扩展」原审阅：界面显示 `当前 v0.1.20 → 新 v0.1.21`、权限未变化及上述候选 SHA。确认后，只读取本工具的已安装对象，与正式 JSON 做完整深比较，全部字段一致。新文档只有一个 `app.ai-send-queue.lifecycle`；历史命名的 `.list` / `.button` 是视图标记，不是额外发送器。未读回独立 Page Authority 完整安装回执，不将此结果升级为全部安装/撤权合同验收。

## 实际操作结果

| 操作 | 状态 | 证据与范围 |
| --- | --- | --- |
| 单 JSON 安装、更新及完整安装对象读回 | PASS | ego 扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；安装对象与正式 `0.1.21` 一致；没有另导入 Page |
| 打开工具说明页 | PASS | 原应用页中的真实沙箱 iframe 仅显示网页使用说明，不显示或读取队列；不等于实体 Side Panel 关开验收 |
| 皇冠、Ctrl + Enter 入队 | PASS | 实际输入框、可信键盘及可见队列行；`0.1.21` 再次验证快捷键和皇冠；入站前被拒绝的草稿保留，核对状态后才再次操作 |
| 普通 Enter、Shift + Enter | PASS | `0.1.20` 真实原生发送和换行；`0.1.21` 未修改键盘处理代码；没有把驱动定位失败计为通过 |
| 两条 FIFO 顺序、回复门禁、暂停与恢复 | PASS | `0.1.20` 忙时 C/D 各入站一次且清队；`0.1.21` 两条先暂停、再依次恢复，A 回复完成后 B 才发送，两条各入站一次 |
| 最终包双条发送后的完整自动确认与清队 | FAIL | `0.1.21` 第二条正文完全匹配且回复已完成，但历史用户节点发生变化，确认超时后保留 unknown。未自动重发，不能写成最终包完整 FIFO 闭环通过 |
| 三条以上展开/收起及 Alt + 上下排序 | PASS | `0.1.20` 真实五项队列；暂停一项，上移再下移，恢复原顺序后继续；源码未变 |
| 多行原文、刷新暂停及 unknown 保留 | PASS | `0.1.20` 刷新前后原文与 ID 顺序逐项一致，普通 queued 变 paused，unknown 仍 unknown；升级并刷新 `0.1.21` 后三条缓存仍暂停，没有自动发送 |
| 更多菜单 → 取回编辑 | FAIL → PASS | `0.1.20` 的文字按钮只有 29px，标签重叠并拦截点击；临时修正验证后，正式 CSS 仅调整规则顺序。`0.1.21` 实测宽度为 97/97/65px，点击后原文进入原生输入框，原队列项移除 |
| 长文原生输入框滚动 | PASS | `0.1.21` 原生输入框中 18 行、DOM 文本 2421 字符；滚动容器高度 187、内容高度 1903，scrollTop 从 0 到 627.5，前后正文相同；未改写输入框尺寸 |
| 删除/已确认项不因刷新复活 | PASS | 本轮自有测试项删除或精确入站后缓存为空，再刷新仍为空；没有改写内部队列或 sessionStorage 制造状态 |
| 不确定结果不自动重发 | PASS | 网站裁掉边缘空白时拒绝精确入站确认；草稿/历史变化时保留 unknown 与原文。只备份并显式删除本轮测试数据，没有自动重试 |
| 系统中文 IME、其他输入框、实体 Side Panel 关开 | NOT_TESTED | 本轮未取得对应原生操作证据，不用合成事件或应用页冒充 |
| 日常 Chrome 旧独立 Page 卸载 | NOT_TESTED | 上次观察仍有同名 Tool 与旧 Page 两项；桌面 UI 锁由其他任务持有，未核对旧页草稿/unknown，不卸载、不强抢、不刷新用户旧页 |
| production、完整撤权/安装回执、系统休眠与评分 | NOT_TESTED | 当前开发阶段之外 |

忙时测试中曾在原生提交后立刻连入 A/B，历史/草稿交接变化触发 unknown。该结果如实保留；没有证据将其归因于某个历史匹配分支，也没有放宽身份或正文确认来制造 PASS。待原生页面稳定后排入 C/D，实际 FIFO 成功。初次网页输入驱动对长文超时、短暂重排或 stale ref 的失败均先读取现场，未盲目重复发送。

最终 `0.1.21` 双条 trace 先记录两项均 queued；A 开始发送 `1794302702506`，A 回复 complete `1794302707007`，B 开始发送 `1794302709614`。A/B 用户正文计数各一。B 最终警示为「历史用户消息节点已变化；未能确认用户消息入站，禁止重复点击」；当前正文逐字相同，不能替代发送前节点链证据。仅凭现场不能判断是网站重建、虚拟化的何种节点变化，故未削弱匹配保护。本轮自有 unknown 原文和 trace 已备份后显式删除，不重试发送；该限制仍是后续最小诊断点。

## 清理、版本及验证

仓库当前已没有独立 Page 正式 JSON、无消费者的旧编译包或独立 Page 官方发行入口，本轮没有再次制造删除 diff。`src/page/` 及其资源是正式 Tool 内嵌模块的必需源码；legacy 生命周期避让、回归夹具和有真实历史消费者的脚本保留。日常 Chrome 的旧安装记录与仓库源文件清理分别报告。

两个交付脚本移除硬编码的 `0.1.18` / 内部修订号 17，改从候选或项目配置交叉核对真实版本。旧原生驱动仍明确输出 `NOT_TESTED`，不因改用新版本元数据而宣称安装测试通过。

本轮 CSS、包身份与 legacy 避让的定向检查：`view.test.mjs`、`package.test.mjs`、`identity.test.mjs`，40 PASS / 0 FAIL。先用原 `stage-react-candidate.mjs` 调用唯一打包器生成临时候选，以 `SEND_QUEUE_PACKAGE_PATH` 指向该候选执行测试，通过后由 `build-sidebar-tool.mjs --promote-from` 晋升，并完成 `--check-project`。脚本语法、候选元数据报告与 diff 检查通过；没有重复全工具或全仓测试。

原始截图、缓存备份与定向 DOM 采样仅存于本机忽略目录 `artifacts/ui-20261110/`，不提交包含账户侧栏的原始页面快照。测试会话为本轮新建会话；用户原有业务对话、旧队列、既有服务和其他任务文件均保留。
