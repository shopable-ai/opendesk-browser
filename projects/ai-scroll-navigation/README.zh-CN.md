# AI 对话滚动导航 · AI Chat Scroll Navigation

## 2026-11-12 · R4.2 数字默认隐藏（0.4.16 源码候选）

**原始目标：** 在 ChatGPT、DeepSeek、Gemini 等长对话中，使用原有左下角唯一悬浮 Dock 按已发送的用户消息起点跳上一轮、下一轮；整段对话顶部、底部继续保留。长 AI 回复、流式内容与草稿不是新轮次。角色不明时不展示虚构轮次。

**本轮差量：** 增加独立全局开关 `showTurnCount`，默认 `false`。关闭时不挂载数字节点也不占位；开启且 `turnPaging` 有可靠轮次时，在前后轮按钮之间显示当前已加载的 `i/n`。导航跳转、碰撞避让及原有顶底按钮不依赖计数开关。正式可信设置和 AI 配置白名单同步扩展至七字段；五/六字段配置保持原结构，新七字段仅对已安装版本 `0.4.16+` 开放写入，沿用原 CAS/读回/权限。现有 `preview/index.html` 同步显示开关与模拟网页。未重建对话引擎、站点授权或第二套 Dock。

**交付门禁：** 源码 `0.4.16` 不等于已有正式包已升级。当前提交需通过既有 CI 的 Node 测试、Program Builder、字节与范围验证才成为候选；真正 Chrome/Mac 安装与三站验收必须另有原生回执，未验证前继续保持 blocked。旧 R4.1 记录仅供溯源，不构成本轮测试证据。


## 2026-11-12 · R4.1 按提问轮次翻页（0.4.15 候选）

**解决的问题：** 长对话中难以直接找到某次用户提问。把一条用户提问及随后 AI 回复视为同一“轮”，在原左下角导航中加入 `上一轮 ↑ · 当前轮次 i/n · 下一轮 ↓`，原“整段对话顶部/底部”按钮保留。长回复不按屏幕高度拆页。页数仅统计当前 DOM 已加载且能确认提问边界的轮次，不代表服务端历史消息总数。

**已实现的源码变更：** `src/conversation.js` 提供角色验证、轮次定位和相邻跳转；`src/floating-navigation.js` 复用唯一悬浮 Dock 并跟随滚动位置更新页码；`src/site-configuration.js` 与 `trusted/react-controls.tsx`、`trusted/ai-configuration.js` 配合原可信配置保存体系增加 `turnPaging`（默认开，关闭后仍能按原设置使用顶部/底部导航）；`src/scripting/user-scripts/scroll-config-contract.js` 保持配置版本 1：旧 `0.4.14` Page 的五项设置在读取、写入时继续保留五字段，不会自动扩成六字段；只有确认安装版本至少为 `0.4.15` 后，设置页才呈现第六项，可信 Host 也才允许其六字段保存。ChatGPT、DeepSeek、Gemini 使用各自既有适配，**任意站点未能可靠确认用户/AI 角色时不显示伪造页码**。自定义站点需要明确消息节点和可判定角色，不能仅凭 CSS 推断用户提问。保留原安装授权、安全边界与站点范围。

**可点击预览：** `preview/index.html` 增加目标 AI 网页模拟对话，能体验顶部/上一轮/当前轮次/下一轮/底部、手动滚动、模拟新增轮次、启停设置及站点不支持状态。预览中的模拟网页只是展示与交互验证，不读取真实 AI 网站，不具有正式扩展授权，也不能证明源码已部署。

**测试与交付门禁：** 增加按钮、滚动、首末页、角色不明、持久设置及旧测试适配。仓库 `.github/workflows/ai-scroll-navigation-r131.yml` 会在检查通过后按正式 Program Builder 产出 `0.4.15/r19` 候选安装包，并在目录保持 **blocked**，直到 Chrome/Mac 真实安装与三站操作、原生权限/旧实例清理全部独立复验。提交源码不代表 CI、安装或发行通过；以实际 CI 回执及后续原生证据为准。


## 当前：0.4.14 包已生成，本机新版运行与安装待核对（2026-11-09）

左下角定位修正已通过原 Program Builder 和 Page 安装包生成器封装。工具目录唯一正式包为 **0.4.14/r18**，保留 ChatGPT、DeepSeek、Gemini 三个 HTTPS 匹配；本机更新候选为 **0.4.14/r20261112**，精确保留原安装的六条匹配（包含三条既有本地 fixture），不增加权限。两包五个业务模块逐字节相同，业务 bundle 相同，差异只来自匹配声明和 revision。两包来源、身份、SHA 与格式校验通过，相关安装包及导入定向测试通过；前述浮层 28 项测试继续复用，没有修改源码后重复全组检查。

| 包 | sourceHash | packageHash |
| --- | --- | --- |
| 正式 r18 | `f7294eea10ca395a821b893d086fce487563c860368dbadffae1a7bdd2a57f0f` | `c088db930c72524075413bd788a96dc64ffc263b14a48aa18613af5a31852699` |
| 本机 r20261112 | `7992b0f3bbc98df0bcdbee9903c13978363b816a289db49f3b9ee91d1f553aa2` | `37911761df8563afe6ae900fc5d61af0bcdc87bf6e92dcff03f2c056e2803873` |

经用户授权，仅接管 Space 33 的原 ChatGPT 页，备份写作内容与聊天草稿、确认没有在途任务后关闭重开。两处编辑内容与备份完全一致，原文档已消失；随后保留重开页并归还空间。当时旧安装的 21 条清理记录已自动转为 `retired`，未重放清理或修改账本。私有草稿备份仅存本机受限目录，不纳入公开证据或提交。

随后通过原生 Side Panel 审阅并提交一次本机更新。原 installationId 保留，generation 从 8 变为 9，当前为 `active / enabled / registered`，无安装记录 error；任务自身的真实 ChatGPT 长对话已执行上述 sourceHash，执行记录为 `completed`。网站规则、选择器、五项导航开关及 ETag 与安装前一致。真实网页检查结果：

- 1031×703 时 dock 为 `(349,539)`、42×90，保留对话区左下位置，真实点击回顶到 `0`。
- 390×600 时 dock 为 `(68,538)`、90×42 横排，真实回顶和稳定页面触底均有效；触底复查为 `10498 / 10498`。测试后已清除设备尺寸模拟。
- ChatGPT 虚拟内容在第一次跳底后继续增加高度；正常尺寸首次未到最终底部，第二次真实点击到 `8576 / 8576`。不将该结果描述为动态加载过程中一次点击必达最终底部。

**安装尚未完整核对：** 更新请求返回 `E_PAGE_INSTALL_PENDING`，当前 `managedCleanup=unknown`。共享开发运行时期间发生更新；只读核对仍有 Space 33 重开页及 Space 38 两个 ChatGPT 页的旧文档存活，任务自身旧文档已消失。另三页的处理授权尚待回复，未再次接管。原生设置界面仍返回 `E_REVISION`，本轮未完成新版设置页的停用/恢复复验；配置一致性是只读存储证据。未重复安装、放宽来源或身份校验、重放清理或改写运行记录。

运行环境仍为 `dist/development`，原扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，原生扩展管理界面已核实实际加载路径。未启动或停止共享 watcher，未覆盖其输出；持续 serve 连接未证明，不能把已加载 development 包冒称 production。正式三站包真实安装、DeepSeek/Gemini、production、完整矩阵和独立评分均为 `NOT_TESTED`，发行继续 `blocked`。本任务未提交或推送；Ego Lite 有可用更新，本轮未升级。

证据：[两包来源校验](../../artifacts/ai-scroll-navigation-0414-20261109/package-verification.json)、[授权单页处理](../../artifacts/ai-scroll-navigation-0414-20261109/old-document-resolution.json)、[安装读回及配置一致性](../../artifacts/ai-scroll-navigation-0414-20261109/final-readback.json)、[正常/窄屏导航](../../artifacts/ai-scroll-navigation-0414-20261109/custom-navigation.json)、[窄屏触底复查](../../artifacts/ai-scroll-navigation-0414-20261109/narrow-bottom-recheck.json)。

## 前轮：左下角定位修正（2026-11-09）

用户反馈 `data-opendesk-ai-scroll-navigation="dock"` 会跑到页面上方。定位确认：旧碰撞策略会不断寻找控件上方的空隙，原回归甚至接受 1031×703 视口中的 `top:159px`；自定义规则默认横坐标还会跟随首尾消息缩进。此轮在原业务模块修正，不改安装权限、网站规则或 Browser Framework。

现在以主区域、实际滚动容器 client 区域和可见视口的交集为基准，排除边框与滚动条，并处理容器缩放。默认位置固定在可见对话区左下方；碰撞先在底部附近横向避让（最多 160px 且不超过区域宽度的 25%），再有限上移（最多 54px 且不超过区域高度的 15%），没有安全位置时隐藏，不跳到页面上方或最右侧。显式选择的锚点保留；容器尺寸及 visualViewport 变化会更新位置，窄屏保留底部横排。

