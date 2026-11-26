# AI 对话滚动导航：Ego Lite 真站验收

本轮验收在实际 chatgpt.com 临时聊天中执行。历史 r47 记录包含夹具和源码复评，不能替代这里的安装、真站操作或同版专家评分。验收使用现有 `dist/development` 与已有 watcher；项目目录的 r47 包和已批准的 r14 预装不参与本地候选更新。

## 1.0.4/r50（中间候选）

- [候选](../../../artifacts/ai-scroll-navigation-reply-pin-r50-20261125/ai-scroll-navigation.opendesk-page.json) 文件 SHA-256 为 `c10bf0215d6ec46e5ceb4244502a45d001be89d62ede89a2f97b740ef9ab5143`。在原生侧栏审阅更新。[安装读回](../../../artifacts/ai-scroll-navigation-reply-pin-r50-20261125/ego-live-install-readback.json) 验证 registered、enabled、授权 active 和 generation 12。现有开发宿主为 Browser 2.0.0，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，已应用 revision `9da710ceed983d2000c6f562ba4eafcdd3829dac1d084a96636e24d7d5fdf87c`。
- [主目标文档回执](../../../artifacts/ai-scroll-navigation-reply-pin-r50-20261125/ego-live-exact-receipts.json) 证明 r50 在 p2 主 frame 自动执行成功，源码和 manifest 哈希与安装一致。诊断页 p3 首次打开未命中自动执行账本，原因未确认；回到真实首页并在前台刷新后，[另一文档回执](../../../artifacts/ai-scroll-navigation-reply-pin-r50-20261125/ego-live-second-document-receipt.json) 记录 r50 再次自动执行成功。
- [真站 UI 测量](../../../artifacts/ai-scroll-navigation-reply-pin-r50-20261125/ego-live-ui-measurements.json)：普通长回复和 ChatGPT 原生 `writing_block`（有原生 `header`）的两枚固定按钮均在真实滚轮后命中，首尾落点避开页头和输入区。430px 下实点普通回复两端；原生写作区占用侧槽时固定组让开。ChatGPT 搜索弹窗出现时固定组消失，关闭后恢复。页面原生输入框起按 Tab 可达固定按钮，焦点可见，Enter 可跳转。侧栏设置保存、关闭重开读回、关闭时保留行内组、再开启并恢复均实测。共享配置有继承值，默认关由缺字段的定向测试核对，未重置用户环境。
- [同文档切换](../../../artifacts/ai-scroll-navigation-reply-pin-r50-20261125/ego-live-switch.json)：在 p3 临时长回复中段，行内两枚在视口外而固定两枚命中；实际点击 ChatGPT 首页，URL 改变后旧回复一度仍连着，两个旧控件组已清理且未复活。生命周期仍在。另留有 [p2 前台命中基线](../../../artifacts/ai-scroll-navigation-reply-pin-r50-20261125/ego-live-foreground.json)。
- 在最后两项真站记录补齐前，独立评审分别给 90/100 与 94/100。评审复现两条 r50 离线反例：首条回复节点先于正式会话 URL 出现时会失去导航，以及换会话后重包裹仍连接的旧回复时可能重新认领。两条需修复并重新验证，r50 不算通过交付门槛。

## 1.0.5/r51（本地候选）

