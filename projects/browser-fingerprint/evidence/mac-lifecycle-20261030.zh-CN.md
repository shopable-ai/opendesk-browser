# R2.5 当前 Mac 原生验证与发行边界

2026-10-30；本次补充证据，没有修改指纹工具业务源码、Host 或正式安装包。

## 当前可用结果

在真实 macOS Chrome for Testing 154.0.8037.92 的隔离 Profile，通过原生文件选择、安装审阅和 Side Panel 操作完成 0.2.2 候选安装。production 静态 Host 来源为 `d57bc6c681a01cd76433cc880c71453d6a72c0c5`，packageHash 为 `86fa5c0e50a32c87108ce54da23317669e476ebd7b50e2e6ace00363cdb80fa4`，实际扩展 ID 为 `nohbijocppfnjliinhdfnclbddljobfe`；不连接 dev server。未更换日常 Chrome 的加载目录或停止 watcher。

候选仍是 0.2.2 / 88673 bytes / SHA256 `b0d48d86f35eec9edc53d3d308737f496e58bb91013af11138fd1f76e5e5ee19`。所有输入经过 macOS CUA 原生 UI；CDP、Host scripting 仅被动观察。原始文件及 SHA、安装代际、文档身份和读数保存在[结构化证据](mac-lifecycle-20261030.json)。

| 用户操作 | 实际结果 |
| --- | --- |
| 美国、德国应用 → 网页读回 → 停止 → 恢复读回 | 各自独立 Session；可验证的 5 类字段一致，3 类未知仍不算一致。完整语言数组与 scalar 均恢复，debugger 解除 |
| 生效时切换 Tab | 原文档恢复 `zh-CN / ["zh-CN"]`、Shanghai、macOS 和原视口；原 Session 后续读回拒绝 |
| 生效时刷新页面 | documentId 改变；新文档没有覆盖；旧 Session 拒绝，不将其绑定新文档 |
| 生效时停用工具 | enabled=false，安装代际轮换，debugger 解除；独立网页 9 项回到基线。恢复工具不重复安装授权 |
| Chrome 撤销本站访问 | 经 Chrome 要求重新加载；origins 为空，目标 debugger 解除；网页显示原始环境，旧读回报告“授权被拒绝” |
| 生效时卸载 | 安装记录移除，debugger 解除；同一文档恢复完整语言数组和其他基线字段 |
| 原安装器 0.2.1 → 0.2.2 | 显示新增 1 项环境控制能力，明确确认更新；版本与代际更新；直接打开且未自动应用环境 |

独立 HTTP 页同时验证了美国/德国应用与停止，提供当前真实 UA、UA-CH、语言等 9 项读数；[页面专项评审](http-diagnostic-20261030.zh-CN.md)均分 **97**、最低 **95**。该分数仅针对诊断页及其核验流程，不冒充整套扩展发行评分。

## 未提升为 PASS 的项目

- 首次授权操作期间的一次请求超时仍保留“执行结果未知”。没有自动重放；核对实际未生效、结束旧上下文后，另起新 Session 完成后续操作。
- 本版 Chrome 打开原生 DevTools 后，扩展 Session 继续可读回；只能证明并存，**external debugger detach 仍为 NOT_TESTED**。未制造接管结果。
- 原生 TTL、关闭 Tab、Worker 终止未补测，继续保留 `NOT_TESTED_NATIVE`。已有定向 Node 覆盖不冒充 Mac 原生证据。0.2.1 是只读工具，升级过程不具备生效中的环境控制 Session。
- 撤权时被动 scripting 观察超时，未绕过权限；该步使用 Chrome 权限状态、debugger 目标状态、网页原生可见读数和真实拒绝回执交叉核对。
- HTTP `Accept-Language` 仍为 `UNVERIFIABLE`，Geolocation 为 `UNSUPPORTED`；公网 IP 不在范围。没有全局 Profile 或网络身份保证。

## 发行检查

当前 main `0431ff39465ec33e7319e57803911eb6bbbb3180` 的 [App CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/40915966478) 在 discovery 阶段失败：`installation.js` 仍从已迁移的 `examples/sidebar-tools/time-review/trusted/model.js` 导入，正确受跟踪路径为 `projects/time-review/trusted/model.js`。静态导入发生在应用过滤之前，单选指纹工具也不能规避。本地并行改动已经包含这行修复；本任务保留其归属，不重复修改或提交该文件。

因此没有当前 main 的合格 CI 候选收据，也没有启动 App Release。唯一正式 JSON 继续保持 **0.2.1**；测试 Profile 中的 0.2.2 是安装候选。没有把旧 CI、旧 Host 或页面的 95+ 评分提升为当前发行 PASS。原发行 goal 保持 active，未标记完成或暂停。

本次仅整理已取得的 23 份观察，校验来源哈希、相同/新文档身份、语言数组恢复、调试解除、卸载移除和升级代际。产品代码未变，不重复构建或扩大回归。