浮层及运行可靠性定向 **28 PASS、0 FAIL**，语法检查通过；只读复审发现的滚动条边界及观察器覆盖缺口已修正。ego 中用当前源码渲染的合成页面验证：拥挤布局 1031×703 的 dock 为 `(436,539)`，真实点击回顶/到底为 `0 → 2897`；390×600 窄屏为 `(8,538)`、90×42 横排。合成页面不是已安装脚本或真实网站更新证据。原 Program Builder 已生成当前固定字节 `78d6f99db7dab5b861540ce1a89a93bb934697d60c1585e345d510ffa4c52b34`，状态仍为 `BUILT_UNVERIFIED`，正式 r17 包未更新。

**当前安装尚未更新：** 本轮只读实查 ego 仍为 r20261111、enabled / registered，`managedCleanup=unknown`、21 条记录。未重放清理、重复安装、改账本或干预其他 TaskSpace。浏览器验证资源已释放；共享 watcher 和日常加载目录未改动。证据：[定位验证](../../artifacts/ai-scroll-dock-position-20261109/result.json)、[合成页面桌面截图](../../artifacts/ai-scroll-dock-position-20261109/after-desktop.png)、[窄屏截图](../../artifacts/ai-scroll-dock-position-20261109/after-compact.png)。本轮未提交或推送，未做 production 或正式安装验收。

## 前轮：日常可用性复验（2026-11-09）

**ChatGPT 两个原有长对话均可刷新后自动显示导航，并真实点击回顶、到底。** 第一页滚动范围约 17156px，第二页约 1168px；未向网站发送消息。原真实 AI 自动配置与 Stop/Chat 草稿证据继续复用，本轮没有重复模型请求。DeepSeek、Gemini 未找到现有官方已登录长对话，均为 `NOT_TESTED`；不以非官方网站、空首页或 Node 测试代替。

刷新复验发现一处业务缺陷：自定义规则的六个固定浮层位置全部与原生控件、提示词悬浮栏冲突时，即使上方仍有空隙也隐藏导航。本轮在原 `src/floating-navigation.js` 复用同列控件上方的候选位置，保留全部区域、视口与碰撞保护。新增真实几何回归先失败，修复后浮层/配置定向检查 **49 PASS、0 FAIL**，语法与定向 diff 检查通过；未机械重跑前轮测试。

已通过原安装器审阅更新本机临时候选 **0.4.13/r20261111**，六条匹配范围、`page.dom`/`page.config`、USER_SCRIPT 世界及原 installationId 不变，generation 8、enabled / active / registered。五个业务模块与实际候选来源一致，两份当前文档均为 r20261111 / completed。候选 sourceHash `35b79377dccc5f1643c07972e7129754385f24c94d77b3b2d285bdafc2ad685e`，packageHash `8b4b5accaf1e6deea35a37e616a5059accea326319b50098aa75da5679008f3d`；仅为本机审阅更新，目录正式 r17 包未晋升。

原生侧栏完成“停用规则 → 关闭重开仍停用 → 恢复规则 → 再次关闭重开”。**停用自定义规则会回退 ChatGPT 内置适配，不等于停用该网站全部导航。** 最终网站、路径、四个选择器及五项导航开关与本轮基线完全一致；两次保存后的 ETag 为 `5f85dd75-db94-4ae9-8d31-4f482812420a`，关闭重开后保持一致。

**保留限制：** 期间共享 dev runtime revision 发生变化，末次安装读回 `managedCleanup=unknown`（21 条记录），界面提示部分旧网页状态待确认；当前两页可用不证明旧文档全部清理完成。未重放清理、改账本或再次安装，不将本轮称为安装生命周期或 production 验收通过。继续复用唯一 watcher 16888、43119 和 `dist/development`；原加载路径沿用前轮已核实设置，本轮复核 ID、serve 和 applied/output 指纹，未重新打开扩展加载路径界面。Native、模型配置与其他 TaskSpace 未修改。

证据：[日常结果](../../artifacts/ai-scroll-usage-20261109/result.json)、[当前配置/来源/执行读回](../../artifacts/ai-scroll-usage-20261109/final-readback.json)、[脱敏原生 UI 记录](../../artifacts/ai-scroll-usage-20261109/native-ui.json)。源码与回归在复验期间已被并行提交 `6fadef04c` 纳入；本任务未发起提交或推送，当前文档追加尚未提交。production、正式发行、完整矩阵、独立评分及双浏览器 Native 验收继续延期。

用户自查：打开已有 ChatGPT 长对话 → 刷新 → 点击浮层回顶/到底 → 在扩展中重开导航设置核对五项开关 → 管理自定义网站并停用/恢复规则 → 返回长对话确认导航正常。无须再次发送 AI 配置请求。

TaskSpace 38 已执行一次 finish 并归还，保留两个原 ChatGPT 页面与两份非本任务页面，无剩余临时托管页；共享 watcher 和服务继续运行。Ego Lite 提示有更新，本轮未升级。

## 前轮：真实 AI 自动配置核心已完成（2026-11-09）

在真实 ChatGPT 长对话中，经原共享 AI Chat 发送“自动配置当前网站的滚动导航”，本机 Codex 已完成观察、候选选择和原保存流程。界面返回“已保存并读回”，配置版本为 `c759aaf2-5762-4883-b276-2e5bc8f12182`；关闭重开侧栏以及真实 Stop 后，只读核对的配置与 ETag 完全一致。实际点击网页原导航按钮，滚动位置从 3430.5 回到 0，再到 3430.5（最大 3431）。

仅新增 `https://chatgpt.com` 的根路径规则，五个原为 true 的导航开关全部保留，内置站点适配保留。Chat 展开时原设置可操作，开合与共享 AI 设置往返保留草稿；新增适用路径默认空，× 清空并聚焦，返回不弹放弃确认。自有测试草稿已清空，没有向 ChatGPT 网站发送消息。

**本轮修复：** 业务观察器现在识别 `display: contents` 的可见后代；排除控件的内部深度不会遮挡有效对话，仍计入整个文档的 12000 节点预算。真实滚动容器需要 11 层结构路径，自动观察的结构选择器查找现限制为原有 64 层/256 字符；手动点选仍用原 8 层。观察不读取正文、标题、输入值或私有标识值。三个新增回归先复现失败，修复后观察/配置/提案 169 项、Chat 续问及安全保护定向 18 项通过，语法和定向 diff 检查通过。旧 318 项及 Native 36 项属于既有证据，未机械全量重跑，不能与本轮重叠计数。

用户授权直接判断处理旧页后，先将两份明确识别的旧文档保存到本机私有恢复目录，再安全重载并由原协议确认清理完成；另一任务的 Space 33 已归还用户。随后经原安装器审阅更新临时候选 **0.4.13/r20261110**，保留原六条范围、原 installationId `c821cc8a-62be-4a85-9c0f-d1ac13eeb7b0`，generation 7、active、registered，managedCleanup 已真实读回 retired（19 条记录）。未清空未知状态或重放安装。

临时候选在 `artifacts/ai-scroll-chat-20261108-receiver/observer-fix-depth-20261109/`：sourceHash `4158885879d9acb0ec4c24c1e3f9a08d2beca1be339b9b3574bc403a1e07e878`，packageHash `ea74f21a1196dab90d806064a590a851908f869394cd2161e6665225ab5a7b9d`。原 Builder/打包器产物逐字节一致，五个业务模块哈希与当前源码复核一致；目录正式 r17 包未晋升，已不代表本轮修复源码。

**证据边界：** 真实请求、业务回执、安装身份、重开读回及实际滚动已保存。原受控链仅接受本次观察候选，并持有同一轮授权至续问和读回；模型原始 JSON、candidateId 与 lease ID 为临时数据，产品未单独留存，本记录没有重建或编造这些回包。真实窗口截图含私有对话，仅保存在本机受限恢复目录，公开证据采用脱敏侧栏文本。Stop 已在真实 UI 验证；其他身份、文档、Provider、撤权和 unknown 保护以本轮定向与既有未改动边界测试为证据，不声称全部重新做过真实浏览器故障注入。

