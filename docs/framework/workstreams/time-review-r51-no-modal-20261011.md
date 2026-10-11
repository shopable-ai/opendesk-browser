# Time Review R5.1 — 无弹窗且不降低后台追踪许可（2026-10-11）

本工作流单独修复最新 main 新增的 Time Review `time.start`、`time.clear` JavaScript 模态确认；不混入 PR #63 已有的 Sidebar R5 大范围改造。

- 基线 main：`9affd427008664be080416a277e2c2a3dc5e379b`，独立分支 `agent/time-review-inline-consent-r51-20261011`。
- `src/ui/sidebar-tools.js`：沙箱触发敏感操作时只打开受信任设置区并拒绝直接提交；宿主自己通过实际真实点击及安装/权限/文档身份检查才转发。
- `src/time-review/host-controls.js`：开始记录真实点击即执行，清空先展示可取消的页面内确认。空闲检测原生权限只在受信任手势直接发起。
- `src/ui/tool-shell.css`：常规 34px 操作按钮和紧凑的红色非模态审阅区。
- `tests/environment/time-review-host-controls-r51.test.mjs`：非可信开始/清空拦截，取消不影响数据，明确清空后发送固定 `{confirm:true}`，Chrome 原生权限只在真实点击调用。
- 未修改后端 Time Review 的持久数据保护、权限校验和操作合同；不假称 Chrome 原生权限弹窗可被应用屏蔽。
- 定向与打包测试应与对应候选 SHA 绑定；实际 Mac Chrome Native 验收另计。