- [冻结候选](../../../artifacts/ai-scroll-navigation-reply-pin-r51-20261125/ai-scroll-navigation.opendesk-page.json) 文件 SHA-256 为 `621f9014c68a61c29efb3c27e5bb4f20182295d5c8899371aa43e754332e82ab`。通过 Ego 原生侧栏「扩展 → 导入扩展」审阅更新，三站权限与顶层文档范围不变。[安装读回](../../../artifacts/ai-scroll-navigation-reply-pin-r51-20261125/ego-live-install-readback.json) 为 registered、enabled、grant active、generation 13。宿主为连接既有 watcher 的 `dist/development`，Browser 2.0.0、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，已应用 revision `9da710ceed983d2000c6f562ba4eafcdd3829dac1d084a96636e24d7d5fdf87c`。
- p3 的 [主 frame 执行回执](../../../artifacts/ai-scroll-navigation-reply-pin-r51-20261125/ego-live-exact-receipts.json) 为 `page_auto/completed/effectConfirmed:true`，源码与 manifest 摘要和安装一致。真实首页到首条临时聊天为同一文档的 `replace`。[普通长回复](../../../artifacts/ai-scroll-navigation-reply-pin-r51-20261125/ego-live-ordinary.json) 实滚到行内不可点、固定两枚命中，实点后顶 y=124、底 y=479、输入区顶 y=553。
- 同一文档的 [ChatGPT 原生写作块](../../../artifacts/ai-scroll-navigation-reply-pin-r51-20261125/ego-live-writing.json) 有原生 `header`，完稿含两端标记，1342px 测试视口下高度 2850px。实际滚轮后两枚固定按钮均命中，行内在视口外；实点后写作块顶 y=124、页头 y=140，末尾 y=618、输入区顶 y=630。
- [430px 真站窄屏](../../../artifacts/ai-scroll-navigation-reply-pin-r51-20261125/ego-live-narrow.json) 的普通回复实滚实点，两端 y=124、y=440，输入区顶 y=631；可编辑写作正文占据安全位置时固定组隐藏，保留原编辑区。944px 的原生写作中段也观察到无安全位置；普通回复在 944px 实际窗口仍可显示固定组。[原生搜索弹窗](../../../artifacts/ai-scroll-navigation-reply-pin-r51-20261125/ego-live-dialog.json) 开启时隐藏固定组，退出恢复双命中。[键盘](../../../artifacts/ai-scroll-navigation-reply-pin-r51-20261125/ego-live-keyboard.json) 从点击页面原生输入框开始，Tab 到达有可见焦点的回顶按钮，Enter 回到写作块 y=124，继续 Tab 可用。
- [侧栏保存读回](../../../artifacts/ai-scroll-navigation-reply-pin-r51-20261125/ego-live-settings.json)：原生开关关闭并保存后固定组消失，行内组及生命周期保留；退出设置再打开读到关闭，重开并保存后两枚固定按钮恢复可点。缺字段默认关由同版定向测试核对；共享环境已有显式设置，未清空。
- [另一文档自动挂载](../../../artifacts/ai-scroll-navigation-reply-pin-r51-20261125/ego-live-switch-mount.json) 核对同摘要、真实主 frame 的 `page_auto`。在该页面点击 ChatGPT 原生「新聊天」，[切换记录](../../../artifacts/ai-scroll-navigation-reply-pin-r51-20261125/ego-live-switch.json) 显示同文档进入首页时旧回复暂仍相连，旧行内与固定组已断开，随后其他旧对话控件也清理，生命周期仍在。
- r51 修复两个旧回复归属反例；`conversation` 和 `navigation-settings` 定向检查 103/103。[前台测量](../../../artifacts/ai-scroll-navigation-reply-pin-r51-20261125/ego-live-foreground.json) 和 [真站截图](../../../artifacts/ai-scroll-navigation-reply-pin-r51-20261125/ego-live-foreground.png) 为 p3，实际视口 944×665，实滚之后位于普通长回复中段，行内不可点、固定两枚中心可命中。
- r51 独立复评为 91/100 和 92/100，均有阻断；以上真站记录不能抵消旧回复节点归属反例。

## 1.0.6/r52（已实装的历史候选）

- [安装读回](../../../artifacts/ai-scroll-navigation-reply-pin-r52-20261125/ego-live-install-readback.json) 证明原生侧栏审阅更新后已注册；当次没有取得对应主文档执行回执。独立复评仍阻断：脱离后重新挂入的旧正文可获得控件，两个可见 `main` 连续换会话时可漏登记。评审未给出数值评分。

## 1.0.7/r53（历史本地候选）