继续使用既有 `npm run dev`、`dist/development`、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf` 与 127.0.0.1:43119。TaskSpace 38 已完成并归还，保留原长对话 p2 与成功测试页 p11，临时 p4/p12/p13 已关闭，另外两份非本任务页面保留；watcher、原配对及其他服务未停止。Browser main / Native master 保留并行未提交改动，未提交、推送或正式发行。

证据：[核心结果](../../artifacts/ai-scroll-chat-20261108-receiver/observer-fix-depth-20261109/core-result.json)、[最终配置与 ETag](../../artifacts/ai-scroll-chat-20261108-receiver/observer-fix-depth-20261109/final-readback.json)、[实际导航](../../artifacts/ai-scroll-chat-20261108-receiver/observer-fix-depth-20261109/navigation.json)、[总台账](../../artifacts/ai-scroll-chat-20261108-receiver/verification.json)。production、正式发行、完整矩阵、独立评分和真实双浏览器 Native 滚动更新均未开展，不属于本轮核心完成声明。原对话 `01a1bbef-aaee-7cc2-b7cf-ba260511fb04` 的旧 goal 上次实读 blocked，未修改或恢复；本对话核心完成不改变其生命周期。

本对话原生 goal 已返回 complete，随后查询无活动 goal；原旧对话的 blocked 状态未修改。

以下保留历史观察。旧“候选未安装”“等待维护窗口”“模型闭环未验证”等状态均不覆盖本节当前结果。

## 历史：Native 已按授权完成更新，当时真实 AI 闭环待续接（2026-11-09）

用户明确要求直接强制结束阻止更新的旧连接并继续安装，完成后创建新对话。已通过 socket、真实可执行路径、UID 与完整进程命令核实两条当前连接，只对其 Native Host（PID 40335、40327）发送 SIGTERM，均正常退出；未停止 Chrome、ego、其他 Native 实例或 watcher。随后原官方 `browser update` 成功，将共用 Native 入口切到 `~/.opendesk-browser/native-agent-r1/build-native-rolling-update-20261109/OpenDesk.app/Contents/MacOS/opendesk`，扩展 ID、配对凭据、批准来源和 Profile 不变，旧 `/Applications/OpenDesk.app` 保留。未访问此前被 Browser Use 拒绝的扩展 URL，也未改浏览器设置。

安装后预检为 CLI 0.162.1、`READY_FOR_TURN / inferenceVerified:false`；连接清单暂为空，真实浏览器重连及 AI 观察→选择→保存→持久化仍未验证，配置写入仍为 0。进程结束不证明旧请求结果，未知状态不重放。证据在 sibling `.runtime/tests/native-rolling-update-20261109/authorized-install.json`。原目标工具仍返回 blocked；当前工具不能原地改写目标正文或恢复该状态，续接对话需建立完整新目标，不将旧目标伪报完成。

交接前只读观察：Browser main HEAD 已为 `16e85aaafdc9dc76da34aeb8c12fd6a99579733a`，唯一 watcher PID 16888、43119 仍监听；磁盘 tool-shell SHA256 已变为 `94d30fe895d0b985e0d8965f0e4dc3e04305e2a2c9edbd1ab0552718627ab4ce`。接收方须核对相关变更及实际运行产物，不能把旧 UI 指纹当作当前证据；不因无关 main 更新重复全量构建。TaskSpace 38 仍存在、ownership 为 agent，保留所有页面交接。以下未部署及迁移阻塞段落为历史观察，以本节为准。

## 共享 AI 自动配置当前网站（2026-11-08，核心开发中）

在已打开的长对话页进入「AI 对话」，输入「自动配置当前网站的滚动导航」。复用框架 `SharedConversationDock` / `SharedConversationFrame`、共享 AI 设置和独立消费者会话，展开后原设置仍可操作，开合保留草稿。原导航开关命令及明确提供网站、路径和 CSS 的手动配置方式继续保留；内置站点适配不因测试而删除或停用。

新增流程为：明确的当前网站配置意图 → 模型请求观察 → 已安装 Page 在当前精确文档中只读提取有限结构候选 → 同一受控推理会话继续选择候选 → 原设置保存。用户不必提供 CSS；模型不能自行编造选择器或网站范围。观察不采集正文、标题、HTML、输入值或属性值；仅发送精确 Origin、结构选择器及消息数量、是否可滚动等有限指标，完整私有 URL 留在本地校验。没有可用对话结构时明确失败，不把空首页视为已完成配置。

领域适配器位于 `trusted/ai-configuration.js` / `trusted/ai-controls.tsx`，Page 观察位于 `src/site-configuration.js`。观察沿原 Installed Page Broker 的身份、权限、执行世界和文档检查；保存前再次核对原安装及原文档，仍经原安装范围审阅、CAS/ETag、实时选择器校验和保存后读回。停止、页面或 Provider 改变、撤权和未知结果均保留原保护；未请求的导航开关、其他网站和本地草稿不随提案保存。

**已验证：** 领域校验 121 项、真实 React Chat 组件 45 项、只读 Page 观察 8 项、本地化及可信来源 38 项、Broker 观察与保护 69 项、原网站保存/CAS 37 项，共 318 项定向检查通过。Page 观察包含约 2500 节点、`data-turn-key` 消息结构；组件与 Broker 测试覆盖停止、文档变化、撤权及拒绝额外数据。这些属于自动化证据，不能代替真实模型和网页结果。

**当前真实入口：** ego 原生 Side Panel 已显示新提示词、保留原设置，并能在重新打开后读回设置。自动配置请求已填入草稿，尚未发送。2026-11-08 15:47:46 UTC 只读复核：自定义网站仍为 0，五项导航开关均为 `true`，本接续尚未写入配置。真实模型选择 → 原保存及 ETag 读回 → 重开持久化仍为 `NOT_TESTED`。先前 `E_AI_RESPONSE` 的真实原因是推理前的 `CODEX_UNSUPPORTED`；现已显示固定的四语言状态指引，不再将已知本机状态误报为提案错误。

连续开发目录为 `dist/development`，扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，serve 为 `127.0.0.1:43119`；11/08 交接产物 revision 为 `71e869d13f69909d451404613f8e97b378f4b5ba4646081470c3593d8116ac0a`，`ui/tool-shell.js` SHA-256 为 `b8d8076232fc7fdd5247466b16f1d8cd092bdb8517ef3afde18c1816d2365998`，最新运行时 revision 见下方接续复核。本轮继续使用唯一现有 watcher；未替换加载目录或扩展 ID。

**真实模型阻塞：** 独立 Native App 候选携带已审计、通过官方 npm 完整性核验的 CLI `0.162.1`，签名检查及无推理 `ai doctor` 通过，返回 `READY_FOR_TURN` / `inferenceVerified:false`。候选尚未安装：官方 `browser update` 被现有连接以 `E_SOCKET_IN_USE` 拒绝。未放宽 `0.164.0` 门禁，未修改系统 CLI、模型路由或现有安装文件。浏览器安全策略拒绝 Agent 打开日常 Chrome 的 `chrome-extension:` 本机连接设置页，已请求用户确认无任务后暂时关闭该连接；不经其他界面或命令绕过此拒绝。详细本机证据见 sibling OpenDesk 的 `.runtime/build/ai-scroll-chat-20261108/candidate-evidence.json`。

**2026-11-09 接续复核：** 原生侧栏沿目录页真实按钮打开，Chat 展开保留原设置，收起重开及共享 AI 设置往返均保留未发送草稿。北京时间 00:21 的只读核对确认 `sites=[]`、五项开关均为 `true`、ETag 与上次一致；安装身份及 generation 5 不变，`managedCleanup=unknown`（13 条 managed UI 记录）仍保留，没有重试安装或派发清理。此读回是只读诊断，不是保存回执。当前 Native 仍为 `CODEX_UNSUPPORTED`，候选仍为 `READY_FOR_TURN / inferenceVerified:false`；两条连接均响应 `bridge.status`，未再次尝试覆盖活动安装。真实模型、原保存及重开持久化仍未完成，等待日常 Chrome 的安全维护窗口。唯一 watcher 仍运行，运行时 applied/output revision 同为 `acf64ff7aef3226131add1a5a3cb5b8ce5917a9c0752f7d7505e44beef5f32fd`，侧栏 JS 指纹不变；详细证据见 `artifacts/ai-scroll-chat-20261108-receiver/receiver-recheck-20261109.json`。无源码变更，复用原定向检查，不启动全组回归或正式验收。

### 本轮目标与关键通过条件（2026-11-09）

已建立本对话原生目标，末次阻塞审计后状态为 `blocked`（目标未完成）：在上述持续开发环境的真实 ChatGPT 长对话中，使用真实 `local_codex` 完成「自动配置当前网站的滚动导航」→ 模型请求观察 → 同一推理 lease 选择实际观察的 `candidateId` → 原权限、实时 DOM 与 CAS 保存 → 同 ETag 读回 → 关闭重开后配置一致且导航可用。仅补当前阻塞和定向验证；production、发行、全量矩阵、独立评分及提交推送继续延期。

**并行运行与更新的边界：** 日常 Chrome、ego 及其对话页可以保持打开，同一 Native 安装支持多连接。每条连接有独立 socket、凭据和连接 ID；有多条连接时 CLI 必须显式指定 `--connection`，连接失效不得转投另一条。共享文件操作锁仍可能返回 `E_FILES_BUSY`，不承诺所有业务操作无竞争。当前已安装旧版更新器仍要求相关 Native 连接全部暂时断开，活动连接返回 `E_SOCKET_IN_USE`；这不是日常并行运行的前置条件，也不要求关闭浏览器或对话。用户随后授权完善多连接更新，本轮 sibling Native 源码候选已新增精确 scope 绑定的滚动更新：支持新合同的旧连接保留原版本，新连接使用新版本，原任务不强断或重放；旧版首次迁移仍保守拒绝，自动空闲交接未实现。新源码尚未部署，不能据此声称当前维护阻塞已经解除。合同见 sibling `docs/integrations/browser/native-messaging-host.zh-CN.md` 的“多连接期间滚动更新”。

| 关键条件 | 当前证据与状态 |
| --- | --- |
| 两条连接各自可选、响应身份正确；相同 requestId 并发及逆序响应不串线；关闭一条不损坏另一条 | 两条真实连接以显式 CLI 选择并行响应 `bridge.status`；Host 定向测试通过。真实双浏览器同时推理业务为 `NOT_TESTED` |
| 省略多连接选择器、已失效连接均拒绝，不回退或误投；共享文件锁竞争明确返回 busy，释放后可恢复 | 现有连接选择、授权隔离和共享操作锁定向测试；本次结果见 verification.json |
| 旧版活动连接拒绝更新且文件不变；新版连接可保留并更新默认运行路径，在途响应继续回到原连接 | `TestLegacyNativeConnectionsRejectUpdateWithoutChangingInstallation` 及 `TestRollingNativeUpdate*` 通过；临时 HOME/Host fixture，不触碰真实安装 |
| 默认安装与命名实例并存，更新只影响自身；伪造其他实例身份不能绕过保护 | 精确验证另一实例归属的回归通过；实际候选 CLI/Native 进程与模拟 Chrome 帧联调通过，真实双浏览器更新仍 `NOT_TESTED` |
| Chat 展开保留原设置；收起重开、共享 AI 设置往返保留未发送草稿 | 真实原生 Side Panel 已通过 |
| 模型只收到有限结构，不采集正文等额外数据；同 lease 只能选择本次实际观察的候选 | 原定向自动化通过；真实模型闭环 `NOT_TESTED`，当前仍受 `CODEX_UNSUPPORTED` 阻塞 |
| 只保存当前精确 Origin 的规则；保存前重验文档/安装/权限/实时 DOM，并经原 CAS 与同 ETag 读回 | 原定向自动化通过；本轮真实保存 `NOT_TESTED`，配置写入仍为 0 |
| 其他网站、五个原为 true 的导航开关不变；关闭重开配置及 ETag 一致，页面导航生效 | 未写入基线已复核；保存后的真实持久化及导航 `NOT_TESTED` |
| Stop、文档/安装/Provider 变化、撤权及未知结果不继续保存或自动重放 | 复用未变输入的原定向自动化；本轮真实模型执行未发生 |
| managedCleanup=unknown 不冒报安装成功，不自动重试、清除状态或重复清理 | 原未知状态保留；完整安装完成仍未证明 |

前次 Native 更新拒绝验证记录保留在 sibling `.runtime/tests/ai-scroll-chat-20261109/`，仅表示修复前基线。本次多连接子目标是保留旧连接和在途响应、让新连接使用新版、维持实例隔离与撤权保护；核心源码及隔离验证已完成，日常部署未完成。候选基于同一 `f42d26c246fc7c57a03a664d6b3b49e59e23aa48` 和必要任务改动生成独立 overlay，排除并行无关改动；race 定向回归 29 个顶层测试、36 项含子测试通过，实际新编译 CLI/Native 的临时 HOME 联调也通过（Chrome 为模拟帧客户端），证据在 sibling `.runtime/tests/native-rolling-update-20261109/verification.json`。源码复审未发现未解决的 P0/P1/P2；真实浏览器迁移、真实模型及签名 App 部署仍 `NOT_TESTED`。本项目运行源码及 Page 包未改动，不覆盖既有 watcher 输出。原真实模型、CAS 保存与持久化仍为 `NOT_TESTED`，末次审计后的目标状态为 `blocked`。

**本轮续跑已补齐签名开发候选：** `~/.opendesk-browser/native-agent-r1/build-native-rolling-update-20261109/OpenDesk.app` 同时包含滚动更新修复与内置已审计 CLI 0.162.1，使用原固定开发证书签名，严格验证通过；预检为 `READY_FOR_TURN / inferenceVerified:false`。真实旧/新签名 App 在临时 HOME 中的首次迁移联调通过，未触碰日常安装；证据见 sibling `.runtime/build/native-rolling-update-20261109/candidate-evidence.json` 及 `.runtime/tests/native-rolling-update-20261109/legacy-candidate-smoke.json`。当前只读检查得到两条不同于上次的 ready 连接，仍均为能力版本 0、运行 `/Applications/OpenDesk.app`；安装扩展 ID 保持不变。旧版安全重连与日常部署尚未完成，不自动断连或绕过此前浏览器 URL 策略；真实推理、保存及重开持久化未执行。

**2026-11-09 01:16 阻塞审计：** 只读复核确认两条 ready 连接 `27c547f679efa058800479f180f9aed9`、`d38f42b654d2b3be56fdc1cd83fa8758` 仍为能力版本 0，运行日常 `/Applications/OpenDesk.app`，新签名候选摘要未变。源码修复、签名准备及本次复核连续三轮均受同一首次迁移条件阻挡；此前自动浏览器 URL 策略拒绝原日常扩展设置入口，并禁止换入口绕过。原生目标工具已返回 `blocked`，完整目标保留，真实推理/保存/持久化未完成。恢复条件是旧 Native 连接经正常生命周期安全结束，或原设置入口的工具限制解除；浏览器与对话页可以保持打开。不重复构建、测试、安装或强断其他任务。复核证据：sibling `.runtime/tests/native-rolling-update-20261109/blocked-audit-recheck.json`。

## 当前编译包与测试安装（2026-11-08，0.4.13/r17）

项目唯一正式可导入文件为 [`ai-scroll-navigation.opendesk-page.json`](./ai-scroll-navigation.opendesk-page.json)，项目和官方目录版本已同步为 **0.4.13 / revision 17**，目录发行仍为 `blocked`。原 Program Builder、Page 包校验及源码/编译字节同源检查通过；源码 SHA-256 为 `211d2b2aafa67f0bfa9423ca3d1c50b480ef4aec404bd8c674139c59ffe20c53`，安装合同内 `packageHash` 为 `5c606fcce5d5e3854468dc16edae51f4f1b18be157bc9efaf2eb5df877ad2710`。正式包仍只有原三站范围；本轮未将它安装到含额外本地测试范围的现有安装中。

为保留现有六条已批准范围，以同一源码和原打包器另生成 `artifacts/ai-scroll-chat-20261108-receiver/local/` 临时 **0.4.13/r20261108** 测试候选。原 Installer 的一次更新已持久化并注册，installationId 保持 `c821cc8a-62be-4a85-9c0f-d1ac13eeb7b0`，generation 为 5，原范围未变；源码 SHA-256 为 `4c8d3c3315c52123f8ea2406e6af1d4e22c15f24c7e129e1597a12192b93a44a`。安装器同时返回 `E_PAGE_INSTALL_PENDING`，`managedCleanup=unknown`；这不是完整安装成功，不自动重试、清除未知状态或重复更新。新文档已打开，实际 Page 观察仍待真实模型流程调用。

“添加网站”的可选适用路径新增时留空，有内容时可点 × 清除；相关表单证据保留。可信设置 UI 随 Browser 固定编译分发，**不包含在 Page JSON 中**。本轮未提交或推送；production、正式发行、全量矩阵及独立评分均未执行。下方各版本记录仅保留历史证据，不自动构成本候选通过。当前本机核对详情见 `artifacts/ai-scroll-chat-20261108-receiver/verification.json`。

## R4.0 正式 Side Panel 迁移记录（2026-11-08，待同候选验证）

- **正式入口**：使用项目自身 `trusted/react-controls.tsx` 的唯一 `ScrollSiteManager`（由 `src/ui/react/tabs/tools.tsx` 固定导入）、原 `extension-center.js` 和可信 Page Installer；首页只展示 ChatGPT、DeepSeek，完整列表加入 Gemini。自定义网站管理、添加/编辑、四项 CSS、图标点选和单一保存操作区已接入源代码。
- **设置文案归属**：`trusted/host-localization.js` 持有简中、英文、繁中、日文，复用框架 `uiMessage` 和已解析的全局语言；组件状态使用语义键，切换语言保留当前视图与草稿。通用安装、卸载和诊断文案留框架目录。此处为固定编译的可信设置 UI；Page 包不取得可信页面执行权，修改设置 UI 随 Browser 源码分发。
- **权限与数据**：只用精确 HTTP(S) Origin + 既有 `pathScope` 合同；新范围先走原安装审阅，批准后返回表单继续保存。现有 `readScrollSiteConfig` / `saveScrollSiteRule`、etag CAS、精确活动文档检查与保存后读回未更换。不可将权限批准或预览选择器当作规则持久化。
- **Page 运行时**：`main.js` 现在调用 `installScrollSiteRuntime`，不再向目标网页挂载旧齿轮或完整设置面板；仍使用原规则读回、`activeRule()` 和临时点选高亮，以保护 Side Panel 关闭后导航独立运行。为兼容已有测试与辅助函数，旧视觉模块目前仍保留不在生产页面挂载的内存代码；未声称完成源码级全面删除。
- **导航设置**：五个开关沿现有 `saveScrollNavigationSettings` 与 etag CAS 保存并读回，切换语言只重绘展示，不保存开关。此为当前源码及定向组件证据；目标网页是否已使用新配置仍需同候选实测。
- **验证范围**：`node --test tests/environment/ai-scroll-react-manager-r38.test.mjs projects/ai-scroll-navigation/tests/site-configuration.test.mjs`；应进一步验证 CSS/权限/草稿回退和当前 Chrome 的真实网站点选、安装审阅以及保存读回。此条只列定向命令，不等于已经执行。`NODE_NOT_TESTED` / `CHROME_NOT_TESTED`，尚无本轮同候选安装与浏览器证据。既有 0.4.10/r14 导航及思维导图历史证据不自动迁移为新源码验收。
- **打包边界**：`.github/workflows/ai-scroll-navigation-r131.yml` 已按项目版本和冻结包计算候选 Revision；本地 **0.4.12/r16** 已通过原打包器和同源校验，尚未执行远端发行。安装仍经原 Page Installer 审阅；可信设置 UI 随 Browser 源码分发，不能用 Page 包或网页预览替代。


## 默认安装与回复工具组（2026-11-07）

**2026-11-08 最新状态：用户已确认功能测试通过，按钮与思维导图只做增量验证。** 日常「您的 Chrome」已由原侧栏更新并恢复 **0.4.10/r14**，新标签页自动显示回复三按钮及左下角导航，回复回顶已实际点击生效；见 `artifacts/ai-answer-tools-20261107/daily-chrome-before-clicks-20261108.png`、`daily-chrome-reply-top-20261108.png`。其余完整点击链复用下述既有证据。本轮将独立导图 owner 统一为 [`projects/ai-reply-mindmap/`](../ai-reply-mindmap/README.zh-CN.md)，导航源码和冻结包不变，不重复完整功能测试。

当前源码与唯一 Page 包更新为 **0.4.10/r14**，回复按钮与思维导图共用 `span[data-ai-answer-tools]` 并保持左对齐；兼容复用旧安装版的共享容器，不替换对方按钮或原生操作。已适配当前 ChatGPT 的 `data-markdown-text-style="assistant-message"` 正文及将重新生成收进「更多」的完成回复；继续拒绝重复正文、页脚或操作按钮等歧义布局。

滚动导航现列入官方默认预装：首次全新安装的可信 Side Panel 沿原 Page Authority 安装固定包，仍须具备 Chrome 网站访问权限及用户脚本许可。已有 Profile 不因更新补装，不覆盖主动停用、卸载、已有包或未知清理状态。

本轮已在 ego 的原生 Side Panel 经原 Installer 更新到 r14，安装身份和原三站范围不变，读回 enabled / active / registered。在已有 ChatGPT 长对话验证回复开头/末尾、对话顶部/底部、与导图共存及独立启停；共享组紧跟原生按钮约 2px。恢复后刷新自动显示，无需到开发页 Run。当前 DOM 适配及共享生命周期的相关测试 126 项通过。

全新独立 CFT Profile 已证明首次可信 Side Panel 自动安装、列表显示和重开不重复，读回同一 r14、enabled / active / registered。ChatGPT 首次访问及刷新均自动执行，原 Authority 回执为 `page_auto / completed`，返回 `active`。2026-11-08 按用户指定的已有登录 ego 入口创建专用新对话，回复完成后自动出现导航与导图；实际回复开头/末尾、整段对话顶底及边界禁用通过，刷新后自动恢复，同 r14/安装身份/哈希的回执仍为 `page_auto / completed`。这是分环境验证；同一全新 Profile 登录后的回复导航仍为后续 `NOT_TESTED`，未冒称同环境通过。新环境使用独立静态开发测试快照，本轮默认安装输入与 main 同源；无关 AI Proxy / Native 模板使用已审阅基线，不作为 main 整体构建验收。DeepSeek/Gemini 长对话和 production 为 `NOT_TESTED`。

11/08 新对话的共享组仍只有一个 SPAN 短标记，与最后原生操作相距 2px；回复回顶滚动值 725→210（正文 top=64），回复到底 725→525（正文 bottom=691），整段对话顶底为 0/725。见 `artifacts/ai-answer-tools-20261107/new-conversation-navigation-20261108.json`、`new-conversation-refreshed-20261108.json`、`new-conversation-installed-readback-20261108.json`；测试对话保留供查看，自有临时浏览器及元数据标签已正常收尾。

候选来源、安装和核心证据见 `artifacts/ai-answer-tools-20261107/final-candidate-provenance.json`、`installed-restored-readback.json`、`installed-r14-navigation.json`、`fresh-after-first-sidepanel.json`、`fresh-after-reopen.json`、`fresh-auto-runtime-after-refresh.json`。本节取代下方历史版本及目录策略，不将历史实测视为本包验收。

## 历史来源与按钮职责（2026-11-07 核对）

此项目就是从提示词扩展拆出的导航。Git 提交 `03f7cda72` 将 `examples/sidebar-tools/prompt-shortcuts/trusted/page.js` 的导航接入及浮动区移入独立 Page 项目；`8998424f4` 再将 `examples/programs/chatgpt-jump-top/` 迁到本目录，多数业务文件为原字节重命名。当前提示词项目位于 `projects/prompt-shortcuts/`，不再提供导航。

| 位置 | 滚动目标 | 当前实现 |
| --- | --- | --- |
| 思维导图旁的两枚按钮 | 对应这一条长回复的开头、末尾 | `conversation.js` 的 region 导航，与导图共享回复工具组 |
| 已确认关系的代码／写作内容块 header | 对应内容块或编辑器内部的开头、末尾 | 同一 region 适配器；不等同于整段对话 |
| 对话区域左下角的浮动双按钮 | 整段对话顶部、底部 | `floating-navigation.js`，独立于提示词栏和回复工具组 |
| 页面最上方的对话 header | 历史上的对话回顶 | 最早 `f105d31ec` 有单枚回顶按钮；当前入口明确 `conversationDirections:{top:false,bottom:false}`，整段对话导航由浮动区提供。未找到这里同时默认显示顶、底双按钮的已提交版本 |

`ea3fe993a` 曾在提示词扩展中引入回复顶底、对话顶底及浮动回顶五项开关；`7f569f280` 将整段对话顶底合并为独立浮动双按钮。`ebd450a4b` 后来让回复导航与思维导图共用回复背景。因此，“回复导航通过”“整段对话浮动导航通过”和“header 导航通过”是不同声明；本轮实测不宣称已恢复对话 header 按钮。本节只核对来源和职责，没有更改当前按钮位置或安装包。

## 目录迁移说明（2026-11-02）

本项目已从 `examples/programs/chatgpt-jump-top/` 整体迁移至 `projects/ai-scroll-navigation/`。项目身份保持 `opendesk.ai-scroll-navigation`，源码、Page 规则、当前安装包、测试和证据均以新目录为唯一归属，不生成第二套实现。**历史 `opendesk.chatgpt-jump-top` 0.2.0/r2 导入包已于 2026-11-03 从项目目录清理**；旧 ID 的页面标记兼容逻辑仍保留。清理仓库文件不会卸载、撤权或修改用户已经安装的旧版本，其生命周期仍由原 Page Authority 管理。

## 最新真实 UI 核心完成（2026-10-27，0.4.7/r11）

**本次测试 Profile 的核心操作已完成。** 在 Mac 有窗口 CFT 154 的独立持久 `test-chatgpt-01` 中，经原 Installer 安装并读回相同 r11 字节，真实点击验证 ChatGPT 导航与提示词浮动栏同为根节点子元素、左边距均为 349px，正常窗口内互不重叠；整段对话回顶与到底及边界禁用可用。当前 R134 宿主的稳定回顶位置为 `0.5`，最大值 `7917`；首次加载后的内容展开曾改变位置，未把该中间读数当成回顶成功。回复操作组起始边距为 `0px`、`justify-content:flex-start`；真实回复回顶可见首节，末端按钮点击后可见末节（不单独归因额外滚动距离），原生「更多操作」可打开。

实测修复了两个业务问题：透明侧栏父元素中的按钮被误算为障碍，导致导航隐藏；关闭 Shadow DOM 的提示词栏未预留位置，导致重叠。现在过滤不可见祖先，检查公开 Shadow DOM 与根级固定宿主的可见矩形，并沿同一左边距寻找空位；不读取其他工具私有内容，不修改宿主或 SDK。

本地 `http://127.0.0.1:43111/demo-form.html` 已完成：可视选择区域 `main > div > div` 和滚动容器 `html` → 消息 `.unit`、路径 `/demo-form.html` → 双向测试 →「已保存并从可信 Host 确认」→ 刷新恢复双按钮及边界状态 → 停用后「原生注销已确认」且网页入口移除 → 恢复、刷新并从可信 Host 读回同一条配置。最终 r11 安装身份为 `db7f5f7f-6d9e-4061-a307-a262fbe03555`，授权 active、Chrome registered、清理 retired。允许的 UI 不显示 ETag，故数值 ETag 保留 `NOT_TESTED`。

