# Local Page UI · 跨网站悬浮 Demo

本示例是 Page USER_SCRIPT 本地多文件 UI，**不是 Controller**。它使用已有 @opendesk/ui 创建 Shadow DOM 悬浮面板，计数按钮只修改卡片内数字。无需网页存在 h1、固定表单或特定 DOM 挂载点。

## 网页适配与权限

开发项目的 pageRules.matches 改为 *://*/*，覆盖普通 HTTP 和 HTTPS 网页、本机不同端口和其他域名，仍使用 document_idle、allFrames:false、USER_SCRIPT。**通配符只是 URL 允许范围，不授予网站权限，也不会自动运行。**

必须在活动标签页上明确点击「运行本地项目」，并通过 Chrome「允许用户脚本」、网站访问授权和 OpenDesk 原有 Host/文档/Authority 检查。修改文件只会自动准备，保存不是 Run。导航或换标签后需要在新网页再次明确点击运行；不会全站驻留或自动重放旧运行。

chrome://、扩展页、Chrome Web Store 的受保护页面、PDF 浏览器、file:// 及浏览器禁止注入的页面不支持；仅顶层 frame，不注入跨域 iframe。严格 CSP、网站遮挡、BFCache、200% 缩放和窄屏须真实 Chrome 单项验收。开发态宽匹配范围**不应不经独立安全审查直接发布为全站自动运行的正式工具**；正式安装应改为最小业务范围。

## 使用流程

1. 安装并配对相容的 Native Host 与扩展，开启用户脚本并授予要测试的站点权限；参照 [目录开发说明](../../../docs/framework/local-directory-cli-r17.zh-CN.md)。
2. 在本目录执行 opendesk browser dev .，或用已经授权 --allow-project 的现有 MCP 连接；在 Side Panel「开发 → 直接编辑本地项目」选择 **local-page-ui · 页面脚本**。
3. 在任一普通 HTTP/HTTPS 页面点击「运行本地项目」，网页右上角应出现 OpenDesk Page UI 卡片，显示目标域名；点「Local v1」（计数按钮）只更新卡片中的数字，点「关闭」卸载卡片。开发 Tab 的「停止」使用原 previewId 释放受管资源。
4. 切到不同域名或不同端口的新网页并授予网站权限，重新点击运行。不再依赖 Browser Test Lab 标题、h1 或 #page-ui-demo-target。保存 src/model.js 中的 label/step 或 assets/ui.css 后仍须手动 Run 才挂新版。

统一本机标准测试页也可使用：

    python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks

随后访问 http://127.0.0.1:43111/demo-form.html 。

## 避免误读 Controller 结果

local-controller 返回 version、title、heading，例如 Browser Test Lab。这个 JSON 表示 Controller 读取网页成功，不代表 UI 已挂载。新版 local-page-ui 的运行结果返回 project:"sample.local-page-ui"、runtime:"page-userscript"、state:"mounted"、placement:"floating"、targetOrigin。mounted 只证明当时 UI 宿主活跃，**不能替代**实际 Chrome 可见性、点击与 Stop 验收；需核对真实 previewId、documentId 和原运行来源。

Page 预览没有 Controller 的持久 runId/resultId，「已完成 · 资源已释放」不能单独作为 UI 显示证据。失败时先核对所选项目、当前标签页、网站授权、用户脚本开关、受保护页面及错误码；未知效果不盲目重试。

## 验证

    node --test tests/environment/local-page-ui.test.mjs
    node scripts/validate-program-project.mjs examples/programs/local-page-ui

Node 定向测试不是 Mac Chrome 验收，仍须分站点 Run/Stop、撤权、导航、缩放、窄屏和受管清理测试。旧候选原始证据只属于旧候选。正式打包安装仍使用现有 build:program 与包校验。

## 历史基线（不升级为本次 PASS）

原 R2.2 本地 Page 候选 99a26c38e576ad0653143dd130582d15820054d6 已在真实 Chrome 验证多文件 JS/CSS/受控 PNG、Shadow DOM、替换前受管清理和 typed Stop；原始证据保留在 [P3 CI 摘要](../../../docs/framework/evidence/local-dev-r22-c036/p3-ci-summary.json) 和 [历史交付报告](../../../docs/framework/local-development-r22-report.zh-CN.md)。

本次扩大 URL 范围和更新示例 UI 的结果**不能继承**上述候选的真实 Chrome 身份。若 MCP 入场 ACK 丢失，按 [MCP 七工具说明](../../../docs/api/mcp-local-development.zh-CN.md) 用原 admissionRequestId 只读对账，不自动重跑。受管 Page 的 Stop 作用域仅为 managed-ui-only，不回滚网页侧已经发生的效果。