- [冻结候选](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/ai-scroll-navigation.opendesk-page.json) 的文件 SHA-256 是 `73684110bf1974cdbd35b357605a23d2b6d7830149665beba22a4fb0fd7efbd1`，包内源码逐字节等于 Program Builder 的 `program.js`。项目目录 r47 和已批准预装 r14 未晋升。
- [实装读回](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/ego-live-install-readback.json)：在 Ego Lite 原生扩展侧栏从 1.0.6 审阅更新到 1.0.7，网站权限不变；r53 已注册，授权有效，主 frame、`USER_SCRIPT`、`document_idle`。[宿主读回](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/ego-live-host.json) 为 OpenDesk Browser 2.0.0、原扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，复用 `dist/development`，开发服务已连接，构建指纹 `9da710ceed98`。
- 真实 `chatgpt.com` 临时聊天的[展示文档](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/ego-live-exact-receipts.json)和[切换测试文档](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/ego-live-switch-mount.json)分别有同源码、同 manifest 的主 frame 自动执行成功回执。初次读取得早时暂无回执；页面随后出现生命周期标记，账本记载执行和效果已确认。
- [普通长回复](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/ego-live-ordinary.json)实滚到行内按钮不可点的位置，两枚固定按钮命中；实点后回复首 y=124、末 y=541，输入区顶 y=553。[原生写作块](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/ego-live-writing.json)为含 `header` 的 `div[data-client-defined-widget="writing_block"]`，完稿含两端标记；1342px 视口实滚、双命中、实点，块顶 y=124、原生页头 y=140、块底 y=618、输入区顶 y=630。
- [430px](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/ego-live-narrow.json)普通回复实滚实点，首尾 y=124 和 y=440；原生编辑区占用可避让空间时隐藏固定组。[真实搜索弹窗](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/ego-live-dialog.json)打开后固定组消失，Esc 后双命中恢复。[键盘](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/ego-live-keyboard.json)从点击原生输入框开始，22 次 Tab 到可见焦点的固定回顶按钮；Enter 移动滚动位置和焦点，下一次 Tab 到原生按钮。
- [原生侧栏读回](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/ego-live-settings.json)：关后保存读回，固定组移除、行内组仍在；重开设置读到关闭，重新打开并保存后固定组恢复双命中。缺字段默认关由[定向检查](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/targeted-tests.txt)证明；共享配置已有显式值，未重置。定向检查 110/110，覆盖旧正文和写作块重挂、两个 `main`、观察器处理前点击及复用外壳。
- [真站切换](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/ego-live-switch.json)用 ChatGPT 原生「新聊天」进入同文档首页，旧回复暂时仍连接时其固定与行内组已脱离，随后旧对话 Dock 也清理，受管理生命周期仍在。[前台命中](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/ego-live-foreground.json)和[截图](../../../artifacts/ai-scroll-navigation-reply-pin-r53-20261125/ego-live-foreground.png)证明真实 944×665 窗口中两枚固定按钮可点。

## 1.0.13/r59（历史实装）

- [安装、宿主和真站记录](../../../artifacts/ai-scroll-navigation-reply-pin-r59-20261125/ego-continuation-evidence-index.md)分别关联到冻结包、原生审阅读回和主文档自动执行。普通长回复与原生写作块均实滚实点；430px、搜索弹窗、键盘和新聊天清理有真站记录。侧栏保存重开读回、切换后新回复固定双命中以及最终前台保留没有完成同版证明。
- 两位独立专家分别给 90/100 和 88/100，发现两个阻断：已移除的首页用户回合可能使旧回复误获导航；同一用户回合随容器替换移动时，首个真回复可能漏挂。两条通过定向回归复现，未在上述真站会话复现。

## 1.0.14/r60（冻结，未实装，评审阻断）