测试复用既有 R134 production 静态快照 `/private/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/opendesk-r134-r7-inputs-pnfhgxbr/dist/production`，扩展 ID `jebmpompeddppmefggjeffhldlkhkkdo`，无 serve 连接；这是独立测试宿主，不代表当前 main 扩展的完整 production 验收。此前 Send Queue 静态快照缺少配置桥接，改用已有 R134 快照后完成本地链路，未为环境差异修改平台。测试结束已正常关闭自有浏览器、释放 Profile 和 UI 锁，保留登录态与规则；没有发送 ChatGPT 消息。

r11 sourceHash 为 `05a3108f3a6b1afefb470e796c98b45f0f9cd08f586a97ea6d98ea3503517e6e`，packageHash 为 `d14640c5df41c003e286a69a940b2dbfe5a68607305afa6df8a79dcf616a1c66`，五个业务模块与当前源码及构建记录逐字节一致。受影响的 89 项定向检查通过；透明父元素用例进一步限定为可见侧栏后，9 项布局检查再次通过。源码与测试改动留在 main 工作区，未提交或推送；目录正式 r7 包未覆盖，日常安装清理问题未在本轮处理，DeepSeek/Gemini 长对话、正式发行、评分及尺寸矩阵不属于此次核心完成声明。

证据：[最新结果与截图索引](../../artifacts/ai-scroll-r134/test-profile-left-alignment-20261027/result.json)、[r11 测试候选](../../artifacts/ai-scroll-r134/test-profile-left-alignment-20261027/r11/ai-scroll-navigation.opendesk-page.json)、[ChatGPT 实际布局](../../artifacts/ai-scroll-r134/test-profile-left-alignment-20261027/r11-r134-chatgpt-top-final.png)、[恢复后的配置](../../artifacts/ai-scroll-r134/test-profile-left-alignment-20261027/r11-restored-config.png)。下文均保留为历史观察，不覆盖本节最新结果。

