# Sidebar Demo R3：实际调用与局部验收

本轮关闭下表明确列出的局部 Demo 行为。Page UI 的按钮只调用本地 `renderPanel` 回调，读取点击时标题、trim 输入，受管定时器约 120ms 后写出 `{pageTitle,input}`；它没有消费 Controller、现代 Page 自动化服务、Native Host 或网络 API。`UI_OPEN` 仅证明初始化，业务回调另有证据。

冻结产品候选：`b6ca5be85ad8607aee2c6a79172acde4703d166e`。初始 main `0fd383ec…`；执行中合入当时最新 `996df38f…` 后验证。后续仅交付记录的提交不改变产品输入。[完整身份](../evidence/sidebar-demo-r3-01a11fba/source-binding-final.json) 与 [逐项原始结果审查](../evidence/sidebar-demo-r3-01a11fba/logic-review-final.json) 是复用入口；不是 F3/ZIP 或整体迁移回执。

扩展包：`239ab036ee4769d3f744e83c33a3ec01b52ba3165c7d897742253735eea69658`，26 个文件；实际运行 SW 与磁盘均为 `89231ecb6653dc7ba4ed820623597a4756f7fb25f81398eb814d0071f1bdd7c8`。构建输入复核无漂移。实际包目录为本 worktree 的 `dist/production`。

## 入口、调用、通过条件与结果

表中原始文件位于 `../evidence/sidebar-demo-r3-01a11fba/`。每行的 PASS 只覆盖所写行为和身份；组件计数与原生观察明确分开。

|真实入口→实际函数|输入/前置状态|输出与副作用、失败/取消条件|通过条件与结果|原始证据|
|---|---|---|---|---|
|Sidebar 发现→导入→异步 handoff|真实 JSON 文件选择器；返回标准页；显式 Run|三只读 JS 源快照＋完整 classic JS；查看辅助文件不改变执行产物；无自动运行/保存|PASS_SCOPED。三草稿字节与构建相同；Page/Controller 辅助文件实际执行仍为完整 SHA。Save 不涉及；权限来自此前明确操作，不由导入授予|`native-verified/*picker.json`、`real-file-change-events.json`、`ui-source-{main,title,view}.json`；Page/Controller 三视图复用 `native-final/*source*.json` 的纯展示结果，不能提升其中执行证据|
|Page 试运行→`previewPageScript`→`chrome.userScripts.execute(USER_SCRIPT)`→Page main|标准页新捕获 `#lab-search`；辅助 `src/fixture.js` 选中|`PAGE_DEMO_OK` 精确值；同 document/frame=0，不同 nonce；重复仍只有一个 proof|PASS_SCOPED。原生 receipt 与冻结输入分开关联；receipt 本身不带 sourceHash。proof 数从观察器完整 `[id]` 枚举导出|`native-verified/page-first-native-receipt.json`、`page-repeat-native-receipt.json`、对应 `*-pass.json`|
|Page 冻结 target 检查／完成后检查|捕获后 hash 改变；捕获后 reload；原生执行完成后 reload|均 `E_DOCUMENT_STALE`；第三种在旧文档已执行，拒绝接收成功，不撤销旧作用、不重放|PASS_SCOPED，保留精确旧/新 document 与 reload loader。未扩大到所有导航竞态|`native-verified/page-{old-url,cross-document,during-navigation}-{debugger,rejected}.json`、对应 reload/new-document 记录|
|Page main 非目标分支|同标准服务的既有根目录页 `/`|`SKIPPED_OUT_OF_SCOPE`；前后 proof=0、示例 hosts=[]|PASS_SCOPED：本 Demo 不创建 proof/host；不是全 DOM/存储零写入审计|`native-verified/page-out-of-scope-{native-receipt,before,after}.json`|
|UI main→`createPageUI`→`renderPanel`|最终 UI 完整 JS；三源快照只读|真实 Shadow DOM；JSON 标题/提示；CSS 计算宽度 360px；PNG complete、4×4、资源 SHA；`UI_OPEN`|PASS_SCOPED 初始化，panel/launcher=2。上游新增 inline host 单列，不计入这两个 host|`native-verified/ui-open-native-receipt.json`、`ui-resources.json`、`ui-real-sender-and-receipt.json`|
|“读取本页信息”→本地回调|面板创建后经网页真实控件改标题；输入 `  OpenDesk UI  `；Enter 输入 `  Enter path  `|精确 `{pageTitle:"R3 点击时读取当前标题",input:"OpenDesk UI"}`／`"Enter path"`；busy 禁用→success 恢复|PASS_SCOPED。在 main 已返回后真实按钮仍执行；组件另证明等待期间再变标题也保留点击时快照|`native-verified/ui-title-changed-after-mount.json`、`ui-valid.json`、`ui-enter.json`；`merged-affected-after.log`|
|空、纯空白、busy 连续点击|`""`／`"   "`；6ms 内三个真实鼠标尝试|空值 error＋focus，保留上次结果而非新成功；后两次点击遇 disabled；一个 busy→success 周期|PASS_SCOPED。原生没有独立 handler 计数；组件证明单 timer 调度、busy Enter/点击去重。Enter 的非可信 click 是原程序自身 `run.click()`，代理只输入可信 Enter|`native-verified/ui-{empty,whitespace,burst-native-attempts,burst-result}.json`；`page-ui-basic.test.mjs` 定向结果|
|关闭／launcher 重开／完全退出／重复 main|业务定时器未完成|panel/launcher `2→1→2→0`；重复仍 2；旧 detached panel 保持 busy/旧结果，过期限未晚到写入，新 panel idle 后可运行|PASS_SCOPED。组件证明本 panel 的 timer 取消和 listener 移除；原生证明晚到副作用被抑制，未声称全局 listener/timer 归零|`native-verified/ui-{closed-after-deadline,reopened,exited-after-deadline,replaced-correct-panel-after-deadline,after-repeat-business}.json`|
|导航／重新显式运行 UI|原生 Cmd-R 同 URL，document 更新|新文档无 host；仅显式运行才再次创建 UI|PASS_SCOPED；组件 pagehide 清理。BFCache 未测|`native-verified/ui-{navigation-reload,after-navigation,final-reopen-native-receipt}.json`|
|Controller Run→`page.fill/click/waitFor`→标准页搜索→持久结果|参数 `{keyword:"OpenDesk"}`；新 `#lab-search`；真实控件可见且无遮挡|精确 `CONTROLLER_DEMO_OK`、`结果：OpenDesk`；每 run 一次 click/提交，计数 `0→1→2`；结果自身 revision/sourceHash；terminal worker released|PASS_SCOPED，两个独立结果如下。不能用本地 UI 按钮结果代替此框架链|`native-verified/controller-first-pass.json`、`controller-repeat-pass.json`|

