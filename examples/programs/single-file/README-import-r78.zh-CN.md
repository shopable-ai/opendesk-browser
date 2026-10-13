# 第三方库：按用途选择入口

## 自动操作网页

在 Developer Edition 的 Side Panel「开发」选择 JavaScript / Controller，输入 [controller-d3-chromepage-esm.js](controller-d3-chromepage-esm.js)，打开 `http://127.0.0.1:43111/demo-form.html` 并把搜索表单滚动到可视区域，再点击 Run。

程序通过已有 ChromePage `page` 填写、点击和等待；D3 的 `max` 在同一个受控 Worker 内处理数据。成功结果应包含 `maxValue: 5`、包含 OpenDesk 的搜索结果，以及恰好增加 1 的提交计数。不要在 Controller 中使用网页 `document` 或另建 Playwright Browser。

第一次 Run 由现有依赖系统获取并固定精确版本字节；保存固定版本后可再次运行。网站与源码来源许可仍需真实 Chrome 授权。Standard Edition 不包含浏览器 ESM 编译器；本地项目构建后的固定程序沿原执行入口运行。

## 给网页增加功能

选择 Page USER_SCRIPT / 网页试运行，复用 [page-d3-max-esm.js](page-d3-max-esm.js)。这类程序可以使用该世界的 `document` 来增加输出，不能把 Controller 的 `page` 当作网页全局变量。React/D3/ECharts 项目继续使用现有 Page UI 流程。

## 创建自己的插件页面

复用 [import-max-probe](../../sidebar-tools/import-max-probe/README.zh-CN.md)：本地 ESM 与固定 D3 源文件经现有构建器转为 Classic IIFE，再由统一工具打包器生成安装 JSON。在「工具 → 导入 → 审阅 → 安装」后主动打开，显示 `Tool D3 max = 5`。工具通过 OpenDeskTool 使用受限宿主功能。

## 保存后自动运行

复用已测试的 Controller 固定版本，沿现有验证、Task 安装与授权流程，在「我的 → 定时计划」选择安装任务和获准网站。定时执行需要合格的可见 RunHost；完全关闭 Chrome 时不承诺继续执行网页任务。仅保存 Controller Revision 不等于安装任务或创建计划。

本轮真实状态与原始身份见 [R7.8 工作记录](../../../docs/framework/workstreams/import-r78-user-scenarios-20261014.md)。构建、组件测试、真实 Chrome 与定时触发分级记录；未测项保持 NOT_TESTED。