## 历史：指定测试 Profile 实测中断（2026-10-27，首次 r9 未安装）

本轮已取得并释放自身 UI 锁，经 CUA 精确选择 CFT 154 进程 PID 54791，新建本任务窗口；`chrome://version` 实读为 `test-chatgpt-profile` 对应的 `codex-cft-xjma6yw1/Profile 1`。Chrome 扩展详情实读 ID `ajjjgoapcaonglplhlnlfofmlemdakhk`，实际加载 Send Queue 静态开发快照 `artifacts/send-queue-r56-mac-final-01a17882/source-snapshot/dist/development-developer`，用户脚本已允许；未验证 serve 连接。原导航安装 ID `dc776e10-cce8-4dd3-a829-94283e9417de`、r7、active / registered、清理 retired，与日常安装分开。

从当前业务源码用原 Program Builder 和 Page 打包器冻结独立 **0.4.7/r9**，保留指定六条精确匹配。sourceHash 为 `9fc66673189bca2f39141eb3f21f4f384a09dfefe13d5ea9c67e70c75b4cb883`，packageHash 为 `68784ccd790dabc3d44638ae83e3f6271d7e04b7bfb640618dfec4b807c72c9a`；全部五个业务模块逐字节对应当前源码。旧 r8 继续不适用，目录正式 r7 包保持原字节。