Controller 精确关联：

|runId|resultId|结果自身 revision/sourceHash|结果计数／retirement|
|---|---|---|---|
|`08e2330f-9b1a-41c3-bd7b-20f59e5b621b`|`724ca00e-6866-4b71-adaa-2582d19746e9`|draft revision=1；`d7210dd0…`（下表完整值）|1；workerRetired=true；released|
|`d683c93d-084b-4d05-9e54-d3b13247123e`|`fce6872c-b471-41e8-a558-38c3b6ac557c`|draft revision=1；相同 sourceHash|2；workerRetired=true；released|

两次 target document 为 `53D8D8A841F62ADB22A78F816EFBA4D3`，tab=1740203234/frame=0。最终 UI target document 为 `50CBD468DF6E5F8D38563247CC0E1620`、URL `#lab-text`。真实 Sidebar sender 为扩展 `ohknjhnpgnfljphkegigbdcjfeenlofk`，hostInstanceId `7792cda4-9994-47f2-b714-f063de41c3d2`；Chrome `SIDE_PANEL` context document 为 `A646625A4DDDB92550F2BAF802032CBA`。原始 sender 事件不提供 documentId；这个字段来自独立 `getContexts`，不能伪装为 sender 自带字段。完整 target/session/nonce 见身份 JSON。

Page 拒绝时结果区可能保留上一成功文本；本次返回以 `E_DOCUMENT_STALE` 状态和对应请求记录为准，残留文本不登记为新成功。

## 修复与验证

1. `examples/programs/page-ui-basic/src/main.js`、`src/view.js`：移除面板创建时的标题闭包，合法点击时读取标题并冻结。`title-before-corrected-harness.log` 为真正红回归；原 `title-before.log` 只是观察器 harness 缺 appendChild，不算产品失败。标准 `examples/tasks/demo-form.html` 增加明确标题输入/更新按钮，供可信用户操作；没有替代 HTML、Console/CDP 标题赋值。
2. `src/scripting/user-scripts/preview.js`：收到真实 nonce/document receipt 后再次验证冻结 target，避免旧文档完成被误报当前成功。`late-navigation-before.log` 为修复前失败；新版原生 `page-during-navigation-*` 已验证拒绝。没有取消已经发生的旧效果或重放。

`tests/environment/page-ui-basic.test.mjs` 添加有区分力的标题/trim/busy/清理回归；`page-script-preview.test.mjs` 增加完成后目标改变回归。最终输入上的 29 项受影响检查与 6 项依赖检查通过，production build/verify 通过，语法与 diff 检查通过。这些是定向验证量，不是产品完成量；不重复原103/96的重叠组件集合。Controller README 说明实际搜索控件的 viewport 前置条件。没有新增依赖，保留最新 main 的 inline/anchored UI 实施。

## 可导入身份与复用边界

|程序|JS SHA-256|draft SHA-256|
|---|---|---|
|Page|`4d8693b967e4e5e8b2cc1b67ca52e4dc0cde21fa08a145ade0da8364af0c859b`|`ce48ed76fb36ce3f60b9cee926de14650c0767a1bcea1121075c622da725dbad`|
|Controller|`d7210dd03e38dd9ded917e816289e2adf9b55e0c409a4f72c644091c8f0684c8`|`b7d6e3d39a863a75e7c0f025f86983ed8b65402e9ed1dc65e8bf07211d1dff65`|
|Page UI|`4205470a617ba9d72b7f0abb68b870951cdb99601cdc0f34374aee7150cd2fb4`|`45c699495df0e0f626f69a813c6a224f83acc9b4151296bd62a6698b9eefe5a4`|