- [冻结 Page 包](../../../artifacts/ai-scroll-navigation-reply-pin-r60-20261126/ai-scroll-navigation.opendesk-page.json) SHA-256 为 `ae463946b7beb82f6972c750213ae411fcfbbbd37491fae24c0fc6ca094251e2`。包内源码与 [Program Builder 输出](../../../artifacts/ai-scroll-navigation-reply-pin-r60-20261126/build/program.js) 逐字节相同，源码 SHA-256 为 `8e46b50317a629e68b1005f48f9ff43315a2e3e3654f6a7dc6b64b3204b216b8`。只构建到独立产物目录。
- 首页交接改为跟踪实际用户回合；容器替换可保留仍连接的同一回合，已脱离回合不会授权旧回复，独立竞争回合仍拒绝交接。项目内[定向检查](../../../artifacts/ai-scroll-navigation-reply-pin-r60-20261126/targeted-tests.txt) 443/443，包括两条 r59 反例在观察器已交付、未交付两种时序下的回归。
- 真站同版门槛：原生侧栏核对宿主并审阅安装；对应主文档回执；缺字段默认关闭、保存和重开读回；普通长回复与原生写作块实滚后两键实点且首尾避开页头与输入区；窄屏、原生遮挡与键盘；关闭与切换清理并验证新回复自动挂载；前台保留实点窗口。评分须使用同一冻结身份，达到 95/100 且无阻断。
- 独立源码初评为 93/100 和 92/100。r59 两条反例已关闭；r60 仍可在定向复现中漏认仅替换正文的同一用户回合，或误认从另一主容器迁入的旧回复。两类均可在观察器已交付、待交付两种时序复现；不属于真实站点已观察到的故障。未安装 r60。

## 1.0.15/r61（冻结候选）

- [冻结 Page 包](../../../artifacts/ai-scroll-navigation-reply-pin-r61-20261126/ai-scroll-navigation.opendesk-page.json) SHA-256 `b0bc5b046b51e811405b2a486523ef5ba5cb3b1eb0c6ce225d2cea60c0cf391b`，包内源码逐字节等于 [Program Builder 输出](../../../artifacts/ai-scroll-navigation-reply-pin-r61-20261126/build/program.js)，源码 SHA-256 `a5479522cde7e1f34ffd4ab0766f1b5c3a0d4bfe8601ce5427329b69af293449`。只构建到独立产物目录。
- 交接按最早记录的容器和前一次已确认的草稿归属约束；同一轮次容器里的同一原生消息替换正文时保留交接，不同消息拒绝交接。[项目定向回归](../../../artifacts/ai-scroll-navigation-reply-pin-r61-20261126/targeted-tests.txt) 448/448。
- 独立源码初评 94/100 和 92/100，均有阻断。保留同一正文 DOM 节点并换成不同消息 ID 会带入旧回复；已确认的草稿先迁移而首答随后插入时，同批配送会漏挂。未安装 r61。

## 1.0.16/r62（冻结候选）

- [冻结 Page 包](../../../artifacts/ai-scroll-navigation-reply-pin-r62-20261126/ai-scroll-navigation.opendesk-page.json) SHA-256 为 `315516813df711020c0ccd89d2c4cea4fa3739469eb0341369596eb6d659f701`；内嵌源码与独立目录 [Program Builder 输出](../../../artifacts/ai-scroll-navigation-reply-pin-r62-20261126/build/program.js) 逐字节相同，SHA-256 为 `32d08592d26e0047d0462ad06518aa5055638909ddebd211a8054f5f4f05f7af`。核验包合同，站点范围和执行世界不变，未改发展服务输出或预装。
- 按浏览器提交变更的先后区分迁移后的真实首答与迁移前的旧回复，并拒绝同节点更换消息 ID 的交接。[定向回归](../../../artifacts/ai-scroll-navigation-reply-pin-r62-20261126/targeted-tests.txt) 457/457，新增用例覆盖分开配送、同批配送及切换时读取待配送记录。
- r62 未实装。独立源码复评为 91/100（Averroes）及 90/100（Linnaeus）：迁入目标容器创建和旧回复同批时提前取得交接、角色标记丢失后同节点换消息 ID 误挂，以及暂时脱离后合法首答漏挂。最后有安装和真站回执的仍是 r59。

## 1.0.17/r63（冻结候选）