已只读打开指定既有长对话，看到真实提示词快捷按钮和旧导航，并进入原「更新 / 导入新版」文件选择器。**选择器尚未完成、未进入 r9 审阅时，CUA 返回 `App quit`；进程检查确认 PID 54791 及其目录对应进程已退出。退出原因未确定，不据此认定脚本产品故障。** 按交接明确限制没有重启、替换 Profile 或强抢其他窗口。r9 未安装，最新左对齐、上下滚动、边界禁用、回复组、本地适配、可信保存、刷新及停用恢复全部仍 `NOT_TESTED`；本轮不重复已有 Node 测试，也不声称 UI 测试完成。

历史候选与来源：[首次中断证据](../../artifacts/ai-scroll-r134/test-profile-left-alignment-20261027/interrupted-result.json)、[历史 r9 候选](../../artifacts/ai-scroll-r134/test-profile-left-alignment-20261027/r9/ai-scroll-navigation.opendesk-page.json)。后续需先在获准恢复的同 Profile 读回真实安装状态，再复用此不可变 r9 走正常审阅和核心 UI 链；日常清理阻塞、production、发行及评分仍单独延期。本轮未改业务、平台源码或共享服务，未提交或推送。

## 父容器左对齐修正（2026-10-27，源码完成、安装未验证）

按最新要求，置顶/置底导航与提示词快捷按钮的浮动宿主同为 `document.documentElement` 的子节点，使用相同的主区域左侧 8px 边距，不再额外叠加提示词栏的 1px 边框和 6px 内边距。320px 左侧导航占位场景中，导航宿主从上轮的 335px 修正为 328px；碰撞避让只沿该左边距向上移动。独立安装不依赖提示词工具的 DOM、安装或启用状态。

回复操作区 `span[data-opendesk-chatgpt-answer-tools]` 取消起始侧自动边距，改为起始侧 0、末尾侧 auto，内部按钮靠左排列；复用已有右对齐组时也会修正布局，保留原生操作和独立 Mind Map 宿主。改动只涉及本项目业务源码和定向测试，上下滚动及边界禁用通过相关检查。

修复前 7 项相关用例失败，修复后 `node --test --test-reporter=dot projects/ai-scroll-navigation/tests/floating-navigation.test.mjs tests/environment/ai-scroll-navigation.test.mjs` 共 86 项通过，两个修改模块语法检查通过。原生 UI 锁仍由其他 owner 持有，本轮未取得锁、未操作浏览器，也未刷新可信状态；上轮的停用及 `managedCleanup=unknown` 只是最后已知安装状态。本轮真实对齐、安装、网站适配、可信保存和刷新恢复仍 `NOT_TESTED`。

**下文旧 0.4.7/r8 候选已不对应本次源码，不可作为本次修复包导入。** 保留旧候选及其历史哈希，不重建扩展、不覆盖 watcher；后续只有正常可信状态实际变为 retired 后，才从最新源码通过原 Builder 生成新的不可变 Revision、保留已批准六条范围，并走原 Installer 同身份更新。原正式 JSON 仍为 0.4.6/r7。本轮证据记录在既有 dev JSON 和 R134 台账的 `parentContainerAlignmentCorrection`。

## 上轮左边距修复与安装阻塞（历史记录）

**源码已修复，新版尚未安装（`SOURCE_FIXED_UPDATE_BLOCKED_MANAGED_CLEANUP`）。** 本轮已取得并释放原生 UI 锁，在日常 Chrome 的既有 ChatGPT 内容截图中再次复现旧导航偏右。DOM 矩形驱动超时，未将截图估读或定向测试当作新版原生通过。源码改为按可见主区域、原生导航占位及完整对话列定位，并计入提示词按钮的物理内边距；不依赖提示词工具 DOM 或启用状态。自定义锚点、其他站点、单实例、可信点击及清理合同保持。

此前定向检查已复现旧算法 `598px` 对比目标 `335px` 的偏移，修复后 109 项受影响检查通过；本轮没有重复源码测试。三站基候选 **0.4.7/r8** 的 sourceHash 为 `361aa36fb1a18799a8c5143a04cf782ab77f8c554e651e9c558bf459e2b974b4`，未安装。为保留当前已批准的本地范围，本轮从相同业务源码快照经原 Program Builder 生成临时日常候选 `artifacts/ai-scroll-r134/dev-left-alignment-20261027/daily-r8/ai-scroll-navigation.opendesk-page.json`，只补入已批准的三条本地精确匹配；sourceHash 为 `84f8ba1795b0233e3b42f2f7430a5c5bdba1ad9532887ed4cd7c438e43192861`，packageHash 为 `8414db7c010288b570ce508f98990429b4e30fd60325383a532fa029d22d6f4d`。包与构建字节、当前源码模块逐项一致；仓库正式包仍为 0.4.6/r7。

