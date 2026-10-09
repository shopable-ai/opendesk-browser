# Sidebar 本地项目操作

[返回总入口](README.md)。Sidebar 和 Codex 使用同一授权源码 provider 和原执行体系。本地项目需要 MCP 进程持续运行；手工草稿使用编辑器代码。

## 连接、选择和运行

1. 在 Chrome 打开允许的网站和同窗口 OpenDesk Sidebar，进入「开发」。展开「当前网页」核对 URL；首次配置见[快速入门](quickstart.zh-CN.md#首次配置)。
2. 打开代码来源区域的 **「本地项目」开关**。它是开关，项目列表才是下拉框，没有旧文档中的模式下拉菜单。
3. 点击 **「刷新」**。预期显示「已连接 · 运行时读取最新源码」，列表包含已授权且 attach 的项目。只有一个项目可自动选中，但不会执行。「暂无已授权项目」时检查允许路径与 attach；「之前的项目（不可用）」表示保存的选择不在当前列表。
4. 选择 local-controller，展开 **「项目参数 JSON（Controller 可选）」**，输入 `{}`。Page 保持空对象，不传 Controller 参数。
5. Controller 点击 **「运行草稿」**；Page 点击 **「网页 JavaScript 试运行」区域的「在当前网页试运行」**。点击时读取最新文件，检查目标与授权。Controller 显示结果；Page 在网页出现 UI 并显示预览回执。
6. 展开 **「运行目标与版本」** 查看身份；Controller 核对 runId/resultId、版本与释放状态。连接状态详情的「上次读取源码 SHA-256」只代表上一次读取，不保证磁盘始终未变。

目标默认当前网页。高级 Controller 的「创建隔离网页」「手动选择精确文档」沿用原目标合同，初次教程使用 demo-form 即可；Sidebar 自身文档不是目标网页。

## 修改和 Stop

本机修改 local-controller 的 extract.js，保存后明确再点运行。新结果显示 version 2，旧结果保持原身份和值。Sidebar 不把本地文件复制成手工草稿；旧 Controller 结果使用原结果记录，或原归属 MCP 会话的 result。

Page 修改 model/CSS 后明确再预览，旧受管实例清理确认后才挂新 UI。**「停止受管 UI」** 清理原 previewId 登记资源。MCP provider 断开时，新本地 Run 禁用；原 Sidebar Host 已拥有的受管 UI 仍可 Stop，但仍要求原项目、Host、文档及网站权限有效。清理期间和清理未知时禁止新 Run。

Controller 的「停止」走原 RunHost；确认终态及 `retirementState:"released"`。Stop 不回滚已经发生的业务效果，详见[Controller](controller.zh-CN.md)与[Page](page-userscript.zh-CN.md)。

## 草稿保存与关闭重开

关闭本地开关恢复手工编辑区。手工源码/参数与本地参数分别保留，切换不覆盖未保存草稿；保存不等于运行、安装或发布。本地模式保存项目选择、模式和本地参数，不把收到的源码持久化成导入草稿。

关闭重开恢复选择，并使用新 Host 身份重新检查连接/网页；不会恢复旧 MCP Session 或静默接管旧预览。旧项目/provider/文档的迟到源码回包被拒绝，不把缓存旧字节当本次运行。

成功 Page 预览后的「保存网页脚本版本」形成固定 Candidate，须核对源码与文档，详见[统一指南](../product/program-development-dual-format-and-sidebar.zh-CN.md#page-试运行后保存固定版本r12-候选入口)。Candidate 不等于 Installed，不代表下次打开网页自动执行。

| 状态 | 操作与预期 |
| --- | --- |
| 未连接本地开发服务 | 检查原 MCP、Native 授权与当前 Host，恢复后点「刷新」；不要启动第二个 provider |
| 项目不可用 | 检查 exact path/attach/package，重新选择实际项目 |
| 参数无效 | 输入符合 paramsSchema 的 JSON 对象，local-controller 用 `{}` |
| 网站/文档已变 | 核对新网页范围和授权，只读查原执行，再决定新的有意运行 |
| 清理失败/未知 | 保留 previewId 只读查状态；未知清理栅栏需关闭原标签页，在新文档重新开始 |

重开 Sidebar、反复 Run/Stop 或换项目不能消除未知效果。[完整恢复规则](dependencies-and-errors.zh-CN.md#断连和未知结果)。真实控件：[tool.html](../../src/ui/tool.html)、[本地视图](../../src/ui/local-project.js)。
