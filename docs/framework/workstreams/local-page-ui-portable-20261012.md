# Local Page UI 跨站点显式预览 · 2026-10-12

## 本轮目标与边界

- 源问题：local-page-ui 的匹配规则仅限 http://127.0.0.1/*；切换到远程 HTTPS 网页时不能用该项目对 Page UI 做有效测试。
- 独立误判源：local-controller 输出 version/title/heading，和 local-page-ui 显示浮窗是两种不同执行模型。用户记录中的 Browser Test Lab JSON 对应 Controller，而不是 Page UI。
- 设计决定：只扩大示例目录 pageRules.matches 为 *://*/*；只通过显式 Run 在已授权活动标签页运行，保留 top frame、USER_SCRIPT、现有 Authority/Chrome 网站授权与独立 previewId 清理。不是全站自动安装或默认注入。
- 改动范围：examples/programs/local-page-ui/{package.json,README.md,src/main.js,src/model.js,src/view.js,assets/ui.css}；tests/environment/local-page-ui.test.mjs。
- 不涉及：真实执行器、Chrome 权限模型、Controller RunHost、其他四个 React/Vue 示例、安装运行自动触发。

## 状态与测试

- GitHub 隔离开发分支：agent/local-page-ui-portable-20261012；目标 main；起点 1a24aaec744ec7ac73cec44f2a49ef4b9d0d606e。
- 环境限制：本会话运行环境无法访问用户 Mac /Users/shopme/... 工作目录，也没有该仓库完整 Node 工具链和真实 Chrome / Native；没有占用实际 Mac 浏览器、dist、ZIP、CFT profile、Native socket 或端口。
- 已执行：隔离暂存副本的 node --test tests/environment/local-page-ui.test.mjs：3 PASS / 0 FAIL；Node 22.16.0。URL matcher 在该暂存副本中使用当前 main 源码逻辑的测试副本；**不能当成完整仓库 CI、真实浏览器或 Native 证据**。
- 需要核实：当前 GitHub 源码树的定向 node --test / validate-program-project，构建/包检查；在 Mac 真实 Chrome 对两个不同域名逐一显式 Run、点击、Stop、导航、权限拒绝、窄屏/缩放和 UI 清理。CI 结果必须与本分支精确提交 SHA 绑定。
- 原 R2.2 Chrome 候选 99a26c38e576ad0653143dd130582d15820054d6 的证据仅用于设计复用，不等于本次 PASS。
- 本轮没有声称最终 F3、已安装 ZIP 验收或用户 Mac 交付完成；保持这些项目 NOT_TESTED。

## 验收判据

1. 包规则允许普通 HTTP 与 HTTPS 的不同 hostname/port，但拒绝非 http/https URL；不请求扩展全站静默授权，不尝试绕过 Chrome 受限页面。
2. 开发 Tab 明确选择 local-page-ui，运行结果有 project、runtime、targetOrigin、挂载状态；Controller 仍按原结果返回。
3. 不要求页面有标题或特定 CSS selector；受管 UI 仍在 ShadowRoot 内，计数不触及网页业务 DOM；关闭和 preview Stop 无残留资源。
4. 保存源码只自动准备、不自动运行；导航到新页面需要新的 Run；旧文档结果不能当作新文档结果。
5. 定向代码/原生证据按候选 SHA 分类，不能把 Node 部件结果或历史 Chrome 结果提升为正式验收。

## 续接与并行资源

- 当前工作：隔离提交供代码评审/CI，保留 main 的并行写入，不合并或强推。
- 资源占用：无；不伪造任何浏览器测试回执。
- 合入前复核最新 main 并完成上述验证；如 CI 或原生验收失败，应在同一分支修复并保留失败记录。