原「更新 / 导入新版」已显示**网站权限范围未变化**，完整保留三站及 `http://127.0.0.1:43111/demo-form.html`、`?*`、`/*` 六条执行匹配。但确认更新返回 `E_PAGE_CLEANUP_PENDING`：旧安装 `managedCleanup=unknown`，不能覆盖恢复记录。此未知态在更新前已存在。正常详情停用移除了当前文档的导航、回复按钮及网站适配入口；恢复同样被清理栅栏拒绝。结束本聊天旧测试文档后，可信刷新仍为 unknown。**当前原安装仍是 r1978225210，原 installationId `0f356e39-c6a2-4694-81e7-18ce3dbc2e1d` 和范围保留，授权及 Chrome 注册均为 disabled；没有安装 r8，未强制恢复、卸载、清空账本或修改 Authority。** 其他聊天窗口未动，配置未写入。

日常扩展 ID 实读为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，Chrome 详情的实际加载来源已核对为 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`；「调试 → 本地开发服务」已连接，构建指纹 `342c19166d67c722a19754ef539027686c1d0d55d12120d2de340221f8feb371`。未构建或重载扩展、未覆盖共享 watcher。本聊天续接入口为 windowId `560068656` / tabId `560068665` 的本地 demo；旧窗口中本任务三个标签及本任务原单页已正常关闭，均可按原 URL 重开。

下一步只读核对原安装清理是否已由真实文档退出变为 retired；unknown 不变时不重复更新、启停、测试或构建。解除后才按原 Installer 更新同一身份并恢复，再核对真实对齐/上下滚动 → 本地可视选择主区域和实际容器 → 双向测试、可信保存读回、刷新和边界禁用 → 正常停用清理与恢复。配置/ETag 保留仍 `NOT_TESTED`；ETag 无允许入口时如实保留未验证。原始记录及截图见 [本轮 dev 证据](../../artifacts/ai-scroll-r134/dev-left-alignment-20261027/dev-result.json) 和 R134 台账 `leftAlignmentContinuation`。production、发行、评分及尺寸/边缘矩阵继续延期。

## 前次 dev 测试（2026-10-27）

**当前 dev 已通过 ChatGPT 实际滚动操作和本地网站范围更新，网站适配核心流程尚未完成（`HANDOFF_PARTIAL_CHATGPT_AND_LOCAL_INSTALL_PASS`）。** 此前已从日常「您的 Chrome」工具栏正常打开侧边栏并进入「开发」，未再出现 `ERR_FILE_NOT_FOUND`；「调试 → 本地开发服务」实读为已连接，扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，构建指纹为 `d689f432f4827c58922537502eba3be1368efb4b1bfb071fa9781b000c1c32c4`。实际加载目录仍未从日常 Profile 详情读回，不能只凭预期 `dist/development` 路径认定。

日常安装原为主动停用的 r2。本轮通过原「更新 / 导入新版」安装 **0.4.6 / r7**，读回源码 SHA-256 `487f655fb22184bedbde0450b7e6f542961aa76ecc78a806fd1e63b0190335e3`，安装身份 `0f356e39-c6a2-4694-81e7-18ce3dbc2e1d` 保持，升级保留停用；随后为本轮测试明确恢复，Authority 为 `active`、Chrome 注册为 `registered`。这不证明网页已实际导航。

等待并行原生操作结束后，已通过原安装器完成本地 `http://127.0.0.1:43111`、路径前缀 `/demo-form.html` 的固定范围更新，版本 `0.4.6+site.r1978225210`、修订 `1978225210`；安装身份保持，授权 `active`、Chrome 注册 `registered`。更新后固定源码 SHA-256 为 `3d1157f6e92ff1e77d8ec56a7c1ccf7dacf57d67ade13343e3b8fd11ac429da6`，Manifest SHA-256 为 `86379c7f154838a2744d1ec13005bb25d6091988d09ed586102711175ef515e5`。刷新后网站适配入口自动显示，可信 Host 读回 0 条规则；区域选择尚未保存，用户要求新对话续接后已按 Escape 收束选择，保留专用标签并释放 UI 锁。未发协调消息。

在本任务独立日常 Chrome 窗口、既有 ChatGPT「技术验证准备確認」对话中，已实际点击整段对话顶部和底部：真实 `.thread-scroll-container` 的 `scrollTop` 分别落到 `0.5` 和 `7883.5`（最大值 `7884`），对应边界按钮停用；末条长回复回顶落到 `6734.5`，可见其首节。末条回复到底后可见末段，但定位器可能先把末尾工具栏滚入视口，不单独据此归因按钮处理函数的滚动距离。刷新后整段对话双按钮及网站适配入口自动恢复。未发送消息；本次未验证 DeepSeek/Gemini，规则持久化及停用恢复仍待完成。

用户最新要求：左下角置顶、置底双按钮的左边距与提示词快捷按钮一致，提取前坐标正常。接收对话优先核对真实页面与原定位逻辑并修复，再完成网站适配、可信保存刷新和停用恢复；本对话尚未修改该定位。

本任务未改业务或公共构建源码，未启动第二个 writer、停止服务或发送网页消息；不为驱动焦点问题修改安装器。旧的内部 URL 拒绝和隔离 production 测试保留历史，不能代替当前 dev 通过。详见 [R134 台账的 `devContinuation`](../../docs/framework/workstreams/ai-scroll-navigation-r134-delta.json) 与其中证据索引；production、正式发布、评分和边缘矩阵继续延期。

## R1.3.4 增量（2026-10-27）

- 当前正式可导入包为 **0.4.8 / revision 9**，保留独立 Program ID `opendesk.ai-scroll-navigation`。后续历史章节不能代替本候选证据。
- 首次使用 Page 网页增强时，需在 Chrome 的 OpenDesk Browser 扩展详情中允许用户脚本。安装后在批准的网站直接运行；不需要再到产品详情启用一次。`E_USER_SCRIPTS_UNAVAILABLE` 时先核对这一 Chrome 权限开关及其真实读回。
- 从「扩展 → 已安装 → AI 对话滚动导航 → 详情」填写精确 HTTP(S) Origin 和路径前缀，进入原 Installer 审阅。Chrome 网站授权可能覆盖整个主机；原生匹配路径、明确端口与可信 Host 仍约束程序执行。HTTP/HTTPS、localhost、127.0.0.1 和不同端口分别处理，禁止通配 Origin、查询或片段作为路径范围。
- 自定义网站候选由可信 Host 从当前不可变源码生成，使用 `1_000_000_000..2_147_483_647` 的保留 Revision 区间和 `+site.r…` 版本。相同输入生成相同身份，碰撞失败并保留旧安装；官方冻结包不得使用该区间。Revision 是不可变键，不以数值决定升级顺序。
- 新网站审阅成功后打开或刷新目标页面，点击「网站适配」，选取主区域与滚动容器，可选消息和锚点，分别测试顶部、底部，再保存并核对可信读回。配置与安装授权分离；并发冲突及未知保存需先主动重新读取。收缩授权保留休眠规则数据，不能借旧规则恢复执行权限。
- 扩权拒绝或原生注册失败保留原安装；旧确认、停用、撤权和未知状态不能显示成功或自动恢复。升级不扩权时复用合法安装授权；新增范围仍须原审阅和 Chrome 权限。
- **本阶段核心闭环已在 Mac 有窗口 Chrome 的隔离 Profile 跑通**：原安装器安装 r7 → 审阅并更新本地精确网站范围 → 可视选取对话区域和滚动容器 → 上下测试 → 可信保存并读回 → 刷新恢复双按钮及边界禁用态 → 正常停用清理和恢复。测试页面为 `http://127.0.0.1:43111/demo-form.html`；主区域选取结果 `main > div > div` 对应 `.lab-content`，滚动容器为 `html`，消息选择器为 `.unit`。恢复后配置值与 ETag 均保留。
- 定向 Node、真实 Builder、包哈希与本次原生核心证据分别记录在 [R134 增量台账](../../docs/framework/workstreams/ai-scroll-navigation-r134-delta.json) 的 `coreContinuation`。复用已有 production 快照，未替换日常扩展，也未重测未变输入。本次网站扩权升级发生于首次规则保存前；保存后的升级保留沿用未变的定向保护测试，不新增原生通过声明。**三站真实长对话、完整发行验收仍未完成，官方目录继续 `publication=blocked`；边缘矩阵延期。**


## R1.3.2 配置增量（2026-10-26）

