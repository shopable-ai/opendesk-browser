# Cookie Editor R4.3 原始设计预览

- `cookie-editor-r4.3-preview.html` 为 2026-10-14 已确认的原始独立交互 HTML（45,132 UTF-8 字节；Git Blob `9e494b2e8f7f1f72eeae8afd34683d32927204c3`），保留原文，不代表真实 Chrome 授权与读写。
- 正式 UI 在 `../src/index.html`、`../src/style.css`、`../src/main.js`；`../cookie-editor.opendesk-tool.json` 是可安装包。
- 原型操作仅处理虚构数据。正式 Cookie 读取、显示值、导入导出、写入、删除及撤权必须依赖原有可信 Host 和 `OpenDeskSDK.browser.cookies`，不能把原型脚本直接打包。
- 定向检查：`node --test tests/environment/cookie-editor-r43-parity.test.mjs tests/environment/cookie-editor-ui.test.mjs`；安装包再通过 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor` 复核。
