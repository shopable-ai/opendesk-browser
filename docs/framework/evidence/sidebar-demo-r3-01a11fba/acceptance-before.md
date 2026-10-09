# R3 执行前行为表
每项均保留旧 b8cfc1f/package 9622cb… 的原结果；当前候选 0fd383ec + 本轮差异，包/程序身份待冻结。Save 不涉及。

|真实入口|输入/前置|预期调用/输出|副作用/失败条件|已有原始证据（R2目录）|当前状态/下一动作|
|---|---|---|---|---|---|
|Sidebar 发现→导入 JSON|三个构建草稿|异步 handoff；只读三源码+完整 program.js|无自动授权/保存/运行；辅助文件不改变执行SHA|import-artifact-identity.json|AFFECTED_INPUTS：新版 program-source/tool 展示；补真实入口|
|Page DOM试运行|标准页/真实sender/document|USER_SCRIPT 唯一 native receipt|唯一proof；重复不叠加；非目标不写|page-receipt-review.json；前工作流 out-of-scope|审查输入；新包补正向，旧非目标逐项复用或标缺失|
|Page UI初始化|资源字节固定|main→createPageUI→renderPanel；UI_OPEN|CSS计算值/JSON/PNG解码，两host|native/page-ui-open.json|新程序标题修复后补原生初始化|
|读取本页信息|空/空白|trim 后报错并focus|无新业务成功/无timer|native/page-ui-empty.json|空白/焦点缺证据；补组件及原生|
|读取本页信息|前后空格的有效输入|点击时标题与trim参数→120ms后精确JSON|busy→disabled→success；无网络/Controller|native/page-ui-valid.json|标题创建时捕获缺陷；先红回归后修复|
|Enter/连续点击|有效输入/busy|一次业务定时回调|无重复timer/旧回调覆盖|组件待审查|补受管timer计数回归与真实点击/Enter|
|关闭/退出/重复main|timer未完成|destroy→清理listener/timer|无晚到DOM写；新实例不叠旧回调|native/page-ui-closed/reopened/exited/before-repeat/after-repeat|host数不足；补定向组件及原生观察|
|Controller运行草稿|OpenDesk，标准页#lab-search新捕获目标|page.fill/click/waitFor→精确controller-result|每次搜索+1；revision/sourceHash，retirement released|native/controller-first-running/repeat-result.json|target片段输入变化；补真实新片段链与旧目标拒绝|
|导航/Stop/撤权/重启|已冻结旧目标/结果|拒绝或取消/持久结果|不重放；未知效果保守拦截|native对应历史记录|保留旧候选原范围；不因新包提升PASS；受影响项补或明确NOT_TESTED|
|目录导入|源码文件夹|当前未实现|不可宣称可用|现合同|NOT_IMPLEMENTED|
|320/400/600px、200%、20开关、BFCache/离线|布局/恢复|README待验收能力|不能借核心项PASS|无原始执行|NOT_TESTED；本轮不承诺|
