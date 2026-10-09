# 2026-10-10 Mac Sidebar R1 续接证据

本次状态：`R1_NATIVE_EVIDENCE_INCOMPLETE`。最新 main 代码为 `30a0a94dc4d07e82929d5d800f957ed1bd0448d9`；后续仅归档证据的提交不改变运行代码。不能将此记录视为最终 Native、F3 或 ZIP 验收通过。

```text
Sidebar 自定义工具
  最新 main 工程检查：CI_PASS
    npm ci --ignore-scripts、check、production/development 构建、verify、笔记工具打包：通过
    547 项组件测试：通过，0 失败、0 跳过
    两项真实 Chrome npm 用例：最新候选尚未验证
    远程 CI：4fd0430 的六个工作流通过；本地最新提交未推送
  e3ed1a1e 真实 Mac Chrome：下列限定项目 NATIVE_PASS
    导入选择不安装、不执行；明确确认后安装；HTML/CSS/本地图片
    当前业务页面标题和 URL；中文笔记保存；同一 profile 整进程重启恢复
    原 Task v1 安装、跳转不执行、运行、停止、结果与历史
    沙箱 API 隔离、伪造消息/错误实例/旧实例重放、存储隔离、未知能力拒绝
    导航、第二窗口、业务页面断网与恢复、原计算沙箱 CSP
    20 次销毁重建、400/320/200 CSS px 布局
    预编译 React/Tailwind 和 Vue、更新保留数据、撤销能力、原生取消/确认
    浏览器退出：修复后 cleanup PASS，所有自有 PID 退出，profile 删除，无残留
  尚待完成：NATIVE_NOT_VERIFIED
    最新包的受影响原生验证
    600 CSS px；200% 下原生保存/刷新操作；卸载取消/确认及其他工具/任务隔离
    最新候选的两项 Chrome npm 用例、正式候选收敛和已验收 dist 交付
  编译支持
    本地经典 JavaScript + 静态 CSS：预编译 React/Tailwind、Vue 已有真实运行证据
    直接 JSX/TSX/.vue/Tailwind 源码编译：NOT_SUPPORTED
```

`checkpoint.json` 列出 SHA、包 hash、证据路径、资源状态和续接动作。已测原生包为 `feaf5ca1…`，最新生产包为 `93117206…`；`current-main-package-delta.json` 显示 Native transport、SW、tool-shell 三个运行文件变化，因此不把旧包的整体验收提升为最新包 PASS。当前受控 Chrome for Testing 版本为 **Chrome/155.0.8059.39**，来自 `native-final-e3ed/session.json` 的实际 `Browser.getVersion`。

本轮修复均已提交 main：`b221cf59` 修复工具开启动作定位，`e3ed1a1e` 修复重启适配器退出清理竞态，`30a0a94d` 将被动观察定位到实际 SIDE_PANEL。修改涉及 `tests/framework/sidebar-tools-native-probes.mjs`、`tests/framework/k5-sdk-native-launcher.mjs` 和两个目标选择回归测试。未改写其他 Agent 的工作或历史 receipt。

失败原始记录全部保留：Native 许可等待超时及错误实例绑定、旧重启驱动失效、旧 cleanup FAIL、目录页误测 619 px、历史包回执误用于新快照造成的两项 provenance 失败。每次重试都有环境、代码或观察方式变化；未删除测试或降低安全要求。最新组件重试通过，新的原生 cleanup 通过；其余旧失败不改写为 PASS。

关键证据：

- `final-current-main/engineering.json`、`component-test-retry.log`：最新工程检查与 547 项组件测试。
- `final-integrated/npm-test-retry2.log`：e3ed1a1e 完整 npm test，539/539，通过两项真实 Chrome 用例；不是最新 main 的完整测试。
- `native-final-e3ed/restart-durability-verdict.json`、`task-v1-verdict.json`、`update-and-consent-verdict.json`：从原始证据导出的限定原生结论。
- `native-final-e3ed/security.json`、`navigation-security.json`、`computation-csp.json`、`cycles-20.json`：安全、CSP、生命周期。
- `native-final-e3ed/cleanup.json`：修复后的真实退出清理 PASS。
- `native-final-e3ed/width-320-panel.png`、`width-400-panel.png`、`width-200-panel.png`、`task-history-open.png`：真实侧栏截图。

Mac 在收尾阶段锁屏，CUA 两次报告无法自动解锁。已在当前对话请求人工解锁。自有测试浏览器已安全退出；借用的 43111 服务、其他 profile 和共享 dist/development 均未关闭或覆盖。继续前必须重新核对端口负责人。质量评分暂缓，五个维度均不授予最终 95/100。
