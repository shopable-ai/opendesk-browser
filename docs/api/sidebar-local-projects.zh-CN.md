# Sidebar 本地项目操作

[返回总入口](README.md)。Sidebar 和 Codex 使用同一授权源码 provider 和原执行体系。**直接编辑**无需本地项目服务；**本地项目**在电脑的编辑器/Codex 中修改文件，并经 Native Host + 持续运行的 OpenDesk MCP 提供源码。保存项目文件不会自动运行，只有明确点击运行才重新读取。

## 首次使用：两种开发方式不要混淆

- **直接编辑（默认）**：打开「开发」就能在 Sidebar 输入 JavaScript，保存或运行由用户操作；无需安装 MCP。
- **本地项目（按需开启）**：在电脑的 VS Code/Codex 编辑 JS 单文件或多文件目录，在 Sidebar 选择已授权项目。首次需要 [Native Host 配置与 Codex MCP 注册](quickstart.zh-CN.md#首次配置)，MCP 会话持续运行。当前版本仍依赖 Node.js；它不是面向普通用户的免配置本机项目导入器。
- **扩展源码热更新**：开发 OpenDesk Browser 自身时使用 `npm run dev`，输出更新到 `dist/development`，详见 [扩展开发指南](../framework/extension-development-r131.zh-CN.md)。它不会自动连接 MCP、显示本地项目，也不会执行任何项目脚本。

每次打开 Sidebar 的「开发」都默认为**直接编辑、Switch 关闭**。即使旧版本保存过开启状态，也不会自动恢复该模式或连接本地 provider；项目选择和项目参数仍可留存，下一次手动打开 Switch 后核对连接。

## 连接、选择和运行

1. 在 Chrome 打开允许的网站和同窗口 OpenDesk Sidebar，进入「开发」。展开「当前网页」核对 URL；首次配置见[快速入门](quickstart.zh-CN.md#首次配置)。
2. 打开「直接编辑 / 本地项目」区域的 **「本地项目」开关**，阅读立即显示的提示和可展开的「首次使用：连接方法」。只有需要从电脑读取项目时才开启；默认保持关闭。项目列表才是下拉框，不存在模式下拉菜单。
3. 点击 **「刷新」**。预期显示「已连接 · 点击『运行本地项目』才读取并执行最新源码」，列表包含已授权且 attach 的项目。只有一个项目可自动选中，但不会执行。「暂无已授权项目」时检查允许路径与 attach；「之前的项目（不可用）」表示保存的选择不在当前列表。
4. 选择 local-controller，展开 **「项目参数 JSON（Controller 可选）」**，输入 `{}`。Page 保持空对象，不传 Controller 参数。
5. Controller 和 Page 本地项目都点击底部 **「运行本地项目」**。点击时读取最新文件，检查目标与授权；Controller 显示持久结果，Page 在网页显示试运行 UI 和预览回执。只有直接编辑模式才使用「运行草稿」或独立的「网页 JavaScript 试运行」。
6. 展开 **「运行目标与版本」** 查看身份；Controller 核对 runId/resultId、版本与释放状态。连接状态详情的「上次读取源码 SHA-256」只代表上一次读取，不保证磁盘始终未变。

目标默认当前网页。高级 Controller 的「创建隔离网页」「手动选择精确文档」沿用原目标合同，初次教程使用 demo-form 即可；Sidebar 自身文档不是目标网页。

## 修改和 Stop

本机修改 local-controller 的 extract.js，保存后明确再点运行。新结果显示 version 2，旧结果保持原身份和值。Sidebar 不把本地文件复制成手工草稿；Sidebar 发起的 Controller 运行从原结果入口读取；只有同一 MCP Session 经 dev.run 发起并登记的运行，才可由该会话 dev.result 查询。共享源码 provider 不等于共享运行归属。

Page 修改 model/CSS 后明确再预览，旧受管实例清理确认后才挂新 UI。**「停止受管 UI」** 清理原 previewId 登记资源。MCP provider 断开时，新本地 Run 禁用；原 Sidebar Host 已拥有的受管 UI 仍可 Stop，但仍要求原项目、Host、文档及网站权限有效。清理期间和清理未知时禁止新 Run。

Controller 的「停止」走原 RunHost；确认终态及 `retirementState:"released"`。Stop 不回滚已经发生的业务效果，详见[Controller](controller.zh-CN.md)与[Page](page-userscript.zh-CN.md)。

## 草稿保存与关闭重开

关闭本地开关恢复「直接编辑」的输入框。手工源码/参数与本地参数分别保留，切换不覆盖未保存草稿；保存不等于运行、安装或发布。仅保存本地项目选择和本地参数，**不持久化开关开启状态**；不把收到的源码持久化成导入草稿。

关闭重开默认直接编辑，但仍保留先前所选项目。再次手动开启本地开关时，使用新 Host 身份重新检查连接/网页；不会恢复旧 MCP Session 或静默接管旧预览。旧项目/provider/文档的迟到源码回包被拒绝，不把缓存旧字节当本次运行。

成功 Page 预览后的「保存网页脚本版本」形成固定 Candidate，须核对源码与文档，详见[统一指南](../product/program-development-dual-format-and-sidebar.zh-CN.md#page-试运行后保存固定版本r12-候选入口)。Candidate 不等于 Installed，不代表下次打开网页自动执行。

| 状态 | 操作与预期 |
| --- | --- |
| 未连接本地开发服务 | 检查原 MCP、Native 授权与当前 Host，恢复后点「刷新」；不要启动第二个 provider |
| 项目不可用 | 检查 exact path/attach/package，重新选择实际项目 |
| 参数无效 | 输入符合 paramsSchema 的 JSON 对象，local-controller 用 `{}` |
| 网站/文档已变 | 核对新网页范围和授权，只读查原执行，再决定新的有意运行 |
| 清理失败/未知 | 保留 previewId 只读查状态；未知清理栅栏需关闭原标签页，在新文档重新开始 |

重开 Sidebar、反复 Run/Stop 或换项目不能消除未知效果。[完整恢复规则](dependencies-and-errors.zh-CN.md#断连和未知结果)。真实控件：[tool.html](../../src/ui/tool.html)、[本地视图](../../src/ui/local-project.js)。