- 正式源码目标版本 **0.4.2 / revision 3**；仅已批准安装的独立 ID `opendesk.ai-scroll-navigation` 可读写本程序网站配置。原有 0.4.1/r2 不因源码变化而自动获得 `page.config` 权限，更新需在原 Installer 审阅能力差异。
- 以页面右下角「网站适配」入口选取对话区域及真实滚动容器；上下分别测试，保存使用原 Installed Page Broker 的身份、文档、原生注册和授权读回，并使用 CAS/ETag 与保存后重读。
- 规则作为惰性 CSS 字符串按 Program ID 持久保存，支持刷新后恢复、冲突报错、重复保存确认及升级保留；不能把规则或网站存储当作授权。
- **新增任意 Origin 的自动打包、扩权审阅与安装闭环仍未实现**：现阶段 UI 只能保存已通过冻结 pageRules 获批的网站规则。要支持新网站，先由原 Installer 完成包含该 Origin 的受审阅升级，不能靠新增规则或 `<all_urls>` 绕过。
- 本段记录源码设计和本轮变更范围，并非 Chrome/Mac 原生验收结论；应以对应提交的 CI 与包哈希结果为准。正式目录继续 `publication=blocked`。

## 历史：R1.3.1 安装与状态（2026-10-26）

- **正式包与入口**：[ai-scroll-navigation.opendesk-page.json](ai-scroll-navigation.opendesk-page.json)，ID `opendesk.ai-scroll-navigation`，版本 **0.4.0 / revision 1**。在 OpenDesk「扩展 → 导入」选择此文件，审阅身份、版本及 ChatGPT、DeepSeek、Gemini 三站范围后安装；安装后归「网页增强」，由原 Page Authority 管理。
- **独立使用**：无需安装 Prompt Shortcuts。旧 `opendesk.chatgpt-jump-top` 与新 ID 分别管理，旧安装和网站授权不会自动转移；可在原管理入口主动停用或卸载旧安装。
- **已有证据**：指定冻结 Browser 候选已通过真实 Chrome 安装、范围审阅、注册读回、停用/恢复、更新、撤权清理、新旧 ID 独立安装与卸载；完整浏览器重启后仍保留同一 installationId 和停用状态。候选身份与原始证据见[四产品工作记录](../../docs/framework/workstreams/ai-four-products-r125-local-20261026.md)，不代表当前 main 整包验收。
- **本轮内容操作**：同一冻结 Browser 候选、原 0.4.0/r1 在已登录 ChatGPT 的既有长回复中显示导航；实际点击后分别看见当前内容区域的首节和末段。此证据限于该区域的两个方向，不代表整段对话、全部内容类型或三站完整验收；与本机 Mind Map 新身份的两轮开关共用同一页面。
- **当前剩余**：DeepSeek、Gemini 的真实长对话导航仍为 `BLOCKED_CONTENT / NOT_TESTED`。官方目录继续 `publication=blocked`，暂不开放目录安装；上述原包导入入口不等于官方发行已批准。

下方 R1.2.1 及更早章节保留当时的源码与验收状态；其中“新包待构建”“安装未验证”等结论已由本节和工作记录中的增量证据更新。

## 历史：R1.2.1 业务源码（2026-10-25；当时新身份未正式安装验收）

- **独立 Page Program**：代码自带滚动导航；不再要求 Prompt Shortcuts 安装、启用或提供运行时。安装来源仍为 `projects/ai-scroll-navigation/`，避免破坏现有路径引用。
- **新 Program 身份（源码）**：`src/main.js` 与 `package.json` 现一致为 `opendesk.ai-scroll-navigation`，项目版本 `0.4.0`。旧 `opendesk.chatgpt-jump-top` 不是同 ID 升级，原 `0.2.0` 正式包仅是历史安装制品。已查阅原 Page 安装合同，跨 ID 没有已证实的授权迁移；必须由用户在「扩展」审阅旧安装并明确停用/卸载，再经独立的网站权限审阅安装新 ID。**任何旧授权都不自动转移，新包仍待同源构建及核验。**
- **按站点单独适配**：ChatGPT 沿用原长内容识别及共享回复操作组；DeepSeek 只在经过固定路径和操作栏绑定规则的对话中提供长回复操作；Gemini 仅尝试在确定对话滚动容器后提供整段对话顶部/底部导航，**不接管未验证的单条回复工具栏**。未识别结构安全隐藏。
- **五项行为**：`regionTop`、`regionBottom` 为同一长内容两方向；`conversationTop`、`conversationBottom` 为整段对话；`floatingTop` 与 `conversationTop` 复用一枚顶部浮动按钮，不能创建第二枚。默认无需另加配置开关。
- **新旧脚本共存防护**：旧冻结包具有 `[data-opendesk-ui-owner][data-od-id="opendesk.chatgpt-jump-top.lifecycle"]` 生命周期宿主，改名后的源码识别它及旧回复导航的活动 ShadowRoot，在存在旧活动导航时**主动退出**；同一新身份的多个代码实例采用活体 DOM owner 仲裁，并在点击时重检。保留旧 `data-opendesk-chatgpt-jump-top` 回复标记供既有 Mind Map 寻址，新 `data-opendesk-ai-scroll-navigation="reply"` 明确标识现代实例。仅承担页面级兼容，不改变旧安装注册/撤权/用户授权。
- **权限**：Page `pageRules` 仅为 `chatgpt.com`、`chat.deepseek.com`、`gemini.google.com` 三个明确 Origin 的顶层 `USER_SCRIPT`。从旧版新增 Origin 属于扩权，必须走现有 Page Authority 与用户审阅；代码不会替安装器授予权限。
- **当时交付状态（2026-10-25，历史记录）**：当时新 ID 仅为已提交源码，旧 0.2.0/r2 包仍在目录，尚未生成新身份安装包。该旧包已于 2026-11-03 清理；当前 0.4.8/r9 已由原 Program Builder 和 Page Installer 重新构建，并通过 AI Scroll Navigation 专项 CI 的源码回归、版本/网站范围和字节一致性检查。历史记录中的“仍待构建”仅描述 2026-10-25，不代表当前状态。新身份真实安装和三站完整操作仍须单独验收，官方发行继续 blocked。
- **扩展中心搜索**：新包安装时的正式标题应明确使用「AI 对话滚动导航」。现有已安装 Page 的搜索读取 title、programId 和由 pageRules 映射的网站字符串；**npm description 不会自动成为已安装 Page 的搜索内容**。故在 Extension Center owner 修改投影前，「回顶」「长回复」等别名搜索仍有缺口。本轮不冒险重写另一 owner 的通用扩展列表。

## 历史：ChatGPT Jump Top 的原始单站证据

# ChatGPT 长内容回顶 · OpenDesk Page 增强

**历史集成说明（2026-10-20）：** 当时 ChatGPT 回顶箭头曾由 Prompt Shortcuts 的固定适配器提供；后续已拆分为独立 Page Program。当前 Prompt Shortcuts 只负责提示词快捷按钮，不提供对话回顶/置底；本项目独立运行，不依赖 Prompt Shortcuts，两个项目的安装身份、网站权限和生命周期完全分离。下文七次点击属于旧单站 USER_SCRIPT 的历史证据，不能代表当前版本的三站完整验收。此前集成记录仅供追溯：[历史集成证据](../prompt-shortcuts/evidence/chatgpt-jump-integration-20261020.json)。

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
node --check projects/ai-scroll-navigation/src/conversation.js
node --test tests/environment/ai-scroll-navigation.test.mjs
node scripts/validate-program-project.mjs projects/ai-scroll-navigation
```

需要新的脚本候选时使用原编译器 `npm run build:program -- projects/ai-scroll-navigation`，不必为文档收尾重建。已验证候选的 sourceHash/buildHash 为 `b0495ecffa05106cc93b942ad4d4b649890fd03e025b5af00be629ff31c6a303`，编译状态为 `BUILT_UNVERIFIED`、`installable:false`；`buildMode:production` 仅指业务脚本静态编译，不代表 production 扩展验收。

本地项目入口仍为 `opendesk browser dev "$PWD/projects/ai-scroll-navigation"`，随后通过界面明确 Run。本次真实操作使用「开发 → 直接编辑 → JavaScript → Page·当前网页 DOM → 运行」执行最终候选，并获得 Page `active` 返回。界面未提供该次 Page 的精确 `previewId/sourceHash/documentId`，不能用旧 Controller 的 runId/SHA 补作收据。

**历史安装包清理（2026-11-03）：** 旧 `opendesk.chatgpt-jump-top`（0.2.0 / revision 2，ChatGPT-only）安装包已从本项目删除；它不再是当前可导入制品。当前唯一新身份包为 [`ai-scroll-navigation.opendesk-page.json`](ai-scroll-navigation.opendesk-page.json)，ID `opendesk.ai-scroll-navigation`、版本 **0.4.8 / revision 9**。仓库删除不会自动卸载或撤销用户本机已安装的旧 ID；旧安装仍须通过原 Page Authority 单独停用、撤权或卸载。运行时代码保留旧 DOM 标记兼容，避免新旧页面实例冲突。

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