- [Page 包](../../../artifacts/ai-scroll-navigation-reply-pin-r63-20261126/ai-scroll-navigation.opendesk-page.json) SHA-256 `40c13ee4ee6e332f1c517a051821af8721f6aad716ad92aed52544a2e348e82d`; 包内运行源码与独立构建逐字节一致，SHA-256 `1611cb39d91f6ec4c8065716931bd29c0d2e7926187770fa0a9a9901ae9d992b`。已运行安装包校验，与 r62 的程序 ID、站点权限范围及执行世界相同。[项目定向检查](../../../artifacts/ai-scroll-navigation-reply-pin-r63-20261126/targeted-tests.txt) 464/464。
- r62 的原始反例已通过。独立源码复评为 90/100（Averroes）与 92/100（Linnaeus），仍阻断：同一目的主容器内重包使真首答漏挂；批内先补后改或改后还原原生 ID 可误挂旧回复。未实装 r63。
- 真站准备：现有临时聊天 p3 的 [原生 DOM](../../../artifacts/ai-scroll-navigation-reply-pin-r63-20261126/ego-writing-preinstall.json) 已出现并完成一个 2018px 的 `div[data-client-defined-widget="writing_block"]`，含原生 header 和两个测试标记；这是安装前素材。该窗口的原生侧栏当时被并行的离线验收占用，未退出该会话或修改其配置；已释放本任务的原生 UI 锁。r63 安装、同版关键 UI、终评分和最终前台保留尚未取证。

## 1.0.18/r64（冻结候选）

- [Page 包](../../../artifacts/ai-scroll-navigation-reply-pin-r64-20261126/ai-scroll-navigation.opendesk-page.json) SHA-256 `876daf4ff5c52cf58d3c0dcec93fb65b3179ce6ddbe88474d147dcefcbd0c221`，包内源码与独立构建逐字节一致，源码 SHA-256 `4dede04027bf7b8355912e678b53cf80b3546f20156eaf0b13f1d679392351ee`。通过安装包校验；程序 ID、入口格式、三个站点、主框架、USER_SCRIPT 执行世界不变。[项目定向检查](../../../artifacts/ai-scroll-navigation-reply-pin-r64-20261126/targeted-tests.txt) 476/476。
- 用变更记录回溯插入时的主容器归属，修正首答在同主容器内重包及跨多个容器迁移的交接；检查批内 ID 旧值，阻止换 ID 后误传旧回复。四组新增场景各证明分开配送、同批和路由取待配送记录。
- 独立源码复评 91/100（Averroes）和 93/100（Linnaeus），未安装。阻断：原容器内先于草稿或草稿离开后的旧回复可能随路由误挂；批内首次观察的用户换 ID 仍可能误挂；相同原生 ID、同一外壳中的新正文节点可能使真首答漏挂。

## 1.0.19/r65（冻结候选）

- [Page 包](../../../artifacts/ai-scroll-navigation-reply-pin-r65-20261126/ai-scroll-navigation.opendesk-page.json) 文件 SHA-256：68c71d1301c1a8b57c46e9df3f40430f4190a2639924d57c07ba0e2038f8d7b8；包内源码 SHA-256：835a51525f1236e1c26e9b84a06a24a5925d5feeb39da6728f51bdbd13fa1a36；[定向测试](../../../artifacts/ai-scroll-navigation-reply-pin-r65-20261126/targeted-tests.txt) 488/488。
- 独立源码复评 91/100（Averroes）和 86/100（Linnaeus），均有阻断。旧回复可借批末补上的用户标记或恢复后的搜索键误挂；真正的首答壳和正文分批补标记时也可能漏挂。未安装 r65。

## 1.0.20/r66（冻结候选）

