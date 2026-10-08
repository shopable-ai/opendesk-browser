# Sidebar UI 交互原型与正式代码映射

2026-10-08 · 本目录只保存 **设计参考和离线交互演示**，不是已安装的 Chrome 扩展，也不是可信任务包或原生验收证据。

## 对照文件

- [sidebar-r2-original-reference.html](./sidebar-r2-original-reference.html)：原先在聊天中提供的 R2 预览，**不是用户此前认可的历史高质量原型**。只保留以便追溯，不作为发布基准。
- [sidebar-r3-light-preview.html](./sidebar-r3-light-preview.html)：在 R2 上进行明确纠偏的可点击 HTML 预览，浅色标题/更高对比度、精简常驻当前网页信息、“我的任务/开发” Side Panel 工作模式，以及适合完整浏览器标签页的独立任务目录。

### 已确认的产品决策

1. Side Panel 是普通用户的任务运行和开发入口，不承载完整任务商店目录。
2. Sidebar 中运行记录应显示在已安装任务卡片下面，**不是第三个“运行记录”页签**。
3. 发现、搜索、分类、阅读任务详情、导入和安装放在完整页面。
4. “当前网页”不再以大块信息卡占首屏；开发中的精确目标资料可展开查看。运行前的精确文档校验仍不可删除。
5. 不猜测最初历史演示版第三个页签的名称；现阶段只呈现已确认的“我的任务/开发”两个首要工作视图。
6. 原始 HTML 可能包含模拟数据、模拟安装和模拟结果，**禁止将其 HTML 脚本直接作为正式权限或任务执行链**。

## 正式实现的真实位置

- `src/ui/tool.html`：Sidebar 与完整目录共用的打包工具文档。
- `src/ui/tool-shell.css`：浅色工作台、任务卡片、阅读详情、布局和固定操作栏。
- `src/ui/task-workbench.js`：复用原有安装/验证/运行 API；完整任务目录通过 `chrome.tabs.create({url: chrome.runtime.getURL('ui/tool.html')})` 打开，随后由 `chrome.tabs.getCurrent()` 区分浏览器标签页与 Side Panel。
- `src/ui/script-editor.js`、`src/run-host.js`：保留原运行入口、草稿冻结/授权和持久结果逻辑，未创建第二套 executor。
- 任务验证/安装约束仍在 `src/platform/tasks/*` 及既有 Authority/Controller，不以界面“已验证”提示代替原生回执。

真实产品在 Chrome 中是否显示正确、站点权限手势是否可用、关闭/重开后的运行生命周期是否正常，仍需**本地原生验收**。Node/component、打包、离线预览不能冒充此证明。
