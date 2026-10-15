# Cookie Editor R4.3 原始设计预览

- `cookie-editor-r4.3-preview.html` 延续已确认 R4.3 原始布局；历史 Git Blob `7a129f509814805ab78827eaccbc77a64b20010f` 可从历史找回。2026-10-16 定向修复默认 SameSite=Lax 导致的新建误报未保存，不涉及真实 Chrome 操作。
- 正式 UI 在 `../src/index.html`、`../src/style.css`、`../src/main.js`；`../cookie-editor.opendesk-tool.json` 是可安装包。
- 原型操作仅处理虚构数据。正式 Cookie 读取、显示值、导入导出、写入、删除及撤权必须依赖原有可信 Host 和 `OpenDeskSDK.browser.cookies`，不能把原型脚本直接打包。
- 定向检查：`node --test tests/environment/cookie-editor-r43-parity.test.mjs tests/environment/cookie-editor-ui.test.mjs`；安装包再通过 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor` 复核。

- R4.5：打开新建或编辑即 clean；仅实际变更为 dirty，撤销恢复 clean；空白新建可直接取消、切换或离开。正式 src 使用字段快照进行相同判断。

- R4.5.1 补充：编辑被遮蔽 Cookie 的值字段后再次清空，是明确写入空值的意图，仍属于未保存状态；未触碰的空值输入框才表示保留旧值，模拟逻辑与正式 Chrome SDK 契约一致。