Page/Controller 构建字节复用原产物；UI 因源代码及当前 UI 库输入改变重新构建。草稿可本地导入，artifact 的 BUILT_UNVERIFIED/installable=false 状态保持不变；这里的 Demo 通过不等于正式发布可安装。

旧 R2 的 `b8cfc1f…`／包 `9622cb…` 原生结果保持原等级。初始复用包 `63b090…`、UI `511c920…` 的本轮结果也是独立历史；不追认为最终包 PASS。旧 JS、Stop、撤权、同 profile 重启保留历史具体范围，最终输入上的这些原生场景未重新登记 PASS。CI 103/96有重叠，不相加；合入事实不能把 native pending 改成 PASS。

关键环境失败：同 profile CFT 重启后，磁盘虽为新包，SW 实际仍是旧 `7137d290…`。`native-final/actual-loaded-source.json` 的 matches=false 及旧 SW 原文保留，该目录执行结果不登记新包通过。通过真实 Chrome“重新加载”、打开本 profile 开发者模式后，`native-verified/actual-loaded-source.json` 才 matches=true。三个额外 UI V8 观察器没有拿到初始脚本，标 NOT_CAPTURED；不猜测该字段。

补 sender 时的 Controller run `26b8103c-d9ee-4822-ae5c-286d3c88bd8c` 因未清除面板遮挡而被 `E_TIMEOUT` fence，提交=0，workerRetired=true/released；它只证明实际 sender 和保守失败，不是第三个成功。误选旧 panel 的 `ui-replaced-after-deadline.json` 不计替换清理 PASS；正确 panel 的记录独立保留。其余观察器/前置条件失败见 [失败分类](../evidence/sidebar-demo-r3-01a11fba/failure-ledger.json)，失败未覆盖或丢弃。

目录直接导入 **NOT_IMPLEMENTED**。320/400/600 CSS px、200% 缩放、20次开关、BFCache、离线、原生全局资源计数及上游 inline 策略完整能力 **NOT_TESTED**。UI 未实现 Controller/Native Host/网络消费者链。Save **不涉及**，没有 Save/native ack。F3、ZIP、603+19/B05、整体迁移均未关闭。

## 手工复现与当前窗口

源码目录：`examples/programs/{sidebar-page-demo,sidebar-controller-demo,page-ui-basic}`。当前可导入的原字节副本：[Page](../evidence/sidebar-demo-r3-01a11fba/imports/page.opendesk-draft.json)、[Controller](../evidence/sidebar-demo-r3-01a11fba/imports/controller.opendesk-draft.json)、[Page UI](../evidence/sidebar-demo-r3-01a11fba/imports/page-ui.opendesk-draft.json)。不需要浏览器直接编译源码目录。

1. 在本轮受控 CFT 打开 `http://127.0.0.1:43111/demo-form.html`。Sidebar“发现→导入”选择上面的 JSON，返回标准页。开发者模式与允许用户脚本已由本轮明确打开；导入本身不授予权限。
2. “开发”可查看各辅助 JS 源快照和 `program.js` 完整执行代码。Page/Page UI 使用“在当前网页试运行”；Controller 使用“运行草稿”，参数填 `{"keyword":"OpenDesk"}`，先关闭 Page UI，滚动至搜索输入/按钮可见且无遮挡。
3. Page UI 主函数返回 UI_OPEN 后，网页“当前网页标题→更新网页标题”可改变标题，再输入带空格文字，点击面板“读取本页信息”或 Enter；核对结果 JSON。关闭保留 launcher，完全退出移除 UI，重新 main 替换原实例。

交付观察时 CFT PID **2652**、独立 profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-n8mt6i7m`，HTTP PID **10400**／43111 **HTTP 200**，两者仍存活；未接管其他 CFT/profile。页面保留实际成功结果 `R3 最终演示`。这是当前可见窗口的截图：[交付窗口](../evidence/sidebar-demo-r3-01a11fba/native-verified/handoff-visible-window.png)，不是旧截图；[实际 argv/端口](../evidence/sidebar-demo-r3-01a11fba/native-verified/live-resource-handoff.json) 是资源交接入口。保持单资源占用；接续者先核对 PID/argv/HTTP，而不是仅相信本段“仍存活”。

最后一次置前请求被 PID 保护拒绝，因此不保证 Chrome 处于最前。随后只读观察仍确认本轮窗口在屏幕上、CFT 存活；没有向其他应用发送键鼠输入。`http-server.log` 为持续追加的本地日志，Git 冻结副本为 `http-server-at-delivery-31cf520.log`，保留原字节。

原始历史全部保留在本 worktree 的独立证据目录；Git 保存决定性新原始结果、身份、构建/回归和失败记录。`evidence-index.json` 索引全部本地原文件及字节 SHA，未把仅本地的诊断副本当成新的验收回执。独立只读复核确认上述局部边界；不宣称全部资源归零。
