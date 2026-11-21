# AI Proxy 0.3.41 连接控件复验

2026-11-20 · 快捷侧栏和桌面设置的四种连接方式

- 已确认跟随系统时只显示「正在跟随系统」。浏览器状态异常或无法确认时可重新读取。控制权、Chrome 模式和权限信息在「网络诊断」查看。
- 选择线路后显示「待应用」和当前线路，统一用「应用」提交。已有线路正常运行时提供「停止代理」，运行直连时提供「结束直连」，并说明结束后恢复浏览器原有代理设置。
- 缺少配置时提供「添加代理」或「选择代理」。选择已保存的代理不会立即改变浏览器线路。

独立 AI 设计评审 **97/100**。状态理解 25/25，操作层级 19/20，跨界面一致性 20/20，无障碍与布局 20/20，恢复与反馈 13/15。侧栏在列表下方选择代理后需要向上滚动才能看到「应用」。取消 Chrome 代理授权审阅后，连接区准确显示跟随系统和待应用规则，宿主通用取消提示未说明这次线路变化，且可能在随后应用成功时仍短暂可见。

Chrome for Testing 155.0.8059.39 隔离 Profile 中对同一候选完成两次安装与切换复验。实测覆盖 360px 侧栏及 540px、1440px 桌面设置，验证了添加和选择入口、键盘操作及焦点返回、规则审阅取消后重新应用，以及代理 A 到 B 的切换。实际 Chrome PAC 读回确认了规则目标和切换后的代理端口。侧栏选中文字对比度 9.66:1，「应用」文字对比度 5.57:1。265 项工具测试、3 项可信构建来源检查、4 项打包检查通过。

项目正式包为 [ai-proxy.opendesk-tool.json](../ai-proxy.opendesk-tool.json)，与已审阅安装的 714086 字节候选完全一致。固定可信界面单独编译并核对了 Chrome 实际加载的资源。日常 Profile、production 和完整功能矩阵未复测。

| 产物 | SHA-256 |
| --- | --- |
| 工具 JSON | `30ddd370df675524f37d4c7ebe1bb91506bdbd27e01b6da39c34150c740de890` |
| 固定可信界面 `ui/tool-shell.js` | `7b75b274aaa5c268d34ef41cc93184420cbd0507f9a711c97c7ecb043a83827d` |

[首次实测](../../../artifacts/ai-proxy/connection-controls-20261119/scored-installed/result.json) · [同候选复跑](../../../artifacts/ai-proxy/connection-controls-20261119/scored-recheck/result.json) · [侧栏截图](../../../artifacts/ai-proxy/connection-controls-20261119/scored-installed/side-pending.png) · [桌面截图](../../../artifacts/ai-proxy/connection-controls-20261119/scored-installed/pc-pending.png)
