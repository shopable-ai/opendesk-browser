# Cookie Editor R4.3 原始设计预览

- `cookie-editor-r4.3-preview.html` 延续已确认 R4.3 原始布局；历史 Git Blob `7a129f509814805ab78827eaccbc77a64b20010f` 可从历史找回。2026-10-16 定向修复默认 SameSite=Lax 导致的新建误报未保存，不涉及真实 Chrome 操作。
- 正式 UI 在 `../src/index.html`、`../src/style.css`、`../src/main.js`；`../cookie-editor.opendesk-tool.json` 是可安装包。
- 原型操作仅处理虚构数据。正式 Cookie 读取、显示值、导入导出、写入、删除及撤权必须依赖原有可信 Host 和 `OpenDeskSDK.browser.cookies`，不能把原型脚本直接打包。
- 定向检查：`node --test tests/environment/cookie-editor-r43-parity.test.mjs tests/environment/cookie-editor-ui.test.mjs`；安装包再通过 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor` 复核。

- R4.5：打开新建或编辑即 clean；仅实际变更为 dirty，撤销恢复 clean；空白新建可直接取消、切换或离开。正式 src 使用字段快照进行相同判断。

- R4.5.1 补充：编辑被遮蔽 Cookie 的值字段后再次清空，是明确写入空值的意图，仍属于未保存状态；未触碰的空值输入框才表示保留旧值，模拟逻辑与正式 Chrome SDK 契约一致。

## R4.6 唯一可编辑主预览（2026-10-16）

- **主入口：** `preview/index.html`，由原始确认 Git Blob `7a129f509814805ab78827eaccbc77a64b20010f` 的完整 HTML 派生，继承 384px 设计、原位编辑和显式导入／导出／新建工具栏。无需构建，`file://` 打开即可交互。
- **历史基准：** `preview/cookie-editor-r4.3-preview.html` 是原版预览文件路径；已确认的原始内容为 45,133 UTF-8 字节。请特别注意：2026-10-16 并行提交对该路径做过定向修补，因此当前 main 此文件可能不再与历史 Blob 完全同字节；R4.6 主入口明确使用不可变 Git 历史 Blob 作为输入。未在本阶段回滚或覆盖其他 Agent 的提交。
- **改动边界：** UI 状态机、语义化 dirty 基线、空白新建、取消、筛选不丢草稿、排序、导入冲突信息、显式敏感备份确认、模拟失败保留草稿、空列表／只读／受限／深色等场景。实验台和模拟数据永不迁入正式工具。
- **正式产品：** `../src/index.html`、`../src/style.css`、`../src/main.js` 由 `../tool.config.json` 作为正式打包输入；安装包 `../cookie-editor.opendesk-tool.json` 不受本次预览修改影响。
- **阶段门槛：** 预览先由用户审核确认，**确认前不得因本预览自动迁移正式源码或更新安装包**。
- **定向自动回归：** `node --test tests/environment/cookie-editor-preview-r46.test.mjs`。这些测试是模拟状态与 DOM 事件回归，不能替代 Playwright/Chromium 真浏览器截图及真实 Chrome Cookie Host 验收。
- **R4.6.1 Value 语义：** 编辑已有 Cookie 时，空白 Value 输入框初始代表“未触碰、保留旧值”；用户输入后再次清空是明确写入空字符串的待保存意图。可点击“撤销值修改 · 保留旧值”回到 clean 状态。新建时输入后删空则恢复初始 clean。此处仅预览模拟，不修改正式 Chrome Cookie。
