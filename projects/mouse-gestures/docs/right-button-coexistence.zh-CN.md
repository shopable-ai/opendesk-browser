# 默认右键手势与原菜单共存：当前能力缺口

## 当前方案与离线原型（2026-11-13 续接）

当前目标仍是同候选、同获准网页、默认单次右击原菜单与右拖手势同时可用。日常 Chrome 已由用户确认失败；本轮交付可审阅方案和默认关闭的离线原型，不把 Node 结果提升为产品修复。旧对话的 blocked 目标没有被暂停、迁移或完成。本文其余“本轮不采用 Native”等描述保留为此前阶段证据，最新决定以本节为准。

### 持久目标、关键测试与本次逻辑完善

#### 当前目标第三轮阻塞审计

2026-11-13，当前目标原始轮及两次自动续跑连续遇到同一阻塞：原始输入归属、原文档条件交付和真实原菜单保真未成立。原始轮及第一次续跑分别有逻辑修复、反例和官方协议证据进展，未因此解决该阻塞；第三轮当前状态复核未发现可执行的新候选或新 CRX 材料。无运行中的待决探针/研究需等待，也不以重复无变化测试维持运行。原生 goal 工具现已实际返回 **blocked**，未标 complete；不与其他对话的旧目标状态混算。

本轮实读：正式配置 0.3.5 / revision 9、公开能力仍仅 page.module/storage.local；默认关闭实验的 capture/条件交付仍为 NOT_IMPLEMENTED；生产提前菜单 reset 仍在；唯一 JSON SHA256 仍为 `c5e086a7e272a817c9a3fc82c8402c2aced7af118bc3b1dff050f027e35378e7`。当前证据不足以证明双 P0、真实安装更新或两位专家 ≥95。完整 K0–K9 和交付目标不变。

解锁条件：出现可部署、可验证、保留原菜单位置语义并落实原文档失效拒绝/撤权的受支持机制，或取得适用 CRX/源码等可审计材料，形成尚未验证的具体候选。额外权限或仅启用 tap 不是该能力的证明。本次没有请求泛化授权、修改 Browser/Native、重试输入、升版或替换正式包。

用户本次明确要求“继续完善，设置目标和关键测试条件”。已在当前对话 `01a1d4fd-2939-7722-92e4-a5012a4d4dac` 创建原生 goal（创建时实读 active，不设 token 预算）；目标包含真实双 P0、受影响安全/网页兼容、同 ID 交付和两位独立专家分别 ≥95。生命周期以 get_goal 实读为准，不由文件文字推定；原对话 blocked goal 未改变。

执行顺序落在[持久实施目标](../../../.omx/plans/prd-mouse-gestures-coexistence.md)，K0–K9 的操作、可观察结果、身份要求与当前证据落在[关键测试条件](../../../.omx/plans/test-spec-mouse-gestures-coexistence.md)。先关闭可部署机制缺口、跑通单次右击与一次右拖，再扩四方向和直接受影响的回归；不恢复 production、跨 OS、全量 CI 或压力测试。

新复现并修正离线模型的时序缺陷：旧代际授权回包原先先进入时钟/看门狗校验，携带较早 at 会取消新手势，携带超前 at 会污染新手势的后续输入时钟。现在先判定回包是否仍属于待决原代际，已退役回包不修改新实例状态或时钟。新增回归先以 `cancel !== ignore` 失败，最小修复后模型+既有分段 **26/26 PASS**，语法检查通过；当前 `native-model-tests.log` 为这轮 26 项的结果。原生 capture/条件交付未因此实现，正式 JSON 不变，未新增 ≥95 评分或真实菜单成功证据。

独立代码审查未发现这次检查前移新增授权或 watchdog 绕过；有效回包仍经过时间、权限、身份和排除条件检查。审查同时核对 K0–K9 未弱化双 P0，但没有因此重评当前 46 分方案。

### 接收端条件交付：本轮新增反例

为检验“原网页确认后，通过可信 debugger 发送输入”是否足够，新增[最小可复现探针](../experiments/cdp-document-routing.mjs)。它仅在本任务 ego TaskSpace 145 的临时 HTTP 页面上操作，不加载产品、不调用 Native、不取消或合成 DOM 菜单事件。ego 的 navigator 报告 Chromium 156；这不是日常 Google Chrome 或已安装工具的身份凭证。

实际顺序：为文档 A 建立隔离 execution context 并取得 A 的就绪/URL 回执 → 同文档右击正对照 → 同一 target/frame 导航到新文档 B → 旧 context 调用被拒 → 原样 `Input.dispatchMouseEvent` 仍成功交给 B。loader 已改变；B 记录到 trusted `pointerdown/mousedown/contextmenu/pointerup/mouseup`，各一次。结果为 **FAIL_DOCUMENT_CONDITIONAL_DELIVERY**。

这直接否定“旧文档回执 + tab 范围 CDP Input”组合的接收端保护，不等于所有 Native 或浏览器内部机制均不可行。原始报告在 `artifacts/sidebar-tools/mouse-gestures/cdp-document-routing.json`；网页事件记录不证明 OS 菜单可见或可选择，也不是产品 P0 通过。任务结束已调用 `finish({keep:[]})`，临时 HTTP 服务关闭，没有操作日常 Chrome、Native 配对或 watcher。ego 提示有更新，本轮没有升级。