- [Page 包](../../../artifacts/ai-scroll-navigation-reply-pin-r66-20261126/ai-scroll-navigation.opendesk-page.json) 文件 SHA-256：fc371738560eb0b227d80bda5e5904c65db0026461fdac7b73bb8eded473f954；包内源码 SHA-256：b905735a48fa1c89a5d47be5650d472ce7acfb53a135ee71d9868da6373b9e4d。安装包校验通过，内嵌源码与独立构建逐字节一致；程序 ID、入口格式、三个站点、顶层 frame、USER_SCRIPT 执行世界不变。
- 回溯插入时的容器及用户标记，保留分批补标记的首答插入证据，并在没有原生 ID 时比较搜索键历史。[定向项目测试](../../../artifacts/ai-scroll-navigation-reply-pin-r66-20261126/targeted-tests.txt) 503/503，其中 conversation 190/190。新增 15 个用例，包括分批、同批及路由读取待处理记录三种时序。
- [Ego 安装前读回](../../../artifacts/ai-scroll-navigation-reply-pin-r66-20261126/ego-before-install-readback.json)：原窗口侧栏仍在另一任务的「离线验收」，没有日用导入面；真实注册的 Page 为 1.0.15/r61，校验记录与本地 r61 冻结包的源码和包哈希匹配。同窗为 Browser 2.0.0，扩展 ID 维持原配对。选中的 p3 仍有 2018px 的真站原生写作块（含 header）；未查到与该主文档对应的 r61 自动执行回执，因此不据安装注册推断该文档运行版本。r66 安装、宿主开发指纹、同版关键 UI、终评及最后双按钮展示均未确认。
- 独立复评均为 91/100，阻断为旧节点在跨会话复用并补助手标记后可获得新会话导航。均为冻结源码及离线行为证据。

## 1.0.21/r67（冻结候选，评审阻断）

- [Page 包](../../../artifacts/ai-scroll-navigation-reply-pin-r67-20261126/ai-scroll-navigation.opendesk-page.json) 文件 SHA-256 为 `1186e6b0dc878cf2a4a1e7f7999b816118ee699772c8fa356bd0f3c353a4e78a`，内嵌源码与构建逐字节一致。[定向回归](../../../artifacts/ai-scroll-navigation-reply-pin-r67-20261126/targeted-tests.txt) 509/509。
- 分开标记每次首页访问，按节点首次出现时的路由及草稿归属约束切换。两位专家分别给 92/100 和 93/100；旧回复误挂反例已关闭，仍可复现当前草稿首答正文重包、或首答壳在换 URL 的瞬间短暂脱离后永久漏挂。未在真站复现上述反例，r67 未安装。

## 1.0.22/r68（冻结候选）

- [Page 包](../../../artifacts/ai-scroll-navigation-reply-pin-r68-20261126/ai-scroll-navigation.opendesk-page.json) 文件 SHA-256 为 `bc93d57f196af66b907ab3daad6d093683d6e90e4b22028a146cd8cb6c7863da`，源码 SHA-256 为 `9d7433c24f99f87fad0a036245b2d10e8bbbe455356c966283a3748b76bafef1`，包合同哈希为 `bcd0321e345a5da88c3dd08696f1f471446972639295f3902745831c7a1200ee`。校验通过，内嵌源码与独立构建逐字节一致，程序 ID、入口、站点、主 frame 和执行世界不变。仅写入独立产物目录，未覆盖 watcher 或升级预装。
- 修复 r67 两条复现：沿变更队列还原正文重包前的归属；只有在本次草稿中形成并回到相同主容器的脱离首答可补做移交。新增 12 项正反对照覆盖分批、同批和切换时取待处理记录。[项目回归](../../../artifacts/ai-scroll-navigation-reply-pin-r68-20261126/targeted-tests.txt) 521/521，源码总量 131057 字节，保持 131072 字节上限。独立复评已提交。
- 已重新读到原窗口内两条真站正文：p2 为普通长回复（2048px），p3 为原生 `writing_block`（2018px，含 header），二者均有已运行的生命周期。原侧栏仍显示「我的 / 开发 / 任务目录」及「退出离线验收」，不提供日用导入。r68 实装、宿主指纹、对应主文档回执、同版 UI、终评和前台展示未验收。
- 独立离线复评 93/100 和 97/100。两份均确认 r67 的复现通过；93 分报告确认当长正文在当前首答壳脱离期间才插入时，接回原主容器仍会漏挂导航。由于存在该阻断，r68 未达到完成门槛。

## 1.0.23/r69（冻结候选）

