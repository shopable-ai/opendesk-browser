# AI Proxy 0.3.44 一键切换验收

2026-11-20 · 快捷侧栏和桌面设置

- 「直接连接」「跟随系统」、有可用配置的「按规则」以及代理列表中的「连接」，点击后直接发起切换。没有启用规则时显示「设置规则」。
- 「查看代理」直接定位到列表；各线路在自己的「连接」按钮上生效，桌面「其他代理软件」列表也支持直接连接。新代理或新的分流范围首次使用时需要审阅，审阅会显示所选代理名。取消或并行修改导致的冲突都保留当前生效的线路。已授权的同一线路再次使用只需一次点击。
- 保存代理、规则和导入备份保留为独立操作。当前线路有待应用的已保存修改时，用户可以应用修改，也可以停止当前线路。
- Chrome 回读确认后，面板显示「已应用到 Chrome」和当前线路。切换时就近显示进度、取消或操作失败。直接连接的全标签页范围显示在模式控件旁。360 像素侧栏同时提供应用和停止时，状态独占一行。

## 验证

Chrome for Testing 155.0.8059.39 在专用 Profile 中加载隔离静态开发候选，以侧栏本地审阅流程安装工具。核对了安装 JSON 和关键固定资源的实际加载摘要。侧栏在桌面切换后自动同步。实测「查看代理」定位、Shift+Tab 和 Tab、Enter 一键连接，以及切换后的焦点。Chromium 辅助功能树报告了连接前后一致的按钮名称、选中状态和实时状态区域。Escape 取消新线路审阅，Chrome 仍保留原 PAC。两窗口并行保存时，过期的审阅无法替换线路。实际延迟交付「跟随系统」的释放回执并在另一窗口重启同一线路，原线路和保存配置均由宿主保留。

独立回环请求实测经过代理 A、代理 B、直接连接和按规则分流。规则匹配域名和深层子域的流量经指定代理，外部对照域名直连。跟随系统恢复了 Chrome 的原控制状态和原系统模式。隔离环境内系统代理对回环夹具在切换前后均返回 `ERR_PROXY_CONNECTION_FAILED`，因此这项只证明恢复基线。

独立设计复评 98/100，覆盖可发现性 20/20、操作效率 30/30、线路与授权表达 20/20、进度与错误恢复 19/20、无障碍 9/10。扣分来自跨窗口同步时按钮短暂禁用缺少就近提示，以及屏幕阅读器语音未实测。后续受控写回修复使用相同界面并通过最终候选复测。

独立工程复核确认同线路重启用后，旧「跟随系统」保存会在工具锁内被拒绝，本次修复范围内无发布阻断。

工具测试 503 项中 501 项通过。当前页诊断返回字段和测试桩 `clearClipRegions` 的两项断言在修改前快照同样失败。原生 Driver 17 项、审阅交互 9 项、宿主精确授权与并发守卫 2 项、构建来源 3 项通过。

项目正式 JSON 已通过打包器逐字节晋升和 `--check-project`。日常浏览器 Profile 安装、生产候选、屏幕阅读器语音及完整产品矩阵本轮未验证。

| 实测产物 | SHA-256 |
| --- | --- |
| [0.3.44 工具 JSON](../ai-proxy.opendesk-tool.json) | `0e61b07073e73f47301886fd3cc48f92e1f576366372e15e1a3d66cce1c78ed7` |
| `ui/tool-shell.js` | `d3f8900cb312282d26e35c7b4667774aac46388029f58f6b6efd677ad5aa6e54` |
| `ui/sidebar-tool-host.js` | `a408944bc44db76d7c2dc68914f9960b8231bd4c0396b85c5b733b536c7bbc16` |
| `platform/context-menus.js` | `3463664b632fd9fe1080434818054746c0e157228468748cfd6eb325f41f17e2` |
| `sw.js` | `61748a2d8c22de4c0bd32b18d1d7f63c4c4c609e5d9344b1a8980b6e782c274e` |

[实际操作及流量记录](../../../artifacts/ai-proxy/connection-controls-20261120/native-044-guarded-r2/result.json) · [桌面代理切换](../../../artifacts/ai-proxy/connection-controls-20261120/native-044-guarded-r2/pc-named-active.png) · [首次线路审阅](../../../artifacts/ai-proxy/connection-controls-20261120/native-044-guarded-r2/pc-review-preserves-route.png) · [侧栏直连](../../../artifacts/ai-proxy/connection-controls-20261120/native-044-guarded-r2/side-direct-active.png) · [待应用时可停止](../../../artifacts/ai-proxy/connection-controls-20261120/native-044-guarded-r2/side-apply-or-stop.png)
