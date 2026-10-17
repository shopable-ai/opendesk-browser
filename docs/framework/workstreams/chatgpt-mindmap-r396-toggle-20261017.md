# R3.9.6 官方操作组与可重复切换

负责人：本对话 Codex，2026-10-17，本地 Mac，main。

类型：Page USER_SCRIPT；业务所有权 examples/programs/chatgpt-mindmap/，现有公开 Page UI 固定资源通道。

写入范围：src/answer-registry.js、src/view.js、src/xmind-installed-frame.js、assets/ui.css 及受影响业务测试；真实失败证据必要时扩展至业务其他文件。适配器与其测试由子代理单独负责。README 已有他人未提交改动，保留并只追加本任务结果。

顺序：官方组内唯一可见中文开关；普通打开→关闭→重开→关闭；全屏重复切换；之后修复真实三级列表与折叠、缩放。关闭验证包括同一原文节点、完整 HTML/text、可见性及 frame 清理。

资源：复用独立 CFT dev.opendesk.mindmap.r396.01a1489e、原 Profile/DevTools 49287、现有静态本地调试扩展 acfngehajboacgkmdhbcnkhjdabfhfon。只构建独立 business-candidate，不写 dist/development，不停止 watcher。CDP 仅观察，所有输入走 cua 原生控制。最终保留窗口。

不推送、不发布、不修改正式安装状态；延后 retirement 补丁继续不应用。


## 用户要求转新对话时的续接（18:20 CST）

完整提示词：artifacts/chatgpt-mindmap-r396-local-frame-20261017/HANDOFF-toggle-next-chat.txt；状态与源码指纹分别为 toggle-handoff-state.json、toggle-source-state.json。

独立新窗口 dev.opendesk.mindmap.r396.toggle.01a1493f / PID16932 / DevTools59469 / toggle-chrome-launch.json，复用原静态调试扩展；日常 watcher 未动。候选5普通开关两轮原生通过，原文753字符同节点/完整HTML及text哈希、可见性、唯一组内开关与frame清理均记录；全屏直接关闭存在延迟清理与E_XMIND_CLEANUP。已将关闭改为releaseFull后直接销毁，不再等待退出reflow；组件15/15、适配器8/8通过。

候选6 4225312字节 / SHA8714f2cfa80062d76d223f25a580917f555dc17af60ab3e5b9a8da2b7cfbb450，已导入新真实回复 https://chatgpt.com/uc/6ad34b3d-8ffc-83ea-b764-0be826bf2efb （668字符），原生打开并进入全屏。随后只读交接观察已回原文，期间没有执行关闭点击，原因未确认，不能登记候选6原生关闭PASS。窗口仍保留；最新准确DOM是toggle-c6-handoff-latest.json，截图为toggle-c6-handoff-latest-original.png。下一轮先核对实际状态并复验完整闭环，再修extract列表透明DIV包装。没有新提交或推送；parser未改；英文真实界面、折叠、缩放及完整候选6闭环均NOT_TESTED。

## 本地续接：候选6原生闭环（18:35 CST）

负责人：当前 Codex；只在 main。继续占用专用 Toggle CFT / 原 Profile / 59469 / hostInstanceId40840f6e-98b5-411b-b950-f30282a7cfa8；未刷新匿名回复、未重建扩展、未写日常 watcher 输出。源码九项指纹与交接一致，界面导入字节与候选6 SHA 一致。

原生 CUA 完成普通两轮和全屏直接关闭两轮；每阶段被动 CDP 记录 `toggle-c6-native-{open1,close1,open2,close2,full1,fullclose1,full2,fullclose2}.json`。八阶段断言见 `artifacts/chatgpt-mindmap-r396-local-frame-20261017/toggle-c6-native-verdict.json`：唯一官方组内开关、正确 pressed、真实 Snowbrush 子文档、关闭后 viewer/子 frame 清空、同原文节点1480及完整 HTML/text SHA 均 PASS。直接全屏关闭后原生重开成功；旧候选5失败证据保留。

后续写入按文件分工：当前负责人维护已修改的 registry/view/adapter/css及其既有测试与本记录；独立 executor 只修 extract.js 和新列表回归样本/测试，单独记录所有权。其他 README/package.json/prepare-local-resources/.gitignore/docs/api 与 adblock 改动不纳入本任务提交。候选7使用独立 business-candidate7 输出。正式安装/发布、真实英文界面仍 NOT_TESTED。

## 候选7完成（18:51 CST）

状态：CORE_VERIFIED_LOCAL_ONLY。源码文件写入释放；专用 Toggle CFT/Profile/端口继续保留给用户查看。最终导图已重新打开、展开并进入全屏；未停止保留窗口、未关闭侧栏、未刷新匿名回复。

候选7：4225512 字节 / SHA-256 `c996d1412aae5c19091cdeca39db2335e5001b37dbe4d5f4c968da0f3e36b051`。XMind 固定资源仍为4072771字节 / `4523e609bf4fb3378bc24c075c796ae90c694c28a2db7edd6f5fb90b9b24ed17`；未改运行时资源或平台实现。候选构建仍是 BUILT_UNVERIFIED / installable:false，当前本地试运行不提升正式安装状态。

- 同一668字符真实回复，原生普通两轮、全屏直接关闭两轮均 PASS；官方组内唯一开关，关闭后同原文节点1480、完整 HTML/text、block/visible/rect1、aria-hidden 清除，viewer/子 frame 为零。关闭后重开得到新子文档。每阶段 JSON/截图均保留。
- 原生全屏进入/退出保持同一子文档；最终候选真实三层列表提取61个业务节点，连根节点共62个 XMind topic，全部显示标题与树逐项匹配；四分支顺序正确。折叠后2个可见 topic，展开恢复62个；缩放实际 scale 从0.5→0.625→0.504，适配恢复自动视口。
- 定向验证最终43/43 PASS、0 FAIL、0 SKIP（提供现有固定参考目录，含真实SDK三项）；业务独立构建、语法、diff检查通过。没有运行平台构建、生产验收或宽度/浏览器缩放矩阵。

最终持久报告：`examples/programs/chatgpt-mindmap/tests/mac-toggle-r396-20261017.json`；原始证据与快照仍在 `artifacts/chatgpt-mindmap-r396-local-frame-20261017/`，报告记录45个文件的SHA与完整候选指纹。最终页面截图 `toggle-c7-final-open.png`，专用窗口截图 `toggle-c7-final-window.png`。

本任务另拥有：`tests/environment/chatgpt-mindmap-r1.test.mjs` 的新测试import、上述原生报告；列表executor已交付 extract.js、新定向测试和最小真实HTML样本。仅提交这些本任务路径及既有 adapter/registry/view/css改动；不包含并行本地资源、Native、adblock或README变更。不推送、不发布。真实英文界面、正式安装/升级/撤权及生产验收保留 NOT_TESTED；旧候选5失败和候选6交接未知转换仍保留，未改为PASS。
