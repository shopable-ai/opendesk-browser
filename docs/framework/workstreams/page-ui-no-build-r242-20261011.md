# OpenDesk Browser R24.2 · React/Vue 免手工编译网页 UI

日期：2026-10-11，目标分支 `main`。本工作流承接 R24.1，保留旧的 JSX/SFC CI 失败原始证据；不覆盖旧 workstream。

## 用户体验和架构

目标是让普通用户写 **.js 源码 → 保存 → 在已有开发入口点击运行 → 目标网页实际出现 React/Vue 组件 → Stop 释放资源**，不需要用户 `npm install`、`vite build` 或上传预编译结果。OpenDesk 现有 `LocalDevResolver` 内部仍可能在自动准备阶段进行 Webpack 打包；这与“用户不用手工编译”不同，文档必须明确。

- 真实 React 19.2.0/ReactDOM：维护者一次性生成扩展固定资源 192234 bytes，SHA-256 `4922d0516810e22b35fe9204fefa98ae7efc9207a23eefe9e5459f7e11499c3f`。
- 真实 Vue 3.5.22 runtime-only：维护者一次性生成扩展固定资源 61558 bytes，SHA-256 `3c22d3940608bfe8d77ab3efb1159bc624fe30b076c3e276e6c367dec2ec7aba`。
- 原始构建证据：https://github.com/shopable-ai/opendesk-browser/actions/runs/38128648774 （固定 npm lock、Vite runtime build、SHA 和 Artifact）。
- 两个版本固定资源以 `src/libs/page-frameworks/contract.js` 明确路径、SHA 和大小；不改变现有默认内置 ABI、Controller 或 `@opendesk/ui` 别名。加载器仅从自身 `chrome-extension://` URL 获取字节，禁止 CDN / 重定向 / 跨扩展替换。
- 用户项目可选 `opendesk.framework = "react"|"vue"`，仅影响 Page 编译后的 `// @opendesk-lib` 依赖声明；仍由当前 Chrome Site Access、安装授权、原本 Page Runtime 和 document/frame 隔离决定是否执行。
- React 使用 `React.createElement` + Hooks，Vue 使用 `createApp` + `h/ref`，两者都完全不需要用户 JSX/SFC 预编译。浏览器 **不能原生解释 JSX、TSX 或 .vue 文件**；它们不是此零手工构建示例的范围。
- `createPageUI()` 是唯一 UI 宿主，框架挂到 `ui.content`，`ui.onDispose` 负责 `root.unmount()` / `app.unmount()`，`src/enhancement.js` 清理标记及恢复原 DOM 样式。
- 普通用户不必接触仓库中的 `scripts/build-page-framework-runtimes.mjs`；该命令仅供维护者升级框架时重新生成经审查的固定发布资源，必须连同版本和 SHA 一起明确升级。

## 质量边界

没有以下实际证据不得标记正式 PASS：

- 工程构建：新增固定资源满足包校验的闭包、许可证、CSP、哈希和尺寸，production/development 同身份；
- Node 合同：真正生成的两组多文件 Page 源码小于原 100000 字节限制，依赖打包/拒绝非法声明和篡改；
- Chrome：真实扩展下的 React/Vue 挂载、点击、DOM 原位操作、手动 Stop、连续 20 次 Stop/Run、SPA、CSP、暗色/200%/窄屏；
- 安全：网站与安装双独立授权；权限撤销后的旧 UI 主动清理、旧文档和 BFCache 均要确认。
- 不增加全站自动触发，不移除用户确认，不经 MAIN/页面传入框架代码。不把 Node mock 或扩展安装即成功当作真实网页 UI 验收。

评分在候选经过真实 Chrome 验收前分别标记 NOT_TESTED。本轮如果 CI 失败，必须保留原始失败原因并修复；不通过放宽源码/Native 预算来让 React DOM 进入用户业务源码。

## R24.2 完成实测与导入草稿证据（2026-10-11）

- 专项 GitHub Actions：[R24.2 Page React/Vue no-manual-build real Chrome](https://github.com/shopable-ai/opendesk-browser/actions/runs/38132174469)，提交 `5dbd89db3e32d78f700e7d3a0979acc875d18a0f`，**success**。真实 Mac Chrome for Testing、已构建 MV3 扩展、Native/MCP/USER_SCRIPT：
  - React 19：源码 `sourceHash=34b22968dacd96ad4f706be99e44aee5f46479f0cd82fb5e07cec5eea7d52`，固定框架 SHA 为 `4922d051...`，`sourceBytes=21125`，21 次真实指针点击，目标 DOM 改动/撤销，受管 Stop 回执 `receipt.ok=true, scope=managed-ui-only`。
  - Vue 3：源码 `sourceHash=ca7c8e01193dfe1868244809bcbf440e15d073b9b109fafde49e02a842694885`，固定框架 SHA 为 `3c22d394...`，`sourceBytes=21109`，21 次真实指针点击及完整 Stop，原网站表单未被更改。
  - 专项 CI 在早期候选 `1ceeba5` 曾因复用全局 Controller Worker 网络观察器断言误报 FAIL；`5dbd89d` 将该断言限定在运行 Controller 的 slice，同时保留 Service Worker 和远端 JS 观察，不弱化 Page 工具执行合同。
- 直接导入文件：[R24.2 No-build Page import-ready drafts](https://github.com/shopable-ai/opendesk-browser/actions/runs/38132269374)，已用原有项目构建器产生 `BUILT_UNVERIFIED` 原生 Page 源码，非已安装工具。React JSON SHA-256 `617697c46b2d20d88c987750dbd87d6161f307a3120ecd83157974ce6d45cedd`（27597 bytes）；Vue JSON SHA-256 `7d2b097638627c136fdae0d56de9a7d6314988cb61fdef532c240cdd8707364f`（27540 bytes）。正式可选择路径：
  - `examples/import-ready/page-ui-react-direct.opendesk-draft.json`
  - `examples/import-ready/page-ui-vue-direct.opendesk-draft.json`
- 以上两份文件只作为 **Page 手动试运行草稿**；真正固定版本 Installed 还需独立的 Verified/Available/安装授权步骤，不能用 CFT 预览通过替代。
- 本轮仍未正式验证：20 次**独立** Run/Stop 重建、SPA 深链返回、BFCache、撤销权限主动清理、强 CSP、暗色/200% 缩放/窄屏逐项截图，以及发布 F3/ZIP；这些维度保持 `NOT_TESTED`，不能给 ≥95 的已验证评分。
