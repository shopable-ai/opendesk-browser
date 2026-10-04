# 提示词主线修正的源码依据

2026-10-02，只读核对旧核心的有限相关文件与已冻结迁移设计。此文说明任务表述为何调整，不是重新全库审计、设计重新审批或运行验收。旧来源、72/48 账本、冻结合同和产品源码均未因本次提示词修订而修改。

## 直接证据

- [ChromePage.ts](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/ChromePage.ts:143) 提供标题、内容、URL、导航、元素、输入、点击、等待、Cookie、截图、上传及 evaluate 等能力；[ChromeElement/Keyboard](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/ChromePage.ts:1073) 是相关调用外观。48 项账本是相关成员，不能拿这个计数代替网页 SDK 和其他服务覆盖。
- [evaluate](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/ChromePage.ts:989) 的函数与字符串分支不同；[_execute](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/ChromePage.ts:1032) 使用 pendingEvents 和旧 tabs.executeScript，并选择 active tab；[共享 page](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/ChromePage.ts:1136) 被 [background](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/background.ts:9) 引入。这些是迁移要承接并按合同改造的具体位置。
- [SDK 注入](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/my-content-script.ts:148)、[网页发起服务请求](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/assets/js/core/axiosx.js:26)、[content 转发](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/assets/js/custom_event.js:5)、[后台服务](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/background.ts:102) 与 [网页 Promise 回调](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/assets/js/core/brige.js:16) 构成另一条能力链，包含 axiosx、AppStorage、AppLocal。它不是“先在工作台运行控制脚本”这一场景的附属能力。
- [后台脚本执行](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/background.ts:403) 调用 wrapAsync 后 eval；[UtilScrpt](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/utils/UtilScrpt.ts:5) 和 [serverUtils](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/assets/js/core/serverUtils.js:17) 也有具体语义及旧缺陷。已有冻结兼容合同决定如何修正，不能把保留功能解释成复制旧机制。
- 已冻结 [file-tasks.md](/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/outputs/file-tasks.md) 的 T07 是旧自动化 API，T08 是 SDK/服务/工具，T09 是页面转发与回程，T10 是执行方式，T11 是工作台。其他任务负责现有底座、存储、下载、资源及业务去耦。工作台只是这些任务中的一项。
- 当前 [run-host.js](/Users/shopme/Documents/workspace/opendesk-browser/src/run-host.js:26) 仍创建采集模块并编译模板；[sw.js](/Users/shopme/Documents/workspace/opendesk-browser/src/sw.js:1) 接的是环境健康检查。检查时 `src/framework/ChromePage.js`、`src/compat/src-bex/session.js` 和旧 SDK 的拟迁目标均尚不存在。已有 `src/platform/host/broker.js` 不能代替实际入口接线证明。

## 判断

**高置信推论：** 以“用户亲自操作工作台的顺序”作为唯一开场，会让主任务看起来是新建一个脚本编辑器，无法据此判断旧 API、页面 SDK 和现有公共底座是否迁移完整。上次修订突出了界面交付，却弱化了已有迁移设计中的模块、调用链和兼容主线。

修正后的主目标明确旧来源、新工程、核心能力、现有底座和逐项兼容验收。工作台流程保留为必需的整体接线验收；原型只用于证明特定迁移机制可行，不计为对应模块已迁移。

## 未证明的事项

上述旧代码是静态来源证据，不等于在当前 Chrome 中仍能直接运行。原型结果不证明完整 API 兼容、SDK 回程或产品接线已经完成。此轮没有运行浏览器、恢复暂停的 Goal，也没有改变任何完成标志。
