# 通知实验室连续触发迭代

Owner：本接收对话，2026-11-11；main；起点 d7062fada8d2d11be8f4d3480ea653963c5ba991。

阶段：核心多条操作与最小验证。原对话 goal 保持 paused；production 全量验收与评分延期。

类型／复用：现有 Sidebar Tool `examples/sidebar-tools/ui-notify-demo/`，opaque iframe，通过公开 `OpenDeskTool.ui.notify` / `.open` 调原 Bridge、Host、Store、React Toast。不是新通知框架；不增加能力。实验室 owner 保持原目录。先实测原“重复消息 ×2／独立两条／四连发”，再确定最小修复。

写入范围：该工具的 `src/index.html`、`src/main.js`、`src/style.css`、`tool.config.json`、`README.zh-CN.md`、`tests/notify-demo.test.mjs` 和原打包器晋升的唯一 JSON；本记录。公共通知实现当前只读；如证实缺口另记。

保护：不纳入其他未提交文件，不改共享 React、Host、CSS、AI Proxy 来源锁或构建器；不覆盖 dist/development，不停止 watcher。Git 索引/提交由本 owner 串行，仅暂存本任务路径。无 push、分支、worktree 或 PR。

资源：独立临时 CFT 156.0.8078.4/Profile，原 launcher 管理。本轮可复用上轮不可变 frozen-development（development 诊断，非 production，当前整棵源码闭包未证明）；不改此副本。原生日志输出 `artifacts/ui-notify-multiple-20261111/`。真实当前 Side Panel/PC、工具版本和回执另记。日常 watcher/Chrome/Native 配对只读保护。

验证原因：实验室连续触发反馈、原句柄生命周期及同源安装包是本轮改变的用户行为；定向工具行为测试、语法检查及原打包器检查足以约束改动。公共实现不改则复用既有公共限频/身份测试证据，不启动全量构建或旧 CI。

## 结果与选择

原 1.1.0 核心链已复现：先“重复消息 ×2”即消耗两次创建额度；随后“独立两条”仅一条接纳，再“四连发”全部限频。原正文只留最后一次状态，缺少直观的连续添加入口和逐条拒绝原因。公共 Host 已支持堆叠、合并与限频，不需要另建等待队列或修改框架。

实验室现提供独立编号的单条添加、一次三条常驻演示、最近 12 条请求／回执、逐句柄关闭、置顶反馈与真实 `retryAfterMs` 倒计时。倒计时只展示，不自动发送；关闭不返还额度。异步回执不被后续点击丢弃，页面销毁后停止计时和迟到任务更新。Loading 更新沿用原句柄；失败原因在正文记录中保留。旧 boolean 调用如实说明没有 Host 回执，非法参数意外被接受时报告 FAIL。

保留原 3 次／固定 60 秒、宿主最多 3 条、优先级替换、句柄身份／TTL／撤权及未知结果不重放规则。记录不是当前可见数量，接纳不是业务成功。没有增加 capabilities、依赖、公共组件或权限绕过。

## 源码与交付

唯一正式包：`examples/sidebar-tools/ui-notify-demo/ui-notify-demo.opendesk-tool.json`，版本 **1.2.2**，18180 bytes，SHA-256 `293fabe7357ca8e03ff60400dc569994e4f9c9376347c5bb86c0b7160d8363fc`。

经原打包器构建临时候选，候选定向测试通过后以 `--promote-from` 逐字节核对晋升，再 `--check-project` 确认同源；未手改 JSON。临时候选和日志在 `artifacts/ui-notify-multiple-20261111/`，不作为第二正式包提交。

进行期间，其他 owner 在 main 的 `04ea1bce6` 保存提交已包含本轮较早的 1.2.0 工具源码、样式和包；`43afd7be8` 合并上游 main。该变化没有覆盖本轮后续修正。收尾只暂存剩余工具差异和本记录，不改写上述提交，也不纳入其他并行文件。

## 定向验证

`node --check`、工具测试 **8/8 PASS**、候选／正式包同源检查通过。`final-tests.log` 保存定向输出；合并后收尾再以当前正式包复核。测试覆盖连续三条／第四条拒绝、关闭不返还额度、计时不重发、三条常驻、旧分组合并、迟到回执、12 条记录上限、关闭／pagehide 后不再更新、旧 Bridge 和非法参数，以及同句柄失败原因在后续点击后仍保留。测试使用真实公共 RateGate／View，Bridge 为受控替身，因此不能替代原生证据。

原生诊断使用 CFT **156.0.8078.4**，测试扩展 ID `oegbolipigbbobpldjeahhgmoggelekg`；原 frozen-development 不变，非 production，也不证明合并后整棵源码闭包。`chrome.runtime.getContexts()` 已确认真实 SIDE_PANEL；PC 由原“在新标签页打开当前工具”入口打开，包含正确 toolId。

- 经原安装审阅链从 1.1.0 更新到 1.2.0，再到 **1.2.1**；未直接写安装存储。系统文件选择器第二次无法启用 Open，取消后仅用 CDP 设置原文件 input，再在真实 UI 审阅／确认；该驱动限制不判作通知故障。
- 1.2.0 的 Side Panel 三条堆叠已观察到三条。1.2.1 的 Side Panel 三次创建均接纳，但安装成功通知也占宿主容量，最终仅余两条演示通知；按既有优先级规则处理，未改公共实现。
- 1.2.1 的 PC 连续点击四次，实际显示三个不同编号，第四次收到限频拒绝；逐条关闭后仍限频。按真实时间观察倒计时从约 60 秒递减到结束，未自动增加请求。随后手动开始 Loading，记录收到“更新为成功”的 Host 回执；本轮未取得成功 Toast 的持续可见截图，不据此证明业务成功。
- 原生实装 1.2.1 对应包为 18112 bytes，SHA-256 `9557812b3f80c7f239a1fa8d5d481382bfd36138a3d50142d8d73355eb486c6e`。**最终 1.2.2 未重新实装：NOT_TESTED**；新增差异是失败原因写入原记录及相应测试／版本。失败分支本轮只有组件测试证据，不冒报原生通过。

本机证据：`artifacts/ui-notify-multiple-20261111/observations.jsonl`、`final-tests.log`、`sidepanel-three-stacked.png`（1.2.0）、`final-pc-three-plus-refusal-app.png`（1.2.1）及 `final-countdown-expired-no-replay-app.png`。源码、正式包、当前安装版本分别如上，不混作同一候选。

## 资源与未测边界

最后一次 Loading 后，测试窗口出现非本驱动发送的额外点击，来源未确认；已停止 UI 输入并保留画面，不将这些点击作为受控验证。本任务 CUA 部分已结束。测试 CFT PID 5210／临时 Profile 仍保留供查看，未再次接管或关闭；自动释放尚未执行。没有创建 ego TaskSpace。日常 `dist/development`、原扩展 ID／Native 配对及 watcher PID 76922 保持原状。

production 包、最新整棵 Browser 源码原生验收、95+ 评分及旧完整矩阵均 **NOT_TESTED／NOT_SCORED，延期**。未处理无关 AI Proxy 来源锁、官方资源 404 或 `E_USER_SCRIPTS_UNAVAILABLE`，不声称控制台零错误。原 paused goal 未恢复、迁移或伪报完成。本轮没有 push、分支、worktree 或 PR。
