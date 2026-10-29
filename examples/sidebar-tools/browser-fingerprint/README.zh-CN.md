# 浏览器环境检测 R1.9 · 核心只读检测

当前阶段：**核心检测可用（CORE_PASS）**。沿用 R1.8 的正式 React 页面，点击「检测当前网页」读取目标顶层文档的 User-Agent、语言列表、时区、视口尺寸、屏幕尺寸和设备像素比，每项显示状态与来源。

用户于 2026-10-29 将本轮目标收缩为核心功能与 UI；保存、历史、对比、导出延期。旧实现与 `fingerprint.a.history.v1` 数据保持原状，默认核心页面不显示这些操作，也不自动读取或改写旧历史。B 环境修改/伪装及 C 代理/IP/Profile/多账号均不在范围内。这是环境检测工具，不能据此宣称完整反检测指纹浏览器。

## 运行与授权

唯一可导入文件为 [browser-fingerprint.opendesk-tool.json](browser-fingerprint.opendesk-tool.json)，工具版本 `0.2.0`。需要同时包含新 SDK 的 OpenDesk Browser；只导入工具 JSON 不能升级 Browser 的可信 Host。当前开发扩展使用本仓库 `dist/development` 与 `npm run dev`。

通过「扩展 → 更多 → 导入」审阅安装后打开应用，在普通 HTTP(S) 网页点击检测。首次使用某个网站时，由可信 Host 审阅六字段读取授权；同一安装和网站后续复用授权。Chrome 网站访问权限仍须有效；拒绝、撤权、停用或卸载后不能继续采集。

- `browser.page.getContext`：取得可信 Host 核验的网页上下文与 opaque 文档引用。
- `browser.page.readEnvironment({tabRef,documentRef})`：固定六字段白名单，只读目标顶层文档 `MAIN` 世界；不接收脚本、URL 或原生 Tab ID。
- 来源标记为「目标网页 JS · MAIN · 顶层文档」，表示网页观察到的 JS 环境值，不是硬件认证或 HTTP 请求头。
- 正常值、不可用与未知分别展示；整次未授权或身份失效则拒绝并清除结果。导航和标签切换后，界面在下一次身份检查时清除旧值（约 1 秒）。
- 原生采集限时 3 秒、回执最多 8 KiB；首次可信授权另有等待预算。迟到或其他文档的回执不采用。

## 已验证的当前核心链

真实 Mac Chrome for Testing `154.0.8037.92`（headless）中，通过实际 Chrome `SIDE_PANEL` 和原安装审阅 UI 完成八项检查：安装、拒绝授权无值、等待超过旧 8 秒限制后授权读取、六值与独立目标读取一致、再次检测无需重复授权、导航清除、重新检测新文档、切换 Tab 清除。

本轮定向 Node 测试 120/120、React 构建、同源预览与正式 JSON 同源检查 PASS。Node 中另覆盖文档/安装身份、撤权/卸载、跨站拒绝和超时。证据与边界见 [核心开发结果](evidence/r19-core-development.zh-CN.md)；初次能力缺口保留在 [历史 SDK 审计](evidence/r19-sdk-admission.zh-CN.md)。

这是开发阶段真实核心证据。日常有界面 Mac Chrome、production 候选完整验收、保存/历史/比较/报告闭环及官方 Catalog 发布仍未执行，不宣称完整 R1.9 `READY_FOR_LOCAL_CODEX`。

## 源码与定向复现

`src/App.jsx` 为唯一正式 React UI，`src/adapter.js` 只调用公开 SDK；`src/model.js` 严格校验实时 v2 回执，并禁止其静默进入旧 v1 历史。`preview/react/sdk-preview.js` 仅为显式离线演示替身，不产生真实网页证据。

```sh
node --test tests/environment/browser-page-environment.test.mjs tests/environment/browser-page-environment-host.test.mjs tests/environment/browser-sdk-r124-current-page.test.mjs examples/sidebar-tools/browser-fingerprint/tests/environment.test.mjs
npm --prefix examples/sidebar-tools/browser-fingerprint run build
npm --prefix examples/sidebar-tools/browser-fingerprint run preview:build
npm --prefix examples/sidebar-tools/browser-fingerprint run preview:check
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/browser-fingerprint --check-project
```

真实核心脚本复用仓库原 launcher/transport，需要既有 CFT 154、开发扩展及标准演示页面服务；它使用独立临时 Profile，退出后清理浏览器，不操作个人 Chrome 数据：

```sh
node examples/sidebar-tools/browser-fingerprint/tests/native-core.mjs
```
