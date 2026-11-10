# OpenDesk · 通知组件实验室（可安装 Sidebar Tool）

用真实按钮观察同一 `OpenDeskTool.ui.notify` 的多条通知、合并、限频与原通知更新。现有工具 ID `ui-notify-demo`，版本 **1.2.2**，零额外 capabilities；不是独立 Chrome 扩展。

## 最短体验

1. 在 OpenDesk Browser「扩展 → 导入扩展」中选择同目录唯一 `ui-notify-demo.opendesk-tool.json`，经原安装器审阅安装／更新。已有版本直接同 ID 更新，不必卸载。
2. 打开实验室，连续点击 **＋ 添加一条独立消息**：每次产生不同编号，并在“最近 12 条请求与回执”保留逐条结果。选择“手动关闭”可延长观察时间。
3. 额度尚未使用时，可直接点 **三条堆叠 · 手动关闭**，一次申请三条不同编号的常驻通知；点击 Toast 的 × 或记录旁“关闭 #n”逐条关闭。
4. 点 **四连发 · 限频回执**，观察实际接纳／拒绝。前三次接纳只适用于该实例当前窗口尚未使用额度的情况；已有请求会占用额度。限频后顶部按 Host 返回的 `retryAfterMs` 倒计时，归零后由用户手动再试。
5. **重复消息 ×2** 专门走旧 boolean 调用：相同内容默认合并为一条 ×2，但两次都消耗创建额度；此入口没有 Host 回执。**独立两条** 则各有编号和句柄回执。
6. 选择位置／时长、四种状态，或测试“模拟执行 → 成功／失败”，观察同一原通知从执行中更新至模拟业务结果。模拟失败的原因同时留在正文记录中。

## 堆叠、拒绝与回执

- **现有规则保持：每实例从首次创建起的固定 60 秒窗口最多 3 次创建**，当前宿主所有位置合计最多显示 3 条，安装成功等宿主通知也占位；关闭不返还创建额度。旧 `notify` 和 `.open` 共用额度，更新／关闭既有句柄不占新创建额度。
- 这是**可见堆叠，没有等待队列**。限频／容量拒绝的请求不会自动补发；倒计时不发送请求，也不通过重开实例绕过限频。
- 满三条时 Host 按现有语义优先级替换较弱／较早的通知；新消息不能替换更重要消息时返回 `overflow`。重要错误保护保持原规则，不保证所有通知都等到手动关闭。
- 请求记录不是当前可见数量，也不是等待队列。Host 接纳后的通知可能已自然到期、手动关闭或被替换；再次关闭可能返回 `not_found`，实验室如实显示。
- `ready/update/dismiss` 的 `accepted` 只证明 Host 已接受该次通知操作，不能证明屏幕当前可见或业务成功。记录保留创建／更新／关闭回执；无回执为 unknown，不自动重试。
- 旧 Bridge 没有 `.open` 时普通演示回退旧调用并说明无回执，长任务进度留在正文。未知结果不降级重发；非法动作参数仍应本地拒绝。
- 最近 12 条记录是有界内存，关闭工具后结束；不会持久保存或发往网络。页面销毁会停止倒计时并拦截迟到模拟任务更新。

## 业务与安全边界

工具只用公开 API，不使用 Chrome／Native／Page／Controller 权限、网络、文件或安装能力，不注入 HTML。普通状态与多条演示通过原 `notify.open`，分组合并和字符串兼容继续使用旧 `notify`；不创建新 Host、Store、React Root 或通知框架。

模拟任务不导出文件、不修改业务数据；真实业务必须根据自己的结果回执更新成功／失败，不能从 Toast 的 accepted 推断成功。每句柄最多更新 12 次、30 分钟 TTL 等原 Host 保护继续有效。

这个 JSON 只更新工具界面，不能升级 Browser 固定通知实现。Side Panel 与 PC `app.html` 共用原宿主链；开发诊断、源码／包验证与 production 正式验收分别记录。

## 候选验证与正式包晋升

在仓库根目录执行；先验证候选，成功后再晋升，避免测试依赖新版正式包的循环：

```sh
node --check examples/sidebar-tools/ui-notify-demo/src/main.js
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ui-notify-demo --out artifacts/sidebar-tools/ui-notify-demo/candidate.opendesk-tool.json
UI_NOTIFY_DEMO_CANDIDATE=artifacts/sidebar-tools/ui-notify-demo/candidate.opendesk-tool.json node --test examples/sidebar-tools/ui-notify-demo/tests/notify-demo.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ui-notify-demo --promote-from artifacts/sidebar-tools/ui-notify-demo/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ui-notify-demo --check-project
```

不手改正式 JSON。Node／包验证不代表当前安装已更新；真实已安装开发诊断及未测边界见 [本轮工作记录](../../../docs/framework/workstreams/ui-notify-multiple-20261111.md)。