- [Page 包](../../../artifacts/ai-scroll-navigation-reply-pin-r69-20261126/ai-scroll-navigation.opendesk-page.json) 文件 SHA-256 `a4dcc2ca6608d898a0fd8da9bcd4ce2f5748826e37bc1a807d6a41cf359fa64f`，内嵌源码 SHA-256 `8f32d5aca493d9442ee3d0baf38f79654d0783a45145ecb74d6953b87508d94b`，包合同哈希 `63ddecea4fd3e108f5fe42975e98b4735a20f30663078c43fa7e1af14d60f18c`。验证通过，内嵌源码与独立构建逐字节一致，执行范围和世界不变；源码总量 131027 字节。
- 脱离子树内首次出现的节点只从同一次首页访问中已确认的根继承草稿归属。[项目回归](../../../artifacts/ai-scroll-navigation-reply-pin-r69-20261126/targeted-tests.txt) 527/527，新增 6 项实际行为测试覆盖分批、同批和切换读取待处理记录，验证合法首答恢复命中、草稿出现前的旧根仍不能获得控件。
- [Ego 实装前身份读回](../../../artifacts/ai-scroll-navigation-reply-pin-r69-20261126/ego-install-baseline.json)：Browser 2.0.0，扩展 ID 与历史证据一致，实际注册版本仍为 1.0.15/r61。当前原生侧栏仍为另一任务的「离线验收」；「退出离线验收」按钮可用，产品源码表明退出会关闭该任务的隔离验收会话，对应任务仍保留现场。r69 尚未导入，未用旧版效果充当同版验收。

- 独立源码与离线复评 97/100（Averroes）、93/100（Linnaeus）。97 分报告未发现离线阻断；93 分报告在已确认的首答壳脱离期间将它放入临时包裹，再插入长正文，复现同批配送和路由读取待处理记录时导航永久漏挂。这是冻结脚本反例，未在真站观察到。

## 1.0.24/r70（冻结候选）

- [Page 包](../../../artifacts/ai-scroll-navigation-reply-pin-r70-20261126-frozen/ai-scroll-navigation.opendesk-page.json)，文件 SHA-256 `3a5f09a9c3b12af29546932d7e54e94fe6b20e6ce8293fd569fc39d662d33e4e`，内嵌源码 SHA-256 `53a7e01c10fbde3d54955212889f595a90817e38084c20877a343d92f139c8b8`，包哈希 `bfec0ddfdcca42ee626c3186d93a4d213a6beb4635a2c8473319ee53e8ea13bb`。原包校验器接受，内嵌源码与独立构建逐字节一致，站点、主 frame 和执行世界不变。只写独立产物目录。
- 修复 r69 的临时包裹漏挂：记录正文插入时的脱离祖先链，从最近有记录的祖先核对会话归属。新增 6 项用例，验证同批、分批及切换读取待处理记录都能恢复合法首答，早于当前草稿出现的外壳仍不获导航。[项目回归](../../../artifacts/ai-scroll-navigation-reply-pin-r70-20261126-frozen/targeted-tests.txt) 533/533，`git diff --check` 通过。
- [原 Ego 窗口重新读回](../../../artifacts/ai-scroll-navigation-reply-pin-r70-20261126-frozen/ego-preinstall-readback.json)：侧栏仍只有「我的 / 开发 / 任务目录」和「退出离线验收」，未显示日用导入或开发构建指纹。Browser 2.0.0、扩展 ID 不变，实际注册仍为 1.0.15/r61。两条真站临时聊天仍保留；原生写作块标签仍选中。未结束并行任务的离线会话。
- r70 未安装；当前宿主构建指纹、同版主文档自动挂载、关键 UI 和最终展示仍待真站核对。
- Averroes 独立源码与离线复评 97/100，无已复现离线阻断。核对候选哈希、构建字节和五个输入，独立重跑项目 533/533；冻结脚本正反探针 53/53，其中本轮脱离包装相关 20/20，包含移除通知已送达后不再收到脱离子树记录的对照。该分数不含同版真站安装和验收。
- Linnaeus 独立源码与离线复评 95/100，未发现可复现的离线阻断。冻结脚本对照确认：保留临时包装仍可跳转；旧壳套当前包装不会误挂；当前首答壳套旧包装仍可挂载。依赖 ChatGPT DOM 标记与观察器时序，建议同版实装后优先实测首页发首问、切换到新对话 URL 后首答可点，以及 New chat 后旧控件清理。该分数不含同版真站验收。