Apple 官方合同另确认：active tap 回调可返回另一个事件；[当前 proxy 插入事件](https://developer.apple.com/documentation/coregraphics/cgevent/tappostevent(_:).md)排在回调返回事件之前。因此“rightUp 回调插入保留的 down，再返回 up”是可研究的正确配对顺序；仅返回 down 会丢掉 up，反向插入则变成 up→down。但该顺序不证明保留原窗口或原文档，当前没有实际创建 tap/投递。Chromium [Cocoa 视图命中](https://github.com/chromium/chromium/blob/86d7f5a07c0c91583088c7b32332b4832bf8113e/content/app_shim_remote_cocoa/render_widget_host_view_cocoa.mm#L1088-L1139)及 [contextmenu 取当前 Document 命中](https://github.com/chromium/chromium/blob/86d7f5a07c0c91583088c7b32332b4832bf8113e/third_party/blink/renderer/core/input/event_handler.cc#L2182-L2228)说明，单有窗口信息不足以证明文档不变。上游快照尚未与日常运行版本对应。

另一独立候选是节点绑定的 **AXShowMenu**，不沿用已失败的 ACK+tabInput。固定源码确认 [Chrome 网页 AX 节点确实暴露 ShowMenu](https://github.com/chromium/chromium/blob/86d7f5a07c0c91583088c7b32332b4832bf8113e/ui/accessibility/platform/browser_accessibility_cocoa.mm#L3415-L3425)，并有 `instanceActive`、inactive frame、节点不存在时空目标等失效检查；因此不能断言不存在节点接收端路径。但容器可能改投 active descendant/焦点子项，Blink 最终调用 [ShowNonLocatedContextMenu(element, kKeyboard)](https://github.com/chromium/chromium/blob/86d7f5a07c0c91583088c7b32332b4832bf8113e/third_party/blink/renderer/modules/accessibility/ax_object.cc#L8763-L8801)，没有原右击坐标参数。

最终坐标经 GitHub connector 取得同 SHA 的实际源码（本机直连超时、代理拒绝，未继续重试该网络路径）：[函数 L2263 起](https://github.com/chromium/chromium/blob/86d7f5a07c0c91583088c7b32332b4832bf8113e/third_party/blink/renderer/core/input/event_handler.cc#L2263)，有 override/focus 元素时，[L2332–2335](https://github.com/chromium/chromium/blob/86d7f5a07c0c91583088c7b32332b4832bf8113e/third_party/blink/renderer/core/input/event_handler.cc#L2332)取元素可见裁剪矩形的中心；无 override 且选区有焦点时取选区端点/中心；否则取 viewport offset+1。后续构造 no-button、零 clickCount、无修饰键的菜单事件。原点不参与该计算。因此所读版本的直接 AXShowMenu **不能通用保留原右击位置，排除为 K2 普通右击的直接替代**；某个点击点偶然等于中心不能证明一般等价。这是源码结论，不是日常 Chrome 运行验证，亦不否定所有 Native 或节点接收端机制。

选区/链接/输入的完整等价性和导航生命周期尚未执行，但该路线已在位置条件处失败，无须为它请求权限或实际点击。Apple [action 返回 true](https://developer.apple.com/documentation/appkit/nsaccessibilityprotocol/accessibilityperformshowmenu())仅表示已触发，不可当菜单可见回执。本轮没有执行 AX action、创建 tap 或申请权限，也不重复已失败的 CDP 组合。仍需找到满足原位置、原文档条件交付的受支持机制，才可接入正式代码。

### 公开接口合同复核（当前目标第一次自动续跑）

本次开始实读仍在 `main`，工具仍为 0.3.5 / Page revision 9、能力仅 `page.module`/`storage.local`；`gesture.js` 提前菜单时的 reset 未变。上一目标轮次属于实质进展：修复旧回包并取得 CDP 反例、AX 坐标证据。本次不重复模型测试、菜单输入或已排除候选。

研究专家进一步核对完整官方 [CDP browser_protocol.json 的不可变 blob](https://api.github.com/repos/ChromeDevTools/devtools-protocol/git/blobs/ee01bfc86d325c9025cb463b0d4dddcae88a3684)（53 domain / 595 command，schema 1.3）及固定 Chromium [context_menus.json](https://github.com/chromium/chromium/blob/86d7f5a07c0c91583088c7b32332b4832bf8113e/chrome/common/extensions/api/context_menus.json#L212-L379)：Input 的 13 个命令均无 document/backendNode/execution-context 输入绑定；DOM 的节点定位不形成输入交付条件；Page/Browser/Target/Overlay 未发现原菜单扣留、恢复或定位显示命令。`setIgnoreInputEvents` 只有忽略开关，`setInterceptDrags` 属拖放，不是原菜单队列；Chrome contextMenus 仍仅扩展菜单项 CRUD/onClicked，URL pattern 不等于 document 实例。协议快照不是本机 Chrome 的运行证明，也不穷尽所有 Native 机制。

独立复核结论：目前没有已识别、可部署、已授权且能直接突破双 P0 的新候选。**技术阻塞与原始目标轮相同：原始输入归属、原文档条件交付及原菜单保真尚未成立。** 单独增加权限或启用 tap 不能解除该缺口；不为它请求泛化授权。解锁需要新的受支持接收端/浏览器机制，或取得实际适用 CRX/源码等新材料形成具体候选。当前没有该材料，故不编造 SDK、不接线或升版。当前目标尚不满足 complete；阻塞生命周期仅按原生 goal 工具的连续轮次规则处理，不与旧对话 blocked goal 混算。

### 方案独立评审与 95 分门槛（用户本次要求）

评分对象是当前**可落地解决方案**，不是文档质量或离线模型代码质量。两位 AI 子 agent 依据同一量表独立审阅，评分是专家判断，不是统计测量或真实产品验收。架构可行性与反向审查两位专家均给出 **46/100**，未达用户要求的 95 分；分项如下。未为抬分改变普通单次右击与默认右拖的双 P0，也未把研究方向改称已实现方案。

| 维度 | 满分 | 架构可行性评审 | 反向审查 |
| --- | ---: | ---: | ---: |
| 需求覆盖 | 20 | 18 | 18 |
| 核心机制可行性 | 30 | 7 | 6 |
| 权限、取消与目标安全 | 20 | 10 | 12 |
| 实施可执行性 | 15 | 5 | 4 |
| 验证设计与证据 | 15 | 6 | 6 |
| 合计 | 100 | **46** | **46** |

最高影响扣分：capture/原文档条件交付仍为 NOT_IMPLEMENTED；没有原菜单位置、内容、选择的保真实现；虚构身份字段和权限预检不能补足真实输入及安装身份。模型 PASS 不抵扣这些缺口。此前“推荐验证 Native”仅是优先研究假设，**当前不是经过可实施性确认的交付方案**。

反向专家同时指出：不能把“存在名为原子原文档句柄的 API”当作唯一实现要求。验收的是不向新目标交付、原菜单保真及撤权有效等行为；受支持的浏览器生命周期内交付、接收端条件校验或经验证的等效机制都可评估。当前仅证明已有异步快照加 PID 投递不足，并未穷尽证明所有 Native 路线不可行；不因概念名称人为堵死其他可验证路径。

下一轮证据按以下顺序推进，而不是继续增加离线用例或反复评分：

1. **原始输入归属证明**：用真实可部署的接收端与 API，证明暂留前的物理输入属于原 Chrome 内容区、获准文档和安装代际；输入到达时的异步页面快照不算证明。
2. **条件交付证明**：在交付检查后改变原文档/标签页/安装授权，实际接收端能拒绝投递到新目标；同文档原坐标命中目标失效时也不得改投。没有这项原语就将该 Native 路线判为当前不可实施，不用“后续接线”掩盖。
3. **最短真实闭环再扩展**：同一日常 Chrome 候选先证明单次右击原菜单可打开选择及一次默认右拖，再四方向各一次和受影响取消/撤权/断连清理。记录包、安装、Page revision 与运行身份。

**95 分通过条件**：上述核心机制及双 P0 的同候选证据闭合，无未解决的关键安全/功能缺陷，再独立复评达到 ≥95。方案有核心未实现项时不能宣布达标，也不能用文档修订后的高分替代真实缺口。上述评分对应此前可落地方案评审；最新模型修复与接收端探针见本节前文，不改评分对象，也没有触发产品构建或打包。

### 三条路线与唯一推荐

| 路线 | 机制与可参考源码 | 新增内容 / 主要失败条件 | 最小验证 / 决定 |
| --- | --- | --- | --- |
| **推荐验证：可信 macOS 宿主暂留右键** | 在网页收到 down 前暂留；普通短击在原坐标交付一次真实点击；有效拖动不交付菜单。参考 [StrokeMouse 固定实现](https://github.com/Licoy/StrokeMouse/blob/1b424f98a2f7f7c54c2e86a37b13ab0ea329cd55/StrokeMouse/Core/EventTap/MouseEventTap.swift#L291-L382) 的行为 | 需要原生输入与精确页面身份的绑定、原安装 Authority 与生命周期接线。仅 PID/焦点/矩形/租约会在切页或撤权时失效 | 先证明同页单击与一次右拖共存、切页不投错；再四方向。现阶段仅离线算法，不启用系统输入 |
| 纯 Chrome 扩展 | 定向审计 crxMouse 当前包是否有新的菜单协调机制；旧 smartUp 首次取消/双右击不满足目标 | 必须取得实际源码和 macOS 单击证据；合成 contextmenu 或重发已发生的网页 down 不能保真 | 当前没有取得可审计 CRX，不能据宣传声称解决；不继续泛查已排除样本 |
| 浏览器内部菜单延后 | [Gesturefy](https://github.com/Robbendebiene/Gesturefy/blob/7840a0db840011a9b8f183dfecd313334a9bf8cf/src/core/background.mjs#L163-L170) 使用 [Firefox 的 mouseup 设置](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/browserSettings/contextMenuShowEvent) | Chrome 未发现等价公开 setter；既有启动参数探针破坏 Control＋单击菜单，不能直接交付 | 保留为宿主机制对照；不切换用户浏览器、不改日常启动参数 |

推荐是**先验证原生暂留是否能满足约束**，不是宣称已具备可交付的 Native 能力。[StrokeMouse LICENSE](https://github.com/Licoy/StrokeMouse/blob/1b424f98a2f7f7c54c2e86a37b13ab0ea329cd55/LICENSE) 为 AGPL v3；本原型独立编写，只复用本项目识别器，没有复制或翻译该项目代码。Gesturefy 的 GPL 代码也未复制。

### 原型实现与真实调用边界

- 业务 owner 和包格式保持 `projects/mouse-gestures/`、Sidebar Tool v2 + 顶层 HTTP(S) USER_SCRIPT；生产入口仍为 `src/page/main.js → runtime.js → gesture.js`。公开能力仍仅 `page.module`、`storage.local`，没有授予动态工具 Native 权限。
- `experiments/native-right-button.mjs` 是**纯离线状态模型**，默认 `simulate:false`，只在定向测试显式模拟。它复用 `src/page/segments.js`，输出 proposal，不执行导航、绘图、菜单或系统输入。不在 `tool.config.json.files`、Page 入口依赖或 Browser 固定构建闭包中。
- `experiments/native-preflight.swift` 只调用不弹框的权限 preflight 并读取指定 Chrome Bundle 信息；无 tap、run loop、CGEvent 创建/投递、权限请求或启用参数。权限 true 不证明 event tap 在某个位置可用，更不证明新程序/工具已获授权。
- 将来若原生能力成立，受信 Chrome sender/document 与现有安装/撤权 Authority → 现有 Native transport/连接代际 → 受审原生适配，负责 admission、取消和结果；动态 USER_SCRIPT 不提供特权回调或自选目标。手势识别、映射、轨迹和动作仍归本项目；新适配尚未接线，不发明公开 SDK 方法。

模型包含按下暂留、短击/有效手势分流、动作前新鲜授权、不可重用的代际、取消后仅清理原右键抬起、watchdog 和 tap 丢失后 unknown 不重放。普通左键、键盘菜单和 Control＋单击在模型中放行。OFF/撤权/断连锁闭当前实例；假回放事件不能消耗原物理抬起。10 秒 watchdog 仅是离线实验边界，未修改现有产品时序。

模型用一组**虚构 fixture 身份字段**检验预期不变量：进程及启动代际、Native 窗口、浏览器/连接会话、Chrome window/tab/document、URL/origin、安装代际、包摘要、Page revision、原坐标命中目标修订。它不是签名 token，也不能由网页提供这些字段来取得原生权限；模型比较字段相等不证明系统能收集或原子执行这些条件。

### 绑定验证结论与可复现反例

现有 `src/native-agent/host-adapter.js` 的 `target.current` 是异步快照；`src/ui/current-page-target.js` 及 `src/platform/target/index.js` 能核对 Chrome tab/frame/document。现有 Native 端口有连接代际，Host Authority 有真实 sender 身份。它们可复用，但均没有把原始 CGEvent 原子绑定到该文档的投递句柄。

Apple 的 [tap 位置](https://developer.apple.com/documentation/coregraphics/cgeventtaplocation)、[target PID 字段](https://developer.apple.com/documentation/coregraphics/cgeventfield/eventtargetunixprocessid)、[window-under-pointer 字段](https://developer.apple.com/documentation/coregraphics/cgeventfield/mouseeventwindowundermousepointer)允许观察进程/窗口相关信息；文档没有保证它们在所有 tap 位置完整、持续有效或绑定 Chrome document。[CGEventPostToPid](https://developer.apple.com/documentation/coregraphics/cgevent/posttopid(_:))只有 PID，没有 window/tab/document 的预期身份参数。本机 Apple SDK `CGEvent.h` / `CGEventTypes.h` 也核实了该参数与字段范围，未创建实际 tap。

定向反例：`rightDown 被暂留 → target.current 成功核对文档 A → 同 PID/窗口/tab/URL 导航成文档 B → PostToPid`。最后一步仍可能交给 B。即使在补发前再查一次，查询返回到输入交付之间仍有空隙。离线测试明确保留这个反例；它不模拟成功的原子交付，更不把函数返回当菜单出现。

另外，同文档 DOM/选区变化也可能改变原坐标目标，故精确 document 仍不是全部条件。先放行网站 down 再取消 contextmenu，之后重发 down，会重复网站监听；本原型不采用这种补偿。现有 OpenDesk Go PID 点击后端是左键 AXPress，不具备右键暂留或网页绑定；本轮只读核实，没有修改独立 OpenDesk 仓库。

**当前结果：OFFLINE_MODEL_PASS / MAC_PREFLIGHT_PASS / NATIVE_CAPTURE_NOT_IMPLEMENTED / ATOMIC_DOCUMENT_DELIVERY_NOT_IMPLEMENTED / BOTH_P0_NOT_PASSED。** 推荐路线的算法部分可用作继续工程的材料，安全原生接入门槛尚未成立，不能进入候选打包、更新或输入截流。

### 复现与证据

从仓库根运行（Swift 输出目录须已存在）：

```sh
node --test projects/mouse-gestures/tests/native-right-button.test.mjs projects/mouse-gestures/tests/segments.test.mjs
xcrun swiftc projects/mouse-gestures/experiments/native-preflight.swift -o artifacts/sidebar-tools/mouse-gestures/native-preflight
artifacts/sidebar-tools/mouse-gestures/native-preflight
```

2026-11-13 前一轮定向模型及既有分段检查 25/25 PASS；最新旧授权回包修复后为前文 26/26。Swift 编译及实际只读预检通过。探针 Accessibility/listen/post 三项均为 true、permissionRequests=0；指定路径 `/Users/shopme/Applications/Google Chrome.app` 的磁盘版本 157.0.8103.78，Bundle ID `com.google.Chrome`。运行中版本、当前安装摘要/Page revision、原生菜单打开/选择及默认右拖均未在本轮新测。日志在忽略目录 `artifacts/sidebar-tools/mouse-gestures/native-model-tests.log`、`native-preflight.json`；生成的二进制同在忽略目录。

独立代码审查发现并已修正模型的四处遗漏：非物理回放 up 不得消耗原物理抬起清理；待决授权时新观察到的身份/权限失效及破损按键序列须退役；最终授权须重查排除目标和修饰键；目标未变的观察事件也必须执行 watchdog，不能绕过截止时间。对应回归已包含在上述 25 项中。

crxMouse 本轮研究返回的商店视图为 7.4.1 / 2026-09-02，与此前视图 7.8.0 / 2026-11-11 冲突，不能用页面缓存结果确定当前版本。官方 CRX 下载未取得字节；补用现有 `local-proxy` Skill 时，192.168.30.9:7897 连接被拒绝，随后直连 Google 官方更新端点在 8 秒连接限时后退出 28（http=000、bytes=0）。未取得 manifest/hash/source，未安装、执行或审计 crxMouse；没有持续重试或引入第三方下载站。

此前持续开发环境只读观察：`dist/development`，`npm run dev → scripts/dev.mjs` writer PID 45081、服务 43119、输出守卫 43120；有已建立客户端连接，但不据 socket 推断当前扩展 ID、已加载目录或已应用 revision；这是上次观察，未推定当前存活。本任务不写这些输出。该预检阶段 UI 锁 status 为 null，没有申请或使用桌面输入锁、TaskSpace/HTTP 服务；最新接收端探针的临时资源及收尾见前文。0.3.5 唯一 JSON SHA256 本次再次核实仍为 `c5e086a7e272a817c9a3fc82c8402c2aced7af118bc3b1dff050f027e35378e7`。

### 下一条可验证路径

1. 原生适配的下一项证明必须是**输入到精确原文档的 admission 与条件交付**：包括原生窗口到 Chrome window 的真实映射、原坐标内容区/命中目标、Document/安装代际，以及检查与投递之间切页/撤权如何被原子拒绝。现有 PID API 没有该合同，不能靠再次 `target.current` 或延长租约代替。不先启用“补发到当前目标”的拦截器。
2. 若现有宿主无法提供这项能力，替代方向必须在浏览器内部拥有原 RenderWidget/document 的事件生命周期中协调菜单，以此消除跨系统输入重投。Firefox 的实现和 Chromium 内部设置是机制依据，但**当前日常 Google Chrome 没有已证实可部署的入口**；修改浏览器二进制、切换 Firefox 或改启动器不属于本次默认交付。不将此写成已实现的 SDK。crxMouse 的实际源码若能提供新机制，再沿纯扩展路线只验证普通右击与一次右拖；未取得前不作可行性结论。
3. 上述任一路径有真实可部署证据后，才接原 Native/Authority 边界、审阅实际权限与行为、在同一候选执行单次右击和一次右拖，再扩四方向及受影响取消/网页交互。同源正式 JSON 只在可交付修复及对应门禁通过后晋升。本次不无故升版、提交或安装无效修复。

---

2026-11-13；对应 README 最新双 P0 目标。上轮对话 `01a1d42c-92a7-7ce3-8150-ec813986a35c` 状态：`GOAL_BLOCKED / BOTH_P0_NOT_PASSED`。本次续接对话 `01a1d472-0cf5-7de2-889f-b98652ad7ea2` 恢复后已核实日常 Chrome 的 v0.3.5 安装界面、ON 开关及用户实际失败。第三个恢复目标轮次再次核对当前源码及 SDK，仅有菜单状态/注册入口，没有保留原菜单的延后/继续能力；同一真实阻塞仍在，目标工具最新返回 `blocked`，完整双 P0 未缩减或完成。用户已委托专家判断技术路线，技术选择不再是待用户回答的问题，也无需再次重复同一手测。

## 最新纠偏：日常 Google Chrome 优先

用户先澄清：“Google Chrome 里面之前手势和轨迹可以使用，修改后未测试。ego 未测试成功过。”随后按本轮请求在日常 Chrome 实测，回复“现在不行了”，并进一步明确为“按下右键就弹菜单，无法画轨迹”。因此当前已具备 **Chrome 用户实测失败**，无需继续等待同一问题的回答。此前 ego 事件时序、无界面 CFT 探针和第三方源码仍是各自环境的证据，不替代此次用户实测。

本轮通过明确路径 `/Users/shopme/Applications/Google Chrome.app` 识别日常 Chrome，并使用连接的 Chrome 浏览器（Profile 显示“您的 Chrome”）打开专用顶层观察页。普通左键使页面计数从 0 增至 1，记录到可信的 `pointerdown → mousedown → pointerup → mouseup → click`，均未取消。**仅此普通网页点击已核实：工具包版本、获准范围、安装模块是否注入及当前运行源码均未知。** 本次 DOM 查询未覆盖真实 `data-od-id` 标记，不能把未发现 host 当作未安装或未注入的证据。

原生窗口状态及截图接口返回输入大小错误；之后普通 HTTPS 页导航和浏览器恢复均超时，结果未知，未重复输入。当前接口没有带按键参数的连续拖动方法；不能用左键拖动、DOM 合成或其他浏览器结果代替物理右拖。没有取得单次右键真实菜单、四方向动作或新版 Chrome 失败的证据。本任务 UI 锁和专用 HTTP 服务已释放，未重启用户 Chrome、修改安装、权限、启动参数、Native 配对或 watcher。

后续自动续跑中 Chrome 连接恢复，沿同一浏览器的已有测试标签核查。网页 DOM 读取在 `Emulation.setFocusEmulationEnabled` 超时；没有重复输入或重新启动浏览器。原生只读 AX 树在现有 Side Panel 显示“鼠标手势 · v0.3.5”，后续只读截图显示“开启鼠标手势”为 ON、兼容区显示“原生菜单优先”。这核实了已安装界面版本与当前可见开关，未读回 Page revision/包摘要，也不等于已独立观察到物理拖动。桌面输入锁由其他 owner 持有，本任务未抢占或执行原生输入。

根因对应 [`src/page/gesture.js`](../src/page/gesture.js) 的 `contextmenu` 处理：提前菜单到达且尚无可执行手势时 `reset()` 清除 session，后续移动无法产生轨迹或动作。针对新用户失败，仅运行既有单项诊断 `node --test --test-reporter=spec --test-name-pattern='legacy gesture-first preserves early menu and abandons that drag' projects/mouse-gestures/tests/gesture.test.mjs`：提前菜单后的完整轨迹动作次数为 0；没有提前菜单的同样轨迹动作次数为 1。1/1 诊断通过确认当前取消行为，**不是产品 PASS**。本轮不改运行代码、不改包；恢复旧吞菜单逻辑仍不满足普通单次右键要求。

当前为 `CHROME_USER_REPORTED_FAILURE / INSTALLED_UI_0.3.5 / SOURCE_CANCEL_CONFIRMED / BOTH_P0_NOT_PASSED`。普通菜单内容、位置、选择及同一候选四方向成功仍无证据。已确认的冲突需要保留原菜单的宿主协调能力；现有公开 API 缺口与下述 Native/内部启动覆盖限制仍适用，不把已知不满足目标的折中方案作为修复交付。

## 当前事实

项目仍是 `projects/mouse-gestures/` 的 Sidebar Tool v2 + Page USER_SCRIPT，网页业务由 `src/page/main.js` 加载，在获准顶层 HTTP(S) 文档执行。唯一正式包仍为 0.3.5 / Page revision 9；本次没有修改运行逻辑、安装包、Browser 权限或固定宿主源码。

本次通过 ego-browser TaskSpace 126，在 ego lite 0.6.2.9 / macOS 上打开 `http://127.0.0.1:63981/tests/fixtures/native-menu.html`，用受支持的 `mouse.down/move/up` 输入观察事件。页面不导入手势模块，不取消输入、不替换网站或浏览器菜单。初次文档存在安装模块的受管 UI host：`data-od-id="app.mouse-gestures"`；实际 Browser 扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`、manifest version 为 0.1.0。**这不是工具包版本证据：已安装工具的精确版本/源码尚未核实，不能声称 0.3.5 已安装。**

| 观察 | 实际记录 | 能证明什么 |
| --- | --- | --- |
| 初次右键按住，安装模块 host 存在 | `pointerdown 11719.5 → mousedown 11719.6 → contextmenu 11720.1` ms；均 trusted；菜单事件 `buttons=2`、未取消 | 此入口在抬起、拖动可判定前已经派发菜单事件 |
| 临时仅取消 `pointerdown` | `pointerdown 105.3` 已取消，`contextmenu 105.5` 未取消，`pointerup 138.6` | 取消 pointerdown 不能将菜单延后 |
| 临时仅取消 `mousedown` | `mousedown 109.1` 已取消，`contextmenu 109.3` 未取消，`mouseup 111.3` | 取消 mousedown 不能将菜单延后 |
| 同次连续右拖 120px | `contextmenu 90.3 → 首次移动 132.2 → mouseup 214.2` | 此输入路径菜单事件在连续拖动前到达；不代表手势动作通过 |

探针和连续右拖运行于后续重新加载的文档，当时未观察到安装模块 host，故只证明浏览器事件行为，**不算安装版回归**。首次分步观察的按住时间较长，不作为正常手速的成功用例。未据此扩大排查无关的宿主生命周期。

所有事件时间为对应文档的 `performance.now()`。trusted 说明浏览器派发，不等于物理鼠标证据。`Page.screenshot` 只含网页；原生桌面观察接口超时，因此菜单是否实际显示、位置内容、选择可用性仍未验证。不能根据未取消事件或网页截图宣称 P0-菜单通过。

原始本机证据（忽略目录，不作为正式发行物）：`artifacts/sidebar-tools/mouse-gestures/right-button-coexistence-01a1d42c/` 下的 `mg-installed-early-menu-01a1d42c.json`、`mg-menu-deferral-probes-01a1d42c.json`、`mg-continuous-drag-01a1d42c.json` 与 `mg-right-down-01a1d42c.png`。

### 目标恢复后的安装身份核查

只读 `node native-agent/cli.mjs doctor` 返回配置的扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，`connected=false`、本地 socket 不存在；没有重启或重新配对。Google Chrome Default 的磁盘扩展记录指向本仓库 `dist/development`，但磁盘路径不证明当前网页运行源码，也没有提供已安装工具版本。

定向浏览器连接恢复可用，已列出现有标签。读取 `chrome-extension://ccfcjegpkdlgbclopjmadlcjedelidmf/app.html?toolId=mouse-gestures` 时，浏览器安全策略拒绝该协议，仅允许 HTTP/HTTPS；未换原生 UI、其他工具或私有存储绕过。精确已安装工具版本仍为 `NOT_VERIFIED`。`cua.getApp("Google Chrome")` 实际返回的是 Google Chrome for Testing 149.0.7827.55，不能把它当作日常 Chrome 或此前 ego 测试的版本证据。

随后独立核查了 Chromium 启动设置，结果见下一节。未修改日常浏览器启动项、重启用户实例或宣称该路线可交付。

## 提前菜单条件下的公开能力缺口

手势意图在后续移动时才能判定；提前到达的菜单事件需同步决定是否取消。放行它不能保证菜单不夺取拖动输入；先取消它，则无公开接口在普通右击松开后继续原菜单。0.3.5 的“菜单先到就放弃手势”在此条件下不满足目标。该条件已有上述日常 Chrome 用户实测失败、当前源码及下述 ego/探针证据；尚缺日常 Chrome 的自动事件日志和同候选完整成功证据。

- [Pointer Events 3 §11](https://www.w3.org/TR/pointerevents3/#compatibility-mapping-with-mouse-events)：取消 pointerdown 不控制 contextmenu 的派发；菜单可以先于 mouseup。
- [Chromium 固定源码 `web_frame_widget_impl.cc` L1216–L1242](https://github.com/chromium/chromium/blob/4ee513bef654a789db20ffdecb9e0b95215a483c/third_party/blink/renderer/core/frame/web_frame_widget_impl.cc#L1216-L1242)：处理 mousedown 后另走菜单触发流程，不能通过吞 mousedown 延后菜单。
- [Chrome contextMenus API](https://developer.chrome.com/docs/extensions/reference/api/contextMenus#methods) 没有暂扣、继续或打开原菜单的方法。OpenDesk 的[公开菜单 API](../../../docs/api/browser-sdk.zh-CN.md)与 `src/framework/sdk/browser-contract.js` / `src/platform/chrome/context-menus.js` 也只有已有菜单项管理及启动交付，没有原生菜单延后能力。
- Chromium 内部有 [`showContextMenuOnMouseUp` 设置](https://github.com/chromium/chromium/blob/4ee513bef654a789db20ffdecb9e0b95215a483c/third_party/blink/renderer/core/frame/settings.json5#L835-L840)，但尚未发现 Chrome 扩展或 CDP 提供受支持的公开 setter；不能当作现有 SDK 能力调用。

结论限定于当前 Page / 普通 Chrome 扩展公开能力；不是所有浏览器或宿主均无法实现的断言。该缺口不能在独立工具目录内通过新的监听顺序、计时器或换执行世界解决，也不能仅在现有菜单 driver 增加方法名就得到底层能力。跨工具用途是原生菜单与右键拖动交互的协调，尚无可交付的最小公共实现。

## Chromium 启动设置：延后有效，但存在菜单回退

固定官方源码确认 `--blink-settings=showContextMenuOnMouseUp=true` 能传入 renderer，再经 Settings 名称分派设置该布尔值：[启动参数语义](https://github.com/chromium/chromium/blob/015c6b438fd73b6b1a1381a6e1c577b83419fb65/third_party/blink/common/switches.cc#L17-L21)、[字符串设置入口](https://github.com/chromium/chromium/blob/015c6b438fd73b6b1a1381a6e1c577b83419fb65/third_party/blink/renderer/core/exported/web_view_impl.cc#L292-L326)。[事件实现](https://github.com/chromium/chromium/blob/015c6b438fd73b6b1a1381a6e1c577b83419fb65/third_party/blink/renderer/core/frame/web_frame_widget_impl.cc#L1144-L1212)在该值为 true 时跳过 mousedown 菜单路径，在右键 mouseup 触发菜单；macOS 的 Control＋左键路径位于被跳过的 mousedown 分支，而 mouseup 分支仅接受右键。

为区分内部设置是否实际生效与源码推断，使用本机缓存的 Chrome for Testing 155.0.8059.39，分别以默认启动和上述参数启动独立无界面进程；每次使用新临时 Profile，只访问本机观察页，不加载产品扩展。ego 的公开接口不能设置现有浏览器启动参数，此探针没有新建 ego TaskSpace，也没有操作已结束的 Space 126。通过 CDP 派发输入观察可信 DOM 事件，结果如下：

| 操作 | 默认启动 | 设置为 true |
| --- | --- | --- |
| 普通右击 | mousedown 后、mouseup 前出现 contextmenu | mouseup / auxclick 后出现 contextmenu |
| 右键连续拖动 120px | contextmenu 先于首次 mousemove | contextmenu 在全部移动和 mouseup 后出现 |
| Control＋左键单击 | mousedown 后出现 contextmenu | 整个 down/up 序列没有 contextmenu |

两个探针进程均正常退出（exit 0），临时 Profile 与 HTTP 服务已清理。原始回执和独立脚本：忽略目录 `artifacts/sidebar-tools/mouse-gestures/right-button-coexistence-01a1d42c/blink-setting-probe.json` / `blink-setting-probe.mjs`。这只是 `ISOLATED_HEADLESS_EVENT_ORDER` 证据；不证明真实原生菜单显示/选择、物理鼠标或当前安装工具的动作通过。

**专家决定：不将此启动参数作为产品修复。** 它证明 Chromium 宿主具有调整时序的机制，也修正了“完全无法延后”的过宽理解；但会破坏原有 Control＋单击菜单，且属于需重启进程的内部启动覆盖，不是工具可在原安装合同中调用的公开接口。[Chromium 官方启动参数指南](https://www.chromium.org/developers/how-tos/run-chromium-with-flags/)也提示开发/临时参数可能变化或移除。未把参数写入日常启动器、框架代码或正式工具包。保留原菜单交互仍需宿主层完整能力，不能用此次时序改善将双 P0 标为通过。

## 后续备选核查（同日）

当前 main 的运行逻辑及公开菜单接口未变化。补查两项开源实现，均未发现能直接复用并满足双 P0 的机制：

| 项目及固定源码 | macOS 处理 | 对本目标的结论 |
| --- | --- | --- |
| [FlowMouse `08e1189` content.js L2675–L2702](https://github.com/Hmily-LCG/FlowMouse/blob/08e1189fd0c4c145811ed26102cd92c4e235afaf/js/content.js#L2675-L2702) | 首次 contextmenu 取消；短时间再次右击放行。[变更记录](https://github.com/Hmily-LCG/FlowMouse/blob/08e1189fd0c4c145811ed26102cd92c4e235afaf/CHANGELOG.md#L340-L344)明确改为双右击唤出菜单 | 单次普通右击被吞，不符合 P0-菜单 |
| [Chance-fyi/mouse-gestures `e839c6b` event.ts L275–L334](https://github.com/Chance-fyi/mouse-gestures/blob/e839c6bdadb39f15039f9672cce61749caabb9ce/src/core/event.ts#L275-L334) | 首次取消；第二次右击设置 allowNextContextMenu，绕过手势处理 | 同样改变普通单次右击，不符合 P0-菜单 |

这两个样本不是穷尽证明；它们排除了本轮实际查到的替代实现，不据此断言所有宿主均无解。

仓库接口矩阵虽发现 `chrome.chromeWebViewInternal.showContextMenu`，其记录为 `INTERNAL_NOT_EXPOSED` / `NOT_APPROVED_BY_DISCOVERY` / `OUT_OF_TARGET_SCOPE`，没有获准操作 ID；它不是普通 Chrome 扩展可调用的公开能力。不能按名称相似接入。

对独立 OpenDesk 仓库仅作只读核对：`types/mouse.d.ts` 公开点击、移动、按下、抬起等主动输入；`automation/recorder_uiohook_bridge.h` / `.c` 将观测事件复制给 Go，公开回调没有扣留/继续输入的结果合同。这不等于已有可交付的原菜单延后 API。Recorder 的底层 hook 也不能当成鼠标手势工具已获准的拦截权限；未启动、占用或修改该资源。

**历史范围问题已由用户委托专家判断**：用户回复“不知道有什么区别，你作为专家，合理判断”。不再等待其选择技术层，也不将该回复视为已授予 macOS 系统权限。以下为此次评估后的决定。

## 历史 Native 路线决定（本次方案验证前）

**本轮不采用 Native 拦截，不为此安装新辅助程序或请求系统权限。** 这不是将双 P0 改为只保菜单；两条仍未通过。决定依据是缺少输入与原文档的受支持绑定，而不仅是 Native 增加安装成本。

- Apple 支持复制输入事件，以及[按 PID 创建 event tap](https://developer.apple.com/documentation/coregraphics/cgevent/tapcreateforpid(pid:place:options:eventsofinterest:callback:userinfo:))。Native 方案可以缩小到浏览器进程；不能笼统声称所有方案都只能全系统拦截。
- [`CGEventPostToPid`](https://developer.apple.com/documentation/coregraphics/cgevent/posttopid(_:)) 指定进程，没有 Chrome window/tab/document 选择参数；[`CGEventTapPostEvent`](https://developer.apple.com/documentation/coregraphics/cgevent/tappostevent(_:)) 插入事件流，不承诺交付给原标签页或文档。保存原时间戳不补充这些身份。
- 当前 `src/native-agent/protocol.js` 的 `target.current` 返回异步快照；`src/platform/chrome/current-page-refs.js` 通过 tabs.query / getFrame / tabs.query 复核当前文档。它们未提供在 Native 扣留 rightDown 之前，绑定物理事件、Chrome 内容区域、原文档与安装撤权状态的同步合同。不能把已有快照当作此刻输入授权。
- 本机 Apple SDK `CGEvent.h` 声明允许 callback 用 proxy 投递事件，但没有显式保证保存旧 callback 的 proxy 后异步使用仍有效。可在后续 callback 使用当次 proxy，但这仍未解决原目标绑定；不是断言 proxy 一离开 callback 就必然失效。
- 按 Apple 的[安全权限说明](https://developer.apple.com/videos/play/wwdc2019/701/)，修改输入或发送输入属于 Accessibility 授权范畴；本次没有证据要求这项纯鼠标方案同时申请 Input Monitoring。可用不弹框的 AX trust preflight，本次没有发起授权请求。

具体未解步骤是：普通右击被扣留后，如果同一 Chrome 进程/窗口中发生换页、同 URL 换文档或授权撤销，不能将原输入补发给新目标。若 tap 超时、进程退出或 down/up 中断，也不能只凭 posting 调用返回就断言原菜单正常或鼠标状态恢复。当前公开链路没有证明这些条件，故不编写默认拦截器、不占用 Recorder，也不把 USER_SCRIPT 提权为桌面输入控制器。

再次进入实现所需证据：受支持的浏览器宿主菜单延后能力，或 Native 层经过验证的原始输入→原窗口内容区域→原文档与安装授权绑定、退役及单次交付能力。不能只靠缓存焦点/矩形或超时租约推定。该工程缺口仍存在，不转嫁给用户选择技术名词。

## 不采用未经证明的补偿

DOM `dispatchEvent(new MouseEvent('contextmenu'))` 不恢复 Chromium 原生菜单默认动作。[Chrome debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger) 的 CDP Input 则属于另一条浏览器输入路径，**可能产生可信事件并再次触发真实菜单**，不能将它误称为普通 DOM 合成而断言绝对不可行。

但 CDP 注入创建的是新的输入，不是原事件继续：[Input 协议](https://github.com/chromium/chromium/blob/4ee513bef654a789db20ffdecb9e0b95215a483c/third_party/blink/public/devtools_protocol/domains/Input.pdl#L164-L189) 没有被取消菜单的恢复句柄。网站监听器会重新执行，目标、选区或文档可能已经变化，还可能被手势监听再次拦截。已有扩展级 debugger 权限不自动授予 USER_SCRIPT。这条路线未申请权限、attach 或实现；不能以命令成功当原菜单保真或用户手势授权，也不能未知重试。

## 本次续接：第三方实现与 Ctrl 实测

本节是新增研究结果；没有修改运行逻辑、默认触发、权限或正式包。开始时复核仍为 `main`、0.3.5 / Page revision 9，正式 JSON SHA256 仍为 `c5e086a7e272a817c9a3fc82c8402c2aced7af118bc3b1dff050f027e35378e7`。

### 不同产品怎样处理菜单时序

以下源码与产品文档不是本机安装实测。smartUp 的官方源码已较旧；Gesturefy 与 crxMouse 另核对当前发行信息，不能把同名旧实现当作当前 Chrome 安装版。

| 实现与核查版本 | 菜单与触发的实际机制 | 平台及复用判断 |
| --- | --- | --- |
| smartUp `2144ec161697751b1a6702f1af866726ea689e4e`；manifest 7.2.622.1170 / MV2，提交于 2023-05-06 | 默认右键、无修饰键。非 Windows 首次取消 `contextmenu`，500ms 内后续事件放行；[事件处理 L204–249](https://github.com/zimocode/smartup/blob/2144ec161697751b1a6702f1af866726ea689e4e/js/event.js#L204-L249)。[产品说明](https://github.com/zimocode/smartup/blob/2144ec161697751b1a6702f1af866726ea689e4e/_locales/zh_CN/messages.json#L74-L81)将双右击描述为折中 | 与前述 FlowMouse、Chance-fyi 一样改变普通单次右击；不能复用为双 P0 修复。不证明当前 Chrome 可安装性 |
| Gesturefy 3.2.19，2026-09-25，`7840a0db840011a9b8f183dfecd313334a9bf8cf` | [安装/更新时 L163–170](https://github.com/Robbendebiene/Gesturefy/blob/7840a0db840011a9b8f183dfecd313334a9bf8cf/src/core/background.mjs#L163-L170)调用 `browser.browserSettings.contextMenuShowEvent.set({value:"mouseup"})`。默认右键；越过阈值后抑制菜单，[控制器 L395–478](https://github.com/Robbendebiene/Gesturefy/blob/7840a0db840011a9b8f183dfecd313334a9bf8cf/src/core/controllers/mouse-gesture-controller.mjs#L395-L478) | 依赖 Firefox 自身的菜单时序设置，无额外 Native helper。Ctrl/Alt/Shift 是可选的手势抑制键，并非必需启动键。Chrome 不支持该 API；不能直接搬入 Page USER_SCRIPT |
| crxMouse 7.8.0；[当前商店页](https://chromewebstore.google.com/detail/crxmouse-chrome-gestures/jlgkpaicikihijadgifklkbpdajbkhjo)显示更新于 2026-11-11 | 商店仍说明按住右键拖动，无必需修饰键。[官方 FAQ](https://crxmouse.com/faq/)未说明 macOS 菜单时序。公开更新服务下载重定向后超时，未取得当前包源码 | 当前 macOS 单次菜单行为、具体绕行和 Native 依赖均为 `NOT_VERIFIED`。旧用户报告不替代当前版本事实；不据此宣称其已解决或未解决双 P0 |
| macOS 原生 StrokeMouse，`1b424f98a2f7f7c54c2e86a37b13ab0ea329cd55` | 吞下触发键的 down/up；未形成绘制时，在松开后按最初按下坐标新建两个 CGEvent 并全局投递；[构造与投递 L291–382](https://github.com/Licoy/StrokeMouse/blob/1b424f98a2f7f7c54c2e86a37b13ab0ea329cd55/StrokeMouse/Core/EventTap/MouseEventTap.swift#L291-L382) | 独立 Native 程序，重新发送输入，不是恢复浏览器的原菜单事件。点击投递没有携带原应用/窗口/网页身份；窗口保护用于部分手势动作，不能证明菜单仍绑定原网页。未运行或申请系统权限 |

Gesturefy 的差异有宿主源码佐证：[Firefox 固定 Cocoa 源码 L2639–2681](https://github.com/mozilla-firefox/firefox/blob/2887d9de1f69c0e9776413da80e7ba0d1225dd9b/widget/cocoa/nsCocoaWindow.mm#L2639-L2681)读取 `ui_context_menus_after_mouseup()`，右键按下时可跳过菜单，松开后进入 Cocoa 菜单路径。因此“macOS 所有浏览器都无解”不成立。[Mozilla API 文档](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/browserSettings/contextMenuShowEvent)与[固定兼容数据 L105–115](https://github.com/mdn/browser-compat-data/blob/0ee5e3a2957afda98d5f74cb8106d52f6a3a7c63/webextensions/api/browserSettings.json#L105-L115)说明此 Firefox 能力与 Chrome 的差别。源码调用没有等待设置结果，不证明某台 Firefox 的安装结果；本轮未在 Firefox 实测，也不将 Firefox 源码机制提升为当前 Chrome 产品 PASS。

smartUp、Gesturefy、Firefox 与 StrokeMouse 的源码核查来自研究子 agent 成功读取的 GitHub API 内容及关键摘录；本对话对 raw 域名的独立下载超时，没有据此生成源码哈希或假称取得本机副本。crxMouse 官网、FAQ 和当前商店页由 ego-browser 直接读取；未安装任何第三方产品。

### Ctrl 是否解决当前入口

在 ego lite 0.6.2.9 的同一 TaskSpace 131、同一顶层 `http://127.0.0.1:65276/native-menu.html`，通过受支持的定向鼠标/键盘 API，分别执行按下 → 移动 80px → 松开。观察监听不取消、不补发事件；各序列间以 Escape 收尾。下表时间均为相对各自 `mousedown` 的毫秒数：

| 输入 | contextmenu | 首次 mousemove | mouseup |
| --- | ---: | ---: | ---: |
| 普通右键 | 0.5 | 35.0 | 51.8 |
| Ctrl＋右键 | 0.1 | 11.0 | 14.3 |
| Control＋左键 | 0.1 | 7.8 | 11.1 |

三者均在移动前派发可信菜单事件；加 Ctrl 没有改变时序。Control＋左键本就是 macOS 菜单交互，不能拿来默认替换。当前工具本身也排除 Ctrl/Meta/Shift 修饰输入；即便新增 Ctrl＋右键识别，浏览器的提前菜单仍存在。

证据为忽略目录 `artifacts/sidebar-tools/mouse-gestures/third-party-01a1d472/modifier-timing.json`。观察结束时同一文档存在 `app.mouse-gestures` host，但精确工具版本/设置未核实；UA 自报 Chrome/156.0.0.0，仅是 UA，不作为真实引擎版本。结论仅为 `CURRENT_EGO_EVENT_ORDER_ONLY`：不证明物理鼠标、菜单实际显示选择、已安装候选身份或四方向执行。TaskSpace 131 已 finish，专用 HTTP 服务已关闭，未操作旧 Space 126、日常启动参数、Native 配对或现有 watcher。

**本轮判断：额外快捷键不是鼠标手势的普遍必要条件；当前环境的 Ctrl＋右键也不是此缺陷的修复。** 现有 Option/Alt＋左键可作为可选兼容触发，保持原默认及双 P0 目标。Firefox 的受支持宿主设置说明完整菜单协调可以由浏览器实现；当前 Chrome/Page 仍缺对应可调用能力。StrokeMouse 未补足原文档及授权绑定。第三方比较没有建立可交付的 Chrome 修复候选，故不升版、不重打包、不重复运行无关测试。

## 下一步与停止条件

1. 日常 Chrome 最新结果已收敛：用户确认按下右键即弹菜单且无轨迹，原生只读界面核实 v0.3.5 与 ON，源码单项诊断确认提前菜单取消手势。不重复请求同一实测，不将该问题继续写成只有 ego 失败。继续实现需要受支持、保留原菜单交互的宿主协调能力；现有公开接口未提供，下述 Native 拦截和内部启动覆盖尚不满足条件，本轮不修改日常启动参数或请求系统权限。
2. 具备真实底层能力后，平台最小合同才可进入实现：限当前已授权文档与安装代际；只在同次右键交互中协调；导航、停用、撤权、失焦或 unknown 立即退役，不重放；不能把网站回调穿入特权层。手势识别与动作继续归本项目。
3. 沿原审阅链同 ID 更新同源候选，核实已安装包及网页实际运行身份。在同一已安装候选、同一已授权页面、同一默认右键设置，同时证明普通右击/微抖菜单的实际打开选择，以及四方向按住右键连续拖动各恰好执行一次。再定向验证 README 中取消、权限、旧设置与正常网页交互条件。

两条 P0 缺任一实际证据即未完成。Alt-left、练习画布、菜单先到后取消、源码夹具或 Node PASS 继续不能替代；本次诊断没有晋升新包，也没有把既有 0.3.5 重新标为修复成功。
